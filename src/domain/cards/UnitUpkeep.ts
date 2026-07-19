import type { CardDefinition } from "../content/schemas";
import type { CardInstance } from "./CardInstance";
import { getCardDefinition } from "./CardInstance";

const MAX_UNIT_TIER = 6;

export function getTierBaseWeeklyWage(tier: number): number {
  const clampedTier = Math.max(1, Math.min(MAX_UNIT_TIER, Math.floor(tier)));
  return [0, 1, 3, 7, 14, 26, 45][clampedTier];
}

export function getWeeklyUnitWage(
  unit: CardInstance,
  definition: CardDefinition = getCardDefinition(unit.cardId),
): number {
  if (unit.isHero) return 0;
  return getTierBaseWeeklyWage(definition.tier);
}

export function getWeeklyRosterWage(units: CardInstance[]): number {
  return units.reduce((total, unit) => total + getWeeklyUnitWage(unit), 0);
}
