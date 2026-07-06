import { describe, expect, it } from "vitest";
import {
  getDailyFoodRequirement,
  getDailyWageCost,
} from "./Survival";

describe("Warband upkeep", () => {
  it("charges wages per troop while the hero also requires food", () => {
    expect(getDailyWageCost(0)).toBe(0);
    expect(getDailyWageCost(5)).toBe(15);
    expect(getDailyFoodRequirement(0)).toBe(1);
    expect(getDailyFoodRequirement(5)).toBe(6);
  });
});
