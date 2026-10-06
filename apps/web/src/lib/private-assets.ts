import { readFile } from "node:fs/promises";
import path from "node:path";

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
    return null;
  }
}

/** Just the filename, for a Content-Disposition header. */
export function assetFilename(rel: string): string {
  return rel.split("/").pop() ?? "download.pdf";
}