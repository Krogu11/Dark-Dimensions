import type {
  EnemyArchetype,
  MapLocation,
  NobleProfile,
  NobleRank,
  TerrainRiver,
  TerrainRoad,
  TerrainCell,
  TerrainZone,
  WarbandSpawn,
  WarbandTemplate,
  WorldEnemySpawn,
  WorldMapDefinition,
} from "../content/schemas";
import { assignSettlementFactions, type FactionId } from "../quests/Factions";
import { distanceToSegment, isPositionNearPath } from "./WorldTerrain";
import { generateUniqueCityName } from "./CityNames";

const LOCATION_NAMES = {
  city: [
    "hollowmere",
    "cinderwatch",
    "greyhaven",
    "blackwater",
    "ashford",
    "stormwatch",
    "ravenhold",
    "thornwall",
    "whiteford",
    "redbrook",
    "stonecross",
    "willowbank",
  ],
  village: [
    "briarHollow",
    "dunmarsh",
    "oakrest",
    "mournfield",
    "redbrook",
    "millfield",
    "stonecross",
    "willowbank",
    "copperbrook",
    "greenpasture",
    "vineyard",
    "whiteford",
  ],
  castle: ["ironkeep", "gloamspire", "stormwatch", "ravenhold", "thornwall"],
  dungeon: [
    "sunkenVault",
    "sunkenNest",
    "boneCrypt",
    "emberCavern",
    "hollowDepths",
    "oldMine",
    "koboldWarren",
    "orcWarcamp",
    "beastDen",
    "ashRift",
    "rustedVault",
    "outlawHideout",
  ],
  landmark: [
    "witchStone",
    "fallenColossus",
    "moonWell",
    "bleakMonument",
    "oldShrine",
    "watcherTree",
    "brokenObelisk",
    "silverSpring",
    "hangedOak",
    "starfallCrater",
  ],
  wilds: [
    "gloamwood",
    "ashenFen",
    "wolfMoor",
    "silentHeath",
    "stagGrove",
    "crowField",
    "mistMarsh",
    "thornBrake",
    "boarHollow",
    "coldBarrow",
  ],
} as const;

type GeneratedLocationType = keyof typeof LOCATION_NAMES;

const LOCATION_COUNTS: Record<GeneratedLocationType, number> = {
  city: 12,
  village: 0,
  castle: 16,
  dungeon: 0,
  landmark: 28,
  wilds: 36,
};

const LOCATION_RADII: Record<GeneratedLocationType, number> = {
  city: 145,
  village: 105,
  castle: 125,
  dungeon: 95,
  landmark: 80,
  wilds: 150,
};

const WORLD_BOUNDARY_INSET = 210;
const TERRAIN_CELL_SIZE = 120;
const PLAYER_START_WARBAND_CLEAR_RADIUS = 1350;
const TERRAIN_CELL_GRID_CACHE = new WeakMap<
  TerrainCell[],
  { cellsByKey: Map<string, TerrainCell> }
>();

const DUNGEON_RESPAWN_HOURS = 96;
const CITY_GATE_OFFSET = 165;
const VILLAGE_GATE_OFFSET = 92;

interface DungeonSpawnProfile {
  id: string;
  biome: string;
  spriteKey: string;
  nameId: (typeof LOCATION_NAMES.dungeon)[number];
  terrainTypes: TerrainCell["type"][];
  enemyIds: string[];
  bossEnemyId: string;
  patrolCount: [number, number];
}

const DUNGEON_SPAWN_PROFILES: DungeonSpawnProfile[] = [
  {
    id: "kobold",
    biome: "Kobold Warren",
    spriteKey: "kobold",
    nameId: "koboldWarren",
    terrainTypes: ["darkForest", "forest", "pineForest"],
    enemyIds: ["kobold_foragers", "kobold_ambushers", "gloam_stalkers"],
    bossEnemyId: "kobold_ambushers",
    patrolCount: [3, 5],
  },
  {
    id: "beast",
    biome: "Beast Den",
    spriteKey: "beast",
    nameId: "beastDen",
    terrainTypes: ["forest", "pineForest", "heath", "tundra"],
    enemyIds: ["hungry_wolves", "gloam_stalkers", "troll_den"],
    bossEnemyId: "troll_den",
    patrolCount: [2, 4],
  },
  {
    id: "swamp",
    biome: "Sunken Nest",
    spriteKey: "swamp",
    nameId: "sunkenNest",
    terrainTypes: ["swamp", "bog"],
    enemyIds: ["swamp_lurkers", "gloam_stalkers", "troll_den"],
    bossEnemyId: "troll_den",
    patrolCount: [2, 4],
  },
  {
    id: "undead",
    biome: "Bone Crypt",
    spriteKey: "undead",
    nameId: "boneCrypt",
    terrainTypes: ["bog", "swamp", "heath"],
    enemyIds: ["grave_procession", "vault_scavengers", "necromancer_cabal"],
    bossEnemyId: "necromancer_cabal",
    patrolCount: [2, 4],
  },
  {
    id: "orc",
    biome: "Orc Warcamp",
    spriteKey: "orc",
    nameId: "orcWarcamp",
    terrainTypes: ["badlands", "hills", "mountain", "steppe"],
    enemyIds: ["road_reavers", "orc_hunters", "ash_brood"],
    bossEnemyId: "black_banner_knights",
    patrolCount: [3, 5],
  },
  {
    id: "elemental",
    biome: "Ash Rift",
    spriteKey: "elemental",
    nameId: "ashRift",
    terrainTypes: ["desert", "badlands", "hills", "steppe"],
    enemyIds: ["ash_brood", "storm_callers", "wyvern_kin"],
    bossEnemyId: "wyvern_kin",
    patrolCount: [2, 3],
  },
  {
    id: "machine",
    biome: "Rusted Vault",
    spriteKey: "machine",
    nameId: "rustedVault",
    terrainTypes: ["mountain", "snowMountain", "hills", "badlands"],
    enemyIds: ["vault_scavengers", "rusted_sentinels", "iron_colossus_guard"],
    bossEnemyId: "iron_colossus_guard",
    patrolCount: [2, 3],
  },
  {
    id: "outlaw",
    biome: "Outlaw Hideout",
    spriteKey: "outlaw",
    nameId: "outlawHideout",
    terrainTypes: ["grassland", "heath", "steppe"],
    enemyIds: ["desperate_militia", "road_reavers", "black_banner_knights"],
    bossEnemyId: "black_banner_knights",
    patrolCount: [2, 4],
  },
];

export function createWorldSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

export function generateWorldMap(
  seed: number,
  enemyArchetypes: EnemyArchetype[],
  nobleProfiles: NobleProfile[] = [],
): WorldMapDefinition {
  const random = createRandom(seed);
  const cityNameRandom = createRandom(seed ^ 0x43a17f2b);
  const width = randomInteger(random, 15000, 17800);
  const height = randomInteger(random, 10200, 12600);
  const terrainRandom = createRandom(seed ^ 0x5f3759df);
  const terrainZones = createTerrainZones(terrainRandom, width, height, []);
  const terrainRivers = createTerrainRivers(terrainRandom, width, height, terrainZones);
  const terrainCells = createTerrainCells(
    seed,
    width,
    height,
    terrainZones,
    terrainRivers,
  );
  const start = findLocationPosition(
    random,
    width,
    height,
    [],
    terrainZones,
    terrainRivers,
    terrainCells,
    0,
    {
      minimumX: Math.floor(width * 0.46),
      maximumX: Math.floor(width * 0.54),
      minimumY: Math.floor(height * 0.44),
      maximumY: Math.floor(height * 0.56),
      avoidMountains: true,
    },
  );
  const usedCityNames = new Set<string>();
  const locations: MapLocation[] = [
    { id: "soul_temple", type: "soulTemple", nameKey: "location.soulTemple.name", descriptionKey: "location.soulTemple.description", x: start.x, y: start.y, radius: 155 },
  ];

  for (let index = 0; index < LOCATION_COUNTS.city; index += 1) {
    const position = findLocationPosition(
      random,
      width,
      height,
      locations,
      terrainZones,
      terrainRivers,
      terrainCells,
      1450,
      { avoidMountains: true },
    );
    locations.push(createLocation("city", index, position.x, position.y, random, undefined, undefined, generateUniqueCityName(cityNameRandom, usedCityNames)));
  }

  const cities = locations.filter((location) => location.type === "city");
  const terrainRoads = createTerrainRoads(
    locations,
    terrainRivers,
    terrainZones,
    width,
    height,
  );
  const villagesByCity = new Map<string, MapLocation[]>();
  let villageIndex = 0;
  for (const city of cities) {
    const villageCount = 2 + randomInteger(random, 0, 2);
    for (let localIndex = 0; localIndex < villageCount; localIndex += 1) {
      const position = findVillagePosition(
        random,
        width,
        height,
        city,
        locations,
        terrainZones,
        terrainRivers,
        terrainCells,
        terrainRoads,
      );
      const village = createLocation("village", villageIndex, position.x, position.y, random);
      locations.push(
        village,
      );
      villagesByCity.set(city.id, [...(villagesByCity.get(city.id) ?? []), village]);
      villageIndex += 1;
    }
  }
  terrainRoads.push(
    ...createVillageRoads(
      cities,
      villagesByCity,
      terrainRoads,
      terrainZones,
      width,
      height,
    ),
  );

  const dungeonCamps = createDungeonCamps(
    random,
    width,
    height,
    locations,
    terrainZones,
    terrainCells,
    terrainRivers,
    terrainRoads,
    enemyArchetypes,
  );
  locations.push(...dungeonCamps);

  for (const type of Object.keys(LOCATION_COUNTS) as GeneratedLocationType[]) {
    if (type === "city" || type === "village" || type === "dungeon") continue;
    for (let index = 0; index < LOCATION_COUNTS[type]; index += 1) {
      const position = findLocationPosition(
        random,
        width,
        height,
        locations,
        terrainZones,
        terrainRivers,
        terrainCells,
        390,
        { avoidRoads: terrainRoads },
      );
      locations.push(createLocation(type, index, position.x, position.y, random));
    }
  }

  const enemies = createEnemySpawns(
    random,
    createRandom(seed ^ 0x1b873593),
    width,
    height,
    start,
    locations,
    enemyArchetypes,
    terrainZones,
    terrainCells,
    terrainRivers,
    terrainRoads,
  );
  const { warbandTemplates, warbandSpawns } = createFactionWarbands(
    random,
    seed,
    width,
    height,
    start,
    locations,
    terrainZones,
    terrainCells,
    terrainRivers,
    terrainRoads,
    nobleProfiles,
  );
  const encounterZones = locations
    .filter((location) => location.type === "dungeon" || location.type === "wilds")
    .map((location, index) => {
      const distanceRatio =
        Math.hypot(location.x - start.x, location.y - start.y) /
        Math.hypot(width, height);
      const maximumThreat = Math.max(1, Math.ceil(distanceRatio * 6));
      const profileEnemyIds = location.spawnProfile?.enemyIds;
      const candidates = profileEnemyIds
        ? profileEnemyIds
            .map((enemyId) => enemyArchetypes.find((enemy) => enemy.id === enemyId))
            .filter((enemy): enemy is EnemyArchetype => Boolean(enemy))
        : enemyArchetypes.filter((enemy) => enemy.threat <= maximumThreat);
      const selected = shuffle(random, candidates).slice(0, 3);
      return {
        id: `zone_${index}`,
        x: location.x,
        y: location.y,
        radius: location.type === "wilds" ? 520 : 390,
        encounterChancePerStep: location.type === "wilds" ? 0.07 : 0.11,
        encounters: selected.map((enemy, enemyIndex) => ({
          enemyId: enemy.id,
          weight: 55 - enemyIndex * 15,
        })),
      };
    })
    .filter((zone) => zone.encounters.length > 0);

  return {
    id: `generated_${seed}`,
    width,
    height,
    boundaryInset: WORLD_BOUNDARY_INSET,
    start,
    terrainZones,
    terrainCells,
    terrainRivers,
    terrainRoads,
    locations,
    encounterZones,
    enemies,
    warbandTemplates,
    warbandSpawns,
  };
}

function createFactionWarbands(
  random: () => number,
  seed: number,
  width: number,
  height: number,
  start: { x: number; y: number },
  locations: MapLocation[],
  terrainZones: TerrainZone[],
  terrainCells: TerrainCell[],
  terrainRivers: TerrainRiver[],
  terrainRoads: TerrainRoad[],
  nobleProfiles: NobleProfile[],
): { warbandTemplates: WarbandTemplate[]; warbandSpawns: WarbandSpawn[] } {
  const settlements = locations.filter((location) =>
    ["city", "village", "castle"].includes(location.type),
  );
  const locationFactions = assignSettlementFactions(seed, settlements);
  const factionLocations = new Map<FactionId, MapLocation[]>();
  for (const settlement of settlements) {
    const factionId = locationFactions[settlement.id];
    if (!factionId) continue;
    factionLocations.set(factionId, [
      ...(factionLocations.get(factionId) ?? []),
      settlement,
    ]);
  }

  const templates: WarbandTemplate[] = [];
  const spawns: WarbandSpawn[] = [];
  for (const [factionId, ownedLocations] of factionLocations) {
    templates.push(...createFactionWarbandTemplates(factionId));
    const cities = ownedLocations.filter((location) => location.type === "city");
    const villages = ownedLocations.filter((location) => location.type === "village");
    const capital = [...cities].sort(
      (left, right) => Math.hypot(right.x - start.x, right.y - start.y) - Math.hypot(left.x - start.x, left.y - start.y),
    )[0];
    const nobleSeats: Array<{ home: MapLocation; rank: NobleRank; index: number }> = [];
    if (capital) nobleSeats.push({ home: capital, rank: "king", index: 0 });
    cities.filter((city) => city.id !== capital?.id).forEach((home, index) =>
      nobleSeats.push({ home, rank: "baron", index }),
    );
    const countSeats = [...villages]
      .sort((left, right) => left.x - right.x || left.y - right.y)
      .filter((_, index) => index % 3 === 0);
    countSeats.forEach((home, index) => nobleSeats.push({ home, rank: "count", index }));

    for (const seat of nobleSeats) {
      const profile = selectNobleProfile(nobleProfiles, factionId, seat.rank, seat.index);
      const rankTitle = seat.rank === "king" ? "King" : seat.rank === "baron" ? "Baron" : "Count";
      const fallbackName = createProceduralNobleName(factionId, seat.rank, seat.index);
      pushWarbandSpawn(
        spawns,
        createWarbandSpawn(
          random,
          width,
          height,
          start,
          seat.home,
          `${factionId}_lord`,
          `${seat.rank}_${seat.home.id}`,
          terrainZones,
          terrainCells,
          terrainRivers,
          terrainRoads,
          seat.rank === "king" ? 3600 : seat.rank === "baron" ? 2800 : 1900,
          roamingPoints(seat.home, width, height, random, seat.rank === "king" ? 7 : 5),
          {
            nobleRank: seat.rank,
            nobleProfileId: profile?.id,
            displayName: `${rankTitle} ${profile?.displayName ?? fallbackName}`,
            leaderCardId: profile?.leaderCardId,
            leaderLevel: profile?.leaderLevel ?? (seat.rank === "king" ? 6 : seat.rank === "baron" ? 4 : 3),
          },
        ),
      );
    }
    const hunterHome = [...cities, ...ownedLocations.filter((location) => location.type === "castle")].sort(
      (left, right) =>
        Math.hypot(right.x - start.x, right.y - start.y) -
        Math.hypot(left.x - start.x, left.y - start.y),
    )[0];
    if (hunterHome) {
      pushWarbandSpawn(
        spawns,
        createWarbandSpawn(
          random,
          width,
          height,
          start,
          hunterHome,
          `${factionId}_bounty_hunters`,
          `bounty_hunters_${factionId}`,
          terrainZones,
          terrainCells,
          terrainRivers,
          terrainRoads,
          4200,
          [{ x: hunterHome.x, y: hunterHome.y }],
        ),
      );
    }
  }

  return { warbandTemplates: templates, warbandSpawns: spawns };
}

function createFactionWarbandTemplates(factionId: FactionId): WarbandTemplate[] {
  const factionNameKey = `world.faction.${factionId}`;
  return [
    {
      id: `${factionId}_lord`,
      nameKey: `${factionNameKey}.lord`,
      type: "lord",
      factionId,
      unitIds: ["soldier", "wache", "pikeman", "longbowman", "knight"],
      speed: 138,
      detectionRadius: 860,
      aggressionRadius: 720,
      aggression: 0.82,
      maxPursuitDistance: 2600,
      respawnHours: 96,
      leaderCardId: "banner_knight",
      leaderLevel: 4,
      equipmentItemIds: ["steel_sword", "kite_shield", "iron_talisman"],
      lootItemIds: ["iron", "silver", "travel_rations", "steel_sword"],
      bountyHunter: false,
    },
    {
      id: `${factionId}_bounty_hunters`,
      nameKey: `${factionNameKey}.bountyHunters`,
      type: "elite",
      factionId,
      unitIds: ["wache", "pikeman", "longbowman", "knight"],
      speed: 176,
      detectionRadius: 1180,
      aggressionRadius: 1040,
      aggression: 1,
      maxPursuitDistance: 4200,
      respawnHours: 72,
      leaderCardId: "banner_knight",
      leaderLevel: 5,
      equipmentItemIds: ["steel_sword", "kite_shield"],
      lootItemIds: ["iron", "silver", "travel_rations"],
      bountyHunter: true,
    },
  ];
}

function createWarbandSpawn(
  random: () => number,
  width: number,
  height: number,
  start: { x: number; y: number },
  home: MapLocation,
  templateId: string,
  id: string,
  terrainZones: TerrainZone[],
  terrainCells: TerrainCell[],
  terrainRivers: TerrainRiver[],
  terrainRoads: TerrainRoad[],
  allowedRadius: number,
  patrolPoints?: Array<{ x: number; y: number }>,
  noble?: Pick<WarbandSpawn, "nobleRank" | "nobleProfileId" | "displayName" | "leaderCardId" | "leaderLevel">,
): WarbandSpawn | null {
  if (
    Math.hypot(home.x - start.x, home.y - start.y) <
    PLAYER_START_WARBAND_CLEAR_RADIUS * 0.62
  ) {
    return null;
  }
  const position = findEnemyPosition(
    random,
    width,
    height,
    home,
    terrainZones,
    terrainCells,
    terrainRivers,
    terrainRoads,
  );
  if (
    Math.hypot(position.x - start.x, position.y - start.y) <
    PLAYER_START_WARBAND_CLEAR_RADIUS
  ) {
    return null;
  }
  return {
    id,
    templateId,
    homeLocationId: home.id,
    x: position.x,
    y: position.y,
    patrolPoints: patrolPoints?.length ? patrolPoints : [{ x: home.x, y: home.y }],
    allowedRadius,
    spawnChance: 1,
    ...noble,
  };
}

function selectNobleProfile(
  profiles: NobleProfile[],
  factionId: FactionId,
  rank: NobleRank,
  index: number,
): NobleProfile | undefined {
  const candidates = profiles.filter((profile) => profile.factionId === factionId && profile.rank === rank);
  return candidates[index % candidates.length];
}

const PROCEDURAL_NOBLE_NAMES: Record<FactionId, string[]> = {
  ember_crown: ["Aldric Vane", "Marwen Ashford", "Cedric Brand", "Elayne Pyre", "Rowan Cinder", "Talia Hearth", "Gareth Ember", "Sabine Rook"],
  gloam_compact: ["Orren Vale", "Sable Morcant", "Theron Dusk", "Ysra Noct", "Corvin Shade", "Mara Vey", "Lucan Gloam", "Neris Thorn"],
  iron_concord: ["Borin Holt", "Helena Voss", "Garran Stone", "Mira Kest", "Doran Anvil", "Petra Flint", "Oskar Rime", "Vera Steel"],
};

function createProceduralNobleName(factionId: FactionId, rank: NobleRank, index: number): string {
  const names = PROCEDURAL_NOBLE_NAMES[factionId];
  return names[(index + (rank === "count" ? 3 : rank === "baron" ? 1 : 0)) % names.length];
}

function pushWarbandSpawn(
  spawns: WarbandSpawn[],
  spawn: WarbandSpawn | null,
): void {
  if (spawn) spawns.push(spawn);
}

function nearbyPatrolPoints(
  home: MapLocation,
  candidates: MapLocation[],
  count: number,
): Array<{ x: number; y: number }> {
  const points = candidates
    .filter((candidate) => candidate.id !== home.id)
    .sort(
      (left, right) =>
        Math.hypot(left.x - home.x, left.y - home.y) -
        Math.hypot(right.x - home.x, right.y - home.y),
    )
    .slice(0, count)
    .map((location) => ({ x: location.x, y: location.y }));
  return [{ x: home.x, y: home.y }, ...points];
}

function roamingPoints(
  home: MapLocation,
  width: number,
  height: number,
  random: () => number,
  count: number,
): Array<{ x: number; y: number }> {
  return Array.from({ length: count }, (_, index) => {
    if (index === 0) return { x: home.x, y: home.y };
    const angle = random() * Math.PI * 2;
    const distance = randomInteger(random, 520, 1700);
    return {
      x: clamp(home.x + Math.cos(angle) * distance, WORLD_BOUNDARY_INSET + 120, width - WORLD_BOUNDARY_INSET - 120),
      y: clamp(home.y + Math.sin(angle) * distance, WORLD_BOUNDARY_INSET + 120, height - WORLD_BOUNDARY_INSET - 120),
    };
  });
}

function createTerrainRoads(
  locations: MapLocation[],
  rivers: TerrainRiver[],
  terrainZones: TerrainZone[],
  width: number,
  height: number,
): TerrainRoad[] {
  const cities = locations.filter((location) => location.type === "city");
  const roads: TerrainRoad[] = [];
  const connected = new Set([cities[0]?.id]);

  while (connected.size < cities.length) {
    const candidates = cities
      .filter((origin) => connected.has(origin.id))
      .flatMap((origin) =>
        cities
          .filter((destination) => !connected.has(destination.id))
          .map((destination) => ({
            origin,
            destination,
            score:
              Math.hypot(destination.x - origin.x, destination.y - origin.y) +
              countRiverCrossings(origin, destination, rivers) * 3200 +
              countLakeCrossings(origin, destination, terrainZones) * 5200,
          })),
      )
      .sort((left, right) => left.score - right.score);
    const selected = candidates[0];
    if (!selected) break;
    roads.push(
      createRoad(
        selected.origin,
        selected.destination,
        26,
        terrainZones,
        width,
        height,
        cities.filter(
          (city) =>
            city.id !== selected.origin.id && city.id !== selected.destination.id,
        ),
      ),
    );
    connected.add(selected.destination.id);
  }

  return roads;
}

function createRoad(
  origin: MapLocation,
  destination: MapLocation,
  width: number,
  terrainZones: TerrainZone[],
  worldWidth: number,
  worldHeight: number,
  blockers: MapLocation[] = [],
): TerrainRoad {
  const originGate = cityGatePoint(origin, worldWidth, worldHeight);
  const destinationGate = cityGatePoint(destination, worldWidth, worldHeight);
  const route = createRoadRoutePoints(
    originGate,
    destinationGate,
    terrainZones,
    worldWidth,
    worldHeight,
    origin.id,
    destination.id,
    blockers,
  );

  return {
    id: `road_${origin.id}_${destination.id}`,
    originId: origin.id,
    destinationId: destination.id,
    width,
    points: [
      { x: origin.x, y: origin.y },
      ...route,
      { x: destination.x, y: destination.y },
    ],
  };
}

function createVillageRoads(
  cities: MapLocation[],
  villagesByCity: Map<string, MapLocation[]>,
  majorRoads: TerrainRoad[],
  terrainZones: TerrainZone[],
  worldWidth: number,
  worldHeight: number,
): TerrainRoad[] {
  const roads: TerrainRoad[] = [];
  for (const city of cities) {
    const villages = villagesByCity.get(city.id) ?? [];
    if (villages.length === 0) continue;
    const cityGate = cityGatePoint(city, worldWidth, worldHeight);
    const allVillages = [...villagesByCity.values()].flat();
    const roadBlockers = [...cities, ...allVillages];
    const directVillages: MapLocation[] = [];

    for (const village of villages) {
      const villageGate = villageGatePoint(village, worldWidth, worldHeight);
      const roadConnection = findNearbyRoadConnection(
        villageGate,
        majorRoads.filter(
          (road) => road.originId === city.id || road.destinationId === city.id,
        ),
      );
      if (roadConnection && roadConnection.distance < 720) {
        roads.push(
          createPointRoad(
            `road_${village.id}_${city.id}_spur`,
            village.id,
            city.id,
            8,
            { x: village.x, y: village.y },
            roadConnection.point,
            terrainZones,
            worldWidth,
            worldHeight,
            {
              originGate: villageGate,
              blockers: roadBlockers.filter((location) => location.id !== village.id),
            },
          ),
        );
      } else {
        directVillages.push(village);
      }
    }

    if (directVillages.length === 1) {
      const [village] = directVillages;
      const villageGate = villageGatePoint(village, worldWidth, worldHeight);
      roads.push(
        createPointRoad(
          `road_${village.id}_${city.id}`,
          village.id,
          city.id,
          9,
          { x: village.x, y: village.y },
          { x: city.x, y: city.y },
          terrainZones,
          worldWidth,
          worldHeight,
          {
            originGate: villageGate,
            targetGate: cityGate,
            blockers: roadBlockers.filter(
              (location) => location.id !== village.id && location.id !== city.id,
            ),
          },
        ),
      );
      continue;
    }

    if (directVillages.length > 1) {
      const hub = createVillageRoadHub(directVillages, cityGate, worldWidth, worldHeight);
      roads.push(
        createPointRoad(
          `road_${city.id}_village_trunk`,
          city.id,
          city.id,
          10,
          hub,
          { x: city.x, y: city.y },
          terrainZones,
          worldWidth,
          worldHeight,
          {
            targetGate: cityGate,
            blockers: roadBlockers.filter((location) => location.id !== city.id),
          },
        ),
      );
      for (const village of directVillages) {
        const villageGate = villageGatePoint(village, worldWidth, worldHeight);
        roads.push(
          createPointRoad(
            `road_${village.id}_to_${city.id}_hub`,
            village.id,
            city.id,
            7,
            { x: village.x, y: village.y },
            hub,
            terrainZones,
            worldWidth,
            worldHeight,
            {
              originGate: villageGate,
              blockers: roadBlockers.filter((location) => location.id !== village.id),
            },
          ),
        );
      }
    }
  }
  return roads;
}

function createPointRoad(
  id: string,
  originId: string,
  destinationId: string,
  width: number,
  origin: { x: number; y: number },
  destination: { x: number; y: number },
  terrainZones: TerrainZone[],
  worldWidth: number,
  worldHeight: number,
  gates: {
    originGate?: { x: number; y: number };
    targetGate?: { x: number; y: number };
    blockers?: MapLocation[];
    enterTarget?: boolean;
  } = {},
): TerrainRoad {
  const routeStart = gates.originGate ?? origin;
  const routeEnd = gates.targetGate ?? destination;
  const route = createRoadRoutePoints(
    routeStart,
    routeEnd,
    terrainZones,
    worldWidth,
    worldHeight,
    originId,
    destinationId,
    gates.blockers ?? [],
  );
  return {
    id,
    originId,
    destinationId,
    width,
    points: [
      ...(gates.originGate ? [origin] : []),
      ...route,
      ...(gates.enterTarget ? [destination] : []),
    ],
  };
}

function createRoadRoutePoints(
  origin: { x: number; y: number },
  destination: { x: number; y: number },
  terrainZones: TerrainZone[],
  worldWidth: number,
  worldHeight: number,
  originId: string,
  destinationId: string,
  blockers: MapLocation[] = [],
): Array<{ x: number; y: number }> {
  const directionX = destination.x - origin.x;
  const directionY = destination.y - origin.y;
  const directionLength = Math.max(1, Math.hypot(directionX, directionY));
  const normalX = -directionY / directionLength;
  const normalY = directionX / directionLength;
  const terrainDetours = terrainZones
    .filter(
      (zone) =>
        (zone.type === "lake" || zone.type === "mountain" || zone.type === "snowMountain") &&
        roadObstacleProgress(zone.x, zone.y, origin, directionX, directionY, directionLength) >
          0.12 &&
        roadObstacleProgress(zone.x, zone.y, origin, directionX, directionY, directionLength) <
          0.88 &&
        distanceToSegment(zone.x, zone.y, origin.x, origin.y, destination.x, destination.y) <=
          Math.max(zone.radiusX, zone.radiusY) + 90,
    )
    .map((lake) => {
      const detourDistance = Math.max(lake.radiusX, lake.radiusY) + 230;
      const first = {
        x: clamp(
          lake.x + normalX * detourDistance,
          WORLD_BOUNDARY_INSET + 80,
          worldWidth - WORLD_BOUNDARY_INSET - 80,
        ),
        y: clamp(
          lake.y + normalY * detourDistance,
          WORLD_BOUNDARY_INSET + 80,
          worldHeight - WORLD_BOUNDARY_INSET - 80,
        ),
      };
      const second = {
        x: clamp(
          lake.x - normalX * detourDistance,
          WORLD_BOUNDARY_INSET + 80,
          worldWidth - WORLD_BOUNDARY_INSET - 80,
        ),
        y: clamp(
          lake.y - normalY * detourDistance,
          WORLD_BOUNDARY_INSET + 80,
          worldHeight - WORLD_BOUNDARY_INSET - 80,
        ),
      };
      const routeLength = (point: { x: number; y: number }) =>
        Math.hypot(point.x - origin.x, point.y - origin.y) +
        Math.hypot(destination.x - point.x, destination.y - point.y);
      const point = routeLength(first) <= routeLength(second) ? first : second;
      const progress =
        ((lake.x - origin.x) * directionX +
          (lake.y - origin.y) * directionY) /
        (directionLength * directionLength);
      return { point, progress };
    });
  const locationDetours = blockers
    .filter(
      (location) => {
        const progress = roadObstacleProgress(
          location.x,
          location.y,
          origin,
          directionX,
          directionY,
          directionLength,
        );
        return (
          progress > 0.12 &&
          progress < 0.88 &&
          distanceToSegment(
            location.x,
            location.y,
            origin.x,
            origin.y,
            destination.x,
            destination.y,
          ) <= locationRoadAvoidanceRadius(location)
        );
      },
    )
    .map((location) => {
      const detourDistance = locationRoadAvoidanceRadius(location) + 90;
      const first = {
        x: clamp(
          location.x + normalX * detourDistance,
          WORLD_BOUNDARY_INSET + 80,
          worldWidth - WORLD_BOUNDARY_INSET - 80,
        ),
        y: clamp(
          location.y + normalY * detourDistance,
          WORLD_BOUNDARY_INSET + 80,
          worldHeight - WORLD_BOUNDARY_INSET - 80,
        ),
      };
      const second = {
        x: clamp(
          location.x - normalX * detourDistance,
          WORLD_BOUNDARY_INSET + 80,
          worldWidth - WORLD_BOUNDARY_INSET - 80,
        ),
        y: clamp(
          location.y - normalY * detourDistance,
          WORLD_BOUNDARY_INSET + 80,
          worldHeight - WORLD_BOUNDARY_INSET - 80,
        ),
      };
      const routeLength = (point: { x: number; y: number }) =>
        Math.hypot(point.x - origin.x, point.y - origin.y) +
        Math.hypot(destination.x - point.x, destination.y - point.y);
      const point = routeLength(first) <= routeLength(second) ? first : second;
      const progress =
        ((location.x - origin.x) * directionX +
          (location.y - origin.y) * directionY) /
        (directionLength * directionLength);
      return { point, progress };
    });
  const obstacleDetours = [...terrainDetours, ...locationDetours]
    .sort((left, right) => left.progress - right.progress)
    .map((detour) => detour.point);

  return smoothRoadPoints(
    [{ x: origin.x, y: origin.y }, ...obstacleDetours, { x: destination.x, y: destination.y }],
    normalX,
    normalY,
    worldWidth,
    worldHeight,
    originId,
    destinationId,
  );
}

function cityGatePoint(
  city: MapLocation,
  worldWidth: number,
  worldHeight: number,
): { x: number; y: number } {
  return {
    x: clamp(city.x, WORLD_BOUNDARY_INSET + 80, worldWidth - WORLD_BOUNDARY_INSET - 80),
    y: clamp(
      city.y + CITY_GATE_OFFSET,
      WORLD_BOUNDARY_INSET + 80,
      worldHeight - WORLD_BOUNDARY_INSET - 80,
    ),
  };
}

function villageGatePoint(
  village: MapLocation,
  worldWidth: number,
  worldHeight: number,
): { x: number; y: number } {
  return {
    x: clamp(village.x, WORLD_BOUNDARY_INSET + 80, worldWidth - WORLD_BOUNDARY_INSET - 80),
    y: clamp(
      village.y + VILLAGE_GATE_OFFSET,
      WORLD_BOUNDARY_INSET + 80,
      worldHeight - WORLD_BOUNDARY_INSET - 80,
    ),
  };
}

function roadObstacleProgress(
  x: number,
  y: number,
  origin: { x: number; y: number },
  directionX: number,
  directionY: number,
  directionLength: number,
): number {
  return (
    ((x - origin.x) * directionX + (y - origin.y) * directionY) /
    (directionLength * directionLength)
  );
}

function locationRoadAvoidanceRadius(location: MapLocation): number {
  if (location.type === "city") return 230;
  if (location.type === "village") return 155;
  if (location.type === "dungeon") return 150;
  if (location.type === "castle") return 180;
  return 125;
}

function createVillageRoadHub(
  villages: MapLocation[],
  cityGate: { x: number; y: number },
  worldWidth: number,
  worldHeight: number,
): { x: number; y: number } {
  const center = villages.reduce(
    (sum, village) => ({
      x: sum.x + village.x / villages.length,
      y: sum.y + village.y / villages.length,
    }),
    { x: 0, y: 0 },
  );
  return {
    x: clamp(
      center.x * 0.68 + cityGate.x * 0.32,
      WORLD_BOUNDARY_INSET + 120,
      worldWidth - WORLD_BOUNDARY_INSET - 120,
    ),
    y: clamp(
      center.y * 0.68 + cityGate.y * 0.32,
      WORLD_BOUNDARY_INSET + 120,
      worldHeight - WORLD_BOUNDARY_INSET - 120,
    ),
  };
}

function findNearbyRoadConnection(
  point: { x: number; y: number },
  roads: TerrainRoad[],
): { point: { x: number; y: number }; distance: number } | null {
  let nearest: { point: { x: number; y: number }; distance: number } | null = null;
  for (const road of roads) {
    for (let index = 0; index < road.points.length - 1; index += 1) {
      const projection = projectPointToSegment(point, road.points[index], road.points[index + 1]);
      const directionX = point.x - projection.point.x;
      const directionY = point.y - projection.point.y;
      const directionLength = Math.max(1, Math.hypot(directionX, directionY));
      const edgePoint = {
        x: projection.point.x + (directionX / directionLength) * (road.width / 2),
        y: projection.point.y + (directionY / directionLength) * (road.width / 2),
      };
      const connection = {
        point: edgePoint,
        distance: Math.max(0, projection.distance - road.width / 2),
      };
      if (!nearest || connection.distance < nearest.distance) nearest = connection;
    }
  }
  return nearest;
}

function projectPointToSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
): { point: { x: number; y: number }; distance: number } {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const segmentLengthSq = Math.max(1, segmentX * segmentX + segmentY * segmentY);
  const progress = clamp01(
    ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) /
      segmentLengthSq,
  );
  const projected = {
    x: start.x + segmentX * progress,
    y: start.y + segmentY * progress,
  };
  return {
    point: projected,
    distance: Math.hypot(point.x - projected.x, point.y - projected.y),
  };
}

function smoothRoadPoints(
  points: Array<{ x: number; y: number }>,
  normalX: number,
  normalY: number,
  worldWidth: number,
  worldHeight: number,
  originId: string,
  destinationId: string,
): Array<{ x: number; y: number }> {
  const smoothed: Array<{ x: number; y: number }> = [];
  const bendSeed = hashText(`${originId}:${destinationId}:road`);
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    const bend =
      (((bendSeed + index * 97) % 200) - 100) *
      Math.min(3.2, distance / 900);
    smoothed.push(start);
    if (distance > 650) {
      smoothed.push({
        x: clamp(
          start.x + (end.x - start.x) * 0.33 + normalX * bend,
          WORLD_BOUNDARY_INSET + 80,
          worldWidth - WORLD_BOUNDARY_INSET - 80,
        ),
        y: clamp(
          start.y + (end.y - start.y) * 0.33 + normalY * bend,
          WORLD_BOUNDARY_INSET + 80,
          worldHeight - WORLD_BOUNDARY_INSET - 80,
        ),
      });
      smoothed.push({
        x: clamp(
          start.x + (end.x - start.x) * 0.66 - normalX * bend * 0.65,
          WORLD_BOUNDARY_INSET + 80,
          worldWidth - WORLD_BOUNDARY_INSET - 80,
        ),
        y: clamp(
          start.y + (end.y - start.y) * 0.66 - normalY * bend * 0.65,
          WORLD_BOUNDARY_INSET + 80,
          worldHeight - WORLD_BOUNDARY_INSET - 80,
        ),
      });
    }
  }
  smoothed.push(points[points.length - 1]);
  return smoothed;
}

function createTerrainZones(
  random: () => number,
  width: number,
  height: number,
  locations: MapLocation[],
): TerrainZone[] {
  const zones: TerrainZone[] = [
    {
      id: "climate_north_tundra",
      type: "tundra",
      x: width * 0.48,
      y: height * 0.14,
      radiusX: width * 0.58,
      radiusY: height * 0.2,
    },
    {
      id: "climate_north_taiga",
      type: "pineForest",
      x: width * 0.53,
      y: height * 0.29,
      radiusX: width * 0.52,
      radiusY: height * 0.18,
    },
    {
      id: "climate_mid_grassland",
      type: "grassland",
      x: width * 0.48,
      y: height * 0.51,
      radiusX: width * 0.56,
      radiusY: height * 0.24,
    },
    {
      id: "climate_south_steppe",
      type: "steppe",
      x: width * 0.46,
      y: height * 0.72,
      radiusX: width * 0.55,
      radiusY: height * 0.19,
    },
    {
      id: "climate_south_desert",
      type: "desert",
      x: width * 0.55,
      y: height * 0.9,
      radiusX: width * 0.5,
      radiusY: height * 0.17,
    },
  ];
  const specifications = [
    { type: "snowMountain", count: 5, minimum: 520, maximum: 980, yMin: 0.05, yMax: 0.24 },
    { type: "mountain", count: 8, minimum: 560, maximum: 1080, yMin: 0.1, yMax: 0.72 },
    { type: "hills", count: 12, minimum: 520, maximum: 980, yMin: 0.18, yMax: 0.82 },
    { type: "pineForest", count: 8, minimum: 760, maximum: 1320, yMin: 0.12, yMax: 0.38 },
    { type: "forest", count: 10, minimum: 780, maximum: 1450, yMin: 0.28, yMax: 0.62 },
    { type: "darkForest", count: 7, minimum: 560, maximum: 1050, yMin: 0.3, yMax: 0.58 },
    { type: "heath", count: 7, minimum: 620, maximum: 1120, yMin: 0.2, yMax: 0.66 },
    { type: "swamp", count: 6, minimum: 520, maximum: 940, yMin: 0.36, yMax: 0.68 },
    { type: "bog", count: 5, minimum: 480, maximum: 860, yMin: 0.18, yMax: 0.48 },
    { type: "badlands", count: 8, minimum: 680, maximum: 1220, yMin: 0.62, yMax: 0.9 },
    { type: "desert", count: 6, minimum: 840, maximum: 1550, yMin: 0.72, yMax: 0.94 },
    { type: "lake", count: 13, minimum: 190, maximum: 520, yMin: 0.16, yMax: 0.74 },
  ] as const;

  for (const specification of specifications) {
    let placed = 0;
    for (let attempt = 0; attempt < specification.count * 360 && placed < specification.count; attempt += 1) {
      const radiusX = randomInteger(random, specification.minimum, specification.maximum);
      const radiusY = randomInteger(
        random,
        Math.round(specification.minimum * 0.42),
        Math.round(specification.maximum * 0.72),
      );
      const candidate: TerrainZone = {
        id: `${specification.type}_${placed}`,
        type: specification.type,
        x: randomInteger(
          random,
          WORLD_BOUNDARY_INSET + radiusX + 90,
          width - WORLD_BOUNDARY_INSET - radiusX - 90,
        ),
        y: randomInteger(
          random,
          Math.floor(height * specification.yMin),
          Math.floor(height * specification.yMax),
        ),
        radiusX,
        radiusY,
      };
      if (!isTerrainZonePlacementValid(candidate, zones, locations)) continue;
      zones.push(candidate);
      placed += 1;
    }
  }

  return zones;
}

function createTerrainRivers(
  random: () => number,
  width: number,
  height: number,
  terrainZones: TerrainZone[],
): TerrainRiver[] {
  const mountainSources = terrainZones.filter((zone) =>
    ["mountain", "snowMountain", "hills"].includes(zone.type),
  );
  return Array.from({ length: 5 }, (_, riverIndex) => {
    const source =
      mountainSources[(riverIndex * 3 + randomInteger(random, 0, Math.max(0, mountainSources.length - 1))) % mountainSources.length];
    const horizontal = riverIndex % 2 === 1;
    const targetEdge = horizontal
      ? random() > 0.5 ? "east" : "west"
      : source.y < height * 0.5 ? "south" : "north";
    const pointCount = 8;
    const points = Array.from({ length: pointCount }, (_, pointIndex) => {
      const progress = pointIndex / (pointCount - 1);
      const targetX =
        targetEdge === "west"
          ? WORLD_BOUNDARY_INSET
          : targetEdge === "east"
            ? width - WORLD_BOUNDARY_INSET
            : source.x + Math.sin(riverIndex) * width * 0.18;
      const targetY =
        targetEdge === "north"
          ? WORLD_BOUNDARY_INSET
          : targetEdge === "south"
            ? height - WORLD_BOUNDARY_INSET
            : source.y + Math.cos(riverIndex) * height * 0.18;
      const point = {
        x:
          source.x +
          (targetX - source.x) * progress +
          Math.sin(progress * Math.PI * 3 + riverIndex) * 260 +
          randomInteger(random, -80, 80),
        y:
          source.y +
          (targetY - source.y) * progress +
          Math.cos(progress * Math.PI * 2.4 + riverIndex) * 210 +
          randomInteger(random, -70, 70),
      };
      if (pointIndex > 0) {
        pushPointOutOfMountains(point, terrainZones);
      }
      return {
        x: clamp(point.x, WORLD_BOUNDARY_INSET, width - WORLD_BOUNDARY_INSET),
        y: clamp(point.y, WORLD_BOUNDARY_INSET, height - WORLD_BOUNDARY_INSET),
      };
    });
    return {
      id: `river_${riverIndex}`,
      width: randomInteger(random, 46, 78),
      points,
    };
  });
}

function createRiverBiomeBuffers(
  random: () => number,
  rivers: TerrainRiver[],
  width: number,
  height: number,
): TerrainZone[] {
  const buffers: TerrainZone[] = [];
  for (const river of rivers) {
    for (let index = 1; index < river.points.length - 1; index += 2) {
      const point = river.points[index];
      const southern = point.y > height * 0.62;
      buffers.push({
        id: `riverland_${river.id}_${index}`,
        type: southern ? "grassland" : random() > 0.65 ? "swamp" : "grassland",
        x: clamp(point.x + randomInteger(random, -120, 120), WORLD_BOUNDARY_INSET, width - WORLD_BOUNDARY_INSET),
        y: clamp(point.y + randomInteger(random, -120, 120), WORLD_BOUNDARY_INSET, height - WORLD_BOUNDARY_INSET),
        radiusX: randomInteger(random, 360, 720),
        radiusY: randomInteger(random, 140, 320),
      });
    }
  }
  return buffers;
}

function createTerrainCells(
  seed: number,
  width: number,
  height: number,
  terrainZones: TerrainZone[],
  rivers: TerrainRiver[],
): TerrainCell[] {
  const cells: TerrainCell[] = [];
  const columns = Math.ceil((width - WORLD_BOUNDARY_INSET * 2) / TERRAIN_CELL_SIZE);
  const rows = Math.ceil((height - WORLD_BOUNDARY_INSET * 2) / TERRAIN_CELL_SIZE);

  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      const x = WORLD_BOUNDARY_INSET + column * TERRAIN_CELL_SIZE;
      const y = WORLD_BOUNDARY_INSET + row * TERRAIN_CELL_SIZE;
      const centerX = x + TERRAIN_CELL_SIZE / 2;
      const centerY = y + TERRAIN_CELL_SIZE / 2;
      const latitude = centerY / height;
      const noise = valueNoise(seed, column, row);
      const regionalNoise = valueNoise(seed ^ 0x9e3779b9, Math.floor(column / 4), Math.floor(row / 4));
      const temperature = clamp01(
        latitude +
          (regionalNoise - 0.5) * 0.16 -
          mountainInfluence(terrainZones, centerX, centerY) * 0.18,
      );
      const riverHumidity = nearestRiverHumidity(rivers, centerX, centerY);
      const lakeHumidity = terrainZones.some(
        (zone) => zone.type === "lake" && ellipseDistance(zone, centerX, centerY, 120) <= 1,
      )
        ? 1
        : 0;
      const humidity = clamp01(
        0.35 +
          (valueNoise(seed ^ 0x85ebca6b, column, row) - 0.5) * 0.48 +
          riverHumidity * 0.55 +
          lakeHumidity * 0.35 -
          Math.max(0, temperature - 0.68) * 0.22,
      );
      const elevation = clamp01(
        mountainInfluence(terrainZones, centerX, centerY) +
          (valueNoise(seed ^ 0xc2b2ae35, column, row) - 0.5) * 0.18,
      );
      cells.push({
        x,
        y,
        size: TERRAIN_CELL_SIZE,
        type: chooseCellTerrain(temperature, humidity, elevation, riverHumidity, lakeHumidity, noise),
      });
    }
  }

  return cells;
}

function chooseCellTerrain(
  temperature: number,
  humidity: number,
  elevation: number,
  riverHumidity: number,
  lakeHumidity: number,
  noise: number,
): TerrainZone["type"] {
  if (lakeHumidity > 0.8) return "lake";
  if (elevation > 0.78) return temperature < 0.34 ? "snowMountain" : "mountain";
  if (elevation > 0.58) return temperature < 0.28 ? "snowMountain" : "hills";
  if (riverHumidity > 0.74 && humidity > 0.62 && temperature > 0.26 && temperature < 0.76) {
    return temperature < 0.42 ? "bog" : "swamp";
  }
  if (temperature < 0.18) return elevation > 0.38 ? "snowMountain" : "tundra";
  if (temperature < 0.34) return humidity > 0.46 ? "pineForest" : "tundra";
  if (temperature > 0.78) {
    if (humidity < 0.32) return "desert";
    if (humidity < 0.48) return noise > 0.58 ? "badlands" : "steppe";
    return "grassland";
  }
  if (temperature > 0.64) {
    if (humidity < 0.32) return "badlands";
    if (humidity < 0.48) return "steppe";
  }
  if (humidity > 0.78) return temperature < 0.42 ? "bog" : "swamp";
  if (humidity > 0.6) return noise > 0.72 ? "darkForest" : "forest";
  if (humidity > 0.44) return temperature < 0.44 ? "pineForest" : "grassland";
  return noise > 0.56 ? "heath" : "grassland";
}

function mountainInfluence(
  terrainZones: TerrainZone[],
  x: number,
  y: number,
): number {
  return terrainZones.reduce((highest, zone) => {
    if (zone.type !== "mountain" && zone.type !== "snowMountain" && zone.type !== "hills") {
      return highest;
    }
    const distance = ellipseDistance(zone, x, y, 160);
    return Math.max(highest, Math.max(0, 1 - distance));
  }, 0);
}

function nearestRiverHumidity(
  rivers: TerrainRiver[],
  x: number,
  y: number,
): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const river of rivers) {
    for (let index = 0; index < river.points.length - 1; index += 1) {
      const start = river.points[index];
      const end = river.points[index + 1];
      nearest = Math.min(
        nearest,
        distanceToSegment(x, y, start.x, start.y, end.x, end.y) - river.width / 2,
      );
    }
  }
  return clamp01(1 - nearest / 520);
}

function valueNoise(seed: number, x: number, y: number): number {
  return hashText(`${seed}:${x}:${y}`) / 0xffffffff;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function isTerrainZonePlacementValid(
  candidate: TerrainZone,
  zones: TerrainZone[],
  locations: MapLocation[],
): boolean {
  const blocksTravel = candidate.type === "lake";
  if (
    blocksTravel &&
    locations.some(
      (location) =>
        ellipseDistance(candidate, location.x, location.y) <=
        1 + (location.radius + 120) / Math.min(candidate.radiusX, candidate.radiusY),
    )
  ) {
    return false;
  }

  const hot = new Set<TerrainZone["type"]>(["desert", "badlands", "steppe"]);
  const cold = new Set<TerrainZone["type"]>(["tundra", "snowMountain", "pineForest"]);
  for (const zone of zones) {
    if (zone.id.startsWith("climate_")) continue;
    const distance = Math.hypot(zone.x - candidate.x, zone.y - candidate.y);
    const softRadius =
      Math.max(zone.radiusX, zone.radiusY) * 0.46 +
      Math.max(candidate.radiusX, candidate.radiusY) * 0.46;
    const hardRadius =
      Math.max(zone.radiusX, zone.radiusY) * 0.72 +
      Math.max(candidate.radiusX, candidate.radiusY) * 0.72;
    if (zone.type === candidate.type && distance < softRadius) return false;
    if ((zone.type === "lake" || candidate.type === "lake") && distance < hardRadius + 170) {
      return false;
    }
    if (
      ((hot.has(zone.type) && cold.has(candidate.type)) ||
        (cold.has(zone.type) && hot.has(candidate.type))) &&
      distance < hardRadius + 420
    ) {
      return false;
    }
  }
  return true;
}

function pushPointOutOfMountains(
  point: { x: number; y: number },
  terrainZones: TerrainZone[],
): void {
  for (const zone of terrainZones) {
    if (zone.type !== "mountain" && zone.type !== "snowMountain") continue;
    if (ellipseDistance(zone, point.x, point.y, 80) > 1) continue;
    const angle = Math.atan2(point.y - zone.y, point.x - zone.x);
    point.x = zone.x + Math.cos(angle) * (zone.radiusX + 140);
    point.y = zone.y + Math.sin(angle) * (zone.radiusY + 140);
  }
}

function createLocation(
  type: GeneratedLocationType,
  index: number,
  x: number,
  y: number,
  random: () => number,
  spawnProfile?: MapLocation["spawnProfile"],
  forcedName?: (typeof LOCATION_NAMES)[GeneratedLocationType][number],
  generatedName?: string,
): MapLocation {
  const names = LOCATION_NAMES[type];
  const name =
    forcedName ??
    names[(index + randomInteger(random, 0, names.length - 1)) % names.length];
  return {
    id: `${type}_${index}`,
    type,
    nameKey: generatedName ?? `generatedLocation.name.${name}`,
    descriptionKey: `generatedLocation.description.${type}`,
    x,
    y,
    radius: LOCATION_RADII[type],
    spawnProfile,
  };
}

function createDungeonCamps(
  random: () => number,
  width: number,
  height: number,
  existing: MapLocation[],
  terrainZones: TerrainZone[],
  terrainCells: TerrainCell[],
  terrainRivers: TerrainRiver[],
  terrainRoads: TerrainRoad[],
  archetypes: EnemyArchetype[],
): MapLocation[] {
  const archetypeIds = new Set(archetypes.map((enemy) => enemy.id));
  const candidates = shuffle(
    random,
    terrainCells.filter((cell) => cell.type !== "lake"),
  );
  const camps: MapLocation[] = [];
  const minimumCampCount = 22;
  const maximumCampCount = 30;

  for (const cell of candidates) {
    if (camps.length >= maximumCampCount) break;
    const matchingProfiles = DUNGEON_SPAWN_PROFILES.filter((profile) =>
      profile.terrainTypes.includes(cell.type),
    ).filter(
      (profile) =>
        profile.enemyIds.every((enemyId) => archetypeIds.has(enemyId)) &&
        archetypeIds.has(profile.bossEnemyId),
    );
    const profile =
      matchingProfiles[randomInteger(random, 0, Math.max(0, matchingProfiles.length - 1))];
    if (!profile) continue;
    const position = findCampPosition(
      random,
      width,
      height,
      {
        id: `cell_${cell.x}_${cell.y}`,
        type: cell.type,
        x: cell.x + cell.size / 2,
        y: cell.y + cell.size / 2,
        radiusX: cell.size * 1.8,
        radiusY: cell.size * 1.8,
      },
      [...existing, ...camps],
      terrainZones,
      terrainCells,
      terrainRivers,
      terrainRoads,
    );
    if (!position) continue;
    camps.push(
      createLocation(
        "dungeon",
        camps.length,
        position.x,
        position.y,
        random,
        {
          biome: profile.biome,
          spriteKey: profile.spriteKey,
          enemyIds: profile.enemyIds,
          bossEnemyId: profile.bossEnemyId,
          respawnHours: DUNGEON_RESPAWN_HOURS,
        },
        profile.nameId,
      ),
    );
  }

  while (camps.length < minimumCampCount) {
    const profile = DUNGEON_SPAWN_PROFILES[camps.length % DUNGEON_SPAWN_PROFILES.length];
    const position = findLocationPosition(
      random,
      width,
      height,
      [...existing, ...camps],
      terrainZones,
      terrainRivers,
      terrainCells,
      520,
      { avoidRoads: terrainRoads },
    );
    camps.push(
      createLocation(
        "dungeon",
        camps.length,
        position.x,
        position.y,
        random,
        {
          biome: profile.biome,
          spriteKey: profile.spriteKey,
          enemyIds: profile.enemyIds.filter((enemyId) => archetypeIds.has(enemyId)),
          bossEnemyId: archetypeIds.has(profile.bossEnemyId)
            ? profile.bossEnemyId
            : profile.enemyIds.find((enemyId) => archetypeIds.has(enemyId))!,
          respawnHours: DUNGEON_RESPAWN_HOURS,
        },
        profile.nameId,
      ),
    );
  }

  return camps;
}

function findCampPosition(
  random: () => number,
  width: number,
  height: number,
  zone: Pick<TerrainZone, "id" | "x" | "y" | "radiusX" | "radiusY"> & {
    type: TerrainCell["type"];
  },
  existing: MapLocation[],
  terrainZones: TerrainZone[],
  terrainCells: TerrainCell[],
  terrainRivers: TerrainRiver[],
  terrainRoads: TerrainRoad[],
): { x: number; y: number } | null {
  for (let attempt = 0; attempt < 140; attempt += 1) {
    const angle = random() * Math.PI * 2;
    const spread = Math.sqrt(random()) * 0.82;
    const position = {
      x: clamp(
        zone.x + Math.cos(angle) * zone.radiusX * spread,
        WORLD_BOUNDARY_INSET + 160,
        width - WORLD_BOUNDARY_INSET - 160,
      ),
      y: clamp(
        zone.y + Math.sin(angle) * zone.radiusY * spread,
        WORLD_BOUNDARY_INSET + 160,
        height - WORLD_BOUNDARY_INSET - 160,
      ),
    };
    if (
      existing.every(
        (location) =>
          Math.hypot(position.x - location.x, position.y - location.y) > 430,
      ) &&
      isLocationPositionSafe(position, terrainZones, terrainRivers, terrainCells, false) &&
      isLocationAwayFromRoads(position, terrainRoads, 230)
    ) {
      return position;
    }
  }
  return null;
}

function findLocationPosition(
  random: () => number,
  width: number,
  height: number,
  existing: MapLocation[],
  terrainZones: TerrainZone[],
  terrainRivers: TerrainRiver[],
  terrainCells: TerrainCell[] = [],
  minimumSeparation = 390,
  bounds: {
    minimumX?: number;
    maximumX?: number;
    minimumY?: number;
    maximumY?: number;
    avoidMountains?: boolean;
    avoidRoads?: TerrainRoad[];
  } = {},
): { x: number; y: number } {
  for (let attempt = 0; attempt < 1200; attempt += 1) {
    const position = {
      x: randomInteger(
        random,
        bounds.minimumX ?? 300,
        bounds.maximumX ?? width - 300,
      ),
      y: randomInteger(
        random,
        bounds.minimumY ?? 300,
        bounds.maximumY ?? height - 300,
      ),
    };
    const separated = existing.every(
      (location) =>
        Math.hypot(position.x - location.x, position.y - location.y) >
        minimumSeparation,
    );
    if (
      separated &&
      isLocationAwayFromRoads(position, bounds.avoidRoads ?? [], 220) &&
      isLocationPositionSafe(
        position,
        terrainZones,
        terrainRivers,
        terrainCells,
        bounds.avoidMountains ?? false,
      )
    ) {
      return position;
    }
  }

  for (let y = 320; y < height - 320; y += 180) {
    for (let x = 320; x < width - 320; x += 180) {
      const position = { x, y };
      if (
        existing.every(
          (location) =>
            Math.hypot(x - location.x, y - location.y) > minimumSeparation,
        ) &&
        isLocationAwayFromRoads(position, bounds.avoidRoads ?? [], 220) &&
        isLocationPositionSafe(
          position,
          terrainZones,
          terrainRivers,
          terrainCells,
          bounds.avoidMountains ?? false,
        )
      ) {
        return position;
      }
    }
  }

  return { x: width / 2, y: height / 2 };
}

function findVillagePosition(
  random: () => number,
  width: number,
  height: number,
  city: MapLocation,
  existing: MapLocation[],
  terrainZones: TerrainZone[],
  terrainRivers: TerrainRiver[],
  terrainCells: TerrainCell[],
  terrainRoads: TerrainRoad[],
): { x: number; y: number } {
  const otherCities = existing.filter(
    (location) => location.type === "city" && location.id !== city.id,
  );
  for (let attempt = 0; attempt < 2200; attempt += 1) {
    const angle = random() * Math.PI * 2;
    const distance = randomInteger(random, 460, 1280);
    const position = {
      x: clamp(
        city.x + Math.cos(angle) * distance,
        WORLD_BOUNDARY_INSET + 180,
        width - WORLD_BOUNDARY_INSET - 180,
      ),
      y: clamp(
        city.y + Math.sin(angle) * distance,
        WORLD_BOUNDARY_INSET + 180,
        height - WORLD_BOUNDARY_INSET - 180,
      ),
    };
    const belongsToCity = otherCities.every(
      (candidate) =>
        Math.hypot(position.x - city.x, position.y - city.y) <
        Math.hypot(position.x - candidate.x, position.y - candidate.y),
    );
    if (
      belongsToCity &&
      existing.every(
        (location) =>
          Math.hypot(position.x - location.x, position.y - location.y) > 230,
      ) &&
      isLocationPositionSafe(position, terrainZones, terrainRivers, terrainCells, false) &&
      countRiverCrossings(city, position, terrainRivers) === 0 &&
      countLakeCrossings(city, position, terrainZones) === 0 &&
      !terrainRoads.some((road) =>
        isPositionNearPath(road.points, road.width, position.x, position.y, 180),
      )
    ) {
      return position;
    }
  }

  for (let attempt = 0; attempt < 1200; attempt += 1) {
    const angle = random() * Math.PI * 2;
    const distance = randomInteger(random, 520, 1450);
    const position = {
      x: clamp(
        city.x + Math.cos(angle) * distance,
        WORLD_BOUNDARY_INSET + 180,
        width - WORLD_BOUNDARY_INSET - 180,
      ),
      y: clamp(
        city.y + Math.sin(angle) * distance,
        WORLD_BOUNDARY_INSET + 180,
        height - WORLD_BOUNDARY_INSET - 180,
      ),
    };
    if (
      existing.every(
        (location) =>
          Math.hypot(position.x - location.x, position.y - location.y) > 210,
      ) &&
      isLocationPositionSafe(position, terrainZones, terrainRivers, terrainCells, false) &&
      !terrainRoads.some((road) =>
        isPositionNearPath(road.points, road.width, position.x, position.y, 170),
      )
    ) {
      return position;
    }
  }

  return findLocationPosition(random, width, height, existing, terrainZones, terrainRivers, terrainCells, 230);
}

function isLocationPositionSafe(
  position: { x: number; y: number },
  terrainZones: TerrainZone[],
  terrainRivers: TerrainRiver[],
  terrainCells: TerrainCell[],
  avoidMountains: boolean,
): boolean {
  if (isPositionInBlockedCell(position, terrainCells, 90)) return false;
  const blockedByZone = terrainZones.some(
    (zone) =>
      (zone.type === "lake" ||
        (avoidMountains && (zone.type === "mountain" || zone.type === "snowMountain"))) &&
      ellipseDistance(zone, position.x, position.y, 150) <= 1,
  );
  if (blockedByZone) return false;
  return !terrainRivers.some((river) =>
    isPositionNearPath(river.points, river.width, position.x, position.y, 260),
  );
}

function isLocationAwayFromRoads(
  position: { x: number; y: number },
  roads: TerrainRoad[],
  padding: number,
): boolean {
  return !roads.some((road) =>
    isPositionNearPath(road.points, road.width, position.x, position.y, padding),
  );
}

function isPositionInBlockedCell(
  position: { x: number; y: number },
  terrainCells: TerrainCell[],
  padding: number,
): boolean {
  if (terrainCells.length === 0) return false;
  const grid = getTerrainCellGrid(terrainCells);
  const minimumColumn = Math.floor((position.x - WORLD_BOUNDARY_INSET - padding) / TERRAIN_CELL_SIZE);
  const maximumColumn = Math.floor((position.x - WORLD_BOUNDARY_INSET + padding) / TERRAIN_CELL_SIZE);
  const minimumRow = Math.floor((position.y - WORLD_BOUNDARY_INSET - padding) / TERRAIN_CELL_SIZE);
  const maximumRow = Math.floor((position.y - WORLD_BOUNDARY_INSET + padding) / TERRAIN_CELL_SIZE);

  for (let column = minimumColumn; column <= maximumColumn; column += 1) {
    for (let row = minimumRow; row <= maximumRow; row += 1) {
      const cell = grid.cellsByKey.get(`${column}:${row}`);
      if (!cell || cell.type !== "lake") continue;
      if (
        position.x >= cell.x - padding &&
        position.y >= cell.y - padding &&
        position.x <= cell.x + cell.size + padding &&
        position.y <= cell.y + cell.size + padding
      ) {
        return true;
      }
    }
  }

  return false;
}

function getTerrainCellGrid(
  terrainCells: TerrainCell[],
): { cellsByKey: Map<string, TerrainCell> } {
  const cached = TERRAIN_CELL_GRID_CACHE.get(terrainCells);
  if (cached) return cached;

  const cellsByKey = new Map<string, TerrainCell>();
  for (const cell of terrainCells) {
    const column = Math.round((cell.x - WORLD_BOUNDARY_INSET) / TERRAIN_CELL_SIZE);
    const row = Math.round((cell.y - WORLD_BOUNDARY_INSET) / TERRAIN_CELL_SIZE);
    cellsByKey.set(`${column}:${row}`, cell);
  }

  const grid = { cellsByKey };
  TERRAIN_CELL_GRID_CACHE.set(terrainCells, grid);
  return grid;
}

function countRiverCrossings(
  start: { x: number; y: number },
  end: { x: number; y: number },
  rivers: TerrainRiver[],
): number {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const sampleCount = Math.max(2, Math.ceil(distance / 35));
  let crossings = 0;
  let wasInWater = false;
  for (let index = 0; index <= sampleCount; index += 1) {
    const progress = index / sampleCount;
    const x = start.x + (end.x - start.x) * progress;
    const y = start.y + (end.y - start.y) * progress;
    const isInWater = rivers.some((river) =>
      isPositionNearPath(river.points, river.width, x, y, 8),
    );
    if (isInWater && !wasInWater) crossings += 1;
    wasInWater = isInWater;
  }
  return crossings;
}

function countLakeCrossings(
  start: { x: number; y: number },
  end: { x: number; y: number },
  terrainZones: TerrainZone[],
): number {
  return terrainZones.filter(
    (zone) =>
      zone.type === "lake" &&
      distanceToSegment(
        zone.x,
        zone.y,
        start.x,
        start.y,
        end.x,
        end.y,
      ) <= Math.max(zone.radiusX, zone.radiusY) + 90,
  ).length;
}

function createEnemySpawns(
  random: () => number,
  fallbackRandom: () => number,
  width: number,
  height: number,
  start: { x: number; y: number },
  locations: MapLocation[],
  archetypes: EnemyArchetype[],
  terrainZones: TerrainZone[],
  terrainCells: TerrainCell[],
  terrainRivers: TerrainRiver[],
  terrainRoads: TerrainRoad[],
) {
  const archetypesById = new Map(archetypes.map((enemy) => [enemy.id, enemy]));
  const camps = locations.filter(
    (location) => location.type === "dungeon" && location.spawnProfile,
  );
  const spawns: WorldEnemySpawn[] = [];

  for (const camp of camps) {
    const profile = DUNGEON_SPAWN_PROFILES.find(
      (candidate) => candidate.biome === camp.spawnProfile?.biome,
    );
    const patrolCount = profile
      ? randomInteger(random, profile.patrolCount[0], profile.patrolCount[1])
      : randomInteger(random, 2, 4);

    for (let localIndex = 0; localIndex < patrolCount; localIndex += 1) {
      const position = findEnemyPosition(
        fallbackRandom,
        width,
        height,
        camp,
        terrainZones,
        terrainCells,
        terrainRivers,
        terrainRoads,
      );
      const distanceRatio =
        Math.hypot(position.x - start.x, position.y - start.y) /
        Math.hypot(width, height);
      const maximumThreat = Math.max(
        1,
        Math.min(5, 1 + Math.floor(distanceRatio * 7)),
      );
      const themedCandidates = (camp.spawnProfile?.enemyIds ?? [])
        .map((enemyId) => archetypesById.get(enemyId))
        .filter((enemy): enemy is EnemyArchetype =>
          Boolean(enemy && enemy.threat <= maximumThreat + 1),
        );
      const fallbackCandidates = (camp.spawnProfile?.enemyIds ?? [])
        .map((enemyId) => archetypesById.get(enemyId))
        .filter((enemy): enemy is EnemyArchetype => Boolean(enemy));
      const candidates =
        themedCandidates.length > 0 ? themedCandidates : fallbackCandidates;
      const archetype =
        candidates[randomInteger(random, 0, Math.max(0, candidates.length - 1))];
      if (!archetype) continue;

      spawns.push({
        id: `patrol_${camp.id}_${localIndex}`,
        archetypeId: archetype.id,
        sourceLocationId: camp.id,
        x: position.x,
        y: position.y,
        aggroRadius: 320 + archetype.threat * 35,
        ...createPatrolBurden(random, archetype),
      });
    }
  }

  return spawns;
}

function findEnemyPosition(
  random: () => number,
  width: number,
  height: number,
  anchor: MapLocation,
  terrainZones: TerrainZone[],
  terrainCells: TerrainCell[],
  terrainRivers: TerrainRiver[],
  terrainRoads: TerrainRoad[],
): { x: number; y: number } {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const angle = random() * Math.PI * 2;
    const distance = randomInteger(random, 220, 560);
    const position = {
      x: clamp(
        anchor.x + Math.cos(angle) * distance,
        WORLD_BOUNDARY_INSET + 40,
        width - WORLD_BOUNDARY_INSET - 40,
      ),
      y: clamp(
        anchor.y + Math.sin(angle) * distance,
        WORLD_BOUNDARY_INSET + 40,
        height - WORLD_BOUNDARY_INSET - 40,
      ),
    };
    if (
      !isEnemyPositionBlocked(
        position,
        terrainZones,
        terrainCells,
        terrainRivers,
        terrainRoads,
      )
    ) {
      return position;
    }
  }

  return { x: anchor.x, y: anchor.y };
}

function isEnemyPositionBlocked(
  position: { x: number; y: number },
  terrainZones: TerrainZone[],
  terrainCells: TerrainCell[],
  terrainRivers: TerrainRiver[],
  terrainRoads: TerrainRoad[],
): boolean {
  if (isPositionInBlockedCell(position, terrainCells, 24)) return true;
  const blockedByZone = terrainZones.some(
    (zone) =>
      zone.type === "lake" &&
      ellipseDistance(zone, position.x, position.y, 24) <= 1,
  );
  if (blockedByZone) return true;
  const crossesRiver = terrainRivers.some((river) =>
    isPositionNearPath(river.points, river.width, position.x, position.y, 24),
  );
  const usesBridge = terrainRoads.some((road) =>
    isPositionNearPath(road.points, road.width, position.x, position.y, 24),
  );
  return crossesRiver && !usesBridge;
}

function ellipseDistance(
  zone: Pick<TerrainZone, "x" | "y" | "radiusX" | "radiusY">,
  x: number,
  y: number,
  padding = 0,
): number {
  const normalizedX = (x - zone.x) / (zone.radiusX + padding);
  const normalizedY = (y - zone.y) / (zone.radiusY + padding);
  return Math.hypot(normalizedX, normalizedY);
}

function createPatrolBurden(
  random: () => number,
  archetype: EnemyArchetype,
): {
  speed: number;
  partySize: number;
  inventoryWeight: number;
  threat: number;
} {
  const partySize = archetype.deck.length;
  const inventoryWeight =
    12 + archetype.threat * 8 + randomInteger(random, 0, 18);
  const speed = Math.max(
    85,
    Math.round(250 - partySize * 15 - inventoryWeight * 1.8),
  );
  return {
    speed,
    partySize,
    inventoryWeight,
    threat: archetype.threat,
  };
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInteger(random: () => number, minimum: number, maximum: number): number {
  return Math.floor(random() * (maximum - minimum + 1)) + minimum;
}

function shuffle<T>(random: () => number, values: T[]): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInteger(random, 0, index);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
