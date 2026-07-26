import { contentPack, itemsById } from "../../content/content";
import type { MapLocation, WorldMapDefinition } from "../content/schemas";
import {
  distanceToSegment,
  getTerrainAt,
  type TerrainType,
} from "../world/WorldTerrain";
import { getPartyInitiativeMultiplier } from "../world/PartySpeed";
import type { CityState } from "../world/Cities";

export interface InventoryStack {
  itemId: string;
  quantity: number;
  supply?: number;
}

export interface MarketOffer {
  itemId: string;
  buyPrice: number;
  stock: number;
}

export interface MarketProfile {
  sourceId: string;
  locationId: string | null;
  locationType: "city" | "village" | "caravan" | "villager";
  productionItemId: string;
  demandItemId: string | null;
  demandItemIds: string[];
  surplusItemIds: string[];
  merchantGold: number;
  offers: MarketOffer[];
  recipeIds: string[];
}

export interface CaravanState {
  id: string;
  kind: "caravan" | "villager";
  x: number;
  y: number;
  originId: string;
  destinationId: string;
  homeLocationId?: string;
  waitHoursRemaining?: number;
  despawnAfterWait?: boolean;
  progress: number;
  speed: number;
  inventory: InventoryStack[];
  leaderCardId?: string;
  leaderLevel?: number;
  unitIds?: string[];
  factionId?: "ember_crown" | "gloam_compact" | "iron_concord";
  state?: "traveling" | "fighting" | "destroyed";
  respawnHoursRemaining?: number;
  attackerWarbandId?: string | null;
  battleHoursRemaining?: number;
}

export interface EconomyState {
  markets: Record<string, InventoryStack[]>;
  merchantGold: Record<string, number>;
  caravans: CaravanState[];
  villagers: CaravanState[];
  restockHours: number;
  villagerSpawnHours: number;
  villagerSerial: number;
}

const MAX_DAILY_VILLAGER_DEPARTURES_PER_VILLAGE = 1;
const CARAVAN_SETTLEMENT_DWELL_HOURS = 4;
const VILLAGER_SETTLEMENT_DWELL_HOURS = 2;

const RESOURCE_IDS = [
  "wood",
  "iron",
  "copper",
  "silver",
  "gold_ore",
  "coal",
  "stone",
  "wheat",
  "grapes",
  "sheep",
  "cattle",
  "pigs",
  "milk",
  "fish",
  "clay",
  "herbs",
];
const CITY_TRADE_IDS = [
  "flour",
  "bread",
  "wine",
  "wool",
  "meat",
  "dried_meat",
  "cheese",
  "leather",
  "pottery",
];
const CITY_STOCK_IDS = [
  "travel_rations",
  "bread",
  "flour",
  "meat",
  "dried_meat",
  "cheese",
  "wine",
  "wool",
  "leather",
  "pottery",
  "healing_poultice",
  "iron_talisman",
  "warding_charm",
];
const CITY_COMMON_EQUIPMENT_IDS = [
  "wooden_club",
  "rusty_sword",
  "militia_spear",
  "hunting_bow",
  "simple_shield",
];
const CITY_RARE_EQUIPMENT_IDS = [
  "iron_mace",
  "steel_sword",
  "war_axe",
  "kite_shield",
  "tower_shield",
  "knightly_longsword",
  "runed_aegis",
];

export function createEconomyState(
  seed: number,
  map: WorldMapDefinition,
): EconomyState {
  const markets: Record<string, InventoryStack[]> = {};
  const settlements = map.locations.filter(
    (location) => location.type === "city" || location.type === "village" || location.type === "soulTemple",
  );
  for (const location of settlements) {
    markets[location.id] = createInitialStock(seed, location, map);
  }

  const cities = settlements.filter((location) => location.type === "city");
  const villages = settlements.filter((location) => location.type === "village");
  const cityIds = new Set(cities.map((city) => city.id));
  const cityRoads = map.terrainRoads.filter(
    (road) =>
      road.originId &&
      road.destinationId &&
      cityIds.has(road.originId) &&
      cityIds.has(road.destinationId),
  );
  const caravans = cityRoads.flatMap((road, roadIndex) => {
    return [0, 1].map((direction) => {
      const index = roadIndex * 2 + direction;
      const origin = map.locations.find(
        (location) =>
          location.id ===
          (direction === 0 ? road.originId : road.destinationId),
      )!;
      const destination = map.locations.find(
        (location) =>
          location.id ===
          (direction === 0 ? road.destinationId : road.originId),
      )!;
      const progress = 0;
      const position = { x: origin.x, y: origin.y };
      const escort = createCaravanEscort(seed, `caravan:${index}`);
      return {
        id: `caravan_${index}`,
        kind: "caravan" as const,
        x: position.x,
        y: position.y,
        originId: origin.id,
        destinationId: destination.id,
        progress,
        waitHoursRemaining: CARAVAN_SETTLEMENT_DWELL_HOURS,
        speed: 220 + (hashValue(`${seed}:caravan:${index}`) % 35),
        leaderCardId: escort.leaderCardId,
        leaderLevel: escort.leaderLevel,
        unitIds: escort.unitIds,
        state: "traveling" as const,
        respawnHoursRemaining: 0,
        attackerWarbandId: null,
        battleHoursRemaining: 0,
        inventory: selectSeededItems(
          CITY_TRADE_IDS,
          seed,
          `caravan:${index}`,
          5,
        ).map((itemId, itemIndex) => ({
          itemId,
          quantity: 3 + ((index + itemIndex) % 5),
        })),
      };
    });
  });
  const villagers = villages.map((village, index) => {
    const city = nearestLocation(village, cities);
    const productionItemId = getLocationResource(seed, village.id, map);
    const progress = 0;
    const position = { x: village.x, y: village.y };
    return {
      id: `villager_${index}`,
      kind: "villager" as const,
      x: position.x,
      y: position.y,
      originId: village.id,
      destinationId: city.id,
      homeLocationId: village.id,
      progress,
      waitHoursRemaining: VILLAGER_SETTLEMENT_DWELL_HOURS,
      speed: 175 + (hashValue(`${seed}:villager:${index}`) % 30),
      leaderCardId: "village_levy",
      leaderLevel: 1,
      unitIds: ["village_slinger"],
      inventory: [
        { itemId: productionItemId, quantity: 6 + (index % 5) },
        { itemId: "bread", quantity: 2 + (index % 2) },
      ],
    };
  });

  const merchantGold = Object.fromEntries(
    settlements.map((location) => [
      location.id,
      location.type === "city"
        ? 700 + (hashValue(`${seed}:${location.id}:gold`) % 900)
        : 180 + (hashValue(`${seed}:${location.id}:gold`) % 260),
    ]),
  );
  return {
    markets,
    merchantGold,
    caravans,
    villagers,
    restockHours: 0,
    villagerSpawnHours: 0,
    villagerSerial: villagers.length,
  };
}

export function normalizeEconomyState(
  state: EconomyState | undefined,
  seed: number,
  map: WorldMapDefinition,
): EconomyState {
  const fresh = createEconomyState(seed, map);
  if (!state) return fresh;
  const legacyState = state as EconomyState & {
    restockSeconds?: number;
    villagers?: CaravanState[];
    villagerSpawnHours?: number;
    villagerSerial?: number;
  };
  const cityIds = new Set(
    map.locations
      .filter((location) => location.type === "city")
      .map((location) => location.id),
  );
  const hasCurrentRoutes =
    Array.isArray(legacyState.villagers) &&
    state.caravans.every(
      (caravan) =>
        cityIds.has(caravan.originId) && cityIds.has(caravan.destinationId),
    );
  const markets = Object.fromEntries(
    Object.entries(fresh.markets).map(([locationId, fallbackStock]) => [
      locationId,
      normalizeStacks(state.markets?.[locationId] ?? fallbackStock),
    ]),
  );
  return {
    markets,
    merchantGold: { ...fresh.merchantGold, ...(state.merchantGold ?? {}) },
    caravans: hasCurrentRoutes
      ? state.caravans.map((caravan) => {
          const origin = map.locations.find(
            (location) => location.id === caravan.originId,
          );
          const needsDwellMigration =
            typeof caravan.waitHoursRemaining !== "number";
          return {
            ...caravan,
            kind: "caravan" as const,
            x: needsDwellMigration && origin ? origin.x : caravan.x,
            y: needsDwellMigration && origin ? origin.y : caravan.y,
            progress: needsDwellMigration ? 0 : caravan.progress,
            waitHoursRemaining: needsDwellMigration
              ? CARAVAN_SETTLEMENT_DWELL_HOURS
              : caravan.waitHoursRemaining,
            leaderCardId: caravan.leaderCardId ?? "wache",
            leaderLevel: caravan.leaderLevel ?? 3,
            unitIds: caravan.unitIds ?? createCaravanEscort(seed, caravan.id).unitIds,
            state: caravan.state ?? "traveling",
            respawnHoursRemaining: caravan.respawnHoursRemaining ?? 0,
            attackerWarbandId: caravan.attackerWarbandId ?? null,
            battleHoursRemaining: caravan.battleHoursRemaining ?? 0,
            inventory: normalizeStacks(caravan.inventory),
          };
        })
      : fresh.caravans,
    villagers: hasCurrentRoutes
      ? legacyState.villagers!.map((villager) => ({
          ...villager,
          kind: "villager" as const,
          homeLocationId:
            villager.homeLocationId ??
            inferVillagerHomeLocationId(villager, map),
          waitHoursRemaining: villager.waitHoursRemaining ?? 0,
          leaderCardId: villager.leaderCardId ?? "village_levy",
          leaderLevel: villager.leaderLevel ?? 1,
          unitIds: villager.unitIds ?? ["village_slinger"],
          inventory: normalizeStacks(villager.inventory),
        }))
      : fresh.villagers,
    restockHours:
      typeof state.restockHours === "number"
        ? state.restockHours
        : (legacyState.restockSeconds ?? 0) / 3600,
    villagerSpawnHours:
      typeof legacyState.villagerSpawnHours === "number"
        ? legacyState.villagerSpawnHours
        : 0,
    villagerSerial:
      typeof legacyState.villagerSerial === "number"
        ? legacyState.villagerSerial
        : fresh.villagerSerial + (legacyState.villagers?.length ?? 0),
  };
}

export function updateEconomyState(
  state: EconomyState,
  seed: number,
  map: WorldMapDefinition,
  deltaHours: number,
): void {
  state.restockHours += deltaHours;
  if (state.restockHours >= 18) {
    state.restockHours %= 18;
    restockMarkets(state, seed, map);
  }

  state.villagerSpawnHours += deltaHours;
  const elapsedVillagerDays = Math.floor(state.villagerSpawnHours / 24);
  state.villagerSpawnHours %= 24;
  const completedVillagerIds = new Set<string>();

  for (const trader of [...state.caravans, ...state.villagers]) {
    const origin = map.locations.find((location) => location.id === trader.originId);
    const destination = map.locations.find(
      (location) => location.id === trader.destinationId,
    );
    if (!origin || !destination) continue;
    if (trader.state === "destroyed") {
      trader.respawnHoursRemaining = Math.max(
        0,
        (trader.respawnHoursRemaining ?? 24) - deltaHours,
      );
      trader.x = origin.x;
      trader.y = origin.y;
      if (trader.respawnHoursRemaining > 0) continue;
      const escort = createCaravanEscort(seed, trader.id);
      trader.state = "traveling";
      trader.attackerWarbandId = null;
      trader.battleHoursRemaining = 0;
      trader.leaderCardId = escort.leaderCardId;
      trader.leaderLevel = escort.leaderLevel;
      trader.unitIds = escort.unitIds;
      trader.inventory = selectSeededItems(
        CITY_TRADE_IDS,
        seed,
        `${trader.id}:respawn:${Math.floor(state.restockHours / 24)}`,
        5,
      ).map((itemId, index) => ({
        itemId,
        quantity: 3 + ((hashValue(`${trader.id}:${itemId}:respawn`) + index) % 5),
      }));
      trader.waitHoursRemaining = CARAVAN_SETTLEMENT_DWELL_HOURS;
      continue;
    }
    if (trader.state === "fighting") continue;
    let travelHours = deltaHours;
    if ((trader.waitHoursRemaining ?? 0) > 0) {
      const waitedHours = Math.min(travelHours, trader.waitHoursRemaining!);
      trader.waitHoursRemaining = Math.max(
        0,
        trader.waitHoursRemaining! - waitedHours,
      );
      travelHours -= waitedHours;
      trader.x = origin.x;
      trader.y = origin.y;
      if (trader.waitHoursRemaining > 0) continue;
      if (trader.kind === "villager" && trader.despawnAfterWait) {
        completedVillagerIds.add(trader.id);
        continue;
      }
    }
    if (travelHours <= 0) continue;
    const distance = getRouteLength(map, origin.id, destination.id);
    const initiativeSpeed = getPartyInitiativeMultiplier([
      ...(trader.leaderCardId ? [trader.leaderCardId] : []),
      ...(trader.unitIds ?? []),
    ]);
    trader.progress += (trader.speed * initiativeSpeed * travelHours) / distance;
    if (trader.progress >= 1) {
      trader.progress = 0;
      trader.originId = destination.id;
      trader.destinationId = origin.id;
      serviceTraderAtSettlement(state, trader, destination, seed, map);
      if (trader.kind === "villager" && destination.type === "village") {
        trader.waitHoursRemaining = VILLAGER_SETTLEMENT_DWELL_HOURS;
        trader.despawnAfterWait = true;
        trader.x = destination.x;
        trader.y = destination.y;
        continue;
      }
      trader.waitHoursRemaining =
        trader.kind === "caravan"
          ? CARAVAN_SETTLEMENT_DWELL_HOURS
          : VILLAGER_SETTLEMENT_DWELL_HOURS;
      trader.despawnAfterWait = false;
    }
    const nextOrigin = map.locations.find(
      (location) => location.id === trader.originId,
    )!;
    const nextDestination = map.locations.find(
      (location) => location.id === trader.destinationId,
    )!;
    const position = getRoutePosition(
      map,
      nextOrigin.id,
      nextDestination.id,
      trader.progress,
    );
    trader.x = position.x;
    trader.y = position.y;
  }

  if (completedVillagerIds.size > 0) {
    state.villagers = state.villagers.filter(
      (villager) => !completedVillagerIds.has(villager.id),
    );
  }
  for (let day = 0; day < elapsedVillagerDays; day += 1) {
    spawnDailyVillagers(state, seed, map);
  }
}

export function createCaravanEscort(
  seed: number,
  key: string,
): { leaderCardId: string; leaderLevel: number; unitIds: string[] } {
  const branches = [
    ["caravan_guard", "caravan_guard", "road_warden", "caravan_crossbowman"],
    ["caravan_guard", "road_warden", "caravan_crossbowman", "caravan_crossbowman"],
    ["caravan_guard", "road_warden", "road_warden", "wagon_captain"],
  ];
  const branch = branches[hashValue(`${seed}:${key}:escort-branch`) % branches.length];
  const extra = hashValue(`${seed}:${key}:escort-size`) % 3;
  return {
    leaderCardId: hashValue(`${seed}:${key}:escort-captain`) % 2
      ? "master_escort"
      : "wagon_captain",
    leaderLevel: 3 + (hashValue(`${seed}:${key}:escort-leader`) % 2),
    unitIds: [...branch, ...branch.slice(0, extra)],
  };
}

export function createMarketProfile(
  seed: number,
  location: MapLocation,
  economy?: EconomyState,
  map?: WorldMapDefinition,
  cityState?: CityState | null,
): MarketProfile | null {
  if (location.type !== "city" && location.type !== "village" && location.type !== "soulTemple") return null;
  const locationHash = hashValue(`${seed}:${location.id}`);
  const resourceId = getLocationResource(seed, location.id, map);
  const stock =
    economy?.markets[location.id] ?? createInitialStock(seed, location, map);

  if (location.type === "village") {
    return {
      sourceId: location.id,
      locationId: location.id,
      locationType: "village",
      productionItemId: resourceId,
      demandItemId: null,
      demandItemIds: [],
      surplusItemIds: [resourceId],
      merchantGold: economy?.merchantGold[location.id] ?? 250,
      offers: stock.map((entry) => ({
        itemId: entry.itemId,
        stock: entry.quantity,
        buyPrice: calculateBuyPrice(
          entry.itemId,
          entry.quantity,
          0.58 + ((locationHash >>> 5) % 12) / 100,
        ),
      })),
      recipeIds: [],
    };
  }

  const recipes = selectSeededItems(
    contentPack.tradeRecipes.map((recipe) => recipe.id),
    seed,
    `recipes:${location.id}`,
    4,
  );
  const primaryRecipe = contentPack.tradeRecipes.find(
    (candidate) => candidate.id === recipes[0],
  );
  const demandItemIds = selectSeededItems(
    RESOURCE_IDS.filter((itemId) => itemId !== resourceId),
    seed,
    `demands:${location.id}`,
    cityState && cityState.garrison >= 400 ? 4 : 3,
  );
  const surplusItemIds = selectSeededItems(
    [resourceId, ...CITY_TRADE_IDS, primaryRecipe?.outputItemId ?? resourceId],
    seed,
    `surpluses:${location.id}`,
    cityState && cityState.prosperity >= 65 ? 3 : 2,
  );
  return {
    sourceId: location.id,
    locationId: location.id,
    locationType: "city",
    productionItemId: primaryRecipe?.outputItemId ?? resourceId,
    demandItemId: demandItemIds[0] ?? getCityDemand(seed, location.id, map),
    demandItemIds,
    surplusItemIds,
    merchantGold:
      economy?.merchantGold[location.id] ??
      900 + (cityState?.prosperity ?? 50) * 12 + Math.floor((cityState?.population ?? 3000) / 20),
    offers: stock.map((entry, index) => ({
      itemId: entry.itemId,
      stock: entry.quantity,
      buyPrice: calculateBuyPrice(
        entry.itemId,
        entry.quantity,
        (1.08 + ((locationHash >>> (index + 2)) % 18) / 100) *
          (surplusItemIds[0] === entry.itemId
            ? 0.75
            : surplusItemIds.includes(entry.itemId)
              ? 0.86
              : 1) *
          (cityState ? 1.06 - cityState.prosperity * 0.0012 : 1),
      ),
    })),
    recipeIds: recipes,
  };
}

export function createCaravanMarketProfile(
  seed: number,
  caravan: CaravanState,
): MarketProfile {
  const variation = 1.06 + (hashValue(`${seed}:${caravan.id}`) % 12) / 100;
  return {
    sourceId: caravan.id,
    locationId: null,
    locationType: caravan.kind,
    productionItemId: caravan.inventory[0]?.itemId ?? "wood",
    demandItemId: null,
    demandItemIds: [],
    surplusItemIds: caravan.inventory.slice(0, 2).map((entry) => entry.itemId),
    merchantGold: 420,
    offers: caravan.inventory.map((entry) => ({
      itemId: entry.itemId,
      stock: entry.quantity,
      buyPrice: calculateBuyPrice(entry.itemId, entry.quantity, variation),
    })),
    recipeIds: [],
  };
}

export function getMarketSellPrice(
  seed: number,
  location: MapLocation,
  itemId: string,
  currentStock = 0,
): number {
  const profile = createMarketProfile(seed, location);
  if (!profile) return 0;
  return calculateSellPrice(seed, profile, itemId, currentStock);
}

export function calculateSellPrice(
  seed: number,
  profile: MarketProfile,
  itemId: string,
  currentStock: number,
): number {
  const item = itemsById.get(itemId);
  if (!item) return 0;
  const locationHash = hashValue(`${seed}:${profile.sourceId}:${itemId}`);
  const localVariation = 0.9 + (locationHash % 21) / 100;
  const demandIndex = profile.demandItemIds.indexOf(itemId);
  const demandMultiplier = demandIndex === 0 ? 1.5 : demandIndex === 1 ? 1.35 : demandIndex >= 0 ? 1.2 : 1;
  const marketMultiplier =
    profile.locationType === "city"
      ? 0.92
      : profile.locationType === "village"
        ? 0.58
        : 0.78;
  const saturationMultiplier = Math.max(0.55, 1 - currentStock * 0.025);
  return Math.max(
    1,
    Math.floor(
      item.baseValue *
        localVariation *
        demandMultiplier *
        marketMultiplier *
        saturationMultiplier,
    ),
  );
}

export function marketStock(
  economy: EconomyState,
  profile: MarketProfile,
): InventoryStack[] {
  if (profile.locationType === "caravan" || profile.locationType === "villager") {
    return (
      [...economy.caravans, ...economy.villagers].find(
        (trader) => trader.id === profile.sourceId,
      )?.inventory ?? []
    );
  }
  return economy.markets[profile.sourceId] ?? [];
}

export function addToInventory(
  inventory: InventoryStack[],
  itemId: string,
  quantity: number,
  supply?: number,
): void {
  if (quantity <= 0) return;
  const foodUnits = itemsById.get(itemId)?.foodUnits;
  const addedSupply = foodUnits ? (supply ?? foodUnits * quantity) : undefined;
  const stack = inventory.find((candidate) => candidate.itemId === itemId);
  if (stack) {
    stack.quantity += quantity;
    if (foodUnits) stack.supply = (stack.supply ?? 0) + (addedSupply ?? 0);
  } else {
    inventory.push({
      itemId,
      quantity,
      ...(foodUnits ? { supply: addedSupply } : {}),
    });
  }
}

export function removeFromInventory(
  inventory: InventoryStack[],
  itemId: string,
  quantity: number,
): boolean {
  const stack = inventory.find((candidate) => candidate.itemId === itemId);
  if (!stack || quantity <= 0 || stack.quantity < quantity) return false;
  const foodUnits = itemsById.get(itemId)?.foodUnits;
  stack.quantity -= quantity;
  if (foodUnits) {
    stack.supply = Math.max(
      0,
      (stack.supply ?? foodUnits * (stack.quantity + quantity)) -
        foodUnits * quantity,
    );
  }
  if (stack.quantity === 0) inventory.splice(inventory.indexOf(stack), 1);
  return true;
}

export function inventoryQuantity(
  inventory: InventoryStack[],
  itemId: string,
): number {
  return inventory.find((stack) => stack.itemId === itemId)?.quantity ?? 0;
}

export function inventoryFoodSupply(inventory: InventoryStack[]): number {
  return inventory.reduce((total, stack) => {
    const foodUnits = itemsById.get(stack.itemId)?.foodUnits;
    if (!foodUnits) return total;
    return total + (stack.supply ?? foodUnits * stack.quantity);
  }, 0);
}

export function inventoryFoodCapacity(inventory: InventoryStack[]): number {
  return inventory.reduce((total, stack) => {
    const foodUnits = itemsById.get(stack.itemId)?.foodUnits;
    return total + (foodUnits ? foodUnits * stack.quantity : 0);
  }, 0);
}

export function consumeFoodSupply(
  inventory: InventoryStack[],
  requestedSupply: number,
): number {
  let remaining = Math.max(0, requestedSupply);
  let consumed = 0;
  for (const stack of [...inventory]) {
    const foodUnits = itemsById.get(stack.itemId)?.foodUnits;
    if (!foodUnits || remaining <= 0) continue;
    const available = stack.supply ?? foodUnits * stack.quantity;
    const taken = Math.min(available, remaining);
    stack.supply = available - taken;
    stack.quantity = Math.ceil(stack.supply / foodUnits);
    consumed += taken;
    remaining -= taken;
    if (stack.quantity === 0) inventory.splice(inventory.indexOf(stack), 1);
  }
  return consumed;
}

function createInitialStock(
  seed: number,
  location: MapLocation,
  map?: WorldMapDefinition,
): InventoryStack[] {
  const locationHash = hashValue(`${seed}:${location.id}:stock`);
  if (location.type === "village") {
    const productionItemId = getLocationResource(seed, location.id, map);
    const secondaryItemId = getSecondaryVillageProduct(productionItemId);
    return [
      {
        itemId: productionItemId,
        quantity: 18 + (locationHash % 15),
      },
      {
        itemId: "travel_rations",
        quantity: 8 + (locationHash % 6),
      },
      { itemId: "bread", quantity: 6 + ((locationHash >>> 3) % 7) },
      { itemId: secondaryItemId, quantity: 4 + ((locationHash >>> 5) % 8) },
    ];
  }
  const importedResources = selectSeededItems(
    getCitySupplyPool(seed, map, location),
    seed,
    `imports:${location.id}`,
    5,
  );
  const commonEquipment = selectSeededItems(
    CITY_COMMON_EQUIPMENT_IDS,
    seed,
    `commonEquipment:${location.id}`,
    3,
  );
  const rareEquipment = selectSeededItems(
    CITY_RARE_EQUIPMENT_IDS,
    seed,
    `rareEquipment:${location.id}`,
    2,
  );
  return [
    ...CITY_STOCK_IDS,
    ...commonEquipment,
    ...rareEquipment,
    ...importedResources,
  ].map((itemId, index) => ({
    itemId,
    quantity:
      itemsById.get(itemId)?.type === "equipment"
        ? 1 + (CITY_COMMON_EQUIPMENT_IDS.includes(itemId) ? ((locationHash >>> 4) % 2) : 0)
        : 6 + ((locationHash + index * 7) % 13),
  }));
}

function restockMarkets(
  economy: EconomyState,
  seed: number,
  map: WorldMapDefinition,
): void {
  for (const location of map.locations) {
    const stock = economy.markets[location.id];
    if (!stock) continue;
    if (location.type === "village") {
      addToInventory(stock, getLocationResource(seed, location.id, map), 1);
      addToInventory(stock, "travel_rations", 1);
      addToInventory(stock, "bread", 1);
    } else if (location.type === "city") {
      addToInventory(stock, "travel_rations", 2);
      addToInventory(stock, "bread", 2);
      addToInventory(stock, "flour", 1);
      addToInventory(stock, "healing_poultice", 1);
      if ((hashValue(`${seed}:${location.id}:equipmentRestock`) + stock.length) % 3 === 0) {
        addToInventory(
          stock,
          CITY_COMMON_EQUIPMENT_IDS[
            hashValue(`${seed}:${location.id}:commonEquipmentRestock`) %
              CITY_COMMON_EQUIPMENT_IDS.length
          ],
          1,
        );
      }
    }
  }
}

function serviceTraderAtSettlement(
  economy: EconomyState,
  trader: CaravanState,
  location: MapLocation,
  seed: number,
  map: WorldMapDefinition,
): void {
  if (trader.kind === "villager" && location.type === "city") {
    const cityStock = economy.markets[location.id];
    for (const cargo of trader.inventory) {
      addToInventory(cityStock, cargo.itemId, Math.max(1, Math.floor(cargo.quantity / 2)));
    }
  } else if (trader.kind === "villager" && location.type === "village") {
    const resourceId = getLocationResource(seed, location.id, map);
    trader.inventory = [
      { itemId: resourceId, quantity: 7 + (hashValue(trader.id) % 5) },
      { itemId: "bread", quantity: 2 },
    ];
  } else if (trader.kind === "caravan" && location.type === "city") {
    const cityStock = economy.markets[location.id];
    for (const cargo of trader.inventory) {
      addToInventory(cityStock, cargo.itemId, 1);
    }
    trader.inventory = selectSeededItems(
      cityStock.map((entry) => entry.itemId),
      seed,
      `${trader.id}:${location.id}`,
      5,
    ).map((itemId, index) => ({
      itemId,
      quantity: 3 + ((hashValue(`${trader.id}:${itemId}`) + index) % 5),
    }));
  }
}

function spawnDailyVillagers(
  economy: EconomyState,
  seed: number,
  map: WorldMapDefinition,
): void {
  const cities = map.locations.filter((location) => location.type === "city");
  const villages = map.locations.filter((location) => location.type === "village");

  for (const village of villages) {
    if (cities.length === 0) continue;

    const city = nearestLocation(village, cities);
    const productionItemId = getLocationResource(seed, village.id, map);
    for (
      let index = 0;
      index < MAX_DAILY_VILLAGER_DEPARTURES_PER_VILLAGE;
      index += 1
    ) {
      const serial = economy.villagerSerial;
      economy.villagerSerial += 1;
      economy.villagers.push({
        id: `villager_${village.id}_${serial}`,
        kind: "villager",
        x: village.x,
        y: village.y,
        originId: village.id,
        destinationId: city.id,
        homeLocationId: village.id,
        progress: 0,
        waitHoursRemaining: VILLAGER_SETTLEMENT_DWELL_HOURS,
        speed: 175 + (hashValue(`${seed}:villager:${serial}`) % 30),
        leaderCardId: "village_levy",
        leaderLevel: 1,
        unitIds: ["village_slinger"],
        inventory: [
          { itemId: productionItemId, quantity: 6 + (serial % 5) },
          { itemId: "bread", quantity: 2 + (serial % 2) },
        ],
      });
    }
  }
}

function inferVillagerHomeLocationId(
  villager: CaravanState,
  map: WorldMapDefinition,
): string {
  const origin = map.locations.find(
    (location) => location.id === villager.originId,
  );
  if (origin?.type === "village") return origin.id;
  const destination = map.locations.find(
    (location) => location.id === villager.destinationId,
  );
  if (destination?.type === "village") return destination.id;
  return villager.originId;
}

function calculateBuyPrice(
  itemId: string,
  currentStock: number,
  baseMultiplier: number,
): number {
  const item = itemsById.get(itemId)!;
  const scarcityMultiplier = 1 + Math.max(0, 4 - currentStock) * 0.09;
  return Math.max(1, Math.ceil(item.baseValue * baseMultiplier * scarcityMultiplier));
}

function getLocationResource(
  seed: number,
  locationId: string,
  map?: WorldMapDefinition,
): string {
  const location = map?.locations.find((candidate) => candidate.id === locationId);
  if (location?.type === "village" && map) {
    return getBalancedVillageResource(seed, location, map);
  }
  const resources = location
    ? getRegionalResourcePool(map, location)
    : RESOURCE_IDS;
  return resources[hashValue(`${seed}:${locationId}`) % resources.length];
}

function getCityDemand(
  seed: number,
  locationId: string,
  map?: WorldMapDefinition,
): string {
  const location = map?.locations.find((candidate) => candidate.id === locationId);
  const localResources = location
    ? new Set(getCitySupplyPool(seed, map, location))
    : new Set<string>();
  const importedResources = RESOURCE_IDS.filter(
    (itemId) => !localResources.has(itemId),
  );
  const candidates = importedResources.length > 0 ? importedResources : RESOURCE_IDS;
  return candidates[
    hashValue(`${seed}:${locationId}:demand`) % candidates.length
  ];
}

function getBalancedVillageResource(
  seed: number,
  village: MapLocation,
  map: WorldMapDefinition,
): string {
  const cities = map.locations.filter((location) => location.type === "city");
  const city = nearestLocation(village, cities);
  const cluster = map.locations
    .filter(
      (location) =>
        location.type === "village" &&
        nearestLocation(location, cities).id === city.id,
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  const clusterIndex = Math.max(
    0,
    cluster.findIndex((location) => location.id === village.id),
  );
  if (clusterIndex === 0) return "wheat";
  if (clusterIndex === 1) {
    const livestock = ["cattle", "sheep", "pigs", "milk"];
    return livestock[hashValue(`${seed}:${city.id}:livestock`) % livestock.length];
  }

  const reserved = new Set(["wheat", "cattle", "sheep", "pigs", "milk"]);
  const regional = getRegionalResourcePool(map, village).filter(
    (itemId) => !reserved.has(itemId),
  );
  const fallback = ["wood", "stone", "clay", "herbs", "grapes", "fish"];
  const candidates = regional.length > 0 ? regional : fallback;
  return candidates[
    hashValue(`${seed}:${city.id}:village:${clusterIndex}`) % candidates.length
  ];
}

function getCitySupplyPool(
  seed: number,
  map: WorldMapDefinition | undefined,
  city: MapLocation,
): string[] {
  if (!map || city.type !== "city") {
    return getRegionalResourcePool(map, city);
  }
  const cities = map.locations.filter((location) => location.type === "city");
  const suppliedResources = map.locations
    .filter(
      (location) =>
        location.type === "village" &&
        nearestLocation(location, cities).id === city.id,
    )
    .map((village) => getBalancedVillageResource(seed, village, map));
  return [...new Set([...suppliedResources, ...getRegionalResourcePool(map, city)])];
}

function getRegionalResourcePool(
  map: WorldMapDefinition | undefined,
  location: MapLocation,
): string[] {
  if (!map) return RESOURCE_IDS;
  const terrain = getRegionalTerrain(map, location);
  if (terrain === "mountain") {
    return ["stone", "iron", "coal", "copper", "silver", "gold_ore"];
  }
  if (terrain === "forest") {
    return ["wood", "herbs", "pigs", "meat", "leather"];
  }
  if (terrain === "swamp") {
    return ["clay", "herbs", "pigs", "fish"];
  }
  if (terrain === "desert") {
    return ["sheep", "cattle", "leather", "clay", "copper"];
  }
  if (terrain === "lake" || terrain === "river" || terrain === "sea") {
    return ["fish", "clay", "milk", "sheep"];
  }
  return ["wheat", "grapes", "sheep", "cattle", "pigs", "milk"];
}

function getRegionalTerrain(
  map: WorldMapDefinition,
  location: MapLocation,
): TerrainType {
  const directTerrain = getTerrainAt(map, location.x, location.y);
  if (directTerrain !== "plains" && directTerrain !== "road") {
    return directTerrain;
  }

  let nearestTerrain: TerrainType = "plains";
  let nearestDistance = Math.min(
    location.x - map.boundaryInset,
    location.y - map.boundaryInset,
    map.width - map.boundaryInset - location.x,
    map.height - map.boundaryInset - location.y,
  );
  if (nearestDistance <= 720) nearestTerrain = "sea";

  for (const zone of map.terrainZones) {
    const distance = Math.max(
      0,
      Math.hypot(zone.x - location.x, zone.y - location.y) -
        Math.max(zone.radiusX, zone.radiusY),
    );
    if (distance < nearestDistance && distance <= 900) {
      nearestDistance = distance;
      nearestTerrain = zone.type;
    }
  }

  for (const river of map.terrainRivers) {
    for (let index = 0; index < river.points.length - 1; index += 1) {
      const point = river.points[index];
      const nextPoint = river.points[index + 1];
      const distance = distanceToSegment(
        location.x,
        location.y,
        point.x,
        point.y,
        nextPoint.x,
        nextPoint.y,
      );
      if (distance < nearestDistance && distance <= 620) {
        nearestDistance = distance;
        nearestTerrain = "river";
      }
    }
  }

  return nearestTerrain;
}

function getSecondaryVillageProduct(productionItemId: string): string {
  const products: Record<string, string> = {
    wheat: "flour",
    grapes: "wine",
    sheep: "wool",
    cattle: "milk",
    pigs: "meat",
    milk: "cheese",
    clay: "pottery",
    fish: "meat",
    herbs: "healing_poultice",
  };
  return products[productionItemId] ?? "bread";
}

function selectSeededItems(
  itemIds: string[],
  seed: number,
  salt: string,
  count: number,
): string[] {
  return [...itemIds]
    .sort(
      (left, right) =>
        hashValue(`${seed}:${salt}:${left}`) -
        hashValue(`${seed}:${salt}:${right}`),
    )
    .slice(0, Math.min(count, itemIds.length));
}

function normalizeStacks(stacks: InventoryStack[]): InventoryStack[] {
  const migrations: Record<string, string> = {
    iron_ore: "iron",
    moon_herbs: "herbs",
    beast_hide: "leather",
    darkwood: "wood",
    steel_ingot: "iron",
    herbal_remedy: "healing_poultice",
    cured_leather: "leather",
    carved_lumber: "wood",
  };
  const normalized: InventoryStack[] = [];
  for (const stack of stacks) {
    const itemId = migrations[stack.itemId] ?? stack.itemId;
    if (stack.quantity > 0 && itemsById.has(itemId)) {
      addToInventory(normalized, itemId, stack.quantity, stack.supply);
    }
  }
  return normalized;
}

function getRoutePoints(
  map: WorldMapDefinition,
  originId: string,
  destinationId: string,
): Array<{ x: number; y: number }> {
  const origin = map.locations.find((location) => location.id === originId)!;
  const destination = map.locations.find(
    (location) => location.id === destinationId,
  )!;
  const village =
    origin.type === "village"
      ? origin
      : destination.type === "village"
        ? destination
        : null;
  const city =
    origin.type === "city"
      ? origin
      : destination.type === "city"
        ? destination
        : null;
  if (village && city) {
    const villageToCity = getVillageCityRoutePoints(map, village, city);
    return origin.id === village.id
      ? villageToCity
      : [...villageToCity].reverse();
  }

  const road = map.terrainRoads.find(
    (candidate) =>
      (candidate.originId === originId &&
        candidate.destinationId === destinationId) ||
      (candidate.originId === destinationId &&
        candidate.destinationId === originId),
  );
  if (road) {
    return road.originId === originId ? road.points : [...road.points].reverse();
  }
  return [
    { x: origin.x, y: origin.y },
    { x: destination.x, y: destination.y },
  ];
}

function getVillageCityRoutePoints(
  map: WorldMapDefinition,
  village: MapLocation,
  city: MapLocation,
): Array<{ x: number; y: number }> {
  const villageRoad = map.terrainRoads.find(
    (road) =>
      (road.originId === village.id && road.destinationId === city.id) ||
      (road.originId === city.id && road.destinationId === village.id),
  );
  if (!villageRoad || villageRoad.points.length < 2) {
    return [
      { x: village.x, y: village.y },
      { x: city.x, y: city.y },
    ];
  }

  const firstDistance = Math.hypot(
    villageRoad.points[0].x - village.x,
    villageRoad.points[0].y - village.y,
  );
  const lastVillagePoint = villageRoad.points[villageRoad.points.length - 1];
  const lastDistance = Math.hypot(
    lastVillagePoint.x - village.x,
    lastVillagePoint.y - village.y,
  );
  const spurPoints =
    firstDistance <= lastDistance
      ? villageRoad.points
      : [...villageRoad.points].reverse();
  const junction = spurPoints[spurPoints.length - 1];
  if (Math.hypot(junction.x - city.x, junction.y - city.y) <= 180) {
    return appendDistinctPoints(spurPoints, [{ x: city.x, y: city.y }]);
  }

  let bestContinuation:
    | {
        points: Array<{ x: number; y: number }>;
        segmentIndex: number;
        projection: { x: number; y: number };
        distance: number;
      }
    | undefined;

  for (const road of map.terrainRoads) {
    if (road === villageRoad || road.points.length < 2) continue;
    const first = road.points[0];
    const last = road.points[road.points.length - 1];
    const reachesCity =
      road.originId === city.id ||
      road.destinationId === city.id ||
      Math.min(
        Math.hypot(first.x - city.x, first.y - city.y),
        Math.hypot(last.x - city.x, last.y - city.y),
      ) <= 180;
    if (!reachesCity) continue;

    const points =
      Math.hypot(last.x - city.x, last.y - city.y) <=
      Math.hypot(first.x - city.x, first.y - city.y)
        ? road.points
        : [...road.points].reverse();
    for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex += 1) {
      const projection = projectPointToSegment(
        junction,
        points[segmentIndex],
        points[segmentIndex + 1],
      );
      const distance = Math.hypot(
        projection.x - junction.x,
        projection.y - junction.y,
      );
      if (!bestContinuation || distance < bestContinuation.distance) {
        bestContinuation = {
          points,
          segmentIndex,
          projection,
          distance,
        };
      }
    }
  }

  if (!bestContinuation || bestContinuation.distance > 200) {
    return appendDistinctPoints(spurPoints, [{ x: city.x, y: city.y }]);
  }
  return appendDistinctPoints(
    spurPoints,
    [
      bestContinuation.projection,
      ...bestContinuation.points.slice(bestContinuation.segmentIndex + 1),
      { x: city.x, y: city.y },
    ],
  );
}

function appendDistinctPoints(
  base: Array<{ x: number; y: number }>,
  additions: Array<{ x: number; y: number }>,
): Array<{ x: number; y: number }> {
  const result = [...base];
  for (const point of additions) {
    const previous = result[result.length - 1];
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 1) {
      result.push(point);
    }
  }
  return result;
}

function projectPointToSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
): { x: number; y: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return { ...start };
  const position = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    ),
  );
  return {
    x: start.x + dx * position,
    y: start.y + dy * position,
  };
}

function getRouteLength(
  map: WorldMapDefinition,
  originId: string,
  destinationId: string,
): number {
  const points = getRoutePoints(map, originId, destinationId);
  return Math.max(
    1,
    points.slice(0, -1).reduce((total, point, index) => {
      const nextPoint = points[index + 1];
      return total + Math.hypot(nextPoint.x - point.x, nextPoint.y - point.y);
    }, 0),
  );
}

function getRoutePosition(
  map: WorldMapDefinition,
  originId: string,
  destinationId: string,
  progress: number,
): { x: number; y: number } {
  const points = getRoutePoints(map, originId, destinationId);
  const routeLength = getRouteLength(map, originId, destinationId);
  let remainingDistance = Math.max(0, Math.min(1, progress)) * routeLength;

  for (let index = 0; index < points.length - 1; index += 1) {
    const point = points[index];
    const nextPoint = points[index + 1];
    const segmentLength = Math.hypot(
      nextPoint.x - point.x,
      nextPoint.y - point.y,
    );
    if (remainingDistance <= segmentLength || index === points.length - 2) {
      const segmentProgress =
        segmentLength === 0 ? 0 : remainingDistance / segmentLength;
      return {
        x: point.x + (nextPoint.x - point.x) * segmentProgress,
        y: point.y + (nextPoint.y - point.y) * segmentProgress,
      };
    }
    remainingDistance -= segmentLength;
  }

  return points[points.length - 1];
}

function nearestLocation(origin: MapLocation, candidates: MapLocation[]): MapLocation {
  return candidates.reduce((nearest, candidate) =>
    Math.hypot(candidate.x - origin.x, candidate.y - origin.y) <
    Math.hypot(nearest.x - origin.x, nearest.y - origin.y)
      ? candidate
      : nearest,
  );
}

function hashValue(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
