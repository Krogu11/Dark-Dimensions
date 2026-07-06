import { describe, expect, it } from "vitest";
import { contentPack } from "../../content/content";
import { generateWorldMap } from "../world/WorldGenerator";
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

    const firstCityMarket = createMarketProfile(424242, city);
    const secondCityMarket = createMarketProfile(424242, city);
    const villageMarket = createMarketProfile(424242, village);

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
    }
    for (const caravan of economy.caravans) {
      expect(locationsById.get(caravan.originId)?.type).toBe("city");
      expect(locationsById.get(caravan.destinationId)?.type).toBe("city");
    }
  });
});
