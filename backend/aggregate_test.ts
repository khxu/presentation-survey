import { deepStrictEqual } from "node:assert/strict";
import type { Question, Survey } from "../shared/types.ts";
import { aggregateQuestion, buildResults } from "./aggregate.ts";
import { newQuestion } from "../shared/questions.ts";

function multiChoice(id = "tools"): Question {
  return {
    id,
    position: 0,
    type: "multi_choice",
    prompt: "Which tools do you use?",
    options: [
      { id: "a", label: "Alpha" },
      { id: "b", label: "Beta" },
      { id: "c", label: "Gamma" },
    ],
    isDemographic: false,
    required: false,
    released: true,
    hidden: false,
  };
}

Deno.test("multi-choice aggregation counts exact canonical intersections", () => {
  const q = multiChoice();
  const aggregate = aggregateQuestion(q, [
    { [q.id]: ["b", "a", "a", "unknown"] },
    { [q.id]: ["a", "b"] },
    { [q.id]: ["a"] },
    { [q.id]: [] },
    { other: ["a"] },
    { [q.id]: "a" },
  ]);

  deepStrictEqual(aggregate.responseCount, 4);
  deepStrictEqual(aggregate.counts, { a: 3, b: 2, c: 0 });
  deepStrictEqual(aggregate.intersections, [
    { optionIds: ["a", "b"], count: 2 },
    { optionIds: ["a"], count: 1 },
    { optionIds: [], count: 1 },
  ]);
});

Deno.test("multi-choice intersection ties follow question option order", () => {
  const q = multiChoice();
  deepStrictEqual(
    aggregateQuestion(q, [
      { [q.id]: ["b"] },
      { [q.id]: ["a", "c"] },
      { [q.id]: ["a"] },
      { [q.id]: ["c"] },
      { [q.id]: [] },
    ]).intersections,
    [
      { optionIds: ["a"], count: 1 },
      { optionIds: ["a", "c"], count: 1 },
      { optionIds: ["b"], count: 1 },
      { optionIds: ["c"], count: 1 },
      { optionIds: [], count: 1 },
    ],
  );
});

Deno.test("faceted results aggregate independent pick-many intersections", () => {
  const demographic: Question = {
    ...multiChoice("role"),
    type: "single_choice",
    prompt: "Role",
    options: [
      { id: "dev", label: "Developer" },
      { id: "design", label: "Designer" },
    ],
    isDemographic: true,
  };
  const q = multiChoice();
  q.position = 1;
  const survey: Survey = {
    id: "survey",
    slug: "survey",
    title: "Survey",
    description: "",
    resultsVisible: true,
    acceptingResponses: true,
    audienceFacets: true,
    createdAt: "",
    questions: [demographic, q],
  };

  const groups = buildResults(
    survey,
    [
      { [demographic.id]: "dev", [q.id]: ["a", "b"] },
      { [demographic.id]: "dev", [q.id]: ["a"] },
      { [demographic.id]: "design", [q.id]: ["b"] },
    ],
    demographic.id,
    survey.questions,
  );

  deepStrictEqual(
    groups.map((group) => ({
      key: group.key,
      intersections: group.aggregates[0]?.intersections,
    })),
    [
      {
        key: "dev",
        intersections: [
          { optionIds: ["a"], count: 1 },
          { optionIds: ["a", "b"], count: 1 },
        ],
      },
      {
        key: "design",
        intersections: [{ optionIds: ["b"], count: 1 }],
      },
    ],
  );
});

Deno.test("matrix aggregation returns points and derived quadrant counts", () => {
  const q = {
    ...newQuestion("matrix_2x2"),
    id: "matrix",
    matrixSubjectLabel: "Initiative",
  };
  const aggregate = aggregateQuestion(q, [
    { matrix: { x: 0.1, y: 0.2 } },
    { matrix: { x: 0.9, y: 0.8 } },
    { matrix: { row: 0, column: 1 } } as any,
  ]);
  deepStrictEqual(aggregate.matrixPoints, [
    { x: 0.1, y: 0.2 },
    { x: 0.9, y: 0.8 },
    { x: 0.75, y: 0.25 },
  ]);
  deepStrictEqual(aggregate.matrixCounts, {
    "0,0": 1,
    "0,1": 1,
    "1,0": 0,
    "1,1": 1,
  });
});

Deno.test("paired statistics retain every swing and exclude incomplete or invalid pairs", () => {
  const q = { ...newQuestion("paired_spectrum"), id: "impact" };
  const result = aggregateQuestion(q, [
    { impact: { before: 0, after: 100 } },
    { impact: { before: 50, after: 49 } },
    { impact: { before: 20, after: 19 } },
    { impact: { before: 0 } },
    { impact: { before: 101, after: 100 } },
    {},
  ]);
  deepStrictEqual(result.responseCount, 4);
  deepStrictEqual(result.pairedSpectrum, {
    beforeCount: 4,
    afterCount: 3,
    beforeDistribution: [2, 1, 0, 0, 1, 0, 0, 0, 0, 0],
    afterDistribution: [0, 1, 0, 0, 1, 0, 0, 0, 0, 1],
    pairCount: 3,
    meanBefore: 23.33,
    meanAfter: 56,
    meanChange: 32.67,
    leftCount: 2,
    rightCount: 1,
    unchangedCount: 0,
    pairs: [
      { before: 0, after: 100 },
      { before: 20, after: 19 },
      { before: 50, after: 49 },
    ],
  });
  deepStrictEqual(
    aggregateQuestion(q, [{ impact: { before: 0 } }]).pairedSpectrum,
    {
      beforeCount: 1,
      afterCount: 0,
      beforeDistribution: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      afterDistribution: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      pairCount: 0,
      meanBefore: null,
      meanAfter: null,
      meanChange: null,
      leftCount: 0,
      rightCount: 0,
      unchangedCount: 0,
      pairs: [],
    },
  );
});

Deno.test("paired facet means use matched respondents, not differences of unpaired means", () => {
  const demographic = {
    ...multiChoice("role"),
    type: "single_choice" as const,
    isDemographic: true,
  };
  const q = { ...newQuestion("paired_spectrum"), id: "impact" };
  const survey: Survey = {
    id: "s",
    slug: "s",
    title: "Survey",
    description: "",
    createdAt: "",
    resultsVisible: true,
    acceptingResponses: true,
    audienceFacets: true,
    questions: [demographic, q],
  };
  const groups = buildResults(
    survey,
    [
      { role: "a", impact: { before: 0, after: 10 } },
      { role: "a", impact: { before: 100 } },
      { role: "b", impact: { before: 100, after: 0 } },
      { role: "b", impact: { before: 50, after: 50 } },
    ],
    "role",
    survey.questions,
  );
  deepStrictEqual(
    groups.map((g) => g.aggregates[0].pairedSpectrum?.meanChange),
    [10, -50, null],
  );
  deepStrictEqual(groups[1].aggregates[0].pairedSpectrum?.unchangedCount, 1);
  deepStrictEqual(groups[0].aggregates[0].pairedSpectrum?.beforeDistribution, [
    1,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
  ]);
  deepStrictEqual(groups[1].aggregates[0].pairedSpectrum?.afterDistribution, [
    1,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    0,
  ]);
});

Deno.test("spectrum histograms include every integer and phase independently without pairs", () => {
  const q = { ...newQuestion("paired_spectrum"), id: "impact" };
  const allBefore = Array.from(
    { length: 101 },
    (_, before) => ({ impact: { before } }),
  );
  const result = aggregateQuestion(q, [...allBefore, {
    impact: { after: 100 },
  }]).pairedSpectrum!;
  deepStrictEqual(result.beforeCount, 101);
  deepStrictEqual(result.afterCount, 1);
  deepStrictEqual(result.pairCount, 0);
  deepStrictEqual(result.beforeDistribution, [
    11,
    10,
    10,
    10,
    10,
    10,
    10,
    10,
    10,
    10,
  ]);
  deepStrictEqual(result.afterDistribution, [0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
  deepStrictEqual(result.meanChange, null);
  const empty = aggregateQuestion(q, []).pairedSpectrum!;
  deepStrictEqual(empty.beforeDistribution, Array(10).fill(0));
  deepStrictEqual(empty.afterDistribution, Array(10).fill(0));
});
