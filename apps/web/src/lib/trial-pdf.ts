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

/** Served by /api/trial, which gates it behind a session. */
export const TRIAL_PDF_PATH = "/sample-matt101.pdf";

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