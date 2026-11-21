import { spawnSync } from "node:child_process";

const target = process.argv[2];
if (target !== "production" && target !== "staging") {
  throw new Error("Specify the Worker target: npm run deploy -- staging|production");
}
const variable = target === "production"
  ? "D1_PRODUCTION_DATABASE_ID"
  : "D1_STAGING_DATABASE_ID";
const databaseId = process.env[variable];
if (
  !databaseId ||
  !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(databaseId) ||
  databaseId === "00000000-0000-4000-8000-000000000001"
) {
  throw new Error(`Set ${variable} to the provisioned D1 database ID.`);
}
if (target === "staging" && databaseId === process.env.D1_PRODUCTION_DATABASE_ID) {
  throw new Error("Staging and production must use different D1 databases.");
}
const dryRun = process.argv[3] === "--dry-run";
if (process.argv.length !== (dryRun ? 4 : 3)) {
  throw new Error("The only supported optional argument is --dry-run.");
}

const deploy = spawnSync(
  "cf",
  ["deploy", "--mode", target, "--no-provision", ...(dryRun ? ["--dry-run"] : [])],
  { stdio: "inherit" },
);
if (deploy.error) throw deploy.error;
process.exitCode = deploy.status ?? 1;
