export type Point = [number, number];

/**
 * A smooth line through the points that never overshoots them (monotone
 * cubic, Fritsch-Carlson): a day at zero stays at zero instead of the curve
 * dipping under the axis to get there, which a plain spline would do.
 */
export function monotone(points: Point[]): string {
  const n = points.length;
  if (n === 0) return "";
  const [x0, y0] = points[0]!;
  if (n === 1) return `M${x0.toFixed(1)},${y0.toFixed(1)}`;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    dx.push(b[0] - a[0]);
    slope.push((b[1] - a[1]) / (b[0] - a[0] || 1));
  }
  const tangent: number[] = [slope[0]!];
  for (let i = 1; i < n - 1; i++) {
    const s0 = slope[i - 1]!;
    const s1 = slope[i]!;
    tangent.push(s0 * s1 <= 0 ? 0 : (s0 + s1) / 2);
  }
  tangent.push(slope[n - 2]!);
  for (let i = 0; i < n - 1; i++) {
    const s = slope[i]!;
    if (s === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i]! / s;
    const b = tangent[i + 1]! / s;
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      tangent[i] = t * a * s;
      tangent[i + 1] = t * b * s;
    }
  }
  let d = `M${x0.toFixed(1)},${y0.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const [ax, ay] = points[i]!;
    const [bx, by] = points[i + 1]!;
    const h = dx[i]! / 3;
    d += `C${(ax + h).toFixed(1)},${(ay + h * tangent[i]!).toFixed(1)} ${(bx - h).toFixed(1)},${(by - h * tangent[i + 1]!).toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}`;
  }
  return d;
}
