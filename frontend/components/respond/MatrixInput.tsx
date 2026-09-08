/** @jsxImportSource https://esm.sh/react@18.2.0 */
import type { KeyboardEvent, PointerEvent } from "https://esm.sh/react@18.2.0";
import type { MatrixAnswer, Question } from "../../../shared/types.ts";
import {
  clampMatrixAnswerPosition,
  matrixCellKey,
  normalizeMatrixAnswer,
} from "../../../shared/questions.ts";
import {
  MatrixCellAnnotations,
  MatrixReferenceLegend,
} from "../MatrixCellReferences.tsx";

interface Props {
  q: Question;
  value: unknown;
  onChange: (value: MatrixAnswer) => void;
}

interface MatrixBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function matrixPositionFromClientPoint(
  clientX: number,
  clientY: number,
  bounds: MatrixBounds,
): MatrixAnswer {
  if (!bounds.width || !bounds.height) return { x: 0.5, y: 0.5 };
  return {
    x: clampMatrixAnswerPosition((clientX - bounds.left) / bounds.width),
    y: clampMatrixAnswerPosition((clientY - bounds.top) / bounds.height),
  };
}

export function moveMatrixPosition(
  current: MatrixAnswer | undefined,
  key: string,
  largeStep = false,
): MatrixAnswer | null {
  const step = largeStep ? 0.1 : 0.025;
  const offsets: Record<string, [number, number]> = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  };
  const offset = offsets[key];
  if (!offset) return null;
  const origin = current ?? { x: 0.5, y: 0.5 };
  return {
    x: clampMatrixAnswerPosition(origin.x + offset[0]),
    y: clampMatrixAnswerPosition(origin.y + offset[1]),
  };
}

export function MatrixInput({ q, value, onChange }: Props) {
  const size = q.matrixSize ?? 2;
  const labels = q.matrixAxisLabels ?? {
    left: "Left",
    right: "Right",
    bottom: "Bottom",
    top: "Top",
  };
  const references = q.matrixReferences ?? [];
  const subjectLabel = q.matrixSubjectLabel?.trim() || "Item";
  const selected = normalizeMatrixAnswer(value, size) ?? undefined;

  function updateFromPointer(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    onChange(
      matrixPositionFromClientPoint(event.clientX, event.clientY, bounds),
    );
  }

  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const next = moveMatrixPosition(selected, event.key, event.shiftKey);
    if (!next) return;
    event.preventDefault();
    onChange(next);
  }

  const markerPosition = selected ?? { x: 0.5, y: 0.5 };

  return (
    <div className="space-y-4">
      <p className="text-center text-sm text-gray-600">
        Drag <strong>{subjectLabel}</strong>{" "}
        into position, or tap anywhere in the grid. Use arrow keys for precise
        adjustments.
      </p>
      <div className="mx-auto max-w-lg">
        <div className="mb-2 text-center text-sm font-semibold text-gray-700">
          {labels.top}
        </div>
        <div
          role="application"
          aria-label={`Place ${subjectLabel} on the 2 by 2 matrix`}
          className="relative grid aspect-square touch-none select-none rounded-xl border-2 border-gray-500 bg-white shadow-sm"
          style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            updateFromPointer(event);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              updateFromPointer(event);
            }
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onPointerCancel={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
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
          <button
            type="button"
            onKeyDown={keyDown}
            onPointerDown={(event) => event.currentTarget.focus()}
            aria-label={`${subjectLabel} placement${
              selected
                ? ` at ${
                  Math.round(selected.x * 100)
                } percent from the left and ${
                  Math.round(selected.y * 100)
                } percent from the top`
                : ", not yet placed"
            }. Drag, tap the grid, or use arrow keys to position it.`}
            className={`absolute z-30 flex max-w-[44%] -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border-2 px-2.5 py-1.5 text-xs font-bold shadow-lg touch-none focus:outline-none focus:ring-4 focus:ring-indigo-200 sm:text-sm ${
              selected
                ? "border-indigo-900 bg-indigo-600 text-white cursor-move"
                : "border-dashed border-indigo-500 bg-white text-indigo-700 cursor-grab"
            }`}
            style={{
              left: `${markerPosition.x * 100}%`,
              top: `${markerPosition.y * 100}%`,
            }}
          >
            <span
              aria-hidden="true"
              className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                selected
                  ? "border-white bg-indigo-200"
                  : "border-indigo-600 bg-indigo-100"
              }`}
            />
            <span className="min-w-0 break-words">{subjectLabel}</span>
          </button>
        </div>
        <div className="mt-2 grid grid-cols-3 items-start gap-2 text-sm font-semibold text-gray-700">
          <span className="text-left">{labels.left}</span>
          <span className="text-center">{labels.bottom}</span>
          <span className="text-right">{labels.right}</span>
        </div>
        <MatrixReferenceLegend
          references={references}
          size={size}
          className="mt-3"
        />
      </div>

      {selected
        ? (
          <p
            role="status"
            className="rounded-lg bg-indigo-50 px-3 py-2 text-center text-sm text-indigo-800"
          >
            {subjectLabel} is {Math.round(selected.x * 100)}% from the left and
            {" "}
            {Math.round(selected.y * 100)}% from the top.
          </p>
        )
        : (
          <p
            role="status"
            className="rounded-lg bg-amber-50 px-3 py-2 text-center text-sm text-amber-800"
          >
            Move the symbol to record your answer.
          </p>
        )}
    </div>
  );
}
