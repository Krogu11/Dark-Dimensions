export interface DailyUpkeepReport {
  day: number;
  wagesDue: number;
  wagesPaid: number;
  foodRequired: number;
  foodConsumed: number;
  moraleChange: number;
}

export interface SurvivalState {
  morale: number;
  lastUpkeep: DailyUpkeepReport | null;
}

export function createSurvivalState(): SurvivalState {
  return {
    morale: 70,
    lastUpkeep: null,
  };
}

export function getDailyWageCost(troopCount: number): number {
  return troopCount * 3;
}

export function getDailyFoodRequirement(troopCount: number): number {
  return 1 + troopCount;
}

export function clampMorale(value: number): number {
  return Math.max(0, Math.min(100, value));
}
