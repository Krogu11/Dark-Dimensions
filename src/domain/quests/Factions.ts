import type { EnemyArchetype, MapLocation, WorldMapDefinition } from "../content/schemas";
import type { EconomyState } from "../economy/Economy";

export const FACTION_IDS = [
  "ember_crown",
  "gloam_compact",
  "iron_concord",
] as const;
export const PLAYER_FACTION_ID = "wanderer" as const;

export type FactionId = (typeof FACTION_IDS)[number];
export type WorldFactionId = FactionId | typeof PLAYER_FACTION_ID;
export type FactionRelation = "allied" | "friendly" | "neutral" | "hostile";
export type QuestType = "delivery" | "bounty" | "escort";
export type QuestStatus = "available" | "active" | "ready" | "completed";

export interface QuestState {
  id: string;
  type: QuestType;
  status: QuestStatus;
  factionId: FactionId;
  issuerLocationId: string;
  targetLocationId: string | null;
  itemId: string | null;
  requiredQuantity: number;
  enemyId: string | null;
  requiredCount: number;
  progress: number;
  caravanId: string | null;
  rewardGold: number;
  rewardReputation: number;
}

export interface FactionState {
  reputation: Record<FactionId, number>;
  locationFactions: Record<string, FactionId>;
  quests: QuestState[];
}

const RESOURCE_IDS = [
  "wood",
  "iron",
  "copper",
  "coal",
  "stone",
  "wheat",
  "grapes",
  "wool",
  "meat",
  "milk",
  "leather",
];

export function createFactionState(
  seed: number,
  map: WorldMapDefinition,
  _economy: EconomyState,
  enemies: EnemyArchetype[],
): FactionState {
  const settlements = map.locations.filter((location) =>
    ["city", "village", "castle"].includes(location.type),
  );
  const locationFactions = assignSettlementFactions(seed, settlements);

  const questIssuers = settlements.filter((location) => location.type === "city");
  const quests = questIssuers.flatMap((issuer, issuerIndex) =>
    (["delivery", "bounty", "escort"] as const).map((type, typeIndex) =>
      createQuest(
        seed,
        issuer,
        issuerIndex * 3 + typeIndex,
        settlements,
        enemies,
        locationFactions,
        type,
      ),
    ),
  );

  return {
    reputation: {
      ember_crown: 0,
      gloam_compact: 0,
      iron_concord: 0,
    },
    locationFactions,
    quests,
  };
}

export function assignSettlementFactions(
  seed: number,
  settlements: MapLocation[],
): Record<string, FactionId> {
  const cities = settlements.filter((location) => location.type === "city");
  const locationFactions: Record<string, FactionId> = {};
  const cityFactions = new Map<string, FactionId>();
  const sortedCities = [...cities].sort((left, right) => left.x - right.x);
  const factionOffset = hashValue(`${seed}:city-faction-offset`) % FACTION_IDS.length;
  sortedCities.forEach((city, index) => {
    cityFactions.set(city.id, FACTION_IDS[(index + factionOffset) % FACTION_IDS.length]);
  });

  for (const location of settlements) {
    if (location.type === "village" && cities.length > 0) {
      const city = nearestLocation(location, cities);
      locationFactions[location.id] =
        locationFactions[city.id] ?? cityFactions.get(city.id) ?? FACTION_IDS[0];
    } else if (location.type === "city") {
      locationFactions[location.id] = cityFactions.get(location.id) ?? FACTION_IDS[0];
    } else {
      locationFactions[location.id] =
        FACTION_IDS[hashValue(`${seed}:${location.id}:faction`) % FACTION_IDS.length];
    }
  }

  return locationFactions;
}

export function getFactionRelation(
  left: WorldFactionId,
  right: WorldFactionId,
  factionState?: FactionState,
): FactionRelation {
  if (left === right) return "allied";
  if (left === PLAYER_FACTION_ID || right === PLAYER_FACTION_ID) {
    const factionId = left === PLAYER_FACTION_ID ? right : left;
    if (!isFactionId(factionId)) return "neutral";
    const reputation = factionState?.reputation[factionId] ?? 0;
    if (reputation <= -20) return "hostile";
    if (reputation >= 35) return "allied";
    if (reputation >= 10) return "friendly";
    return "neutral";
  }

  if (
    (left === "ember_crown" && right === "gloam_compact") ||
    (left === "gloam_compact" && right === "ember_crown") ||
    (left === "gloam_compact" && right === "iron_concord") ||
    (left === "iron_concord" && right === "gloam_compact")
  ) {
    return "hostile";
  }
  if (
    (left === "ember_crown" && right === "iron_concord") ||
    (left === "iron_concord" && right === "ember_crown")
  ) {
    return "friendly";
  }
  return "neutral";
}

export function areFactionsHostile(
  left: WorldFactionId,
  right: WorldFactionId,
  factionState?: FactionState,
): boolean {
  return getFactionRelation(left, right, factionState) === "hostile";
}

export function isFactionId(value: string): value is FactionId {
  return (FACTION_IDS as readonly string[]).includes(value);
}

function createQuest(
  seed: number,
  issuer: MapLocation,
  index: number,
  settlements: MapLocation[],
  enemies: EnemyArchetype[],
  locationFactions: Record<string, FactionId>,
  forcedType?: QuestType,
): QuestState {
  const type: QuestType =
    forcedType ??
    (["delivery", "bounty", "escort"][
      hashValue(`${seed}:${issuer.id}:quest`) % 3
    ] as QuestType);
  const questHash = hashValue(`${seed}:${issuer.id}:${type}:quest`);
  const otherSettlements = settlements.filter(
    (location) => location.id !== issuer.id && location.type === "city",
  );
  const target =
    otherSettlements[
      hashValue(`${seed}:${issuer.id}:${type}:target`) % otherSettlements.length
    ];
  const enemy = enemies[hashValue(`${seed}:${issuer.id}:${type}:enemy`) % enemies.length];
  const requiredCount = 2 + (enemy?.threat ?? 1) / 2;
  const caravanId = `quest_caravan_${index}_${issuer.id}`;

  return {
    id: `quest_${index}_${issuer.id}`,
    type,
    status: "available",
    factionId: locationFactions[issuer.id],
    issuerLocationId: issuer.id,
    targetLocationId:
      type === "escort" ? target?.id ?? issuer.id : issuer.id,
    itemId:
      type === "delivery"
        ? RESOURCE_IDS[hashValue(`${seed}:${issuer.id}:${type}:item`) % RESOURCE_IDS.length]
        : null,
    requiredQuantity: type === "delivery" ? 4 + (questHash % 4) : 0,
    enemyId: type === "bounty" ? enemy.id : null,
    requiredCount: type === "bounty" ? Math.ceil(requiredCount) : 0,
    progress: 0,
    caravanId: type === "escort" ? caravanId : null,
    rewardGold: 28 + (questHash % 28) + (enemy?.threat ?? 1) * 6,
    rewardReputation: 5 + (questHash % 4),
  };
}

function nearestLocation(origin: MapLocation, candidates: MapLocation[]): MapLocation {
  return candidates.reduce((nearest, candidate) =>
    Math.hypot(candidate.x - origin.x, candidate.y - origin.y) <
    Math.hypot(nearest.x - origin.x, nearest.y - origin.y)
      ? candidate
      : nearest,
  );
}

function hashValue(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
