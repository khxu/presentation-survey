import { deepStrictEqual, notEqual, ok } from "node:assert/strict";
import handler from "../index.ts";
import type { ProposalsPayload, Question, Survey } from "../shared/types.ts";
import { sqlite } from "./sqlite.ts";

const origin = "https://survey.test";
const choice = {
  type: "single_choice",
  prompt: "What should we cover?",
  options: [{ id: "untrusted-a", label: "Design" }, {
    id: "untrusted-b",
    label: "Code",
  }],
  required: true,
};

async function request(
  path: string,
  method = "GET",
  body?: unknown,
  cookie?: string,
) {
  const headers = new Headers();
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (cookie) headers.set("Cookie", cookie);
  return await handler(
    new Request(origin + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

async function create() {
  const response = await request("/api/surveys", "POST", {
    title: "Proposal API test",
  });
  deepStrictEqual(response.status, 200);
  return await response.json() as { slug: string; adminKey: string };
}

async function survey(slug: string): Promise<Survey> {
  return (await (await request(`/api/s/${slug}`)).json()).survey;
}

async function adminSurvey(adminKey: string): Promise<Survey> {
  return (await (await request(`/api/admin/${adminKey}`)).json()).survey;
}

async function proposals(
  slug: string,
  cookie?: string,
): Promise<ProposalsPayload> {
  return await (await request(
    `/api/s/${slug}/proposals`,
    "GET",
    undefined,
    cookie,
  )).json();
}

Deno.test("API: anonymous proposal, device votes, admin edits, responses, and cleanup", async () => {
  const { slug, adminKey } = await create();
  try {
    const first = await request(`/api/s/${slug}`);
    const cookieA = first.headers.get("set-cookie")!.split(";")[0];
    const second = await request(`/api/s/${slug}`);
    const cookieB = second.headers.get("set-cookie")!.split(";")[0];
    ok(first.headers.get("set-cookie")?.includes("HttpOnly"));
    ok(cookieA !== cookieB);
    deepStrictEqual(
      (await request(
        `/api/s/${slug}/proposals`,
        "POST",
        { question: choice },
        cookieA,
      )).status,
      201,
    );
    let queue = await proposals(slug, cookieA);
    deepStrictEqual(queue.proposals.length, 1);
    const id = queue.proposals[0].id;
    deepStrictEqual(queue.proposals[0].voteCount, 0);
    ok(!("proposer_sid" in queue.proposals[0]));
    ok(!("required" in queue.proposals[0].draft));
    for (const cookie of [cookieA, cookieA, cookieB]) {
      deepStrictEqual(
        (await request(`/api/s/${slug}/proposals/${id}/vote`, "PUT", {
          voted: true,
        }, cookie)).status,
        200,
      );
    }
    queue = await proposals(slug, cookieA);
    deepStrictEqual([queue.proposals[0].voteCount, queue.proposals[0].voted], [
      2,
      true,
    ]);
    await request(`/api/s/${slug}/proposals/${id}/vote`, "PUT", {
      voted: false,
    }, cookieA);
    deepStrictEqual((await proposals(slug, cookieA)).proposals[0].voted, false);
    deepStrictEqual(
      (await request(`/api/admin/not-a-key/proposals/${id}/approve`, "POST", {
        question: choice,
      })).status,
      404,
    );

    const approved = await request(
      `/api/admin/${adminKey}/proposals/${id}/approve`,
      "POST",
      {
        question: {
          ...choice,
          prompt: "Edited by the presenter",
          required: false,
          hidden: false,
          isDemographic: true,
        },
      },
    );
    deepStrictEqual(approved.status, 200);
    const approvedPayload = await approved.json();
    const fresh: Survey = approvedPayload.survey;
    deepStrictEqual(fresh.questions.length, 1);
    const q = fresh.questions[0];
    deepStrictEqual(approvedPayload.approvedQuestion, q);
    deepStrictEqual([q.prompt, q.required, q.isDemographic, q.position], [
      "Edited by the presenter",
      false,
      true,
      0,
    ]);
    deepStrictEqual(q.released, false);
    deepStrictEqual((await survey(slug)).questions, []);
    deepStrictEqual((await proposals(slug)).proposals, []);
    deepStrictEqual(
      (await request(`/api/admin/${adminKey}/proposals/${id}/approve`, "POST", {
        question: choice,
      })).status,
      409,
    );
    deepStrictEqual(
      (await request(`/api/s/${slug}/proposals/${id}/vote`, "PUT", {
        voted: true,
      }, cookieA)).status,
      409,
    );

    deepStrictEqual(
      (await request(
        `/api/admin/${adminKey}/questions/${q.id}/release`,
        "PATCH",
        {
          released: true,
        },
      )).status,
      200,
    );
    const response = await request(`/api/s/${slug}/respond`, "POST", {
      answers: { [q.id]: q.options[0].id },
    }, cookieA);
    deepStrictEqual(response.status, 200);
    deepStrictEqual((await response.json()).answers[q.id], q.options[0].id);
    const results = await (await request(`/api/admin/${adminKey}/results`))
      .json();
    deepStrictEqual(results.groups[0].aggregates[0].counts[q.options[0].id], 1);

    await request(`/api/admin/${adminKey}/responses`, "DELETE");
    const saved = await sqlite.execute({
      sql: "SELECT id FROM question_proposals WHERE id = ?",
      args: [id],
    });
    deepStrictEqual(saved.rows.length, 1);
    await request(`/api/admin/${adminKey}`, "DELETE");
    deepStrictEqual(
      (await sqlite.execute({
        sql: "SELECT id FROM question_proposals WHERE id = ?",
        args: [id],
      })).rows.length,
      0,
    );
    deepStrictEqual(
      (await sqlite.execute({
        sql: "SELECT sid FROM proposal_votes WHERE proposal_id = ?",
        args: [id],
      })).rows.length,
      0,
    );
  } finally {
    await request(`/api/admin/${adminKey}`, "DELETE");
  }
});

Deno.test("API: invalid input, closed surveys, and cross-survey operations", async () => {
  const a = await create();
  const b = await create();
  try {
    deepStrictEqual(
      (await request(`/api/s/${a.slug}/proposals`, "POST", { question: {} }))
        .status,
      400,
    );
    const malformed = await handler(
      new Request(`${origin}/api/s/${a.slug}/proposals`, {
        method: "POST",
        body: "{",
      }),
    );
    deepStrictEqual(malformed.status, 400);
    deepStrictEqual(
      (await request(`/api/s/${a.slug}/proposals`, "POST", {
        question: { ...choice, prompt: "a".repeat(17000) },
      })).status,
      413,
    );
    await request(`/api/s/${a.slug}/proposals`, "POST", { question: choice });
    const id = (await proposals(a.slug)).proposals[0].id;
    deepStrictEqual(
      (await request(`/api/s/${b.slug}/proposals/${id}/vote`, "PUT", {
        voted: true,
      })).status,
      409,
    );
    deepStrictEqual(
      (await request(
        `/api/admin/${b.adminKey}/proposals/${id}/approve`,
        "POST",
        { question: choice },
      )).status,
      409,
    );
    deepStrictEqual(
      (await request(`/api/s/${a.slug}/proposals/${id}/vote`, "PUT", {
        voted: "true",
      })).status,
      400,
    );
    await request(`/api/admin/${a.adminKey}`, "PATCH", {
      acceptingResponses: false,
    });
    deepStrictEqual(
      (await request(`/api/s/${a.slug}/proposals`, "POST", {
        question: choice,
      })).status,
      403,
    );
    deepStrictEqual(
      (await request(`/api/s/${a.slug}/proposals/${id}/vote`, "PUT", {
        voted: true,
      })).status,
      403,
    );
    const queue = await proposals(a.slug);
    deepStrictEqual([queue.acceptingResponses, queue.proposals.length], [
      false,
      1,
    ]);
    deepStrictEqual(
      (await request(
        `/api/admin/${a.adminKey}/proposals/${id}/approve`,
        "POST",
        { question: choice },
      )).status,
      200,
    );
  } finally {
    await request(`/api/admin/${a.adminKey}`, "DELETE");
    await request(`/api/admin/${b.adminKey}`, "DELETE");
  }
});

Deno.test("API: concurrent approvals append once and stale builder saves cannot erase them", async () => {
  const { slug, adminKey } = await create();
  try {
    await request(`/api/s/${slug}/proposals`, "POST", { question: choice });
    await request(`/api/s/${slug}/proposals`, "POST", {
      question: { ...choice, prompt: "Another idea" },
    });
    const queue = await proposals(slug);
    const stale = await adminSurvey(adminKey);
    const [a, b] = queue.proposals;
    const approvals = await Promise.all(
      [a, a, b].map((p) =>
        request(`/api/admin/${adminKey}/proposals/${p.id}/approve`, "POST", {
          question: p.draft,
        })
      ),
    );
    deepStrictEqual(approvals.map((r) => r.status).sort(), [200, 200, 409]);
    const fresh = await adminSurvey(adminKey);
    deepStrictEqual(fresh.questions.map((q) => q.position), [0, 1]);
    deepStrictEqual(
      (await request(`/api/admin/${adminKey}`, "PATCH", {
        questions: stale.questions,
        expectedQuestions: stale.questions,
      })).status,
      409,
    );
    deepStrictEqual((await adminSurvey(adminKey)).questions.length, 2);
    deepStrictEqual(
      (await request(`/api/admin/${adminKey}`, "PATCH", { questions: [] }))
        .status,
      409,
    );
    const edited: Question[] = fresh.questions.map((q) => ({
      ...q,
      prompt: q.prompt + " edited",
    }));
    const saved = await request(`/api/admin/${adminKey}`, "PATCH", {
      questions: edited,
      expectedQuestions: fresh.questions,
    });
    deepStrictEqual(saved.status, 200);
    deepStrictEqual((await saved.json()).survey.questions, edited);
  } finally {
    await request(`/api/admin/${adminKey}`, "DELETE");
  }
});

Deno.test("API: approval returns the persisted appended question", async () => {
  const { slug, adminKey } = await create();
  try {
    const initial: Question = {
      id: "initial-question",
      position: 0,
      type: "single_choice",
      prompt: choice.prompt,
      options: choice.options,
      required: choice.required,
      released: true,
      hidden: false,
      isDemographic: false,
    };
    deepStrictEqual(
      (await request(`/api/admin/${adminKey}`, "PATCH", {
        questions: [initial],
        expectedQuestions: [],
      })).status,
      200,
    );
    await request(`/api/s/${slug}/proposals`, "POST", { question: choice });
    const proposal = (await proposals(slug)).proposals[0];
    const response = await request(
      `/api/admin/${adminKey}/proposals/${proposal.id}/approve`,
      "POST",
      { question: proposal.draft },
    );
    deepStrictEqual(response.status, 200);
    const payload = await response.json();
    deepStrictEqual(payload.approvedQuestion, payload.survey.questions[1]);
    deepStrictEqual(payload.approvedQuestion.position, 1);
    deepStrictEqual(payload.approvedQuestion.released, false);
  } finally {
    await request(`/api/admin/${adminKey}`, "DELETE");
  }
});

Deno.test("API: on-deck questions stay private and preserve answers across unrelease", async () => {
  const { slug, adminKey } = await create();
  try {
    const released: Question = {
      id: "released-question",
      position: 0,
      type: "free_text",
      prompt: "Released",
      options: [],
      required: false,
      released: true,
      hidden: false,
      isDemographic: false,
    };
    const onDeck: Question = {
      ...released,
      id: "on-deck-question",
      position: 1,
      prompt: "On deck",
      released: false,
    };
    deepStrictEqual(
      (await request(`/api/admin/${adminKey}`, "PATCH", {
        questions: [released, onDeck],
        expectedQuestions: [],
        resultsVisible: true,
      })).status,
      200,
    );

    const first = await request(`/api/s/${slug}`);
    const cookie = first.headers.get("set-cookie")!.split(";")[0];
    const publicPayload = await first.json();
    deepStrictEqual(publicPayload.survey.questions.map((q: Question) => q.id), [
      released.id,
    ]);
    deepStrictEqual(publicPayload.survey.questions[0].position, 0);

    const forged = await request(`/api/s/${slug}/respond`, "POST", {
      answers: { [released.id]: "visible", [onDeck.id]: "forged" },
    }, cookie);
    deepStrictEqual(await forged.json(), {
      ok: true,
      answers: { [released.id]: "visible" },
    });

    deepStrictEqual(
      (await request(
        `/api/admin/${adminKey}/questions/${onDeck.id}/release`,
        "PATCH",
        {
          released: true,
        },
      )).status,
      200,
    );
    const bothVisible =
      await (await request(`/api/s/${slug}`, "GET", undefined, cookie)).json();
    deepStrictEqual(bothVisible.survey.questions.map((q: Question) => q.id), [
      released.id,
      onDeck.id,
    ]);
    deepStrictEqual(bothVisible.existing, { [released.id]: "visible" });

    await request(`/api/s/${slug}/respond`, "POST", {
      answers: {
        [released.id]: "visible",
        [onDeck.id]: "saved while released",
      },
    }, cookie);
    deepStrictEqual(
      (await request(
        `/api/admin/${adminKey}/questions/${onDeck.id}/release`,
        "PATCH",
        {
          released: false,
        },
      )).status,
      200,
    );
    await request(`/api/s/${slug}/respond`, "POST", {
      answers: { [released.id]: "updated" },
    }, cookie);

    const hiddenAgain =
      await (await request(`/api/s/${slug}`, "GET", undefined, cookie)).json();
    deepStrictEqual(hiddenAgain.existing, { [released.id]: "updated" });
    const publicResults = await (await request(`/api/s/${slug}/results`))
      .json();
    deepStrictEqual(publicResults.survey.questions.map((q: Question) => q.id), [
      released.id,
    ]);
    deepStrictEqual(
      publicResults.groups[0].aggregates.map((aggregate: any) =>
        aggregate.questionId
      ),
      [released.id],
    );
    const adminResults = await (await request(`/api/admin/${adminKey}/results`))
      .json();
    deepStrictEqual(
      adminResults.groups[0].aggregates.map((aggregate: any) =>
        aggregate.questionId
      ),
      [released.id, onDeck.id],
    );

    await request(
      `/api/admin/${adminKey}/questions/${onDeck.id}/release`,
      "PATCH",
      { released: true },
    );
    const restored =
      await (await request(`/api/s/${slug}`, "GET", undefined, cookie)).json();
    deepStrictEqual(restored.existing, {
      [released.id]: "updated",
      [onDeck.id]: "saved while released",
    });

    deepStrictEqual(
      (await request(
        `/api/admin/${adminKey}/questions/missing/release`,
        "PATCH",
        { released: true },
      )).status,
      404,
    );
    deepStrictEqual(
      (await request(
        `/api/admin/${adminKey}/questions/${released.id}/release`,
        "PATCH",
        { released: "yes" },
      )).status,
      400,
    );
  } finally {
    await request(`/api/admin/${adminKey}`, "DELETE");
  }
});

Deno.test("API: legacy saved questions remain released and can be edited", async () => {
  const { slug, adminKey } = await create();
  try {
    const legacy = {
      id: "legacy-question",
      position: 0,
      type: "free_text",
      prompt: "Legacy",
      options: [],
      required: false,
      hidden: false,
      isDemographic: false,
    };
    await sqlite.execute({
      sql: "UPDATE surveys SET questions_json = ? WHERE slug = ?",
      args: [JSON.stringify([legacy]), slug],
    });
    const loaded = await adminSurvey(adminKey);
    deepStrictEqual(loaded.questions[0].released, true);
    const edited = [{ ...loaded.questions[0], prompt: "Legacy edited" }];
    const response = await request(`/api/admin/${adminKey}`, "PATCH", {
      questions: edited,
      expectedQuestions: loaded.questions,
    });
    deepStrictEqual(response.status, 200);
    deepStrictEqual((await response.json()).survey.questions, edited);
  } finally {
    await request(`/api/admin/${adminKey}`, "DELETE");
  }
});

Deno.test("API: matrix proposals, responses, results, and CSV export", async () => {
  const { slug, adminKey } = await create();
  try {
    const matrix = {
      type: "matrix_2x2",
      prompt: "Where should the migration go?",
      options: [],
      matrixSize: 6,
      matrixAxisLabels: {
        left: "Not urgent",
        right: "Urgent",
        bottom: "Not important",
        top: "Important",
      },
      matrixReferences: [
        { id: "untrusted", row: 0, column: 5, label: "Security patch" },
        { id: "untrusted-2", row: 5, column: 0, label: "Office repaint" },
      ],
    };
    deepStrictEqual(
      (await request(`/api/s/${slug}/proposals`, "POST", { question: matrix }))
        .status,
      201,
    );
    const proposal = (await proposals(slug)).proposals[0];
    deepStrictEqual(proposal.draft.matrixSize, 6);
    notEqual(proposal.draft.matrixReferences?.[0].id, "untrusted");

    const approval = await request(
      `/api/admin/${adminKey}/proposals/${proposal.id}/approve`,
      "POST",
      { question: { ...proposal.draft, required: true, isDemographic: true } },
    );
    deepStrictEqual(approval.status, 200);
    const approved = (await approval.json()).approvedQuestion as Question;
    deepStrictEqual(
      [approved.type, approved.required, approved.isDemographic],
      [
        "matrix_2x2",
        true,
        false,
      ],
    );

    await request(
      `/api/admin/${adminKey}/questions/${approved.id}/release`,
      "PATCH",
      {
        released: true,
      },
    );
    const first = await request(`/api/s/${slug}`);
    const cookie = first.headers.get("set-cookie")!.split(";")[0];
    const invalid = await request(`/api/s/${slug}/respond`, "POST", {
      answers: { [approved.id]: { row: 6, column: 0 } },
    }, cookie);
    deepStrictEqual((await invalid.json()).answers, {});

    const valid = await request(`/api/s/${slug}/respond`, "POST", {
      answers: { [approved.id]: { row: 1, column: 4, ignored: true } },
    }, cookie);
    deepStrictEqual((await valid.json()).answers, {
      [approved.id]: { row: 1, column: 4 },
    });

    const results = await (await request(`/api/admin/${adminKey}/results`))
      .json();
    deepStrictEqual(results.groups[0].aggregates[0].responseCount, 1);
    deepStrictEqual(results.groups[0].aggregates[0].matrixCounts["1,4"], 1);
    deepStrictEqual(
      Object.keys(results.groups[0].aggregates[0].matrixCounts).length,
      36,
    );

    const csv = await request(`/api/admin/${adminKey}/export.csv`);
    deepStrictEqual(csv.status, 200);
    ok((await csv.text()).includes('"column 5, row 2 from top"'));
  } finally {
    await request(`/api/admin/${adminKey}`, "DELETE");
  }
});

Deno.test("API: pick-many results expose canonical exact intersections", async () => {
  const { slug, adminKey } = await create();
  try {
    const question: Question = {
      id: "pick-many",
      position: 0,
      type: "multi_choice",
      prompt: "Pick tools",
      options: [
        { id: "a", label: "Alpha" },
        { id: "b", label: "Beta" },
        { id: "c", label: "Gamma" },
      ],
      required: false,
      released: true,
      hidden: false,
      isDemographic: false,
    };
    deepStrictEqual(
      (await request(`/api/admin/${adminKey}`, "PATCH", {
        questions: [question],
        expectedQuestions: [],
      })).status,
      200,
    );

    const cookies: string[] = [];
    for (let i = 0; i < 3; i++) {
      const response = await request(`/api/s/${slug}`);
      cookies.push(response.headers.get("set-cookie")!.split(";")[0]);
    }
    const first = await request(
      `/api/s/${slug}/respond`,
      "POST",
      { answers: { [question.id]: ["b", "a", "a", "invalid"] } },
      cookies[0],
    );
    deepStrictEqual((await first.json()).answers[question.id], ["a", "b"]);
    await request(
      `/api/s/${slug}/respond`,
      "POST",
      { answers: { [question.id]: ["a", "b"] } },
      cookies[1],
    );
    await request(
      `/api/s/${slug}/respond`,
      "POST",
      { answers: { [question.id]: [] } },
      cookies[2],
    );

    const results = await (await request(`/api/admin/${adminKey}/results`))
      .json();
    deepStrictEqual(results.groups[0].aggregates[0], {
      questionId: question.id,
      type: question.type,
      responseCount: 3,
      counts: { a: 2, b: 2, c: 0 },
      intersections: [
        { optionIds: ["a", "b"], count: 2 },
        { optionIds: [], count: 1 },
      ],
    });
  } finally {
    await request(`/api/admin/${adminKey}`, "DELETE");
  }
});
