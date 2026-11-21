export const surveyTables = [
  "surveys",
  "responses",
  "question_proposals",
  "proposal_votes",
] as const;

type Query = (statement: { sql: string; args?: (string | number)[] }) =>
  Promise<{ rows: Record<string, unknown>[] }>;

const identifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
const textLiteral = (column: string) =>
  `CASE WHEN typeof(${column}) = 'text' THEN 'CAST(X''' || hex(${column}) ||
    ''' AS TEXT)' ELSE quote(${column}) END`;

export async function* exportSurveys(query: Query, signal: AbortSignal) {
  const deferred: string[] = [];
  for (const table of surveyTables) {
    signal.throwIfAborted();
    const { rows: schema } = await query({
      sql: "SELECT type, sql FROM sqlite_schema WHERE tbl_name = ? AND sql IS NOT NULL ORDER BY type, name",
      args: [table],
    });
    const create = schema.find((object) => object.type === "table")?.sql;
    if (typeof create !== "string" || !/^CREATE TABLE\b/i.test(create)) {
      throw new Error(`Missing ordinary table: ${table}`);
    }
    yield `${create};\n`;
    for (const row of schema) {
      if ((row.type === "index" || row.type === "trigger") && typeof row.sql === "string") {
        deferred.push(`${row.sql};\n`);
      }
    }

    const { rows: info } = await query({ sql: `PRAGMA table_xinfo(${identifier(table)})` });
    const columns = info.filter((column) => Number(column.hidden) === 0);
    const names = columns.map((column) => identifier(String(column.name)));
    const primary = columns.filter((column) => Number(column.pk) > 0)
      .sort((a, b) => Number(a.pk) - Number(b.pk))
      .map((column) => identifier(String(column.name)));
    if (!primary.length) throw new Error(`No primary key for ${table}`);
    const expressions = names.map((name, i) => `${textLiteral(name)} AS v${i}`);
    let count = 0;
    for (;;) {
      signal.throwIfAborted();
      const { rows } = await query({
        sql: `SELECT ${expressions.join(", ")} FROM ${identifier(table)}
          ORDER BY ${primary.join(", ")} LIMIT 100 OFFSET ?`,
        args: [count],
      });
      for (const row of rows) {
        const values = names.map((_, i) => {
          const value = row[`v${i}`];
          if (typeof value !== "string") throw new Error(`Missing export value for ${table}`);
          return value;
        });
        yield `INSERT INTO ${identifier(table)} (${names.join(", ")}) VALUES (${values.join(", ")});\n`;
      }
      count += rows.length;
      if (rows.length < 100) break;
    }
    yield `-- ${table}: ${count}\n`;
  }

  const { rows: sequence } = await query({
    sql: "SELECT CAST(seq AS TEXT) AS seq FROM sqlite_sequence WHERE name = 'responses'",
  });
  if (sequence.length) {
    const seq = sequence[0].seq;
    if (typeof seq !== "string" || !/^\d+$/.test(seq)) {
      throw new Error("Invalid response sequence");
    }
    yield "DELETE FROM sqlite_sequence WHERE name = 'responses';\n";
    yield `INSERT INTO sqlite_sequence(name, seq) VALUES ('responses', ${seq});\n`;
  }
  yield* deferred;
  yield "-- Export complete\n";
}

export function createExportHandler(query: Query, token: string | undefined) {
  const encode = new TextEncoder();
  const digest = (value: string) => crypto.subtle.digest("SHA-256", encode.encode(value));
  return async (request: Request) => {
    const headers = { "Cache-Control": "no-store" };
    const authorization = request.headers.get("Authorization");
    if (!token || !authorization) return new Response("Unauthorized", { status: 401, headers });
    const [expected, actual] = await Promise.all([digest(`Bearer ${token}`), digest(authorization)]);
    let difference = 0;
    const left = new Uint8Array(expected);
    const right = new Uint8Array(actual);
    for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
    if (difference !== 0) return new Response("Unauthorized", { status: 401, headers });
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers });

    const rows = exportSurveys(query, request.signal);
    return new Response(new ReadableStream({
      async pull(controller) {
        const next = await rows.next();
        if (next.done) controller.close();
        else controller.enqueue(encode.encode(next.value));
      },
      async cancel() {
        await rows.return();
      },
    }), { headers: { ...headers, "Content-Type": "application/sql; charset=utf-8" } });
  };
}
