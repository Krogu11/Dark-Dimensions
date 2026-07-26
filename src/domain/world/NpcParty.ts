import { contentPack, upgradesByCardId } from "../../content/content";
import {
  awardXp,
  getCardDefinition,
  xpNeededForUnitUpgrade,
  type CardInstance,
} from "../cards/CardInstance";

export interface NpcPrisonerStack {
  cardId: string;
  quantity: number;
}

export interface NpcPartyProgress {
  roster: CardInstance[];
  gold: number;
  rations: number;
  prisoners: NpcPrisonerStack[];
  victories: number;
  logisticsHours: number;
}

export type NpcPrisonerPolicy = "recruit" | "ransom" | "hold";
export type NpcActivity =
  | "idle"
  | "patrolling"
  | "hunting"
  | "huntingPlayer"
  | "fighting"
  | "retreating"
  | "recovering"
  | "recruiting"
  | "raiding";

export interface NpcRecoveryOptions {
  prosperity?: number;
  canRecruit?: boolean;
  prisonerPolicy?: NpcPrisonerPolicy;
  supportGoldPerDay?: number;
  supportRationsPerDay?: number;
}

export interface NpcRecoveryResult {
  healed: boolean;
  recruited: number;
  ransomed: number;
}

export interface NpcPrisonerSettlementResult {
  recruited: number;
  ransomed: number;
  gold: number;
}

export function createTierOneNpcRoster(
  partyId: string,
  sourceCardIds: string[],
  count: number,
): CardInstance[] {
  const races = new Set(
    sourceCardIds
      .map((cardId) => contentPack.cards.find((card) => card.id === cardId)?.race)
      .filter((race): race is string => Boolean(race)),
  );
  const candidates = contentPack.cards.filter(
    (card) => card.tier === 1 && races.has(card.race) && !card.id.startsWith("player_"),
  );
  const fallback = contentPack.cards.filter(
    (card) => card.tier === 1 && !card.id.startsWith("player_"),
  );
  const pool = candidates.length > 0 ? candidates : fallback;
  return Array.from({ length: Math.max(1, count) }, (_, index) => {
    const definition = pool[stableHash(`${partyId}:starter:${index}`) % pool.length];
    return {
      uid: `${partyId}:npc:${index}:0`,
      cardId: definition.id,
      currentHp: definition.maxHp,
      level: 1,
      xp: 0,
    };
  });
}

export function normalizeNpcRoster(
  partyId: string,
  saved: CardInstance[] | undefined,
  sourceCardIds: string[],
  count: number,
): CardInstance[] {
  const valid = (saved ?? []).filter((unit) =>
    contentPack.cards.some((card) => card.id === unit.cardId),
  );
  if (valid.length > 0) {
    return valid.map((unit, index) => {
      const definition = getCardDefinition(unit.cardId);
      return {
        ...unit,
        uid: unit.uid || `${partyId}:npc:${index}:legacy`,
        currentHp: Math.max(1, Math.min(definition.maxHp, unit.currentHp ?? definition.maxHp)),
        level: Math.max(1, unit.level ?? 1),
        xp: Math.max(0, unit.xp ?? 0),
      };
    });
  }
  return createTierOneNpcRoster(partyId, sourceCardIds, count);
}

export function estimateNpcRosterStrength(roster: CardInstance[]): number {
  return roster.reduce((total, unit) => {
    const definition = getCardDefinition(unit.cardId);
    const health = Math.max(0, Math.min(1, unit.currentHp / definition.maxHp));
    const levelMultiplier = 1 + Math.max(0, unit.level - 1) * 0.08;
    const tierMultiplier = 1 + Math.max(0, definition.tier - 1) * 0.18;
    return total +
      (definition.atk * 1.05 + definition.def * 0.85 + definition.maxHp * 0.42) *
      levelMultiplier * tierMultiplier * (0.25 + health * 0.75);
  }, 0);
}

export function getUnitThreatPoints(cardId: string): number {
  const tier = Math.max(1, getCardDefinition(cardId).tier);
  return tier * tier;
}

export function getNpcRosterThreatPoints(roster: CardInstance[]): number {
  return roster.reduce(
    (total, unit) => total + getUnitThreatPoints(unit.cardId),
    0,
  );
}

export function getNpcThreatRatingFromPoints(points: number): number {
  if (points <= 5) return 1;
  if (points <= 12) return 2;
  if (points <= 24) return 3;
  if (points <= 44) return 4;
  return 5;
}

export function npcRosterHpRatio(roster: CardInstance[]): number {
  const maximum = roster.reduce((sum, unit) => sum + getCardDefinition(unit.cardId).maxHp, 0);
  if (maximum <= 0) return 0;
  return roster.reduce((sum, unit) => sum + unit.currentHp, 0) / maximum;
}

export function applyNpcAttrition(
  party: NpcPartyProgress,
  damageRatio: number,
  seed: string,
): CardInstance[] {
  const defeated: CardInstance[] = [];
  const ordered = [...party.roster].sort(
    (left, right) => stableHash(`${seed}:${left.uid}`) - stableHash(`${seed}:${right.uid}`),
  );
  for (const [index, unit] of ordered.entries()) {
    const definition = getCardDefinition(unit.cardId);
    const variation = 0.78 + (stableHash(`${seed}:damage:${unit.uid}`) % 45) / 100;
    const damage = Math.round(definition.maxHp * damageRatio * variation * (index < ordered.length / 3 ? 1.12 : 0.92));
    unit.currentHp = Math.max(0, unit.currentHp - damage);
    if (unit.currentHp <= 0) defeated.push(unit);
  }
  party.roster = party.roster.filter((unit) => unit.currentHp > 0);
  return defeated;
}

export function rewardNpcVictory(
  party: NpcPartyProgress,
  defeated: CardInstance[],
  seed: string,
  xp: number,
  gold: number,
): void {
  party.victories += 1;
  party.gold += Math.max(0, gold);
  party.rations += Math.max(1, Math.ceil(defeated.length / 2));
  for (const unit of party.roster) {
    awardXp(unit, xp);
    promoteNpcUnit(unit, seed, party);
  }
  const capturable = defeated.find((unit) => stableHash(`${seed}:capture:${unit.uid}`) % 100 < 34);
  if (capturable) {
    const existing = party.prisoners.find((entry) => entry.cardId === capturable.cardId);
    if (existing) existing.quantity += 1;
    else party.prisoners.push({ cardId: capturable.cardId, quantity: 1 });
  }
}

export function processNpcRecovery(
  partyId: string,
  party: NpcPartyProgress,
  sourceCardIds: string[],
  capacity: number,
  deltaHours: number,
  atHome: boolean,
  options: NpcRecoveryOptions = {},
): NpcRecoveryResult {
  const result: NpcRecoveryResult = { healed: false, recruited: 0, ransomed: 0 };
  if (party.roster.length === 0) return result;
  const prosperity = Math.max(0, Math.min(100, options.prosperity ?? 50));
  const canRecruit = options.canRecruit ?? true;
  const prisonerPolicy = options.prisonerPolicy ?? "hold";
  party.logisticsHours += deltaHours;
  while (party.logisticsHours >= 24) {
    party.logisticsHours -= 24;
    const requiredRations = Math.max(1, party.roster.length);
    const needsSupport =
      party.roster.length < capacity ||
      party.rations < requiredRations ||
      party.roster.some(
        (unit) => unit.currentHp < getCardDefinition(unit.cardId).maxHp,
      );
    if (atHome && needsSupport) {
      party.gold += Math.max(
        0,
        Math.floor(options.supportGoldPerDay ?? 0),
      );
      party.rations += Math.max(
        0,
        Math.floor(options.supportRationsPerDay ?? 0),
      );
    }
    if (atHome && party.rations < requiredRations && party.gold > 0) {
      const bought = Math.min(requiredRations - party.rations, party.gold);
      party.gold -= bought;
      party.rations += bought;
    }
    const consumed = Math.min(party.rations, requiredRations);
    party.rations -= consumed;
    if (consumed < requiredRations) {
      for (const unit of party.roster) {
        unit.currentHp = Math.max(1, Math.floor(unit.currentHp * 0.96));
      }
    }
    if (atHome && prisonerPolicy === "ransom" && party.prisoners.length > 0) {
      const ransom = party.prisoners.reduce((sum, stack) => {
        const tier = getCardDefinition(stack.cardId).tier;
        return sum + stack.quantity * (4 + tier * 3);
      }, 0);
      result.ransomed += party.prisoners.reduce((sum, stack) => sum + stack.quantity, 0);
      party.gold += ransom;
      party.prisoners = [];
    }
    if (atHome && canRecruit && party.roster.length < capacity) {
      const recruitedPrisoner = prisonerPolicy === "recruit"
        ? recruitMatchingPrisoner(partyId, party, sourceCardIds)
        : false;
      if (recruitedPrisoner) {
        result.recruited += 1;
      } else {
        const recruitmentCost = Math.max(6, 13 - Math.floor(prosperity / 15));
        if (party.gold >= recruitmentCost) {
          const recruit = createTierOneNpcRoster(
            `${partyId}:recruit:${party.victories}:${party.roster.length}`,
            sourceCardIds,
            1,
          )[0];
          party.gold -= recruitmentCost;
          party.roster.push(recruit);
          result.recruited += 1;
        }
      }
    }
    if (atHome) for (const unit of party.roster) promoteNpcUnit(unit, `${partyId}:daily`, party);
  }
  if (atHome) {
    for (const unit of party.roster) {
      const definition = getCardDefinition(unit.cardId);
      if (unit.currentHp >= definition.maxHp || party.gold <= 0) continue;
      const healingRate = 0.018 + prosperity * 0.00014;
      const healing = Math.min(
        definition.maxHp - unit.currentHp,
        Math.max(
          1,
          Math.round(definition.maxHp * healingRate * deltaHours),
        ),
      );
      const cost = Math.max(1, Math.ceil(healing / 100) * 2);
      if (party.gold < cost) continue;
      party.gold -= cost;
      unit.currentHp += healing;
      result.healed = true;
    }
  }
  return result;
}

export function resetNpcParty(
  partyId: string,
  party: NpcPartyProgress,
  sourceCardIds: string[],
  count: number,
): void {
  party.roster = createTierOneNpcRoster(partyId, sourceCardIds, count);
  party.gold = Math.max(12, Math.floor(party.gold * 0.2));
  party.rations = Math.max(6, count * 2);
  party.prisoners = [];
  party.victories = 0;
  party.logisticsHours = 0;
}

export function settleNpcPrisoners(
  partyId: string,
  party: NpcPartyProgress,
  sourceCardIds: string[],
  capacity: number,
): NpcPrisonerSettlementResult {
  let recruited = 0;
  while (
    party.roster.length < capacity &&
    recruitMatchingPrisoner(partyId, party, sourceCardIds)
  ) {
    recruited += 1;
  }
  const ransomed = party.prisoners.reduce(
    (sum, stack) => sum + stack.quantity,
    0,
  );
  const gold = party.prisoners.reduce(
    (sum, stack) =>
      sum +
      stack.quantity * (4 + getCardDefinition(stack.cardId).tier * 3),
    0,
  );
  party.gold += gold;
  party.prisoners = [];
  return { recruited, ransomed, gold };
}

function promoteNpcUnit(unit: CardInstance, seed: string, party: NpcPartyProgress): void {
  const definition = getCardDefinition(unit.cardId);
  const path = upgradesByCardId.get(unit.cardId);
  const requiredXp = xpNeededForUnitUpgrade(definition.tier);
  const trainingCost = definition.tier * 5;
  if (!path?.options.length || unit.xp < requiredXp || party.gold < trainingCost) return;
  const targetId = path.options[stableHash(`${seed}:${unit.uid}:${unit.cardId}`) % path.options.length];
  const target = getCardDefinition(targetId);
  const healthRatio = unit.currentHp / definition.maxHp;
  unit.cardId = targetId;
  unit.currentHp = Math.max(1, Math.round(target.maxHp * healthRatio));
  unit.xp -= requiredXp;
  party.gold -= trainingCost;
}

function recruitMatchingPrisoner(
  partyId: string,
  party: NpcPartyProgress,
  sourceCardIds: string[],
): boolean {
  const races = new Set(sourceCardIds.map((cardId) => getCardDefinition(cardId).race));
  const stack = party.prisoners.find((entry) =>
    entry.quantity > 0 && races.has(getCardDefinition(entry.cardId).race),
  );
  if (!stack) return false;
  const definition = getCardDefinition(stack.cardId);
  const index = party.roster.length;
  party.roster.push({
    uid: `${partyId}:prisoner:${party.victories}:${index}`,
    cardId: stack.cardId,
    currentHp: Math.max(1, Math.round(definition.maxHp * 0.55)),
    level: 1,
    xp: 0,
  });
  stack.quantity -= 1;
  party.prisoners = party.prisoners.filter((entry) => entry.quantity > 0);
  return true;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
