import { describe, expect, it } from "vitest";
import { getCardDefinition } from "../cards/CardInstance";
import { GameSession } from "./GameSession";
import { getRecruitmentCost } from "../world/Recruitment";

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
  });
});
