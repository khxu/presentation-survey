import { deepStrictEqual } from "node:assert/strict";
import type { Question, Survey } from "../shared/types.ts";
import { aggregateQuestion, buildResults } from "./aggregate.ts";

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
