import { afterEach, describe, expect, it, vi } from "vitest";
import { enemiesById } from "../../content/content";
import { createCardInstances, createPlayerCard } from "../cards/CardInstance";
import type { EnemyArchetype } from "../content/schemas";
import { BattleSimulation, createEnemyBattleDeck } from "./BattleSimulation";

function createEnemy(deck: string[], overrides: Partial<EnemyArchetype> = {}): EnemyArchetype {
  return { id: "test_enemy", nameKey: "enemy.test.name", deck, goldReward: 0, threat: 1, dropTable: [], itemDropTable: [], ...overrides };
}

describe("BattleSimulation", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps early encounters at tier 1 and scales composition with player progress", () => {
    const wolves = enemiesById.get("hungry_wolves")!;
    const early = createEnemyBattleDeck(wolves, { playerLevel: 1, warbandThreat: 1 });
    const veteran = createEnemyBattleDeck(wolves, { playerLevel: 9, warbandThreat: 4 });
    expect(early).toHaveLength(3);
    expect(early.every((card) => card.cardId === "stray_wolf" || card.cardId === "riesenbat")).toBe(true);
    expect(veteran.length).toBeGreaterThan(early.length);
    expect(veteran.some((card) => card.cardId === "alpha_wolf" || card.cardId === "cave_bat" || card.cardId === "blood_bat")).toBe(true);
    expect(veteran.every((card) => card.level >= 3)).toBe(true);
  });

  it("keeps both leaders behind the unit formations", () => {
    const hero = createPlayerCard();
    const battle = new BattleSimulation(createCardInstances(["village_levy"]), createEnemy(["ork_rekrut"]), hero);
    expect(battle.playerField).not.toContain(hero);
    expect(battle.enemyField).not.toContain(battle.enemyLeader);
    expect(battle.enemyLeader.cardId).toBe("ork_rekrut");
  });

  it("uses leadership-derived variable field slots", () => {
    const battle = new BattleSimulation(createCardInstances(Array(7).fill("village_levy")), createEnemy(["ork_rekrut"]), createPlayerCard(), { heroAtk: 0, heroDef: 0, fieldSlots: 6 });
    expect(battle.playerFieldSlots).toBe(6);
    for (let index = 0; index < 3; index++) expect(battle.summon(battle.hand[0].uid)).toBe(true);
    expect(battle.playerField).toHaveLength(3);
  });

  it("spends the shared tactical actions on summons, recalls, and draws", () => {
    const battle = new BattleSimulation(createCardInstances(Array(7).fill("village_levy")), createEnemy(["ork_rekrut"]), createPlayerCard());
    const first = battle.hand[0];
    expect(battle.summon(first.uid)).toBe(true);
    expect(battle.recall(first.uid)).toBe(true);
    expect(battle.drawCard()).toBe(true);
    expect(battle.actionsRemaining).toBe(0);
  });

  it("draws one free card at the end of a resolved round", () => {
    const battle = new BattleSimulation(createCardInstances(Array(7).fill("wache")), createEnemy(["skelett"]), createPlayerCard());
    battle.summon(battle.hand[0].uid);
    const totalBefore = battle.hand.length;
    battle.resolveRound();
    expect(battle.hand.length).toBe(totalBefore + 1);
    expect(battle.actionsRemaining).toBe(3);
  });

  it("sends only overkill damage through a unit to its leader", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const battle = new BattleSimulation(createCardInstances(["cannon_golem"]), createEnemy(["village_levy", "village_levy"]), createPlayerCard());
    battle.enemyField.splice(1);
    battle.enemyField[0].currentHp = 1;
    battle.summon(battle.hand[0].uid);
    const leaderHp = battle.enemyLeader.currentHp;
    battle.resolveRound();
    expect(battle.enemyLeader.currentHp).toBeLessThan(leaderHp);
  });

  it("retargets later same-initiative attackers after their first target dies", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const battle = new BattleSimulation(
      createCardInstances(["village_levy", "village_levy"]),
      createEnemy(["dire_wolf", "dire_wolf", "dire_wolf"]),
      createPlayerCard(),
    );
    const firstLevy = battle.hand[0];
    const secondLevy = battle.hand[1];
    battle.summon(firstLevy.uid);
    battle.summon(secondLevy.uid);

    battle.resolveRound();

    expect(firstLevy.currentHp).toBe(0);
    expect(secondLevy.currentHp).toBeLessThan(900);
  });

  it("can mark an eligible player casualty as wounded when the unit falls", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const battle = new BattleSimulation(
      createCardInstances(["village_levy"]),
      createEnemy(["dire_wolf", "dire_wolf"]),
      createPlayerCard(),
      { heroAtk: 0, heroDef: 0, woundSurvivalChance: 0.12 },
    );
    const levy = battle.hand[0];
    battle.summon(levy.uid);
    battle.resolveRound();

    expect(battle.unitStats.get(levy.uid)).toMatchObject({ destroyed: true, wounded: true });
  });

  it("attacks the leader directly when its field is empty", () => {
    const battle = new BattleSimulation(createCardInstances(["cannon_golem"]), createEnemy(["village_levy", "village_levy"]), createPlayerCard());
    for (const enemy of battle.enemyField) enemy.currentHp = 0;
    battle.summon(battle.hand[0].uid);
    battle.commitLeaderAction("attack", battle.enemyLeader.uid);
    const leaderHp = battle.enemyLeader.currentHp;
    battle.resolveRound();
    expect(battle.enemyLeader.currentHp).toBeLessThan(leaderHp);
  });

  it("loses immediately when the hero dies even with surviving units", () => {
    const hero = createPlayerCard();
    const battle = new BattleSimulation(createCardInstances(["village_levy"]), createEnemy(["cannon_golem"]), hero);
    battle.summon(battle.hand[0].uid);
    hero.currentHp = 1;
    battle.resolveRound();
    expect(battle.outcome).toBe("defeat");
  });

  it("does not lose while a living unit remains in hand or draw pile", () => {
    const battle = new BattleSimulation(createCardInstances(["wache", "wache"]), createEnemy(["village_levy"]), createPlayerCard());
    expect(battle.playerField).toHaveLength(0);
    expect(battle.outcome).toBe("active");
  });

  it("wins when the enemy leader dies", () => {
    const battle = new BattleSimulation(createCardInstances(["cannon_golem"]), createEnemy(["village_levy", "village_levy"]), createPlayerCard());
    battle.enemyField.splice(0);
    battle.enemyLeader.currentHp = 1;
    battle.summon(battle.hand[0].uid);
    battle.resolveRound();
    expect(battle.outcome).toBe("victory");
  });

  it("spends a tactical action to commit one level-gated leader command", () => {
    const hero = createPlayerCard();
    hero.level = 3;
    const battle = new BattleSimulation(createCardInstances(["village_levy"]), createEnemy(["orc_ironhide"]), hero);
    battle.summon(battle.hand[0].uid);
    const guardedUid = battle.playerField[0].uid;
    expect(battle.commitLeaderAction("guard")).toBe(true);
    expect(battle.actionsRemaining).toBe(1);
    expect(battle.commitLeaderAction("attack")).toBe(false);
    battle.resolveRound();
    expect(battle.animationEvents).toContainEqual(expect.objectContaining({ type: "leaderAction", side: "player", actionId: "guard" }));
    expect(battle.animationEvents).toContainEqual(
      expect.objectContaining({
        type: "leaderAction",
        affectedUids: expect.arrayContaining([guardedUid]),
      }),
    );
  });

  it("requires Strategic Attack to target a living enemy unit before the leader", () => {
    const battle = new BattleSimulation(createCardInstances(["village_levy"]), createEnemy(["wache", "wache"]), createPlayerCard());
    expect(battle.commitLeaderAction("attack")).toBe(false);
    expect(battle.commitLeaderAction("attack", battle.enemyLeader.uid)).toBe(false);
    const target = battle.enemyField[1];
    expect(battle.commitLeaderAction("attack", target.uid)).toBe(true);
    expect(battle.selectedLeaderTargetUid).toBe(target.uid);
    expect(battle.actionsRemaining).toBe(2);
  });

  it("unlocks and improves racial leader commands through leader levels", () => {
    const novice = createPlayerCard();
    const veteran = createPlayerCard();
    veteran.level = 5;
    const noviceBattle = new BattleSimulation([], createEnemy(["village_levy"]), novice);
    const veteranBattle = new BattleSimulation([], createEnemy(["village_levy"]), veteran);
    expect(noviceBattle.availableLeaderActions.map((command) => command.id)).toEqual(["attack", "rally"]);
    expect(veteranBattle.availableLeaderActions.map((command) => command.id)).toEqual(["attack", "rally", "guard", "restore"]);
  });

  it("rewards gold, minimum loot, and prisoners from actually defeated units", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const battle = new BattleSimulation([], enemiesById.get("road_reavers")!, createPlayerCard());
    battle.defeatedEnemyCardIds.push("orc_youngblood", "giant_rat", "orc_youngblood");
    const reward = battle.rollReward();
    expect(reward.cardId).toBe("orc_youngblood");
    expect(reward.capturedCardIds).toHaveLength(2);
    expect(reward.gold).toBeGreaterThanOrEqual(34);
    expect(reward.items.reduce((sum, item) => sum + item.quantity, 0)).toBeGreaterThanOrEqual(2);
  });
});
