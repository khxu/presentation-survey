import type {
  AnswerValue,
  Question,
  SpectrumPhase,
} from "../../shared/types.ts";
import { normalizeSpectrumAnswer } from "../../shared/questions.ts";

export function questionStepKey(question: Question): string {
  return question.type === "paired_spectrum"
    ? `${question.id}:${question.spectrumPhase ?? "before"}`
    : question.id;
}

export function spectrumAnswerStage(
  question: Question,
  savedValue: AnswerValue | undefined,
): SpectrumPhase {
  return question.spectrumPhase === "after" &&
      normalizeSpectrumAnswer(savedValue)?.before !== undefined
    ? "after"
    : "before";
}

export function hasCurrentAnswer(
  question: Question,
  value: AnswerValue | undefined,
  savedValue: AnswerValue | undefined,
): boolean {
  if (question.type === "paired_spectrum") {
    return normalizeSpectrumAnswer(value)?.[
      spectrumAnswerStage(question, savedValue)
    ] !== undefined;
  }
  return value !== undefined && value !== "" &&
    !(Array.isArray(value) && value.length === 0);
}

export function reconcileQuestionStep(
  previousQuestions: Question[],
  nextQuestions: Question[],
  step: number,
): number {
  if (step < 0) return step;
  if (step >= previousQuestions.length) return nextQuestions.length;
  const activeQuestionId = previousQuestions[step]?.id;
  const nextStep = nextQuestions.findIndex((question) =>
    question.id === activeQuestionId
  );
  return nextStep >= 0 ? nextStep : nextQuestions.length;
}
