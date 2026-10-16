"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import type { GradeResult, PublicQuestion } from "@/lib/practice-grading";

/**
 * THE PRACTICE SESSION
 * ------------------------------------------------------------
 * One question at a time, answered, explained, then the next. Deliberately not
 * a list: a reader who can see eight questions at once will pattern-match
 * across them, and a distractor only names a misconception if it was chosen
 * before its neighbours were visible.
 *
 * THE ANSWER NEVER ARRIVES WITH THE QUESTION.
 *
 * `PublicQuestion` has no `correct` flag and no explanations — the API strips
 * both, because the explanation for the right option explains why it is right.
 * So everything shown after submitting comes from the answer response, and the
 * reader's score is whatever the server said. There is no client-side
 * comparison to trust and nothing here that could be flipped in devtools.
 *
 * WHY THERE IS NO TIMER AND NO SCORE OUT OF TEN: neither teaches anything a
 * per-question explanation does not, and both add pressure to guess. The
 * progress indicator counts questions, not points, for the same reason.
 */
type ModuleEntry = { readonly code: string; readonly name: string; readonly count: number };

type Props = {
  readonly modules: ReadonlyArray<ModuleEntry>;
};

const DIFFICULTY_WORDS = ["", "Foundation", "Working", "Stretch", "Hard"] as const;

export default function Practice({ modules }: Props): React.JSX.Element {
  const router = useRouter();

  const [session, setSession] = useState<ReadonlyArray<PublicQuestion> | null>(null);
  const [moduleCode, setModuleCode] = useState<string | null>(null);
  const [at, setAt] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<{ right: number; wrong: number }>({ right: 0, wrong: 0 });

  const current = session?.[at] ?? null;

  const start = useCallback(async (code: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/practice/questions?module=${encodeURIComponent(code)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Could not load those questions.");
        return;
      }
      const data = (await res.json()) as {
        questions: PublicQuestion[];
        skipped: number;
      };
      if (data.questions.length === 0) {
        setError("There are no practice questions for that module yet.");
        return;
      }
      setSession(data.questions);
      setModuleCode(code);
      setAt(0);
      setChosen(null);
      setResult(null);
      setScore({ right: 0, wrong: 0 });
      if (data.skipped > 0) {
        console.warn(`${data.skipped} question(s) were skipped as unreadable`);
      }
    } catch {
      setError("Practice is temporarily unavailable. Try again shortly.");
    } finally {
      setBusy(false);
    }
  }, []);

  const submit = useCallback(async (): Promise<void> => {
    if (current === null || chosen === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/practice/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questionId: current.id, chosenOptionId: chosen }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "That could not be marked.");
        return;
      }
      const graded = (await res.json()) as GradeResult;
      setResult(graded);
      setScore((s) => ({
        right: s.right + (graded.correct ? 1 : 0),
        wrong: s.wrong + (graded.correct ? 0 : 1),
      }));
    } catch {
      setError("That could not be marked. Try again.");
    } finally {
      setBusy(false);
    }
  }, [busy, chosen, current]);

  const next = useCallback((): void => {
    if (session === null) return;
    if (at + 1 >= session.length) {
      setSession(null);
      setModuleCode(null);
      setAt(0);
      setChosen(null);
      setResult(null);
      return;
    }
    setAt((n) => n + 1);
    setChosen(null);
    setResult(null);
  }, [at, session]);

  /* -- the index -- */

  if (session === null) {
    return (
      <div className="nt-practice">
        <header className="nt-practice__head">
          <h1 className="nt-practice__title">Practice</h1>
          <p className="nt-practice__sub">
            Questions from the modules you have bought. Every option is explained, right or
            wrong — the wrong ones are the useful ones.
          </p>
        </header>

        {error !== null && <p className="nt-practice__error">{error}</p>}

        {modules.length === 0 ? (
          <p className="nt-practice__empty">
            No practice questions yet. They arrive with your module as they are written.
          </p>
        ) : (
          <ul className="nt-practice__modules">
            {modules.map((m) => (
              <li key={m.code}>
                <button
                  type="button"
                  className="nt-practice__module"
                  disabled={busy}
                  onClick={() => void start(m.code)}
                >
                  <span className="nt-practice__module-code">{m.code}</span>
                  <span className="nt-practice__module-name">{m.name}</span>
                  <span className="nt-practice__module-count">
                    {m.count} question{m.count === 1 ? "" : "s"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  /* -- a session -- */

  if (current === null) return <div className="nt-practice" />;

  const answered = result !== null;
  const isLast = at + 1 >= session.length;

  return (
    <div className="nt-practice">
      <header className="nt-practice__bar">
        <button
          type="button"
          className="nt-practice__quit"
          onClick={() => {
            setSession(null);
            setModuleCode(null);
            setChosen(null);
            setResult(null);
          }}
        >
          ← {moduleCode}
        </button>
        <span className="nt-practice__progress">
          {at + 1} of {session.length}
          <span className="nt-practice__tally">
            {score.right} right, {score.wrong} to look at
          </span>
        </span>
      </header>

      <article className="nt-practice__card">
        <p className="nt-practice__meta">
          {DIFFICULTY_WORDS[current.difficulty] ?? `Level ${current.difficulty}`}
          {current.tags.length > 0 && (
            <span className="nt-practice__tags">{current.tags.join(" · ")}</span>
          )}
        </p>

        {/* white-space: pre-wrap so an authored \n in a prompt renders as the
            line break the author intended. Prompts carry maths in plain
            text, and collapsing them onto one line would mangle them. */}
        <h2 className="nt-practice__prompt">{current.prompt}</h2>

        <ul className="nt-practice__options">
          {current.options.map((o) => {
            const isChosen = chosen === o.id;
            const isAnswer = answered && result?.correctOptionId === o.id;
            const state = !answered
              ? isChosen
                ? "picked"
                : ""
              : isAnswer
                ? "right"
                : isChosen
                  ? "wrong"
                  : "";
            return (
              <li key={o.id}>
                <button
                  type="button"
                  className={`nt-practice__option nt-practice__option--${state || "idle"}`}
                  disabled={answered || busy}
                  onClick={() => setChosen(o.id)}
                  aria-pressed={isChosen}
                >
                  {o.text}
                </button>
                {answered && (isAnswer || isChosen) && (
                  <p
                    className={`nt-practice__why nt-practice__why--${
                      isAnswer ? "right" : "wrong"
                    }`}
                  >
                    <strong>
                      {isAnswer
                        ? isChosen
                          ? "Correct."
                          : "This is the one."
                        : "Not this one."}
                    </strong>{" "}
                    {isAnswer
                      ? (result?.correctExplanation ?? result?.chosenExplanation)
                      : result?.chosenExplanation}
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        {error !== null && <p className="nt-practice__error">{error}</p>}

        <footer className="nt-practice__actions">
          {!answered ? (
            <button
              type="button"
              className="nt-practice__submit"
              disabled={chosen === null || busy}
              onClick={() => void submit()}
            >
              {busy ? "Marking…" : "Check answer"}
            </button>
          ) : (
            <>
              <button type="button" className="nt-practice__submit" onClick={next}>
                {isLast ? "Finish" : "Next question"}
              </button>
              {/*
                THE ESCAPE HATCH, and deliberately not an AI call.
                The explanations are authored, and some will not land. Rather
                than build a bespoke "explain this answer" endpoint — a second
                model path, a second set of prompts, a second thing to get
                wrong — the reader can take the question to the tutor they
                already have, with the question attached.
              */}
              <Link
                className="nt-practice__ask"
                href={`/ai?ask=${encodeURIComponent(
                  `I'm practising and got this wrong: "${current.prompt}"\n` +
                    `I chose: ${result?.chosenOptionText ?? "nothing"}\n` +
                    `I don't understand why that's wrong.`,
                )}`}
              >
                Still don't get it — ask the tutor
              </Link>
            </>
          )}
        </footer>
      </article>
    </div>
  );
}