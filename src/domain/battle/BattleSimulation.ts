import { contentPack } from "../../content/content";
import type { EnemyArchetype } from "../content/schemas";
import {
  createCardInstance,
  getCardDefinition,
  type CardInstance,
} from "../cards/CardInstance";
import type { TerrainBattleModifiers } from "../world/WorldTerrain";
import {
  getLeaderCommand,
  getLeaderCommandProgression,
  getLeaderCommands,
  getLeaderCommandValue,
  type LeaderCommandDefinition,
} from "./LeaderCommands";

export type BattleOutcome = "active" | "victory" | "defeat";
export type BattleSide = "player" | "enemy";
export type LeaderActionId = string;

export interface BattleReward {
  gold: number;
  cardId: string | null;
  capturedCardIds?: string[];
  items: Array<{ itemId: string; quantity: number }>;
}

export interface BattleUnitStats {
  damageDealt: number;
  hpLost: number;
  destroyed: boolean;
  wounded: boolean;
}

export interface CombatBonuses {
  heroAtk: number;
  heroDef: number;
  heroInitiative?: number;
  heroMaxHp?: number;
  fieldSlots?: number;
  woundSurvivalChance?: number;
}

export interface EnemyScalingContext {
  playerLevel: number;
  warbandThreat: number;
  rewardGoldMultiplier?: number;
  itemChanceBonus?: number;
  captureChanceBonus?: number;
}

const DEFAULT_TERRAIN_MODIFIERS: TerrainBattleModifiers = {
  terrain: "plains",
  playerAttack: 1,
  playerDefense: 1,
  enemyAttack: 1,
  enemyDefense: 1,
};
const HAND_LIMIT = 7;

interface PlannedAttack {
  attacker: CardInstance;
  defender: CardInstance | null;
  defendingSide: BattleSide;
  initiative: number;
}

export type BattleAnimationEvent =
  | { type: "draw" | "summon" | "recall"; side: BattleSide; cardUid: string; cardId: string }
  | { type: "attack"; attackerUids: string[]; defenderUids: string[]; simultaneous: boolean; initiative: number }
  | { type: "destroyed"; side: BattleSide; cardUid: string; cardId: string }
  | {
      type: "leaderAction";
      side: BattleSide;
      cardUid: string;
      actionId: LeaderActionId;
      affectedUids: string[];
    };

export class BattleSimulation {
  readonly hand: CardInstance[] = [];
  readonly playerField: CardInstance[] = [];
  readonly enemyField: CardInstance[] = [];
  readonly drawPile: CardInstance[];
  readonly enemyHand: CardInstance[] = [];
  readonly enemyDrawPile: CardInstance[];
  readonly enemyLeader: CardInstance;
  readonly playerFieldSlots: number;
  readonly enemyFieldSlots: number;
  readonly deployedUnitUids = new Set<string>();
  readonly combatLog: string[] = [];
  readonly animationEvents: BattleAnimationEvent[] = [];
  readonly unitStats = new Map<string, BattleUnitStats>();
  readonly defeatedEnemyCardIds: string[] = [];
  private readonly rewardGoldMultiplier: number;
  private readonly itemChanceBonus: number;
  private readonly captureChanceBonus: number;
  private readonly defeatedEnemyUids = new Set<string>();
  private readonly attackBonuses = new Map<string, number>();
  private readonly defenseBonuses = new Map<string, number>();
  private readonly shields = new Map<string, number>();
  turn = 1;
  actionsRemaining: number = contentPack.combatRules.summonsPerTurn;
  selectedLeaderAction: LeaderActionId | null = null;
  selectedLeaderTargetUid: string | null = null;
  outcome: BattleOutcome = "active";
  message: string | null = null;

  constructor(
    readonly playerDeck: CardInstance[],
    readonly enemy: EnemyArchetype,
    readonly hero: CardInstance,
    private readonly combatBonuses: CombatBonuses = { heroAtk: 0, heroDef: 0 },
    readonly terrainModifiers: TerrainBattleModifiers = DEFAULT_TERRAIN_MODIFIERS,
    enemyDeckOverride?: CardInstance[],
    enemyScaling: EnemyScalingContext = { playerLevel: 1, warbandThreat: 1 },
  ) {
    this.rewardGoldMultiplier = enemyScaling.rewardGoldMultiplier ?? 1;
    this.itemChanceBonus = enemyScaling.itemChanceBonus ?? 0;
    this.captureChanceBonus = enemyScaling.captureChanceBonus ?? 0;
    this.playerFieldSlots = Math.max(3, Math.min(7, combatBonuses.fieldSlots ?? 3));
    this.enemyFieldSlots = Math.max(2, Math.min(7, 2 + enemy.threat));
    this.drawPile = shuffleCards(playerDeck.filter((card) => card.currentHp > 0));
    const enemyDeck = enemyDeckOverride ?? createEnemyBattleDeck(enemy, enemyScaling);
    const enemyLeaderId = enemy.leaderCardId ?? selectLeaderCardId(enemyDeck.map((card) => card.cardId));
    this.enemyLeader = createCardInstance(enemyLeaderId, { isHero: true });
    this.enemyLeader.level = enemy.leaderLevel ?? Math.max(1, Math.floor((enemyScaling.playerLevel + 1) / 3), enemy.threat);
    this.enemyDrawPile = shuffleCards(enemyDeck);
    this.ensureUnitStats(hero);
    this.ensureUnitStats(this.enemyLeader);
    this.drawToOpeningHand(false);
    this.drawEnemyToOpeningHand(false);
    this.enemyTacticalPhase(false);
    this.checkOutcome();
  }

  get summonsRemaining(): number { return this.actionsRemaining; }
  get handLimit(): number { return HAND_LIMIT; }

  summon(handUid: string): boolean {
    this.resetActionFeedback();
    if (this.outcome !== "active" || this.actionsRemaining <= 0) return false;
    if (this.playerField.length >= this.playerFieldSlots) { this.message = "fieldFull"; return false; }
    const card = this.hand.find((candidate) => candidate.uid === handUid);
    if (!card) return false;
    this.hand.splice(this.hand.indexOf(card), 1);
    this.playerField.push(card);
    this.ensureUnitStats(card);
    this.deployedUnitUids.add(card.uid);
    this.initializeUnit(card, "player");
    this.actionsRemaining -= 1;
    this.animationEvents.push({ type: "summon", side: "player", cardUid: card.uid, cardId: card.cardId });
    return true;
  }

  recall(fieldUid: string): boolean {
    this.resetActionFeedback();
    if (this.outcome !== "active" || this.actionsRemaining <= 0 || this.hand.length >= HAND_LIMIT) return false;
    const card = this.playerField.find((candidate) => candidate.uid === fieldUid);
    if (!card) return false;
    this.playerField.splice(this.playerField.indexOf(card), 1);
    this.hand.push(card);
    this.actionsRemaining -= 1;
    this.animationEvents.push({ type: "recall", side: "player", cardUid: card.uid, cardId: card.cardId });
    return true;
  }

  drawCard(): boolean {
    this.resetActionFeedback();
    if (this.outcome !== "active" || this.actionsRemaining <= 0) return false;
    if (this.hand.length >= HAND_LIMIT) { this.message = "handFull"; return false; }
    const card = this.drawPile.shift();
    if (!card) { this.message = "drawPileEmpty"; return false; }
    this.hand.push(card);
    this.actionsRemaining -= 1;
    this.animationEvents.push({ type: "draw", side: "player", cardUid: card.uid, cardId: card.cardId });
    return true;
  }

  commitLeaderAction(actionId: LeaderActionId, targetUid?: string): boolean {
    this.resetActionFeedback();
    if (this.outcome !== "active" || this.actionsRemaining <= 0 || this.selectedLeaderAction) return false;
    if (!this.availableLeaderActions.some((command) => command.id === actionId)) return false;
    const command = this.availableLeaderActions.find((candidate) => candidate.id === actionId)!;
    if (command.effect === "attack") {
      const livingEnemies = this.enemyField.filter((card) => card.currentHp > 0);
      const validTarget = livingEnemies.some((card) => card.uid === targetUid)
        || (livingEnemies.length === 0 && this.enemyLeader.uid === targetUid);
      if (!validTarget) return false;
      this.selectedLeaderTargetUid = targetUid ?? null;
    }
    if (command.effect === "healLowest" && targetUid) {
      const validTarget = [this.hero, ...this.playerField].some((card) => card.uid === targetUid && card.currentHp > 0);
      if (!validTarget) return false;
      this.selectedLeaderTargetUid = targetUid;
    }
    this.selectedLeaderAction = actionId;
    this.actionsRemaining -= 1;
    return true;
  }

  get availableLeaderActions(): LeaderCommandDefinition[] {
    return getLeaderCommands(getCardDefinition(this.hero.cardId).race, this.hero.level);
  }

  get leaderActionProgression(): LeaderCommandDefinition[] {
    return getLeaderCommandProgression(getCardDefinition(this.hero.cardId).race);
  }

  getShield(uid: string): number { return this.shields.get(uid) ?? 0; }

  getAttack(card: CardInstance): number {
    const base = getCardDefinition(card.cardId).atk + (card === this.hero ? this.combatBonuses.heroAtk : 0);
    return Math.round(base * (this.isEnemyCard(card) ? this.terrainModifiers.enemyAttack : this.terrainModifiers.playerAttack));
  }

  getDefense(card: CardInstance): number {
    const base = getCardDefinition(card.cardId).def + (card === this.hero ? this.combatBonuses.heroDef : 0) + (this.defenseBonuses.get(card.uid) ?? 0);
    return Math.round(base * (this.isEnemyCard(card) ? this.terrainModifiers.enemyDefense : this.terrainModifiers.playerDefense));
  }

  getMaxHp(card: CardInstance): number {
    return card === this.hero ? (this.combatBonuses.heroMaxHp ?? getCardDefinition(card.cardId).maxHp) : getCardDefinition(card.cardId).maxHp;
  }

  getInitiative(card: CardInstance): number {
    return getCardDefinition(card.cardId).initiative + Math.floor((card.level - 1) / 2) + (card === this.hero ? this.combatBonuses.heroInitiative ?? 0 : 0);
  }

  resolveRound(): void {
    if (this.outcome !== "active") return;
    this.message = null;
    this.animationEvents.length = 0;
    this.enemyTacticalPhase();
    const attacks = [
      ...this.planAttacks(this.playerField, "enemy"),
      ...this.planAttacks(this.enemyField, "player"),
    ];
    if (this.selectedLeaderAction === "attack") attacks.push(this.planLeaderAttack(this.hero, "enemy", this.selectedLeaderTargetUid));
    else if (this.selectedLeaderAction) this.applyLeaderAction(this.selectedLeaderAction, "player");
    const enemyAction = this.chooseEnemyLeaderAction();
    if (enemyAction === "attack") attacks.push(this.planLeaderAttack(this.enemyLeader, "player"));
    else this.applyLeaderAction(enemyAction, "enemy");

    const groups = new Map<number, PlannedAttack[]>();
    for (const attack of attacks.sort((a, b) => b.initiative - a.initiative)) {
      const group = groups.get(attack.initiative) ?? [];
      group.push(attack); groups.set(attack.initiative, group);
    }
    for (const [initiative, group] of groups) {
      const active = group.filter(({ attacker }) => attacker.currentHp > 0 && this.isCombatantActive(attacker));
      if (!active.length) continue;
      for (const attack of active) {
        if (attack.defender && attack.defender.currentHp <= 0) {
          attack.defender = this.chooseTarget(attack.attacker, attack.defendingSide);
        }
        this.applyAttack(attack);
      }
      this.animationEvents.push({ type: "attack", attackerUids: active.map((a) => a.attacker.uid), defenderUids: active.map((a) => a.defender?.uid ?? this.getLeader(a.defendingSide).uid), simultaneous: active.length > 1, initiative });
      this.collectDestroyedEvents();
      this.removeAllDead();
      this.checkOutcome();
      if (this.outcome !== "active") return;
    }
    this.turn += 1;
    this.actionsRemaining = contentPack.combatRules.summonsPerTurn;
    this.selectedLeaderAction = null;
    this.selectedLeaderTargetUid = null;
    this.attackBonuses.clear();
    this.defenseBonuses.clear();
    this.drawNaturalCard();
    this.drawEnemyNaturalCard();
    this.checkOutcome();
  }

  rollReward(): BattleReward {
    const rules = contentPack.combatRules.rewards;
    const defeatedCount = this.defeatedEnemyCardIds.length;
    const gold = Math.round(Math.max(
      this.enemy.goldReward,
      rules.baseGold + this.enemy.threat * rules.goldPerThreat + defeatedCount * rules.goldPerDefeatedUnit,
    ) * this.rewardGoldMultiplier);
    const captures = this.rollCapturedUnits(rules);
    const items = this.rollLootItems(rules);
    return { gold, cardId: captures[0] ?? null, capturedCardIds: captures, items };
  }

  private rollCapturedUnits(rules: typeof contentPack.combatRules.rewards): string[] {
    const candidates = [...this.defeatedEnemyCardIds].sort(() => Math.random() - 0.5);
    const captures: string[] = [];
    const groupBonus = Math.max(0, candidates.length - 1) * rules.captureChancePerDefeatedUnit;
    for (const cardId of candidates) {
      if (captures.length >= rules.maximumCaptures) break;
      const tier = getCardDefinition(cardId).tier;
      const chance = Math.max(0.05, Math.min(rules.captureChanceCap, rules.captureBaseChance + this.captureChanceBonus + groupBonus - Math.max(0, tier - 1) * rules.captureTierPenalty));
      if (Math.random() <= chance) captures.push(cardId);
    }
    if (!captures.length && candidates.length >= rules.guaranteedCaptureAfterDefeatedUnits) captures.push(candidates[0]);
    return captures;
  }

  private rollLootItems(rules: typeof contentPack.combatRules.rewards): Array<{ itemId: string; quantity: number }> {
    const rolled = this.enemy.itemDropTable
      .filter((entry) => Math.random() <= Math.min(0.95, entry.chance * rules.itemChanceMultiplier + rules.itemChanceBonus + this.itemChanceBonus))
      .map((entry) => ({ itemId: entry.itemId, quantity: entry.minimum + Math.floor(Math.random() * (entry.maximum - entry.minimum + 1)) }));
    while (rolled.length < rules.minimumItemRolls && this.enemy.itemDropTable.length) {
      const fallback = this.enemy.itemDropTable[Math.floor(Math.random() * this.enemy.itemDropTable.length)];
      rolled.push({ itemId: fallback.itemId, quantity: fallback.minimum + Math.floor(Math.random() * (fallback.maximum - fallback.minimum + 1)) });
    }
    const merged = new Map<string, number>();
    for (const item of rolled) merged.set(item.itemId, (merged.get(item.itemId) ?? 0) + item.quantity);
    return [...merged].map(([itemId, quantity]) => ({ itemId, quantity }));
  }

  private planAttacks(attackers: CardInstance[], defendingSide: BattleSide): PlannedAttack[] {
    return attackers.map((attacker) => ({ attacker, defender: this.chooseTarget(attacker, defendingSide), defendingSide, initiative: this.getInitiative(attacker) }));
  }

  private planLeaderAttack(attacker: CardInstance, defendingSide: BattleSide, preferredTargetUid?: string | null): PlannedAttack {
    const defenders = defendingSide === "player" ? this.playerField : this.enemyField;
    const preferredTarget = defenders.find((card) => card.uid === preferredTargetUid && card.currentHp > 0)
      ?? (defenders.every((card) => card.currentHp <= 0) && this.getLeader(defendingSide).uid === preferredTargetUid ? null : undefined);
    return {
      attacker,
      defender: preferredTarget === undefined ? this.chooseTarget(attacker, defendingSide) : preferredTarget,
      defendingSide,
      initiative: this.getInitiative(attacker),
    };
  }

  private chooseTarget(attacker: CardInstance, defendingSide: BattleSide): CardInstance | null {
    const defenders = (defendingSide === "player" ? this.playerField : this.enemyField)
      .filter((defender) => defender.currentHp > 0);
    if (!defenders.length) return null;
    const race = getCardDefinition(attacker.cardId).race;
    if (race === "beast") return [...defenders].sort((a, b) => a.currentHp - b.currentHp)[0];
    if (race === "elemental") return [...defenders].sort((a, b) => this.getDefense(a) - this.getDefense(b))[0];
    return defenders[Math.floor(Math.random() * defenders.length)];
  }

  private applyAttack({ attacker, defender, defendingSide }: PlannedAttack): void {
    const target = defender ?? this.getLeader(defendingSide);
    const attack = this.getAttack(attacker) + (this.attackBonuses.get(attacker.uid) ?? 0);
    const damage = this.calculateDamage(attack, this.getDefense(target));
    const shield = this.shields.get(target.uid) ?? 0;
    const absorbed = Math.min(shield, damage);
    if (absorbed) this.shields.set(target.uid, shield - absorbed);
    const afterShield = damage - absorbed;
    const hpDamage = Math.min(target.currentHp, afterShield);
    target.currentHp = Math.max(0, target.currentHp - hpDamage);
    this.ensureUnitStats(attacker).damageDealt += hpDamage;
    this.ensureUnitStats(target).hpLost += hpDamage;
    if (defender && afterShield > hpDamage) {
      const leader = this.getLeader(defendingSide);
      const piercing = Math.min(leader.currentHp, afterShield - hpDamage);
      leader.currentHp = Math.max(0, leader.currentHp - piercing);
      this.ensureUnitStats(attacker).damageDealt += piercing;
      this.ensureUnitStats(leader).hpLost += piercing;
    }
  }

  private calculateDamage(attack: number, defense: number): number {
    return Math.max(80, Math.round((attack * (1 - defense / (defense + 1400))) / 10) * 10);
  }

  private applyLeaderAction(actionId: LeaderActionId, side: BattleSide): void {
    const leader = this.getLeader(side);
    const allies = side === "player" ? this.playerField : this.enemyField;
    const definition = getLeaderCommand(actionId, getCardDefinition(leader.cardId).race);
    if (!definition) return;
    const value = getLeaderCommandValue(definition, leader.level);
    const affectedUids: string[] = [];
    if (definition.effect === "attackAll") for (const ally of allies) {
      this.attackBonuses.set(ally.uid, (this.attackBonuses.get(ally.uid) ?? 0) + value);
      affectedUids.push(ally.uid);
    }
    if (definition.effect === "defenseAll") for (const ally of allies) {
      this.defenseBonuses.set(ally.uid, (this.defenseBonuses.get(ally.uid) ?? 0) + value);
      affectedUids.push(ally.uid);
    }
    if (definition.effect === "shieldAll") for (const ally of allies) {
      this.shields.set(ally.uid, (this.shields.get(ally.uid) ?? 0) + value);
      affectedUids.push(ally.uid);
    }
    if (definition.effect === "healLowest") {
      const selectedTarget = side === "player"
        ? [leader, ...allies].find((candidate) => candidate.uid === this.selectedLeaderTargetUid)
        : undefined;
      const target = selectedTarget ?? (allies.length ? [...allies].sort((a, b) => a.currentHp - b.currentHp)[0] : leader);
      target.currentHp = Math.min(this.getMaxHp(target), target.currentHp + value);
      affectedUids.push(target.uid);
    }
    this.animationEvents.push({ type: "leaderAction", side, cardUid: leader.uid, actionId, affectedUids });
  }

  private chooseEnemyLeaderAction(): LeaderActionId {
    const commands = getLeaderCommands(getCardDefinition(this.enemyLeader.cardId).race, this.enemyLeader.level);
    const heal = commands.find((command) => command.effect === "healLowest");
    const offense = commands.find((command) => command.effect === "attackAll");
    if (heal && this.enemyLeader.currentHp < this.getMaxHp(this.enemyLeader) * 0.4) return heal.id;
    if (offense && this.enemyField.length >= 2 && this.turn % 3 === 0) return offense.id;
    return "attack";
  }

  private enemyTacticalPhase(animate = true): void {
    let actions = contentPack.combatRules.summonsPerTurn;
    while (actions > 0 && this.enemyField.length < this.enemyFieldSlots) {
      if (!this.enemyHand.length && this.enemyDrawPile.length) this.drawEnemyNaturalCard(animate);
      const card = this.enemyHand.shift();
      if (!card) break;
      this.enemyField.push(card); this.ensureUnitStats(card); this.initializeUnit(card, "enemy");
      if (animate) this.animationEvents.push({ type: "summon", side: "enemy", cardUid: card.uid, cardId: card.cardId });
      actions -= 1;
    }
  }

  private initializeUnit(card: CardInstance, side: BattleSide): void {
    const effect = getCardDefinition(card.cardId).battleEffect;
    if (!effect) return;
    const allies = side === "player" ? this.playerField : this.enemyField;
    const enemies = side === "player" ? this.enemyField : this.playerField;
    if (effect === "heal_lowest_300" && allies.length) {
      const target = [...allies].sort((a, b) => a.currentHp - b.currentHp)[0];
      target.currentHp = Math.min(this.getMaxHp(target), target.currentHp + 300);
    } else if (effect === "burn_weakest_300" && enemies.length) {
      const target = [...enemies].sort((a, b) => a.currentHp - b.currentHp)[0]; target.currentHp = Math.max(0, target.currentHp - 300);
    } else if (effect === "shield_self_400") this.shields.set(card.uid, 400);
    else if (effect === "rally_all_150") for (const ally of allies) this.attackBonuses.set(ally.uid, (this.attackBonuses.get(ally.uid) ?? 0) + 150);
    else if (effect === "human_guard_all_180") for (const ally of allies) this.defenseBonuses.set(ally.uid, (this.defenseBonuses.get(ally.uid) ?? 0) + 180);
    else if (effect === "human_first_aid_180" && allies.length) {
      const target = [...allies].sort((a, b) => a.currentHp / this.getMaxHp(a) - b.currentHp / this.getMaxHp(b))[0];
      target.currentHp = Math.min(this.getMaxHp(target), target.currentHp + 180);
    } else if (effect === "human_brace_160") for (const ally of allies) this.defenseBonuses.set(ally.uid, (this.defenseBonuses.get(ally.uid) ?? 0) + 160);
    else if (effect === "human_volley_120" && enemies.length) {
      const target = [...enemies].sort((a, b) => a.currentHp - b.currentHp)[0]; target.currentHp = Math.max(0, target.currentHp - 120);
    }
    else if (effect === "orc_rage_self_250") this.attackBonuses.set(card.uid, (this.attackBonuses.get(card.uid) ?? 0) + 250);
    else if (effect === "orc_bloodrage_180") this.attackBonuses.set(card.uid, (this.attackBonuses.get(card.uid) ?? 0) + 180);
    else if (effect === "orc_overrun_160" && enemies.length) {
      const target = [...enemies].sort((a, b) => a.currentHp - b.currentHp)[0]; target.currentHp = Math.max(0, target.currentHp - 160);
    }
    else if (effect === "kobold_pack_100") {
      const pack = allies.filter((ally) => getCardDefinition(ally.cardId).race === "kobold").length;
      this.attackBonuses.set(card.uid, (this.attackBonuses.get(card.uid) ?? 0) + pack * 100);
    } else if (effect === "kobold_trap_140" && enemies.length) {
      const target = [...enemies].sort((a, b) => this.getAttack(b) - this.getAttack(a))[0];
      this.attackBonuses.set(target.uid, (this.attackBonuses.get(target.uid) ?? 0) - 140);
    } else if (effect === "undead_drain_200" && enemies.length) {
      const target = [...enemies].sort((a, b) => a.currentHp - b.currentHp)[0];
      const drained = Math.min(200, target.currentHp);
      target.currentHp -= drained;
      card.currentHp = Math.min(this.getMaxHp(card), card.currentHp + drained);
    } else if (effect === "undead_reanimate_30") {
      this.shields.set(card.uid, Math.round(this.getMaxHp(card) * 0.3));
    } else if (effect === "machine_repair_180" && allies.length) {
      const target = [...allies].sort((a, b) => a.currentHp / this.getMaxHp(a) - b.currentHp / this.getMaxHp(b))[0];
      target.currentHp = Math.min(this.getMaxHp(target), target.currentHp + 180);
    } else if (effect === "machine_armor_all_140") for (const ally of allies) this.defenseBonuses.set(ally.uid, (this.defenseBonuses.get(ally.uid) ?? 0) + 140);
    else if (effect === "elemental_frost_140" && enemies.length) {
      const target = [...enemies].sort((a, b) => this.getAttack(b) - this.getAttack(a))[0];
      this.attackBonuses.set(target.uid, (this.attackBonuses.get(target.uid) ?? 0) - 140);
    } else if (effect === "elemental_chain_160") for (const enemy of enemies) enemy.currentHp = Math.max(0, enemy.currentHp - 160);
    else if (effect === "beast_first_strike_140" && enemies.length) {
      const target = [...enemies].sort((a, b) => a.currentHp - b.currentHp)[0]; target.currentHp = Math.max(0, target.currentHp - 140);
    } else if (effect === "beast_hunt_160" && enemies.some((enemy) => enemy.currentHp < this.getMaxHp(enemy))) {
      this.attackBonuses.set(card.uid, (this.attackBonuses.get(card.uid) ?? 0) + 160);
    } else if (effect === "beast_pack_120") for (const ally of allies) {
      if (getCardDefinition(ally.cardId).race === "beast") this.attackBonuses.set(ally.uid, (this.attackBonuses.get(ally.uid) ?? 0) + 120);
    }
  }

  private checkOutcome(): void {
    if (this.enemyLeader.currentHp <= 0 || this.totalLivingUnits("enemy") === 0) { this.outcome = "victory"; return; }
    if (this.hero.currentHp <= 0 || this.totalLivingUnits("player") === 0) this.outcome = "defeat";
  }

  private totalLivingUnits(side: BattleSide): number {
    const zones = side === "player" ? [this.playerField, this.hand, this.drawPile] : [this.enemyField, this.enemyHand, this.enemyDrawPile];
    return zones.flat().filter((card) => card.currentHp > 0).length;
  }

  private removeAllDead(): void {
    for (const cards of [this.playerField, this.enemyField, this.hand, this.drawPile, this.enemyHand, this.enemyDrawPile]) {
      for (let i = cards.length - 1; i >= 0; i--) if (cards[i].currentHp <= 0) cards.splice(i, 1);
    }
  }

  private collectDestroyedEvents(): void {
    for (const [side, cards] of [["player", this.playerField], ["enemy", this.enemyField]] as const) for (const card of cards) if (card.currentHp <= 0) {
      const stats = this.ensureUnitStats(card);
      if (stats.destroyed) continue;
      this.animationEvents.push({ type: "destroyed", side, cardUid: card.uid, cardId: card.cardId });
      stats.destroyed = true;
      stats.wounded = side === "player" && !card.isHero && Math.random() < (this.combatBonuses.woundSurvivalChance ?? 0);
      if (side === "enemy" && !this.defeatedEnemyUids.has(card.uid)) {
        this.defeatedEnemyUids.add(card.uid);
        this.defeatedEnemyCardIds.push(card.cardId);
      }
    }
  }

  private drawToOpeningHand(animate = true): void { while (this.hand.length < 5 && this.drawPile.length) this.drawNaturalCard(animate); }
  private drawEnemyToOpeningHand(animate = true): void { while (this.enemyHand.length < 5 && this.enemyDrawPile.length) this.drawEnemyNaturalCard(animate); }
  private drawNaturalCard(animate = true): void { if (this.hand.length >= HAND_LIMIT) return; const card = this.drawPile.shift(); if (!card) return; this.hand.push(card); if (animate) this.animationEvents.push({ type: "draw", side: "player", cardUid: card.uid, cardId: card.cardId }); }
  private drawEnemyNaturalCard(animate = true): void { if (this.enemyHand.length >= HAND_LIMIT) return; const card = this.enemyDrawPile.shift(); if (!card) return; this.enemyHand.push(card); if (animate) this.animationEvents.push({ type: "draw", side: "enemy", cardUid: card.uid, cardId: card.cardId }); }

  private ensureUnitStats(card: CardInstance): BattleUnitStats { const found = this.unitStats.get(card.uid); if (found) return found; const stats = { damageDealt: 0, hpLost: 0, destroyed: false, wounded: false }; this.unitStats.set(card.uid, stats); return stats; }
  private getLeader(side: BattleSide): CardInstance { return side === "player" ? this.hero : this.enemyLeader; }
  private isEnemyCard(card: CardInstance): boolean { return card === this.enemyLeader || this.enemyField.includes(card) || this.enemyHand.includes(card) || this.enemyDrawPile.includes(card); }
  private isCombatantActive(card: CardInstance): boolean { return card === this.hero || card === this.enemyLeader || this.playerField.includes(card) || this.enemyField.includes(card); }
  private resetActionFeedback(): void { this.message = null; this.animationEvents.length = 0; }
}

export function createEnemyBattleDeck(enemy: EnemyArchetype, scaling: EnemyScalingContext = { playerLevel: 1, warbandThreat: 1 }): CardInstance[] {
  const playerLevel = Math.max(1, scaling.playerLevel);
  const warbandThreat = Math.max(1, Math.min(5, scaling.warbandThreat));
  const maxTier = Math.min(5, 1 + Math.floor((playerLevel - 1) / 3) + Math.floor((enemy.threat - 1) / 2) + (warbandThreat >= 4 ? 1 : 0));
  const targetSize = Math.max(enemy.deck.length, Math.min(14, 3 + Math.floor((playerLevel - 1) / 2) + Math.max(0, enemy.threat - 1) + Math.floor((warbandThreat - 1) / 2)));
  const unitLevel = Math.max(1, Math.floor((playerLevel + 1) / 3));
  return Array.from({ length: targetSize }, (_, index) => {
    const baseId = enemy.deck[index % enemy.deck.length];
    const scaledId = followUpgradePath(baseId, maxTier, index + enemy.threat);
    const card = createCardInstance(scaledId);
    card.level = unitLevel;
    return card;
  });
}

function followUpgradePath(cardId: string, maxTier: number, seed: number): string {
  let currentId = cardId;
  const visited = new Set<string>();
  while (!visited.has(currentId)) {
    visited.add(currentId);
    const path = contentPack.unitUpgrades.find((upgrade) => upgrade.fromCardId === currentId);
    if (!path) break;
    const options = path.options.filter((id) => getCardDefinition(id).tier <= maxTier);
    if (!options.length) break;
    currentId = options[seed % options.length];
  }
  return currentId;
}

function selectLeaderCardId(deck: string[]): string {
  return [...deck].sort((a, b) => {
    const left = getCardDefinition(a); const right = getCardDefinition(b);
    return (right.tier * 10000 + right.atk + right.def) - (left.tier * 10000 + left.atk + left.def);
  })[0];
}

function shuffleCards(cards: CardInstance[]): CardInstance[] {
  const shuffled = [...cards];
  for (let index = shuffled.length - 1; index > 0; index--) { const swapIndex = Math.floor(Math.random() * (index + 1)); [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]; }
  return shuffled;
}
