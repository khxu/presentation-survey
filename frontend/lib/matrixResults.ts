import type { MatrixAnswer } from "../../shared/types.ts";

export interface MatrixDensity {
  counts: number[];
  max: number;
  bins: number;
}

export function matrixDensity(
  points: MatrixAnswer[],
  bins = 12,
): MatrixDensity {
  const counts = Array.from({ length: bins * bins }, () => 0);
  for (const point of points) {
    const column = Math.min(bins - 1, Math.floor(point.x * bins));
    const row = Math.min(bins - 1, Math.floor(point.y * bins));
    counts[row * bins + column]++;
  }
  return { counts, max: Math.max(1, ...counts), bins };
}

export function matrixScatterOffsets(
  points: MatrixAnswer[],
): { x: number; y: number }[] {
  const seen = new Map<string, number>();
  return points.map((point) => {
    const key = `${point.x.toFixed(3)},${point.y.toFixed(3)}`;
    const index = seen.get(key) ?? 0;
    seen.set(key, index + 1);
    if (index === 0) return { x: 0, y: 0 };
    const ring = Math.ceil(index / 8);
    const angle = ((index - 1) % 8) * Math.PI / 4;
    return {
      x: Math.round(Math.cos(angle) * ring * 4),
      y: Math.round(Math.sin(angle) * ring * 4),
    };
  });
}
