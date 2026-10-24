/**
 * THE MODEL PICKER'S VALUES
 * ---------------------------------------------------------------------------
 * Two providers can offer the same model — a provider's own API and an
 * aggregator both list `gpt-4o` — so the value the picker carries has to
 * say WHICH provider it came from. Without that, the tick lands on two rows
 * at once and choosing a model cannot mean anything.
 *
 * The separator cannot appear in a provider id: those are generated, and
 * they are `pv_` followed by base 36. So the FIRST separator is the
 * provider's, and everything after it is the model's.
 */
import type { ModelInfo } from "@/lib/llm";

/** What separates the provider from the model in a picker's value. */
const SEPARATOR = "::";

/** A model, and the provider that offers it, as one value. */
export function modelValue(providerId: string, modelId: string): string {
  return `${providerId}${SEPARATOR}${modelId}`;
}

/** The two halves of a picker's value, or null if it is not one. */
export function splitModelValue(
  value: string,
): { readonly providerId: string; readonly modelId: string } | null {
  const at = value.indexOf(SEPARATOR);
  if (at === -1) return null;
  return {
    providerId: value.slice(0, at),
    modelId: value.slice(at + SEPARATOR.length),
  };
}

/**
 * One model's row in the picker.
 *
 * The detail line repeats the id, because a model whose label is a
 * prettified version of its id is easier to recognise by the id — and it
 * says whether the model is free, which is the thing the reader is usually
 * filtering for.
 */
export function modelOption(
  providerId: string,
  model: ModelInfo,
): {
  readonly value: string;
  readonly label: string;
  readonly detail: string;
} {
  return {
    value: modelValue(providerId, model.id),
    label: model.label,
    detail: model.free ? `${model.id}  \u00b7  free` : model.id,
  };
}
