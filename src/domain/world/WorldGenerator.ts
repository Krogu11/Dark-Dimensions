import type {
  EnemyArchetype,
  MapLocation,
  TerrainRiver,
  TerrainZone,
  WorldMapDefinition,
} from "../content/schemas";

const LOCATION_NAMES = {
  city: ["hollowmere", "cinderwatch", "greyhaven", "blackwater", "ashford"],
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
  dungeon: ["sunkenVault", "boneCrypt", "emberCavern", "hollowDepths", "oldMine"],
  landmark: ["witchStone", "fallenColossus", "moonWell", "bleakMonument"],
  wilds: ["gloamwood", "ashenFen", "wolfMoor", "silentHeath"],
} as const;

type GeneratedLocationType = keyof typeof LOCATION_NAMES;

const LOCATION_COUNTS: Record<GeneratedLocationType, number> = {
  city: 3,
  village: 12,
  castle: 4,
  dungeon: 7,
  landmark: 5,
  wilds: 7,
};

const LOCATION_RADII: Record<GeneratedLocationType, number> = {
  city: 145,
  village: 105,
  castle: 125,
  dungeon: 95,
  landmark: 80,
  wilds: 220,
};

const WORLD_BOUNDARY_INSET = 210;

export function createWorldSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}

export function generateWorldMap(
  seed: number,
  enemyArchetypes: EnemyArchetype[],
): WorldMapDefinition {
  const random = createRandom(seed);
  const width = randomInteger(random, 6000, 7600);
  const height = randomInteger(random, 4000, 5400);
  const start = {
    x: randomInteger(random, 620, 880),
    y: randomInteger(random, Math.floor(height * 0.38), Math.floor(height * 0.62)),
  };
  const locations: MapLocation[] = [
    createLocation("city", 0, start.x, start.y, random),
  ];

  for (const type of Object.keys(LOCATION_COUNTS) as GeneratedLocationType[]) {
    const startIndex = type === "city" ? 1 : 0;
    for (let index = startIndex; index < LOCATION_COUNTS[type]; index += 1) {
      const position = findLocationPosition(random, width, height, locations);
      locations.push(createLocation(type, index, position.x, position.y, random));
    }
  }

  const terrainRandom = createRandom(seed ^ 0x5f3759df);
  const terrainZones = createTerrainZones(
    terrainRandom,
    width,
    height,
    locations,
  );
  const terrainRivers = createTerrainRivers(terrainRandom, width, height);
  const enemies = createEnemySpawns(
    random,
    createRandom(seed ^ 0x1b873593),
    width,
    height,
    start,
    locations,
    enemyArchetypes,
    terrainZones,
  );
  const encounterZones = locations
    .filter((location) => location.type === "dungeon" || location.type === "wilds")
    .map((location, index) => {
      const distanceRatio =
        Math.hypot(location.x - start.x, location.y - start.y) /
        Math.hypot(width, height);
      const candidates = enemyArchetypes.filter(
        (enemy) => enemy.threat <= Math.max(1, Math.ceil(distanceRatio * 6)),
      );
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
    terrainRivers,
    locations,
    encounterZones,
    enemies,
  };
}

function createTerrainZones(
  random: () => number,
  width: number,
  height: number,
  locations: MapLocation[],
): TerrainZone[] {
  const specifications = [
    { type: "forest", count: 7, minimum: 280, maximum: 560 },
    { type: "swamp", count: 4, minimum: 250, maximum: 460 },
    { type: "desert", count: 3, minimum: 380, maximum: 680 },
    { type: "mountain", count: 6, minimum: 230, maximum: 460 },
    { type: "lake", count: 5, minimum: 150, maximum: 330 },
  ] as const;
  const zones: TerrainZone[] = [];

  for (const specification of specifications) {
    for (let index = 0; index < specification.count; index += 1) {
      for (let attempt = 0; attempt < 160; attempt += 1) {
        const radiusX = randomInteger(
          random,
          specification.minimum,
          specification.maximum,
        );
        const radiusY = randomInteger(
          random,
          Math.round(specification.minimum * 0.65),
          Math.round(specification.maximum * 0.78),
        );
        const candidate: TerrainZone = {
          id: `${specification.type}_${index}`,
          type: specification.type,
          x: randomInteger(
            random,
            WORLD_BOUNDARY_INSET + radiusX + 90,
            width - WORLD_BOUNDARY_INSET - radiusX - 90,
          ),
          y: randomInteger(
            random,
            WORLD_BOUNDARY_INSET + radiusY + 90,
            height - WORLD_BOUNDARY_INSET - radiusY - 90,
          ),
          radiusX,
          radiusY,
        };
        const blocksTravel =
          candidate.type === "mountain" || candidate.type === "lake";
        const clearsLocations =
          !blocksTravel ||
          locations.every(
            (location) =>
              ellipseDistance(candidate, location.x, location.y) >
              1 + (location.radius + 120) / Math.min(radiusX, radiusY),
          );
        const clearsBlockingZones = zones
          .filter((zone) => zone.type === "mountain" || zone.type === "lake")
          .every(
            (zone) =>
              Math.hypot(zone.x - candidate.x, zone.y - candidate.y) >
              Math.min(zone.radiusX, zone.radiusY) +
                Math.min(candidate.radiusX, candidate.radiusY) +
                140,
          );
        if (!clearsLocations || (blocksTravel && !clearsBlockingZones)) continue;
        zones.push(candidate);
        break;
      }
    }
  }

  return zones;
}

function createTerrainRivers(
  random: () => number,
  width: number,
  height: number,
): TerrainRiver[] {
  return Array.from({ length: 3 }, (_, riverIndex) => {
    const horizontal = riverIndex % 2 === 1;
    const points = Array.from({ length: 7 }, (_, pointIndex) => {
      const progress = pointIndex / 6;
      if (horizontal) {
        return {
          x: WORLD_BOUNDARY_INSET + progress * (width - WORLD_BOUNDARY_INSET * 2),
          y:
            height * (0.25 + riverIndex * 0.2) +
            Math.sin(progress * Math.PI * 3 + riverIndex) * 240 +
            randomInteger(random, -90, 90),
        };
      }
      return {
        x:
          width * (0.28 + riverIndex * 0.19) +
          Math.sin(progress * Math.PI * 3.5 + riverIndex) * 260 +
          randomInteger(random, -80, 80),
        y: WORLD_BOUNDARY_INSET + progress * (height - WORLD_BOUNDARY_INSET * 2),
      };
    });
    return {
      id: `river_${riverIndex}`,
      width: randomInteger(random, 54, 86),
      points,
    };
  });
}

function createLocation(
  type: GeneratedLocationType,
  index: number,
  x: number,
  y: number,
  random: () => number,
): MapLocation {
  const names = LOCATION_NAMES[type];
  const name = names[(index + randomInteger(random, 0, names.length - 1)) % names.length];
  return {
    id: `${type}_${index}`,
    type,
    nameKey: `generatedLocation.name.${name}`,
    descriptionKey: `generatedLocation.description.${type}`,
    x,
    y,
    radius: LOCATION_RADII[type],
  };
}

function findLocationPosition(
  random: () => number,
  width: number,
  height: number,
  existing: MapLocation[],
): { x: number; y: number } {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const position = {
      x: randomInteger(random, 300, width - 300),
      y: randomInteger(random, 300, height - 300),
    };
    const separated = existing.every(
      (location) => Math.hypot(position.x - location.x, position.y - location.y) > 390,
    );
    if (separated) return position;
  }

  return {
    x: randomInteger(random, 250, width - 250),
    y: randomInteger(random, 250, height - 250),
  };
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
) {
  const weakest = [...archetypes].sort((left, right) => left.threat - right.threat)[0];
  const fixedStartPosition = {
    x: Math.min(width - WORLD_BOUNDARY_INSET - 40, start.x + 520),
    y: Math.max(WORLD_BOUNDARY_INSET + 40, start.y - 180),
  };
  const startPatrolPosition = isEnemyPositionBlocked(
    fixedStartPosition,
    terrainZones,
  )
    ? findEnemyPosition(
        fallbackRandom,
        width,
        height,
        locations[0],
        terrainZones,
      )
    : fixedStartPosition;
  const spawns = weakest
    ? [
        {
          id: "patrol_start",
          archetypeId: weakest.id,
          x: startPatrolPosition!.x,
          y: startPatrolPosition!.y,
          aggroRadius: 380,
          ...createPatrolBurden(random, weakest),
        },
      ]
    : [];

  for (let index = spawns.length; index < 24; index += 1) {
    const anchor = locations[randomInteger(random, 1, locations.length - 1)];
    const angle = random() * Math.PI * 2;
    const distance = randomInteger(random, 220, 560);
    const originalPosition = {
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
    const position = isEnemyPositionBlocked(originalPosition, terrainZones)
      ? findEnemyPosition(
          fallbackRandom,
          width,
          height,
          anchor,
          terrainZones,
        )
      : originalPosition;
    const { x, y } = position;
    const distanceRatio = Math.hypot(x - start.x, y - start.y) / Math.hypot(width, height);
    const maximumThreat = Math.max(1, Math.min(5, 1 + Math.floor(distanceRatio * 7)));
    const candidates = archetypes.filter((enemy) => enemy.threat <= maximumThreat);
    const archetype =
      candidates[randomInteger(random, 0, Math.max(0, candidates.length - 1))] ??
      archetypes[0];
    if (!archetype) continue;

    spawns.push({
      id: `patrol_${index}`,
      archetypeId: archetype.id,
      x,
      y,
      aggroRadius: 320 + archetype.threat * 35,
      ...createPatrolBurden(random, archetype),
    });
  }

  return spawns;
}

function findEnemyPosition(
  random: () => number,
  width: number,
  height: number,
  anchor: MapLocation,
  terrainZones: TerrainZone[],
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
    if (!isEnemyPositionBlocked(position, terrainZones)) return position;
  }

  return { x: anchor.x, y: anchor.y };
}

function isEnemyPositionBlocked(
  position: { x: number; y: number },
  terrainZones: TerrainZone[],
): boolean {
  return terrainZones.some(
    (zone) =>
      (zone.type === "mountain" || zone.type === "lake") &&
      ellipseDistance(zone, position.x, position.y, 30) <= 1,
  );
}

function ellipseDistance(
  zone: TerrainZone,
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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
