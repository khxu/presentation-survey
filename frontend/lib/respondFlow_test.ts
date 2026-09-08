import { equal } from "node:assert/strict";
import type { Question } from "../../shared/types.ts";
import { reconcileQuestionStep } from "./respondFlow.ts";

function question(id: string): Question {
  return {
    id,
    position: 0,
    type: "free_text",
    prompt: id,
    options: [],
    isDemographic: false,
    required: false,
    released: true,
    hidden: false,
  };
}

Deno.test("respondent stays on the same question when earlier questions change", () => {
  const a = question("a");
  const b = question("b");
  const c = question("c");
  equal(reconcileQuestionStep([a, b], [c, a, b], 1), 2);
  equal(reconcileQuestionStep([c, a, b], [a, b], 2), 1);
});

Deno.test("respondent finishes safely when the active question is unreleased", () => {
  const a = question("a");
  const b = question("b");
  equal(reconcileQuestionStep([a, b], [a], 1), 1);
});

Deno.test("intro and completed states remain stable across releases", () => {
  const a = question("a");
  equal(reconcileQuestionStep([], [a], -1), -1);
  equal(reconcileQuestionStep([a], [a, question("b")], 1), 2);
});
