/** @jsxImportSource https://esm.sh/react@18.2.0 */
import { useEffect, useRef, useState } from "https://esm.sh/react@18.2.0";
import type {
  FacetGroup,
  Question,
  ResultsPayload,
} from "../../../shared/types.ts";
import {
  ChoiceChart,
  Counter,
  PALETTE,
  RankedChart,
  ScaleChart,
  TextList,
  WordCloudChart,
} from "./Charts.tsx";
import { MatrixHeatmap } from "./MatrixHeatmap.tsx";

interface Props {
  fetcher: (groupBy: string | null) => Promise<ResultsPayload>;
  canFacet: boolean;
  onTotal?: (n: number) => void;
  projectorUrl?: string;
  pollMs?: number;
}

export function ResultsView(
  { fetcher, canFacet, onTotal, projectorUrl, pollMs = 3000 }: Props,
) {
  const [data, setData] = useState<ResultsPayload | null>(null);
  const [groupBy, setGroupBy] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null); // facet group key to isolate
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null); // question id for "one at a time" mode
  const [pulse, setPulse] = useState(false);
  const lastTotal = useRef(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetcher(groupBy).then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
        if (d.totalResponses !== lastTotal.current) {
          lastTotal.current = d.totalResponses;
          setPulse(true);
          setTimeout(() => setPulse(false), 700);
          onTotal?.(d.totalResponses);
        }
      }).catch((e) => alive && setError(e.message));
    load();
    const t = setInterval(load, pollMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [groupBy, pollMs]);

  if (error) {
    return (
      <div className="text-center py-20">
        <div className="text-5xl mb-3">⏳</div>
        <p className="text-gray-600">{error}</p>
        <p className="text-xs text-gray-400 mt-2">
          This page keeps checking — results appear as soon as the presenter
          reveals them.
        </p>
      </div>
    );
  }
  if (!data) {
    return <div className="text-center py-20 text-gray-500">Loading…</div>;
  }

  const { survey } = data;
  const demographics = survey.questions.filter((q) => q.isDemographic);
  const facetQ = groupBy
    ? survey.questions.find((q) => q.id === groupBy)
    : null;
  let groups: FacetGroup[] = data.groups;
  if (filter && groupBy) groups = groups.filter((g) => g.key === filter);
  const shownQuestions = survey.questions.filter((q) =>
    (q.id !== groupBy) && (!focus || q.id === focus)
  );
  const hasHiddenNote = survey.questions.some((q) => q.hidden);

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-5 bg-white rounded-2xl shadow p-3">
        <div
          className={`text-sm px-3 py-1 rounded-full font-semibold transition ${
            pulse
              ? "bg-emerald-500 text-white scale-110"
              : "bg-gray-100 text-gray-700"
          }`}
        >
          <Counter value={data.totalResponses} /> responses
        </div>

        {canFacet && demographics.length > 0 && (
          <>
            <label className="text-sm text-gray-600 flex items-center gap-2">
              🔍 Group by
              <select
                value={groupBy ?? ""}
                onChange={(
                  e: any,
                ) => (setGroupBy(e.target.value || null), setFilter(null))}
                className="border rounded-lg px-2 py-1 text-sm bg-gray-50"
              >
                <option value="">— everyone —</option>
                {demographics.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.prompt || "(untitled)"}
                  </option>
                ))}
              </select>
            </label>
            {facetQ && (
              <div className="flex flex-wrap gap-1 text-xs">
                <button
                  onClick={() => setFilter(null)}
                  className={`px-2 py-1 rounded-full border ${
                    !filter
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white"
                  }`}
                >
                  all groups
                </button>
                {data.groups.map((g, i) => (
                  <button
                    key={g.key}
                    onClick={() => setFilter(filter === g.key ? null : g.key)}
                    className={`px-2 py-1 rounded-full border ${
                      filter === g.key ? "text-white" : "bg-white"
                    }`}
                    style={filter === g.key
                      ? {
                        background: PALETTE[i % PALETTE.length],
                        borderColor: PALETTE[i % PALETTE.length],
                      }
                      : {
                        borderColor: PALETTE[i % PALETTE.length],
                        color: PALETTE[i % PALETTE.length],
                      }}
                  >
                    {g.label} ({g.responseCount})
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <div className="ml-auto flex items-center gap-2 text-sm">
          <select
            value={focus ?? ""}
            onChange={(e: any) => setFocus(e.target.value || null)}
            className="border rounded-lg px-2 py-1 text-sm bg-gray-50 max-w-[220px]"
          >
            <option value="">All questions</option>
            {survey.questions.filter((q) => q.id !== groupBy).map((q, i) => (
              <option key={q.id} value={q.id}>
                Q{i + 1}: {q.prompt.slice(0, 40) || "(untitled)"}
              </option>
            ))}
          </select>
          {projectorUrl && (
            <a
              href={projectorUrl}
              target="_blank"
              className="text-indigo-600 hover:underline whitespace-nowrap"
            >
              🖥 projector view
            </a>
          )}
        </div>
      </div>

      {facetQ && !filter && (
        <p className="text-xs text-gray-500 mb-3">
          Grouped by <strong>{facetQ.prompt}</strong>:{" "}
          {data.groups.map((g) => `${g.label} (${g.responseCount})`).join(
            " · ",
          )}
        </p>
      )}

      {shownQuestions.length === 0 && (
        <p className="text-center text-gray-400 py-16">No questions to show.</p>
      )}

      <div className={focus ? "" : "grid gap-5"}>
        {shownQuestions.map((q, i) => (
          <QuestionCard
            key={q.id}
            q={q}
            index={survey.questions.indexOf(q)}
            groups={groups}
            big={!!focus}
          />
        ))}
      </div>
      {hasHiddenNote && canFacet && (
        <p className="text-xs text-gray-400 mt-4">
          Questions marked 🙈 are hidden from the audience's results view.
        </p>
      )}
    </div>
  );
}

function QuestionCard(
  { q, index, groups, big }: {
    q: Question;
    index: number;
    groups: FacetGroup[];
    big: boolean;
  },
) {
  const n = groups.reduce(
    (s, g) =>
      s + (g.aggregates.find((a) => a.questionId === q.id)?.responseCount ?? 0),
    0,
  );
  return (
    <div
      className={`bg-white rounded-2xl shadow p-5 ${big ? "min-h-[60vh]" : ""}`}
    >
      <div className="flex items-start gap-3 mb-3">
        <span className="text-xs font-mono bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 mt-1">
          Q{index + 1}
        </span>
        <h3 className={`font-bold flex-1 ${big ? "text-3xl" : "text-lg"}`}>
          {q.prompt || "(untitled)"}
        </h3>
        <span className="text-xs text-gray-400 whitespace-nowrap">
          {q.hidden && "🙈 "}
          {q.isDemographic && "👥 "}
          {n} answer{n === 1 ? "" : "s"}
        </span>
      </div>
      <Chart q={q} groups={groups} />
    </div>
  );
}

function Chart({ q, groups }: { q: Question; groups: FacetGroup[] }) {
  switch (q.type) {
    case "single_choice":
    case "multi_choice":
    case "emoji_reaction":
      return <ChoiceChart q={q} groups={groups} />;
    case "scale":
      return <ScaleChart q={q} groups={groups} />;
    case "ranked_choice":
      return <RankedChart q={q} groups={groups} />;
    case "word_cloud":
      return <WordCloudChart q={q} groups={groups} />;
    case "free_text":
      return <TextList q={q} groups={groups} />;
    case "matrix_2x2":
      return <MatrixHeatmap q={q} groups={groups} />;
  }
}
