import type { CardInstance } from "../../domain/cards/CardInstance";
import type {
  EconomyState,
  InventoryStack,
} from "../../domain/economy/Economy";
import type { FactionId, FactionState } from "../../domain/quests/Factions";
import type { GameTimeState } from "../../domain/time/GameClock";
import type { SurvivalState } from "../../domain/survival/Survival";
import type { CharacterState } from "../../domain/character/CharacterProgression";
import type { RunProfile } from "../../domain/character/CharacterOrigins";
import type { PrisonerStack } from "../../domain/session/GameSession";
import type { DungeonSiteState, WorldBattleSiteState, WorldChronicleEntry, WorldEnemyState, WorldMonsterRaidState } from "../../domain/world/WorldSimulation";
import type { CityStates } from "../../domain/world/Cities";
import type { VillageStates } from "../../domain/world/Villages";
import type { EnemyArchetype } from "../../domain/content/schemas";
import type {
  WorldWarbandBattleState,
  WorldWarbandState,
} from "../../domain/world/WorldWarbands";
import type { MetaProgressionState } from "../../domain/progression/MetaProgression";

export interface SaveGame {
  version: 1;
  worldRevision?: number;
  worldSeed?: number;
  savedAt: string;
  player: {
    mapId: string;
    x: number;
    y: number;
    nearbyLocationId: string | null;
    exploredSectors?: string[];
    waypoint?: { x: number; y: number; labelKey?: string } | null;
    warbands?: WorldWarbandState[];
    warbandBattles?: WorldWarbandBattleState[];
    monsterRaids?: WorldMonsterRaidState[];
    battleSites?: WorldBattleSiteState[];
    chronicle?: WorldChronicleEntry[];
    enemies?: WorldEnemyState[];
    dungeonSites?: DungeonSiteState[];
  };
  gold?: number;
  deck?: CardInstance[];
  rosterRevision?: number;
  warband?: CardInstance[];
  reserve?: CardInstance[];
  prisoners?: PrisonerStack[];
  soulsGatheredThisRun?: number;
  villagersAttackedThisRun?: number;
  humanSoulsOfferedThisRun?: number;
  soulQuestCompleted?: boolean;
  hero?: CardInstance;
  leadershipLevel?: number;
  characterState?: CharacterState;
  runProfile?: RunProfile | null;
  cityStates?: CityStates;
  villageStates?: VillageStates;
  activeBattle?: {
    enemyId: string;
    enemy?: EnemyArchetype;
    enemySpawnId: string | null;
    locationId: string | null;
    warbandBattleId: string | null;
    warbandAllyId: string | null;
    warbandEnemyId: string | null;
    dungeonRun: { locationId: string; stage: number; totalStages: number; enemyIds: string[] } | null;
    villageContext?: { kind: "defense" | "raid" | "villager" | "caravan"; locationId: string; villagerId?: string; caravanId?: string; factionId?: FactionId; cargo?: InventoryStack[] } | null;
  } | null;
  completedLocationIds?: string[];
  equippedItemId?: string | null;
  rightHandItemId?: string | null;
  leftHandItemId?: string | null;
  learnedAbilityIds?: string[];
  equippedAbilityIds?: string[];
  economyState?: EconomyState;
  factionState?: FactionState;
  timeState?: GameTimeState;
  survivalState?: SurvivalState;
  collection: string[];
  inventory: Array<InventoryStack | string>;
  questStates: string[];
}

export interface SaveRepository {
  read(): Promise<SaveGame | null>;
  write(save: SaveGame): Promise<void>;
  delete(): Promise<void>;
}

export interface MetaSaveRepository {
  readMeta(): Promise<MetaProgressionState | null>;
  writeMeta(meta: MetaProgressionState): Promise<void>;
}
