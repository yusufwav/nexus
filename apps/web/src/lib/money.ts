/**
 * MONEY
 * ------------------------------------------------------------
 * Prices are stored in cents and shown in rand. Formatting happens
 * in one place so the catalogue, the detail page, the bundle row
 * and the dashboard never disagree about what R50 looks like.
 */

/** 5000 -> "R50". Cents, because that is what the column holds. */
export function formatZar(cents: number): string {
  const rands = cents / 100;
  // Rand amounts in this product are always whole or half rand, so
  // trimming a trailing ".00" keeps the copy tight without losing
  // precision on anything that is not.
  const text = Number.isInteger(rands) ? String(rands) : rands.toFixed(2);
  return `R${text}`;
}

/** Format a Date for the dashboard's activity feed and receipts. */
export function formatWhen(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}