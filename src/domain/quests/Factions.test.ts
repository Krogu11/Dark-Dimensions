import { describe, expect, it } from "vitest";
import { contentPack } from "../../content/content";
import { createEconomyState } from "../economy/Economy";
import { generateWorldMap } from "../world/WorldGenerator";
import { createFactionState, FACTION_IDS, FACTION_PROFILES } from "./Factions";

describe("procedural factions and quests", () => {
  it("recreates ownership and contracts from the same seed", () => {
    const world = generateWorldMap(551122, contentPack.enemies);
    const economy = createEconomyState(551122, world);

    const first = createFactionState(551122, world, economy, contentPack.enemies);
    const second = createFactionState(551122, world, economy, contentPack.enemies);

    expect(second).toEqual(first);
    expect(first.quests.some((quest) => quest.type === "delivery")).toBe(true);
    expect(first.quests.some((quest) => quest.type === "bounty")).toBe(true);
    expect(first.quests.some((quest) => quest.type === "escort")).toBe(true);
  });

  it("creates a delivery, bounty and escort contract for each city", () => {
    const world = generateWorldMap(112244, contentPack.enemies);
    const economy = createEconomyState(112244, world);
    const factions = createFactionState(112244, world, economy, contentPack.enemies);
    const cities = world.locations.filter((location) => location.type === "city");

    for (const city of cities) {
      const cityQuests = factions.quests.filter(
        (quest) => quest.issuerLocationId === city.id,
      );
      expect(cityQuests.map((quest) => quest.type).sort()).toEqual([
        "bounty",
        "delivery",
        "escort",
      ]);
      expect(
        cityQuests.find((quest) => quest.type === "delivery")?.targetLocationId,
      ).toBe(city.id);
    }
  });

  it("assigns every generated settlement to a faction", () => {
    const world = generateWorldMap(776655, contentPack.enemies);
    const economy = createEconomyState(776655, world);
    const factions = createFactionState(776655, world, economy, contentPack.enemies);
    const settlements = world.locations.filter((location) =>
      ["city", "village", "castle"].includes(location.type),
    );

    for (const settlement of settlements) {
      expect(factions.locationFactions[settlement.id]).toBeDefined();
    }
  });

  it("provides a sovereign identity and lore for every faction", () => {
    for (const factionId of FACTION_IDS) {
      expect(FACTION_PROFILES[factionId]).toMatchObject({ id: factionId });
      expect(FACTION_PROFILES[factionId].rulerName.length).toBeGreaterThan(3);
      expect(FACTION_PROFILES[factionId].rulerTitle).toContain("King");
      expect(FACTION_PROFILES[factionId].lore.length).toBeGreaterThan(100);
    }
  });
});
