import type {
  MapLocation,
  WorldEnemySpawn,
  WorldMapDefinition,
} from "../content/schemas";
import type { CaravanState } from "../economy/Economy";
import { getCardDefinition, type CardInstance } from "../cards/CardInstance";
import {
  areFactionsHostile,
  shouldDispatchBountyHunters,
  type FactionState,
} from "../quests/Factions";
import { enemiesById } from "../../content/content";
import {
  canWarbandAttack,
  decideWarbandResponse,
  estimateWarbandStrength,
  normalizeWarbandBattles,
  normalizeWorldWarbands,
  simulateNpcEnemyBattle,
  simulateNpcWarbandBattle,
  type WorldWarbandBattleState,
  type WorldWarbandState,
  syncWorldWarbandParty,
} from "./WorldWarbands";
import {
  applyNpcAttrition,
  estimateNpcRosterStrength,
  getNpcRosterThreatPoints,
  getNpcThreatRatingFromPoints,
  getUnitThreatPoints,
  normalizeNpcRoster,
  npcRosterHpRatio,
  processNpcRecovery,
  resetNpcParty,
  rewardNpcVictory,
  settleNpcPrisoners,
  type NpcActivity,
  type NpcPrisonerStack,
} from "./NpcParty";
import {
  findNearestTraversablePosition,
  getTerrainAt,
  getTerrainEncounterMultiplier,
  getTerrainMovementMultiplier,
  isWorldPositionTraversable,
  type TerrainType,
} from "./WorldTerrain";
import { getPartyInitiativeMultiplier } from "./PartySpeed";
import { findWorldPath, type WorldPoint } from "./WorldPathfinder";

export const WORLD_DISCOVERY_CELL_SIZE = 360;
const CAMP_RECOVERY_RADIUS = 165;
const BANDIT_CAMP_DWELL_HOURS = 8;
const BANDIT_PATROL_RADIUS = 720;
const BANDIT_TRADER_RAID_RADIUS = 1800;
const BANDIT_RESPAWN_PLAYER_CLEARANCE = 220;
const FACTION_RECOVERY_RADIUS = 280;
const NPC_RETREAT_HP = 0.34;
const NPC_RECOVERY_HP = 0.9;
const LORD_RETREAT_HP = 0.25;
const LORD_RECOVERY_HP = 0.7;
const LORD_TERRITORY_THREAT_RADIUS = 1800;
const LORD_TERRITORY_DETECTION_RADIUS = 3200;
const LORD_TERRITORY_ENGAGEMENT_RADIUS = 2600;
const BANDIT_LORD_HUNT_RADIUS = 1800;
const NPC_BATTLE_DURATION_HOURS = 6;
const CAMP_ASSAULT_EXCLUSION_MARGIN = 180;

export interface WorldEnemyState extends WorldEnemySpawn {
  spawnX: number;
  spawnY: number;
  active: boolean;
  respawnHours: number;
  activeBattleId: string | null;
  targetTraderId: string | null;
  targetWarbandId: string | null;
  serviceLocationId: string | null;
  campDwellHoursRemaining: number;
  lootValue: number;
  roster: CardInstance[];
  gold: number;
  rations: number;
  prisoners: NpcPrisonerStack[];
  victories: number;
  logisticsHours: number;
  activity: NpcActivity;
}

export interface WorldChronicleEntry {
  id: string;
  text: string;
  factionIds: string[];
}

export interface WorldLogisticsState {
  prosperityByLocationId?: Record<string, number>;
  blockedLocationIds?: string[];
  playerMovementSpeed?: number;
  traders?: CaravanState[];
}

export interface DungeonSiteState {
  locationId: string;
  active: boolean;
  respawnHours: number;
}

export interface WorldState {
  mapId: string;
  x: number;
  y: number;
  nearbyLocationId: string | null;
  enemies: WorldEnemyState[];
  warbands: WorldWarbandState[];
  warbandBattles: WorldWarbandBattleState[];
  monsterRaids: WorldMonsterRaidState[];
  battleSites: WorldBattleSiteState[];
  chronicle: WorldChronicleEntry[];
  dungeonSites: DungeonSiteState[];
  exploredSectors: string[];
}

export interface WorldBattleSiteState {
  id: string;
  x: number;
  y: number;
  remainingHours: number;
}

export interface WorldMonsterRaidState {
  id: string;
  enemyId: string;
  traderId: string;
  x: number;
  y: number;
  remainingHours: number;
  state: "fighting" | "resolved";
  victor: "monster" | "trader" | null;
}

interface EnemyNavigationRoute {
  targetX: number;
  targetY: number;
  waypoints: WorldPoint[];
  waypointIndex: number;
  blockedUpdates: number;
}

export class WorldSimulation {
  readonly state: WorldState;
  private elapsedHours = 0;
  private warbandScanHours = 0;
  private monsterRaidCooldowns = new Map<string, number>();
  private readonly enemyNavigationRoutes = new Map<string, EnemyNavigationRoute>();
  private readonly warbandsById: Map<string, WorldWarbandState>;
  private readonly enemiesById: Map<string, WorldEnemyState>;
  private readonly locationsById: Map<string, MapLocation>;
  private nearbyCheckX = Number.NaN;
  private nearbyCheckY = Number.NaN;

  constructor(
    readonly map: WorldMapDefinition,
    initial?: Partial<WorldState>,
  ) {
    const initialPosition = findNearestTraversablePosition(
      map,
      initial?.x ?? map.start.x,
      initial?.y ?? map.start.y,
      30,
    );
    this.state = {
      mapId: map.id,
      x: initialPosition.x,
      y: initialPosition.y,
      nearbyLocationId: initial?.nearbyLocationId ?? null,
      exploredSectors: [...(initial?.exploredSectors ?? [])],
      dungeonSites:
        initial?.dungeonSites ??
        map.locations
          .filter((location) => location.type === "dungeon" && location.spawnProfile)
          .map((location) => ({
            locationId: location.id,
            active: true,
            respawnHours: 0,
          })),
      enemies: map.enemies.map((enemy) => {
        const saved = initial?.enemies?.find((candidate) => candidate.id === enemy.id);
        const sourceCards = enemiesById.get(enemy.archetypeId)?.deck ?? [];
        return {
          ...enemy,
          x: saved?.x ?? enemy.x,
          y: saved?.y ?? enemy.y,
          spawnX: enemy.x,
          spawnY: enemy.y,
          active: saved?.active ?? true,
          respawnHours: saved?.respawnHours ?? 0,
          activeBattleId: null,
          targetTraderId: null,
          targetWarbandId: null,
          serviceLocationId:
            saved?.serviceLocationId ?? enemy.sourceLocationId ?? null,
          campDwellHoursRemaining:
            saved?.campDwellHoursRemaining ??
            (saved ? 0 : BANDIT_CAMP_DWELL_HOURS),
          lootValue: saved?.lootValue ?? 0,
          roster: normalizeNpcRoster(enemy.id, saved?.roster, sourceCards, Math.max(8, sourceCards.length * 2)),
          gold: saved?.gold ?? 24 + enemy.threat * 8,
          rations: saved?.rations ?? Math.max(16, Math.max(8, sourceCards.length * 2) * 3),
          prisoners: [...(saved?.prisoners ?? [])],
          victories: saved?.victories ?? 0,
          logisticsHours: saved?.logisticsHours ?? 0,
          activity: saved?.activity ?? "patrolling",
        };
      }),
      warbands: normalizeWorldWarbands(map, initial?.warbands),
      warbandBattles: normalizeWarbandBattles(initial?.warbandBattles),
      monsterRaids: initial?.monsterRaids ?? [],
      battleSites: initial?.battleSites ?? [],
      chronicle: initial?.chronicle ?? [],
    };
    for (const enemy of this.state.enemies) {
      if (enemy.sourceLocationId) enemy.partySize = enemy.roster.length;
    }
    for (const warband of this.state.warbands) syncWorldWarbandParty(warband);
    this.warbandsById = new Map(this.state.warbands.map((warband) => [warband.id, warband]));
    this.enemiesById = new Map(this.state.enemies.map((enemy) => [enemy.id, enemy]));
    this.locationsById = new Map(this.map.locations.map((location) => [location.id, location]));
    this.relocateWarbandsAwayFromPlayer(980);
    this.updateNearbyLocation();
    this.nearbyCheckX = this.state.x;
    this.nearbyCheckY = this.state.y;
    this.revealAround(520);
  }

  updateWarbands(
    deltaHours: number,
    factionState?: FactionState,
    logistics: WorldLogisticsState = {},
  ): string | null {
    this.syncEntityIndexes();
    this.updateWarbandCaravanBattles(deltaHours, logistics.traders ?? []);
    this.updateWarbandBattles(deltaHours);
    this.warbandScanHours += deltaHours;
    const shouldScan = this.warbandScanHours >= 0.16;
    if (shouldScan) this.warbandScanHours = 0;

    for (const warband of this.state.warbands) {
      if (warband.state === "destroyed") {
        this.updateDestroyedWarband(warband, deltaHours, factionState);
        continue;
      }
      if (warband.state === "fighting") continue;

      const atHome =
        Math.hypot(warband.x - warband.spawnX, warband.y - warband.spawnY) <=
        (warband.bountyHunter ? 90 : FACTION_RECOVERY_RADIUS);
      const homeProsperity = warband.homeLocationId
        ? logistics.prosperityByLocationId?.[warband.homeLocationId] ?? 50
        : 45;
      const personalityCapacity = warband.type === "lord" && warband.personality === "ambitious" ? 4
        : warband.type === "lord" && warband.personality === "cautious" ? -2
        : 0;
      const rankCapacity = warband.nobleRank === "king" ? 8 : warband.nobleRank === "baron" ? 4 : 0;
      const warbandCapacity =
        warband.type === "lord"
          ? Math.min(
              56,
              16 +
                warband.leaderLevel * 4 +
                personalityCapacity +
                rankCapacity,
            )
          : 24;
      const recovery = processNpcRecovery(
        warband.id,
        warband,
        warband.recruitmentCardIds,
        warbandCapacity,
        deltaHours,
        atHome,
        {
          prosperity: homeProsperity,
          canRecruit: !warband.homeLocationId || !logistics.blockedLocationIds?.includes(warband.homeLocationId),
          prisonerPolicy: "ransom",
          supportGoldPerDay: Math.max(
            warband.type === "lord" ? 24 : 12,
            warband.roster.length * (warband.type === "lord" ? 4 : 3),
          ),
          supportRationsPerDay: Math.max(
            4,
            Math.ceil(warband.roster.length * 0.8),
          ),
        },
      );
      syncWorldWarbandParty(warband);
      if (warband.roster.length === 0) {
        this.defeatWarband(warband.id);
        continue;
      }

      if (shouldScan) {
        this.updateWarbandIntent(warband, factionState, logistics.traders ?? []);
      }

      this.updateWarbandTarget(warband);
      this.updateWarbandActivity(warband, atHome, recovery);
      this.moveWarband(
        warband,
        deltaHours,
        logistics.playerMovementSpeed,
      );

      if (
        warband.targetPlayer &&
        warband.state === "chasing" &&
        Math.hypot(warband.x - this.state.x, warband.y - this.state.y) <= 34
      ) return warband.id;

      if (warband.state === "chasing" && warband.targetWarbandId) {
        const target = this.warbandsById.get(warband.targetWarbandId);
        if (
          target &&
          target.state !== "destroyed" &&
          target.state !== "fighting" &&
          Math.hypot(target.x - warband.x, target.y - warband.y) <= 34
        ) {
          this.startWarbandBattle(warband, target);
        }
      }
      if (warband.state === "chasing" && warband.targetEnemyId) {
        const candidate = this.enemiesById.get(warband.targetEnemyId);
        const target = candidate?.active && !candidate.activeBattleId ? candidate : undefined;
        if (
          target &&
          Math.hypot(target.x - warband.x, target.y - warband.y) <= 34
        ) {
          this.startWarbandEnemyBattle(warband, target);
        }
      }
      if (warband.state === "chasing" && warband.targetTraderId) {
        const trader = logistics.traders?.find(
          (candidate) =>
            candidate.id === warband.targetTraderId &&
            candidate.state !== "destroyed" &&
            candidate.state !== "fighting",
        );
        if (trader && Math.hypot(trader.x - warband.x, trader.y - warband.y) <= 34) {
          this.startWarbandCaravanBattle(warband, trader);
        }
      }
    }
    return null;
  }

  getWarband(warbandId: string): WorldWarbandState | null {
    return this.warbandsById.get(warbandId) ?? null;
  }

  defeatWarband(warbandId: string): void {
    const warband = this.getWarband(warbandId);
    if (!warband) return;
    warband.state = "destroyed";
    warband.activity = "retreating";
    warband.hpRatio = 0;
    warband.respawnRemainingHours = warband.respawnHours;
    warband.activeBattleId = null;
    warband.targetWarbandId = null;
    warband.targetEnemyId = null;
    warband.targetTraderId = null;
    warband.targetPlayer = false;
    if (warband.bountyHunter) warband.bountyHunterDeployed = false;
  }

  getWarbandBattle(battleId: string): WorldWarbandBattleState | null {
    return (
      this.state.warbandBattles.find((battle) => battle.id === battleId) ?? null
    );
  }

  resolveWarbandBattleWithPlayer(
    battleId: string,
    defeatedWarbandId: string,
    alliedWarbandId: string | null,
  ): void {
    const battle = this.getWarbandBattle(battleId);
    const defeated = this.getWarband(defeatedWarbandId);
    if (!battle || !defeated) return;
    defeated.state = "destroyed";
    defeated.activity = "retreating";
    defeated.respawnRemainingHours = defeated.respawnHours;
    defeated.activeBattleId = null;
    defeated.targetWarbandId = null;
    defeated.targetEnemyId = null;
    defeated.targetPlayer = false;
    if (defeated.bountyHunter) defeated.bountyHunterDeployed = false;

    const ally = alliedWarbandId ? this.getWarband(alliedWarbandId) : null;
    if (ally) {
      ally.state = ally.hpRatio < 0.45 ? "returning" : "patrolling";
      ally.activity = ally.state === "returning" ? "retreating" : "patrolling";
      ally.activeBattleId = null;
      ally.targetWarbandId = null;
      ally.targetEnemyId = null;
      ally.experience += 30;
    }
    battle.state = "resolved";
    battle.victorId = alliedWarbandId;
    battle.remainingHours = 0;
    this.recordBattleSite(battle.x, battle.y);
    this.recordChronicle(`${defeated.displayName ?? defeated.nameKey} was defeated by the Wanderer.`, [defeated.factionId]);
  }

  resolveWarbandEnemyBattleWithPlayer(
    battleId: string,
    alliedWarbandId: string | null,
  ): void {
    const battle = this.getWarbandBattle(battleId);
    if (!battle) return;
    const ally = alliedWarbandId ? this.getWarband(alliedWarbandId) : null;
    const enemy = battle.enemyId ? this.enemiesById.get(battle.enemyId) : null;
    if (ally) {
      ally.state = ally.hpRatio < 0.45 ? "returning" : "patrolling";
      ally.activity = ally.state === "returning" ? "retreating" : "patrolling";
      ally.activeBattleId = null;
      ally.targetWarbandId = null;
      ally.targetEnemyId = null;
      ally.experience += 18;
    }
    if (enemy) {
      enemy.activeBattleId = null;
      enemy.targetTraderId = null;
      enemy.targetWarbandId = null;
    }
    battle.state = "resolved";
    battle.victorId = alliedWarbandId;
    battle.remainingHours = 0;
    this.recordBattleSite(battle.x, battle.y);
  }

  resolveWarbandBattleWithPlayerSide(
    battleId: string,
    alliedSideId: "sideA" | "sideB",
  ): void {
    const battle = this.getWarbandBattle(battleId);
    if (!battle) return;
    const alliedSide =
      alliedSideId === "sideA" ? battle.sideA : battle.sideB;
    const defeatedSide =
      alliedSideId === "sideA" ? battle.sideB : battle.sideA;

    for (const warbandId of defeatedSide.warbandIds) {
      this.defeatWarband(warbandId);
    }
    for (const enemyId of defeatedSide.enemyIds) {
      this.defeatEnemy(enemyId);
    }
    for (const warbandId of alliedSide.warbandIds) {
      const warband = this.getWarband(warbandId);
      if (!warband) continue;
      warband.activeBattleId = null;
      warband.targetWarbandId = null;
      warband.targetEnemyId = null;
      warband.targetPlayer = false;
      warband.state =
        warband.hpRatio < this.getWarbandRetreatHp(warband)
          ? "returning"
          : "patrolling";
      warband.activity =
        warband.state === "returning" ? "retreating" : "patrolling";
      warband.experience += 30;
    }
    for (const enemyId of alliedSide.enemyIds) {
      const enemy = this.enemiesById.get(enemyId);
      if (!enemy) continue;
      enemy.activeBattleId = null;
      enemy.targetWarbandId = null;
      enemy.targetTraderId = null;
      enemy.activity =
        npcRosterHpRatio(enemy.roster) < NPC_RETREAT_HP
          ? "retreating"
          : "patrolling";
    }

    battle.state = "resolved";
    battle.victorId =
      alliedSide.warbandIds[0] ?? alliedSide.enemyIds[0] ?? null;
    battle.remainingHours = 0;
    this.recordBattleSite(battle.x, battle.y);
    this.recordChronicle(
      "The Wanderer turned the course of a field battle.",
      alliedSide.warbandIds
        .map((id) => this.getWarband(id)?.factionId)
        .filter((id): id is WorldWarbandState["factionId"] => Boolean(id)),
    );
  }

  recordBattleSite(x: number, y: number, durationHours = 12): void {
    const existing = this.state.battleSites.find(
      (site) => Math.hypot(site.x - x, site.y - y) <= 32,
    );
    if (existing) {
      existing.x = x;
      existing.y = y;
      existing.remainingHours = durationHours;
      return;
    }
    this.state.battleSites.push({
      id: `battle_site_${Math.round(this.elapsedHours * 1000)}_${Math.round(x)}_${Math.round(y)}`,
      x,
      y,
      remainingHours: durationHours,
    });
  }

  recordChronicle(text: string, factionIds: string[] = []): void {
    const last = this.state.chronicle[0];
    if (last?.text === text) return;
    this.state.chronicle.unshift({
      id: `chronicle_${Math.round(this.elapsedHours * 1000)}_${this.hash(text)}`,
      text,
      factionIds: [...new Set(factionIds)],
    });
    this.state.chronicle = this.state.chronicle.slice(0, 40);
  }

  updateEnemies(
    deltaHours: number,
    playerThreat = 1,
    traders: CaravanState[] = [],
    playerMovementSpeed?: number,
  ): string | null {
    this.syncEntityIndexes();
    this.elapsedHours += deltaHours;
    for (const site of this.state.battleSites) site.remainingHours -= deltaHours;
    this.state.battleSites = this.state.battleSites.filter((site) => site.remainingHours > 0);
    const playerIsSafe = this.nearbyLocation?.type === "city";
    this.updateDungeonSites(deltaHours);
    this.updateMonsterRaids(deltaHours, traders);
    this.updateMonsterRaidCooldowns(deltaHours);

    for (const enemy of this.state.enemies) {
      const compatibleCamp = this.findNearestCompatibleCamp(enemy);
      const sourceIsActive = enemy.sourceLocationId
        ? this.isDungeonActive(enemy.sourceLocationId)
        : true;
      if (!enemy.active) {
        this.enemyNavigationRoutes.delete(enemy.id);
        enemy.activity = "recovering";
        enemy.respawnHours -= deltaHours;
        if (enemy.respawnHours <= 0 && sourceIsActive) {
          const spawnCamp =
            (enemy.sourceLocationId
              ? this.locationsById.get(enemy.sourceLocationId)
              : null) ?? compatibleCamp;
          if (
            !spawnCamp ||
            Math.hypot(
              spawnCamp.x - this.state.x,
              spawnCamp.y - this.state.y,
            ) < BANDIT_RESPAWN_PLAYER_CLEARANCE
          ) {
            enemy.respawnHours = 0;
            continue;
          }
          this.resetEnemyParty(enemy);
          enemy.active = true;
          enemy.x = spawnCamp.x;
          enemy.y = spawnCamp.y;
          enemy.spawnX = spawnCamp.x;
          enemy.spawnY = spawnCamp.y;
          enemy.activeBattleId = null;
          enemy.targetTraderId = null;
          enemy.targetWarbandId = null;
          enemy.serviceLocationId = spawnCamp.id;
          enemy.campDwellHoursRemaining = BANDIT_CAMP_DWELL_HOURS;
          enemy.lootValue = 0;
          enemy.activity = "recruiting";
        }
        continue;
      }
      if (!sourceIsActive) {
        this.enemyNavigationRoutes.delete(enemy.id);
        enemy.active = false;
        enemy.respawnHours = Number.POSITIVE_INFINITY;
        enemy.activeBattleId = null;
        enemy.targetTraderId = null;
        enemy.targetWarbandId = null;
        enemy.activity = "idle";
        continue;
      }
      if (enemy.activeBattleId) continue;

      const sourceCards = enemiesById.get(enemy.archetypeId)?.deck ?? [];
      const capacity = Math.min(14, 6 + enemy.threat * 2);
      const serviceCamp =
        compatibleCamp ??
        (enemy.serviceLocationId
          ? this.locationsById.get(enemy.serviceLocationId)
          : null);
      const atBase = Boolean(
        serviceCamp &&
          this.isCompatibleEnemyCamp(enemy, serviceCamp) &&
          this.isDungeonActive(serviceCamp.id) &&
          Math.hypot(enemy.x - serviceCamp.x, enemy.y - serviceCamp.y) <=
            Math.max(
              CAMP_RECOVERY_RADIUS,
              serviceCamp.radius + 120,
            ),
      );
      const hpBeforeRecovery = npcRosterHpRatio(enemy.roster);
      const wasReturningForRecovery =
        enemy.activity === "retreating" || enemy.activity === "recovering";
      const recovery = processNpcRecovery(
        enemy.id,
        enemy,
        sourceCards,
        capacity,
        deltaHours,
        atBase,
        {
          prosperity: 45,
          prisonerPolicy: "recruit",
          supportGoldPerDay: Math.max(18, enemy.roster.length * 4),
          supportRationsPerDay: Math.max(
            4,
            Math.ceil(enemy.roster.length * 0.8),
          ),
        },
      );
      enemy.partySize = enemy.roster.length;
      const hpAfterRecovery = npcRosterHpRatio(enemy.roster);
      const returningForRecovery =
        hpAfterRecovery < NPC_RETREAT_HP ||
        ((wasReturningForRecovery || hpBeforeRecovery < NPC_RETREAT_HP) &&
          hpAfterRecovery < NPC_RECOVERY_HP);
      const needsRecruitment = enemy.roster.length < Math.max(
        4,
        Math.floor(capacity * 0.75),
      );
      const needsCampTrade =
        enemy.lootValue > 0 || enemy.prisoners.length > 0;
      const needsCampService =
        returningForRecovery || needsRecruitment || needsCampTrade;
      if (atBase && needsCampService && enemy.campDwellHoursRemaining <= 0) {
        enemy.serviceLocationId = serviceCamp?.id ?? enemy.serviceLocationId;
        enemy.campDwellHoursRemaining = BANDIT_CAMP_DWELL_HOURS;
        const settlement = settleNpcPrisoners(
          enemy.id,
          enemy,
          sourceCards,
          capacity,
        );
        if (enemy.lootValue > 0) {
          enemy.gold += enemy.lootValue;
          enemy.lootValue = 0;
        }
        if (settlement.recruited > 0) {
          enemy.partySize = enemy.roster.length;
        }
      }
      if (atBase && enemy.campDwellHoursRemaining > 0) {
        enemy.campDwellHoursRemaining = Math.max(
          0,
          enemy.campDwellHoursRemaining - deltaHours,
        );
        enemy.targetTraderId = null;
        enemy.targetWarbandId = null;
        enemy.activity =
          needsRecruitment || recovery.recruited > 0
            ? "recruiting"
            : "recovering";
        continue;
      }
      if (returningForRecovery) {
        enemy.activity = atBase ? "recovering" : "retreating";
      } else if (recovery.recruited > 0) {
        enemy.activity = "recruiting";
      } else if (recovery.healed) {
        enemy.activity = "recovering";
      }

      const distanceToPlayer = Math.hypot(
        this.state.x - enemy.x,
        this.state.y - enemy.y,
      );
      const effectiveAggroRadius =
        enemy.aggroRadius *
        getTerrainEncounterMultiplier(this.map, this.state.x, this.state.y);
      const enemyThreat = this.getEnemyThreatRating(enemy);
      const shouldFlee =
        !returningForRecovery &&
        !playerIsSafe &&
        playerThreat - enemyThreat >= 3 &&
        distanceToPlayer <= effectiveAggroRadius * 1.15;
      const shouldPursue =
        !returningForRecovery &&
        !playerIsSafe &&
        !shouldFlee &&
        distanceToPlayer <= effectiveAggroRadius;
      let targetX = enemy.spawnX;
      let targetY = enemy.spawnY;
      let warbandTarget: WorldWarbandState | null = null;
      let battleTarget: WorldWarbandBattleState | null = null;

      if (needsCampService && serviceCamp) {
        enemy.activity = atBase ? "recovering" : "retreating";
        enemy.targetTraderId = null;
        enemy.targetWarbandId = null;
        enemy.serviceLocationId = serviceCamp.id;
        targetX = serviceCamp.x;
        targetY = serviceCamp.y;
      } else if (shouldFlee) {
        enemy.activity = "retreating";
        enemy.targetTraderId = null;
        enemy.targetWarbandId = null;
        const distance = Math.max(1, distanceToPlayer);
        targetX = enemy.x + ((enemy.x - this.state.x) / distance) * 260;
        targetY = enemy.y + ((enemy.y - this.state.y) / distance) * 260;
      } else if (shouldPursue) {
        enemy.activity = "huntingPlayer";
        enemy.targetTraderId = null;
        enemy.targetWarbandId = null;
        targetX = this.state.x;
        targetY = this.state.y;
      } else {
        battleTarget = this.findBanditBattleToJoin(enemy);
        warbandTarget = battleTarget
          ? null
          : this.findBanditWarbandTarget(enemy);
        const traderTarget = battleTarget || warbandTarget || this.monsterRaidCooldowns.has(enemy.id)
          ? null
          : this.findMonsterRaidTarget(enemy, traders);
        if (battleTarget) {
          enemy.activity = "hunting";
          enemy.targetWarbandId = null;
          enemy.targetTraderId = null;
          targetX = battleTarget.x;
          targetY = battleTarget.y;
        } else if (warbandTarget) {
          enemy.activity = "hunting";
          enemy.targetWarbandId = warbandTarget.id;
          enemy.targetTraderId = null;
          targetX = warbandTarget.x;
          targetY = warbandTarget.y;
        } else if (traderTarget) {
          enemy.activity = "raiding";
          targetX = traderTarget.x;
          targetY = traderTarget.y;
          enemy.targetTraderId = traderTarget.id;
          enemy.targetWarbandId = null;
        } else {
          if (enemy.activity !== "recovering" && enemy.activity !== "recruiting") enemy.activity = "patrolling";
          enemy.targetTraderId = null;
          enemy.targetWarbandId = null;
          const phase = this.hash(enemy.id) + this.elapsedHours * 0.38;
          const patrolCamp = compatibleCamp ?? serviceCamp;
          targetX = (patrolCamp?.x ?? enemy.spawnX) +
            Math.cos(phase) * BANDIT_PATROL_RADIUS;
          targetY = (patrolCamp?.y ?? enemy.spawnY) +
            Math.sin(phase * 0.83) * BANDIT_PATROL_RADIUS;
        }
      }

      const distanceToTarget = Math.hypot(targetX - enemy.x, targetY - enemy.y);
      if (distanceToTarget > 2) {
        const naturalMovementSpeed =
          enemy.speed *
          getPartyInitiativeMultiplier(
            enemy.roster.length
              ? enemy.roster
              : (enemiesById.get(enemy.archetypeId)?.deck ?? []),
          ) *
          getTerrainMovementMultiplier(this.map, enemy.x, enemy.y) *
          (shouldFlee || needsCampService ? 1.08 : 1);
        const pursuitSpeed =
          shouldPursue && playerMovementSpeed && playerMovementSpeed > 0
            ? Math.min(naturalMovementSpeed, playerMovementSpeed * 0.94)
            : naturalMovementSpeed;
        const travel = Math.min(
          pursuitSpeed * deltaHours,
          distanceToTarget,
        );
        const shouldUseStrategicRoute =
          shouldPursue ||
          needsCampService ||
          Boolean(enemy.targetTraderId) ||
          Boolean(enemy.targetWarbandId) ||
          Boolean(battleTarget) ||
          this.enemyNavigationRoutes.has(enemy.id);
        const directPosition = shouldUseStrategicRoute
          ? null
          : this.moveEnemy(
              enemy.x,
              enemy.y,
              ((targetX - enemy.x) / distanceToTarget) * travel,
              ((targetY - enemy.y) / distanceToTarget) * travel,
            );
        const directMoveBlocked =
          directPosition !== null &&
          Math.hypot(
            directPosition.x - enemy.x,
            directPosition.y - enemy.y,
          ) < 0.25;
        const nextPosition =
          shouldUseStrategicRoute || directMoveBlocked
            ? this.moveEnemyAlongRoute(
                enemy.id,
                enemy.x,
                enemy.y,
                targetX,
                targetY,
                travel,
              )
            : directPosition!;
        enemy.x = nextPosition.x;
        enemy.y = nextPosition.y;
      }

      const finalDistanceToPlayer = Math.hypot(
        this.state.x - enemy.x,
        this.state.y - enemy.y,
      );
      if (shouldPursue && finalDistanceToPlayer <= 34) return enemy.id;

      if (
        !shouldPursue &&
        battleTarget &&
        Math.hypot(battleTarget.x - enemy.x, battleTarget.y - enemy.y) <= 34
      ) {
        this.joinEnemyBattle(enemy, battleTarget);
      }

      if (!shouldPursue && enemy.targetWarbandId) {
        const target = this.warbandsById.get(enemy.targetWarbandId);
        if (
          target &&
          target.state !== "destroyed" &&
          target.state !== "fighting" &&
          Math.hypot(target.x - enemy.x, target.y - enemy.y) <= 34
        ) {
          this.startWarbandEnemyBattle(target, enemy);
        }
      }

      if (!shouldPursue && enemy.targetTraderId) {
        const trader = traders.find((candidate) => candidate.id === enemy.targetTraderId);
        if (
          trader &&
          Math.hypot(trader.x - enemy.x, trader.y - enemy.y) <= 34
        ) {
          this.startMonsterRaid(enemy, trader);
        }
      }
    }

    return null;
  }

  defeatEnemy(enemyId: string): void {
    const enemy = this.enemiesById.get(enemyId);
    if (!enemy) return;
    enemy.active = false;
    enemy.activeBattleId = null;
    enemy.targetTraderId = null;
    enemy.targetWarbandId = null;
    enemy.activity = "recovering";
    this.enemyNavigationRoutes.delete(enemyId);
    const source = enemy.sourceLocationId
      ? this.getDungeonSite(enemy.sourceLocationId)
      : null;
    enemy.respawnHours = source?.active ? 18 : Number.POSITIVE_INFINITY;
  }

  private resetEnemyParty(enemy: WorldEnemyState): void {
    const sourceCards = enemiesById.get(enemy.archetypeId)?.deck ?? [];
    resetNpcParty(
      enemy.id,
      enemy,
      sourceCards,
      Math.max(8, Math.min(14, 6 + enemy.threat * 2)),
    );
    enemy.partySize = enemy.roster.length;
  }

  private syncEntityIndexes(): void {
    this.warbandsById.clear();
    for (const warband of this.state.warbands) this.warbandsById.set(warband.id, warband);
    this.enemiesById.clear();
    for (const enemy of this.state.enemies) this.enemiesById.set(enemy.id, enemy);
  }

  defeatDungeon(locationId: string): void {
    const site = this.getDungeonSite(locationId);
    const location = this.locationsById.get(locationId);
    if (!site || !location?.spawnProfile) return;
    site.active = false;
    site.respawnHours = location.spawnProfile.respawnHours;
    for (const enemy of this.state.enemies) {
      if (enemy.sourceLocationId !== locationId) continue;
      enemy.active = false;
      enemy.activeBattleId = null;
      enemy.targetTraderId = null;
      enemy.respawnHours = Number.POSITIVE_INFINITY;
    }
    this.updateNearbyLocation();
  }

  isDungeonActive(locationId: string): boolean {
    return this.getDungeonSite(locationId)?.active ?? true;
  }

  move(
    horizontal: number,
    vertical: number,
    deltaSeconds: number,
    speed = 235,
  ): number {
    const previousX = this.state.x;
    const previousY = this.state.y;
    const magnitude = Math.hypot(horizontal, vertical) || 1;
    const travelX = (horizontal / magnitude) * speed * deltaSeconds;
    const travelY = (vertical / magnitude) * speed * deltaSeconds;
    const steps = Math.max(1, Math.ceil(Math.hypot(travelX, travelY) / 8));
    for (let step = 0; step < steps; step += 1) {
      const nextX = this.state.x + travelX / steps;
      const nextY = this.state.y + travelY / steps;
      if (isWorldPositionTraversable(this.map, nextX, nextY, 30)) {
        this.state.x = nextX;
        this.state.y = nextY;
      } else if (isWorldPositionTraversable(this.map, nextX, this.state.y, 30)) {
        this.state.x = nextX;
      } else if (isWorldPositionTraversable(this.map, this.state.x, nextY, 30)) {
        this.state.y = nextY;
      }
    }
    const nearbyDx = this.state.x - this.nearbyCheckX;
    const nearbyDy = this.state.y - this.nearbyCheckY;
    if (nearbyDx * nearbyDx + nearbyDy * nearbyDy >= 144) {
      this.updateNearbyLocation();
      this.nearbyCheckX = this.state.x;
      this.nearbyCheckY = this.state.y;
    }
    return Math.hypot(this.state.x - previousX, this.state.y - previousY);
  }

  get currentTerrain(): TerrainType {
    return getTerrainAt(this.map, this.state.x, this.state.y);
  }

  revealAround(radius: number): void {
    const explored = new Set(this.state.exploredSectors);
    const minimumColumn = Math.max(
      0,
      Math.floor((this.state.x - radius) / WORLD_DISCOVERY_CELL_SIZE),
    );
    const maximumColumn = Math.floor(
      (this.state.x + radius) / WORLD_DISCOVERY_CELL_SIZE,
    );
    const minimumRow = Math.max(
      0,
      Math.floor((this.state.y - radius) / WORLD_DISCOVERY_CELL_SIZE),
    );
    const maximumRow = Math.floor(
      (this.state.y + radius) / WORLD_DISCOVERY_CELL_SIZE,
    );
    for (let column = minimumColumn; column <= maximumColumn; column += 1) {
      for (let row = minimumRow; row <= maximumRow; row += 1) {
        const centerX = (column + 0.5) * WORLD_DISCOVERY_CELL_SIZE;
        const centerY = (row + 0.5) * WORLD_DISCOVERY_CELL_SIZE;
        if (
          Math.hypot(centerX - this.state.x, centerY - this.state.y) <=
          radius + WORLD_DISCOVERY_CELL_SIZE * 0.72
        ) {
          explored.add(`${column}:${row}`);
        }
      }
    }
    this.state.exploredSectors = [...explored];
  }

  isPositionExplored(x: number, y: number): boolean {
    const column = Math.floor(x / WORLD_DISCOVERY_CELL_SIZE);
    const row = Math.floor(y / WORLD_DISCOVERY_CELL_SIZE);
    return this.state.exploredSectors.includes(`${column}:${row}`);
  }

  get nearbyLocation(): MapLocation | null {
    return (
      this.map.locations.find(
        (location) => location.id === this.state.nearbyLocationId,
      ) ?? null
    );
  }

  private updateNearbyLocation(): void {
    this.state.nearbyLocationId =
      this.map.locations.find((location) => {
        if (location.type === "dungeon" && !this.isDungeonActive(location.id)) {
          return false;
        }
        const distance = Math.hypot(
          this.state.x - location.x,
          this.state.y - location.y,
        );
        return distance <= location.radius;
      })?.id ?? null;
  }

  private updateDungeonSites(deltaHours: number): void {
    for (const site of this.state.dungeonSites) {
      if (site.active) continue;
      site.respawnHours -= deltaHours;
      if (site.respawnHours > 0) continue;
      const campLocation = this.locationsById.get(site.locationId);
      if (
        campLocation &&
        Math.hypot(
          campLocation.x - this.state.x,
          campLocation.y - this.state.y,
        ) < BANDIT_RESPAWN_PLAYER_CLEARANCE
      ) {
        site.respawnHours = 0;
        continue;
      }
      site.active = true;
      site.respawnHours = 0;
      for (const enemy of this.state.enemies) {
        if (enemy.sourceLocationId !== site.locationId) continue;
        const camp = campLocation;
        this.resetEnemyParty(enemy);
        enemy.active = true;
        enemy.x = camp?.x ?? enemy.spawnX;
        enemy.y = camp?.y ?? enemy.spawnY;
        enemy.spawnX = camp?.x ?? enemy.spawnX;
        enemy.spawnY = camp?.y ?? enemy.spawnY;
        enemy.respawnHours = 0;
        enemy.activeBattleId = null;
        enemy.targetTraderId = null;
        enemy.serviceLocationId = site.locationId;
        enemy.campDwellHoursRemaining = BANDIT_CAMP_DWELL_HOURS;
        enemy.lootValue = 0;
      }
    }
  }

  private updateWarbandBattles(deltaHours: number): void {
    for (const battle of this.state.warbandBattles) {
      if (battle.state !== "fighting" || battle.playerJoined) continue;
      battle.remainingHours -= deltaHours;
      if (battle.remainingHours > 0) continue;
      const attacker = this.getWarband(battle.attackerId);
      const defender = battle.defenderId ? this.getWarband(battle.defenderId) : null;
      const enemy = battle.enemyId
        ? this.state.enemies.find((candidate) => candidate.id === battle.enemyId)
        : null;
      const participantCount =
        battle.sideA.warbandIds.length +
        battle.sideA.enemyIds.length +
        battle.sideB.warbandIds.length +
        battle.sideB.enemyIds.length;
      if (participantCount > 2) {
        this.resolveGroupedNpcBattle(battle);
        continue;
      }
      if (attacker && enemy) {
        this.resolveWarbandEnemyBattle(battle, attacker, enemy);
        continue;
      }
      if (!attacker || !defender) {
        battle.state = "resolved";
        this.recordBattleSite(battle.x, battle.y);
        continue;
      }
      const result = simulateNpcWarbandBattle(attacker, defender);
      const victor = this.getWarband(result.victorId);
      const loser = this.getWarband(result.loserId);
      if (victor) {
        applyNpcAttrition(victor, 0.16 + (1 - result.victorHpRatio) * 0.45, battle.id);
        syncWorldWarbandParty(victor);
        if (loser) {
          const loserLosses = applyNpcAttrition(loser, result.loserDestroyed ? 1 : 0.62, `${battle.id}:loser`);
          const stolenGold = Math.min(loser.gold, 12 + loserLosses.length * 5);
          const victoryXp = this.getNpcVictoryXp(loserLosses, 28);
          loser.gold -= stolenGold;
          rewardNpcVictory(victor, loserLosses, battle.id, victoryXp, stolenGold);
          victor.experience += victoryXp;
          syncWorldWarbandParty(loser);
          syncWorldWarbandParty(victor);
        }
        victor.hpRatio = Math.min(victor.hpRatio, result.victorHpRatio);
        victor.state = victor.hpRatio < 0.48 ? "returning" : "patrolling";
        victor.activity = victor.state === "returning" ? "retreating" : "patrolling";
        victor.activeBattleId = null;
        victor.targetWarbandId = null;
        victor.targetEnemyId = null;
      }
      if (loser) {
        const destroyed = result.loserDestroyed || loser.roster.length === 0;
        loser.hpRatio = destroyed ? 0 : npcRosterHpRatio(loser.roster);
        loser.state = destroyed ? "destroyed" : "retreating";
        loser.activity = "retreating";
        loser.respawnRemainingHours = destroyed ? loser.respawnHours : 0;
        loser.activeBattleId = null;
        loser.targetWarbandId = null;
        loser.targetEnemyId = null;
        loser.targetPlayer = false;
        if (destroyed && loser.bountyHunter) loser.bountyHunterDeployed = false;
      }
      battle.state = "resolved";
      battle.victorId = result.victorId;
      battle.remainingHours = 0;
      this.recordBattleSite(battle.x, battle.y);
      if (victor && loser) {
        this.recordChronicle(
          `${victor.displayName ?? victor.nameKey} defeated ${loser.displayName ?? loser.nameKey}.`,
          [victor.factionId, loser.factionId],
        );
      }
    }
    this.state.warbandBattles = this.state.warbandBattles.filter(
      (battle) =>
        battle.state === "fighting" ||
        Math.hypot(battle.x - this.state.x, battle.y - this.state.y) <= 900,
    );
  }

  private updateDestroyedWarband(
    warband: WorldWarbandState,
    deltaHours: number,
    factionState?: FactionState,
  ): void {
    warband.respawnRemainingHours = Math.max(
      0,
      warband.respawnRemainingHours - deltaHours,
    );
    if (warband.respawnRemainingHours > 0) return;
    if (
      warband.bountyHunter &&
      !shouldDispatchBountyHunters(warband.factionId, factionState)
    ) {
      return;
    }
    warband.x = warband.spawnX;
    warband.y = warband.spawnY;
    resetNpcParty(
      warband.id,
      warband,
      warband.recruitmentCardIds,
      warband.nobleRank === "king" ? 40 : warband.nobleRank === "baron" ? 30 : 20,
    );
    syncWorldWarbandParty(warband);
    warband.targetWarbandId = null;
    warband.targetEnemyId = null;
    warband.targetPlayer = false;
    warband.activeBattleId = null;
    warband.state = warband.patrolPoints?.length ? "patrolling" : "idle";
    warband.activity = "recruiting";
    warband.patrolIndex = 0;
    const nextPoint = warband.patrolPoints?.[0];
    warband.targetX = nextPoint?.x ?? warband.spawnX;
    warband.targetY = nextPoint?.y ?? warband.spawnY;
    if (warband.bountyHunter) {
      warband.bountyHunterDeployed = true;
      this.stationBountyHunterAtFriendlyCity(warband, factionState);
      warband.state = "chasing";
      warband.activity = "huntingPlayer";
      warband.targetPlayer = true;
      warband.targetX = this.state.x;
      warband.targetY = this.state.y;
    }
  }

  private updateWarbandIntent(
    warband: WorldWarbandState,
    factionState?: FactionState,
    traders: CaravanState[] = [],
  ): void {
    if (warband.targetTraderId) {
      const trader = traders.find(
        (candidate) =>
          candidate.id === warband.targetTraderId &&
          candidate.state !== "destroyed" &&
          candidate.state !== "fighting",
      );
      if (trader) {
        warband.targetX = trader.x;
        warband.targetY = trader.y;
        return;
      }
      warband.targetTraderId = null;
      warband.state = "returning";
    }
    const wanted = factionState?.wanted?.[warband.factionId] ?? 0;
    const lordWantedThreshold = warband.personality === "just" ? 35
      : warband.personality === "aggressive" ? 40
      : 50;
    const bountyHunterActive =
      Boolean(warband.bountyHunter) &&
      shouldDispatchBountyHunters(warband.factionId, factionState);
    const huntsPlayer =
      Boolean(factionState?.atWar?.[warband.factionId]) ||
      bountyHunterActive ||
      (warband.type === "lord" && wanted >= lordWantedThreshold);
    const distanceFromHome = Math.hypot(warband.x - warband.spawnX, warband.y - warband.spawnY);
    const distanceToPlayer = Math.hypot(
      warband.x - this.state.x,
      warband.y - this.state.y,
    );
    const strandedBountyHunter =
      bountyHunterActive &&
      warband.bountyHunterDeployed &&
      !warband.targetEnemyId &&
      warband.hpRatio >= this.getWarbandRetreatHp(warband) &&
      distanceFromHome <= 80 &&
      distanceToPlayer > warband.detectionRadius * 1.4;
    const beginningBountyHunt =
      bountyHunterActive &&
      (!warband.bountyHunterDeployed || strandedBountyHunter);
    if (warband.bountyHunter && !bountyHunterActive) {
      warband.state = "destroyed";
      warband.activity = "idle";
      warband.respawnRemainingHours = 0;
      warband.targetPlayer = false;
      warband.targetWarbandId = null;
      warband.targetEnemyId = null;
      warband.bountyHunterDeployed = false;
      return;
    }
    const warbandRecovering =
      warband.hpRatio < this.getWarbandRetreatHp(warband) ||
      (warband.state === "returning" &&
        warband.hpRatio < this.getWarbandRecoveryHp(warband));
    if (warbandRecovering) {
      warband.state = "returning";
      warband.activity = distanceFromHome <= 80 ? "recovering" : "retreating";
      warband.targetPlayer = false;
      warband.targetWarbandId = null;
      warband.targetEnemyId = null;
      return;
    }
    if (
      bountyHunterActive &&
      warband.bountyHunterDeployed &&
      warband.state === "chasing" &&
      warband.targetEnemyId &&
      this.canContinuePursuit(warband, factionState)
    ) {
      return;
    }
    const opportunity =
      bountyHunterActive &&
      warband.bountyHunterDeployed &&
      warband.hpRatio >= 0.34
      ? this.findBountyHunterOpportunity(warband)
      : null;
    if (opportunity) {
      warband.state = "chasing";
      warband.targetPlayer = false;
      warband.targetWarbandId = null;
      warband.targetEnemyId = opportunity.id;
      warband.targetTraderId = null;
      return;
    }
    if (
      huntsPlayer &&
      warband.hpRatio >= this.getWarbandRetreatHp(warband) &&
      (warband.bountyHunter || distanceFromHome <= warband.allowedRadius)
    ) {
      if (beginningBountyHunt) {
        warband.bountyHunterDeployed = true;
        this.stationBountyHunterAtFriendlyCity(warband, factionState);
      }
      warband.state = "chasing";
      warband.targetPlayer = true;
      warband.targetWarbandId = null;
      warband.targetEnemyId = null;
      warband.targetTraderId = null;
      return;
    }
    if (warband.targetPlayer) {
      warband.targetPlayer = false;
      warband.state = "returning";
      warband.targetWarbandId = null;
      warband.targetEnemyId = null;
      warband.targetTraderId = null;
      return;
    }
    if (
      warband.state === "chasing" &&
      (warband.targetWarbandId || warband.targetEnemyId || warband.targetTraderId) &&
      !this.getPursuitTarget(warband)
    ) {
      warband.state = "returning";
      warband.targetWarbandId = null;
      warband.targetEnemyId = null;
      warband.targetPlayer = false;
      return;
    }
    if (
      warband.state === "chasing" &&
      (warband.targetWarbandId || warband.targetEnemyId || warband.targetTraderId) &&
      this.canContinuePursuit(warband, factionState)
    ) {
      return;
    }

    let selectedTarget: WorldWarbandState | null = null;
    let selectedEnemyTarget: WorldEnemyState | null = null;
    let selectedTraderTarget: CaravanState | null = null;
    let selectedResponse: "attack" | "retreat" | "ignore" = "ignore";
    let bestScore = Number.POSITIVE_INFINITY;
    for (const other of this.state.warbands) {
      if (other.id === warband.id || !canWarbandAttack(warband, other, factionState)) {
        continue;
      }
      const distance = Math.hypot(other.x - warband.x, other.y - warband.y);
      if (distance > warband.detectionRadius) continue;
      const response = decideWarbandResponse(warband, other);
      if (response === "ignore") continue;
      const score = distance / Math.max(1, estimateWarbandStrength(other));
      if (score >= bestScore) continue;
      bestScore = score;
      selectedTarget = other;
      selectedEnemyTarget = null;
      selectedTraderTarget = null;
      selectedResponse = response;
    }

    for (const enemy of this.state.enemies) {
      if (!enemy.active || enemy.activeBattleId) continue;
      if (
        warband.type === "lord" &&
        this.isEnemyInsideProtectedCamp(enemy)
      ) {
        continue;
      }
      const distance = Math.hypot(enemy.x - warband.x, enemy.y - warband.y);
      const threatensTerritory =
        warband.type === "lord" &&
        this.isEnemyThreateningFactionTerritory(
          enemy,
          warband.factionId,
          factionState,
        );
      const enemyDetectionRadius =
        threatensTerritory
          ? Math.max(warband.detectionRadius, LORD_TERRITORY_DETECTION_RADIUS)
          : warband.type === "lord"
          ? Math.max(warband.detectionRadius, 1350)
          : warband.detectionRadius;
      if (distance > enemyDetectionRadius) continue;
      const ownStrength = estimateWarbandStrength(warband);
      const enemyStrength = this.estimateEnemySpawnStrength(enemy);
      const enemyEngagementRadius =
        threatensTerritory
          ? Math.max(warband.aggressionRadius, LORD_TERRITORY_ENGAGEMENT_RADIUS)
          : warband.type === "lord"
          ? Math.max(warband.aggressionRadius, 1050)
          : warband.aggressionRadius;
      const shouldAttack =
        distance <= enemyEngagementRadius &&
        ownStrength >= enemyStrength * this.getEnemyAttackThreshold(warband);
      const shouldRetreat = ownStrength * 1.3 < enemyStrength;
      if (!shouldAttack && !shouldRetreat) continue;
      const score =
        (distance / Math.max(1, enemyStrength)) *
        (threatensTerritory ? 0.25 : 1);
      if (score >= bestScore) continue;
      bestScore = score;
      selectedTarget = null;
      selectedEnemyTarget = enemy;
      selectedTraderTarget = null;
      selectedResponse = shouldAttack ? "attack" : "retreat";
    }

    for (const trader of traders) {
      if (
        trader.kind !== "caravan" ||
        trader.state === "destroyed" ||
        trader.state === "fighting" ||
        !trader.factionId ||
        !areFactionsHostile(warband.factionId, trader.factionId, factionState)
      ) {
        continue;
      }
      const distance = Math.hypot(trader.x - warband.x, trader.y - warband.y);
      if (distance > warband.detectionRadius || distance > warband.aggressionRadius) continue;
      const traderStrength = this.estimateTraderStrength(trader);
      if (estimateWarbandStrength(warband) < traderStrength * 0.72) continue;
      const score = distance / Math.max(1, traderStrength);
      if (score >= bestScore) continue;
      bestScore = score;
      selectedTarget = null;
      selectedEnemyTarget = null;
      selectedTraderTarget = trader;
      selectedResponse = "attack";
    }

    if (!selectedTarget && !selectedEnemyTarget && !selectedTraderTarget) {
      if (warband.state === "chasing" || warband.state === "retreating") {
        warband.state =
          warband.type === "lord" &&
          distanceFromHome <= warband.allowedRadius
            ? "patrolling"
            : "returning";
        warband.targetWarbandId = null;
        warband.targetEnemyId = null;
        warband.targetTraderId = null;
      }
      return;
    }

    if (selectedResponse === "attack") {
      warband.state = "chasing";
      warband.targetWarbandId = selectedTarget?.id ?? null;
      warband.targetEnemyId = selectedEnemyTarget?.id ?? null;
      warband.targetTraderId = selectedTraderTarget?.id ?? null;
      if (selectedTraderTarget) {
        warband.targetX = selectedTraderTarget.x;
        warband.targetY = selectedTraderTarget.y;
      }
    } else {
      warband.state = "retreating";
      warband.targetWarbandId = selectedTarget?.id ?? null;
      warband.targetEnemyId = selectedEnemyTarget?.id ?? null;
      warband.targetTraderId = null;
    }
  }

  private canContinuePursuit(
    warband: WorldWarbandState,
    factionState?: FactionState,
  ): boolean {
    const target = this.getPursuitTarget(warband);
    if (!target) {
      return false;
    }
    const distanceToTarget = Math.hypot(target.x - warband.x, target.y - warband.y);
    const distanceFromHome = Math.hypot(
      warband.x - warband.spawnX,
      warband.y - warband.spawnY,
    );
    const targetedEnemy = warband.targetEnemyId
      ? this.enemiesById.get(warband.targetEnemyId)
      : null;
    if (
      targetedEnemy &&
      warband.type === "lord" &&
      this.isEnemyInsideProtectedCamp(targetedEnemy)
    ) {
      return false;
    }
    const territorialBandit =
      Boolean(targetedEnemy) &&
      warband.type === "lord" &&
      this.isEnemyThreateningFactionTerritory(
        targetedEnemy!,
        warband.factionId,
        factionState,
      );
    return (
      warband.hpRatio >= this.getWarbandRetreatHp(warband) &&
      distanceToTarget <=
        (territorialBandit
          ? LORD_TERRITORY_DETECTION_RADIUS * 1.25
          : warband.detectionRadius * 1.4) &&
      distanceFromHome <=
        (territorialBandit
          ? Math.max(
              warband.allowedRadius,
              warband.maxPursuitDistance,
              LORD_TERRITORY_DETECTION_RADIUS * 1.4,
            )
          : Math.min(warband.allowedRadius, warband.maxPursuitDistance))
    );
  }

  private stationBountyHunterAtFriendlyCity(
    warband: WorldWarbandState,
    factionState?: FactionState,
  ): void {
    const friendlyCity = this.map.locations
      .filter(
        (location) =>
          location.type === "city" &&
          factionState?.locationFactions?.[location.id] === warband.factionId,
      )
      .sort(
        (left, right) =>
          Math.hypot(left.x - this.state.x, left.y - this.state.y) -
          Math.hypot(right.x - this.state.x, right.y - this.state.y),
      )[0];
    if (friendlyCity) {
      const angle =
        this.hash(`${warband.id}:${friendlyCity.id}:garrison`) * Math.PI * 2;
      const position = findNearestTraversablePosition(
        this.map,
        friendlyCity.x + Math.cos(angle) * 55,
        friendlyCity.y + Math.sin(angle) * 55,
        24,
      );
      warband.x = position.x;
      warband.y = position.y;
      warband.spawnX = position.x;
      warband.spawnY = position.y;
      warband.homeLocationId = friendlyCity.id;
      warband.patrolPoints = [{ ...position }];
      warband.patrolIndex = 0;
    }
    warband.targetX = this.state.x;
    warband.targetY = this.state.y;
  }

  private findBountyHunterOpportunity(
    warband: WorldWarbandState,
  ): WorldEnemyState | null {
    const ownStrength = estimateWarbandStrength(warband);
    let selected: WorldEnemyState | null = null;
    let selectedDistance = Number.POSITIVE_INFINITY;
    for (const enemy of this.state.enemies) {
      if (!enemy.active || enemy.activeBattleId) continue;
      const distance = Math.hypot(enemy.x - warband.x, enemy.y - warband.y);
      if (
        distance > warband.aggressionRadius ||
        distance >= selectedDistance ||
        ownStrength <
          this.estimateEnemySpawnStrength(enemy) *
            this.getEnemyAttackThreshold(warband)
      ) {
        continue;
      }
      selected = enemy;
      selectedDistance = distance;
    }
    return selected;
  }

  private updateWarbandTarget(warband: WorldWarbandState): void {
    if (warband.state === "chasing" && warband.targetPlayer) {
      warband.targetX = this.state.x;
      warband.targetY = this.state.y;
      return;
    }
    if (warband.state === "chasing" && warband.targetTraderId) {
      return;
    }
    if (warband.state === "chasing" && (warband.targetWarbandId || warband.targetEnemyId)) {
      const target = this.getPursuitTarget(warband);
      if (!target) {
        warband.state = "returning";
        warband.targetWarbandId = null;
        warband.targetEnemyId = null;
        warband.targetPlayer = false;
        return;
      }
      warband.targetX = target.x;
      warband.targetY = target.y;
      return;
    }

    if (warband.state === "retreating" || warband.state === "returning") {
      warband.targetX = warband.spawnX;
      warband.targetY = warband.spawnY;
      if (Math.hypot(warband.x - warband.spawnX, warband.y - warband.spawnY) <= 45) {
        if (warband.hpRatio < this.getWarbandRecoveryHp(warband)) {
          return;
        }
        warband.state = warband.patrolPoints?.length ? "patrolling" : "idle";
        warband.targetWarbandId = null;
        warband.targetEnemyId = null;
      }
      return;
    }

    if (warband.state === "patrolling" && warband.patrolPoints?.length) {
      const currentPoint = warband.patrolPoints[warband.patrolIndex % warband.patrolPoints.length];
      warband.targetX = currentPoint.x;
      warband.targetY = currentPoint.y;
      if (Math.hypot(warband.x - currentPoint.x, warband.y - currentPoint.y) <= 46) {
        warband.patrolIndex = (warband.patrolIndex + 1) % warband.patrolPoints.length;
      }
      return;
    }

    if (warband.state === "idle") {
      const phase = this.hash(warband.id) + this.elapsedHours * 0.32;
      warband.targetX = warband.spawnX + Math.cos(phase) * 85;
      warband.targetY = warband.spawnY + Math.sin(phase * 0.7) * 85;
    }
  }

  private updateWarbandActivity(
    warband: WorldWarbandState,
    atHome: boolean,
    recovery: { healed: boolean; recruited: number; ransomed: number },
  ): void {
    if (warband.state === "fighting") warband.activity = "fighting";
    else if (atHome && warband.state === "returning") warband.activity = "recovering";
    else if (warband.state === "retreating" || warband.state === "returning") warband.activity = "retreating";
    else if (warband.state === "chasing" && warband.targetPlayer) warband.activity = "huntingPlayer";
    else if (warband.state === "chasing") warband.activity = "hunting";
    else if (atHome && recovery.recruited > 0) warband.activity = "recruiting";
    else if (atHome && recovery.healed) warband.activity = "recovering";
    else if (warband.state === "patrolling" || warband.state === "traveling") warband.activity = "patrolling";
    else warband.activity = "idle";
  }

  private moveWarband(
    warband: WorldWarbandState,
    deltaHours: number,
    playerMovementSpeed?: number,
  ): void {
    const distance = Math.hypot(
      warband.targetX - warband.x,
      warband.targetY - warband.y,
    );
    if (distance <= 2) return;
    const stateMultiplier =
      warband.state === "retreating"
        ? 1.12
        : warband.state === "chasing"
          ? 1.05
          : 1;
    const naturalMovementSpeed =
      warband.speed *
        getPartyInitiativeMultiplier(
          warband.roster.length ? warband.roster : warband.unitIds,
        ) *
        getTerrainMovementMultiplier(this.map, warband.x, warband.y) *
        stateMultiplier;
    const movementSpeed =
      warband.targetPlayer &&
      playerMovementSpeed &&
      playerMovementSpeed > 0
        ? warband.bountyHunter
          ? Math.max(naturalMovementSpeed, playerMovementSpeed * 1.04)
          : Math.min(
              naturalMovementSpeed,
              playerMovementSpeed * (warband.type === "lord" ? 0.98 : 0.95),
            )
        : naturalMovementSpeed;
    const travel = Math.min(
      movementSpeed * deltaHours,
      distance,
    );
    const nextPosition = this.moveEnemy(
      warband.x,
      warband.y,
      ((warband.targetX - warband.x) / distance) * travel,
      ((warband.targetY - warband.y) / distance) * travel,
    );
    warband.x = nextPosition.x;
    warband.y = nextPosition.y;
  }

  private startWarbandCaravanBattle(
    attacker: WorldWarbandState,
    trader: CaravanState,
  ): void {
    if (attacker.state === "fighting" || trader.state === "fighting") return;
    const battleId = `caravan_raid_${attacker.id}_${trader.id}_${Math.round(this.elapsedHours * 1000)}`;
    attacker.state = "fighting";
    attacker.activity = "fighting";
    attacker.activeBattleId = battleId;
    attacker.targetTraderId = trader.id;
    attacker.targetWarbandId = null;
    attacker.targetEnemyId = null;
    trader.state = "fighting";
    trader.attackerWarbandId = attacker.id;
    trader.battleHoursRemaining = 0.55 + Math.min(0.35, (trader.unitIds?.length ?? 0) * 0.04);
    this.recordChronicle(
      `${attacker.displayName ?? attacker.nameKey} attacked a ${trader.factionId ?? "neutral"} caravan.`,
      [attacker.factionId, ...(trader.factionId ? [trader.factionId] : [])],
    );
  }

  private updateWarbandCaravanBattles(
    deltaHours: number,
    traders: CaravanState[],
  ): void {
    for (const trader of traders) {
      if (trader.state !== "fighting" || !trader.attackerWarbandId) continue;
      const attacker = this.getWarband(trader.attackerWarbandId);
      if (!attacker || attacker.state === "destroyed") {
        trader.state = "traveling";
        trader.attackerWarbandId = null;
        trader.battleHoursRemaining = 0;
        continue;
      }
      trader.battleHoursRemaining = Math.max(0, (trader.battleHoursRemaining ?? 0.6) - deltaHours);
      if (trader.battleHoursRemaining > 0) continue;
      const attackerStrength = estimateWarbandStrength(attacker);
      const caravanStrength = this.estimateTraderStrength(trader);
      const attackerWins =
        attackerStrength * this.deterministicBattleVariance(attacker.id, trader.id) >
        caravanStrength * this.deterministicBattleVariance(trader.id, attacker.id);
      if (attackerWins) {
        const cargoUnits = trader.inventory.reduce((sum, stack) => sum + stack.quantity, 0);
        attacker.gold += Math.max(8, cargoUnits * 2);
        attacker.rations += Math.ceil(cargoUnits * 0.25);
        applyNpcAttrition(attacker, 0.14, `${attacker.activeBattleId}:winner`);
        syncWorldWarbandParty(attacker);
        trader.inventory = [];
        trader.state = "destroyed";
        trader.respawnHoursRemaining = 36;
        this.recordChronicle(
          `${attacker.displayName ?? attacker.nameKey} destroyed and plundered a caravan.`,
          [attacker.factionId, ...(trader.factionId ? [trader.factionId] : [])],
        );
      } else {
        const losses = applyNpcAttrition(attacker, 0.72, `${attacker.activeBattleId}:loser`);
        syncWorldWarbandParty(attacker);
        const attackerDestroyed =
          attacker.roster.length === 0 ||
          losses.length >= Math.max(3, attacker.unitIds.length * 0.6);
        if (attackerDestroyed) {
          this.defeatWarband(attacker.id);
        } else {
          attacker.state = attacker.hpRatio < 0.48 ? "returning" : "patrolling";
          attacker.activity = attacker.state === "returning" ? "retreating" : "patrolling";
          attacker.activeBattleId = null;
          attacker.targetTraderId = null;
        }
        trader.state = "traveling";
        this.recordChronicle(
          "A caravan escort repelled an attacking warband.",
          [attacker.factionId, ...(trader.factionId ? [trader.factionId] : [])],
        );
      }
      if (attackerWins) {
        attacker.state = attacker.hpRatio < 0.48 ? "returning" : "patrolling";
        attacker.activity = attacker.state === "returning" ? "retreating" : "patrolling";
        attacker.activeBattleId = null;
        attacker.targetTraderId = null;
      }
      trader.attackerWarbandId = null;
      trader.battleHoursRemaining = 0;
      this.recordBattleSite(trader.x, trader.y);
    }
  }

  private startWarbandBattle(
    attacker: WorldWarbandState,
    defender: WorldWarbandState,
  ): void {
    if (attacker.state === "fighting" || defender.state === "fighting") return;
    const battleId = `warband_battle_${attacker.id}_${defender.id}_${Math.round(this.elapsedHours * 1000)}`;
    attacker.state = "fighting";
    defender.state = "fighting";
    attacker.activity = "fighting";
    defender.activity = "fighting";
    attacker.activeBattleId = battleId;
    defender.activeBattleId = battleId;
    attacker.targetWarbandId = defender.id;
    attacker.targetEnemyId = null;
    defender.targetWarbandId = attacker.id;
    defender.targetEnemyId = null;
    this.state.warbandBattles.push({
      id: battleId,
      attackerId: attacker.id,
      defenderId: defender.id,
      enemyId: null,
      x: (attacker.x + defender.x) / 2,
      y: (attacker.y + defender.y) / 2,
      remainingHours: NPC_BATTLE_DURATION_HOURS,
      sideA: {
        warbandIds: [attacker.id],
        enemyIds: [],
      },
      sideB: {
        warbandIds: [defender.id],
        enemyIds: [],
      },
      state: "fighting",
      victorId: null,
      playerJoined: false,
    });
  }

  private getPursuitTarget(
    warband: WorldWarbandState,
  ): { x: number; y: number } | null {
    if (warband.targetWarbandId) {
      const target = this.getWarband(warband.targetWarbandId);
      if (!target || target.state === "destroyed" || target.state === "fighting") {
        return null;
      }
      return target;
    }
    if (warband.targetEnemyId) {
      const target = this.state.enemies.find(
        (enemy) =>
          enemy.id === warband.targetEnemyId &&
          enemy.active &&
          !enemy.activeBattleId,
      );
      return target ?? null;
    }
    return null;
  }

  private startWarbandEnemyBattle(
    warband: WorldWarbandState,
    enemy: WorldEnemyState,
  ): void {
    if (
      warband.state === "destroyed" ||
      warband.state === "fighting" ||
      enemy.activeBattleId
    ) return;
    const battleId = `warband_enemy_${warband.id}_${enemy.id}_${Math.round(this.elapsedHours * 1000)}`;
    warband.state = "fighting";
    warband.activity = "fighting";
    enemy.activity = "fighting";
    warband.activeBattleId = battleId;
    warband.targetEnemyId = enemy.id;
    warband.targetWarbandId = null;
    enemy.activeBattleId = battleId;
    enemy.targetWarbandId = warband.id;
    enemy.targetTraderId = null;
    this.state.warbandBattles.push({
      id: battleId,
      attackerId: warband.id,
      defenderId: null,
      enemyId: enemy.id,
      x: (warband.x + enemy.x) / 2,
      y: (warband.y + enemy.y) / 2,
      sideA: {
        warbandIds: [warband.id],
        enemyIds: [],
      },
      sideB: {
        warbandIds: [],
        enemyIds: [enemy.id],
      },
      remainingHours: NPC_BATTLE_DURATION_HOURS,
      state: "fighting",
      victorId: null,
      playerJoined: false,
    });
  }

  private resolveWarbandEnemyBattle(
    battle: WorldWarbandBattleState,
    warband: WorldWarbandState,
    enemy: WorldEnemyState,
  ): void {
    const result = simulateNpcEnemyBattle(
      warband,
      enemy,
      this.estimateEnemySpawnStrength(enemy),
    );
    enemy.activeBattleId = null;
    enemy.targetWarbandId = null;
    if (result.warbandWins) {
      applyNpcAttrition(warband, 0.18 + (1 - result.warbandHpRatio) * 0.4, battle.id);
      const enemyLosses = applyNpcAttrition(enemy, 1, `${battle.id}:enemy`);
      const stolenGold = Math.min(enemy.gold, 10 + enemyLosses.length * 4);
      enemy.gold -= stolenGold;
      const victoryXp = 26 + enemy.threat * 6;
      rewardNpcVictory(warband, enemyLosses, battle.id, victoryXp, stolenGold);
      syncWorldWarbandParty(warband);
      this.defeatEnemy(enemy.id);
      warband.hpRatio = npcRosterHpRatio(warband.roster);
      warband.experience += victoryXp;
      warband.state =
        warband.hpRatio < this.getWarbandRetreatHp(warband)
          ? "returning"
          : "patrolling";
      warband.activity =
        warband.state === "returning" ? "retreating" : "patrolling";
      warband.targetPlayer = false;
      battle.victorId = warband.id;
    } else {
      const warbandLosses = applyNpcAttrition(warband, result.warbandDestroyed ? 1 : 0.68, `${battle.id}:warband`);
      applyNpcAttrition(enemy, 0.24, battle.id);
      const stolenGold = Math.min(
        warband.gold,
        8 + warbandLosses.length * 4,
      );
      rewardNpcVictory(
        enemy,
        warbandLosses,
        battle.id,
        this.getNpcVictoryXp(warbandLosses, 28),
        0,
      );
      enemy.lootValue += stolenGold;
      warband.gold = Math.max(0, warband.gold - stolenGold);
      syncWorldWarbandParty(warband);
      enemy.partySize = enemy.roster.length;
      warband.hpRatio = npcRosterHpRatio(warband.roster);
      const destroyed =
        Boolean(warband.bountyHunter) ||
        result.warbandDestroyed ||
        warband.roster.length === 0;
      warband.state = destroyed ? "destroyed" : "retreating";
      warband.activity = "retreating";
      warband.respawnRemainingHours =
        warband.state === "destroyed" ? warband.respawnHours : 0;
      warband.targetPlayer = false;
      if (destroyed && warband.bountyHunter) {
        warband.bountyHunterDeployed = false;
      }
      battle.victorId = enemy.id;
    }
    warband.activeBattleId = null;
    warband.targetEnemyId = null;
    warband.targetWarbandId = null;
    battle.state = "resolved";
    battle.remainingHours = 0;
    this.recordBattleSite(battle.x, battle.y);
    this.recordChronicle(
      result.warbandWins
        ? `${warband.displayName ?? warband.nameKey} cleared a hostile roaming party.`
        : `${warband.displayName ?? warband.nameKey} was driven back by a roaming party.`,
      [warband.factionId],
    );
  }

  private resolveGroupedNpcBattle(
    battle: WorldWarbandBattleState,
  ): void {
    const sideAStrength = this.getBattleSideStrength(battle.sideA);
    const sideBStrength = this.getBattleSideStrength(battle.sideB);
    const sideAWins =
      sideAStrength * this.deterministicBattleVariance(battle.id, "sideA") >=
      sideBStrength * this.deterministicBattleVariance(battle.id, "sideB");
    const winningSide = sideAWins ? battle.sideA : battle.sideB;
    const losingSide = sideAWins ? battle.sideB : battle.sideA;
    const defeatedCards: CardInstance[] = [];

    for (const warbandId of losingSide.warbandIds) {
      const warband = this.getWarband(warbandId);
      if (!warband) continue;
      defeatedCards.push(
        ...applyNpcAttrition(
          warband,
          0.7,
          `${battle.id}:loser:${warband.id}`,
        ),
      );
      syncWorldWarbandParty(warband);
      warband.activeBattleId = null;
      warband.targetWarbandId = null;
      warband.targetEnemyId = null;
      warband.targetPlayer = false;
      if (warband.roster.length === 0) {
        this.defeatWarband(warband.id);
      } else {
        warband.state = "retreating";
        warband.activity = "retreating";
      }
    }
    for (const enemyId of losingSide.enemyIds) {
      const enemy = this.enemiesById.get(enemyId);
      if (!enemy) continue;
      defeatedCards.push(
        ...applyNpcAttrition(enemy, 1, `${battle.id}:loser:${enemy.id}`),
      );
      this.defeatEnemy(enemy.id);
    }

    for (const warbandId of winningSide.warbandIds) {
      const warband = this.getWarband(warbandId);
      if (!warband) continue;
      applyNpcAttrition(warband, 0.18, `${battle.id}:winner:${warband.id}`);
      rewardNpcVictory(
        warband,
        defeatedCards,
        battle.id,
        this.getNpcVictoryXp(defeatedCards, 30),
        0,
      );
      syncWorldWarbandParty(warband);
      warband.activeBattleId = null;
      warband.targetWarbandId = null;
      warband.targetEnemyId = null;
      warband.targetPlayer = false;
      warband.state =
        warband.hpRatio < this.getWarbandRetreatHp(warband)
          ? "returning"
          : "patrolling";
      warband.activity =
        warband.state === "returning" ? "retreating" : "patrolling";
    }
    for (const enemyId of winningSide.enemyIds) {
      const enemy = this.enemiesById.get(enemyId);
      if (!enemy) continue;
      applyNpcAttrition(enemy, 0.18, `${battle.id}:winner:${enemy.id}`);
      rewardNpcVictory(
        enemy,
        defeatedCards,
        battle.id,
        this.getNpcVictoryXp(defeatedCards, 28),
        0,
      );
      enemy.partySize = enemy.roster.length;
      enemy.activeBattleId = null;
      enemy.targetWarbandId = null;
      enemy.targetTraderId = null;
      enemy.activity =
        npcRosterHpRatio(enemy.roster) < NPC_RETREAT_HP
          ? "retreating"
          : "patrolling";
    }

    battle.state = "resolved";
    battle.remainingHours = 0;
    battle.victorId =
      winningSide.warbandIds[0] ?? winningSide.enemyIds[0] ?? null;
    this.recordBattleSite(battle.x, battle.y);
    this.recordChronicle(
      sideAWins
        ? "The first host prevailed in a growing field battle."
        : "The opposing host prevailed in a growing field battle.",
      winningSide.warbandIds
        .map((id) => this.getWarband(id)?.factionId)
        .filter((id): id is WorldWarbandState["factionId"] => Boolean(id)),
    );
  }

  private getBattleSideStrength(
    side: WorldWarbandBattleState["sideA"],
  ): number {
    return (
      side.warbandIds.reduce(
        (total, id) => {
          const warband = this.getWarband(id);
          return total + (warband ? estimateWarbandStrength(warband) : 0);
        },
        0,
      ) +
      side.enemyIds.reduce(
        (total, id) => {
          const enemy = this.enemiesById.get(id);
          return total + (enemy ? this.estimateEnemySpawnStrength(enemy) : 0);
        },
        0,
      )
    );
  }

  private estimateEnemySpawnStrength(enemy: WorldEnemyState): number {
    if (enemy.sourceLocationId && enemy.roster.length > 0) {
      const leaderId = enemiesById.get(enemy.archetypeId)?.leaderCardId;
      const leaderStrength = leaderId
        ? estimateNpcRosterStrength([{
            uid: `${enemy.id}:leader`,
            cardId: leaderId,
            currentHp: getCardDefinition(leaderId).maxHp,
            level: Math.max(1, enemy.threat),
            xp: 0,
          }]) * 0.5
        : 0;
      return Math.max(
        estimateNpcRosterStrength(enemy.roster) + leaderStrength,
        2200 + enemy.threat * 2600 + enemy.roster.length * 300,
      );
    }
    return (2600 + enemy.threat * 3100 + enemy.partySize * 420) * (enemy.active ? 1 : 0);
  }

  private getNpcVictoryXp(defeated: CardInstance[], baseXp: number): number {
    return Math.min(
      60,
      baseXp +
        defeated.reduce(
          (total, unit) => total + getCardDefinition(unit.cardId).tier * 2,
          0,
        ),
    );
  }

  getEnemyThreatPoints(enemy: WorldEnemyState): number {
    const leaderId = enemiesById.get(enemy.archetypeId)?.leaderCardId;
    return (
      getNpcRosterThreatPoints(enemy.roster) +
      (leaderId ? getUnitThreatPoints(leaderId) : 0)
    );
  }

  getEnemyThreatRating(enemy: WorldEnemyState): number {
    return getNpcThreatRatingFromPoints(this.getEnemyThreatPoints(enemy));
  }

  getWarbandThreatPoints(warband: WorldWarbandState): number {
    return (
      getNpcRosterThreatPoints(warband.roster) +
      (warband.leaderCardId ? getUnitThreatPoints(warband.leaderCardId) : 0)
    );
  }

  getWarbandThreatRating(warband: WorldWarbandState): number {
    return getNpcThreatRatingFromPoints(this.getWarbandThreatPoints(warband));
  }

  private getEnemyAttackThreshold(warband: WorldWarbandState): number {
    const type = warband.type;
    const base = type === "lord" ? 0.84
      : type === "army" || type === "elite" ? 0.72
      : type === "patrol" ? 0.9
      : type === "militia" ? 1.05
      : type === "scout" ? 1.35
      : 1.2;
    if (warband.personality === "aggressive") return base - 0.12;
    if (warband.personality === "ambitious") return base - 0.06;
    if (warband.personality === "cautious") return base + 0.18;
    return base - 0.03;
  }

  private getWarbandRetreatHp(warband: WorldWarbandState): number {
    return warband.type === "lord" ? LORD_RETREAT_HP : NPC_RETREAT_HP;
  }

  private getWarbandRecoveryHp(warband: WorldWarbandState): number {
    return warband.type === "lord" ? LORD_RECOVERY_HP : NPC_RECOVERY_HP;
  }

  private isEnemyThreateningFactionTerritory(
    enemy: WorldEnemyState,
    factionId: WorldWarbandState["factionId"],
    factionState?: FactionState,
  ): boolean {
    if (!factionState) return false;
    return this.map.locations.some(
      (location) =>
        ["city", "village", "castle"].includes(location.type) &&
        factionState.locationFactions[location.id] === factionId &&
        Math.hypot(enemy.x - location.x, enemy.y - location.y) <=
          LORD_TERRITORY_THREAT_RADIUS,
    );
  }

  private isEnemyInsideProtectedCamp(enemy: WorldEnemyState): boolean {
    const camp =
      (enemy.sourceLocationId
        ? this.locationsById.get(enemy.sourceLocationId)
        : null) ?? this.findNearestCompatibleCamp(enemy);
    return Boolean(
      camp &&
        camp.type === "dungeon" &&
        this.isCompatibleEnemyCamp(enemy, camp) &&
        Math.hypot(enemy.x - camp.x, enemy.y - camp.y) <=
          camp.radius + CAMP_ASSAULT_EXCLUSION_MARGIN,
    );
  }

  private findBanditWarbandTarget(
    enemy: WorldEnemyState,
  ): WorldWarbandState | null {
    const enemyStrength = this.estimateEnemySpawnStrength(enemy);
    let selected: WorldWarbandState | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const warband of this.state.warbands) {
      if (
        warband.type !== "lord" ||
        warband.state === "destroyed" ||
        warband.state === "fighting" ||
        warband.activeBattleId ||
        warband.hpRatio >= 0.75
      ) {
        continue;
      }
      const distance = Math.hypot(warband.x - enemy.x, warband.y - enemy.y);
      if (distance > BANDIT_LORD_HUNT_RADIUS) continue;
      const warbandStrength = estimateWarbandStrength(warband);
      const requiredRatio =
        warband.hpRatio < 0.4 ? 0.62 : warband.hpRatio < 0.55 ? 0.75 : 0.9;
      if (enemyStrength < warbandStrength * requiredRatio) continue;
      const score =
        distance *
        Math.max(0.25, warband.hpRatio) *
        Math.max(0.5, warbandStrength / Math.max(1, enemyStrength));
      if (score >= bestScore) continue;
      selected = warband;
      bestScore = score;
    }
    return selected;
  }

  private findBanditBattleToJoin(
    enemy: WorldEnemyState,
  ): WorldWarbandBattleState | null {
    let selected: WorldWarbandBattleState | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const battle of this.state.warbandBattles) {
      if (
        battle.state !== "fighting" ||
        battle.playerJoined ||
        battle.sideA.enemyIds.includes(enemy.id) ||
        battle.sideB.enemyIds.includes(enemy.id)
      ) {
        continue;
      }
      const banditSide =
        battle.sideA.enemyIds.length > 0
          ? battle.sideA
          : battle.sideB.enemyIds.length > 0
            ? battle.sideB
            : null;
      const opposingSide =
        banditSide === battle.sideA ? battle.sideB : battle.sideA;
      if (
        !banditSide ||
        !opposingSide.warbandIds.some(
          (id) => this.warbandsById.get(id)?.type === "lord",
        )
      ) {
        continue;
      }
      const distance = Math.hypot(battle.x - enemy.x, battle.y - enemy.y);
      if (distance > BANDIT_LORD_HUNT_RADIUS || distance >= bestDistance) {
        continue;
      }
      selected = battle;
      bestDistance = distance;
    }
    return selected;
  }

  private joinEnemyBattle(
    enemy: WorldEnemyState,
    battle: WorldWarbandBattleState,
  ): void {
    if (enemy.activeBattleId || battle.state !== "fighting") return;
    const side =
      battle.sideA.enemyIds.length > 0 ? battle.sideA : battle.sideB;
    if (!side.enemyIds.includes(enemy.id)) side.enemyIds.push(enemy.id);
    enemy.activeBattleId = battle.id;
    enemy.targetTraderId = null;
    enemy.targetWarbandId = null;
    enemy.activity = "fighting";
    battle.remainingHours = Math.max(
      battle.remainingHours,
      NPC_BATTLE_DURATION_HOURS * 0.65,
    );
  }

  private deterministicBattleVariance(left: string, right: string): number {
    return 0.88 + Math.floor(this.hash(`${left}:${right}`) * 27) / 100;
  }

  private findMonsterRaidTarget(
    enemy: WorldEnemyState,
    traders: CaravanState[],
  ): CaravanState | null {
    let selected: CaravanState | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    const searchRadius = Math.max(
      BANDIT_TRADER_RAID_RADIUS,
      enemy.aggroRadius * 2.2,
    );
    for (const trader of traders) {
      if (
        trader.state === "destroyed" ||
        trader.state === "fighting" ||
        (trader.waitHoursRemaining ?? 0) > 0
      ) {
        continue;
      }
      if (this.state.monsterRaids.some((raid) => raid.state === "fighting" && raid.traderId === trader.id)) {
        continue;
      }
      const distance = Math.hypot(trader.x - enemy.x, trader.y - enemy.y);
      if (distance > searchRadius || distance >= bestDistance) continue;
      selected = trader;
      bestDistance = distance;
    }
    return selected;
  }

  private startMonsterRaid(enemy: WorldEnemyState, trader: CaravanState): void {
    if (enemy.activeBattleId) return;
    const raidId = `monster_raid_${enemy.id}_${trader.id}_${Math.round(this.elapsedHours * 1000)}`;
    enemy.activeBattleId = raidId;
    enemy.targetTraderId = trader.id;
    enemy.targetWarbandId = null;
    enemy.activity = "fighting";
    this.state.monsterRaids.push({
      id: raidId,
      enemyId: enemy.id,
      traderId: trader.id,
      x: (enemy.x + trader.x) / 2,
      y: (enemy.y + trader.y) / 2,
      remainingHours: trader.kind === "caravan" ? 0.5 : 0.36,
      state: "fighting",
      victor: null,
    });
  }

  private updateMonsterRaids(
    deltaHours: number,
    traders: CaravanState[],
  ): void {
    for (const raid of this.state.monsterRaids) {
      if (raid.state !== "fighting") continue;
      const enemy = this.state.enemies.find((candidate) => candidate.id === raid.enemyId);
      const trader = traders.find((candidate) => candidate.id === raid.traderId);
      if (!enemy || !enemy.active || !trader) {
        raid.state = "resolved";
        if (enemy) {
          enemy.activeBattleId = null;
          enemy.targetTraderId = null;
        }
        continue;
      }
      raid.x = (enemy.x + trader.x) / 2;
      raid.y = (enemy.y + trader.y) / 2;
      raid.remainingHours -= deltaHours;
      if (raid.remainingHours > 0) continue;

      const enemyStrength = this.estimateEnemySpawnStrength(enemy);
      const traderStrength = this.estimateTraderStrength(trader);
      const monsterWins =
        enemyStrength * this.deterministicBattleVariance(enemy.id, trader.id) >
        traderStrength * this.deterministicBattleVariance(trader.id, enemy.id);
      if (monsterWins) {
        const stolen = this.damageTraderCargo(trader, 0.45 + Math.min(0.4, enemy.threat * 0.08));
        applyNpcAttrition(enemy, 0.12, raid.id);
        enemy.lootValue += Math.max(4, stolen * 2);
        rewardNpcVictory(
          enemy,
          [],
          raid.id,
          22 + enemy.threat * 4,
          0,
        );
        enemy.rations += stolen;
        enemy.partySize = enemy.roster.length;
        if (trader.kind === "caravan") {
          trader.inventory = [];
          trader.state = "destroyed";
          trader.respawnHoursRemaining = 36;
          trader.attackerWarbandId = null;
          trader.battleHoursRemaining = 0;
        }
        raid.victor = "monster";
        this.monsterRaidCooldowns.set(enemy.id, 1.2);
      } else {
        applyNpcAttrition(enemy, 1, raid.id);
        this.defeatEnemy(enemy.id);
        raid.victor = "trader";
      }
      enemy.activeBattleId = null;
      enemy.targetTraderId = null;
      enemy.targetWarbandId = null;
      enemy.activity = enemy.active ? "retreating" : "recovering";
      raid.state = "resolved";
      raid.remainingHours = 0;
      this.recordBattleSite(raid.x, raid.y);
      this.recordChronicle(monsterWins
        ? "A roaming camp party plundered travelers on the road."
        : "Travelers drove off a roaming camp party.");
    }
    this.state.monsterRaids = this.state.monsterRaids.filter(
      (raid) =>
        raid.state === "fighting" ||
        Math.hypot(raid.x - this.state.x, raid.y - this.state.y) <= 900,
    );
  }

  private estimateTraderStrength(trader: CaravanState): number {
    const cargo = trader.inventory.reduce((sum, stack) => sum + stack.quantity, 0);
    return trader.kind === "caravan"
      ? 7200 + cargo * 180
      : 2600 + cargo * 95;
  }

  private updateMonsterRaidCooldowns(deltaHours: number): void {
    for (const [enemyId, remaining] of this.monsterRaidCooldowns) {
      const next = remaining - deltaHours;
      if (next <= 0) this.monsterRaidCooldowns.delete(enemyId);
      else this.monsterRaidCooldowns.set(enemyId, next);
    }
  }

  private damageTraderCargo(trader: CaravanState, ratio: number): number {
    let totalLost = 0;
    for (let index = trader.inventory.length - 1; index >= 0; index -= 1) {
      const stack = trader.inventory[index];
      const lost = Math.max(1, Math.floor(stack.quantity * ratio));
      totalLost += Math.min(stack.quantity, lost);
      stack.quantity = Math.max(0, stack.quantity - lost);
      if (stack.supply !== undefined) stack.supply = Math.max(0, stack.supply * (1 - ratio));
      if (stack.quantity <= 0) trader.inventory.splice(index, 1);
    }
    return totalLost;
  }

  private getDungeonSite(locationId: string): DungeonSiteState | null {
    return (
      this.state.dungeonSites.find((site) => site.locationId === locationId) ??
      null
    );
  }

  private findNearestCompatibleCamp(
    enemy: WorldEnemyState,
  ): MapLocation | null {
    const source = enemy.sourceLocationId
      ? this.locationsById.get(enemy.sourceLocationId)
      : null;
    const biome = source?.spawnProfile?.biome;
    if (!biome) return source ?? null;
    let nearest: MapLocation | null = null;
    let nearestDistanceSquared = Number.POSITIVE_INFINITY;
    for (const location of this.map.locations) {
      if (
        location.type !== "dungeon" ||
        location.spawnProfile?.biome !== biome ||
        !this.isDungeonActive(location.id)
      ) {
        continue;
      }
      const deltaX = location.x - enemy.x;
      const deltaY = location.y - enemy.y;
      const distanceSquared = deltaX * deltaX + deltaY * deltaY;
      if (distanceSquared >= nearestDistanceSquared) continue;
      nearest = location;
      nearestDistanceSquared = distanceSquared;
    }
    return nearest;
  }

  private isCompatibleEnemyCamp(
    enemy: WorldEnemyState,
    location: MapLocation,
  ): boolean {
    const source = enemy.sourceLocationId
      ? this.locationsById.get(enemy.sourceLocationId)
      : null;
    return Boolean(
      location.type === "dungeon" &&
        source?.spawnProfile?.biome &&
        location.spawnProfile?.biome === source.spawnProfile.biome,
    );
  }

  private relocateWarbandsAwayFromPlayer(radius: number): void {
    for (const warband of this.state.warbands) {
      if (
        warband.state === "destroyed" ||
        warband.state === "fighting" ||
        Math.hypot(warband.x - this.state.x, warband.y - this.state.y) >= radius
      ) {
        continue;
      }
      const phase = this.hash(`${warband.id}:safe-spawn`) * Math.PI * 2;
      let relocated: { x: number; y: number } | null = null;
      for (let attempt = 0; attempt < 18; attempt += 1) {
        const angle = phase + attempt * 0.82;
        const distance = radius + 240 + attempt * 55;
        const candidate = {
          x: this.state.x + Math.cos(angle) * distance,
          y: this.state.y + Math.sin(angle) * distance,
        };
        if (isWorldPositionTraversable(this.map, candidate.x, candidate.y, 24)) {
          relocated = candidate;
          break;
        }
      }
      if (!relocated) {
        relocated = findNearestTraversablePosition(
          this.map,
          warband.spawnX,
          warband.spawnY,
          24,
        );
      }
      warband.x = relocated.x;
      warband.y = relocated.y;
      if (Math.hypot(warband.spawnX - this.state.x, warband.spawnY - this.state.y) < radius) {
        warband.spawnX = relocated.x;
        warband.spawnY = relocated.y;
      }
      warband.targetX = relocated.x;
      warband.targetY = relocated.y;
      warband.targetWarbandId = null;
      warband.targetEnemyId = null;
      warband.activeBattleId = null;
      warband.state = warband.patrolPoints?.length ? "patrolling" : "idle";
    }
  }

  private moveEnemy(
    x: number,
    y: number,
    travelX: number,
    travelY: number,
  ): { x: number; y: number } {
    const detourAngles = [
      0,
      Math.PI / 6,
      -Math.PI / 6,
      Math.PI / 3,
      -Math.PI / 3,
      Math.PI / 2,
      -Math.PI / 2,
    ];
    for (const angle of detourAngles) {
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const candidateX = x + travelX * cosine - travelY * sine;
      const candidateY = y + travelX * sine + travelY * cosine;
      if (this.isEnemyMoveTraversable(x, y, candidateX, candidateY)) {
        return { x: candidateX, y: candidateY };
      }
    }
    return { x, y };
  }

  private moveEnemyAlongRoute(
    enemyId: string,
    x: number,
    y: number,
    targetX: number,
    targetY: number,
    travel: number,
  ): { x: number; y: number } {
    let route = this.enemyNavigationRoutes.get(enemyId);
    const targetMoved = !route ||
      Math.hypot(targetX - route.targetX, targetY - route.targetY) > 180;
    const routeFinished = !route || route.waypointIndex >= route.waypoints.length;
    const needsReplan =
      targetMoved ||
      routeFinished ||
      (route?.blockedUpdates ?? 0) >= 8;
    if (needsReplan) {
      route = {
        targetX,
        targetY,
        waypoints: findWorldPath(
          this.map,
          { x, y },
          { x: targetX, y: targetY },
          {
            cellSize: 96,
            unitRadius: 24,
            roadPreference: 1.65,
            directPathMaxDistance: 160,
            searchMargin: 800,
          },
        ),
        waypointIndex: 0,
        blockedUpdates: 0,
      };
      this.enemyNavigationRoutes.set(enemyId, route);
    }
    if (!route) return { x, y };
    const activeRoute = route;

    let position = { x, y };
    let remainingTravel = travel;
    let movedDistance = 0;
    for (
      let step = 0;
      step < 12 &&
      remainingTravel > 0.01 &&
      activeRoute.waypointIndex < activeRoute.waypoints.length;
      step += 1
    ) {
      const waypoint = activeRoute.waypoints[activeRoute.waypointIndex];
      const distance = Math.hypot(
        waypoint.x - position.x,
        waypoint.y - position.y,
      );
      if (distance <= 18) {
        activeRoute.waypointIndex += 1;
        continue;
      }
      const stepTravel = Math.min(remainingTravel, distance);
      const next = this.moveEnemy(
        position.x,
        position.y,
        ((waypoint.x - position.x) / distance) * stepTravel,
        ((waypoint.y - position.y) / distance) * stepTravel,
      );
      const moved = Math.hypot(next.x - position.x, next.y - position.y);
      if (moved < 0.25) break;
      position = next;
      movedDistance += moved;
      remainingTravel -= moved;
      if (moved >= distance - 0.5) activeRoute.waypointIndex += 1;
    }

    activeRoute.blockedUpdates = movedDistance < Math.min(0.5, travel * 0.2)
      ? activeRoute.blockedUpdates + 1
      : 0;
    if (activeRoute.waypointIndex >= activeRoute.waypoints.length) {
      this.enemyNavigationRoutes.delete(enemyId);
    }
    return position;
  }

  private isEnemyMoveTraversable(
    startX: number,
    startY: number,
    targetX: number,
    targetY: number,
  ): boolean {
    const distance = Math.hypot(targetX - startX, targetY - startY);
    const steps = Math.max(1, Math.ceil(distance / 12));
    for (let step = 1; step <= steps; step += 1) {
      const progress = step / steps;
      if (!isWorldPositionTraversable(
        this.map,
        startX + (targetX - startX) * progress,
        startY + (targetY - startY) * progress,
        24,
      )) {
        return false;
      }
    }
    return true;
  }

  private hash(value: string): number {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 31 + value.charCodeAt(index)) | 0;
    }
    return Math.abs(hash % 1000) / 100;
  }
}
