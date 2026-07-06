import Phaser from "phaser";
import { enemiesById } from "../../content/content";
import { gameSession } from "../../domain/session/GameSession";
import type { TerrainZone } from "../../domain/content/schemas";
import type { FactionId } from "../../domain/quests/Factions";
import { getTouchMovement } from "../input/WorldInput";

const LOCATION_COLORS = {
  city: 0xd9b66f,
  village: 0xb99b62,
  castle: 0x82909b,
  dungeon: 0x9f4a4a,
  landmark: 0x9c83b8,
  wilds: 0x66845b,
} as const;

const FACTION_COLORS: Record<FactionId, number> = {
  ember_crown: 0xc76848,
  gloam_compact: 0x7862a3,
  iron_concord: 0x6d98a5,
};

const TERRAIN_COLORS = {
  sea: 0x172b31,
  plains: 0x303a2b,
  forest: 0x1c3424,
  swamp: 0x28352f,
  desert: 0x665b39,
  mountain: 0x454944,
  lake: 0x23434a,
  river: 0x2b5156,
} as const;

export class WorldScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container;
  private locationMarkers = new Map<string, Phaser.GameObjects.Container>();
  private enemyMarkers = new Map<string, Phaser.GameObjects.Container>();
  private caravanMarkers = new Map<string, Phaser.GameObjects.Container>();
  private villagerMarkers = new Map<string, Phaser.GameObjects.Container>();
  private keys!: Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private lastLocationId: string | null = null;
  private lastCaravanId: string | null = null;
  private lastTimeBucket = -1;

  constructor() {
    super("world");
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#111613");
    this.drawTerrain();
    this.drawLocations();
    this.createEnemies();
    this.createCaravans();
    this.createVillagers();
    this.createPlayer();
    this.createInput();

    this.cameras.main
      .setBounds(0, 0, gameSession.world.map.width, gameSession.world.map.height)
      .startFollow(this.player, true, 0.09, 0.09)
      .setZoom(1.08);
    this.updateMarkerVisibility();
  }

  update(_time: number, delta: number): void {
    if (gameSession.mode !== "world" || gameSession.uiBlocked) return;

    const touchMovement = getTouchMovement();
    const horizontal =
      Number(this.keys.right.isDown || this.cursors.right.isDown) -
      Number(this.keys.left.isDown || this.cursors.left.isDown) +
      touchMovement.x;
    const vertical =
      Number(this.keys.down.isDown || this.cursors.down.isDown) -
      Number(this.keys.up.isDown || this.cursors.up.isDown) +
      touchMovement.y;

    if (horizontal !== 0 || vertical !== 0) {
      gameSession.moveWorld(
        horizontal,
        vertical,
        Math.min(delta, 40) / 1000,
      );
    }
    this.player.setPosition(gameSession.world.state.x, gameSession.world.state.y);

    this.updateEnemyMarkers();
    this.updateCaravanMarkers();
    this.updateVillagerMarkers();
    this.updateMarkerVisibility();
    if (gameSession.mode !== "world") return;

    let shouldNotify = false;
    if (gameSession.world.state.nearbyLocationId !== this.lastLocationId) {
      this.lastLocationId = gameSession.world.state.nearbyLocationId;
      shouldNotify = true;
    }
    if (gameSession.nearbyCaravanId !== this.lastCaravanId) {
      this.lastCaravanId = gameSession.nearbyCaravanId;
      shouldNotify = true;
    }
    const timeBucket = Math.floor(gameSession.timeState.totalMinutes / 10);
    if (timeBucket !== this.lastTimeBucket) {
      this.lastTimeBucket = timeBucket;
      shouldNotify = true;
    }
    if (shouldNotify) gameSession.notify();
  }

  private drawTerrain(): void {
    const map = gameSession.world.map;
    const graphics = this.add.graphics();
    const inset = map.boundaryInset;
    graphics.fillStyle(TERRAIN_COLORS.sea).fillRect(0, 0, map.width, map.height);
    graphics
      .fillStyle(TERRAIN_COLORS.plains)
      .fillRect(inset, inset, map.width - inset * 2, map.height - inset * 2);
    graphics
      .lineStyle(28, 0x9c8b5c, 0.24)
      .strokeRect(inset, inset, map.width - inset * 2, map.height - inset * 2);
    graphics
      .lineStyle(7, 0x111b1c, 0.92)
      .strokeRect(inset - 9, inset - 9, map.width - inset * 2 + 18, map.height - inset * 2 + 18);

    for (const zone of map.terrainZones) {
      graphics
        .fillStyle(TERRAIN_COLORS[zone.type], zone.type === "lake" ? 0.98 : 0.88)
        .fillEllipse(zone.x, zone.y, zone.radiusX * 2, zone.radiusY * 2);
      if (zone.type === "lake") {
        graphics
          .lineStyle(8, 0x78908a, 0.22)
          .strokeEllipse(zone.x, zone.y, zone.radiusX * 2, zone.radiusY * 2);
      } else if (zone.type === "mountain") {
        graphics
          .lineStyle(10, 0x191c1a, 0.34)
          .strokeEllipse(zone.x, zone.y, zone.radiusX * 2, zone.radiusY * 2);
      }
      this.drawTerrainZoneDetails(graphics, zone);
    }

    for (const river of map.terrainRivers) {
      graphics.lineStyle(river.width + 18, 0x14272a, 0.72);
      this.strokeTerrainPath(graphics, river.points);
      graphics.lineStyle(river.width, TERRAIN_COLORS.river, 0.94);
      this.strokeTerrainPath(graphics, river.points);
      graphics.lineStyle(5, 0x8aa29a, 0.15);
      this.strokeTerrainPath(graphics, river.points);
    }

    for (const location of map.locations) {
      if (location.type === "wilds") {
        graphics
          .fillStyle(0x293324, 0.72)
          .fillEllipse(location.x, location.y, location.radius * 5.2, location.radius * 3.8);
      } else if (location.type === "dungeon") {
        graphics
          .fillStyle(0x312a23, 0.66)
          .fillEllipse(location.x, location.y, location.radius * 5, location.radius * 3.2);
      }
    }

    graphics.lineStyle(62, 0x5e5640, 0.26);
    const settlements = map.locations.filter(
      (location) =>
        location.type === "city" ||
        location.type === "village" ||
        location.type === "castle",
    );
    settlements.forEach((location, index) => {
      if (index === 0) return;
      const connected = settlements
        .slice(0, index)
        .reduce((nearest, candidate) =>
          Math.hypot(candidate.x - location.x, candidate.y - location.y) <
          Math.hypot(nearest.x - location.x, nearest.y - location.y)
            ? candidate
            : nearest,
        );
      graphics.beginPath();
      graphics.moveTo(location.x, location.y);
      graphics.lineTo(connected.x, connected.y);
      graphics.strokePath();
    });

    for (let index = 0; index < 1100; index += 1) {
      const x =
        inset +
        ((index * 83 + gameSession.worldSeed % 997) % (map.width - inset * 2));
      const y =
        inset +
        ((index * 151 + gameSession.worldSeed % 631) % (map.height - inset * 2));
      const radius = 2 + (index % 4);
      graphics.fillStyle(index % 5 === 0 ? 0x84906c : 0x111711, 0.42);
      graphics.fillCircle(x, y, radius);
    }

    graphics.lineStyle(3, 0x759498, 0.2);
    for (let index = 0; index < 70; index += 1) {
      const horizontal = inset / 2 + ((index * 113) % (map.width - inset));
      const vertical = inset / 2 + ((index * 97) % (map.height - inset));
      graphics.beginPath();
      graphics.moveTo(horizontal - 18, 62 + (index % 4) * 24);
      graphics.lineTo(horizontal + 18, 62 + (index % 4) * 24);
      graphics.strokePath();
      graphics.beginPath();
      graphics.moveTo(62 + (index % 4) * 24, vertical - 18);
      graphics.lineTo(62 + (index % 4) * 24, vertical + 18);
      graphics.strokePath();
    }
  }

  private drawTerrainZoneDetails(
    graphics: Phaser.GameObjects.Graphics,
    zone: TerrainZone,
  ): void {
    const detailCount =
      zone.type === "forest" ? 48 : zone.type === "mountain" ? 30 : 22;
    for (let index = 0; index < detailCount; index += 1) {
      const angle =
        ((index * 137 + zone.x * 0.01 + zone.y * 0.02) % 360) *
        (Math.PI / 180);
      const spread = 0.18 + (((index * 47 + zone.id.length * 13) % 73) / 100);
      const x = zone.x + Math.cos(angle) * zone.radiusX * spread;
      const y = zone.y + Math.sin(angle) * zone.radiusY * spread;

      if (zone.type === "forest") {
        graphics.fillStyle(0x0c1c13, 0.72).fillCircle(x, y + 5, 7);
        graphics.fillStyle(0x486044, 0.86).fillTriangle(
          x,
          y - 13,
          x - 10,
          y + 8,
          x + 10,
          y + 8,
        );
      } else if (zone.type === "swamp") {
        graphics
          .fillStyle(index % 3 === 0 ? 0x192d2d : 0x53604a, 0.42)
          .fillEllipse(x, y, 24 + (index % 4) * 6, 8 + (index % 3) * 4);
      } else if (zone.type === "desert") {
        graphics.lineStyle(3, 0xa3935c, 0.34);
        graphics.beginPath();
        graphics.moveTo(x - 13, y);
        graphics.lineTo(x, y - 5);
        graphics.lineTo(x + 13, y);
        graphics.strokePath();
      } else if (zone.type === "mountain") {
        const size = 18 + (index % 5) * 4;
        graphics
          .fillStyle(index % 3 === 0 ? 0x687069 : 0x2c302d, 0.94)
          .fillTriangle(x, y - size, x - size * 0.72, y + size * 0.55, x + size * 0.72, y + size * 0.55);
        graphics
          .fillStyle(0xc1c2b7, 0.52)
          .fillTriangle(x, y - size, x - size * 0.22, y - size * 0.48, x + size * 0.26, y - size * 0.45);
      } else if (zone.type === "lake") {
        graphics
          .fillStyle(0x77969a, 0.2)
          .fillEllipse(x, y, 28 + (index % 3) * 8, 4);
      }
    }
  }

  private strokeTerrainPath(
    graphics: Phaser.GameObjects.Graphics,
    points: Array<{ x: number; y: number }>,
  ): void {
    const [firstPoint, ...remainingPoints] = points;
    if (!firstPoint) return;
    graphics.beginPath();
    graphics.moveTo(firstPoint.x, firstPoint.y);
    for (const point of remainingPoints) {
      graphics.lineTo(point.x, point.y);
    }
    graphics.strokePath();
  }

  private drawLocations(): void {
    for (const location of gameSession.world.map.locations) {
      const color = LOCATION_COLORS[location.type];
      const marker = this.add.container(location.x, location.y);
      const glow = this.add.circle(0, 0, 25, color, 0.12);
      const outer = this.add.circle(0, 0, 14, 0x080a09, 0.95).setStrokeStyle(2, color, 0.9);
      const inner = this.add.circle(0, 0, 5, color, 1);
      marker.add([glow, outer, inner]);
      const factionId = gameSession.factionState.locationFactions[location.id];
      if (factionId) {
        marker.add(
          this.add
            .rectangle(0, 20, 9, 9, FACTION_COLORS[factionId], 0.95)
            .setAngle(45)
            .setStrokeStyle(1, 0x111411),
        );
      }
      this.locationMarkers.set(location.id, marker);

      this.tweens.add({
        targets: glow,
        scale: 1.55,
        alpha: 0.02,
        duration: 1700 + location.x % 500,
        yoyo: true,
        repeat: -1,
      });
    }
  }

  private createPlayer(): void {
    const shadow = this.add.ellipse(0, 11, 27, 12, 0x000000, 0.48);
    const body = this.add.circle(0, 0, 10, 0xe7d29b).setStrokeStyle(3, 0x151713);
    const direction = this.add.triangle(0, -10, -5, 5, 5, 5, 0, -7, 0xf2ead5);
    this.player = this.add.container(
      gameSession.world.state.x,
      gameSession.world.state.y,
      [shadow, body, direction],
    );
    this.player.setDepth(10);
  }

  private createEnemies(): void {
    for (const enemy of gameSession.world.state.enemies) {
      const glow = this.add.circle(0, 0, 25, 0xe34f45, 0.12);
      const ring = this.add
        .circle(0, 0, 12, 0x160807, 0.96)
        .setStrokeStyle(2, 0xe55b50, 0.95);
      const core = this.add.circle(0, 0, 5, 0xd84b43, 1);
      const banner = this.add.triangle(5, -17, 0, 9, 13, 4, 0, -2, 0xc33c35);
      const threat = enemiesById.get(enemy.archetypeId)?.threat ?? 1;
      const threatLabel = this.add
        .text(0, 20, "◆".repeat(threat), {
          color: "#dc766b",
          fontFamily: "Arial",
          fontSize: "7px",
        })
        .setOrigin(0.5);
      const marker = this.add.container(enemy.x, enemy.y, [
        glow,
        ring,
        core,
        banner,
        threatLabel,
      ]);
      marker.setDepth(8);
      this.enemyMarkers.set(enemy.id, marker);
      this.tweens.add({
        targets: glow,
        scale: 1.7,
        alpha: 0.02,
        duration: 900,
        yoyo: true,
        repeat: -1,
      });
    }
  }

  private updateEnemyMarkers(): void {
    for (const enemy of gameSession.world.state.enemies) {
      const marker = this.enemyMarkers.get(enemy.id);
      if (!marker) continue;
      marker.setPosition(enemy.x, enemy.y);
      marker.setVisible(enemy.active && this.isWithinSight(enemy.x, enemy.y));
    }
  }

  private createCaravans(): void {
    for (const caravan of gameSession.economyState.caravans) {
      const glow = this.add.circle(0, 0, 24, 0xd5aa55, 0.11);
      const cart = this.add
        .rectangle(0, 0, 20, 11, 0x2a2113, 0.96)
        .setStrokeStyle(2, 0xd4ad63, 0.95);
      const canopy = this.add.triangle(0, -10, -10, 5, 10, 5, 0, -6, 0xc79b4d);
      const wheelLeft = this.add.circle(-7, 8, 3, 0x0c0d0b).setStrokeStyle(1, 0xb68c49);
      const wheelRight = this.add.circle(7, 8, 3, 0x0c0d0b).setStrokeStyle(1, 0xb68c49);
      const marker = this.add.container(caravan.x, caravan.y, [
        glow,
        cart,
        canopy,
        wheelLeft,
        wheelRight,
      ]);
      marker.setDepth(7);
      this.caravanMarkers.set(caravan.id, marker);
      this.tweens.add({
        targets: glow,
        scale: 1.5,
        alpha: 0.025,
        duration: 1300,
        yoyo: true,
        repeat: -1,
      });
    }
  }

  private updateCaravanMarkers(): void {
    for (const caravan of gameSession.economyState.caravans) {
      const marker = this.caravanMarkers.get(caravan.id);
      marker?.setPosition(caravan.x, caravan.y);
      marker?.setVisible(this.isWithinSight(caravan.x, caravan.y));
    }
  }

  private createVillagers(): void {
    for (const villager of gameSession.economyState.villagers) {
      const shadow = this.add.ellipse(0, 8, 18, 8, 0x000000, 0.38);
      const body = this.add
        .circle(0, 0, 6, 0x8d7147, 0.98)
        .setStrokeStyle(2, 0xd0b47a, 0.9);
      const pack = this.add.rectangle(7, 2, 7, 9, 0x493821, 1);
      const marker = this.add.container(villager.x, villager.y, [
        shadow,
        pack,
        body,
      ]);
      marker.setDepth(6);
      this.villagerMarkers.set(villager.id, marker);
    }
  }

  private updateVillagerMarkers(): void {
    for (const villager of gameSession.economyState.villagers) {
      const marker = this.villagerMarkers.get(villager.id);
      marker?.setPosition(villager.x, villager.y);
      marker?.setVisible(this.isWithinSight(villager.x, villager.y));
    }
  }

  private updateMarkerVisibility(): void {
    for (const location of gameSession.world.map.locations) {
      this.locationMarkers
        .get(location.id)
        ?.setVisible(this.isWithinSight(location.x, location.y, 80));
    }
  }

  private isWithinSight(x: number, y: number, margin = 0): boolean {
    return (
      Math.hypot(
        x - gameSession.world.state.x,
        y - gameSession.world.state.y,
      ) <=
      gameSession.visibilityRadius + margin
    );
  }

  private createInput(): void {
    const keyboard = this.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.keys = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
  }
}
