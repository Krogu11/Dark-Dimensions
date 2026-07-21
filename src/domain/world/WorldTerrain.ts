import type {
  TerrainCell,
  TerrainZone,
  TerrainZoneType,
  WorldMapDefinition,
} from "../content/schemas";

export type TerrainType =
  | "plains"
  | TerrainZoneType
  | "river"
  | "road"
  | "sea";

export const TERRAIN_MOVEMENT_MULTIPLIERS: Record<TerrainType, number> = {
  plains: 1,
  forest: 0.82,
  darkForest: 0.76,
  pineForest: 0.86,
  tundra: 0.72,
  snowMountain: 0.36,
  swamp: 0.65,
  bog: 0.58,
  desert: 0.88,
  badlands: 0.78,
  steppe: 0.96,
  grassland: 1.04,
  heath: 0.94,
  mountain: 0.42,
  hills: 0.72,
  lake: 0,
  river: 0.42,
  road: 1.22,
  sea: 0,
};

export const TERRAIN_VISIBILITY_MULTIPLIERS: Record<TerrainType, number> = {
  plains: 1,
  forest: 0.68,
  darkForest: 0.56,
  pineForest: 0.74,
  tundra: 1.02,
  snowMountain: 0.78,
  swamp: 0.78,
  bog: 0.7,
  desert: 1.15,
  badlands: 1.04,
  steppe: 1.08,
  grassland: 1.12,
  heath: 1.02,
  mountain: 0.72,
  hills: 0.88,
  lake: 1.08,
  river: 0.9,
  road: 1.05,
  sea: 1,
};

export const TERRAIN_ENCOUNTER_MULTIPLIERS: Record<TerrainType, number> = {
  plains: 1,
  forest: 1.35,
  darkForest: 1.55,
  pineForest: 1.18,
  tundra: 1.08,
  snowMountain: 1.1,
  swamp: 1.25,
  bog: 1.42,
  desert: 1.12,
  badlands: 1.22,
  steppe: 0.98,
  grassland: 0.92,
  heath: 1.05,
  mountain: 1.15,
  hills: 1.08,
  lake: 0.8,
  river: 1.1,
  road: 0.65,
  sea: 0,
};

export const TERRAIN_FOOD_MULTIPLIERS: Record<TerrainType, number> = {
  plains: 1,
  forest: 1.05,
  darkForest: 1.14,
  pineForest: 1.02,
  tundra: 1.22,
  snowMountain: 1.3,
  swamp: 1.25,
  bog: 1.35,
  desert: 1.2,
  badlands: 1.16,
  steppe: 1.05,
  grassland: 0.92,
  heath: 1.04,
  mountain: 1.2,
  hills: 1.08,
  lake: 1,
  river: 1.1,
  road: 0.9,
  sea: 1,
};

export interface TerrainBattleModifiers {
  terrain: TerrainType;
  playerAttack: number;
  playerDefense: number;
  enemyAttack: number;
  enemyDefense: number;
}

const TERRAIN_INDEX_SIZE = 480;
const TERRAIN_PATH_INDEX_PADDING = 96;
type IndexedPathSegment = { start: { x: number; y: number }; end: { x: number; y: number }; width: number };
const TERRAIN_CELL_INDEX = new WeakMap<object, Map<string, TerrainCell[]>>();
const TERRAIN_PATH_INDEX = new WeakMap<object, Map<string, IndexedPathSegment[]>>();

export function getTerrainAt(
  map: WorldMapDefinition,
  x: number,
  y: number,
): TerrainType {
  if (!isInsidePlayableBounds(map, x, y)) return "sea";

  if (isPositionOnRoad(map, x, y)) return "road";

  if (isPositionOnIndexedPaths(map.terrainRivers, x, y)) {
    return "river";
  }

  return getTerrainCellAt(map, x, y) ?? "plains";
}

export function getTerrainMovementMultiplier(
  map: WorldMapDefinition,
  x: number,
  y: number,
): number {
  return TERRAIN_MOVEMENT_MULTIPLIERS[getTerrainAt(map, x, y)];
}

export function getTerrainVisibilityMultiplier(
  map: WorldMapDefinition,
  x: number,
  y: number,
): number {
  return TERRAIN_VISIBILITY_MULTIPLIERS[getTerrainAt(map, x, y)];
}

export function getTerrainEncounterMultiplier(
  map: WorldMapDefinition,
  x: number,
  y: number,
): number {
  return TERRAIN_ENCOUNTER_MULTIPLIERS[getTerrainAt(map, x, y)];
}

export function getTerrainFoodMultiplier(
  map: WorldMapDefinition,
  x: number,
  y: number,
): number {
  return TERRAIN_FOOD_MULTIPLIERS[getTerrainAt(map, x, y)];
}

export function getTerrainBattleModifiers(
  terrain: TerrainType,
): TerrainBattleModifiers {
  if (terrain === "forest" || terrain === "darkForest" || terrain === "pineForest") {
    return {
      terrain,
      playerAttack: 0.96,
      playerDefense: 1.14,
      enemyAttack: 0.96,
      enemyDefense: 1.14,
    };
  }
  if (terrain === "swamp" || terrain === "bog") {
    return {
      terrain,
      playerAttack: 0.86,
      playerDefense: 0.9,
      enemyAttack: 0.86,
      enemyDefense: 0.9,
    };
  }
  if (terrain === "desert" || terrain === "badlands" || terrain === "steppe") {
    return {
      terrain,
      playerAttack: 1.06,
      playerDefense: 0.9,
      enemyAttack: 1.06,
      enemyDefense: 0.9,
    };
  }
  if (terrain === "river") {
    return {
      terrain,
      playerAttack: 0.88,
      playerDefense: 0.86,
      enemyAttack: 0.88,
      enemyDefense: 0.86,
    };
  }
  if (terrain === "road") {
    return {
      terrain,
      playerAttack: 1.04,
      playerDefense: 0.96,
      enemyAttack: 1.04,
      enemyDefense: 0.96,
    };
  }
  return {
    terrain,
    playerAttack: 1,
    playerDefense: 1,
    enemyAttack: 1,
    enemyDefense: 1,
  };
}

export function isWorldPositionTraversable(
  map: WorldMapDefinition,
  x: number,
  y: number,
  radius = 0,
): boolean {
  if (!isInsidePlayableBounds(map, x, y, radius)) return false;
  if (getTerrainCellAt(map, x, y) === "lake") return false;
  const crossesRiver = isPositionOnIndexedPaths(map.terrainRivers, x, y, radius);
  return !crossesRiver || isPositionOnRoad(map, x, y, radius);
}

function getTerrainCellAt(
  map: WorldMapDefinition,
  x: number,
  y: number,
): TerrainCell["type"] | null {
  let spatialIndex = TERRAIN_CELL_INDEX.get(map.terrainCells);
  if (!spatialIndex) {
    spatialIndex = new Map();
    for (const cell of map.terrainCells) {
      const minimumColumn = Math.floor(cell.x / TERRAIN_INDEX_SIZE);
      const maximumColumn = Math.floor((cell.x + cell.size) / TERRAIN_INDEX_SIZE);
      const minimumRow = Math.floor(cell.y / TERRAIN_INDEX_SIZE);
      const maximumRow = Math.floor((cell.y + cell.size) / TERRAIN_INDEX_SIZE);
      for (let column = minimumColumn; column <= maximumColumn; column += 1) for (let row = minimumRow; row <= maximumRow; row += 1) {
        const key = `${column}:${row}`;
        const bucket = spatialIndex.get(key) ?? [];
        bucket.push(cell);
        spatialIndex.set(key, bucket);
      }
    }
    TERRAIN_CELL_INDEX.set(map.terrainCells, spatialIndex);
  }
  const candidates = spatialIndex.get(`${Math.floor(x / TERRAIN_INDEX_SIZE)}:${Math.floor(y / TERRAIN_INDEX_SIZE)}`) ?? [];
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const cell = candidates[index];
    if (x >= cell.x && y >= cell.y && x < cell.x + cell.size && y < cell.y + cell.size) {
      return cell.type;
    }
  }

  return null;
}

export function findNearestTraversablePosition(
  map: WorldMapDefinition,
  x: number,
  y: number,
  radius = 0,
): { x: number; y: number } {
  const clamped = {
    x: clamp(x, map.boundaryInset + radius, map.width - map.boundaryInset - radius),
    y: clamp(y, map.boundaryInset + radius, map.height - map.boundaryInset - radius),
  };
  if (isWorldPositionTraversable(map, clamped.x, clamped.y, radius)) {
    return clamped;
  }

  for (let distance = 40; distance <= 640; distance += 40) {
    for (let angleIndex = 0; angleIndex < 16; angleIndex += 1) {
      const angle = (Math.PI * 2 * angleIndex) / 16;
      const candidate = {
        x: clamped.x + Math.cos(angle) * distance,
        y: clamped.y + Math.sin(angle) * distance,
      };
      if (isWorldPositionTraversable(map, candidate.x, candidate.y, radius)) {
        return candidate;
      }
    }
  }

  return { ...map.start };
}

export function isInsideTerrainZone(
  zone: TerrainZone,
  x: number,
  y: number,
  padding = 0,
): boolean {
  const radiusX = zone.radiusX + padding;
  const radiusY = zone.radiusY + padding;
  const normalizedX = (x - zone.x) / radiusX;
  const normalizedY = (y - zone.y) / radiusY;
  return normalizedX * normalizedX + normalizedY * normalizedY <= 1;
}

export function isPositionOnRoad(
  map: WorldMapDefinition,
  x: number,
  y: number,
  padding = 0,
): boolean {
  return isPositionOnIndexedPaths(map.terrainRoads, x, y, padding);
}

function isPositionOnIndexedPaths(paths: WorldMapDefinition["terrainRoads"] | WorldMapDefinition["terrainRivers"], x: number, y: number, padding = 0): boolean {
  let spatialIndex = TERRAIN_PATH_INDEX.get(paths);
  if (!spatialIndex) {
    spatialIndex = new Map();
    for (const path of paths) for (let index = 0; index < path.points.length - 1; index += 1) {
      const segment = { start: path.points[index], end: path.points[index + 1], width: path.width };
      const inset = path.width / 2 + TERRAIN_PATH_INDEX_PADDING;
      const minimumColumn = Math.floor((Math.min(segment.start.x, segment.end.x) - inset) / TERRAIN_INDEX_SIZE);
      const maximumColumn = Math.floor((Math.max(segment.start.x, segment.end.x) + inset) / TERRAIN_INDEX_SIZE);
      const minimumRow = Math.floor((Math.min(segment.start.y, segment.end.y) - inset) / TERRAIN_INDEX_SIZE);
      const maximumRow = Math.floor((Math.max(segment.start.y, segment.end.y) + inset) / TERRAIN_INDEX_SIZE);
      for (let column = minimumColumn; column <= maximumColumn; column += 1) for (let row = minimumRow; row <= maximumRow; row += 1) {
        const key = `${column}:${row}`;
        const bucket = spatialIndex.get(key) ?? [];
        bucket.push(segment);
        spatialIndex.set(key, bucket);
      }
    }
    TERRAIN_PATH_INDEX.set(paths, spatialIndex);
  }
  const candidates = spatialIndex.get(`${Math.floor(x / TERRAIN_INDEX_SIZE)}:${Math.floor(y / TERRAIN_INDEX_SIZE)}`) ?? [];
  return candidates.some((segment) => distanceToSegment(x, y, segment.start.x, segment.start.y, segment.end.x, segment.end.y) <= segment.width / 2 + padding);
}

export function isPositionNearPath(
  points: Array<{ x: number; y: number }>,
  width: number,
  x: number,
  y: number,
  padding = 0,
): boolean {
  return points.some((point, index) => {
    const nextPoint = points[index + 1];
    return (
      nextPoint &&
      distanceToSegment(x, y, point.x, point.y, nextPoint.x, nextPoint.y) <=
        width / 2 + padding
    );
  });
}

function isInsidePlayableBounds(
  map: WorldMapDefinition,
  x: number,
  y: number,
  radius = 0,
): boolean {
  const minimum = map.boundaryInset + radius;
  return (
    x >= minimum &&
    y >= minimum &&
    x <= map.width - minimum &&
    y <= map.height - minimum
  );
}

export function distanceToSegment(
  pointX: number,
  pointY: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): number {
  const segmentX = endX - startX;
  const segmentY = endY - startY;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (lengthSquared === 0) return Math.hypot(pointX - startX, pointY - startY);
  const progress = clamp(
    ((pointX - startX) * segmentX + (pointY - startY) * segmentY) /
      lengthSquared,
    0,
    1,
  );
  return Math.hypot(
    pointX - (startX + segmentX * progress),
    pointY - (startY + segmentY * progress),
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
