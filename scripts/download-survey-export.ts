import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { pipeline } from "node:stream/promises";

const [endpoint, destination] = process.argv.slice(2);
const token = process.env.SQLITE_EXPORT_TOKEN;
if (!endpoint || !destination || !token) {
  throw new Error("Set SQLITE_EXPORT_TOKEN and provide an HTTPS endpoint and a new local SQL file.");
}
const url = new URL(endpoint);
if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
  throw new Error("Use a plain HTTPS export endpoint without credentials or URL parameters.");
}
const response = await fetch(url, {
  headers: { Authorization: `Bearer ${token}` },
  redirect: "error",
});
if (!response.ok || !response.body || !response.headers.get("content-type")?.startsWith("application/sql")) {
  throw new Error(`Expected a SQL export; got HTTP ${response.status}.`);
}

const marker = "-- Export complete\n";
let tail = "";
let created = false;
const file = createWriteStream(destination, { flags: "wx", mode: 0o600 })
  .once("open", () => { created = true; });
const reader = response.body.getReader();
async function* checkedBody() {
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return;
      tail = (tail + Buffer.from(chunk.value.subarray(-marker.length)).toString("utf8"))
        .slice(-marker.length);
      yield chunk.value;
    }
  } finally {
    await reader.cancel();
  }
}
try {
  await pipeline(checkedBody(), file);
  if (tail !== marker) throw new Error("Incomplete SQL export.");
} catch (error) {
  if (created) await rm(destination);
  throw error;
}
