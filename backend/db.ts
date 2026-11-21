export type Statement = { sql: string; args?: (string | number | null)[] };

export function database(db: D1Database) {
  const prepare = ({ sql, args }: Statement) =>
    db.prepare(sql).bind(...(args ?? []));
  const result = ({ results, meta }: D1Result<Record<string, unknown>>) => ({
    rows: results,
    rowsAffected: meta.changes,
  });

  return {
    async execute(statement: Statement) {
      return result(await prepare(statement).all<Record<string, unknown>>());
    },
    async batch(statements: Statement[]) {
      return (await db.batch<Record<string, unknown>>(statements.map(prepare)))
        .map(result);
    },
  };
}

export type Database = ReturnType<typeof database>;

export async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buf)).map((b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no ambiguous chars
export function randomId(len: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}
