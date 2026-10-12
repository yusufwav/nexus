"use client";

import { Trash2Icon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

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
 * WHAT THE SERVER SENDS BACK: a provider list, a model list, and for
 * each saved key its label, last four characters and model. Never the
 * key itself — `listProviderKeys` selects no credential column, so there
 * is nothing here to accidentally re-display.
 */

type SavedKey = {
  readonly id: string;
  readonly provider: string;
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

type Payload = {
  readonly keys: ReadonlyArray<SavedKey>;
  readonly available: ReadonlyArray<Available>;
  readonly models: ReadonlyArray<FreeModel>;
  readonly defaultModel: string;
  readonly catalogueLive: boolean;
  readonly catalogueNote: string | null;
};

export default function ProviderKeys(): React.JSX.Element {
  const [data, setData] = useState<Payload | null>(null);
  const [provider, setProvider] = useState<string>("openrouter");
  const [apiKey, setApiKey] = useState("");
  const [modelId, setModelId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);

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
        body: JSON.stringify({ provider, apiKey, modelId }),
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

  const hint = data?.available.find((p) => p.provider === provider)?.keyHint;
  const saved = data?.keys ?? [];

  return (
    <div className="nt-keys">
      <p className="nt-keys__lead">
        Add your own model key and the tutor answers using <b>your</b> account instead of
        the server&apos;s — useful for testing, and for anyone who would rather pay for
        their own usage. Keys are encrypted before they are stored and are visible to
        you and nobody else.
      </p>

      {saved.length > 0 && (
        <ul className="nt-keys__list">
          {saved.map((k) => (
            <li key={k.id} className="nt-keys__row">
              <span className="nt-keys__provider">{k.provider}</span>
              <span className="nt-keys__tail">···{k.lastFour}</span>
              <span className="nt-keys__model">{k.modelId}</span>
              <button
                type="button"
                className="nt-btn nt-btn--ghost nt-keys__del"
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

      {note && (
        <p className={note.kind === "ok" ? "nt-keys__note" : "nt-keys__note nt-keys__note--bad"}>
          {note.text}
        </p>
      )}
    </div>
  );
}