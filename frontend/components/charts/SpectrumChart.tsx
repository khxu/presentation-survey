/** @jsxImportSource https://esm.sh/react@18.2.0 */
import type {
  FacetGroup,
  Question,
  SpectrumLabels,
} from "../../../shared/types.ts";
import {
  DEFAULT_SPECTRUM_LABELS,
  SPECTRUM_BINS,
} from "../../../shared/questions.ts";

export function SpectrumChart(
  { q, groups }: { q: Question; groups: FacetGroup[] },
) {
  const labels = q.spectrumLabels ?? DEFAULT_SPECTRUM_LABELS;
  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const result = group.aggregates.find((a) => a.questionId === q.id)
          ?.pairedSpectrum;
        if (!result) return null;
        const mean = result.meanChange;
        const direction = mean === null || mean === 0
          ? "No net movement"
          : `Toward ${mean > 0 ? labels.right : labels.left}`;
        return (
          <section
            key={group.key}
            aria-label={`${group.label} before and after`}
          >
            {groups.length > 1 && (
              <h4 className="font-semibold mb-2">{group.label}</h4>
            )}
            <h4 className="font-semibold mb-2">Position distributions</h4>
            <p className="text-xs text-gray-500 mb-3">
              All submitted positions in each phase, including incomplete pairs.
              Both charts use the same count scale; phase totals may differ.
            </p>
            <div className="grid lg:grid-cols-2 gap-4 mb-5">
              {(["before", "after"] as const).map((phase) => {
                const counts = phase === "before"
                  ? result.beforeDistribution
                  : result.afterDistribution;
                const total = phase === "before"
                  ? result.beforeCount
                  : result.afterCount;
                const title = phase === "before" ? "Before" : "After";
                return total > 0
                  ? (
                    <SpectrumHistogram
                      key={phase}
                      title={title}
                      counts={counts}
                      total={total}
                      maxCount={Math.max(
                        1,
                        ...result.beforeDistribution,
                        ...result.afterDistribution,
                      )}
                      labels={labels}
                      color={phase === "before" ? "#64748b" : "#6366f1"}
                    />
                  )
                  : (
                    <p
                      key={phase}
                      className="text-sm text-gray-500 border rounded-xl p-4"
                    >
                      No {phase} positions submitted yet.
                    </p>
                  );
              })}
            </div>
            <h4 className="font-semibold mb-2">Paired change</h4>
            <div className="flex flex-wrap gap-6 mb-3 text-sm">
              <div>
                <strong className="block text-3xl text-indigo-700">
                  {mean === null
                    ? "—"
                    : `${mean > 0 ? "+" : ""}${mean.toFixed(2)}`}
                </strong>
                <span>Mean change (points)</span>
                <p className="text-xs text-gray-500">
                  {mean === null ? "Waiting for complete pairs" : direction}
                </p>
              </div>
              <div>
                <strong className="block text-xl">{result.pairCount}</strong>
                complete pair{result.pairCount === 1 ? "" : "s"}
              </div>
              <div>
                <strong className="block text-xl">
                  {result.meanBefore?.toFixed(2) ?? "—"} →{" "}
                  {result.meanAfter?.toFixed(2) ?? "—"}
                </strong>
                paired means: before → after
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              Toward {labels.left}: <strong>{result.leftCount}</strong> ·{" "}
              Unchanged: <strong>{result.unchangedCount}</strong> · Toward{" "}
              {labels.right}: <strong>{result.rightCount}</strong>
            </p>
            <p className="text-xs text-gray-500 mb-3">
              {result.beforeCount} before · {result.afterCount} after.{" "}
              Only complete pairs contribute to the paired means and movement
              counts.
            </p>
            {result.pairCount > 0
              ? (
                <>
                  <div className="flex flex-wrap gap-4 text-xs mb-2">
                    <span>○ Before</span>
                    <span>● After</span>
                    <span>
                      Each row is one anonymous pair, ordered by before
                      position.
                    </span>
                  </div>
                  <div className="max-h-[520px] overflow-auto border rounded-xl">
                    <div className="min-w-[360px] p-3">
                      <div className="grid grid-cols-[3rem_1fr_6rem] gap-2 text-xs text-gray-500 mb-2">
                        <span>Pair</span>
                        <div className="flex justify-between gap-2 px-2">
                          <span className="break-words min-w-0">
                            0 · {labels.left}
                          </span>
                          <span className="break-words min-w-0 text-right">
                            100 · {labels.right}
                          </span>
                        </div>
                        <span className="text-right">Before → after</span>
                      </div>
                      <ol>
                        {result.pairs.map((pair, index) => {
                          const delta = pair.after - pair.before;
                          const color = delta > 0
                            ? "#6366f1"
                            : delta < 0
                            ? "#c2410c"
                            : "#6b7280";
                          return (
                            <li
                              key={index}
                              className="grid grid-cols-[3rem_1fr_6rem] items-center gap-2 border-t py-1"
                              aria-label={`Pair ${
                                index + 1
                              }: before ${pair.before}, after ${pair.after}, change ${delta}`}
                            >
                              <span className="text-xs text-gray-500">
                                {index + 1}
                              </span>
                              <div
                                className="relative min-w-0 h-7"
                                aria-hidden="true"
                              >
                                <div className="absolute inset-x-2 top-1/2">
                                  <span className="absolute inset-x-0 h-px -translate-y-1/2 bg-gray-200" />
                                  <span
                                    className="absolute h-0.5 -translate-y-1/2"
                                    style={{
                                      left: `${
                                        Math.min(pair.before, pair.after)
                                      }%`,
                                      width: `${Math.abs(delta)}%`,
                                      backgroundColor: color,
                                    }}
                                  />
                                  <span
                                    className="absolute w-3 h-3 box-border rounded-full border-2 bg-white -translate-x-1/2 -translate-y-1/2"
                                    style={{
                                      left: `${pair.before}%`,
                                      borderColor: color,
                                    }}
                                  />
                                  <span
                                    className="absolute w-2 h-2 rounded-full -translate-x-1/2 -translate-y-1/2"
                                    style={{
                                      left: `${pair.after}%`,
                                      backgroundColor: color,
                                    }}
                                  />
                                </div>
                              </div>
                              <span className="text-xs text-right font-mono">
                                {pair.before} → {pair.after}
                              </span>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  </div>
                </>
              )
              : (
                <p className="text-sm text-gray-500 py-4">
                  No complete before/after pairs yet.
                </p>
              )}
          </section>
        );
      })}
    </div>
  );
}

function SpectrumHistogram(
  { title, counts, total, maxCount, labels, color }: {
    title: string;
    counts: number[];
    total: number;
    maxCount: number;
    labels: SpectrumLabels;
    color: string;
  },
) {
  return (
    <figure className="min-w-0 border rounded-xl p-3">
      <figcaption className="text-sm font-semibold mb-2">
        {title} · {total} position{total === 1 ? "" : "s"}
      </figcaption>
      <div className="overflow-x-auto">
        <svg
          viewBox="0 0 400 160"
          className="w-full min-w-[320px]"
          aria-hidden="true"
        >
          <line x1="0" x2="400" y1="125" y2="125" stroke="#d1d5db" />
          {SPECTRUM_BINS.map((bin, index) => {
            const count = counts[index];
            const height = count / maxCount * 100;
            return (
              <g key={bin.min}>
                <rect
                  x={index * 40 + 5}
                  y={125 - height}
                  width="30"
                  height={height}
                  rx="2"
                  fill={color}
                />
                <text
                  x={index * 40 + 20}
                  y={118 - height}
                  textAnchor="middle"
                  fontSize="12"
                  fill="#374151"
                >
                  {count}
                </text>
                <text
                  x={index * 40 + 20}
                  y="145"
                  textAnchor="middle"
                  fontSize="10"
                  fill="#4b5563"
                >
                  {bin.min}–{bin.max}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex justify-between gap-3 text-xs text-gray-600">
        <span className="break-words min-w-0">0 · {labels.left}</span>
        <span className="break-words min-w-0 text-right">
          100 · {labels.right}
        </span>
      </div>
      <table className="sr-only">
        <caption>
          {title} position histogram: all {total} submitted positions
        </caption>
        <thead>
          <tr>
            <th scope="col">Position range</th>
            <th scope="col">Count</th>
          </tr>
        </thead>
        <tbody>
          {SPECTRUM_BINS.map((bin, index) => (
            <tr key={bin.min}>
              <th scope="row">{bin.min}–{bin.max}</th>
              <td>{counts[index]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
