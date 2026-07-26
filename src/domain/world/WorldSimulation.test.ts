import { describe, expect, it } from "vitest";
import { contentPack } from "../../content/content";
import { createCardInstance, getCardDefinition } from "../cards/CardInstance";
import type { CaravanState } from "../economy/Economy";
import type { FactionState } from "../quests/Factions";
import { generateWorldMap } from "./WorldGenerator";
import { WorldSimulation } from "./WorldSimulation";
import type { WorldWarbandState } from "./WorldWarbands";
import {
  getTerrainAt,
  isWorldPositionTraversable,
} from "./WorldTerrain";

describe("WorldSimulation patrol behavior", () => {
  it("starts monster patrols and noble warbands at their doubled roster sizes", () => {
    const world = generateWorldMap(303031, contentPack.enemies);
    const simulation = new WorldSimulation(world);

    expect(simulation.state.enemies.every((enemy) =>
      enemy.roster.length >= 8 && enemy.roster.length <= 14
    )).toBe(true);
    expect(simulation.state.warbands
      .filter((warband) => warband.nobleRank === "king")
      .every((warband) => warband.roster.length === 40)).toBe(true);
    expect(simulation.state.warbands
      .filter((warband) => warband.nobleRank === "baron")
      .every((warband) => warband.roster.length === 30)).toBe(true);
    expect(simulation.state.warbands
      .filter((warband) => warband.nobleRank === "count")
      .every((warband) => warband.roster.length === 20)).toBe(true);
  });

  it("spawns camp parties inside their camp and makes them wait before departing", () => {
    const world = generateWorldMap(303032, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    const enemy = simulation.state.enemies.find(
      (candidate) => candidate.sourceLocationId,
    )!;
    const camp = world.locations.find(
      (location) => location.id === enemy.sourceLocationId,
    )!;

    expect(Math.hypot(enemy.x - camp.x, enemy.y - camp.y)).toBeLessThan(1);
    expect(enemy.campDwellHoursRemaining).toBe(8);

    simulation.updateEnemies(4, 1);

    expect(Math.hypot(enemy.x - camp.x, enemy.y - camp.y)).toBeLessThan(1);
    expect(enemy.campDwellHoursRemaining).toBe(4);
  });

  it("keeps recent battle sites for twelve world hours", () => {
    const world = generateWorldMap(303030, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    simulation.recordBattleSite(900, 800);
    simulation.recordBattleSite(910, 806);

    expect(simulation.state.battleSites).toHaveLength(1);
    expect(simulation.state.battleSites[0].remainingHours).toBe(12);
    simulation.updateEnemies(11.9, 1);
    expect(simulation.state.battleSites).toHaveLength(1);
    simulation.updateEnemies(0.11, 1);
    expect(simulation.state.battleSites).toHaveLength(0);
  });

  it("makes clearly weaker patrols flee from the player", () => {
    const world = generateWorldMap(313131, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    simulation.state.nearbyLocationId = null;
    const enemy = simulation.state.enemies[0];
    enemy.threat = 1;
    enemy.roster = enemy.roster.slice(0, 1);
    enemy.partySize = enemy.roster.length;
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

  it("caps a hunting patrol below the player's current travel speed", () => {
    const world = generateWorldMap(414142, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    simulation.state.nearbyLocationId = null;
    const enemy = simulation.state.enemies[0];
    enemy.threat = 2;
    enemy.speed = 1_000;
    enemy.x = simulation.state.x + 180;
    enemy.y = simulation.state.y;

    simulation.updateEnemies(0.5, 2, [], 100);

    expect(
      Math.hypot(
        simulation.state.x - enemy.x,
        simulation.state.y - enemy.y,
      ),
    ).toBeGreaterThanOrEqual(132);
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

  it("lets hostile faction warbands fight and destroy caravans over time", () => {
    const world = generateWorldMap(828292, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    const attacker = createTestWarband(
      "gloam_raider",
      "gloam_compact",
      1000,
      1000,
      Array.from({ length: 10 }, () => "royal_guard"),
    );
    const caravan: CaravanState = {
      id: "ember_caravan",
      kind: "caravan",
      factionId: "ember_crown",
      x: 1010,
      y: 1000,
      originId: "city_0",
      destinationId: "city_1",
      progress: 0.2,
      speed: 220,
      leaderCardId: "wache",
      leaderLevel: 3,
      unitIds: ["swordsman", "militia_shieldbearer", "novice_archer"],
      inventory: [{ itemId: "iron", quantity: 8 }],
      state: "traveling",
    };
    simulation.state.warbands = [attacker];

    simulation.updateWarbands(0.2, undefined, { traders: [caravan] });
    expect(caravan.state).toBe("fighting");
    expect(attacker.state).toBe("fighting");

    simulation.updateWarbands(1, undefined, { traders: [caravan] });
    expect(caravan.state).toBe("destroyed");
    expect(caravan.inventory).toHaveLength(0);
    expect(attacker.state).not.toBe("fighting");
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
    simulation.updateWarbands(6.1);

    expect(simulation.state.warbandBattles[0].state).toBe("resolved");
    expect(
      simulation.state.warbands.some((warband) => warband.hpRatio < 1),
    ).toBe(true);
    expect(simulation.state.warbands.every((warband) => warband.state !== "fighting")).toBe(
      true,
    );
    expect(simulation.state.chronicle[0]?.text).toContain("defeated");
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

    simulation.updateWarbands(6.1);

    expect(enemy.active).toBe(false);
    expect(warband.targetEnemyId).toBeNull();
    expect(warband.hpRatio).toBeLessThan(1);
  });

  it("lets sufficiently strong lords pursue camp parties from farther away", () => {
    const world = generateWorldMap(868687, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    const lord = createTestWarband(
      "ember_lord_hunter",
      "ember_crown",
      1000,
      1000,
      ["knight", "banner_knight", "shieldguard", "knight"],
    );
    lord.type = "lord";
    lord.nobleRank = "baron";
    lord.detectionRadius = 500;
    lord.aggressionRadius = 450;
    const enemy = simulation.state.enemies[0];
    enemy.active = true;
    enemy.threat = 1;
    enemy.roster = enemy.roster.slice(0, 2);
    enemy.partySize = enemy.roster.length;
    enemy.x = 1900;
    enemy.y = 1000;
    for (const other of simulation.state.enemies) {
      if (other.id !== enemy.id) other.active = false;
    }
    simulation.state.warbands = [lord];

    simulation.updateWarbands(0.2);

    expect(lord.state).toBe("chasing");
    expect(lord.targetEnemyId).toBe(enemy.id);
    expect(lord.x).toBeGreaterThan(1000);
  });

  it("makes lords prioritize bandits threatening their faction territory", () => {
    const world = generateWorldMap(868688, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    const settlement = world.locations.find((location) =>
      ["city", "village", "castle"].includes(location.type)
    )!;
    const lord = createTestWarband(
      "territory_defender",
      "ember_crown",
      settlement.x + 2650,
      settlement.y,
      Array.from({ length: 8 }, () => "royal_guard"),
    );
    lord.type = "lord";
    lord.nobleRank = "baron";
    lord.detectionRadius = 500;
    lord.aggressionRadius = 450;
    const enemy = simulation.state.enemies[0];
    enemy.active = true;
    enemy.threat = 1;
    enemy.roster = enemy.roster.slice(0, 2);
    enemy.partySize = enemy.roster.length;
    enemy.x = settlement.x + 120;
    enemy.y = settlement.y;
    for (const other of simulation.state.enemies) {
      if (other.id !== enemy.id) other.active = false;
    }
    simulation.state.warbands = [lord];
    const factionState: FactionState = {
      reputation: { ember_crown: 0, gloam_compact: 0, iron_concord: 0 },
      wanted: { ember_crown: 0, gloam_compact: 0, iron_concord: 0 },
      atWar: { ember_crown: false, gloam_compact: false, iron_concord: false },
      lordRelations: {},
      locationFactions: { [settlement.id]: "ember_crown" },
      quests: [],
    };

    simulation.updateWarbands(0.2, factionState);

    expect(lord.state).toBe("chasing");
    expect(lord.targetEnemyId).toBe(enemy.id);
  });

  it("lets camp parties hunt and attack sufficiently weakened lords", () => {
    const world = generateWorldMap(868689, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    const enemy = simulation.state.enemies[0];
    enemy.active = true;
    enemy.threat = 5;
    while (enemy.roster.length < 14) {
      enemy.roster.push(createCardInstance(enemy.roster[0].cardId));
    }
    enemy.partySize = enemy.roster.length;
    enemy.campDwellHoursRemaining = 0;
    enemy.gold = 500;
    enemy.rations = 200;
    const lord = createTestWarband(
      "wounded_lord_target",
      "ember_crown",
      enemy.x + 420,
      enemy.y,
      ["village_levy", "village_slinger"],
    );
    lord.type = "lord";
    lord.nobleRank = "count";
    lord.state = "returning";
    for (const unit of lord.roster) {
      unit.currentHp = Math.max(
        1,
        Math.floor(getCardDefinition(unit.cardId).maxHp * 0.35),
      );
    }
    lord.hpRatio = 0.35;
    simulation.state.warbands = [lord];
    simulation.state.x = enemy.x + 3500;
    simulation.state.y = enemy.y;
    const distanceBefore = Math.hypot(lord.x - enemy.x, lord.y - enemy.y);

    simulation.updateEnemies(0.5, 1);

    expect(enemy.targetWarbandId).toBe(lord.id);
    expect(enemy.activity).toBe("hunting");
    expect(Math.hypot(lord.x - enemy.x, lord.y - enemy.y)).toBeLessThan(
      distanceBefore,
    );

    lord.x = enemy.x + 20;
    lord.y = enemy.y;
    simulation.updateEnemies(0.2, 1);

    expect(enemy.activeBattleId).toBeTruthy();
    expect(lord.state).toBe("fighting");
  });

  it("lets additional camp parties reinforce an ongoing lord battle", () => {
    const world = generateWorldMap(868691, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    const lord = createTestWarband(
      "reinforcement_target_lord",
      "ember_crown",
      1000,
      1000,
      Array.from({ length: 8 }, () => "royal_guard"),
    );
    lord.type = "lord";
    lord.nobleRank = "baron";
    const [firstEnemy, reinforcement] = simulation.state.enemies;
    firstEnemy.active = true;
    firstEnemy.threat = 1;
    firstEnemy.partySize = firstEnemy.roster.length;
    firstEnemy.campDwellHoursRemaining = 0;
    firstEnemy.gold = 300;
    firstEnemy.rations = 100;
    firstEnemy.x = 1020;
    firstEnemy.y = 1000;
    reinforcement.active = true;
    reinforcement.threat = 1;
    reinforcement.campDwellHoursRemaining = 0;
    reinforcement.x = 1040;
    reinforcement.y = 1000;
    reinforcement.gold = 300;
    reinforcement.rations = 100;
    for (const other of simulation.state.enemies) {
      if (other.id !== firstEnemy.id && other.id !== reinforcement.id) {
        other.active = false;
      }
    }
    simulation.state.warbands = [lord];
    simulation.state.x = 5000;
    simulation.state.y = 5000;

    simulation.updateWarbands(0.2);
    const battle = simulation.state.warbandBattles[0];
    expect(battle.remainingHours).toBe(6);

    simulation.updateEnemies(0.2, 1);

    expect(battle.sideA.warbandIds).toEqual([lord.id]);
    expect(battle.sideB.enemyIds).toEqual(
      expect.arrayContaining([firstEnemy.id, reinforcement.id]),
    );
    expect(reinforcement.activeBattleId).toBe(battle.id);

    simulation.updateWarbands(6.1);

    expect(battle.state).toBe("resolved");
  });

  it("makes lords break off pursuit before entering a bandit nest", () => {
    const world = generateWorldMap(868692, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    const enemy = simulation.state.enemies.find(
      (candidate) => candidate.sourceLocationId,
    )!;
    const camp = world.locations.find(
      (location) => location.id === enemy.sourceLocationId,
    )!;
    enemy.active = true;
    enemy.x = camp.x;
    enemy.y = camp.y;
    const lord = createTestWarband(
      "camp_boundary_lord",
      "ember_crown",
      camp.x + camp.radius + 420,
      camp.y,
      Array.from({ length: 8 }, () => "royal_guard"),
    );
    lord.type = "lord";
    lord.nobleRank = "baron";
    lord.state = "chasing";
    lord.targetEnemyId = enemy.id;
    lord.detectionRadius = 2000;
    lord.aggressionRadius = 1800;
    simulation.state.warbands = [lord];
    for (const other of simulation.state.enemies) {
      if (other.id !== enemy.id) other.active = false;
    }

    simulation.updateWarbands(0.2);

    expect(lord.state).toBe("patrolling");
    expect(lord.targetEnemyId).toBeNull();
  });

  it("keeps a victorious lord hunting after a survivable bandit fight", () => {
    const world = generateWorldMap(868690, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    const lord = createTestWarband(
      "persistent_lord_hunter",
      "ember_crown",
      1000,
      1000,
      Array.from({ length: 10 }, () => "royal_guard"),
    );
    lord.type = "lord";
    lord.nobleRank = "baron";
    const enemy = simulation.state.enemies[0];
    enemy.active = true;
    enemy.threat = 1;
    enemy.roster = enemy.roster.slice(0, 1);
    enemy.partySize = 1;
    enemy.x = 1020;
    enemy.y = 1000;
    for (const other of simulation.state.enemies) {
      if (other.id !== enemy.id) other.active = false;
    }
    simulation.state.warbands = [lord];

    simulation.updateWarbands(0.2);
    simulation.updateWarbands(6.1);

    expect(enemy.active).toBe(false);
    expect(lord.hpRatio).toBeGreaterThanOrEqual(0.25);
    expect(lord.state).toBe("patrolling");
    expect(lord.targetPlayer).toBe(false);
  });

  it("lets monsters raid nearby village traders over time", () => {
    const world = generateWorldMap(878787, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    const enemy = simulation.state.enemies[0];
    enemy.active = true;
    enemy.threat = 5;
    while (enemy.roster.length < 14) {
      enemy.roster.push(
        createCardInstance(enemy.roster[enemy.roster.length % 2].cardId),
      );
    }
    enemy.partySize = enemy.roster.length;
    enemy.speed = 220;
    enemy.aggroRadius = 500;
    enemy.campDwellHoursRemaining = 0;
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

  it("lets camp parties travel far enough to hunt caravans", () => {
    const world = generateWorldMap(878788, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    const enemy = simulation.state.enemies[0];
    enemy.active = true;
    enemy.threat = 1;
    enemy.campDwellHoursRemaining = 0;
    simulation.state.x = enemy.x + 4_000;
    simulation.state.y = enemy.y + 4_000;
    const trader: CaravanState = {
      id: "distant_caravan_test",
      kind: "caravan",
      x: enemy.x + 1_350,
      y: enemy.y,
      originId: "city_a",
      destinationId: "city_b",
      progress: 0.5,
      speed: 220,
      waitHoursRemaining: 0,
      inventory: [{ itemId: "iron", quantity: 12 }],
    };
    const distanceBefore = Math.hypot(
      trader.x - enemy.x,
      trader.y - enemy.y,
    );

    simulation.updateEnemies(0.5, 1, [trader]);

    expect(enemy.targetTraderId).toBe(trader.id);
    expect(enemy.activity).toBe("raiding");
    expect(Math.hypot(trader.x - enemy.x, trader.y - enemy.y)).toBeLessThan(
      distanceBefore,
    );
  });

  it("uses any active camp of the same type for healing, recruiting and selling spoils", () => {
    const world = generateWorldMap(878789, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    const campsByBiome = new Map<string, typeof world.locations>();
    for (const location of world.locations) {
      const biome = location.spawnProfile?.biome;
      if (!biome) continue;
      const camps = campsByBiome.get(biome) ?? [];
      camps.push(location);
      campsByBiome.set(biome, camps);
    }
    const compatibleCamps = [...campsByBiome.values()].find(
      (camps) => camps.length >= 2,
    )!;
    const [homeCamp, otherCamp] = compatibleCamps;
    const enemy = simulation.state.enemies.find(
      (candidate) => candidate.sourceLocationId === homeCamp.id,
    )!;
    const sourceRaces = new Set(
      (contentPack.enemies.find(
        (archetype) => archetype.id === enemy.archetypeId,
      )?.deck ?? []).map((cardId) => getCardDefinition(cardId).race),
    );
    const foreignPrisoner = contentPack.cards.find(
      (card) => card.tier === 1 && !sourceRaces.has(card.race),
    )!;
    enemy.x = otherCamp.x;
    enemy.y = otherCamp.y;
    enemy.campDwellHoursRemaining = 0;
    enemy.lootValue = 37;
    enemy.prisoners = [{ cardId: foreignPrisoner.id, quantity: 1 }];
    const goldBefore = enemy.gold;
    simulation.state.x = otherCamp.x + 4_000;
    simulation.state.y = otherCamp.y + 4_000;

    simulation.updateEnemies(0.2, 1);

    expect(enemy.serviceLocationId).toBe(otherCamp.id);
    expect(enemy.campDwellHoursRemaining).toBeGreaterThan(7);
    expect(enemy.lootValue).toBe(0);
    expect(enemy.prisoners).toEqual([]);
    expect(enemy.gold).toBeGreaterThan(goldBefore + 36);
    expect(enemy.activity).toMatch(/recovering|recruiting/);
  });

  it("delays camp-party respawns while the player stands inside the camp", () => {
    const world = generateWorldMap(878790, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    const enemy = simulation.state.enemies.find(
      (candidate) => candidate.sourceLocationId,
    )!;
    const camp = world.locations.find(
      (location) => location.id === enemy.sourceLocationId,
    )!;
    simulation.defeatEnemy(enemy.id);
    enemy.respawnHours = 0;
    simulation.state.x = camp.x;
    simulation.state.y = camp.y;

    simulation.updateEnemies(0.1, 1);
    expect(enemy.active).toBe(false);

    simulation.state.x = camp.x + 1_000;
    simulation.state.y = camp.y + 1_000;
    simulation.updateEnemies(0.1, 1);

    expect(enemy.active).toBe(true);
    expect(Math.hypot(enemy.x - camp.x, enemy.y - camp.y)).toBeLessThan(1);
    expect(enemy.campDwellHoursRemaining).toBe(8);
  });

  it("persists camp rosters and resets defeated camps with Tier 1 units", () => {
    const world = generateWorldMap(888888, contentPack.enemies);
    const first = new WorldSimulation(world);
    const camp = first.state.enemies.find((enemy) => enemy.sourceLocationId)!;
    camp.roster[0].xp = 77;
    camp.gold = 91;
    const restored = new WorldSimulation(world, { enemies: structuredClone(first.state.enemies) });
    const restoredCamp = restored.state.enemies.find((enemy) => enemy.id === camp.id)!;

    expect(restoredCamp.roster[0].xp).toBe(77);
    expect(restoredCamp.gold).toBe(91);

    restoredCamp.prisoners.push({ cardId: "soldier", quantity: 1 });
    restored.defeatEnemy(restoredCamp.id);
    restoredCamp.respawnHours = 0;
    restored.updateEnemies(0.1, 1);

    expect(restoredCamp.active).toBe(true);
    expect(restoredCamp.prisoners).toEqual([]);
    expect(restoredCamp.roster.every((unit) => getCardDefinition(unit.cardId).tier === 1)).toBe(true);
  });

  it("lets active camp patrols recruit into visibly larger parties around their hideout", () => {
    const world = generateWorldMap(898989, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    const camp = simulation.state.enemies.find((enemy) => enemy.sourceLocationId)!;
    camp.roster = camp.roster.slice(0, 6);
    camp.partySize = camp.roster.length;
    const initialSize = camp.roster.length;
    camp.gold = 1_000;
    camp.rations = 1_000;
    camp.x = camp.spawnX;
    camp.y = camp.spawnY;
    simulation.state.x = camp.x + 5_000;
    simulation.state.y = camp.y + 5_000;

    for (let day = 0; day < 5; day += 1) {
      simulation.updateEnemies(24, 1);
    }

    expect(camp.roster.length).toBeGreaterThan(initialSize);
    expect(camp.partySize).toBe(camp.roster.length);
  });

  it("returns wounded camp parties to their base to heal and recruit", () => {
    const world = generateWorldMap(898990, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    const camp = simulation.state.enemies.find(
      (enemy) => enemy.sourceLocationId && enemy.active,
    )!;
    camp.roster = camp.roster.slice(0, 2);
    for (const unit of camp.roster) {
      unit.currentHp = Math.max(
        1,
        Math.floor(getCardDefinition(unit.cardId).maxHp * 0.25),
      );
    }
    camp.gold = 1_000;
    camp.rations = 100;
    camp.x = camp.spawnX + 420;
    camp.y = camp.spawnY;
    camp.activity = "huntingPlayer";

    const distanceBefore = Math.hypot(
      camp.x - camp.spawnX,
      camp.y - camp.spawnY,
    );
    simulation.updateEnemies(0.2);

    expect(camp.activity).toBe("retreating");
    expect(
      Math.hypot(camp.x - camp.spawnX, camp.y - camp.spawnY),
    ).toBeLessThan(distanceBefore);

    camp.x = camp.spawnX;
    camp.y = camp.spawnY;
    const hpBefore = camp.roster.reduce(
      (sum, unit) => sum + unit.currentHp,
      0,
    );
    const rosterBefore = camp.roster.length;
    simulation.updateEnemies(24);

    expect(
      camp.roster.reduce((sum, unit) => sum + unit.currentHp, 0),
    ).toBeGreaterThan(hpBefore);
    expect(camp.roster.length).toBeGreaterThan(rosterBefore);
  });

  it("recovers broke camp parties waiting at the visible camp perimeter", () => {
    const world = generateWorldMap(898992, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    const enemy = simulation.state.enemies.find(
      (candidate) => candidate.sourceLocationId && candidate.active,
    )!;
    const camp = world.locations.find(
      (location) => location.id === enemy.sourceLocationId,
    )!;
    for (const unit of enemy.roster) {
      unit.currentHp = Math.max(
        1,
        Math.floor(getCardDefinition(unit.cardId).maxHp * 0.25),
      );
    }
    enemy.gold = 0;
    enemy.rations = 0;
    enemy.x = camp.x + camp.radius + 80;
    enemy.y = camp.y;
    enemy.activity = "recovering";
    enemy.campDwellHoursRemaining = 0;
    simulation.state.x = camp.x + 4_000;
    simulation.state.y = camp.y + 4_000;
    const hpBefore = enemy.roster.reduce(
      (sum, unit) => sum + unit.currentHp,
      0,
    );

    simulation.updateEnemies(24, 1);

    expect(
      enemy.roster.reduce((sum, unit) => sum + unit.currentHp, 0),
    ).toBeGreaterThan(hpBefore);
    expect(enemy.serviceLocationId).toBe(camp.id);

    for (let day = 0; day < 12; day += 1) {
      simulation.updateEnemies(24, 1);
    }
    expect(enemy.activity).not.toBe("recovering");
    expect(enemy.activity).not.toBe("retreating");
  });

  it("makes every wounded faction warband return home before taking new fights", () => {
    const world = generateWorldMap(898991, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    const warband = createTestWarband(
      "wounded_patrol",
      "ember_crown",
      1000,
      1000,
      ["village_levy", "village_levy", "village_slinger"],
    );
    for (const unit of warband.roster) {
      unit.currentHp = Math.max(
        1,
        Math.floor(getCardDefinition(unit.cardId).maxHp * 0.25),
      );
    }
    warband.x = 1450;
    warband.y = 1000;
    warband.spawnX = 1000;
    warband.spawnY = 1000;
    warband.state = "chasing";
    warband.targetPlayer = true;
    simulation.state.warbands = [warband];

    simulation.updateWarbands(0.2);

    expect(warband.state).toBe("returning");
    expect(warband.targetPlayer).toBe(false);
    expect(warband.targetWarbandId).toBeNull();
    expect(warband.targetEnemyId).toBeNull();
    expect(warband.x).toBeLessThan(1450);
  });

  it("lets broke lords resume duty once they are combat-ready", () => {
    const world = generateWorldMap(898993, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    const lord = createTestWarband(
      "broke_lord",
      "ember_crown",
      1000,
      1000,
      ["village_levy", "village_slinger", "militia_shieldbearer"],
    );
    lord.type = "lord";
    lord.nobleRank = "count";
    lord.gold = 0;
    lord.rations = 0;
    lord.state = "returning";
    lord.activity = "recovering";
    for (const unit of lord.roster) {
      unit.currentHp = Math.max(
        1,
        Math.floor(getCardDefinition(unit.cardId).maxHp * 0.25),
      );
    }
    lord.hpRatio = 0.25;
    simulation.state.warbands = [lord];
    simulation.state.x = 5_000;
    simulation.state.y = 5_000;
    const hpBefore = lord.roster.reduce(
      (sum, unit) => sum + unit.currentHp,
      0,
    );

    simulation.updateWarbands(24);

    expect(
      lord.roster.reduce((sum, unit) => sum + unit.currentHp, 0),
    ).toBeGreaterThan(hpBefore);

    let recoveryDays = 1;
    while (lord.state === "returning" && recoveryDays < 5) {
      simulation.updateWarbands(24);
      recoveryDays += 1;
    }
    expect(lord.hpRatio).toBeGreaterThanOrEqual(0.7);
    expect(lord.state).not.toBe("returning");
    expect(recoveryDays).toBeLessThan(5);
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
    recruitmentCardIds: [...unitIds],
    roster: unitIds.map((cardId) => createCardInstance(cardId)),
    gold: 50,
    rations: 20,
    prisoners: [],
    victories: 0,
    logisticsHours: 0,
    nobleRank: null,
    nobleProfileId: null,
    personality: "just",
    activity: "patrolling",
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
