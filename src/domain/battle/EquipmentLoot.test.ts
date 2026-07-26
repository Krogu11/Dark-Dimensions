import { describe, expect, it } from "vitest";
import { contentPack } from "../../content/content";
import {
  getEffectiveEquipmentDropChance,
  getEquipmentDropPool,
  rollEquipmentDrops,
} from "./EquipmentLoot";

describe("tiered equipment loot", () => {
  it("offers a populated equipment pool for every enemy tier", () => {
    for (let tier = 1; tier <= 5; tier += 1) {
      const pool = getEquipmentDropPool(tier);
      expect(pool.length, `Tier ${tier}`).toBeGreaterThanOrEqual(7);
      expect(pool.every((item) => item.type === "equipment" && item.tier === tier)).toBe(true);
    }
  });

  it("never rolls equipment from another enemy tier", () => {
    for (let tier = 1; tier <= 5; tier += 1) {
      const drops = rollEquipmentDrops(tier, {
        chanceMultiplier: 1,
        chanceBonus: 0,
        random: () => 0,
      });
      const expectedIds = new Set(getEquipmentDropPool(tier).map((item) => item.id));
      expect(drops.length).toBe(expectedIds.size);
      expect(drops.every((drop) => expectedIds.has(drop.itemId))).toBe(true);
    }
  });

  it("keeps legendary equipment substantially rarer than common equipment", () => {
    const equipment = contentPack.items.filter((item) => item.type === "equipment");
    const common = equipment.filter((item) => item.rarity === "common");
    const legendary = equipment.filter((item) => item.rarity === "legendary");
    expect(common.length).toBeGreaterThan(0);
    expect(legendary.length).toBeGreaterThan(0);
    expect(Math.max(...legendary.map((item) => item.dropChance ?? 0))).toBeLessThan(
      Math.min(...common.map((item) => item.dropChance ?? 0)),
    );
  });

  it("applies loot bonuses proportionally without turning rare gear into guaranteed fallback loot", () => {
    const soulstone = contentPack.items.find((item) => item.id === "soulstone")!;
    expect(getEffectiveEquipmentDropChance(soulstone, {
      chanceMultiplier: 1.8,
      chanceBonus: 0.2,
    })).toBeCloseTo(0.01296);
    expect(rollEquipmentDrops(5, {
      chanceMultiplier: 1.8,
      chanceBonus: 0.2,
      random: () => 1,
    })).toEqual([]);
  });
});
