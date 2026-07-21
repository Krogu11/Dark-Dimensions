import type {
  CharacterAttribute,
  CharacterSkill,
  CharacterState,
} from "./CharacterProgression";

export type RaceId = "human" | "kobold" | "orc" | "revenant";
export type OriginId = "cityWard" | "borderborn" | "woodland" | "cloistered";
export type UpbringingId = "artisan" | "militia" | "scholar" | "urchin";
export type TurningPointId = "survivor" | "oath" | "exile" | "pilgrim";

export interface CharacterOriginOption<T extends string> {
  id: T;
  name: string;
  description: string;
  effect: string;
  attributeBonuses?: Partial<Record<CharacterAttribute, number>>;
  skillBonuses?: Partial<Record<CharacterSkill, number>>;
  goldBonus?: number;
  items?: Array<{ itemId: string; quantity: number }>;
  rightHandItemId?: string;
  leftHandItemId?: string;
}

export interface RaceOption extends CharacterOriginOption<RaceId> {
  unlocked: boolean;
  unlockCondition?: string;
}

export interface RunProfile {
  name: string;
  raceId: RaceId;
  originId: OriginId;
  upbringingId: UpbringingId;
  turningPointId: TurningPointId;
  portraitId: string;
  startedAt: string;
}

export const RACES: RaceOption[] = [
  {
    id: "human",
    name: "Human",
    description: "Adaptable survivors who still hold the old roads.",
    effect: "Begin with +20 gold and five Village Levies.",
    goldBonus: 20,
    unlocked: true,
  },
  {
    id: "kobold",
    name: "Kobold",
    description: "Tunnel-born scavengers with sharp eyes and quicker feet.",
    effect: "+1 Agility, +1 Spotting",
    attributeBonuses: { agility: 1 },
    skillBonuses: { spotting: 1 },
    unlocked: false,
    unlockCondition: "Defeat the Kobold King in a run.",
  },
  {
    id: "orc",
    name: "Orc",
    description: "Hardened children of the ash wastes.",
    effect: "+1 Strength, +1 Ironflesh",
    attributeBonuses: { strength: 1 },
    skillBonuses: { ironflesh: 1 },
    unlocked: false,
    unlockCondition: "Defeat an Orc Warlord.",
  },
  {
    id: "revenant",
    name: "Revenant",
    description: "A soul returned from beyond the final road.",
    effect: "+1 Intelligence, +1 Tactics",
    attributeBonuses: { intelligence: 1 },
    skillBonuses: { tactics: 1 },
    unlocked: false,
    unlockCondition: "Reach character level 10.",
  },
];

export const ORIGINS: CharacterOriginOption<OriginId>[] = [
  { id: "cityWard", name: "City Ward", description: "Raised beneath guarded walls and merchant bells.", effect: "+1 Charisma, +1 Trade, +40 gold", attributeBonuses: { charisma: 1 }, skillBonuses: { trade: 1 }, goldBonus: 40 },
  { id: "borderborn", name: "Borderborn", description: "The frontier taught you to meet danger head-on.", effect: "+1 Strength, +1 Power Strike, Simple Shield", attributeBonuses: { strength: 1 }, skillBonuses: { powerStrike: 1 }, leftHandItemId: "simple_shield" },
  { id: "woodland", name: "Woodland Kin", description: "You learned every trail before you learned every name.", effect: "+1 Agility, +1 Pathfinding, Hunting Bow", attributeBonuses: { agility: 1 }, skillBonuses: { pathfinding: 1 }, rightHandItemId: "hunting_bow" },
  { id: "cloistered", name: "Cloistered", description: "Old books and wounded pilgrims shaped your youth.", effect: "+1 Intelligence, +1 Wound Treatment, healing poultice", attributeBonuses: { intelligence: 1 }, skillBonuses: { woundTreatment: 1 }, items: [{ itemId: "healing_poultice", quantity: 1 }] },
];

export const UPBRINGINGS: CharacterOriginOption<UpbringingId>[] = [
  { id: "artisan", name: "Artisan Household", description: "Patient hands and an eye for honest value.", effect: "+1 Weapon Master, +25 gold", skillBonuses: { weaponMaster: 1 }, goldBonus: 25 },
  { id: "militia", name: "Militia Drills", description: "You held a spear before you were old enough to enlist.", effect: "+1 Tactics, +1 Leadership", skillBonuses: { tactics: 1, leadership: 1 } },
  { id: "scholar", name: "Keeper of Records", description: "Maps, ledgers and forbidden histories were your inheritance.", effect: "+1 Intelligence, +1 Trainer", attributeBonuses: { intelligence: 1 }, skillBonuses: { trainer: 1 } },
  { id: "urchin", name: "Street Urchin", description: "Hunger made you fast, observant and difficult to catch.", effect: "+1 Agility, +1 Athletics", attributeBonuses: { agility: 1 }, skillBonuses: { athletics: 1 } },
];

export const TURNING_POINTS: CharacterOriginOption<TurningPointId>[] = [
  { id: "survivor", name: "Sole Survivor", description: "You walked away when everyone else fell.", effect: "+1 Ironflesh, extra rations", skillBonuses: { ironflesh: 1 }, items: [{ itemId: "travel_rations", quantity: 1 }] },
  { id: "oath", name: "A Binding Oath", description: "Your word now weighs more than your life.", effect: "+1 Charisma, +1 Persuasion", attributeBonuses: { charisma: 1 }, skillBonuses: { persuasion: 1 } },
  { id: "exile", name: "Cast into Exile", description: "The road became home, and distance became protection.", effect: "+1 Pathfinding, +1 Spotting", skillBonuses: { pathfinding: 1, spotting: 1 } },
  { id: "pilgrim", name: "The Ashen Pilgrimage", description: "You returned with questions and a talent for keeping others alive.", effect: "+1 Wound Treatment, +1 Leadership", skillBonuses: { woundTreatment: 1, leadership: 1 } },
];

export function getRunChoices(profile: RunProfile) {
  return [
    RACES.find((option) => option.id === profile.raceId)!,
    ORIGINS.find((option) => option.id === profile.originId)!,
    UPBRINGINGS.find((option) => option.id === profile.upbringingId)!,
    TURNING_POINTS.find((option) => option.id === profile.turningPointId)!,
  ];
}

export function applyChoiceBonuses(state: CharacterState, profile: RunProfile): void {
  for (const choice of getRunChoices(profile)) {
    for (const [attribute, amount] of Object.entries(choice.attributeBonuses ?? {})) {
      state.attributes[attribute as CharacterAttribute] += amount ?? 0;
    }
    for (const [skill, amount] of Object.entries(choice.skillBonuses ?? {})) {
      const id = skill as CharacterSkill;
      state.skills[id] = Math.min(5, state.skills[id] + (amount ?? 0));
    }
  }
}
