import { describe, expect, it } from "vitest";
import type { WorldMapDefinition } from "../content/schemas";
import {
  getTerrainAt,
  getTerrainBattleModifiers,
  getTerrainMovementMultiplier,
  getTerrainVisibilityMultiplier,
  isWorldPositionTraversable,
} from "./WorldTerrain";

function createCrossingMap(): WorldMapDefinition {
  return {
    id: "crossing",
    width: 1000,
    height: 1000,
    boundaryInset: 100,
    start: { x: 250, y: 500 },
    terrainZones: [
      {
        id: "forest",
        type: "forest",
        x: 250,
        y: 250,
        radiusX: 100,
        radiusY: 100,
      },
    ],
    terrainRivers: [
      {
        id: "river",
        width: 80,
        points: [
          { x: 500, y: 100 },
          { x: 500, y: 900 },
        ],
      },
    ],
    terrainRoads: [
      {
        id: "bridge",
        width: 60,
        points: [
          { x: 200, y: 500 },
          { x: 800, y: 500 },
        ],
      },
    ],
    locations: [],
    encounterZones: [],
    enemies: [],
  };
}

describe("WorldTerrain", () => {
  it("blocks rivers except where a road creates a bridge", () => {
    const map = createCrossingMap();

    expect(isWorldPositionTraversable(map, 500, 300, 20)).toBe(false);
    expect(isWorldPositionTraversable(map, 500, 500, 20)).toBe(true);
    expect(getTerrainAt(map, 500, 500)).toBe("road");
    expect(getTerrainMovementMultiplier(map, 500, 300)).toBeGreaterThan(0);
  });

  it("provides distinct travel, sight and combat modifiers", () => {
    const map = createCrossingMap();

    expect(getTerrainMovementMultiplier(map, 250, 500)).toBeGreaterThan(1);
    expect(getTerrainMovementMultiplier(map, 250, 250)).toBeLessThan(1);
    expect(getTerrainVisibilityMultiplier(map, 250, 250)).toBeLessThan(1);
    expect(getTerrainBattleModifiers("desert").playerAttack).toBeGreaterThan(1);
    expect(getTerrainBattleModifiers("swamp").playerAttack).toBeLessThan(1);
  });

  it("treats mountains as slow terrain instead of an obstacle", () => {
    const map = createCrossingMap();
    map.terrainZones.push({
      id: "mountain",
      type: "mountain",
      x: 750,
      y: 250,
      radiusX: 100,
      radiusY: 100,
    });

    expect(isWorldPositionTraversable(map, 750, 250, 20)).toBe(true);
    expect(getTerrainMovementMultiplier(map, 750, 250)).toBeGreaterThan(0);
    expect(getTerrainMovementMultiplier(map, 750, 250)).toBeLessThan(0.5);
  });
});
