/**
 * PROGRESS AND ATTEMPTS
 * ---------------------------------------------------------------------------
 * The web app kept these in Postgres:
 *
 *   · `practice_attempts` — every question the reader answered, with the
 *     option they chose and the outcome, so the weakness profile can rank
 *     the topics they keep getting wrong;
 *   · a read position per lesson, so "continue reading" can resume.
 *
 * On the phone they live in the same local SQLite database.
 */
import { newId } from "@/lib/ids";
import { getDatabase } from "@/storage/database";

export type Attempt = {
  readonly id: string;
  readonly questionId: string;
  readonly chosenOptionId: string;
  readonly outcome: "correct" | "incorrect";
  readonly explanation: string;
  readonly createdAt: string;
};

export type TopicStat = {
  readonly topicSlug: string;
  readonly right: number;
  readonly wrong: number;
};

export type ModuleStat = {
  readonly moduleCode: string;
  readonly right: number;
  readonly wrong: number;
  readonly attempts: number;
};

/** Record one graded answer. */
export async function recordAttempt(
  questionId: string,
  chosenOptionId: string,
  outcome: "correct" | "incorrect",
  explanation: string,
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO attempts (id, question_id, chosen_option_id, outcome, explanation, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      newId("att"),
      questionId,
      chosenOptionId,
      outcome,
      explanation,
      new Date().toISOString(),
    ],
  );
}

/** Every attempt, newest first. */
export async function listAttempts(): Promise<ReadonlyArray<Attempt>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    question_id: string;
    chosen_option_id: string;
    outcome: string;
    explanation: string;
    created_at: string;
  }>("SELECT * FROM attempts ORDER BY created_at DESC");
  return rows.map((r) => ({
    id: r.id,
    questionId: r.question_id,
    chosenOptionId: r.chosen_option_id,
    outcome: r.outcome as Attempt["outcome"],
    explanation: r.explanation,
    createdAt: r.created_at,
  }));
}

/** The overall right/wrong tally. */
export async function tallyAttempts(): Promise<{ right: number; wrong: number }> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ outcome: string; n: number }>(
    "SELECT outcome, COUNT(*) AS n FROM attempts GROUP BY outcome",
  );
  let right = 0;
  let wrong = 0;
  for (const row of rows) {
    if (row.outcome === "correct") right += row.n;
    else wrong += row.n;
  }
  return { right, wrong };
}

/** The per-module tally, for the weakness profile. */
export async function moduleStats(): Promise<ReadonlyArray<ModuleStat>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    module_code: string;
    right: number;
    wrong: number;
    attempts: number;
  }>(
    `SELECT q.module_code AS module_code,
            SUM(CASE WHEN a.outcome = 'correct' THEN 1 ELSE 0 END) AS right,
            SUM(CASE WHEN a.outcome = 'incorrect' THEN 1 ELSE 0 END) AS wrong,
            COUNT(*) AS attempts
       FROM attempts a
       JOIN questions q ON q.id = a.question_id
      GROUP BY q.module_code
      ORDER BY wrong DESC, attempts DESC`,
  );
  return rows.map((r) => ({
    moduleCode: r.module_code,
    right: r.right ?? 0,
    wrong: r.wrong ?? 0,
    attempts: r.attempts ?? 0,
  }));
}

/** The topics the reader is worst at, worst first. */
export async function weakTopics(limit = 3): Promise<ReadonlyArray<TopicStat>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ topic_slug: string; right: number; wrong: number }>(
    `SELECT q.topic_slug AS topic_slug,
            SUM(CASE WHEN a.outcome = 'correct' THEN 1 ELSE 0 END) AS right,
            SUM(CASE WHEN a.outcome = 'incorrect' THEN 1 ELSE 0 END) AS wrong
       FROM attempts a
       JOIN questions q ON q.id = a.question_id
      GROUP BY q.topic_slug
      HAVING wrong > 0
      ORDER BY wrong DESC, right ASC
      LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({
    topicSlug: r.topic_slug,
    right: r.right ?? 0,
    wrong: r.wrong ?? 0,
  }));
}

/** Mark a lesson as opened, so "continue reading" can find it. */
export async function touchLesson(moduleCode: string, lessonN: number): Promise<void> {
  const db = await getDatabase();
  const key = `${moduleCode}-${lessonN}`;
  await db.runAsync(
    `INSERT INTO read_positions (lesson_key, module_code, lesson_n, opened_at, completed)
     VALUES (?, ?, ?, ?, 0)
     ON CONFLICT(lesson_key) DO UPDATE SET opened_at = excluded.opened_at`,
    [key, moduleCode, lessonN, new Date().toISOString()],
  );
}

/** Mark a lesson as finished. */
export async function completeLesson(moduleCode: string, lessonN: number): Promise<void> {
  const db = await getDatabase();
  const key = `${moduleCode}-${lessonN}`;
  await db.runAsync(
    `INSERT INTO read_positions (lesson_key, module_code, lesson_n, opened_at, completed)
     VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(lesson_key) DO UPDATE SET completed = 1`,
    [key, moduleCode, lessonN, new Date().toISOString()],
  );
}

export type ReadPosition = {
  readonly moduleCode: string;
  readonly lessonN: number;
  readonly completed: boolean;
  readonly openedAt: string;
};

/** Every lesson the reader has opened, most recent first. */
export async function listReadPositions(): Promise<ReadonlyArray<ReadPosition>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    module_code: string;
    lesson_n: number;
    completed: number;
    opened_at: string;
  }>("SELECT * FROM read_positions ORDER BY opened_at DESC");
  return rows.map((r) => ({
    moduleCode: r.module_code,
    lessonN: r.lesson_n,
    completed: r.completed === 1,
    openedAt: r.opened_at,
  }));
}

/** How many lessons of a module have been completed. */
export async function completedLessonCount(moduleCode: string): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM read_positions WHERE module_code = ? AND completed = 1",
    [moduleCode],
  );
  return row?.n ?? 0;
}
