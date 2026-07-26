import { describe, expect, it, vi } from "vitest";
import { contentPack, enemiesById } from "../../content/content";
import {
  createCardInstance,
  createCardInstances,
  getCardDefinition,
} from "../cards/CardInstance";
import { getWeeklyUnitWage } from "../cards/UnitUpkeep";
import { addToInventory, inventoryQuantity } from "../economy/Economy";
import type {
  SaveGame,
  SaveRepository,
} from "../../infrastructure/save/SaveRepository";
import { BattleSimulation } from "../battle/BattleSimulation";
import { GameSession } from "./GameSession";
import { getPartyInitiativeMultiplier } from "../world/PartySpeed";
import type { WorldWarbandState } from "../world/WorldWarbands";

describe("GameSession roster", () => {
  it("uses the selected hero card and configured starting deck", () => {
    const session = new GameSession(314158);
    const hero = contentPack.heroes.find((entry) => entry.id === "wayfinder")!;

    session.beginNewRun({ heroId: hero.id, name: "Mirelle Ashstep", raceId: hero.raceId, originId: "cityWard", upbringingId: "artisan", turningPointId: "oath", portraitId: hero.heroCardId, startedAt: new Date(0).toISOString() });

    expect(session.hero.cardId).toBe(hero.heroCardId);
    expect(session.warband.map((unit) => unit.cardId)).toEqual(hero.startingDeck);
  });

  it("starts the default warband near 350 road travel speed", () => {
    const session = new GameSession(314157);
    const hero = contentPack.heroes.find((entry) => entry.id === "wanderer")!;
    session.beginNewRun({ heroId: hero.id, name: "Speed Tester", raceId: hero.raceId, originId: "cityWard", upbringingId: "artisan", turningPointId: "oath", portraitId: hero.heroCardId, startedAt: new Date(0).toISOString() });

    expect(session.currentTerrain).toBe("road");
    expect(session.effectiveMovementSpeed).toBeGreaterThanOrEqual(335);
    expect(session.effectiveMovementSpeed).toBeLessThanOrEqual(365);
  });

  it("keeps the faster Wanderer starting formation ahead of Desperate Militia", () => {
    const session = new GameSession(314156);
    const hero = contentPack.heroes.find((entry) => entry.id === "wanderer")!;
    session.beginNewRun({ heroId: hero.id, name: "Speed Tester", raceId: hero.raceId, originId: "cityWard", upbringingId: "artisan", turningPointId: "oath", portraitId: hero.heroCardId, startedAt: new Date(0).toISOString() });
    const militia = session.world.state.enemies.find(
      (enemy) => enemy.archetypeId === "desperate_militia",
    )!;
    const militiaSpeed = militia.speed * getPartyInitiativeMultiplier(militia.roster);

    expect(militiaSpeed).toBeLessThan(session.partyMovementSpeed);
  });

  it("keeps a loaded fourteen-unit company at a playable travel speed", () => {
    const session = new GameSession(314155);
    session.warband = createCardInstances(
      Array.from({ length: 14 }, () => "village_levy"),
    );
    session.inventory = [];
    addToInventory(session.inventory, "stone", 20);

    expect(session.movementSpeedBreakdown.formationSize).toBe(15);
    expect(session.movementSpeedBreakdown.sizeMultiplier).toBeCloseTo(0.9);
    expect(session.movementSpeedBreakdown.cargoMultiplier).toBeLessThan(1);
    expect(session.partyMovementSpeed).toBeGreaterThan(175);
  });

  it("applies persistent supply, capacity, and morale upgrades to a new run", () => {
    const session = new GameSession(314159);
    session.metaProgression.upgrades.roadRations = 2;
    session.metaProgression.upgrades.deepPockets = 2;
    session.metaProgression.upgrades.bannerMorale = 2;
    session.metaProgression.upgrades.startingAttributes = 1;

    session.beginNewRun({ name: "Test", raceId: "human", originId: "cityWard", upbringingId: "artisan", turningPointId: "oath", portraitId: "wanderer", startedAt: new Date(0).toISOString() });

    expect(session.foodCapacity).toBeGreaterThanOrEqual(150);
    expect(session.maxCargoWeight).toBe(130);
    expect(session.morale).toBe(80);
    expect(session.characterState.attributePoints).toBe(1);
  });

  it("records encountered battle units without claiming ownership", () => {
    const session = new GameSession(123456);
    const enemy = session.world.state.enemies[0];

    session.beginBattle(enemy.id);

    const enemyIds = [
      session.battle!.enemyLeader.cardId,
      ...session.battle!.enemyHand.map((card) => card.cardId),
      ...session.battle!.enemyField.map((card) => card.cardId),
      ...session.battle!.enemyDrawPile.map((card) => card.cardId),
    ];
    expect(enemyIds.every((cardId) => session.metaProgression.seenUnitIds.includes(cardId))).toBe(true);
    expect(enemyIds.some((cardId) => session.metaProgression.ownedUnitIds.includes(cardId))).toBe(false);
  });

  it("marks prisoners as owned only after they join the warband", () => {
    const session = new GameSession(123457);
    session.prisoners = [{ cardId: "village_levy", quantity: 1 }];
    session.metaProgression.seenUnitIds.push("village_levy");
    session.gold = 1_000;
    session.characterState.xp = 1_000;

    expect(session.metaProgression.ownedUnitIds).not.toContain("village_levy");
    expect(session.recruitPrisoner("village_levy")).toBe("success");
    expect(session.metaProgression.ownedUnitIds).toContain("village_levy");
  });

  it("starts with only the immortal hero", () => {
    const session = new GameSession();

    expect(session.warbandCapacity).toBe(16);
    expect(session.warband).toHaveLength(0);
    expect(session.reserve).toHaveLength(0);
    expect(session.hero.isHero).toBe(true);
  });

  it("recruits humans directly into the warband", () => {
    const session = new GameSession();
    session.gold = 1_000;

    for (let index = 0; index < 6; index += 1) {
      expect(session.recruit("village_levy")).toBe("success");
    }
    expect(session.warband).toHaveLength(6);
    expect(session.reserve).toHaveLength(0);
  });

  it("keeps a full levy warband at the lowest strategic strength", () => {
    const session = new GameSession(121212);
    for (let index = 0; index < 5; index += 1) {
      expect(session.recruit("village_levy")).toBe("success");
    }

    expect(session.warbandThreatRating).toBe(1);
  });

  it("upgrades an experienced recruit through a selected branch", () => {
    const session = new GameSession();
    session.recruit("village_levy");
    const recruit = session.warband[0];
    recruit.xp = 125;
    recruit.currentHp = 450;

    expect(session.upgradeUnit(recruit.uid, "swordsman")).toBe("success");
    expect(recruit.cardId).toBe("swordsman");
    expect(recruit.xp).toBe(25);
    expect(recruit.currentHp / getCardDefinition("swordsman").maxHp).toBeCloseTo(0.5, 1);
    recruit.xp = 175;

    expect(session.upgradeUnit(recruit.uid, "soldier")).toBe("success");
    expect(recruit.cardId).toBe("soldier");
    expect(recruit.level).toBe(1);
    expect(recruit.xp).toBe(25);
    expect(recruit.currentHp).toBeLessThan(getCardDefinition("soldier").maxHp);
  });

  it("allows roster changes away from cities", () => {
    const session = new GameSession(12345);
    session.recruit("village_levy");
    const recruit = session.warband[0];
    session.world.move(1, 0, 4);

    expect(session.isInCity).toBe(false);
    expect(session.recruit("village_levy")).toBe("notInCity");
    expect(session.moveToWarband(recruit.uid)).toBe("success");
  });

  it("awards battle XP only to deployed survivors and restores the hero", () => {
    const session = new GameSession();
    session.recruit("village_levy");
    const recruit = session.warband[0];
    session.recruit("village_levy");
    const reserve = session.warband[1];
    session.beginBattle(session.world.state.enemies[0].id);
    session.battle!.deployedUnitUids.add(recruit.uid);
    session.battle!.unitStats.set(recruit.uid, {
      damageDealt: 900,
      hpLost: 0,
      destroyed: false,
      wounded: false,
      kills: 1,
      killXp: 10,
    });
    session.battle!.defeatedEnemyCardIds.push(
      "village_levy",
      "village_levy",
      "village_levy",
      "village_levy",
    );
    session.battle!.outcome = "victory";
    session.hero.currentHp = 0;

    session.finishVictory();

    expect(recruit.xp).toBe(41);
    expect(reserve.xp).toBe(0);
    expect(session.hero.currentHp).toBe(session.heroMaxHp);
  });

  it("continues a dungeon through three persistent battle stages", () => {
    const session = new GameSession(12345);
    const dungeon = session.world.map.locations.find(
      (location) => location.type === "dungeon",
    )!;
    for (const enemy of session.world.state.enemies) {
      enemy.active = false;
      enemy.respawnHours = 1_000;
    }
    session.world.state.nearbyLocationId = dungeon.id;

    expect(session.enterDungeon(dungeon.id)).toBe(true);
    expect(session.dungeonRun).toMatchObject({ stage: 1, totalStages: 3 });

    session.hero.currentHp = session.heroMaxHp;
    session.battle!.outcome = "victory";
    session.finishVictory(true);
    expect(session.dungeonRun?.stage).toBe(2);
    expect(session.hero.currentHp).toBeGreaterThan(0);
    expect(session.hero.currentHp).toBeLessThanOrEqual(session.heroMaxHp);

    session.battle!.outcome = "victory";
    session.finishVictory(true);
    session.battle!.outcome = "victory";
    session.finishVictory(true);

    expect(session.mode).toBe("world");
    expect(session.dungeonRun).toBeNull();
    expect(session.completedLocationIds.has(dungeon.id)).toBe(true);
  });

  it("allows retreat with spoils between dungeon battles", () => {
    const session = new GameSession(24680);
    const dungeon = session.world.map.locations.find(
      (location) => location.type === "dungeon",
    )!;
    session.world.state.nearbyLocationId = dungeon.id;
    session.enterDungeon(dungeon.id);
    session.battle!.outcome = "victory";

    session.finishVictory(false);

    expect(session.mode).toBe("world");
    expect(session.dungeonRun).toBeNull();
    expect(session.completedLocationIds.has(dungeon.id)).toBe(false);
  });

  it("resolves village work once and creates castle battles", () => {
    const session = new GameSession(13579);
    const village = session.world.map.locations.find(
      (location) => location.type === "village",
    )!;
    session.world.state.nearbyLocationId = village.id;
    const goldBefore = session.gold;

    expect(session.resolveLocationEvent(village.id).kind).toBe("gold");
    expect(session.gold).toBeGreaterThan(goldBefore);
    expect(session.resolveLocationEvent(village.id).kind).toBe("alreadyVisited");

    const castleSession = new GameSession(13579);
    const castle = castleSession.world.map.locations.find(
      (location) => location.type === "castle",
    )!;
    castleSession.world.state.nearbyLocationId = castle.id;
    expect(castleSession.challengeCastle(castle.id)).toBe(true);
    expect(castleSession.battleContext).toBe("castle");
    expect(castleSession.mode).toBe("battle");
  });

  it("buys goods and processes demanded resources in city workshops", () => {
    const session = new GameSession(112233);
    session.gold = 1_000;
    const market = session.marketProfile!;
    const offer = market.offers[0];
    const quantityBefore = inventoryQuantity(session.inventory, offer.itemId);

    expect(session.buyItem(offer.itemId)).toBe("success");
    expect(inventoryQuantity(session.inventory, offer.itemId)).toBe(
      quantityBefore + 1,
    );

    const recipe = session.marketProfile!.recipeIds[0];
    const definition = contentPack.tradeRecipes.find(
      (candidate) => candidate.id === recipe,
    )!;
    addToInventory(
      session.inventory,
      definition.inputItemId,
      definition.inputQuantity,
    );
    const outputBefore = inventoryQuantity(
      session.inventory,
      definition.outputItemId,
    );
    expect(session.processTrade(recipe)).toBe("success");
    expect(inventoryQuantity(session.inventory, definition.outputItemId)).toBe(
      outputBefore + definition.outputQuantity,
    );
  });

  it("trades item quantities and transfers gold through the saved merchant purse", () => {
    const session = new GameSession(112234);
    session.gold = 10_000;
    const profile = session.marketProfile!;
    const offer = profile.offers.find((candidate) => candidate.stock >= 3)!;
    const playerBefore = inventoryQuantity(session.inventory, offer.itemId);
    const merchantBefore = session.economyState.merchantGold[profile.locationId!];
    const buyPrice = session.getBuyPrice(offer.itemId);

    expect(session.buyItem(offer.itemId, 3)).toBe("success");
    expect(inventoryQuantity(session.inventory, offer.itemId)).toBe(playerBefore + 3);
    expect(session.economyState.merchantGold[profile.locationId!]).toBe(merchantBefore + buyPrice * 3);

    const sellPrice = session.getSellPrice(offer.itemId);
    expect(session.sellItem(offer.itemId, 2)).toBe("success");
    expect(inventoryQuantity(session.inventory, offer.itemId)).toBe(playerBefore + 1);
    expect(session.economyState.merchantGold[profile.locationId!]).toBe(merchantBefore + buyPrice * 3 - sellPrice * 2);
  });

  it("depletes finite market stock and raises scarcity prices", () => {
    const session = new GameSession(778899);
    session.gold = 10_000;
    const initialOffer = session.marketProfile!.offers[0];
    let latestPrice = initialOffer.buyPrice;

    for (let index = 0; index < initialOffer.stock; index += 1) {
      expect(session.buyItem(initialOffer.itemId)).toBe("success");
      latestPrice =
        session.marketProfile!.offers.find(
          (offer) => offer.itemId === initialOffer.itemId,
        )!.buyPrice;
    }

    expect(latestPrice).toBeGreaterThanOrEqual(initialOffer.buyPrice);
    expect(session.buyItem(initialOffer.itemId)).toBe("invalid");
    expect(
      session.marketProfile!.offers.find(
        (offer) => offer.itemId === initialOffer.itemId,
      )!.stock,
    ).toBe(0);
  });

  it("persists depleted markets and caravan positions in city saves", async () => {
    const session = new GameSession(909090);
    session.gold = 1_000;
    const offer = session.marketProfile!.offers[0];
    const initialStock = offer.stock;
    const destination = session.world.map.locations.find(
      (location) => location.type === "city" && location.id !== "city_0",
    )!;
    session.setWaypoint(destination.x, destination.y, destination.nameKey);
    session.buyItem(offer.itemId);
    session.updateEconomy(12);
    let storedSave: SaveGame | null = null;
    const repository: SaveRepository = {
      read: async () => storedSave,
      write: async (save) => {
        storedSave = structuredClone(save);
      },
      delete: async () => {
        storedSave = null;
      },
    };

    expect(await session.save(repository)).toBe(true);
    const restored = new GameSession(1);
    restored.restore(storedSave!);

    expect(
      restored.marketProfile!.offers.find(
        (candidate) => candidate.itemId === offer.itemId,
      )!.stock,
    ).toBe(initialStock - 1);
    expect(restored.economyState.caravans[0].x).toBe(
      storedSave!.economyState!.caravans[0].x,
    );
    expect(restored.world.state.exploredSectors).toEqual(
      storedSave!.player.exploredSectors,
    );
    expect(restored.waypoint).toEqual(storedSave!.player.waypoint);
  });

  it("uses consumables and applies equipped hero bonuses in combat", () => {
    const session = new GameSession(445566);
    session.recruit("village_levy");
    const recruit = session.warband[0];
    recruit.currentHp = 200;
    addToInventory(session.inventory, "healing_poultice", 1);
    addToInventory(session.inventory, "iron_talisman", 1);

    expect(session.useItem("healing_poultice")).toBe("success");
    expect(recruit.currentHp).toBe(500);
    expect(session.equipItem("iron_talisman")).toBe("success");
    session.beginBattle(session.world.state.enemies[0].id);

    expect(session.battle!.getAttack(session.hero)).toBe(
      Math.round(
        (getCardDefinition(session.hero.cardId).atk +
          session.heroCombatBonuses.heroAtk) *
          session.battle!.terrainModifiers.playerAttack,
      ),
    );
  });

  it("levels the Wanderer and spends attribute and skill points", () => {
    const session = new GameSession(123123);
    const baseHp = session.heroMaxHp;
    const baseSpeed = session.partyMovementSpeed;

    session.characterState.attributePoints = 2;
    session.characterState.skillPoints = 3;

    expect(session.spendAttribute("strength")).toBe(true);
    expect(session.heroMaxHp).toBeGreaterThan(baseHp);
    expect(session.hero.currentHp).toBe(session.heroMaxHp);
    expect(session.spendAttribute("intelligence")).toBe(true);
    expect(session.characterState.skillPoints).toBe(4);

    expect(session.spendSkill("pathfinding")).toBe(true);
    expect(session.spendSkill("leadership")).toBe(true);
    expect(session.partyMovementSpeed).toBeGreaterThan(baseSpeed);
    expect(session.warbandCapacity).toBe(19);
  });

  it("derives player travel speed from the initiative of the whole warband", () => {
    const session = new GameSession(123124);
    session.warband = createCardInstances(["cannon_golem", "cannon_golem", "cannon_golem"]);
    const slowSpeed = session.partyMovementSpeed;
    session.warband = createCardInstances(["dire_wolf", "dire_wolf", "dire_wolf"]);

    expect(session.partyMovementSpeed).toBeGreaterThan(slowSpeed);
  });

  it("persists character progression in city saves", async () => {
    const session = new GameSession(321321);
    session.characterState.attributePoints = 1;
    session.characterState.skillPoints = 1;
    session.spendAttribute("charisma");
    session.spendSkill("leadership");
    let storedSave: SaveGame | null = null;
    const repository: SaveRepository = {
      read: async () => storedSave,
      write: async (save) => {
        storedSave = structuredClone(save);
      },
      delete: async () => {
        storedSave = null;
      },
    };

    expect(await session.save(repository)).toBe(true);
    const restored = new GameSession(1);
    restored.restore(storedSave!);

    expect(restored.characterState.attributes.charisma).toBe(2);
    expect(restored.characterState.skills.leadership).toBe(1);
    expect(restored.warbandCapacity).toBe(21);
  });

  it("completes delivery quests and awards faction reputation", () => {
    const session = new GameSession(334455);
    const quest = session.factionState.quests.find(
      (candidate) => candidate.type === "delivery",
    )!;
    session.world.state.nearbyLocationId = quest.issuerLocationId;
    expect(session.acceptQuest(quest.id)).toBe(true);
    addToInventory(session.inventory, quest.itemId!, quest.requiredQuantity);
    session.world.state.nearbyLocationId = quest.targetLocationId;
    const goldBefore = session.gold;

    expect(session.claimQuest(quest.id)).toBe(true);
    expect(quest.status).toBe("completed");
    expect(session.gold).toBe(goldBefore + quest.rewardGold);
    expect(session.factionState.reputation[quest.factionId]).toBe(
      quest.rewardReputation,
    );
    expect(inventoryQuantity(session.inventory, quest.itemId!)).toBe(0);
  });

  it("counts only matching enemies for bounty quests", () => {
    const session = new GameSession(667788);
    const quest = session.factionState.quests.find(
      (candidate) => candidate.type === "bounty",
    )!;
    session.world.state.nearbyLocationId = quest.issuerLocationId;
    session.acceptQuest(quest.id);

    for (let count = 0; count < quest.requiredCount; count += 1) {
      session.battle = new BattleSimulation(
        session.warband,
        enemiesById.get(quest.enemyId!)!,
        session.hero,
      );
      session.mode = "battle";
      session.battle.outcome = "victory";
      session.finishVictory();
    }

    expect(quest.progress).toBe(quest.requiredCount);
    expect(quest.status).toBe("ready");
  });

  it("completes escorts only when caravan and player reach the target together", () => {
    const session = new GameSession(998877);
    const quest = session.factionState.quests.find(
      (candidate) => candidate.type === "escort",
    )!;
    session.world.state.nearbyLocationId = quest.issuerLocationId;
    expect(
      session.economyState.caravans.some(
        (candidate) => candidate.id === quest.caravanId,
      ),
    ).toBe(false);
    session.acceptQuest(quest.id);
    const caravan = session.economyState.caravans.find(
      (candidate) => candidate.id === quest.caravanId,
    )!;
    const issuer = session.world.map.locations.find(
      (location) => location.id === quest.issuerLocationId,
    )!;
    expect(caravan.originId).toBe(issuer.id);
    expect(caravan.progress).toBeGreaterThan(0);
    const target = session.world.map.locations.find(
      (location) => location.id === quest.targetLocationId,
    )!;
    caravan.x = target.x;
    caravan.y = target.y;
    caravan.progress = 0;
    caravan.originId = target.id;
    session.world.state.x = target.x;
    session.world.state.y = target.y;
    session.world.state.nearbyLocationId = target.id;

    session.updateEconomy(0);

    expect(quest.status).toBe("ready");
    expect(session.claimQuest(quest.id)).toBe(true);
  });

  it("uses positive local reputation for better market prices", () => {
    const session = new GameSession(121212);
    const city = session.world.map.locations.find((location) => location.type === "city")!;
    session.world.state.x = city.x;
    session.world.state.y = city.y;
    session.world.state.nearbyLocationId = city.id;
    const itemId = session.marketProfile!.offers[0].itemId;
    const priceBefore = session.getBuyPrice(itemId);
    session.factionState.reputation[session.currentFactionId!] = 50;

    expect(session.getBuyPrice(itemId)).toBeLessThan(priceBefore);
  });

  it("advances time through travel but not through standing still", () => {
    const session = new GameSession(515151);
    const initialMinutes = session.timeState.totalMinutes;

    expect(session.timeState.totalMinutes).toBe(initialMinutes);
    session.moveWorld(1, 0, 1);

    expect(session.timeState.totalMinutes).toBeGreaterThan(initialMinutes);
  });

  it("applies terrain speed, visibility and ration pressure while traveling", () => {
    const session = new GameSession(272727);
    const slowSightCell = session.world.map.terrainCells.find(
      (cell) =>
        cell.type === "forest" ||
        cell.type === "darkForest" ||
        cell.type === "swamp" ||
        cell.type === "bog",
    )!;
    session.world.state.x = slowSightCell.x + slowSightCell.size / 2;
    session.world.state.y = slowSightCell.y + slowSightCell.size / 2;
    const baseSpeed = session.partyMovementSpeed;

    session.moveWorld(1, 0, 1);

    expect(["forest", "darkForest", "swamp", "bog"]).toContain(
      session.currentTerrain,
    );
    expect(session.effectiveMovementSpeed).toBeLessThan(baseSpeed);
    expect(session.visibilityRadius).toBeLessThan(520);
    expect(session.survivalState.travelFoodDebt).toBeGreaterThan(0);
  });

  it("slows large, heavily loaded parties", () => {
    const session = new GameSession(616161);
    const unburdenedSpeed = session.partyMovementSpeed;
    session.gold = 1_000;
    session.recruit("village_levy");
    addToInventory(session.inventory, "wood", 20);

    expect(session.cargoWeight).toBe(63);
    expect(session.partyMovementSpeed).toBeLessThan(unburdenedSpeed);
  });

  it("starts with a wooden club and equips hand slot gear", () => {
    const session = new GameSession(242424);
    const baseAttack = session.heroCombatBonuses.heroAtk;
    const baseDefense = session.heroCombatBonuses.heroDef;
    addToInventory(session.inventory, "steel_sword", 1);
    addToInventory(session.inventory, "kite_shield", 1);

    expect(session.rightHandItemId).toBe("wooden_club");
    expect(session.equipItem("steel_sword")).toBe("success");
    expect(session.equipItem("kite_shield")).toBe("success");

    expect(session.rightHandItemId).toBe("steel_sword");
    expect(session.leftHandItemId).toBe("kite_shield");
    expect(inventoryQuantity(session.inventory, "wooden_club")).toBe(1);
    expect(session.heroCombatBonuses.heroAtk).toBeGreaterThan(baseAttack);
    expect(session.heroCombatBonuses.heroDef).toBeGreaterThan(baseDefense);
  });

  it("persists hand slot equipment in city saves", async () => {
    const session = new GameSession(252525);
    addToInventory(session.inventory, "steel_sword", 1);
    addToInventory(session.inventory, "simple_shield", 1);
    session.equipItem("steel_sword");
    session.equipItem("simple_shield");
    let storedSave: SaveGame | null = null;
    const repository: SaveRepository = {
      read: async () => storedSave,
      write: async (save) => {
        storedSave = structuredClone(save);
      },
      delete: async () => {
        storedSave = null;
      },
    };

    expect(await session.save(repository)).toBe(true);
    const restored = new GameSession(1);
    restored.restore(storedSave!);

    expect(restored.rightHandItemId).toBe("steel_sword");
    expect(restored.leftHandItemId).toBe("simple_shield");
  });

  it("writes an Ironman autosave outside cities", async () => {
    const session = new GameSession(262626);
    session.world.state.nearbyLocationId = null;
    let storedSave: SaveGame | null = null;
    const repository: SaveRepository = {
      read: async () => storedSave,
      write: async (save) => { storedSave = structuredClone(save); },
      delete: async () => { storedSave = null; },
    };

    expect(await session.save(repository)).toBe(true);
    expect(storedSave).not.toBeNull();
    expect(storedSave!.player.nearbyLocationId).toBeNull();
  });

  it("does not overwrite an Ironman save from an unhydrated preview session", async () => {
    const session = new GameSession(272626, false);
    let writes = 0;
    const repository: SaveRepository = {
      read: async () => null,
      write: async () => { writes += 1; },
      delete: async () => undefined,
    };

    expect(session.canPersistRun).toBe(false);
    expect(session.canPersistMeta).toBe(false);
    expect(await session.save(repository)).toBe(false);
    expect(writes).toBe(0);

    session.setMetaProgression(null);
    expect(session.canPersistMeta).toBe(true);
  });

  it("applies development grants through the session boundary", () => {
    const session = new GameSession(272627);
    const initialWarbandSize = session.warband.length;

    session.devGrantGold(500);
    session.devGrantSouls(25);
    session.devGrantCharacterXp(100);
    expect(session.devGrantCard("village_levy")).toBe(true);
    const grantedUnit = session.warband.at(-1)!;
    expect(session.devGrantUnitXp(grantedUnit.uid, 150)).toBe(true);

    expect(session.gold).toBe(580);
    expect(session.metaProgression.souls).toBe(25);
    expect(session.characterState.xp).toBeGreaterThanOrEqual(0);
    expect(session.warband).toHaveLength(initialWarbandSize + 1);
    expect(grantedUnit.xp).toBe(150);
    expect(session.metaProgression.ownedUnitIds).toContain("village_levy");
  });

  it("emits soul quest completion only when completed during the active session", async () => {
    const session = new GameSession(272628);
    session.prisoners = [{ cardId: "village_levy", quantity: 3 }];
    session.world.state.nearbyLocationId = session.world.map.locations.find(
      (location) => location.type === "soulTemple",
    )!.id;

    const goldBeforeCompletion = session.gold;
    expect(session.sacrificePrisoner("village_levy", 3)).toBeGreaterThan(0);
    expect(session.soulQuestCompleted).toBe(true);
    expect(session.soulQuestCompletionRevision).toBe(1);
    expect(session.gold).toBe(goldBeforeCompletion + 100);

    let storedSave: SaveGame | null = null;
    const repository: SaveRepository = {
      read: async () => storedSave,
      write: async (save) => { storedSave = structuredClone(save); },
      delete: async () => { storedSave = null; },
    };
    expect(await session.save(repository)).toBe(true);

    const restored = new GameSession(1);
    restored.restore(storedSave!);
    expect(restored.soulQuestCompleted).toBe(true);
    expect(restored.soulQuestCompletionRevision).toBe(0);
  });

  it("persists generated city population, garrison, and prosperity", async () => {
    const session = new GameSession(282828);
    const cityId = Object.keys(session.cityStates)[0];
    session.cityStates[cityId].prosperity = 91;
    let storedSave: SaveGame | null = null;
    const repository: SaveRepository = {
      read: async () => storedSave,
      write: async (save) => { storedSave = structuredClone(save); },
      delete: async () => { storedSave = null; },
    };

    await session.save(repository);
    const restored = new GameSession(1);
    restored.restore(storedSave!);

    expect(restored.cityStates[cityId]).toEqual(session.cityStates[cityId]);
  });

  it("restores an active Ironman battle checkpoint into the same encounter", async () => {
    const session = new GameSession(272727);
    const enemy = session.world.state.enemies[0];
    session.beginBattle(enemy.id);
    let storedSave: SaveGame | null = null;
    const repository: SaveRepository = {
      read: async () => storedSave,
      write: async (save) => { storedSave = structuredClone(save); },
      delete: async () => { storedSave = null; },
    };

    await session.save(repository);
    expect(storedSave!.activeBattle?.enemySpawnId).toBe(enemy.id);

    const restored = new GameSession(1);
    restored.restore(storedSave!);
    expect(restored.mode).toBe("battle");
    expect(restored.battle?.enemy.id).toBe(session.battle?.enemy.id);
  });

  it("uses action time and reduces visibility after dark", () => {
    const session = new GameSession(717171);
    session.gold = 1_000;
    const offer = session.marketProfile!.offers[0];
    const initialMinutes = session.timeState.totalMinutes;

    expect(session.buyItem(offer.itemId)).toBe("success");
    expect(session.timeState.totalMinutes).toBe(initialMinutes + 5);

    const daylightVisibility = session.visibilityRadius;
    session.timeState.totalMinutes = 22 * 60;
    expect(session.visibilityRadius).toBeLessThan(daylightVisibility);
  });

  it("pays weekly wages but still consumes food daily", () => {
    const session = new GameSession(818181);
    session.gold = 1_000;
    session.recruit("village_levy");
    const goldBefore = session.gold;
    const foodBefore = session.rationCount;

    session.advanceTime(16 * 60);

    expect(session.gold).toBe(goldBefore);
    expect(session.rationCount).toBe(foodBefore - 2);
    expect(session.morale).toBe(73);
    expect(session.survivalState.lastUpkeep).toMatchObject({
      day: 2,
      wagesDue: 0,
      wagesPaid: 0,
      foodRequired: 2,
      foodConsumed: 2,
    });

    session.advanceTime(6 * 24 * 60);

    expect(session.gold).toBe(goldBefore - 1);
    expect(session.survivalState.lastUpkeep).toMatchObject({
      day: 8,
      wagesDue: 1,
      wagesPaid: 1,
    });
  });

  it("scales weekly wages by unit tier only", () => {
    const levy = createCardInstance("village_levy");
    const spearman = createCardInstance("levy_spearman");
    const soldier = createCardInstance("soldier");
    const crusader = createCardInstance("crusader");

    spearman.level = 2;
    soldier.level = 3;

    expect(getWeeklyUnitWage(levy)).toBe(1);
    expect(getWeeklyUnitWage(spearman)).toBe(3);
    expect(getWeeklyUnitWage(soldier)).toBe(7);
    expect(getWeeklyUnitWage(crusader)).toBe(14);
  });

  it("naturally regenerates surviving troops while time passes", () => {
    const session = new GameSession(343434);
    session.gold = 1_000;
    session.recruit("village_levy");
    const recruit = session.warband[0];
    recruit.currentHp = 100;

    session.advanceTime(60);

    expect(recruit.currentHp).toBe(104);
  });

  it("waits in fixed simulation steps and preserves fractional recovery", () => {
    const session = new GameSession(343435);
    for (const enemy of session.world.state.enemies) enemy.active = false;
    session.gold = 1_000;
    session.recruit("village_levy");
    const recruit = session.warband[0];
    recruit.currentHp = 100;
    const timeBefore = session.timeState.totalMinutes;

    for (let index = 0; index < 15; index += 1) session.waitWorld(0.1);
    session.stopWaiting();

    expect(session.timeState.totalMinutes).toBeCloseTo(timeBefore + 18);
    expect(recruit.currentHp).toBe(101);
    expect(session.isWaiting).toBe(false);
  });

  it("keeps a wounded battle casualty in the warband at one HP", () => {
    const session = new GameSession(343436);
    session.gold = 1_000;
    session.recruit("village_levy");
    const recruit = session.warband[0];
    session.beginBattle(session.world.state.enemies[0].id);
    if (!session.battle) throw new Error("Expected battle");
    recruit.currentHp = 0;
    session.battle.unitStats.set(recruit.uid, {
      damageDealt: 0,
      hpLost: 900,
      destroyed: true,
      wounded: true,
      kills: 0,
      killXp: 0,
    });
    vi.spyOn(session.battle, "rollReward").mockReturnValue({ gold: 0, cardId: null, items: [] });
    session.battle.outcome = "victory";

    session.claimVictoryReward({ continueDungeon: false, takeCard: false, itemIds: [] });

    expect(session.warband).toContain(recruit);
    expect(recruit.currentHp).toBeGreaterThan(0);
    expect(recruit.currentHp).toBeLessThan(10);
  });

  it("loses morale and travel speed when weekly wages and food are missing", () => {
    const session = new GameSession(919191);
    session.gold = 1_000;
    session.recruit("village_levy");
    session.gold = 0;
    session.inventory = [];
    const speedBefore = session.partyMovementSpeed;

    session.advanceTime(7 * 24 * 60);

    expect(session.morale).toBe(0);
    expect(session.partyMovementSpeed).toBeLessThan(speedBefore);
  });

  it("blocks buying when the inventory would exceed max weight", () => {
    const session = new GameSession(101010);
    session.gold = 10_000;
    addToInventory(session.inventory, "stone", 30);
    const heavyOffer = session.marketProfile!.offers.find(
      (offer) => offer.itemId === "stone",
    );
    if (!heavyOffer) {
      addToInventory(session.economyState.markets[session.world.nearbyLocation!.id], "stone", 1);
    }

    expect(session.cargoWeight).toBeGreaterThan(session.maxCargoWeight);
    expect(session.canBuyItem("stone")).toBe(false);
    expect(session.buyItem("stone")).toBe("tooHeavy");
  });

  it("only claims selected victory spoils", () => {
    const session = new GameSession(202020);
    session.beginBattle(session.world.state.enemies[0].id);
    if (!session.battle) throw new Error("Expected battle");
    vi.spyOn(session.battle, "rollReward").mockReturnValue({
      gold: 7,
      cardId: "ork_rekrut",
      items: [
        { itemId: "iron", quantity: 1 },
        { itemId: "wood", quantity: 1 },
      ],
    });
    session.battle.outcome = "victory";
    const reward = session.prepareVictoryReward();
    if (!reward) throw new Error("Expected reward");

    const goldBefore = session.gold;
    const ironBefore = inventoryQuantity(session.inventory, "iron");
    const woodBefore = inventoryQuantity(session.inventory, "wood");
    const claimed = session.claimVictoryReward({
      continueDungeon: true,
      takeCard: false,
      itemIds: ["iron"],
    });

    expect(claimed?.cardId).toBeNull();
    expect(session.gold).toBeGreaterThanOrEqual(goldBefore + reward.gold);
    expect(inventoryQuantity(session.inventory, "iron")).toBe(ironBefore + 1);
    expect(inventoryQuantity(session.inventory, "wood")).toBe(woodBefore);
  });

  it("takes prisoners and recruits or sells them with tier costs", () => {
    const session = new GameSession(202021);
    session.gold = 1_000;
    session.beginBattle(session.world.state.enemies[0].id);
    if (!session.battle) throw new Error("Expected battle");
    vi.spyOn(session.battle, "rollReward").mockReturnValue({
      gold: 0,
      cardId: "village_levy",
      items: [],
    });
    session.battle.outcome = "victory";
    session.characterState.xp = 100;

    const claimed = session.claimVictoryReward({
      continueDungeon: true,
      takeCard: true,
      itemIds: [],
    });

    expect(claimed?.cardId).toBe("village_levy");
    expect(session.prisonerCount).toBe(1);
    session.characterState.xp = 100;
    const moraleBeforeRecruitment = session.morale;
    expect(session.recruitPrisoner("village_levy")).toBe("success");
    expect(session.gold).toBe(990);
    expect(session.morale).toBe(moraleBeforeRecruitment - 5);
    expect(session.warband).toHaveLength(1);

    session.prisoners = [{ cardId: "village_levy", quantity: 1 }];
    session.world.state.nearbyLocationId = session.world.map.locations.find(
      (location) => location.type === "city",
    )!.id;
    expect(session.sellPrisoner("village_levy")).toBe("success");
    expect(session.gold).toBe(996);
    expect(session.prisonerCount).toBe(0);
  });

  it("claims captured enemies individually when duplicate prisoners are offered", () => {
    const session = new GameSession(202022);
    session.beginBattle(session.world.state.enemies[0].id);
    if (!session.battle) throw new Error("Expected battle");
    vi.spyOn(session.battle, "rollReward").mockReturnValue({
      gold: 0,
      cardId: "village_levy",
      capturedCardIds: ["village_levy", "village_levy", "village_slinger"],
      items: [],
    });
    session.battle.outcome = "victory";

    const claimed = session.claimVictoryReward({
      continueDungeon: true,
      takeCard: true,
      capturedCardIndexes: [1],
      itemIds: [],
    });

    expect(claimed?.capturedCardIds).toEqual(["village_levy"]);
    expect(session.prisoners).toEqual([{ cardId: "village_levy", quantity: 1 }]);
  });

  it("consumes food from partially filled Mount-and-Blade-style stacks", () => {
    const session = new GameSession(929292);
    session.inventory = [];
    addToInventory(session.inventory, "wheat", 1);
    session.warband = Array.from({ length: 5 }, () =>
      createCardInstance("village_levy"),
    );
    session.warband.push(
      ...Array.from({ length: 6 }, () => createCardInstance("village_levy")),
    );

    expect(session.rationCount).toBe(60);
    expect(session.foodCapacity).toBe(60);

    session.advanceTime(16 * 60);

    expect(session.dailyFoodRequirement).toBe(12);
    expect(session.rationCount).toBe(48);
    expect(session.inventory[0]).toMatchObject({
      itemId: "wheat",
      quantity: 1,
      supply: 48,
    });
  });

  it("persists partially consumed food stacks in city saves", async () => {
    const session = new GameSession(939393);
    session.inventory = [];
    addToInventory(session.inventory, "wheat", 1, 48);
    let storedSave: SaveGame | null = null;
    const repository: SaveRepository = {
      read: async () => storedSave,
      write: async (save) => {
        storedSave = structuredClone(save);
      },
      delete: async () => {
        storedSave = null;
      },
    };

    expect(await session.save(repository)).toBe(true);
    const restored = new GameSession(1);
    restored.restore(storedSave!);

    expect(restored.inventory[0]).toMatchObject({
      itemId: "wheat",
      quantity: 1,
      supply: 48,
    });
    expect(restored.rationCount).toBe(48);
    expect(restored.foodCapacity).toBe(60);
  });

  it("lets the player join a nearby NPC warband battle", () => {
    const session = new GameSession(949494);
    session.world.state.x = 1000;
    session.world.state.y = 1000;
    session.world.state.warbands = [
      createSessionWarband("ember_patrol", "ember_crown", 1000, 1000, [
        "soldier",
        "wache",
      ]),
      createSessionWarband("gloam_patrol", "gloam_compact", 1024, 1000, [
        "village_levy",
      ]),
    ];

    session.world.updateWarbands(0.2, session.factionState);
    const battle = session.world.state.warbandBattles[0];

    expect(battle).toBeDefined();
    expect(session.joinWarbandBattle(battle.id, battle.attackerId)).toBe(true);
    expect(session.mode).toBe("battle");
    expect(session.battle?.enemy.deck).toEqual(["village_levy"]);
    expect(session.battle?.playerDeck).toHaveLength(
      session.warband.length + session.world.state.warbands[0].roster.length,
    );
  });

  it("requires a side choice and combines every NPC group in a field battle", () => {
    const session = new GameSession(949495);
    session.world.state.x = 1000;
    session.world.state.y = 1000;
    const lord = createSessionWarband(
      "ember_field_lord",
      "ember_crown",
      1000,
      1000,
      ["soldier", "wache"],
    );
    lord.type = "lord";
    lord.nobleRank = "count";
    const [firstBandits, secondBandits] = session.world.state.enemies;
    firstBandits.active = true;
    firstBandits.roster = [
      createCardInstance("village_levy"),
      createCardInstance("village_slinger"),
    ];
    firstBandits.partySize = firstBandits.roster.length;
    secondBandits.active = true;
    secondBandits.roster = [
      createCardInstance("kobold_jung"),
      createCardInstance("kobold_speer"),
      createCardInstance("kobold_trapper"),
    ];
    secondBandits.partySize = secondBandits.roster.length;
    session.world.state.warbands = [lord];
    session.world.updateWarbands(0, session.factionState);
    session.world.state.warbandBattles = [{
      id: "combined_field_battle",
      attackerId: lord.id,
      defenderId: null,
      enemyId: firstBandits.id,
      sideA: { warbandIds: [lord.id], enemyIds: [] },
      sideB: {
        warbandIds: [],
        enemyIds: [firstBandits.id, secondBandits.id],
      },
      x: 1000,
      y: 1000,
      remainingHours: 6,
      state: "fighting",
      victorId: null,
      playerJoined: false,
    }];

    expect(session.joinWarbandBattle("combined_field_battle")).toBe(false);
    expect(session.pendingWarbandBattleId).toBe("combined_field_battle");
    expect(
      session.getWarbandBattleSideOptions("combined_field_battle")[1],
    ).toMatchObject({
      side: "sideB",
      unitCount:
        firstBandits.roster.length + secondBandits.roster.length,
    });

    expect(
      session.joinWarbandBattle("combined_field_battle", "sideA"),
    ).toBe(true);
    expect(session.battle?.playerDeck).toHaveLength(
      session.warband.length + lord.roster.length,
    );
    expect(
      (session.battle?.enemyDrawPile.length ?? 0) +
        (session.battle?.enemyHand.length ?? 0) +
        (session.battle?.enemyField.length ?? 0),
    ).toBe(firstBandits.roster.length + secondBandits.roster.length);

    session.world.resolveWarbandBattleWithPlayerSide(
      "combined_field_battle",
      "sideA",
    );
    expect(firstBandits.active).toBe(false);
    expect(secondBandits.active).toBe(false);
    expect(lord.state).toBe("patrolling");
  });

  it("persists faction warband AI state in city saves", async () => {
    const session = new GameSession(959595);
    const city = session.world.map.locations.find((location) => location.type === "city")!;
    session.world.state.nearbyLocationId = city.id;
    session.world.state.warbands[0].state = "chasing";
    session.world.state.warbands[0].targetWarbandId = session.world.state.warbands[1].id;
    let storedSave: SaveGame | null = null;
    const repository: SaveRepository = {
      read: async () => storedSave,
      write: async (save) => {
        storedSave = structuredClone(save);
      },
      delete: async () => {
        storedSave = null;
      },
    };

    expect(await session.save(repository)).toBe(true);
    const restored = new GameSession(1);
    restored.restore(storedSave!);

    expect(restored.world.state.warbands[0].state).toBe("chasing");
    expect(restored.world.state.warbands[0].targetWarbandId).toBe(
      session.world.state.warbands[1].id,
    );
  });
});

function createSessionWarband(
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

