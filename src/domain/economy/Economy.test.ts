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
      expect(isPositionOnRoad(world, caravan.x, caravan.y, 8)).toBe(true);
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
