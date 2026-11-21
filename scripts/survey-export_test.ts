import { deepStrictEqual, equal, match } from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "vitest";
import { createExportHandler, surveyTables } from "./survey-export.ts";

test("authorized export round-trips scoped tables, text and response sequence", async () => {
  using source = new DatabaseSync(":memory:");
  using restored = new DatabaseSync(":memory:");
  source.exec(readFileSync(new URL("../migrations/0001_baseline.sql", import.meta.url), "utf8"));
  source.exec(`
    CREATE TABLE unrelated (id INTEGER);
    INSERT INTO surveys(id,slug,admin_key_hash,title) VALUES ('s','slug','hash','bytes');
    INSERT INTO responses(id,survey_id,sid) VALUES (1,'s','sid'),(42,'s','deleted');
    DELETE FROM responses WHERE id=42;
    INSERT INTO question_proposals(id,survey_id,proposer_sid,draft_json)
      VALUES ('p','s','sid','{}');
    INSERT INTO proposal_votes(proposal_id,sid,active) VALUES ('p','sid',0);
  `);
  source.prepare("UPDATE surveys SET title = ?").run("quote ' and unicode 🗳\0end");
  const handle = createExportHandler(async ({ sql, args }) => ({
    rows: source.prepare(sql).all(...(args ?? [])),
  }), "fixture-token");
  const url = "https://survey.test/export";
  equal((await handle(new Request(url))).status, 401);
  equal((await handle(new Request(url, {
    headers: { Authorization: "Bearer wrong" },
  }))).status, 401);
  const response = await handle(new Request(url, {
    headers: { Authorization: "Bearer fixture-token" },
  }));
  equal(response.headers.get("Cache-Control"), "no-store");
  const sql = await response.text();
  match(sql, /-- Export complete\n$/);
  restored.exec(sql);
  for (const table of surveyTables) {
    deepStrictEqual(restored.prepare(`SELECT * FROM ${table}`).all(),
      source.prepare(`SELECT * FROM ${table}`).all());
  }
  equal(restored.prepare("SELECT 1 FROM sqlite_schema WHERE name='unrelated'").get(), undefined);
  equal(restored.prepare("INSERT INTO responses(survey_id,sid) VALUES ('s','new')").run().lastInsertRowid, 43);
});
