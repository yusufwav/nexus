"use client";

import { AlertTriangleIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

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
 */

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

  return (
    <label className="nt-ai__model">
      <span className="nt-ai__model-lbl">model</span>
      <select
        className="nt-ai__model-sel"
        value={`${pick.provider}|${pick.modelId}`}
        disabled={disabled}
        onChange={(e) => {
          const [provider, ...rest] = e.target.value.split("|");
          onPick({ provider, modelId: rest.join("|") });
        }}
      >
        <option value="server|">server default (gemini)</option>
        {models.map((m) => (
          <option key={m.id} value={`openrouter|${m.id}`}>
            {m.label}
          </option>
        ))}
      </select>
      {pick.provider === "openrouter" && !hasKey && (
        <span className="nt-ai__model-warn">
          <AlertTriangleIcon aria-hidden="true" />
          no key saved — add one in settings
        </span>
      )}
    </label>
  );
}