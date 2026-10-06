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

export const maxDuration = 30;

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
    middleware: devToolsMiddleware(),
  });
  const result = streamText({
    model,
    messages: await convertToModelMessages(capped),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}