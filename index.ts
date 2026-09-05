import { parseVal, serveImmutableFile } from "https://esm.town/v/std/utils/index.ts";
import { Hono } from "npm:hono";
import { getCookie, setCookie } from "npm:hono/cookie";
import QRCode from "npm:qrcode";
import { buildResults } from "./backend/aggregate.ts";
import { randomId } from "./backend/db.ts";
import {
  clearResponses,
  createSurvey,
  deleteSurvey,
  getAllResponses,
  getResponse,
  getSurveyByAdminKey,
  getSurveyBySlug,
  sanitizeAnswers,
  updateSurvey,
  upsertResponse,
} from "./backend/surveys.ts";
import { Root } from "./frontend/root.tsx";

const app = new Hono();

// ---- Frontend shell (client-side routing handles the rest) ----
const SHELL_PATHS = ["/", "/new", "/s/:slug", "/s/:slug/results", "/s/:slug/present", "/admin/:key"];
for (const p of SHELL_PATHS) app.get(p, (c) => c.html(Root()));
app.get("/__immutable/*", (c) => serveImmutableFile(c.req.path));
app.get("/source", (c) => c.redirect(parseVal().links.self.val));

// ---- Respondent identity cookie ----
const SID_COOKIE = "survey_sid";
function getOrSetSid(c: any): string {
  let sid = getCookie(c, SID_COOKIE);
  if (!sid || !/^[a-z0-9]{24}$/.test(sid)) {
    sid = randomId(24);
    setCookie(c, SID_COOKIE, sid, {
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: true,
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return sid;
}

// ---- Public API ----
app.post("/api/surveys", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const title = String(body.title ?? "").slice(0, 120);
  const { survey, adminKey } = await createSurvey(title);
  return c.json({ slug: survey.slug, adminKey });
});

// Survey for respondents (strips nothing sensitive: admin key never leaves the DB)
app.get("/api/s/:slug", async (c) => {
  const survey = await getSurveyBySlug(c.req.param("slug"));
  if (!survey) return c.json({ error: "Not found" }, 404);
  const sid = getOrSetSid(c);
  const existing = await getResponse(survey.id, sid);
  return c.json({ survey, existing });
});

app.post("/api/s/:slug/respond", async (c) => {
  const survey = await getSurveyBySlug(c.req.param("slug"));
  if (!survey) return c.json({ error: "Not found" }, 404);
  if (!survey.acceptingResponses) return c.json({ error: "This survey is closed." }, 403);
  const sid = getOrSetSid(c);
  const body = await c.req.json().catch(() => ({}));
  const answers = sanitizeAnswers(survey, body.answers);
  await upsertResponse(survey.id, sid, answers);
  return c.json({ ok: true, answers });
});

app.get("/api/s/:slug/results", async (c) => {
  const survey = await getSurveyBySlug(c.req.param("slug"));
  if (!survey) return c.json({ error: "Not found" }, 404);
  if (!survey.resultsVisible) return c.json({ error: "Results are not visible yet." }, 403);
  const groupBy = survey.audienceFacets ? c.req.query("groupBy") || null : null;
  const responses = await getAllResponses(survey.id);
  const visible = survey.questions.filter((q) => !q.hidden);
  return c.json({
    survey,
    totalResponses: responses.length,
    groupBy,
    groups: buildResults(survey, responses, groupBy, visible),
  });
});

// QR code (SVG) pointing to the respondent URL
app.get("/api/s/:slug/qr.svg", async (c) => {
  const url = new URL(c.req.url);
  const target = `${url.origin}/s/${c.req.param("slug")}`;
  const svg = await QRCode.toString(target, { type: "svg", margin: 1, width: 512, errorCorrectionLevel: "M" });
  return c.body(svg, 200, { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" });
});

// ---- Admin API (gated by secret key) ----
const admin = new Hono();
admin.use("*", async (c, next) => {
  const survey = await getSurveyByAdminKey(c.req.param("key") as string);
  if (!survey) return c.json({ error: "Invalid admin link" }, 404);
  c.set("survey" as never, survey as never);
  await next();
});

admin.get("/", async (c) => {
  const survey = c.get("survey" as never) as any;
  const responses = await getAllResponses(survey.id);
  return c.json({ survey, totalResponses: responses.length });
});

admin.patch("/", async (c) => {
  const survey = c.get("survey" as never) as any;
  const body = await c.req.json().catch(() => ({}));
  await updateSurvey(survey.id, body);
  const fresh = await getSurveyBySlug(survey.slug);
  return c.json({ survey: fresh });
});

admin.get("/results", async (c) => {
  const survey = c.get("survey" as never) as any;
  const groupBy = c.req.query("groupBy") || null;
  const responses = await getAllResponses(survey.id);
  const all = c.req.query("includeHidden") === "1";
  const visible = all ? survey.questions : survey.questions.filter((q: any) => !q.hidden);
  return c.json({
    survey,
    totalResponses: responses.length,
    groupBy,
    groups: buildResults(survey, responses, groupBy, visible),
  });
});

admin.get("/export.csv", async (c) => {
  const survey = c.get("survey" as never) as any;
  const responses = await getAllResponses(survey.id);
  const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const header = survey.questions.map((q: any) => esc(q.prompt)).join(",");
  const optLabel = (q: any, id: string) => q.options.find((o: any) => o.id === id)?.label ?? id;
  const rows = responses.map((r) =>
    survey.questions.map((q: any) => {
      const v = r[q.id];
      if (Array.isArray(v)) return esc(v.map((x) => optLabel(q, x)).join(" > "));
      if (typeof v === "string" && q.options.length) return esc(optLabel(q, v));
      return esc(v);
    }).join(",")
  );
  return c.body([header, ...rows].join("\n"), 200, {
    "Content-Type": "text/csv",
    "Content-Disposition": `attachment; filename="${survey.slug}-responses.csv"`,
  });
});

admin.delete("/responses", async (c) => {
  const survey = c.get("survey" as never) as any;
  await clearResponses(survey.id);
  return c.json({ ok: true });
});

admin.delete("/", async (c) => {
  const survey = c.get("survey" as never) as any;
  await deleteSurvey(survey.id);
  return c.json({ ok: true });
});

app.route("/api/admin/:key", admin);

app.onError((err) => Promise.reject(err));

export default app.fetch;
