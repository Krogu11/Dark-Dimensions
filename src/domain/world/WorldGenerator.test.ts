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
    const world = generateWorldMap(98765, contentPack.enemies, contentPack.nobles);
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
    expect(world.enemies.length).toBeGreaterThanOrEqual(36);
    expect(world.warbandSpawns?.length ?? 0).toBeGreaterThan(12);
    for (const factionId of ["ember_crown", "gloam_compact", "iron_concord"]) {
      const nobles = (world.warbandSpawns ?? []).filter((spawn) => spawn.id.includes(factionId) || spawn.nobleProfileId?.startsWith(factionId.split("_")[0]));
      expect(nobles.filter((spawn) => spawn.nobleRank === "king")).toHaveLength(1);
    }
    expect(
      (world.warbandSpawns ?? []).every(
        (spawn) => Math.hypot(spawn.x - world.start.x, spawn.y - world.start.y) >= 1350,
      ),
    ).toBe(true);
    const dungeons = world.locations.filter(
      (location) => location.type === "dungeon",
    );
    expect(dungeons.length).toBeGreaterThanOrEqual(14);
    expect(dungeons.every((dungeon) => dungeon.spawnProfile)).toBe(true);
    expect(
      dungeons.every((dungeon) => dungeon.spawnProfile?.spriteKey),
    ).toBe(true);
    expect(
      new Set(dungeons.map((dungeon) => dungeon.spawnProfile?.spriteKey)).size,
    ).toBeGreaterThan(1);
    const dungeonNameBySprite = new Map([
      ["kobold", "generatedLocation.name.koboldWarren"],
      ["beast", "generatedLocation.name.beastDen"],
      ["swamp", "generatedLocation.name.sunkenNest"],
      ["undead", "generatedLocation.name.boneCrypt"],
      ["orc", "generatedLocation.name.orcWarcamp"],
      ["elemental", "generatedLocation.name.ashRift"],
      ["machine", "generatedLocation.name.rustedVault"],
      ["outlaw", "generatedLocation.name.outlawHideout"],
    ]);
    for (const dungeon of dungeons) {
      expect(dungeon.nameKey).toBe(
        dungeonNameBySprite.get(dungeon.spawnProfile!.spriteKey!),
      );
    }
    const dungeonIds = new Set(dungeons.map((dungeon) => dungeon.id));
    for (const enemy of world.enemies) {
      expect(enemy.sourceLocationId).toBeDefined();
      expect(dungeonIds.has(enemy.sourceLocationId!)).toBe(true);
      expect(enemy.partySize).toBeGreaterThan(0);
      expect(enemy.inventoryWeight).toBeGreaterThan(0);
      expect(enemy.speed).toBeLessThan(200);
    }
    const villages = world.locations.filter(
      (location) => location.type === "village",
    );
    expect(villages.length).toBeGreaterThanOrEqual(24);
    expect(villages.length).toBeLessThanOrEqual(48);
    const citiesById = new Map(
      world.locations
        .filter((location) => location.type === "city")
        .map((location) => [location.id, location]),
    );
    const majorRoads = world.terrainRoads.filter((road) => road.width >= 20);
    expect(majorRoads.length).toBeGreaterThanOrEqual(11);
    for (const road of majorRoads) {
      const origin = citiesById.get(road.originId ?? "");
      const destination = citiesById.get(road.destinationId ?? "");
      expect(origin).toBeDefined();
      expect(destination).toBeDefined();
      expect(road.points[0]).toMatchObject({ x: origin!.x, y: origin!.y });
      expect(road.points[1].x).toBeCloseTo(origin!.x, 5);
      expect(road.points[1].y).toBeGreaterThan(origin!.y + 80);
      expect(road.points.at(-1)).toMatchObject({
        x: destination!.x,
        y: destination!.y,
      });
      expect(road.points.at(-2)!.x).toBeCloseTo(destination!.x, 5);
      expect(road.points.at(-2)!.y).toBeGreaterThan(destination!.y + 80);
    }
    const villageRoads = world.terrainRoads.filter((road) => road.width < 20);
    expect(villageRoads.length).toBeGreaterThanOrEqual(villages.length);
    expect(villageRoads.some((road) => road.width <= 8)).toBe(true);
    const villagesById = new Map(villages.map((village) => [village.id, village]));
    const cityIds = new Set(citiesById.keys());
    for (const road of villageRoads.filter((road) => villagesById.has(road.originId ?? ""))) {
      const village = villagesById.get(road.originId!)!;
      expect(road.points[0]).toMatchObject({ x: village.x, y: village.y });
      expect(road.points[1].x).toBeCloseTo(village.x, 5);
      expect(road.points[1].y).toBeGreaterThan(village.y + 40);
    }
    for (const road of villageRoads.filter((road) => cityIds.has(road.destinationId ?? ""))) {
      const city = citiesById.get(road.destinationId!)!;
      expect(road.points.at(-1)).not.toMatchObject({ x: city.x, y: city.y });
    }
    expect(world.locations[0]).toMatchObject({
      id: "soul_temple",
      x: world.start.x,
      y: world.start.y,
    });
  });

  it("generates varied terrain and keeps important positions traversable", () => {
    const world = generateWorldMap(24680, contentPack.enemies);
    const terrainTypes = world.terrainCells.map((cell) => cell.type);

    expect(terrainTypes).toEqual(
      expect.arrayContaining([
        "tundra",
        "pineForest",
        "darkForest",
        "grassland",
        "steppe",
        "hills",
        "forest",
        "mountain",
        "lake",
      ]),
    );
    expect(world.terrainRivers).toHaveLength(5);
    const worldMajorRoads = world.terrainRoads.filter((road) => road.width >= 20);
    expect(worldMajorRoads).toHaveLength(11);
    const locationsById = new Map(
      world.locations.map((location) => [location.id, location]),
    );
    for (const road of worldMajorRoads) {
      expect(locationsById.get(road.originId!)?.type).toBe("city");
      expect(locationsById.get(road.destinationId!)?.type).toBe("city");
    }
    expect(world.terrainRoads.some((road) => road.width < 20)).toBe(true);
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
        ).toBe(true);
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
              Math.hypot(village.x - city.x, village.y - city.y) <= 1500,
          ),
        ).toBe(true);
      }
    }
  }, 30000);
});
