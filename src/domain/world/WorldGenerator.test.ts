import { describe, expect, it } from "vitest";
import { contentPack } from "../../content/content";
import { generateWorldMap } from "./WorldGenerator";
import {
  getTerrainAt,
  isPositionNearPath,
  isWorldPositionTraversable,
} from "./WorldTerrain";

describe("WorldGenerator", () => {
  it("recreates the same world from the same seed", () => {
    const first = generateWorldMap(123456, contentPack.enemies);
    const second = generateWorldMap(123456, contentPack.enemies);

    expect(second).toEqual(first);
  });

  it("creates different geography for different seeds", () => {
    const first = generateWorldMap(111, contentPack.enemies);
    const second = generateWorldMap(222, contentPack.enemies);

    expect(second).not.toEqual(first);
  });

  it("generates cities, villages, castles, dungeons and roaming enemies", () => {
    const world = generateWorldMap(98765, contentPack.enemies);
    const locationTypes = world.locations.map((location) => location.type);

    expect(locationTypes).toEqual(
      expect.arrayContaining([
        "city",
        "village",
        "castle",
        "dungeon",
        "landmark",
        "wilds",
      ]),
    );
    expect(world.enemies).toHaveLength(38);
    for (const enemy of world.enemies) {
      expect(enemy.partySize).toBeGreaterThan(0);
      expect(enemy.inventoryWeight).toBeGreaterThan(0);
      expect(enemy.speed).toBeLessThan(200);
    }
    const villages = world.locations.filter(
      (location) => location.type === "village",
    );
    expect(villages.length).toBeGreaterThanOrEqual(8);
    expect(villages.length).toBeLessThanOrEqual(16);
    expect(world.locations[0]).toMatchObject({
      id: "city_0",
      x: world.start.x,
      y: world.start.y,
    });
  });

  it("generates varied terrain and keeps important positions traversable", () => {
    const world = generateWorldMap(24680, contentPack.enemies);
    const terrainTypes = world.terrainZones.map((zone) => zone.type);

    expect(terrainTypes).toEqual(
      expect.arrayContaining([
        "forest",
        "swamp",
        "desert",
        "mountain",
        "lake",
      ]),
    );
    expect(world.terrainRivers).toHaveLength(3);
    expect(world.terrainRoads).toHaveLength(3);
    const locationsById = new Map(
      world.locations.map((location) => [location.id, location]),
    );
    for (const road of world.terrainRoads) {
      expect(locationsById.get(road.originId!)?.type).toBe("city");
      expect(locationsById.get(road.destinationId!)?.type).toBe("city");
    }
    expect(world.boundaryInset).toBeGreaterThan(100);
    for (let seed = 1; seed <= 20; seed += 1) {
      const generatedWorld = generateWorldMap(seed * 7919, contentPack.enemies);
      for (const location of generatedWorld.locations) {
        expect(
          isWorldPositionTraversable(
            generatedWorld,
            location.x,
            location.y,
            30,
          ),
        ).toBe(true);
        expect(
          generatedWorld.terrainRivers.some((river) =>
            isPositionNearPath(
              river.points,
              river.width,
              location.x,
              location.y,
              location.radius,
            ),
          ),
        ).toBe(false);
        expect(getTerrainAt(generatedWorld, location.x, location.y)).not.toBe(
          "lake",
        );
      }
      for (const enemy of generatedWorld.enemies) {
        expect(
          isWorldPositionTraversable(generatedWorld, enemy.x, enemy.y, 24),
          `seed ${seed * 7919}, enemy ${enemy.id} at ${enemy.x},${enemy.y}`,
        ).toBe(true);
      }
      const cities = generatedWorld.locations.filter(
        (location) => location.type === "city",
      );
      const villages = generatedWorld.locations.filter(
        (location) => location.type === "village",
      );
      for (const village of villages) {
        expect(
          generatedWorld.terrainRoads.some((road) =>
            isPositionNearPath(
              road.points,
              road.width,
              village.x,
              village.y,
              150,
            ),
          ),
        ).toBe(false);
      }
      for (const city of cities) {
        const dependants = villages.filter((village) => {
          const nearest = cities.reduce((current, candidate) =>
            Math.hypot(candidate.x - village.x, candidate.y - village.y) <
            Math.hypot(current.x - village.x, current.y - village.y)
              ? candidate
              : current,
          );
          return nearest.id === city.id;
        });
        expect(dependants.length).toBeGreaterThanOrEqual(2);
        expect(dependants.length).toBeLessThanOrEqual(4);
        expect(
          dependants.every(
            (village) =>
              Math.hypot(village.x - city.x, village.y - city.y) <= 1100,
          ),
        ).toBe(true);
      }
    }
  });
});
