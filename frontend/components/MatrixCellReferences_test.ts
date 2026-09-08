import { deepStrictEqual, equal } from "node:assert/strict";
import {
  matrixReferenceLineLimit,
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

Deno.test("matrix reference line limits decrease for denser grids", () => {
  deepStrictEqual(
    ([2, 4, 6] as const).map(matrixReferenceLineLimit),
    [4, 3, 2],
  );
});
