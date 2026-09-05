import type { Answers, ResultsPayload, Survey } from "../../shared/types.ts";

async function j<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error ?? `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  createSurvey: (title: string) =>
    fetch("/api/surveys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }).then((r) => j<{ slug: string; adminKey: string }>(r)),

  getSurvey: (slug: string) =>
    fetch(`/api/s/${slug}`, { credentials: "same-origin" }).then((r) =>
      j<{ survey: Survey; existing: Answers | null }>(r)
    ),

  respond: (slug: string, answers: Answers) =>
    fetch(`/api/s/${slug}/respond`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    }).then((r) => j<{ ok: true }>(r)),

  publicResults: (slug: string, groupBy: string | null) =>
    fetch(`/api/s/${slug}/results${groupBy ? `?groupBy=${groupBy}` : ""}`).then((r) => j<ResultsPayload>(r)),

  admin: {
    get: (key: string) => fetch(`/api/admin/${key}`).then((r) => j<{ survey: Survey; totalResponses: number }>(r)),
    patch: (key: string, patch: Partial<Survey>) =>
      fetch(`/api/admin/${key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).then((r) => j<{ survey: Survey }>(r)),
    results: (key: string, groupBy: string | null, includeHidden = true) =>
      fetch(
        `/api/admin/${key}/results?includeHidden=${includeHidden ? 1 : 0}${groupBy ? `&groupBy=${groupBy}` : ""}`,
      ).then((r) => j<ResultsPayload>(r)),
    clearResponses: (key: string) =>
      fetch(`/api/admin/${key}/responses`, { method: "DELETE" }).then((r) => j<{ ok: true }>(r)),
    deleteSurvey: (key: string) => fetch(`/api/admin/${key}`, { method: "DELETE" }).then((r) => j<{ ok: true }>(r)),
  },
};

export function uid(): string {
  return Math.random().toString(36).slice(2, 8);
}
