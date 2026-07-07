import type {
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
  swamp: 0.65,
  desert: 0.88,
  mountain: 0.42,
  lake: 0,
  river: 0.42,
  road: 1.22,
  sea: 0,
};

export const TERRAIN_VISIBILITY_MULTIPLIERS: Record<TerrainType, number> = {
  plains: 1,
  forest: 0.68,
  swamp: 0.78,
  desert: 1.15,
  mountain: 0.72,
  lake: 1.08,
  river: 0.9,
  road: 1.05,
  sea: 1,
};

export const TERRAIN_ENCOUNTER_MULTIPLIERS: Record<TerrainType, number> = {
  plains: 1,
  forest: 1.35,
  swamp: 1.25,
  desert: 1.12,
  mountain: 1.15,
  lake: 0.8,
  river: 1.1,
  road: 0.65,
  sea: 0,
};

export const TERRAIN_FOOD_MULTIPLIERS: Record<TerrainType, number> = {
  plains: 1,
  forest: 1.05,
  swamp: 1.25,
  desert: 1.2,
  mountain: 1.2,
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

export function getTerrainAt(
  map: WorldMapDefinition,
  x: number,
  y: number,
): TerrainType {
  if (!isInsidePlayableBounds(map, x, y)) return "sea";

  const blockingZone = map.terrainZones.find(
    (zone) =>
      (zone.type === "mountain" || zone.type === "lake") &&
      isInsideTerrainZone(zone, x, y),
  );
  if (blockingZone) return blockingZone.type;

  if (isPositionOnRoad(map, x, y)) return "road";

  if (
    map.terrainRivers.some((river) =>
      isPositionNearPath(river.points, river.width, x, y),
    )
  ) {
    return "river";
  }

  return (
    map.terrainZones.find((zone) => isInsideTerrainZone(zone, x, y))?.type ??
    "plains"
  );
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
  if (terrain === "forest") {
    return {
      terrain,
      playerAttack: 0.96,
      playerDefense: 1.14,
      enemyAttack: 0.96,
      enemyDefense: 1.14,
    };
  }
  if (terrain === "swamp") {
    return {
      terrain,
      playerAttack: 0.86,
      playerDefense: 0.9,
      enemyAttack: 0.86,
      enemyDefense: 0.9,
    };
  }
  if (terrain === "desert") {
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
  const blockedByZone = map.terrainZones.some(
    (zone) => zone.type === "lake" && isInsideTerrainZone(zone, x, y, radius),
  );
  if (blockedByZone) return false;
  const crossesRiver = map.terrainRivers.some((river) =>
    isPositionNearPath(river.points, river.width, x, y, radius),
  );
  return !crossesRiver || isPositionOnRoad(map, x, y, radius);
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
  return map.terrainRoads.some((road) =>
    isPositionNearPath(road.points, road.width, x, y, padding),
  );
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
