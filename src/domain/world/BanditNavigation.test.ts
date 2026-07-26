import { describe, expect, it } from "vitest";
import type { WorldMapDefinition } from "../content/schemas";
import { WorldSimulation } from "./WorldSimulation";
import { getTerrainAt, isWorldPositionTraversable } from "./WorldTerrain";

describe("bandit navigation", () => {
  it("uses a road bridge to reach a player across water without getting stuck", () => {
    const map = createBanditCrossingMap();
    const simulation = new WorldSimulation(map);
    const bandits = simulation.state.enemies[0];
    let usedRoad = false;
    let encounter: string | null = null;

    for (let update = 0; update < 160 && !encounter; update += 1) {
      encounter = simulation.updateEnemies(0.035, 1);
      usedRoad ||= getTerrainAt(map, bandits.x, bandits.y) === "road";
      expect(isWorldPositionTraversable(map, bandits.x, bandits.y, 24)).toBe(true);
    }

    expect(usedRoad).toBe(true);
    expect(encounter).toBe(bandits.id);
    expect(bandits.x).toBeGreaterThan(500);
  });
});

function createBanditCrossingMap(): WorldMapDefinition {
  return {
    id: "bandit-crossing",
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
    enemies: [{
      id: "test_bandits",
      archetypeId: "road_reavers",
      x: 250,
      y: 300,
      aggroRadius: 900,
      speed: 300,
      partySize: 6,
      inventoryWeight: 0,
      threat: 1,
    }],
  };
}
