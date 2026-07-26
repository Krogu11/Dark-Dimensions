import { afterEach, describe, expect, it, vi } from "vitest";
import { contentPack, enemiesById } from "../../content/content";
import { createCardInstances, createPlayerCard } from "../cards/CardInstance";
import type { EnemyArchetype } from "../content/schemas";
import {
  BattleSimulation,
  createEnemyBattleDeck,
  getStrategicActionsForRound,
} from "./BattleSimulation";

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

  it("uses seven fixed field slots for both sides", () => {
    const battle = new BattleSimulation(createCardInstances(Array(7).fill("village_levy")), createEnemy(["ork_rekrut"]), createPlayerCard(), { heroAtk: 0, heroDef: 0, fieldSlots: 6 });
    expect(battle.playerFieldSlots).toBe(7);
    expect(battle.enemyFieldSlots).toBe(7);
  });

  it("grows strategic actions with the round and caps them at nine", () => {
    expect(Array.from({ length: 11 }, (_, index) => getStrategicActionsForRound(index + 1)))
      .toEqual([3, 4, 5, 6, 7, 8, 9, 9, 9, 9, 9]);
  });

  it("queues multiple equipped abilities and spends their exact tier costs", () => {
    const hero = createPlayerCard();
    hero.currentHp -= 400;
    const woundedHp = hero.currentHp;
    const battle = new BattleSimulation(
      createCardInstances(["village_levy"]),
      createEnemy(["ork_rekrut"]),
      hero,
      undefined,
      undefined,
      undefined,
      undefined,
      ["minor_heal", "battle_focus"],
    );
    const unit = battle.hand[0];
    expect(battle.commitAbility("minor_heal", hero.uid)).toBe(true);
    expect(battle.commitAbility("battle_focus", unit.uid)).toBe(false);
    expect(battle.summon(unit.uid)).toBe(true);
    expect(battle.commitAbility("battle_focus", unit.uid)).toBe(true);
    expect(battle.actionsRemaining).toBe(0);
    expect(battle.queuedAbilities.map((entry) => entry.abilityId)).toEqual(["minor_heal", "battle_focus"]);

    battle.resolveRound();

    expect(hero.currentHp).toBe(woundedHp + 200);
    expect(battle.animationEvents).toContainEqual(expect.objectContaining({ type: "leaderAction", actionId: "minor_heal" }));
    expect(battle.animationEvents).toContainEqual(expect.objectContaining({ type: "leaderAction", actionId: "battle_focus" }));
  });

  it("applies burn immediately and once on each following round", () => {
    const battle = new BattleSimulation(
      createCardInstances(["village_levy"]),
      createEnemy(["wache"]),
      createPlayerCard(),
      undefined,
      undefined,
      undefined,
      undefined,
      ["burning_mark"],
    );
    const unit = battle.hand[0];
    const target = battle.enemyField[0];
    battle.summon(unit.uid);
    const startingHp = target.currentHp;
    expect(battle.commitAbility("burning_mark", target.uid)).toBe(true);

    battle.resolveRound();
    expect(target.currentHp).toBe(startingHp - 100);

    battle.resolveRound();
    const burnTick = battle.animationEvents.find((event) => event.type === "leaderAction" && event.actionId === "burning_mark");
    expect(burnTick).toEqual(expect.objectContaining({ value: 100 }));
  });

  it("uses round one as a deployment round without normal unit attacks", () => {
    const battle = new BattleSimulation(
      createCardInstances(["village_levy"]),
      createEnemy(["ork_rekrut"]),
      createPlayerCard(),
    );
    const playerUnit = battle.hand[0];
    const enemyUnit = battle.enemyField[0];

    expect(battle.summon(playerUnit.uid)).toBe(true);
    expect(battle.isUnitReady(playerUnit.uid)).toBe(false);
    expect(battle.isUnitReady(enemyUnit.uid)).toBe(false);

    battle.resolveRound();

    expect(battle.animationEvents.some((event) => event.type === "attack")).toBe(false);
    expect(battle.turn).toBe(2);
    expect(battle.isUnitReady(playerUnit.uid)).toBe(true);
    expect(battle.isUnitReady(enemyUnit.uid)).toBe(true);
  });

  it("keeps a later reinforcement inactive until the following round", () => {
    const battle = new BattleSimulation(
      createCardInstances(["cannon_golem"]),
      createEnemy(["village_levy"]),
      createPlayerCard(),
    );
    battle.turn = 4;
    battle.actionsRemaining = 4;
    const reinforcement = battle.hand[0];
    battle.summon(reinforcement.uid);

    battle.resolveRound();
    expect(
      battle.animationEvents.some(
        (event) =>
          event.type === "attack"
          && event.attackerUids.includes(reinforcement.uid),
      ),
    ).toBe(false);
    expect(battle.isUnitReady(reinforcement.uid)).toBe(true);

    battle.resolveRound();
    expect(
      battle.animationEvents.some(
        (event) =>
          event.type === "attack"
          && event.attackerUids.includes(reinforcement.uid),
      ),
    ).toBe(true);
  });

  it("resets deployment readiness after recalling and resummoning a unit", () => {
    const battle = new BattleSimulation(
      createCardInstances(["cannon_golem"]),
      createEnemy(["village_levy"]),
      createPlayerCard(),
    );
    const unit = battle.hand[0];
    battle.summon(unit.uid);
    battle.resolveRound();
    expect(battle.isUnitReady(unit.uid)).toBe(true);

    expect(battle.recall(unit.uid)).toBe(true);
    expect(battle.summon(unit.uid)).toBe(true);
    expect(battle.isUnitReady(unit.uid)).toBe(false);
    battle.resolveRound();

    expect(
      battle.animationEvents.some(
        (event) => event.type === "attack" && event.attackerUids.includes(unit.uid),
      ),
    ).toBe(false);
  });

  it.each([
    { attackers: 3, defenders: 3, expectedCounts: [1, 1, 1] },
    { attackers: 3, defenders: 2, expectedCounts: [1, 2] },
    { attackers: 7, defenders: 7, expectedCounts: [1, 1, 1, 1, 1, 1, 1] },
  ])(
    "distributes $attackers normal attacks across $defenders defenders",
    ({ attackers, defenders, expectedCounts }) => {
      const playerUnits = createCardInstances(Array(attackers).fill("cannon_golem"));
      const battle = new BattleSimulation(
        playerUnits,
        createEnemy(["village_levy"]),
        createPlayerCard(),
      );
      const enemyUnits = createCardInstances(Array(defenders).fill("wache"));
      battle.hand.splice(0);
      battle.drawPile.splice(0);
      battle.playerField.splice(0, battle.playerField.length, ...playerUnits);
      battle.enemyField.splice(0, battle.enemyField.length, ...enemyUnits);
      battle.enemyHand.splice(0);
      battle.enemyDrawPile.splice(0);
      battle.enemyActionsRemaining = 0;

      battle.resolveRound();

      const playerHits = battle.animationEvents.flatMap((event) =>
        event.type === "attack"
          ? event.hits.filter((hit) =>
              playerUnits.some((unit) => unit.uid === hit.attackerUid),
            )
          : [],
      );
      const counts = enemyUnits
        .map(
          (unit) =>
            playerHits.filter((hit) => hit.defenderUid === unit.uid).length,
        )
        .sort((left, right) => left - right);
      expect(counts).toEqual(expectedCounts);
    },
  );

  it("spends the shared tactical actions on summons, recalls, and draws", () => {
    const battle = new BattleSimulation(createCardInstances(Array(7).fill("village_levy")), createEnemy(["ork_rekrut"]), createPlayerCard());
    battle.actionsRemaining = 3;
    const first = battle.hand[0];
    expect(battle.summon(first.uid)).toBe(true);
    expect(battle.recall(first.uid)).toBe(true);
    expect(battle.drawCard()).toBe(true);
    expect(battle.actionsRemaining).toBe(0);
  });

  it("clears completed animation events without erasing combat history", () => {
    const battle = new BattleSimulation(createCardInstances(["village_levy"]), createEnemy(["ork_rekrut"]), createPlayerCard());
    battle.animationEvents.splice(0);
    const historyBefore = battle.combatHistory.length;
    battle.summon(battle.hand[0].uid);
    expect(battle.animationEvents.length).toBeGreaterThan(0);
    expect(battle.combatHistory.length).toBeGreaterThan(historyBefore);

    const recordedHistory = battle.combatHistory.length;
    battle.clearAnimationEvents();

    expect(battle.animationEvents).toHaveLength(0);
    expect(battle.combatHistory).toHaveLength(recordedHistory);
  });

  it("draws one free card at the end of a resolved round", () => {
    const battle = new BattleSimulation(createCardInstances(Array(7).fill("wache")), createEnemy(["skelett"]), createPlayerCard());
    battle.summon(battle.hand[0].uid);
    const totalBefore = battle.hand.length;
    battle.resolveRound();
    expect(battle.hand.length).toBe(totalBefore + 1);
    expect(battle.actionsRemaining).toBe(4);
  });

  it("executes multiple summon effects in authored order and heals a hand card", () => {
    const battle = new BattleSimulation(createCardInstances(["village_levy"]), createEnemy(["ork_rekrut"]), createPlayerCard());
    const [wounded, priest, drawn] = createCardInstances(["village_levy", "high_priest", "soldier"]);
    wounded.currentHp = 100;
    battle.hand.splice(0, battle.hand.length, wounded, priest);
    battle.drawPile.splice(0, battle.drawPile.length, drawn);

    expect(battle.summon(priest.uid)).toBe(true);

    expect(battle.isUnitReady(priest.uid)).toBe(false);
    expect(wounded.currentHp).toBe(600);
    expect(battle.hand).toContain(drawn);
    expect(battle.animationEvents.filter((event) => event.type === "effect").map((event) => event.type === "effect" ? event.action : "")).toEqual(["heal", "draw"]);
  });

  it("lets free draw effects expire with a full hand or empty pile", () => {
    const battle = new BattleSimulation(createCardInstances(["village_levy"]), createEnemy(["ork_rekrut"]), createPlayerCard());
    const archer = createCardInstances(["bogenschutze"])[0];
    battle.playerField.push(archer);
    battle.hand.splice(0, battle.hand.length, ...createCardInstances(Array(7).fill("village_levy")));
    battle.drawPile.splice(0, battle.drawPile.length, ...createCardInstances(["soldier"]));
    (battle as unknown as { triggerCardEffects(card: typeof archer, side: "player", trigger: "onSummon"): void }).triggerCardEffects(archer, "player", "onSummon");
    expect(battle.hand).toHaveLength(7);
    expect(battle.drawPile).toHaveLength(1);

    battle.hand.pop();
    battle.drawPile.splice(0);
    (battle as unknown as { triggerCardEffects(card: typeof archer, side: "player", trigger: "onSummon"): void }).triggerCardEffects(archer, "player", "onSummon");
    expect(battle.hand).toHaveLength(6);
  });

  it("applies field-and-hand healing symmetrically for the enemy", () => {
    const battle = new BattleSimulation(createCardInstances(["village_levy"]), createEnemy(["ork_rekrut"]), createPlayerCard());
    const [wounded, priest] = createCardInstances(["village_levy", "high_priest"]);
    wounded.currentHp = 120;
    battle.enemyHand.splice(0, battle.enemyHand.length, wounded);
    battle.enemyField.push(priest);
    (battle as unknown as { triggerCardEffects(card: typeof priest, side: "enemy", trigger: "onSummon"): void }).triggerCardEffects(priest, "enemy", "onSummon");
    expect(wounded.currentHp).toBe(620);
  });

  it("returns a destroyed unit to hand only once per battle", () => {
    const battle = new BattleSimulation(createCardInstances(["village_levy"]), createEnemy(["ork_rekrut"]), createPlayerCard());
    const paladin = createCardInstances(["death_paladin"])[0];
    battle.playerField.push(paladin);
    paladin.currentHp = 0;
    (battle as unknown as { collectDestroyedEvents(): void }).collectDestroyedEvents();
    expect(battle.hand).toContain(paladin);
    expect(paladin.currentHp).toBe(Math.round(battle.getMaxHp(paladin) * 0.4));

    battle.hand.splice(battle.hand.indexOf(paladin), 1);
    battle.playerField.push(paladin);
    paladin.currentHp = 0;
    (battle as unknown as { collectDestroyedEvents(): void }).collectDestroyedEvents();
    expect(battle.hand).not.toContain(paladin);
    expect(battle.unitStats.get(paladin.uid)?.destroyed).toBe(true);
  });

  it("resolves the Phoenix death blast against every enemy before returning it to hand", () => {
    const battle = new BattleSimulation(
      createCardInstances(["village_levy"]),
      createEnemy(["ork_rekrut"]),
      createPlayerCard(),
    );
    const phoenix = createCardInstances(["phoenix"])[0];
    const targets = createCardInstances([
      "ork_rekrut",
      "ork_rekrut",
      "ork_rekrut",
    ]);
    targets.forEach((target) => { target.currentHp = 1_000; });
    battle.playerField.push(phoenix);
    battle.enemyField.splice(0, battle.enemyField.length, ...targets);
    battle.clearAnimationEvents();

    phoenix.currentHp = 0;
    (battle as unknown as { collectDestroyedEvents(): void }).collectDestroyedEvents();

    expect(targets.map((target) => target.currentHp)).toEqual([840, 840, 840]);
    expect(battle.playerField).not.toContain(phoenix);
    expect(battle.hand).toContain(phoenix);
    expect(phoenix.currentHp).toBe(Math.round(battle.getMaxHp(phoenix) * 0.5));
    const effects = battle.animationEvents.filter((event) => event.type === "effect");
    expect(effects.map((event) => event.action)).toEqual(["damage", "returnToHand"]);
    expect(effects[0]).toMatchObject({
      affectedUids: targets.map((target) => target.uid),
      results: targets.map((target) => ({
        uid: target.uid,
        hpBefore: 1_000,
        hpAfter: 840,
      })),
    });
    expect(effects[1]).toMatchObject({
      affectedUids: [phoenix.uid],
      results: [{
        uid: phoenix.uid,
        hpBefore: 0,
        hpAfter: Math.round(battle.getMaxHp(phoenix) * 0.5),
      }],
    });
  });

  it("records the source healing caused by drain effects", () => {
    const battle = new BattleSimulation(
      createCardInstances(["village_levy"]),
      createEnemy(["ork_rekrut"]),
      createPlayerCard(),
    );
    const bat = createCardInstances(["blood_bat"])[0];
    bat.currentHp = 500;
    battle.playerField.push(bat);
    battle.enemyField[0].currentHp = 1_000;
    battle.clearAnimationEvents();

    (battle as unknown as {
      triggerCardEffects(card: typeof bat, side: "player", trigger: "onAttack"): void;
    }).triggerCardEffects(bat, "player", "onAttack");

    const event = battle.animationEvents.find((candidate) => candidate.type === "effect");
    expect(event).toMatchObject({
      type: "effect",
      action: "drain",
      affectedUids: expect.arrayContaining([battle.enemyField[0].uid, bat.uid]),
      results: expect.arrayContaining([
        expect.objectContaining({ uid: bat.uid, hpBefore: 500, hpAfter: 690 }),
      ]),
    });
  });

  it("recalls a critically wounded enemy and deploys a healthier replacement", () => {
    const enemyDeck = createCardInstances([
      "village_levy",
      "village_levy",
      "village_levy",
      "ork_rekrut",
      "ork_rekrut",
      "ork_rekrut",
    ]);
    const battle = new BattleSimulation(
      createCardInstances(["cannon_golem"]),
      createEnemy(["village_levy"]),
      createPlayerCard(),
      undefined,
      undefined,
      enemyDeck,
    );
    battle.summon(battle.hand[0].uid);
    const wounded = battle.enemyField[0];
    wounded.currentHp = Math.floor(battle.getMaxHp(wounded) * 0.2);
    battle.enemyActionsRemaining = 3;

    battle.resolveRound();

    expect(battle.enemyField).not.toContain(wounded);
    expect(battle.enemyHand).toContain(wounded);
    expect(battle.animationEvents).toContainEqual(
      expect.objectContaining({ type: "recall", side: "enemy", cardUid: wounded.uid }),
    );
  });

  it("sends only overkill damage through a unit to its leader", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const battle = new BattleSimulation(createCardInstances(["cannon_golem"]), createEnemy(["village_levy", "village_levy"]), createPlayerCard());
    battle.enemyField.splice(1);
    battle.enemyField[0].currentHp = 1;
    battle.summon(battle.hand[0].uid);
    battle.turn = 2;
    const leaderHp = battle.enemyLeader.currentHp;
    battle.resolveRound();
    expect(battle.enemyLeader.currentHp).toBeLessThan(leaderHp);
  });

  it("credits the killing unit with a tier-based personal XP bonus", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const battle = new BattleSimulation(
      createCardInstances(["cannon_golem"]),
      createEnemy(["village_levy"]),
      createPlayerCard(),
    );
    const killer = battle.hand[0];
    battle.enemyField[0].currentHp = 1;
    battle.enemyLeader.currentHp = 10_000;
    battle.summon(killer.uid);
    battle.turn = 2;

    battle.resolveRound();

    expect(battle.unitStats.get(killer.uid)).toMatchObject({
      kills: 1,
      killXp: 10,
    });
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
    battle.actionsRemaining = 2;
    battle.summon(firstLevy.uid);
    battle.summon(secondLevy.uid);
    battle.enemyField.push(...battle.enemyHand.splice(0, 2));
    firstLevy.currentHp = 1;
    battle.turn = 2;

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
    battle.enemyField.push(...battle.enemyHand.splice(0, 1));
    levy.currentHp = 100;
    battle.turn = 2;
    battle.resolveRound();

    expect(battle.unitStats.get(levy.uid)).toMatchObject({ destroyed: true, wounded: true });
  });

  it("attacks the leader directly when its field is empty", () => {
    const battle = new BattleSimulation(createCardInstances(["cannon_golem"]), createEnemy(["village_levy", "village_levy"]), createPlayerCard());
    for (const enemy of battle.enemyField) enemy.currentHp = 0;
    battle.summon(battle.hand[0].uid);
    battle.commitLeaderAction("attack", battle.enemyLeader.uid);
    battle.turn = 2;
    const leaderHp = battle.enemyLeader.currentHp;
    battle.resolveRound();
    expect(battle.enemyLeader.currentHp).toBeLessThan(leaderHp);
  });

  it("loses immediately when the hero dies even with surviving units", () => {
    const hero = createPlayerCard();
    const battle = new BattleSimulation(createCardInstances(["village_levy"]), createEnemy(["cannon_golem"]), hero);
    battle.summon(battle.hand[0].uid);
    hero.currentHp = 1;
    battle.turn = 2;
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
    battle.turn = 2;
    battle.resolveRound();
    expect(battle.outcome).toBe("victory");
  });

  it("spends a tactical action to commit one level-gated leader command", () => {
    const hero = createPlayerCard();
    hero.level = 3;
    const battle = new BattleSimulation(createCardInstances(["village_levy"]), createEnemy(["orc_ironhide"]), hero);
    battle.actionsRemaining = 3;
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
    const target = battle.enemyField[0];
    expect(battle.commitLeaderAction("attack", target.uid)).toBe(true);
    expect(battle.selectedLeaderTargetUid).toBe(target.uid);
    expect(battle.actionsRemaining).toBe(2);
    const targetHp = target.currentHp;
    battle.resolveRound();
    expect(target.currentHp).toBeLessThan(targetHp);
    expect(battle.animationEvents).toContainEqual(
      expect.objectContaining({
        type: "leaderAction",
        side: "player",
        actionId: "attack",
        affectedUids: [target.uid],
      }),
    );
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

  it("spends the enemy opening budget before round one begins", () => {
    const enemyDeck = createCardInstances(Array(7).fill("ork_rekrut"));
    const battle = new BattleSimulation(
      createCardInstances(["wache"]),
      createEnemy(["ork_rekrut"], { threat: 3 }),
      createPlayerCard(),
      undefined,
      undefined,
      enemyDeck,
    );
    battle.summon(battle.hand[0].uid);

    expect(battle.enemyField).toHaveLength(3);
    expect(battle.enemyActionsRemaining).toBe(0);
    battle.resolveRound();

    expect(battle.animationEvents.some((event) => event.type === "summon" && event.side === "enemy")).toBe(false);
    expect(battle.animationEvents.some((event) => event.type === "leaderAction" && event.side === "enemy")).toBe(false);
    expect(battle.enemyActionsRemaining).toBe(4);
  });

  it("charges the enemy separately for drawing and summoning", () => {
    const battle = new BattleSimulation(createCardInstances(["wache"]), createEnemy(["ork_rekrut"], { threat: 2 }), createPlayerCard());
    battle.enemyField.splice(0);
    battle.enemyHand.splice(0);
    battle.enemyDrawPile.splice(0, battle.enemyDrawPile.length, ...createCardInstances(["ork_rekrut"]));
    battle.animationEvents.splice(0);
    const remaining = (battle as unknown as { enemyTacticalPhase(animate: boolean, actions: number): number }).enemyTacticalPhase(true, 2);

    expect(remaining).toBe(0);
    expect(battle.enemyField).toHaveLength(1);
    expect(battle.animationEvents.filter((event) => event.type !== "attack" && event.side === "enemy" && (event.type === "draw" || event.type === "summon")).map((event) => event.type)).toEqual(["draw", "summon"]);
  });

  it("records the exact shield, hp, and overkill result of the bog levy attack", () => {
    const hero = createPlayerCard();
    const battle = new BattleSimulation(
      createCardInstances(["village_levy"]),
      createEnemy(["riesenbat"], { leaderCardId: "stray_wolf", threat: 1 }),
      hero,
      undefined,
      { terrain: "bog", playerAttack: 0.86, playerDefense: 0.9, enemyAttack: 0.86, enemyDefense: 0.9 },
      createCardInstances(["riesenbat", "riesenbat", "giant_rat"]),
    );
    const levy = battle.hand[0];
    battle.summon(levy.uid);
    (battle as unknown as { shields: Map<string, number> }).shields.set(levy.uid, 180);
    const [firstBat, secondBat, rat] = createCardInstances(["riesenbat", "riesenbat", "giant_rat"]);
    battle.enemyField.splice(0, battle.enemyField.length, firstBat, secondBat, rat);
    battle.enemyHand.splice(0);
    battle.enemyDrawPile.splice(0);
    (battle as unknown as {
      initializeUnit(card: typeof rat, side: "enemy"): void;
    }).initializeUnit(rat, "enemy");
    battle.enemyActionsRemaining = 2;
    battle.turn = 2;
    const heroHp = hero.currentHp;

    battle.resolveRound();

    const hits = battle.animationEvents.flatMap((event) => event.type === "attack" ? event.hits : []);
    const enemyHits = hits.filter((hit) => [firstBat.uid, secondBat.uid, rat.uid, battle.enemyLeader.uid].includes(hit.attackerUid));
    expect(enemyHits.reduce((sum, hit) => sum + hit.damage, 0)).toBe(1160);
    expect(enemyHits.reduce((sum, hit) => sum + hit.shieldAbsorbed, 0)).toBe(180);
    expect(enemyHits.reduce((sum, hit) => sum + hit.hpDamage, 0)).toBe(900);
    expect(enemyHits.reduce((sum, hit) => sum + hit.overkillDamage, 0)).toBe(80);
    expect(battle.animationEvents).toContainEqual(expect.objectContaining({
      type: "leaderAction",
      side: "enemy",
      actionId: "attack",
      cardId: "stray_wolf",
      affectedUids: [levy.uid],
    }));
    expect(levy.currentHp).toBe(0);
    expect(hero.currentHp).toBe(heroHp - 80);
  });

  it("rewards gold, minimum loot, and prisoners from actually defeated units", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const battle = new BattleSimulation([], enemiesById.get("road_reavers")!, createPlayerCard());
    battle.defeatedEnemyCardIds.push("orc_youngblood", "giant_rat", "orc_youngblood");
    const reward = battle.rollReward();
    expect(reward.cardId).toBe("orc_youngblood");
    expect(reward.capturedCardIds).toHaveLength(
      contentPack.combatRules.rewards.maximumCaptures,
    );
    expect(reward.gold).toBeGreaterThanOrEqual(34);
    expect(reward.items.reduce((sum, item) => sum + item.quantity, 0)).toBeGreaterThanOrEqual(2);
  });
});
