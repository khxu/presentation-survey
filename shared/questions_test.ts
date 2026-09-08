import { deepStrictEqual, notEqual, ok, throws } from "node:assert/strict";
import {
  clampMatrixAnswerPosition,
  clampMatrixReferencePosition,
  isMatrixAnswer,
  matrixAnswerCell,
  matrixCellKey,
  matrixReferenceDefaultPosition,
  newQuestion,
  normalizeApprovedQuestion,
  normalizeDraft,
  normalizeMatrixAnswer,
  normalizeStoredQuestions,
  QuestionValidationError,
  referencesWithinSize,
} from "./questions.ts";
import { hasOptions, QUESTION_TYPE_LABELS } from "./types.ts";
import type { QuestionType, Survey } from "./types.ts";
import { aggregateQuestion } from "../backend/aggregate.ts";
import { sanitizeAnswers } from "../backend/surveys.ts";

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
    if (type === "matrix_2x2") {
      question.matrixSubjectLabel = "Initiative";
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

Deno.test("matrix questions normalize configuration and replace untrusted reference IDs", () => {
  const question = newQuestion("matrix_2x2");
  deepStrictEqual(
    [
      question.matrixSize,
      question.matrixSubjectLabel,
      question.matrixAxisLabels,
      question.matrixReferences,
    ],
    [
      2,
      "",
      { left: "Left", right: "Right", bottom: "Bottom", top: "Top" },
      [],
    ],
  );

  const draft = normalizeDraft({
    type: "matrix_2x2",
    prompt: "Where should this initiative go?",
    options: [{ id: "ignored", label: "Ignored" }],
    matrixSize: 2,
    matrixSubjectLabel: " Migration ",
    matrixAxisLabels: {
      left: " Not urgent ",
      right: "Urgent",
      bottom: "Not important",
      top: " Important ",
    },
    matrixReferences: [
      { id: "untrusted-a", row: 0, column: 1, label: " Do now " },
      { id: "untrusted-b", row: 1, column: 0, label: "Defer" },
    ],
  });

  deepStrictEqual(draft.options, []);
  deepStrictEqual(draft.matrixSize, 2);
  deepStrictEqual(draft.matrixSubjectLabel, "Migration");
  deepStrictEqual(draft.matrixAxisLabels, {
    left: "Not urgent",
    right: "Urgent",
    bottom: "Not important",
    top: "Important",
  });
  deepStrictEqual(
    draft.matrixReferences?.map(({
      row,
      column,
      label,
      symbolX,
      symbolY,
      labelX,
      labelY,
    }) => ({
      row,
      column,
      label,
      symbolX,
      symbolY,
      labelX,
      labelY,
    })),
    [
      {
        row: 0,
        column: 1,
        label: "Do now",
        symbolX: 0.24,
        symbolY: 0.2,
        labelX: 0.44,
        labelY: 0.2,
      },
      {
        row: 1,
        column: 0,
        label: "Defer",
        symbolX: 0.24,
        symbolY: 0.2,
        labelX: 0.44,
        labelY: 0.2,
      },
    ],
  );
  notEqual(draft.matrixReferences?.[0].id, "untrusted-a");
  notEqual(draft.matrixReferences?.[0].id, draft.matrixReferences?.[1].id);
});

Deno.test("matrix validation rejects unsupported grids, incomplete axes, and invalid references", () => {
  const base = {
    type: "matrix_2x2",
    prompt: "Place it",
    options: [],
    matrixSize: 2,
    matrixSubjectLabel: "Initiative",
    matrixAxisLabels: {
      left: "Low",
      right: "High",
      bottom: "Easy",
      top: "Hard",
    },
    matrixReferences: [],
  };
  for (
    const patch of [
      { matrixSize: 3 },
      { matrixSize: 4 },
      { matrixSubjectLabel: "" },
      { matrixSubjectLabel: "x".repeat(121) },
      {
        matrixAxisLabels: {
          left: "",
          right: "High",
          bottom: "Easy",
          top: "Hard",
        },
      },
      { matrixReferences: [{ row: -1, column: 0, label: "Outside" }] },
      { matrixReferences: [{ row: 2, column: 0, label: "Outside" }] },
      { matrixReferences: [{ row: 0.5, column: 0, label: "Fractional" }] },
      { matrixReferences: [{ row: 0, column: 0, label: " " }] },
      {
        matrixReferences: [{
          row: 0,
          column: 0,
          label: "Partial position",
          x: 0.5,
        }],
      },
      {
        matrixReferences: [{
          row: 0,
          column: 0,
          label: "Partial symbol position",
          symbolX: 0.5,
        }],
      },
      {
        matrixReferences: [{
          row: 0,
          column: 0,
          label: "Partial label position",
          labelY: 0.5,
        }],
      },
      {
        matrixReferences: [{
          row: 0,
          column: 0,
          label: "Outside position",
          x: 0,
          y: 1,
        }],
      },
    ]
  ) {
    throws(
      () => normalizeDraft({ ...base, ...patch }),
      QuestionValidationError,
    );
  }
});

Deno.test("matrix approval disables demographics and stored matrices receive safe defaults", () => {
  const raw = {
    type: "matrix_2x2",
    prompt: "Place it",
    options: [],
    matrixSize: 2,
    matrixSubjectLabel: "Initiative",
    matrixAxisLabels: {
      left: "Low",
      right: "High",
      bottom: "Easy",
      top: "Hard",
    },
    matrixReferences: [{ id: "old", row: 1, column: 1, label: "Reference" }],
    isDemographic: true,
  };
  deepStrictEqual(normalizeApprovedQuestion(raw).isDemographic, false);

  const stored = normalizeStoredQuestions([{
    ...newQuestion("matrix_2x2"),
    matrixAxisLabels: undefined,
    matrixReferences: [
      { id: "inside", row: 1, column: 1, label: "Inside" },
      { id: "outside", row: 2, column: 2, label: "Outside" },
    ],
  }])[0];
  deepStrictEqual(stored.matrixSize, 2);
  deepStrictEqual(stored.matrixSubjectLabel, "Item");
  deepStrictEqual(stored.matrixAxisLabels, {
    left: "Left",
    right: "Right",
    bottom: "Bottom",
    top: "Top",
  });
  deepStrictEqual(stored.matrixReferences?.map((reference) => reference.id), [
    "inside",
  ]);
  deepStrictEqual(
    stored.matrixReferences?.map(({
      symbolX,
      symbolY,
      labelX,
      labelY,
    }) => ({ symbolX, symbolY, labelX, labelY })),
    [{ symbolX: 0.24, symbolY: 0.2, labelX: 0.44, labelY: 0.2 }],
  );
});

Deno.test("stored 4x4 and 6x6 matrices are rejected", () => {
  for (const matrixSize of [4, 6]) {
    throws(
      () =>
        normalizeStoredQuestions([{
          ...newQuestion("matrix_2x2"),
          matrixSize,
        }]),
      QuestionValidationError,
    );
  }
});

Deno.test("matrix reference positions are normalized, preserved, and staggered per cell", () => {
  deepStrictEqual(matrixReferenceDefaultPosition(0), { x: 0.24, y: 0.2 });
  deepStrictEqual(matrixReferenceDefaultPosition(1), { x: 0.76, y: 0.2 });
  deepStrictEqual(clampMatrixReferencePosition(-1), 0.08);
  deepStrictEqual(clampMatrixReferencePosition(2), 0.92);
  deepStrictEqual(clampMatrixReferencePosition(Number.NaN), 0.5);

  const stored = normalizeStoredQuestions([{
    ...newQuestion("matrix_2x2"),
    matrixReferences: [
      {
        id: "positioned",
        row: 0,
        column: 0,
        label: "Positioned",
        x: 0.4,
        y: 0.7,
      },
      {
        id: "legacy-same-cell",
        row: 0,
        column: 0,
        label: "Legacy",
      },
      {
        id: "invalid-stored",
        row: 1,
        column: 1,
        label: "Invalid",
        x: 5,
        y: -2,
      },
    ],
  }])[0].matrixReferences;

  deepStrictEqual(
    stored?.map(({ id, symbolX, symbolY, labelX, labelY }) => ({
      id,
      symbolX,
      symbolY,
      labelX,
      labelY,
    })),
    [
      {
        id: "positioned",
        symbolX: 0.4,
        symbolY: 0.7,
        labelX: 0.6,
        labelY: 0.7,
      },
      {
        id: "legacy-same-cell",
        symbolX: 0.76,
        symbolY: 0.2,
        labelX: 0.56,
        labelY: 0.2,
      },
      {
        id: "invalid-stored",
        symbolX: 0.24,
        symbolY: 0.2,
        labelX: 0.44,
        labelY: 0.2,
      },
    ],
  );

  const draft = normalizeDraft({
    type: "matrix_2x2",
    prompt: "Place it",
    options: [],
    matrixSize: 2,
    matrixSubjectLabel: "Initiative",
    matrixAxisLabels: {
      left: "Low",
      right: "High",
      bottom: "Easy",
      top: "Hard",
    },
    matrixReferences: [{
      row: 1,
      column: 0,
      label: "Custom",
      x: 0.31,
      y: 0.84,
    }],
  });
  deepStrictEqual(
    draft.matrixReferences?.map(({ symbolX, symbolY, labelX, labelY }) => ({
      symbolX,
      symbolY,
      labelX,
      labelY,
    })),
    [{ symbolX: 0.31, symbolY: 0.84, labelX: 0.51, labelY: 0.84 }],
  );
});

Deno.test("matrix helpers, sanitization, and aggregation support continuous and legacy positions", () => {
  const q = {
    ...newQuestion("matrix_2x2"),
    id: "matrix",
    prompt: "Place it",
    matrixSize: 2 as const,
  };
  const survey: Survey = {
    id: "survey",
    slug: "matrix",
    title: "Matrix",
    description: "",
    resultsVisible: true,
    acceptingResponses: true,
    audienceFacets: false,
    createdAt: "",
    questions: [q],
  };

  deepStrictEqual(isMatrixAnswer({ x: 0.75, y: 0.25 }), true);
  deepStrictEqual(isMatrixAnswer({ x: 1.1, y: 0.25 }), false);
  deepStrictEqual(
    normalizeMatrixAnswer({ row: 0, column: 1 }, 2),
    { x: 0.75, y: 0.25 },
  );
  deepStrictEqual(normalizeMatrixAnswer({ row: 2, column: 0 }, 2), null);
  deepStrictEqual(matrixAnswerCell({ x: 1, y: 1 }, 2), {
    row: 1,
    column: 1,
  });
  deepStrictEqual(clampMatrixAnswerPosition(-1), 0);
  deepStrictEqual(clampMatrixAnswerPosition(2), 1);
  deepStrictEqual(
    referencesWithinSize([
      { id: "a", row: 1, column: 1, label: "Inside" },
      { id: "b", row: 2, column: 0, label: "Outside" },
    ], 2).map((reference) => reference.id),
    ["a"],
  );
  deepStrictEqual(
    sanitizeAnswers(survey, { matrix: { x: 0.1234, y: 0.8765, extra: true } }),
    {
      matrix: { x: 0.123, y: 0.877 },
    },
  );
  deepStrictEqual(
    sanitizeAnswers(survey, { matrix: { row: 1, column: 0 } }),
    { matrix: { x: 0.25, y: 0.75 } },
  );
  deepStrictEqual(
    sanitizeAnswers(survey, { matrix: { x: 2, y: 0 } }),
    {},
  );
  deepStrictEqual(sanitizeAnswers(survey, { matrix: [1, 0] }), {});

  const aggregate = aggregateQuestion(q, [
    { matrix: { x: 0.1, y: 0.1 } },
    { matrix: { x: 0.4, y: 0.4 } },
    { matrix: { row: 1, column: 0 } } as any,
    { matrix: { row: 9, column: 9 } },
  ]);
  deepStrictEqual(aggregate.responseCount, 3);
  deepStrictEqual(aggregate.matrixCounts?.[matrixCellKey(0, 0)], 2);
  deepStrictEqual(aggregate.matrixCounts?.[matrixCellKey(1, 0)], 1);
  deepStrictEqual(Object.keys(aggregate.matrixCounts ?? {}).length, 4);
  deepStrictEqual(aggregate.matrixPoints, [
    { x: 0.1, y: 0.1 },
    { x: 0.4, y: 0.4 },
    { x: 0.25, y: 0.75 },
  ]);
});
