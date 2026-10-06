// One-off: is the configured key a real Google Generative AI key?
// Reads it from apps/web/.env and only ever prints the verdict.
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const key = envText.match(/^GOOGLE_GENERATIVE_AI_API_KEY=(.*)$/m)?.[1]?.trim();

if (!key) {
  console.log("no key set");
  process.exit(0);
}

console.log("prefix:", key.slice(0, 3) + "...");
console.log("length:", key.length);

const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + key;

try {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: "hi" }] }] }),
  });
  const text = await res.text();
  console.log("status:", res.status);
  console.log("body:", text.slice(0, 400));
} catch (err) {
  console.log("network error:", err.message);
}
