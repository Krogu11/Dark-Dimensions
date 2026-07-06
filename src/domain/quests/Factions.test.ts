import { describe, expect, it } from "vitest";
import { contentPack } from "../../content/content";
import { createEconomyState } from "../economy/Economy";
import { generateWorldMap } from "../world/WorldGenerator";
import { createFactionState } from "./Factions";

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
});
