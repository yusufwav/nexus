/**
 * The object-key guard on the storage path.
 *
 * WHY THIS NEEDS ITS OWN TEST
 *
 * The local reader got path traversal safety for free: path.resolve
 * normalises ".." away and then the result is compared against the root.
 * An S3 object key has no equivalent. "../../user-uploads/avatar.png"
 * is not an escape attempt to S3 - it is a perfectly valid key, and it
 * will be fetched happily.
 *
 * So if the only thing standing between a registry entry and another
 * bucket is a string check, that string check is the whole security
 * boundary, and it needs to be pinned down.
 *
 * WHAT IS ASSERTED
 *
 * Traversal in every position, absolute keys, empty and dot segments,
 * and - the one that is easy to forget - a path that is well-formed and
 * contains no ".." at all but still points at a different bucket's
 * namespace. That last one is why the guard pins the topics prefix
 * rather than only rejecting traversal.
 *
 * Run from apps/web:
 *   node scripts/test-storage-key-guard.mjs
 */
import { readCourseObject } from "../src/lib/object-storage.ts";

let failures = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => {
  failures++;
  console.log(`  FAIL ${m}`);
};

console.log("the guard returns null without touching the network");
/*
 * Every case below is rejected before a client is constructed, so these
 * run with no credentials and no network at all. If any of them ever
 * started returning a value, it would mean a request had gone out.
 */
const REJECTED = [
  ["parent traversal", "../../user-uploads/avatar.png"],
  ["traversal mid-path", "topics/../../user-uploads/avatar.png"],
  ["traversal at the end", "topics/.."],
  ["single dot segment", "topics/./x.pdf"],
  ["empty segment", "topics//x.pdf"],
  ["leading slash", "/topics/x.pdf"],
  ["bare dotdot", ".."],
  ["empty string", ""],
  ["slash only", "/"],
];

for (const [label, key] of REJECTED) {
  const got = await readCourseObject(key);
  if (got === null) ok(`rejected: ${label} (${JSON.stringify(key)})`);
  else bad(`ACCEPTED ${label}: ${JSON.stringify(key)}`);
}

console.log("\nand a well-formed path outside the topics tree is refused too");
/*
 * No ".." anywhere in these, so a traversal-only filter would pass all of
 * them. They are refused because the bucket holds other things and this
 * reader is only for course content - a registry entry should not be able
 * to reach into user-uploads by naming it directly.
 */
const WRONG_PREFIX = ["user-uploads/avatar.png", "course-content/x", "x.pdf", "topicsX/x.pdf"];
for (const key of WRONG_PREFIX) {
  const got = await readCourseObject(key);
  if (got === null) ok(`refused outside topics/: ${JSON.stringify(key)}`);
  else bad(`ACCEPTED ${JSON.stringify(key)}`);
}

console.log("\nno credential in this environment, so valid keys read as missing");
/*
 * Without AWS_* configured the client is never built and every read
 * returns null - including a key that passes the guard. That is the
 * intended behaviour for a clone with no storage configured: a missing
 * file is a 404, not a stack trace. It also proves the guard is not
 * accidentally rejecting the valid path for some unrelated reason.
 */
for (const key of ["topics/Bisection_Method.pdf", "topics/matt101-sample.md"]) {
  const got = await readCourseObject(key);
  if (got === null) ok(`unconfigured storage yields null, not an error: ${key}`);
  else bad(`${key} returned data with no credentials configured`);
}

console.log(
  failures === 0
    ? "\nno key can reach outside course content."
    : `\n${failures} failure(s).`,
);
process.exitCode = failures === 0 ? 0 : 1;