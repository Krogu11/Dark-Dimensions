import type {
  EnemyArchetype,
  MapLocation,
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

  const enemies = createEnemySpawns(
    random,
    width,
    height,
    start,
    locations,
    enemyArchetypes,
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
    start,
    locations,
    encounterZones,
    enemies,
  };
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
  width: number,
  height: number,
  start: { x: number; y: number },
  locations: MapLocation[],
  archetypes: EnemyArchetype[],
) {
  const weakest = [...archetypes].sort((left, right) => left.threat - right.threat)[0];
  const spawns = weakest
    ? [
        {
          id: "patrol_start",
          archetypeId: weakest.id,
          x: Math.min(width - 100, start.x + 520),
          y: Math.max(100, start.y - 180),
          aggroRadius: 380,
          ...createPatrolBurden(random, weakest),
        },
      ]
    : [];

  for (let index = spawns.length; index < 24; index += 1) {
    const anchor = locations[randomInteger(random, 1, locations.length - 1)];
    const angle = random() * Math.PI * 2;
    const distance = randomInteger(random, 220, 560);
    const x = clamp(anchor.x + Math.cos(angle) * distance, 100, width - 100);
    const y = clamp(anchor.y + Math.sin(angle) * distance, 100, height - 100);
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
