import { deepStrictEqual, equal } from "node:assert/strict";
import {
  clampMatrixLabelPosition,
  matrixAnnotationSizeClasses,
  matrixCellMarkerLimit,
  matrixReferenceConnectorPoints,
  matrixReferenceMarkerStyle,
  matrixReferenceMinimapCells,
  matrixReferencePositionStyle,
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

Deno.test("matrix cell marker limits fit the fixed 2x2 grid", () => {
  equal(matrixCellMarkerLimit(2), 8);
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
  const cells = matrixReferenceMinimapCells({ row: 1, column: 0 }, 2);
  equal(cells.length, 4);
  equal(cells.filter(Boolean).length, 1);
  equal(cells[2], true);
  equal(
    matrixReferencePositionText({ row: 1, column: 0 }, 2),
    "Column 1 of 2, row 2 of 2 from top",
  );
});

Deno.test("matrix reference position styles use bounded percentages", () => {
  deepStrictEqual(matrixReferencePositionStyle(0.25, 0.75), {
    left: "25%",
    top: "75%",
    transform: "translate(-50%, -50%)",
  });
  deepStrictEqual(matrixReferencePositionStyle(-1, 2), {
    left: "8%",
    top: "92%",
    transform: "translate(-50%, -50%)",
  });
});

Deno.test("matrix annotations use the fixed 2x2 sizing", () => {
  const classes = matrixAnnotationSizeClasses(2);
  equal(classes.annotation.includes("text-[10px]"), true);
  equal(classes.marker, "h-5 w-5");
});

Deno.test("matrix label positions account for rendered bounds", () => {
  deepStrictEqual(
    clampMatrixLabelPosition(0.1, 0.9, {
      cellWidth: 200,
      cellHeight: 100,
      labelWidth: 120,
      labelHeight: 20,
    }),
    { x: 0.32, y: 0.86 },
  );
  deepStrictEqual(
    clampMatrixLabelPosition(0.25, 0.75, {
      cellWidth: 0,
      cellHeight: 0,
      labelWidth: 0,
      labelHeight: 0,
    }),
    { x: 0.25, y: 0.75 },
  );
});

Deno.test("matrix connectors use bounded percentage coordinates", () => {
  deepStrictEqual(matrixReferenceConnectorPoints(0.2, 0.3, 0.8, 0.7), {
    x1: "20%",
    y1: "30%",
    x2: "80%",
    y2: "70%",
  });
});
