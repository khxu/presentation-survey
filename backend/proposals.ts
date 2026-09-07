import type { QuestionProposal } from "../shared/types.ts";
import {
  normalizeApprovedQuestion,
  normalizeDraft,
} from "../shared/questions.ts";
import { ensureSchema, randomId, sqlite } from "./db.ts";
import { RequestError } from "./errors.ts";
import {
  approvalStatements,
  createProposalStatement,
  listProposalsStatement,
  voteStatement,
} from "./proposal-sql.ts";

export async function listProposals(
  surveyId: string,
  sid = "",
): Promise<QuestionProposal[]> {
  await ensureSchema();
  const result = await sqlite.execute(listProposalsStatement(surveyId, sid));
  return result.rows.map((row) => ({
    id: String(row.id),
    draft: JSON.parse(String(row.draft_json)),
    status: "pending",
    createdAt: String(row.created_at),
    voteCount: Number(row.vote_count),
    voted: Number(row.voted) === 1,
  }));
}

export async function createProposal(
  surveyId: string,
  sid: string,
  raw: unknown,
): Promise<void> {
  const draft = normalizeDraft(raw);
  await ensureSchema();
  const result = await sqlite.execute(
    createProposalStatement(surveyId, sid, randomId(24), draft),
  );
  if (!result.rows.length) {
    throw new RequestError("This survey is closed.", 403);
  }
}

export async function setProposalVote(
  surveyId: string,
  proposalId: string,
  sid: string,
  voted: boolean,
): Promise<void> {
  await ensureSchema();
  const result = await sqlite.execute(
    voteStatement(surveyId, proposalId, sid, voted),
  );
  if (!result.rows.length) {
    throw new RequestError(
      "Voting is unavailable. The survey may be closed or this proposal already approved.",
      409,
    );
  }
}

export async function approveProposal(
  surveyId: string,
  proposalId: string,
  raw: unknown,
): Promise<void> {
  const question = normalizeApprovedQuestion(raw);
  await ensureSchema();
  const [claim] = await sqlite.batch(
    approvalStatements(surveyId, proposalId, question),
    "write",
  );
  if (!claim.rows.length) {
    throw new RequestError(
      "This proposal is no longer pending. Refresh the queue.",
      409,
    );
  }
}
