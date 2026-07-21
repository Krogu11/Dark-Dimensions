import type { RaceId } from "../character/CharacterOrigins";

export type MetaUpgradeId =
  | "soulVitality" | "soulMight" | "soulGuard" | "soulReflex" | "soulRecovery" | "deathDefiance" | "startingAttributes"
  | "startingGold" | "roadRations" | "startingTroops" | "warbandCapacity" | "fieldSlots" | "drillmaster" | "frugalHost" | "bannerMorale" | "resilientRanks"
  | "graveTithe" | "scavenger" | "deepPockets" | "merchantFavor" | "captor" | "soulHarvest"
  | "foreignWhispers" | "kobold" | "orc" | "revenant" | "beastPact" | "machinePact" | "elementalPact";

export type MetaUpgradeBranch = "wanderer" | "warband" | "fortune" | "peoples";

export interface MetaProgressionState {
  version: 1;
  souls: number;
  upgrades: Partial<Record<MetaUpgradeId, number>>;
  storyStage: number;
  seenUnitIds: string[];
  ownedUnitIds: string[];
}

export interface MetaUpgradeDefinition {
  id: MetaUpgradeId;
  nameKey: string;
  descriptionKey: string;
  costs: number[];
  branch: MetaUpgradeBranch;
  requires?: MetaUpgradeId[];
  icon: string;
  x: number;
  y: number;
}

const node = (id: MetaUpgradeId, branch: MetaUpgradeBranch, costs: number[], icon: string, x: number, y: number, requires?: MetaUpgradeId[]): MetaUpgradeDefinition => ({
  id,
  branch,
  costs,
  icon,
  x,
  y,
  requires,
  nameKey: `soulTemple.upgrades.${id}.name`,
  descriptionKey: `soulTemple.upgrades.${id}.description`,
});

export const META_UPGRADES: MetaUpgradeDefinition[] = [
  node("soulVitality", "wanderer", [5, 12, 25, 45, 75], "♥", 12, 48),
  node("soulMight", "wanderer", [8, 18, 36, 62, 95], "⚔", 27, 28, ["soulVitality"]),
  node("soulGuard", "wanderer", [8, 18, 36, 62, 95], "◆", 27, 68, ["soulVitality"]),
  node("soulReflex", "wanderer", [18, 42, 80], "➶", 43, 17, ["soulMight"]),
  node("soulRecovery", "wanderer", [15, 35, 70], "✚", 43, 80, ["soulGuard"]),
  node("deathDefiance", "wanderer", [35, 80, 150], "☠", 58, 31, ["soulReflex"]),
  node("startingAttributes", "wanderer", [60, 140, 260], "✦", 58, 66, ["soulRecovery"]),

  node("startingGold", "warband", [5, 10, 20, 35], "●", 12, 48),
  node("roadRations", "warband", [6, 15, 32, 60], "▣", 27, 24, ["startingGold"]),
  node("startingTroops", "warband", [20, 50, 100], "⚑", 27, 71, ["startingGold"]),
  node("deepPockets", "warband", [12, 28, 55, 95], "▤", 43, 12, ["roadRations"]),
  node("warbandCapacity", "warband", [15, 35, 70], "♟", 43, 58, ["startingTroops"]),
  node("bannerMorale", "warband", [18, 42, 85], "☀", 43, 86, ["startingTroops"]),
  node("frugalHost", "warband", [25, 60, 115], "◒", 59, 38, ["warbandCapacity"]),
  node("drillmaster", "warband", [28, 68, 130], "✥", 59, 65, ["warbandCapacity"]),
  node("resilientRanks", "warband", [45, 100, 190], "✚", 74, 48, ["frugalHost", "drillmaster"]),
  node("fieldSlots", "warband", [70, 160, 300], "▦", 89, 48, ["resilientRanks"]),

  node("graveTithe", "fortune", [8, 20, 40, 75], "◇", 12, 48),
  node("scavenger", "fortune", [15, 38, 78, 135], "⌕", 30, 20, ["graveTithe"]),
  node("merchantFavor", "fortune", [18, 45, 90], "⚖", 30, 75, ["graveTithe"]),
  node("captor", "fortune", [25, 60, 120], "⛓", 49, 16, ["scavenger"]),
  node("soulHarvest", "fortune", [30, 72, 145], "◉", 49, 80, ["merchantFavor"]),

  node("foreignWhispers", "peoples", [12], "◎", 12, 48),
  node("kobold", "peoples", [40], "♜", 31, 15, ["foreignWhispers"]),
  node("orc", "peoples", [60], "♞", 31, 48, ["foreignWhispers"]),
  node("revenant", "peoples", [100], "☠", 31, 82, ["foreignWhispers"]),
  node("beastPact", "peoples", [75], "♞", 55, 12, ["kobold"]),
  node("machinePact", "peoples", [110], "⚙", 55, 48, ["orc"]),
  node("elementalPact", "peoples", [140], "✧", 55, 84, ["revenant"]),
];

export function createMetaProgression(): MetaProgressionState {
  return { version: 1, souls: 0, upgrades: {}, storyStage: 0, seenUnitIds: [], ownedUnitIds: [] };
}

export function normalizeMetaProgression(state: Partial<MetaProgressionState> | null | undefined): MetaProgressionState {
  const fresh = createMetaProgression();
  return {
    ...fresh,
    ...state,
    upgrades: { ...(state?.upgrades ?? {}) },
    seenUnitIds: [...new Set(state?.seenUnitIds ?? [])],
    ownedUnitIds: [...new Set(state?.ownedUnitIds ?? [])],
  };
}

export function metaRank(state: MetaProgressionState, id: MetaUpgradeId): number {
  return state.upgrades[id] ?? 0;
}

export function isMetaUpgradeRevealed(state: MetaProgressionState, definition: MetaUpgradeDefinition): boolean {
  if (metaRank(state, definition.id) > 0) return true;
  return !definition.requires?.length || definition.requires.every((requiredId) => metaRank(state, requiredId) > 0);
}

export function canBuyMetaUpgrade(state: MetaProgressionState, id: MetaUpgradeId): boolean {
  const definition = META_UPGRADES.find((entry) => entry.id === id);
  const cost = definition?.costs[metaRank(state, id)];
  return cost !== undefined && state.souls >= cost && Boolean(definition && isMetaUpgradeRevealed(state, definition));
}

export function buyMetaUpgrade(state: MetaProgressionState, id: MetaUpgradeId): boolean {
  if (!canBuyMetaUpgrade(state, id)) return false;
  const definition = META_UPGRADES.find((entry) => entry.id === id)!;
  state.souls -= definition.costs[metaRank(state, id)];
  state.upgrades[id] = metaRank(state, id) + 1;
  return true;
}

export function isRaceUnlocked(state: MetaProgressionState, race: RaceId): boolean {
  return race === "human" || metaRank(state, race) > 0;
}

export function isAltarRaceUnlocked(state: MetaProgressionState, race: string): boolean {
  if (race === "human") return true;
  if (race === "beast") return metaRank(state, "beastPact") > 0;
  if (race === "machine") return metaRank(state, "machinePact") > 0;
  if (race === "elemental") return metaRank(state, "elementalPact") > 0;
  return race === "kobold" ? metaRank(state, "kobold") > 0 : race === "orc" ? metaRank(state, "orc") > 0 : race === "undead" ? metaRank(state, "revenant") > 0 : false;
}

export function soulValueForTier(tier: number): number {
  return [0, 1, 3, 7, 15, 30, 60][Math.max(1, Math.min(6, tier))];
}
