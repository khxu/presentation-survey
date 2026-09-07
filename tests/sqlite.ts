import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(":memory:");
type Statement = string | { sql: string; args?: (string | number)[] };

function execute(statement: Statement) {
  const sql = typeof statement === "string" ? statement : statement.sql;
  const args = typeof statement === "string" ? [] : statement.args ?? [];
  const prepared = db.prepare(sql);
  const rows = prepared.all(...args);
  const changes = db.prepare("SELECT changes() AS count").get()!;
  return { rows, rowsAffected: Number(changes.count) };
}

// Run the production SQL against real in-memory SQLite without touching a val's data.
export const sqlite = {
  execute(statement: Statement) {
    return Promise.resolve(execute(statement));
  },
  batch(statements: Statement[], _mode = "write") {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = statements.map(execute);
      db.exec("COMMIT");
      return Promise.resolve(result);
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  },
};
