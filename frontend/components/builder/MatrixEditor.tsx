/** @jsxImportSource https://esm.sh/react@18.2.0 */
import { useState } from "https://esm.sh/react@18.2.0";
import type { Question } from "../../../shared/types.ts";
import {
  matrixCellKey,
  matrixReferenceDefaultPositions,
  QUESTION_LIMITS,
} from "../../../shared/questions.ts";
import { uid } from "../../lib/api.ts";
import {
  MatrixCellAnnotations,
  MatrixReferenceLegend,
  type MatrixReferencePositionTarget,
  matrixReferenceText,
} from "../MatrixCellReferences.tsx";

interface Props {
  q: Question;
  onChange: (q: Question) => void;
}

export function MatrixEditor({ q, onChange }: Props) {
  const size = q.matrixSize ?? 2;
  const labels = q.matrixAxisLabels ?? {
    left: "Left",
    right: "Right",
    bottom: "Bottom",
    top: "Top",
  };
  const references = q.matrixReferences ?? [];
  const [selectedKey, setSelectedKey] = useState(matrixCellKey(0, 0));
  const [selectedRow, selectedColumn] = selectedKey.split(",").map(Number);
  const selectedReferences = references.filter((reference) =>
    reference.row === selectedRow && reference.column === selectedColumn
  );

  const set = (patch: Partial<Question>) => onChange({ ...q, ...patch });

  function changeReferencePosition(
    id: string,
    target: MatrixReferencePositionTarget,
    x: number,
    y: number,
  ) {
    set({
      matrixReferences: references.map((reference) =>
        reference.id === id
          ? {
            ...reference,
            ...(target === "symbol"
              ? { symbolX: x, symbolY: y }
              : { labelX: x, labelY: y }),
          }
          : reference
      ),
    });
  }

  return (
    <div className="space-y-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-medium">2×2 grid</span>
        <span className="text-xs text-gray-500">4 selectable cells</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {(["left", "right", "bottom", "top"] as const).map((key) => (
          <label
            key={key}
            className="text-xs font-medium capitalize text-gray-600"
          >
            {key} endpoint
            <input
              value={labels[key]}
              maxLength={QUESTION_LIMITS.matrixAxisLabel}
              onChange={(event: any) =>
                set({
                  matrixAxisLabels: { ...labels, [key]: event.target.value },
                })}
              className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-800"
            />
          </label>
        ))}
      </div>

      <div>
        <p className="mb-2 text-xs text-gray-500">
          Select a cell, then add comparison items that respondents should see
          there. Drag the symbol and its label separately, or focus either one
          and use the arrow keys, to position them within the cell.
        </p>
        <div className="mx-auto max-w-md">
          <div className="mb-1 text-center text-xs font-semibold text-gray-600">
            {labels.top || "Top"}
          </div>
          <div
            className="grid aspect-square overflow-hidden rounded-lg border-2 border-gray-400 bg-white"
            style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: size * size }, (_, index) => {
              const row = Math.floor(index / size);
              const column = index % size;
              const key = matrixCellKey(row, column);
              const cellReferences = references.filter((reference) =>
                reference.row === row && reference.column === column
              );
              const selected = key === selectedKey;
              const middleTop = row === size / 2;
              const middleLeft = column === size / 2;
              const referenceText = matrixReferenceText(cellReferences);
              return (
                <div
                  key={key}
                  className={`relative min-w-0 overflow-hidden border-gray-200 ${
                    middleTop ? "border-t-2 border-t-gray-500" : "border-t"
                  } ${
                    middleLeft ? "border-l-2 border-l-gray-500" : "border-l"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedKey(key)}
                    aria-label={`Edit references in column ${column + 1}, row ${
                      row + 1
                    } from top${
                      referenceText ? `. Reference items: ${referenceText}` : ""
                    }`}
                    title={referenceText || undefined}
                    className={`absolute inset-0 text-left ${
                      selected
                        ? "bg-indigo-100 ring-2 ring-inset ring-indigo-600"
                        : "hover:bg-indigo-50"
                    }`}
                  />
                  {cellReferences.length > 0 && (
                    <>
                      <span className="pointer-events-none absolute right-1 top-1 z-20 rounded-full bg-indigo-600 px-1 text-[9px] text-white">
                        {cellReferences.length}
                      </span>
                      <MatrixCellAnnotations
                        references={references}
                        cellReferences={cellReferences}
                        size={size}
                        editable
                        onPositionChange={changeReferencePosition}
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-1 grid grid-cols-3 items-start gap-2 text-xs font-semibold text-gray-600">
            <span className="text-left">{labels.left || "Left"}</span>
            <span className="text-center">{labels.bottom || "Bottom"}</span>
            <span className="text-right">{labels.right || "Right"}</span>
          </div>
          <MatrixReferenceLegend
            references={references}
            size={size}
            className="mt-3"
          />
        </div>
      </div>

      <div className="rounded-lg border bg-white p-3">
        <div className="flex items-center gap-2">
          <p className="flex-1 text-sm font-semibold">
            References in column {selectedColumn + 1}, row {selectedRow + 1}
            {" "}
            from top
          </p>
          <button
            type="button"
            disabled={references.length >= QUESTION_LIMITS.matrixReferences}
            onClick={() => {
              const position = matrixReferenceDefaultPositions(
                selectedReferences.length,
              );
              set({
                matrixReferences: [
                  ...references,
                  {
                    id: uid(),
                    row: selectedRow,
                    column: selectedColumn,
                    label: "",
                    ...position,
                  },
                ],
              });
            }}
            className="text-sm text-indigo-600 hover:underline disabled:opacity-40"
          >
            + add reference
          </button>
        </div>
        {selectedReferences.length === 0 && (
          <p className="mt-2 text-xs text-gray-400">
            No comparison items in this cell.
          </p>
        )}
        <div className="mt-2 space-y-2">
          {selectedReferences.map((reference, index) => (
            <div key={reference.id} className="flex items-center gap-2">
              <input
                value={reference.label}
                aria-label={`Reference ${index + 1}`}
                maxLength={QUESTION_LIMITS.matrixReferenceLabel}
                placeholder="Comparison item"
                onChange={(event: any) =>
                  set({
                    matrixReferences: references.map((item) =>
                      item.id === reference.id
                        ? { ...item, label: event.target.value }
                        : item
                    ),
                  })}
                className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() =>
                  set({
                    matrixReferences: references.filter((item) =>
                      item.id !== reference.id
                    ),
                  })}
                className="text-gray-400 hover:text-red-500"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
