import * as q from "@Main/db/queries";
import { NextResponse } from "next/server";

import { db } from "@/services";

import { getSession } from "@/lib/session";

/**
 * CHAT HISTORY — /api/chat
 * ------------------------------------------------------------
 * The tutor's stored conversations. One route, three verbs, because
 * they share a single gate and a single scoping rule:
 *
 *   GET    ?thread=<id>   list this user's threads, or open one
 *   POST                record a finished turn
 *   DELETE ?thread=<id>  forget one thread
 *
 * THE ONLY GATE IS getSession(), and the id it returns is what reaches
 * every query. Nothing downstream ever sees a caller-supplied user id —
 * not from the body, not from a header, not from a query parameter.
 * That is what makes "only that user" a property of the system rather
 * than a claim in the UI: `?thread=<someone else's id>` is answered by
 * the user filter inside the query, so it returns nothing rather than
 * somebody's transcript.
 *
 * The database is not optional here, unlike on the public pages. Every
 * other read in lib/modules.ts falls back to a bundled list so the site
 * still renders with Postgres down; falling back for chat history would
 * mean inventing an empty history, which reads as "you have no chats"
 * and is worse than an error. A 503 says what is actually true.
 */

/** Bounded so a caller cannot use this to write arbitrary rows. */
const MAX_CONTENT = 20_000;
const MAX_TITLE = 80;
const MAX_BATCH = 100;

/** 401 for every verb. This is a JSON API, so not a redirect. */
async function requireUser(): Promise<{ id: string } | NextResponse> {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Sign in to use the tutor." }, { status: 401 });
  }
  return user;
}

function dbUnavailable(): NextResponse {
  return NextResponse.json({ error: "Chat history is unavailable." }, { status: 503 });
}

export async function GET(req: Request): Promise<Response> {
  const user = await requireUser();
  if (user instanceof NextResponse) {
    return user;
  }

  const threadId = new URL(req.url).searchParams.get("thread");

  try {
    // No `thread` means the history pane: every one of this user's
    // threads, newest first.
    if (!threadId) {
      return NextResponse.json({ threads: await q.listChatThreads(db, user.id) });
    }

    const thread = await q.getChatThread(db, user.id, threadId);
    // 404 covers both "no such thread" and "not yours". A 403 would
    // confirm the id exists, turning this into an oracle for probing
    // which thread ids other users have.
    if (thread === null) {
      return NextResponse.json({ error: "No such conversation." }, { status: 404 });
    }
    return NextResponse.json(thread);
  } catch (err) {
    console.error("[chat] list failed:", err);
    return dbUnavailable();
  }
}

export async function POST(req: Request): Promise<Response> {
  const user = await requireUser();
  if (user instanceof NextResponse) {
    return user;
  }

  let body: { threadId?: unknown; messages?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const threadId = typeof body.threadId === "string" ? body.threadId.trim() : "";
  if (!threadId || threadId.length > 64) {
    return NextResponse.json({ error: "A threadId is required." }, { status: 400 });
  }

  if (!Array.isArray(body.messages)) {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  // Every field is caller-controlled, so every field is checked before
  // it reaches the database. The shape is narrow on purpose: the tutor
  // sends text and nothing else, so there is no tool-call or file part
  // to accept, and a wider shape would be a wider surface.
  const parsed: Array<q.NewChatMessage> = [];
  for (const raw of body.messages) {
    const m = raw as { id?: unknown; role?: unknown; content?: unknown };
    if (typeof m.id !== "string" || m.id.length === 0 || m.id.length > 64) {
      continue;
    }
    if (m.role !== "user" && m.role !== "assistant") {
      continue;
    }
    if (typeof m.content !== "string" || m.content.length === 0) {
      continue;
    }
    parsed.push({ id: m.id, role: m.role, content: m.content.slice(0, MAX_CONTENT) });
    if (parsed.length >= MAX_BATCH) {
      break;
    }
  }

  if (parsed.length === 0) {
    return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  }

  // Derived here rather than taken from the body, so the label in the
  // history pane cannot be set to arbitrary text by the client. On a
  // normal send this is the message that opened the conversation.
  const opener = parsed.find((m) => m.role === "user");
  const title =
    (opener?.content ?? "New chat").replace(/\s+/g, " ").trim().slice(0, MAX_TITLE) ||
    "New chat";

  try {
    for (const message of parsed) {
      // False means the thread id is already taken by another account.
      // The thread id is client-supplied and is the primary key of
      // chat_threads, so this is the one place a signed-in user could
      // reach into somebody else's transcript. The read and delete
      // verbs are scoped by a user filter inside their queries; this
      // write has to be refused the same way. 404 rather than 403, so
      // that "not yours" and "does not exist" stay indistinguishable.
      const saved = await q.appendChatMessage(db, user.id, threadId, title, message);
      if (!saved) {
        return NextResponse.json({ error: "No such conversation." }, { status: 404 });
      }
    }
    return NextResponse.json({ ok: true, threadId });
  } catch (err) {
    console.error("[chat] save failed:", err);
    return dbUnavailable();
  }
}

export async function DELETE(req: Request): Promise<Response> {
  const user = await requireUser();
  if (user instanceof NextResponse) {
    return user;
  }

  const threadId = new URL(req.url).searchParams.get("thread");
  if (!threadId) {
    return NextResponse.json({ error: "A thread is required." }, { status: 400 });
  }

  try {
    // Scoped by user inside the query, so deleting somebody else's
    // thread is a no-op reported as 404 rather than a deletion.
    const deleted = await q.deleteChatThread(db, user.id, threadId);
    if (!deleted) {
      return NextResponse.json({ error: "No such conversation." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[chat] delete failed:", err);
    return dbUnavailable();
  }
}