/**
 * TRIAL PDF
 * ------------------------------------------------------------
 * One constant, so the real sample swaps in by editing a single
 * line. Today it points at a placeholder file in /public that says
 * so on its first page — it is a genuine PDF, so the gated download
 * and the preview both work end to end.
 *
 * When a real sample exists, either replace the file at the same
 * path or change TRIAL_PDF_PATH and the entry in TRIAL_PDFS.
 *
 * TODO: write the real MATT101 sample. See IDEAS/TODO.md.
 */

/**
 * Served by /api/trial, which gates it behind a session.
 *
 * Deliberately NOT under /public. Next serves /public as static files
 * by URL, with no code of ours in the request path, so a PDF that
 * lives there is readable by anyone who guesses the name no matter
 * what the route handler checks. This one used to sit at
 * /public/sample-matt101.pdf and returned 200 to anonymous callers
 * while the route meant to protect it returned 401. It now lives in
 * private-assets/, which Next never serves.
 */
export const TRIAL_PDF_PATH = "/topics/matt101-sample.pdf";

/** Per-module samples, keyed by modules.code. Only MATT101 has one. */
export const TRIAL_PDFS: Readonly<
  Record<string, { path: string; label: string; size: string }>
> = {
  MATT101: {
    path: TRIAL_PDF_PATH,
    label: "MATT101 sample",
    size: "1 page",
  },
};