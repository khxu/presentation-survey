import { deepStrictEqual } from "node:assert/strict";
import {
  matrixPositionFromClientPoint,
  moveMatrixPosition,
} from "./MatrixInput.tsx";

Deno.test("matrix pointer coordinates normalize and clamp to the grid", () => {
  const bounds = { left: 100, top: 50, width: 400, height: 200 };
  deepStrictEqual(
    matrixPositionFromClientPoint(200, 100, bounds),
    { x: 0.25, y: 0.25 },
  );
  deepStrictEqual(
    matrixPositionFromClientPoint(50, 300, bounds),
    { x: 0, y: 1 },
  );
});

Deno.test("matrix keyboard movement starts at center and respects bounds", () => {
  deepStrictEqual(moveMatrixPosition(undefined, "ArrowRight"), {
    x: 0.525,
    y: 0.5,
  });
  deepStrictEqual(
    moveMatrixPosition({ x: 0.99, y: 0.01 }, "ArrowRight", true),
    { x: 1, y: 0.01 },
  );
  deepStrictEqual(moveMatrixPosition({ x: 0.5, y: 0.5 }, "Enter"), null);
});
