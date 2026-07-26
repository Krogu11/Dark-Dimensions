import { getCardDefinition } from "../cards/CardInstance";

export interface BattleExperienceContext {
  dungeonStage?: number;
  enemyThreat?: number;
  trainerLevel?: number;
  unitXpMultiplier?: number;
}

export interface BattleExperienceReward {
  characterXp: number;
  defeatedTierTotal: number;
  defeatedUnits: number;
  highestKillBonusXp: number;
  unitXp: number;
}

export function getBattleKillXp(cardId: string): number {
  const tier = Math.max(1, getCardDefinition(cardId).tier);
  return 8 + tier * 2 + (tier - 1) ** 2 * 2;
}

/**
 * Calculates the XP earned from units that were actually defeated in battle.
 * The quadratic tier term keeps elite kills valuable without making large
 * groups of low-tier enemies irrelevant.
 */
export function calculateBattleExperience(
  defeatedCardIds: string[],
  context: BattleExperienceContext = {},
): BattleExperienceReward {
  const defeatedTiers = defeatedCardIds.map((cardId) =>
    Math.max(1, getCardDefinition(cardId).tier),
  );
  const killXp = defeatedCardIds.reduce(
    (total, cardId) => total + getBattleKillXp(cardId),
    0,
  );
  const dungeonStage = Math.max(0, context.dungeonStage ?? 0);
  const trainerLevel = Math.max(0, context.trainerLevel ?? 0);
  const enemyThreat = Math.max(0, context.enemyThreat ?? 0);
  const unitXpMultiplier = Math.max(0, context.unitXpMultiplier ?? 1);

  return {
    characterXp: 40 + killXp + enemyThreat * 15,
    defeatedTierTotal: defeatedTiers.reduce((total, tier) => total + tier, 0),
    defeatedUnits: defeatedTiers.length,
    highestKillBonusXp: 0,
    unitXp: Math.round(
      (
        15 +
        Math.round(killXp * 0.4) +
        dungeonStage * 15 +
        trainerLevel * 8
      ) * unitXpMultiplier,
    ),
  };
}
