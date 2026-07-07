import type { CardInstance } from "../../domain/cards/CardInstance";
import type {
  EconomyState,
  InventoryStack,
} from "../../domain/economy/Economy";
import type { FactionState } from "../../domain/quests/Factions";
import type { GameTimeState } from "../../domain/time/GameClock";
import type { SurvivalState } from "../../domain/survival/Survival";

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
  };
  gold?: number;
  deck?: CardInstance[];
  rosterRevision?: number;
  warband?: CardInstance[];
  reserve?: CardInstance[];
  hero?: CardInstance;
  leadershipLevel?: number;
  completedLocationIds?: string[];
  equippedItemId?: string | null;
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
