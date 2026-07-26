import { describe, expect, it, vi } from "vitest";
import {
  createCardInstance,
  getCardDefinition,
} from "../cards/CardInstance";
import { GameSession } from "./GameSession";
import { getRecruitmentCost } from "../world/Recruitment";
import { addToInventory, inventoryQuantity } from "../economy/Economy";
import { getFactionRelation, PLAYER_FACTION_ID } from "../quests/Factions";

function enterFirstVillage(session: GameSession) {
  const village = session.world.map.locations.find((location) => location.type === "village")!;
  session.world.state.nearbyLocationId = village.id;
  session.world.state.x = village.x;
  session.world.state.y = village.y;
  return village;
}

describe("GameSession villages", () => {
  it("recruits limited Tier 1 and Tier 2 volunteers at a village discount", () => {
    const session = new GameSession(31337); enterFirstVillage(session); session.gold = 1_000;
    const offers = session.currentVillageRecruitmentOffers;
    expect(offers.length).toBeGreaterThanOrEqual(1);
    expect(offers.every((id) => getCardDefinition(id).tier <= 2)).toBe(true);
    const selected = offers[0];
    const cityEquivalent = getRecruitmentCost(getCardDefinition(selected));
    expect(session.getVillageRecruitmentCost(selected)).toBeLessThan(cityEquivalent);
    expect(session.recruitFromVillageOffer(selected)).toBe("success");
    expect(session.warband.at(-1)?.cardId).toBe(selected);
  });

  it("allows village help once per week and persists local improvements", () => {
    const session = new GameSession(41414); const village = enterFirstVillage(session); const state = session.getVillageState(village.id)!;
    const before = { relation: state.relation, prosperity: state.prosperity, militia: state.militia };
    expect(session.helpVillage(village.id)).toBe("success");
    expect(session.helpVillage(village.id)).toBe("alreadyHelped");
    expect(state).toMatchObject({ relation: before.relation + 4, prosperity: before.prosperity + 2, militia: before.militia + 3 });
    session.advanceTime(7 * 1440);
    session.world.state.nearbyLocationId = village.id;
    expect(session.helpVillage(village.id)).toBe("success");
  });

  it("starts a militia battle and immediately applies raid reputation penalties", () => {
    const session = new GameSession(51515); const village = enterFirstVillage(session); const state = session.getVillageState(village.id)!;
    const faction = session.factionState.locationFactions[village.id];
    expect(session.startVillageRaid(village.id)).toBe(true);
    expect(session.mode).toBe("battle");
    expect(state.relation).toBe(-50);
    expect(session.factionState.reputation[faction]).toBe(-20);
    expect(session.factionState.wanted[faction]).toBe(40);
  });

  it("removes defeated villager groups and applies village, city, faction, and morale penalties", () => {
    const session = new GameSession(61616);
    const villager = session.economyState.villagers[0];
    const cargoBeforeBattle = structuredClone(villager.inventory);
    const inventoryBeforeBattle = new Map(cargoBeforeBattle.map((entry) => [entry.itemId, inventoryQuantity(session.inventory, entry.itemId)]));
    session.world.state.x = villager.x; session.world.state.y = villager.y;
    session.updateEconomy(0);
    const village = session.getVillageState(villager.originId)!;
    const factionId = session.factionState.locationFactions[villager.originId];
    const origin = session.world.map.locations.find((location) => location.id === villager.originId)!;
    const city = session.world.map.locations.filter((location) => location.type === "city").sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y))[0];
    const before = { relation: village.relation, prosperity: village.prosperity, reputation: session.factionState.reputation[factionId], morale: session.morale, cityProsperity: session.cityStates[city.id].prosperity };
    expect(session.attackNearbyVillager()).toBe(true);
    expect(village.relation).toBe(before.relation - 30);
    expect(session.factionState.reputation[factionId]).toBe(before.reputation - 15);
    expect(session.factionState.wanted[factionId]).toBe(25);
    expect(session.morale).toBe(before.morale - 8);
    expect(session.cityStates[city.id].prosperity).toBe(before.cityProsperity - 2);
    vi.spyOn(session.battle!, "rollReward").mockReturnValue({ gold: 0, cardId: null, items: [] });
    session.battle!.outcome = "victory";
    const visibleReward = session.prepareVictoryReward();
    expect(visibleReward?.items).toEqual(expect.arrayContaining(cargoBeforeBattle));
    session.claimVictoryReward({ continueDungeon: false, takeCard: false, itemIds: [] });
    for (const entry of cargoBeforeBattle) {
      expect(inventoryQuantity(session.inventory, entry.itemId)).toBe(inventoryBeforeBattle.get(entry.itemId));
    }
    expect(session.economyState.villagers.some((candidate) => candidate.id === villager.id)).toBe(false);
    expect(village.prosperity).toBeLessThan(before.prosperity - 6);
    expect(session.world.state.battleSites).toEqual([
      expect.objectContaining({ x: villager.x, y: villager.y, remainingHours: 12 }),
    ]);
    expect(session.getVillageServiceAccess(villager.originId)).toMatchObject({
      market: true,
      recruits: false,
      elder: true,
      help: false,
    });
  });

  it("lets the player attack, loot, and destroy a faction caravan", () => {
    const session = new GameSession(71717);
    const caravan = session.economyState.caravans[0];
    const cargo = structuredClone(caravan.inventory);
    const factionId = caravan.factionId!;
    session.world.state.x = caravan.x;
    session.world.state.y = caravan.y;
    session.updateEconomy(0);

    expect(caravan.unitIds?.every((cardId) => getCardDefinition(cardId).tier >= 2)).toBe(true);
    expect(session.attackNearbyCaravan()).toBe(true);
    expect(session.mode).toBe("battle");
    expect(session.factionState.reputation[factionId]).toBe(-20);
    expect(session.factionState.wanted[factionId]).toBe(35);

    vi.spyOn(session.battle!, "rollReward").mockReturnValue({
      gold: 0,
      cardId: null,
      items: [],
    });
    session.battle!.outcome = "victory";
    expect(session.prepareVictoryReward()?.items).toEqual(expect.arrayContaining(cargo));
    session.claimVictoryReward({
      continueDungeon: false,
      takeCard: false,
      itemIds: cargo.map((entry) => entry.itemId),
    });

    expect(caravan.state).toBe("destroyed");
    expect(caravan.inventory).toHaveLength(0);
    expect(caravan.respawnHoursRemaining).toBeGreaterThan(35);
  });

  it("raises local prices and eventually closes hostile village markets", () => {
    const session = new GameSession(71717);
    const village = enterFirstVillage(session);
    const state = session.getVillageState(village.id)!;
    const factionId = session.factionState.locationFactions[village.id];
    const itemId = session.marketProfile!.offers[0].itemId;
    const friendlyPrice = session.getBuyPrice(itemId);

    state.relation = -30;
    session.factionState.reputation[factionId] = -30;
    expect(session.getBuyPrice(itemId)).toBeGreaterThan(friendlyPrice);
    expect(session.getVillageServiceAccess(village.id).recruits).toBe(false);

    state.relation = -50;
    expect(session.marketProfile).toBeNull();
    expect(session.getVillageServiceAccess(village.id).market).toBe(false);
  });

  it("offers supplies or payment as restitution for village crimes", () => {
    const session = new GameSession(81818);
    const village = enterFirstVillage(session);
    const state = session.getVillageState(village.id)!;
    const factionId = session.factionState.locationFactions[village.id];
    state.relation = -35;
    session.factionState.reputation[factionId] = -25;
    session.factionState.wanted[factionId] = 50;
    const quest = session.getCurrentVillageQuest()!;
    expect(quest.type).toBe("atonement");
    expect(session.acceptVillageQuest(village.id)).toBe(true);
    addToInventory(session.inventory, quest.itemId!, quest.quantity);
    expect(session.completeVillageAtonement(village.id)).toBe(true);
    expect(state.relation).toBe(-17);
    expect(session.factionState.wanted[factionId]).toBe(32);

    session.gold = 1_000;
    const cost = session.getVillageRestitutionCost(village.id);
    expect(cost).toBeGreaterThan(0);
    expect(session.payVillageRestitution(village.id)).toBe(true);
    expect(session.gold).toBe(1_000 - cost);
    expect(session.factionState.wanted[factionId]).toBe(17);
  });

  it("gives lords identities, holdings, relations and useful aid", () => {
    const session = new GameSession(91919);
    const lord = session.world.state.warbands.find(
      (warband) => warband.type === "lord" && warband.homeLocationId && session.cityStates[warband.homeLocationId],
    )!;
    expect(lord.displayName).toMatch(/^(King|Baron|Count) /);
    expect(getCardDefinition(lord.leaderCardId!).portraitImage).toBeTruthy();
    expect(session.cityStates[lord.homeLocationId!].lordId).toBe(lord.id);
    expect(session.getLordDomain(lord.id).length).toBeGreaterThan(0);
    session.world.state.x = lord.x;
    session.world.state.y = lord.y;
    session.gold = 100;
    expect(session.giftLord(lord.id)).toBe(true);
    expect(session.getLordRelation(lord.id)).toBe(8);
    session.factionState.lordRelations[lord.id] = 20;
    session.factionState.reputation[lord.factionId] = 10;
    const rationsBefore = inventoryQuantity(session.inventory, "travel_rations");
    expect(session.requestLordAid(lord.id)).toBe(true);
    expect(inventoryQuantity(session.inventory, "travel_rations")).toBe(rationsBefore + 2);
    expect(session.requestLordAid(lord.id)).toBe(false);
  });

  it("creates one king per faction and assigns cities and village domains by rank", () => {
    const session = new GameSession(92424);
    for (const factionId of ["ember_crown", "gloam_compact", "iron_concord"] as const) {
      const nobles = session.world.state.warbands.filter(
        (warband) => warband.type === "lord" && warband.factionId === factionId,
      );
      expect(nobles.filter((noble) => noble.nobleRank === "king")).toHaveLength(1);
      expect(nobles.some((noble) => noble.nobleRank === "baron")).toBe(true);
      expect(nobles.some((noble) => noble.nobleRank === "count")).toBe(true);
    }
    const cityIds = new Set(session.world.map.locations.filter((location) => location.type === "city").map((location) => location.id));
    for (const city of Object.values(session.cityStates).filter((state) => cityIds.has(state.locationId))) {
      const owner = session.world.getWarband(city.lordId!);
      expect(owner?.nobleRank === "king" || owner?.nobleRank === "baron").toBe(true);
    }
    for (const village of Object.values(session.villageStates)) {
      expect(village.lordId).toBeTruthy();
      expect(session.getLordDomain(village.lordId!).some((holding) => holding.id === village.locationId)).toBe(true);
    }
  });

  it("partitions a faction's settlements into distinct lordly fiefs", () => {
    const session = new GameSession(92929);
    const factionId = session.world.state.warbands.find((warband) => warband.type === "lord")!.factionId;
    const lords = session.world.state.warbands.filter(
      (warband) => warband.type === "lord" && warband.factionId === factionId,
    );
    const factionHoldings = session.world.map.locations.filter(
      (location) =>
        ["city", "village", "castle"].includes(location.type) &&
        session.factionState.locationFactions[location.id] === factionId,
    );
    const assignedIds = lords.flatMap((lord) => session.getLordDomain(lord.id).map((holding) => holding.id));

    expect(new Set(assignedIds).size).toBe(assignedIds.length);
    expect(new Set(assignedIds)).toEqual(new Set(factionHoldings.map((holding) => holding.id)));
  });

  it("activates faction bounty hunters at 25 wanted", () => {
    const session = new GameSession(101010);
    const hunter = session.world.state.warbands.find((warband) => warband.bountyHunter)!;
    hunter.x = session.world.state.x + hunter.allowedRadius + 2_000;
    hunter.y = session.world.state.y;
    hunter.spawnX = hunter.x;
    hunter.spawnY = hunter.y;
    session.factionState.wanted[hunter.factionId] = 25;
    session.world.updateWarbands(0.2, session.factionState);
    expect(hunter.targetPlayer).toBe(true);
    expect(hunter.state).toBe("chasing");
    expect(hunter.bountyHunterDeployed).toBe(true);
    const friendlyCityIds = new Set(
      session.world.map.locations
        .filter(
          (location) =>
            location.type === "city" &&
            session.factionState.locationFactions[location.id] ===
              hunter.factionId,
        )
        .map((location) => location.id),
    );
    expect(friendlyCityIds.has(hunter.homeLocationId ?? "")).toBe(true);
    const homeCity = session.world.map.locations.find(
      (location) => location.id === hunter.homeLocationId,
    )!;
    expect(
      Math.hypot(
        hunter.spawnX - homeCity.x,
        hunter.spawnY - homeCity.y,
      ),
    ).toBeLessThanOrEqual(80);
  });

  it("re-homes stranded bounty hunters at a faction city before they pursue", () => {
    const session = new GameSession(101013);
    const hunter = session.world.state.warbands.find((warband) => warband.bountyHunter)!;
    const edgePosition = {
      x: session.world.map.boundaryInset + 30,
      y: session.world.map.height - session.world.map.boundaryInset - 30,
    };
    hunter.x = edgePosition.x;
    hunter.y = edgePosition.y;
    hunter.spawnX = edgePosition.x;
    hunter.spawnY = edgePosition.y;
    hunter.roster = Array.from({ length: 4 }, () => createCardInstance("village_levy"));
    hunter.unitIds = hunter.roster.map((unit) => unit.cardId);
    hunter.hpRatio = 1;
    hunter.bountyHunterDeployed = true;
    hunter.targetPlayer = true;
    hunter.state = "chasing";
    for (const enemy of session.world.state.enemies) enemy.active = false;
    session.factionState.wanted[hunter.factionId] = 25;

    session.world.updateWarbands(0.2, session.factionState, {
      playerMovementSpeed: 420,
    });

    expect(hunter.homeLocationId).toBeTruthy();
    const home = session.world.map.locations.find(
      (location) => location.id === hunter.homeLocationId,
    )!;
    expect(home.type).toBe("city");
    expect(session.factionState.locationFactions[home.id]).toBe(hunter.factionId);
    expect(
      Math.hypot(hunter.spawnX - home.x, hunter.spawnY - home.y),
    ).toBeLessThanOrEqual(80);
    expect(hunter.targetPlayer).toBe(true);
    expect(hunter.state).toBe("chasing");
  });

  it("returns wounded bounty hunters to their faction city to heal and recruit", () => {
    const session = new GameSession(101014);
    const hunter = session.world.state.warbands.find((warband) => warband.bountyHunter)!;
    session.factionState.wanted[hunter.factionId] = 25;
    session.world.updateWarbands(0.2, session.factionState);
    hunter.roster = hunter.roster.slice(0, 2);
    for (const unit of hunter.roster) {
      unit.currentHp = Math.max(
        1,
        Math.floor(getCardDefinition(unit.cardId).maxHp * 0.25),
      );
    }
    hunter.gold = 1_000;
    hunter.rations = 100;
    hunter.hpRatio = 0.25;
    hunter.x = session.world.state.x + 600;
    hunter.y = session.world.state.y;
    hunter.targetPlayer = true;
    hunter.state = "chasing";

    session.world.updateWarbands(0.2, session.factionState);
    expect(hunter.state).toBe("returning");
    expect(hunter.targetPlayer).toBe(false);
    expect(hunter.targetX).toBe(hunter.spawnX);
    expect(hunter.targetY).toBe(hunter.spawnY);

    hunter.x = hunter.spawnX;
    hunter.y = hunter.spawnY;
    const hpBefore = hunter.roster.reduce((sum, unit) => sum + unit.currentHp, 0);
    const rosterBefore = hunter.roster.length;
    session.world.updateWarbands(24, session.factionState);

    expect(
      hunter.roster.reduce((sum, unit) => sum + unit.currentHp, 0),
    ).toBeGreaterThan(hpBefore);
    expect(hunter.roster.length).toBeGreaterThan(rosterBefore);
  });

  it("recalls defeated bounty hunters and only redeploys them after their cooldown while hostility remains", () => {
    const session = new GameSession(101011);
    const hunter = session.world.state.warbands.find((warband) => warband.bountyHunter)!;
    const factionId = hunter.factionId;
    session.factionState.wanted[factionId] = 25;
    session.world.updateWarbands(0.2, session.factionState);

    session.world.defeatWarband(hunter.id);
    expect(hunter.state).toBe("destroyed");
    expect(hunter.respawnRemainingHours).toBe(72);
    expect(hunter.bountyHunterDeployed).toBe(false);

    session.factionState.wanted[factionId] = 0;
    session.factionState.reputation[factionId] = 0;
    session.world.updateWarbands(73, session.factionState);
    expect(hunter.state).toBe("destroyed");
    expect(hunter.respawnRemainingHours).toBe(0);

    session.factionState.reputation[factionId] = -25;
    session.world.updateWarbands(0.2, session.factionState);
    expect(hunter.state).toBe("chasing");
    expect(hunter.targetPlayer).toBe(true);
    expect(hunter.bountyHunterDeployed).toBe(true);
    expect(hunter.roster.every((unit) => getCardDefinition(unit.cardId).tier === 1)).toBe(true);
  });

  it("lets deployed bounty hunters attack weak roaming enemies before hunting or recovering", () => {
    const session = new GameSession(101012);
    const hunter = session.world.state.warbands.find((warband) => warband.bountyHunter)!;
    session.factionState.wanted[hunter.factionId] = 25;
    session.world.updateWarbands(0.2, session.factionState);
    hunter.roster = Array.from({ length: 6 }, () => createCardInstance("knight"));
    hunter.hpRatio = 1;
    const enemy = session.world.state.enemies.find((candidate) => candidate.active)!;
    enemy.roster = [createCardInstance("village_levy")];
    enemy.partySize = 1;
    enemy.threat = 1;
    enemy.x = hunter.x + 70;
    enemy.y = hunter.y;
    enemy.spawnX = enemy.x;
    enemy.spawnY = enemy.y;
    enemy.activeBattleId = null;
    enemy.sourceLocationId = undefined;

    session.world.updateWarbands(0.2, session.factionState);
    expect(hunter.targetPlayer).toBe(false);
    expect(hunter.targetEnemyId).toBe(enemy.id);

    const experienceBefore = hunter.experience;
    session.world.updateWarbands(3.1, session.factionState);
    session.world.updateWarbands(3.1, session.factionState);
    expect(hunter.experience).toBeGreaterThan(experienceBefore);
    expect(hunter.victories).toBeGreaterThan(0);
    if (hunter.hpRatio < 0.34) {
      expect(hunter.state).toBe("returning");
      expect(hunter.targetPlayer).toBe(false);
    } else {
      expect(hunter.targetPlayer || Boolean(hunter.targetEnemyId)).toBe(true);
    }
  });

  it("orders faction lords to hunt the player at the second-villager threshold", () => {
    const session = new GameSession(111111);
    const lord = session.world.state.warbands.find((warband) => warband.type === "lord")!;
    lord.x = session.world.state.x + 120;
    lord.y = session.world.state.y;
    lord.spawnX = lord.x;
    lord.spawnY = lord.y;
    session.factionState.wanted[lord.factionId] = 50;

    session.world.updateWarbands(0.2, session.factionState);

    expect(lord.targetPlayer).toBe(true);
    expect(lord.state).toBe("chasing");
  });

  it("declares faction war when the player attacks a lord", () => {
    const session = new GameSession(121212);
    const lord = session.world.state.warbands.find((warband) => warband.type === "lord")!;
    session.world.state.x = lord.x;
    session.world.state.y = lord.y;

    expect(session.challengeWarband(lord.id)).toBe(true);

    expect(session.mode).toBe("battle");
    expect(session.factionState.atWar[lord.factionId]).toBe(true);
    expect(session.factionState.wanted[lord.factionId]).toBeGreaterThanOrEqual(60);
    expect(session.factionState.reputation[lord.factionId]).toBeLessThanOrEqual(-60);
    expect(getFactionRelation(PLAYER_FACTION_ID, lord.factionId, session.factionState)).toBe("hostile");
  });

  it("allows a nearby lord to negotiate peace for a substantial payment", () => {
    const session = new GameSession(131313);
    const lord = session.world.state.warbands.find((warband) => warband.type === "lord")!;
    session.world.state.x = lord.x;
    session.world.state.y = lord.y;
    session.declareWarOnFaction(lord.factionId);
    session.gold = 1_000;
    const peaceCost = session.getFactionBountyPayment(lord.factionId);

    expect(peaceCost).toBeGreaterThanOrEqual(300);
    expect(session.settleBountyWithLord(lord.id)).toBe(true);
    expect(session.gold).toBe(1_000 - peaceCost);
    expect(session.factionState.atWar[lord.factionId]).toBe(false);
    expect(session.factionState.wanted[lord.factionId]).toBe(0);
  });
});
