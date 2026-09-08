import { deepStrictEqual, equal } from "node:assert/strict";
import {
  matrixCellMarkerLimit,
  matrixReferenceMarkerStyle,
  matrixReferenceMinimapCells,
  matrixReferencePositionText,
  matrixReferenceText,
} from "./MatrixCellReferences.tsx";

Deno.test("matrix reference text includes every nonempty label", () => {
  equal(
    matrixReferenceText([
      { label: "First reference" },
      { label: " Second reference " },
      { label: " " },
      { label: "Third" },
    ]),
    "First reference · Second reference · Third",
  );
});

Deno.test("matrix cell marker limits decrease for denser grids", () => {
  deepStrictEqual(
    ([2, 4, 6] as const).map(matrixCellMarkerLimit),
    [8, 4, 3],
  );
});

Deno.test("matrix reference marker styles are deterministic and unique", () => {
  const first = Array.from(
    { length: 100 },
    (_, index) => matrixReferenceMarkerStyle(index),
  );
  deepStrictEqual(
    first,
    first.map((_, index) => matrixReferenceMarkerStyle(index)),
  );
  equal(new Set(first.map((marker) => marker.key)).size, 100);
});

Deno.test("matrix reference minimap highlights exactly the selected cell", () => {
  const cells = matrixReferenceMinimapCells({ row: 1, column: 2 }, 4);
  equal(cells.length, 16);
  equal(cells.filter(Boolean).length, 1);
  equal(cells[6], true);
  equal(
    matrixReferencePositionText({ row: 1, column: 2 }, 4),
    "Column 3 of 4, row 2 of 4 from top",
  );
});
