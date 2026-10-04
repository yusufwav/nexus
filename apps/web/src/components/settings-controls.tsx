"use client";

import { useState } from "react";

/**
 * SETTINGS CONTROLS
 * ------------------------------------------------------------
 * PLACEHOLDERS. Every switch and field here is inert: they render,
 * they hold local state, and nothing is persisted. There is no
 * preferences table behind them and no endpoint to post to.
 *
 * They exist so the Settings page can be judged as a layout. Toggling
 * one and reloading shows it back off, which is the honest behaviour
 * for a control with nothing behind it.
 *
 * TODO: needs a user preferences table and a settings endpoint.
 * See IDEAS/TODO.md.
 */

/** A toggle that only remembers its own state. */
export function PlaceholderSwitch({
  label,
  description,
  defaultOn = false,
}: {
  readonly label: string;
  readonly description: string;
  readonly defaultOn?: boolean;
}): React.JSX.Element {
  const [on, setOn] = useState(defaultOn);

  return (
    <div className="nt-switch-row">
      <div className="nt-switch-text">
        <b>{label}</b>
        <span>{description}</span>
      </div>
      <button
        type="button"
        className="nt-switch"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => setOn((v) => !v)}
      />
    </div>
  );
}

/** A single-line field that keeps its own value and is never saved. */
export function PlaceholderField({
  id,
  label,
  hint,
  defaultValue,
  type = "text",
}: {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly defaultValue: string;
  readonly type?: string;
}): React.JSX.Element {
  const [value, setValue] = useState(defaultValue);
  const dirty = value !== defaultValue;

  return (
    <div className="nt-switch-row">
      <div className="nt-switch-text">
        <b>{label}</b>
        {hint !== undefined ? <span>{hint}</span> : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
        <input
          id={id}
          className="nt-input"
          type={type}
          value={value}
          style={{ width: "18rem" }}
          onChange={(e) => setValue(e.target.value)}
        />
        {/* Only appears once the value has diverged from what it was.
            A permanently visible save button would imply the change
            goes somewhere, and it does not. */}
        {dirty ? (
          <button
            type="button"
            className="nt-btn nt-btn--off"
            aria-disabled="true"
            onClick={() => setValue(defaultValue)}
          >
            reset
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** A row whose action is a dead control. */
export function PlaceholderAction({
  label,
  description,
  action,
  danger = false,
}: {
  readonly label: string;
  readonly description: string;
  readonly action: string;
  readonly danger?: boolean;
}): React.JSX.Element {
  return (
    <div className="nt-drow">
      <div>
        <div className="nt-drow__t" style={danger ? { color: "var(--danger)" } : undefined}>
          {label}
        </div>
        <div className="nt-drow__d">{description}</div>
      </div>
      <div className="nt-drow__actions">
        <span
          className="nt-btn nt-btn--off"
          aria-disabled="true"
          style={danger ? { color: "var(--danger)" } : undefined}
        >
          {action}
        </span>
      </div>
    </div>
  );
}