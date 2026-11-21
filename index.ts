import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { getCookie, setCookie } from "hono/cookie";
import QRCode from "qrcode";
import { buildResults } from "./backend/aggregate.ts";
import { type Database, database, randomId } from "./backend/db.ts";
import {
  clearResponses,
  createSurvey,
  deleteSurvey,
  filterAnswers,
  getAllResponses,
  getResponse,
  getSurveyByAdminKey,
  getSurveyBySlug,
  openSpectrumAfter,
  publicSurvey,
  saveResponse,
  setQuestionReleased,
  updateSurvey,
} from "./backend/surveys.ts";
import {
  approveProposal,
  createProposal,
  listProposals,
  setProposalVote,
} from "./backend/proposals.ts";
import { RequestError } from "./backend/errors.ts";
import {
  normalizeMatrixAnswer,
  normalizeSpectrumAnswer,
  QuestionValidationError,
} from "./shared/questions.ts";
import type { Question, Survey } from "./shared/types.ts";

type AppEnv = {
  Bindings: {
    ASSETS: Pick<Env["ASSETS"], "fetch">;
    DB: Env["DB"];
    WRITES_PAUSED: Env["WRITES_PAUSED"];
  };
  Variables: { db: Database; survey: Survey };
};

export function createApp(getDatabase = database) {
  const app = new Hono<AppEnv>();

  // ---- Frontend shell (client-side routing handles the rest) ----
  const SHELL_PATHS = [
    "/",
    "/new",
    "/s/:slug",
    "/s/:slug/results",
    "/s/:slug/present",
    "/admin/:key",
  ];
  for (const p of SHELL_PATHS) {
    app.get(p, (c) => c.env.ASSETS.fetch(new URL("/index.html", c.req.url)));
  }
  app.get("/source", (c) => c.redirect("https://github.com/khxu/presentation-survey"));

  app.use("/api/*", async (c, next) => {
    if (
      c.env.WRITES_PAUSED !== "0" &&
      c.req.method !== "GET" && c.req.method !== "HEAD"
    ) {
      return c.json({ error: "The survey is temporarily read-only." }, 503);
    }
    c.set("db", getDatabase(c.env.DB));
    await next();
  });

  // ---- Respondent identity cookie ----
  const SID_COOKIE = "survey_sid";
  function getOrSetSid(c: Context<AppEnv>): string {
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
  const proposalBodyLimit = bodyLimit({
    maxSize: 16 * 1024,
    onError: (c) =>
      c.json({ error: "Question requests must be smaller than 16 KB." }, 413),
  });

  async function questionBody(req: Request): Promise<Record<string, unknown>> {
    let body: unknown;
    try {
      body = await req.json();
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new RequestError("Provide valid JSON.", 400);
      }
      throw error;
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new RequestError("Provide a JSON object.", 400);
    }
    return body as Record<string, unknown>;
  }

  app.post("/api/surveys", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const title = String(body.title ?? "").slice(0, 120);
    const { survey, adminKey } = await createSurvey(c.var.db, title);
    return c.json({ slug: survey.slug, adminKey });
  });

  // Survey for respondents (strips nothing sensitive: admin key never leaves the DB)
  app.get("/api/s/:slug", async (c) => {
    const survey = await getSurveyBySlug(c.var.db, c.req.param("slug"));
    if (!survey) return c.json({ error: "Not found" }, 404);
    const sid = getOrSetSid(c);
    const existing = await getResponse(c.var.db, survey.id, sid);
    const visibleSurvey = publicSurvey(survey);
    return c.json({
      survey: visibleSurvey,
      existing: filterAnswers(existing, visibleSurvey.questions),
    });
  });

  app.post("/api/s/:slug/respond", async (c) => {
    const survey = await getSurveyBySlug(c.var.db, c.req.param("slug"));
    if (!survey) return c.json({ error: "Not found" }, 404);
    if (!survey.acceptingResponses) {
      return c.json({ error: "This survey is closed." }, 403);
    }
    const sid = getOrSetSid(c);
    const body = await c.req.json().catch(() => ({}));
    const answers = await saveResponse(c.var.db, survey.id, sid, body.answers);
    return c.json({ ok: true, answers });
  });

  app.get("/api/s/:slug/proposals", async (c) => {
    const survey = await getSurveyBySlug(c.var.db, c.req.param("slug"));
    if (!survey) return c.json({ error: "Not found" }, 404);
    const proposals = await listProposals(c.var.db, survey.id, getOrSetSid(c));
    return c.json({ proposals, acceptingResponses: survey.acceptingResponses });
  });

  app.post("/api/s/:slug/proposals", proposalBodyLimit, async (c) => {
    const survey = await getSurveyBySlug(c.var.db, c.req.param("slug"));
    if (!survey) return c.json({ error: "Not found" }, 404);
    if (!survey.acceptingResponses) {
      return c.json({ error: "This survey is closed." }, 403);
    }
    const body = await questionBody(c.req.raw);
    await createProposal(c.var.db, survey.id, getOrSetSid(c), body.question);
    return c.json({ ok: true }, 201);
  });

  app.put(
    "/api/s/:slug/proposals/:proposalId/vote",
    proposalBodyLimit,
    async (c) => {
      const survey = await getSurveyBySlug(c.var.db, c.req.param("slug"));
      if (!survey) return c.json({ error: "Not found" }, 404);
      if (!survey.acceptingResponses) {
        return c.json({
          error: "This survey is closed.",
        }, 403);
      }
      const body = await questionBody(c.req.raw);
      if (typeof body.voted !== "boolean") {
        return c.json({
          error: "voted must be a boolean.",
        }, 400);
      }
      await setProposalVote(
        c.var.db,
        survey.id,
        c.req.param("proposalId"),
        getOrSetSid(c),
        body.voted,
      );
      return c.json({ ok: true });
    },
  );

  app.get("/api/s/:slug/results", async (c) => {
    const survey = await getSurveyBySlug(c.var.db, c.req.param("slug"));
    if (!survey) return c.json({ error: "Not found" }, 404);
    if (!survey.resultsVisible) {
      return c.json({ error: "Results are not visible yet." }, 403);
    }
    const visibleSurvey = publicSurvey(survey);
    const requestedGroup = visibleSurvey.audienceFacets
      ? c.req.query("groupBy") || null
      : null;
    const groupBy = requestedGroup &&
        visibleSurvey.questions.some((question) =>
          question.id === requestedGroup && question.isDemographic
        )
      ? requestedGroup
      : null;
    const responses = await getAllResponses(c.var.db, survey.id);
    const visible = visibleSurvey.questions.filter((q) => !q.hidden);
    return c.json({
      survey: visibleSurvey,
      totalResponses: responses.length,
      groupBy,
      groups: buildResults(visibleSurvey, responses, groupBy, visible),
    });
  });

  // QR code (SVG) pointing to the respondent URL
  app.get("/api/s/:slug/qr.svg", async (c) => {
    const url = new URL(c.req.url);
    const target = `${url.origin}/s/${c.req.param("slug")}`;
    const svg = await QRCode.toString(target, {
      type: "svg",
      margin: 1,
      width: 512,
      errorCorrectionLevel: "M",
    });
    return c.body(svg, 200, {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    });
  });

  // ---- Admin API (gated by secret key) ----
  const admin = new Hono<AppEnv>();
  admin.use("*", async (c, next) => {
    const survey = await getSurveyByAdminKey(c.var.db, c.req.param("key") as string);
    if (!survey) return c.json({ error: "Invalid admin link" }, 404);
    c.set("survey", survey);
    await next();
  });

  admin.get("/", async (c) => {
    const survey = c.var.survey;
    const responses = await getAllResponses(c.var.db, survey.id);
    return c.json({ survey, totalResponses: responses.length });
  });

  admin.patch("/", async (c) => {
    const survey = c.var.survey;
    const body = await c.req.json().catch(() => ({}));
    const fresh = await updateSurvey(c.var.db, survey.id, body);
    return c.json({ survey: fresh ?? survey });
  });

  admin.patch("/questions/:questionId/release", async (c) => {
    const survey = c.var.survey;
    const body = await questionBody(c.req.raw);
    if (typeof body.released !== "boolean") {
      throw new RequestError("released must be a boolean.", 400);
    }
    const fresh = await setQuestionReleased(
      c.var.db,
      survey.id,
      c.req.param("questionId"),
      body.released,
    );
    return c.json({ survey: fresh });
  });

  admin.patch("/questions/:questionId/phase", async (c) => {
    const survey = c.var.survey;
    const body = await questionBody(c.req.raw);
    if (body.phase !== "after") {
      throw new RequestError(
        "Only advancing to the after phase is supported.",
        400,
      );
    }
    return c.json({
      survey: await openSpectrumAfter(c.var.db, survey.id, c.req.param("questionId")),
    });
  });
  admin.get("/proposals", async (c) => {
    const survey = c.var.survey;
    return c.json({
      proposals: await listProposals(c.var.db, survey.id),
      acceptingResponses: survey.acceptingResponses,
    });
  });

  admin.post("/proposals/:proposalId/approve", proposalBodyLimit, async (c) => {
    const survey = c.var.survey;
    const body = await questionBody(c.req.raw);
    const approvedQuestion = await approveProposal(
      c.var.db,
      survey.id,
      c.req.param("proposalId"),
      body.question,
    );
    const fresh = await getSurveyBySlug(c.var.db, survey.slug);
    const publishedQuestion = fresh?.questions.find((question) =>
      question.id === approvedQuestion.id
    );
    if (!fresh || !publishedQuestion) {
      throw new Error("Approved question was not added to the survey.");
    }
    return c.json({ survey: fresh, approvedQuestion: publishedQuestion });
  });

  admin.get("/results", async (c) => {
    const survey = c.var.survey;
    const groupBy = c.req.query("groupBy") || null;
    const responses = await getAllResponses(c.var.db, survey.id);
    const all = c.req.query("includeHidden") === "1";
    const visible = all
      ? survey.questions
      : survey.questions.filter((q) => !q.hidden);
    return c.json({
      survey,
      totalResponses: responses.length,
      groupBy,
      groups: buildResults(survey, responses, groupBy, visible),
    });
  });

  admin.get("/export.csv", async (c) => {
    const survey = c.var.survey;
    const responses = await getAllResponses(c.var.db, survey.id);
    const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const header = survey.questions.flatMap((q: Question) =>
      q.type === "paired_spectrum"
        ? [esc(`${q.prompt} (before)`), esc(`${q.prompt} (after)`)]
        : [esc(q.prompt)]
    ).join(",");
    const optLabel = (q: Question, id: string) =>
      q.options.find((o) => o.id === id)?.label ?? id;
    const rows = responses.map((r) =>
      survey.questions.flatMap((q: Question) => {
        const v = r[q.id];
        if (q.type === "paired_spectrum") {
          const answer = normalizeSpectrumAnswer(v);
          return [esc(answer?.before), esc(answer?.after)];
        }
        if (Array.isArray(v)) {
          return esc(v.map((x) => optLabel(q, x)).join(" > "));
        }
        if (
          q.type === "matrix_2x2"
        ) {
          const position = normalizeMatrixAnswer(v, q.matrixSize ?? 2);
          if (position) {
            return esc(
              `x ${position.x.toFixed(3)}, y ${
                position.y.toFixed(3)
              } from top-left`,
            );
          }
        }
        if (typeof v === "string" && q.options.length) return esc(optLabel(q, v));
        return esc(v);
      }).join(",")
    );
    return c.body([header, ...rows].join("\n"), 200, {
      "Content-Type": "text/csv",
      "Content-Disposition":
        `attachment; filename="${survey.slug}-responses.csv"`,
    });
  });

  admin.delete("/responses", async (c) => {
    const survey = c.var.survey;
    await clearResponses(c.var.db, survey.id);
    return c.json({ ok: true });
  });

  admin.delete("/", async (c) => {
    const survey = c.var.survey;
    await deleteSurvey(c.var.db, survey.id);
    return c.json({ ok: true });
  });

  app.route("/api/admin/:key", admin);

  app.onError((err, c) => {
    if (err instanceof RequestError) {
      return c.json({ error: err.message }, err.status);
    }
    if (err instanceof QuestionValidationError) {
      return c.json({ error: err.message }, 400);
    }
    if (err instanceof HTTPException) return err.getResponse();
    throw err;
  });

  return app;
}

export default createApp();
