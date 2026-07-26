import { describe, expect, it } from "vitest";
import { getCardDefinition } from "../cards/CardInstance";
import {
  applyNpcAttrition,
  createTierOneNpcRoster,
  getNpcRosterThreatPoints,
  getNpcThreatRatingFromPoints,
  processNpcRecovery,
  resetNpcParty,
  rewardNpcVictory,
  type NpcPartyProgress,
} from "./NpcParty";

function createParty(id = "party_test"): NpcPartyProgress {
  return {
    roster: createTierOneNpcRoster(id, ["village_levy", "soldier"], 5),
    gold: 100,
    rations: 20,
    prisoners: [],
    victories: 0,
    logisticsHours: 0,
  };
}

describe("persistent NPC parties", () => {
  it("derives transparent threat ratings from unit count and squared tiers", () => {
    const tierOneRoster = createTierOneNpcRoster(
      "tier_one_threat",
      ["village_levy"],
      8,
    );

    expect(getNpcRosterThreatPoints(tierOneRoster)).toBe(8);
    expect(getNpcThreatRatingFromPoints(5)).toBe(1);
    expect(getNpcThreatRatingFromPoints(8)).toBe(2);
    expect(getNpcThreatRatingFromPoints(24)).toBe(3);
    expect(getNpcThreatRatingFromPoints(36)).toBe(4);
    expect(getNpcThreatRatingFromPoints(50)).toBe(5);
  });

  it("starts camp and lord reinforcements as real Tier 1 units", () => {
    const roster = createTierOneNpcRoster("kobold_camp", ["kobold_jung", "kobold_trapper"], 6);

    expect(roster).toHaveLength(6);
    expect(roster.every((unit) => getCardDefinition(unit.cardId).tier === 1)).toBe(true);
    expect(new Set(roster.map((unit) => unit.uid)).size).toBe(6);
  });

  it("applies individual casualties and rewards surviving units", () => {
    const winner = createParty("winner");
    const loser = createParty("loser");
    const defeated = applyNpcAttrition(loser, 1, "decisive_battle");
    const goldBefore = winner.gold;

    rewardNpcVictory(winner, defeated, "decisive_battle", 45, 30);

    expect(defeated.length).toBeGreaterThan(0);
    expect(loser.roster.length).toBeLessThan(5);
    expect(winner.victories).toBe(1);
    expect(winner.gold).toBeGreaterThanOrEqual(goldBefore + 30 - 25);
    expect(winner.roster.some((unit) => unit.xp > 0 || getCardDefinition(unit.cardId).tier > 1)).toBe(true);
  });

  it("spends supplies at home, heals wounds and recruits below capacity", () => {
    const party = createParty("recovering");
    party.roster = party.roster.slice(0, 3);
    party.roster[0].currentHp = Math.floor(getCardDefinition(party.roster[0].cardId).maxHp / 2);
    const hpBefore = party.roster[0].currentHp;
    const goldBefore = party.gold;

    processNpcRecovery("recovering", party, ["village_levy"], 6, 24, true);

    expect(party.roster[0].currentHp).toBeGreaterThan(hpBefore);
    expect(party.roster).toHaveLength(4);
    expect(party.gold).toBeLessThan(goldBefore);
    expect(party.rations).toBeLessThan(20);
  });

  it("uses home support to recover a broke and starving NPC party", () => {
    const party = createParty("supported_recovery");
    party.gold = 0;
    party.rations = 0;
    party.roster[0].currentHp = Math.floor(
      getCardDefinition(party.roster[0].cardId).maxHp * 0.25,
    );
    const hpBefore = party.roster[0].currentHp;

    const result = processNpcRecovery(
      "supported_recovery",
      party,
      ["village_levy"],
      party.roster.length,
      24,
      true,
      {
        supportGoldPerDay: party.roster.length * 5,
        supportRationsPerDay: party.roster.length,
      },
    );

    expect(result.healed).toBe(true);
    expect(party.roster[0].currentHp).toBeGreaterThan(hpBefore);
    expect(party.rations).toBe(0);
  });

  it("respawns with a fresh Tier 1 roster and loses prisoners", () => {
    const party = createParty("fallen");
    party.prisoners = [{ cardId: "soldier", quantity: 2 }];
    party.victories = 9;

    resetNpcParty("fallen", party, ["knight", "soldier"], 5);

    expect(party.roster).toHaveLength(5);
    expect(party.roster.every((unit) => getCardDefinition(unit.cardId).tier === 1)).toBe(true);
    expect(party.prisoners).toEqual([]);
    expect(party.victories).toBe(0);
  });

  it("lets camps recruit matching prisoners while faction parties ransom theirs", () => {
    const camp = createParty("orc_camp");
    camp.roster = camp.roster.slice(0, 2);
    camp.prisoners = [{ cardId: "village_levy", quantity: 1 }];
    processNpcRecovery("orc_camp", camp, ["village_levy"], 5, 24, true, {
      prisonerPolicy: "recruit",
    });
    expect(camp.roster).toHaveLength(3);
    expect(camp.prisoners).toEqual([]);

    const lord = createParty("lord");
    lord.prisoners = [{ cardId: "village_levy", quantity: 2 }];
    const goldBefore = lord.gold;
    const result = processNpcRecovery("lord", lord, ["village_levy"], 5, 24, true, {
      prisonerPolicy: "ransom",
    });
    expect(result.ransomed).toBe(2);
    expect(lord.prisoners).toEqual([]);
    expect(lord.gold).toBeGreaterThan(goldBefore - 20);
  });

  it("blocks recruitment when a home settlement has been looted", () => {
    const party = createParty("blocked");
    party.roster = party.roster.slice(0, 2);

    const result = processNpcRecovery("blocked", party, ["village_levy"], 5, 24, true, {
      canRecruit: false,
      prosperity: 10,
    });

    expect(result.recruited).toBe(0);
    expect(party.roster).toHaveLength(2);
  });
});
