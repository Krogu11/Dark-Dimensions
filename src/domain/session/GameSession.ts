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
  awardXp,
  createCardInstance,
  createPlayerCard,
  getCardDefinition,
  normalizeCardInstance,
  type CardInstance,
} from "../cards/CardInstance";
import { WorldSimulation } from "../world/WorldSimulation";
import { createWorldSeed, generateWorldMap } from "../world/WorldGenerator";
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
  getDailyWageCost,
  type SurvivalState,
} from "../survival/Survival";

type SessionListener = () => void;
export type GameMode = "world" | "battle";
const ROSTER_REVISION = 2;
export type RosterActionResult =
  | "success"
  | "notInCity"
  | "notEnoughGold"
  | "capacityFull"
  | "invalid";
export type TradeActionResult =
  | "success"
  | "invalid"
  | "notEnoughGold"
  | "notEnoughItems"
  | "noEffect";
export type EquipmentSlot = "rightHand" | "leftHand" | "accessory";
export type LocationEventResult =
  | { kind: "gold"; amount: number }
  | { kind: "danger"; amount: number }
  | { kind: "alreadyVisited"; amount: 0 }
  | { kind: "invalid"; amount: 0 };

export interface DungeonRun {
  locationId: string;
  stage: number;
  totalStages: number;
  enemyIds: string[];
}

export class GameSession {
  worldSeed: number;
  world: WorldSimulation;
  hero: CardInstance;
  warband: CardInstance[] = [];
  reserve: CardInstance[] = [];
  leadershipLevel = 1;
  characterState: CharacterState = createCharacterState();
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
  waypoint: { x: number; y: number; labelKey?: string } | null = null;
  uiBlocked = false;
  pursuedEnemyId: string | null = null;
  private navigationPath: WorldPoint[] = [];
  private pursuedEnemyPosition: WorldPoint | null = null;
  private currentEnemySpawnId: string | null = null;
  private currentLocationBattleId: string | null = null;
  private listeners = new Set<SessionListener>();

  constructor(seed = createWorldSeed()) {
    this.worldSeed = seed;
    this.world = this.createWorld(seed);
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
    return 4 + this.leadershipLevel + this.characterState.skills.leadership;
  }

  get reserveCapacity(): number {
    return 10;
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
    return [...this.warband, ...this.reserve];
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
    return getDailyWageCost(this.allUnits.length);
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
    this.waypoint = save.player.waypoint ?? null;
    this.pursuedEnemyId = null;
    this.navigationPath = this.waypoint
      ? findWorldPath(this.world.map, this.world.state, this.waypoint)
      : [];
    this.pursuedEnemyPosition = null;
    const hasCurrentRoster = save.rosterRevision === ROSTER_REVISION;
    this.hero = hasCurrentRoster && save.hero
      ? normalizeCardInstance(save.hero)
      : createPlayerCard();
    this.warband = hasCurrentRoster
      ? (save.warband ?? []).map(normalizeCardInstance)
      : [];
    this.reserve = hasCurrentRoster
      ? (save.reserve ?? []).map(normalizeCardInstance)
      : [];
    this.leadershipLevel = hasCurrentRoster ? (save.leadershipLevel ?? 1) : 1;
    this.characterState = normalizeCharacterState(save.characterState);
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
    this.notify();
  }

  reset(): void {
    this.worldSeed = createWorldSeed();
    this.world = this.createWorld(this.worldSeed);
    this.economyState = createEconomyState(this.worldSeed, this.world.map);
    this.factionState = createFactionState(
      this.worldSeed,
      this.world.map,
      this.economyState,
      contentPack.enemies,
    );
    this.nearbyCaravanId = null;
    this.waypoint = null;
    this.pursuedEnemyId = null;
    this.navigationPath = [];
    this.pursuedEnemyPosition = null;
    this.hero = createPlayerCard();
    this.warband = [];
    this.reserve = [];
    this.leadershipLevel = 1;
    this.characterState = createCharacterState();
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
    this.notify();
  }

  recruit(cardId: string): RosterActionResult {
    if (this.world.nearbyLocation?.type !== "city") return "notInCity";
    const definition = recruitableCards.find((card) => card.id === cardId);
    if (!definition?.recruitCost) return "invalid";
    if (this.reserve.length >= this.reserveCapacity) return "capacityFull";
    if (this.gold < definition.recruitCost) return "notEnoughGold";

    this.gold -= definition.recruitCost;
    this.reserve.push(createCardInstance(cardId));
    this.advanceTime(30);
    this.notify();
    return "success";
  }

  moveToWarband(uid: string): RosterActionResult {
    if (this.warband.length >= this.warbandCapacity) return "capacityFull";
    const index = this.reserve.findIndex((card) => card.uid === uid);
    if (index < 0) return "invalid";
    this.warband.push(this.reserve.splice(index, 1)[0]);
    this.notify();
    return "success";
  }

  moveToReserve(uid: string): RosterActionResult {
    if (this.reserve.length >= this.reserveCapacity) return "capacityFull";
    const index = this.warband.findIndex((card) => card.uid === uid);
    if (index < 0) return "invalid";
    this.reserve.push(this.warband.splice(index, 1)[0]);
    this.notify();
    return "success";
  }

  upgradeUnit(uid: string, targetCardId: string): RosterActionResult {
    const card = this.allUnits.find((candidate) => candidate.uid === uid);
    if (!card) return "invalid";
    const upgrade = upgradesByCardId.get(card.cardId);
    if (
      !upgrade ||
      card.level < upgrade.requiredLevel ||
      !upgrade.options.includes(targetCardId)
    ) {
      return "invalid";
    }

    const upgradedDefinition = getCardDefinition(targetCardId);
    card.cardId = upgradedDefinition.id;
    card.currentHp = upgradedDefinition.maxHp;
    card.level = 1;
    card.xp = 0;
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
    this.dungeonRun = null;
    this.battle = new BattleSimulation(
      this.warband,
      archetype,
      this.hero,
      { ...this.heroCombatBonuses, heroMaxHp: this.heroMaxHp },
      getTerrainBattleModifiers(this.currentTerrain),
    );
    this.mode = "battle";
    this.notify();
  }

  enterDungeon(locationId: string): boolean {
    const location = this.getNearbyLocation(locationId, "dungeon");
    if (!location || this.mode !== "world") return false;

    const enemyIds = [0, 1, 2].map((stage) =>
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

  buyItem(itemId: string): TradeActionResult {
    const profile = this.marketProfile;
    const offer = profile?.offers.find((candidate) => candidate.itemId === itemId);
    if (!profile || !offer || offer.stock <= 0) return "invalid";
    const price = this.getBuyPrice(itemId);
    if (this.gold < price) return "notEnoughGold";
    const stock = marketStock(this.economyState, profile);
    const stockEntry = stock.find((entry) => entry.itemId === itemId);
    if (!stockEntry || stockEntry.quantity <= 0) return "invalid";
    stockEntry.quantity -= 1;
    this.gold -= price;
    addToInventory(this.inventory, itemId, 1);
    this.advanceTime(5);
    this.notify();
    return "success";
  }

  sellItem(itemId: string): TradeActionResult {
    const profile = this.marketProfile;
    if (!profile) return "invalid";
    const price = this.getSellPrice(itemId);
    if (!removeFromInventory(this.inventory, itemId, 1)) return "notEnoughItems";
    const stock = marketStock(this.economyState, profile);
    this.gold += price;
    addToInventory(stock, itemId, 1);
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

  finishVictory(continueDungeon = true): BattleReward | null {
    if (!this.battle || this.battle.outcome !== "victory") return null;
    const reward = this.battle.rollReward();
    const completedBattle = this.battle;
    const dungeonStage = this.dungeonRun?.stage ?? 0;
    if (dungeonStage > 0) reward.gold += dungeonStage * 8;
    this.gold += reward.gold;
    this.progressBountyQuests(completedBattle.enemy.id);
    for (const item of reward.items) {
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

    if (reward.cardId) {
      if (this.reserve.length < this.reserveCapacity) {
        this.reserve.push(createCardInstance(reward.cardId));
      } else if (this.warband.length < this.warbandCapacity) {
        this.warband.push(createCardInstance(reward.cardId));
      } else {
        reward.cardId = null;
      }
    }

    if (this.currentEnemySpawnId) {
      this.world.defeatEnemy(this.currentEnemySpawnId);
    }

    if (this.dungeonRun) {
      if (continueDungeon && this.canContinueDungeon) {
        this.dungeonRun.stage += 1;
        const nextEnemyId = this.dungeonRun.enemyIds[this.dungeonRun.stage - 1];
        this.startArchetypeBattle(enemiesById.get(nextEnemyId)!);
        this.advanceTime(45);
        this.notify();
        return reward;
      }

      if (this.dungeonRun.stage === this.dungeonRun.totalStages) {
        if (!this.completedLocationIds.has(this.dungeonRun.locationId)) {
          const completionGold = 45 + this.dungeonRun.totalStages * 10;
          this.gold += completionGold;
          reward.gold += completionGold;
        }
        this.completedLocationIds.add(this.dungeonRun.locationId);
      }
    } else if (this.currentLocationBattleId) {
      if (!this.completedLocationIds.has(this.currentLocationBattleId)) {
        const castleBonus = 35;
        this.gold += castleBonus;
        reward.gold += castleBonus;
      }
      this.completedLocationIds.add(this.currentLocationBattleId);
    }

    this.hero.currentHp = this.heroMaxHp;
    this.mode = "world";
    this.battle = null;
    this.dungeonRun = null;
    this.currentEnemySpawnId = null;
    this.currentLocationBattleId = null;
    this.advanceTime(45);
    this.notify();
    return reward;
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
    const location = this.world.nearbyLocation;
    if (location?.type !== "city") return false;

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
        nearbyLocationId: location.id,
        exploredSectors: this.world.state.exploredSectors,
        waypoint: this.waypoint,
      },
      gold: this.gold,
      hero: this.hero,
      warband: this.warband,
      reserve: this.reserve,
      leadershipLevel: this.leadershipLevel,
      characterState: this.characterState,
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
    this.pursuedEnemyPosition = null;
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
    this.pursuedEnemyPosition = null;
    this.navigationPath = [];
    this.notify();
  }

  pursueEnemy(enemyId: string): boolean {
    const enemy = this.world.state.enemies.find(
      (candidate) => candidate.id === enemyId && candidate.active,
    );
    if (!enemy) return false;
    this.pursuedEnemyId = enemy.id;
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
    this.applyWoundTreatment(minutes);
    const deltaHours = minutes / 60;
    const collidedEnemyId = this.world.updateEnemies(
      deltaHours,
      this.warbandThreatRating,
    );
    this.updateEconomy(deltaHours);
    if (collidedEnemyId && this.mode === "world") {
      this.beginBattle(collidedEnemyId);
    }
    return collidedEnemyId;
  }

  private processDailyUpkeep(day: number): void {
    const wagesDue = this.dailyWageCost;
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
        const caravan = this.economyState.caravans.find(
          (candidate) => candidate.id === quest.caravanId,
        );
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
    this.battle = new BattleSimulation(
      this.warband,
      archetype,
      this.hero,
      { ...this.heroCombatBonuses, heroMaxHp: this.heroMaxHp },
      getTerrainBattleModifiers(this.currentTerrain),
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

  private applyWoundTreatment(minutes: number): void {
    const rank = this.characterState.skills.woundTreatment;
    if (rank <= 0 || minutes <= 0) return;
    const healing = Math.floor((minutes / 60) * rank * 6);
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
