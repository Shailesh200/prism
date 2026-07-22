/**
 * Squarified treemap layout (Bruls, Huizing, van Wijk) for overview levels.
 * Pure and deterministic: area is proportional to weight, aspect ratios are
 * kept close to 1 so large repos stay readable where a card grid cannot.
 */

export type TreemapItem = {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly weight: number;
};

export type TreemapCell = TreemapItem & {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

function worst(areas: readonly number[], side: number): number {
  if (areas.length === 0 || side <= 0) return Number.POSITIVE_INFINITY;
  let sum = 0;
  let max = 0;
  let min = Number.POSITIVE_INFINITY;
  for (const a of areas) {
    sum += a;
    if (a > max) max = a;
    if (a < min) min = a;
  }
  const s2 = sum * sum;
  const w2 = side * side;
  if (s2 === 0) return Number.POSITIVE_INFINITY;
  return Math.max((w2 * max) / s2, s2 / (w2 * min));
}

export function squarifyTreemap(
  items: readonly TreemapItem[],
  width: number,
  height: number,
): TreemapCell[] {
  if (width <= 0 || height <= 0 || items.length === 0) return [];
  const positive = items.filter((i) => i.weight > 0);
  const total = positive.reduce((sum, i) => sum + i.weight, 0);
  if (total <= 0) return [];

  const scaled = positive
    .map((item) => ({ item, area: (item.weight / total) * width * height }))
    .sort((a, b) => b.area - a.area || a.item.id.localeCompare(b.item.id));

  const cells: TreemapCell[] = [];
  let x = 0;
  let y = 0;
  let w = width;
  let h = height;
  let row: { item: TreemapItem; area: number }[] = [];

  const layoutRow = () => {
    if (row.length === 0) return;
    const rowArea = row.reduce((sum, r) => sum + r.area, 0);
    if (w >= h) {
      const rw = rowArea / h;
      let ry = y;
      for (const r of row) {
        const rh = rw > 0 ? r.area / rw : 0;
        cells.push({ ...r.item, x, y: ry, w: rw, h: rh });
        ry += rh;
      }
      x += rw;
      w -= rw;
    } else {
      const rh = rowArea / w;
      let rx = x;
      for (const r of row) {
        const rw = rh > 0 ? r.area / rh : 0;
        cells.push({ ...r.item, x: rx, y, w: rw, h: rh });
        rx += rw;
      }
      y += rh;
      h -= rh;
    }
  };

  for (const s of scaled) {
    const side = Math.min(w, h);
    const current = row.map((r) => r.area);
    if (
      row.length === 0 ||
      worst([...current, s.area], side) <= worst(current, side)
    ) {
      row.push(s);
    } else {
      layoutRow();
      row = [s];
    }
  }
  layoutRow();
  return cells;
}
