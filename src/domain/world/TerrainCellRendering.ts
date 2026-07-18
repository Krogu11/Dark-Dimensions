import type { TerrainCell } from "../content/schemas";

export interface TerrainRenderRect {
  x: number;
  y: number;
  width: number;
  height: number;
  type: TerrainCell["type"];
}

export function mergeTerrainCellsIntoRenderRects(
  terrainCells: TerrainCell[],
): TerrainRenderRect[] {
  const rows = new Map<number, TerrainCell[]>();
  for (const cell of terrainCells) {
    const row = rows.get(cell.y) ?? [];
    row.push(cell);
    rows.set(cell.y, row);
  }

  const rects: TerrainRenderRect[] = [];
  const sortedRows = [...rows.entries()].sort(([left], [right]) => left - right);
  for (const [, rowCells] of sortedRows) {
    const sortedCells = rowCells.sort((left, right) => left.x - right.x);
    let current: TerrainRenderRect | null = null;
    for (const cell of sortedCells) {
      if (
        current &&
        current.type === cell.type &&
        Math.abs(current.x + current.width - cell.x) <= 1 &&
        current.height === cell.size
      ) {
        current.width += cell.size;
        continue;
      }

      if (current) rects.push(current);
      current = {
        x: cell.x,
        y: cell.y,
        width: cell.size,
        height: cell.size,
        type: cell.type,
      };
    }

    if (current) rects.push(current);
  }

  return rects;
}
