import { afterEach, describe, expect, it, vi } from "vitest";
import { enemiesById } from "../../content/content";
import {
  createCardInstances,
  createPlayerCard,
} from "../cards/CardInstance";
import { BattleSimulation } from "./BattleSimulation";

describe("BattleSimulation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("uses one of three actions for a normal summon", () => {
    const enemy = enemiesById.get("kobold_foragers")!;
    const battle = new BattleSimulation(
      createCardInstances(["kobold_jung", "kobold_speer"]),
      enemy,
      createPlayerCard(),
    );

    expect(battle.summon(battle.hand[0].uid)).toBe(true);
    expect(battle.summonsRemaining).toBe(2);
    expect(battle.playerField).toHaveLength(2);
  });

  it("returns a summoned monster to hand for one action", () => {
    const enemy = enemiesById.get("kobold_foragers")!;
    const battle = new BattleSimulation(
      createCardInstances(["village_levy"]),
      enemy,
      createPlayerCard(),
    );
    const recruit = battle.hand[0];
    battle.summon(recruit.uid);

    expect(battle.recall(recruit.uid)).toBe(true);
    expect(battle.playerField).toHaveLength(1);
    expect(battle.hand).toContain(recruit);
    expect(battle.summonsRemaining).toBe(1);
  });

  it("resolves both warbands' attacks simultaneously", () => {
    const enemy = enemiesById.get("road_reavers")!;
    const hero = createPlayerCard();
    const battle = new BattleSimulation([], enemy, hero);
    const doomedEnemy = battle.enemyField[0];
    doomedEnemy.currentHp = 1;
    const heroHpBefore = hero.currentHp;

    battle.resolveRound();

    expect(battle.enemyField).not.toContain(doomedEnemy);
    expect(hero.currentHp).toBeLessThan(heroHpBefore);
  });

  it("persists combat damage on deployed player cards", () => {
    const deck = createCardInstances(["wache"]);
    const enemy = enemiesById.get("road_reavers")!;
    const battle = new BattleSimulation(deck, enemy, createPlayerCard());
    const guard = battle.hand[0];
    const hpBeforeCombat = guard.currentHp;
    battle.summon(guard.uid);

    battle.resolveRound();

    expect(guard.currentHp).toBeLessThan(hpBeforeCombat);
  });

  it("uses DEF as passive damage reduction", () => {
    const enemy = enemiesById.get("road_reavers")!;
    const lowDefense = createCardInstances(["village_levy"])[0];
    const highDefense = createCardInstances(["wache"])[0];
    const lowDefenseBattle = new BattleSimulation(
      [lowDefense],
      enemy,
      createPlayerCard(),
    );
    const highDefenseBattle = new BattleSimulation(
      [highDefense],
      enemy,
      createPlayerCard(),
    );
    lowDefenseBattle.summon(lowDefense.uid);
    highDefenseBattle.summon(highDefense.uid);

    lowDefenseBattle.resolveRound();
    highDefenseBattle.resolveRound();

    const lowDefenseDamage = 900 - lowDefense.currentHp;
    const highDefenseDamage = 1850 - highDefense.currentHp;
    expect(highDefenseDamage).toBeLessThan(lowDefenseDamage);
  });

  it("automatically fills the enemy formation before resolving a round", () => {
    const enemy = enemiesById.get("kobold_foragers")!;
    const battle = new BattleSimulation([], enemy, createPlayerCard());

    expect(battle.enemyField).toHaveLength(2);
    battle.resolveRound();

    expect(battle.enemyField.length).toBeGreaterThanOrEqual(2);
    expect(
      battle.enemyField.length + battle.enemyHand.length + battle.enemyDrawPile.length,
    ).toBeLessThanOrEqual(enemy.deck.length);
  });

  it("rolls precise item tables independently from captured cards", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const enemy = enemiesById.get("road_reavers")!;
    const battle = new BattleSimulation([], enemy, createPlayerCard());

    const reward = battle.rollReward();

    expect(reward.cardId).toBe("ork_rekrut");
    expect(reward.items).toEqual([
      { itemId: "iron", quantity: 1 },
      { itemId: "healing_poultice", quantity: 1 },
    ]);
  });
});
