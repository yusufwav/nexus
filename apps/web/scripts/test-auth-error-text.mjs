/**
 * Why auth failures showed an empty red box, and that they no longer do.
 *
 * THE BUG
 *
 * Every failed sign-in and sign-up called:
 *
 *   toast.error(error.error.message || error.error.statusText)
 *
 * The API returns, flat:
 *
 *   { "message": "Invalid email or password", "code": "INVALID_EMAIL_OR_PASSWORD" }
 *
 * `error.error` is the Response-shaped half of BetterAuthError
 * ({ status, statusText }), and on a 401 both are empty. So the expression
 * was `undefined || ""` and the toast rendered nothing. The payload was
 * correct the whole time — it was being read from the wrong depth.
 *
 * THE SHAPES THAT MATTER
 *
 * Captured by hitting the real endpoint, not by reading the type
 * definitions, because the definitions were the thing that misled the
 * original author. Each case below is a shape the function must survive:
 * the flat body, the body nested under `body` (what Better Auth produces
 * on some paths), the Response-shaped variant with nothing useful in it,
 * and a status-only error.
 *
 * Run from apps/web:
 *   node scripts/test-auth-error-text.mjs
 */
import { authErrorText } from "../src/lib/auth-error-text.ts";

let failures = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => {
  failures++;
  console.log(`  FAIL ${m}`);
};
const eq = (label, actual, expected) => {
  if (actual === expected) ok(`${label}`);
  else bad(`${label}\n          expected: ${expected}\n          actual:   ${actual}`);
};

console.log("the real 401 payload, flat");
eq(
  "reads the top-level message",
  authErrorText({ message: "Invalid email or password", code: "INVALID_EMAIL_OR_PASSWORD" }),
  "Invalid email or password",
);

console.log("\nthe same payload nested, which is what Better Auth throws");
eq(
  "digs into body",
  authErrorText({
    status: 401,
    statusText: "",
    body: { message: "Invalid email or password", code: "INVALID_EMAIL_OR_PASSWORD" },
  }),
  "Invalid email or password",
);
eq(
  "digs two levels, under body.error",
  authErrorText({ body: { error: { message: "Invalid email or password" } } }),
  "Invalid email or password",
);

console.log("\nthe exact shape the old code read - and why it rendered nothing");
const oldShape = { error: { message: undefined, statusText: "" }, status: 401 };
const nowText = authErrorText(oldShape);
if (nowText.trim().length > 0) ok(`old shape now yields text: "${nowText}"`);
else bad("old shape still yields an empty string");

console.log("\nstatus-only errors fall back to something actionable");
eq("401", authErrorText({ status: 401 }), "Invalid email or password.");
eq("429", authErrorText({ status: 429 }), "Too many attempts. Wait a minute and try again.");
eq("409", authErrorText({ status: 409 }), "An account with that email already exists. Try signing in instead.");
eq("500", authErrorText({ status: 500 }), "The server could not complete that request. Try again in a moment.");

console.log("\nnever empty, whatever it is handed");
for (const [label, input] of [
  ["undefined", undefined],
  ["null", null],
  ["empty object", {}],
  ["empty message", { message: "" }],
  ["whitespace message", { message: "   " }],
  ["empty string", ""],
  ["number", 42],
  ["no error field", { status: undefined, body: {} }],
]) {
  const text = authErrorText(input);
  if (typeof text === "string" && text.trim().length > 0) ok(`${label} -> "${text.slice(0, 48)}…"`);
  else bad(`${label} produced an empty message`);
}

console.log("\na bare string is passed through");
eq("string input", authErrorText("Email is required"), "Email is required");

console.log("\nsign-up's most likely real error is not a 401");
eq(
  "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
  authErrorText({ message: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" }),
  "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
);
eq(
  "but a message-less 409 still reads properly",
  authErrorText({ status: 409, code: "USER_ALREADY_EXISTS" }),
  "An account with that email already exists. Try signing in instead.",
);

console.log("\nno internal detail leaks from a server fault");
const serverFault = authErrorText({
  status: 500,
  message: "connect ECONNREFUSED 10.0.0.5:5432 password authentication failed",
});
if (/ECONNREFUSED|10\.0\.0\.5|password authentication/.test(serverFault)) {
  bad(`leaked server internals: ${serverFault}`);
} else {
  ok("a 500 with a raw driver message is not shown verbatim");
}

console.log(failures === 0 ? "\nauth errors always say something." : `\n${failures} failure(s).`);
process.exitCode = failures === 0 ? 0 : 1;