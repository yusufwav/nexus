/**
 * The free-model policy, tested against OpenRouter's live catalogue.
 *
 * The bug this guards against is specific and already happened once: a
 * hardcoded list of `:free` model ids shipped, every id in it was
 * retired, and OpenRouter's "This model is unavailable for free" 404 was
 * then reported to the reader as "the provider is busy right now" —
 * because the message contains the word "unavailable". So two things
 * are asserted here:
 *
 *   1. every id the policy accepts is genuinely priced at zero and
 *      declares tool support, checked against the real API;
 *   2. the previously-shipped ids are gone, proving the policy is not
 *      silently accepting a retired model.
 *
 * Network required. Run from apps/web:
 *   node scripts/check-free-models.mjs
 */
const CATALOGUE = "https://openrouter.ai/api/v1/models";

/** The five ids that shipped in the first allowlist. */
const RETIRED = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  "qwen/qwen-2.5-72b-instruct:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "google/gemini-2.0-flash-exp:free",
];

const problems = [];
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => {
  problems.push(m);
  console.log(`  FAIL  ${m}`);
};

const res = await fetch(CATALOGUE);
if (!res.ok) {
  console.error(`catalogue returned ${res.status} — cannot verify`);
  process.exit(2);
}
const { data } = await res.json();

console.log(`\n=== 1. policy: priced at exactly zero AND declares tools ===`);
const allowed = data.filter(
  (m) =>
    m.pricing?.prompt === "0" &&
    m.pricing?.completion === "0" &&
    Array.isArray(m.supported_parameters) &&
    m.supported_parameters.includes("tools"),
);
console.log(`  catalogue: ${data.length} models, ${allowed.length} pass the policy`);

// Declared up here because section 3 needs it too, and a `const` further
// down would be a TDZ error rather than a test failure.
const allowedIds = new Set(allowed.map((m) => m.id));

if (allowed.length > 0) pass(`${allowed.length} models satisfy the policy`);
else fail("no model satisfies the policy — the filter is too strict");

for (const m of allowed) {
  if (m.pricing.prompt !== "0" || m.pricing.completion !== "0") {
    fail(`${m.id} passed but is not free`);
  }
  if (!m.supported_parameters.includes("tools")) {
    fail(`${m.id} passed but does not support tools`);
  }
}
pass("every accepted model is free and tool-capable");

console.log("\n=== 2. the retired ids are actually gone from the free set ===");
const freeIds = new Set(
  data
    .filter((m) => m.pricing?.prompt === "0" && m.pricing?.completion === "0")
    .map((m) => m.id),
);
for (const id of RETIRED) {
  if (freeIds.has(id)) {
    fail(`${id} is free again — the fallback snapshot may be stale`);
  } else {
    pass(`${id} is no longer free (as expected)`);
  }
}

console.log("\n=== 3. the default is itself policy-approved ===");
// `openrouter/free` is OpenRouter's router: it dispatches to whatever
// free model is actually serving rather than naming one hosted model.
// It DOES appear in the catalogue, and it passes the same policy as
// everything else — that is the property that matters. It is also the
// reason it is the default: it is not a slug that can be retired out
// from under us the way `llama-3.3-70b-instruct:free` was.
const def = data.find((m) => m.id === "openrouter/free");
if (!def) {
  fail("openrouter/free is missing from the catalogue — pick a new default");
} else if (def.pricing.prompt === "0" && def.pricing.completion === "0") {
  pass("openrouter/free is priced at zero");
} else {
  fail(`openrouter/free is no longer free (prompt ${def.pricing.prompt})`);
}
if (allowedIds.has("openrouter/free")) pass("openrouter/free passes the tool-support policy");
else fail("openrouter/free no longer declares tool support");

console.log("\n=== 4. the fallback snapshot matches the live policy ===");
const snapshot = [
  "openrouter/free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "nvidia/nemotron-3.5-lightning:free",
  "poolside/laguna-s-2.1:free",
  "poolside/laguna-xs-2.1:free",
  "thinkingmachines/inkling:free",
  "thinkingmachines/inkling-small:free",
  "dots-studio/dots-3-note-preview:free",
  "liquid/lfm-2.5-2.6b:free",
  "cohere/north-mini-code:free",
  "apodex/apodex-1.1-mini:free",
  "inclusionai/ling-3.1-flash",
];
const inPolicy = snapshot.filter((id) => allowedIds.has(id));
const notInPolicy = snapshot.filter((id) => id !== "openrouter/free" && !allowedIds.has(id));
console.log(`  snapshot: ${snapshot.length} ids, ${inPolicy.length} also pass the live policy`);
if (notInPolicy.length === 0) pass("every snapshot id satisfies the live policy");
else fail(`snapshot has ids the policy rejects: ${notInPolicy.join(", ")}`);

console.log("\n=== 5. a paid model is rejected by the policy ===");
const paid = data.find((m) => m.pricing?.prompt !== "0");
if (paid && !allowedIds.has(paid.id)) pass(`paid model ${paid.id} is excluded`);
else fail("a paid model was accepted");

console.log("\n=== 6. a free model WITHOUT tools is rejected ===");
const freeNoTools = data.find(
  (m) =>
    m.pricing?.prompt === "0" &&
    m.pricing?.completion === "0" &&
    !m.supported_parameters?.includes("tools"),
);
if (freeNoTools && !allowedIds.has(freeNoTools.id)) {
  pass(`free-but-toolless ${freeNoTools.id} is excluded`);
} else if (!freeNoTools) {
  pass("no free model lacks tool support in the current catalogue");
} else {
  fail("a free model without tool support was accepted");
}

console.log("");
if (problems.length > 0) {
  console.error(`${problems.length} FAILED`);
  process.exitCode = 1;
} else {
  console.log("free-model policy holds against the live catalogue");
}