import { deepStrictEqual, notEqual, ok, throws } from "node:assert/strict";
import {
  newQuestion,
  normalizeApprovedQuestion,
  normalizeDraft,
  normalizeStoredQuestions,
  QuestionValidationError,
} from "./questions.ts";
import { hasOptions, QUESTION_TYPE_LABELS } from "./types.ts";
import type { QuestionType } from "./types.ts";
import { aggregateQuestion } from "../backend/aggregate.ts";

Deno.test("all question types normalize, preserving participant fields only", () => {
  for (const type of Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]) {
    const question = newQuestion(type);
    question.prompt = "  Audience question?  ";
    if (hasOptions(type)) {
      question.options = [{ id: "a", label: " Yes " }, {
        id: "b",
        label: "No",
      }];
    }
    const draft = normalizeDraft({
      ...question,
      required: true,
      hidden: true,
      isDemographic: true,
    });
    deepStrictEqual(draft.prompt, "Audience question?");
    ok(
      !("required" in draft) && !("hidden" in draft) &&
        !("isDemographic" in draft) && !("id" in draft),
    );
    if (hasOptions(type)) {
      deepStrictEqual(draft.options.map((o) => o.label), ["Yes", "No"]);
      notEqual(draft.options[0].id, "a");
      notEqual(draft.options[0].id, draft.options[1].id);
    }
  }
});

Deno.test("reject invalid types, empty or oversized prompts, and malformed input", () => {
  for (
    const raw of [
      null,
      [],
      "question",
      {},
      { type: "toString", prompt: "hi" },
      { type: "unknown", prompt: "hi" },
      { type: "free_text", prompt: " " },
      { type: "free_text", prompt: "a".repeat(501) },
    ]
  ) {
    throws(() => normalizeDraft(raw), QuestionValidationError);
  }
});

Deno.test("validate option counts, labels, and duplicates", () => {
  const base = { type: "single_choice", prompt: "Pick one" };
  for (
    const options of [
      null,
      [],
      [{ label: "Only one" }],
      [{ label: "a" }, { label: " A " }],
      [{ label: "a" }, null],
      [{ label: "a" }, { label: " " }],
      [{ label: "a" }, { label: "b".repeat(121) }],
      Array.from({ length: 21 }, (_, i) => ({ label: `${i}` })),
    ]
  ) {
    throws(() => normalizeDraft({ ...base, options }), QuestionValidationError);
  }
  deepStrictEqual(
    normalizeDraft({
      type: "free_text",
      prompt: "Hi",
      options: [{ label: "ignored" }],
    }).options,
    [],
  );
});

Deno.test("validate bounded integer scales", () => {
  const base = { type: "scale", prompt: "Rate it" };
  for (
    const [scaleMin, scaleMax] of [
      [1, 1],
      [5, 1],
      [1.5, 5],
      ["1", 5],
      [0, 21],
      [-101, -100],
      [100, 101],
      [NaN, 5],
      [1, Infinity],
      [undefined, undefined],
    ]
  ) {
    throws(
      () => normalizeDraft({ ...base, scaleMin, scaleMax }),
      QuestionValidationError,
    );
  }
  deepStrictEqual(
    normalizeDraft({ ...base, scaleMin: 0, scaleMax: 20 }).scaleMax,
    20,
  );
});

Deno.test("approval uses fresh IDs, allows admin flags, and stays compatible with results", () => {
  const raw = {
    type: "single_choice",
    prompt: "Choose",
    id: "injected",
    position: 50,
    options: [{ id: "x", label: "Yes" }, { id: "y", label: "No" }],
    required: true,
    isDemographic: true,
    hidden: true,
  };
  const q = normalizeApprovedQuestion(raw);
  notEqual(q.id, raw.id);
  notEqual(q.options[0].id, raw.options[0].id);
  deepStrictEqual([
    q.position,
    q.required,
    q.released,
    q.hidden,
    q.isDemographic,
  ], [
    0,
    true,
    false,
    true,
    true,
  ]);
  const result = aggregateQuestion(q, [{ [q.id]: q.options[0].id }]);
  deepStrictEqual(result.counts?.[q.options[0].id], 1);
  notEqual(normalizeApprovedQuestion(raw).id, q.id);
  throws(
    () => normalizeApprovedQuestion({ ...raw, required: "yes" }),
    QuestionValidationError,
  );
  deepStrictEqual(
    normalizeApprovedQuestion({ ...raw, type: "free_text" }).isDemographic,
    false,
  );
});

Deno.test("stored questions preserve release state and default legacy questions to released", () => {
  const legacy = {
    ...newQuestion("free_text"),
    released: undefined,
    position: 20,
  };
  const onDeck = { ...newQuestion("free_text"), released: false, position: 30 };
  const normalized = normalizeStoredQuestions([legacy, onDeck]);
  deepStrictEqual(
    normalized.map((question) => [question.position, question.released]),
    [
      [0, true],
      [1, false],
    ],
  );
});
