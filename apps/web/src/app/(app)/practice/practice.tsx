"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";

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
  /**
   * The page could not load the catalogue.
   *
   * Distinct from "there are no questions yet", which is a fact about the
   * content and this is a fact about the machine. Rendering the empty state
   * for a dead database tells the reader their module has no practice
   * questions when the truth is that nobody can be told anything right now.
   */
  readonly loadFailed: boolean;
};

const DIFFICULTY_WORDS = ["", "Foundation", "Working", "Stretch", "Hard"] as const;

export default function Practice({ modules, loadFailed }: Props): React.JSX.Element {

  const [session, setSession] = useState<ReadonlyArray<PublicQuestion> | null>(null);
  const [moduleCode, setModuleCode] = useState<string | null>(null);
  const [at, setAt] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<{ right: number; wrong: number }>({ right: 0, wrong: 0 });
  /**
   * What they got wrong, kept so the session can END on a review instead of
   * on the index.
   *
   * The first version threw the score away: `next()` on the last question
   * reset the session, and nothing ever rendered the tally. A reader who sat
   * through eight questions was told nothing about how they did, and the
   * questions they got wrong — the only part worth revisiting — were gone.
   *
   * This is the review, and it is the point of the format. A multiple-choice
   * question with a static explanation per option is only worth doing twice if
   * the second time is spent on the ones you missed.
   */
  const [missed, setMissed] = useState<
    ReadonlyArray<{ question: PublicQuestion; result: GradeResult }>
  >([]);
  const [finished, setFinished] = useState(false);

  /**
   * How many questions the module really has, when that is more than the
   * session was given.
   *
   * The route caps a session at 50. Without this the progress line reads
   * "3 of 50" and a reader who has answered all 50 has no way to know that 212
   * exist — the session looks like it covered the module when it was a slice
   * of it. Null means the session was not capped, which is the normal case
   * today at seven multiple-choice questions in the whole catalogue.
   */
  const [moreAvailable, setMoreAvailable] = useState<number | null>(null);

  /**
   * A ref, not state.
   *
   * `disabled={busy}` already stops a second click after React re-renders, but
   * two clicks inside one tick both read the stale `busy === false` and both
   * fire. The second response then lands last and can overwrite the first, so
   * a reader double-clicking a module can end up in the wrong one.
   */
  const starting = useRef(false);

  const current = session?.[at] ?? null;

  const start = useCallback(async (code: string): Promise<void> => {
    // The ref guards the window React's `busy` state cannot see: two clicks
    // landing in the same tick, before a re-render has disabled the button.
    if (starting.current) return;
    starting.current = true;
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
        /** How many the module actually has, when it is more than we sent. */
        available?: number;
        capped?: boolean;
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
      setMissed([]);
      setFinished(false);
      setMoreAvailable(data.capped === true ? data.available ?? null : null);
      if (data.skipped > 0) {
        console.warn(`${data.skipped} question(s) were skipped as unreadable`);
      }
    } catch {
      setError("Practice is temporarily unavailable. Try again shortly.");
    } finally {
      setBusy(false);
      starting.current = false;
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
      // Kept for the review at the end of the session. `current` is captured
      // from the closure, which is correct here because submit() is disabled
      // the moment `busy` is set.
      if (!graded.correct && current !== null) {
        setMissed((m) => [...m, { question: current, result: graded }]);
      }
    } catch {
      setError("That could not be marked. Try again.");
    } finally {
      setBusy(false);
    }
  }, [busy, chosen, current]);

  const next = useCallback((): void => {
    if (session === null) return;
    if (at + 1 >= session.length) {
      /*
       * END ON THE REVIEW, not on the index.
       *
       * This used to clear the session outright, which discarded the tally and
       * every missed question — a reader who had just answered eight questions
       * was shown nothing about how they had done. The questions they got wrong
       * are the only part of a practice session worth spending a second one on,
       * so throwing them away at the moment the session ended made the whole
       * format pointless.
       */
      setFinished(true);
      return;
    }
    setAt((n) => n + 1);
    setChosen(null);
    setResult(null);
  }, [at, session]);

  /**
   * Move past a question that cannot be marked.
   *
   * A malformed row makes the answer route return 503 forever. Ordering is
   * deterministic — `difficulty, id` — so the same question is at the same
   * index in every session, and without this the reader dead-ends at it every
   * time with the only escape being to quit and lose the whole session. The
   * serve route already skips malformed rows, so this is for the narrow window
   * where a row changes between serving and answering.
   *
   * A skipped question is not counted as wrong. It was never graded, so scoring
   * it would be inventing a result.
   */
  const skipCurrent = useCallback((): void => {
    setError(null);
    setChosen(null);
    setResult(null);
    if (session === null) return;
    if (at + 1 >= session.length) {
      setFinished(true);
      return;
    }
    setAt((n) => n + 1);
  }, [at, session]);

  /** Leave the review. `session` staying set is what lets "go again" work. */
  const closeSession = useCallback((): void => {
    setSession(null);
    setModuleCode(null);
    setAt(0);
    setChosen(null);
    setResult(null);
    setMissed([]);
    setFinished(false);
    setMoreAvailable(null);
    // `error` too. It used to survive the quit, so a reader who hit "that
    // could not be marked" on question 2 and then bailed saw the same message
    // on the module index — where no request had been made and nothing had
    // failed. An error that outlives the thing that caused it is a lie.
    setError(null);
  }, []);

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

        {loadFailed ? (
          <p className="nt-practice__error">
            Practice could not load just now. This is a problem with the site, not with your
            account — try again in a moment.
          </p>
        ) : modules.length === 0 ? (
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

  /* -- the review, at the end of a session -- */

if (finished && session !== null) {
    const total = score.right + score.wrong;
    return (
      <div className="nt-practice">
        <header className="nt-practice__bar">
          <button type="button" className="nt-practice__quit" onClick={closeSession}>
            ← all modules
          </button>
          <span className="nt-practice__progress">{moduleCode}</span>
        </header>

        <article className="nt-practice__card">
          <h1 className="nt-practice__review-title">
            {score.right} of {total} right
          </h1>
          <p className="nt-practice__review-sub">
            {missed.length === 0
              ? "Nothing to look at. Try a harder module, or one you have not seen."
              : `These ${missed.length} are the ones worth a second look.`}
          </p>

          {missed.map(({ question, result }) => (
            <section key={question.id} className="nt-practice__miss">
              <h2 className="nt-practice__miss-prompt">{question.prompt}</h2>
              <p className="nt-practice__miss-line nt-practice__miss-line--wrong">
                You chose: {result.chosenOptionText ?? "nothing"}
              </p>
              <p className="nt-practice__miss-line">{result.chosenExplanation}</p>
              <p className="nt-practice__miss-line nt-practice__miss-line--right">
                The answer: {result.correctOptionText}
              </p>
              {result.correctExplanation !== null && (
                <p className="nt-practice__miss-line">{result.correctExplanation}</p>
              )}
              <Link
                className="nt-practice__ask"
                href={`/ai?ask=${encodeURIComponent(
                  `I'm revising a practice question I got wrong: "${question.prompt}"\n` +
                    `I chose: ${result.chosenOptionText ?? "nothing"}\n` +
                    `I still don't understand why.`,
                )}`}
              >
                Ask the tutor about this one
              </Link>
            </section>
          ))}

          <footer className="nt-practice__actions">
            <button
              type="button"
              className="nt-practice__submit"
              onClick={() => {
                setAt(0);
                setChosen(null);
                setResult(null);
                setMissed([]);
                setScore({ right: 0, wrong: 0 });
                setFinished(false);
              }}
            >
              Go again
            </button>
            <button type="button" className="nt-practice__submit" onClick={closeSession}>
              All modules
            </button>
          </footer>
        </article>
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
        <button type="button" className="nt-practice__quit" onClick={closeSession}>
          ← {moduleCode}
        </button>
        <span className="nt-practice__progress">
          {at + 1} of {session.length}
          {/* Only when the session was actually capped. Silently showing 50 of
              212 as "50" is the same lie as the index count was. */}
          {moreAvailable !== null && <em> ({moreAvailable} in this module)</em>}
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

        {error !== null && (
          <>
            <p className="nt-practice__error">{error}</p>
            {/* Without this the session is stuck here, permanently, because the
                failure is deterministic. Offered only after an error, so it is
                never a way past a question the reader could have answered. */}
            <p className="nt-practice__error">
              <button type="button" className="nt-practice__skip" onClick={skipCurrent}>
                Skip this question
              </button>
            </p>
          </>
        )}

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

                THE TEXT DEPENDS ON THE VERDICT. It used to be a constant
                "I got this wrong… I don't understand why that's wrong",
                rendered whenever an answer had been given — including a
                CORRECT one. So a reader who got it right and wanted to
                understand it better arrived at the tutor asserting that their
                own correct answer was wrong, which is worse than no button:
                it teaches the tutor something false about their answer.
              */}
              <Link
                className="nt-practice__ask"
                href={`/ai?ask=${encodeURIComponent(
                  result?.correct === true
                    ? `I'm revising a practice question I got RIGHT and want to understand it better: "${current.prompt}"\n` +
                      `I chose: ${result?.chosenOptionText ?? "nothing"}\n` +
                      `I understand it's correct but not why.`
                    : `I'm practising and got this wrong: "${current.prompt}"\n` +
                      `I chose: ${result?.chosenOptionText ?? "nothing"}\n` +
                      `I don't understand why that's wrong.`,
                )}`}
              >
                {result?.correct === true
                  ? "Understand why — ask the tutor"
                  : "Still don't get it — ask the tutor"}
              </Link>
            </>
          )}
        </footer>
      </article>
    </div>
  );
}