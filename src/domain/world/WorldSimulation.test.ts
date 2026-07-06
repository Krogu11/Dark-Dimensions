import { describe, expect, it } from "vitest";
import { contentPack } from "../../content/content";
import { generateWorldMap } from "./WorldGenerator";
import { WorldSimulation } from "./WorldSimulation";
import {
  getTerrainAt,
  isWorldPositionTraversable,
} from "./WorldTerrain";

describe("WorldSimulation patrol behavior", () => {
  it("makes clearly weaker patrols flee from the player", () => {
    const world = generateWorldMap(313131, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    simulation.state.nearbyLocationId = null;
    const enemy = simulation.state.enemies[0];
    enemy.threat = 1;
    enemy.x = simulation.state.x + 120;
    enemy.y = simulation.state.y;
    const distanceBefore = Math.hypot(
      simulation.state.x - enemy.x,
      simulation.state.y - enemy.y,
    );

    simulation.updateEnemies(0.25, 4);

    expect(
      Math.hypot(
        simulation.state.x - enemy.x,
        simulation.state.y - enemy.y,
      ),
    ).toBeGreaterThan(distanceBefore);
  });

  it("lets comparable patrols pursue the player", () => {
    const world = generateWorldMap(414141, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    simulation.state.nearbyLocationId = null;
    const enemy = simulation.state.enemies[0];
    enemy.threat = 2;
    enemy.x = simulation.state.x + 180;
    enemy.y = simulation.state.y;
    const distanceBefore = Math.hypot(
      simulation.state.x - enemy.x,
      simulation.state.y - enemy.y,
    );

    simulation.updateEnemies(0.2, 2);

    expect(
      Math.hypot(
        simulation.state.x - enemy.x,
        simulation.state.y - enemy.y,
      ),
    ).toBeLessThan(distanceBefore);
  });

  it("keeps fleeing patrols inside the playable world", () => {
    const world = generateWorldMap(515151, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    simulation.state.nearbyLocationId = null;
    simulation.state.x = world.boundaryInset + 90;
    simulation.state.y = world.height / 2;
    const enemy = simulation.state.enemies[0];
    enemy.threat = 1;
    enemy.x = world.boundaryInset + 42;
    enemy.y = simulation.state.y;

    for (let update = 0; update < 30; update += 1) {
      simulation.updateEnemies(0.25, 5);
    }

    expect(isWorldPositionTraversable(world, enemy.x, enemy.y, 24)).toBe(true);
    expect(enemy.x).toBeGreaterThanOrEqual(world.boundaryInset + 24);
  });

  it("prevents the player from entering mountains and lakes", () => {
    const world = generateWorldMap(616161, contentPack.enemies);
    const simulation = new WorldSimulation(world);
    const blockedZone = world.terrainZones.find(
      (zone) => zone.type === "mountain" || zone.type === "lake",
    )!;
    simulation.state.x = blockedZone.x - blockedZone.radiusX - 34;
    simulation.state.y = blockedZone.y;

    for (let update = 0; update < 20; update += 1) {
      simulation.move(1, 0, 0.1, 200);
    }

    expect(getTerrainAt(world, simulation.state.x, simulation.state.y)).not.toBe(
      blockedZone.type,
    );
    expect(
      isWorldPositionTraversable(
        world,
        simulation.state.x,
        simulation.state.y,
        30,
      ),
    ).toBe(true);
  });
});
