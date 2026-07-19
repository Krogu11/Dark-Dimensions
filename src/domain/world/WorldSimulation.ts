import type {
  MapLocation,
  WorldEnemySpawn,
  WorldMapDefinition,
} from "../content/schemas";
import type { CaravanState } from "../economy/Economy";
import type { FactionState } from "../quests/Factions";
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
} from "./WorldWarbands";
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
  dungeonSites: DungeonSiteState[];
  exploredSectors: string[];
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
      enemies: map.enemies.map((enemy) => ({
        ...enemy,
        spawnX: enemy.x,
        spawnY: enemy.y,
        active: true,
        respawnHours: 0,
        activeBattleId: null,
        targetTraderId: null,
      })),
      warbands: normalizeWorldWarbands(map, initial?.warbands),
      warbandBattles: normalizeWarbandBattles(initial?.warbandBattles),
      monsterRaids: initial?.monsterRaids ?? [],
    };
    this.relocateWarbandsAwayFromPlayer(980);
    this.updateNearbyLocation();
    this.revealAround(520);
  }

  updateWarbands(deltaHours: number, factionState?: FactionState): void {
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

      if (shouldScan) {
        this.updateWarbandIntent(warband, factionState);
      }

      this.updateWarbandTarget(warband);
      this.moveWarband(warband, deltaHours);

      if (warband.state === "chasing" && warband.targetWarbandId) {
        const target = this.state.warbands.find(
          (candidate) => candidate.id === warband.targetWarbandId,
        );
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
        const target = this.state.enemies.find(
          (candidate) =>
            candidate.id === warband.targetEnemyId &&
            candidate.active &&
            !candidate.activeBattleId,
        );
        if (
          target &&
          Math.hypot(target.x - warband.x, target.y - warband.y) <= 34
        ) {
          this.startWarbandEnemyBattle(warband, target);
        }
      }
    }
  }

  getWarband(warbandId: string): WorldWarbandState | null {
    return this.state.warbands.find((warband) => warband.id === warbandId) ?? null;
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
    defeated.respawnRemainingHours = defeated.respawnHours;
    defeated.activeBattleId = null;
    defeated.targetWarbandId = null;
    defeated.targetEnemyId = null;

    const ally = alliedWarbandId ? this.getWarband(alliedWarbandId) : null;
    if (ally) {
      ally.state = ally.hpRatio < 0.45 ? "returning" : "patrolling";
      ally.activeBattleId = null;
      ally.targetWarbandId = null;
      ally.targetEnemyId = null;
      ally.experience += 30;
    }
    battle.state = "resolved";
    battle.victorId = alliedWarbandId;
    battle.remainingHours = 0;
  }

  resolveWarbandEnemyBattleWithPlayer(
    battleId: string,
    alliedWarbandId: string | null,
  ): void {
    const battle = this.getWarbandBattle(battleId);
    if (!battle) return;
    const ally = alliedWarbandId ? this.getWarband(alliedWarbandId) : null;
    const enemy = battle.enemyId
      ? this.state.enemies.find((candidate) => candidate.id === battle.enemyId)
      : null;
    if (ally) {
      ally.state = ally.hpRatio < 0.45 ? "returning" : "patrolling";
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
  }

  updateEnemies(
    deltaHours: number,
    playerThreat = 1,
    traders: CaravanState[] = [],
  ): string | null {
    this.elapsedHours += deltaHours;
    const playerIsSafe = this.nearbyLocation?.type === "city";
    this.updateDungeonSites(deltaHours);
    this.updateMonsterRaids(deltaHours, traders);
    this.updateMonsterRaidCooldowns(deltaHours);

    for (const enemy of this.state.enemies) {
      const sourceIsActive = enemy.sourceLocationId
        ? this.isDungeonActive(enemy.sourceLocationId)
        : true;
      if (!enemy.active) {
        enemy.respawnHours -= deltaHours;
        if (enemy.respawnHours <= 0 && sourceIsActive) {
          enemy.active = true;
          enemy.x = enemy.spawnX;
          enemy.y = enemy.spawnY;
          enemy.activeBattleId = null;
          enemy.targetTraderId = null;
        }
        continue;
      }
      if (!sourceIsActive) {
        enemy.active = false;
        enemy.respawnHours = Number.POSITIVE_INFINITY;
        enemy.activeBattleId = null;
        enemy.targetTraderId = null;
        continue;
      }
      if (enemy.activeBattleId) continue;

      const distanceToPlayer = Math.hypot(
        this.state.x - enemy.x,
        this.state.y - enemy.y,
      );
      const effectiveAggroRadius =
        enemy.aggroRadius *
        getTerrainEncounterMultiplier(this.map, this.state.x, this.state.y);
      const shouldFlee =
        !playerIsSafe &&
        playerThreat - enemy.threat >= 3 &&
        distanceToPlayer <= effectiveAggroRadius * 1.15;
      const shouldPursue =
        !playerIsSafe &&
        !shouldFlee &&
        distanceToPlayer <= effectiveAggroRadius;
      let targetX = enemy.spawnX;
      let targetY = enemy.spawnY;

      if (shouldFlee) {
        const distance = Math.max(1, distanceToPlayer);
        targetX = enemy.x + ((enemy.x - this.state.x) / distance) * 260;
        targetY = enemy.y + ((enemy.y - this.state.y) / distance) * 260;
      } else if (shouldPursue) {
        targetX = this.state.x;
        targetY = this.state.y;
      } else {
        const traderTarget = this.monsterRaidCooldowns.has(enemy.id)
          ? null
          : this.findMonsterRaidTarget(enemy, traders);
        if (traderTarget) {
          targetX = traderTarget.x;
          targetY = traderTarget.y;
          enemy.targetTraderId = traderTarget.id;
        } else {
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
    const enemy = this.state.enemies.find((candidate) => candidate.id === enemyId);
    if (!enemy) return;
    enemy.active = false;
    enemy.activeBattleId = null;
    enemy.targetTraderId = null;
    const source = enemy.sourceLocationId
      ? this.getDungeonSite(enemy.sourceLocationId)
      : null;
    enemy.respawnHours = source?.active ? 18 : Number.POSITIVE_INFINITY;
  }

  defeatDungeon(locationId: string): void {
    const site = this.getDungeonSite(locationId);
    const location = this.map.locations.find((candidate) => candidate.id === locationId);
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
    this.updateNearbyLocation();
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
        continue;
      }
      const result = simulateNpcWarbandBattle(attacker, defender);
      const victor = this.getWarband(result.victorId);
      const loser = this.getWarband(result.loserId);
      if (victor) {
        victor.hpRatio = result.victorHpRatio;
        victor.experience += 24;
        victor.state = victor.hpRatio < 0.48 ? "returning" : "patrolling";
        victor.activeBattleId = null;
        victor.targetWarbandId = null;
        victor.targetEnemyId = null;
      }
      if (loser) {
        loser.hpRatio = result.loserDestroyed ? 0 : Math.max(0.18, loser.hpRatio - 0.46);
        loser.state = result.loserDestroyed ? "destroyed" : "retreating";
        loser.respawnRemainingHours = result.loserDestroyed ? loser.respawnHours : 0;
        loser.activeBattleId = null;
        loser.targetWarbandId = null;
        loser.targetEnemyId = null;
      }
      battle.state = "resolved";
      battle.victorId = result.victorId;
      battle.remainingHours = 0;
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
    warband.hpRatio = 1;
    warband.targetWarbandId = null;
    warband.targetEnemyId = null;
    warband.activeBattleId = null;
    warband.state = warband.patrolPoints?.length ? "patrolling" : "idle";
    warband.patrolIndex = 0;
    const nextPoint = warband.patrolPoints?.[0];
    warband.targetX = nextPoint?.x ?? warband.spawnX;
    warband.targetY = nextPoint?.y ?? warband.spawnY;
  }

  private updateWarbandIntent(
    warband: WorldWarbandState,
    factionState?: FactionState,
  ): void {
    if (
      warband.state === "chasing" &&
      (warband.targetWarbandId || warband.targetEnemyId) &&
      !this.getPursuitTarget(warband)
    ) {
      warband.state = "returning";
      warband.targetWarbandId = null;
      warband.targetEnemyId = null;
      return;
    }
    if (warband.hpRatio < 0.28) {
      warband.state = "returning";
      warband.targetWarbandId = null;
      warband.targetEnemyId = null;
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
        ownStrength >= enemyStrength * this.getEnemyAttackThreshold(warband.type);
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
    if (warband.state === "chasing" && (warband.targetWarbandId || warband.targetEnemyId)) {
      const target = this.getPursuitTarget(warband);
      if (!target) {
        warband.state = "returning";
        warband.targetWarbandId = null;
        warband.targetEnemyId = null;
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
      this.defeatEnemy(enemy.id);
      warband.hpRatio = result.warbandHpRatio;
      warband.experience += 16 + enemy.threat * 4;
      warband.state = warband.hpRatio < 0.45 ? "returning" : "patrolling";
      battle.victorId = warband.id;
    } else {
      warband.hpRatio = result.warbandHpRatio;
      warband.state = result.warbandDestroyed ? "destroyed" : "retreating";
      warband.respawnRemainingHours =
        warband.state === "destroyed" ? warband.respawnHours : 0;
      battle.victorId = enemy.id;
    }
    warband.activeBattleId = null;
    warband.targetEnemyId = null;
    warband.targetWarbandId = null;
    battle.state = "resolved";
    battle.remainingHours = 0;
  }

  private estimateEnemySpawnStrength(enemy: WorldEnemyState): number {
    return (2600 + enemy.threat * 3100 + enemy.partySize * 420) * (enemy.active ? 1 : 0);
  }

  private getEnemyAttackThreshold(type: WorldWarbandState["type"]): number {
    if (type === "lord") return 0.84;
    if (type === "army" || type === "elite") return 0.72;
    if (type === "patrol") return 0.9;
    if (type === "militia") return 1.05;
    if (type === "scout") return 1.35;
    return 1.2;
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
        this.damageTraderCargo(trader, 0.45 + Math.min(0.4, enemy.threat * 0.08));
        raid.victor = "monster";
        this.monsterRaidCooldowns.set(enemy.id, 1.2);
      } else {
        this.defeatEnemy(enemy.id);
        raid.victor = "trader";
      }
      enemy.activeBattleId = null;
      enemy.targetTraderId = null;
      raid.state = "resolved";
      raid.remainingHours = 0;
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

  private damageTraderCargo(trader: CaravanState, ratio: number): void {
    for (let index = trader.inventory.length - 1; index >= 0; index -= 1) {
      const stack = trader.inventory[index];
      const lost = Math.max(1, Math.floor(stack.quantity * ratio));
      stack.quantity = Math.max(0, stack.quantity - lost);
      if (stack.supply !== undefined) stack.supply = Math.max(0, stack.supply * (1 - ratio));
      if (stack.quantity <= 0) trader.inventory.splice(index, 1);
    }
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
