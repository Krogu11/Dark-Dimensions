import { describe, expect, it } from "vitest";
import { getDailyFoodRequirement } from "./Survival";

describe("Warband upkeep", () => {
  it("feeds the hero and every roster unit daily", () => {
    expect(getDailyFoodRequirement(0)).toBe(1);
    expect(getDailyFoodRequirement(5)).toBe(6);
  });
});
