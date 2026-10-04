"use client";

import { useState } from "react";

/**
 * IMPROVEMENT REQUEST
 * ------------------------------------------------------------
 * PLACEHOLDER — this form has no backend. It validates and shows the
 * confirmation state so the interaction can be judged, but nothing is
 * sent anywhere and nothing is stored. The confirmation is local
 * component state, not a server response.
 *
 * TODO: needs a destination address and a provider (Resend or plain
 * SMTP) before this means anything. See IDEAS/TODO.md.
 */

const KINDS = [
  { value: "wrong", label: "something is wrong" },
  { value: "unclear", label: "something is unclear" },
  { value: "missing", label: "something is missing" },
  { value: "typo", label: "typo or formatting" },
  { value: "other", label: "other" },
] as const;

export default function ImprovementForm(): React.JSX.Element {
  const [sent, setSent] = useState(false);
  const [kind, setKind] = useState<string>("wrong");
  const [module, setModule] = useState("");
  const [email, setEmail] = useState("");
  const [detail, setDetail] = useState("");

  if (sent) {
    return (
      <div className="nt-imp">
        <div className="nt-imp__sent">
          <span aria-hidden="true">&gt;_</span>
          <span>Thanks — though this went nowhere yet, because the form has no backend.</span>
        </div>
        <p className="nt-note">
          The layout and the confirmation are real; the send is not. Tracked in IDEAS/TODO.md.
        </p>
        <div>
          <button type="button" className="nt-btn nt-btn--ghost" onClick={() => setSent(false)}>
            write another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="nt-imp"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        // Placeholder: the confirmation above is local state only.
        setSent(true);
      }}
    >
      <div className="nt-imp__row">
        <div className="nt-field">
          <label className="nt-label" htmlFor="imp-module">
            which module
          </label>
          <input
            id="imp-module"
            className="nt-input"
            value={module}
            placeholder="MATT101"
            onChange={(e) => setModule(e.target.value)}
          />
        </div>

        <div className="nt-field">
          <label className="nt-label" htmlFor="imp-email">
            your email
          </label>
          <input
            id="imp-email"
            className="nt-input"
            type="email"
            value={email}
            placeholder="you@nmu.ac.za"
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>

      <div className="nt-field">
        <label className="nt-label" htmlFor="imp-kind">
          what kind of feedback
        </label>
        <select
          id="imp-kind"
          className="nt-input"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </div>

      <div className="nt-field">
        <label className="nt-label" htmlFor="imp-detail">
          what should change
          <span className="nt-label__hint">be specific — a section number helps</span>
        </label>
        <textarea
          id="imp-detail"
          className="nt-input"
          rows={5}
          value={detail}
          placeholder="The worked example on the chain rule jumps from f(g(x)) straight to the answer. Could it show the substitution step?"
          onChange={(e) => setDetail(e.target.value)}
        />
      </div>

      <div
        style={{
          display: "flex",
          gap: "var(--sp-3)",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button type="submit" className="nt-btn">
          send it
        </button>
        <p className="nt-note" style={{ flex: 1, minWidth: "14rem" }}>
          Placeholder — nothing is sent yet.
        </p>
      </div>
    </form>
  );
}