import { devToolsMiddleware } from "@ai-sdk/devtools";
import { google } from "@ai-sdk/google";
import {
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
  convertToModelMessages,
  wrapLanguageModel,
} from "ai";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";

/**
 * Seconds this route may occupy a serverless instance before the
 * platform kills it mid-stream.
 *
 * This was 30, which was chosen when the model replied in a couple of
 * seconds and before the tutor was asked to show its working. A worked
 * calculus answer is a long answer, and this route's own logs show real
 * calls at 18s, 117s and well past two minutes. Anything above the
 * limit is not slow, it is truncated: the reader gets a half-finished
 * derivation with no error, because the connection dies rather than
 * failing.
 *
 * 60 is the ceiling on Vercel's Hobby plan. Raise it only together
 * with the plan, since a higher number on Hobby is silently ignored
 * and buys nothing.
 */
export const maxDuration = 60;

/**
 * Devtools middleware, or nothing.
 *
 * `devToolsMiddleware()` THROWS when NODE_ENV is "production" — it is a
 * deliberate guard against shipping a tracing layer to real users. It
 * used to be called inside the request handler, which meant every single
 * chat request in a production build died on that throw and the tutor
 * returned 500 for everyone, with no way to tell from the outside that
 * the cause was a debug aid.
 *
 * Two changes, both load-bearing:
 *
 *   · the ternary has to short-circuit rather than filter, so the
 *     factory is never CALLED in production. Filtering after the fact
 *     would still have invoked it and still thrown;
 *   · it is built once at module scope, not per request. The factory
 *     registers process signal handlers and mints a run id on every
 *     call, so building it per request piled duplicate handlers up for
 *     the lifetime of the server and gave every request its own
 *     disconnected run.
 */
const DEVTOOLS =
  process.env.NODE_ENV === "production" ? [] : [devToolsMiddleware()];

/**
 * The tutor's instructions.
 *
 * There was no system prompt at all, so the model answered in whatever
 * shape it felt like — and for a calculus tutor that shape was prose
 * with the odd `x^2 + 3x` in it, which the reader gets as literal
 * characters rather than a typeset equation.
 *
 * The rendering side is half the fix and this is the other half: KaTeX
 * can only typeset what the model actually writes in LaTeX. Without the
 * delimiters being asked for, the client-side plugin has nothing to
 * find.
 *
 * The currency rule is not decoration. Inline math is switched on in
 * ai-tutor.tsx, and `$` is the delimiter, so a price written as `$50`
 * opens a formula that never closes and the rest of the sentence gets
 * swallowed into it. Asking for money without the symbol is cheaper
 * than the parsing ambiguity it would otherwise cause.
 *
 * The display-math rule is load-bearing in the same way, and it is
 * fussy enough to spell out. `$$x$$` on a single line is INLINE math
 * as far as the parser is concerned — only a `$$` opened and closed on
 * its own line becomes a displayed equation. Left to itself the model
 * writes `$$...$$` on one line, every equation arrives typeset but
 * jammed into the middle of a paragraph, and long ones overflow the
 * bubble. Hence the worked example.
 */
const TUTOR_SYSTEM_PROMPT = `You are a patient tutor for university-level calculus, probability and linear algebra.

Formatting:
- Write mathematics in LaTeX.
- Short expressions fit inline in $...$.
- A displayed equation needs each $$ delimiter on its own line, with a blank line before it:

  $$
  \\frac{d}{dx}\\left[uv\\right] = u'v + uv'
  $$

  Never put a displayed equation on one line as $$...$$ — that renders inline and overflows.
- Use \\left and \\right, \\frac, \\sqrt and \\int rather than ASCII stand-ins.
- Never write currency with a leading dollar sign — write "50 dollars" or "USD 50", because $ opens inline math here.
- Format code as fenced blocks tagged with the language.
- Show working, not just the answer. Name the rule you are applying as you apply it.
- Prefer short paragraphs. Ask one question at the end to check understanding.`;

/**
 * Turn a provider failure into something a reader can act on.
 *
 * Without this the client is told "An error occurred." and nothing
 * else. That is not a display bug — it is what the SDK emits when it
 * declines to describe an error it cannot vouch for, and it applies to
 * the errors most likely to happen here. The real cause exists on this
 * side of the connection (an exhausted free-tier quota, a rejected key,
 * a provider outage) and never crosses it, so the UI cannot distinguish
 * "come back tomorrow" from "fix your configuration" and says neither.
 *
 * It must run HERE rather than on the client for exactly that reason:
 * by the time the error reaches the browser the detail is already gone.
 *
 * Deliberately never returns the upstream text. Provider messages embed
 * request URLs, project ids and quota identifiers, none of which belong
 * in a chat bubble. Everything is matched to a fixed sentence instead,
 * with a last resort that still says something true.
 */
function explainProviderFailure(error: unknown): string {
  const raw =
    error instanceof Error
      ? `${error.message} ${"cause" in error && error.cause instanceof Error ? error.cause.message : ""}`
      : String(error ?? "");
  const text = raw.toLowerCase();

  if (text.includes("quota") || text.includes("rate limit") || text.includes("resource_exhausted")) {
    return "The tutor has used up its API quota for today. It resets daily — try again later.";
  }
  if (text.includes("api key") || text.includes("unauthorized") || text.includes("permission")) {
    return "The tutor's API key was rejected. Check GOOGLE_GENERATIVE_AI_API_KEY.";
  }
  if (text.includes("overloaded") || text.includes("503") || text.includes("unavailable")) {
    return "The model provider is busy right now. Try again in a moment.";
  }
  if (text.includes("abort")) {
    return "That request was stopped before it finished.";
  }
  // Says the request failed without inventing a reason for it, which is
  // all that is actually known at this point.
  return "The model provider returned an error. The details are in the server log.";
}

/**
 * AI TUTOR — session required
 * ------------------------------------------------------------
 * This route spends money on every call and returns model output, so
 * it is the most expensive thing in the app to leave open. It used to
 * have no auth check at all: any anonymous POST reached the model.
 *
 * The gate is here rather than only in the page so that the API is
 * unusable on its own — a fetch from the console, a curl, or a
 * replayed request cannot skip the UI's own check. Page-level gates
 * are convenience; this one is the boundary.
 *
 * 401 rather than a redirect: this is an API route, and a 307 to
 * /login would be followed into an HTML login page where the client
 * expects a stream.
 */
export async function POST(req: Request): Promise<Response> {
  // --- gate: a session. No account, no model call. ---
  const user = await getSession();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to use the tutor." },
      { status: 401 },
    );
  }

  let messages: UIMessage[] | undefined;
  try {
    ({ messages } = (await req.json()) as { messages?: UIMessage[] });
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  // The body is caller-controlled, so it is checked before it can
  // reach the model. Anything that is not a message array is a bad
  // request, not a stack trace.
  if (!Array.isArray(messages)) {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  // Cap the transcript. Without this, any signed-in caller can post an
  // arbitrarily long conversation and bill it to the Gemini key.
  const capped = messages.slice(-50);

  const model = wrapLanguageModel({
    model: google("gemini-3.8-flash"),
    middleware: DEVTOOLS,
  });
  const result = streamText({
    model,
    system: TUTOR_SYSTEM_PROMPT,
    messages: await convertToModelMessages(capped),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: explainProviderFailure,
    }),
  });
}