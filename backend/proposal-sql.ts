import type { Question, QuestionDraft } from "../shared/types.ts";

export const proposalSchema = [
  `CREATE TABLE IF NOT EXISTS question_proposals (
    id TEXT PRIMARY KEY,
    survey_id TEXT NOT NULL,
    proposer_sid TEXT NOT NULL,
    draft_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
    approved_question_id TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    approved_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_proposals_survey ON question_proposals(survey_id, status, created_at)`,
  `CREATE TABLE IF NOT EXISTS proposal_votes (
    proposal_id TEXT NOT NULL,
    sid TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    PRIMARY KEY (proposal_id, sid)
  )`,
];

export function listProposalsStatement(surveyId: string, sid: string) {
  return {
    sql: `SELECT p.id, p.draft_json, p.status, p.created_at,
            COALESCE(SUM(v.active), 0) AS vote_count,
            COALESCE(MAX(CASE WHEN v.sid = ? THEN v.active ELSE 0 END), 0) AS voted
          FROM question_proposals p LEFT JOIN proposal_votes v ON v.proposal_id = p.id
          WHERE p.survey_id = ? AND p.status = 'pending'
          GROUP BY p.id ORDER BY vote_count DESC, p.created_at ASC, p.id ASC`,
    args: [sid, surveyId],
  };
}

export function createProposalStatement(
  surveyId: string,
  sid: string,
  id: string,
  draft: QuestionDraft,
) {
  return {
    sql:
      `INSERT INTO question_proposals (id, survey_id, proposer_sid, draft_json)
          SELECT ?, id, ?, ? FROM surveys WHERE id = ? AND accepting_responses = 1
          RETURNING id`,
    args: [id, sid, JSON.stringify(draft), surveyId],
  };
}

/** Setting the desired state, rather than blindly toggling, makes retries safe. */
export function voteStatement(
  surveyId: string,
  proposalId: string,
  sid: string,
  voted: boolean,
) {
  return {
    sql: `INSERT INTO proposal_votes (proposal_id, sid, active)
          SELECT p.id, ?, ? FROM question_proposals p JOIN surveys s ON s.id = p.survey_id
          WHERE p.id = ? AND p.survey_id = ? AND p.status = 'pending' AND s.accepting_responses = 1
          ON CONFLICT(proposal_id, sid) DO UPDATE SET active = excluded.active
          RETURNING active`,
    args: [sid, voted ? 1 : 0, proposalId, surveyId],
  };
}

/** Claim once, then append only for that claim, in the same write transaction. */
export function approvalStatements(
  surveyId: string,
  proposalId: string,
  question: Question,
) {
  return [
    {
      sql:
        `UPDATE question_proposals SET status = 'approved', approved_question_id = ?, approved_at = datetime('now')
            WHERE id = ? AND survey_id = ? AND status = 'pending'
              AND EXISTS (SELECT 1 FROM surveys WHERE id = ?)
            RETURNING id`,
      args: [question.id, proposalId, surveyId, surveyId],
    },
    {
      sql: `UPDATE surveys
            SET questions_json = json_insert(questions_json, '$[#]',
              json_set(json(?), '$.position', json_array_length(questions_json)))
            WHERE id = ? AND EXISTS (
              SELECT 1 FROM question_proposals
              WHERE id = ? AND survey_id = ? AND approved_question_id = ?
            )`,
      args: [
        JSON.stringify(question),
        surveyId,
        proposalId,
        surveyId,
        question.id,
      ],
    },
  ];
}
