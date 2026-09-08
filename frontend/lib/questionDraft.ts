import type { Question } from "../../shared/types.ts";

export function questionsEqual(left: Question[], right: Question[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function mergePublishedQuestion(
  draft: Question[],
  publishedQuestion: Question,
): Question[] {
  return draft.some((question) => question.id === publishedQuestion.id)
    ? draft
    : [...draft, publishedQuestion];
}
