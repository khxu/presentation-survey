/** @jsxImportSource https://esm.sh/react@18.2.0 */
import type { MatrixReference, MatrixSize } from "../../shared/types.ts";

interface Props {
  references: MatrixReference[];
  size: MatrixSize;
  className?: string;
}

export function MatrixCellReferences(
  { references, size, className = "" }: Props,
) {
  const text = matrixReferenceText(references);
  if (!text) return null;

  return (
    <span
      className={`block max-w-full break-words ${className}`}
      style={{
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: matrixReferenceLineLimit(size),
        overflow: "hidden",
        overflowWrap: "anywhere",
      }}
    >
      {text}
    </span>
  );
}

export function matrixReferenceText(
  references: Pick<MatrixReference, "label">[],
): string {
  return references
    .map((reference) => reference.label.trim())
    .filter(Boolean)
    .join(" · ");
}

export function matrixReferenceLineLimit(size: MatrixSize): number {
  if (size === 2) return 4;
  if (size === 4) return 3;
  return 2;
}
