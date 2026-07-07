import { contentPack } from "../../content/content";
import type { EnemyArchetype } from "../content/schemas";
import {
  createCardInstance,
  getCardDefinition,
  type CardInstance,
} from "../cards/CardInstance";
import type { TerrainBattleModifiers } from "../world/WorldTerrain";

export type BattleOutcome = "active" | "victory" | "defeat";
type BattleSide = "player" | "enemy";

export interface BattleReward {
  gold: number;
  cardId: string | null;
  items: Array<{ itemId: string; quantity: number }>;
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
}

export class BattleSimulation {
  readonly hand: CardInstance[] = [];
  readonly playerField: CardInstance[] = [];
  readonly enemyField: CardInstance[] = [];
  readonly drawPile: CardInstance[];
  readonly enemyHand: CardInstance[] = [];
  readonly enemyDrawPile: CardInstance[];
  readonly deployedUnitUids = new Set<string>();
  readonly combatLog: string[] = [];
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
  ) {
    this.drawPile = [...playerDeck.filter((card) => card.currentHp > 0)];
    this.enemyDrawPile = enemy.deck.map((cardId) => createCardInstance(cardId));
    this.playerField.push(hero);
    this.initializeUnit(hero, "player");
    this.drawToFive();
    this.drawEnemyToFive();
    this.enemySummonPhase(2);
  }

  summon(handUid: string): boolean {
    this.message = null;
    if (this.outcome !== "active" || this.summonsRemaining <= 0) return false;
    if (this.summonedFieldCount >= 3) {
      this.message = "fieldFull";
      return false;
    }

    const card = this.hand.find((candidate) => candidate.uid === handUid);
    if (!card) return false;

    this.removeFromHand(card);
    this.playerField.push(card);
    this.deployedUnitUids.add(card.uid);
    this.initializeUnit(card, "player");
    this.summonsRemaining -= 1;
    return true;
  }

  recall(fieldUid: string): boolean {
    this.message = null;
    if (this.outcome !== "active" || this.summonsRemaining <= 0) return false;
    const card = this.playerField.find((candidate) => candidate.uid === fieldUid);
    if (!card || card.isHero) return false;

    this.removeFromField(card);
    this.hand.push(card);
    this.summonsRemaining -= 1;
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

  resolveRound(): void {
    if (this.outcome !== "active") return;

    this.message = null;
    this.enemySummonPhase(contentPack.combatRules.summonsPerTurn);

    const attacks = [
      ...this.planAttacks(this.playerField, this.enemyField),
      ...this.planAttacks(this.enemyField, this.playerField),
    ];
    for (const attack of attacks) this.applyAttack(attack);

    this.removeAllDead();
    this.checkOutcome();
    if (this.outcome !== "active") return;

    this.turn += 1;
    this.summonsRemaining = contentPack.combatRules.summonsPerTurn;
    this.attackBonuses.clear();
    this.drawToFive();
    this.drawEnemyToFive();
  }

  rollReward(): BattleReward {
    const drop = this.enemy.dropTable.find((entry) => Math.random() <= entry.chance);
    const items = this.enemy.itemDropTable
      .filter((entry) => Math.random() <= entry.chance)
      .map((entry) => ({
        itemId: entry.itemId,
        quantity:
          entry.minimum +
          Math.floor(Math.random() * (entry.maximum - entry.minimum + 1)),
      }));
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
    }));
  }

  private applyAttack({ attacker, defender }: PlannedAttack): void {
    const attack =
      this.getAttack(attacker) + (this.attackBonuses.get(attacker.uid) ?? 0);
    const defense = this.getDefense(defender);
    const defenseReduction =
      defense / (defense + 1400);
    const damage = Math.max(80, Math.floor(attack * (1 - defenseReduction)));

    const shield = this.shields.get(defender.uid) ?? 0;
    const absorbed = Math.min(shield, damage);
    if (absorbed > 0) this.shields.set(defender.uid, shield - absorbed);
    defender.currentHp = Math.max(0, defender.currentHp - (damage - absorbed));
  }

  private enemySummonPhase(maxActions: number): void {
    let actions = 0;
    while (
      actions < maxActions &&
      this.enemyField.length < 3 &&
      this.enemyHand.length > 0
    ) {
      const card = this.enemyHand.shift()!;
      this.enemyField.push(card);
      this.initializeUnit(card, "enemy");
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
    const enemyLiving =
      this.enemyField.length + this.enemyHand.length + this.enemyDrawPile.length;
    if (enemyLiving === 0) {
      this.outcome = "victory";
      return;
    }

    if (!this.playerField.some((card) => card.isHero)) {
      this.outcome = "defeat";
      return;
    }

    const playerLiving =
      this.playerField.length + this.hand.length + this.drawPile.length;
    if (playerLiving === 0) this.outcome = "defeat";
  }

  private removeAllDead(): void {
    this.removeDead(this.playerField);
    this.removeDead(this.enemyField);
    this.removeDead(this.hand);
    this.removeDead(this.drawPile);
    this.removeDead(this.enemyHand);
    this.removeDead(this.enemyDrawPile);
  }

  private drawToFive(): void {
    while (this.hand.length < 5 && this.drawPile.length > 0) {
      this.hand.push(this.drawPile.shift()!);
    }
  }

  private drawEnemyToFive(): void {
    while (this.enemyHand.length < 5 && this.enemyDrawPile.length > 0) {
      this.enemyHand.push(this.enemyDrawPile.shift()!);
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
