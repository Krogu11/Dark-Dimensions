import { describe, expect, it } from "vitest";
import {
  getPartyAverageInitiative,
  getPartyInitiativeBaseMultiplier,
  getPartyInitiativeMultiplier,
  getPartySizeMultiplier,
} from "./PartySpeed";

describe("party initiative travel speed", () => {
  it("makes formations with many fast units quicker than slow formations", () => {
    const slow = ["cannon_golem", "cannon_golem", "cannon_golem"];
    const fast = ["dire_wolf", "dire_wolf", "dire_wolf"];

    expect(getPartyAverageInitiative(fast)).toBeGreaterThan(getPartyAverageInitiative(slow));
    expect(getPartyInitiativeMultiplier(fast)).toBeGreaterThan(getPartyInitiativeMultiplier(slow));
  });

  it("uses the whole living formation instead of only its fastest member", () => {
    const slow = getPartyInitiativeMultiplier(["cannon_golem", "cannon_golem", "cannon_golem"]);
    const mixed = getPartyInitiativeMultiplier(["dire_wolf", "cannon_golem", "cannon_golem"]);
    const fast = getPartyInitiativeMultiplier(["dire_wolf", "dire_wolf", "dire_wolf"]);

    expect(mixed).toBeGreaterThan(slow);
    expect(mixed).toBeLessThan(fast);
  });

  it("keeps small fast warbands quicker than large fast warbands", () => {
    const small = getPartyInitiativeMultiplier(["dire_wolf", "dire_wolf", "dire_wolf"]);
    const large = getPartyInitiativeMultiplier(Array.from({ length: 14 }, () => "dire_wolf"));

    expect(getPartySizeMultiplier(3)).toBeGreaterThan(getPartySizeMultiplier(14));
    expect(small).toBeGreaterThan(large);
  });

  it("keeps a fourteen-unit company mobile instead of crushing its speed", () => {
    expect(getPartySizeMultiplier(14)).toBeCloseTo(0.91);
    expect(getPartySizeMultiplier(14)).toBeGreaterThan(0.85);
    expect(getPartyInitiativeBaseMultiplier(5)).toBeCloseTo(1.03);
  });
});
