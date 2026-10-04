import { readFile } from "node:fs/promises";
import path from "node:path";

import { getSession } from "@/lib/session";
import { TRIAL_PDF_PATH } from "@/lib/trial-pdf";

/**
 * TRIAL PDF — auth gated
 * ------------------------------------------------------------
 * Serves the sample to signed-in users only. The file lives in
 * /public so Next will also serve it statically, but nothing links
 * to that path directly; this route is the intended way in.
 *
 * TODO: once the real samples exist, move them out of /public into
 * private storage so the static path is not the only thing standing
 * between the notes and anyone who guesses it. See IDEAS/TODO.md.
 */
export async function GET(): Promise<Response> {
  const user = await getSession();
  if (!user) {
    return new Response("Sign in to preview the sample.", {
      status: 401,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  try {
    const file = await readFile(
      path.join(process.cwd(), "public", TRIAL_PDF_PATH.replace(/^\//, "")),
    );
    return new Response(new Uint8Array(file), {
      headers: {
        "content-type": "application/pdf",
        // The sample is a preview, not the product — do not let a
        // shared proxy hold on to one user's copy.
        "cache-control": "private, no-store",
        "content-disposition": `inline; filename="${TRIAL_PDF_PATH.split("/").pop() ?? "sample.pdf"}"`,
      },
    });
  } catch {
    return new Response("Sample not available yet.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}