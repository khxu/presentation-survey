/** @jsxImportSource https://esm.sh/react@18.2.0 */
import type { FacetGroup, Question } from "../../../shared/types.ts";
import { matrixCellKey } from "../../../shared/questions.ts";
import { PALETTE } from "./Charts.tsx";

export function MatrixHeatmap(
  { q, groups }: { q: Question; groups: FacetGroup[] },
) {
  const faceted = groups.length > 1;
  return (
    <div className={faceted ? "grid gap-4 lg:grid-cols-2" : ""}>
      {groups.map((group, index) => (
        <div
          key={group.key}
          className={faceted ? "rounded-xl border p-3" : ""}
          style={faceted
            ? { borderColor: PALETTE[index % PALETTE.length] }
            : {}}
        >
          {faceted && (
            <div
              className="mb-2 text-xs font-semibold"
              style={{ color: PALETTE[index % PALETTE.length] }}
            >
              {group.label} · {group.responseCount} respondents
            </div>
          )}
          <GroupHeatmap
            q={q}
            group={group}
            color={PALETTE[index % PALETTE.length]}
          />
        </div>
      ))}
    </div>
  );
}

function GroupHeatmap(
  { q, group, color }: { q: Question; group: FacetGroup; color: string },
) {
  const size = q.matrixSize ?? 2;
  const labels = q.matrixAxisLabels ?? {
    left: "Left",
    right: "Right",
    bottom: "Bottom",
    top: "Top",
  };
  const references = q.matrixReferences ?? [];
  const aggregate = group.aggregates.find((item) => item.questionId === q.id);
  const counts = aggregate?.matrixCounts ?? {};
  const responseCount = aggregate?.responseCount ?? 0;
  const max = Math.max(1, ...Object.values(counts));

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-2 text-center text-sm font-semibold text-gray-700">
        {labels.top}
      </div>
      <div
        className="grid aspect-square overflow-hidden rounded-xl border-2 border-gray-500 bg-white"
        style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: size * size }, (_, index) => {
          const row = Math.floor(index / size);
          const column = index % size;
          const key = matrixCellKey(row, column);
          const count = counts[key] ?? 0;
          const percent = responseCount
            ? Math.round((count / responseCount) * 100)
            : 0;
          const intensity = count / max;
          const cellReferences = references.filter((reference) =>
            reference.row === row && reference.column === column
          );
          const middleTop = row === size / 2;
          const middleLeft = column === size / 2;
          return (
            <div
              key={key}
              title={`${count} response${count === 1 ? "" : "s"} (${percent}%)`}
              className={`relative min-w-0 border-gray-200 p-1 ${
                middleTop ? "border-t-2 border-t-gray-500" : "border-t"
              } ${middleLeft ? "border-l-2 border-l-gray-500" : "border-l"}`}
              style={{
                backgroundColor: colorWithAlpha(color, 0.08 + intensity * 0.78),
              }}
            >
              <div className="flex h-full flex-col items-center justify-center text-center">
                <span
                  className={`font-black leading-none ${
                    size === 6 ? "text-sm sm:text-lg" : "text-2xl sm:text-3xl"
                  }`}
                >
                  {count}
                </span>
                <span className="mt-0.5 text-[9px] font-semibold sm:text-xs">
                  {percent}%
                </span>
              </div>
              {cellReferences.length > 0 && (
                <span className="absolute inset-x-1 bottom-1 truncate text-center text-[8px] leading-tight text-gray-800 sm:text-[10px]">
                  {cellReferences[0].label}
                  {cellReferences.length > 1
                    ? ` +${cellReferences.length - 1}`
                    : ""}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 grid grid-cols-3 items-start gap-2 text-sm font-semibold text-gray-700">
        <span className="text-left">{labels.left}</span>
        <span className="text-center">{labels.bottom}</span>
        <span className="text-right">{labels.right}</span>
      </div>
      {responseCount === 0 && (
        <p className="mt-2 text-center text-sm text-gray-400">
          No placements yet.
        </p>
      )}
      {references.length > 0 && (
        <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-gray-600">
          {references.map((reference) => (
            <span key={reference.id}>
              <strong>C{reference.column + 1}/R{reference.row + 1}:</strong>
              {" "}
              {reference.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function colorWithAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
