import { contentPack, itemsById } from "../../content/content";
import type { MapLocation, WorldMapDefinition } from "../content/schemas";

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
  progress: number;
  speed: number;
  inventory: InventoryStack[];
}

export interface EconomyState {
  markets: Record<string, InventoryStack[]>;
  caravans: CaravanState[];
  villagers: CaravanState[];
  restockHours: number;
}

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

export function createEconomyState(
  seed: number,
  map: WorldMapDefinition,
): EconomyState {
  const markets: Record<string, InventoryStack[]> = {};
  const settlements = map.locations.filter(
    (location) => location.type === "city" || location.type === "village",
  );
  for (const location of settlements) {
    markets[location.id] = createInitialStock(seed, location);
  }

  const cities = settlements.filter((location) => location.type === "city");
  const villages = settlements.filter((location) => location.type === "village");
  const caravans = cities.flatMap((city, cityIndex) => {
    return [1, 2].map((offset) => {
      const destination = cities[(cityIndex + offset) % cities.length];
      const index = cityIndex * 2 + offset - 1;
      const progress = (index * 0.17) % 0.82;
      return {
        id: `caravan_${index}`,
        kind: "caravan" as const,
        x: city.x + (destination.x - city.x) * progress,
        y: city.y + (destination.y - city.y) * progress,
        originId: city.id,
        destinationId: destination.id,
        progress,
        speed: 55 + (hashValue(`${seed}:caravan:${index}`) % 20),
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
    const productionItemId = getLocationResource(seed, village.id);
    const progress = (index * 0.11) % 0.76;
    return {
      id: `villager_${index}`,
      kind: "villager" as const,
      x: village.x + (city.x - village.x) * progress,
      y: village.y + (city.y - village.y) * progress,
      originId: village.id,
      destinationId: city.id,
      progress,
      speed: 36 + (hashValue(`${seed}:villager:${index}`) % 14),
      inventory: [
        { itemId: productionItemId, quantity: 6 + (index % 5) },
        { itemId: "bread", quantity: 2 + (index % 2) },
      ],
    };
  });

  return { markets, caravans, villagers, restockHours: 0 };
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
    caravans: hasCurrentRoutes
      ? state.caravans.map((caravan) => ({
          ...caravan,
          kind: "caravan" as const,
          inventory: normalizeStacks(caravan.inventory),
        }))
      : fresh.caravans,
    villagers: hasCurrentRoutes
      ? legacyState.villagers!.map((villager) => ({
          ...villager,
          kind: "villager" as const,
          inventory: normalizeStacks(villager.inventory),
        }))
      : fresh.villagers,
    restockHours:
      typeof state.restockHours === "number"
        ? state.restockHours
        : (legacyState.restockSeconds ?? 0) / 3600,
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

  for (const trader of [...state.caravans, ...state.villagers]) {
    const origin = map.locations.find((location) => location.id === trader.originId);
    const destination = map.locations.find(
      (location) => location.id === trader.destinationId,
    );
    if (!origin || !destination) continue;
    const distance = Math.max(1, Math.hypot(destination.x - origin.x, destination.y - origin.y));
    trader.progress += (trader.speed * deltaHours) / distance;
    if (trader.progress >= 1) {
      trader.progress = 0;
      trader.originId = destination.id;
      trader.destinationId = origin.id;
      serviceTraderAtSettlement(state, trader, destination, seed);
    }
    const nextOrigin = map.locations.find(
      (location) => location.id === trader.originId,
    )!;
    const nextDestination = map.locations.find(
      (location) => location.id === trader.destinationId,
    )!;
    trader.x =
      nextOrigin.x + (nextDestination.x - nextOrigin.x) * trader.progress;
    trader.y =
      nextOrigin.y + (nextDestination.y - nextOrigin.y) * trader.progress;
  }
}

export function createMarketProfile(
  seed: number,
  location: MapLocation,
  economy?: EconomyState,
): MarketProfile | null {
  if (location.type !== "city" && location.type !== "village") return null;
  const locationHash = hashValue(`${seed}:${location.id}`);
  const resourceId = getLocationResource(seed, location.id);
  const stock = economy?.markets[location.id] ?? createInitialStock(seed, location);

  if (location.type === "village") {
    return {
      sourceId: location.id,
      locationId: location.id,
      locationType: "village",
      productionItemId: resourceId,
      demandItemId: null,
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
  return {
    sourceId: location.id,
    locationId: location.id,
    locationType: "city",
    productionItemId: primaryRecipe?.outputItemId ?? resourceId,
    demandItemId: getCityDemand(seed, location.id),
    offers: stock.map((entry, index) => ({
      itemId: entry.itemId,
      stock: entry.quantity,
      buyPrice: calculateBuyPrice(
        entry.itemId,
        entry.quantity,
        1.08 + ((locationHash >>> (index + 2)) % 18) / 100,
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
  const demandMultiplier = profile.demandItemId === itemId ? 1.45 : 1;
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

function createInitialStock(seed: number, location: MapLocation): InventoryStack[] {
  const locationHash = hashValue(`${seed}:${location.id}:stock`);
  if (location.type === "village") {
    const productionItemId = getLocationResource(seed, location.id);
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
    RESOURCE_IDS,
    seed,
    `imports:${location.id}`,
    5,
  );
  return [...CITY_STOCK_IDS, ...importedResources].map((itemId, index) => ({
    itemId,
    quantity:
      itemsById.get(itemId)?.type === "equipment"
        ? 1 + ((locationHash >>> 4) % 2)
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
      addToInventory(stock, getLocationResource(seed, location.id), 1);
      addToInventory(stock, "travel_rations", 1);
      addToInventory(stock, "bread", 1);
    } else if (location.type === "city") {
      addToInventory(stock, "travel_rations", 2);
      addToInventory(stock, "bread", 2);
      addToInventory(stock, "flour", 1);
      addToInventory(stock, "healing_poultice", 1);
    }
  }
}

function serviceTraderAtSettlement(
  economy: EconomyState,
  trader: CaravanState,
  location: MapLocation,
  seed: number,
): void {
  if (trader.kind === "villager" && location.type === "city") {
    const cityStock = economy.markets[location.id];
    for (const cargo of trader.inventory) {
      addToInventory(cityStock, cargo.itemId, Math.max(1, Math.floor(cargo.quantity / 2)));
    }
  } else if (trader.kind === "villager" && location.type === "village") {
    const resourceId = getLocationResource(seed, location.id);
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

function calculateBuyPrice(
  itemId: string,
  currentStock: number,
  baseMultiplier: number,
): number {
  const item = itemsById.get(itemId)!;
  const scarcityMultiplier = 1 + Math.max(0, 4 - currentStock) * 0.09;
  return Math.max(1, Math.ceil(item.baseValue * baseMultiplier * scarcityMultiplier));
}

function getLocationResource(seed: number, locationId: string): string {
  return RESOURCE_IDS[hashValue(`${seed}:${locationId}`) % RESOURCE_IDS.length];
}

function getCityDemand(seed: number, locationId: string): string {
  return RESOURCE_IDS[
    hashValue(`${seed}:${locationId}:demand`) % RESOURCE_IDS.length
  ];
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
