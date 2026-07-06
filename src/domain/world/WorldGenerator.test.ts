import { describe, expect, it } from "vitest";
import { contentPack } from "../../content/content";
import { generateWorldMap } from "./WorldGenerator";
import { isWorldPositionTraversable } from "./WorldTerrain";

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
    expect(world.enemies).toHaveLength(24);
    for (const enemy of world.enemies) {
      expect(enemy.partySize).toBeGreaterThan(0);
      expect(enemy.inventoryWeight).toBeGreaterThan(0);
      expect(enemy.speed).toBeLessThan(200);
    }
    expect(
      world.locations.filter((location) => location.type === "village"),
    ).toHaveLength(12);
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
      }
      for (const enemy of generatedWorld.enemies) {
        expect(
          isWorldPositionTraversable(generatedWorld, enemy.x, enemy.y, 24),
        ).toBe(true);
      }
    }
  });
});
