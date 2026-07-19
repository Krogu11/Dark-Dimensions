import { describe, expect, it } from "vitest";
import type { CityState } from "./Cities";
import { ensureRecruitmentOffers, getRecruitmentCost } from "./Recruitment";
import { getCardDefinition } from "../cards/CardInstance";

function city(overrides: Partial<CityState> = {}): CityState {
  return { locationId: "city_test", population: 4_000, garrison: 180, prosperity: 40, lordId: null, ...overrides };
}

describe("city recruitment", () => {
  it("creates a small deterministic local roster and keeps it until restock", () => {
    const first = city();
    const second = city();
    expect(ensureRecruitmentOffers(first, 4242, 1)).toEqual(ensureRecruitmentOffers(second, 4242, 1));
    expect(first.recruitmentOffers).toHaveLength(2);
    first.recruitmentOffers!.shift();
    expect(ensureRecruitmentOffers(first, 4242, 2)).toHaveLength(1);
    expect(ensureRecruitmentOffers(first, 4242, 5)).toHaveLength(2);
  });

  it("gives prosperous large cities more candidates and charges more for veterans", () => {
    const poorOffers = ensureRecruitmentOffers(city(), 73, 1);
    const richOffers = ensureRecruitmentOffers(city({ population: 18_000, garrison: 850, prosperity: 92 }), 73, 1);
    expect(richOffers.length).toBeGreaterThan(poorOffers.length);
    expect(getRecruitmentCost(getCardDefinition("soldier"))).toBeGreaterThan(getRecruitmentCost(getCardDefinition("village_levy")));
  });
});
