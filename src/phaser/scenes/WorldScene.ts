import Phaser from "phaser";
import { enemiesById } from "../../content/content";
import { getCardDefinition } from "../../domain/cards/CardInstance";
import { gameSession } from "../../domain/session/GameSession";
import type { TerrainZone } from "../../domain/content/schemas";
import type { FactionId } from "../../domain/quests/Factions";
import { isPositionNearPath } from "../../domain/world/WorldTerrain";
import i18n from "../../localization/i18n";
import { consumeWorldZoom, requestWorldZoom } from "../input/WorldInput";

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
  private locationLabels = new Map<string, Phaser.GameObjects.Text>();
  private enemyMarkers = new Map<string, Phaser.GameObjects.Container>();
  private caravanMarkers = new Map<string, Phaser.GameObjects.Container>();
  private villagerMarkers = new Map<string, Phaser.GameObjects.Container>();
  private waypointMarker!: Phaser.GameObjects.Container;
  private waypointLine!: Phaser.GameObjects.Graphics;
  private enemyTooltip!: Phaser.GameObjects.Container;
  private enemyTooltipText!: Phaser.GameObjects.Text;
  private hoveredEnemyId: string | null = null;
  private worldZoom = 1.02;
  private cameraPanX = 0;
  private cameraPanY = 0;
  private keys!: Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private centerCameraKey!: Phaser.Input.Keyboard.Key;
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
    this.createWaypoint();
    this.createEnemyTooltip();
    this.createInput();

    this.cameras.main
      .setBounds(0, 0, gameSession.world.map.width, gameSession.world.map.height)
      .setZoom(this.worldZoom);
    this.cameras.main.centerOn(
      gameSession.world.state.x,
      gameSession.world.state.y,
    );
    this.updateLocationLabelScale();
    this.updateMarkerVisibility();
  }

  update(_time: number, delta: number): void {
    if (gameSession.mode !== "world" || gameSession.uiBlocked) return;

    const zoomDelta = consumeWorldZoom();
    if (zoomDelta !== 0) {
      this.worldZoom = Phaser.Math.Clamp(
        this.worldZoom + zoomDelta * 0.14,
        0.3,
        1.6,
      );
      this.cameras.main.setZoom(this.worldZoom);
      this.updateLocationLabelScale();
    }

    const horizontal =
      Number(this.keys.right.isDown) - Number(this.keys.left.isDown);
    const vertical =
      Number(this.keys.down.isDown) - Number(this.keys.up.isDown);

    if (horizontal !== 0 || vertical !== 0) {
      if (gameSession.waypoint) gameSession.cancelNavigation();
      gameSession.moveWorld(
        horizontal,
        vertical,
        Math.min(delta, 40) / 1000,
      );
    } else {
      gameSession.advanceNavigation(Math.min(delta, 40) / 1000);
    }
    this.player.setPosition(gameSession.world.state.x, gameSession.world.state.y);
    this.updateCamera(Math.min(delta, 40) / 1000);

    this.updateEnemyMarkers();
    this.updateEnemyTooltip();
    this.updateCaravanMarkers();
    this.updateVillagerMarkers();
    this.updateWaypoint();
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

    for (const road of map.terrainRoads) {
      graphics.lineStyle(road.width + 8, 0x211e17, 0.24);
      this.strokeTerrainPath(graphics, road.points);
      graphics.lineStyle(road.width, 0x766b4e, 0.34);
      this.strokeTerrainPath(graphics, road.points);
      graphics.lineStyle(2, 0xc0aa72, 0.14);
      this.strokeTerrainPath(graphics, road.points);
    }
    this.drawBridgeCrossings(graphics);

    for (let index = 0; index < 1900; index += 1) {
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
      const label = this.add
        .text(0, -30, i18n.t(location.nameKey), {
          color: "#eadfca",
          fontFamily: "Cinzel, Georgia, serif",
          fontSize: "11px",
          backgroundColor: "rgba(7, 10, 8, 0.78)",
          padding: { x: 6, y: 3 },
        })
        .setOrigin(0.5, 1)
        .setStroke("#10130f", 2);
      marker.add([glow, outer, inner, label]);
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
      this.locationLabels.set(location.id, label);
      marker
        .setSize(150, 76)
        .setInteractive({ cursor: "pointer" })
        .on(
          Phaser.Input.Events.POINTER_DOWN,
          (
            _pointer: Phaser.Input.Pointer,
            _localX: number,
            _localY: number,
            event: Phaser.Types.Input.EventData,
          ) => {
            event.stopPropagation();
            gameSession.setWaypoint(location.x, location.y, location.nameKey);
          },
        );

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

  private createWaypoint(): void {
    this.waypointLine = this.add.graphics().setDepth(5);
    const glow = this.add.circle(0, 0, 30, 0xd9b66f, 0.09);
    const ring = this.add
      .circle(0, 0, 17, 0x11130f, 0.35)
      .setStrokeStyle(3, 0xd9b66f, 0.92);
    const core = this.add
      .rectangle(0, 0, 8, 8, 0xf1d18a, 0.96)
      .setAngle(45);
    this.waypointMarker = this.add
      .container(0, 0, [glow, ring, core])
      .setDepth(9)
      .setVisible(false);
    this.tweens.add({
      targets: glow,
      scale: 1.45,
      alpha: 0.02,
      duration: 1200,
      yoyo: true,
      repeat: -1,
    });
  }

  private updateWaypoint(): void {
    this.waypointLine.clear();
    const waypoint = gameSession.waypoint;
    if (!waypoint) {
      this.waypointMarker.setVisible(false);
      return;
    }
    this.waypointMarker.setPosition(waypoint.x, waypoint.y).setVisible(true);
    this.waypointLine.lineStyle(3, 0xd9b66f, 0.24);
    this.waypointLine.beginPath();
    this.waypointLine.moveTo(
      gameSession.world.state.x,
      gameSession.world.state.y,
    );
    this.waypointLine.lineTo(waypoint.x, waypoint.y);
    this.waypointLine.strokePath();
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
      marker
        .setSize(58, 66)
        .setInteractive({ cursor: "pointer" })
        .on(
          Phaser.Input.Events.POINTER_OVER,
          () => {
            this.showEnemyTooltip(enemy.id);
          },
        )
        .on(Phaser.Input.Events.POINTER_OUT, () => {
          if (this.hoveredEnemyId === enemy.id) this.hideEnemyTooltip();
        })
        .on(
          Phaser.Input.Events.POINTER_DOWN,
          (
            _pointer: Phaser.Input.Pointer,
            _localX: number,
            _localY: number,
            event: Phaser.Types.Input.EventData,
          ) => {
            event.stopPropagation();
            gameSession.pursueEnemy(enemy.id);
          },
        );
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

  private createEnemyTooltip(): void {
    const background = this.add
      .rectangle(0, 0, 300, 156, 0x080b09, 0.96)
      .setOrigin(0)
      .setStrokeStyle(1, 0xb65a50, 0.8);
    this.enemyTooltipText = this.add.text(14, 12, "", {
      color: "#d8d2c2",
      fontFamily: "Arial",
      fontSize: "12px",
      lineSpacing: 5,
      wordWrap: { width: 272 },
    });
    this.enemyTooltip = this.add
      .container(0, 0, [background, this.enemyTooltipText])
      .setDepth(100)
      .setVisible(false);
  }

  private showEnemyTooltip(enemyId: string): void {
    const enemy = gameSession.world.state.enemies.find(
      (candidate) => candidate.id === enemyId,
    );
    const archetype = enemy ? enemiesById.get(enemy.archetypeId) : undefined;
    if (!enemy || !archetype) return;

    const cards = new Map<string, number>();
    for (const cardId of archetype.deck) {
      cards.set(cardId, (cards.get(cardId) ?? 0) + 1);
    }
    const deck = [...cards]
      .map(([cardId, count]) => {
        const name = i18n.t(getCardDefinition(cardId).nameKey);
        return count > 1 ? `${name} ×${count}` : name;
      })
      .join(", ");
    this.enemyTooltipText.setText([
      i18n.t(archetype.nameKey).toUpperCase(),
      `${i18n.t("world.enemyTooltip.threat")}: ${"◆".repeat(enemy.threat)}`,
      `${i18n.t("world.enemyTooltip.troops")}: ${enemy.partySize}   ${i18n.t("world.enemyTooltip.speed")}: ${Math.round(enemy.speed)}`,
      `${i18n.t("world.enemyTooltip.load")}: ${enemy.inventoryWeight.toFixed(1)}`,
      `${i18n.t("world.enemyTooltip.warband")}: ${deck}`,
      i18n.t("world.enemyTooltip.click"),
    ]);
    this.hoveredEnemyId = enemyId;
    this.enemyTooltip.setVisible(true);
    this.enemyTooltip.setPosition(enemy.x + 34, enemy.y - 186);
  }

  private updateEnemyTooltip(): void {
    if (!this.hoveredEnemyId) return;
    const enemy = gameSession.world.state.enemies.find(
      (candidate) => candidate.id === this.hoveredEnemyId,
    );
    if (!enemy?.active || !this.isWithinSight(enemy.x, enemy.y)) {
      this.hideEnemyTooltip();
      return;
    }
    this.enemyTooltip.setPosition(enemy.x + 34, enemy.y - 186);
  }

  private hideEnemyTooltip(): void {
    this.hoveredEnemyId = null;
    this.enemyTooltip.setVisible(false);
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

  private updateLocationLabelScale(): void {
    const scale = Phaser.Math.Clamp(0.9 / this.worldZoom, 0.82, 2.15);
    for (const label of this.locationLabels.values()) {
      label.setScale(scale);
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
    this.centerCameraKey = keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    );
    this.input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (
        _pointer: Phaser.Input.Pointer,
        _objects: Phaser.GameObjects.GameObject[],
        _deltaX: number,
        deltaY: number,
      ) => requestWorldZoom(deltaY > 0 ? -1 : 1),
    );
    this.input.on(
      Phaser.Input.Events.POINTER_DOWN,
      (pointer: Phaser.Input.Pointer) => {
        if (pointer.leftButtonDown() && gameSession.mode === "world") {
          gameSession.setWaypoint(pointer.worldX, pointer.worldY);
        }
      },
    );
  }

  private updateCamera(deltaSeconds: number): void {
    const cameraHorizontal =
      Number(this.cursors.right.isDown) - Number(this.cursors.left.isDown);
    const cameraVertical =
      Number(this.cursors.down.isDown) - Number(this.cursors.up.isDown);
    const panSpeed = 720 / this.worldZoom;
    const maximumPan = 1500 / this.worldZoom;
    this.cameraPanX = Phaser.Math.Clamp(
      this.cameraPanX + cameraHorizontal * panSpeed * deltaSeconds,
      -maximumPan,
      maximumPan,
    );
    this.cameraPanY = Phaser.Math.Clamp(
      this.cameraPanY + cameraVertical * panSpeed * deltaSeconds,
      -maximumPan,
      maximumPan,
    );
    if (Phaser.Input.Keyboard.JustDown(this.centerCameraKey)) {
      this.cameraPanX = 0;
      this.cameraPanY = 0;
    }

    const targetX = gameSession.world.state.x + this.cameraPanX;
    const targetY = gameSession.world.state.y + this.cameraPanY;
    const current = this.cameras.main.midPoint;
    this.cameras.main.centerOn(
      Phaser.Math.Linear(current.x, targetX, 0.14),
      Phaser.Math.Linear(current.y, targetY, 0.14),
    );
    this.updateVisibilityOrigin();
  }

  private updateVisibilityOrigin(): void {
    const camera = this.cameras.main;
    const screenX = (gameSession.world.state.x - camera.worldView.x) * camera.zoom;
    const screenY = (gameSession.world.state.y - camera.worldView.y) * camera.zoom;
    const visibility = document.querySelector<HTMLElement>(".world-visibility");
    visibility?.style.setProperty("--visibility-x", `${screenX}px`);
    visibility?.style.setProperty("--visibility-y", `${screenY}px`);
  }

  private drawBridgeCrossings(graphics: Phaser.GameObjects.Graphics): void {
    const map = gameSession.world.map;
    for (const road of map.terrainRoads) {
      for (let pointIndex = 0; pointIndex < road.points.length - 1; pointIndex += 1) {
        const start = road.points[pointIndex];
        const end = road.points[pointIndex + 1];
        const distance = Math.hypot(end.x - start.x, end.y - start.y);
        const sampleCount = Math.max(2, Math.ceil(distance / 18));
        const samples = Array.from({ length: sampleCount + 1 }, (_, index) => {
          const progress = index / sampleCount;
          const point = {
            x: start.x + (end.x - start.x) * progress,
            y: start.y + (end.y - start.y) * progress,
          };
          return {
            ...point,
            crossesWater: map.terrainRivers.some((river) =>
              isPositionNearPath(river.points, river.width, point.x, point.y, 8),
            ),
          };
        });
        const waterGroups: Array<Array<{ x: number; y: number }>> = [];
        let activeGroup: Array<{ x: number; y: number }> | null = null;
        for (const sample of samples) {
          if (sample.crossesWater) {
            if (!activeGroup) {
              activeGroup = [];
              waterGroups.push(activeGroup);
            }
            activeGroup.push(sample);
          } else {
            activeGroup = null;
          }
        }
        for (const crossing of waterGroups) {
          if (crossing.length < 2) continue;
          this.drawBridgeSpan(
            graphics,
            road.width,
            crossing[0],
            crossing[crossing.length - 1],
          );
        }
      }
    }
  }

  private drawBridgeSpan(
    graphics: Phaser.GameObjects.Graphics,
    roadWidth: number,
    entry: { x: number; y: number },
    exit: { x: number; y: number },
  ): void {
        const bridgeLength = Math.hypot(exit.x - entry.x, exit.y - entry.y);
        const directionX = (exit.x - entry.x) / Math.max(1, bridgeLength);
        const directionY = (exit.y - entry.y) / Math.max(1, bridgeLength);
        const bridgeStart = {
          x: entry.x - directionX * 24,
          y: entry.y - directionY * 24,
        };
        const bridgeEnd = {
          x: exit.x + directionX * 24,
          y: exit.y + directionY * 24,
        };

        graphics.lineStyle(roadWidth + 14, 0x17140f, 0.92);
        graphics.beginPath();
        graphics.moveTo(bridgeStart.x, bridgeStart.y);
        graphics.lineTo(bridgeEnd.x, bridgeEnd.y);
        graphics.strokePath();
        graphics.lineStyle(roadWidth + 5, 0x8f7549, 0.98);
        graphics.beginPath();
        graphics.moveTo(bridgeStart.x, bridgeStart.y);
        graphics.lineTo(bridgeEnd.x, bridgeEnd.y);
        graphics.strokePath();

        const plankCount = Math.max(2, Math.floor((bridgeLength + 48) / 14));
        const normalX = -directionY;
        const normalY = directionX;
        for (let plank = 0; plank <= plankCount; plank += 1) {
          const progress = plank / plankCount;
          const centerX = bridgeStart.x + (bridgeEnd.x - bridgeStart.x) * progress;
          const centerY = bridgeStart.y + (bridgeEnd.y - bridgeStart.y) * progress;
          const halfWidth = roadWidth * 0.48;
          graphics.lineStyle(2, 0x3b2e1d, 0.78);
          graphics.beginPath();
          graphics.moveTo(
            centerX - normalX * halfWidth,
            centerY - normalY * halfWidth,
          );
          graphics.lineTo(
            centerX + normalX * halfWidth,
            centerY + normalY * halfWidth,
          );
          graphics.strokePath();
        }
  }
}
