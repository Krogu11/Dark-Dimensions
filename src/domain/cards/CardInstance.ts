import { cardsById } from "../../content/content";
import type { CardDefinition } from "../content/schemas";

export interface CardInstance {
  uid: string;
  cardId: string;
  currentHp: number;
  level: number;
  xp: number;
  isHero?: boolean;
}

export function createCardInstance(
  cardId: string,
  options?: { isHero?: boolean },
): CardInstance {
  const definition = getCardDefinition(cardId);
  return {
    uid: crypto.randomUUID(),
    cardId,
    currentHp: definition.maxHp,
    level: 1,
    xp: 0,
    isHero: options?.isHero,
  };
}

export function normalizeCardInstance(card: CardInstance): CardInstance {
  return {
    ...card,
    level: card.level ?? 1,
    xp: card.xp ?? 0,
  };
}

export function getCardDefinition(cardId: string): CardDefinition {
  const definition = cardsById.get(cardId);
  if (!definition) throw new Error(`Unknown card: ${cardId}`);
  return definition;
}

export function createPlayerCard(cardId = "player_wanderer"): CardInstance {
  return createCardInstance(cardId, { isHero: true });
}

export function createCardInstances(cardIds: string[]): CardInstance[] {
  return cardIds.map((cardId) => createCardInstance(cardId));
}

export function xpNeededForNextLevel(level: number): number {
  return 50 + level * 50;
}

export function xpNeededForUnitUpgrade(tier: number): number {
  return 50 + Math.max(1, Math.floor(tier)) * 50;
}

export function awardXp(card: CardInstance, amount: number): boolean {
  const requirement = xpNeededForUnitUpgrade(getCardDefinition(card.cardId).tier);
  const wasReady = card.xp >= requirement;
  card.xp += amount;
  return !wasReady && card.xp >= requirement;
}
