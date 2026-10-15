/**
 * EMAIL VERIFICATION — the gate, and the token flow
 * ------------------------------------------------------------------------
 * Two things are worth proving here, and neither of them is "does the library
 * work". Better Auth's token signing is not ours to test.
 *
 * 1. THE GATE IS OFF WHEN MAIL IS NOT CONFIGURED.
 *    This is the safety property. Verification is enforced by refusing
 *    unverified readers, so enforcing it on a deploy that cannot send mail
 *    locks every new reader out of the tutor permanently and protects
 *    nothing. A developer cloning this repo with no MailTrap account must get
 *    a working site.
 *
 * 2. THE GATE IS ON WHEN MAIL IS, AND IT IS ON AI ONLY.
 *    The gate is a per-route decision, not a layout-level lock. Verified by
 *    reading the route: the check must be inside /api/ai and must not have
 *    leaked into a middleware, a layout, or the purchase path.
 *
 * Plus the shape assertions that are cheap to get wrong and invisible when
 * wrong: the verification table is the one Better Auth actually writes to, and
 * `emailVerified` has to be readable off the session rather than fetched.
 *
 * Run from apps/web:  node scripts/test-email-verification.mjs
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Recursive readdir, so the "is the gate enforced anywhere else" scan needs
 * no dependency of its own. A static import rather than a top-level await:
 * this is called mid-file, long before a trailing import would initialise.
 */
function readdirDeep(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...readdirDeep(full));
    else out.push(full);
  }
  return out;
}

const HERE = dirname(fileURLToPath(import.meta.url));
/** apps/web - one level up from scripts/. Every app path is relative to it. */
const WEB = join(HERE, "..");
/** The monorepo root, for packages/*. */
const REPO = join(WEB, "..", "..");

const read = (...p) => readFileSync(join(WEB, ...p), "utf8");
const readPkg = (...p) => readFileSync(join(REPO, ...p), "utf8");

let passed = 0;
const ok = (m) => {
  console.log(`  ok   ${m}`);
  passed++;
};
const bad = (m) => {
  console.log(`  FAIL ${m}`);
  process.exitCode = 1;
};

/* ------------------------------------------------- 1. the gate is off --- */

/*
 * `emailVerificationRequired()` reads mailConfigured(), which is a single
 * boolean. Reimplemented here rather than imported: packages/auth imports
 * better-auth and the db schema, neither of which resolves under plain node,
 * and duplicating one `Boolean(process.env.X)` is cheaper than reshaping a
 * package into an importable module for it.
 */
function mailConfigured(env) {
  return Boolean(env.MAILTRAP_TOKEN);
}
function emailVerificationRequired(env) {
  return mailConfigured(env);
}

console.log("the gate follows whether mail can actually be sent");
{
  assert.equal(emailVerificationRequired({}), false, "no token means no gate");
  ok("no MAILTRAP_TOKEN -> verification NOT required (a fresh clone still works)");

  assert.equal(emailVerificationRequired({ MAILTRAP_TOKEN: "" }), false, "empty is not a token");
  ok("empty MAILTRAP_TOKEN -> not required (present-but-blank is not configured)");

  assert.equal(emailVerificationRequired({ MAILTRAP_TOKEN: "tok_abc" }), true);
  ok("MAILTRAP_TOKEN set -> required");
}

/* -------------------------------------------- 2. the gate is AI-only --- */

console.log("\nthe gate is on AI messages and nothing else");
{
  const ai = read("src", "app", "api", "ai", "route.ts");

  assert.ok(
    ai.includes("emailVerificationRequired()"),
    "/api/ai must consult whether verification is in force",
  );
  ok("/api/ai consults emailVerificationRequired()");

  assert.ok(
    ai.includes('code: "EMAIL_NOT_VERIFIED"'),
    "the refusal must be identifiable, not a bare 403",
  );
  ok("the refusal carries a machine-readable code");

  /*
   * Look at the whole response, both sides of the marker. The status is in
   * the second argument to NextResponse.json, so it sits AFTER the body that
   * carries the code - a window that only searched backwards reported a
   * correct 403 as missing.
   */
  const refusal = ai.slice(ai.indexOf("EMAIL_NOT_VERIFIED") - 200, ai.indexOf("EMAIL_NOT_VERIFIED") + 200);
  assert.ok(
    /status:\s*403/.test(refusal),
    "an unverified reader is authenticated, so this must not be a 401",
  );
  ok("403, not 401 — the session is valid, the reader just cannot spend money");

  // It must sit AFTER the session check (it needs a verdict about someone)
  // and BEFORE the budget (a refusal must not consume the allowance).
  const atSession = ai.indexOf("const user = await getSession()");
  const atGate = ai.indexOf("emailVerificationRequired() && user.emailVerified");
  const atBudget = ai.indexOf("consumeAiBudget(db, user.id)");
  assert.ok(atSession > -1 && atGate > atSession, "gate must come after the session check");
  ok("gate sits after the session check");
  assert.ok(atBudget > atGate, "gate must come before the spending gate");
  ok("gate sits BEFORE the budget — a refusal costs no allowance");

  /*
   * The half that is easy to get wrong: verification is enforced by refusing
   * something, so the moment it leaks into a shared layout or a middleware it
   * stops being "AI only" and starts being "you cannot use the site".
   *
   * Matched on a CALL, not on the bare identifier. An earlier version searched
   * for the name and flagged the verification banner, which only discusses
   * `emailVerified` in a comment - a reminder, not a gate. A check looser than
   * a call fails for the wrong reason on unrelated code, and a check like that
   * gets ignored rather than fixed.
   *
   * AND the comments are stripped before matching. Matching the call shape was
   * necessary but not sufficient: `src/env.ts` is generated from `.env.schema`,
   * which explains in prose that without MAILTRAP_TOKEN verification is off
   * because `emailVerificationRequired()` returns false. That is a
   * documentation reference in a file that cannot enforce anything, and it
   * failed this suite for the wrong reason - exactly the outcome the note above
   * warns about. A file that only *describes* the gate is not calling it.
   */
  const CALL = /emailVerificationRequired\s*\(\s*\)/;
  const stripComments = (src) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const gateCallers = [];
  const walk = (dir) => {
    for (const e of readdirDeep(dir)) {
      if (!e.endsWith(".ts") && !e.endsWith(".tsx")) continue;
      if (CALL.test(stripComments(readFileSync(e, "utf8")))) {
        gateCallers.push(relative(e).split("\\").join("/"));
      }
    }
  };
  walk(join(WEB, "src"));

  const offRoute = gateCallers.filter((f) => f !== "app/api/ai/route.ts");
  assert.deepEqual(
    offRoute,
    [],
    `only /api/ai may enforce verification, but these also call it: ${offRoute.join(", ")}`,
  );
  ok("no middleware, layout or other route enforces it — AI only, as intended");
}

/* ------------------------------------------------- 3. the shape checks --- */

console.log("\nthe pieces the flow depends on are in place");
{
  const schema = readPkg("packages", "db", "src", "schema", "auth.ts");
  assert.ok(
    /emailVerified:\s*boolean\("email_verified"\)/.test(schema),
    "user.emailVerified must exist on the schema",
  );
  ok('user table has emailVerified ("email_verified")');

  assert.ok(
    /pgTable\(\s*"verification"/.test(schema),
    "Better Auth writes verification tokens to a table called verification",
  );
  ok("the verification token table exists");

  const auth = readPkg("packages", "auth", "src", "index.ts");
  assert.ok(auth.includes("sendVerificationEmail:"), "verification needs a transport");
  ok("auth config supplies sendVerificationEmail");
  assert.ok(auth.includes("sendOnSignUp: true"), "the mail must go out at sign-up");
  ok("sendOnSignUp is on — the link is in flight before they close the tab");
  assert.ok(
    /autoSignInAfterVerification:\s*true/.test(auth),
    "clicking a link you just received should not require typing a password again",
  );
  ok("autoSignInAfterVerification is on");

  const sessionType = readPkg("packages", "auth", "src", "index.ts");
  assert.ok(
    !sessionType.includes("await db.query"),
    "reading emailVerified must not add a query to the hot path",
  );
  ok("emailVerified is read off the session — no extra query per tutor turn");
}

/* --------------------------------------- 4. the endpoint URLs are right -- */

console.log("\nthe MailTrap endpoints are the ones MailTrap actually serves");
{
  /*
   * These were BOTH wrong on first implementation, and the failure mode is
   * the worst kind available here: `sendMail` never throws, so a 404 is
   * logged and swallowed, and the only visible symptom is that verification
   * links silently never arrive. Nothing fails, no test fails, the dashboard
   * is green. Worth pinning with an assertion rather than a code review.
   */
  const mailRaw = readPkg("packages", "auth", "src", "mail.ts");

  /*
   * Comments are stripped before any URL assertion.
   *
   * This file documents the wrong endpoints in a long comment explaining why
   * they were wrong, and the first version of these checks failed on their
   * own changelog: `/api/v1/send` appears in the prose describing the mistake.
   * A check that reads a file's history instead of its behaviour is a check
   * that punishes documenting a bug, which is exactly backwards.
   *
   * Naive stripping is fine here. A `//` or a quoted URL inside the code would
   * have to contain "//" to be confused, and the regexes below tolerate that;
   * what this guards against is prose, not adversarial input.
   */
  const mail = mailRaw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

  assert.ok(
    mail.includes("https://sandbox.api.mailtrap.io/api/send"),
    "sandbox must use sandbox.api.mailtrap.io/api/send",
  );
  ok("sandbox endpoint is sandbox.api.mailtrap.io/api/send");

  assert.ok(
    mail.includes("https://send.api.mailtrap.io/api/send"),
    "live must use send.api.mailtrap.io/api/send",
  );
  ok("live endpoint is send.api.mailtrap.io/api/send");

  // `api.mailtrap.io` is the ACCOUNT-management REST API (domains, templates,
  // inboxes). It is not a sending endpoint and must never be used as one.
  assert.ok(
    !/fetch\(\s*["'`]https:\/\/api\.mailtrap\.io/.test(mail),
    "must not send through the account-management host",
  );
  ok("never sends via api.mailtrap.io (that host manages the account, not mail)");

  assert.ok(!/\/api\/v1\/send/.test(mail), "there is no /v1 path on the send endpoints");
  ok("no invented /v1 path segment");

  assert.ok(mail.includes("MAILTRAP_INBOX_ID"), "sandbox must read the inbox id it needs");
  ok("sandbox reads MAILTRAP_INBOX_ID");

  assert.ok(
    /sandbox\s*&&\s*!inboxId/.test(mail),
    "a missing inbox id must be named, not turned into a 404",
  );
  ok("a missing inbox id is reported by name, not as an opaque 404");

  // Sandbox does NOT require recipients to be registered. Asserting that claim
  // anywhere would send someone hunting for an allowlist that does not exist.
  assert.ok(
    !/only accepts recipients/i.test(mail),
    "sandbox does not require registered recipients — do not say it does",
  );
  ok("no false claim that sandbox requires registered recipients");

  /*
   * The payload SHAPE, which cost two 400s to find.
   *
   * `from` and `to` must BOTH be objects. Nearly every example in the wild
   * uses plain strings, because that is correct for SMTP and for most SDKs.
   * MailTrap's send endpoint rejects them:
   *
   *     invalid type for field `from`, expected: `object`, given: `string`
   *
   * and then `to` fails the same way once `from` is fixed. Both were found by
   * actually sending rather than by reading. With sendMail deliberately
   * swallowing failures, either would have presented as "verification links
   * silently never arrive" with a green dashboard and nothing to trace.
   */
  assert.ok(/from:\s*fromPayload/.test(mail), "`from` must be the parsed object");
  ok("`from` is sent as an object");

  assert.ok(/to:\s*toPayload/.test(mail), "`to` must be the parsed array of objects");
  ok("`to` is sent as an array of objects");

  assert.ok(
    !/\bto:\s*\[\s*args\.to\s*\]/.test(mail),
    "`to: [args.to]` is the string form MailTrap rejects",
  );
  ok("no bare-string `to` in the payload");

  assert.ok(
    !/JSON\.stringify\(\{[^}]*\bfrom,\s*to/.test(mail),
    "a payload sending the raw `from` string is the rejected form",
  );
  ok("no raw-string `from` in the payload");
}

/* --------------------------------------------- 5. the failure behaviour -- */

console.log("\na mail failure does not take sign-up down with it");
{
  const mail = readPkg("packages", "auth", "src", "mail.ts");
  // sendMail must not throw: it is called from inside Better Auth's
  // sendVerificationEmail, where a throw reports a FAILED REGISTRATION for
  // an account that in fact exists.
  assert.ok(!/^\s*throw\s/m.test(mail), "sendMail must not throw");
  ok("sendMail reports failure by return value, never by throwing");

  const auth = readPkg("packages", "auth", "src", "index.ts");
  const start = auth.indexOf("sendVerificationEmail: async");
  const body = auth.slice(start, start + 1400);
  assert.ok(!/\bthrow\b/.test(body), "the auth callback must not re-throw");
  ok("the sendVerificationEmail callback logs and swallows");
}

/* --------------------------- 6. the reader sees a sentence, not the JSON -- */

/*
 * Behavioural, not a regex over the source.
 *
 * Every other section here reads code, which can only prove a shape was
 * written down. `failureMessage` is a pure function, so the real thing is
 * lifted out of the .tsx and called — the only way to prove what the
 * reader is actually shown, which is the thing that was wrong.
 *
 * The bug it pins: a 403 from /api/ai reaches the SDK as a *string*, so the
 * refusal that the server had already written as a sentence arrived wearing
 * its JSON envelope and was rendered verbatim into the chat:
 *
 *   {"error":"Confirm your email address to use the tutor.",
 *    "code":"EMAIL_NOT_VERIFIED","email":"verify.test@example.com"}
 *
 * Everything the reader could act on was in there, buried under a field name
 * they have no reason to know. Caught by looking at the screen, not by any
 * assertion that existed beforehand.
 */
console.log("\nthe refusal reaches the reader as a sentence, not as JSON");
{
  const tutor = read("src", "app", "(app)", "ai", "ai-tutor.tsx");
  const start = tutor.indexOf("function failureMessage");
  assert.ok(start > 0, "failureMessage must exist in the tutor component");

  // `\r?\n` because this repo is CRLF: a literal "\n}\n" matches nothing in a
  // CRLF file, which would fail as "no closing brace" rather than as a real
  // problem with the function.
  const closing = /\r?\n}\r?\n/g;
  closing.lastIndex = start;
  const match = closing.exec(tutor);
  assert.ok(match, "failureMessage must have a closing brace to find");

  // Exactly the TS syntax this one function uses. Anything else left in is a
  // SyntaxError below, which fails loudly rather than passing quietly.
  const source = tutor
    .slice(start, match.index + match[0].length)
    .replace("function failureMessage(err: unknown): string {", "function failureMessage(err) {")
    .replace("const parsed: unknown =", "const parsed =")
    .replace("(parsed as { error?: unknown }).error", "parsed.error");

  let failureMessage;
  try {
    failureMessage = new Function(`${source}; return failureMessage;`)();
  } catch (e) {
    throw new Error(
      `could not load failureMessage to test it; its shape changed and this ` +
        `extractor needs updating (${e.message})`,
    );
  }
  assert.equal(typeof failureMessage, "function");
  ok("failureMessage was loaded from the real source and is callable");

  // The exact body /api/ai returns for the gate.
  const body = JSON.stringify({
    error: "Confirm your email address to use the tutor.",
    code: "EMAIL_NOT_VERIFIED",
    email: "verify.test@example.com",
  });

  assert.equal(
    failureMessage(new Error(body)),
    "Confirm your email address to use the tutor.",
    "the gate's refusal must read as the server's sentence",
  );
  ok("the EMAIL_NOT_VERIFIED refusal renders as a plain sentence");

  for (const leak of ["{", "}", '"', "code", "EMAIL_NOT_VERIFIED", "verify.test@example.com"]) {
    assert.ok(
      !failureMessage(new Error(body)).includes(leak),
      `the reader must not be shown ${leak}`,
    );
  }
  ok("no JSON punctuation, field name, code or address leaks to the reader");

  // The pre-existing behaviour must survive the change.
  assert.equal(
    failureMessage(new Error("The request timed out")),
    "That took too long and was stopped. Try a smaller question.",
    "the timeout sentence must survive",
  );
  ok("a timeout still gets the timeout sentence");

  assert.equal(
    failureMessage(new Error("An error occurred.")),
    "The tutor could not answer that. Try again.",
    "the SDK's generic mask must stay masked",
  );
  ok("the SDK's bare mask is still not shown to the reader");

  assert.equal(
    failureMessage(new Error("Upstream refused the connection.")),
    "Upstream refused the connection.",
    "a server-written sentence must pass through untouched",
  );
  ok("a plain server sentence passes through unchanged");

  // Unwrapping must not become a filter that swallows anything unparseable.
  assert.equal(
    failureMessage(new Error('{"detail":"nothing useful here"}')),
    '{"detail":"nothing useful here"}',
    "JSON with no `error` string must fall back to the raw text",
  );
  ok("JSON without an `error` field falls back to the raw text");

  // Trimmed, because the fallback path returns `trimmed`, not `text`. Asserted
  // explicitly so that trimming stays deliberate: it is what keeps stray
  // newlines out of a message bubble.
  assert.equal(
    failureMessage(new Error('{"broken": ')),
    '{"broken":',
    "malformed JSON must fall back to the raw text",
  );
  ok("malformed JSON falls back instead of throwing");

  assert.equal(
    failureMessage(new Error("  ")),
    "The tutor could not answer that. Try again.",
    "an empty message must still get the generic sentence",
  );
  ok("an empty message still gets the generic sentence");
}

/* --------------------------------------------------------------- runner -- */

function relative(full) {
  return full.slice(join(WEB, "src").length + 1);
}

console.log(`\n${passed} passed.`);
