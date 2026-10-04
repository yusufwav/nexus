"use client";

import { useMemo, useState } from "react";

/**
 * PASSWORD FIELD + STRENGTH METER
 * ------------------------------------------------------------
 * Guidance for the person typing, not a security control. Better
 * Auth's own minimum (8 characters) is enforced by the form's zod
 * schema; this only nudges toward something stronger.
 *
 * Four signals, because any one alone gives a misleading reading —
 * length dominates, and variety on top of it is what actually helps.
 */

export type Strength = "weak" | "fair" | "good" | null;

export function scorePassword(pw: string): {
  strength: Strength;
  percent: number;
  label: string;
} {
  if (pw.length === 0) {
    return { strength: null, percent: 0, label: "" };
  }
  if (pw.length < 8) {
    return { strength: "weak", percent: 15, label: "too short" };
  }

  let score = 0;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 2) {
    return { strength: "weak", percent: 33, label: "weak" };
  }
  if (score <= 4) {
    return { strength: "fair", percent: 66, label: "fair" };
  }
  return { strength: "good", percent: 100, label: "strong" };
}

const FILL_CLASS = {
  weak: "nt-meter__fill--weak",
  fair: "nt-meter__fill--fair",
  good: "nt-meter__fill--good",
} as const;

export function PasswordMeter({
  password,
}: {
  readonly password: string;
}): React.JSX.Element | null {
  const { strength, percent, label } = useMemo(() => scorePassword(password), [password]);

  if (strength === null) {
    return null;
  }

  return (
    <div className="nt-field">
      <div className="nt-label">
        <span className="nt-label__hint">strength</span>
        <span className="nt-label__hint">{label}</span>
      </div>
      <div
        className="nt-meter"
        role="meter"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Password strength: ${label}`}
      >
        <div
          className={`nt-meter__fill ${FILL_CLASS[strength]}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/**
 * A password input with a show/hide toggle, shared by the sign-in and
 * sign-up forms so both get identical behaviour and a11y wiring.
 */
export function PasswordField({
  id,
  value,
  onChange,
  onBlur,
  placeholder,
  autoComplete,
  invalid,
}: {
  readonly id: string;
  readonly value: string;
  readonly onChange: (v: string) => void;
  readonly onBlur: () => void;
  readonly placeholder?: string;
  readonly autoComplete: string;
  readonly invalid?: boolean;
}): React.JSX.Element {
  const [shown, setShown] = useState(false);

  return (
    <div className="nt-input-wrap nt-input-wrap--action">
      <input
        id={id}
        name={id}
        className="nt-input"
        type={shown ? "text" : "password"}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={invalid === true}
        onBlur={onBlur}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="nt-input-action"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
      >
        {shown ? "hide" : "show"}
      </button>
    </div>
  );
}