import { describe, expect, it } from "vitest";
import { contentPack, enemiesById } from "../../content/content";
import {
  createCardInstance,
  getCardDefinition,
} from "../cards/CardInstance";
import { addToInventory, inventoryQuantity } from "../economy/Economy";
import type {
  SaveGame,
  SaveRepository,
} from "../../infrastructure/save/SaveRepository";
import { BattleSimulation } from "../battle/BattleSimulation";
import { GameSession } from "./GameSession";

describe("GameSession roster", () => {
  it("starts with only the immortal hero", () => {
    const session = new GameSession();

    expect(session.warband).toHaveLength(0);
    expect(session.reserve).toHaveLength(0);
    expect(session.hero.isHero).toBe(true);
  });

  it("recruits humans into reserve and selects five active units", () => {
    const session = new GameSession();
    session.gold = 1_000;

    for (let index = 0; index < 6; index += 1) {
      expect(session.recruit("village_levy")).toBe("success");
    }
    for (const card of [...session.reserve].slice(0, 5)) {
      expect(session.moveToWarband(card.uid)).toBe("success");
    }

    expect(session.warband).toHaveLength(5);
    expect(session.reserve).toHaveLength(1);
    expect(session.moveToWarband(session.reserve[0].uid)).toBe("capacityFull");
  });

  it("upgrades an experienced recruit through a selected branch", () => {
    const session = new GameSession();
    session.recruit("village_levy");
    const recruit = session.reserve[0];
    recruit.level = 2;

    expect(session.upgradeUnit(recruit.uid, "levy_spearman")).toBe("success");
    expect(recruit.cardId).toBe("levy_spearman");
    recruit.level = 3;

    expect(session.upgradeUnit(recruit.uid, "soldier")).toBe("success");
    expect(recruit.cardId).toBe("soldier");
    expect(recruit.level).toBe(1);
    expect(recruit.currentHp).toBe(getCardDefinition("soldier").maxHp);
  });

  it("allows roster changes away from cities", () => {
    const session = new GameSession();
    session.recruit("village_levy");
    const recruit = session.reserve[0];
    session.world.move(1, 0, 2);

    expect(session.isInCity).toBe(false);
    expect(session.recruit("village_levy")).toBe("notInCity");
    expect(session.moveToWarband(recruit.uid)).toBe("success");
  });

  it("awards battle XP only to deployed survivors and restores the hero", () => {
    const session = new GameSession();
    session.recruit("village_levy");
    const recruit = session.reserve[0];
    session.moveToWarband(recruit.uid);
    session.beginBattle(session.world.state.enemies[0].id);
    session.battle!.deployedUnitUids.add(recruit.uid);
    session.battle!.outcome = "victory";
    session.hero.currentHp = 0;

    session.finishVictory();

    expect(recruit.xp).toBe(60);
    expect(session.hero.currentHp).toBe(
      getCardDefinition(session.hero.cardId).maxHp,
    );
  });

  it("continues a dungeon through three persistent battle stages", () => {
    const session = new GameSession(12345);
    const dungeon = session.world.map.locations.find(
      (location) => location.type === "dungeon",
    )!;
    session.world.state.nearbyLocationId = dungeon.id;

    expect(session.enterDungeon(dungeon.id)).toBe(true);
    expect(session.dungeonRun).toMatchObject({ stage: 1, totalStages: 3 });

    session.hero.currentHp = 1200;
    session.battle!.outcome = "victory";
    session.finishVictory(true);
    expect(session.dungeonRun?.stage).toBe(2);
    expect(session.hero.currentHp).toBe(1200);

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

    const castle = session.world.map.locations.find(
      (location) => location.type === "castle",
    )!;
    session.world.state.nearbyLocationId = castle.id;
    expect(session.challengeCastle(castle.id)).toBe(true);
    expect(session.battleContext).toBe("castle");
    expect(session.mode).toBe("battle");
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
    session.buyItem(offer.itemId);
    session.updateEconomy(12);
    let storedSave: SaveGame | null = null;
    const repository: SaveRepository = {
      read: async () => storedSave,
      write: async (save) => {
        storedSave = structuredClone(save);
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
  });

  it("uses consumables and applies equipped hero bonuses in combat", () => {
    const session = new GameSession(445566);
    session.recruit("village_levy");
    const recruit = session.reserve[0];
    recruit.currentHp = 200;
    addToInventory(session.inventory, "healing_poultice", 1);
    addToInventory(session.inventory, "iron_talisman", 1);

    expect(session.useItem("healing_poultice")).toBe("success");
    expect(recruit.currentHp).toBe(500);
    expect(session.equipItem("iron_talisman")).toBe("success");
    session.beginBattle(session.world.state.enemies[0].id);

    expect(session.battle!.getAttack(session.hero)).toBe(
      getCardDefinition(session.hero.cardId).atk + 100,
    );
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
    session.acceptQuest(quest.id);
    const caravan = session.economyState.caravans.find(
      (candidate) => candidate.id === quest.caravanId,
    )!;
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

  it("slows large, heavily loaded parties", () => {
    const session = new GameSession(616161);
    const unburdenedSpeed = session.partyMovementSpeed;
    session.gold = 1_000;
    session.recruit("village_levy");
    addToInventory(session.inventory, "wood", 20);

    expect(session.cargoWeight).toBe(61);
    expect(session.partyMovementSpeed).toBeLessThan(unburdenedSpeed);
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

  it("pays daily wages, consumes food, and rewards supplied troops", () => {
    const session = new GameSession(818181);
    session.gold = 1_000;
    session.recruit("village_levy");
    const goldBefore = session.gold;
    const foodBefore = session.rationCount;

    session.advanceTime(16 * 60);

    expect(session.gold).toBe(goldBefore - 3);
    expect(session.rationCount).toBe(foodBefore - 2);
    expect(session.morale).toBe(75);
    expect(session.survivalState.lastUpkeep).toMatchObject({
      day: 2,
      wagesDue: 3,
      wagesPaid: 3,
      foodRequired: 2,
      foodConsumed: 2,
    });
  });

  it("loses morale and travel speed when wages and food are missing", () => {
    const session = new GameSession(919191);
    session.gold = 1_000;
    session.recruit("village_levy");
    session.gold = 0;
    session.inventory = [];
    const speedBefore = session.partyMovementSpeed;

    session.advanceTime(16 * 60);

    expect(session.morale).toBe(28);
    expect(session.partyMovementSpeed).toBeLessThan(speedBefore);
  });

  it("consumes food from partially filled Mount-and-Blade-style stacks", () => {
    const session = new GameSession(929292);
    session.inventory = [];
    addToInventory(session.inventory, "wheat", 1);
    session.warband = Array.from({ length: 5 }, () =>
      createCardInstance("village_levy"),
    );
    session.reserve = Array.from({ length: 6 }, () =>
      createCardInstance("village_levy"),
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
});
