import type { WorldMapDefinition } from "../content/schemas";
import {
  findNearestTraversablePosition,
  getTerrainMovementMultiplier,
  isWorldPositionTraversable,
} from "./WorldTerrain";

export interface WorldPoint {
  x: number;
  y: number;
}

const CELL_SIZE = 64;
const UNIT_RADIUS = 30;

export function findWorldPath(
  map: WorldMapDefinition,
  start: WorldPoint,
  target: WorldPoint,
): WorldPoint[] {
  const destination = findNearestTraversablePosition(
    map,
    target.x,
    target.y,
    UNIT_RADIUS,
  );
  if (hasTraversableLine(map, start, destination)) return [destination];

  const columns = Math.ceil(map.width / CELL_SIZE);
  const rows = Math.ceil(map.height / CELL_SIZE);
  const startCell = nearestTraversableCell(map, start, columns, rows);
  const targetCell = nearestTraversableCell(map, destination, columns, rows);
  if (!startCell || !targetCell) return [destination];

  const startKey = cellKey(startCell.column, startCell.row);
  const targetKey = cellKey(targetCell.column, targetCell.row);
  const open = new Set([startKey]);
  const cameFrom = new Map<string, string>();
  const costFromStart = new Map([[startKey, 0]]);
  const estimatedCost = new Map([
    [startKey, cellDistance(startCell, targetCell)],
  ]);

  while (open.size > 0) {
    const currentKey = lowestCostKey(open, estimatedCost);
    if (currentKey === targetKey) {
      const cells = reconstructCells(cameFrom, currentKey);
      const points = cells
        .slice(1)
        .map((cell) => cellCenter(cell.column, cell.row));
      points.push(destination);
      return simplifyPath(map, start, points);
    }

    open.delete(currentKey);
    const current = parseCellKey(currentKey);
    for (const neighbor of neighbors(current, columns, rows)) {
      const point = cellCenter(neighbor.column, neighbor.row);
      if (!isWorldPositionTraversable(map, point.x, point.y, UNIT_RADIUS)) {
        continue;
      }
      if (
        neighbor.column !== current.column &&
        neighbor.row !== current.row &&
        !canTraverseDiagonal(map, current, neighbor)
      ) {
        continue;
      }

      const neighborKey = cellKey(neighbor.column, neighbor.row);
      const movementMultiplier = Math.max(
        0.2,
        getTerrainMovementMultiplier(map, point.x, point.y),
      );
      const tentativeCost =
        (costFromStart.get(currentKey) ?? Number.POSITIVE_INFINITY) +
        cellDistance(current, neighbor) / movementMultiplier;
      if (
        tentativeCost >=
        (costFromStart.get(neighborKey) ?? Number.POSITIVE_INFINITY)
      ) {
        continue;
      }

      cameFrom.set(neighborKey, currentKey);
      costFromStart.set(neighborKey, tentativeCost);
      estimatedCost.set(
        neighborKey,
        tentativeCost + cellDistance(neighbor, targetCell),
      );
      open.add(neighborKey);
    }
  }

  return [destination];
}

function simplifyPath(
  map: WorldMapDefinition,
  start: WorldPoint,
  points: WorldPoint[],
): WorldPoint[] {
  const simplified: WorldPoint[] = [];
  let anchor = start;
  let index = 0;
  while (index < points.length) {
    let furthest = index;
    for (let candidate = index + 1; candidate < points.length; candidate += 1) {
      if (!hasTraversableLine(map, anchor, points[candidate])) break;
      furthest = candidate;
    }
    simplified.push(points[furthest]);
    anchor = points[furthest];
    index = furthest + 1;
  }
  return simplified;
}

function hasTraversableLine(
  map: WorldMapDefinition,
  start: WorldPoint,
  target: WorldPoint,
): boolean {
  const distance = Math.hypot(target.x - start.x, target.y - start.y);
  const steps = Math.max(1, Math.ceil(distance / 18));
  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    if (
      !isWorldPositionTraversable(
        map,
        start.x + (target.x - start.x) * progress,
        start.y + (target.y - start.y) * progress,
        UNIT_RADIUS,
      )
    ) {
      return false;
    }
  }
  return true;
}

function canTraverseDiagonal(
  map: WorldMapDefinition,
  current: GridCell,
  neighbor: GridCell,
): boolean {
  const horizontal = cellCenter(neighbor.column, current.row);
  const vertical = cellCenter(current.column, neighbor.row);
  return (
    isWorldPositionTraversable(map, horizontal.x, horizontal.y, UNIT_RADIUS) &&
    isWorldPositionTraversable(map, vertical.x, vertical.y, UNIT_RADIUS)
  );
}

interface GridCell {
  column: number;
  row: number;
}

function nearestTraversableCell(
  map: WorldMapDefinition,
  point: WorldPoint,
  columns: number,
  rows: number,
): GridCell | null {
  const origin = {
    column: Math.max(0, Math.min(columns - 1, Math.floor(point.x / CELL_SIZE))),
    row: Math.max(0, Math.min(rows - 1, Math.floor(point.y / CELL_SIZE))),
  };
  for (let radius = 0; radius <= 8; radius += 1) {
    for (let column = origin.column - radius; column <= origin.column + radius; column += 1) {
      for (let row = origin.row - radius; row <= origin.row + radius; row += 1) {
        if (column < 0 || row < 0 || column >= columns || row >= rows) continue;
        const candidate = cellCenter(column, row);
        if (
          isWorldPositionTraversable(
            map,
            candidate.x,
            candidate.y,
            UNIT_RADIUS,
          )
        ) {
          return { column, row };
        }
      }
    }
  }
  return null;
}

function neighbors(
  cell: GridCell,
  columns: number,
  rows: number,
): GridCell[] {
  const result: GridCell[] = [];
  for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
    for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
      if (columnOffset === 0 && rowOffset === 0) continue;
      const column = cell.column + columnOffset;
      const row = cell.row + rowOffset;
      if (column >= 0 && row >= 0 && column < columns && row < rows) {
        result.push({ column, row });
      }
    }
  }
  return result;
}

function reconstructCells(
  cameFrom: Map<string, string>,
  currentKey: string,
): GridCell[] {
  const result = [parseCellKey(currentKey)];
  while (cameFrom.has(currentKey)) {
    currentKey = cameFrom.get(currentKey)!;
    result.push(parseCellKey(currentKey));
  }
  return result.reverse();
}

function lowestCostKey(
  keys: Set<string>,
  costs: Map<string, number>,
): string {
  let result = "";
  let lowest = Number.POSITIVE_INFINITY;
  for (const key of keys) {
    const cost = costs.get(key) ?? Number.POSITIVE_INFINITY;
    if (cost < lowest) {
      lowest = cost;
      result = key;
    }
  }
  return result;
}

function cellDistance(first: GridCell, second: GridCell): number {
  return Math.hypot(
    first.column - second.column,
    first.row - second.row,
  );
}

function cellCenter(column: number, row: number): WorldPoint {
  return {
    x: column * CELL_SIZE + CELL_SIZE / 2,
    y: row * CELL_SIZE + CELL_SIZE / 2,
  };
}

function cellKey(column: number, row: number): string {
  return `${column}:${row}`;
}

function parseCellKey(key: string): GridCell {
  const [column, row] = key.split(":").map(Number);
  return { column, row };
}
