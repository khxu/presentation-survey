import { test } from "vitest";
/// <reference lib="dom" />
import { deepStrictEqual, equal, ok } from "node:assert/strict";
import {
  act,
  create,
} from "react-test-renderer";
import type {
  ReactTestInstance,
  ReactTestRenderer,
} from "react-test-renderer";
import { newQuestion } from "../../shared/questions.ts";
import type { Answers, Survey } from "../../shared/types.ts";
import { api } from "../lib/api.ts";
import { QuestionInput } from "../components/respond/QuestionInput.tsx";
import { Respond } from "./Respond.tsx";
import { BiatInput } from "../components/respond/BiatInput.tsx";

function text(node: ReactTestInstance | string): string {
  return typeof node === "string" ? node : node.children.map(text).join("");
}

test("Brief IAT start, round, trial, and retry buttons use self-contained Tailwind button styling", async () => {
  const q = { ...newQuestion("brief_iat"), required: true, released: true };
  ok(q.biat);
  const originalApi = { ...api };
  const originalGlobals = {
    document: globalThis.document,
    window: globalThis.window,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  };
  let renderer: ReactTestRenderer | undefined;
  try {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: {
        hidden: false,
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: {
        setTimeout: (fn: () => void) => {
          fn();
          return 1;
        },
        clearTimeout: () => {},
      },
    });
    Object.defineProperty(globalThis, "requestAnimationFrame", {
      configurable: true,
      writable: true,
      value: (fn: FrameRequestCallback) => {
        fn(0);
        return 1;
      },
    });
    Object.defineProperty(globalThis, "cancelAnimationFrame", {
      configurable: true,
      writable: true,
      value: () => {},
    });

    api.biatSchedule = async () => ({
      version: 1,
      blocks: [
        { target: "targetA", trials: [{ category: "targetA", stimulus: 0 }] },
        { target: "targetB", trials: [{ category: "targetB", stimulus: 0 }] },
      ],
    });
    api.submitBiat = async () => {
      throw new Error("Network unavailable");
    };

    await act(() => {
      renderer = create(
        <BiatInput slug="s" questionId={q.id} config={q.biat!} onComplete={() => {}} />,
      );
    });
    const root = renderer!.root;
    const assertPrimaryButton = (label: string) => {
      const btn = root.findAllByType("button").find((b) => text(b).includes(label));
      ok(btn, `Missing button: ${label}`);
      const cls = String(btn.props.className ?? "");
      ok(!cls.includes("btn-add"), `${label} must not depend on Admin-only btn-add`);
      ok(cls.includes("bg-indigo-600"), `${label} should have solid indigo fill`);
      ok(cls.includes("border-2"), `${label} should have an explicit border`);
      ok(cls.includes("rounded-xl"), `${label} should have rounded corners`);
      return btn;
    };

    const startBtn = assertPrimaryButton("Start Brief IAT");
    await act(async () => {
      await startBtn.props.onClick();
    });

    const round1Btn = assertPrimaryButton("Start round 1");
    await act(async () => {
      round1Btn.props.onClick();
    });

    const trialButtons = root.findAllByType("button");
    equal(trialButtons.length, 2);
    for (const btn of trialButtons) {
      const cls = String(btn.props.className ?? "");
      ok(cls.includes("border-2"), "Trial sort buttons should have explicit borders");
      ok(cls.includes("min-h-["), "Trial sort buttons should use Twind-safe arbitrary min-height");
      ok(!cls.includes("min-h-16"), "Trial sort buttons must not rely on unsupported min-h-16");
    }

    // Complete round 1, start and complete round 2, then verify submit retry button
    await act(async () => {
      trialButtons[1].props.onClick({ detail: 1 });
    });
    const round2Btn = assertPrimaryButton("Start round 2");
    await act(async () => {
      round2Btn.props.onClick();
    });
    await act(async () => {
      root.findAllByType("button")[1].props.onClick({ detail: 1 });
    });
    assertPrimaryButton("Retry saving your test");
  } finally {
    if (renderer) await act(() => renderer!.unmount());
    Object.assign(api, originalApi);
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: originalGlobals.document,
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: originalGlobals.window,
    });
    Object.defineProperty(globalThis, "requestAnimationFrame", {
      configurable: true,
      writable: true,
      value: originalGlobals.requestAnimationFrame,
    });
    Object.defineProperty(globalThis, "cancelAnimationFrame", {
      configurable: true,
      writable: true,
      value: originalGlobals.cancelAnimationFrame,
    });
  }
});

test("returning respondents can continue past a required completed Brief IAT without submitting again", async () => {
  const q = { ...newQuestion("brief_iat"), required: true, released: true };
  const survey: Survey = {
    id: "s", slug: "s", title: "Brief IAT", description: "", createdAt: "",
    acceptingResponses: true, resultsVisible: false, audienceFacets: false, questions: [q],
  };
  const original = { ...api };
  let writes = 0;
  let renderer: ReactTestRenderer | undefined;
  try {
    api.getSurvey = async () => ({ survey, existing: { [q.id]: { biatComplete: true } } });
    api.proposals = async () => ({ proposals: [], acceptingResponses: true });
    api.respond = async () => {
      writes++;
      return { ok: true, answers: {} };
    };
    await act(() => { renderer = create(<Respond slug="s" />); });
    const root = renderer!.root;
    const click = async (label: string) => {
      const button = root.findAllByType("button").find((item) => text(item).includes(label));
      ok(button);
      await act(async () => { await button.props.onClick(); });
    };
    await click("Review my answers");
    equal(root.findAllByType(BiatInput).length, 0);
    ok(root.findAllByType("p").some((p) => text(p) === "Brief IAT complete."));
    await click("Submit");
    equal(writes, 0);
    ok(root.findAllByType("h1").some((h) => text(h) === "Thanks!"));
  } finally {
    if (renderer) await act(() => renderer!.unmount());
    Object.assign(api, original);
  }
});

test("respondent is invited back when after opens while answering another question", async () => {
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
