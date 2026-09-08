/** @jsxImportSource https://esm.sh/react@18.2.0 */
import { useEffect, useRef, useState } from "https://esm.sh/react@18.2.0";
import type {
  KeyboardEvent,
  MouseEvent,
  PointerEvent,
} from "https://esm.sh/react@18.2.0";
import type { MatrixReference, MatrixSize } from "../../shared/types.ts";
import {
  clampMatrixReferencePosition,
  MATRIX_REFERENCE_POSITION_MAX,
  MATRIX_REFERENCE_POSITION_MIN,
  matrixReferenceDefaultPositions,
} from "../../shared/questions.ts";

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

  const markerSize = "h-5 w-5 sm:h-6 sm:w-6";

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

export function MatrixCellAnnotations(
  {
    references,
    cellReferences,
    size: _size,
    editable = false,
    onPositionChange,
    className = "",
  }: {
    references: MatrixReference[];
    cellReferences: MatrixReference[];
    size: MatrixSize;
    editable?: boolean;
    onPositionChange?: (
      id: string,
      target: MatrixReferencePositionTarget,
      x: number,
      y: number,
    ) => void;
    className?: string;
  },
) {
  const referenceIndexes = new Map(
    references.map((reference, index) => [reference.id, index]),
  );
  const visibleReferences = cellReferences.filter((reference) =>
    reference.label.trim()
  );
  if (visibleReferences.length === 0) return null;

  return (
    <span
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden={editable ? undefined : "true"}
    >
      {visibleReferences.map((reference, indexInCell) => (
        <MatrixReferenceAnnotation
          key={reference.id}
          reference={reference}
          index={referenceIndexes.get(reference.id) ?? 0}
          indexInCell={indexInCell}
          editable={editable}
          onPositionChange={onPositionChange}
        />
      ))}
    </span>
  );
}

export type MatrixReferencePositionTarget = "symbol" | "label";

function MatrixReferenceAnnotation(
  {
    reference,
    index,
    indexInCell,
    editable,
    onPositionChange,
  }: {
    reference: MatrixReference;
    index: number;
    indexInCell: number;
    editable: boolean;
    onPositionChange?: (
      id: string,
      target: MatrixReferencePositionTarget,
      x: number,
      y: number,
    ) => void;
  },
) {
  const fallback = matrixReferenceDefaultPositions(indexInCell);
  const symbolX = reference.symbolX ?? fallback.symbolX;
  const symbolY = reference.symbolY ?? fallback.symbolY;
  const labelX = reference.labelX ?? fallback.labelX;
  const labelY = reference.labelY ?? fallback.labelY;
  const labelRef = useRef<HTMLElement | null>(null);
  const [labelBounds, setLabelBounds] = useState({
    cellWidth: 0,
    cellHeight: 0,
    labelWidth: 0,
    labelHeight: 0,
  });

  useEffect(() => {
    const label = labelRef.current;
    const cell = label?.parentElement;
    if (!label || !cell) return;
    const measure = () => {
      const cellRect = cell.getBoundingClientRect();
      const labelRect = label.getBoundingClientRect();
      setLabelBounds({
        cellWidth: cellRect.width,
        cellHeight: cellRect.height,
        labelWidth: labelRect.width,
        labelHeight: labelRect.height,
      });
    };
    measure();
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(measure);
    observer?.observe(cell);
    observer?.observe(label);
    return () => observer?.disconnect();
  }, [reference.label]);

  const visibleLabelPosition = clampMatrixLabelPosition(
    labelX,
    labelY,
    labelBounds,
  );
  const connector = matrixReferenceConnectorPoints(
    symbolX,
    symbolY,
    visibleLabelPosition.x,
    visibleLabelPosition.y,
  );
  const commonTitle = "drag or use arrow keys to reposition";

  return (
    <>
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <line
          {...connector}
          stroke={matrixReferenceMarkerStyle(index).color}
          strokeWidth="1.5"
          strokeOpacity="0.65"
          strokeDasharray="3 2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {editable
        ? (
          <>
            <button
              type="button"
              title={`Comparison symbol for ${reference.label} — ${commonTitle}`}
              aria-label={`Position comparison symbol for ${reference.label}`}
              className="pointer-events-auto absolute flex h-7 w-7 touch-none select-none items-center justify-center rounded-full border border-gray-300 bg-white/95 shadow-sm cursor-move focus:outline-none focus:ring-2 focus:ring-indigo-600"
              style={matrixReferencePositionStyle(symbolX, symbolY)}
              {...positionControlProps(
                reference.id,
                "symbol",
                symbolX,
                symbolY,
                onPositionChange,
              )}
            >
              <MatrixReferenceMarker index={index} className="h-5 w-5" />
            </button>
            <button
              type="button"
              ref={(element: HTMLElement | null) => {
                labelRef.current = element;
              }}
              title={`Comparison label for ${reference.label} — ${commonTitle}`}
              aria-label={`Position comparison label for ${reference.label}`}
              className="pointer-events-auto absolute max-w-[88%] touch-none select-none rounded-md border border-gray-300 bg-white/95 px-1.5 py-1 text-center text-[10px] font-semibold leading-tight text-gray-900 shadow-sm cursor-move break-words sm:text-xs focus:outline-none focus:ring-2 focus:ring-indigo-600"
              style={matrixReferencePositionStyle(
                visibleLabelPosition.x,
                visibleLabelPosition.y,
              )}
              {...positionControlProps(
                reference.id,
                "label",
                visibleLabelPosition.x,
                visibleLabelPosition.y,
                onPositionChange,
              )}
            >
              {reference.label}
            </button>
          </>
        )
        : (
          <>
            <span
              className="absolute flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 bg-white/95 shadow-sm"
              style={matrixReferencePositionStyle(symbolX, symbolY)}
            >
              <MatrixReferenceMarker index={index} className="h-5 w-5" />
            </span>
            <span
              ref={(element: HTMLElement | null) => {
                labelRef.current = element;
              }}
              title={reference.label}
              className="absolute max-w-[88%] rounded-md border border-gray-300 bg-white/95 px-1.5 py-1 text-center text-[10px] font-semibold leading-tight text-gray-900 shadow-sm break-words sm:text-xs"
              style={matrixReferencePositionStyle(
                visibleLabelPosition.x,
                visibleLabelPosition.y,
              )}
            >
              {reference.label}
            </span>
          </>
        )}
    </>
  );
}

function positionControlProps(
  id: string,
  target: MatrixReferencePositionTarget,
  x: number,
  y: number,
  onPositionChange?: (
    id: string,
    target: MatrixReferencePositionTarget,
    x: number,
    y: number,
  ) => void,
) {
  return {
    onClick: (event: MouseEvent<HTMLButtonElement>) => event.stopPropagation(),
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      if (
        !onPositionChange ||
        !event.currentTarget.hasPointerCapture(event.pointerId)
      ) {
        return;
      }
      const cell = event.currentTarget.parentElement;
      if (!cell) return;
      const cellBounds = cell.getBoundingClientRect();
      if (!cellBounds.width || !cellBounds.height) return;
      const nextX = (event.clientX - cellBounds.left) / cellBounds.width;
      const nextY = (event.clientY - cellBounds.top) / cellBounds.height;
      const next = target === "label"
        ? clampMatrixLabelPosition(nextX, nextY, {
          cellWidth: cellBounds.width,
          cellHeight: cellBounds.height,
          labelWidth: event.currentTarget.offsetWidth,
          labelHeight: event.currentTarget.offsetHeight,
        })
        : {
          x: clampMatrixReferencePosition(nextX),
          y: clampMatrixReferencePosition(nextY),
        };
      onPositionChange(id, target, next.x, next.y);
    },
    onPointerUp: releasePointer,
    onPointerCancel: releasePointer,
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
      if (!onPositionChange) return;
      const step = event.shiftKey ? 0.1 : 0.025;
      const offsets: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const offset = offsets[event.key];
      if (!offset) return;
      event.preventDefault();
      event.stopPropagation();
      const cell = event.currentTarget.parentElement;
      const cellBounds = cell?.getBoundingClientRect();
      const next = target === "label" && cellBounds
        ? clampMatrixLabelPosition(x + offset[0], y + offset[1], {
          cellWidth: cellBounds.width,
          cellHeight: cellBounds.height,
          labelWidth: event.currentTarget.offsetWidth,
          labelHeight: event.currentTarget.offsetHeight,
        })
        : {
          x: clampMatrixReferencePosition(x + offset[0]),
          y: clampMatrixReferencePosition(y + offset[1]),
        };
      onPositionChange(id, target, next.x, next.y);
    },
  };
}

function releasePointer(event: PointerEvent<HTMLButtonElement>) {
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
}

interface MatrixElementBounds {
  cellWidth: number;
  cellHeight: number;
  labelWidth: number;
  labelHeight: number;
}

export function clampMatrixLabelPosition(
  x: number,
  y: number,
  bounds: MatrixElementBounds,
): { x: number; y: number } {
  return {
    x: clampPositionForExtent(
      x,
      bounds.labelWidth,
      bounds.cellWidth,
    ),
    y: clampPositionForExtent(
      y,
      bounds.labelHeight,
      bounds.cellHeight,
    ),
  };
}

function clampPositionForExtent(
  value: number,
  elementSize: number,
  containerSize: number,
): number {
  if (elementSize <= 0 || containerSize <= 0) {
    return clampMatrixReferencePosition(value);
  }
  const padding = 4 / containerSize;
  const extent = elementSize / containerSize / 2 + padding;
  const min = Math.max(
    MATRIX_REFERENCE_POSITION_MIN,
    Math.min(0.5, extent),
  );
  const max = Math.min(
    MATRIX_REFERENCE_POSITION_MAX,
    Math.max(0.5, 1 - extent),
  );
  return roundPosition(Math.min(max, Math.max(min, value)));
}

function roundPosition(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function matrixReferenceConnectorPoints(
  symbolX: number,
  symbolY: number,
  labelX: number,
  labelY: number,
): { x1: string; y1: string; x2: string; y2: string } {
  return {
    x1: `${clampMatrixReferencePosition(symbolX) * 100}%`,
    y1: `${clampMatrixReferencePosition(symbolY) * 100}%`,
    x2: `${clampMatrixReferencePosition(labelX) * 100}%`,
    y2: `${clampMatrixReferencePosition(labelY) * 100}%`,
  };
}

export function matrixReferencePositionStyle(
  x: number,
  y: number,
): { left: string; top: string; transform: string } {
  return {
    left: `${clampMatrixReferencePosition(x) * 100}%`,
    top: `${clampMatrixReferencePosition(y) * 100}%`,
    transform: "translate(-50%, -50%)",
  };
}

export function matrixAnnotationSizeClasses(
  _size: MatrixSize,
): { annotation: string; marker: string } {
  return {
    annotation:
      "max-w-[88%] rounded-md px-1.5 py-1 text-[10px] leading-tight sm:text-xs",
    marker: "h-5 w-5",
  };
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
        Comparison points
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

export function matrixCellMarkerLimit(_size: MatrixSize): number {
  return 8;
}
