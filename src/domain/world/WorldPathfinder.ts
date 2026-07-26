import type { WorldMapDefinition } from "../content/schemas";
import {
  findNearestTraversablePosition,
  getTerrainAt,
  getTerrainMovementMultiplier,
  isWorldPositionTraversable,
} from "./WorldTerrain";

export interface WorldPoint {
  x: number;
  y: number;
}

const DEFAULT_CELL_SIZE = 64;
const DEFAULT_UNIT_RADIUS = 30;

export interface WorldPathOptions {
  cellSize?: number;
  unitRadius?: number;
  roadPreference?: number;
  directPathMaxDistance?: number;
  searchMargin?: number;
}

export function findWorldPath(
  map: WorldMapDefinition,
  start: WorldPoint,
  target: WorldPoint,
  options: WorldPathOptions = {},
): WorldPoint[] {
  const cellSize = Math.max(24, options.cellSize ?? DEFAULT_CELL_SIZE);
  const unitRadius = Math.max(0, options.unitRadius ?? DEFAULT_UNIT_RADIUS);
  const roadPreference = Math.max(1, options.roadPreference ?? 1);
  const directPathMaxDistance =
    options.directPathMaxDistance ?? Number.POSITIVE_INFINITY;
  const searchMargin = options.searchMargin ?? Number.POSITIVE_INFINITY;
  const destination = findNearestTraversablePosition(
    map,
    target.x,
    target.y,
    unitRadius,
  );
  if (
    Math.hypot(destination.x - start.x, destination.y - start.y) <=
      directPathMaxDistance &&
    hasTraversableLine(map, start, destination, unitRadius)
  ) {
    return [destination];
  }

  const columns = Math.ceil(map.width / cellSize);
  const rows = Math.ceil(map.height / cellSize);
  const startCell = nearestTraversableCell(
    map,
    start,
    columns,
    rows,
    cellSize,
    unitRadius,
  );
  const targetCell = nearestTraversableCell(
    map,
    destination,
    columns,
    rows,
    cellSize,
    unitRadius,
  );
  if (!startCell || !targetCell) return [destination];

  const startKey = cellKey(startCell.column, startCell.row);
  const targetKey = cellKey(targetCell.column, targetCell.row);
  const open = new MinPriorityQueue();
  open.push(startKey, 0);
  const closed = new Set<string>();
  const cameFrom = new Map<string, string>();
  const costFromStart = new Map([[startKey, 0]]);
  const estimatedCost = new Map([
    [
      startKey,
      cellDistance(startCell, targetCell) /
        Math.max(1, 1.22 * roadPreference),
    ],
  ]);

  while (open.size > 0) {
    const currentKey = open.pop();
    if (!currentKey || closed.has(currentKey)) continue;
    if (currentKey === targetKey) {
      const cells = reconstructCells(cameFrom, currentKey);
      const points = cells
        .slice(1)
        .map((cell) => cellCenter(cell.column, cell.row, cellSize));
      points.push(destination);
      return simplifyPath(
        map,
        start,
        points,
        unitRadius,
        roadPreference > 1 ? cellSize * 3 : Number.POSITIVE_INFINITY,
      );
    }

    closed.add(currentKey);
    const current = parseCellKey(currentKey);
    for (const neighbor of neighbors(current, columns, rows)) {
      const point = cellCenter(neighbor.column, neighbor.row, cellSize);
      if (
        point.x < Math.min(start.x, destination.x) - searchMargin ||
        point.x > Math.max(start.x, destination.x) + searchMargin ||
        point.y < Math.min(start.y, destination.y) - searchMargin ||
        point.y > Math.max(start.y, destination.y) + searchMargin
      ) {
        continue;
      }
      if (!isWorldPositionTraversable(map, point.x, point.y, unitRadius)) {
        continue;
      }
      if (
        neighbor.column !== current.column &&
        neighbor.row !== current.row &&
        !canTraverseDiagonal(map, current, neighbor, cellSize, unitRadius)
      ) {
        continue;
      }

      const neighborKey = cellKey(neighbor.column, neighbor.row);
      if (closed.has(neighborKey)) continue;
      const roadMultiplier = getTerrainAt(map, point.x, point.y) === "road"
        ? roadPreference
        : 1;
      const movementMultiplier = Math.max(
        0.2,
        getTerrainMovementMultiplier(map, point.x, point.y) * roadMultiplier,
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
        tentativeCost +
          cellDistance(neighbor, targetCell) /
            Math.max(1, 1.22 * roadPreference),
      );
      open.push(neighborKey, estimatedCost.get(neighborKey)!);
    }
  }

  return [destination];
}

function simplifyPath(
  map: WorldMapDefinition,
  start: WorldPoint,
  points: WorldPoint[],
  unitRadius: number,
  maximumShortcutDistance: number,
): WorldPoint[] {
  const simplified: WorldPoint[] = [];
  let anchor = start;
  let index = 0;
  while (index < points.length) {
    let furthest = index;
    for (let candidate = index + 1; candidate < points.length; candidate += 1) {
      if (
        Math.hypot(
          points[candidate].x - anchor.x,
          points[candidate].y - anchor.y,
        ) > maximumShortcutDistance ||
        !hasTraversableLine(map, anchor, points[candidate], unitRadius)
      ) {
        break;
      }
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
  unitRadius: number,
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
        unitRadius,
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
  cellSize: number,
  unitRadius: number,
): boolean {
  const horizontal = cellCenter(neighbor.column, current.row, cellSize);
  const vertical = cellCenter(current.column, neighbor.row, cellSize);
  return (
    isWorldPositionTraversable(map, horizontal.x, horizontal.y, unitRadius) &&
    isWorldPositionTraversable(map, vertical.x, vertical.y, unitRadius)
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
  cellSize: number,
  unitRadius: number,
): GridCell | null {
  const origin = {
    column: Math.max(0, Math.min(columns - 1, Math.floor(point.x / cellSize))),
    row: Math.max(0, Math.min(rows - 1, Math.floor(point.y / cellSize))),
  };
  for (
    let radius = 0;
    radius <= Math.max(8, Math.ceil(640 / cellSize));
    radius += 1
  ) {
    for (let column = origin.column - radius; column <= origin.column + radius; column += 1) {
      for (let row = origin.row - radius; row <= origin.row + radius; row += 1) {
        if (column < 0 || row < 0 || column >= columns || row >= rows) continue;
        const candidate = cellCenter(column, row, cellSize);
        if (
          isWorldPositionTraversable(
            map,
            candidate.x,
            candidate.y,
            unitRadius,
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

interface PriorityQueueEntry {
  key: string;
  priority: number;
}

class MinPriorityQueue {
  private readonly entries: PriorityQueueEntry[] = [];

  get size(): number {
    return this.entries.length;
  }

  push(key: string, priority: number): void {
    const entry = { key, priority };
    this.entries.push(entry);
    let index = this.entries.length - 1;
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.entries[parentIndex].priority <= entry.priority) break;
      this.entries[index] = this.entries[parentIndex];
      index = parentIndex;
    }
    this.entries[index] = entry;
  }

  pop(): string | null {
    if (this.entries.length === 0) return null;
    const root = this.entries[0];
    const tail = this.entries.pop()!;
    if (this.entries.length > 0) {
      let index = 0;
      while (true) {
        const leftIndex = index * 2 + 1;
        if (leftIndex >= this.entries.length) break;
        const rightIndex = leftIndex + 1;
        const childIndex =
          rightIndex < this.entries.length &&
          this.entries[rightIndex].priority < this.entries[leftIndex].priority
            ? rightIndex
            : leftIndex;
        if (this.entries[childIndex].priority >= tail.priority) break;
        this.entries[index] = this.entries[childIndex];
        index = childIndex;
      }
      this.entries[index] = tail;
    }
    return root.key;
  }
}

function cellDistance(first: GridCell, second: GridCell): number {
  return Math.hypot(
    first.column - second.column,
    first.row - second.row,
  );
}

function cellCenter(
  column: number,
  row: number,
  cellSize: number,
): WorldPoint {
  return {
    x: column * cellSize + cellSize / 2,
    y: row * cellSize + cellSize / 2,
  };
}

function cellKey(column: number, row: number): string {
  return `${column}:${row}`;
}

function parseCellKey(key: string): GridCell {
  const [column, row] = key.split(":").map(Number);
  return { column, row };
}
