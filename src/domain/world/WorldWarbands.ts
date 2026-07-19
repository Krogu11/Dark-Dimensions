import type {
  WarbandSpawn,
  WarbandState,
  WarbandTemplate,
  WarbandType,
  WorldMapDefinition,
} from "../content/schemas";
import { getCardDefinition } from "../cards/CardInstance";
import type { FactionId, FactionState } from "../quests/Factions";
import { areFactionsHostile } from "../quests/Factions";

export type WorldWarbandType = WarbandType;
export type WorldWarbandStatus = WarbandState;

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
  const currentTemplateIds = new Set(
    (map.warbandTemplates ?? [])
      .filter((template) => template.type === "lord")
      .map((template) => template.id),
  );
  const currentSpawnIds = new Set(
    (map.warbandSpawns ?? [])
      .filter((spawn) => currentTemplateIds.has(spawn.templateId))
      .map((spawn) => spawn.id),
  );
  const migrated = initialWarbands
    .filter(
      (warband) =>
        warband.type === "lord" &&
        (currentSpawnIds.size === 0 || currentSpawnIds.has(warband.id)),
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
      unitIds: [...warband.unitIds],
    }));
  return migrated.length > 0 ? migrated : createInitialWarbands(map);
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
  return {
    id: spawn.id,
    nameKey: template.nameKey,
    type: template.type,
    factionId: template.factionId as FactionId,
    x: spawn.x,
    y: spawn.y,
    targetX: firstPatrolPoint?.x ?? spawn.x,
    targetY: firstPatrolPoint?.y ?? spawn.y,
    unitIds: [...template.unitIds],
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
    leaderCardId: template.leaderCardId ?? selectWarbandLeader(template.unitIds),
    leaderLevel: template.leaderLevel ?? 1,
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
  };
}

function selectWarbandLeader(unitIds: string[]): string {
  return [...unitIds].sort((leftId, rightId) => {
    const left = getCardDefinition(leftId);
    const right = getCardDefinition(rightId);
    return right.tier - left.tier || right.atk + right.def - left.atk - left.def;
  })[0];
}

export function estimateWarbandStrength(warband: WorldWarbandState): number {
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
  const attackRatio = 0.82 + speedFactor * 0.12 - warband.aggression * 0.28 - typeAggression;
  if (ownStrength >= targetStrength * attackRatio && distance <= warband.aggressionRadius) {
    return "attack";
  }
  if (ownStrength * 1.45 < targetStrength && distance <= warband.detectionRadius) {
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
