import { contentPack } from "../../content/content";
import type { EnemyArchetype } from "../content/schemas";
import {
  createCardInstance,
  getCardDefinition,
  type CardInstance,
} from "../cards/CardInstance";
import type { TerrainBattleModifiers } from "../world/WorldTerrain";

export type BattleOutcome = "active" | "victory" | "defeat";
export type BattleSide = "player" | "enemy";

export interface BattleReward {
  gold: number;
  cardId: string | null;
  items: Array<{ itemId: string; quantity: number }>;
}

export interface BattleUnitStats {
  damageDealt: number;
  hpLost: number;
  destroyed: boolean;
}

export interface CombatBonuses {
  heroAtk: number;
  heroDef: number;
  heroMaxHp?: number;
}

const DEFAULT_TERRAIN_MODIFIERS: TerrainBattleModifiers = {
  terrain: "plains",
  playerAttack: 1,
  playerDefense: 1,
  enemyAttack: 1,
  enemyDefense: 1,
};

interface PlannedAttack {
  attacker: CardInstance;
  defender: CardInstance;
  initiative: number;
}

export type BattleAnimationEvent =
  | {
      type: "draw" | "summon" | "recall";
      side: BattleSide;
      cardUid: string;
      cardId: string;
    }
  | {
      type: "attack";
      attackerUids: string[];
      defenderUids: string[];
      simultaneous: boolean;
      initiative: number;
    }
  | {
      type: "destroyed";
      side: BattleSide;
      cardUid: string;
      cardId: string;
    };

export class BattleSimulation {
  readonly hand: CardInstance[] = [];
  readonly playerField: CardInstance[] = [];
  readonly enemyField: CardInstance[] = [];
  readonly drawPile: CardInstance[];
  readonly enemyHand: CardInstance[] = [];
  readonly enemyDrawPile: CardInstance[];
  readonly deployedUnitUids = new Set<string>();
  readonly combatLog: string[] = [];
  readonly animationEvents: BattleAnimationEvent[] = [];
  readonly unitStats = new Map<string, BattleUnitStats>();
  private readonly attackBonuses = new Map<string, number>();
  private readonly shields = new Map<string, number>();
  turn = 1;
  summonsRemaining: number = contentPack.combatRules.summonsPerTurn;
  outcome: BattleOutcome = "active";
  message: string | null = null;

  constructor(
    readonly playerDeck: CardInstance[],
    readonly enemy: EnemyArchetype,
    readonly hero: CardInstance,
    private readonly combatBonuses: CombatBonuses = { heroAtk: 0, heroDef: 0 },
    readonly terrainModifiers: TerrainBattleModifiers =
      DEFAULT_TERRAIN_MODIFIERS,
    enemyDeckOverride?: CardInstance[],
  ) {
    this.drawPile = shuffleCards(playerDeck.filter((card) => card.currentHp > 0));
    this.enemyDrawPile = shuffleCards(enemyDeckOverride ?? createEnemyBattleDeck(enemy));
    this.playerField.push(hero);
    this.ensureUnitStats(hero);
    this.initializeUnit(hero, "player");
    this.drawToFive(false);
    this.drawEnemyToFive(false);
    this.enemySummonPhase(2, false);
  }

  summon(handUid: string): boolean {
    this.message = null;
    this.setAnimationEvents([]);
    if (this.outcome !== "active" || this.summonsRemaining <= 0) return false;
    if (this.summonedFieldCount >= 3) {
      this.message = "fieldFull";
      return false;
    }

    const card = this.hand.find((candidate) => candidate.uid === handUid);
    if (!card) return false;

    this.removeFromHand(card);
    this.playerField.push(card);
    this.ensureUnitStats(card);
    this.deployedUnitUids.add(card.uid);
    this.initializeUnit(card, "player");
    this.summonsRemaining -= 1;
    this.setAnimationEvents([
      { type: "summon", side: "player", cardUid: card.uid, cardId: card.cardId },
    ]);
    return true;
  }

  recall(fieldUid: string): boolean {
    this.message = null;
    this.setAnimationEvents([]);
    if (this.outcome !== "active" || this.summonsRemaining <= 0) return false;
    const card = this.playerField.find((candidate) => candidate.uid === fieldUid);
    if (!card || card.isHero) return false;

    this.removeFromField(card);
    this.hand.push(card);
    this.summonsRemaining -= 1;
    this.setAnimationEvents([
      { type: "recall", side: "player", cardUid: card.uid, cardId: card.cardId },
    ]);
    return true;
  }

  getShield(uid: string): number {
    return this.shields.get(uid) ?? 0;
  }

  getAttack(card: CardInstance): number {
    const baseAttack =
      getCardDefinition(card.cardId).atk +
      (card.isHero ? this.combatBonuses.heroAtk : 0);
    return Math.round(
      baseAttack *
        (this.isEnemyCard(card)
          ? this.terrainModifiers.enemyAttack
          : this.terrainModifiers.playerAttack),
    );
  }

  getDefense(card: CardInstance): number {
    const baseDefense =
      getCardDefinition(card.cardId).def +
      (card.isHero ? this.combatBonuses.heroDef : 0);
    return Math.round(
      baseDefense *
        (this.isEnemyCard(card)
          ? this.terrainModifiers.enemyDefense
          : this.terrainModifiers.playerDefense),
    );
  }

  getInitiative(card: CardInstance): number {
    return getCardDefinition(card.cardId).initiative + Math.floor((card.level - 1) / 2);
  }

  resolveRound(): void {
    if (this.outcome !== "active") return;

    this.message = null;
    this.animationEvents.length = 0;

    const attacks = [
      ...this.planAttacks(this.playerField, this.enemyField),
      ...this.planAttacks(this.enemyField, this.playerField),
    ].sort((left, right) => right.initiative - left.initiative);

    const initiativeGroups = new Map<number, PlannedAttack[]>();
    for (const attack of attacks) {
      const group = initiativeGroups.get(attack.initiative) ?? [];
      group.push(attack);
      initiativeGroups.set(attack.initiative, group);
    }

    for (const [initiative, group] of initiativeGroups) {
      const activeGroup = group.filter(
        ({ attacker, defender }) =>
          attacker.currentHp > 0 &&
          defender.currentHp > 0 &&
          this.isCardOnField(attacker) &&
          this.isCardOnField(defender),
      );
      if (activeGroup.length === 0) continue;
      this.animationEvents.push({
        type: "attack",
        attackerUids: activeGroup.map((attack) => attack.attacker.uid),
        defenderUids: activeGroup.map((attack) => attack.defender.uid),
        simultaneous: activeGroup.length > 1,
        initiative,
      });
      for (const attack of activeGroup) this.applyAttack(attack);
      this.collectDestroyedEvents();
      this.removeAllDead();
      this.checkOutcome();
      if (this.outcome !== "active") return;
    }

    this.turn += 1;
    this.summonsRemaining = contentPack.combatRules.summonsPerTurn;
    this.attackBonuses.clear();
    this.enemySummonPhase(contentPack.combatRules.summonsPerTurn);
    this.drawToFive();
    this.drawEnemyToFive();
  }

  rollReward(): BattleReward {
    const drop = this.enemy.dropTable.find((entry) => Math.random() <= entry.chance);
    const items = this.enemy.itemDropTable
      .filter((entry) => Math.random() <= Math.min(0.95, entry.chance * 2.2 + 0.08))
      .map((entry) => ({
        itemId: entry.itemId,
        quantity:
          entry.minimum +
          Math.floor(Math.random() * (entry.maximum - entry.minimum + 1)),
      }));
    if (items.length === 0 && this.enemy.itemDropTable.length > 0) {
      const fallback = this.enemy.itemDropTable[
        Math.floor(Math.random() * this.enemy.itemDropTable.length)
      ];
      items.push({
        itemId: fallback.itemId,
        quantity:
          fallback.minimum +
          Math.floor(Math.random() * (fallback.maximum - fallback.minimum + 1)),
      });
    }
    return {
      gold: this.enemy.goldReward,
      cardId: drop?.cardId ?? null,
      items,
    };
  }

  private planAttacks(
    attackers: CardInstance[],
    defenders: CardInstance[],
  ): PlannedAttack[] {
    if (defenders.length === 0) return [];
    return attackers.map((attacker, index) => ({
      attacker,
      defender: defenders[index % defenders.length],
      initiative: this.getInitiative(attacker),
    }));
  }

  private applyAttack({ attacker, defender }: PlannedAttack): void {
    const attack =
      this.getAttack(attacker) + (this.attackBonuses.get(attacker.uid) ?? 0);
    const defense = this.getDefense(defender);
    const defenseReduction =
      defense / (defense + 1400);
    const rawDamage = attack * (1 - defenseReduction);
    const damage = Math.max(80, Math.round(rawDamage / 10) * 10);

    const shield = this.shields.get(defender.uid) ?? 0;
    const absorbed = Math.min(shield, damage);
    if (absorbed > 0) this.shields.set(defender.uid, shield - absorbed);
    const hpDamage = Math.min(defender.currentHp, damage - absorbed);
    defender.currentHp = Math.max(0, defender.currentHp - hpDamage);
    this.ensureUnitStats(attacker).damageDealt += hpDamage;
    this.ensureUnitStats(defender).hpLost += hpDamage;
  }

  private enemySummonPhase(maxActions: number, animate = true): void {
    let actions = 0;
    while (
      actions < maxActions &&
      this.enemyField.length < 3 &&
      this.enemyHand.length > 0
    ) {
      const card = this.enemyHand.shift()!;
      this.enemyField.push(card);
      this.ensureUnitStats(card);
      this.initializeUnit(card, "enemy");
      if (animate) {
        this.animationEvents.push({
          type: "summon",
          side: "enemy",
          cardUid: card.uid,
          cardId: card.cardId,
        });
      }
      actions += 1;
    }
  }

  private initializeUnit(card: CardInstance, side: BattleSide): void {
    const definition = getCardDefinition(card.cardId);
    const effect = definition.battleEffect;
    if (!effect) return;

    const allies = side === "player" ? this.playerField : this.enemyField;
    const enemies = side === "player" ? this.enemyField : this.playerField;
    if (effect === "heal_lowest_300") {
      const target = allies.reduce((lowest, candidate) =>
        candidate.currentHp < lowest.currentHp ? candidate : lowest,
      );
      const maxHp = this.getMaxHp(target);
      target.currentHp = Math.min(maxHp, target.currentHp + 300);
    } else if (effect === "burn_weakest_300" && enemies.length > 0) {
      const target = enemies.reduce((lowest, candidate) =>
        candidate.currentHp < lowest.currentHp ? candidate : lowest,
      );
      target.currentHp = Math.max(0, target.currentHp - 300);
    } else if (effect === "shield_self_400") {
      this.shields.set(card.uid, 400);
    } else if (effect === "rally_all_150") {
      for (const ally of allies) {
        this.attackBonuses.set(ally.uid, (this.attackBonuses.get(ally.uid) ?? 0) + 150);
      }
    }
  }

  private checkOutcome(): void {
    if (this.enemyField.length === 0) {
      this.outcome = "victory";
      return;
    }

    if (this.playerField.length === 0) this.outcome = "defeat";
  }

  private removeAllDead(): void {
    this.removeDead(this.playerField);
    this.removeDead(this.enemyField);
    this.removeDead(this.hand);
    this.removeDead(this.drawPile);
    this.removeDead(this.enemyHand);
    this.removeDead(this.enemyDrawPile);
  }

  private drawToFive(animate = true): void {
    while (this.hand.length < 5 && this.drawPile.length > 0) {
      const card = this.drawPile.shift()!;
      this.hand.push(card);
      if (animate) {
        this.animationEvents.push({
          type: "draw",
          side: "player",
          cardUid: card.uid,
          cardId: card.cardId,
        });
      }
    }
  }

  private drawEnemyToFive(animate = true): void {
    while (this.enemyHand.length < 5 && this.enemyDrawPile.length > 0) {
      const card = this.enemyDrawPile.shift()!;
      this.enemyHand.push(card);
      if (animate) {
        this.animationEvents.push({
          type: "draw",
          side: "enemy",
          cardUid: card.uid,
          cardId: card.cardId,
        });
      }
    }
  }

  private get summonedFieldCount(): number {
    return this.playerField.filter((card) => !card.isHero).length;
  }

  private removeFromHand(card: CardInstance): void {
    this.hand.splice(this.hand.indexOf(card), 1);
  }

  private removeFromField(card: CardInstance): void {
    this.playerField.splice(this.playerField.indexOf(card), 1);
  }

  private removeDead(cards: CardInstance[]): void {
    for (let index = cards.length - 1; index >= 0; index -= 1) {
      if (cards[index].currentHp <= 0) cards.splice(index, 1);
    }
  }

  private collectDestroyedEvents(): void {
    for (const card of [...this.playerField, ...this.enemyField]) {
      if (card.currentHp > 0) continue;
      this.animationEvents.push({
        type: "destroyed",
        side: this.enemyField.includes(card) ? "enemy" : "player",
        cardUid: card.uid,
        cardId: card.cardId,
      });
      this.ensureUnitStats(card).destroyed = true;
    }
  }

  private ensureUnitStats(card: CardInstance): BattleUnitStats {
    const existing = this.unitStats.get(card.uid);
    if (existing) return existing;
    const stats = { damageDealt: 0, hpLost: 0, destroyed: false };
    this.unitStats.set(card.uid, stats);
    return stats;
  }

  private isCardOnField(card: CardInstance): boolean {
    return this.playerField.includes(card) || this.enemyField.includes(card);
  }

  private setAnimationEvents(events: BattleAnimationEvent[]): void {
    this.animationEvents.length = 0;
    this.animationEvents.push(...events);
  }

  private getMaxHp(card: CardInstance): number {
    return card.isHero
      ? (this.combatBonuses.heroMaxHp ?? getCardDefinition(card.cardId).maxHp)
      : getCardDefinition(card.cardId).maxHp;
  }

  private isEnemyCard(card: CardInstance): boolean {
    return (
      this.enemyField.includes(card) ||
      this.enemyHand.includes(card) ||
      this.enemyDrawPile.includes(card)
    );
  }
}

function createEnemyBattleDeck(enemy: EnemyArchetype): CardInstance[] {
  const targetSize = Math.max(
    enemy.deck.length,
    Math.min(14, enemy.deck.length + Math.max(0, enemy.threat - 1) * 2),
  );
  return Array.from({ length: targetSize }, (_, index) =>
    createCardInstance(enemy.deck[index % enemy.deck.length]),
  );
}

function shuffleCards(cards: CardInstance[]): CardInstance[] {
  const shuffled = [...cards];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}
