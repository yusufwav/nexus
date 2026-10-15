"use client";

/**
 * THE MODEL PICKER
 * ------------------------------------------------------------
 * Lets the reader choose which model answers, from inside the chat,
 * without leaving for settings.
 *
 * WHY IT LIVES HERE AND NOT ONLY IN SETTINGS: the whole reason to bring
 * your own key is to test a model, and a model that is interesting on
 * Tuesday is rate-limited on Wednesday. A picker in settings would mean
 * leaving the conversation, editing a form and coming back — which is
 * exactly the friction that makes someone give up and just trust the
 * server's model instead.
 *
 * THE CHOICE IS A HINT, NOT AN AUTHORITY. It travels in the request body
 * and the server re-validates it against its own allowlist before it
 * reaches a provider. A crafted value cannot widen what the server will
 * call, and cannot reach a paid model: the free catalogue is enforced
 * server-side, which is what keeps a reader's card from being charged
 * by a mistake here.
 *
 * When the server could not honour the pick, it says so through
 * `substituted`, and this shows the reason. Silence there would be the
 * worst possible outcome — the reader believes they are evaluating a
 * model and is actually evaluating ours.
 *
 * WHY A HAND-BUILT LISTBOX AND NOT <select>
 * ------------------------------------------------------------
 * The native control was rendering as the platform's own dropdown: a
 * grey rounded box that ignored the palette entirely, and on a phone a
 * full-width sheet that covered the conversation. It also cannot show
 * two lines per option, which this needs — the friendly label
 * ("nemotron 3.5 lightning") is useless without the slug beside it
 * ("nvidia/nemotron-3.5-lightning:free") when picking between several
 * models from the same vendor.
 *
 * What a native control gives for free, and what this therefore has to
 * earn back deliberately: keyboard navigation, Escape to dismiss, type-
 * ahead, focus return, and the screen-reader wiring. All of that is
 * implemented below rather than assumed, and the ARIA roles are the
 * standard listbox pattern so it announces as a listbox rather than as
 * a pile of buttons.
 */

import CenteredSelect, { type SelectOption } from "@/components/centered-select";
import { useCallback, useEffect, useState } from "react";

export type ModelPick = {
  readonly provider: string;
  readonly modelId: string;
};

type FreeModel = { readonly id: string; readonly label: string };

type CatalogueResponse = {
  readonly keys: ReadonlyArray<{ readonly provider: string; readonly modelId: string }>;
  readonly models: ReadonlyArray<FreeModel>;
  readonly defaultModel: string;
  readonly catalogueLive: boolean;
  readonly catalogueNote: string | null;
};

const STORAGE_KEY = "nexus.tutor.model";

/** "server" is a real option, not the absence of one. */
export const SERVER_PICK: ModelPick = { provider: "server", modelId: "" };

/**
 * The option value that stands for "use the server's model". Separate
 * from SERVER_PICK because CenteredSelect speaks in flat strings and
 * this is the encoding of that choice inside one.
 */
const SERVER_PICK_VALUE = "server|";

export function useModelPicker(): {
  pick: ModelPick;
  setPick: (p: ModelPick) => void;
  models: readonly FreeModel[];
  hasKey: boolean;
  ready: boolean;
} {
  const [pick, setPickState] = useState<ModelPick>(SERVER_PICK);
  const [models, setModels] = useState<readonly FreeModel[]>([]);
  const [hasKey, setHasKey] = useState(false);
  const [ready, setReady] = useState(false);

  // Restored on mount. Wrapped because localStorage throws in private
  // browsing and on some embedded webviews, and a settings preference
  // is never worth breaking the chat over.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ModelPick>;
        if (typeof parsed.provider === "string") {
          setPickState({
            provider: parsed.provider,
            modelId: typeof parsed.modelId === "string" ? parsed.modelId : "",
          });
        }
      }
    } catch {
      /* preference unavailable; the default is fine */
    }
    setRestored(true);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/keys", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as CatalogueResponse;
      setModels(body.models);
      const openrouter = body.keys.find((k) => k.provider === "openrouter");
      setHasKey(Boolean(openrouter));

      /*
       * DEFAULT TO THE READER'S OWN KEY, not to the server model.
       *
       * This picker sends an explicit choice on every request, so
       * defaulting it to "server" would silently retire bring-your-own-
       * key: the reader would have a perfectly good key saved, the
       * picker would read "server default", and their own account would
       * stop being used with nothing on screen saying so. Falling back
       * to the key they configured is also the truthful default — it is
       * what the app did before the picker existed.
       *
       * Only applied when there is no stored preference, so it never
       * overwrites a deliberate choice.
       */
      if (restored && openrouter && !window.localStorage.getItem(STORAGE_KEY)) {
        setPickState({ provider: "openrouter", modelId: openrouter.modelId });
      }
    } catch {
      /* the picker degrades to the server model; the chat still works */
    } finally {
      setReady(true);
    }
  }, [restored]);

  useEffect(() => {
    void load();
  }, [load]);

  const setPick = useCallback((p: ModelPick) => {
    setPickState(p);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch {
      /* not persisting is survivable; the chat still works */
    }
  }, []);

  return { pick, setPick, models, hasKey, ready };
}

/** The visible control. Kept separate so the hook can own the fetching. */
export function ModelPicker(props: {
  pick: ModelPick;
  onPick: (p: ModelPick) => void;
  models: readonly FreeModel[];
  hasKey: boolean;
  disabled: boolean;
}): React.JSX.Element {
  const { pick, onPick, models, hasKey, disabled } = props;

  // "No model selected" is a real option rather than the absence of one,
  // so it occupies the first slot in the same list every model follows.
  //
  // It was "Server default (gemini)", and the "(gemini)" was a lie the
  // moment the server default moved to OpenRouter — a label naming a
  // provider the server no longer uses is worse than no label, because
  // the reader picks a model on the strength of it. The behaviour is
  // unchanged and deliberate: picking this means "no explicit choice",
  // and `resolveTutorModel` then uses the reader's own key if they have
  // one and falls back to the server's model if they do not.
  const options: SelectOption[] = [
    { value: SERVER_PICK_VALUE, label: "No model selected" },
    ...models.map((m) => ({ value: `openrouter|${m.id}`, label: m.label, hint: m.id })),
  ];

  const value =
    pick.provider === "server" && pick.modelId === ""
      ? SERVER_PICK_VALUE
      : `${pick.provider}|${pick.modelId}`;

  return (
    <CenteredSelect
      label="model"
      listLabel="Choose a model"
      value={value}
      disabled={disabled}
      warning={pick.provider === "openrouter" && !hasKey ? "no key saved" : undefined}
      options={options}
      onChange={(v) => {
        const [provider, ...rest] = v.split("|");
        onPick({ provider, modelId: rest.join("|") });
      }}
    />
  );
}