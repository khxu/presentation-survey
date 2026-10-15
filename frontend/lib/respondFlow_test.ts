import { equal } from "node:assert/strict";
import type { Question } from "../../shared/types.ts";
import { newQuestion } from "../../shared/questions.ts";
import {
  hasCurrentAnswer,
  questionStepKey,
  reconcileQuestionStep,
  spectrumAnswerStage,
} from "./respondFlow.ts";

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

Deno.test("opening after creates a new completion step without changing question identity", () => {
  const before = newQuestion("paired_spectrum");
  const after = { ...before, spectrumPhase: "after" as const };
  equal(questionStepKey(before) === questionStepKey(after), false);
  equal(reconcileQuestionStep([before], [after], 0), 0);
  equal(spectrumAnswerStage(after, { before: 0 }), "after");
  equal(hasCurrentAnswer(after, { before: 0 }, { before: 0 }), false);
  equal(hasCurrentAnswer(after, { before: 0, after: 0 }, { before: 0 }), true);
});

Deno.test("late respondents save a baseline before advancing to their after answer", () => {
  const after = {
    ...newQuestion("paired_spectrum"),
    spectrumPhase: "after" as const,
  };
  equal(spectrumAnswerStage(after, undefined), "before");
  equal(hasCurrentAnswer(after, undefined, undefined), false);
  equal(hasCurrentAnswer(after, { before: 50 }, undefined), true);
  equal(spectrumAnswerStage(after, { before: 50 }), "after");
  equal(hasCurrentAnswer(after, { before: 50 }, { before: 50 }), false);
});
