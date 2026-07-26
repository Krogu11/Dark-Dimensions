import { describe, expect, it } from "vitest";
import type { WorldMapDefinition } from "../content/schemas";
import { findWorldPath } from "./WorldPathfinder";
import {
  getTerrainAt,
  isWorldPositionTraversable,
} from "./WorldTerrain";

function createRoadCrossingMap(): WorldMapDefinition {
  return {
    id: "road-crossing",
    width: 1000,
    height: 1000,
    boundaryInset: 80,
    start: { x: 750, y: 300 },
    terrainZones: [],
    terrainCells: [{ x: 80, y: 80, size: 840, type: "plains" }],
    terrainRivers: [{
      id: "river",
      width: 90,
      points: [{ x: 500, y: 80 }, { x: 500, y: 920 }],
    }],
    terrainRoads: [{
      id: "bridge-road",
      width: 64,
      points: [{ x: 120, y: 500 }, { x: 880, y: 500 }],
    }],
    locations: [],
    encounterZones: [],
    enemies: [],
  };
}

describe("WorldPathfinder road-aware routes", () => {
  it("routes through a road bridge instead of walking into a river", () => {
    const map = createRoadCrossingMap();
    const start = { x: 250, y: 300 };
    const path = findWorldPath(map, start, { x: 750, y: 300 }, {
      cellSize: 32,
      unitRadius: 24,
      roadPreference: 1.65,
      directPathMaxDistance: 160,
    });

    expect(path.some((point) => getTerrainAt(map, point.x, point.y) === "road")).toBe(true);
    expectPathToBeTraversable(map, start, path);
    expect(path.at(-1)).toMatchObject({ x: 750, y: 300 });
  });

  it("prefers a faster nearby road when its detour is worthwhile", () => {
    const map = createRoadCrossingMap();
    map.terrainRivers = [];
    const start = { x: 150, y: 350 };
    const path = findWorldPath(map, start, { x: 850, y: 350 }, {
      cellSize: 32,
      unitRadius: 24,
      roadPreference: 1.65,
      directPathMaxDistance: 160,
    });

    expect(path.some((point) => getTerrainAt(map, point.x, point.y) === "road")).toBe(true);
    expectPathToBeTraversable(map, start, path);
  });
});

function expectPathToBeTraversable(
  map: WorldMapDefinition,
  start: { x: number; y: number },
  path: Array<{ x: number; y: number }>,
): void {
  let previous = start;
  for (const point of path) {
    const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
    const steps = Math.max(1, Math.ceil(distance / 12));
    for (let step = 1; step <= steps; step += 1) {
      const progress = step / steps;
      expect(isWorldPositionTraversable(
        map,
        previous.x + (point.x - previous.x) * progress,
        previous.y + (point.y - previous.y) * progress,
        24,
      )).toBe(true);
    }
    previous = point;
  }
}
