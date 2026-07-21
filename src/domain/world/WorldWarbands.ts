import type {
  WarbandSpawn,
  WarbandState,
  WarbandTemplate,
  WarbandType,
  WorldMapDefinition,
  NobleRank,
} from "../content/schemas";
import { getCardDefinition } from "../cards/CardInstance";
import type { CardInstance } from "../cards/CardInstance";
import type { FactionId, FactionState } from "../quests/Factions";
import { areFactionsHostile } from "../quests/Factions";
import {
  estimateNpcRosterStrength,
  normalizeNpcRoster,
  npcRosterHpRatio,
  type NpcActivity,
  type NpcPrisonerStack,
} from "./NpcParty";

export type WorldWarbandType = WarbandType;
export type WorldWarbandStatus = WarbandState;
export type LordPersonality = "aggressive" | "cautious" | "ambitious" | "just";

export interface WorldWarbandState {
  id: string;
  nameKey: string;
  type: WorldWarbandType;
  factionId: FactionId;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  unitIds: string[];
  recruitmentCardIds: string[];
  roster: CardInstance[];
  gold: number;
  rations: number;
  prisoners: NpcPrisonerStack[];
  victories: number;
  logisticsHours: number;
  nobleRank: NobleRank | null;
  nobleProfileId: string | null;
  personality: LordPersonality;
  activity: NpcActivity;
  speed: number;
  detectionRadius: number;
  aggressionRadius: number;
  aggression: number;
  state: WorldWarbandStatus;
  homeLocationId: string | null;
  spawnX: number;
  spawnY: number;
  maxPursuitDistance: number;
  respawnHours: number;
  respawnRemainingHours: number;
  leaderCardId?: string;
  leaderLevel: number;
  equipmentItemIds: string[];
  patrolPoints?: Array<{ x: number; y: number }>;
  patrolIndex: number;
  allowedRadius: number;
  targetWarbandId: string | null;
  targetEnemyId: string | null;
  activeBattleId: string | null;
  hpRatio: number;
  experience: number;
  lootItemIds: string[];
  displayName?: string;
  bountyHunter?: boolean;
  targetPlayer?: boolean;
  lastAidDay?: number;
}

export interface WorldWarbandBattleState {
  id: string;
  attackerId: string;
  defenderId: string | null;
  enemyId: string | null;
  x: number;
  y: number;
  remainingHours: number;
  state: "fighting" | "resolved";
  victorId: string | null;
  playerJoined: boolean;
}

export interface WarbandAiResult {
  playerBattleId: string | null;
}

export function createInitialWarbands(
  map: WorldMapDefinition,
): WorldWarbandState[] {
  const templates = new Map((map.warbandTemplates ?? []).map((template) => [template.id, template]));
  return (map.warbandSpawns ?? [])
    .filter((spawn) => spawn.spawnChance >= 1)
    .map((spawn) => createWarbandFromSpawn(spawn, templates.get(spawn.templateId)))
    .filter((warband): warband is WorldWarbandState => Boolean(warband));
}

export function normalizeWorldWarbands(
  map: WorldMapDefinition,
  initialWarbands?: WorldWarbandState[],
): WorldWarbandState[] {
  if (!initialWarbands?.length) return createInitialWarbands(map);
  const currentTemplateIds = new Set((map.warbandTemplates ?? []).map((template) => template.id));
  const currentSpawnIds = new Set(
    (map.warbandSpawns ?? [])
      .filter((spawn) => currentTemplateIds.has(spawn.templateId))
      .map((spawn) => spawn.id),
  );
  const migrated = initialWarbands
    .filter(
      (warband) =>
        currentSpawnIds.size === 0 || currentSpawnIds.has(warband.id),
    )
    .map((warband) => ({
      ...warband,
      leaderCardId: warband.leaderCardId ?? selectWarbandLeader(warband.unitIds),
      leaderLevel: warband.leaderLevel ?? 1,
      equipmentItemIds: [...(warband.equipmentItemIds ?? [])],
      targetWarbandId:
        warband.state === "fighting" ||
        warband.state === "chasing" ||
        warband.state === "retreating"
          ? warband.targetWarbandId
          : null,
      targetEnemyId:
        warband.state === "fighting" ||
        warband.state === "chasing" ||
        warband.state === "retreating"
          ? warband.targetEnemyId
          : null,
      activeBattleId: warband.state === "fighting" ? warband.activeBattleId : null,
      patrolIndex: warband.patrolIndex ?? 0,
      allowedRadius: warband.allowedRadius ?? warband.maxPursuitDistance * 1.25,
      lootItemIds: [...(warband.lootItemIds ?? [])],
      roster: normalizeNpcRoster(
        warband.id,
        warband.roster,
        warband.unitIds,
        Math.max(4, warband.unitIds.length),
      ),
      gold: warband.gold ?? (warband.type === "lord" ? 120 : 45),
      rations: warband.rations ?? Math.max(8, warband.unitIds.length * 3),
      prisoners: [...(warband.prisoners ?? [])],
      victories: warband.victories ?? 0,
      logisticsHours: warband.logisticsHours ?? 0,
      nobleRank: warband.nobleRank ?? (warband.type === "lord" ? "baron" : null),
      nobleProfileId: warband.nobleProfileId ?? null,
      personality: warband.personality ?? createLordPersonality(warband.id),
      activity: warband.activity ?? activityFromWarbandState(warband.state),
      recruitmentCardIds: [...(warband.recruitmentCardIds ?? warband.unitIds)],
      unitIds: [...warband.unitIds],
      displayName: warband.displayName ?? createWarbandDisplayName(warband.id, warband.factionId, warband.type, warband.bountyHunter),
      bountyHunter: warband.bountyHunter ?? warband.id.startsWith("bounty_hunters_"),
      targetPlayer: false,
      lastAidDay: warband.lastAidDay ?? 0,
    }))
    .map((warband) => {
      syncWorldWarbandParty(warband);
      return warband;
    });
  const migratedIds = new Set(migrated.map((warband) => warband.id));
  const missing = createInitialWarbands(map).filter((warband) => !migratedIds.has(warband.id));
  return migrated.length > 0 ? [...migrated, ...missing] : createInitialWarbands(map);
}

export function normalizeWarbandBattles(
  battles?: WorldWarbandBattleState[],
): WorldWarbandBattleState[] {
  return (battles ?? [])
    .filter((battle) => battle.state === "fighting")
    .map((battle) => ({
      ...battle,
      defenderId: battle.defenderId ?? null,
      enemyId: battle.enemyId ?? null,
      playerJoined: battle.playerJoined ?? false,
    }));
}

export function createWarbandFromSpawn(
  spawn: WarbandSpawn,
  template?: WarbandTemplate,
): WorldWarbandState | null {
  if (!template) return null;
  const firstPatrolPoint = spawn.patrolPoints?.[0];
  const nobleStarterSize = spawn.nobleRank === "king" ? 8 : spawn.nobleRank === "baron" ? 6 : spawn.nobleRank === "count" ? 4 : 0;
  const roster = normalizeNpcRoster(spawn.id, undefined, template.unitIds, Math.max(4, nobleStarterSize || template.unitIds.length));
  return {
    id: spawn.id,
    nameKey: template.nameKey,
    type: template.type,
    factionId: template.factionId as FactionId,
    x: spawn.x,
    y: spawn.y,
    targetX: firstPatrolPoint?.x ?? spawn.x,
    targetY: firstPatrolPoint?.y ?? spawn.y,
    unitIds: roster.map((unit) => unit.cardId),
    recruitmentCardIds: [...template.unitIds],
    roster,
    gold: spawn.nobleRank === "king" ? 250 : spawn.nobleRank === "baron" ? 150 : spawn.nobleRank === "count" ? 90 : template.type === "lord" ? 120 : 45,
    rations: Math.max(8, template.unitIds.length * 3),
    prisoners: [],
    victories: 0,
    logisticsHours: 0,
    nobleRank: spawn.nobleRank ?? (template.type === "lord" ? "baron" : null),
    nobleProfileId: spawn.nobleProfileId ?? null,
    personality: createLordPersonality(spawn.id),
    activity: spawn.patrolPoints?.length ? "patrolling" : "idle",
    speed: template.speed,
    detectionRadius: template.detectionRadius,
    aggressionRadius: template.aggressionRadius,
    aggression: template.aggression,
    state: spawn.patrolPoints?.length ? "patrolling" : "idle",
    homeLocationId: spawn.homeLocationId ?? null,
    spawnX: spawn.x,
    spawnY: spawn.y,
    maxPursuitDistance: template.maxPursuitDistance,
    respawnHours: template.respawnHours,
    respawnRemainingHours: 0,
    leaderCardId: spawn.leaderCardId ?? template.leaderCardId ?? selectWarbandLeader(template.unitIds),
    leaderLevel: spawn.leaderLevel ?? template.leaderLevel ?? 1,
    equipmentItemIds: [...template.equipmentItemIds],
    patrolPoints: spawn.patrolPoints?.map((point) => ({ ...point })),
    patrolIndex: 0,
    allowedRadius: spawn.allowedRadius ?? template.maxPursuitDistance * 1.25,
    targetWarbandId: null,
    targetEnemyId: null,
    activeBattleId: null,
    hpRatio: 1,
    experience: 0,
    lootItemIds: [...template.lootItemIds],
    displayName: spawn.displayName ?? createWarbandDisplayName(spawn.id, template.factionId as FactionId, template.type, template.bountyHunter, spawn.nobleRank),
    bountyHunter: template.bountyHunter,
    targetPlayer: false,
    lastAidDay: 0,
  } satisfies WorldWarbandState;
}

const LORD_PERSONALITIES: LordPersonality[] = ["aggressive", "cautious", "ambitious", "just"];

export function createLordPersonality(id: string): LordPersonality {
  return LORD_PERSONALITIES[hashText(`${id}:personality`) % LORD_PERSONALITIES.length];
}

export function getLordPersonalityLabel(personality: LordPersonality): string {
  if (personality === "aggressive") return "Aggressive";
  if (personality === "cautious") return "Cautious";
  if (personality === "ambitious") return "Ambitious";
  return "Just";
}

export function getNobleRankLabel(rank: NobleRank | null): string {
  if (rank === "king") return "King";
  if (rank === "count") return "Count";
  if (rank === "baron") return "Baron";
  return "Lord";
}

export function getNpcActivityLabel(activity: NpcActivity): string {
  if (activity === "huntingPlayer") return "Hunting the Wanderer";
  if (activity === "hunting") return "Hunting enemies";
  if (activity === "fighting") return "In battle";
  if (activity === "retreating") return "Returning home";
  if (activity === "recovering") return "Healing wounded";
  if (activity === "recruiting") return "Recruiting troops";
  if (activity === "raiding") return "Raiding travelers";
  if (activity === "patrolling") return "Patrolling the realm";
  return "Waiting at home";
}

function activityFromWarbandState(state: WorldWarbandStatus): NpcActivity {
  if (state === "fighting") return "fighting";
  if (state === "retreating" || state === "returning" || state === "destroyed") return "retreating";
  if (state === "chasing") return "hunting";
  if (state === "patrolling" || state === "traveling") return "patrolling";
  return "idle";
}

const LORD_NAMES: Record<FactionId, string[]> = {
  ember_crown: ["Aldric Vane", "Marwen Ashford", "Cedric Brand", "Elayne Pyre"],
  gloam_compact: ["Orren Vale", "Sable Morcant", "Theron Dusk", "Ysra Noct"],
  iron_concord: ["Borin Holt", "Helena Voss", "Garran Stone", "Mira Kest"],
};

const HUNTER_NAMES: Record<FactionId, string> = {
  ember_crown: "The Cinder Hounds",
  gloam_compact: "The Veiled Knives",
  iron_concord: "The Iron Pursuit",
};

function createWarbandDisplayName(id: string, factionId: FactionId, type: WorldWarbandType, bountyHunter = false, rank?: NobleRank): string {
  if (bountyHunter) return HUNTER_NAMES[factionId];
  if (type !== "lord") return id;
  const names = LORD_NAMES[factionId];
  return `${getNobleRankLabel(rank ?? "baron")} ${names[hashText(id) % names.length]}`;
}

function selectWarbandLeader(unitIds: string[]): string {
  return [...unitIds].sort((leftId, rightId) => {
    const left = getCardDefinition(leftId);
    const right = getCardDefinition(rightId);
    return right.tier - left.tier || right.atk + right.def - left.atk - left.def;
  })[0];
}

export function estimateWarbandStrength(warband: WorldWarbandState): number {
  if (warband.roster?.length) {
    const leader = warband.leaderCardId
      ? {
          uid: `${warband.id}:leader`,
          cardId: warband.leaderCardId,
          currentHp: getCardDefinition(warband.leaderCardId).maxHp,
          level: warband.leaderLevel,
          xp: 0,
        }
      : null;
    return estimateNpcRosterStrength(warband.roster) +
      (leader ? estimateNpcRosterStrength([leader]) * 0.5 : 0);
  }
  const troopPower = warband.unitIds.reduce((sum, cardId) => {
    const card = getCardDefinition(cardId);
    return (
      sum +
      (card.atk * 1.05 + card.def * 0.85 + card.maxHp * 0.42) *
        (1 + (card.tier - 1) * 0.22) *
        (1 + card.initiative * 0.025)
    );
  }, 0);
  const leaderCard = warband.leaderCardId
    ? getCardDefinition(warband.leaderCardId)
    : null;
  const leaderPower = leaderCard
    ? (leaderCard.atk + leaderCard.def + leaderCard.maxHp * 0.42) *
      (1 + Math.max(0, warband.leaderLevel - 1) * 0.09)
    : 0;
  const equipmentPower = warband.equipmentItemIds.length * 180;
  const leaderBonus = leaderCard ? 1.08 : 1;
  return Math.max(
    1,
    (troopPower * leaderBonus + leaderPower + equipmentPower) *
      Math.max(0.12, warband.hpRatio),
  );
}

export function syncWorldWarbandParty(warband: WorldWarbandState): void {
  warband.unitIds = warband.roster.map((unit) => unit.cardId);
  warband.hpRatio = npcRosterHpRatio(warband.roster);
}

export function canWarbandAttack(
  attacker: WorldWarbandState,
  defender: WorldWarbandState,
  factionState?: FactionState,
): boolean {
  return (
    attacker.state !== "destroyed" &&
    defender.state !== "destroyed" &&
    attacker.state !== "fighting" &&
    defender.state !== "fighting" &&
    defender.state !== "retreating" &&
    defender.state !== "returning" &&
    areFactionsHostile(attacker.factionId, defender.factionId, factionState)
  );
}

export function decideWarbandResponse(
  warband: WorldWarbandState,
  target: WorldWarbandState,
): "attack" | "retreat" | "ignore" {
  const ownStrength = estimateWarbandStrength(warband);
  const targetStrength = estimateWarbandStrength(target);
  const distance = Math.hypot(target.x - warband.x, target.y - warband.y);
  const speedFactor = warband.speed >= target.speed ? 0.9 : 1.08;
  const typeAggression =
    warband.type === "lord" || warband.type === "army" || warband.type === "elite"
      ? 0.16
      : warband.type === "patrol"
        ? 0.04
        : warband.type === "merchantEscort" || warband.type === "scout"
          ? -0.18
          : -0.08;
  const personalityAggression = warband.personality === "aggressive" ? 0.14
    : warband.personality === "ambitious" ? 0.07
    : warband.personality === "cautious" ? -0.14
    : 0.02;
  const attackRatio = 0.82 + speedFactor * 0.12 - warband.aggression * 0.28 - typeAggression - personalityAggression;
  if (ownStrength >= targetStrength * attackRatio && distance <= warband.aggressionRadius) {
    return "attack";
  }
  const retreatFactor = warband.personality === "cautious" ? 1.72
    : warband.personality === "aggressive" ? 1.28
    : 1.45;
  if (ownStrength * retreatFactor < targetStrength && distance <= warband.detectionRadius) {
    return "retreat";
  }
  return "ignore";
}

export function simulateNpcEnemyBattle(
  warband: WorldWarbandState,
  enemy: { id: string; threat: number; partySize: number; active: boolean },
  enemyStrength: number,
): {
  warbandWins: boolean;
  warbandHpRatio: number;
  warbandDestroyed: boolean;
} {
  const warbandStrength = estimateWarbandStrength(warband);
  const warbandScore =
    warbandStrength * deterministicVariance(warband.id, enemy.id);
  const enemyScore = enemyStrength * deterministicVariance(enemy.id, warband.id);
  const warbandWins = warbandScore >= enemyScore;
  const ratio = Math.min(warbandScore, enemyScore) / Math.max(warbandScore, enemyScore);
  if (warbandWins) {
    return {
      warbandWins,
      warbandHpRatio: Math.max(0.28, warband.hpRatio - (0.12 + ratio * 0.24)),
      warbandDestroyed: false,
    };
  }
  return {
    warbandWins,
    warbandHpRatio: Math.max(0, warband.hpRatio - (0.42 + ratio * 0.28)),
    warbandDestroyed: ratio > 0.62 || warband.hpRatio < 0.32,
  };
}

export function simulateNpcWarbandBattle(
  attacker: WorldWarbandState,
  defender: WorldWarbandState,
): { victorId: string; loserId: string; victorHpRatio: number; loserDestroyed: boolean } {
  const attackerScore = estimateWarbandStrength(attacker) * deterministicVariance(attacker.id, defender.id);
  const defenderScore = estimateWarbandStrength(defender) * deterministicVariance(defender.id, attacker.id);
  const attackerWins = attackerScore >= defenderScore;
  const victor = attackerWins ? attacker : defender;
  const loser = attackerWins ? defender : attacker;
  const ratio = Math.min(attackerScore, defenderScore) / Math.max(attackerScore, defenderScore);
  return {
    victorId: victor.id,
    loserId: loser.id,
    victorHpRatio: Math.max(0.28, victor.hpRatio - (0.18 + ratio * 0.32)),
    loserDestroyed: ratio > 0.68 || loser.hpRatio < 0.42,
  };
}

function deterministicVariance(left: string, right: string): number {
  const value = hashText(`${left}:${right}`);
  return 0.86 + (value % 29) / 100;
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
