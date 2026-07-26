import { describe, expect, it } from "vitest";
import { calculateBattleExperience } from "./BattleExperience";

describe("battle experience", () => {
  it("rewards defeating more units", () => {
    const singleKill = calculateBattleExperience(["village_levy"], {
      enemyThreat: 1,
    });
    const groupKill = calculateBattleExperience(
      Array.from({ length: 4 }, () => "village_levy"),
      { enemyThreat: 1 },
    );

    expect(singleKill).toMatchObject({
      characterXp: 65,
      defeatedTierTotal: 1,
      defeatedUnits: 1,
      unitXp: 19,
    });
    expect(groupKill).toMatchObject({
      characterXp: 95,
      defeatedTierTotal: 4,
      defeatedUnits: 4,
      unitXp: 31,
    });
  });

  it("rewards a high-tier kill more than a low-tier kill", () => {
    const tierOneKill = calculateBattleExperience(["village_levy"]);
    const tierFiveKill = calculateBattleExperience(["banner_knight"]);

    expect(tierFiveKill.unitXp).toBe(35);
    expect(tierFiveKill.unitXp).toBeGreaterThan(tierOneKill.unitXp);
    expect(tierFiveKill.characterXp).toBeGreaterThan(
      tierOneKill.characterXp,
    );
  });

  it("applies existing dungeon, trainer, and drillmaster bonuses after kill XP", () => {
    expect(
      calculateBattleExperience(["village_levy"], {
        dungeonStage: 2,
        trainerLevel: 1,
        unitXpMultiplier: 1.2,
      }).unitXp,
    ).toBe(68);
  });
});
