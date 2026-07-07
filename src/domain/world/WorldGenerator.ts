import type {
  EnemyArchetype,
  MapLocation,
  TerrainRiver,
  TerrainRoad,
  TerrainZone,
  WorldMapDefinition,
} from "../content/schemas";
import { distanceToSegment, isPositionNearPath } from "./WorldTerrain";

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
  city: 4,
  village: 0,
  castle: 6,
  dungeon: 10,
  landmark: 8,
  wilds: 10,
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
  const width = randomInteger(random, 9000, 11200);
  const height = randomInteger(random, 6400, 8200);
  const terrainRandom = createRandom(seed ^ 0x5f3759df);
  const terrainZones = createTerrainZones(terrainRandom, width, height, []);
  const terrainRivers = createTerrainRivers(terrainRandom, width, height);
  const start = findLocationPosition(
    random,
    width,
    height,
    [],
    terrainZones,
    terrainRivers,
    0,
    {
      minimumX: 520,
      maximumX: Math.min(1500, width * 0.18),
      minimumY: Math.floor(height * 0.28),
      maximumY: Math.floor(height * 0.72),
      avoidMountains: true,
    },
  );
  const locations: MapLocation[] = [
    createLocation("city", 0, start.x, start.y, random),
  ];

  for (let index = 1; index < LOCATION_COUNTS.city; index += 1) {
    const position = findLocationPosition(
      random,
      width,
      height,
      locations,
      terrainZones,
      terrainRivers,
      1450,
      { avoidMountains: true },
    );
    locations.push(createLocation("city", index, position.x, position.y, random));
  }

  const cities = locations.filter((location) => location.type === "city");
  const terrainRoads = createTerrainRoads(
    locations,
    terrainRivers,
    terrainZones,
    width,
    height,
  );
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
        terrainRoads,
      );
      locations.push(
        createLocation("village", villageIndex, position.x, position.y, random),
      );
      villageIndex += 1;
    }
  }

  for (const type of Object.keys(LOCATION_COUNTS) as GeneratedLocationType[]) {
    if (type === "city" || type === "village") continue;
    for (let index = 0; index < LOCATION_COUNTS[type]; index += 1) {
      const position = findLocationPosition(
        random,
        width,
        height,
        locations,
        terrainZones,
        terrainRivers,
        390,
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
    terrainRivers,
    terrainRoads,
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
    terrainRoads,
    locations,
    encounterZones,
    enemies,
  };
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
): TerrainRoad {
  const directionX = destination.x - origin.x;
  const directionY = destination.y - origin.y;
  const directionLength = Math.max(1, Math.hypot(directionX, directionY));
  const normalX = -directionY / directionLength;
  const normalY = directionX / directionLength;
  const lakeDetours = terrainZones
    .filter(
      (zone) =>
        zone.type === "lake" &&
        distanceToSegment(
          zone.x,
          zone.y,
          origin.x,
          origin.y,
          destination.x,
          destination.y,
        ) <= Math.max(zone.radiusX, zone.radiusY) + 90,
    )
    .map((lake) => {
      const detourDistance = Math.max(lake.radiusX, lake.radiusY) + 190;
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
    })
    .sort((left, right) => left.progress - right.progress)
    .map((detour) => detour.point);

  return {
    id: `road_${origin.id}_${destination.id}`,
    originId: origin.id,
    destinationId: destination.id,
    width,
    points: [{ x: origin.x, y: origin.y }, ...lakeDetours, { x: destination.x, y: destination.y }],
  };
}

function createTerrainZones(
  random: () => number,
  width: number,
  height: number,
  locations: MapLocation[],
): TerrainZone[] {
  const specifications = [
    { type: "forest", count: 12, minimum: 320, maximum: 720 },
    { type: "swamp", count: 7, minimum: 280, maximum: 560 },
    { type: "desert", count: 6, minimum: 420, maximum: 820 },
    { type: "mountain", count: 11, minimum: 280, maximum: 620 },
    { type: "lake", count: 8, minimum: 180, maximum: 420 },
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
        const blocksTravel = candidate.type === "lake";
        const clearsLocations =
          !blocksTravel ||
          locations.every(
            (location) =>
              ellipseDistance(candidate, location.x, location.y) >
              1 + (location.radius + 120) / Math.min(radiusX, radiusY),
          );
        const clearsBlockingZones = zones
          .filter((zone) => zone.type === "lake")
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
            height * (0.34 + Math.floor(riverIndex / 2) * 0.32) +
            Math.sin(progress * Math.PI * 3 + riverIndex) * 240 +
            randomInteger(random, -90, 90),
        };
      }
      return {
        x:
          width * (0.24 + Math.floor(riverIndex / 2) * 0.26) +
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
  terrainZones: TerrainZone[],
  terrainRivers: TerrainRiver[],
  minimumSeparation = 390,
  bounds: {
    minimumX?: number;
    maximumX?: number;
    minimumY?: number;
    maximumY?: number;
    avoidMountains?: boolean;
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
      isLocationPositionSafe(
        position,
        terrainZones,
        terrainRivers,
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
        isLocationPositionSafe(
          position,
          terrainZones,
          terrainRivers,
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
  terrainRoads: TerrainRoad[],
): { x: number; y: number } {
  const otherCities = existing.filter(
    (location) => location.type === "city" && location.id !== city.id,
  );
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const angle = random() * Math.PI * 2;
    const distance = randomInteger(random, 420, 980);
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
          Math.hypot(position.x - location.x, position.y - location.y) > 270,
      ) &&
      isLocationPositionSafe(position, terrainZones, terrainRivers, false) &&
      countRiverCrossings(city, position, terrainRivers) === 0 &&
      countLakeCrossings(city, position, terrainZones) === 0 &&
      !terrainRoads.some((road) =>
        isPositionNearPath(road.points, road.width, position.x, position.y, 210),
      )
    ) {
      return position;
    }
  }

  return findLocationPosition(
    random,
    width,
    height,
    existing,
    terrainZones,
    terrainRivers,
    270,
  );
}

function isLocationPositionSafe(
  position: { x: number; y: number },
  terrainZones: TerrainZone[],
  terrainRivers: TerrainRiver[],
  avoidMountains: boolean,
): boolean {
  const blockedByZone = terrainZones.some(
    (zone) =>
      (zone.type === "lake" || (avoidMountains && zone.type === "mountain")) &&
      ellipseDistance(zone, position.x, position.y, 150) <= 1,
  );
  if (blockedByZone) return false;
  return !terrainRivers.some((river) =>
    isPositionNearPath(river.points, river.width, position.x, position.y, 260),
  );
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
  terrainRivers: TerrainRiver[],
  terrainRoads: TerrainRoad[],
) {
  const weakest = [...archetypes].sort((left, right) => left.threat - right.threat)[0];
  const fixedStartPosition = {
    x: Math.min(width - WORLD_BOUNDARY_INSET - 40, start.x + 520),
    y: Math.max(WORLD_BOUNDARY_INSET + 40, start.y - 180),
  };
  const startPatrolPosition = isEnemyPositionBlocked(
    fixedStartPosition,
    terrainZones,
    terrainRivers,
    terrainRoads,
  )
    ? findEnemyPosition(
        fallbackRandom,
        width,
        height,
        locations[0],
        terrainZones,
        terrainRivers,
        terrainRoads,
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

  for (let index = spawns.length; index < 38; index += 1) {
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
    const position = isEnemyPositionBlocked(
      originalPosition,
      terrainZones,
      terrainRivers,
      terrainRoads,
    )
      ? findEnemyPosition(
          fallbackRandom,
          width,
          height,
          anchor,
          terrainZones,
          terrainRivers,
          terrainRoads,
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
  terrainRivers: TerrainRiver[],
  terrainRoads: TerrainRoad[],
): boolean {
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
