import type { CardDefinition, CardEffect } from "../content/schemas";

const triggerLabels: Record<CardEffect["trigger"], string> = {
  onSummon: "On summon",
  onAttack: "After attacking",
  onDeath: "On death",
};

const targetLabels: Record<NonNullable<CardEffect["target"]>, string> = {
  self: "this unit",
  lowestAlly: "the most wounded ally",
  weakestEnemy: "the weakest enemy",
  strongestEnemy: "the strongest enemy",
  allAllies: "all allies",
  allEnemies: "all enemies",
  sameRaceAllies: "all allied units of the same race",
  randomEnemy: "a random enemy",
};

const zoneLabels: Record<NonNullable<CardEffect["zone"]>, string> = {
  field: "on the field",
  hand: "in hand",
  fieldAndHand: "on the field or in hand",
};

export function describeCardEffect(effect: CardEffect): string {
  const prefix = triggerLabels[effect.trigger];
  if (effect.action === "draw") return `${prefix}: draw ${effect.value} ${effect.value === 1 ? "card" : "cards"}.`;
  if (effect.action === "returnToHand") return `${prefix}: return this unit to its owner's hand with ${effect.value}% HP${effect.limitPerBattle ? `, up to ${effect.limitPerBattle} per battle` : ""}.`;
  const target = targetLabels[effect.target ?? "self"];
  const zone = effect.zone ? ` ${zoneLabels[effect.zone]}` : "";
  const value = effect.valueMode === "percentMaxHp" ? `${effect.value}% of maximum HP` : String(effect.value);
  let action: string;
  if (effect.action === "heal") action = `heal ${target}${zone} by ${value}`;
  else if (effect.action === "damage") action = `deal ${value} damage to ${target}`;
  else if (effect.action === "drain") action = `drain up to ${value} HP from ${target}`;
  else if (effect.action === "shield") action = `grant ${target} a ${value} shield`;
  else {
    const direction = effect.modifier === "decrease" ? "lose" : "gain";
    const duration = effect.duration === "battle" ? " for this battle" : " this round";
    action = `${target} ${direction} ${value} ${(effect.stat ?? "atk").toUpperCase()}${duration}`;
  }
  const condition = effect.condition === "enemyWounded"
    ? " if an enemy is wounded"
    : effect.condition === "selfBelowHalf"
      ? " if this unit is below 50% HP"
      : effect.condition === "allyRaceCount"
        ? ` if at least ${effect.conditionValue ?? 1} allied units share its race`
        : "";
  return `${prefix}: ${action}${condition}.`;
}

export function describeCardEffects(card: Pick<CardDefinition, "battleEffects" | "battleEffect">): string[] {
  return getCardEffects(card).map(describeCardEffect);
}

export function getCardEffects(card: Pick<CardDefinition, "battleEffects" | "battleEffect">): CardEffect[] {
  if (card.battleEffects?.length) return card.battleEffects;
  return card.battleEffect ? legacyEffect(card.battleEffect) : [];
}

export function normalizeLegacyCardEffects(pack: unknown): unknown {
  if (!pack || typeof pack !== "object" || !("cards" in pack) || !Array.isArray(pack.cards)) return pack;
  return {
    ...pack,
    cards: pack.cards.map((card) => {
      if (Array.isArray(card.battleEffects) || typeof card.battleEffect !== "string") return card;
      const { battleEffect, ...rest } = card;
      return { ...rest, battleEffects: legacyEffect(battleEffect) };
    }),
  };
}

function legacyEffect(id: string): CardEffect[] {
  const maps: Record<string, CardEffect> = {
    heal_lowest_300: effect("onSummon", "heal", 300, "lowestAlly", { zone: "field" }),
    burn_weakest_300: effect("onSummon", "damage", 300, "weakestEnemy"),
    shield_self_400: effect("onSummon", "shield", 400, "self"),
    rally_all_150: statEffect("onSummon", 150, "allAllies", "atk", "increase"),
    human_guard_all_180: statEffect("onSummon", 180, "allAllies", "def", "increase"),
    orc_rage_self_250: statEffect("onSummon", 250, "self", "atk", "increase"),
    kobold_pack_100: statEffect("onSummon", 100, "sameRaceAllies", "atk", "increase"),
    undead_drain_200: effect("onSummon", "drain", 200, "weakestEnemy"),
    beast_pack_120: statEffect("onSummon", 120, "sameRaceAllies", "atk", "increase"),
    human_first_aid_180: effect("onSummon", "heal", 180, "lowestAlly", { zone: "field" }),
    human_brace_160: statEffect("onSummon", 160, "allAllies", "def", "increase"),
    human_volley_120: effect("onSummon", "damage", 120, "weakestEnemy"),
    orc_bloodrage_180: statEffect("onSummon", 180, "self", "atk", "increase"),
    orc_overrun_160: effect("onSummon", "damage", 160, "weakestEnemy"),
    kobold_trap_140: statEffect("onSummon", 140, "strongestEnemy", "atk", "decrease"),
    undead_reanimate_30: effect("onSummon", "shield", 30, "self", { valueMode: "percentMaxHp" }),
    machine_repair_180: effect("onSummon", "heal", 180, "lowestAlly", { zone: "field" }),
    machine_armor_all_140: statEffect("onSummon", 140, "allAllies", "def", "increase"),
    elemental_frost_140: statEffect("onSummon", 140, "strongestEnemy", "atk", "decrease"),
    elemental_chain_160: effect("onSummon", "damage", 160, "allEnemies"),
    beast_first_strike_140: effect("onSummon", "damage", 140, "weakestEnemy"),
    beast_hunt_160: statEffect("onSummon", 160, "self", "atk", "increase", { condition: "enemyWounded" }),
  };
  return maps[id] ? [maps[id]] : [];
}

function effect(
  trigger: CardEffect["trigger"],
  action: CardEffect["action"],
  value: number,
  target?: CardEffect["target"],
  extra: Partial<CardEffect> = {},
): CardEffect {
  return { trigger, action, value, ...(target ? { target } : {}), ...extra } as CardEffect;
}

function statEffect(
  trigger: CardEffect["trigger"],
  value: number,
  target: CardEffect["target"],
  stat: NonNullable<CardEffect["stat"]>,
  modifier: NonNullable<CardEffect["modifier"]>,
  extra: Partial<CardEffect> = {},
): CardEffect {
  return { trigger, action: "modifyStat", target, value, stat, modifier, duration: "round", ...extra };
}
