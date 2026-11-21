import { bindings, defineConfig } from "cf/config";

export default defineConfig(({ mode }) => {
  const target = mode === "staging" ? "staging" : "production";
  const databaseId = process.env[target === "staging"
    ? "D1_STAGING_DATABASE_ID"
    : "D1_PRODUCTION_DATABASE_ID"];

  return {
    worker: {
      name: target === "staging" ? "presentation-survey-staging" : "presentation-survey",
      entrypoint: "./index.ts",
      compatibilityDate: "2026-11-21",
      workersDev: true,
      previewUrls: false,
      assets: { htmlHandling: "none", notFoundHandling: "none" },
      env: {
        ASSETS: bindings.assets(),
        DB: bindings.d1({ id: databaseId ?? "00000000-0000-4000-8000-000000000001" }),
        WRITES_PAUSED: bindings.text(process.env.SURVEY_WRITES_PAUSED ?? (mode === "development" ? "0" : "1")),
      },
      observability: {
        enabled: true,
        logs: { enabled: true, invocationLogs: false },
        traces: { enabled: false },
      },
    },
  };
});
