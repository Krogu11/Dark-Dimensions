import { describe, expect, it } from "vitest";
import { contentPack } from "../../content/content";
import { cardEffectSchema } from "../content/schemas";
import { describeCardEffect, describeCardEffects, getCardEffects, normalizeLegacyCardEffects } from "./CardEffects";

describe("card effects", () => {
  it("describes the same structured effect that combat executes", () => {
    expect(describeCardEffect({
      trigger: "onSummon",
      action: "heal",
      target: "lowestAlly",
      zone: "fieldAndHand",
      value: 500,
    })).toBe("On summon: heal the most wounded ally on the field or in hand by 500.");
  });

  it.each([
    [{ trigger: "onSummon", action: "draw", value: 4 }, "Draw must be between 1 and 3"],
    [{ trigger: "onSummon", action: "returnToHand", target: "self", value: 50 }, "Return to hand requires On death"],
    [{ trigger: "onAttack", action: "damage", value: 100 }, "This action requires a target"],
    [{ trigger: "onSummon", action: "modifyStat", target: "self", value: 100 }, "Stat modifier requires a stat"],
  ])("rejects an invalid combination", (effect, message) => {
    const parsed = cardEffectSchema.safeParse(effect);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues.map((issue) => issue.message)).toContain(message);
  });

  it("accepts every trigger, action, target, and zone used by the editor", () => {
    const effects = [
      { trigger: "onSummon", action: "heal", target: "lowestAlly", zone: "fieldAndHand", value: 100 },
      { trigger: "onAttack", action: "damage", target: "randomEnemy", value: 100 },
      { trigger: "onAttack", action: "drain", target: "strongestEnemy", value: 100 },
      { trigger: "onSummon", action: "shield", target: "allAllies", value: 100 },
      { trigger: "onSummon", action: "modifyStat", target: "sameRaceAllies", value: 1, stat: "initiative", modifier: "decrease", duration: "battle" },
      { trigger: "onSummon", action: "draw", value: 1 },
      { trigger: "onDeath", action: "returnToHand", target: "self", value: 50, limitPerBattle: 1 },
    ];
    expect(effects.every((effect) => cardEffectSchema.safeParse(effect).success)).toBe(true);
  });

  it("migrates every legacy effect id", () => {
    const legacyIds = [
      "heal_lowest_300", "burn_weakest_300", "shield_self_400", "rally_all_150",
      "human_guard_all_180", "orc_rage_self_250", "kobold_pack_100", "undead_drain_200",
      "beast_pack_120", "human_first_aid_180", "human_brace_160", "human_volley_120",
      "orc_bloodrage_180", "orc_overrun_160", "kobold_trap_140", "undead_reanimate_30",
      "machine_repair_180", "machine_armor_all_140", "elemental_frost_140", "elemental_chain_160",
      "beast_first_strike_140", "beast_hunt_160",
    ];
    for (const battleEffect of legacyIds) {
      const migrated = normalizeLegacyCardEffects({ cards: [{ id: battleEffect, battleEffect }] }) as { cards: Array<{ battleEffect?: string; battleEffects: unknown[] }> };
      expect(migrated.cards[0].battleEffect).toBeUndefined();
      expect(migrated.cards[0].battleEffects).toHaveLength(1);
    }
  });

  it("prefers authored structured effects over a legacy fallback", () => {
    const authored = { trigger: "onSummon", action: "draw", value: 2 } as const;
    expect(getCardEffects({ battleEffects: [authored], battleEffect: "heal_lowest_300" })).toEqual([authored]);
  });

  it("describes both Phoenix abilities as death effects", () => {
    const phoenix = contentPack.cards.find((card) => card.id === "phoenix");
    expect(phoenix).toBeDefined();
    const descriptions = describeCardEffects(phoenix!);
    expect(descriptions).toHaveLength(2);
    expect(descriptions.every((description) => description.startsWith("On death:"))).toBe(true);
    expect(descriptions[0]).toContain("damage to all enemies");
    expect(descriptions[1]).toContain("owner's hand with 50% HP");
    expect(descriptions.join(" ")).not.toContain("On summon");
  });
});
