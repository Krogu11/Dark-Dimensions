import type { EnemyArchetype, MapLocation, WorldMapDefinition } from "../content/schemas";
import type { EconomyState } from "../economy/Economy";

export const FACTION_IDS = [
  "ember_crown",
  "gloam_compact",
  "iron_concord",
] as const;

export type FactionId = (typeof FACTION_IDS)[number];
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
  economy: EconomyState,
  enemies: EnemyArchetype[],
): FactionState {
  const settlements = map.locations.filter((location) =>
    ["city", "village", "castle"].includes(location.type),
  );
  const cities = settlements.filter((location) => location.type === "city");
  const locationFactions: Record<string, FactionId> = {};

  for (const location of settlements) {
    if (location.type === "village") {
      const city = nearestLocation(location, cities);
      locationFactions[location.id] =
        locationFactions[city.id] ??
        FACTION_IDS[hashValue(`${seed}:${city.id}:faction`) % FACTION_IDS.length];
    } else {
      locationFactions[location.id] =
        FACTION_IDS[hashValue(`${seed}:${location.id}:faction`) % FACTION_IDS.length];
    }
  }

  const quests = settlements.map((issuer, index) =>
    createQuest(seed, issuer, index, settlements, economy, enemies, locationFactions),
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

function createQuest(
  seed: number,
  issuer: MapLocation,
  index: number,
  settlements: MapLocation[],
  economy: EconomyState,
  enemies: EnemyArchetype[],
  locationFactions: Record<string, FactionId>,
): QuestState {
  const questHash = hashValue(`${seed}:${issuer.id}:quest`);
  const type: QuestType = ["delivery", "bounty", "escort"][questHash % 3] as QuestType;
  const otherSettlements = settlements.filter((location) => location.id !== issuer.id);
  const target =
    otherSettlements[hashValue(`${seed}:${issuer.id}:target`) % otherSettlements.length];
  const caravan =
    economy.caravans.length > 0
      ? economy.caravans[
          hashValue(`${seed}:${issuer.id}:caravan`) % economy.caravans.length
        ]
      : null;
  const enemy = enemies[hashValue(`${seed}:${issuer.id}:enemy`) % enemies.length];
  const requiredCount = 2 + (enemy?.threat ?? 1) / 2;

  return {
    id: `quest_${index}_${issuer.id}`,
    type,
    status: "available",
    factionId: locationFactions[issuer.id],
    issuerLocationId: issuer.id,
    targetLocationId:
      type === "escort" ? caravan?.destinationId ?? target.id : type === "delivery" ? target.id : issuer.id,
    itemId:
      type === "delivery"
        ? RESOURCE_IDS[hashValue(`${seed}:${issuer.id}:item`) % RESOURCE_IDS.length]
        : null,
    requiredQuantity: type === "delivery" ? 3 + (questHash % 3) : 0,
    enemyId: type === "bounty" ? enemy.id : null,
    requiredCount: type === "bounty" ? Math.ceil(requiredCount) : 0,
    progress: 0,
    caravanId: type === "escort" ? caravan?.id ?? null : null,
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
