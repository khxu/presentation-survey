import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { exportSurveys } from "./survey-export.ts";

const [filename, databaseId] = process.argv.slice(2);
if (!filename || !databaseId || !/^[0-9a-f-]{36}$/i.test(databaseId)) {
  throw new Error("Provide the private SQL dump path and the destination D1 database UUID.");
}
const sqlDump = readFileSync(filename, "utf8");
if (!sqlDump.endsWith("-- Export complete\n")) {
  throw new Error("The SQL dump is incomplete.");
}
using backup = new DatabaseSync(":memory:");
backup.exec(sqlDump);

async function digest(iterator: AsyncIterable<string>) {
  const hash = createHash("sha256");
  for await (const chunk of iterator) hash.update(chunk);
  return hash.digest("hex");
}

const signal = new AbortController().signal;
const expected = await digest(exportSurveys(async ({ sql, args = [] }) => ({
  rows: backup.prepare(sql).all(...args),
}), signal));

const actual = await digest(exportSurveys(async ({ sql, args = [] }) => {
  const command = spawnSync("cf", ["d1", "query", databaseId, "--body", JSON.stringify({ sql, params: args })], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (command.error) throw command.error;
  if (command.status !== 0) {
    throw new Error("Destination D1 query failed; check the CLI login and database ID.");
  }
  const result = JSON.parse(command.stdout) as {
    success?: boolean;
    results?: Record<string, unknown>[];
  }[];
  if (result.length !== 1 || !result[0].success || !Array.isArray(result[0].results)) {
    throw new Error("Destination D1 returned an unexpected query result.");
  }
  return { rows: result[0].results };
}, signal));

if (actual !== expected) {
  throw new Error("Import verification failed: source and destination differ.");
}
console.log("Import verified: scoped schema, rows, and response sequence match the backup.");
