import { BUNDLES } from "@Main/db/module-catalog";

/**
 * PAYMENTS — STUB
 * ------------------------------------------------------------
 * Nothing here charges anyone. The interface below is the shape a
 * real integration drops into: implement `startCheckout`, return a
 * redirect URL, and let the provider's webhook flip the purchase row
 * to `paid`. Everything that touches money sits behind this file, so
 * that swap is one edit rather than a search across the pages.
 *
 * TODO: wire Paystack or Yoco. See IDEAS/TODO.md.
 */

export type CheckoutTarget =
  | { readonly kind: "module"; readonly code: string; readonly amountCents: number }
  | { readonly kind: "bundle"; readonly label: string; readonly amountCents: number };

export type CheckoutSession = {
  /** Where to send the browser to pay. Null until a provider exists. */
  readonly redirectUrl: null;
  /** Always true while stubbed — the UI renders this as "not wired up". */
  readonly stubbed: true;
};

/** The prices the product intends to charge, for quoting before checkout. */
export const PRICING = {
  single: BUNDLES.single.amountCents,
  bundle: BUNDLES.full.amountCents,
  bundleWas: BUNDLES.full.wasAmountCents,
} as const;

/**
 * Start a checkout.
 *
 * Currently returns a stub the UI refuses to act on. When Paystack or
 * Yoco is integrated this becomes the single place that creates the
 * `purchases` row with `status: "pending"` and calls the provider's
 * initialise/transaction endpoint.
 */
export async function startCheckout(_target: CheckoutTarget): Promise<CheckoutSession> {
  // No provider credentials exist yet. Rather than pretend, this tells
  // the caller the button is inert so the UI can say so plainly.
  return { redirectUrl: null, stubbed: true };
}