/** @jsxImportSource https://esm.sh/react@18.2.0 */
/// <reference lib="dom" />
import { deepStrictEqual, equal, ok } from "node:assert/strict";
import { renderToStaticMarkup } from "https://esm.sh/react-dom@18.2.0/server?deps=react@18.2.0";
import { aggregateQuestion } from "../../../backend/aggregate.ts";
import { newQuestion } from "../../../shared/questions.ts";
import { SpectrumChart } from "./SpectrumChart.tsx";
import {
  describeSpectrumPosition,
  SpectrumInput,
} from "../respond/SpectrumInput.tsx";

Deno.test("spectrum renders every pair including unchanged and opposing moves", () => {
  const q = newQuestion("paired_spectrum");
  const aggregate = aggregateQuestion(q, [
    { [q.id]: { before: 0, after: 100 } },
    { [q.id]: { before: 100, after: 0 } },
    { [q.id]: { before: 50, after: 50 } },
  ]);
  const html = renderToStaticMarkup(
    <SpectrumChart
      q={q}
      groups={[{
        key: "__all__",
        label: "Everyone",
        responseCount: 3,
        aggregates: [aggregate],
      }]}
    />,
  );
  ok(html.includes("3</strong>complete pairs"));
  for (
    const values of [
      "before 0, after 100",
      "before 100, after 0",
      "before 50, after 50",
    ]
  ) {
    ok(html.includes(values));
  }
  ok(html.includes("No net movement"));
  ok(html.includes("paired means: before"));
  ok(html.includes("Before · 3 positions"));
  ok(html.includes("After · 3 positions"));
  const rows = [...html.matchAll(/<li\b[^>]*>(.*?)<\/li>/g)].map((match) =>
    match[1]
  );
  equal(rows.length, 3);
  const positions = [
    { before: 0, after: 100, color: "#6366f1" },
    { before: 50, after: 50, color: "#6b7280" },
    { before: 100, after: 0, color: "#c2410c" },
  ];
  rows.forEach((row, index) => {
    const pair = positions[index];
    ok(!row.includes("<svg"));
    ok(row.includes('class="absolute inset-x-2 top-1/2"'));
    const markers = [
      ...row.matchAll(
        /<span class="([^"]*rounded-full[^"]*)" style="([^"]*)"/g,
      ),
    ];
    equal(markers.length, 2);
    ok(markers[0][1].includes("w-3 h-3 box-border"));
    ok(markers[1][1].includes("w-2 h-2"));
    deepStrictEqual(markers.map((marker) => marker[2]), [
      `left:${pair.before}%;border-color:${pair.color}`,
      `left:${pair.after}%;background-color:${pair.color}`,
    ]);
    ok(
      row.includes(
        `left:${Math.min(pair.before, pair.after)}%;width:${
          Math.abs(pair.after - pair.before)
        }%;background-color:${pair.color}`,
      ),
    );
  });
});

Deno.test("spectrum renders unpaired counts without inventing zero-valued means", () => {
  const q = newQuestion("paired_spectrum");
  const html = renderToStaticMarkup(
    <SpectrumChart
      q={q}
      groups={[{
        key: "__all__",
        label: "Everyone",
        responseCount: 1,
        aggregates: [aggregateQuestion(q, [{ [q.id]: { before: 0 } }])],
      }]}
    />,
  );
  ok(html.includes("Waiting for complete pairs"));
  ok(html.includes("No complete before/after pairs yet."));
  ok(!html.includes("0.00"));
  ok(html.includes("Before position histogram: all 1 submitted positions"));
  ok(!html.includes("After position histogram"));
  ok(html.includes("No after positions submitted yet."));
  ok(html.includes('scope="row">0–10</th><td>1</td>'));
  ok(html.includes('scope="row">91–100</th><td>0</td>'));
});

Deno.test("spectrum input distinguishes unselected midpoint, late baseline and frozen before", () => {
  const q = {
    ...newQuestion("paired_spectrum"),
    spectrumPhase: "after" as const,
  };
  const late = renderToStaticMarkup(
    <SpectrumInput
      q={q}
      value={undefined}
      savedValue={undefined}
      onChange={() => {}}
    />,
  );
  ok(late.includes("not selected"));
  ok(late.includes("Choose midpoint (50)"));
  ok(late.includes("Joined late?"));
  ok(late.includes("The centered slider is not a vote until you choose."));
  ok(!late.includes("Your choice indicates"));
  const returning = renderToStaticMarkup(
    <SpectrumInput
      q={q}
      value={{ before: 0 }}
      savedValue={{ before: 0 }}
      onChange={() => {}}
    />,
  );
  ok(returning.includes("After the session"));
  ok(returning.includes("0/100</strong> (frozen)"));
  ok(returning.includes('aria-label="After position:'));
  ok(!returning.includes("Joined late?"));
});

Deno.test("spectrum interpretation mirrors strength boundaries and treats 45–55 as neutral", () => {
  const labels = { left: "No", right: "Yes" };
  for (
    const [value, expected] of [
      [0, "strongly"],
      [10, "strongly"],
      [24, "strongly"],
      [25, "moderately"],
      [39, "moderately"],
      [40, "slightly"],
      [44, "slightly"],
    ] as const
  ) {
    equal(
      describeSpectrumPosition(value, labels),
      `Your choice indicates you are ${expected} toward "No".`,
    );
    equal(
      describeSpectrumPosition(100 - value, labels),
      `Your choice indicates you are ${expected} toward "Yes".`,
    );
  }
  for (const value of [45, 49, 50, 51, 55]) {
    equal(
      describeSpectrumPosition(value, labels),
      'Your choice indicates a neutral or mixed position between "No" and "Yes".',
    );
  }
});

Deno.test("spectrum explanation uses the active phase and safely renders custom endpoint text", () => {
  const q = {
    ...newQuestion("paired_spectrum"),
    spectrumLabels: { left: '<No & "never">', right: "Agree" },
    spectrumPhase: "after" as const,
  };
  const before = renderToStaticMarkup(
    <SpectrumInput
      q={q}
      value={{ before: 10 }}
      savedValue={undefined}
      onChange={() => {}}
    />,
  );
  ok(
    before.includes(
      "strongly toward &quot;&lt;No &amp; &quot;never&quot;&gt;&quot;.",
    ),
  );
  ok(!before.includes('<No & "never">'));
  ok(before.includes('aria-live="polite"'));
  ok(before.includes(`aria-describedby="spectrum-context-${q.id}"`));
  const after = renderToStaticMarkup(
    <SpectrumInput
      q={q}
      value={{ before: 10, after: 90 }}
      savedValue={{ before: 10 }}
      onChange={() => {}}
    />,
  );
  ok(after.includes("10/100</strong> (frozen)"));
  ok(after.includes("strongly toward &quot;Agree&quot;."));
});

Deno.test("spectrum distributions retain unpaired before answers after voting opens", () => {
  const q = {
    ...newQuestion("paired_spectrum"),
    spectrumPhase: "after" as const,
  };
  const html = renderToStaticMarkup(
    <SpectrumChart
      q={q}
      groups={[{
        key: "__all__",
        label: "Everyone",
        responseCount: 2,
        aggregates: [aggregateQuestion(q, [
          { [q.id]: { before: 0, after: 100 } },
          { [q.id]: { before: 100 } },
        ])],
      }]}
    />,
  );
  ok(html.includes("Before · 2 positions"));
  ok(html.includes("After · 1 position"));
  ok(html.includes('scope="row">91–100</th><td>1</td>'));
  ok(html.includes("1</strong>complete pair"));
});
