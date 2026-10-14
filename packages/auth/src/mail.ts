/**
 * MAIL — MailTrap, over HTTP
 * ------------------------------------------------------------------------
 * There was no mail in this codebase at all. `improvement-form.tsx` collects
 * an address and, as its own comment says, sends nothing. So this is the
 * first transport, and it is deliberately the boring one.
 *
 * WHY HTTP AND NOT SMTP
 * ------------------------------------------------------------------------
 * MailTrap also speaks SMTP, via nodemailer. That is the wrong shape for this
 * deployment:
 *
 *   · Vercel functions are short-lived and frequently recycled. An SMTP
 *     conversation is a stateful TCP connection, so every send pays a fresh
 *     handshake and can fail on a connection that was healthy a second ago.
 *   · SMTP retries are ambiguous. A send that times out after DATA may or may
 *     not have been accepted, and a verification mail that is delivered twice
 *     burns a token the reader already used.
 *   · The HTTP API is one request with one response that states whether the
 *     message was accepted. There is no window where we cannot tell.
 *
 * It also costs nothing to add: `fetch` is already here, so there is no new
 * dependency and nothing to audit in node_modules.
 *
 * SANDBOX vs LIVE — AND WHY THE DIFFERENCE IS REFUSED RATHER THAN GUESSED
 * ------------------------------------------------------------------------
 * MailTrap has two endpoints with different credentials:
 *
 *   sandbox.api.mailtrap.io   catches mail in a virtual inbox and delivers
 *                             nothing to a real person. NO SENDING DOMAIN IS
 *                             NEEDED, and the recipient may be any address —
 *                             MailTrap does not require you to register the
 *                             people you are testing with.
 *   send.api.mailtrap.io      real delivery, and requires a sending domain
 *                             you own, verified with DNS records
 *
 * An earlier version of this comment claimed sandbox "only accepts recipients
 * you have explicitly registered". That is wrong, and it would have sent
 * someone looking for a recipient allowlist that does not exist — and
 * possibly to a conclusion that verification could not be tested against a
 * real-looking address at all.
 *
 * Picking the wrong endpoint is the failure that matters: a misconfigured
 * production deploy would report success while delivering verification links
 * into a void, and the symptom would be "nobody can verify" with a green
 * dashboard. So the endpoint is derived from one explicit variable
 * (`MAILTRAP_SANDBOX`) rather than inferred from the presence of a token, and
 * a production deploy with the sandbox flag on is refused loudly at first use.
 *
 * WHY FAILURES ARE NOT THROWN
 * ------------------------------------------------------------------------
 * A verification mail that cannot be sent must not take the sign-up with it.
 * `sendMail` resolves either way and reports what happened, because the
 * caller is Better Auth's `sendVerificationEmail`, which cannot usefully react
 * to an exception: throwing there turns a delivery problem into a failed
 * registration, and the reader is told "sign up failed" when in fact their
 * account exists. The resend endpoint turns a boolean into a message.
 *
 * WHAT THIS DOES NOT DO
 * ------------------------------------------------------------------------
 * It does not verify that the mail arrived, and it cannot. Delivery is
 * confirmed by the reader clicking the link, which is the only confirmation
 * that means anything — a 202 from an API says the message was accepted, not
 * that it reached a mailbox, and building on the former is how you end up
 * marking people verified who never received anything.
 */

/*
 * MailTrap's two endpoints. The difference is not cosmetic, and the two are
 * not symmetric.
 *
 *   sandbox.api.mailtrap.io/api/send/<inboxId>   catches mail in a virtual
 *                                                inbox. NO DOMAIN REQUIRED, and
 *                                                the recipient may be any
 *                                                address — MailTrap does not
 *                                                require the recipient to be
 *                                                registered anywhere.
 *   send.api.mailtrap.io/api/send                 real delivery. Requires a
 *                                                verified sending domain.
 *
 * CORRECTED, AND THE FIRST VERSION OF THIS WAS WRONG IN BOTH CASES.
 *
 * It originally read:
 *
 *   sandbox: "https://sandbox.api.mailtrap.io/api/v1/send"
 *   live:    "https://api.mailtrap.io/api/v1/send"
 *
 * Neither is an endpoint MailTrap serves. The live host is
 * `send.api.mailtrap.io` — `api.mailtrap.io` is the REST API for managing the
 * account (domains, templates, inboxes), not for sending — and neither variant
 * has a `/v1` path segment. The sandbox one additionally requires the inbox id
 * as a path suffix, which is why MAILTRAP_INBOX_ID exists.
 *
 * The failure would have been silent and late: a 404, logged by sendMail,
 * reported to nobody because sendMail never throws, and a reader who never
 * received their verification link with no visible cause anywhere. That is the
 * exact failure this file warns about elsewhere, so it is worth stating
 * plainly that a wrong URL here is not cosmetic.
 */
const ENDPOINTS = {
  sandbox: "https://sandbox.api.mailtrap.io/api/send",
  live: "https://send.api.mailtrap.io/api/send",
} as const;

export type MailResult = {
  readonly ok: boolean;
  /** Present when `ok` is false. Safe to log; never contains the token. */
  readonly reason?: string;
  /** The URL that was linked, when this was a verification mail. */
  readonly link?: string;
};

/** HTML-escaped, because a display name can contain anything a reader typed. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Deliver one message through MailTrap.
 *
 * `link` is the important argument: MailTrap renders nothing, so a bare
 * "please verify your address" with no URL in it is a mail the reader cannot
 * act on. It goes in the body as a real anchor and as the plaintext fallback,
 * because a reader on a client that blocks HTML then has something to copy.
 */
export async function sendMail(args: {
  readonly to: string;
  readonly subject: string;
  readonly heading: string;
  readonly body: string;
  readonly link?: string;
  readonly linkLabel?: string;
}): Promise<MailResult> {
  const token = process.env["MAILTRAP_TOKEN"];
  if (!token) {
    return { ok: false, reason: "MAILTRAP_TOKEN is not set" };
  }

  const sandbox = process.env["MAILTRAP_SANDBOX"] === "true";

  /*
   * Sandbox needs an inbox id in the path, and it has no sensible default.
   *
   * Without this check a missing inbox id produces
   * `/api/send/undefined`, which MailTrap answers with a 404 that looks
   * exactly like a bad token. Naming the missing variable turns a five-minute
   * "why is nothing arriving" into an obvious fix.
   */
  const inboxId = process.env["MAILTRAP_INBOX_ID"];
  if (sandbox && !inboxId) {
    console.warn(
      [
        "[mail] MAILTRAP_SANDBOX is true but MAILTRAP_INBOX_ID is not set.",
        "  Sandbox sends to https://sandbox.api.mailtrap.io/api/send/<inboxId>,",
        "  and the id has no default. Find it at https://mailtrap.io/sandboxes",
      ].join("\n"),
    );
    return { ok: false, reason: "MAILTRAP_INBOX_ID is not set", link: args.link };
  }

  const endpoint = sandbox ? `${ENDPOINTS.sandbox}/${inboxId}` : ENDPOINTS.live;

  /*
   * REFUSE THE DANGEROUS COMBINATION OUT LOUD
   *
   * In production, sending verification links into a sandbox means every
   * reader is told to check an inbox nobody has, and the site looks broken in
   * a way that is very hard to diagnose from the outside. It is a
   * configuration mistake rather than an attack, so this warns rather than
   * throws — but it warns on every send, so it cannot be missed.
   */
  if (sandbox && process.env.NODE_ENV === "production") {
    console.warn(
      [
        "[mail] MAILTRAP_SANDBOX is true in production.",
        "  Verification links will be caught by MailTrap's sandbox and will",
        "  NOT reach any reader. Set MAILTRAP_SANDBOX=false before going live.",
      ].join("\n"),
    );
  }

  const from = process.env["MAILTRAP_FROM"] ?? "Nexus <noreply@nexus-tutoring.vercel.app>";
  const link = args.link;
  const cta = link && args.linkLabel ? `<p><a href="${esc(link)}">${esc(args.linkLabel)}</a></p>` : "";
  const plaintextLink = link ? `\n\n${args.linkLabel ?? "Open this link"}: ${link}\n` : "";

  /*
   * `from` is an OBJECT, not a "Name <addr>" string.
   *
   * The string form is what nodemailer and SMTP take, and it is what most
   * examples show, so it is the natural thing to write. MailTrap rejects it:
   *
   *     invalid type for field `from`, expected: `object`, given: `string`
   *
   * Which is the whole reason this was sent through the real service rather
   * than trusted: it is a 400 on every single send, so with `sendMail`
   * deliberately swallowing failures the symptom would have been "verification
   * links silently never arrive" — the same invisible failure a wrong endpoint
   * URL produces, one layer deeper. Parsed here so MAILTRAP_FROM can stay the
   * readable "Nexus <addr@example.com>" form in the environment.
   */
  const fromMatch = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  const fromPayload = fromMatch
    ? { email: fromMatch[2], name: fromMatch[1] }
    : { email: from, name: "" };

  /*
   * `to` is an array of OBJECTS, not an array of address strings.
   *
   * Same shape error as `from`, found by sending again after fixing that one:
   *
   *     invalid type for field `to`, expected: `object`, given: `string`
   *
   * Every example in the wild uses plain strings for both, because that is
   * correct for SMTP and for most SDKs. MailTrap's send endpoint wants the
   * structured form for both. Two 400s, found only by actually sending —
   * which is the argument for sending rather than for asserting on a shape.
   */
  const toPayload = [{ email: args.to }];

  const html = [
    "<div style=\"font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;line-height:1.6;color:#1a1614\">",
    `<h2 style="margin:0 0 12px;font-size:18px">${esc(args.heading)}</h2>`,
    `<p style="margin:0 0 12px">${esc(args.body)}</p>`,
    cta,
    // The raw URL as well as the anchor. Some clients strip anchors, and a
    // verification mail with no reachable link in it is the worst outcome
    // available: it looks delivered and achieves nothing.
    link ? `<p style="margin:0 0 12px;font-size:12px;color:#6b6560;word-break:break-all">${esc(link)}</p>` : "",
    '<hr style="border:none;border-top:1px solid #e8e2db;margin:20px 0">',
    '<p style="margin:0;font-size:12px;color:#6b6560">If you did not ask for this, ignore this message. Nothing has changed on your account.</p>',
    "</div>",
  ].join("");

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // The token is the only credential MailTrap needs; it scopes to the
        // account rather than to a mailbox, which is also why it is marked
        // sensitive in the env schema.
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        from: fromPayload,
        to: toPayload,
        subject: args.subject,
        text: `${args.heading}\n\n${args.body}${plaintextLink}`,
        html,
      }),
    });

    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      console.error(`[mail] MailTrap rejected the message: ${res.status} ${detail}`);
      return { ok: false, reason: `MailTrap responded ${res.status}`, link };
    }

    // Accepted. NOT delivered — see the note at the top of this file.
    return { ok: true, link };
  } catch (err) {
    // Network failure, DNS, timeout. Never allowed to become a thrown error.
    console.error("[mail] send failed:", err instanceof Error ? err.message : err);
    return { ok: false, reason: "the mail service could not be reached", link };
  }
}

/** True when mail is configured at all, so the UI can say something honest. */
export function mailConfigured(): boolean {
  return Boolean(process.env["MAILTRAP_TOKEN"]);
}
