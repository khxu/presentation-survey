import { DEFAULT_EMOJIS, hasOptions, QUESTION_TYPE_LABELS } from "./types.ts";
import type {
  MatrixAnswer,
  MatrixAxisLabels,
  MatrixReference,
  MatrixSize,
  Option,
  Question,
  QuestionDraft,
  QuestionType,
} from "./types.ts";

export const QUESTION_LIMITS = {
  prompt: 500,
  optionLabel: 120,
  options: 20,
  scaleSteps: 21,
  matrixAxisLabel: 60,
  matrixReferenceLabel: 120,
  matrixReferences: 100,
};

export const MATRIX_REFERENCE_POSITION_MIN = 0.08;
export const MATRIX_REFERENCE_POSITION_MAX = 0.92;

const MATRIX_REFERENCE_DEFAULT_POSITIONS = [
  { x: 0.24, y: 0.2 },
  { x: 0.76, y: 0.2 },
  { x: 0.24, y: 0.8 },
  { x: 0.76, y: 0.8 },
  { x: 0.5, y: 0.2 },
  { x: 0.2, y: 0.5 },
  { x: 0.8, y: 0.5 },
  { x: 0.5, y: 0.8 },
  { x: 0.5, y: 0.5 },
] as const;

export const DEFAULT_MATRIX_AXIS_LABELS: MatrixAxisLabels = {
  left: "Left",
  right: "Right",
  bottom: "Bottom",
  top: "Top",
};

export class QuestionValidationError extends Error {}

export function canonicalizeChoiceSelection(
  options: Option[],
  raw: unknown,
): string[] | null {
  if (!Array.isArray(raw)) return null;
  const selected = new Set(
    raw.filter((value): value is string => typeof value === "string"),
  );
  return options.filter((option) => selected.has(option.id)).map((option) =>
    option.id
  );
}

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
    ...(type === "matrix_2x2"
      ? {
        matrixSize: 2 as MatrixSize,
        matrixAxisLabels: { ...DEFAULT_MATRIX_AXIS_LABELS },
        matrixReferences: [],
      }
      : {}),
    isDemographic: false,
    required: false,
    released: false,
    hidden: false,
  };
}

/** Questions saved before progressive release existed remain audience-visible. */
export function normalizeStoredQuestions(raw: unknown): Question[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((question, position) => {
    const stored = question as Question;
    if (
      stored.type === "matrix_2x2" &&
      stored.matrixSize !== undefined &&
      stored.matrixSize !== 2
    ) {
      throw new QuestionValidationError(
        "Stored 4x4 and 6x6 matrices are no longer supported.",
      );
    }
    return {
      ...stored,
      position,
      released: typeof (question as Partial<Question>)?.released === "boolean"
        ? stored.released
        : true,
      ...(stored.type === "matrix_2x2"
        ? {
          matrixSize: 2 as MatrixSize,
          matrixAxisLabels: normalizeStoredAxisLabels(stored.matrixAxisLabels),
          matrixReferences: normalizeStoredReferences(
            stored.matrixReferences,
            2,
          ),
          isDemographic: false,
        }
        : {}),
    };
  });
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

export function isMatrixSize(raw: unknown): raw is MatrixSize {
  return raw === 2;
}

export function matrixCellKey(row: number, column: number): string {
  return `${row},${column}`;
}

export function clampMatrixReferencePosition(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  const clamped = Math.min(
    MATRIX_REFERENCE_POSITION_MAX,
    Math.max(MATRIX_REFERENCE_POSITION_MIN, value),
  );
  return Math.round(clamped * 1000) / 1000;
}

export function matrixReferenceDefaultPosition(
  indexInCell: number,
): { x: number; y: number } {
  const normalized = Math.max(0, Math.floor(indexInCell));
  const base = MATRIX_REFERENCE_DEFAULT_POSITIONS[
    normalized % MATRIX_REFERENCE_DEFAULT_POSITIONS.length
  ];
  const cycle = Math.floor(
    normalized / MATRIX_REFERENCE_DEFAULT_POSITIONS.length,
  );
  const offset = cycle === 0 ? 0 : ((cycle % 5) - 2) * 0.025;
  return {
    x: clampMatrixReferencePosition(base.x + offset),
    y: clampMatrixReferencePosition(base.y - offset),
  };
}

export function matrixReferenceDefaultPositions(
  indexInCell: number,
): {
  symbolX: number;
  symbolY: number;
  labelX: number;
  labelY: number;
} {
  const symbol = matrixReferenceDefaultPosition(indexInCell);
  const labelOffset = symbol.x <= 0.5 ? 0.2 : -0.2;
  return {
    symbolX: symbol.x,
    symbolY: symbol.y,
    labelX: clampMatrixReferencePosition(symbol.x + labelOffset),
    labelY: symbol.y,
  };
}

export function isMatrixAnswer(
  raw: unknown,
  size: MatrixSize,
): raw is MatrixAnswer {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const answer = raw as Partial<MatrixAnswer>;
  return Number.isInteger(answer.row) && Number.isInteger(answer.column) &&
    answer.row! >= 0 && answer.row! < size &&
    answer.column! >= 0 && answer.column! < size;
}

export function referencesWithinSize(
  references: MatrixReference[] | undefined,
  size: MatrixSize,
): MatrixReference[] {
  return (references ?? []).filter((reference) =>
    Number.isInteger(reference.row) && Number.isInteger(reference.column) &&
    reference.row >= 0 && reference.row < size &&
    reference.column >= 0 && reference.column < size
  );
}

function normalizeStoredAxisLabels(raw: unknown): MatrixAxisLabels {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_MATRIX_AXIS_LABELS };
  }
  const labels = raw as Partial<MatrixAxisLabels>;
  return {
    left: typeof labels.left === "string" && labels.left.trim()
      ? labels.left
      : DEFAULT_MATRIX_AXIS_LABELS.left,
    right: typeof labels.right === "string" && labels.right.trim()
      ? labels.right
      : DEFAULT_MATRIX_AXIS_LABELS.right,
    bottom: typeof labels.bottom === "string" && labels.bottom.trim()
      ? labels.bottom
      : DEFAULT_MATRIX_AXIS_LABELS.bottom,
    top: typeof labels.top === "string" && labels.top.trim()
      ? labels.top
      : DEFAULT_MATRIX_AXIS_LABELS.top,
  };
}

function normalizeStoredReferences(
  raw: unknown,
  size: MatrixSize,
): MatrixReference[] {
  if (!Array.isArray(raw)) return [];
  const cellCounts = new Map<string, number>();
  return referencesWithinSize(
    raw.flatMap((reference) => {
      if (
        !reference || typeof reference !== "object" ||
        typeof (reference as MatrixReference).id !== "string" ||
        typeof (reference as MatrixReference).label !== "string" ||
        !(reference as MatrixReference).label.trim()
      ) {
        return [];
      }
      const stored = reference as MatrixReference;
      const input = reference as Record<string, unknown>;
      const key = matrixCellKey(stored.row, stored.column);
      const indexInCell = cellCounts.get(key) ?? 0;
      cellCounts.set(key, indexInCell + 1);
      const fallback = matrixReferenceDefaultPositions(indexInCell);
      const legacyPosition = coordinatePair(input, "x", "y") ?? undefined;
      const symbolPosition = coordinatePair(input, "symbolX", "symbolY") ??
        undefined;
      const labelPosition = coordinatePair(input, "labelX", "labelY") ??
        undefined;
      return [{
        id: stored.id,
        row: stored.row,
        column: stored.column,
        label: stored.label.trim(),
        symbolX: symbolPosition?.x ?? legacyPosition?.x ?? fallback.symbolX,
        symbolY: symbolPosition?.y ?? legacyPosition?.y ?? fallback.symbolY,
        labelX: labelPosition?.x ??
          (legacyPosition
            ? clampMatrixReferencePosition(
              legacyPosition.x +
                (legacyPosition.x <= 0.5 ? 0.2 : -0.2),
            )
            : fallback.labelX),
        labelY: labelPosition?.y ?? legacyPosition?.y ?? fallback.labelY,
      }];
    }).slice(0, QUESTION_LIMITS.matrixReferences),
    size,
  );
}

function validStoredReferencePosition(raw: unknown): raw is number {
  return typeof raw === "number" && Number.isFinite(raw) &&
    raw >= MATRIX_REFERENCE_POSITION_MIN &&
    raw <= MATRIX_REFERENCE_POSITION_MAX;
}

function matrixAxisLabels(raw: unknown): MatrixAxisLabels {
  const input = record(raw);
  return {
    left: text(input.left, QUESTION_LIMITS.matrixAxisLabel, "Left axis label"),
    right: text(
      input.right,
      QUESTION_LIMITS.matrixAxisLabel,
      "Right axis label",
    ),
    bottom: text(
      input.bottom,
      QUESTION_LIMITS.matrixAxisLabel,
      "Bottom axis label",
    ),
    top: text(input.top, QUESTION_LIMITS.matrixAxisLabel, "Top axis label"),
  };
}

function matrixReferences(raw: unknown, size: MatrixSize): MatrixReference[] {
  if (!Array.isArray(raw) || raw.length > QUESTION_LIMITS.matrixReferences) {
    throw new QuestionValidationError(
      `Provide no more than ${QUESTION_LIMITS.matrixReferences} matrix reference labels.`,
    );
  }
  const cellCounts = new Map<string, number>();
  return raw.map((reference) => {
    const input = record(reference);
    const row = input.row;
    const column = input.column;
    if (
      typeof row !== "number" || typeof column !== "number" ||
      !Number.isSafeInteger(row) || !Number.isSafeInteger(column) ||
      row < 0 || row >= size || column < 0 || column >= size
    ) {
      throw new QuestionValidationError(
        "Matrix reference cells must be within the selected grid.",
      );
    }
    const key = matrixCellKey(row, column);
    const indexInCell = cellCounts.get(key) ?? 0;
    cellCounts.set(key, indexInCell + 1);
    const fallback = matrixReferenceDefaultPositions(indexInCell);
    const legacyPosition = coordinatePair(input, "x", "y");
    const symbolPosition = coordinatePair(input, "symbolX", "symbolY");
    const labelPosition = coordinatePair(input, "labelX", "labelY");
    if (
      legacyPosition === null || symbolPosition === null ||
      labelPosition === null
    ) {
      throw new QuestionValidationError(
        `Matrix reference positions must be between ${MATRIX_REFERENCE_POSITION_MIN} and ${MATRIX_REFERENCE_POSITION_MAX}.`,
      );
    }
    const symbol = symbolPosition ?? legacyPosition ?? {
      x: fallback.symbolX,
      y: fallback.symbolY,
    };
    const label = labelPosition ?? (legacyPosition
      ? {
        x: clampMatrixReferencePosition(
          legacyPosition.x + (legacyPosition.x <= 0.5 ? 0.2 : -0.2),
        ),
        y: legacyPosition.y,
      }
      : { x: fallback.labelX, y: fallback.labelY });
    return {
      id: crypto.randomUUID(),
      row,
      column,
      label: text(
        input.label,
        QUESTION_LIMITS.matrixReferenceLabel,
        "Matrix reference label",
      ),
      symbolX: symbol.x,
      symbolY: symbol.y,
      labelX: label.x,
      labelY: label.y,
    };
  });
}

function coordinatePair(
  input: Record<string, unknown>,
  xKey: string,
  yKey: string,
): { x: number; y: number } | null | undefined {
  const hasX = input[xKey] !== undefined;
  const hasY = input[yKey] !== undefined;
  if (!hasX && !hasY) return undefined;
  if (
    hasX !== hasY || !validStoredReferencePosition(input[xKey]) ||
    !validStoredReferencePosition(input[yKey])
  ) {
    return null;
  }
  return { x: input[xKey], y: input[yKey] };
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
  if (type === "matrix_2x2") {
    if (!isMatrixSize(input.matrixSize)) {
      throw new QuestionValidationError("Choose a 2x2 matrix.");
    }
    draft.matrixSize = input.matrixSize;
    draft.matrixAxisLabels = matrixAxisLabels(input.matrixAxisLabels);
    draft.matrixReferences = matrixReferences(
      input.matrixReferences,
      input.matrixSize,
    );
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
  question.released = false;
  return question;
}
