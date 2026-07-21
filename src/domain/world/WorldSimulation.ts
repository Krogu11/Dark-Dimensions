import type {
  MapLocation,
  WorldEnemySpawn,
  WorldMapDefinition,
} from "../content/schemas";
import type { CaravanState } from "../economy/Economy";
import { getCardDefinition, type CardInstance } from "../cards/CardInstance";
import type { FactionState } from "../quests/Factions";
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
  normalizeNpcRoster,
  npcRosterHpRatio,
  processNpcRecovery,
  resetNpcParty,
  rewardNpcVictory,
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

export const WORLD_DISCOVERY_CELL_SIZE = 360;

export interface WorldEnemyState extends WorldEnemySpawn {
  spawnX: number;
  spawnY: number;
  active: boolean;
  respawnHours: number;
  activeBattleId: string | null;
  targetTraderId: string | null;
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

export class WorldSimulation {
  readonly state: WorldState;
  private elapsedHours = 0;
  private warbandScanHours = 0;
  private monsterRaidCooldowns = new Map<string, number>();
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
          roster: normalizeNpcRoster(enemy.id, saved?.roster, sourceCards, Math.max(4, sourceCards.length)),
          gold: saved?.gold ?? 24 + enemy.threat * 8,
          rations: saved?.rations ?? Math.max(8, sourceCards.length * 3),
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
    this.updateWarbandBattles(deltaHours);
    this.warbandScanHours += deltaHours;
    const shouldScan = this.warbandScanHours >= 0.16;
    if (shouldScan) this.warbandScanHours = 0;

    for (const warband of this.state.warbands) {
      if (warband.state === "destroyed") {
        this.updateDestroyedWarband(warband, deltaHours);
        continue;
      }
      if (warband.state === "fighting") continue;

      const atHome = Math.hypot(warband.x - warband.spawnX, warband.y - warband.spawnY) <= 70;
      const homeProsperity = warband.homeLocationId
        ? logistics.prosperityByLocationId?.[warband.homeLocationId] ?? 50
        : 45;
      const personalityCapacity = warband.type === "lord" && warband.personality === "ambitious" ? 2
        : warband.type === "lord" && warband.personality === "cautious" ? -1
        : 0;
      const rankCapacity = warband.nobleRank === "king" ? 4 : warband.nobleRank === "baron" ? 2 : 0;
      const recovery = processNpcRecovery(
        warband.id,
        warband,
        warband.recruitmentCardIds,
        warband.type === "lord"
          ? Math.min(28, 8 + warband.leaderLevel * 2 + personalityCapacity + rankCapacity)
          : 12,
        deltaHours,
        atHome,
        {
          prosperity: homeProsperity,
          canRecruit: !warband.homeLocationId || !logistics.blockedLocationIds?.includes(warband.homeLocationId),
          prisonerPolicy: "ransom",
        },
      );
      syncWorldWarbandParty(warband);
      if (warband.roster.length === 0) {
        this.defeatWarband(warband.id);
        continue;
      }

      if (shouldScan) {
        this.updateWarbandIntent(warband, factionState);
      }

      this.updateWarbandTarget(warband);
      this.updateWarbandActivity(warband, atHome, recovery);
      this.moveWarband(warband, deltaHours);

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
    warband.targetPlayer = false;
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
    }
    battle.state = "resolved";
    battle.victorId = alliedWarbandId;
    battle.remainingHours = 0;
    this.recordBattleSite(battle.x, battle.y);
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
      const sourceIsActive = enemy.sourceLocationId
        ? this.isDungeonActive(enemy.sourceLocationId)
        : true;
      if (!enemy.active) {
        enemy.activity = "recovering";
        enemy.respawnHours -= deltaHours;
        if (enemy.respawnHours <= 0 && sourceIsActive) {
          this.resetEnemyParty(enemy);
          enemy.active = true;
          enemy.x = enemy.spawnX;
          enemy.y = enemy.spawnY;
          enemy.activeBattleId = null;
          enemy.targetTraderId = null;
          enemy.activity = "recruiting";
        }
        continue;
      }
      if (!sourceIsActive) {
        enemy.active = false;
        enemy.respawnHours = Number.POSITIVE_INFINITY;
        enemy.activeBattleId = null;
        enemy.targetTraderId = null;
        enemy.activity = "idle";
        continue;
      }
      if (enemy.activeBattleId) continue;

      if (enemy.sourceLocationId) {
        const sourceCards = enemiesById.get(enemy.archetypeId)?.deck ?? [];
        const recovery = processNpcRecovery(
          enemy.id,
          enemy,
          sourceCards,
          Math.min(16, 6 + enemy.threat * 2),
          deltaHours,
          Math.hypot(enemy.x - enemy.spawnX, enemy.y - enemy.spawnY) <= 70,
          { prosperity: 45, prisonerPolicy: "recruit" },
        );
        enemy.partySize = enemy.roster.length;
        if (recovery.recruited > 0) enemy.activity = "recruiting";
        else if (recovery.healed) enemy.activity = "recovering";
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
        !playerIsSafe &&
        playerThreat - enemyThreat >= 3 &&
        distanceToPlayer <= effectiveAggroRadius * 1.15;
      const shouldPursue =
        !playerIsSafe &&
        !shouldFlee &&
        distanceToPlayer <= effectiveAggroRadius;
      let targetX = enemy.spawnX;
      let targetY = enemy.spawnY;

      if (shouldFlee) {
        enemy.activity = "retreating";
        const distance = Math.max(1, distanceToPlayer);
        targetX = enemy.x + ((enemy.x - this.state.x) / distance) * 260;
        targetY = enemy.y + ((enemy.y - this.state.y) / distance) * 260;
      } else if (shouldPursue) {
        enemy.activity = "huntingPlayer";
        targetX = this.state.x;
        targetY = this.state.y;
      } else {
        const traderTarget = this.monsterRaidCooldowns.has(enemy.id)
          ? null
          : this.findMonsterRaidTarget(enemy, traders);
        if (traderTarget) {
          enemy.activity = "raiding";
          targetX = traderTarget.x;
          targetY = traderTarget.y;
          enemy.targetTraderId = traderTarget.id;
        } else {
          if (enemy.activity !== "recovering" && enemy.activity !== "recruiting") enemy.activity = "patrolling";
          enemy.targetTraderId = null;
          const phase = this.hash(enemy.id) + this.elapsedHours * 0.38;
          targetX += Math.cos(phase) * 125;
          targetY += Math.sin(phase * 0.83) * 125;
        }
      }

      const distanceToTarget = Math.hypot(targetX - enemy.x, targetY - enemy.y);
      if (distanceToTarget > 2) {
        const travel = Math.min(
          enemy.speed *
            getTerrainMovementMultiplier(this.map, enemy.x, enemy.y) *
            (shouldFlee ? 1.08 : 1) *
            deltaHours,
          distanceToTarget,
        );
        const travelX = ((targetX - enemy.x) / distanceToTarget) * travel;
        const travelY = ((targetY - enemy.y) / distanceToTarget) * travel;
        const nextPosition = this.moveEnemy(enemy.x, enemy.y, travelX, travelY);
        enemy.x = nextPosition.x;
        enemy.y = nextPosition.y;
      }

      const finalDistanceToPlayer = Math.hypot(
        this.state.x - enemy.x,
        this.state.y - enemy.y,
      );
      if (shouldPursue && finalDistanceToPlayer <= 34) return enemy.id;

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
    enemy.activity = "recovering";
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
      Math.max(4, Math.min(7, 3 + enemy.threat)),
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
      site.active = true;
      site.respawnHours = 0;
      for (const enemy of this.state.enemies) {
        if (enemy.sourceLocationId !== site.locationId) continue;
        this.resetEnemyParty(enemy);
        enemy.active = true;
        enemy.x = enemy.spawnX;
        enemy.y = enemy.spawnY;
        enemy.respawnHours = 0;
        enemy.activeBattleId = null;
        enemy.targetTraderId = null;
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
        victor.experience += 24;
        if (loser) {
          const loserLosses = applyNpcAttrition(loser, result.loserDestroyed ? 1 : 0.62, `${battle.id}:loser`);
          const stolenGold = Math.min(loser.gold, 12 + loserLosses.length * 5);
          loser.gold -= stolenGold;
          rewardNpcVictory(victor, loserLosses, battle.id, 24, stolenGold);
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
  ): void {
    warband.respawnRemainingHours -= deltaHours;
    if (warband.respawnRemainingHours > 0) return;
    warband.x = warband.spawnX;
    warband.y = warband.spawnY;
    resetNpcParty(
      warband.id,
      warband,
      warband.recruitmentCardIds,
      warband.nobleRank === "king" ? 8 : warband.nobleRank === "baron" ? 6 : 4,
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
  }

  private updateWarbandIntent(
    warband: WorldWarbandState,
    factionState?: FactionState,
  ): void {
    const wanted = factionState?.wanted?.[warband.factionId] ?? 0;
    const lordWantedThreshold = warband.personality === "just" ? 35
      : warband.personality === "aggressive" ? 40
      : 50;
    const huntsPlayer =
      Boolean(factionState?.atWar?.[warband.factionId]) ||
      (warband.bountyHunter && wanted >= 25) ||
      (warband.type === "lord" && wanted >= lordWantedThreshold);
    const distanceFromHome = Math.hypot(warband.x - warband.spawnX, warband.y - warband.spawnY);
    if (
      huntsPlayer &&
      warband.hpRatio >= 0.34 &&
      distanceFromHome <= warband.allowedRadius
    ) {
      warband.state = "chasing";
      warband.targetPlayer = true;
      warband.targetWarbandId = null;
      warband.targetEnemyId = null;
      return;
    }
    if (warband.targetPlayer) {
      warband.targetPlayer = false;
      warband.state = "returning";
      warband.targetWarbandId = null;
      warband.targetEnemyId = null;
      return;
    }
    if (
      warband.state === "chasing" &&
      (warband.targetWarbandId || warband.targetEnemyId) &&
      !this.getPursuitTarget(warband)
    ) {
      warband.state = "returning";
      warband.targetWarbandId = null;
      warband.targetEnemyId = null;
      warband.targetPlayer = false;
      return;
    }
    if (warband.hpRatio < 0.28) {
      warband.state = "returning";
      warband.targetWarbandId = null;
      warband.targetEnemyId = null;
      warband.targetPlayer = false;
      return;
    }

    if (
      warband.state === "chasing" &&
      (warband.targetWarbandId || warband.targetEnemyId) &&
      this.canContinuePursuit(warband)
    ) {
      return;
    }

    let selectedTarget: WorldWarbandState | null = null;
    let selectedEnemyTarget: WorldEnemyState | null = null;
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
      selectedResponse = response;
    }

    for (const enemy of this.state.enemies) {
      if (!enemy.active || enemy.activeBattleId) continue;
      const distance = Math.hypot(enemy.x - warband.x, enemy.y - warband.y);
      if (distance > warband.detectionRadius) continue;
      const ownStrength = estimateWarbandStrength(warband);
      const enemyStrength = this.estimateEnemySpawnStrength(enemy);
      const shouldAttack =
        distance <= warband.aggressionRadius &&
        ownStrength >= enemyStrength * this.getEnemyAttackThreshold(warband);
      const shouldRetreat = ownStrength * 1.3 < enemyStrength;
      if (!shouldAttack && !shouldRetreat) continue;
      const score = distance / Math.max(1, enemyStrength);
      if (score >= bestScore) continue;
      bestScore = score;
      selectedTarget = null;
      selectedEnemyTarget = enemy;
      selectedResponse = shouldAttack ? "attack" : "retreat";
    }

    if (!selectedTarget && !selectedEnemyTarget) {
      if (warband.state === "chasing" || warband.state === "retreating") {
        warband.state = "returning";
        warband.targetWarbandId = null;
        warband.targetEnemyId = null;
      }
      return;
    }

    if (selectedResponse === "attack") {
      warband.state = "chasing";
      warband.targetWarbandId = selectedTarget?.id ?? null;
      warband.targetEnemyId = selectedEnemyTarget?.id ?? null;
    } else {
      warband.state = "retreating";
      warband.targetWarbandId = selectedTarget?.id ?? null;
      warband.targetEnemyId = selectedEnemyTarget?.id ?? null;
    }
  }

  private canContinuePursuit(warband: WorldWarbandState): boolean {
    const target = this.getPursuitTarget(warband);
    if (!target) {
      return false;
    }
    const distanceToTarget = Math.hypot(target.x - warband.x, target.y - warband.y);
    const distanceFromHome = Math.hypot(
      warband.x - warband.spawnX,
      warband.y - warband.spawnY,
    );
    return (
      warband.hpRatio >= 0.34 &&
      distanceToTarget <= warband.detectionRadius * 1.4 &&
      distanceFromHome <= Math.min(warband.allowedRadius, warband.maxPursuitDistance)
    );
  }

  private updateWarbandTarget(warband: WorldWarbandState): void {
    if (warband.state === "chasing" && warband.targetPlayer) {
      warband.targetX = this.state.x;
      warband.targetY = this.state.y;
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
        warband.hpRatio = Math.min(1, warband.hpRatio + 0.18);
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
    else if (warband.state === "retreating" || warband.state === "returning") warband.activity = "retreating";
    else if (warband.state === "chasing" && warband.targetPlayer) warband.activity = "huntingPlayer";
    else if (warband.state === "chasing") warband.activity = "hunting";
    else if (atHome && recovery.recruited > 0) warband.activity = "recruiting";
    else if (atHome && recovery.healed) warband.activity = "recovering";
    else if (warband.state === "patrolling" || warband.state === "traveling") warband.activity = "patrolling";
    else warband.activity = "idle";
  }

  private moveWarband(warband: WorldWarbandState, deltaHours: number): void {
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
    const travel = Math.min(
      warband.speed *
        getTerrainMovementMultiplier(this.map, warband.x, warband.y) *
        stateMultiplier *
        deltaHours,
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
      remainingHours: 0.32,
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
    if (warband.state === "fighting" || enemy.activeBattleId) return;
    const battleId = `warband_enemy_${warband.id}_${enemy.id}_${Math.round(this.elapsedHours * 1000)}`;
    warband.state = "fighting";
    warband.activity = "fighting";
    enemy.activity = "fighting";
    warband.activeBattleId = battleId;
    warband.targetEnemyId = enemy.id;
    warband.targetWarbandId = null;
    enemy.activeBattleId = battleId;
    this.state.warbandBattles.push({
      id: battleId,
      attackerId: warband.id,
      defenderId: null,
      enemyId: enemy.id,
      x: (warband.x + enemy.x) / 2,
      y: (warband.y + enemy.y) / 2,
      remainingHours: 0.42,
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
    if (result.warbandWins) {
      applyNpcAttrition(warband, 0.18 + (1 - result.warbandHpRatio) * 0.4, battle.id);
      const enemyLosses = applyNpcAttrition(enemy, 1, `${battle.id}:enemy`);
      const stolenGold = Math.min(enemy.gold, 10 + enemyLosses.length * 4);
      enemy.gold -= stolenGold;
      rewardNpcVictory(warband, enemyLosses, battle.id, 16 + enemy.threat * 4, stolenGold);
      syncWorldWarbandParty(warband);
      this.defeatEnemy(enemy.id);
      warband.hpRatio = npcRosterHpRatio(warband.roster);
      warband.experience += 16 + enemy.threat * 4;
      warband.state = warband.hpRatio < 0.45 ? "returning" : "patrolling";
      warband.activity = warband.state === "returning" ? "retreating" : "patrolling";
      battle.victorId = warband.id;
    } else {
      const warbandLosses = applyNpcAttrition(warband, result.warbandDestroyed ? 1 : 0.68, `${battle.id}:warband`);
      applyNpcAttrition(enemy, 0.24, battle.id);
      rewardNpcVictory(enemy, warbandLosses, battle.id, 18, Math.min(warband.gold, 8 + warbandLosses.length * 4));
      warband.gold = Math.max(0, warband.gold - (8 + warbandLosses.length * 4));
      syncWorldWarbandParty(warband);
      enemy.partySize = enemy.roster.length;
      warband.hpRatio = npcRosterHpRatio(warband.roster);
      const destroyed = result.warbandDestroyed || warband.roster.length === 0;
      warband.state = destroyed ? "destroyed" : "retreating";
      warband.activity = "retreating";
      warband.respawnRemainingHours =
        warband.state === "destroyed" ? warband.respawnHours : 0;
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

  getEnemyThreatRating(enemy: WorldEnemyState): number {
    const strength = this.estimateEnemySpawnStrength(enemy);
    if (strength < 9_000) return 1;
    if (strength < 18_000) return 2;
    if (strength < 29_000) return 3;
    if (strength < 42_000) return 4;
    return 5;
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

  private deterministicBattleVariance(left: string, right: string): number {
    return 0.88 + Math.floor(this.hash(`${left}:${right}`) * 27) / 100;
  }

  private findMonsterRaidTarget(
    enemy: WorldEnemyState,
    traders: CaravanState[],
  ): CaravanState | null {
    let selected: CaravanState | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    const searchRadius = enemy.aggroRadius * 0.86;
    for (const trader of traders) {
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
        rewardNpcVictory(enemy, [], raid.id, 14, Math.max(4, stolen * 2));
        enemy.rations += stolen;
        enemy.partySize = enemy.roster.length;
        raid.victor = "monster";
        this.monsterRaidCooldowns.set(enemy.id, 1.2);
      } else {
        applyNpcAttrition(enemy, 1, raid.id);
        this.defeatEnemy(enemy.id);
        raid.victor = "trader";
      }
      enemy.activeBattleId = null;
      enemy.targetTraderId = null;
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
      if (isWorldPositionTraversable(this.map, candidateX, candidateY, 24)) {
        return { x: candidateX, y: candidateY };
      }
    }
    return { x, y };
  }

  private hash(value: string): number {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
      hash = (hash * 31 + value.charCodeAt(index)) | 0;
    }
    return Math.abs(hash % 1000) / 100;
  }
}
