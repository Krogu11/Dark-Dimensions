import { describe, expect, it } from "vitest";
import { contentPack } from "../../content/content";
import type { CaravanState } from "../economy/Economy";
import { generateWorldMap } from "./WorldGenerator";
import { WorldSimulation } from "./WorldSimulation";
import type { WorldWarbandState } from "./WorldWarbands";
import {
  getTerrainAt,
  isWorldPositionTraversable,
} from "./WorldTerrain";

describe("WorldSimulation patrol behavior", () => {
  it("makes clearly weaker patrols flee from the player", () => {
    const world = generateWorldMap(313131, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    simulation.state.nearbyLocationId = null;
    const enemy = simulation.state.enemies[0];
    enemy.threat = 1;
    enemy.x = simulation.state.x + 120;
    enemy.y = simulation.state.y;
    const distanceBefore = Math.hypot(
      simulation.state.x - enemy.x,
      simulation.state.y - enemy.y,
    );

    simulation.updateEnemies(0.25, 4);

    expect(
      Math.hypot(
        simulation.state.x - enemy.x,
        simulation.state.y - enemy.y,
      ),
    ).toBeGreaterThan(distanceBefore);
  });

  it("lets comparable patrols pursue the player", () => {
    const world = generateWorldMap(414141, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    simulation.state.nearbyLocationId = null;
    const enemy = simulation.state.enemies[0];
    enemy.threat = 2;
    enemy.x = simulation.state.x + 180;
    enemy.y = simulation.state.y;
    const distanceBefore = Math.hypot(
      simulation.state.x - enemy.x,
      simulation.state.y - enemy.y,
    );

    simulation.updateEnemies(0.2, 2);

    expect(
      Math.hypot(
        simulation.state.x - enemy.x,
        simulation.state.y - enemy.y,
      ),
    ).toBeLessThan(distanceBefore);
  });

  it("keeps fleeing patrols inside the playable world", () => {
    const world = generateWorldMap(515151, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    simulation.state.nearbyLocationId = null;
    simulation.state.x = world.boundaryInset + 90;
    simulation.state.y = world.height / 2;
    const enemy = simulation.state.enemies[0];
    enemy.threat = 1;
    enemy.x = world.boundaryInset + 42;
    enemy.y = simulation.state.y;

    for (let update = 0; update < 30; update += 1) {
      simulation.updateEnemies(0.25, 5);
    }

    expect(isWorldPositionTraversable(world, enemy.x, enemy.y, 24)).toBe(true);
    expect(enemy.x).toBeGreaterThanOrEqual(world.boundaryInset + 24);
  });

  it("allows mountain travel but still blocks lakes", () => {
    const world = generateWorldMap(616161, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    const mountain = world.terrainCells.find(
      (cell) => cell.type === "mountain",
    )!;
    simulation.state.x = mountain.x + mountain.size / 2;
    simulation.state.y = mountain.y + mountain.size / 2;
    const mountainStartX = simulation.state.x;

    for (let update = 0; update < 3; update += 1) {
      simulation.move(1, 0, 0.1, 100);
    }

    expect(simulation.state.x).toBeGreaterThan(mountainStartX);
    expect(getTerrainAt(world, simulation.state.x, simulation.state.y)).toBe(
      "mountain",
    );

    const lake = world.terrainCells.find((cell) => cell.type === "lake")!;
    simulation.state.x = lake.x - 34;
    simulation.state.y = lake.y + lake.size / 2;
    for (let update = 0; update < 20; update += 1) {
      simulation.move(1, 0, 0.1, 200);
    }
    expect(getTerrainAt(world, simulation.state.x, simulation.state.y)).not.toBe(
      "lake",
    );
  });

  it("records newly explored sectors for the strategic map", () => {
    const world = generateWorldMap(717171, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    const exploredBefore = simulation.state.exploredSectors.length;
    simulation.state.x = world.width - world.boundaryInset - 60;
    simulation.state.y = world.height - world.boundaryInset - 60;

    simulation.revealAround(520);

    expect(simulation.state.exploredSectors.length).toBeGreaterThan(
      exploredBefore,
    );
    expect(
      simulation.isPositionExplored(simulation.state.x, simulation.state.y),
    ).toBe(true);
  });

  it("lets hostile faction warbands chase and start background battles", () => {
    const world = generateWorldMap(818181, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    simulation.state.warbands = [
      createTestWarband("ember_patrol", "ember_crown", 1000, 1000, [
        "soldier",
        "wache",
      ]),
      createTestWarband("gloam_patrol", "gloam_compact", 1024, 1000, [
        "village_levy",
      ]),
    ];

    simulation.updateWarbands(0.2);

    expect(simulation.state.warbandBattles).toHaveLength(1);
    expect(simulation.state.warbands.every((warband) => warband.state === "fighting")).toBe(
      true,
    );
  });

  it("makes weak faction warbands retreat from stronger hostiles", () => {
    const world = generateWorldMap(828282, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    simulation.state.warbands = [
      createTestWarband("weak_gloam", "gloam_compact", 1000, 1000, [
        "village_levy",
      ]),
      createTestWarband("strong_ember", "ember_crown", 1220, 1000, [
        "knight",
        "banner_knight",
        "shieldguard",
      ]),
    ];
    simulation.state.warbands[0].spawnX = 700;
    simulation.state.warbands[0].spawnY = 1000;

    simulation.updateWarbands(0.2);

    expect(simulation.state.warbands[0].state).toBe("retreating");
  });

  it("resolves NPC warband fights without player involvement", () => {
    const world = generateWorldMap(838383, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    simulation.state.x = 1000;
    simulation.state.y = 1000;
    simulation.state.warbands = [
      createTestWarband("ember_army", "ember_crown", 1000, 1000, [
        "knight",
        "banner_knight",
      ]),
      createTestWarband("gloam_militia", "gloam_compact", 1020, 1000, [
        "village_levy",
      ]),
    ];
    simulation.state.warbands[1].spawnX = 700;
    simulation.state.warbands[1].spawnY = 1000;

    simulation.updateWarbands(0.2);
    simulation.updateWarbands(0.4);

    expect(simulation.state.warbandBattles[0].state).toBe("resolved");
    expect(
      simulation.state.warbands.some((warband) => warband.hpRatio < 1),
    ).toBe(true);
    expect(simulation.state.warbands.every((warband) => warband.state !== "fighting")).toBe(
      true,
    );
  });

  it("respawns destroyed faction patrols at their home point", () => {
    const world = generateWorldMap(848484, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    const warband = createTestWarband("ember_respawn", "ember_crown", 1000, 1000, [
      "soldier",
    ]);
    warband.state = "destroyed";
    warband.x = 1300;
    warband.y = 1300;
    warband.respawnRemainingHours = 0.1;
    simulation.state.warbands = [warband];

    simulation.updateWarbands(0.2);

    expect(warband.state).toBe("patrolling");
    expect(warband.x).toBe(warband.spawnX);
    expect(warband.hpRatio).toBe(1);
  });

  it("returns chasers instead of leaving them in invalid target states", () => {
    const world = generateWorldMap(858585, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    const chaser = createTestWarband("ember_chaser", "ember_crown", 1000, 1000, [
      "soldier",
    ]);
    chaser.state = "chasing";
    chaser.targetWarbandId = "missing_target";
    chaser.spawnX = 700;
    chaser.spawnY = 1000;
    simulation.state.warbands = [chaser];

    simulation.updateWarbands(0.2);

    expect(chaser.state).toBe("returning");
    expect(chaser.targetWarbandId).toBeNull();
  });

  it("lets faction warbands attack active dungeon patrol spawns", () => {
    const world = generateWorldMap(868686, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    const warband = createTestWarband("ember_hunter", "ember_crown", 1000, 1000, [
      "knight",
      "banner_knight",
      "shieldguard",
    ]);
    const enemy = simulation.state.enemies[0];
    enemy.active = true;
    enemy.threat = 1;
    enemy.partySize = 1;
    enemy.x = 1024;
    enemy.y = 1000;
    simulation.state.warbands = [warband];

    simulation.updateWarbands(0.2);

    expect(enemy.active).toBe(true);
    expect(enemy.activeBattleId).toBeTruthy();
    expect(simulation.state.warbandBattles[0]).toMatchObject({
      enemyId: enemy.id,
      state: "fighting",
    });

    simulation.updateWarbands(0.5);

    expect(enemy.active).toBe(false);
    expect(warband.targetEnemyId).toBeNull();
    expect(warband.hpRatio).toBeLessThan(1);
  });

  it("lets monsters raid nearby village traders over time", () => {
    const world = generateWorldMap(878787, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    const enemy = simulation.state.enemies[0];
    enemy.active = true;
    enemy.threat = 5;
    enemy.partySize = 5;
    enemy.speed = 220;
    enemy.aggroRadius = 500;
    simulation.state.x = Math.min(world.width - 500, enemy.x + 2000);
    simulation.state.y = enemy.y;
    const trader: CaravanState = {
      id: "villager_test",
      kind: "villager",
      x: enemy.x + 22,
      y: enemy.y,
      originId: "village_test",
      destinationId: "city_test",
      progress: 0.5,
      speed: 35,
      inventory: [
        { itemId: "wheat", quantity: 10 },
        { itemId: "bread", quantity: 4 },
      ],
    };

    simulation.updateEnemies(0.12, 1, [trader]);

    expect(simulation.state.monsterRaids[0]).toMatchObject({
      enemyId: enemy.id,
      traderId: trader.id,
      state: "fighting",
    });
    expect(enemy.activeBattleId).toBeTruthy();

    simulation.updateEnemies(0.5, 1, [trader]);

    expect(enemy.activeBattleId).toBeNull();
    expect(
      trader.inventory.reduce((sum, stack) => sum + stack.quantity, 0),
    ).toBeLessThan(14);
  });
});

function createTestWarband(
  id: string,
  factionId: "ember_crown" | "gloam_compact" | "iron_concord",
  x: number,
  y: number,
  unitIds: string[],
): WorldWarbandState {
  return {
    id,
    nameKey: `test.${id}`,
    type: "patrol",
    factionId,
    x,
    y,
    targetX: x,
    targetY: y,
    unitIds,
    speed: 180,
    detectionRadius: 600,
    aggressionRadius: 520,
    aggression: 0.7,
    state: "patrolling",
    homeLocationId: null,
    spawnX: x,
    spawnY: y,
    maxPursuitDistance: 1200,
    respawnHours: 1,
    respawnRemainingHours: 0,
    leaderLevel: 1,
    equipmentItemIds: [],
    patrolPoints: [
      { x, y },
      { x: x + 60, y },
    ],
    patrolIndex: 0,
    allowedRadius: 1400,
    targetWarbandId: null,
    targetEnemyId: null,
    activeBattleId: null,
    hpRatio: 1,
    experience: 0,
    lootItemIds: [],
  };
}
