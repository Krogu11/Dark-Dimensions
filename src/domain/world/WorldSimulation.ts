import type {
  MapLocation,
  WorldEnemySpawn,
  WorldMapDefinition,
} from "../content/schemas";
import {
  findNearestTraversablePosition,
  getTerrainAt,
  isWorldPositionTraversable,
  type TerrainType,
} from "./WorldTerrain";

export interface WorldEnemyState extends WorldEnemySpawn {
  spawnX: number;
  spawnY: number;
  active: boolean;
  respawnHours: number;
}

export interface WorldState {
  mapId: string;
  x: number;
  y: number;
  nearbyLocationId: string | null;
  enemies: WorldEnemyState[];
}

export class WorldSimulation {
  readonly state: WorldState;
  private elapsedHours = 0;

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
      enemies: map.enemies.map((enemy) => ({
        ...enemy,
        spawnX: enemy.x,
        spawnY: enemy.y,
        active: true,
        respawnHours: 0,
      })),
    };
    this.updateNearbyLocation();
  }

  updateEnemies(deltaHours: number, playerThreat = 1): string | null {
    this.elapsedHours += deltaHours;
    const playerIsSafe = this.nearbyLocation?.type === "city";

    for (const enemy of this.state.enemies) {
      if (!enemy.active) {
        enemy.respawnHours -= deltaHours;
        if (enemy.respawnHours <= 0) {
          enemy.active = true;
          enemy.x = enemy.spawnX;
          enemy.y = enemy.spawnY;
        }
        continue;
      }

      const distanceToPlayer = Math.hypot(
        this.state.x - enemy.x,
        this.state.y - enemy.y,
      );
      const shouldFlee =
        !playerIsSafe &&
        enemy.threat + 1 < playerThreat &&
        distanceToPlayer <= enemy.aggroRadius * 1.15;
      const shouldPursue =
        !playerIsSafe &&
        !shouldFlee &&
        distanceToPlayer <= enemy.aggroRadius;
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
        const phase = this.hash(enemy.id) + this.elapsedHours * 0.38;
        targetX += Math.cos(phase) * 125;
        targetY += Math.sin(phase * 0.83) * 125;
      }

      const distanceToTarget = Math.hypot(targetX - enemy.x, targetY - enemy.y);
      if (distanceToTarget > 2) {
        const travel = Math.min(
          enemy.speed * (shouldFlee ? 1.08 : 1) * deltaHours,
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
    }

    return null;
  }

  defeatEnemy(enemyId: string): void {
    const enemy = this.state.enemies.find((candidate) => candidate.id === enemyId);
    if (!enemy) return;
    enemy.active = false;
    enemy.respawnHours = 12;
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
    const nextX =
      this.state.x + (horizontal / magnitude) * speed * deltaSeconds;
    const nextY =
      this.state.y + (vertical / magnitude) * speed * deltaSeconds;

    if (isWorldPositionTraversable(this.map, nextX, nextY, 30)) {
      this.state.x = nextX;
      this.state.y = nextY;
    } else if (
      isWorldPositionTraversable(this.map, nextX, this.state.y, 30)
    ) {
      this.state.x = nextX;
    } else if (
      isWorldPositionTraversable(this.map, this.state.x, nextY, 30)
    ) {
      this.state.y = nextY;
    }
    this.updateNearbyLocation();
    return Math.hypot(this.state.x - previousX, this.state.y - previousY);
  }

  get currentTerrain(): TerrainType {
    return getTerrainAt(this.map, this.state.x, this.state.y);
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
        const distance = Math.hypot(
          this.state.x - location.x,
          this.state.y - location.y,
        );
        return distance <= location.radius;
      })?.id ?? null;
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
