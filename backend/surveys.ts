import type { Answers, Question, Survey } from "../shared/types.ts";
import {
  canonicalizeChoiceSelection,
  isMatrixAnswer,
  normalizeStoredQuestions,
} from "../shared/questions.ts";
import { ensureSchema, randomId, sha256, sqlite } from "./db.ts";
import { RequestError } from "./errors.ts";

function rowToSurvey(r: Record<string, unknown>): Survey {
  return {
    id: String(r.id),
    slug: String(r.slug),
    title: String(r.title),
    description: String(r.description ?? ""),
    resultsVisible: Number(r.results_visible) === 1,
    acceptingResponses: Number(r.accepting_responses) === 1,
    audienceFacets: Number(r.audience_facets) === 1,
    createdAt: String(r.created_at),
    questions: normalizeStoredQuestions(
      JSON.parse(String(r.questions_json ?? "[]")),
    ),
  };
}

export function publicSurvey(survey: Survey): Survey {
  return {
    ...survey,
    questions: survey.questions
      .filter((question) => question.released)
      .map((question, position) => ({ ...question, position })),
  };
}

export function filterAnswers(
  answers: Answers | null,
  questions: Question[],
): Answers | null {
  if (!answers) return null;
  const visible = new Set(questions.map((question) => question.id));
  return Object.fromEntries(
    Object.entries(answers).filter(([questionId]) => visible.has(questionId)),
  );
}

export function mergeReleasedAnswers(
  existing: Answers | null,
  releasedQuestions: Question[],
  incoming: Answers,
): Answers {
  const merged = { ...(existing ?? {}) };
  for (const question of releasedQuestions) delete merged[question.id];
  return { ...merged, ...incoming };
}

export async function createSurvey(
  title: string,
): Promise<{ survey: Survey; adminKey: string }> {
  await ensureSchema();
  const id = randomId(12);
  const slug = randomId(6);
  const adminKey = randomId(28);
  const hash = await sha256(adminKey);
  await sqlite.execute({
    sql:
      `INSERT INTO surveys (id, slug, admin_key_hash, title) VALUES (?, ?, ?, ?)`,
    args: [id, slug, hash, title || "Untitled survey"],
  });
  const survey = await getSurveyBySlug(slug);
  return { survey: survey!, adminKey };
}

export async function getSurveyBySlug(slug: string): Promise<Survey | null> {
  await ensureSchema();
  const r = await sqlite.execute({
    sql: `SELECT * FROM surveys WHERE slug = ?`,
    args: [slug],
  });
  return r.rows[0] ? rowToSurvey(r.rows[0] as Record<string, unknown>) : null;
}

export async function getSurveyByAdminKey(
  adminKey: string,
): Promise<Survey | null> {
  await ensureSchema();
  const hash = await sha256(adminKey);
  const r = await sqlite.execute({
    sql: `SELECT * FROM surveys WHERE admin_key_hash = ?`,
    args: [hash],
  });
  return r.rows[0] ? rowToSurvey(r.rows[0] as Record<string, unknown>) : null;
}

export interface SurveyPatch {
  title?: string;
  description?: string;
  resultsVisible?: boolean;
  acceptingResponses?: boolean;
  audienceFacets?: boolean;
  questions?: Question[];
  expectedQuestions?: Question[];
}

export async function updateSurvey(
  id: string,
  patch: SurveyPatch,
): Promise<Survey | undefined> {
  await ensureSchema();
  const sets: string[] = [];
  const args: (string | number)[] = [];
  let expectedPersistedQuestions: string | undefined;
  if (patch.title !== undefined) sets.push("title = ?"), args.push(patch.title);
  if (patch.description !== undefined) {
    sets.push("description = ?"), args.push(patch.description);
  }
  if (patch.resultsVisible !== undefined) {
    sets.push("results_visible = ?"), args.push(patch.resultsVisible ? 1 : 0);
  }
  if (patch.acceptingResponses !== undefined) {
    sets.push("accepting_responses = ?"),
      args.push(patch.acceptingResponses ? 1 : 0);
  }
  if (patch.audienceFacets !== undefined) {
    sets.push("audience_facets = ?"), args.push(patch.audienceFacets ? 1 : 0);
  }
  if (patch.questions !== undefined) {
    if (
      !Array.isArray(patch.questions) || !Array.isArray(patch.expectedQuestions)
    ) {
      throw new RequestError(
        "Reload the builder before saving questions.",
        409,
      );
    }
    const currentResult = await sqlite.execute({
      sql: `SELECT questions_json FROM surveys WHERE id = ?`,
      args: [id],
    });
    const currentJson = currentResult.rows[0]?.questions_json;
    if (currentJson === undefined) {
      throw new RequestError("Survey not found.", 404);
    }
    const currentQuestions = normalizeStoredQuestions(
      JSON.parse(String(currentJson)),
    );
    if (
      JSON.stringify(currentQuestions) !==
        JSON.stringify(patch.expectedQuestions)
    ) {
      throw new RequestError(
        "Questions changed in another tab. Reload before saving.",
        409,
      );
    }
    expectedPersistedQuestions = String(currentJson);
    const qs = patch.questions.map((q, i) => ({
      ...q,
      position: i,
      released: q.released === true,
    }));
    sets.push("questions_json = ?"), args.push(JSON.stringify(qs));
  }
  if (!sets.length) return;
  args.push(id);
  // Compare the last saved snapshot so an older builder cannot erase an approval.
  const condition = patch.questions !== undefined
    ? " AND json(questions_json) = json(?)"
    : "";
  if (expectedPersistedQuestions !== undefined) {
    args.push(expectedPersistedQuestions);
  }
  const result = await sqlite.execute({
    sql: `UPDATE surveys SET ${
      sets.join(", ")
    } WHERE id = ?${condition} RETURNING *`,
    args,
  });
  if (!result.rowsAffected) {
    throw new RequestError(
      "Questions changed in another tab. Reload before saving.",
      409,
    );
  }
  return rowToSurvey(result.rows[0] as Record<string, unknown>);
}

export async function setQuestionReleased(
  surveyId: string,
  questionId: string,
  released: boolean,
): Promise<Survey> {
  await ensureSchema();
  const currentResult = await sqlite.execute({
    sql: `SELECT * FROM surveys WHERE id = ?`,
    args: [surveyId],
  });
  if (!currentResult.rows[0]) throw new RequestError("Survey not found.", 404);
  const currentRow = currentResult.rows[0] as Record<string, unknown>;
  const current = rowToSurvey(currentRow);
  if (!current.questions.some((question) => question.id === questionId)) {
    throw new RequestError("Question not found.", 404);
  }
  const questions = current.questions.map((question) =>
    question.id === questionId ? { ...question, released } : question
  );
  const result = await sqlite.execute({
    sql:
      `UPDATE surveys SET questions_json = ? WHERE id = ? AND json(questions_json) = json(?) RETURNING *`,
    args: [
      JSON.stringify(questions),
      surveyId,
      String(currentRow.questions_json),
    ],
  });
  if (!result.rowsAffected) {
    throw new RequestError(
      "Questions changed in another tab. Retry the release action.",
      409,
    );
  }
  return rowToSurvey(result.rows[0] as Record<string, unknown>);
}

export async function deleteSurvey(id: string): Promise<void> {
  await ensureSchema();
  await sqlite.batch([
    {
      sql:
        `DELETE FROM proposal_votes WHERE proposal_id IN (SELECT id FROM question_proposals WHERE survey_id = ?)`,
      args: [id],
    },
    { sql: `DELETE FROM question_proposals WHERE survey_id = ?`, args: [id] },
    { sql: `DELETE FROM responses WHERE survey_id = ?`, args: [id] },
    { sql: `DELETE FROM surveys WHERE id = ?`, args: [id] },
  ]);
}

export async function clearResponses(surveyId: string): Promise<void> {
  await ensureSchema();
  await sqlite.execute({
    sql: `DELETE FROM responses WHERE survey_id = ?`,
    args: [surveyId],
  });
}

export async function upsertResponse(
  surveyId: string,
  sid: string,
  answers: Answers,
): Promise<void> {
  await ensureSchema();
  await sqlite.execute({
    sql: `INSERT INTO responses (survey_id, sid, answers_json) VALUES (?, ?, ?)
          ON CONFLICT(survey_id, sid) DO UPDATE SET answers_json = excluded.answers_json, updated_at = datetime('now')`,
    args: [surveyId, sid, JSON.stringify(answers)],
  });
}

export async function getResponse(
  surveyId: string,
  sid: string,
): Promise<Answers | null> {
  await ensureSchema();
  const r = await sqlite.execute({
    sql: `SELECT answers_json FROM responses WHERE survey_id = ? AND sid = ?`,
    args: [surveyId, sid],
  });
  return r.rows[0] ? JSON.parse(String(r.rows[0].answers_json)) : null;
}

export async function getAllResponses(surveyId: string): Promise<Answers[]> {
  await ensureSchema();
  const r = await sqlite.execute({
    sql: `SELECT answers_json FROM responses WHERE survey_id = ? ORDER BY id`,
    args: [surveyId],
  });
  return r.rows.map((row) => JSON.parse(String(row.answers_json)));
}

/** Validate & normalize incoming answers against the survey's questions. Drops unknown keys. */
export function sanitizeAnswers(survey: Survey, raw: unknown): Answers {
  const out: Answers = {};
  if (!raw || typeof raw !== "object") return out;
  const input = raw as Record<string, unknown>;
  for (const q of survey.questions) {
    const v = input[q.id];
    if (v === undefined || v === null || v === "") continue;
    const optIds = new Set(q.options.map((o) => o.id));
    switch (q.type) {
      case "single_choice":
      case "emoji_reaction":
        if (typeof v === "string" && optIds.has(v)) out[q.id] = v;
        break;
      case "multi_choice":
        {
          const selected = canonicalizeChoiceSelection(q.options, v);
          if (selected) out[q.id] = selected;
        }
        break;
      case "ranked_choice":
        if (Array.isArray(v)) {
          const seen = new Set<string>();
          out[q.id] = v.filter((x) =>
            typeof x === "string" && optIds.has(x) && !seen.has(x) &&
            seen.add(x)
          );
        }
        break;
      case "scale": {
        const n = Number(v);
        const min = q.scaleMin ?? 1, max = q.scaleMax ?? 5;
        if (Number.isFinite(n) && n >= min && n <= max) {
          out[q.id] = Math.round(n);
        }
        break;
      }
      case "free_text":
        if (typeof v === "string") out[q.id] = v.slice(0, 2000);
        break;
      case "word_cloud":
        if (typeof v === "string") out[q.id] = v.trim().slice(0, 40);
        break;
      case "matrix_2x2": {
        const size = q.matrixSize ?? 2;
        if (isMatrixAnswer(v, size)) {
          out[q.id] = { row: v.row, column: v.column };
        }
        break;
      }
    }
  }
  return out;
}
