import { contentPack } from "../../content/content";
import type { ItemDefinition } from "../content/schemas";

export interface EquipmentDropOptions {
  chanceMultiplier: number;
  chanceBonus: number;
  random?: () => number;
}

export function getEquipmentDropPool(tier: number): ItemDefinition[] {
  return contentPack.items.filter(
    (item) =>
      item.type === "equipment" &&
      item.tier === tier &&
      typeof item.dropChance === "number" &&
      item.dropChance > 0,
  );
}

export function getEffectiveEquipmentDropChance(
  item: ItemDefinition,
  options: Pick<EquipmentDropOptions, "chanceMultiplier" | "chanceBonus">,
): number {
  const baseChance = item.dropChance ?? 0;
  return Math.min(0.5, baseChance * options.chanceMultiplier * (1 + options.chanceBonus));
}

export function rollEquipmentDrops(
  tier: number,
  options: EquipmentDropOptions,
): Array<{ itemId: string; quantity: number }> {
  const random = options.random ?? Math.random;
  return getEquipmentDropPool(tier)
    .filter((item) => random() <= getEffectiveEquipmentDropChance(item, options))
    .map((item) => ({ itemId: item.id, quantity: 1 }));
}
