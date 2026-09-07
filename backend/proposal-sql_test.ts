import { deepStrictEqual, notEqual, throws } from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  normalizeApprovedQuestion,
  normalizeDraft,
} from "../shared/questions.ts";
import {
  approvalStatements,
  createProposalStatement,
  listProposalsStatement,
  proposalSchema,
  voteStatement,
} from "./proposal-sql.ts";

type Statement = { sql: string; args: (string | number)[] };

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(
    `CREATE TABLE surveys (id TEXT PRIMARY KEY, accepting_responses INTEGER, questions_json TEXT DEFAULT '[]');
    INSERT INTO surveys (id, accepting_responses) VALUES ('s1', 1), ('s2', 1), ('closed', 0);`,
  );
  proposalSchema.forEach((sql) => db.exec(sql));
  const run = (statement: Statement) =>
    db.prepare(statement.sql).all(...statement.args);
  const create = (id: string, surveyId = "s1") =>
    run(
      createProposalStatement(
        surveyId,
        "author",
        id,
        normalizeDraft({ type: "free_text", prompt: id }),
      ),
    );
  const list = (surveyId = "s1", sid = "a") =>
    run(listProposalsStatement(surveyId, sid));
  const approve = (id: string, surveyId = "s1") => {
    const statements = approvalStatements(
      surveyId,
      id,
      normalizeApprovedQuestion({ type: "free_text", prompt: `Edited ${id}` }),
    );
    db.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map(run);
      db.exec("COMMIT");
      return results[0].length;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
  return { db, run, create, list, approve };
}

Deno.test("schema is idempotent and creation is gated by survey state", () => {
  const f = fixture();
  try {
    proposalSchema.forEach((sql) => f.db.exec(sql));
    deepStrictEqual(f.create("p").length, 1);
    deepStrictEqual(f.create("closed-p", "closed").length, 0);
    deepStrictEqual(f.create("missing-p", "missing").length, 0);
    deepStrictEqual(f.list().length, 1);
    deepStrictEqual(f.list("s2").length, 0);
  } finally {
    f.db.close();
  }
});

Deno.test("votes are unique, toggleable, retry-safe, and device-specific", () => {
  const f = fixture();
  try {
    f.create("p");
    f.run(voteStatement("s1", "p", "a", true));
    f.run(voteStatement("s1", "p", "a", true));
    f.run(voteStatement("s1", "p", "b", true));
    deepStrictEqual(f.list()[0].vote_count, 2);
    deepStrictEqual(f.list()[0].voted, 1);
    deepStrictEqual(f.list("s1", "c")[0].voted, 0);
    f.run(voteStatement("s1", "p", "a", false));
    f.run(voteStatement("s1", "p", "a", false));
    deepStrictEqual(f.list()[0].vote_count, 1);
    deepStrictEqual(f.list()[0].voted, 0);
    f.run(voteStatement("s1", "p", "a", true));
    deepStrictEqual(f.list()[0].vote_count, 2);
  } finally {
    f.db.close();
  }
});

Deno.test("cross-survey, closed, missing, and approved proposals cannot be voted on", () => {
  const f = fixture();
  try {
    f.create("p");
    deepStrictEqual(f.run(voteStatement("s2", "p", "a", true)).length, 0);
    deepStrictEqual(f.run(voteStatement("s1", "missing", "a", true)).length, 0);
    f.db.exec("UPDATE surveys SET accepting_responses = 0 WHERE id = 's1'");
    deepStrictEqual(f.run(voteStatement("s1", "p", "a", true)).length, 0);
    deepStrictEqual(f.approve("p"), 1);
    f.db.exec("UPDATE surveys SET accepting_responses = 1 WHERE id = 's1'");
    deepStrictEqual(f.run(voteStatement("s1", "p", "a", true)).length, 0);
  } finally {
    f.db.close();
  }
});

Deno.test("queue sorts by votes, then oldest, then stable ID", () => {
  const f = fixture();
  try {
    f.create("old");
    f.create("popular");
    f.create("new");
    f.db.exec(
      "UPDATE question_proposals SET created_at = '2000-01-01' WHERE id = 'old'",
    );
    f.run(voteStatement("s1", "popular", "a", true));
    deepStrictEqual(f.list().map((p) => p.id), ["popular", "old", "new"]);
  } finally {
    f.db.close();
  }
});

Deno.test("approval is one-time, scoped, preserves questions, and assigns append positions", () => {
  const f = fixture();
  try {
    f.create("p1");
    f.create("p2");
    deepStrictEqual(f.approve("p1", "s2"), 0);
    deepStrictEqual(f.approve("missing"), 0);
    deepStrictEqual(f.approve("p1"), 1);
    deepStrictEqual(f.approve("p1"), 0);
    deepStrictEqual(f.approve("p2"), 1);
    const survey = f.db.prepare(
      "SELECT questions_json FROM surveys WHERE id = 's1'",
    ).get()!;
    const questions = JSON.parse(String(survey.questions_json));
    deepStrictEqual(questions.map((q: { prompt: string }) => q.prompt), [
      "Edited p1",
      "Edited p2",
    ]);
    deepStrictEqual(questions.map((q: { position: number }) => q.position), [
      0,
      1,
    ]);
    notEqual(questions[0].id, questions[1].id);
    deepStrictEqual(f.list().length, 0);
  } finally {
    f.db.close();
  }
});

Deno.test("failed append rolls back the approval claim", () => {
  const f = fixture();
  try {
    f.create("p");
    f.db.exec(
      `CREATE TRIGGER fail_append BEFORE UPDATE OF questions_json ON surveys
      BEGIN SELECT RAISE(ABORT, 'simulated append failure'); END;`,
    );
    throws(() => f.approve("p"), /simulated append failure/);
    deepStrictEqual(f.list().length, 1);
    deepStrictEqual(
      f.db.prepare("SELECT approved_question_id FROM question_proposals").get()
        ?.approved_question_id,
      null,
    );
  } finally {
    f.db.close();
  }
});
