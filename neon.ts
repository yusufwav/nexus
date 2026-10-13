import { defineConfig } from "@neon/config/v1";

/**
 * NEON INFRASTRUCTURE FOR THIS BRANCH
 * ------------------------------------------------------------------------
 * Postgres and object storage, declared together, so a branch is
 * reproducible rather than assembled by hand.
 *
 * WHY BUCKETS ARE DECLARED HERE AND NOT JUST CREATED
 *
 * Buckets are branch-scoped: each Neon branch has its own isolated
 * storage. Creating one by hand on the production branch leaves every
 * other branch without it, and the failure is silent until something
 * tries to read a file. Declaring them here means `neon checkout`
 * provisions them as it creates a branch, so a preview or CI branch
 * comes up with the same shape as production instead of discovering
 * the gap halfway through a test.
 *
 * BOTH BUCKETS ARE PRIVATE, AND NEITHER IS PUBLIC_READ
 *
 * `public_read` allows anonymous reads of everything in the bucket. It
 * is a bucket-wide switch with no per-object granularity, so the only
 * safe default before a specific feature needs it is private.
 *
 * THE SPLIT IS AN AI-TRUST BOUNDARY, NOT A FILE-TYPE ONE
 *
 * course-content holds the PDFs and the reference markdown the tutor
 * reads as tool-call context. user-uploads is the only place a reader
 * can ever cause a write.
 *
 * Keeping those apart makes "a reader can influence what the AI reads"
 * structurally impossible rather than a naming convention somebody has
 * to remember. If both lived in one bucket with prefixes, the boundary
 * would be a string in a key, and one upload path that got it wrong
 * would let a user write into the tutor's own context - a
 * prompt-injection channel with a storage backend behind it.
 *
 * So the rule is not "course files go in the course prefix". It is:
 * nothing a reader uploads may ever be written to course-content, by
 * any code path, ever.
 *
 * Avatars are the obvious candidate for public_read later. Worth
 * knowing before then: it would expose every object in user-uploads,
 * so it only becomes correct when that bucket holds nothing private.
 */
export default defineConfig({
  buckets: {
    // Paid reference material and the AI's own context. Never written by a reader.
    "course-content": {},
    // Reader-supplied files. The only bucket an upload path may target.
    "user-uploads": {},
  },
});