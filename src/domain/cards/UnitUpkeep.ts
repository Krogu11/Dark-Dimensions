import type { CardDefinition } from "../content/schemas";
import type { CardInstance } from "./CardInstance";
import { getCardDefinition } from "./CardInstance";

const MAX_UNIT_TIER = 6;

export function getTierBaseWeeklyWage(tier: number): number {
  let baseWage = 1;
  const clampedTier = Math.max(1, Math.min(MAX_UNIT_TIER, Math.floor(tier)));
  for (let currentTier = 1; currentTier < clampedTier; currentTier += 1) {
    const maxWageAtCurrentTier = baseWage + currentTier - 1;
    baseWage = maxWageAtCurrentTier * 2;
  }
  return baseWage;
}

export function getWeeklyUnitWage(
  unit: CardInstance,
  definition: CardDefinition = getCardDefinition(unit.cardId),
): number {
  if (unit.isHero) return 0;
  return getTierBaseWeeklyWage(definition.tier) + Math.max(0, unit.level - 1);
}

export function getWeeklyRosterWage(units: CardInstance[]): number {
  return units.reduce((total, unit) => total + getWeeklyUnitWage(unit), 0);
}
