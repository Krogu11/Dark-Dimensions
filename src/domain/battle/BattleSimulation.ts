import { abilitiesById, contentPack } from "../../content/content";
import type { AbilityDefinition, EnemyArchetype } from "../content/schemas";
import {
  createCardInstance,
  getCardDefinition,
  type CardInstance,
} from "../cards/CardInstance";
import type { TerrainBattleModifiers } from "../world/WorldTerrain";
import type { CardEffect } from "../content/schemas";
import { getCardEffects } from "./CardEffects";
import {
  getLeaderCommand,
  getLeaderCommandProgression,
  getLeaderCommands,
  getLeaderCommandValue,
  type LeaderCommandDefinition,
} from "./LeaderCommands";
import { getBattleKillXp } from "./BattleExperience";
import { rollEquipmentDrops } from "./EquipmentLoot";

export type BattleOutcome = "active" | "victory" | "defeat";
export type BattleSide = "player" | "enemy";
export type LeaderActionId = string;

export interface CommittedAbility {
  abilityId: string;
  targetUid?: string;
  actionCost: number;
}

interface ActiveAbilityStatus {
  abilityId: string;
  side: BattleSide;
  targetUid: string;
  type: "burn";
  value: number;
  remainingRounds: number;
}

export interface BattleReward {
  gold: number;
  cardId: string | null;
  capturedCardIds?: string[];
  items: Array<{ itemId: string; quantity: number }>;
  experience?: {
    characterXp: number;
    defeatedTierTotal: number;
    defeatedUnits: number;
    highestKillBonusXp: number;
    unitXp: number;
  };
}

export interface BattleUnitStats {
  damageDealt: number;
  hpLost: number;
  destroyed: boolean;
  wounded: boolean;
  kills: number;
  killXp: number;
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
  leaderActionId?: LeaderActionId;
  targetCounts?: Map<string, number>;
}

export interface BattleHitResult {
  attackerUid: string;
  attackerCardId: string;
  defenderUid: string;
  defenderCardId: string;
  attack: number;
  defense: number;
  damage: number;
  shieldAbsorbed: number;
  hpDamage: number;
  overkillTargetUid?: string;
  overkillDamage: number;
}

export interface BattleStatChange {
  uid: string;
  cardId: string;
  stat: "atk" | "def" | "initiative";
  before: number;
  after: number;
}

export interface BattleEffectResult {
  uid: string;
  cardId: string;
  hpBefore: number;
  hpAfter: number;
  shieldBefore: number;
  shieldAfter: number;
}

export type BattleAnimationEvent =
  | { type: "draw" | "summon" | "recall"; side: BattleSide; cardUid: string; cardId: string }
  | { type: "attack"; attackerUids: string[]; defenderUids: string[]; simultaneous: boolean; initiative: number; hits: BattleHitResult[] }
  | { type: "destroyed"; side: BattleSide; cardUid: string; cardId: string }
  | {
      type: "effect";
      side: BattleSide;
      cardUid: string;
      cardId: string;
      action: CardEffect["action"];
      affectedUids: string[];
      value: number;
      stat?: CardEffect["stat"];
      modifier?: CardEffect["modifier"];
      duration?: CardEffect["duration"];
      results: BattleEffectResult[];
      statChanges?: BattleStatChange[];
    }
  | {
      type: "leaderAction";
      side: BattleSide;
      cardUid: string;
      cardId: string;
      actionId: LeaderActionId;
      affectedUids: string[];
      value: number;
      statChanges?: BattleStatChange[];
      results?: BattleEffectResult[];
    };

export interface BattleHistoryEntry {
  round: number;
  event: BattleAnimationEvent;
}

export function getStrategicActionsForRound(round: number): number {
  const rules = contentPack.combatRules;
  const normalizedRound = Math.max(1, Math.floor(round));
  return Math.min(
    rules.maximumStrategicActions,
    rules.startingStrategicActions
      + (normalizedRound - 1) * rules.strategicActionsPerRound,
  );
}

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
  readonly combatHistory: BattleHistoryEntry[] = [];
  readonly unitStats = new Map<string, BattleUnitStats>();
  readonly defeatedEnemyCardIds: string[] = [];
  readonly queuedAbilities: CommittedAbility[] = [];
  readonly activeAbilityStatuses: ActiveAbilityStatus[] = [];
  private readonly rewardGoldMultiplier: number;
  private readonly itemChanceBonus: number;
  private readonly captureChanceBonus: number;
  private readonly defeatedEnemyUids = new Set<string>();
  private readonly attackBonuses = new Map<string, number>();
  private readonly defenseBonuses = new Map<string, number>();
  private readonly initiativeBonuses = new Map<string, number>();
  private readonly battleAttackBonuses = new Map<string, number>();
  private readonly battleDefenseBonuses = new Map<string, number>();
  private readonly battleInitiativeBonuses = new Map<string, number>();
  private readonly shields = new Map<string, number>();
  private readonly effectUseCounts = new Map<string, number>();
  private readonly deathEffectsProcessed = new Set<string>();
  private readonly deploymentRounds = new Map<string, number>();
  private readonly killCreditTargetUids = new Set<string>();
  private readonly lastDamageSourceByTargetUid = new Map<
    string,
    { side: BattleSide; uid: string }
  >();
  turn = 1;
  actionsRemaining: number = getStrategicActionsForRound(1);
  enemyActionsRemaining = 0;
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
    readonly equippedAbilityIds: string[] = [],
  ) {
    this.rewardGoldMultiplier = enemyScaling.rewardGoldMultiplier ?? 1;
    this.itemChanceBonus = enemyScaling.itemChanceBonus ?? 0;
    this.captureChanceBonus = enemyScaling.captureChanceBonus ?? 0;
    this.playerFieldSlots = contentPack.combatRules.fieldSlots;
    this.enemyFieldSlots = contentPack.combatRules.fieldSlots;
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
    this.enemyTacticalPhase(false, getStrategicActionsForRound(this.turn));
    this.enemyActionsRemaining = 0;
    this.checkOutcome();
  }

  get summonsRemaining(): number { return this.actionsRemaining; }
  get strategicActionsThisRound(): number { return getStrategicActionsForRound(this.turn); }
  get handLimit(): number { return HAND_LIMIT; }
  clearAnimationEvents(): void { this.animationEvents.length = 0; }
  isUnitReady(uid: string): boolean {
    const deploymentRound = this.deploymentRounds.get(uid);
    return deploymentRound === undefined || deploymentRound < this.turn;
  }

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
    this.deploymentRounds.set(card.uid, this.turn);
    this.recordEvent({ type: "summon", side: "player", cardUid: card.uid, cardId: card.cardId });
    this.initializeUnit(card, "player");
    this.actionsRemaining -= 1;
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
    this.recordEvent({ type: "recall", side: "player", cardUid: card.uid, cardId: card.cardId });
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
    this.recordEvent({ type: "draw", side: "player", cardUid: card.uid, cardId: card.cardId });
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

  get availableAbilities(): AbilityDefinition[] {
    return this.equippedAbilityIds
      .map((abilityId) => abilitiesById.get(abilityId))
      .filter((ability): ability is AbilityDefinition => Boolean(ability));
  }

  commitAbility(abilityId: string, targetUid?: string): boolean {
    this.resetActionFeedback();
    if (this.outcome !== "active") return false;
    const strategicAttack = abilityId === "strategic_attack";
    const definition = strategicAttack ? null : abilitiesById.get(abilityId);
    if (!strategicAttack && (!definition || !this.equippedAbilityIds.includes(abilityId))) return false;
    const actionCost = strategicAttack ? 1 : definition!.actionCost;
    const usesPerRound = strategicAttack ? 1 : definition!.usesPerRound;
    if (
      this.actionsRemaining < actionCost ||
      this.queuedAbilities.filter((entry) => entry.abilityId === abilityId).length >= usesPerRound
    ) return false;
    if (!this.isValidAbilityTarget(strategicAttack ? "enemy" : definition!.target, targetUid)) {
      this.message = "invalidAbilityTarget";
      return false;
    }
    this.queuedAbilities.push({ abilityId, targetUid, actionCost });
    this.actionsRemaining -= actionCost;
    return true;
  }

  cancelAbility(index: number): boolean {
    if (this.outcome !== "active") return false;
    const [removed] = this.queuedAbilities.splice(index, 1);
    if (!removed) return false;
    this.actionsRemaining = Math.min(this.strategicActionsThisRound, this.actionsRemaining + removed.actionCost);
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
    const base = getCardDefinition(card.cardId).atk + (card === this.hero ? this.combatBonuses.heroAtk : 0) + (this.attackBonuses.get(card.uid) ?? 0) + (this.battleAttackBonuses.get(card.uid) ?? 0);
    return Math.round(base * (this.isEnemyCard(card) ? this.terrainModifiers.enemyAttack : this.terrainModifiers.playerAttack));
  }

  getDefense(card: CardInstance): number {
    const base = getCardDefinition(card.cardId).def + (card === this.hero ? this.combatBonuses.heroDef : 0) + (this.defenseBonuses.get(card.uid) ?? 0) + (this.battleDefenseBonuses.get(card.uid) ?? 0);
    return Math.round(base * (this.isEnemyCard(card) ? this.terrainModifiers.enemyDefense : this.terrainModifiers.playerDefense));
  }

  getMaxHp(card: CardInstance): number {
    return card === this.hero ? (this.combatBonuses.heroMaxHp ?? getCardDefinition(card.cardId).maxHp) : getCardDefinition(card.cardId).maxHp;
  }

  getInitiative(card: CardInstance): number {
    return Math.max(1, getCardDefinition(card.cardId).initiative + Math.floor((card.level - 1) / 2) + (card === this.hero ? this.combatBonuses.heroInitiative ?? 0 : 0) + (this.initiativeBonuses.get(card.uid) ?? 0) + (this.battleInitiativeBonuses.get(card.uid) ?? 0));
  }

  resolveRound(): void {
    if (this.outcome !== "active") return;
    this.message = null;
    this.animationEvents.length = 0;
    this.enemyActionsRemaining = this.enemyTacticalPhase(true, this.enemyActionsRemaining);
    const resolvesAbilitiesBeforeCombat = this.activeAbilityStatuses.length > 0
      || this.queuedAbilities.some((entry) => entry.abilityId !== "strategic_attack");
    this.processAbilityStatuses();
    for (const committed of this.queuedAbilities) {
      if (committed.abilityId !== "strategic_attack") this.applyAbility(committed, "player");
    }
    if (resolvesAbilitiesBeforeCombat) {
      this.collectDestroyedEvents();
      this.removeAllDead();
      this.checkOutcome();
      if (this.outcome !== "active") return;
    }
    const attacks = [
      ...this.planAttacks(this.playerField, "enemy"),
      ...this.planAttacks(this.enemyField, "player"),
    ];
    for (const committed of this.queuedAbilities) {
      if (committed.abilityId === "strategic_attack") attacks.push(this.planLeaderAttack(this.hero, "enemy", committed.targetUid, "strategic_attack"));
    }
    if (this.selectedLeaderAction === "attack") attacks.push(this.planLeaderAttack(this.hero, "enemy", this.selectedLeaderTargetUid, "attack"));
    else if (this.selectedLeaderAction) this.applyLeaderAction(this.selectedLeaderAction, "player");
    const enemyAction = this.enemyActionsRemaining > 0 ? this.chooseEnemyLeaderAction() : null;
    if (enemyAction) {
      this.enemyActionsRemaining -= 1;
      if (enemyAction === "attack") attacks.push(this.planLeaderAttack(this.enemyLeader, "player", undefined, "attack"));
      else this.applyLeaderAction(enemyAction, "enemy");
    }

    const groups = new Map<number, PlannedAttack[]>();
    for (const attack of attacks.sort((a, b) => b.initiative - a.initiative)) {
      const group = groups.get(attack.initiative) ?? [];
      group.push(attack); groups.set(attack.initiative, group);
    }
    for (const [initiative, group] of groups) {
      const active = group.filter(({ attacker }) => attacker.currentHp > 0 && this.isCombatantActive(attacker));
      if (!active.length) continue;
      const hits: BattleHitResult[] = [];
      const followUpEffects: BattleAnimationEvent[] = [];
      for (const attack of active) {
        if (attack.defender && attack.defender.currentHp <= 0) {
          if (attack.targetCounts) {
            const previousCount = attack.targetCounts.get(attack.defender.uid) ?? 0;
            if (previousCount <= 1) attack.targetCounts.delete(attack.defender.uid);
            else attack.targetCounts.set(attack.defender.uid, previousCount - 1);
            attack.defender = this.chooseDistributedTarget(
              attack.attacker,
              attack.defendingSide,
              attack.targetCounts,
            );
            if (attack.defender) {
              attack.targetCounts.set(
                attack.defender.uid,
                (attack.targetCounts.get(attack.defender.uid) ?? 0) + 1,
              );
            }
          } else {
            attack.defender = this.chooseTarget(
              attack.attacker,
              attack.defendingSide,
            );
          }
        }
        if (attack.leaderActionId) {
          const target = attack.defender ?? this.getLeader(attack.defendingSide);
          this.recordEvent({
            type: "leaderAction",
            side: this.getSide(attack.attacker),
            cardUid: attack.attacker.uid,
            cardId: attack.attacker.cardId,
            actionId: attack.leaderActionId,
            affectedUids: [target.uid],
            value: this.getAttack(attack.attacker),
          });
        }
        hits.push(this.applyAttack(attack));
        this.triggerCardEffects(
          attack.attacker,
          this.getSide(attack.attacker),
          "onAttack",
          followUpEffects,
        );
      }
      this.recordEvent({ type: "attack", attackerUids: hits.map((hit) => hit.attackerUid), defenderUids: hits.map((hit) => hit.defenderUid), simultaneous: active.length > 1, initiative, hits });
      followUpEffects.forEach((event) => this.recordEvent(event));
      this.collectDestroyedEvents();
      this.removeAllDead();
      this.checkOutcome();
      if (this.outcome !== "active") return;
    }
    this.turn += 1;
    this.actionsRemaining = getStrategicActionsForRound(this.turn);
    this.enemyActionsRemaining = getStrategicActionsForRound(this.turn);
    this.selectedLeaderAction = null;
    this.selectedLeaderTargetUid = null;
    this.queuedAbilities.length = 0;
    this.attackBonuses.clear();
    this.defenseBonuses.clear();
    this.initiativeBonuses.clear();
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
    const regularDropTable = this.enemy.itemDropTable.filter(
      (entry) => contentPack.items.find((item) => item.id === entry.itemId)?.type !== "equipment",
    );
    const rolled = regularDropTable
      .filter((entry) => Math.random() <= Math.min(0.95, entry.chance * rules.itemChanceMultiplier + rules.itemChanceBonus + this.itemChanceBonus))
      .map((entry) => ({ itemId: entry.itemId, quantity: entry.minimum + Math.floor(Math.random() * (entry.maximum - entry.minimum + 1)) }));
    while (rolled.length < rules.minimumItemRolls && regularDropTable.length) {
      const fallback = regularDropTable[Math.floor(Math.random() * regularDropTable.length)];
      rolled.push({ itemId: fallback.itemId, quantity: fallback.minimum + Math.floor(Math.random() * (fallback.maximum - fallback.minimum + 1)) });
    }
    rolled.push(...rollEquipmentDrops(this.enemy.threat, {
      chanceMultiplier: rules.itemChanceMultiplier,
      chanceBonus: rules.itemChanceBonus + this.itemChanceBonus,
    }));
    const merged = new Map<string, number>();
    for (const item of rolled) merged.set(item.itemId, (merged.get(item.itemId) ?? 0) + item.quantity);
    return [...merged].map(([itemId, quantity]) => ({ itemId, quantity }));
  }

  private planAttacks(attackers: CardInstance[], defendingSide: BattleSide): PlannedAttack[] {
    const targetCounts = new Map<string, number>();
    return [...attackers]
      .filter((attacker) => this.isUnitReady(attacker.uid))
      .sort(
        (left, right) =>
          this.getInitiative(right) - this.getInitiative(left)
          || left.uid.localeCompare(right.uid),
      )
      .map((attacker) => {
        const defender = this.chooseDistributedTarget(
          attacker,
          defendingSide,
          targetCounts,
        );
        if (defender) {
          targetCounts.set(
            defender.uid,
            (targetCounts.get(defender.uid) ?? 0) + 1,
          );
        }
        return {
          attacker,
          defender,
          defendingSide,
          initiative: this.getInitiative(attacker),
          targetCounts,
        };
      });
  }

  private planLeaderAttack(attacker: CardInstance, defendingSide: BattleSide, preferredTargetUid?: string | null, leaderActionId?: LeaderActionId): PlannedAttack {
    const defenders = defendingSide === "player" ? this.playerField : this.enemyField;
    const preferredTarget = defenders.find((card) => card.uid === preferredTargetUid && card.currentHp > 0)
      ?? (defenders.every((card) => card.currentHp <= 0) && this.getLeader(defendingSide).uid === preferredTargetUid ? null : undefined);
    return {
      attacker,
      defender: preferredTarget === undefined ? this.chooseTarget(attacker, defendingSide) : preferredTarget,
      defendingSide,
      initiative: this.getInitiative(attacker),
      leaderActionId,
    };
  }

  private chooseTarget(
    attacker: CardInstance,
    defendingSide: BattleSide,
    candidates?: CardInstance[],
  ): CardInstance | null {
    const defenders = (candidates ?? (defendingSide === "player" ? this.playerField : this.enemyField))
      .filter((defender) => defender.currentHp > 0);
    if (!defenders.length) return null;
    const race = getCardDefinition(attacker.cardId).race;
    const attack = this.getAttack(attacker);
    return [...defenders].sort((left, right) => {
      const score = (target: CardInstance): number => {
        const maximumHp = this.getMaxHp(target);
        const healthRatio = target.currentHp / maximumHp;
        const expectedDamage = this.calculateDamage(attack, this.getDefense(target));
        const lethalValue = expectedDamage >= target.currentHp ? 10_000 : 0;
        const woundedValue = (1 - healthRatio) * (race === "beast" ? 2_000 : 1_150);
        const threatValue = this.getAttack(target) * 0.32 + this.getInitiative(target) * 24;
        const exposedValue = race === "elemental" ? Math.max(0, 900 - this.getDefense(target)) * 0.45 : 0;
        return lethalValue + woundedValue + threatValue + exposedValue;
      };
      return score(right) - score(left) || left.uid.localeCompare(right.uid);
    })[0];
  }

  private chooseDistributedTarget(
    attacker: CardInstance,
    defendingSide: BattleSide,
    targetCounts: Map<string, number>,
  ): CardInstance | null {
    const defenders = (defendingSide === "player" ? this.playerField : this.enemyField)
      .filter((defender) => defender.currentHp > 0);
    if (!defenders.length) return null;
    const minimumTargets = Math.min(
      ...defenders.map((defender) => targetCounts.get(defender.uid) ?? 0),
    );
    return this.chooseTarget(
      attacker,
      defendingSide,
      defenders.filter(
        (defender) =>
          (targetCounts.get(defender.uid) ?? 0) === minimumTargets,
      ),
    );
  }

  private applyAttack({ attacker, defender, defendingSide }: PlannedAttack): BattleHitResult {
    const target = defender ?? this.getLeader(defendingSide);
    const attack = this.getAttack(attacker);
    const defense = this.getDefense(target);
    const damage = this.calculateDamage(attack, defense);
    const shield = this.shields.get(target.uid) ?? 0;
    const absorbed = Math.min(shield, damage);
    if (absorbed) this.shields.set(target.uid, shield - absorbed);
    const afterShield = damage - absorbed;
    const hpDamage = Math.min(target.currentHp, afterShield);
    target.currentHp = Math.max(0, target.currentHp - hpDamage);
    if (hpDamage > 0) {
      this.lastDamageSourceByTargetUid.set(target.uid, {
        side: this.getSide(attacker),
        uid: attacker.uid,
      });
    }
    this.ensureUnitStats(attacker).damageDealt += hpDamage;
    this.ensureUnitStats(target).hpLost += hpDamage;
    let overkillDamage = 0;
    if (defender && afterShield > hpDamage) {
      const leader = this.getLeader(defendingSide);
      const piercing = Math.min(leader.currentHp, afterShield - hpDamage);
      leader.currentHp = Math.max(0, leader.currentHp - piercing);
      if (piercing > 0) {
        this.lastDamageSourceByTargetUid.set(leader.uid, {
          side: this.getSide(attacker),
          uid: attacker.uid,
        });
      }
      this.ensureUnitStats(attacker).damageDealt += piercing;
      this.ensureUnitStats(leader).hpLost += piercing;
      overkillDamage = piercing;
    }
    if (target.currentHp <= 0 && target === this.getLeader(defendingSide)) {
      this.creditKill(attacker.uid, this.getSide(attacker), target);
    }
    if (
      overkillDamage > 0 &&
      this.getLeader(defendingSide).currentHp <= 0
    ) {
      this.creditKill(
        attacker.uid,
        this.getSide(attacker),
        this.getLeader(defendingSide),
      );
    }
    return {
      attackerUid: attacker.uid,
      attackerCardId: attacker.cardId,
      defenderUid: target.uid,
      defenderCardId: target.cardId,
      attack,
      defense,
      damage,
      shieldAbsorbed: absorbed,
      hpDamage,
      overkillTargetUid: overkillDamage > 0 ? this.getLeader(defendingSide).uid : undefined,
      overkillDamage,
    };
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
    const statChanges: BattleStatChange[] = [];
    const results: BattleEffectResult[] = [];
    if (definition.effect === "attackAll") for (const ally of allies) {
      const before = this.getAttack(ally);
      this.attackBonuses.set(ally.uid, (this.attackBonuses.get(ally.uid) ?? 0) + value);
      affectedUids.push(ally.uid);
      statChanges.push({ uid: ally.uid, cardId: ally.cardId, stat: "atk", before, after: this.getAttack(ally) });
    }
    if (definition.effect === "defenseAll") for (const ally of allies) {
      const before = this.getDefense(ally);
      this.defenseBonuses.set(ally.uid, (this.defenseBonuses.get(ally.uid) ?? 0) + value);
      affectedUids.push(ally.uid);
      statChanges.push({ uid: ally.uid, cardId: ally.cardId, stat: "def", before, after: this.getDefense(ally) });
    }
    if (definition.effect === "shieldAll") for (const ally of allies) {
      const shieldBefore = this.getShield(ally.uid);
      this.shields.set(ally.uid, (this.shields.get(ally.uid) ?? 0) + value);
      affectedUids.push(ally.uid);
      results.push({ uid: ally.uid, cardId: ally.cardId, hpBefore: ally.currentHp, hpAfter: ally.currentHp, shieldBefore, shieldAfter: this.getShield(ally.uid) });
    }
    if (definition.effect === "healLowest") {
      const selectedTarget = side === "player"
        ? [leader, ...allies].find((candidate) => candidate.uid === this.selectedLeaderTargetUid)
        : undefined;
      const target = selectedTarget ?? (allies.length ? [...allies].sort((a, b) => a.currentHp - b.currentHp)[0] : leader);
      const hpBefore = target.currentHp;
      target.currentHp = Math.min(this.getMaxHp(target), target.currentHp + value);
      affectedUids.push(target.uid);
      results.push({ uid: target.uid, cardId: target.cardId, hpBefore, hpAfter: target.currentHp, shieldBefore: this.getShield(target.uid), shieldAfter: this.getShield(target.uid) });
    }
    this.recordEvent({ type: "leaderAction", side, cardUid: leader.uid, cardId: leader.cardId, actionId, affectedUids, value, statChanges: statChanges.length ? statChanges : undefined, results: results.length ? results : undefined });
  }

  private isValidAbilityTarget(target: AbilityDefinition["target"], targetUid?: string): boolean {
    if (target === "allAllies" || target === "allEnemies") return targetUid === undefined;
    if (!targetUid) return false;
    if (target === "ally") {
      return [this.hero, ...this.playerField].some((card) => card.uid === targetUid && card.currentHp > 0);
    }
    const livingEnemies = this.enemyField.filter((card) => card.currentHp > 0);
    return livingEnemies.some((card) => card.uid === targetUid)
      || (livingEnemies.length === 0 && this.enemyLeader.uid === targetUid);
  }

  private applyAbility(committed: CommittedAbility, side: BattleSide): void {
    const definition = abilitiesById.get(committed.abilityId);
    if (!definition) return;
    const targets = this.resolveAbilityTargets(definition, side, committed.targetUid);
    const results: BattleEffectResult[] = [];
    const statChanges: BattleStatChange[] = [];
    for (const effect of definition.effects) {
      for (const target of targets) {
        const hpBefore = target.currentHp;
        const shieldBefore = this.getShield(target.uid);
        if (effect.type === "heal") target.currentHp = Math.min(this.getMaxHp(target), target.currentHp + effect.value);
        if (effect.type === "damage" || effect.type === "burn") {
          this.applyDirectAbilityDamage(target, effect.value);
          if (effect.type === "burn" && effect.durationRounds) {
            this.activeAbilityStatuses.push({
              abilityId: definition.id,
              side,
              targetUid: target.uid,
              type: "burn",
              value: effect.value,
              remainingRounds: effect.durationRounds,
            });
          }
        }
        if (effect.type === "shield") this.shields.set(target.uid, shieldBefore + effect.value);
        if (effect.type === "modifyStat" && effect.stat) {
          const before = effect.stat === "atk" ? this.getAttack(target) : effect.stat === "def" ? this.getDefense(target) : this.getInitiative(target);
          const map = effect.durationRounds && effect.durationRounds > 1
            ? effect.stat === "atk" ? this.battleAttackBonuses : effect.stat === "def" ? this.battleDefenseBonuses : this.battleInitiativeBonuses
            : effect.stat === "atk" ? this.attackBonuses : effect.stat === "def" ? this.defenseBonuses : this.initiativeBonuses;
          map.set(target.uid, (map.get(target.uid) ?? 0) + effect.value);
          const after = effect.stat === "atk" ? this.getAttack(target) : effect.stat === "def" ? this.getDefense(target) : this.getInitiative(target);
          statChanges.push({ uid: target.uid, cardId: target.cardId, stat: effect.stat, before, after });
        }
        results.push({
          uid: target.uid,
          cardId: target.cardId,
          hpBefore,
          hpAfter: target.currentHp,
          shieldBefore,
          shieldAfter: this.getShield(target.uid),
        });
      }
    }
    this.recordEvent({
      type: "leaderAction",
      side,
      cardUid: this.getLeader(side).uid,
      cardId: this.getLeader(side).cardId,
      actionId: definition.id,
      affectedUids: targets.map((target) => target.uid),
      value: definition.effects[0]?.value ?? 0,
      statChanges: statChanges.length ? statChanges : undefined,
      results,
    });
  }

  private resolveAbilityTargets(definition: AbilityDefinition, side: BattleSide, targetUid?: string): CardInstance[] {
    const allies = side === "player" ? [this.hero, ...this.playerField] : [this.enemyLeader, ...this.enemyField];
    const enemies = side === "player" ? this.enemyField : this.playerField;
    if (definition.target === "allAllies") return allies.filter((card) => card.currentHp > 0);
    if (definition.target === "allEnemies") {
      const living = enemies.filter((card) => card.currentHp > 0);
      return living.length ? living : [this.getLeader(side === "player" ? "enemy" : "player")];
    }
    const selected = [...allies, ...enemies, this.hero, this.enemyLeader].find((card) => card.uid === targetUid && card.currentHp > 0);
    return selected ? [selected] : [];
  }

  private applyDirectAbilityDamage(target: CardInstance, value: number): void {
    const shield = this.getShield(target.uid);
    const absorbed = Math.min(shield, value);
    this.shields.set(target.uid, shield - absorbed);
    const hpDamage = value - absorbed;
    target.currentHp = Math.max(0, target.currentHp - hpDamage);
    const stats = this.ensureUnitStats(target);
    stats.hpLost += hpDamage;
  }

  private processAbilityStatuses(): void {
    for (const status of [...this.activeAbilityStatuses]) {
      const target = [this.hero, this.enemyLeader, ...this.playerField, ...this.enemyField].find((card) => card.uid === status.targetUid);
      if (!target || target.currentHp <= 0) {
        this.activeAbilityStatuses.splice(this.activeAbilityStatuses.indexOf(status), 1);
        continue;
      }
      const hpBefore = target.currentHp;
      const shieldBefore = this.getShield(target.uid);
      this.applyDirectAbilityDamage(target, status.value);
      this.recordEvent({
        type: "leaderAction",
        side: status.side,
        cardUid: this.getLeader(status.side).uid,
        cardId: this.getLeader(status.side).cardId,
        actionId: status.abilityId,
        affectedUids: [target.uid],
        value: status.value,
        results: [{
          uid: target.uid,
          cardId: target.cardId,
          hpBefore,
          hpAfter: target.currentHp,
          shieldBefore,
          shieldAfter: this.getShield(target.uid),
        }],
      });
      status.remainingRounds -= 1;
      if (status.remainingRounds <= 0) this.activeAbilityStatuses.splice(this.activeAbilityStatuses.indexOf(status), 1);
    }
  }

  private chooseEnemyLeaderAction(): LeaderActionId | null {
    const commands = getLeaderCommands(getCardDefinition(this.enemyLeader.cardId).race, this.enemyLeader.level);
    const heal = commands.find((command) => command.effect === "healLowest");
    const offense = commands.find((command) => command.effect === "attackAll");
    const defense = commands.find((command) => command.effect === "defenseAll" || command.effect === "shieldAll");
    const allies = [this.enemyLeader, ...this.enemyField];
    const lowestHealthRatio = Math.min(...allies.map((card) => card.currentHp / this.getMaxHp(card)));
    const averageFieldHealth = this.enemyField.length
      ? this.enemyField.reduce((sum, card) => sum + card.currentHp / this.getMaxHp(card), 0) / this.enemyField.length
      : 1;
    if (heal && lowestHealthRatio < 0.52) return heal.id;
    if (defense && this.enemyField.length >= 2 && averageFieldHealth < 0.72) return defense.id;
    if (offense && this.enemyField.length >= 2 && this.turn % 3 === 0 && averageFieldHealth > 0.72) return offense.id;
    const target = this.chooseTarget(this.enemyLeader, "player") ?? this.hero;
    const lethalAttack = this.calculateDamage(this.getAttack(this.enemyLeader), this.getDefense(target)) >= target.currentHp + this.getShield(target.uid);
    if (lethalAttack || this.turn % 2 === 0) return "attack";
    return null;
  }

  private enemyTacticalPhase(animate = true, availableActions = this.enemyActionsRemaining): number {
    let actions = availableActions;
    const recalledUids = new Set<string>();

    const healthyReplacementAvailable = (): boolean =>
      [...this.enemyHand, ...this.enemyDrawPile].some(
        (card) => card.currentHp / this.getMaxHp(card) > 0.45,
      );

    const retreatCandidates = [...this.enemyField]
      .filter((card) => card.currentHp / this.getMaxHp(card) <= 0.3)
      .sort(
        (left, right) =>
          left.currentHp / this.getMaxHp(left) - right.currentHp / this.getMaxHp(right),
      );
    for (const card of retreatCandidates) {
      if (actions < 2 || this.enemyHand.length >= HAND_LIMIT || !healthyReplacementAvailable()) break;
      this.enemyField.splice(this.enemyField.indexOf(card), 1);
      this.enemyHand.push(card);
      recalledUids.add(card.uid);
      if (animate) this.recordEvent({ type: "recall", side: "enemy", cardUid: card.uid, cardId: card.cardId });
      actions -= 1;
    }

    while (actions > 0 && this.enemyField.length < this.enemyFieldSlots) {
      if (!this.enemyHand.length && this.enemyDrawPile.length) {
        this.drawEnemyNaturalCard(animate);
        actions -= 1;
        if (actions <= 0) break;
      }
      const candidates = this.enemyHand.filter((card) => !recalledUids.has(card.uid));
      const card = [...candidates].sort(
        (left, right) => this.scoreEnemyDeployment(right) - this.scoreEnemyDeployment(left),
      )[0];
      if (!card) break;
      this.enemyHand.splice(this.enemyHand.indexOf(card), 1);
      this.enemyField.push(card); this.ensureUnitStats(card);
      this.deployedUnitUids.add(card.uid);
      this.deploymentRounds.set(card.uid, this.turn);
      if (animate) this.recordEvent({ type: "summon", side: "enemy", cardUid: card.uid, cardId: card.cardId });
      this.initializeUnit(card, "enemy");
      actions -= 1;
    }
    return actions;
  }

  private scoreEnemyDeployment(card: CardInstance): number {
    const definition = getCardDefinition(card.cardId);
    const healthRatio = card.currentHp / this.getMaxHp(card);
    const woundedAllies = this.enemyField.filter(
      (ally) => ally.currentHp / this.getMaxHp(ally) < 0.65,
    ).length;
    const effectValue = getCardEffects(definition).reduce((sum, effect) => {
      const triggerWeight = effect.trigger === "onSummon" ? 1 : effect.trigger === "onAttack" ? 1.35 : 0.75;
      const actionWeight = effect.action === "heal"
        ? Math.max(1, woundedAllies) * 1.1
        : effect.action === "draw"
          ? 240
          : effect.action === "returnToHand"
            ? 320
            : effect.action === "damage" && effect.target === "allEnemies"
              ? 1.8
              : 1;
      return sum + effect.value * triggerWeight * actionWeight;
    }, 0);
    return (
      this.getAttack(card) * 1.05 +
      this.getDefense(card) * 0.78 +
      this.getMaxHp(card) * 0.42 +
      this.getInitiative(card) * 32 +
      effectValue
    ) * (0.3 + healthRatio * 0.7);
  }

  private initializeUnit(card: CardInstance, side: BattleSide): void {
    this.deathEffectsProcessed.delete(card.uid);
    this.triggerCardEffects(card, side, "onSummon");
  }

  private triggerCardEffects(
    card: CardInstance,
    side: BattleSide,
    trigger: CardEffect["trigger"],
    eventSink?: BattleAnimationEvent[],
  ): void {
    const effects = getCardEffects(getCardDefinition(card.cardId));
    effects.forEach((effect, index) => {
      if (effect.trigger !== trigger || !this.effectConditionMet(effect, card, side)) return;
      const useKey = `${card.uid}:${index}`;
      const uses = this.effectUseCounts.get(useKey) ?? 0;
      if (effect.limitPerBattle && uses >= effect.limitPerBattle) return;

      const affectedUids: string[] = [];
      const results: BattleEffectResult[] = [];
      const statChanges: BattleStatChange[] = [];
      const sourceHpBefore = card.currentHp;
      const sourceShieldBefore = this.getShield(card.uid);
      let applied = false;
      if (effect.action === "draw") {
        for (let draw = 0; draw < effect.value; draw += 1) {
          const drawn = this.drawEffectCard(side);
          if (!drawn) break;
          affectedUids.push(drawn.uid);
          applied = true;
        }
      } else if (effect.action === "returnToHand") {
        const hpBefore = card.currentHp;
        const shieldBefore = this.getShield(card.uid);
        applied = this.returnCardToHand(card, side, effect.value);
        if (applied) {
          affectedUids.push(card.uid);
          results.push({
            uid: card.uid,
            cardId: card.cardId,
            hpBefore,
            hpAfter: card.currentHp,
            shieldBefore,
            shieldAfter: this.getShield(card.uid),
          });
        }
      } else {
        const targets = this.resolveEffectTargets(effect, card, side);
        for (const target of targets) {
          const value = this.resolveEffectValue(effect, target);
          const hpBefore = target.currentHp;
          const shieldBefore = this.getShield(target.uid);
          const statBefore = effect.action === "modifyStat"
            ? effect.stat === "def" ? this.getDefense(target) : effect.stat === "initiative" ? this.getInitiative(target) : this.getAttack(target)
            : undefined;
          if (this.applyCardEffect(effect, card, target, side, value)) {
            affectedUids.push(target.uid);
            results.push({ uid: target.uid, cardId: target.cardId, hpBefore, hpAfter: target.currentHp, shieldBefore, shieldAfter: this.getShield(target.uid) });
            if (effect.action === "modifyStat" && effect.stat && statBefore !== undefined) {
              const after = effect.stat === "def" ? this.getDefense(target) : effect.stat === "initiative" ? this.getInitiative(target) : this.getAttack(target);
              statChanges.push({ uid: target.uid, cardId: target.cardId, stat: effect.stat, before: statBefore, after });
            }
            applied = true;
          }
        }
        if (effect.action === "drain" && card.currentHp !== sourceHpBefore) {
          affectedUids.push(card.uid);
          results.push({
            uid: card.uid,
            cardId: card.cardId,
            hpBefore: sourceHpBefore,
            hpAfter: card.currentHp,
            shieldBefore: sourceShieldBefore,
            shieldAfter: this.getShield(card.uid),
          });
        }
      }

      if (!applied) return;
      this.effectUseCounts.set(useKey, uses + 1);
      const animationEvent: BattleAnimationEvent = {
        type: "effect",
        side,
        cardUid: card.uid,
        cardId: card.cardId,
        action: effect.action,
        affectedUids,
        value: effect.value,
        stat: effect.stat,
        modifier: effect.modifier,
        duration: effect.duration,
        results,
        statChanges: statChanges.length ? statChanges : undefined,
      };
      if (eventSink) eventSink.push(animationEvent);
      else this.recordEvent(animationEvent);
    });
  }

  private effectConditionMet(effect: CardEffect, source: CardInstance, side: BattleSide): boolean {
    if (!effect.condition) return true;
    if (effect.condition === "selfBelowHalf") return source.currentHp > 0 && source.currentHp / this.getMaxHp(source) < 0.5;
    if (effect.condition === "enemyWounded") {
      const enemies = side === "player" ? this.enemyField : this.playerField;
      return enemies.some((card) => card.currentHp > 0 && card.currentHp < this.getMaxHp(card));
    }
    const race = getCardDefinition(source.cardId).race;
    const allies = side === "player" ? this.playerField : this.enemyField;
    return allies.filter((card) => card.currentHp > 0 && getCardDefinition(card.cardId).race === race).length >= (effect.conditionValue ?? 1);
  }

  private resolveEffectTargets(effect: CardEffect, source: CardInstance, side: BattleSide): CardInstance[] {
    const allyField = (side === "player" ? this.playerField : this.enemyField).filter((card) => card.currentHp > 0);
    const allyHand = (side === "player" ? this.hand : this.enemyHand).filter((card) => card.currentHp > 0);
    const enemyField = (side === "player" ? this.enemyField : this.playerField).filter((card) => card.currentHp > 0);
    const enemies = enemyField.length ? enemyField : [this.getLeader(side === "player" ? "enemy" : "player")].filter((card) => card.currentHp > 0);
    const zoneAllies = effect.zone === "hand"
      ? allyHand
      : effect.zone === "fieldAndHand"
        ? [...allyField, ...allyHand]
        : allyField;

    if (effect.target === "self") return source.currentHp > 0 || effect.trigger === "onDeath" ? [source] : [];
    if (effect.target === "lowestAlly") {
      const wounded = zoneAllies.filter((card) => card.currentHp < this.getMaxHp(card));
      return wounded.length
        ? [[...wounded].sort((left, right) => left.currentHp / this.getMaxHp(left) - right.currentHp / this.getMaxHp(right))[0]]
        : [];
    }
    if (effect.target === "weakestEnemy") return enemies.length
      ? [[...enemies].sort((left, right) => left.currentHp / this.getMaxHp(left) - right.currentHp / this.getMaxHp(right))[0]]
      : [];
    if (effect.target === "strongestEnemy") return enemies.length
      ? [[...enemies].sort((left, right) => this.getAttack(right) - this.getAttack(left) || this.getMaxHp(right) - this.getMaxHp(left))[0]]
      : [];
    if (effect.target === "allAllies") return zoneAllies;
    if (effect.target === "allEnemies") return enemies;
    if (effect.target === "sameRaceAllies") {
      const race = getCardDefinition(source.cardId).race;
      return zoneAllies.filter((card) => getCardDefinition(card.cardId).race === race);
    }
    if (effect.target === "randomEnemy") return enemies.length ? [enemies[Math.floor(Math.random() * enemies.length)]] : [];
    return [];
  }

  private resolveEffectValue(effect: CardEffect, target: CardInstance): number {
    return effect.valueMode === "percentMaxHp"
      ? Math.max(1, Math.round(this.getMaxHp(target) * effect.value / 100))
      : effect.value;
  }

  private applyCardEffect(effect: CardEffect, source: CardInstance, target: CardInstance, side: BattleSide, value: number): boolean {
    if (effect.action === "heal") {
      const previous = target.currentHp;
      target.currentHp = Math.min(this.getMaxHp(target), target.currentHp + value);
      return target.currentHp !== previous;
    }
    if (effect.action === "shield") {
      this.shields.set(target.uid, (this.shields.get(target.uid) ?? 0) + value);
      return true;
    }
    if (effect.action === "modifyStat") {
      const signedValue = effect.modifier === "decrease" ? -value : value;
      const map = effect.stat === "def"
        ? effect.duration === "battle" ? this.battleDefenseBonuses : this.defenseBonuses
        : effect.stat === "initiative"
          ? effect.duration === "battle" ? this.battleInitiativeBonuses : this.initiativeBonuses
          : effect.duration === "battle" ? this.battleAttackBonuses : this.attackBonuses;
      map.set(target.uid, (map.get(target.uid) ?? 0) + signedValue);
      return true;
    }
    if (effect.action === "damage" || effect.action === "drain") {
      const shield = this.shields.get(target.uid) ?? 0;
      const absorbed = Math.min(shield, value);
      if (absorbed) this.shields.set(target.uid, shield - absorbed);
      const hpDamage = Math.min(target.currentHp, value - absorbed);
      if (hpDamage > 0) {
        target.currentHp -= hpDamage;
        this.lastDamageSourceByTargetUid.set(target.uid, {
          side,
          uid: source.uid,
        });
        this.ensureUnitStats(source).damageDealt += hpDamage;
        this.ensureUnitStats(target).hpLost += hpDamage;
        if (effect.action === "drain" && source.currentHp > 0) source.currentHp = Math.min(this.getMaxHp(source), source.currentHp + hpDamage);
      }
      if (
        target.currentHp <= 0 &&
        (target === this.hero || target === this.enemyLeader)
      ) {
        this.creditKill(source.uid, side, target);
      }
      return absorbed > 0 || hpDamage > 0;
    }
    return false;
  }

  private returnCardToHand(card: CardInstance, side: BattleSide, healthPercent: number): boolean {
    const field = side === "player" ? this.playerField : this.enemyField;
    const hand = side === "player" ? this.hand : this.enemyHand;
    const index = field.indexOf(card);
    if (index < 0 || hand.length >= HAND_LIMIT) return false;
    field.splice(index, 1);
    card.currentHp = Math.max(1, Math.round(this.getMaxHp(card) * healthPercent / 100));
    hand.push(card);
    return true;
  }

  private drawEffectCard(side: BattleSide): CardInstance | null {
    const hand = side === "player" ? this.hand : this.enemyHand;
    const drawPile = side === "player" ? this.drawPile : this.enemyDrawPile;
    if (hand.length >= HAND_LIMIT) return null;
    const card = drawPile.shift();
    if (!card) return null;
    hand.push(card);
    return card;
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
    const processed = new Set<string>();
    while (true) {
      const destroyed = ([
        ["player", this.playerField],
        ["enemy", this.enemyField],
      ] as const).flatMap(([side, cards]) => cards
        .filter((card) => card.currentHp <= 0 && !processed.has(card.uid))
        .map((card) => ({ side, card })));
      if (!destroyed.length) break;
      for (const { side, card } of destroyed) {
        processed.add(card.uid);
        if (!this.deathEffectsProcessed.has(card.uid)) {
          this.deathEffectsProcessed.add(card.uid);
          this.triggerCardEffects(card, side, "onDeath");
        }
        if (card.currentHp > 0 || !(side === "player" ? this.playerField : this.enemyField).includes(card)) continue;
        const stats = this.ensureUnitStats(card);
        if (stats.destroyed) continue;
        this.recordEvent({ type: "destroyed", side, cardUid: card.uid, cardId: card.cardId });
        stats.destroyed = true;
        stats.wounded = side === "player" && !card.isHero && Math.random() < (this.combatBonuses.woundSurvivalChance ?? 0);
        if (side === "enemy" && !this.defeatedEnemyUids.has(card.uid)) {
          this.defeatedEnemyUids.add(card.uid);
          this.defeatedEnemyCardIds.push(card.cardId);
        }
        const source = this.lastDamageSourceByTargetUid.get(card.uid);
        if (source) this.creditKill(source.uid, source.side, card);
      }
    }
  }

  private creditKill(
    killerUid: string,
    killerSide: BattleSide,
    defeated: CardInstance,
  ): void {
    if (
      this.killCreditTargetUids.has(defeated.uid) ||
      killerSide === this.getSide(defeated)
    ) {
      return;
    }
    const killerStats = this.unitStats.get(killerUid);
    if (!killerStats) return;
    this.killCreditTargetUids.add(defeated.uid);
    killerStats.kills += 1;
    killerStats.killXp += getBattleKillXp(defeated.cardId);
  }

  private drawToOpeningHand(animate = true): void { while (this.hand.length < 5 && this.drawPile.length) this.drawNaturalCard(animate); }
  private drawEnemyToOpeningHand(animate = true): void { while (this.enemyHand.length < 5 && this.enemyDrawPile.length) this.drawEnemyNaturalCard(animate); }
  private drawNaturalCard(animate = true): void { if (this.hand.length >= HAND_LIMIT) return; const card = this.drawPile.shift(); if (!card) return; this.hand.push(card); if (animate) this.recordEvent({ type: "draw", side: "player", cardUid: card.uid, cardId: card.cardId }); }
  private drawEnemyNaturalCard(animate = true): void { if (this.enemyHand.length >= HAND_LIMIT) return; const card = this.enemyDrawPile.shift(); if (!card) return; this.enemyHand.push(card); if (animate) this.recordEvent({ type: "draw", side: "enemy", cardUid: card.uid, cardId: card.cardId }); }

  private ensureUnitStats(card: CardInstance): BattleUnitStats { const found = this.unitStats.get(card.uid); if (found) return found; const stats = { damageDealt: 0, hpLost: 0, destroyed: false, wounded: false, kills: 0, killXp: 0 }; this.unitStats.set(card.uid, stats); return stats; }
  private getLeader(side: BattleSide): CardInstance { return side === "player" ? this.hero : this.enemyLeader; }
  private getSide(card: CardInstance): BattleSide { return this.isEnemyCard(card) ? "enemy" : "player"; }
  private isEnemyCard(card: CardInstance): boolean { return card === this.enemyLeader || this.enemyField.includes(card) || this.enemyHand.includes(card) || this.enemyDrawPile.includes(card); }
  private isCombatantActive(card: CardInstance): boolean { return card === this.hero || card === this.enemyLeader || this.playerField.includes(card) || this.enemyField.includes(card); }
  private recordEvent(event: BattleAnimationEvent): void { this.animationEvents.push(event); this.combatHistory.push({ round: this.turn, event }); }
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
