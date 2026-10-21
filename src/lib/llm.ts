/**
 * THE MODEL CLIENT
 * ---------------------------------------------------------------------------
 * One dialect for every provider: OpenAI's chat completions, streamed.
 *
 * The web app's tutor speaks it through the AI SDK, on its server, with the
 * reader's key sealed there. This one speaks it from the phone, with the
 * key in the keychain, and the difference is one line of configuration:
 * there is no SDK here, so the request is a `fetch` and the response is
 * read a chunk at a time.
 *
 * THE WIRE
 * ---------------------------------------------------------------------------
 *   POST {base}/chat/completions
 *   Authorization: Bearer <the reader's key>
 *   { "model", "messages", "tools", "tool_choice", "stream": true }
 *
 * and the answer comes back as `text/event-stream`, one JSON object per
 * `data:` line, each one a chunk of the answer or a piece of a tool call.
 *
 * WHY NO TEMPERATURE
 * ---------------------------------------------------------------------------
 * The web app sends none, so the provider's own default stands, and a
 * provider that has tuned a model for its own hardware keeps that tuning.
 * The same goes for `max_tokens`: a cap set here is a cap the reader
 * cannot see or change.
 *
 * THE TOOL LOOP
 * ---------------------------------------------------------------------------
 * A model may answer, or it may ask for a tool. When it asks, the tool
 * runs HERE — on the device, over the notes the app already has — and the
 * result goes back in a second request. Four steps is the ceiling, which is
 * the web app's ceiling too: a model that keeps calling tools is a model
 * that has lost the thread, and the loop should stop rather than continue.
 */
import { fetch } from "expo/fetch";

/* ------------------------------------------------------------------ *
 *  the shapes
 * ------------------------------------------------------------------ */

export type ChatRole = "system" | "user" | "assistant" | "tool";

export type ToolCall = {
  readonly id: string;
  readonly name: string;
  /** The arguments, as the JSON string the model streamed. */
  readonly arguments: string;
};

export type ChatMessage = {
  readonly role: ChatRole;
  readonly content: string;
  /** Set on an assistant message that asked for tools. */
  readonly toolCalls?: ReadonlyArray<ToolCall>;
  /** Set on a tool message: the call it answers. */
  readonly toolCallId?: string;
  /** Set on a tool message: the tool it came from. */
  readonly name?: string;
};

export type ToolSpec = {
  readonly name: string;
  readonly description: string;
  /** The JSON schema for the arguments. */
  readonly parameters: Readonly<Record<string, unknown>>;
};

/** What the caller is told as the answer arrives. */
export type LlmEvent =
  | { readonly kind: "text"; readonly delta: string }
  | { readonly kind: "tool-call"; readonly call: ToolCall }
  | { readonly kind: "tool-result"; readonly callId: string; readonly output: string }
  | { readonly kind: "done"; readonly finishReason: string }
  | { readonly kind: "error"; readonly message: string };

/* ------------------------------------------------------------------ *
 *  failures
 * ------------------------------------------------------------------ */

/**
 * A FAILURE, IN THE READER'S LANGUAGE.
 *
 * The provider's own error text names request ids, project ids and quota
 * identifiers, and none of that is the reader's business. So the error is
 * classified here and replaced with a sentence, and the raw text is
 * dropped. This is the web app's `explainProviderFailure`, with the same
 * order of checks — a dead model must not look like an outage, so the
 * model check comes first.
 */
export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmError";
  }
}

function classify(text: string, status: number | null): string {
  const haystack = text.toLowerCase();

  // A model that is gone, or never existed.
  if (
    status === 404 ||
    haystack.includes("no endpoints found") ||
    haystack.includes("model not found") ||
    haystack.includes("not available for free") ||
    haystack.includes("is not a valid model") ||
    haystack.includes("use this slug instead")
  ) {
    return "That model is not available at this provider. Pick another one in the model menu.";
  }

  // Out of credit, or out of pace.
  if (
    haystack.includes("quota") ||
    haystack.includes("rate limit") ||
    haystack.includes("rate_limit") ||
    haystack.includes("resource_exhausted") ||
    status === 429
  ) {
    return "This provider has used up its quota for now. It resets on their side — try again later.";
  }

  // The key was refused.
  if (
    status === 401 ||
    status === 403 ||
    haystack.includes("invalid api key") ||
    haystack.includes("unauthorized") ||
    haystack.includes("incorrect api key") ||
    haystack.includes("permission")
  ) {
    return "That provider refused the key. Re-enter it under You → Study partner.";
  }

  // The provider is busy.
  if (
    haystack.includes("overloaded") ||
    haystack.includes("high demand") ||
    haystack.includes("service unavailable") ||
    status === 502 ||
    status === 503 ||
    status === 504
  ) {
    return "The provider is busy right now. Try again in a moment.";
  }

  // It took too long.
  if (haystack.includes("timeout") || haystack.includes("timed out")) {
    return "The provider did not answer in time. Try again in a moment.";
  }

  // The request was refused before it left, or the address is wrong.
  if (haystack.includes("fetch failed") || haystack.includes("network request failed")) {
    return "The provider could not be reached. Check the address and that you are online.";
  }

  return "The provider returned an error. The details were not shown on purpose.";
}

/* ------------------------------------------------------------------ *
 *  the request
 * ------------------------------------------------------------------ */

type StreamOptions = {
  /** The base address, without the endpoint on the end. */
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly messages: ReadonlyArray<ChatMessage>;
  readonly tools?: ReadonlyArray<ToolSpec>;
  /**
   * Runs a tool the model asked for and returns its output as text.
   *
   * It runs on the device, so it is a local function and not a URL: the
   * notes are here.
   */
  readonly runTool?: (name: string, args: string) => Promise<string>;
  readonly signal?: AbortSignal;
  /** How many times the model may call a tool before the loop gives up. */
  readonly maxSteps?: number;
};

/**
 * The endpoint a request goes to.
 *
 * Exported because the settings screen shows it, so the reader can see
 * the address their key is about to be sent to.
 */
export function endpointFor(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  return `${base}/chat/completions`;
}

/** The JSON body, in the shape every provider in this family speaks. */
function requestBody(
  model: string,
  messages: ReadonlyArray<ChatMessage>,
  tools: ReadonlyArray<ToolSpec> | undefined,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages: messages.map((m) => {
      if (m.role === "tool") {
        return {
          role: "tool",
          content: m.content,
          tool_call_id: m.toolCallId ?? "",
          name: m.name ?? "",
        };
      }
      if (m.role === "assistant" && m.toolCalls !== undefined) {
        return {
          role: "assistant",
          content: m.content,
          tool_calls: m.toolCalls.map((c) => ({
            id: c.id,
            type: "function",
            function: { name: c.name, arguments: c.arguments },
          })),
        };
      }
      return { role: m.role, content: m.content };
    }),
    stream: true,
  };
  if (tools !== undefined && tools.length > 0) {
    body.tools = tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    body.tool_choice = "auto";
  }
  return body;
}

/* ------------------------------------------------------------------ *
 *  the stream
 * ------------------------------------------------------------------ */

type OpenAiChunk = {
  choices?: ReadonlyArray<{
    delta?: {
      content?: string | null;
      tool_calls?: ReadonlyArray<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  error?: { message?: string; code?: string; type?: string };
};

/**
 * The frames of an event stream.
 *
 * A frame ends at a blank line, and a frame's data is the part after
 * `data: `. The buffer is carried across reads, because a chunk boundary
 * can land in the middle of a frame.
 */
async function* readFrames(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let cut = buffer.indexOf("\n\n");
      while (cut !== -1) {
        const frame = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        const data = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("\n");
        if (data.length > 0) yield data;
        cut = buffer.indexOf("\n\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * TALK TO A PROVIDER.
 *
 * Yields the answer as it arrives, and the tool calls and their results
 * as they happen, so the screen can show a search happening before the
 * words do.
 */
export async function* streamChat(
  options: StreamOptions,
): AsyncGenerator<LlmEvent> {
  const maxSteps = options.maxSteps ?? 4;
  const history: ChatMessage[] = [...options.messages];

  for (let step = 0; step < maxSteps; step += 1) {
    let response: Response;
    try {
      response = await fetch(endpointFor(options.baseUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "text/event-stream",
          authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify(
          requestBody(options.model, history, options.tools),
        ),
        signal: options.signal,
      });
    } catch (err) {
      if (options.signal?.aborted === true) {
        yield { kind: "error", message: "That request was stopped before it finished." };
        return;
      }
      yield {
        kind: "error",
        message: classify(err instanceof Error ? err.message : String(err), null),
      };
      return;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      yield { kind: "error", message: classify(text, response.status) };
      return;
    }

    if (response.body === null) {
      yield {
        kind: "error",
        message: "The provider answered without a stream. Try a provider that streams.",
      };
      return;
    }

    let text = "";
    let finishReason = "";
    /** The tool calls the model asked for, accumulated across the stream. */
    const calls = new Map<number, { id: string; name: string; args: string }>();

    for await (const data of readFrames(response.body)) {
      if (data === "[DONE]") break;

      let chunk: OpenAiChunk;
      try {
        chunk = JSON.parse(data) as OpenAiChunk;
      } catch {
        // A frame that is not JSON is not worth failing the turn over.
        continue;
      }

      if (chunk.error !== undefined) {
        yield {
          kind: "error",
          message: classify(chunk.error.message ?? chunk.error.code ?? "", null),
        };
        return;
      }

      const choice = chunk.choices?.[0];
      if (choice === undefined) continue;

      const delta = choice.delta?.content;
      if (delta !== undefined && delta !== null && delta.length > 0) {
        text += delta;
        yield { kind: "text", delta };
      }

      for (const call of choice.delta?.tool_calls ?? []) {
        const index = call.index ?? 0;
        const existing = calls.get(index) ?? { id: "", name: "", args: "" };
        calls.set(index, {
          id: call.id ?? existing.id,
          name: call.function?.name ?? existing.name,
          args: existing.args + (call.function?.arguments ?? ""),
        });
      }

      if (choice.finish_reason !== undefined && choice.finish_reason !== null) {
        finishReason = choice.finish_reason;
      }
    }

    const toolCalls: ToolCall[] = [...calls.values()].map((c) => ({
      id: c.id,
      name: c.name,
      arguments: c.args,
    }));

    if (toolCalls.length === 0 || options.runTool === undefined) {
      yield { kind: "done", finishReason: finishReason.length > 0 ? finishReason : "stop" };
      return;
    }

    // The model asked for something. Answer it, and go round again.
    history.push({ role: "assistant", content: text, toolCalls });

    for (const call of toolCalls) {
      yield { kind: "tool-call", call };
      let output: string;
      try {
        output = await options.runTool(call.name, call.arguments);
      } catch (err) {
        output = `The tool failed: ${err instanceof Error ? err.message : "unknown error"}`;
      }
      yield { kind: "tool-result", callId: call.id, output };
      history.push({
        role: "tool",
        content: output,
        toolCallId: call.id,
        name: call.name,
      });
    }
  }

  yield {
    kind: "error",
    message: "The model kept asking for tools and never answered. Try asking again.",
  };
}

/* ------------------------------------------------------------------ *
 *  the models a provider offers
 * ------------------------------------------------------------------ */

export type ModelInfo = {
  readonly id: string;
  readonly label: string;
  /**
   * Whether the provider says this model costs nothing.
   *
   * Two signals, and the order matters. A provider that publishes PRICING
   * is believed, because "is it free" is then a fact about the model
   * rather than about its name. A provider that publishes nothing but ids
   * is asked about its naming instead, because the `:free` suffix is the
   * convention the ecosystem actually uses.
   *
   * So a model with a price is never free, whatever it is called, and a
   * model with no price at all is free only if it says so.
   */
  readonly free: boolean;
};

/**
 * IS THIS MODEL FREE, BY ITS NAME?
 *
 * The `:free` suffix is the convention — `llama-3.3-70b-instruct:free`,
 * `qwen3:8b:free` — and the case-folding matters because ids come back
 * from providers in whatever case they please.
 *
 * This is the web app's `isFreeModelId`, ported. The web app uses it on
 * the custom-provider path, where `/models` returns ids and nothing
 * else; here it is the fallback for a provider that publishes no pricing
 * at all.
 */
export function isFreeModelId(modelId: string): boolean {
  return modelId.trim().toLowerCase().endsWith(":free");
}

/**
 * A model id, made readable.
 *
 * The web app's `labelForCustomModel`, ported: the suffix comes off, the
 * `-it` that means "instruct" becomes the word, and the dashes become
 * spaces. A reader choosing between two of their own models wants to
 * see the difference, and a raw id does not make that easy.
 */
export function labelForModelId(id: string): string {
  return id
    .replace(/:free$/i, "")
    .replace(/-it$/i, " (instruct)")
    .replace(/-/g, " ");
}

/**
 * THE MODELS A PROVIDER HAS.
 *
 * Every provider in this family answers `GET {base}/models` with
 * `{ "data": [{ "id": "..." }] }`, and the web app asks the same question
 * of the same kind of address. So the list comes from the provider, and
 * the app has no catalogue of its own to fall out of date.
 *
 * A provider that does not answer is not a failure: the reader can still
 * type a model id in the settings, which is why the field is there.
 */
export async function listModels(
  baseUrl: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ReadonlyArray<ModelInfo>> {
  const base = baseUrl.trim().replace(/\/+$/, "");
  let response: Response;
  try {
    response = await fetch(`${base}/models`, {
      method: "GET",
      headers: { accept: "application/json", authorization: `Bearer ${apiKey}` },
      signal,
    });
  } catch (err) {
    throw new LlmError(
      classify(err instanceof Error ? err.message : String(err), null),
    );
  }
  if (!response.ok) {
    throw new LlmError(classify(await response.text().catch(() => ""), response.status));
  }
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new LlmError("That provider's model list could not be read.");
  }
  const data = (parsed as { data?: unknown }).data;
  if (!Array.isArray(data)) {
    throw new LlmError("That provider's model list could not be read.");
  }
  const models: ModelInfo[] = [];
  for (const entry of data) {
    if (entry === null || typeof entry !== "object") continue;
    const row = entry as {
      id?: unknown;
      pricing?: { prompt?: unknown; completion?: unknown };
    };
    const id = row.id;
    if (typeof id !== "string" || id.length === 0) continue;
    models.push({ id, label: labelForModelId(id), free: isFreeModel(entry) });
  }
  return models;
}

/**
 * IS THIS MODEL FREE?
 *
 * A provider that publishes pricing is believed, and a provider that
 * publishes nothing but names is asked about the name. The web app draws
 * the same line: `isAllowedByPolicy` filters the OpenRouter catalogue on
 * `pricing.prompt === "0"`, and `isFreeModelId` handles the custom
 * endpoints that return ids and nothing else.
 *
 * Both prices have to be zero, not just one. A model that is free to
 * prompt with and paid to answer from is not free, and treating it as
 * though it were would spend the reader's money on the answer.
 *
 * The consequence, stated plainly: on a provider that publishes no
 * pricing, this trusts the provider's own naming. A provider that
 * charges for a model called `something:free` will be believed. That is
 * inherent to routing to somebody's endpoint with somebody's key, and it
 * is why the filter is a toggle the reader controls rather than a rule
 * the app enforces.
 */
function isFreeModel(entry: unknown): boolean {
  if (entry === null || typeof entry !== "object") return false;
  const pricing = (entry as { pricing?: { prompt?: unknown; completion?: unknown } }).pricing;
  if (pricing !== undefined && pricing !== null) {
    return pricing.prompt === "0" && pricing.completion === "0";
  }
  const id = (entry as { id?: unknown }).id;
  return typeof id === "string" && isFreeModelId(id);
}
