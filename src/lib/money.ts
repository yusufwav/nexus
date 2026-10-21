/**
 * MONEY
 * ---------------------------------------------------------------------------
 * PORTED FROM THE WEB APP — apps/web/src/lib/money.ts
 *
 * Prices are stored in cents and shown in rand. Formatting happens in one
 * place so the catalogue, the module page and the purchases list never
 * disagree about what R50 looks like.
 */

/** 5000 -> "R50". Cents, because that is what the column holds. */
export function formatZar(cents: number): string {
  const rands = cents / 100;
  // Rand amounts in this product are always whole or half rand, so trimming
  // a trailing ".00" keeps the copy tight without losing precision on
  // anything that is not.
  const text = Number.isInteger(rands) ? String(rands) : rands.toFixed(2);
  return `R${text}`;
}

/** Format a date for the activity feed and receipts. */
export function formatWhen(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  const month = d.toLocaleDateString("en-ZA", { month: "short" });
  return `${d.getDate()} ${month} ${d.getFullYear()}`;
}

/** "4 Mar", or "4 Mar 2025" when it is not this year. */
export function shortDate(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const month = then.toLocaleDateString("en-ZA", { month: "short" });
  const sameYear = then.getFullYear() === new Date().getFullYear();
  return sameYear
    ? `${then.getDate()} ${month}`
    : `${then.getDate()} ${month} ${then.getFullYear()}`;
}
