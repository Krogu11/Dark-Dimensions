import { describe, expect, it } from "vitest";
import { contentPack } from "../../content/content";
import { generateWorldMap } from "./WorldGenerator";
import { WorldSimulation } from "./WorldSimulation";

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
});
