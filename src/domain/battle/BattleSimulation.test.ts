import { afterEach, describe, expect, it, vi } from "vitest";
import { enemiesById } from "../../content/content";
import {
  createCardInstances,
  createPlayerCard,
  getCardDefinition,
} from "../cards/CardInstance";
import type { EnemyArchetype } from "../content/schemas";
import { BattleSimulation } from "./BattleSimulation";

function createEnemy(deck: string[]): EnemyArchetype {
  return {
    id: "test_enemy",
    nameKey: "enemy.test.name",
    deck,
    goldReward: 0,
    threat: 1,
    dropTable: [],
    itemDropTable: [],
  };
}

describe("BattleSimulation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("randomizes the player's starting hand from the whole warband", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const cardIds = [
      "village_levy",
      "wache",
      "riesenbat",
      "ork_rekrut",
      "kobold_jung",
      "kobold_speer",
    ];

    const battle = new BattleSimulation(
      createCardInstances(cardIds),
      createEnemy(["village_levy"]),
      createPlayerCard(),
    );

    expect(battle.hand.map((card) => card.cardId)).toEqual(cardIds.slice(1));
  });

  it("randomizes the enemy starting hand before summoning", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const enemyCardIds = [
      "village_levy",
      "wache",
      "riesenbat",
      "ork_rekrut",
      "kobold_jung",
      "kobold_speer",
    ];

    const battle = new BattleSimulation(
      [],
      createEnemy(enemyCardIds),
      createPlayerCard(),
    );

    expect(battle.enemyField.map((card) => card.cardId)).toEqual(
      enemyCardIds.slice(1, 3),
    );
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
    expect(battle.animationEvents.at(-1)).toMatchObject({
      type: "summon",
      side: "player",
    });
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
    expect(battle.animationEvents.at(-1)).toMatchObject({
      type: "recall",
      side: "player",
    });
  });

  it("lets higher initiative units kill lower initiative attackers first", () => {
    const battle = new BattleSimulation(
      createCardInstances(["riesenbat"]),
      createEnemy(["ork_rekrut"]),
      createPlayerCard(),
    );
    const bat = battle.hand[0];
    const enemy = battle.enemyField[0];
    enemy.currentHp = 1;
    const batHpBefore = bat.currentHp;
    battle.summon(bat.uid);

    battle.resolveRound();

    expect(battle.enemyField).not.toContain(enemy);
    expect(bat.currentHp).toBe(batHpBefore);
    expect(
      battle.animationEvents.some(
        (event) =>
          event.type === "attack" && event.attackerUids.includes(enemy.uid),
      ),
    ).toBe(false);
  });

  it("continues when the Wanderer falls but other player units hold the field", () => {
    const hero = createPlayerCard();
    const battle = new BattleSimulation(
      createCardInstances(["village_levy"]),
      createEnemy(["orc_ironhide"]),
      hero,
    );
    battle.summon(battle.hand[0].uid);
    hero.currentHp = 1;

    battle.resolveRound();

    expect(battle.playerField.some((card) => card.isHero)).toBe(false);
    expect(battle.playerField.length).toBeGreaterThan(0);
    expect(battle.outcome).toBe("active");
  });

  it("resolves matching initiative attacks simultaneously", () => {
    const battle = new BattleSimulation(
      createCardInstances(["village_levy"]),
      createEnemy(["orc_tracker"]),
      createPlayerCard(),
    );
    const levy = battle.hand[0];
    const enemy = battle.enemyField[0];
    enemy.currentHp = 1;
    const heroHpBefore = battle.hero.currentHp;
    battle.summon(levy.uid);

    battle.resolveRound();

    expect(battle.enemyField).not.toContain(enemy);
    expect(battle.hero.currentHp).toBeLessThan(heroHpBefore);
    expect(
      battle.animationEvents.some(
        (event) => event.type === "attack" && event.simultaneous,
      ),
    ).toBe(true);
  });

  it("records destruction animation events after lethal attacks", () => {
    const enemy = enemiesById.get("road_reavers")!;
    const hero = createPlayerCard();
    const battle = new BattleSimulation([], enemy, hero);
    const doomedEnemy = battle.enemyField[0];
    doomedEnemy.currentHp = 1;
    const heroHpBefore = hero.currentHp;

    battle.resolveRound();

    expect(battle.enemyField).not.toContain(doomedEnemy);
    expect(hero.currentHp).toBeLessThan(heroHpBefore);
    expect(
      battle.animationEvents.some(
        (event) =>
          event.type === "destroyed" && event.cardUid === doomedEnemy.uid,
      ),
    ).toBe(true);
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

  it("fills the enemy formation only after resolving current attacks", () => {
    const enemy = enemiesById.get("kobold_foragers")!;
    const battle = new BattleSimulation([], enemy, createPlayerCard());
    const nextEnemy = battle.enemyHand[0];

    expect(battle.enemyField).toHaveLength(2);
    battle.resolveRound();

    expect(battle.enemyField.length).toBeGreaterThanOrEqual(2);
    expect(battle.enemyField).toContain(nextEnemy);
    expect(nextEnemy.currentHp).toBe(getCardDefinition(nextEnemy.cardId).maxHp);
    expect(
      battle.enemyField.length + battle.enemyHand.length + battle.enemyDrawPile.length,
    ).toBeLessThanOrEqual(enemy.deck.length);
  });

  it("does not allow newly summoned enemies to attack or take damage in the same round", () => {
    const enemy = createEnemy(["kobold_jung", "kobold_trapper", "kobold_speer"]);
    const battle = new BattleSimulation(
      createCardInstances(["village_levy", "village_levy", "village_levy"]),
      enemy,
      createPlayerCard(),
    );
    const nextEnemy = battle.enemyHand[0];
    for (const card of [...battle.hand]) battle.summon(card.uid);

    battle.resolveRound();

    expect(battle.enemyField).toContain(nextEnemy);
    expect(nextEnemy.currentHp).toBe(getCardDefinition(nextEnemy.cardId).maxHp);
    expect(
      battle.animationEvents.some(
        (event) =>
          event.type === "attack" &&
          (event.attackerUids.includes(nextEnemy.uid) ||
            event.defenderUids.includes(nextEnemy.uid)),
      ),
    ).toBe(false);
  });

  it("rounds combat damage to clean tens", () => {
    const battle = new BattleSimulation(
      createCardInstances(["village_levy"]),
      createEnemy(["kobold_trapper"]),
      createPlayerCard(),
    );
    battle.summon(battle.hand[0].uid);

    battle.resolveRound();

    for (const stats of battle.unitStats.values()) {
      expect(stats.damageDealt % 10).toBe(0);
      expect(stats.hpLost % 10).toBe(0);
    }
  });

  it("rolls precise item tables independently from captured cards", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const enemy = enemiesById.get("road_reavers")!;
    const battle = new BattleSimulation([], enemy, createPlayerCard());

    const reward = battle.rollReward();

    expect(reward.cardId).toBe("ork_rekrut");
    expect(reward.items).toEqual([
      { itemId: "iron", quantity: 1 },
      { itemId: "rusty_sword", quantity: 1 },
      { itemId: "healing_poultice", quantity: 1 },
    ]);
  });
});
