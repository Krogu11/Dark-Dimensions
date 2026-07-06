import type {
  TerrainZone,
  TerrainZoneType,
  WorldMapDefinition,
} from "../content/schemas";

export type TerrainType =
  | "plains"
  | TerrainZoneType
  | "river"
  | "sea";

export const TERRAIN_MOVEMENT_MULTIPLIERS: Record<TerrainType, number> = {
  plains: 1,
  forest: 0.82,
  swamp: 0.65,
  desert: 0.88,
  mountain: 0,
  lake: 0,
  river: 0.72,
  sea: 0,
};

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

  if (
    map.terrainRivers.some((river) =>
      river.points.some((point, index) => {
        const nextPoint = river.points[index + 1];
        return (
          nextPoint &&
          distanceToSegment(x, y, point.x, point.y, nextPoint.x, nextPoint.y) <=
            river.width / 2
        );
      }),
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

export function isWorldPositionTraversable(
  map: WorldMapDefinition,
  x: number,
  y: number,
  radius = 0,
): boolean {
  if (!isInsidePlayableBounds(map, x, y, radius)) return false;
  return !map.terrainZones.some(
    (zone) =>
      (zone.type === "mountain" || zone.type === "lake") &&
      isInsideTerrainZone(zone, x, y, radius),
  );
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

function distanceToSegment(
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
