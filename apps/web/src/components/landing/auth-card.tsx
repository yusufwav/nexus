"use client";

import { useForm } from "@tanstack/react-form";
import type { Route } from "next";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { authClient } from "@/lib/auth-client";

import ThemeToggle from "@/components/theme-toggle";

import { PasswordField, PasswordMeter } from "./password-meter";

type Mode = "signin" | "signup";

/**
 * THE PITCH COLUMN
 * What "Nexus" is, standing beside the form. A student arriving from
 * a shared link has no idea what they are signing up for, and a bare
 * email box does nothing to convince them. This is the landing page's
 * argument, trimmed to the length of a login screen.
 */
const POINTS = [
  "First-year CS notes rewritten from the ground up — clearer structure, worked examples, intuition before formulas.",
  "A study partner that explains a topic like it is the first time you have heard it, not a search box returning a definition.",
  "R50 per module. The notes stay yours either way.",
] as const;

const STATS = [
  { value: "13", label: "modules" },
  { value: "R50", label: "per module" },
  { value: "1", label: "ready today" },
] as const;

/**
 * AUTH CARD
 * ------------------------------------------------------------
 * Sign-in and sign-up share one screen, one card, one form. The
 * logic is lifted from sign-in-form.tsx and sign-up-form.tsx — same
 * tanstack form, same zod rules, same authClient calls — with the
 * presentation redone around it.
 */
function AuthCardInner(): React.JSX.Element {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>("signup");
  const next = params.get("next");

  const isSignUp = mode === "signup";

  const form = useForm({
    defaultValues: { name: "", email: "", password: "" },
    onSubmit: async ({ value }) => {
      // Send them where they were headed before signing in, falling
      // back to the dashboard. typedRoutes makes router.push a checked
      // call, so an arbitrary ?next= string has to be narrowed — only
      // same-origin paths are followed, and a value that fails the
      // check falls back to the dashboard rather than being coerced.
      const fallback: Route = "/dashboard";
      const target: Route =
        next !== null && next.startsWith("/") && !next.startsWith("//")
          ? (next as Route)
          : fallback;

      if (isSignUp) {
        await authClient.signUp.email(
          { email: value.email, password: value.password, name: value.name },
          {
            onSuccess: () => {
              toast.success("Account created");
              router.push(target);
            },
            onError: (error) => {
              toast.error(error.error.message || error.error.statusText);
            },
          },
        );
        return;
      }

      await authClient.signIn.email(
        { email: value.email, password: value.password },
        {
          onSuccess: () => {
            toast.success("Signed in");
            router.push(target);
          },
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        },
      );
    },
    validators: {
      // name is only mounted in sign-up mode. In sign-in the field is
      // unmounted but its value stays "", so validating it would fail
      // the whole form and leave the submit button permanently disabled.
      onSubmit: z.object({
        name: isSignUp
          ? z.string().min(2, "Name must be at least 2 characters")
          : z.string(),
        email: z.email("Invalid email address"),
        password: z.string().min(8, "Password must be at least 8 characters"),
      }),
    },
  });

  const submitted = form.state.isSubmitted;

  /**
   * Errors only surface after a submit, so the form never scolds
   * anyone for a field they have not finished typing.
   *
   * tanstack keeps each field's errors on the field itself rather
   * than on the root state, so this reads off the Field render prop
   * and each field renders its own message inline.
   */
  const errText = (errors: ReadonlyArray<unknown>): string | undefined => {
    const first = errors[0];
    if (first === undefined) {
      return undefined;
    }
    return typeof first === "string" ? first : ((first as { message?: string }).message ?? undefined);
  };

  return (
    <>
      <div className="nt-auth__pitch">
        <Link className="nt-auth__mark" href="/">
          nexus<span className="nt-caret">_</span>
        </Link>

        {/* This screen sits outside the (app) shell so it gets no
            header either — without a toggle here, /login is a dead
            end for anyone who landed on it in the other palette. */}
        <div className="nt-auth__theme">
          <ThemeToggle />
        </div>

        <h1 className="nt-auth__title">
          Notes that learn you
          <br />
          as you learn them.
        </h1>
        <p className="nt-auth__lead">
          An account unlocks the full set of notes, the study partner, and your progress across
          every module.
        </p>

        <ul className="nt-auth__points">
          {POINTS.map((p) => (
            <li key={p}>
              <span>{p}</span>
            </li>
          ))}
        </ul>

        <div className="nt-auth__stat">
          {STATS.map((s) => (
            <div key={s.label}>
              <b>{s.value}</b>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="nt-auth__card nt-glass">
        <div className="nt-auth__tabs" role="tablist" aria-label="Sign in or create an account">
          <span
            className={`nt-auth__tab-glide${mode === "signin" ? " nt-auth__tab-glide--right" : ""}`}
            aria-hidden="true"
          />
          <button
            type="button"
            role="tab"
            className="nt-auth__tab"
            aria-selected={mode === "signup"}
            onClick={() => setMode("signup")}
          >
            create account
          </button>
          <button
            type="button"
            role="tab"
            className="nt-auth__tab"
            aria-selected={mode === "signin"}
            onClick={() => setMode("signin")}
          >
            sign in
          </button>
        </div>

        <h2 className="nt-auth__title-sm">
          {isSignUp ? "Create your account" : "Welcome back"}
        </h2>
        <p className="nt-auth__sub">
          {isSignUp
            ? "Free to make. Pay per module, only if you want one."
            : "Pick up where you left off."}
        </p>

        {/* Social sign-in is not implemented. The buttons are here so
            the screen shows the shape it will take. */}
        <div className="nt-social">
          <button type="button" className="nt-social__btn" disabled>
            <span className="nt-social__glyph" aria-hidden="true">
              G
            </span>
            google
          </button>
          <button type="button" className="nt-social__btn" disabled>
            <span className="nt-social__glyph" aria-hidden="true">
              GH
            </span>
            github
          </button>
        </div>
        <div className="nt-or">or with email</div>

        <form
          className="nt-auth__form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void form.handleSubmit();
          }}
        >
          {isSignUp ? (
            <form.Field name="name">
              {(field) => {
                const err = submitted ? errText(field.state.meta.errors) : undefined;
                return (
                  <div className="nt-field">
                    <label className="nt-label" htmlFor="name">
                      name
                    </label>
                    <input
                      id="name"
                      name="name"
                      className="nt-input"
                      value={field.state.value}
                      autoComplete="name"
                      placeholder="Thabo Nkosi"
                      aria-invalid={err !== undefined}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                    />
                    {err !== undefined ? <p className="nt-err">{err}</p> : null}
                  </div>
                );
              }}
            </form.Field>
          ) : null}

          <form.Field name="email">
            {(field) => {
              const err = submitted ? errText(field.state.meta.errors) : undefined;
              return (
                <div className="nt-field">
                  <label className="nt-label" htmlFor="email">
                    email
                  </label>
                  <input
                    id="email"
                    name="email"
                    className="nt-input"
                    type="email"
                    value={field.state.value}
                    autoComplete="email"
                    placeholder="you@nmu.ac.za"
                    aria-invalid={err !== undefined}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                  {err !== undefined ? <p className="nt-err">{err}</p> : null}
                </div>
              );
            }}
          </form.Field>

          <form.Field name="password">
            {(field) => {
              const err = submitted ? errText(field.state.meta.errors) : undefined;
              return (
                <div className="nt-field">
                  <label className="nt-label" htmlFor="password">
                    password
                    {!isSignUp ? <span className="nt-label__hint">forgot?</span> : null}
                  </label>
                  <PasswordField
                    id="password"
                    value={field.state.value}
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                    invalid={err !== undefined}
                    onBlur={field.handleBlur}
                    onChange={field.handleChange}
                  />
                  {isSignUp ? <PasswordMeter password={field.state.value} /> : null}
                  {err !== undefined ? <p className="nt-err">{err}</p> : null}
                </div>
              );
            }}
          </form.Field>

          <form.Subscribe
            selector={(state) => ({
              canSubmit: state.canSubmit,
              isSubmitting: state.isSubmitting,
            })}
          >
            {({ canSubmit, isSubmitting }) => (
              <button
                type="submit"
                className="nt-btn nt-auth__submit"
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting ? "working..." : isSignUp ? "create account" : "sign in"}
              </button>
            )}
          </form.Subscribe>
        </form>

        <div className="nt-auth__switch">
          {isSignUp ? (
            <p>
              already have an account?{" "}
              <button type="button" onClick={() => setMode("signin")}>
                sign in
              </button>
            </p>
          ) : (
            <p>
              no account yet?{" "}
              <button type="button" onClick={() => setMode("signup")}>
                create one
              </button>
            </p>
          )}
        </div>
      </div>
    </>
  );
}

/** useSearchParams needs a Suspense boundary to prerender. */
export default function AuthCard(): React.JSX.Element {
  return (
    <Suspense fallback={null}>
      <AuthCardInner />
    </Suspense>
  );
}