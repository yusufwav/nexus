"use client";

import CenteredSelect, { type SelectOption } from "@/components/centered-select";
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
  { value: "wrong", label: "something is wrong", hint: "a calculation or fact that does not hold up" },
  { value: "unclear", label: "something is unclear", hint: "correct, but hard to follow" },
  { value: "missing", label: "something is missing", hint: "a step or a definition that should be there" },
  { value: "typo", label: "typo or formatting", hint: "spelling, symbols, layout" },
  { value: "other", label: "other", hint: "anything the four above do not cover" },
] as const;

/**
 * Flattened for CenteredSelect. Kept as a separate constant rather than
 * mapping at render so the option list is a stable module-level value
 * and does not rebuild on every keystroke elsewhere in the form.
 */
const KIND_OPTIONS: readonly SelectOption[] = KINDS.map((k) => ({
  value: k.value,
  label: k.label,
  hint: k.hint,
}));

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
        {/*
          Was a native <select>, which rendered as the platform's own
          grey control in the middle of a themed form, and could not show
          a second line explaining what each kind means. It also sat
          directly under the email field, which is why it read as part of
          the email row rather than as its own control.

          CenteredSelect is the same component the model picker uses, so
          both behave identically and neither is a one-off.
        */}
        <CenteredSelect
          label="feedback type"
          listLabel="What kind of feedback"
          value={kind}
          onChange={setKind}
          options={KIND_OPTIONS}
        />
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