import type { Answers, Question, Survey } from "../shared/types.ts";
import { ensureSchema, randomId, sha256, sqlite } from "./db.ts";

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
    questions: JSON.parse(String(r.questions_json ?? "[]")),
  };
}

export async function createSurvey(title: string): Promise<{ survey: Survey; adminKey: string }> {
  await ensureSchema();
  const id = randomId(12);
  const slug = randomId(6);
  const adminKey = randomId(28);
  const hash = await sha256(adminKey);
  await sqlite.execute({
    sql: `INSERT INTO surveys (id, slug, admin_key_hash, title) VALUES (?, ?, ?, ?)`,
    args: [id, slug, hash, title || "Untitled survey"],
  });
  const survey = await getSurveyBySlug(slug);
  return { survey: survey!, adminKey };
}

export async function getSurveyBySlug(slug: string): Promise<Survey | null> {
  await ensureSchema();
  const r = await sqlite.execute({ sql: `SELECT * FROM surveys WHERE slug = ?`, args: [slug] });
  return r.rows[0] ? rowToSurvey(r.rows[0] as Record<string, unknown>) : null;
}

export async function getSurveyByAdminKey(adminKey: string): Promise<Survey | null> {
  await ensureSchema();
  const hash = await sha256(adminKey);
  const r = await sqlite.execute({ sql: `SELECT * FROM surveys WHERE admin_key_hash = ?`, args: [hash] });
  return r.rows[0] ? rowToSurvey(r.rows[0] as Record<string, unknown>) : null;
}

export interface SurveyPatch {
  title?: string;
  description?: string;
  resultsVisible?: boolean;
  acceptingResponses?: boolean;
  audienceFacets?: boolean;
  questions?: Question[];
}

export async function updateSurvey(id: string, patch: SurveyPatch): Promise<void> {
  await ensureSchema();
  const sets: string[] = [];
  const args: (string | number)[] = [];
  if (patch.title !== undefined) sets.push("title = ?"), args.push(patch.title);
  if (patch.description !== undefined) sets.push("description = ?"), args.push(patch.description);
  if (patch.resultsVisible !== undefined) sets.push("results_visible = ?"), args.push(patch.resultsVisible ? 1 : 0);
  if (patch.acceptingResponses !== undefined) {
    sets.push("accepting_responses = ?"), args.push(patch.acceptingResponses ? 1 : 0);
  }
  if (patch.audienceFacets !== undefined) sets.push("audience_facets = ?"), args.push(patch.audienceFacets ? 1 : 0);
  if (patch.questions !== undefined) {
    const qs = patch.questions.map((q, i) => ({ ...q, position: i }));
    sets.push("questions_json = ?"), args.push(JSON.stringify(qs));
  }
  if (!sets.length) return;
  args.push(id);
  await sqlite.execute({ sql: `UPDATE surveys SET ${sets.join(", ")} WHERE id = ?`, args });
}

export async function deleteSurvey(id: string): Promise<void> {
  await ensureSchema();
  await sqlite.batch([
    { sql: `DELETE FROM responses WHERE survey_id = ?`, args: [id] },
    { sql: `DELETE FROM surveys WHERE id = ?`, args: [id] },
  ]);
}

export async function clearResponses(surveyId: string): Promise<void> {
  await ensureSchema();
  await sqlite.execute({ sql: `DELETE FROM responses WHERE survey_id = ?`, args: [surveyId] });
}

export async function upsertResponse(surveyId: string, sid: string, answers: Answers): Promise<void> {
  await ensureSchema();
  await sqlite.execute({
    sql: `INSERT INTO responses (survey_id, sid, answers_json) VALUES (?, ?, ?)
          ON CONFLICT(survey_id, sid) DO UPDATE SET answers_json = excluded.answers_json, updated_at = datetime('now')`,
    args: [surveyId, sid, JSON.stringify(answers)],
  });
}

export async function getResponse(surveyId: string, sid: string): Promise<Answers | null> {
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
        if (Array.isArray(v)) out[q.id] = v.filter((x) => typeof x === "string" && optIds.has(x));
        break;
      case "ranked_choice":
        if (Array.isArray(v)) {
          const seen = new Set<string>();
          out[q.id] = v.filter((x) => typeof x === "string" && optIds.has(x) && !seen.has(x) && seen.add(x));
        }
        break;
      case "scale": {
        const n = Number(v);
        const min = q.scaleMin ?? 1, max = q.scaleMax ?? 5;
        if (Number.isFinite(n) && n >= min && n <= max) out[q.id] = Math.round(n);
        break;
      }
      case "free_text":
        if (typeof v === "string") out[q.id] = v.slice(0, 2000);
        break;
      case "word_cloud":
        if (typeof v === "string") out[q.id] = v.trim().slice(0, 40);
        break;
    }
  }
  return out;
}
