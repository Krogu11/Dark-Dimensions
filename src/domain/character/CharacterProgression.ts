export type CharacterAttribute = "strength" | "agility" | "intelligence" | "charisma";

export type CharacterSkill =
  | "ironflesh"
  | "powerStrike"
  | "weaponMaster"
  | "pathfinding"
  | "spotting"
  | "athletics"
  | "woundTreatment"
  | "trainer"
  | "tactics"
  | "leadership"
  | "trade"
  | "persuasion";

export interface CharacterState {
  level: number;
  xp: number;
  attributes: Record<CharacterAttribute, number>;
  skills: Record<CharacterSkill, number>;
  attributePoints: number;
  skillPoints: number;
}

export interface SkillDefinition {
  id: CharacterSkill;
  attribute: CharacterAttribute;
  nameKey: string;
  descriptionKey: string;
  maxRank: number;
}

export const ATTRIBUTE_KEYS: CharacterAttribute[] = [
  "strength",
  "agility",
  "intelligence",
  "charisma",
];

export const SKILL_DEFINITIONS: SkillDefinition[] = [
  {
    id: "ironflesh",
    attribute: "strength",
    nameKey: "character.skill.ironflesh.name",
    descriptionKey: "character.skill.ironflesh.description",
    maxRank: 5,
  },
  {
    id: "powerStrike",
    attribute: "strength",
    nameKey: "character.skill.powerStrike.name",
    descriptionKey: "character.skill.powerStrike.description",
    maxRank: 5,
  },
  {
    id: "weaponMaster",
    attribute: "strength",
    nameKey: "character.skill.weaponMaster.name",
    descriptionKey: "character.skill.weaponMaster.description",
    maxRank: 5,
  },
  {
    id: "pathfinding",
    attribute: "agility",
    nameKey: "character.skill.pathfinding.name",
    descriptionKey: "character.skill.pathfinding.description",
    maxRank: 5,
  },
  {
    id: "spotting",
    attribute: "agility",
    nameKey: "character.skill.spotting.name",
    descriptionKey: "character.skill.spotting.description",
    maxRank: 5,
  },
  {
    id: "athletics",
    attribute: "agility",
    nameKey: "character.skill.athletics.name",
    descriptionKey: "character.skill.athletics.description",
    maxRank: 5,
  },
  {
    id: "woundTreatment",
    attribute: "intelligence",
    nameKey: "character.skill.woundTreatment.name",
    descriptionKey: "character.skill.woundTreatment.description",
    maxRank: 5,
  },
  {
    id: "trainer",
    attribute: "intelligence",
    nameKey: "character.skill.trainer.name",
    descriptionKey: "character.skill.trainer.description",
    maxRank: 5,
  },
  {
    id: "tactics",
    attribute: "intelligence",
    nameKey: "character.skill.tactics.name",
    descriptionKey: "character.skill.tactics.description",
    maxRank: 5,
  },
  {
    id: "leadership",
    attribute: "charisma",
    nameKey: "character.skill.leadership.name",
    descriptionKey: "character.skill.leadership.description",
    maxRank: 5,
  },
  {
    id: "trade",
    attribute: "charisma",
    nameKey: "character.skill.trade.name",
    descriptionKey: "character.skill.trade.description",
    maxRank: 5,
  },
  {
    id: "persuasion",
    attribute: "charisma",
    nameKey: "character.skill.persuasion.name",
    descriptionKey: "character.skill.persuasion.description",
    maxRank: 5,
  },
];

export function createCharacterState(): CharacterState {
  return {
    level: 1,
    xp: 0,
    attributes: {
      strength: 1,
      agility: 1,
      intelligence: 1,
      charisma: 1,
    },
    skills: {
      ironflesh: 0,
      powerStrike: 0,
      weaponMaster: 0,
      pathfinding: 0,
      spotting: 0,
      athletics: 0,
      woundTreatment: 0,
      trainer: 0,
      tactics: 0,
      leadership: 0,
      trade: 0,
      persuasion: 0,
    },
    attributePoints: 0,
    skillPoints: 0,
  };
}

export function normalizeCharacterState(
  state: Partial<CharacterState> | undefined,
): CharacterState {
  const fallback = createCharacterState();
  return {
    level: Math.max(1, Math.floor(state?.level ?? fallback.level)),
    xp: Math.max(0, Math.floor(state?.xp ?? fallback.xp)),
    attributes: {
      strength: normalizeStat(state?.attributes?.strength, fallback.attributes.strength),
      agility: normalizeStat(state?.attributes?.agility, fallback.attributes.agility),
      intelligence: normalizeStat(
        state?.attributes?.intelligence,
        fallback.attributes.intelligence,
      ),
      charisma: normalizeStat(state?.attributes?.charisma, fallback.attributes.charisma),
    },
    skills: {
      ironflesh: normalizeSkill(state?.skills?.ironflesh),
      powerStrike: normalizeSkill(state?.skills?.powerStrike),
      weaponMaster: normalizeSkill(state?.skills?.weaponMaster),
      pathfinding: normalizeSkill(state?.skills?.pathfinding),
      spotting: normalizeSkill(state?.skills?.spotting),
      athletics: normalizeSkill(state?.skills?.athletics),
      woundTreatment: normalizeSkill(state?.skills?.woundTreatment),
      trainer: normalizeSkill(state?.skills?.trainer),
      tactics: normalizeSkill(state?.skills?.tactics),
      leadership: normalizeSkill(state?.skills?.leadership),
      trade: normalizeSkill(state?.skills?.trade),
      persuasion: normalizeSkill(state?.skills?.persuasion),
    },
    attributePoints: Math.max(0, Math.floor(state?.attributePoints ?? 0)),
    skillPoints: Math.max(0, Math.floor(state?.skillPoints ?? 0)),
  };
}

export function characterXpNeededForNextLevel(level: number): number {
  return 120 + level * 80;
}

export function awardCharacterXp(
  character: CharacterState,
  amount: number,
): number {
  character.xp += Math.max(0, Math.floor(amount));
  let levelsGained = 0;
  while (character.xp >= characterXpNeededForNextLevel(character.level)) {
    character.xp -= characterXpNeededForNextLevel(character.level);
    character.level += 1;
    character.attributePoints += 1;
    character.skillPoints += 1;
    levelsGained += 1;
  }
  return levelsGained;
}

export function spendAttributePoint(
  character: CharacterState,
  attribute: CharacterAttribute,
): boolean {
  if (character.attributePoints <= 0) return false;
  character.attributePoints -= 1;
  character.attributes[attribute] += 1;
  if (attribute === "intelligence") character.skillPoints += 1;
  return true;
}

export function spendSkillPoint(
  character: CharacterState,
  skill: CharacterSkill,
): boolean {
  const definition = SKILL_DEFINITIONS.find((candidate) => candidate.id === skill);
  if (!definition) return false;
  if (character.skillPoints <= 0) return false;
  if (character.skills[skill] >= definition.maxRank) return false;
  character.skillPoints -= 1;
  character.skills[skill] += 1;
  return true;
}

function normalizeStat(value: number | undefined, fallback: number): number {
  return Math.max(1, Math.floor(value ?? fallback));
}

function normalizeSkill(value: number | undefined): number {
  return Math.max(0, Math.min(5, Math.floor(value ?? 0)));
}
