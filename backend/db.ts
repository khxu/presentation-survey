import { sqlite } from "https://esm.town/v/std/sqlite/main.ts";

export { sqlite };

let ready: Promise<void> | null = null;

export function ensureSchema() {
  if (!ready) {
    ready = (async () => {
      await sqlite.batch([
        `CREATE TABLE IF NOT EXISTS surveys (
          id TEXT PRIMARY KEY,
          slug TEXT UNIQUE NOT NULL,
          admin_key_hash TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          results_visible INTEGER NOT NULL DEFAULT 0,
          accepting_responses INTEGER NOT NULL DEFAULT 1,
          audience_facets INTEGER NOT NULL DEFAULT 0,
          questions_json TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
        `CREATE TABLE IF NOT EXISTS responses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          survey_id TEXT NOT NULL,
          sid TEXT NOT NULL,
          answers_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE (survey_id, sid)
        )`,
        `CREATE INDEX IF NOT EXISTS idx_responses_survey ON responses(survey_id)`,
      ]);
    })();
  }
  return ready;
}

export async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no ambiguous chars
export function randomId(len: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}
