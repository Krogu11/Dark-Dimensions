import { describe, expect, it } from "vitest";
import { contentPack } from "../../content/content";
import { generateWorldMap } from "../world/WorldGenerator";
import {
  isPositionOnRoad,
  isWorldPositionTraversable,
} from "../world/WorldTerrain";
import {
  createEconomyState,
  createMarketProfile,
  getMarketSellPrice,
  updateEconomyState,
} from "./Economy";

describe("procedural markets", () => {
  it("creates deterministic but location-specific village and city economies", () => {
    const world = generateWorldMap(424242, contentPack.enemies);
    const city = world.locations.find((location) => location.type === "city")!;
    const village = world.locations.find((location) => location.type === "village")!;

    const firstCityMarket = createMarketProfile(424242, city, undefined, world);
    const secondCityMarket = createMarketProfile(424242, city, undefined, world);
    const villageMarket = createMarketProfile(424242, village, undefined, world);

    expect(secondCityMarket).toEqual(firstCityMarket);
    expect(firstCityMarket?.locationType).toBe("city");
    expect(firstCityMarket?.recipeIds).toHaveLength(4);
    expect(firstCityMarket!.offers.length).toBeGreaterThan(12);
    expect(villageMarket?.locationType).toBe("village");
    expect(villageMarket?.offers).toHaveLength(4);
    expect(
      villageMarket?.offers.some((offer) => offer.itemId === "travel_rations"),
    ).toBe(true);
  });

  it("pays a premium for a city's demanded raw material", () => {
    const world = generateWorldMap(987654, contentPack.enemies);
    const city = world.locations.find((location) => location.type === "city")!;
    const market = createMarketProfile(987654, city)!;
    const demandedPrice = getMarketSellPrice(
      987654,
      city,
      market.demandItemId!,
    );
    const otherResource = contentPack.items.find(
      (item) =>
        item.type === "resource" &&
        item.id !== market.demandItemId &&
        item.baseValue ===
          contentPack.items.find((candidate) => candidate.id === market.demandItemId)!
            .baseValue,
    );

    expect(demandedPrice).toBeGreaterThan(0);
    if (otherResource) {
      expect(demandedPrice).toBeGreaterThan(
        getMarketSellPrice(987654, city, otherResource.id),
      );
    }
  });

  it("moves caravans between settlements and replenishes markets over time", () => {
    const world = generateWorldMap(123123, contentPack.enemies);
    const economy = createEconomyState(123123, world);
    const caravan = economy.caravans[0];
    const startX = caravan.x;
    const village = world.locations.find((location) => location.type === "village")!;
    const villageStock = economy.markets[village.id][0].quantity;

    updateEconomyState(economy, 123123, world, 20);

    expect(caravan.x).not.toBe(startX);
    expect(economy.markets[village.id][0].quantity).toBe(villageStock + 1);
  });

  it("moves fast-initiative NPC caravans farther than slow formations", () => {
    const world = generateWorldMap(123124, contentPack.enemies);
    const slowEconomy = createEconomyState(123124, world);
    const fastEconomy = structuredClone(slowEconomy);
    const slow = slowEconomy.caravans[0];
    const fast = fastEconomy.caravans[0];
    slow.progress = 0;
    fast.progress = 0;
    slow.waitHoursRemaining = 0;
    fast.waitHoursRemaining = 0;
    slow.leaderCardId = "cannon_golem";
    slow.unitIds = ["cannon_golem", "cannon_golem"];
    fast.leaderCardId = "dire_wolf";
    fast.unitIds = ["dire_wolf", "dire_wolf"];

    updateEconomyState(slowEconomy, 123124, world, 0.1);
    updateEconomyState(fastEconomy, 123124, world, 0.1);

    expect(fast.progress).toBeGreaterThan(slow.progress);
  });

  it("uses villagers for village routes and caravans only between cities", () => {
    const world = generateWorldMap(456456, contentPack.enemies);
    const economy = createEconomyState(456456, world);
    const locationsById = new Map(
      world.locations.map((location) => [location.id, location]),
    );
    const villages = world.locations.filter(
      (location) => location.type === "village",
    );

    expect(economy.villagers).toHaveLength(villages.length);
    for (const villager of economy.villagers) {
      expect(locationsById.get(villager.originId)?.type).toBe("village");
      expect(locationsById.get(villager.destinationId)?.type).toBe("city");
      expect(
        isWorldPositionTraversable(world, villager.x, villager.y, 8),
      ).toBe(true);
    }
    for (const caravan of economy.caravans) {
      expect(locationsById.get(caravan.originId)?.type).toBe("city");
      expect(locationsById.get(caravan.destinationId)?.type).toBe("city");
      expect(caravan.progress).toBe(0);
      expect(caravan.waitHoursRemaining).toBe(4);
      expect(isPositionOnRoad(world, caravan.x, caravan.y, 8)).toBe(true);
    }
  });

  it("keeps traders at settlements while they load and sell goods", () => {
    const world = generateWorldMap(456459, contentPack.enemies);
    const economy = createEconomyState(456459, world);
    const caravan = economy.caravans[0];
    const villager = economy.villagers[0];
    const caravanOrigin = world.locations.find(
      (location) => location.id === caravan.originId,
    )!;
    const villageOrigin = world.locations.find(
      (location) => location.id === villager.originId,
    )!;

    updateEconomyState(economy, 456459, world, 1);

    expect(caravan.progress).toBe(0);
    expect(caravan.waitHoursRemaining).toBe(3);
    expect(Math.hypot(caravan.x - caravanOrigin.x, caravan.y - caravanOrigin.y)).toBeLessThan(5);
    expect(villager.progress).toBe(0);
    expect(villager.waitHoursRemaining).toBe(1);
    expect(Math.hypot(villager.x - villageOrigin.x, villager.y - villageOrigin.y)).toBeLessThan(5);

    updateEconomyState(economy, 456459, world, 1.5);

    expect(caravan.progress).toBe(0);
    expect(caravan.waitHoursRemaining).toBe(1.5);
    expect(villager.progress).toBeGreaterThan(0);
  });

  it("takes villagers from their village road all the way into the destination city", () => {
    const world = generateWorldMap(456457, contentPack.enemies);
    const economy = createEconomyState(456457, world);
    const destinations = new Map(
      economy.villagers.map((villager) => [
        villager.id,
        world.locations.find(
          (location) => location.id === villager.destinationId,
        )!,
      ]),
    );
    for (const villager of economy.villagers) {
      villager.progress = 0.999;
      villager.waitHoursRemaining = 0;
    }

    updateEconomyState(economy, 456457, world, 1);

    for (const villager of economy.villagers) {
      const city = destinations.get(villager.id)!;
      expect(villager.originId).toBe(city.id);
      expect(villager.waitHoursRemaining).toBe(2);
      expect(Math.hypot(villager.x - city.x, villager.y - city.y)).toBeLessThan(5);
    }
  });

  it("limits daily villager departures to one group per village", () => {
    const world = generateWorldMap(456458, contentPack.enemies);
    const economy = createEconomyState(456458, world);
    const villages = world.locations.filter(
      (location) => location.type === "village",
    );
    let existingIds = new Set(economy.villagers.map((villager) => villager.id));

    updateEconomyState(economy, 456458, world, 24);
    for (const village of villages) {
      expect(
        economy.villagers.filter(
          (villager) =>
            !existingIds.has(villager.id) &&
            villager.homeLocationId === village.id,
        ),
      ).toHaveLength(1);
    }

    existingIds = new Set(economy.villagers.map((villager) => villager.id));
    updateEconomyState(economy, 456458, world, 24);
    for (const village of villages) {
      expect(
        economy.villagers.filter(
          (villager) =>
            !existingIds.has(villager.id) &&
            villager.homeLocationId === village.id,
        ),
      ).toHaveLength(1);
    }
  });

  it("gives every city food-producing and varied surrounding villages", () => {
    const world = generateWorldMap(818181, contentPack.enemies);
    const economy = createEconomyState(818181, world);
    const cities = world.locations.filter((location) => location.type === "city");
    const villages = world.locations.filter(
      (location) => location.type === "village",
    );

    for (const city of cities) {
      const cluster = villages.filter((village) => {
        const nearest = cities.reduce((current, candidate) =>
          Math.hypot(candidate.x - village.x, candidate.y - village.y) <
          Math.hypot(current.x - village.x, current.y - village.y)
            ? candidate
            : current,
        );
        return nearest.id === city.id;
      });
      const products = cluster.map(
        (village) =>
          createMarketProfile(818181, village, economy, world)!.productionItemId,
      );

      expect(products).toContain("wheat");
      expect(
        products.some((itemId) =>
          ["cattle", "sheep", "pigs", "milk"].includes(itemId),
        ),
      ).toBe(true);
      expect(new Set(products).size).toBeGreaterThanOrEqual(2);
    }
  });

  it("bases village production on the surrounding terrain", () => {
    const world = generateWorldMap(808080, contentPack.enemies);
    const cities = world.locations.filter((location) => location.type === "city");
    const villages = world.locations.filter(
      (location) => location.type === "village",
    );
    const village = villages.find((candidate) => {
      const city = cities.reduce((current, next) =>
        Math.hypot(next.x - candidate.x, next.y - candidate.y) <
        Math.hypot(current.x - candidate.x, current.y - candidate.y)
          ? next
          : current,
      );
      const cluster = villages
        .filter((entry) => {
          const nearest = cities.reduce((current, next) =>
            Math.hypot(next.x - entry.x, next.y - entry.y) <
            Math.hypot(current.x - entry.x, current.y - entry.y)
              ? next
              : current,
          );
          return nearest.id === city.id;
        })
        .sort((left, right) => left.id.localeCompare(right.id));
      return cluster.findIndex((entry) => entry.id === candidate.id) >= 2;
    })!;
    world.terrainZones.splice(0, world.terrainZones.length, {
      id: "test_forest",
      type: "forest",
      x: village.x,
      y: village.y,
      radiusX: 420,
      radiusY: 320,
    });
    world.terrainCells.push({
      x: village.x - 80,
      y: village.y - 80,
      size: 180,
      type: "forest",
    });
    const economy = createEconomyState(808080, world);
    const market = createMarketProfile(808080, village, economy, world)!;

    expect(["wood", "herbs", "pigs", "meat", "leather"]).toContain(
      market.productionItemId,
    );
  });
});
