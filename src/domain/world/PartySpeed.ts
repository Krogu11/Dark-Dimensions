import { getCardDefinition, type CardInstance } from "../cards/CardInstance";

export type PartySpeedUnit = string | Pick<CardInstance, "cardId" | "currentHp">;

/**
 * Converts average initiative and living formation size into a bounded
 * world-map speed multiplier. Small mobile groups keep an advantage over large
 * armies even when both formations are made from equally fast units.
 */
export function getPartyInitiativeMultiplier(
  units: PartySpeedUnit[],
  fallbackInitiative = 5,
): number {
  const livingUnitCount = units.filter(
    (unit) => typeof unit === "string" || unit.currentHp > 0,
  ).length;
  return (
    getPartyInitiativeBaseMultiplier(
      getPartyAverageInitiative(units, fallbackInitiative),
    ) * getPartySizeMultiplier(livingUnitCount || 1)
  );
}

export function getPartyInitiativeBaseMultiplier(
  averageInitiative: number,
): number {
  return clamp(0.75, 1.45, 0.68 + averageInitiative * 0.07);
}

export function getPartySizeMultiplier(livingUnitCount: number): number {
  const count = Math.max(1, Math.floor(livingUnitCount));
  return clamp(0.82, 1.04, 1.04 - (count - 1) * 0.01);
}

export function getPartyAverageInitiative(
  units: PartySpeedUnit[],
  fallbackInitiative = 5,
): number {
  const living = units.filter((unit) => typeof unit === "string" || unit.currentHp > 0);
  if (!living.length) return fallbackInitiative;
  return living.reduce(
    (sum, unit) => sum + getCardDefinition(typeof unit === "string" ? unit : unit.cardId).initiative,
    0,
  ) / living.length;
}

function clamp(minimum: number, maximum: number, value: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
