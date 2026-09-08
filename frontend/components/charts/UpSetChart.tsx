/** @jsxImportSource https://esm.sh/react@18.2.0 */
import type {
  FacetGroup,
  Question,
  QuestionAggregate,
} from "../../../shared/types.ts";
import { PALETTE } from "./Charts.tsx";

const BAR_HEIGHT = 112;
const COLUMN_WIDTH = 52;
const LABEL_WIDTH = 210;
const ROW_HEIGHT = 34;

function aggregate(group: FacetGroup, questionId: string) {
  return group.aggregates.find((item) => item.questionId === questionId);
}

function combinationLabel(q: Question, optionIds: string[]) {
  if (optionIds.length === 0) return "None selected";
  const selected = new Set(optionIds);
  return q.options.filter((option) => selected.has(option.id)).map((option) =>
    option.label
  ).join(" + ");
}

export function UpSetChart(
  { q, groups }: { q: Question; groups: FacetGroup[] },
) {
  const faceted = groups.length > 1;
  return (
    <div className={faceted ? "grid md:grid-cols-2 gap-4" : ""}>
      {groups.map((group, index) => (
        <UpSetPanel
          key={group.key}
          q={q}
          aggregate={aggregate(group, q.id)}
          color={PALETTE[index % PALETTE.length]}
          groupLabel={faceted ? group.label : undefined}
        />
      ))}
    </div>
  );
}

function UpSetPanel({
  q,
  aggregate,
  color,
  groupLabel,
}: {
  q: Question;
  aggregate?: QuestionAggregate;
  color: string;
  groupLabel?: string;
}) {
  const intersections = aggregate?.intersections ?? [];
  const counts = aggregate?.counts ?? {};
  const maxIntersection = Math.max(
    1,
    ...intersections.map((item) => item.count),
  );
  const maxSet = Math.max(
    1,
    ...q.options.map((option) => counts[option.id] ?? 0),
  );
  const matrixHeight = q.options.length * ROW_HEIGHT;

  if (intersections.length === 0) {
    return (
      <div
        className={groupLabel ? "border rounded-xl p-3" : ""}
        style={groupLabel ? { borderColor: color } : {}}
      >
        {groupLabel && (
          <div className="text-xs font-semibold mb-1" style={{ color }}>
            {groupLabel} · 0 answers
          </div>
        )}
        <p className="text-gray-400 text-sm text-center py-8">
          No selections yet.
        </p>
      </div>
    );
  }

  return (
    <div
      className={groupLabel ? "border rounded-xl p-3 min-w-0" : "min-w-0"}
      style={groupLabel ? { borderColor: color } : {}}
    >
      {groupLabel && (
        <div className="text-xs font-semibold mb-2" style={{ color }}>
          {groupLabel} · {aggregate?.responseCount ?? 0} answers
        </div>
      )}
      <div
        className="overflow-x-auto pb-2"
        role="img"
        aria-label={`UpSet plot for ${q.prompt}${
          groupLabel ? `, ${groupLabel}` : ""
        }`}
      >
        <div
          className="flex"
          style={{
            minWidth: LABEL_WIDTH + intersections.length * COLUMN_WIDTH,
          }}
        >
          <div
            className="sticky left-0 z-10 shrink-0 bg-white"
            style={{ width: LABEL_WIDTH }}
          >
            <div
              className="flex items-end justify-end pb-2 pr-2 text-[10px] uppercase tracking-wide text-gray-400"
              style={{ height: BAR_HEIGHT }}
            >
              Set size
            </div>
            {q.options.map((option) => {
              const count = counts[option.id] ?? 0;
              return (
                <div
                  key={option.id}
                  className="flex items-center gap-2 pr-2 text-xs"
                  style={{ height: ROW_HEIGHT }}
                  title={`${option.label}: ${count}`}
                >
                  <span className="flex-1 truncate text-right font-medium">
                    {option.label}
                  </span>
                  <span className="w-11 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${(count / maxSet) * 100}%`,
                        background: color,
                      }}
                    />
                  </span>
                  <span className="w-6 text-right font-mono text-gray-500">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex shrink-0">
            {intersections.map((intersection) => {
              const selected = new Set(intersection.optionIds);
              const selectedIndexes = q.options
                .map((option, index) => selected.has(option.id) ? index : -1)
                .filter((index) => index >= 0);
              const first = selectedIndexes[0];
              const last = selectedIndexes[selectedIndexes.length - 1];
              const label = combinationLabel(q, intersection.optionIds);
              const key = intersection.optionIds.length
                ? intersection.optionIds.join("\u001f")
                : "__none__";

              return (
                <div
                  key={key}
                  className="shrink-0 text-center"
                  style={{ width: COLUMN_WIDTH }}
                  title={`${label}: ${intersection.count}`}
                >
                  <div
                    className="flex flex-col items-center justify-end pb-2"
                    style={{ height: BAR_HEIGHT }}
                  >
                    <span className="text-xs font-bold text-gray-700 mb-1">
                      {intersection.count}
                    </span>
                    <span
                      className="block rounded-t-md transition-[height] duration-500"
                      style={{
                        width: 28,
                        height: Math.max(
                          3,
                          (intersection.count / maxIntersection) *
                            (BAR_HEIGHT - 38),
                        ),
                        background: color,
                      }}
                    />
                  </div>
                  <svg
                    width={COLUMN_WIDTH}
                    height={matrixHeight}
                    viewBox={`0 0 ${COLUMN_WIDTH} ${matrixHeight}`}
                    aria-hidden="true"
                  >
                    {selectedIndexes.length > 1 && (
                      <line
                        x1={COLUMN_WIDTH / 2}
                        x2={COLUMN_WIDTH / 2}
                        y1={(first + 0.5) * ROW_HEIGHT}
                        y2={(last + 0.5) * ROW_HEIGHT}
                        stroke={color}
                        strokeWidth="3"
                      />
                    )}
                    {q.options.map((option, rowIndex) => {
                      const active = selected.has(option.id);
                      return (
                        <circle
                          key={option.id}
                          cx={COLUMN_WIDTH / 2}
                          cy={(rowIndex + 0.5) * ROW_HEIGHT}
                          r={active ? 6 : 4}
                          fill={active ? color : "#d1d5db"}
                        />
                      );
                    })}
                  </svg>
                  <div className="h-5 text-[10px] leading-4 text-gray-500">
                    {intersection.optionIds.length === 0 ? "none" : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
