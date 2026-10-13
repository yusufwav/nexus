import { readFile } from "node:fs/promises";
import path from "node:path";

import { readCourseObject } from "@/lib/object-storage";

/**
 * PRIVATE ASSETS
 * ------------------------------------------------------------
 * Anything a signed-in user may read but an anonymous visitor may
 * not. The important property is that these files are NOT under
 * /public: Next serves /public as static files by URL, so a PDF
 * living there is world-readable no matter what the route handler
 * says. The /api/trial gate was, until recently, decorative —
 * /sample-matt101.pdf returned 200 to anyone who asked for it
 * directly while the route it was meant to protect returned 401.
 *
 * These live in <repo>/apps/web/private-assets/, which Next does not
 * serve at all. The only way in is a route handler that checks the
 * session first.
 *
 * The path is resolved and re-checked after joining so that a name
 * from a registry can never climb out with "..", and the resolved
 * path must still sit inside the private root.
 *
 * ON A DEPLOYED SITE THERE IS NO DISK
 *
 * private-assets/ is gitignored, so the directory does not exist in a
 * build - it held paid PDFs that were never meant to be committed, and
 * that is still the right call. The consequence is that the deployed app
 * had no copy of any of them and every paid download 404'd.
 *
 * So a local miss now falls through to Neon object storage, where the
 * same files live in a private bucket on the production branch. Local
 * still wins when it can: in development the file is on disk and an
 * edit shows up without a round trip. The access control is unchanged
 * either way, because the gate is the route handler's session and
 * purchase check in both cases - the bucket is private too, so no
 * anonymous request can reach the bytes without passing it.
 */

/** Absolute path to the private asset root. */
function privateRoot(): string {
  return path.join(process.cwd(), "private-assets");
}

/**
 * Resolve a private asset by its registry path.
 *
 * Returns null — rather than throwing — when the file is missing or
 * the path escapes the root. A traversal attempt reads the same as
 * a file that does not exist, so the two are indistinguishable from
 * outside.
 */
export async function readPrivateAsset(rel: string): Promise<ArrayBuffer | null> {
  const root = privateRoot();

  // Cheap rejection before touching the filesystem.
  const cleaned = rel.replace(/^\/+/, "");
  if (cleaned.includes("..")) {
    return null;
  }

  // Real check after resolving, so a symlink or an encoded traversal
  // cannot slip past the string test above.
  const normalisedRoot = path.resolve(root);
  const full = path.resolve(normalisedRoot, cleaned);
  if (full !== normalisedRoot && !full.startsWith(normalisedRoot + path.sep)) {
    return null;
  }

  try {
    const buf = await readFile(full);
    // Returned as an ArrayBuffer rather than a Uint8Array: a
    // Uint8Array over a pooled Node buffer is not assignable to the
    // DOM BodyInit type, and these are the response bodies verbatim.
    return buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    ) as ArrayBuffer;
  } catch {
    return fromStorage(rel);
  }
}

/**
 * Read a course file from Neon object storage.
 *
 * Called only after the local read has failed, so local wins. That is the
 * right order for two reasons:
 *
 *   development
 *     The files are on disk, so this is never reached and a developer
 *     editing a PDF sees their edit without a round trip to storage.
 *
 *   production
 *     private-assets/ is gitignored, so the local read always fails and
 *     this is the only path that can succeed. Nothing is lost by trying
 *     the filesystem first.
 *
 * The entitlement check is not repeated here and must not be. Both
 * callers verify the session and the purchase before calling
 * readPrivateAsset; this function only decides where the bytes come
 * from, and adding a second gate would risk the two disagreeing.
 */
async function fromStorage(rel: string): Promise<ArrayBuffer | null> {
  return readCourseObject(rel);
}

/** Just the filename, for a Content-Disposition header. */
export function assetFilename(rel: string): string {
  return rel.split("/").pop() ?? "download.pdf";
}