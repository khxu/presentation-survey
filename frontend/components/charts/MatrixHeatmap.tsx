/** @jsxImportSource https://esm.sh/react@18.2.0 */
import { useState } from "https://esm.sh/react@18.2.0";
import type { FacetGroup, Question } from "../../../shared/types.ts";
import { matrixCellKey } from "../../../shared/questions.ts";
import {
  MatrixCellAnnotations,
  MatrixReferenceLegend,
} from "../MatrixCellReferences.tsx";
import { PALETTE } from "./Charts.tsx";
import {
  matrixDensity,
  matrixScatterOffsets,
} from "../../lib/matrixResults.ts";

export function MatrixHeatmap(
  { q, groups }: { q: Question; groups: FacetGroup[] },
) {
  const [mode, setMode] = useState<"scatter" | "density">("scatter");
  const faceted = groups.length > 1;
  return (
    <div>
      <div
        className="mb-3 flex justify-end gap-1 text-xs"
        role="group"
        aria-label="Matrix result view"
      >
        <button
          type="button"
          aria-pressed={mode === "scatter"}
          onClick={() => setMode("scatter")}
          className={`rounded-full border px-2.5 py-1 ${
            mode === "scatter"
              ? "border-indigo-600 bg-indigo-600 text-white"
              : "bg-white"
          }`}
        >
          Placements
        </button>
        <button
          type="button"
          aria-pressed={mode === "density"}
          onClick={() => setMode("density")}
          className={`rounded-full border px-2.5 py-1 ${
            mode === "density"
              ? "border-indigo-600 bg-indigo-600 text-white"
              : "bg-white"
          }`}
        >
          Density
        </button>
      </div>
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
            <GroupMatrix
              q={q}
              group={group}
              color={PALETTE[index % PALETTE.length]}
              mode={mode}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function GroupMatrix(
  {
    q,
    group,
    color,
    mode,
  }: {
    q: Question;
    group: FacetGroup;
    color: string;
    mode: "scatter" | "density";
  },
) {
  const size = q.matrixSize ?? 2;
  const labels = q.matrixAxisLabels ?? {
    left: "Left",
    right: "Right",
    bottom: "Bottom",
    top: "Top",
  };
  const references = q.matrixReferences ?? [];
  const subjectLabel = q.matrixSubjectLabel?.trim() || "Item";
  const aggregate = group.aggregates.find((item) => item.questionId === q.id);
  const points = aggregate?.matrixPoints ?? [];
  const density = matrixDensity(points);
  const offsets = matrixScatterOffsets(points);

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-gray-700">
          {mode === "scatter"
            ? `Each dot is a ${subjectLabel} placement`
            : `${subjectLabel} placement density`}
        </span>
        <span className="text-xs text-gray-400">
          {points.length} placement{points.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="mb-2 text-center text-sm font-semibold text-gray-700">
        {labels.top}
      </div>
      <div className="relative grid aspect-square rounded-xl border-2 border-gray-500 bg-white">
        <div
          className="pointer-events-none absolute inset-0 z-20 grid overflow-hidden rounded-[10px]"
          style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: size * size }, (_, index) => {
            const row = Math.floor(index / size);
            const column = index % size;
            const cellReferences = references.filter((reference) =>
              reference.row === row && reference.column === column
            );
            const middleTop = row === size / 2;
            const middleLeft = column === size / 2;
            return (
              <div
                key={matrixCellKey(row, column)}
                className={`relative min-w-0 overflow-hidden border-gray-200 ${
                  middleTop ? "border-t-2 border-t-gray-500" : "border-t"
                } ${middleLeft ? "border-l-2 border-l-gray-500" : "border-l"}`}
              >
                {cellReferences.length > 0 && (
                  <MatrixCellAnnotations
                    references={references}
                    cellReferences={cellReferences}
                    size={size}
                  />
                )}
              </div>
            );
          })}
        </div>
        {mode === "density" && (
          <div
            className="pointer-events-none absolute inset-0 z-10 grid overflow-hidden rounded-[10px]"
            style={{
              gridTemplateColumns: `repeat(${density.bins}, minmax(0, 1fr))`,
            }}
            aria-label={`Density view of ${points.length} ${subjectLabel} placements`}
          >
            {density.counts.map((count, index) => (
              <span
                key={index}
                title={count
                  ? `${count} placement${count === 1 ? "" : "s"}`
                  : ""}
                style={{
                  backgroundColor: count
                    ? colorWithAlpha(color, 0.08 + 0.82 * count / density.max)
                    : "transparent",
                }}
              />
            ))}
          </div>
        )}
        {mode === "scatter" && (
          <div className="pointer-events-none absolute inset-0 z-30 overflow-visible">
            {points.map((point, index) => (
              <span
                key={`${point.x}-${point.y}-${index}`}
                title={`${subjectLabel}: ${
                  Math.round(point.x * 100)
                }% from left, ${Math.round(point.y * 100)}% from top`}
                className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                style={{
                  left: `${point.x * 100}%`,
                  top: `${point.y * 100}%`,
                  backgroundColor: color,
                  transform: `translate(calc(-50% + ${
                    offsets[index].x
                  }px), calc(-50% + ${offsets[index].y}px))`,
                }}
              />
            ))}
          </div>
        )}
      </div>
      <div className="mt-2 grid grid-cols-3 items-start gap-2 text-sm font-semibold text-gray-700">
        <span className="text-left">{labels.left}</span>
        <span className="text-center">{labels.bottom}</span>
        <span className="text-right">{labels.right}</span>
      </div>
      {points.length === 0 && (
        <p className="mt-2 text-center text-sm text-gray-400">
          No placements yet.
        </p>
      )}
      {references.length > 0 && (
        <MatrixReferenceLegend
          references={references}
          size={size}
          className="mt-3"
        />
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
