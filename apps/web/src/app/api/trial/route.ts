import type { NextRequest } from "next/server";

import { assetFilename, readPrivateAsset } from "@/lib/private-assets";
import { getSession } from "@/lib/session";
import { TRIAL_PDF_PATH } from "@/lib/trial-pdf";

/**
 * TRIAL PDF — auth gated
 * ------------------------------------------------------------
 * Serves the sample to signed-in users only.
 *
 * The file lives in private-assets/, NOT in /public. That is the
 * whole point: Next serves /public by URL with no handler in the
 * request path, so while this file sat in /public the gate below was
 * decorative — /sample-matt101.pdf returned 200 to anonymous callers
 * even though this route correctly returned 401 to them. Moving it
 * out of /public is what makes this the only way in.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const user = await getSession();
  if (!user) {
    return new Response("Sign in to preview the sample.", {
      status: 401,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // Same gate, two verbs: the bare URL is embedded in the module
  // page's <iframe>, ?download=1 is what its button links to.
  const asDownload = req.nextUrl.searchParams.get("download") === "1";
  const filename = assetFilename(TRIAL_PDF_PATH);

  const file = await readPrivateAsset(TRIAL_PDF_PATH);
  if (file === null) {
    return new Response("Sample not available yet.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(file, {
    headers: {
      "content-type": "application/pdf",
      // The sample is a preview, not the product — do not let a
      // shared proxy hold on to one user's copy.
      "cache-control": "private, no-store",
      // The filename is only attached when the caller asked to
      // download. Chrome downloads *any* PDF that carries a
      // filename in this header, inline or not, which means an
      // `inline; filename=` here silently turns the preview
      // iframe into a download on page load.
      ...(asDownload ? { "content-disposition": `attachment; filename="${filename}"` } : {}),
    },
  });
}