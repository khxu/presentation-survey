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

export function mergePublishedQuestionStates(
  draft: Question[],
  previousPublished: Question[],
  freshPublished: Question[],
): Question[] {
  const previousIds = new Set(previousPublished.map((question) => question.id));
  const freshById = new Map(
    freshPublished.map((question) => [question.id, question]),
  );
  const merged = draft.map((question) => {
    const fresh = freshById.get(question.id);
    return fresh
      ? {
        ...question,
        released: fresh.released,
        ...(question.type === "paired_spectrum" && fresh.type === question.type
          ? { spectrumPhase: fresh.spectrumPhase }
          : {}),
        ...(fresh.type === "brief_iat" && fresh.biatLocked
          ? {
            type: fresh.type,
            biatLocked: true,
            biat: fresh.biat,
            prompt: fresh.prompt,
            options: fresh.options,
            isDemographic: false,
          }
          : {}),
      }
      : question;
  });
  for (const question of freshPublished) {
    if (
      !previousIds.has(question.id) &&
      !merged.some((draftQuestion) => draftQuestion.id === question.id)
    ) {
      merged.push(question);
    }
  }
  return merged;
}
