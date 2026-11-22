import { deepStrictEqual, equal, ok, throws } from "node:assert/strict";
import { test } from "vitest";
import { biatSchedule, scoreBiat } from "./biat.ts";
import type { BiatAttempt, BiatSchedule } from "../shared/types.ts";

function attempt(schedule: BiatSchedule): BiatAttempt {
  return {
    version: schedule.version,
    blocks: schedule.blocks.map(({ target, trials }) =>
      trials.map((trial, i) => ({
        ...trial,
        latencyMs: (target === "targetA" ? 500 : 700) + (i % 2) * 100,
        initialLatencyMs: 500,
        input: "keyboard",
      }))
    ),
  };
}

test("Brief IAT schedules are reproducible and alternate balanced categories", async () => {
  const first = await biatSchedule("survey", "question", "a");
  deepStrictEqual(await biatSchedule("survey", "question", "a"), first);
  const starts = await Promise.all(
    Array.from({ length: 12 }, (_, i) => biatSchedule("survey", "question", String(i))),
  );
  equal(new Set(starts.map((schedule) => schedule.blocks[0].target)).size, 2);
  for (const block of first.blocks) {
    equal(block.trials.length, 20);
    equal(block.trials.slice(0, 4).filter((trial) => trial.category === "targetA").length, 2);
    equal(new Set(block.trials.slice(4).map(({ category, stimulus }) => `${category}:${stimulus}`)).size, 16);
    ok(block.trials.slice(4).every(({ category }, i) => category.startsWith("target") === (i % 2 === 0)));
  }
});

test("Brief IAT D-score is stable under block reversal and handles unusable trials", async () => {
  const schedule = await biatSchedule("survey", "question", "a");
  const payload = attempt(schedule);
  payload.blocks[0].slice(0, 4).forEach((trial) => { trial.initialLatencyMs = 1; });
  // Retained values are 500/600 and 700/800, eight each (sample sum of squares = 400,000).
  const expected = 200 / Math.sqrt(400000 / 31);
  equal(scoreBiat(schedule, payload).score, expected);
  const reversed: BiatSchedule = { ...schedule, blocks: [schedule.blocks[1], schedule.blocks[0]] };
  equal(scoreBiat(reversed, attempt(reversed)).score, expected);

  const fast = attempt(schedule);
  fast.blocks[0].slice(4, 8).forEach((trial) => { trial.initialLatencyMs = 200; });
  equal(scoreBiat(schedule, fast).status, "too_fast");
  const slow = attempt(schedule);
  slow.blocks[0].forEach((trial) => { trial.latencyMs = 10001; });
  equal(scoreBiat(schedule, slow).status, "insufficient_data");
  const constant = attempt(schedule);
  constant.blocks.flat().forEach((trial) => { trial.latencyMs = 600; });
  equal(scoreBiat(schedule, constant).status, "no_variance");

  const invalid = attempt(schedule);
  invalid.blocks[0][0].stimulus = -1;
  throws(() => scoreBiat(schedule, invalid), /order or timing/);
});
