import { describe, expect, it } from "vitest";
import { BattleTurn } from "./BattleTurn";

describe("BattleTurn", () => {
  it("allows exactly three summons", () => {
    const turn = new BattleTurn();

    turn.summon();
    turn.summon();
    turn.summon();

    expect(turn.summonsRemaining).toBe(0);
    expect(() => turn.summon()).toThrow("No summons remaining");
  });
});
