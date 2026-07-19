export type LeaderCommandEffect = "attack" | "attackAll" | "defenseAll" | "healLowest" | "shieldAll";

export interface LeaderCommandDefinition {
  id: string;
  race: string;
  unlockLevel: number;
  icon: string;
  effect: LeaderCommandEffect;
  baseValue: number;
  valuePerLevel: number;
}

const attack: LeaderCommandDefinition = {
  id: "attack",
  race: "universal",
  unlockLevel: 1,
  icon: "⚔",
  effect: "attack",
  baseValue: 0,
  valuePerLevel: 0,
};

const racialCommands: Record<string, LeaderCommandDefinition[]> = {
  hero: [
    { id: "rally", race: "hero", unlockLevel: 1, icon: "▲", effect: "attackAll", baseValue: 160, valuePerLevel: 20 },
    { id: "guard", race: "hero", unlockLevel: 3, icon: "◆", effect: "defenseAll", baseValue: 200, valuePerLevel: 25 },
    { id: "restore", race: "hero", unlockLevel: 5, icon: "✚", effect: "healLowest", baseValue: 300, valuePerLevel: 35 },
  ],
  human: [
    { id: "humanBulwark", race: "human", unlockLevel: 1, icon: "◇", effect: "defenseAll", baseValue: 220, valuePerLevel: 30 },
    { id: "humanFieldAid", race: "human", unlockLevel: 3, icon: "✚", effect: "healLowest", baseValue: 340, valuePerLevel: 40 },
    { id: "humanSanctuary", race: "human", unlockLevel: 5, icon: "✦", effect: "shieldAll", baseValue: 240, valuePerLevel: 30 },
  ],
  orc: [
    { id: "orcWarcry", race: "orc", unlockLevel: 1, icon: "▲", effect: "attackAll", baseValue: 220, valuePerLevel: 35 },
    { id: "orcBloodrush", race: "orc", unlockLevel: 3, icon: "☠", effect: "attackAll", baseValue: 300, valuePerLevel: 45 },
  ],
  kobold: [
    { id: "koboldMob", race: "kobold", unlockLevel: 1, icon: "♟", effect: "attackAll", baseValue: 90, valuePerLevel: 18 },
    { id: "koboldTrap", race: "kobold", unlockLevel: 3, icon: "⌁", effect: "defenseAll", baseValue: 180, valuePerLevel: 25 },
  ],
  undead: [
    { id: "undeadDrain", race: "undead", unlockLevel: 1, icon: "☾", effect: "healLowest", baseValue: 240, valuePerLevel: 35 },
    { id: "undeadDeathWard", race: "undead", unlockLevel: 3, icon: "☠", effect: "shieldAll", baseValue: 220, valuePerLevel: 30 },
  ],
  machine: [
    { id: "machineFortify", race: "machine", unlockLevel: 1, icon: "⬡", effect: "shieldAll", baseValue: 260, valuePerLevel: 35 },
    { id: "machineOverclock", race: "machine", unlockLevel: 3, icon: "⚙", effect: "attackAll", baseValue: 190, valuePerLevel: 30 },
  ],
  elemental: [
    { id: "elementalSurge", race: "elemental", unlockLevel: 1, icon: "✧", effect: "attackAll", baseValue: 210, valuePerLevel: 35 },
    { id: "elementalWard", race: "elemental", unlockLevel: 3, icon: "◈", effect: "shieldAll", baseValue: 200, valuePerLevel: 30 },
  ],
  beast: [
    { id: "beastHunt", race: "beast", unlockLevel: 1, icon: "➤", effect: "attackAll", baseValue: 180, valuePerLevel: 30 },
    { id: "beastPackGuard", race: "beast", unlockLevel: 3, icon: "◇", effect: "defenseAll", baseValue: 170, valuePerLevel: 25 },
  ],
};

export function getLeaderCommands(race: string, level: number): LeaderCommandDefinition[] {
  return getLeaderCommandProgression(race).filter((command) => level >= command.unlockLevel);
}

export function getLeaderCommandProgression(race: string): LeaderCommandDefinition[] {
  return [attack, ...(racialCommands[race] ?? racialCommands.hero)];
}

export function getLeaderCommand(id: string, race: string): LeaderCommandDefinition | undefined {
  return [attack, ...(racialCommands[race] ?? racialCommands.hero)].find((command) => command.id === id);
}

export function getLeaderCommandValue(command: LeaderCommandDefinition, level: number): number {
  return command.baseValue + Math.max(0, level - command.unlockLevel) * command.valuePerLevel;
}
