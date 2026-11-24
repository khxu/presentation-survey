import type {
  BiatCategory,
  BiatCompletion,
  BiatConfig,
  BiatScore,
  BiatTarget,
} from "./types.ts";

export const BIAT_VERSION = 1;
export const BIAT_WARMUP = 4;
export const BIAT_STIMULI = 4;
export const BIAT_CATEGORY_LABELS: Record<BiatCategory, string> = {
  targetA: "Target A",
  targetB: "Target B",
  focalAttribute: "Focal attribute",
  otherAttribute: "Other attribute",
};
export const BIAT_CATEGORIES: BiatCategory[] = [
  "targetA",
  "targetB",
  "focalAttribute",
  "otherAttribute",
];

export function emptyBiat(): BiatConfig {
  const category = () => ({ label: "", stimuli: Array<string>(BIAT_STIMULI).fill("") });
  return {
    targetA: category(),
    targetB: category(),
    focalAttribute: category(),
    otherAttribute: category(),
  };
}

export function biatFocal(category: BiatCategory, target: BiatTarget): boolean {
  return category === target || category === "focalAttribute";
}

export function isBiatComplete(value: unknown): value is BiatCompletion {
  return !!value && typeof value === "object" &&
    "biatComplete" in value && value.biatComplete === true;
}

export function isBiatScore(value: unknown): value is BiatScore {
  if (!value || typeof value !== "object" || !("version" in value) ||
    value.version !== BIAT_VERSION || !("firstTarget" in value) ||
    (value.firstTarget !== "targetA" && value.firstTarget !== "targetB") ||
    !("input" in value) || (value.input !== "keyboard" && value.input !== "pointer" &&
      value.input !== "mixed") ||
    !("status" in value) || !("score" in value)) return false;
  return value.status === "scored"
    ? typeof value.score === "number" && Number.isFinite(value.score)
    : value.score === null &&
      (value.status === "too_fast" || value.status === "insufficient_data" ||
        value.status === "no_variance");
}
