import type { Question } from "../../shared/types.ts";

export function reconcileQuestionStep(
  previousQuestions: Question[],
  nextQuestions: Question[],
  step: number,
): number {
  if (step < 0) return step;
  if (step >= previousQuestions.length) return nextQuestions.length;
  const activeQuestionId = previousQuestions[step]?.id;
  const nextStep = nextQuestions.findIndex((question) => question.id === activeQuestionId);
  return nextStep >= 0 ? nextStep : nextQuestions.length;
}
