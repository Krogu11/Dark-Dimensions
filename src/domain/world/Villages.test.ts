import { describe, expect, it } from "vitest";
import { contentPack } from "../../content/content";
import { getCardDefinition } from "../cards/CardInstance";
import { generateWorldMap } from "./WorldGenerator";
import { createVillageStates, ensureVillageQuest, ensureVillageRecruitmentOffers, normalizeVillageStates } from "./Villages";

describe("village settlements", () => {
  const map = generateWorldMap(424242, contentPack.enemies);

  it("creates persistent economic and defensive data for every village", () => {
    const states = createVillageStates(424242, map);
    const villages = map.locations.filter((location) => location.type === "village");
    expect(Object.keys(states)).toHaveLength(villages.length);
    for (const state of Object.values(states)) {
      expect(state.population).toBeGreaterThan(0);
      expect(state.militia).toBeGreaterThan(0);
      expect(state.productionItemId).toBeTruthy();
      expect(map.locations.some((location) => location.id === state.linkedCityId && location.type === "city")).toBe(true);
    }
  });

  it("offers only one to three Tier 1 or Tier 2 human recruits per week", () => {
    const village = Object.values(createVillageStates(424242, map))[0];
    const offers = ensureVillageRecruitmentOffers(village, 424242, 1);
    expect(offers.length).toBeGreaterThanOrEqual(1);
    expect(offers.length).toBeLessThanOrEqual(3);
    expect(offers.every((id) => { const card = getCardDefinition(id); return card.race === "human" && card.tier <= 2; })).toBe(true);
    expect(ensureVillageRecruitmentOffers(village, 424242, 2)).toEqual(offers);
  });

  it("persists village damage and rotates elder tasks weekly", () => {
    const original = Object.values(createVillageStates(424242, map))[0];
    original.prosperity = 7; original.condition = "looted"; original.relation = -50;
    const restored = normalizeVillageStates({ [original.locationId]: original }, 424242, map)[original.locationId];
    expect(restored).toMatchObject({ prosperity: 7, condition: "looted", relation: -50 });
    expect(ensureVillageQuest(restored, 424242, 1).week).toBe(1);
    expect(ensureVillageQuest(restored, 424242, 8).week).toBe(2);
  });
});
