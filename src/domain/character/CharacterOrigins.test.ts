import { describe, expect, it } from "vitest";
import { createCharacterState } from "./CharacterProgression";
import { applyChoiceBonuses, getRunChoices, type RunProfile } from "./CharacterOrigins";

const profile: RunProfile = {
  name: "Mara",
  raceId: "human",
  originId: "cityWard",
  upbringingId: "artisan",
  turningPointId: "survivor",
  portraitId: "wanderer",
  startedAt: "2026-07-19T00:00:00.000Z",
};

describe("character origin choices", () => {
  it("combines authored starting bonuses without granting level-up points", () => {
    const state = createCharacterState();
    applyChoiceBonuses(state, profile);

    expect(state.attributes.charisma).toBe(2);
    expect(state.skills.trade).toBe(1);
    expect(state.skills.weaponMaster).toBe(1);
    expect(state.skills.ironflesh).toBe(1);
    expect(state.attributePoints).toBe(0);
    expect(state.skillPoints).toBe(0);
  });

  it("collects equipment, gold, and item effects from every life choice", () => {
    const choices = getRunChoices(profile);

    expect(choices.reduce((total, choice) => total + (choice.goldBonus ?? 0), 0)).toBe(85);
    expect(choices.flatMap((choice) => choice.items ?? [])).toContainEqual({
      itemId: "travel_rations",
      quantity: 1,
    });
  });
});
