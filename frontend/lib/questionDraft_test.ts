import { deepStrictEqual, equal } from "node:assert/strict";
import type { Question } from "../../shared/types.ts";
import {
  mergePublishedQuestion,
  mergePublishedQuestionStates,
  questionsEqual,
} from "./questionDraft.ts";

function question(id: string, prompt: string, position: number): Question {
  return {
    id,
    position,
    type: "free_text",
    prompt,
    options: [],
    isDemographic: false,
    required: false,
    released: false,
    hidden: false,
  };
}

Deno.test("question drafts compare against the published snapshot", () => {
  const published = [question("a", "Published", 0)];
  equal(questionsEqual(published, [...published]), true);
  equal(
    questionsEqual(
      [{ ...published[0], prompt: "Unsaved edit" }],
      published,
    ),
    false,
  );
});

Deno.test("published additions merge without losing local draft edits", () => {
  const draft = [
    question("b", "Locally edited", 1),
    question("local", "Unsaved question", 0),
  ];
  const approved = question("approved", "Approved question", 2);

  deepStrictEqual(
    mergePublishedQuestion(draft, approved),
    [...draft, approved],
  );
});

Deno.test("published additions already in the draft are not duplicated", () => {
  const approved = question("approved", "Approved question", 1);
  const draft = [question("a", "First", 0), approved];

  deepStrictEqual(
    mergePublishedQuestion(draft, approved),
    draft,
  );
});

Deno.test("release updates preserve local edits and merge concurrent additions", () => {
  const published = [question("a", "Published", 0)];
  const draft = [
    { ...published[0], prompt: "Locally edited" },
    question("local", "Unsaved question", 1),
  ];
  const released = { ...published[0], released: true };
  const approved = question("approved", "Approved question", 1);

  deepStrictEqual(
    mergePublishedQuestionStates(draft, published, [released, approved]),
    [{ ...draft[0], released: true }, draft[1], approved],
  );
});
