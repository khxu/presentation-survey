import { BIAT_VERSION, BIAT_WARMUP } from "../shared/biat.ts";
import type {
  BiatBlock,
  BiatCategory,
  BiatSchedule,
  BiatScore,
  BiatTarget,
  BiatTrial,
  BiatTrialResult,
} from "../shared/types.ts";
import { RequestError } from "./errors.ts";
import { sha256 } from "./db.ts";

export async function biatSchedule(
  surveyId: string,
  questionId: string,
  sid: string,
): Promise<BiatSchedule> {
  const hash = await sha256(JSON.stringify(["biat", BIAT_VERSION, surveyId, questionId, sid]));
  let state = parseInt(hash.slice(0, 8), 16) || 1;
  function shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      const j = (state >>> 0) % (i + 1);
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }
  const examples = (category: BiatCategory): BiatTrial[] =>
    [0, 1, 2, 3].map((stimulus) => ({ category, stimulus }));
  function block(target: BiatTarget): BiatBlock {
    const warmup = shuffle([
      ...shuffle(examples("targetA")).slice(0, 2),
      ...shuffle(examples("targetB")).slice(0, 2),
    ]);
    const targets = shuffle([...examples("targetA"), ...examples("targetB")]);
    const attributes = shuffle([...examples("focalAttribute"), ...examples("otherAttribute")]);
    return { target, trials: [...warmup, ...targets.flatMap((trial, i) => [trial, attributes[i]])] };
  }
  const first = parseInt(hash.slice(8, 10), 16) % 2 === 0 ? "targetA" : "targetB";
  return { version: BIAT_VERSION, blocks: [block(first), block(first === "targetA" ? "targetB" : "targetA")] };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value));
}

function validLatency(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) &&
    value >= 0 && value <= 24 * 60 * 60 * 1000;
}

export function scoreBiat(schedule: BiatSchedule, raw: unknown): BiatScore {
  const { version, blocks } = record(raw);
  if (version !== schedule.version || !Array.isArray(blocks) || blocks.length !== 2) {
    throw new RequestError("Submit both blocks of the current Brief IAT.", 400);
  }
  let fast = 0;
  let retained = 0;
  const inputs = new Set<BiatTrialResult["input"]>();
  const byTarget = new Map<BiatTarget, number[]>();
  schedule.blocks.forEach(({ target, trials }, b) => {
    const submitted: unknown = blocks[b];
    if (!Array.isArray(submitted) || submitted.length !== trials.length) {
      throw new RequestError("Brief IAT blocks must contain every trial.", 400);
    }
    const latencies: number[] = [];
    trials.forEach(({ category, stimulus }, i) => {
      const trial = record(submitted[i]);
      const { latencyMs, initialLatencyMs, input } = trial;
      if (trial.category !== category || trial.stimulus !== stimulus ||
        !validLatency(latencyMs) || !validLatency(initialLatencyMs) ||
        initialLatencyMs > latencyMs || (input !== "keyboard" && input !== "pointer")) {
        throw new RequestError("Brief IAT trial order or timing is invalid.", 400);
      }
      inputs.add(input);
      if (i < BIAT_WARMUP || latencyMs > 10000) return;
      retained++;
      if (initialLatencyMs < 300) fast++;
      latencies.push(Math.min(2000, Math.max(400, latencyMs)));
    });
    byTarget.set(target, latencies);
  });
  const result = {
    version: schedule.version,
    firstTarget: schedule.blocks[0].target,
    input: inputs.has("keyboard") ? (inputs.has("pointer") ? "mixed" : "keyboard") : "pointer",
  } satisfies Pick<BiatScore, "version" | "firstTarget" | "input">;
  if (fast > retained * 0.1) return { ...result, score: null, status: "too_fast" };
  const a = byTarget.get("targetA") ?? [];
  const b = byTarget.get("targetB") ?? [];
  if (a.length < 2 || b.length < 2) return { ...result, score: null, status: "insufficient_data" };
  const mean = (values: number[]) => values.reduce((sum, n) => sum + n, 0) / values.length;
  const combined = [...a, ...b];
  const center = mean(combined);
  const sd = Math.sqrt(combined.reduce((sum, n) => sum + (n - center) ** 2, 0) / (combined.length - 1));
  if (sd === 0) return { ...result, score: null, status: "no_variance" };
  return { ...result, score: (mean(b) - mean(a)) / sd, status: "scored" };
}
