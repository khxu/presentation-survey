/** @jsxImportSource https://esm.sh/react@18.2.0 */
import type { MatrixReference, MatrixSize } from "../../shared/types.ts";

const MARKER_COLORS = [
  "#dc2626",
  "#2563eb",
  "#16a34a",
  "#9333ea",
  "#ea580c",
  "#0891b2",
  "#c026d3",
  "#4f46e5",
  "#65a30d",
  "#be123c",
] as const;

const MARKER_SHAPES = [
  "circle",
  "square",
  "diamond",
  "triangle-up",
  "triangle-down",
  "hexagon",
  "star",
  "plus",
  "cross",
  "capsule",
] as const;

export interface MatrixReferenceMarkerStyle {
  color: string;
  shape: typeof MARKER_SHAPES[number];
  key: string;
}

export function matrixReferenceMarkerStyle(
  index: number,
): MatrixReferenceMarkerStyle {
  const normalized = Math.max(0, Math.floor(index));
  const shapeIndex = normalized % MARKER_SHAPES.length;
  const colorIndex = (normalized * 3 + Math.floor(normalized / 10)) %
    MARKER_COLORS.length;
  return {
    color: MARKER_COLORS[colorIndex],
    shape: MARKER_SHAPES[shapeIndex],
    key: `${MARKER_SHAPES[shapeIndex]}-${MARKER_COLORS[colorIndex]}`,
  };
}

export function MatrixReferenceMarker(
  { index, className = "h-4 w-4" }: {
    index: number;
    className?: string;
  },
) {
  const marker = matrixReferenceMarkerStyle(index);
  return (
    <svg
      viewBox="0 0 24 24"
      className={`inline-block shrink-0 ${className}`}
      aria-hidden="true"
    >
      <rect
        x="1"
        y="1"
        width="22"
        height="22"
        rx="5"
        fill="white"
        fillOpacity="0.92"
      />
      <MarkerShape marker={marker} />
    </svg>
  );
}

function MarkerShape({ marker }: { marker: MatrixReferenceMarkerStyle }) {
  const common = {
    fill: marker.color,
    stroke: "#111827",
    strokeWidth: 1.25,
    strokeLinejoin: "round" as const,
  };
  switch (marker.shape) {
    case "circle":
      return <circle cx="12" cy="12" r="7" {...common} />;
    case "square":
      return <rect x="5" y="5" width="14" height="14" rx="1" {...common} />;
    case "diamond":
      return <path d="M12 3.5 20.5 12 12 20.5 3.5 12Z" {...common} />;
    case "triangle-up":
      return <path d="M12 3.5 21 20H3Z" {...common} />;
    case "triangle-down":
      return <path d="m3 4 9 16.5L21 4Z" {...common} />;
    case "hexagon":
      return <path d="m7 3.5 10 0 5 8.5-5 8.5H7L2 12Z" {...common} />;
    case "star":
      return (
        <path
          d="m12 2.5 2.8 6 6.5.8-4.8 4.5 1.3 6.4-5.8-3.3-5.8 3.3 1.3-6.4-4.8-4.5 6.5-.8Z"
          {...common}
        />
      );
    case "plus":
      return (
        <path
          d="M9 3.5h6V9h5.5v6H15v5.5H9V15H3.5V9H9Z"
          {...common}
        />
      );
    case "cross":
      return (
        <path
          d="m6 3.5 6 5.5 6-5.5 2.5 2.5-5.5 6 5.5 6-2.5 2.5-6-5.5-6 5.5L3.5 18 9 12 3.5 6Z"
          {...common}
        />
      );
    case "capsule":
      return <rect x="3" y="7" width="18" height="10" rx="5" {...common} />;
  }
}

export function MatrixCellMarkers(
  { references, cellReferences, size, className = "" }: {
    references: MatrixReference[];
    cellReferences: MatrixReference[];
    size: MatrixSize;
    className?: string;
  },
) {
  const referenceIndexes = new Map(
    references.map((reference, index) => [reference.id, index]),
  );
  const visibleReferences = cellReferences.filter((reference) =>
    reference.label.trim()
  );
  const limit = matrixCellMarkerLimit(size);
  const hiddenCount = Math.max(0, visibleReferences.length - limit);
  if (visibleReferences.length === 0) return null;

  const markerSize = size === 2
    ? "h-5 w-5 sm:h-6 sm:w-6"
    : size === 4
    ? "h-3.5 w-3.5 sm:h-4 sm:w-4"
    : "h-2.5 w-2.5 sm:h-3 sm:w-3";

  return (
    <span
      className={`pointer-events-none flex max-h-full max-w-full flex-wrap items-center justify-center gap-0.5 overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {visibleReferences.slice(0, limit).map((reference) => (
        <MatrixReferenceMarker
          key={reference.id}
          index={referenceIndexes.get(reference.id) ?? 0}
          className={markerSize}
        />
      ))}
      {hiddenCount > 0 && (
        <span className="rounded bg-white/90 px-0.5 text-[8px] font-bold leading-tight text-gray-800">
          +{hiddenCount}
        </span>
      )}
    </span>
  );
}

export function MatrixReferenceLegend(
  { references, size, className = "" }: {
    references: MatrixReference[];
    size: MatrixSize;
    className?: string;
  },
) {
  const visibleReferences = references.filter((reference) =>
    reference.label.trim()
  );
  if (visibleReferences.length === 0) return null;

  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white p-3 ${className}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        Reference positions
      </p>
      <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
        {visibleReferences.map((reference) => {
          const index = references.findIndex((item) =>
            item.id === reference.id
          );
          return (
            <div
              key={reference.id}
              className="flex min-w-0 items-center gap-2 rounded-lg bg-gray-50 px-2 py-1.5"
            >
              <MatrixReferenceMarker
                index={index}
                className="h-5 w-5"
              />
              <span className="min-w-0 flex-1 break-words">
                {reference.label}
              </span>
              <MatrixReferenceMinimap
                reference={reference}
                size={size}
                color={matrixReferenceMarkerStyle(index).color}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MatrixReferenceMinimap(
  { reference, size, color }: {
    reference: Pick<MatrixReference, "row" | "column">;
    size: MatrixSize;
    color: string;
  },
) {
  return (
    <span
      role="img"
      aria-label={matrixReferencePositionText(reference, size)}
      className="grid h-7 w-7 shrink-0 gap-px rounded border border-gray-300 bg-gray-300 p-px"
      style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
    >
      {matrixReferenceMinimapCells(reference, size).map((selected, index) => (
        <span
          key={index}
          className="min-h-0 min-w-0"
          style={{ backgroundColor: selected ? color : "white" }}
        />
      ))}
    </span>
  );
}

export function matrixReferenceMinimapCells(
  reference: Pick<MatrixReference, "row" | "column">,
  size: MatrixSize,
): boolean[] {
  return Array.from(
    { length: size * size },
    (_, index) =>
      Math.floor(index / size) === reference.row &&
      index % size === reference.column,
  );
}

export function matrixReferencePositionText(
  reference: Pick<MatrixReference, "row" | "column">,
  size: MatrixSize,
): string {
  return `Column ${reference.column + 1} of ${size}, row ${
    reference.row + 1
  } of ${size} from top`;
}

export function matrixReferenceText(
  references: Pick<MatrixReference, "label">[],
): string {
  return references
    .map((reference) => reference.label.trim())
    .filter(Boolean)
    .join(" · ");
}

export function matrixCellMarkerLimit(size: MatrixSize): number {
  if (size === 2) return 8;
  if (size === 4) return 4;
  return 3;
}
