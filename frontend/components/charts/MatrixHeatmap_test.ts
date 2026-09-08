import { deepStrictEqual, equal } from "node:assert/strict";
import {
  matrixDensity,
  matrixScatterOffsets,
} from "../../lib/matrixResults.ts";

Deno.test("matrix density bins continuous positions including edges", () => {
  const density = matrixDensity([
    { x: 0, y: 0 },
    { x: 0.24, y: 0.24 },
    { x: 1, y: 1 },
  ], 4);
  equal(density.counts[0], 2);
  equal(density.counts[15], 1);
  equal(density.max, 2);
});

Deno.test("matrix scatter offsets separate identical placements deterministically", () => {
  const points = [
    { x: 0.5, y: 0.5 },
    { x: 0.5, y: 0.5 },
    { x: 0.5, y: 0.5 },
    { x: 0.2, y: 0.2 },
  ];
  const offsets = matrixScatterOffsets(points);
  deepStrictEqual(offsets[0], { x: 0, y: 0 });
  equal(offsets[1].x !== 0 || offsets[1].y !== 0, true);
  equal(offsets[2].x !== offsets[1].x || offsets[2].y !== offsets[1].y, true);
  deepStrictEqual(offsets[3], { x: 0, y: 0 });
  deepStrictEqual(matrixScatterOffsets(points), offsets);
});
