/** @jsxImportSource https://esm.sh/react@18.2.0 */
/// <reference lib="dom" />
import { deepStrictEqual, equal, ok } from "node:assert/strict";
import {
  act,
  create,
} from "https://esm.sh/react-test-renderer@18.2.0?dev&deps=react@18.2.0,react-dom@18.2.0";
import type {
  ReactTestInstance,
  ReactTestRenderer,
} from "https://esm.sh/react-test-renderer@18.2.0?dev&deps=react@18.2.0,react-dom@18.2.0";
import { newQuestion } from "../../shared/questions.ts";
import type { Answers, Survey } from "../../shared/types.ts";
import { api } from "../lib/api.ts";
import { QuestionInput } from "../components/respond/QuestionInput.tsx";
import { Respond } from "./Respond.tsx";

function text(node: ReactTestInstance | string): string {
  return typeof node === "string" ? node : node.children.map(text).join("");
}

Deno.test("respondent is invited back when after opens while answering another question", async () => {
  const q = {
    ...newQuestion("paired_spectrum"),
    prompt: "Agree?",
    released: true,
  };
  const other = {
    ...newQuestion("free_text"),
    prompt: "Comment",
    released: true,
  };
  let survey: Survey = {
    id: "s",
    slug: "s",
    title: "Debate",
    description: "",
    createdAt: "",
    acceptingResponses: true,
    resultsVisible: false,
    audienceFacets: false,
    questions: [q, other],
  };
  let answers: Answers = {};
  const original = {
    getSurvey: api.getSurvey,
    respond: api.respond,
    proposals: api.proposals,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
  };
  let poll: (() => void) | undefined;
  let renderer: ReactTestRenderer | undefined;
  try {
    api.getSurvey = () => Promise.resolve({ survey, existing: answers });
    api.respond = (_slug, next) => {
      answers = structuredClone(next);
      return Promise.resolve({ ok: true, answers });
    };
    api.proposals = () =>
      Promise.resolve({ proposals: [], acceptingResponses: true });
    Object.defineProperty(globalThis, "setInterval", {
      configurable: true,
      writable: true,
      value: <TArgs extends unknown[]>(
        callback: (...args: TArgs) => void,
        delay?: number,
        ...args: TArgs
      ) => {
        if (delay === 8000) poll = () => callback(...args);
        return original.setInterval(callback, delay, ...args);
      },
    });
    await act(() => {
      renderer = create(<Respond slug="s" />);
    });
    const root = renderer!.root;
    const click = async (label: string) => {
      const button = root.findAllByType("button").find((b) =>
        text(b).includes(label)
      );
      ok(button, `Missing button: ${label}`);
      await act(async () => {
        await button.props.onClick();
      });
    };
    await click("Start");
    await act(() => {
      root.findByType(QuestionInput).props.onChange({ before: 0 });
    });
    await click("Next");
    equal(root.findByType(QuestionInput).props.q.id, other.id);
    survey = {
      ...survey,
      questions: [{ ...q, spectrumPhase: "after" }, other],
    };
    await act(() => {
      poll!();
    });
    await click("Submit");
    await click("available - answer now");
    equal(root.findByType(QuestionInput).props.q.id, q.id);
    deepStrictEqual(root.findByType(QuestionInput).props.savedValue, {
      before: 0,
    });
    equal(
      root.findAllByType("input").find((input) => input.props.type === "range")
        ?.props["aria-label"],
      "After position: No to Yes",
    );
    await act(() => {
      root.findByType(QuestionInput).props.onChange({ before: 0, after: 100 });
    });
    await click("Next");
    deepStrictEqual(answers[q.id], { before: 0, after: 100 });
  } finally {
    await act(() => {
      renderer?.unmount();
    });
    api.getSurvey = original.getSurvey;
    api.respond = original.respond;
    api.proposals = original.proposals;
    globalThis.setInterval = original.setInterval;
    globalThis.clearInterval = original.clearInterval;
  }
});
