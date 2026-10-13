import "server-only";

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * PAID COURSE FILES, FROM NEON OBJECT STORAGE
 * ------------------------------------------------------------------------
 * The PDFs and reference markdown lived in apps/web/private-assets/,
 * which is gitignored. That is correct for their access control - Next
 * does not serve that directory, so the only way in is a route handler
 * that checks the session - but it means the files were never in the
 * repository, so the deployed site had no copy of any of them.
 *
 * They now live in the private `course-content` bucket on the production
 * branch, and this module reads them server-side.
 *
 * WHY THE BUCKET IS PRIVATE AND STAYS THAT WAY
 *
 * These are paid products. A private bucket means no credential is
 * enough to read one; an anonymous reader cannot fetch a PDF by guessing
 * a URL, which is exactly what happens when this content sits under
 * /public. Access is decided by the route handler, which checks the
 * session and the purchase before calling anything in this file.
 *
 * So the security boundary is unchanged - it moved from "a file Next
 * refuses to serve" to "a bucket that requires a credential" - and the
 * entitlement check in front of it is still what actually decides who
 * gets the bytes.
 *
 * WHY THE CREDENTIALS COME FROM process.env AND NOT FROM ENV
 *
 * The varlock object in ./env.server resolves the vars in .env.schema.
 * These are not in that schema, deliberately: they are issued by Neon
 * per branch and injected by the platform, so they are not something a
 * developer types into a file. Reading process.env directly is correct
 * here and is the same arrangement BETTER_AUTH_EXTRA_ORIGINS uses.
 *
 * WHEN THEY ARE ABSENT
 *
 * Absence is not an error. In development the files are on disk and this
 * module is never reached, and on a clone with no credentials configured
 * a missing file should read as a 404 rather than a stack trace. So the
 * client is simply not constructed and reads return null.
 */

const BUCKET = "course-content";

let warnedMissingCredentials = false;
let client: S3Client | null | undefined;

/**
 * The S3 client, or null when the storage credentials are not present.
 *
 * Built once per process and cached, including the null - so a missing
 * configuration does not re-read the environment on every request.
 */
function storageClient(): S3Client | null {
  if (client !== undefined) return client;

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const endpoint = process.env.AWS_ENDPOINT_URL_S3;

  if (!accessKeyId || !secretAccessKey || !endpoint) {
    if (!warnedMissingCredentials) {
      warnedMissingCredentials = true;
      console.warn(
        [
          "[storage] Neon object storage is not configured.",
          "  AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_ENDPOINT_URL_S3 are absent.",
          "  Files will be read from private-assets/ on disk only.",
          "  On a deployed site this means paid PDFs will 404 until these are set.",
        ].join("\n"),
      );
    }
    client = null;
    return client;
  }

  client = new S3Client({
    region: process.env.AWS_REGION ?? "us-east-1",
    // Neon speaks the S3 API but requires path-style addressing. Omitting
    // this produces bucket.host errors that look like a bad credential.
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
    endpoint,
  });
  return client;
}

/**
 * Reject a key that could reach outside the intended prefix.
 *
 * The local reader gets this from path.resolve, which normalises ".."
 * for it. An object key has no equivalent, so the string has to be
 * checked directly - otherwise a registry value like
 * "../../user-uploads/avatar.png" is a perfectly valid S3 key and would
 * be served to anyone who could pass the entitlement check.
 *
 * Rejects, rather than throws, so a bad registry entry reads as a missing
 * file and is indistinguishable from one outside.
 */
function safeKey(rel: string): string | null {
  const cleaned = rel.replace(/^\/+/, "");
  if (cleaned.length === 0) return null;

  // Split before checking, so a segment that is exactly ".." is caught
  // whether or not it sits at the start of the string.
  const segments = cleaned.split("/");
  if (segments.some((s) => s === ".." || s === ".")) return null;
  if (segments.some((s) => s.length === 0)) return null;

  // Only the topics tree is course content. Nothing else is readable here
  // even if a registry entry asked for it.
  if (segments[0] !== "topics") return null;

  return cleaned;
}

/**
 * Read one course file. Returns null when it is missing, when storage is
 * unconfigured, or when the key is not allowed.
 */
export async function readCourseObject(rel: string): Promise<ArrayBuffer | null> {
  const key = safeKey(rel);
  if (key === null) return null;

  const s3 = storageClient();
  if (s3 === null) return null;

  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    if (!res.Body) return null;
    const bytes = await res.Body.transformToByteArray();
    /*
     * Copied rather than handed over directly, for the same reason the
     * local reader does it: the Uint8Array can be a view into a larger
     * pooled buffer, so its buffer may be bigger than the object and
     * starting at zero would ship whatever else is in that memory. The
     * route handlers want an ArrayBuffer for BodyInit.
     *
     * There is no transformToArrayBuffer on this body type - the S3
     * client offers transformToByteArray, transformToString and
     * transformToWebStream - so the conversion is done here.
     */
    return bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
  } catch {
    // A missing key and a credentials problem are both "no bytes". The
    // caller turns both into a 404, and neither should surface a stack.
    return null;
  }
}

/** True when the deployment can read from storage at all. */
export function storageConfigured(): boolean {
  return storageClient() !== null;
}