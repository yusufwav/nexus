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
 * and the server re-validates it against its own list before it reaches
 * a provider. For a built-in that means the free-tool catalogue; for a
 * custom provider it means this reader's own model catalogue plus a
 * re-check that the host is still public. A crafted value cannot widen
 * what the server will call, and cannot reach a paid model — which is
 * what keeps a reader's card from being charged by a mistake here.
 *
 * When the server could not honour the pick, it says so through
 * `substituted`, and this shows the reason. Silence there would be the
 * worst possible outcome — the reader believes they are evaluating a
 * model and is actually evaluating ours.
 *
 * FAVOURITES, AND WHY THEY SHOW THE PROVIDER
 * ------------------------------------------------------------
 * Starred models sort to the top of the list, labelled `model ·
 * provider`. The provider is in the label because the list is no longer
 * one list: there is OpenRouter's free catalogue and there is a
 * catalogue per custom provider a reader has added, and "qwen 8b" is a
 * perfectly ordinary name to appear twice on the same screen. A
 * favourite list where two entries were indistinguishable would be worse
 * than no favourite list, because it looks like it saved you a
 * decision.
 *
 * WHY A HAND-BUILT LISTBOX AND NOT <select>
 * ------------------------------------------------------------
 * The native control was rendering as the platform's own dropdown: a
 * grey rounded box that ignored the palette entirely, and on a phone a
 * full-width sheet that covered the conversation. It also cannot show
 * two lines per option, which this needs — the friendly label
 * ("nemotron 3.5 lightning") is useless without the slug beside it
 * ("nvidia/nemotron-3.5-lightning:free") when picking between several
 * models from the same vendor, and it cannot group rows, which this now
 * needs too.
 *
 * What a native control gives for free, and what this therefore has to
 * earn back deliberately: keyboard navigation, Escape to dismiss, type-
 * ahead, focus return, and the screen-reader wiring. All of that is
 * implemented in `centered-select.tsx` rather than assumed, and the ARIA
 * roles are the standard listbox pattern so it announces as a listbox
 * rather than as a pile of buttons.
 */

import CenteredSelect, { type SelectOption } from "@/components/centered-select";
import { StarIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

export type ModelPick = {
  readonly provider: string;
  readonly modelId: string;
};

type FreeModel = { readonly id: string; readonly label: string };

type CustomModel = { readonly id: string; readonly label: string };

type CustomProvider = {
  readonly provider: string;
  readonly name: string;
  readonly models: ReadonlyArray<CustomModel>;
};

type CatalogueResponse = {
  readonly keys: ReadonlyArray<{ readonly provider: string; readonly modelId: string }>;
  readonly models: ReadonlyArray<FreeModel>;
  readonly defaultModel: string;
  readonly catalogueLive: boolean;
  readonly catalogueNote: string | null;
  readonly custom: ReadonlyArray<CustomProvider>;
};

const STORAGE_KEY = "nexus.tutor.model";
const FAVOURITES_KEY = "nexus.tutor.favourites";

/** "server" is a real option, not the absence of one. */
export const SERVER_PICK: ModelPick = { provider: "server", modelId: "" };

/**
 * The option value that stands for "use the server's model". Separate
 * from SERVER_PICK because CenteredSelect speaks in flat strings and
 * this is the encoding of that choice inside one.
 */
const SERVER_PICK_VALUE = "server|";

/** One flat string for a model, so a favourite outlives a list rebuild. */
function pickValue(provider: string, modelId: string): string {
  return `${provider}|${modelId}`;
}

function readFavourites(): readonly string[] {
  try {
    const raw = window.localStorage.getItem(FAVOURITES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Strings only, and deduplicated: this is a preference file that a
    // reader can and will edit by hand, and the only thing worse than a
    // malformed favourite is a renderer that throws on one.
    return [...new Set(parsed.filter((v): v is string => typeof v === "string"))];
  } catch {
    /* private browsing, or a file somebody edited. Not worth the chat. */
    return [];
  }
}

export function useModelPicker(): {
  pick: ModelPick;
  setPick: (p: ModelPick) => void;
  models: readonly FreeModel[];
  custom: readonly CustomProvider[];
  hasKey: boolean;
  ready: boolean;
  favourites: readonly string[];
  toggleFavourite: (value: string) => void;
} {
  const [pick, setPickState] = useState<ModelPick>(SERVER_PICK);
  const [models, setModels] = useState<readonly FreeModel[]>([]);
  const [custom, setCustom] = useState<readonly CustomProvider[]>([]);
  const [hasKey, setHasKey] = useState(false);
  const [ready, setReady] = useState(false);
  const [favourites, setFavourites] = useState<readonly string[]>([]);

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
    setFavourites(readFavourites());
    setRestored(true);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/keys", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as CatalogueResponse;
      setModels(body.models);
      setCustom(Array.isArray(body.custom) ? body.custom : []);
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

  /*
    Toggle, persist, and return the next list.

    Written off the previous state rather than as a `setState` callback so
    the value written to storage is provably the same one the screen will
    render. Reading localStorage back inside the updater would work on the
    first call and lose a toggle made in the same tick on the second.
  */
  const toggleFavourite = useCallback((value: string) => {
    setFavourites((prev) => {
      const next = prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value];
      try {
        window.localStorage.setItem(FAVOURITES_KEY, JSON.stringify(next));
      } catch {
        /* survivable; the star still works for this session */
      }
      return next;
    });
  }, []);

  return { pick, setPick, models, custom, hasKey, ready, favourites, toggleFavourite };
}

/** The visible control. Kept separate so the hook can own the fetching. */
export function ModelPicker(props: {
  pick: ModelPick;
  onPick: (p: ModelPick) => void;
  models: readonly FreeModel[];
  custom: readonly CustomProvider[];
  hasKey: boolean;
  disabled: boolean;
  favourites: readonly string[];
  onToggleFavourite: (value: string) => void;
}): React.JSX.Element {
  const {
    pick,
    onPick,
    models,
    custom,
    hasKey,
    disabled,
    favourites,
    onToggleFavourite,
  } = props;

  /*
    EVERY MODEL IN THE PICKER, KEYED BY ITS FLAT VALUE.

    Built once and looked up by the sections below rather than assembled
    three times over. A favourite, a provider list and a custom provider
    each need "what is this model called and which provider is it on",
    and three copies of that is three places for them to disagree — which
    shows up as a favourite whose label does not match the row it was
    starred from.
  */
  const known = useMemo(() => {
    const out = new Map<string, { label: string; providerName: string }>();
    for (const m of models) {
      out.set(pickValue("openrouter", m.id), { label: m.label, providerName: "OpenRouter" });
    }
    for (const p of custom) {
      for (const m of p.models) {
        out.set(pickValue(p.provider, m.id), { label: m.label, providerName: p.name });
      }
    }
    return out;
  }, [models, custom]);

  /*
    A FAVOURITE WHOSE MODEL NO LONGER EXISTS IS DROPPED FROM THE LIST,
    not rendered as a blank row.

    The most likely way one goes stale is the reader deletes a custom
    provider in Settings and the star is still in localStorage. Showing
    it would offer a model that cannot answer, and picking it would come
    back with a substitution notice — a worse experience than the
    favourite quietly not being there. The star itself survives in
    storage and comes back if the provider is added again.
  */
  const liveFavourites = useMemo(
    () => favourites.filter((v) => known.has(v)),
    [favourites, known],
  );

  const star = (value: string) => {
    const on = favourites.includes(value);
    return (
      <button
        type="button"
        /* The attribute is what stops the row's own mousedown from
           selecting the model as a side effect of starring it. */
        data-sel-action=""
        className={`nt-sel__star${on ? " is-on" : ""}`}
        onClick={() => onToggleFavourite(value)}
        aria-pressed={on}
        aria-label={on ? "Remove from favourites" : "Add to favourites"}
        title={on ? "Remove from favourites" : "Add to favourites"}
      >
        <StarIcon aria-hidden="true" />
      </button>
    );
  };

  const options: SelectOption[] = [];

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
  options.push({ value: SERVER_PICK_VALUE, label: "No model selected" });

  if (liveFavourites.length > 0) {
    for (const value of liveFavourites) {
      const info = known.get(value);
      if (!info) continue;
      options.push({
        value,
        // The provider is in the label because two providers can offer a
        // model with the same friendly name, and a favourite list where
        // you cannot tell them apart has saved nothing.
        label: `${info.label} · ${info.providerName}`,
        hint: value.slice(value.indexOf("|") + 1),
        group: "favourites",
        // The same `value` also appears in the provider's own section
        // below, which is what makes it un-starable from either place.
        // Two rows, one choice - so the row keys are told apart here.
        rowKey: `favourite:${value}`,
        trailing: star(value),
      });
    }
  }

  for (const m of models) {
    const value = pickValue("openrouter", m.id);
    options.push({
      value,
      label: m.label,
      hint: m.id,
      group: "openrouter · free",
      // Namespaced against the favourites copy of the same row. See
      // SelectOption.rowKey for why a value is not enough on its own.
      rowKey: `provider:${value}`,
      trailing: star(value),
    });
  }

  for (const p of custom) {
    // A provider with an empty catalogue gets no heading: an empty
    // section reads as "this provider has no models", which is a
    // settings problem, not something the picker should be explaining.
    if (p.models.length === 0) continue;
    for (const m of p.models) {
      const value = pickValue(p.provider, m.id);
      options.push({
        value,
        label: m.label,
        hint: m.id,
        group: p.name,
        rowKey: `provider:${value}`,
        trailing: star(value),
      });
    }
  }

  const value =
    pick.provider === "server" && pick.modelId === ""
      ? SERVER_PICK_VALUE
      : pickValue(pick.provider, pick.modelId);

  return (
    <CenteredSelect
      label="model"
      listLabel="Choose a model"
      value={value}
      disabled={disabled}
      // Searchable, because the list is no longer one provider's
      // fifteen free models. It is fifteen free models plus every model
      // on every endpoint this reader has added, and on a quiet day that
      // is already a list worth grepping.
      searchable
      searchPlaceholder="search models…"
      warning={pick.provider === "openrouter" && !hasKey ? "no key saved" : undefined}
      options={options}
      onChange={(v) => {
        const [provider, ...rest] = v.split("|");
        onPick({ provider, modelId: rest.join("|") });
      }}
    />
  );
}