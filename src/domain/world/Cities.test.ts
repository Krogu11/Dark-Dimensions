import { describe, expect, it } from "vitest";
import { generateWorldMap } from "./WorldGenerator";
import { createCityStates, normalizeCityStates } from "./Cities";
import { contentPack } from "../../content/content";

describe("procedural cities", () => {
  it("creates deterministic unique city names for each world", () => {
    const first = generateWorldMap(424242, contentPack.enemies);
    const second = generateWorldMap(424242, contentPack.enemies);
    const firstNames = first.locations.filter((location) => location.type === "city").map((location) => location.nameKey);
    const secondNames = second.locations.filter((location) => location.type === "city").map((location) => location.nameKey);

    expect(firstNames).toEqual(secondNames);
    expect(new Set(firstNames).size).toBe(firstNames.length);
    expect(firstNames.every((name) => !name.startsWith("generatedLocation.name."))).toBe(true);
  });

  it("creates bounded city values and preserves later mutations", () => {
    const map = generateWorldMap(515151, contentPack.enemies);
    const states = createCityStates(515151, map);
    const first = Object.values(states)[0];

    expect(first.population).toBeGreaterThanOrEqual(1_500);
    expect(first.garrison).toBeGreaterThanOrEqual(90);
    expect(first.prosperity).toBeGreaterThanOrEqual(0);
    expect(first.prosperity).toBeLessThanOrEqual(100);
    first.prosperity = 7;

    expect(normalizeCityStates(states, 515151, map)[first.locationId].prosperity).toBe(7);
  });
});
