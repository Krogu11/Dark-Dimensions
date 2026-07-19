import {
  contentPack,
  enemiesById,
  itemsById,
  recruitableCards,
  tradeRecipesById,
  upgradesByCardId,
} from "../../content/content";
import type { SaveGame, SaveRepository } from "../../infrastructure/save/SaveRepository";
import { BattleSimulation, type BattleReward } from "../battle/BattleSimulation";
import {
  awardCharacterXp,
  createCharacterState,
  normalizeCharacterState,
  spendAttributePoint,
  spendSkillPoint,
  type CharacterAttribute,
  type CharacterSkill,
  type CharacterState,
} from "../character/CharacterProgression";
import {
  applyChoiceBonuses,
  getRunChoices,
  type RunProfile,
} from "../character/CharacterOrigins";
import {
  awardXp,
  createCardInstance,
  createPlayerCard,
  getCardDefinition,
  normalizeCardInstance,
  xpNeededForNextLevel,
  xpNeededForUnitUpgrade,
  type CardInstance,
} from "../cards/CardInstance";
import { getWeeklyRosterWage } from "../cards/UnitUpkeep";
import { WorldSimulation } from "../world/WorldSimulation";
import type { WorldWarbandState } from "../world/WorldWarbands";
import { createWorldSeed, generateWorldMap } from "../world/WorldGenerator";
import {
  createCityStates,
  normalizeCityStates,
  type CityState,
  type CityStates,
} from "../world/Cities";
import { ensureRecruitmentOffers, getRecruitmentCost } from "../world/Recruitment";
import { createVillageStates, ensureVillageQuest, ensureVillageRecruitmentOffers, normalizeVillageStates, type VillageQuest, type VillageState, type VillageStates } from "../world/Villages";
import { findWorldPath, type WorldPoint } from "../world/WorldPathfinder";
import {
  findNearestTraversablePosition,
  getTerrainBattleModifiers,
  getTerrainFoodMultiplier,
  getTerrainMovementMultiplier,
  getTerrainVisibilityMultiplier,
  type TerrainType,
} from "../world/WorldTerrain";
import type { EnemyArchetype, MapLocation } from "../content/schemas";
import {
  addToInventory,
  calculateSellPrice,
  consumeFoodSupply,
  createCaravanMarketProfile,
  createEconomyState,
  createMarketProfile,
  inventoryQuantity,
  inventoryFoodCapacity,
  inventoryFoodSupply,
  marketStock,
  normalizeEconomyState,
  removeFromInventory,
  updateEconomyState,
  type CaravanState,
  type EconomyState,
  type InventoryStack,
  type MarketProfile,
} from "../economy/Economy";
import {
  createFactionState,
  areFactionsHostile,
  getFactionRelation,
  PLAYER_FACTION_ID,
  type FactionId,
  type FactionState,
  type QuestState,
} from "../quests/Factions";
import {
  createGameTimeState,
  formatGameTime,
  getGameDay,
  isNightTime,
  type GameTimeState,
} from "../time/GameClock";
import {
  clampMorale,
  createSurvivalState,
  getDailyFoodRequirement,
  type SurvivalState,
} from "../survival/Survival";

type SessionListener = () => void;
export type GameMode = "world" | "battle";
const ROSTER_REVISION = 3;
export const WARBAND_INTERACTION_RANGE = 88;
export interface PrisonerStack {
  cardId: string;
  quantity: number;
}
export type RosterActionResult =
  | "success"
  | "notInCity"
  | "notEnoughGold"
  | "notEnoughXp"
  | "capacityFull"
  | "notAvailable"
  | "invalid";
export type TradeActionResult =
  | "success"
  | "invalid"
  | "notEnoughGold"
  | "notEnoughItems"
  | "merchantCannotAfford"
  | "tooHeavy"
  | "noEffect";
export type EquipmentSlot = "rightHand" | "leftHand" | "accessory";
export type LocationEventResult =
  | { kind: "gold"; amount: number }
  | { kind: "danger"; amount: number }
  | { kind: "alreadyVisited"; amount: 0 }
  | { kind: "invalid"; amount: 0 };
export type VillageHelpResult = "success" | "alreadyHelped" | "invalid";

export interface VictoryClaimSelection {
  takeCard: boolean;
  itemIds: string[];
  continueDungeon: boolean;
}

export interface DungeonRun {
  locationId: string;
  stage: number;
  totalStages: number;
  enemyIds: string[];
}

export class GameSession {
  worldSeed: number;
  world: WorldSimulation;
  cityStates: CityStates;
  villageStates: VillageStates;
  hero: CardInstance;
  warband: CardInstance[] = [];
  reserve: CardInstance[] = [];
  prisoners: PrisonerStack[] = [];
  leadershipLevel = 1;
  characterState: CharacterState = createCharacterState();
  runProfile: RunProfile | null = null;
  gold = 80;
  mode: GameMode = "world";
  battle: BattleSimulation | null = null;
  dungeonRun: DungeonRun | null = null;
  completedLocationIds = new Set<string>();
  inventory: InventoryStack[] = [];
  equippedItemId: string | null = null;
  rightHandItemId: string | null = "wooden_club";
  leftHandItemId: string | null = null;
  economyState: EconomyState;
  factionState: FactionState;
  timeState: GameTimeState = createGameTimeState();
  survivalState: SurvivalState = createSurvivalState();
  nearbyCaravanId: string | null = null;
  selectedWarbandId: string | null = null;
  waypoint: { x: number; y: number; labelKey?: string } | null = null;
  uiBlocked = false;
  pursuedEnemyId: string | null = null;
  pursuedWarbandId: string | null = null;
  private navigationPath: WorldPoint[] = [];
  private pursuedEnemyPosition: WorldPoint | null = null;
  private pursuedWarbandPosition: WorldPoint | null = null;
  private currentEnemySpawnId: string | null = null;
  private currentLocationBattleId: string | null = null;
  private currentWarbandBattleId: string | null = null;
  private currentWarbandAllyId: string | null = null;
  private currentWarbandEnemyId: string | null = null;
  private pendingVictoryReward: BattleReward | null = null;
  private villageBattleContext: { kind: "defense" | "raid" | "villager"; locationId: string; villagerId?: string; cargo?: InventoryStack[] } | null = null;
  private listeners = new Set<SessionListener>();

  constructor(seed = createWorldSeed()) {
    this.worldSeed = seed;
    this.world = this.createWorld(seed);
    this.cityStates = createCityStates(seed, this.world.map);
    this.villageStates = createVillageStates(seed, this.world.map);
    this.economyState = createEconomyState(seed, this.world.map);
    this.factionState = createFactionState(
      seed,
      this.world.map,
      this.economyState,
      contentPack.enemies,
    );
    this.hero = createPlayerCard();
    this.hero.currentHp = this.heroMaxHp;
    addToInventory(this.inventory, "travel_rations", 1);
  }

  get warbandCapacity(): number {
    return (
      5 +
      this.characterState.attributes.charisma * 2 +
      this.characterState.skills.leadership * 3
    );
  }

  get reserveCapacity(): number {
    return 0;
  }

  get battleFieldSlots(): number {
    return Math.min(7, 3 + Math.floor(Math.max(0, this.leadershipLevel - 1) / 2));
  }

  get warbandThreatRating(): number {
    const unitPower = (card: CardInstance): number => {
      const definition = getCardDefinition(card.cardId);
      const healthRatio = Math.max(
        0,
        Math.min(1, card.currentHp / definition.maxHp),
      );
      const levelMultiplier = 1 + Math.max(0, card.level - 1) * 0.08;
      return (
        (definition.atk + definition.def + definition.maxHp * 0.45) *
        levelMultiplier *
        (0.35 + healthRatio * 0.65)
      );
    };
    const power =
      unitPower(this.hero) * 0.65 +
      this.warband.reduce((sum, card) => sum + unitPower(card), 0);
    const equipmentPower = this.heroCombatBonuses.heroAtk + this.heroCombatBonuses.heroDef;
    const totalPower = power + equipmentPower;
    if (totalPower < 9_000) return 1;
    if (totalPower < 18_000) return 2;
    if (totalPower < 29_000) return 3;
    if (totalPower < 42_000) return 4;
    return 5;
  }

  get allUnits(): CardInstance[] {
    return this.warband;
  }

  get prisonerCount(): number {
    return this.prisoners.reduce((sum, prisoner) => sum + prisoner.quantity, 0);
  }

  get cargoWeight(): number {
    const inventoryWeight = this.inventory.reduce((total, stack) => {
      const item = itemsById.get(stack.itemId);
      if (!item) return total;
      const units =
        item.foodUnits && stack.supply !== undefined
          ? stack.supply / item.foodUnits
          : stack.quantity;
      return total + item.weight * units;
    }, 0);
    return inventoryWeight + this.equippedItemIds.reduce(
      (total, itemId) => total + (itemsById.get(itemId)?.weight ?? 0),
      0,
    );
  }

  get maxCargoWeight(): number {
    return (
      90 +
      this.characterState.attributes.strength * 10 +
      this.characterState.skills.athletics * 8 +
      this.characterState.skills.leadership * 5
    );
  }

  get partyMovementSpeed(): number {
    const troopPenalty = this.allUnits.length * 12;
    const cargoPenalty = this.cargoWeight * 1.8;
    const moraleMultiplier = 0.72 + this.survivalState.morale * 0.004;
    const characterBonus =
      this.characterState.attributes.agility * 3 +
      this.characterState.skills.pathfinding * 8 +
      this.characterState.skills.athletics * 5;
    return Math.max(
      80,
      Math.round((285 + characterBonus - troopPenalty - cargoPenalty) * moraleMultiplier),
    );
  }

  get morale(): number {
    return this.survivalState.morale;
  }

  get rationCount(): number {
    return inventoryFoodSupply(this.inventory);
  }

  get foodCapacity(): number {
    return inventoryFoodCapacity(this.inventory);
  }

  get dailyWageCost(): number {
    return Math.ceil(this.weeklyWageCost / 7);
  }

  get weeklyWageCost(): number {
    return getWeeklyRosterWage(this.allUnits);
  }

  get dailyFoodRequirement(): number {
    return getDailyFoodRequirement(this.allUnits.length);
  }

  get gameDay(): number {
    return getGameDay(this.timeState);
  }

  get gameTimeLabel(): string {
    return formatGameTime(this.timeState);
  }

  get isNight(): boolean {
    return isNightTime(this.timeState);
  }

  get visibilityRadius(): number {
    const baseRadius = this.isNight ? 300 : 520;
    return Math.round(
      baseRadius *
        getTerrainVisibilityMultiplier(
          this.world.map,
          this.world.state.x,
          this.world.state.y,
        ) *
        (1 + this.characterState.skills.spotting * 0.07),
    );
  }

  get currentTerrain(): TerrainType {
    return this.world.currentTerrain;
  }

  get terrainMovementMultiplier(): number {
    return getTerrainMovementMultiplier(
      this.world.map,
      this.world.state.x,
      this.world.state.y,
    );
  }

  get terrainFoodMultiplier(): number {
    return getTerrainFoodMultiplier(
      this.world.map,
      this.world.state.x,
      this.world.state.y,
    );
  }

  get effectiveMovementSpeed(): number {
    return Math.round(this.partyMovementSpeed * this.terrainMovementMultiplier);
  }

  get isInCity(): boolean {
    return this.world.nearbyLocation?.type === "city";
  }

  get canContinueDungeon(): boolean {
    return Boolean(
      this.dungeonRun && this.dungeonRun.stage < this.dungeonRun.totalStages,
    );
  }

  get battleContext(): "patrol" | "castle" | "dungeon" {
    if (this.dungeonRun) return "dungeon";
    if (this.currentLocationBattleId) return "castle";
    return "patrol";
  }

  get nearbyWarbandBattleId(): string | null {
    const battle = this.world.state.warbandBattles.find(
      (candidate) =>
        candidate.state === "fighting" &&
        Math.hypot(
          candidate.x - this.world.state.x,
          candidate.y - this.world.state.y,
        ) <= 78,
    );
    return battle?.id ?? null;
  }

  get selectedWarband() {
    return this.selectedWarbandId
      ? this.world.getWarband(this.selectedWarbandId)
      : null;
  }

  get selectedWarbandDistance(): number {
    const warband = this.selectedWarband;
    return warband ? this.getWarbandDistance(warband.id) : Number.POSITIVE_INFINITY;
  }

  get interactableSelectedWarband() {
    const warband = this.selectedWarband;
    return warband && this.canInteractWithWarband(warband.id) ? warband : null;
  }

  get heroCombatBonuses(): { heroAtk: number; heroDef: number } {
    const equipmentBonuses = this.equippedItemIds.reduce(
      (total, itemId) => {
        const item = itemsById.get(itemId);
        return {
          atk: total.atk + (item?.statBonus?.atk ?? 0),
          def: total.def + (item?.statBonus?.def ?? 0),
        };
      },
      { atk: 0, def: 0 },
    );
    return {
      heroAtk:
        equipmentBonuses.atk +
        this.characterState.attributes.strength * 20 +
        this.characterState.skills.powerStrike * 70,
      heroDef:
        equipmentBonuses.def +
        this.characterState.skills.tactics * 35,
    };
  }

  get equippedItemIds(): string[] {
    return [
      this.rightHandItemId,
      this.leftHandItemId,
      this.equippedItemId,
    ].filter((itemId): itemId is string => Boolean(itemId));
  }

  get heroMaxHp(): number {
    return (
      getCardDefinition(this.hero.cardId).maxHp +
      this.characterState.attributes.strength * 80 +
      this.characterState.skills.ironflesh * 140
    );
  }

  get characterLevelLabel(): string {
    return `${this.characterState.level}`;
  }

  get marketProfile(): MarketProfile | null {
    const location = this.world.nearbyLocation;
    if (location) {
      return createMarketProfile(
        this.worldSeed,
        location,
        this.economyState,
        this.world.map,
        this.cityStates[location.id] ?? null,
      );
    }
    return this.nearbyCaravan
      ? createCaravanMarketProfile(this.worldSeed, this.nearbyCaravan)
      : null;
  }

  get nearbyCaravan(): CaravanState | null {
    return (
      [...this.economyState.caravans, ...this.economyState.villagers].find(
        (caravan) => caravan.id === this.nearbyCaravanId,
      ) ?? null
    );
  }

  get currentFactionId(): FactionId | null {
    const locationId = this.world.nearbyLocation?.id;
    return locationId
      ? (this.factionState.locationFactions[locationId] ?? null)
      : null;
  }

  get currentFactionReputation(): number {
    return this.currentFactionId
      ? this.factionState.reputation[this.currentFactionId]
      : 0;
  }

  get activeQuests(): QuestState[] {
    return this.factionState.quests.filter(
      (quest) => quest.status === "active" || quest.status === "ready",
    );
  }

  get localAvailableQuests(): QuestState[] {
    const locationId = this.world.nearbyLocation?.id;
    return this.factionState.quests.filter(
      (quest) =>
        quest.status === "available" && quest.issuerLocationId === locationId,
    );
  }

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(): void {
    for (const listener of this.listeners) listener();
  }

  restore(save: SaveGame): void {
    this.worldSeed = save.worldSeed ?? hashLegacySeed(save.savedAt);
    this.world = new WorldSimulation(
      generateWorldMap(this.worldSeed, contentPack.enemies),
      save.worldRevision === 5 ? save.player : undefined,
    );
    this.cityStates = normalizeCityStates(save.cityStates, this.worldSeed, this.world.map);
    this.villageStates = normalizeVillageStates(save.villageStates, this.worldSeed, this.world.map);
    this.economyState = normalizeEconomyState(
      save.economyState,
      this.worldSeed,
      this.world.map,
    );
    const generatedFactionState = createFactionState(
      this.worldSeed,
      this.world.map,
      this.economyState,
      contentPack.enemies,
    );
    if (save.factionState) {
      generatedFactionState.reputation = save.factionState.reputation;
      for (const quest of generatedFactionState.quests) {
        const previousQuest = save.factionState.quests.find(
          (candidate) =>
            candidate.issuerLocationId === quest.issuerLocationId &&
            candidate.type === quest.type,
        );
        if (!previousQuest) continue;
        quest.status = previousQuest.status;
        quest.progress = previousQuest.progress;
      }
    }
    this.factionState = generatedFactionState;
    for (const quest of this.factionState.quests) {
      if (quest.itemId) quest.itemId = migrateItemId(quest.itemId);
    }
    this.nearbyCaravanId = null;
    this.selectedWarbandId = null;
    this.waypoint = save.player.waypoint ?? null;
    this.pursuedEnemyId = null;
    this.pursuedWarbandId = null;
    this.navigationPath = this.waypoint
      ? findWorldPath(this.world.map, this.world.state, this.waypoint)
      : [];
    this.pursuedEnemyPosition = null;
    this.pursuedWarbandPosition = null;
    const hasCurrentRoster = save.rosterRevision === ROSTER_REVISION;
    this.hero = hasCurrentRoster && save.hero
      ? normalizeCardInstance(save.hero)
      : createPlayerCard();
    this.warband = hasCurrentRoster
      ? (save.warband ?? []).map(normalizeCardInstance)
      : [];
    if (hasCurrentRoster) {
      this.prisoners = normalizePrisoners(save.prisoners);
    } else {
      this.prisoners = [];
      this.warband.push(
        ...(save.warband ?? []).map(normalizeCardInstance),
        ...(save.reserve ?? []).map(normalizeCardInstance),
      );
    }
    for (const card of this.warband) {
      if (card.level <= 1) continue;
      for (let legacyLevel = 1; legacyLevel < card.level; legacyLevel += 1) {
        card.xp += xpNeededForNextLevel(legacyLevel);
      }
      card.level = 1;
    }
    this.leadershipLevel = hasCurrentRoster ? (save.leadershipLevel ?? 1) : 1;
    this.characterState = normalizeCharacterState(save.characterState);
    this.runProfile = save.runProfile ?? null;
    const baseHeroMaxHp = getCardDefinition(this.hero.cardId).maxHp;
    this.hero.currentHp =
      !save.characterState && this.hero.currentHp >= baseHeroMaxHp
        ? this.heroMaxHp
        : Math.min(this.hero.currentHp, this.heroMaxHp);
    this.gold = save.gold ?? 80;
    this.mode = "world";
    this.battle = null;
    this.dungeonRun = null;
    this.completedLocationIds = new Set(save.completedLocationIds ?? []);
    this.inventory = normalizeInventory(save.inventory);
    this.equippedItemId = save.equippedItemId ?? null;
    this.rightHandItemId = save.rightHandItemId ?? "wooden_club";
    this.leftHandItemId = save.leftHandItemId ?? null;
    this.timeState = save.timeState ?? createGameTimeState();
    this.survivalState = {
      ...createSurvivalState(),
      ...save.survivalState,
      travelFoodDebt: save.survivalState?.travelFoodDebt ?? 0,
    };
    this.currentEnemySpawnId = null;
    this.currentLocationBattleId = null;
    this.currentWarbandBattleId = null;
    this.currentWarbandAllyId = null;
    this.currentWarbandEnemyId = null;
    this.pendingVictoryReward = null;
    if (save.activeBattle) {
      const checkpoint = save.activeBattle;
      this.currentEnemySpawnId = checkpoint.enemySpawnId;
      this.currentLocationBattleId = checkpoint.locationId;
      this.currentWarbandBattleId = checkpoint.warbandBattleId;
      this.currentWarbandAllyId = checkpoint.warbandAllyId;
      this.currentWarbandEnemyId = checkpoint.warbandEnemyId;
      this.dungeonRun = checkpoint.dungeonRun;
      this.villageBattleContext = checkpoint.villageContext ?? null;
      const archetype = enemiesById.get(checkpoint.enemyId) ?? checkpoint.enemy;
      if (archetype) {
        this.startArchetypeBattle(archetype);
      } else if (checkpoint.warbandBattleId) {
        this.joinWarbandBattle(checkpoint.warbandBattleId, checkpoint.warbandAllyId);
      }
    }
    this.notify();
  }

  reset(): void {
    this.worldSeed = createWorldSeed();
    this.world = this.createWorld(this.worldSeed);
    this.cityStates = createCityStates(this.worldSeed, this.world.map);
    this.villageStates = createVillageStates(this.worldSeed, this.world.map);
    this.economyState = createEconomyState(this.worldSeed, this.world.map);
    this.factionState = createFactionState(
      this.worldSeed,
      this.world.map,
      this.economyState,
      contentPack.enemies,
    );
    this.nearbyCaravanId = null;
    this.selectedWarbandId = null;
    this.waypoint = null;
    this.pursuedEnemyId = null;
    this.pursuedWarbandId = null;
    this.navigationPath = [];
    this.pursuedEnemyPosition = null;
    this.pursuedWarbandPosition = null;
    this.hero = createPlayerCard();
    this.warband = [];
    this.reserve = [];
    this.prisoners = [];
    this.leadershipLevel = 1;
    this.characterState = createCharacterState();
    this.runProfile = null;
    this.gold = 80;
    this.mode = "world";
    this.battle = null;
    this.dungeonRun = null;
    this.completedLocationIds.clear();
    this.inventory = [];
    addToInventory(this.inventory, "travel_rations", 1);
    this.equippedItemId = null;
    this.rightHandItemId = "wooden_club";
    this.leftHandItemId = null;
    this.timeState = createGameTimeState();
    this.survivalState = createSurvivalState();
    this.hero.currentHp = this.heroMaxHp;
    this.currentEnemySpawnId = null;
    this.currentLocationBattleId = null;
    this.currentWarbandBattleId = null;
    this.currentWarbandAllyId = null;
    this.currentWarbandEnemyId = null;
    this.pendingVictoryReward = null;
    this.villageBattleContext = null;
    this.notify();
  }

  beginNewRun(profile: RunProfile): void {
    this.reset();
    this.runProfile = profile;
    applyChoiceBonuses(this.characterState, profile);
    for (const choice of getRunChoices(profile)) {
      this.gold += choice.goldBonus ?? 0;
      for (const item of choice.items ?? []) {
        addToInventory(this.inventory, item.itemId, item.quantity);
      }
      if (choice.rightHandItemId) this.rightHandItemId = choice.rightHandItemId;
      if (choice.leftHandItemId) this.leftHandItemId = choice.leftHandItemId;
    }
    this.hero.currentHp = this.heroMaxHp;
    this.notify();
  }

  getCityState(locationId: string): CityState | null {
    return this.cityStates[locationId] ?? null;
  }

  getVillageState(locationId: string): VillageState | null { return this.villageStates[locationId] ?? null; }

  get currentVillageRecruitmentOffers(): string[] {
    const village = this.world.nearbyLocation;
    if (village?.type !== "village") return [];
    const state = this.villageStates[village.id];
    return state ? ensureVillageRecruitmentOffers(state, this.worldSeed, getGameDay(this.timeState)) : [];
  }

  getVillageRecruitmentCost(cardId: string): number {
    const definition = getCardDefinition(cardId);
    return Math.max(5, Math.round(getRecruitmentCost(definition) * 0.75));
  }

  recruitFromVillageOffer(cardId: string): RosterActionResult {
    const village = this.world.nearbyLocation;
    if (village?.type !== "village") return "notInCity";
    const state = this.villageStates[village.id];
    const offers = state ? ensureVillageRecruitmentOffers(state, this.worldSeed, getGameDay(this.timeState)) : [];
    if (!state || state.condition === "looted" || !offers.includes(cardId)) return "notAvailable";
    const definition = getCardDefinition(cardId);
    if (definition.race !== "human" || definition.tier > 2) return "invalid";
    const cost = this.getVillageRecruitmentCost(cardId);
    if (this.warband.length >= this.warbandCapacity) return "capacityFull";
    if (this.gold < cost) return "notEnoughGold";
    this.gold -= cost;
    this.warband.push(createCardInstance(cardId));
    state.recruitmentOffers = offers.filter((id) => id !== cardId);
    this.advanceTime(20);
    this.notify();
    return "success";
  }

  helpVillage(locationId: string): VillageHelpResult {
    const location = this.world.nearbyLocation;
    const state = this.villageStates[locationId];
    if (!location || location.id !== locationId || location.type !== "village" || !state || state.condition === "looted") return "invalid";
    const week = Math.floor((getGameDay(this.timeState) - 1) / 7) + 1;
    if (state.lastHelpedWeek >= week) return "alreadyHelped";
    state.lastHelpedWeek = week;
    state.relation = Math.min(100, state.relation + 4);
    state.prosperity = Math.min(100, state.prosperity + 2);
    state.militia += 3;
    const factionId = this.factionState.locationFactions[locationId];
    if (factionId) this.factionState.reputation[factionId] = Math.min(100, this.factionState.reputation[factionId] + 1);
    this.advanceTime(300);
    this.notify();
    return "success";
  }

  waitInVillageUntilNight(locationId: string): boolean {
    const location = this.world.nearbyLocation;
    if (!location || location.id !== locationId || location.type !== "village") return false;
    const minuteOfDay = this.timeState.totalMinutes % 1440;
    const target = 22 * 60;
    this.advanceTime(minuteOfDay < target ? target - minuteOfDay : 1440 - minuteOfDay + target);
    this.notify();
    return true;
  }

  getCurrentVillageQuest(): VillageQuest | null {
    const village = this.world.nearbyLocation;
    const state = village?.type === "village" ? this.villageStates[village.id] : null;
    return state ? ensureVillageQuest(state, this.worldSeed, getGameDay(this.timeState)) : null;
  }

  acceptVillageQuest(locationId: string): boolean {
    const location = this.world.nearbyLocation; const state = this.villageStates[locationId];
    if (!location || location.id !== locationId || location.type !== "village" || !state) return false;
    const quest = ensureVillageQuest(state, this.worldSeed, getGameDay(this.timeState));
    if (quest.status !== "available") return false;
    quest.status = "active"; this.advanceTime(10); this.notify(); return true;
  }

  completeVillageDelivery(locationId: string): boolean {
    const location = this.world.nearbyLocation; const state = this.villageStates[locationId];
    if (!location || location.id !== locationId || location.type !== "village" || !state) return false;
    const quest = ensureVillageQuest(state, this.worldSeed, getGameDay(this.timeState));
    if (quest.type !== "delivery" || quest.status !== "active" || !quest.itemId || inventoryQuantity(this.inventory, quest.itemId) < quest.quantity) return false;
    removeFromInventory(this.inventory, quest.itemId, quest.quantity); this.rewardVillageQuest(state, quest); this.advanceTime(10); this.notify(); return true;
  }

  startVillageNightDefense(locationId: string): boolean {
    const location = this.world.nearbyLocation; const state = this.villageStates[locationId];
    if (!location || location.id !== locationId || location.type !== "village" || !state || !this.isNight) return false;
    const quest = ensureVillageQuest(state, this.worldSeed, getGameDay(this.timeState));
    if (quest.type !== "night_bandits" || quest.status !== "active") return false;
    this.villageBattleContext = { kind: "defense", locationId };
    this.startArchetypeBattle(enemiesById.get(this.characterState.level < 4 ? "road_reavers" : "kobold_ambushers") ?? enemiesById.get("road_reavers")!);
    return true;
  }

  startVillageRaid(locationId: string): boolean {
    const location = this.world.nearbyLocation; const state = this.villageStates[locationId];
    if (!location || location.id !== locationId || location.type !== "village" || !state || state.condition === "looted") return false;
    const factionId = this.factionState.locationFactions[locationId];
    state.relation = Math.max(-100, state.relation - 50);
    if (factionId) this.factionState.reputation[factionId] = Math.max(-100, this.factionState.reputation[factionId] - 20);
    const count = Math.max(2, Math.min(8, Math.ceil(state.militia / 12)));
    const deck = Array.from({ length: count }, (_, index) => index % 3 === 2 && state.prosperity >= 45 ? "militia_shieldbearer" : index % 2 ? "village_slinger" : "village_levy");
    this.villageBattleContext = { kind: "raid", locationId };
    this.startArchetypeBattle({ id: `village_militia_${locationId}`, nameKey: location.nameKey, leaderCardId: state.militia >= 35 ? "militia_shieldbearer" : "village_levy", deck, goldReward: 0, threat: Math.max(1, Math.min(4, Math.ceil(state.militia / 25))), dropTable: [], itemDropTable: [] });
    return true;
  }

  attackNearbyVillager(): boolean {
    const villager = this.nearbyCaravan;
    if (!villager || villager.kind !== "villager") return false;
    const origin = this.villageStates[villager.originId]; const factionId = this.factionState.locationFactions[villager.originId];
    if (origin) origin.relation = Math.max(-100, origin.relation - 18);
    if (factionId) this.factionState.reputation[factionId] = Math.max(-100, this.factionState.reputation[factionId] - 7);
    this.villageBattleContext = { kind: "villager", locationId: villager.originId, villagerId: villager.id, cargo: structuredClone(villager.inventory) };
    this.startArchetypeBattle({ id: `villager_${villager.id}`, nameKey: "trade.villagerName", leaderCardId: villager.leaderCardId ?? "village_levy", deck: villager.unitIds?.length ? villager.unitIds : ["village_slinger"], goldReward: 4, threat: 1, dropTable: [], itemDropTable: [] });
    return true;
  }

  private rewardVillageQuest(state: VillageState, quest: VillageQuest): void {
    quest.status = "completed"; this.gold += quest.rewardGold; state.relation = Math.min(100, state.relation + quest.rewardRelation); state.prosperity = Math.min(100, state.prosperity + 3); state.militia += 2;
    const factionId = this.factionState.locationFactions[state.locationId]; if (factionId) this.factionState.reputation[factionId] = Math.min(100, this.factionState.reputation[factionId] + 3);
  }

  get currentRecruitmentOffers(): string[] {
    const city = this.world.nearbyLocation;
    if (city?.type !== "city") return [];
    const state = this.cityStates[city.id];
    return state ? ensureRecruitmentOffers(state, this.worldSeed, getGameDay(this.timeState)) : [];
  }

  get currentRecruitmentRestockDay(): number | null {
    const city = this.world.nearbyLocation;
    if (city?.type !== "city") return null;
    this.currentRecruitmentOffers;
    return this.cityStates[city.id]?.recruitmentRestockDay ?? null;
  }

  recruitFromCityOffer(cardId: string): RosterActionResult {
    const city = this.world.nearbyLocation;
    if (city?.type !== "city") return "notInCity";
    const state = this.cityStates[city.id];
    const offers = state ? ensureRecruitmentOffers(state, this.worldSeed, getGameDay(this.timeState)) : [];
    if (!offers.includes(cardId)) return "notAvailable";
    const definition = contentPack.cards.find((card) => card.id === cardId);
    if (!definition) return "invalid";
    const cost = getRecruitmentCost(definition);
    if (this.warband.length >= this.warbandCapacity) return "capacityFull";
    if (this.gold < cost) return "notEnoughGold";
    this.gold -= cost;
    this.warband.push(createCardInstance(cardId));
    state.recruitmentOffers = offers.filter((id) => id !== cardId);
    this.advanceTime(30);
    this.notify();
    return "success";
  }

  recruit(cardId: string): RosterActionResult {
    if (this.world.nearbyLocation?.type !== "city") return "notInCity";
    const definition = recruitableCards.find((card) => card.id === cardId);
    if (!definition?.recruitCost) return "invalid";
    if (this.warband.length >= this.warbandCapacity) return "capacityFull";
    if (this.gold < definition.recruitCost) return "notEnoughGold";

    this.gold -= definition.recruitCost;
    this.warband.push(createCardInstance(cardId));
    this.advanceTime(30);
    this.notify();
    return "success";
  }

  moveToWarband(uid: string): RosterActionResult {
    return this.warband.some((card) => card.uid === uid) ? "success" : "invalid";
  }

  moveToReserve(uid: string): RosterActionResult {
    return this.warband.some((card) => card.uid === uid) ? "success" : "invalid";
  }

  upgradeUnit(uid: string, targetCardId: string): RosterActionResult {
    const card = this.allUnits.find((candidate) => candidate.uid === uid);
    if (!card) return "invalid";
    const upgrade = upgradesByCardId.get(card.cardId);
    const sourceDefinition = getCardDefinition(card.cardId);
    const requiredXp = xpNeededForUnitUpgrade(sourceDefinition.tier);
    if (!upgrade || card.xp < requiredXp || !upgrade.options.includes(targetCardId)) {
      return "invalid";
    }

    const upgradedDefinition = getCardDefinition(targetCardId);
    const healthRatio = Math.max(0, Math.min(1, card.currentHp / sourceDefinition.maxHp));
    card.cardId = upgradedDefinition.id;
    card.currentHp = Math.max(1, Math.round(upgradedDefinition.maxHp * healthRatio));
    card.level = 1;
    card.xp -= requiredXp;
    this.advanceTime(20);
    this.notify();
    return "success";
  }

  beginBattle(enemySpawnId: string): void {
    if (this.mode !== "world") return;
    const spawn = this.world.state.enemies.find(
      (enemy) => enemy.id === enemySpawnId,
    );
    const archetype = spawn ? enemiesById.get(spawn.archetypeId) : null;
    if (!spawn || !archetype) return;

    this.currentEnemySpawnId = enemySpawnId;
    this.currentLocationBattleId = null;
    this.currentWarbandBattleId = null;
    this.currentWarbandAllyId = null;
    this.currentWarbandEnemyId = null;
    this.dungeonRun = null;
    this.pendingVictoryReward = null;
    this.battle = new BattleSimulation(
      this.warband,
      archetype,
      this.hero,
      { ...this.heroCombatBonuses, heroMaxHp: this.heroMaxHp, fieldSlots: this.battleFieldSlots },
      getTerrainBattleModifiers(this.currentTerrain),
      undefined,
      { playerLevel: this.characterState.level, warbandThreat: this.warbandThreatRating },
    );
    this.mode = "battle";
    this.notify();
  }

  joinWarbandBattle(
    battleId: string,
    alliedWarbandId: string | null = null,
  ): boolean {
    if (this.mode !== "world") return false;
    const battle = this.world.getWarbandBattle(battleId);
    if (!battle || battle.state !== "fighting") return false;
    const attacker = this.world.getWarband(battle.attackerId);
    const defender = battle.defenderId ? this.world.getWarband(battle.defenderId) : null;
    if (!attacker) return false;
    if (battle.enemyId) {
      const spawn = this.world.state.enemies.find(
        (enemy) => enemy.id === battle.enemyId && enemy.active,
      );
      const archetype = spawn ? enemiesById.get(spawn.archetypeId) : null;
      if (!spawn || !archetype) return false;
      battle.playerJoined = true;
      this.currentEnemySpawnId = spawn.id;
      this.currentLocationBattleId = null;
      this.currentWarbandBattleId = battle.id;
      this.currentWarbandAllyId = attacker.id;
      this.currentWarbandEnemyId = null;
      this.dungeonRun = null;
      this.pendingVictoryReward = null;
      this.battle = new BattleSimulation(
        this.warband,
        archetype,
        this.hero,
        { ...this.heroCombatBonuses, heroMaxHp: this.heroMaxHp, fieldSlots: this.battleFieldSlots },
        getTerrainBattleModifiers(this.currentTerrain),
        undefined,
        { playerLevel: this.characterState.level, warbandThreat: this.warbandThreatRating },
      );
      this.mode = "battle";
      this.notify();
      return true;
    }
    if (!defender) return false;

    const chosenAllyId =
      alliedWarbandId ??
      ([attacker, defender].find(
        (warband) =>
          getFactionRelation(PLAYER_FACTION_ID, warband.factionId, this.factionState) !==
          "hostile",
      )?.id ??
        null);
    const enemyWarband =
      chosenAllyId === attacker.id
        ? defender
        : chosenAllyId === defender.id
          ? attacker
          : attacker;

    battle.playerJoined = true;
    this.currentEnemySpawnId = null;
    this.currentLocationBattleId = null;
    this.currentWarbandBattleId = battle.id;
    this.currentWarbandAllyId = chosenAllyId;
    this.currentWarbandEnemyId = enemyWarband.id;
    this.dungeonRun = null;
    this.pendingVictoryReward = null;
    this.battle = new BattleSimulation(
      this.warband,
      {
        id: `npc_${enemyWarband.id}`,
        nameKey: enemyWarband.nameKey,
        leaderCardId: enemyWarband.leaderCardId ?? enemyWarband.unitIds[0],
        leaderLevel: enemyWarband.leaderLevel,
        deck: [
          ...(enemyWarband.leaderCardId ? [enemyWarband.leaderCardId] : []),
          ...enemyWarband.unitIds,
        ],
        goldReward: Math.max(12, Math.round(enemyWarband.unitIds.length * 7)),
        threat: Math.min(
          5,
          Math.max(1, Math.ceil(enemyWarband.unitIds.length / 2)),
        ),
        dropTable: enemyWarband.unitIds.map((cardId) => ({
          cardId,
          chance: 0.05,
        })),
        itemDropTable: enemyWarband.lootItemIds.map((itemId) => ({
          itemId,
          chance: 0.35,
          minimum: 1,
          maximum: 2,
        })),
      },
      this.hero,
      { ...this.heroCombatBonuses, heroMaxHp: this.heroMaxHp, fieldSlots: this.battleFieldSlots },
      getTerrainBattleModifiers(this.currentTerrain),
      createWarbandBattleDeck(enemyWarband),
      { playerLevel: this.characterState.level, warbandThreat: this.warbandThreatRating },
    );
    this.mode = "battle";
    this.notify();
    return true;
  }

  enterDungeon(locationId: string): boolean {
    const location = this.getNearbyLocation(locationId, "dungeon");
    if (!location || this.mode !== "world" || !this.world.isDungeonActive(locationId)) {
      return false;
    }

    const enemyIds = location.spawnProfile
      ? [
          this.selectLocationEnemy(location, 0).id,
          this.selectLocationEnemy(location, 1).id,
          location.spawnProfile.bossEnemyId,
        ]
      : [0, 1, 2].map((stage) =>
          this.selectLocationEnemy(location, stage - 1).id,
        );
    this.dungeonRun = {
      locationId,
      stage: 1,
      totalStages: enemyIds.length,
      enemyIds,
    };
    this.currentEnemySpawnId = null;
    this.currentLocationBattleId = locationId;
    this.startArchetypeBattle(enemiesById.get(enemyIds[0])!);
    return true;
  }

  challengeCastle(locationId: string): boolean {
    const location = this.getNearbyLocation(locationId, "castle");
    if (!location || this.mode !== "world") return false;

    this.dungeonRun = null;
    this.currentEnemySpawnId = null;
    this.currentLocationBattleId = locationId;
    this.startArchetypeBattle(this.selectLocationEnemy(location, 0));
    return true;
  }

  resolveLocationEvent(locationId: string): LocationEventResult {
    const location = this.world.nearbyLocation;
    if (
      !location ||
      location.id !== locationId ||
      !["village", "landmark", "wilds"].includes(location.type)
    ) {
      return { kind: "invalid", amount: 0 };
    }
    if (this.completedLocationIds.has(locationId)) {
      return { kind: "alreadyVisited", amount: 0 };
    }

    this.completedLocationIds.add(locationId);
    this.advanceTime(60);
    const roll = hashValue(`${this.worldSeed}:${locationId}`) % 100;
    if (location.type === "village" || roll >= 38) {
      const amount =
        location.type === "village"
          ? 10 + (roll % 9)
          : location.type === "landmark"
            ? 18 + (roll % 18)
            : 6 + (roll % 8);
      this.gold += amount;
      this.notify();
      return { kind: "gold", amount };
    }

    const amount = location.type === "landmark" ? 14 : 8;
    for (const card of this.warband) {
      const maximumHp = getCardDefinition(card.cardId).maxHp;
      card.currentHp = Math.max(1, card.currentHp - Math.ceil(maximumHp * amount / 100));
    }
    this.notify();
    return { kind: "danger", amount };
  }

  buyItem(itemId: string, quantity = 1): TradeActionResult {
    const profile = this.marketProfile;
    const offer = profile?.offers.find((candidate) => candidate.itemId === itemId);
    quantity = Math.floor(quantity);
    if (!profile || !offer || offer.stock < quantity || quantity <= 0) return "invalid";
    const price = this.getBuyPrice(itemId) * quantity;
    if (this.gold < price) return "notEnoughGold";
    if (!this.canCarryItem(itemId, quantity)) return "tooHeavy";
    const stock = marketStock(this.economyState, profile);
    const stockEntry = stock.find((entry) => entry.itemId === itemId);
    if (!stockEntry || stockEntry.quantity < quantity) return "invalid";
    stockEntry.quantity -= quantity;
    this.gold -= price;
    addToInventory(this.inventory, itemId, quantity);
    if (profile.locationId) {
      this.economyState.merchantGold[profile.locationId] =
        (this.economyState.merchantGold[profile.locationId] ?? profile.merchantGold) + price;
    }
    this.advanceTime(5);
    this.notify();
    return "success";
  }

  sellItem(itemId: string, quantity = 1): TradeActionResult {
    const profile = this.marketProfile;
    quantity = Math.floor(quantity);
    if (!profile || quantity <= 0) return "invalid";
    const price = this.getSellPrice(itemId) * quantity;
    if (profile.locationId && (this.economyState.merchantGold[profile.locationId] ?? profile.merchantGold) < price) {
      return "merchantCannotAfford";
    }
    if (!removeFromInventory(this.inventory, itemId, quantity)) return "notEnoughItems";
    const stock = marketStock(this.economyState, profile);
    this.gold += price;
    addToInventory(stock, itemId, quantity);
    if (profile.locationId) {
      this.economyState.merchantGold[profile.locationId] =
        (this.economyState.merchantGold[profile.locationId] ?? profile.merchantGold) - price;
    }
    this.advanceTime(5);
    this.notify();
    return "success";
  }

  processTrade(recipeId: string): TradeActionResult {
    const profile = this.marketProfile;
    const recipe = tradeRecipesById.get(recipeId);
    if (
      !profile ||
      profile.locationType !== "city" ||
      !profile.recipeIds.includes(recipeId) ||
      !recipe
    ) {
      return "invalid";
    }
    if (this.gold < recipe.goldCost) return "notEnoughGold";
    if (inventoryQuantity(this.inventory, recipe.inputItemId) < recipe.inputQuantity) {
      return "notEnoughItems";
    }

    this.gold -= recipe.goldCost;
    removeFromInventory(this.inventory, recipe.inputItemId, recipe.inputQuantity);
    addToInventory(this.inventory, recipe.outputItemId, recipe.outputQuantity);
    this.advanceTime(60);
    this.notify();
    return "success";
  }

  useItem(itemId: string): TradeActionResult {
    const item = itemsById.get(itemId);
    if (!item || item.type !== "consumable" || item.effect !== "heal_300") {
      return "invalid";
    }
    const target = this.allUnits
      .filter((card) => card.currentHp > 0)
      .map((card) => ({
        card,
        missing: getCardDefinition(card.cardId).maxHp - card.currentHp,
      }))
      .sort((left, right) => right.missing - left.missing)[0];
    if (!target || target.missing <= 0) return "noEffect";
    if (!removeFromInventory(this.inventory, itemId, 1)) return "notEnoughItems";

    const maximumHp = getCardDefinition(target.card.cardId).maxHp;
    target.card.currentHp = Math.min(maximumHp, target.card.currentHp + 300);
    this.advanceTime(10);
    this.notify();
    return "success";
  }

  equipItem(itemId: string): TradeActionResult {
    const item = itemsById.get(itemId);
    if (!item || item.type !== "equipment") return "invalid";
    const slot = item.equipmentSlot ?? "accessory";
    if (!removeFromInventory(this.inventory, itemId, 1)) return "notEnoughItems";
    const previousItemId = this.getEquippedItemId(slot);
    if (previousItemId) addToInventory(this.inventory, previousItemId, 1);
    this.setEquippedItemId(slot, itemId);
    this.advanceTime(5);
    this.notify();
    return "success";
  }

  unequipItem(slot: EquipmentSlot = "accessory"): TradeActionResult {
    const itemId = this.getEquippedItemId(slot);
    if (!itemId) return "invalid";
    addToInventory(this.inventory, itemId, 1);
    this.setEquippedItemId(slot, null);
    this.advanceTime(5);
    this.notify();
    return "success";
  }

  acceptQuest(questId: string): boolean {
    const quest = this.factionState.quests.find((candidate) => candidate.id === questId);
    if (
      !quest ||
      quest.status !== "available" ||
      quest.issuerLocationId !== this.world.nearbyLocation?.id
    ) {
      return false;
    }
    quest.status = "active";
    if (quest.type === "escort") this.ensureEscortCaravan(quest);
    this.advanceTime(10);
    this.notify();
    return true;
  }

  claimQuest(questId: string): boolean {
    const quest = this.factionState.quests.find((candidate) => candidate.id === questId);
    if (!quest || (quest.status !== "active" && quest.status !== "ready")) return false;
    const currentLocationId = this.world.nearbyLocation?.id;
    if (currentLocationId !== quest.targetLocationId) return false;

    if (quest.type === "delivery") {
      if (
        !quest.itemId ||
        inventoryQuantity(this.inventory, quest.itemId) < quest.requiredQuantity
      ) {
        return false;
      }
      removeFromInventory(this.inventory, quest.itemId, quest.requiredQuantity);
    } else if (quest.type === "bounty" && quest.progress < quest.requiredCount) {
      return false;
    } else if (quest.type === "escort" && quest.status !== "ready") {
      return false;
    }

    quest.status = "completed";
    this.gold += quest.rewardGold;
    this.factionState.reputation[quest.factionId] = Math.min(
      100,
      this.factionState.reputation[quest.factionId] + quest.rewardReputation,
    );
    this.advanceTime(10);
    this.notify();
    return true;
  }

  prepareVictoryReward(): BattleReward | null {
    if (!this.battle || this.battle.outcome !== "victory") return null;
    if (this.pendingVictoryReward) return structuredClone(this.pendingVictoryReward);
    const reward = this.battle.rollReward();
    const dungeonStage = this.dungeonRun?.stage ?? 0;
    if (dungeonStage > 0) reward.gold += dungeonStage * 8;
    this.pendingVictoryReward = reward;
    return structuredClone(reward);
  }

  finishVictory(continueDungeon = true): BattleReward | null {
    const reward = this.prepareVictoryReward();
    if (!reward) return null;
    return this.claimVictoryReward({
      continueDungeon,
      takeCard: getCapturedCardIds(reward).length > 0,
      itemIds: reward.items.map((item) => item.itemId),
    });
  }

  claimVictoryReward(selection: VictoryClaimSelection): BattleReward | null {
    if (!this.battle || this.battle.outcome !== "victory") return null;
    const reward = this.pendingVictoryReward ?? this.prepareVictoryReward();
    if (!reward) return null;
    const completedBattle = this.battle;
    const dungeonStage = this.dungeonRun?.stage ?? 0;
    const claimedReward: BattleReward = {
      gold: reward.gold,
      cardId: selection.takeCard ? reward.cardId : null,
      capturedCardIds: selection.takeCard ? getCapturedCardIds(reward) : [],
      items: reward.items.filter((item) => selection.itemIds.includes(item.itemId)),
    };
    this.gold += reward.gold;
    this.progressBountyQuests(completedBattle.enemy.id);
    for (const item of claimedReward.items) {
      addToInventory(this.inventory, item.itemId, item.quantity);
    }

    this.warband = this.warband.filter((card) => card.currentHp > 0);
    for (const card of this.warband) {
      if (completedBattle.deployedUnitUids.has(card.uid)) {
        awardXp(
          card,
          60 + dungeonStage * 15 + this.characterState.skills.trainer * 8,
        );
      }
    }
    awardCharacterXp(this.characterState, 70 + completedBattle.enemy.threat * 25);

    for (const cardId of getCapturedCardIds(claimedReward)) this.addPrisoner(cardId, 1);

    if (this.currentEnemySpawnId) {
      this.world.defeatEnemy(this.currentEnemySpawnId);
    }

    if (this.currentWarbandBattleId && !this.currentWarbandEnemyId) {
      this.world.resolveWarbandEnemyBattleWithPlayer(
        this.currentWarbandBattleId,
        this.currentWarbandAllyId,
      );
    }

    if (this.currentWarbandBattleId && this.currentWarbandEnemyId) {
      this.world.resolveWarbandBattleWithPlayer(
        this.currentWarbandBattleId,
        this.currentWarbandEnemyId,
        this.currentWarbandAllyId,
      );
    }

    if (this.villageBattleContext) {
      const context = this.villageBattleContext; const state = this.villageStates[context.locationId];
      if (context.kind === "defense" && state) {
        const quest = ensureVillageQuest(state, this.worldSeed, getGameDay(this.timeState));
        if (quest.type === "night_bandits" && quest.status === "active") this.rewardVillageQuest(state, quest);
      } else if (context.kind === "raid" && state) {
        const stock = this.economyState.markets[context.locationId] ?? [];
        for (const entry of stock.slice(0, 4)) { const stolen = Math.min(entry.quantity, Math.max(1, Math.ceil(entry.quantity * 0.4))); if (stolen > 0) { entry.quantity -= stolen; addToInventory(this.inventory, entry.itemId, stolen); } }
        state.condition = "looted"; state.recoveryDay = getGameDay(this.timeState) + 7; state.population = Math.max(20, Math.floor(state.population * 0.9)); state.prosperity = Math.max(0, state.prosperity - 22); state.militia = Math.max(0, Math.floor(state.militia * 0.35)); state.recruitmentOffers = [];
      } else if (context.kind === "villager") {
        for (const entry of context.cargo ?? []) addToInventory(this.inventory, entry.itemId, entry.quantity);
        const villager = this.economyState.villagers.find((candidate) => candidate.id === context.villagerId);
        const origin = this.world.map.locations.find((location) => location.id === context.locationId);
        if (villager && origin) { villager.inventory = []; villager.progress = 0; villager.x = origin.x; villager.y = origin.y; }
        if (state) state.prosperity = Math.max(0, state.prosperity - 3);
      }
    }

    if (this.dungeonRun) {
      if (selection.continueDungeon && this.canContinueDungeon) {
        this.dungeonRun.stage += 1;
        const nextEnemyId = this.dungeonRun.enemyIds[this.dungeonRun.stage - 1];
        this.pendingVictoryReward = null;
        this.startArchetypeBattle(enemiesById.get(nextEnemyId)!);
        this.advanceTime(45);
        this.notify();
        return claimedReward;
      }

      if (this.dungeonRun.stage === this.dungeonRun.totalStages) {
        if (!this.completedLocationIds.has(this.dungeonRun.locationId)) {
          const completionGold = 45 + this.dungeonRun.totalStages * 10;
          this.gold += completionGold;
          claimedReward.gold += completionGold;
        }
        this.completedLocationIds.add(this.dungeonRun.locationId);
        this.world.defeatDungeon(this.dungeonRun.locationId);
      }
    } else if (this.currentLocationBattleId) {
      if (!this.completedLocationIds.has(this.currentLocationBattleId)) {
        const castleBonus = 35;
        this.gold += castleBonus;
        claimedReward.gold += castleBonus;
      }
      this.completedLocationIds.add(this.currentLocationBattleId);
    }

    this.hero.currentHp = this.heroMaxHp;
    this.mode = "world";
    this.battle = null;
    this.dungeonRun = null;
    this.currentEnemySpawnId = null;
    this.currentLocationBattleId = null;
    this.currentWarbandBattleId = null;
    this.currentWarbandAllyId = null;
    this.currentWarbandEnemyId = null;
    this.pendingVictoryReward = null;
    this.villageBattleContext = null;
    this.advanceTime(45);
    this.notify();
    return claimedReward;
  }

  dismissUnit(uid: string): RosterActionResult {
    const warbandIndex = this.warband.findIndex((card) => card.uid === uid);
    if (warbandIndex >= 0) {
      this.warband.splice(warbandIndex, 1);
      this.notify();
      return "success";
    }
    const reserveIndex = this.reserve.findIndex((card) => card.uid === uid);
    if (reserveIndex >= 0) {
      this.reserve.splice(reserveIndex, 1);
      this.notify();
      return "success";
    }
    return "invalid";
  }

  recruitPrisoner(cardId: string): RosterActionResult {
    if (this.warband.length >= this.warbandCapacity) return "capacityFull";
    const stack = this.prisoners.find((prisoner) => prisoner.cardId === cardId);
    if (!stack || stack.quantity <= 0) return "invalid";
    const definition = getCardDefinition(cardId);
    const cost = getPrisonerRecruitGoldCost(definition.tier);
    const xpCost = getPrisonerRecruitXpCost(definition.tier);
    if (this.gold < cost) return "notEnoughGold";
    if (this.characterState.xp < xpCost) return "notEnoughXp";

    this.gold -= cost;
    this.characterState.xp -= xpCost;
    this.survivalState.morale = clampMorale(this.survivalState.morale - 5);
    stack.quantity -= 1;
    if (stack.quantity <= 0) {
      this.prisoners = this.prisoners.filter((prisoner) => prisoner.quantity > 0);
    }
    this.warband.push(createCardInstance(cardId));
    this.advanceTime(30);
    this.notify();
    return "success";
  }

  sellPrisoner(cardId: string): RosterActionResult {
    if (this.world.nearbyLocation?.type !== "city") return "notInCity";
    const stack = this.prisoners.find((prisoner) => prisoner.cardId === cardId);
    if (!stack || stack.quantity <= 0) return "invalid";
    const definition = getCardDefinition(cardId);
    this.gold += getPrisonerSellPrice(definition.tier);
    stack.quantity -= 1;
    if (stack.quantity <= 0) {
      this.prisoners = this.prisoners.filter((prisoner) => prisoner.quantity > 0);
    }
    this.advanceTime(10);
    this.notify();
    return "success";
  }

  private addPrisoner(cardId: string, quantity: number): void {
    const existing = this.prisoners.find((prisoner) => prisoner.cardId === cardId);
    if (existing) existing.quantity += quantity;
    else this.prisoners.push({ cardId, quantity });
  }

  get healCost(): number {
    const missingHp = this.allUnits.reduce((sum, card) => {
      return sum + Math.max(0, getCardDefinition(card.cardId).maxHp - card.currentHp);
    }, 0);
    return Math.ceil(missingHp / 100) * 2;
  }

  healDeck(): boolean {
    if (this.world.nearbyLocation?.type !== "city") return false;
    const cost = this.healCost;
    if (cost <= 0 || cost > this.gold) return false;
    this.gold -= cost;
    for (const card of this.allUnits) {
      card.currentHp = getCardDefinition(card.cardId).maxHp;
    }
    this.advanceTime(120);
    this.notify();
    return true;
  }

  async save(repository: SaveRepository): Promise<boolean> {
    await repository.write({
      version: 1,
      worldRevision: 5,
      worldSeed: this.worldSeed,
      rosterRevision: ROSTER_REVISION,
      savedAt: new Date().toISOString(),
      player: {
        mapId: this.world.state.mapId,
        x: this.world.state.x,
        y: this.world.state.y,
        nearbyLocationId: this.world.state.nearbyLocationId,
        exploredSectors: this.world.state.exploredSectors,
        waypoint: this.waypoint,
        warbands: this.world.state.warbands,
        warbandBattles: this.world.state.warbandBattles,
        monsterRaids: this.world.state.monsterRaids,
      },
      gold: this.gold,
      hero: this.hero,
      warband: this.warband,
      reserve: [],
      prisoners: this.prisoners,
      leadershipLevel: this.leadershipLevel,
      characterState: this.characterState,
      runProfile: this.runProfile,
      cityStates: this.cityStates,
      villageStates: this.villageStates,
      activeBattle: this.mode === "battle" && this.battle ? {
        enemyId: this.battle.enemy.id,
        enemy: this.battle.enemy,
        enemySpawnId: this.currentEnemySpawnId,
        locationId: this.currentLocationBattleId,
        warbandBattleId: this.currentWarbandBattleId,
        warbandAllyId: this.currentWarbandAllyId,
        warbandEnemyId: this.currentWarbandEnemyId,
        dungeonRun: this.dungeonRun ? { ...this.dungeonRun, enemyIds: [...this.dungeonRun.enemyIds] } : null,
        villageContext: this.villageBattleContext ? structuredClone(this.villageBattleContext) : null,
      } : null,
      completedLocationIds: [...this.completedLocationIds],
      equippedItemId: this.equippedItemId,
      rightHandItemId: this.rightHandItemId,
      leftHandItemId: this.leftHandItemId,
      economyState: this.economyState,
      factionState: this.factionState,
      timeState: this.timeState,
      survivalState: this.survivalState,
      collection: this.allUnits.map((card) => card.cardId),
      inventory: this.inventory,
      questStates: [],
    });
    return true;
  }

  private createWorld(seed: number): WorldSimulation {
    return new WorldSimulation(generateWorldMap(seed, contentPack.enemies));
  }

  moveWorld(
    horizontal: number,
    vertical: number,
    deltaSeconds: number,
  ): string | null {
    const effectiveSpeed = this.effectiveMovementSpeed;
    const distance = this.world.move(
      horizontal,
      vertical,
      deltaSeconds,
      effectiveSpeed,
    );
    if (distance <= 0) return null;
    this.world.revealAround(this.visibilityRadius);
    const travelMinutes = (distance / effectiveSpeed) * 60;
    this.applyTerrainTravelFoodCost(travelMinutes);
    return this.advanceTime(travelMinutes);
  }

  setWaypoint(x: number, y: number, labelKey?: string): void {
    const destination = findNearestTraversablePosition(
      this.world.map,
      x,
      y,
      30,
    );
    this.waypoint = { ...destination, labelKey };
    this.pursuedEnemyId = null;
    this.pursuedWarbandId = null;
    this.pursuedEnemyPosition = null;
    this.pursuedWarbandPosition = null;
    this.navigationPath = findWorldPath(
      this.world.map,
      this.world.state,
      destination,
    );
    this.notify();
  }

  clearWaypoint(): void {
    this.cancelNavigation();
  }

  cancelNavigation(): void {
    this.waypoint = null;
    this.pursuedEnemyId = null;
    this.pursuedWarbandId = null;
    this.pursuedEnemyPosition = null;
    this.pursuedWarbandPosition = null;
    this.navigationPath = [];
    this.notify();
  }

  selectWarband(warbandId: string | null): boolean {
    if (!warbandId) {
      this.selectedWarbandId = null;
      this.notify();
      return true;
    }
    const warband = this.world.getWarband(warbandId);
    if (!warband || warband.state === "destroyed") return false;
    if (!this.canInteractWithWarband(warband.id)) {
      this.selectedWarbandId = null;
      this.notify();
      return false;
    }
    this.selectedWarbandId = warband.id;
    this.notify();
    return true;
  }

  getWarbandDistance(warbandId: string): number {
    const warband = this.world.getWarband(warbandId);
    return warband
      ? Math.hypot(warband.x - this.world.state.x, warband.y - this.world.state.y)
      : Number.POSITIVE_INFINITY;
  }

  canInteractWithWarband(warbandId: string): boolean {
    const warband = this.world.getWarband(warbandId);
    return Boolean(
      warband &&
        warband.state !== "destroyed" &&
        this.getWarbandDistance(warbandId) <= WARBAND_INTERACTION_RANGE,
    );
  }

  pursueEnemy(enemyId: string): boolean {
    const enemy = this.world.state.enemies.find(
      (candidate) => candidate.id === enemyId && candidate.active,
    );
    if (!enemy) return false;
    this.pursuedEnemyId = enemy.id;
    this.pursuedWarbandId = null;
    this.pursuedEnemyPosition = { x: enemy.x, y: enemy.y };
    this.waypoint = { x: enemy.x, y: enemy.y };
    this.navigationPath = findWorldPath(
      this.world.map,
      this.world.state,
      enemy,
    );
    this.notify();
    return true;
  }

  pursueWarband(warbandId: string): boolean {
    const warband = this.world.getWarband(warbandId);
    if (!warband || warband.state === "destroyed") return false;
    this.selectedWarbandId = warband.id;
    this.pursuedWarbandId = warband.id;
    this.pursuedEnemyId = null;
    this.pursuedEnemyPosition = null;
    this.pursuedWarbandPosition = { x: warband.x, y: warband.y };
    this.waypoint = { x: warband.x, y: warband.y, labelKey: warband.nameKey };
    this.navigationPath = findWorldPath(
      this.world.map,
      this.world.state,
      warband,
    );
    this.notify();
    return true;
  }

  advanceNavigation(deltaSeconds: number): void {
    if (!this.waypoint || this.mode !== "world") return;

    if (this.pursuedEnemyId) {
      const enemy = this.world.state.enemies.find(
        (candidate) =>
          candidate.id === this.pursuedEnemyId && candidate.active,
      );
      if (!enemy) {
        this.cancelNavigation();
        return;
      }
      if (
        Math.hypot(
          enemy.x - this.world.state.x,
          enemy.y - this.world.state.y,
        ) <= 38
      ) {
        const enemyId = enemy.id;
        this.cancelNavigation();
        this.beginBattle(enemyId);
        return;
      }
      if (
        !this.pursuedEnemyPosition ||
        Math.hypot(
          enemy.x - this.pursuedEnemyPosition.x,
          enemy.y - this.pursuedEnemyPosition.y,
        ) > 90 ||
        this.navigationPath.length === 0
      ) {
        this.pursuedEnemyPosition = { x: enemy.x, y: enemy.y };
        this.waypoint = { x: enemy.x, y: enemy.y };
        this.navigationPath = findWorldPath(
          this.world.map,
          this.world.state,
          enemy,
        );
      }
    }

    if (this.pursuedWarbandId) {
      const warband = this.world.getWarband(this.pursuedWarbandId);
      if (!warband || warband.state === "destroyed") {
        this.cancelNavigation();
        return;
      }
      if (
        Math.hypot(
          warband.x - this.world.state.x,
          warband.y - this.world.state.y,
        ) <= 72
      ) {
        this.cancelNavigation();
        this.selectedWarbandId = warband.id;
        this.notify();
        return;
      }
      if (
        !this.pursuedWarbandPosition ||
        Math.hypot(
          warband.x - this.pursuedWarbandPosition.x,
          warband.y - this.pursuedWarbandPosition.y,
        ) > 90 ||
        this.navigationPath.length === 0
      ) {
        this.pursuedWarbandPosition = { x: warband.x, y: warband.y };
        this.waypoint = { x: warband.x, y: warband.y, labelKey: warband.nameKey };
        this.navigationPath = findWorldPath(
          this.world.map,
          this.world.state,
          warband,
        );
      }
    }

    while (
      this.navigationPath[0] &&
      Math.hypot(
        this.navigationPath[0].x - this.world.state.x,
        this.navigationPath[0].y - this.world.state.y,
      ) <= 38
    ) {
      this.navigationPath.shift();
    }

    const target = this.navigationPath[0] ?? this.waypoint;
    const distance = Math.hypot(
      target.x - this.world.state.x,
      target.y - this.world.state.y,
    );
    if (distance <= 32 && !this.pursuedEnemyId) {
      this.cancelNavigation();
      return;
    }
    this.moveWorld(
      target.x - this.world.state.x,
      target.y - this.world.state.y,
      deltaSeconds,
    );

    if (this.pursuedEnemyId && this.mode === "world") {
      const enemy = this.world.state.enemies.find(
        (candidate) =>
          candidate.id === this.pursuedEnemyId && candidate.active,
      );
      if (
        enemy &&
        Math.hypot(
          enemy.x - this.world.state.x,
          enemy.y - this.world.state.y,
        ) <= 38
      ) {
        const enemyId = enemy.id;
        this.cancelNavigation();
        this.beginBattle(enemyId);
      }
    }
  }

  advanceTime(minutes: number): string | null {
    if (minutes <= 0) {
      this.updateEconomy(0);
      return null;
    }
    const previousDayIndex = Math.floor(this.timeState.totalMinutes / 1440);
    this.timeState.totalMinutes += minutes;
    const currentDayIndex = Math.floor(this.timeState.totalMinutes / 1440);
    for (
      let dayIndex = previousDayIndex + 1;
      dayIndex <= currentDayIndex;
      dayIndex += 1
    ) {
      this.processDailyUpkeep(dayIndex + 1);
    }
    this.applyWorldMapHealing(minutes);
    const deltaHours = minutes / 60;
    const collidedEnemyId = this.world.updateEnemies(
      deltaHours,
      this.warbandThreatRating,
      [...this.economyState.caravans, ...this.economyState.villagers],
    );
    this.world.updateWarbands(deltaHours, this.factionState);
    this.updateEconomy(deltaHours);
    if (collidedEnemyId && this.mode === "world") {
      this.beginBattle(collidedEnemyId);
    }
    return collidedEnemyId;
  }

  private processDailyUpkeep(day: number): void {
    this.processVillageWorldState(day);
    const wagesDue = day % 7 === 1 ? this.weeklyWageCost : 0;
    const wagesPaid = Math.min(this.gold, wagesDue);
    this.gold -= wagesPaid;

    const foodRequired = this.dailyFoodRequirement;
    const foodConsumed = consumeFoodSupply(this.inventory, foodRequired);

    let moraleChange = 0;
    if (wagesDue > 0) {
      moraleChange +=
        wagesPaid === wagesDue
          ? 2
          : -Math.ceil(18 * ((wagesDue - wagesPaid) / wagesDue));
    }
    moraleChange +=
      foodConsumed === foodRequired
        ? 3
        : -12 * (foodRequired - foodConsumed);

    const previousMorale = this.survivalState.morale;
    this.survivalState.morale = clampMorale(previousMorale + moraleChange);
    this.survivalState.lastUpkeep = {
      day,
      wagesDue,
      wagesPaid,
      foodRequired,
      foodConsumed,
      moraleChange: this.survivalState.morale - previousMorale,
    };
  }

  private processVillageWorldState(day: number): void {
    for (const state of Object.values(this.villageStates)) {
      if (state.condition === "looted" && state.recoveryDay && day >= state.recoveryDay) { state.condition = "recovering"; state.recoveryDay = day + 5; }
      else if (state.condition === "recovering") {
        state.population += Math.max(2, Math.ceil(state.population * 0.015)); state.prosperity = Math.min(100, state.prosperity + 2); state.militia += 1;
        if (state.recoveryDay && day >= state.recoveryDay) { state.condition = "normal"; state.recoveryDay = null; }
      }
      if (state.condition !== "normal") continue;
      const location = this.world.map.locations.find((candidate) => candidate.id === state.locationId); if (!location) continue;
      const banditNearby = this.world.state.enemies.some((enemy) => enemy.active && Math.hypot(enemy.x - location.x, enemy.y - location.y) < 260);
      const villageFaction = this.factionState.locationFactions[state.locationId];
      const hostileLordNearby = this.world.state.warbands.some((warband) => warband.state !== "destroyed" && warband.type === "lord" && areFactionsHostile(warband.factionId, villageFaction, this.factionState) && Math.hypot(warband.x - location.x, warband.y - location.y) < 220);
      if (!(banditNearby || hostileLordNearby) || hashValue(`${this.worldSeed}:${state.locationId}:${day}:raid`) % 100 >= 35) continue;
      state.condition = "looted"; state.recoveryDay = day + 6; state.population = Math.max(20, Math.floor(state.population * 0.94)); state.prosperity = Math.max(0, state.prosperity - (hostileLordNearby ? 16 : 11)); state.militia = Math.max(0, state.militia - (hostileLordNearby ? 12 : 7));
      for (const stock of this.economyState.markets[state.locationId] ?? []) stock.quantity = Math.floor(stock.quantity * 0.45);
    }
  }

  private canCarryItem(itemId: string, quantity: number): boolean {
    const item = itemsById.get(itemId);
    if (!item) return false;
    return this.cargoWeight + item.weight * quantity <= this.maxCargoWeight;
  }

  private applyTerrainTravelFoodCost(minutes: number): void {
    const extraMultiplier = Math.max(0, this.terrainFoodMultiplier - 1);
    if (extraMultiplier <= 0 || minutes <= 0) return;
    this.survivalState.travelFoodDebt =
      (this.survivalState.travelFoodDebt ?? 0) +
      (this.dailyFoodRequirement * extraMultiplier * minutes) / 1440;
    const due = Math.floor(this.survivalState.travelFoodDebt);
    if (due <= 0) return;
    this.survivalState.travelFoodDebt -= due;
    const consumed = consumeFoodSupply(this.inventory, due);
    if (consumed < due) {
      this.survivalState.morale = clampMorale(
        this.survivalState.morale - (due - consumed),
      );
    }
  }

  updateEconomy(deltaHours: number): void {
    updateEconomyState(
      this.economyState,
      this.worldSeed,
      this.world.map,
      deltaHours,
    );
    const nearby = [
      ...this.economyState.caravans,
      ...this.economyState.villagers,
    ].find(
      (caravan) =>
        Math.hypot(
          caravan.x - this.world.state.x,
          caravan.y - this.world.state.y,
        ) <= 72,
    );
    this.nearbyCaravanId = nearby?.id ?? null;
    this.updateQuestReadiness();
  }

  getSellPrice(itemId: string): number {
    const profile = this.marketProfile;
    if (!profile) return 0;
    const stock = marketStock(this.economyState, profile);
    const basePrice = calculateSellPrice(
      this.worldSeed,
      profile,
      itemId,
      inventoryQuantity(stock, itemId),
    );
    const reputationBonus = Math.max(0, this.currentFactionReputation) * 0.003;
    const tradeBonus = this.characterState.skills.trade * 0.025;
    const stack = this.inventory.find((entry) => entry.itemId === itemId);
    const foodUnits = itemsById.get(itemId)?.foodUnits;
    const fillRatio =
      stack && foodUnits
        ? Math.min(1, (stack.supply ?? foodUnits) / foodUnits)
        : 1;
    return Math.max(
      1,
      Math.floor(
        basePrice *
          (1 + Math.min(0.15, reputationBonus) + tradeBonus) *
          fillRatio,
      ),
    );
  }

  getBuyPrice(itemId: string): number {
    const offer = this.marketProfile?.offers.find(
      (candidate) => candidate.itemId === itemId,
    );
    if (!offer) return 0;
    const reputationDiscount = Math.max(0, this.currentFactionReputation) * 0.004;
    const tradeDiscount = this.characterState.skills.trade * 0.025;
    return Math.max(
      1,
      Math.ceil(
        offer.buyPrice *
          (1 - Math.min(0.2, reputationDiscount) - Math.min(0.15, tradeDiscount)),
      ),
    );
  }

  canBuyItem(itemId: string, quantity = 1): boolean {
    return this.canCarryItem(itemId, quantity);
  }

  spendAttribute(attribute: CharacterAttribute): boolean {
    const beforeMaxHp = this.heroMaxHp;
    const spent = spendAttributePoint(this.characterState, attribute);
    if (!spent) return false;
    if (attribute === "strength") {
      this.hero.currentHp += this.heroMaxHp - beforeMaxHp;
    }
    this.notify();
    return true;
  }

  spendSkill(skill: CharacterSkill): boolean {
    const beforeMaxHp = this.heroMaxHp;
    const spent = spendSkillPoint(this.characterState, skill);
    if (!spent) return false;
    if (skill === "ironflesh") {
      this.hero.currentHp += this.heroMaxHp - beforeMaxHp;
    }
    this.notify();
    return true;
  }

  private progressBountyQuests(enemyId: string): void {
    for (const quest of this.activeQuests) {
      if (quest.type !== "bounty" || quest.enemyId !== enemyId) continue;
      quest.progress = Math.min(quest.requiredCount, quest.progress + 1);
      if (quest.progress >= quest.requiredCount) quest.status = "ready";
    }
  }

  private updateQuestReadiness(): void {
    for (const quest of this.activeQuests) {
      if (quest.type === "delivery") {
        if (
          quest.itemId &&
          this.world.nearbyLocation?.id === quest.targetLocationId &&
          inventoryQuantity(this.inventory, quest.itemId) >= quest.requiredQuantity
        ) {
          quest.status = "ready";
        }
      } else if (quest.type === "escort" && quest.caravanId) {
        const caravan = this.ensureEscortCaravan(quest);
        const target = this.world.map.locations.find(
          (location) => location.id === quest.targetLocationId,
        );
        if (
          caravan &&
          target &&
          Math.hypot(caravan.x - target.x, caravan.y - target.y) <= 90 &&
          Math.hypot(
            caravan.x - this.world.state.x,
            caravan.y - this.world.state.y,
          ) <= 220
        ) {
          quest.status = "ready";
        }
      }
    }
  }

  private ensureEscortCaravan(quest: QuestState): CaravanState | null {
    if (quest.type !== "escort" || !quest.targetLocationId) return null;
    const existing = this.economyState.caravans.find(
      (candidate) => candidate.id === quest.caravanId,
    );
    if (existing) return existing;

    const origin = this.world.map.locations.find(
      (location) => location.id === quest.issuerLocationId,
    );
    const target = this.world.map.locations.find(
      (location) => location.id === quest.targetLocationId,
    );
    if (!origin || !target) return null;

    const caravanId = quest.caravanId ?? `quest_caravan_${quest.id}`;
    quest.caravanId = caravanId;
    const caravan: CaravanState = {
      id: caravanId,
      kind: "caravan",
      x: origin.x,
      y: origin.y,
      originId: origin.id,
      destinationId: target.id,
      progress: 0,
      speed: 48,
      leaderCardId: "wache",
      leaderLevel: 2,
      unitIds: ["village_levy", "militia_shieldbearer"],
      inventory: [
        { itemId: "bread", quantity: 4 },
        { itemId: "wine", quantity: 2 },
        { itemId: "iron", quantity: 2 },
      ],
    };
    this.economyState.caravans.push(caravan);
    return caravan;
  }

  private getNearbyLocation(
    locationId: string,
    type: MapLocation["type"],
  ): MapLocation | null {
    const location = this.world.nearbyLocation;
    return location?.id === locationId && location.type === type ? location : null;
  }

  private selectLocationEnemy(
    location: MapLocation,
    threatOffset: number,
  ): EnemyArchetype {
    if (location.spawnProfile) {
      const enemyIds =
        threatOffset >= 2
          ? [location.spawnProfile.bossEnemyId]
          : location.spawnProfile.enemyIds;
      const candidates = enemyIds
        .map((enemyId) => enemiesById.get(enemyId))
        .filter((enemy): enemy is EnemyArchetype => Boolean(enemy));
      if (candidates.length > 0) {
        return candidates[
          hashValue(`${this.worldSeed}:${location.id}:${threatOffset}`) %
            candidates.length
        ];
      }
    }
    const distanceRatio =
      Math.hypot(
        location.x - this.world.map.start.x,
        location.y - this.world.map.start.y,
      ) / Math.hypot(this.world.map.width, this.world.map.height);
    const targetThreat = Math.max(
      1,
      Math.min(5, 1 + Math.floor(distanceRatio * 6) + threatOffset),
    );
    const sorted = [...contentPack.enemies].sort(
      (left, right) =>
        Math.abs(left.threat - targetThreat) - Math.abs(right.threat - targetThreat),
    );
    const bestDifference = Math.abs(sorted[0].threat - targetThreat);
    const candidates = sorted.filter(
      (enemy) => Math.abs(enemy.threat - targetThreat) === bestDifference,
    );
    return candidates[hashValue(`${this.worldSeed}:${location.id}:${threatOffset}`) % candidates.length];
  }

  private startArchetypeBattle(archetype: EnemyArchetype): void {
    this.pendingVictoryReward = null;
    this.battle = new BattleSimulation(
      this.warband,
      archetype,
      this.hero,
      { ...this.heroCombatBonuses, heroMaxHp: this.heroMaxHp, fieldSlots: this.battleFieldSlots },
      getTerrainBattleModifiers(this.currentTerrain),
      undefined,
      { playerLevel: this.characterState.level, warbandThreat: this.warbandThreatRating },
    );
    this.mode = "battle";
    this.notify();
  }

  private getEquippedItemId(slot: EquipmentSlot): string | null {
    if (slot === "rightHand") return this.rightHandItemId;
    if (slot === "leftHand") return this.leftHandItemId;
    return this.equippedItemId;
  }

  private setEquippedItemId(slot: EquipmentSlot, itemId: string | null): void {
    if (slot === "rightHand") {
      this.rightHandItemId = itemId;
    } else if (slot === "leftHand") {
      this.leftHandItemId = itemId;
    } else {
      this.equippedItemId = itemId;
    }
  }

  private applyWorldMapHealing(minutes: number): void {
    if (minutes <= 0) return;
    const rank = this.characterState.skills.woundTreatment;
    const healing = Math.floor((minutes / 60) * (4 + rank * 8));
    if (healing <= 0) return;
    for (const card of this.allUnits) {
      if (card.currentHp <= 0) continue;
      const maxHp = getCardDefinition(card.cardId).maxHp;
      card.currentHp = Math.min(maxHp, card.currentHp + healing);
    }
  }
}

export const gameSession = new GameSession();

function hashLegacySeed(value: string): number {
  return hashValue(value);
}

function hashValue(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeInventory(
  inventory: SaveGame["inventory"] | undefined,
): InventoryStack[] {
  const normalized: InventoryStack[] = [];
  for (const entry of inventory ?? []) {
    if (typeof entry === "string") {
      const itemId = migrateItemId(entry);
      if (itemsById.has(itemId)) addToInventory(normalized, itemId, 1);
    } else {
      const itemId = migrateItemId(entry.itemId);
      if (entry.quantity > 0 && itemsById.has(itemId)) {
        addToInventory(normalized, itemId, entry.quantity, entry.supply);
      }
    }
  }
  return normalized;
}

function normalizePrisoners(prisoners: PrisonerStack[] | undefined): PrisonerStack[] {
  return (prisoners ?? [])
    .filter((prisoner) => prisoner.quantity > 0 && contentPack.cards.some((card) => card.id === prisoner.cardId))
    .map((prisoner) => ({
      cardId: prisoner.cardId,
      quantity: Math.floor(prisoner.quantity),
    }));
}

function createWarbandBattleDeck(warband: WorldWarbandState): CardInstance[] {
  const cards = [
    ...(warband.leaderCardId
      ? [
          (() => {
            const leader = createCardInstance(warband.leaderCardId!);
            leader.level = warband.leaderLevel;
            return leader;
          })(),
        ]
      : []),
    ...warband.unitIds.map((cardId) => createCardInstance(cardId)),
  ];
  return cards.map((card) => {
    const definition = getCardDefinition(card.cardId);
    card.currentHp = definition.maxHp;
    return card;
  });
}

export function getPrisonerRecruitGoldCost(tier: number): number {
  return Math.max(10, tier * 10);
}

function getCapturedCardIds(reward: BattleReward): string[] {
  return reward.capturedCardIds ?? (reward.cardId ? [reward.cardId] : []);
}

export function getPrisonerRecruitXpCost(tier: number): number {
  return tier * 35;
}

export function getPrisonerSellPrice(tier: number): number {
  return Math.max(4, tier * 6);
}

function migrateItemId(itemId: string): string {
  const migrations: Record<string, string> = {
    iron_ore: "iron",
    moon_herbs: "herbs",
    beast_hide: "leather",
    darkwood: "wood",
    steel_ingot: "iron",
    herbal_remedy: "healing_poultice",
    cured_leather: "leather",
    carved_lumber: "wood",
  };
  return migrations[itemId] ?? itemId;
}
