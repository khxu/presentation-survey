/** @jsxImportSource https://esm.sh/react@18.2.0 */
import type { MatrixAnswer, Question } from "../../../shared/types.ts";
import { isMatrixAnswer, matrixCellKey } from "../../../shared/questions.ts";

interface Props {
  q: Question;
  value: unknown;
  onChange: (value: MatrixAnswer) => void;
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
  const selected = isMatrixAnswer(value, size) ? value : undefined;

  return (
    <div className="space-y-4">
      <div className="mx-auto max-w-lg">
        <div className="mb-2 text-center text-sm font-semibold text-gray-700">
          {labels.top}
        </div>
        <div
          className="grid aspect-square overflow-hidden rounded-xl border-2 border-gray-500 bg-white shadow-sm"
          style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: size * size }, (_, index) => {
            const row = Math.floor(index / size);
            const column = index % size;
            const cellReferences = references.filter((reference) =>
              reference.row === row && reference.column === column
            );
            const on = selected?.row === row && selected.column === column;
            const middleTop = row === size / 2;
            const middleLeft = column === size / 2;
            const referenceText = cellReferences.map((reference) =>
              reference.label
            ).join(", ");
            return (
              <button
                type="button"
                key={matrixCellKey(row, column)}
                onClick={() => onChange({ row, column })}
                aria-pressed={on}
                aria-label={`Column ${column + 1} of ${size}, row ${
                  row + 1
                } of ${size} from top${
                  referenceText ? `. Reference items: ${referenceText}` : ""
                }`}
                className={`relative min-w-0 border-gray-200 p-1 text-left transition active:scale-95 ${
                  on
                    ? "z-10 bg-indigo-600 text-white ring-2 ring-inset ring-indigo-900"
                    : "hover:bg-indigo-50"
                } ${middleTop ? "border-t-2 border-t-gray-500" : "border-t"} ${
                  middleLeft ? "border-l-2 border-l-gray-500" : "border-l"
                }`}
              >
                {cellReferences.length > 0 && (
                  <span
                    className={`block truncate text-[9px] leading-tight sm:text-xs ${
                      on ? "text-white" : "text-gray-600"
                    }`}
                  >
                    {cellReferences[0].label}
                    {cellReferences.length > 1
                      ? ` +${cellReferences.length - 1}`
                      : ""}
                  </span>
                )}
                {on && (
                  <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-2 grid grid-cols-3 items-start gap-2 text-sm font-semibold text-gray-700">
          <span className="text-left">{labels.left}</span>
          <span className="text-center">{labels.bottom}</span>
          <span className="text-right">{labels.right}</span>
        </div>
      </div>

      {selected && (
        <p
          role="status"
          className="rounded-lg bg-indigo-50 px-3 py-2 text-center text-sm text-indigo-800"
        >
          Selected column {selected.column + 1} of {size}, row{" "}
          {selected.row + 1} of {size} from top.
        </p>
      )}

      {references.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Reference positions
          </p>
          <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {references.map((reference) => (
              <div key={reference.id} className="flex gap-2">
                <span className="shrink-0 font-mono text-xs text-indigo-600">
                  C{reference.column + 1}/R{reference.row + 1}
                </span>
                <span className="break-words">{reference.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
