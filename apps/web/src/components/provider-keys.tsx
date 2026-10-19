"use client";

import { PlusIcon, RefreshCwIcon, Trash2Icon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Bring your own model key
 * ------------------------------------------------------------
 * The only place a credential is typed, and the only place it is held in
 * the DOM. It goes straight into a POST and is never stored in React
 * state, a localStorage, or anything that would survive the navigation
 * that unmounts this component — the input is cleared on success and on
 * failure alike, because a credential left sitting in a field is a
 * credential left sitting in a screenshot.
 *
 * WHAT THE SERVER SENDS BACK: a provider list, a model list, the
 * reader's own custom providers with their model catalogues, and for each
 * saved key its label, last four characters and model. Never the key
 * itself — `listProviderKeys` selects no credential column, so there is
 * nothing here to accidentally re-display.
 *
 * CUSTOM ROUTING, AND WHAT IT DOES NOT LET A READER DO
 * ------------------------------------------------------------
 * A reader can name an OpenAI-compatible endpoint, point the tutor at it
 * with their own key, pull the `:free` models it offers and add any the
 * pull cannot see. What they cannot do is make the server call something
 * they did not put there: the tutor re-checks the requested model against
 * this reader's own catalogue before it sends anything, so a crafted
 * request reaches nothing. The address is validated on the way in
 * (https, no credentials in the URL, every resolved address globally
 * routable) and re-checked at the moment of the call.
 *
 * The form is deliberately not a single "provider" dropdown with a
 * "custom" entry in it. Custom routing has three fields and a second
 * step, and cramming it into the same three-column row as the built-in
 * form made a 390px phone show it at about eleven characters per field.
 * It gets its own block, opened deliberately.
 */

type SavedKey = {
  readonly id: string;
  readonly provider: string;
  readonly kind: string;
  readonly name: string;
  readonly baseUrl: string | null;
  readonly label: string;
  readonly lastFour: string;
  readonly modelId: string;
};

type Available = {
  readonly provider: string;
  readonly label: string;
  readonly keyHint: string;
};

type FreeModel = {
  readonly id: string;
  readonly label: string;
};

type CustomModel = {
  readonly id: string;
  readonly label: string;
  readonly source: string;
};

type CustomProvider = {
  readonly provider: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly lastFour: string;
  readonly modelId: string;
  readonly models: ReadonlyArray<CustomModel>;
};

type Payload = {
  readonly keys: ReadonlyArray<SavedKey>;
  readonly available: ReadonlyArray<Available>;
  readonly models: ReadonlyArray<FreeModel>;
  readonly defaultModel: string;
  readonly catalogueLive: boolean;
  readonly catalogueNote: string | null;
  readonly custom: ReadonlyArray<CustomProvider>;
};

type Note = { kind: "ok" | "bad"; text: string } | null;

export default function ProviderKeys(): React.JSX.Element {
  const [data, setData] = useState<Payload | null>(null);
  const [provider, setProvider] = useState<string>("openrouter");
  const [apiKey, setApiKey] = useState("");
  const [modelId, setModelId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);

  // ---- the custom-routing form ----
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [customKey, setCustomKey] = useState("");
  // The provider whose catalogue is mid-operation, so the rest of the
  // page stays usable while one provider's list is being pulled.
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/keys", { cache: "no-store" });
      if (!res.ok) {
        setNote({ kind: "bad", text: "Could not load your keys." });
        return;
      }
      const body = (await res.json()) as Payload;
      setData(body);
      setProvider((p) => p || body.available[0]?.provider || "openrouter");
      setModelId((m) => m || body.defaultModel);
    } catch {
      setNote({ kind: "bad", text: "Could not load your keys." });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(): Promise<void> {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "builtin", provider, apiKey, modelId }),
      });
      const body = (await res.json()) as { error?: string; lastFour?: string };
      // Cleared on BOTH outcomes. A rejected key is still a secret, and
      // leaving it in the field for the reader to retype gives it a second
      // life in the DOM for no benefit.
      setApiKey("");
      if (!res.ok) {
        setNote({ kind: "bad", text: body.error ?? "Could not save that key." });
        return;
      }
      setNote({
        kind: "ok",
        text: `Saved. Your tutor will now answer using your own key (···${body.lastFour ?? ""}).`,
      });
      await load();
    } catch {
      setApiKey("");
      setNote({ kind: "bad", text: "Could not save that key." });
    } finally {
      setBusy(false);
    }
  }

  /**
   * Save a custom provider.
   *
   * The name is for the reader's eyes and nothing else - it goes into the
   * `name` column and is never used as an identifier, which is why the
   * server mints the slug. Sending it says so at the call site.
   */
  async function saveCustom(): Promise<void> {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "custom",
          name: customName,
          baseUrl: customUrl,
          apiKey: customKey,
        }),
      });
      const body = (await res.json()) as { error?: string; provider?: string };
      // Cleared on both outcomes — see save().
      setCustomKey("");
      if (!res.ok) {
        setNote({ kind: "bad", text: body.error ?? "Could not save that provider." });
        return;
      }
      setCustomName("");
      setCustomUrl("");
      setNote({
        kind: "ok",
        text: "Saved. Pull its free models, or add one by hand, then choose the one to use.",
      });
      await load();
    } catch {
      setCustomKey("");
      setNote({ kind: "bad", text: "Could not save that provider." });
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: string): Promise<void> {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/keys/${encodeURIComponent(p)}`, { method: "DELETE" });
      if (!res.ok) {
        setNote({ kind: "bad", text: "Could not remove that key." });
        return;
      }
      setNote({ kind: "ok", text: "Key removed. Your tutor is back on the server's model." });
      await load();
    } catch {
      setNote({ kind: "bad", text: "Could not remove that key." });
    } finally {
      setBusy(false);
    }
  }

  /** One catalogue action on one custom provider, then re-read everything. */
  async function catalogue(
    provider: string,
    body: Record<string, string>,
    method: "POST" | "DELETE" = "POST",
  ): Promise<void> {
    setWorking(provider);
    setNote(null);
    try {
      const res = await fetch(`/api/keys/${encodeURIComponent(provider)}/models`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const parsed = (await res.json().catch(() => ({}))) as {
        error?: string;
        found?: number;
        total?: number;
      };
      if (!res.ok) {
        setNote({ kind: "bad", text: parsed.error ?? "That did not work." });
        return;
      }
      if (method === "POST" && body.action === "refresh" && parsed.found !== undefined) {
        // The total is reported as well as the kept count on purpose: "3 of
        // 210" and "210 of 210" are different situations and the reader
        // cannot tell them apart from a bare list.
        setNote({
          kind: parsed.found > 0 ? "ok" : "bad",
          text:
            parsed.found > 0
              ? `Found ${parsed.found} free model${parsed.found === 1 ? "" : "s"} out of ${parsed.total ?? "?"} it offers.`
              : `None of the ${parsed.total ?? "?"} models it offers end in :free. Add one by hand if it is free anyway.`,
        });
      }
      await load();
    } catch {
      setNote({ kind: "bad", text: "That did not work." });
    } finally {
      setWorking(null);
    }
  }

  const hint = data?.available.find((p) => p.provider === provider)?.keyHint;
  const saved = data?.keys ?? [];
  const builtins = useMemo(() => saved.filter((k) => k.kind !== "custom"), [saved]);

  return (
    <div className="nt-keys">
      <p className="nt-keys__lead">
        Add your own model key and the tutor answers using <b>your</b> account instead of
        the server&apos;s — useful for testing, and for anyone who would rather pay for
        their own usage. Keys are encrypted before they are stored and are visible to
        you and nobody else.
      </p>

      {builtins.length > 0 && (
        <ul className="nt-keys__list">
          {builtins.map((k) => (
            <li key={k.id} className="nt-keys__row">
              <span className="nt-keys__provider">{k.provider}</span>
              <span className="nt-keys__tail">···{k.lastFour}</span>
              <span className="nt-keys__model">{k.modelId}</span>
              <button
                type="button"
                className="nt-btn nt-btn--ghost nt-btn--icon nt-keys__del"
                onClick={() => void remove(k.provider)}
                disabled={busy}
                aria-label={`Remove your ${k.provider} key`}
              >
                <Trash2Icon aria-hidden="true" />
                <span className="nt-sr-only">remove</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="nt-keys__form">
        <label className="nt-keys__field">
          <span>provider</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            disabled={busy}
          >
            {(data?.available ?? [{ provider: "openrouter", label: "OpenRouter", keyHint: "sk-or-v1-…" }]).map(
              (p) => (
                <option key={p.provider} value={p.provider}>
                  {p.label}
                </option>
              ),
            )}
          </select>
        </label>

        <label className="nt-keys__field">
          <span>api key {hint ? <i>({hint})</i> : null}</span>
          {/* type=password, and autoComplete off: a browser offering to
              save or autofill a credential field here would defeat the
              point of not storing one. */}
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="paste your key"
            disabled={busy}
          />
        </label>

        <label className="nt-keys__field">
          <span>model</span>
          <select
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            disabled={busy}
          >
            {(data?.models ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="nt-btn"
          onClick={() => void save()}
          disabled={busy || apiKey.trim().length < 8}
        >
          {busy ? "saving…" : "save key"}
        </button>
      </div>

      {/* ---- CUSTOM ROUTING ---- */}
      <div className="nt-keys__custom">
        <div className="nt-keys__customhead">
          <div>
            <h3 className="nt-keys__customtitle">custom routing</h3>
            <p className="nt-keys__customlead">
              Point the tutor at any OpenAI-compatible endpoint. Only you see the name you
              give it, and it is never used as an address.
            </p>
          </div>
          <button
            type="button"
            className="nt-btn nt-btn--ghost"
            onClick={() => setCustomOpen((o) => !o)}
            aria-expanded={customOpen}
          >
            {customOpen ? (
              <>
                <XIcon aria-hidden="true" /> close
              </>
            ) : (
              <>
                <PlusIcon aria-hidden="true" /> add a provider
              </>
            )}
          </button>
        </div>

        {customOpen && (
          <div className="nt-keys__form nt-keys__form--custom">
            <label className="nt-keys__field">
              <span>name <i>(only you see this)</i></span>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                autoComplete="off"
                maxLength={60}
                placeholder="my laptop"
                disabled={busy}
              />
            </label>

            <label className="nt-keys__field nt-keys__field--wide">
              {/* type=url, NOT type=text: it gives a phone its own keyboard
                  with a slash on it, which is the character every one of
                  these addresses needs and the one most likely to be
                  missing. */}
              <span>address <i>(OpenAI format, ends in /v1)</i></span>
              <input
                type="url"
                inputMode="url"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="https://api.openai.com/v1"
                disabled={busy}
              />
            </label>

            <label className="nt-keys__field">
              <span>api key</span>
              <input
                type="password"
                value={customKey}
                onChange={(e) => setCustomKey(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="paste your key"
                disabled={busy}
              />
            </label>

            <button
              type="button"
              className="nt-btn"
              onClick={() => void saveCustom()}
              disabled={
                busy ||
                customName.trim().length === 0 ||
                customUrl.trim().length === 0 ||
                customKey.trim().length < 8
              }
            >
              {busy ? "saving…" : "save provider"}
            </button>
          </div>
        )}

        {(data?.custom ?? []).map((c) => (
          <div key={c.provider} className="nt-keys__provider-card">
            <div className="nt-keys__row">
              <span className="nt-keys__provider">{c.name}</span>
              <span className="nt-keys__tail">···{c.lastFour}</span>
              <span className="nt-keys__model" title={c.baseUrl}>
                {c.baseUrl}
              </span>
              <button
                type="button"
                className="nt-btn nt-btn--ghost nt-btn--icon nt-keys__del"
                onClick={() => void remove(c.provider)}
                disabled={busy}
                aria-label={`Remove ${c.name}`}
              >
                <Trash2Icon aria-hidden="true" />
              </button>
            </div>

            <div className="nt-keys__providertools">
              <button
                type="button"
                className="nt-btn nt-btn--ghost nt-keys__small"
                onClick={() => void catalogue(c.provider, { action: "refresh" })}
                disabled={working === c.provider || busy}
              >
                <RefreshCwIcon aria-hidden="true" />
                {working === c.provider ? "pulling…" : "pull free models"}
              </button>

              <AddModel
                provider={c.provider}
                busy={busy || working === c.provider}
                onAdd={(modelId) => void catalogue(c.provider, { action: "add", modelId })}
              />
            </div>

            {c.models.length === 0 ? (
              <p className="nt-keys__note">
                No models yet. Pull the free ones, or add one by hand — a self-hosted
                endpoint usually has no <code>:free</code> suffix on anything.
              </p>
            ) : (
              <ul className="nt-keys__models">
                {c.models.map((m) => {
                  const on = m.id === c.modelId;
                  return (
                    <li key={m.id} className={`nt-keys__modelrow${on ? " is-on" : ""}`}>
                      <button
                        type="button"
                        className="nt-keys__modelpick"
                        onClick={() => void catalogue(c.provider, { action: "select", modelId: m.id })}
                        disabled={busy || working === c.provider}
                        aria-pressed={on}
                      >
                        <span className="nt-keys__modelname">{m.label}</span>
                        <span className="nt-keys__modelid">{m.id}</span>
                      </button>
                      {m.source === "custom" && (
                        <button
                          type="button"
                          className="nt-btn nt-btn--ghost nt-btn--icon nt-keys__del"
                          onClick={() =>
                            void catalogue(c.provider, { modelId: m.id }, "DELETE")
                          }
                          disabled={busy || working === c.provider}
                          aria-label={`Remove ${m.label} from this provider`}
                        >
                          <Trash2Icon aria-hidden="true" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </div>

      {note && (
        <p className={note.kind === "ok" ? "nt-keys__note" : "nt-keys__note nt-keys__note--bad"}>
          {note.text}
        </p>
      )}
    </div>
  );
}

/**
 * The "add a model by hand" control.
 *
 * Its own component so the input's value resets when the provider changes
 * and is cleared on submit, without that state living in the parent next
 * to four other fields that mean something else entirely.
 */
function AddModel({
  provider,
  busy,
  onAdd,
}: {
  readonly provider: string;
  readonly busy: boolean;
  readonly onAdd: (modelId: string) => void;
}): React.JSX.Element {
  const [value, setValue] = useState("");

  // A model typed against one provider must not be submitted against
  // another, so the field empties whenever the provider changes.
  useEffect(() => {
    setValue("");
  }, [provider]);

  return (
    <form
      className="nt-keys__addmodel"
      onSubmit={(e) => {
        e.preventDefault();
        const id = value.trim();
        if (id === "") return;
        onAdd(id);
        setValue("");
      }}
    >
      <label className="nt-sr-only" htmlFor={`nt-addmodel-${provider}`}>
        Add a model to this provider by its id
      </label>
      <input
        id={`nt-addmodel-${provider}`}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="or type a model id"
        disabled={busy}
      />
      <button type="submit" className="nt-btn nt-btn--ghost nt-keys__small" disabled={busy || value.trim() === ""}>
        add
      </button>
    </form>
  );
}