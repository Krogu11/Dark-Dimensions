import Phaser from "phaser";
import { enemiesById } from "../../content/content";
import { getCardDefinition } from "../../domain/cards/CardInstance";
import { gameSession, WARBAND_INTERACTION_RANGE } from "../../domain/session/GameSession";
import type { MapLocation, TerrainCell } from "../../domain/content/schemas";
import {
  getFactionRelation,
  PLAYER_FACTION_ID,
  type FactionId,
} from "../../domain/quests/Factions";
import { isPositionNearPath } from "../../domain/world/WorldTerrain";
import { estimateWarbandStrength, getLordPersonalityLabel, getNobleRankLabel, getNpcActivityLabel } from "../../domain/world/WorldWarbands";
import i18n from "../../localization/i18n";
import {
  WORLD_CAMERA_FOCUS_EVENT,
  type WorldCameraFocusDetail,
} from "../WorldCameraEvents";
import { consumeWorldZoom, requestWorldZoom } from "../input/WorldInput";

const LOCATION_COLORS = {
  city: 0xd9b66f,
  village: 0xb99b62,
  castle: 0x82909b,
  dungeon: 0x9f4a4a,
  landmark: 0x9c83b8,
  wilds: 0x66845b,
  soulTemple: 0x7ee7e2,
} as const;

const LOCATION_TEXTURES = {
  city: "location-town-red",
  village: "location-village-red",
  kobold: "location-kobold-warren",
  beast: "location-beast-den",
  swamp: "location-sunken-nest",
  undead: "location-bone-crypt",
  orc: "location-orc-warcamp",
  elemental: "location-ash-rift",
  machine: "location-rusted-vault",
  outlaw: "location-outlaw-hideout",
  soulTemple: "location-soul-temple",
} as const;

const LOCATION_ASSETS = {
  city: "/assets/world/locations/town-red-map.png",
  village: "/assets/world/locations/village-red-map.png",
  kobold: "/assets/world/locations/kobold-warren-map.png",
  beast: "/assets/world/locations/beast-den-map.png",
  swamp: "/assets/world/locations/sunken-nest-map.png",
  undead: "/assets/world/locations/bone-crypt-map.png",
  orc: "/assets/world/locations/orc-warcamp-map.png",
  elemental: "/assets/world/locations/ash-rift-map.png",
  machine: "/assets/world/locations/rusted-vault-map.png",
  outlaw: "/assets/world/locations/outlaw-hideout-map.png",
  soulTemple: "/assets/world/locations/soul-temple-map.png",
} as const;

type LocationTextureKey = keyof typeof LOCATION_TEXTURES;

const DUNGEON_BIOME_TEXTURES: Record<string, LocationTextureKey> = {
  koboldwarren: "kobold",
  beastden: "beast",
  sunkennest: "swamp",
  bonecrypt: "undead",
  orcwarcamp: "orc",
  ashrift: "elemental",
  rustedvault: "machine",
  outlawhideout: "outlaw",
};

const DUNGEON_ENEMY_TEXTURES: Record<string, LocationTextureKey> = {
  kobold_foragers: "kobold",
  kobold_ambushers: "kobold",
  hungry_wolves: "beast",
  swamp_lurkers: "swamp",
  grave_procession: "undead",
  necromancer_cabal: "undead",
  road_reavers: "orc",
  orc_hunters: "orc",
  ash_brood: "elemental",
  storm_callers: "elemental",
  wyvern_kin: "elemental",
  vault_scavengers: "machine",
  rusted_sentinels: "machine",
  iron_colossus_guard: "machine",
  desperate_militia: "outlaw",
  black_banner_knights: "outlaw",
};

const LOCATION_SPRITE_CONFIG = {
  city: {
    texture: LOCATION_TEXTURES.city,
    width: 210,
    height: 213,
    y: 4,
    originY: 0.58,
    glowRadius: 86,
    labelY: -108,
    factionY: 100,
    hitWidth: 238,
    hitHeight: 236,
  },
  village: {
    texture: LOCATION_TEXTURES.village,
    width: 144,
    height: 146,
    y: 3,
    originY: 0.58,
    glowRadius: 62,
    labelY: -78,
    factionY: 70,
    hitWidth: 172,
    hitHeight: 170,
  },
  soulTemple: {
    texture: LOCATION_TEXTURES.soulTemple,
    width: 190,
    height: 190,
    y: 3,
    originY: 0.58,
    glowRadius: 82,
    labelY: -102,
    factionY: 92,
    hitWidth: 218,
    hitHeight: 214,
  },
} as const;

const DUNGEON_SPRITE_CONFIG = {
  width: 150,
  height: 150,
  y: 2,
  originY: 0.6,
  glowRadius: 62,
  labelY: -80,
  hitWidth: 176,
  hitHeight: 174,
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
  darkForest: 0x112219,
  pineForest: 0x1b3028,
  tundra: 0x66716b,
  snowMountain: 0x7f8f95,
  swamp: 0x28352f,
  bog: 0x202b2d,
  desert: 0x665b39,
  badlands: 0x5a3d31,
  steppe: 0x6c6138,
  grassland: 0x3d4a2d,
  heath: 0x3a3530,
  mountain: 0x454944,
  hills: 0x4a513a,
  lake: 0x23434a,
  river: 0x2b5156,
} as const;

const WORLD_BASESET_TEXTURE = "world-baseset";
const WORLD_BASESET_ASSET = "/assets/world/environment/base-set.png";
const TERRAIN_DECOR_REVISION = 4;
const TERRAIN_CHUNK_SIZE = 1200;
const TERRAIN_CHUNK_VISIBILITY_MARGIN = 700;

const VEGETATION_ASSETS = {
  forestOak: "/assets/world/vegetation/forest-oak-cluster.svg",
  forestPines: "/assets/world/vegetation/forest-pine-group.svg",
  forestDeadTree: "/assets/world/vegetation/forest-dead-tree.svg",
  plainsGrass: "/assets/world/vegetation/plains-grass.svg",
  plainsShrub: "/assets/world/vegetation/plains-shrub.svg",
  plainsStones: "/assets/world/vegetation/plains-standing-stones.svg",
  mountainCrag: "/assets/world/vegetation/mountain-crag.svg",
  mountainRidge: "/assets/world/vegetation/mountain-ridge.svg",
  mountainBoulders: "/assets/world/vegetation/mountain-boulders.svg",
} as const;

type VegetationTextureKey = keyof typeof VEGETATION_ASSETS;

interface VegetationSprite {
  texture: VegetationTextureKey;
  width: number;
  height: number;
  scale?: number;
}

const VEGETATION_SPRITES = {
  forestOak: { texture: "forestOak", width: 128, height: 112, scale: .58 },
  forestPines: { texture: "forestPines", width: 128, height: 118, scale: .58 },
  forestDeadTree: { texture: "forestDeadTree", width: 96, height: 118, scale: .5 },
  plainsGrass: { texture: "plainsGrass", width: 96, height: 64, scale: .42 },
  plainsShrub: { texture: "plainsShrub", width: 112, height: 76, scale: .38 },
  plainsStones: { texture: "plainsStones", width: 112, height: 92, scale: .4 },
  mountainCrag: { texture: "mountainCrag", width: 144, height: 116, scale: .64 },
  mountainRidge: { texture: "mountainRidge", width: 160, height: 96, scale: .58 },
  mountainBoulders: { texture: "mountainBoulders", width: 112, height: 72, scale: .5 },
} satisfies Record<string, VegetationSprite>;

interface WorldDecorFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  scale?: number;
}

const WORLD_DECOR_FRAMES = {
  pinePair: { x: 530, y: 326, width: 14, height: 20, scale: 1.3 },
  roundTree: { x: 577, y: 360, width: 15, height: 16, scale: 1.45 },
  smallTree: { x: 627, y: 360, width: 11, height: 16, scale: 1.35 },
  treeLine: { x: 594, y: 327, width: 45, height: 16, scale: 1.05 },
  broadTrees: { x: 593, y: 384, width: 31, height: 16, scale: 1.25 },
  snowyRidge: { x: 194, y: 345, width: 62, height: 16, scale: 1.18 },
  grayRocks: { x: 257, y: 347, width: 31, height: 12, scale: 1.35 },
  tallRocks: { x: 289, y: 346, width: 15, height: 15, scale: 1.45 },
  lowRocks: { x: 306, y: 350, width: 14, height: 8, scale: 1.45 },
  smallRocks: { x: 322, y: 351, width: 12, height: 8, scale: 1.35 },
  stoneLine: { x: 32, y: 530, width: 32, height: 13, scale: 1.05 },
  bridgePlank: { x: 515, y: 426, width: 59, height: 13, scale: 1 },
} satisfies Record<string, WorldDecorFrame>;

interface TerrainChunk {
  x: number;
  y: number;
  size: number;
  textureKey: string;
  cells: TerrainCell[];
  image?: Phaser.GameObjects.Image;
}

export class WorldScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Container;
  private locationMarkers = new Map<string, Phaser.GameObjects.Container>();
  private locationLabels = new Map<string, Phaser.GameObjects.Text>();
  private enemyMarkers = new Map<string, Phaser.GameObjects.Container>();
  private warbandMarkers = new Map<string, Phaser.GameObjects.Container>();
  private warbandBattleMarkers = new Map<string, Phaser.GameObjects.Container>();
  private battleSiteMarkers = new Map<string, Phaser.GameObjects.Container>();
  private caravanMarkers = new Map<string, Phaser.GameObjects.Container>();
  private villagerMarkers = new Map<string, Phaser.GameObjects.Container>();
  private terrainChunks: TerrainChunk[] = [];
  private waypointMarker!: Phaser.GameObjects.Container;
  private waypointLine!: Phaser.GameObjects.Graphics;
  private enemyTooltip!: Phaser.GameObjects.Container;
  private enemyTooltipText!: Phaser.GameObjects.Text;
  private hoveredEnemyId: string | null = null;
  private hoveredWarbandId: string | null = null;
  private worldZoom = 0.78;
  private cameraPanX = 0;
  private cameraPanY = 0;
  private keys!: Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private centerCameraKey!: Phaser.Input.Keyboard.Key;
  private waitKey!: Phaser.Input.Keyboard.Key;
  private lastLocationId: string | null = null;
  private lastCaravanId: string | null = null;
  private lastTimeBucket = -1;
  private markerUpdateElapsed = 0;
  private visibilityUpdateElapsed = 0;
  private lastChunkCameraX = Number.NaN;
  private lastChunkCameraY = Number.NaN;
  private lastChunkZoom = Number.NaN;
  private visibilityElement: HTMLElement | null = null;
  private readonly handleCameraFocus = (event: Event): void => {
    const { x, y } = (event as CustomEvent<WorldCameraFocusDetail>).detail;
    this.cameraPanX = Phaser.Math.Clamp(
      x - gameSession.world.state.x,
      -gameSession.world.state.x,
      gameSession.world.map.width - gameSession.world.state.x,
    );
    this.cameraPanY = Phaser.Math.Clamp(
      y - gameSession.world.state.y,
      -gameSession.world.state.y,
      gameSession.world.map.height - gameSession.world.state.y,
    );
    this.cameras.main.centerOn(x, y);
    this.updateVisibilityOrigin();
    this.updateTerrainChunkVisibility();
  };

  constructor() {
    super("world");
  }

  preload(): void {
    for (const [assetKey, textureKey] of Object.entries(LOCATION_TEXTURES)) {
      this.load.image(textureKey, LOCATION_ASSETS[assetKey as keyof typeof LOCATION_ASSETS]);
    }
    this.load.image(WORLD_BASESET_TEXTURE, WORLD_BASESET_ASSET);
    for (const [textureKey, assetPath] of Object.entries(VEGETATION_ASSETS)) {
      this.load.image(textureKey, assetPath);
    }
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#111613");
    this.cameras.main.roundPixels = true;
    this.defineWorldBaseSetFrames();
    this.drawTerrain();
    this.drawLocations();
    this.createEnemies();
    this.createWarbands();
    this.createWarbandBattles();
    this.createBattleSites();
    this.createCaravans();
    this.createVillagerAnimation();
    this.createVillagers();
    this.createPlayer();
    this.createWaypoint();
    this.createEnemyTooltip();
    this.createInput();
    document.addEventListener(WORLD_CAMERA_FOCUS_EVENT, this.handleCameraFocus);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener(WORLD_CAMERA_FOCUS_EVENT, this.handleCameraFocus);
    });

    this.cameras.main
      .setBounds(0, 0, gameSession.world.map.width, gameSession.world.map.height)
      .setZoom(this.worldZoom);
    this.cameras.main.centerOn(
      gameSession.world.state.x,
      gameSession.world.state.y,
    );
    this.updateLocationLabelScale();
    this.updateTerrainChunkVisibility();
    this.updateMarkerVisibility();
  }

  private defineWorldBaseSetFrames(): void {
    const texture = this.textures.get(WORLD_BASESET_TEXTURE);
    if (texture.has("bridge-plank")) return;
    const frame = WORLD_DECOR_FRAMES.bridgePlank;
    texture.add("bridge-plank", 0, frame.x, frame.y, frame.width, frame.height);
  }

  update(_time: number, delta: number): void {
    if (gameSession.mode !== "world" || gameSession.uiBlocked) {
      gameSession.stopWaiting();
      return;
    }

    const zoomDelta = consumeWorldZoom();
    if (zoomDelta !== 0) {
      this.worldZoom = Phaser.Math.Clamp(
        this.worldZoom + zoomDelta * 0.14,
        0.22,
        1.6,
      );
      this.cameras.main.setZoom(this.worldZoom);
      this.updateLocationLabelScale();
      this.updateTerrainChunkVisibility();
    }

    const horizontal =
      Number(this.keys.right.isDown) - Number(this.keys.left.isDown);
    const vertical =
      Number(this.keys.down.isDown) - Number(this.keys.up.isDown);

    if (horizontal !== 0 || vertical !== 0) {
      gameSession.stopWaiting();
      if (gameSession.waypoint) gameSession.cancelNavigation();
      gameSession.moveWorld(
        horizontal,
        vertical,
        Math.min(delta, 40) / 1000,
      );
    } else if (this.waitKey.isDown) {
      if (gameSession.waypoint) gameSession.cancelNavigation();
      gameSession.waitWorld(Math.min(delta, 40) / 1000);
    } else {
      gameSession.stopWaiting();
      gameSession.advanceNavigation(Math.min(delta, 40) / 1000);
    }
    this.player.setPosition(gameSession.world.state.x, gameSession.world.state.y);
    this.updateCamera(Math.min(delta, 40) / 1000);
    this.interpolateVisibleNpcMarkers(Math.min(delta, 40) / 1000);

    this.markerUpdateElapsed += delta;
    this.visibilityUpdateElapsed += delta;
    if (this.markerUpdateElapsed >= 33) {
      this.markerUpdateElapsed %= 33;
      this.updateEnemyMarkers();
      this.updateWarbandMarkers();
      this.updateWarbandBattleMarkers();
      this.updateBattleSiteMarkers();
      this.updateEnemyTooltip();
      this.updateCaravanMarkers();
      this.updateVillagerMarkers();
      this.updateWaypoint();
    }
    if (this.visibilityUpdateElapsed >= 150) {
      this.visibilityUpdateElapsed %= 150;
      this.updateMarkerVisibility();
    }
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
    const baseGraphics = this.add.graphics().setDepth(0);
    const inset = map.boundaryInset;
    baseGraphics.fillStyle(TERRAIN_COLORS.sea).fillRect(0, 0, map.width, map.height);
    baseGraphics
      .fillStyle(TERRAIN_COLORS.plains)
      .fillRect(inset, inset, map.width - inset * 2, map.height - inset * 2);
    baseGraphics
      .lineStyle(28, 0x9c8b5c, 0.24)
      .strokeRect(inset, inset, map.width - inset * 2, map.height - inset * 2);
    baseGraphics
      .lineStyle(7, 0x111b1c, 0.92)
      .strokeRect(inset - 9, inset - 9, map.width - inset * 2 + 18, map.height - inset * 2 + 18);

    this.createTerrainChunks();

    const overlayGraphics = this.add.graphics().setDepth(2);

    for (let index = 0; index < 1900; index += 1) {
      const x =
        inset +
        ((index * 83 + gameSession.worldSeed % 997) % (map.width - inset * 2));
      const y =
        inset +
        ((index * 151 + gameSession.worldSeed % 631) % (map.height - inset * 2));
      const radius = 2 + (index % 4);
      overlayGraphics.fillStyle(index % 5 === 0 ? 0x84906c : 0x111711, 0.42);
      overlayGraphics.fillCircle(x, y, radius);
    }

    for (const river of map.terrainRivers) {
      overlayGraphics.lineStyle(river.width + 18, 0x14272a, 1);
      this.strokeTerrainPath(overlayGraphics, river.points);
      overlayGraphics.lineStyle(river.width, TERRAIN_COLORS.river, 1);
      this.strokeTerrainPath(overlayGraphics, river.points);
      overlayGraphics.lineStyle(5, 0x8aa29a, 0.65);
      this.strokeTerrainPath(overlayGraphics, river.points);
    }

    for (const road of [...map.terrainRoads].sort((left, right) => left.width - right.width)) {
      const isMinorRoad = road.width <= 12;
      overlayGraphics.lineStyle(road.width + (isMinorRoad ? 4 : 8), 0x211e17, 1);
      this.strokeTerrainPath(overlayGraphics, road.points);
      overlayGraphics.lineStyle(road.width, isMinorRoad ? 0x6a5f43 : 0x766b4e, 1);
      this.strokeTerrainPath(overlayGraphics, road.points);
    }
    this.drawBridgeCrossings(overlayGraphics);

    overlayGraphics.lineStyle(3, 0x759498, 0.2);
    for (let index = 0; index < 70; index += 1) {
      const horizontal = inset / 2 + ((index * 113) % (map.width - inset));
      const vertical = inset / 2 + ((index * 97) % (map.height - inset));
      overlayGraphics.beginPath();
      overlayGraphics.moveTo(horizontal - 18, 62 + (index % 4) * 24);
      overlayGraphics.lineTo(horizontal + 18, 62 + (index % 4) * 24);
      overlayGraphics.strokePath();
      overlayGraphics.beginPath();
      overlayGraphics.moveTo(62 + (index % 4) * 24, vertical - 18);
      overlayGraphics.lineTo(62 + (index % 4) * 24, vertical + 18);
      overlayGraphics.strokePath();
    }
  }

  private createTerrainChunks(): void {
    const map = gameSession.world.map;
    const columns = Math.ceil(map.width / TERRAIN_CHUNK_SIZE);
    const rows = Math.ceil(map.height / TERRAIN_CHUNK_SIZE);

    for (let column = 0; column < columns; column += 1) {
      for (let row = 0; row < rows; row += 1) {
        const x = column * TERRAIN_CHUNK_SIZE;
        const y = row * TERRAIN_CHUNK_SIZE;
        this.terrainChunks.push({
          x,
          y,
          size: TERRAIN_CHUNK_SIZE,
          textureKey: `terrain_${TERRAIN_DECOR_REVISION}_${gameSession.worldSeed}_${column}_${row}`,
          cells: [],
        });
      }
    }
    for (const cell of map.terrainCells) {
      const minimumColumn = Math.max(0, Math.floor(cell.x / TERRAIN_CHUNK_SIZE));
      const maximumColumn = Math.min(columns - 1, Math.floor((cell.x + cell.size) / TERRAIN_CHUNK_SIZE));
      const minimumRow = Math.max(0, Math.floor(cell.y / TERRAIN_CHUNK_SIZE));
      const maximumRow = Math.min(rows - 1, Math.floor((cell.y + cell.size) / TERRAIN_CHUNK_SIZE));
      for (let column = minimumColumn; column <= maximumColumn; column += 1) for (let row = minimumRow; row <= maximumRow; row += 1) {
        this.terrainChunks[column * rows + row].cells.push(cell);
      }
    }
  }

  private ensureTerrainChunkImage(chunk: TerrainChunk): Phaser.GameObjects.Image {
    if (chunk.image) return chunk.image;

    if (!this.textures.exists(chunk.textureKey)) {
      const map = gameSession.world.map;
      const texture = this.textures.createCanvas(
        chunk.textureKey,
        chunk.size,
        chunk.size,
      );
      if (!texture) {
        throw new Error(`Could not create terrain texture ${chunk.textureKey}`);
      }
      const context = texture.getContext();
      const vegetationImages = Object.fromEntries(
        Object.keys(VEGETATION_ASSETS).map((textureKey) => [
          textureKey,
          this.textures.get(textureKey).getSourceImage() as HTMLImageElement,
        ]),
      ) as Record<VegetationTextureKey, HTMLImageElement>;
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, chunk.size, chunk.size);
      for (const cell of chunk.cells) {
        const localX = cell.x - chunk.x;
        const localY = cell.y - chunk.y;
        this.drawTerrainCellGround(context, cell, localX, localY);

        this.drawTerrainCellDetails(context, vegetationImages, cell, localX, localY);
      }
      texture.refresh();
    }

    chunk.image = this.add
      .image(chunk.x, chunk.y, chunk.textureKey)
      .setOrigin(0)
      .setDepth(1)
      .setVisible(false);
    return chunk.image;
  }

  private drawTerrainCellDetails(
    context: CanvasRenderingContext2D,
    vegetationImages: Record<VegetationTextureKey, HTMLImageElement>,
    cell: TerrainCell,
    localX: number,
    localY: number,
  ): void {
    if (cell.type === "lake") return;
    const seed = Math.abs(
      Math.floor(cell.x * 17 + cell.y * 31 + gameSession.worldSeed * 13),
    );
    const density = this.getTerrainCellDetailDensity(cell.type, seed);
    for (let index = 0; index < density; index += 1) {
      const offsetSeed = seed + index * 97;
      const x = localX + 18 + (offsetSeed % Math.max(1, cell.size - 36));
      const y =
        localY +
        18 +
        (Math.floor(offsetSeed / 11) % Math.max(1, cell.size - 36));
      this.drawTerrainDetail(context, vegetationImages, cell.type, x, y, offsetSeed);
    }
  }

  private drawTerrainCellGround(
    context: CanvasRenderingContext2D,
    cell: TerrainCell,
    localX: number,
    localY: number,
  ): void {
    const color = this.colorToCss(TERRAIN_COLORS[cell.type]);
    context.fillStyle = color;
    context.globalAlpha = cell.type === "lake" ? .98 : .9;
    context.fillRect(localX, localY, cell.size + 1, cell.size + 1);
    context.globalAlpha = 1;
  }

  private getTerrainCellDetailDensity(
    type: TerrainCell["type"],
    seed: number,
  ): number {
    if (["forest", "darkForest", "pineForest"].includes(type)) return 3 + (seed % 3);
    if (type === "mountain" || type === "snowMountain") return seed % 3 === 0 ? 2 : 1;
    if (type === "hills") return seed % 4 === 0 ? 0 : 1 + (seed % 2);
    if (type === "plains" || type === "grassland" || type === "heath") return 2 + (seed % 2);
    if (type === "tundra") return seed % 4 === 0 ? 1 : 0;
    if (type === "badlands" || type === "steppe") return seed % 5 === 0 ? 1 : 0;
    return 0;
  }

  private drawTerrainDetail(
    context: CanvasRenderingContext2D,
    vegetationImages: Record<VegetationTextureKey, HTMLImageElement>,
    type: TerrainCell["type"],
    x: number,
    y: number,
    seed: number,
  ): void {
    if (["forest", "darkForest", "pineForest"].includes(type)) {
      const frames =
        type === "darkForest"
          ? [VEGETATION_SPRITES.forestOak, VEGETATION_SPRITES.forestDeadTree]
          : type === "pineForest"
            ? [VEGETATION_SPRITES.forestPines, VEGETATION_SPRITES.forestDeadTree]
            : [
                VEGETATION_SPRITES.forestOak,
                VEGETATION_SPRITES.forestPines,
                VEGETATION_SPRITES.forestDeadTree,
              ];
      this.drawVegetationSprite(context, vegetationImages, frames[seed % frames.length], x, y, seed);
      return;
    }

    if (type === "plains" || type === "grassland" || type === "heath") {
      const frames = type === "heath"
        ? [VEGETATION_SPRITES.plainsShrub, VEGETATION_SPRITES.plainsStones, VEGETATION_SPRITES.plainsGrass]
        : [VEGETATION_SPRITES.plainsGrass, VEGETATION_SPRITES.plainsShrub];
      this.drawVegetationSprite(context, vegetationImages, frames[seed % frames.length], x, y, seed);
      return;
    }

    if (type === "badlands" || type === "steppe" || type === "tundra") {
      this.drawVegetationSprite(context, vegetationImages, seed % 2 === 0 ? VEGETATION_SPRITES.plainsStones : VEGETATION_SPRITES.plainsGrass, x, y, seed);
      return;
    }

    if (type === "mountain" || type === "snowMountain" || type === "hills") {
      const frame =
        type === "hills"
          ? seed % 2 === 0
            ? VEGETATION_SPRITES.mountainBoulders
            : VEGETATION_SPRITES.mountainRidge
          : type === "snowMountain"
            ? VEGETATION_SPRITES.mountainRidge
            : seed % 2 === 0
              ? VEGETATION_SPRITES.mountainCrag
              : VEGETATION_SPRITES.mountainRidge;
      this.drawVegetationSprite(context, vegetationImages, frame, x, y, seed);
    }
  }

  private drawVegetationSprite(
    context: CanvasRenderingContext2D,
    vegetationImages: Record<VegetationTextureKey, HTMLImageElement>,
    sprite: VegetationSprite,
    x: number,
    y: number,
    seed: number,
  ): void {
    const scale = (sprite.scale ?? 1) * (.82 + (seed % 7) * .055);
    const width = Math.round(sprite.width * scale);
    const height = Math.round(sprite.height * scale);
    context.save();
    context.globalAlpha = .72 + (seed % 4) * .07;
    if (seed % 5 === 0) {
      context.translate(Math.round(x), 0);
      context.scale(-1, 1);
      context.drawImage(vegetationImages[sprite.texture], Math.round(-width / 2), Math.round(y - height * .82), width, height);
    } else {
      context.drawImage(vegetationImages[sprite.texture], Math.round(x - width / 2), Math.round(y - height * .82), width, height);
    }
    context.restore();
  }

  private drawDecorFrame(
    context: CanvasRenderingContext2D,
    baseSetImage: HTMLImageElement,
    frame: WorldDecorFrame,
    x: number,
    y: number,
    seed: number,
  ): void {
    const scale = (frame.scale ?? 1) * (0.86 + (seed % 5) * 0.07);
    const width = Math.round(frame.width * scale);
    const height = Math.round(frame.height * scale);
    context.drawImage(
      baseSetImage,
      frame.x,
      frame.y,
      frame.width,
      frame.height,
      Math.round(x - width / 2),
      Math.round(y - height / 2),
      width,
      height,
    );
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
      if (
        location.type === "dungeon" &&
        !gameSession.world.isDungeonActive(location.id)
      ) {
        continue;
      }
      const color = LOCATION_COLORS[location.type];
      const factionId = gameSession.factionState.locationFactions[location.id];
      const spriteConfig = this.getLocationSpriteConfig(location);
      const marker = this.add.container(location.x, location.y);
      const glow = this.add.circle(0, 0, spriteConfig?.glowRadius ?? 25, color, 0.12);
      const markerBody =
        spriteConfig
          ? this.add
              .image(0, spriteConfig.y, spriteConfig.texture)
              .setDisplaySize(spriteConfig.width, spriteConfig.height)
              .setOrigin(0.5, spriteConfig.originY)
          : null;
      const outer =
        spriteConfig
          ? null
          : this.add.circle(0, 0, 14, 0x080a09, 0.95).setStrokeStyle(2, color, 0.9);
      const inner =
        spriteConfig
          ? null
          : this.add.circle(0, 0, 5, color, 1);
      const label = this.add
        .text(0, spriteConfig?.labelY ?? -30, i18n.t(location.nameKey), {
          color:
            location.type === "city" && factionId
              ? this.hexColor(FACTION_COLORS[factionId])
              : "#eadfca",
          fontFamily: "Cinzel, Georgia, serif",
          fontSize: "11px",
          backgroundColor: "rgba(7, 10, 8, 0.78)",
          padding: { x: 6, y: 3 },
        })
        .setOrigin(0.5, 1)
        .setStroke("#10130f", 2);
      marker.add([
        glow,
        ...(markerBody ? [markerBody] : []),
        ...(outer ? [outer] : []),
        ...(inner ? [inner] : []),
        label,
      ]);
      marker.setDepth(7);
      if (factionId) {
        const factionY =
          spriteConfig && "factionY" in spriteConfig ? spriteConfig.factionY : 20;
        marker.add(
          this.add
            .rectangle(0, factionY, 9, 9, FACTION_COLORS[factionId], 0.95)
            .setAngle(45)
            .setStrokeStyle(1, 0x111411),
        );
      }
      this.locationMarkers.set(location.id, marker);
      this.locationLabels.set(location.id, label);
      marker
        .setSize(spriteConfig?.hitWidth ?? 150, spriteConfig?.hitHeight ?? 76)
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

      marker.setData("pulseTween", this.tweens.add({
        targets: glow,
        scale: 1.55,
        alpha: 0.02,
        duration: 1700 + location.x % 500,
        yoyo: true,
        repeat: -1,
      }));
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
    this.waypointMarker.setData("pulseTween", this.tweens.add({
      targets: glow,
      scale: 1.45,
      alpha: 0.02,
      duration: 1200,
      yoyo: true,
      repeat: -1,
    }));
  }

  private updateWaypoint(): void {
    this.waypointLine.clear();
    const waypoint = gameSession.waypoint;
    if (!waypoint) {
      this.setMarkerVisible(this.waypointMarker, false);
      return;
    }
    this.waypointMarker.setPosition(waypoint.x, waypoint.y);
    this.setMarkerVisible(this.waypointMarker, true);
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
      marker.setData("pulseTween", this.tweens.add({
        targets: glow,
        scale: 1.7,
        alpha: 0.02,
        duration: 900,
        yoyo: true,
        repeat: -1,
      }));
    }
  }

  private updateEnemyMarkers(): void {
    for (const enemy of gameSession.world.state.enemies) {
      const marker = this.enemyMarkers.get(enemy.id);
      if (!marker) continue;
      this.setMarkerTarget(marker, enemy.x, enemy.y);
      this.setMarkerVisible(marker, enemy.active && this.isWithinSight(enemy.x, enemy.y));
    }
  }

  private createEnemyTooltip(): void {
    const background = this.add
      .rectangle(0, 0, 320, 202, 0x080b09, 0.96)
      .setOrigin(0)
      .setStrokeStyle(1, 0xb65a50, 0.8);
    this.enemyTooltipText = this.add.text(14, 12, "", {
      color: "#d8d2c2",
      fontFamily: "Arial",
      fontSize: "12px",
      lineSpacing: 5,
      wordWrap: { width: 292 },
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
    const visibleRoster = enemy.sourceLocationId
      ? enemy.roster.map((unit) => unit.cardId)
      : archetype.deck;
    for (const cardId of visibleRoster) {
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
      `${i18n.t("world.enemyTooltip.threat")}: ${"◆".repeat(gameSession.world.getEnemyThreatRating(enemy))}`,
      `${i18n.t("world.enemyTooltip.troops")}: ${enemy.partySize}   ${i18n.t("world.enemyTooltip.speed")}: ${Math.round(enemy.speed)}`,
      `Activity: ${getNpcActivityLabel(enemy.activity)}`,
      enemy.sourceLocationId ? `Loot: ${enemy.gold}   Supplies: ${enemy.rations}   Prisoners: ${enemy.prisoners.reduce((sum, stack) => sum + stack.quantity, 0)}` : `${i18n.t("world.enemyTooltip.load")}: ${enemy.inventoryWeight.toFixed(1)}`,
      `${i18n.t("world.enemyTooltip.warband")}: ${deck}`,
      i18n.t("world.enemyTooltip.click"),
    ]);
    this.hoveredEnemyId = enemyId;
    this.enemyTooltip.setVisible(true);
    this.enemyTooltip.setPosition(enemy.x + 34, enemy.y - 186);
  }

  private updateEnemyTooltip(): void {
    if (this.hoveredWarbandId) {
      const warband = gameSession.world.getWarband(this.hoveredWarbandId);
      if (
        !warband ||
        warband.state === "destroyed" ||
        !this.isWithinSight(warband.x, warband.y, 80)
      ) {
        this.hideEnemyTooltip();
        return;
      }
      this.enemyTooltip.setPosition(warband.x + 34, warband.y - 190);
      return;
    }
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
    this.hoveredWarbandId = null;
    this.enemyTooltip.setVisible(false);
  }

  private createWarbands(): void {
    for (const warband of gameSession.world.state.warbands) {
      const color = FACTION_COLORS[warband.factionId] ?? 0xb8a46b;
      const glow = this.add.circle(0, 0, 24, color, 0.11);
      const ring = this.add
        .circle(0, 0, 12, 0x0b0d0b, 0.96)
        .setStrokeStyle(2, color, 0.95);
      const core = this.add.circle(0, 0, 5, color, 1);
      const banner = this.add.rectangle(8, -15, 13, 18, color, 0.92).setAngle(12);
      const icon = this.add
        .text(0, 18, this.getWarbandIcon(warband.type), {
          color: "#eadfca",
          fontFamily: "Arial",
          fontSize: "11px",
        })
        .setOrigin(0.5);
      const marker = this.add.container(warband.x, warband.y, [
        glow,
        ring,
        core,
        banner,
        icon,
      ]);
      marker.setDepth(8);
      marker
        .setSize(58, 66)
        .setInteractive({ cursor: "pointer" })
        .on(Phaser.Input.Events.POINTER_OVER, () => {
          this.showWarbandTooltip(warband.id);
        })
        .on(Phaser.Input.Events.POINTER_OUT, () => {
          if (this.hoveredWarbandId === warband.id) this.hideEnemyTooltip();
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
            const distanceToPlayer = Math.hypot(
              warband.x - gameSession.world.state.x,
              warband.y - gameSession.world.state.y,
            );
            if (
              warband.activeBattleId &&
              distanceToPlayer <= WARBAND_INTERACTION_RANGE
            ) {
              gameSession.joinWarbandBattle(warband.activeBattleId);
              return;
            }
            if (distanceToPlayer <= WARBAND_INTERACTION_RANGE) {
              gameSession.selectWarband(warband.id);
            } else {
              gameSession.pursueWarband(warband.id);
            }
          },
        );
      this.warbandMarkers.set(warband.id, marker);
      marker.setData("pulseTween", this.tweens.add({
        targets: glow,
        scale: 1.55,
        alpha: 0.02,
        duration: 1200,
        yoyo: true,
        repeat: -1,
      }));
    }
  }

  private updateWarbandMarkers(): void {
    for (const warband of gameSession.world.state.warbands) {
      const marker = this.warbandMarkers.get(warband.id);
      if (!marker) continue;
      this.setMarkerTarget(marker, warband.x, warband.y);
      this.setMarkerVisible(marker,
        warband.state !== "destroyed" &&
          (!warband.bountyHunter || (gameSession.factionState.wanted[warband.factionId] ?? 0) >= 25) &&
          this.isWithinSight(warband.x, warband.y, 80),
      );
    }
  }

  private createWarbandBattles(): void {
    for (const battle of gameSession.world.state.warbandBattles) {
      this.ensureWarbandBattleMarker(battle.id);
    }
  }

  private ensureWarbandBattleMarker(
    battleId: string,
  ): Phaser.GameObjects.Container | null {
    const existing = this.warbandBattleMarkers.get(battleId);
    if (existing) return existing;
    const battle = gameSession.world.getWarbandBattle(battleId);
    if (!battle) return null;
    const glow = this.add.circle(0, 0, 32, 0xffb34d, 0.13);
    const ring = this.add
      .circle(0, 0, 15, 0x140c05, 0.96)
      .setStrokeStyle(2, 0xffbd68, 0.95);
    const swords = this.add
      .text(0, -1, "⚔", {
        color: "#f2d59a",
        fontFamily: "Arial",
        fontSize: "18px",
      })
      .setOrigin(0.5);
    const marker = this.add
      .container(battle.x, battle.y, [glow, ring, swords])
      .setDepth(9);
    marker
      .setSize(62, 62)
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
          if (
            Math.hypot(
              battle.x - gameSession.world.state.x,
              battle.y - gameSession.world.state.y,
            ) <= 86
          ) {
            gameSession.joinWarbandBattle(battle.id);
          } else {
            gameSession.setWaypoint(battle.x, battle.y, "world.warbandBattle");
          }
        },
      );
    this.warbandBattleMarkers.set(battle.id, marker);
    marker.setData("pulseTween", this.tweens.add({
      targets: glow,
      scale: 1.7,
      alpha: 0.025,
      duration: 720,
      yoyo: true,
      repeat: -1,
    }));
    return marker;
  }

  private updateWarbandBattleMarkers(): void {
    const activeIds = new Set<string>();
    for (const battle of gameSession.world.state.warbandBattles) {
      activeIds.add(battle.id);
      const marker = this.ensureWarbandBattleMarker(battle.id);
      marker?.setPosition(battle.x, battle.y);
      if (marker) this.setMarkerVisible(marker, battle.state === "fighting" && this.isWithinSight(battle.x, battle.y, 180));
    }
    for (const [battleId, marker] of this.warbandBattleMarkers) {
      if (activeIds.has(battleId)) continue;
      marker.destroy(true);
      this.warbandBattleMarkers.delete(battleId);
    }
  }

  private showWarbandTooltip(warbandId: string): void {
    const warband = gameSession.world.getWarband(warbandId);
    if (!warband) return;
    const relation = getFactionRelation(
      PLAYER_FACTION_ID,
      warband.factionId,
      gameSession.factionState,
    );
    const target = warband.targetWarbandId
      ? gameSession.world.getWarband(warband.targetWarbandId)
      : null;
    const enemyTarget = warband.targetEnemyId
      ? gameSession.world.state.enemies.find(
          (enemy) => enemy.id === warband.targetEnemyId,
        )
      : null;
    this.enemyTooltipText.setText([
      (warband.displayName ?? i18n.t(warband.nameKey)).toUpperCase(),
      `${i18n.t("world.warbandTooltip.faction")}: ${i18n.t(`faction.${warband.factionId}.name`)}`,
      `${i18n.t("world.warbandTooltip.relation")}: ${i18n.t(`world.relation.${relation}`)}`,
      `${i18n.t("world.warbandTooltip.type")}: ${i18n.t(`world.warbandType.${warband.type}`)}`,
      `${warband.type === "lord" ? `Rank: ${getNobleRankLabel(warband.nobleRank)}   Personality: ${getLordPersonalityLabel(warband.personality)}   ` : ""}Activity: ${getNpcActivityLabel(warband.activity)}`,
      `${i18n.t("world.warbandTooltip.strength")}: ${Math.round(estimateWarbandStrength(warband))}`,
      `${i18n.t("world.warbandTooltip.troops")}: ${warband.unitIds.length}   ${i18n.t("world.warbandTooltip.state")}: ${i18n.t(`world.warbandState.${warband.state}`)}`,
      `Gold: ${warband.gold}   Supplies: ${warband.rations}   Prisoners: ${warband.prisoners.reduce((sum, stack) => sum + stack.quantity, 0)}`,
      `${i18n.t("world.warbandTooltip.target")}: ${target ? i18n.t(target.nameKey) : enemyTarget ? i18n.t("world.enemyTooltip.warband") : "—"}`,
      warband.activeBattleId
        ? i18n.t("world.warbandTooltip.joinBattle")
        : i18n.t("world.warbandTooltip.click"),
    ]);
    this.hoveredWarbandId = warbandId;
    this.hoveredEnemyId = null;
    this.enemyTooltip.setVisible(true);
    this.enemyTooltip.setPosition(warband.x + 34, warband.y - 190);
  }

  private getWarbandIcon(type: string): string {
    if (type === "lord") return "♛";
    if (type === "scout") return "S";
    if (type === "merchantEscort") return "M";
    if (type === "militia") return "L";
    if (type === "army") return "A";
    if (type === "elite") return "E";
    return "P";
  }

  private hexColor(color: number): string {
    return `#${color.toString(16).padStart(6, "0")}`;
  }

  private colorToCss(color: number): string {
    return this.hexColor(color);
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
      marker.setData("pulseTween", this.tweens.add({
        targets: glow,
        scale: 1.5,
        alpha: 0.025,
        duration: 1300,
        yoyo: true,
        repeat: -1,
      }));
    }
  }

  private updateCaravanMarkers(): void {
    for (const caravan of gameSession.economyState.caravans) {
      const marker = this.caravanMarkers.get(caravan.id);
      if (marker) this.setMarkerTarget(marker, caravan.x, caravan.y);
      if (marker) this.setMarkerVisible(marker, this.isWithinSight(caravan.x, caravan.y));
    }
  }

  private createVillagers(): void {
    for (const villager of gameSession.economyState.villagers) {
      const shadow = this.add.ellipse(0, 10, 29, 8, 0x000000, 0.38);
      const sprite = this.add.sprite(0, -4, "villager-trader-0").play("villager-trader-walk");
      const origin = gameSession.world.map.locations.find((location) => location.id === villager.originId);
      const destination = gameSession.world.map.locations.find((location) => location.id === villager.destinationId);
      sprite.setScale(destination && origin && destination.x < origin.x ? -1 : 1, 1);
      const marker = this.add.container(villager.x, villager.y, [
        shadow,
        sprite,
      ]);
      marker.setDepth(6);
      this.villagerMarkers.set(villager.id, marker);
    }
  }

  private createVillagerAnimation(): void {
    if (this.textures.exists("villager-trader-0")) return;
    for (let frame = 0; frame < 4; frame += 1) {
      const graphics = this.make.graphics({ x: 0, y: 0 }, false);
      const step = frame % 2 === 0 ? -1 : 1;
      graphics.fillStyle(0x000000, 0).fillRect(0, 0, 42, 42);
      graphics.fillStyle(0x382b1c, 1).fillRoundedRect(18, 22, 19, 10, 2);
      graphics.lineStyle(2, 0xb68c49, 1).strokeRoundedRect(18, 22, 19, 10, 2);
      graphics.fillStyle(0xc59a4e, 1).fillTriangle(19, 22, 27, 14, 36, 22);
      graphics.fillStyle(0x171712, 1).fillCircle(22 + step, 33, 4).fillCircle(34 - step, 33, 4);
      graphics.fillStyle(0x70583a, 1).fillRect(8, 14 + Math.abs(step), 9, 15);
      graphics.fillStyle(0xd0b47a, 1).fillCircle(12, 10 + Math.abs(step), 5);
      graphics.fillStyle(0x4a3924, 1).fillRect(4, 16, 5, 11);
      graphics.lineStyle(3, 0x6c5535, 1).lineBetween(11, 28, 9 + step * 2, 37).lineBetween(15, 28, 17 - step * 2, 37);
      graphics.lineStyle(2, 0xa98246, 1).lineBetween(16, 20, 22, 26);
      graphics.generateTexture(`villager-trader-${frame}`, 42, 42);
      graphics.destroy();
    }
    this.anims.create({ key: "villager-trader-walk", frames: [0, 1, 2, 3].map((frame) => ({ key: `villager-trader-${frame}` })), frameRate: 7, repeat: -1 });
  }

  private updateVillagerMarkers(): void {
    const activeIds = new Set(gameSession.economyState.villagers.map((villager) => villager.id));
    for (const villager of gameSession.economyState.villagers) {
      const marker = this.villagerMarkers.get(villager.id);
      if (marker) this.setMarkerTarget(marker, villager.x, villager.y);
      if (marker) this.setMarkerVisible(marker, this.isWithinSight(villager.x, villager.y));
    }
    for (const [villagerId, marker] of this.villagerMarkers) {
      if (activeIds.has(villagerId)) continue;
      marker.destroy(true);
      this.villagerMarkers.delete(villagerId);
    }
  }

  private createBattleSites(): void {
    for (const site of gameSession.world.state.battleSites) this.ensureBattleSiteMarker(site.id);
  }

  private ensureBattleSiteMarker(siteId: string): Phaser.GameObjects.Container | null {
    const existing = this.battleSiteMarkers.get(siteId);
    if (existing) return existing;
    const site = gameSession.world.state.battleSites.find((candidate) => candidate.id === siteId);
    if (!site) return null;
    const glow = this.add.circle(0, 0, 20, 0x6e0909, 0.22);
    const cross = this.add.graphics();
    cross.lineStyle(7, 0x250303, 0.8);
    cross.lineBetween(-13, -13, 13, 13);
    cross.lineBetween(13, -13, -13, 13);
    cross.lineStyle(4, 0xc52f2f, 1);
    cross.lineBetween(-12, -12, 12, 12);
    cross.lineBetween(12, -12, -12, 12);
    const marker = this.add.container(site.x, site.y, [glow, cross]).setDepth(5);
    this.battleSiteMarkers.set(site.id, marker);
    return marker;
  }

  private updateBattleSiteMarkers(): void {
    const activeIds = new Set<string>();
    for (const site of gameSession.world.state.battleSites) {
      activeIds.add(site.id);
      const marker = this.ensureBattleSiteMarker(site.id);
      marker?.setPosition(site.x, site.y);
      if (marker) {
        this.setMarkerVisible(
          marker,
          gameSession.world.isPositionExplored(site.x, site.y) || this.isWithinSight(site.x, site.y, 120),
        );
      }
    }
    for (const [siteId, marker] of this.battleSiteMarkers) {
      if (activeIds.has(siteId)) continue;
      marker.destroy(true);
      this.battleSiteMarkers.delete(siteId);
    }
  }

  private updateMarkerVisibility(): void {
    for (const location of gameSession.world.map.locations) {
      const inactiveDungeon =
        location.type === "dungeon" &&
        !gameSession.world.isDungeonActive(location.id);
      const visible =
        location.type === "city" || location.type === "village" || location.type === "soulTemple"
          ? true
          : location.type === "dungeon"
            ? !inactiveDungeon &&
              (gameSession.world.isPositionExplored(location.x, location.y) ||
                this.isWithinSight(location.x, location.y, 80))
            : this.isWithinSight(location.x, location.y, 80);
      const marker = this.locationMarkers.get(location.id);
      if (marker) this.setMarkerVisible(marker, visible);
    }
  }

  private setMarkerVisible(marker: Phaser.GameObjects.Container, visible: boolean): void {
    if (marker.visible !== visible) marker.setVisible(visible);
    const tween = marker.getData("pulseTween") as Phaser.Tweens.Tween | undefined;
    if (tween && tween.paused === visible) tween.paused = !visible;
    for (const child of marker.list) {
      if (!(child instanceof Phaser.GameObjects.Sprite) || !child.anims.isPlaying) continue;
      if (visible && child.anims.isPaused) child.anims.resume();
      else if (!visible && !child.anims.isPaused) child.anims.pause();
    }
  }

  private getLocationSpriteConfig(
    location: MapLocation,
  ):
    | (typeof LOCATION_SPRITE_CONFIG)[keyof typeof LOCATION_SPRITE_CONFIG]
    | (typeof DUNGEON_SPRITE_CONFIG & { texture: string })
    | null {
    if (location.type === "city" || location.type === "village" || location.type === "soulTemple") {
      return LOCATION_SPRITE_CONFIG[location.type];
    }
    if (location.type !== "dungeon") return null;
    const textureKey = this.getDungeonTextureKey(location);
    return {
      ...DUNGEON_SPRITE_CONFIG,
      texture: LOCATION_TEXTURES[textureKey],
    };
  }

  private getDungeonTextureKey(location: MapLocation): LocationTextureKey {
    const profile = location.spawnProfile;
    if (this.isLocationTextureKey(profile?.spriteKey)) return profile.spriteKey;

    const biomeKey = this.normalizeDungeonToken(profile?.biome ?? "");
    if (DUNGEON_BIOME_TEXTURES[biomeKey]) return DUNGEON_BIOME_TEXTURES[biomeKey];

    for (const enemyId of profile?.enemyIds ?? []) {
      const enemyTexture = DUNGEON_ENEMY_TEXTURES[enemyId];
      if (enemyTexture) return enemyTexture;
    }

    const bossTexture = profile?.bossEnemyId
      ? DUNGEON_ENEMY_TEXTURES[profile.bossEnemyId]
      : undefined;
    if (bossTexture) return bossTexture;

    const nameKey = this.normalizeDungeonToken(location.nameKey);
    if (nameKey.includes("koboldwarren")) return "kobold";
    if (nameKey.includes("beastden")) return "beast";
    if (nameKey.includes("sunken") || nameKey.includes("hollowdepths")) return "swamp";
    if (nameKey.includes("bonecrypt")) return "undead";
    if (nameKey.includes("orcwarcamp")) return "orc";
    if (nameKey.includes("ashrift") || nameKey.includes("embercavern")) return "elemental";
    if (nameKey.includes("rustedvault") || nameKey.includes("oldmine")) return "machine";

    return "beast";
  }

  private isLocationTextureKey(value: string | undefined): value is LocationTextureKey {
    return Boolean(value && value in LOCATION_TEXTURES);
  }

  private normalizeDungeonToken(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  private updateLocationLabelScale(): void {
    const scale = Phaser.Math.Clamp(0.9 / this.worldZoom, 0.82, 2.15);
    for (const label of this.locationLabels.values()) {
      label.setScale(scale);
    }
  }

  private isWithinSight(x: number, y: number, margin = 0): boolean {
    const dx = x - gameSession.world.state.x;
    const dy = y - gameSession.world.state.y;
    const radius = gameSession.visibilityRadius + margin;
    return dx * dx + dy * dy <= radius * radius;
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
    this.centerCameraKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.waitKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
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

  private setMarkerTarget(marker: Phaser.GameObjects.Container, x: number, y: number): void {
    const distanceSquared = (marker.x - x) ** 2 + (marker.y - y) ** 2;
    marker.setData("targetX", x);
    marker.setData("targetY", y);
    if (!marker.visible || distanceSquared > 320 * 320) marker.setPosition(x, y);
  }

  private interpolateVisibleNpcMarkers(deltaSeconds: number): void {
    const blend = 1 - Math.exp(-14 * deltaSeconds);
    for (const markers of [this.enemyMarkers, this.warbandMarkers, this.caravanMarkers, this.villagerMarkers]) {
      for (const marker of markers.values()) {
        if (!marker.visible) continue;
        const targetX = marker.getData("targetX") as number | undefined;
        const targetY = marker.getData("targetY") as number | undefined;
        if (targetX === undefined || targetY === undefined) continue;
        marker.setPosition(
          Phaser.Math.Linear(marker.x, targetX, blend),
          Phaser.Math.Linear(marker.y, targetY, blend),
        );
      }
    }
  }

  private updateCamera(deltaSeconds: number): void {
    const cameraHorizontal =
      Number(this.cursors.right.isDown) - Number(this.cursors.left.isDown);
    const cameraVertical =
      Number(this.cursors.down.isDown) - Number(this.cursors.up.isDown);
    const panSpeed = 720 / this.worldZoom;
    this.cameraPanX = Phaser.Math.Clamp(
      this.cameraPanX + cameraHorizontal * panSpeed * deltaSeconds,
      -gameSession.world.state.x,
      gameSession.world.map.width - gameSession.world.state.x,
    );
    this.cameraPanY = Phaser.Math.Clamp(
      this.cameraPanY + cameraVertical * panSpeed * deltaSeconds,
      -gameSession.world.state.y,
      gameSession.world.map.height - gameSession.world.state.y,
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
    this.updateTerrainChunkVisibility();
  }

  private updateTerrainChunkVisibility(): void {
    const view = this.cameras.main.worldView;
    const cameraX = view.centerX;
    const cameraY = view.centerY;
    if (
      Math.abs(cameraX - this.lastChunkCameraX) < 72 &&
      Math.abs(cameraY - this.lastChunkCameraY) < 72 &&
      Math.abs(this.worldZoom - this.lastChunkZoom) < 0.001
    ) return;
    this.lastChunkCameraX = cameraX;
    this.lastChunkCameraY = cameraY;
    this.lastChunkZoom = this.worldZoom;
    const left = view.x - TERRAIN_CHUNK_VISIBILITY_MARGIN;
    const right = view.right + TERRAIN_CHUNK_VISIBILITY_MARGIN;
    const top = view.y - TERRAIN_CHUNK_VISIBILITY_MARGIN;
    const bottom = view.bottom + TERRAIN_CHUNK_VISIBILITY_MARGIN;

    for (const chunk of this.terrainChunks) {
      const visible =
        chunk.x + chunk.size >= left &&
        chunk.x <= right &&
        chunk.y + chunk.size >= top &&
        chunk.y <= bottom;
      if (visible) {
        this.ensureTerrainChunkImage(chunk).setVisible(true);
      } else {
        chunk.image?.setVisible(false);
      }
    }
  }

  private updateVisibilityOrigin(): void {
    const camera = this.cameras.main;
    const screenX = (gameSession.world.state.x - camera.worldView.x) * camera.zoom;
    const screenY = (gameSession.world.state.y - camera.worldView.y) * camera.zoom;
    this.visibilityElement ??= document.querySelector<HTMLElement>(".world-visibility");
    this.visibilityElement?.style.setProperty("--visibility-x", `${Math.round(screenX)}px`);
    this.visibilityElement?.style.setProperty("--visibility-y", `${Math.round(screenY)}px`);
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

        graphics.lineStyle(roadWidth + 14, 0x17140f, 1);
        graphics.beginPath();
        graphics.moveTo(bridgeStart.x, bridgeStart.y);
        graphics.lineTo(bridgeEnd.x, bridgeEnd.y);
        graphics.strokePath();
        graphics.lineStyle(roadWidth + 5, 0x8f7549, 1);
        graphics.beginPath();
        graphics.moveTo(bridgeStart.x, bridgeStart.y);
        graphics.lineTo(bridgeEnd.x, bridgeEnd.y);
        graphics.strokePath();

        const plankCount = Math.max(2, Math.floor((bridgeLength + 48) / 14));
        const normalX = -directionY;
        const normalY = directionX;
        const plankAngle = Phaser.Math.RadToDeg(Math.atan2(normalY, normalX));
        for (let plank = 0; plank <= plankCount; plank += 1) {
          const progress = plank / plankCount;
          const centerX = bridgeStart.x + (bridgeEnd.x - bridgeStart.x) * progress;
          const centerY = bridgeStart.y + (bridgeEnd.y - bridgeStart.y) * progress;
          const halfWidth = roadWidth * 0.48;
          this.add
            .image(centerX, centerY, WORLD_BASESET_TEXTURE, "bridge-plank")
            .setDisplaySize(Math.max(18, roadWidth * 1.05), 9)
            .setAngle(plankAngle)
            .setDepth(4)
            .setAlpha(0.86);
          graphics.lineStyle(2, 0x3b2e1d, 1);
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
