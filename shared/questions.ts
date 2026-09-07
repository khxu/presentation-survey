import { DEFAULT_EMOJIS, hasOptions, QUESTION_TYPE_LABELS } from "./types.ts";
import type { Question, QuestionDraft, QuestionType } from "./types.ts";

export const QUESTION_LIMITS = {
  prompt: 500,
  optionLabel: 120,
  options: 20,
  scaleSteps: 21,
};

export class QuestionValidationError extends Error {}

export function newQuestion(type: QuestionType = "single_choice"): Question {
  return {
    id: crypto.randomUUID(),
    position: 0,
    type,
    prompt: "",
    options: hasOptions(type)
      ? (type === "emoji_reaction" ? DEFAULT_EMOJIS : ["", ""]).map((
        label,
      ) => ({
        id: crypto.randomUUID(),
        label,
      }))
      : [],
    ...(type === "scale" ? { scaleMin: 1, scaleMax: 5 } : {}),
    isDemographic: false,
    required: false,
    hidden: false,
  };
}

function record(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new QuestionValidationError("Provide a question object.");
  }
  return raw as Record<string, unknown>;
}

function text(raw: unknown, max: number, label: string): string {
  if (typeof raw !== "string" || !raw.trim() || raw.trim().length > max) {
    throw new QuestionValidationError(
      `${label} must contain 1-${max} characters.`,
    );
  }
  return raw.trim();
}

/** Ignore client IDs and admin flags; every approved question gets fresh identifiers. */
export function normalizeDraft(raw: unknown): QuestionDraft {
  const input = record(raw);
  if (
    typeof input.type !== "string" ||
    !Object.hasOwn(QUESTION_TYPE_LABELS, input.type)
  ) {
    throw new QuestionValidationError("Choose a supported question type.");
  }
  const type = input.type as QuestionType;
  const draft: QuestionDraft = {
    type,
    prompt: text(input.prompt, QUESTION_LIMITS.prompt, "Question prompt"),
    options: [],
  };
  if (hasOptions(type)) {
    if (
      !Array.isArray(input.options) || input.options.length < 2 ||
      input.options.length > QUESTION_LIMITS.options
    ) {
      throw new QuestionValidationError(
        `Provide 2-${QUESTION_LIMITS.options} options.`,
      );
    }
    draft.options = input.options.map((option) => ({
      id: crypto.randomUUID(),
      label: text(record(option).label, QUESTION_LIMITS.optionLabel, "Option"),
    }));
    if (
      new Set(draft.options.map((o) => o.label.toLowerCase())).size !==
        draft.options.length
    ) {
      throw new QuestionValidationError("Options must have distinct labels.");
    }
  }
  if (type === "scale") {
    const min = input.scaleMin;
    const max = input.scaleMax;
    if (
      typeof min !== "number" || typeof max !== "number" ||
      !Number.isSafeInteger(min) ||
      !Number.isSafeInteger(max) || min < -100 || max > 100 || min >= max ||
      max - min + 1 > QUESTION_LIMITS.scaleSteps
    ) {
      throw new QuestionValidationError(
        "Use integer scale bounds from -100 to 100, with 2-21 steps.",
      );
    }
    draft.scaleMin = min;
    draft.scaleMax = max;
  }
  return draft;
}

export function questionFromDraft(draft: QuestionDraft): Question {
  return { ...newQuestion(draft.type), ...draft };
}

export function normalizeApprovedQuestion(raw: unknown): Question {
  const input = record(raw);
  const question = questionFromDraft(normalizeDraft(raw));
  for (const key of ["required", "hidden", "isDemographic"] as const) {
    if (input[key] !== undefined && typeof input[key] !== "boolean") {
      throw new QuestionValidationError(`${key} must be a boolean.`);
    }
    question[key] = input[key] === true;
  }
  const canFacet = ["single_choice", "multi_choice", "scale", "emoji_reaction"]
    .includes(question.type);
  question.isDemographic = canFacet && question.isDemographic;
  return question;
}
