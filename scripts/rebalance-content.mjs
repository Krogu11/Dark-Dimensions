import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packPath = path.join(root, "src", "content", "content-pack.json");
const localePath = path.join(root, "src", "localization", "en.json");
const pack = JSON.parse(fs.readFileSync(packPath, "utf8"));
const locale = JSON.parse(fs.readFileSync(localePath, "utf8"));

const bands = {
  1: { atk: [260, 420], def: [120, 450], maxHp: [720, 1050] },
  2: { atk: [430, 650], def: [260, 750], maxHp: [950, 1450] },
  3: { atk: [650, 1050], def: [500, 1150], maxHp: [1450, 2050] },
  4: { atk: [1000, 1500], def: [800, 1650], maxHp: [2100, 2850] },
  5: { atk: [1450, 2050], def: [1250, 2250], maxHp: [2850, 3800] },
};

const overrides = {
  village_levy: [1, 330, 300, 900, 5, null],
  village_slinger: [1, 360, 180, 780, 6, "human_volley_120"],
  shrine_acolyte: [1, 270, 390, 850, 4, "human_first_aid_180"],
  levy_spearman: [2, 580, 350, 1080, 5, "human_brace_160"],
  novice_archer: [2, 600, 280, 980, 6, "human_volley_120"],
  militia_shieldbearer: [2, 450, 650, 1350, 4, "human_guard_all_180"],
  veteran_spearman: [3, 900, 720, 1750, 5, "human_brace_160"],
  longbow_veteran: [3, 980, 520, 1550, 6, "human_volley_120"],
  ork_rekrut: [2, 590, 370, 1220, 5, "orc_bloodrage_180"],
  orc_tracker: [2, 550, 290, 1080, 6, "orc_overrun_160"],
  orc: [3, 930, 620, 1850, 5, "orc_bloodrage_180"],
  ork_berserker: [3, 1020, 500, 1700, 6, "orc_bloodrage_180"],
  kobold_jung: [1, 300, 180, 760, 7, "kobold_pack_100"],
  kobold_speer: [2, 520, 300, 1030, 7, "kobold_pack_100"],
  kobold_trapper: [2, 440, 390, 980, 7, "kobold_trap_140"],
  skelett: [1, 330, 260, 900, 4, "undead_reanimate_30"],
  lost_soul: [1, 300, 220, 800, 6, "undead_drain_200"],
  fire_spirit: [2, 590, 270, 1000, 6, "burn_weakest_300"],
  flame_elemental: [3, 980, 540, 1650, 6, "elemental_chain_160"],
  dire_wolf: [2, 560, 360, 1100, 8, "beast_pack_120"],
  riesenbat: [1, 350, 220, 800, 8, "beast_first_strike_140"],
};

const newCards = [
  ["swordsman", "Swordsman", "Human", 2, 610, 330, 1080, 5, "human_brace_160", "A disciplined attacker trained to break open exposed formations."],
  ["noble_recruit", "Noble Recruit", "Human", 2, 520, 480, 1200, 6, "rally_all_150", "A privileged recruit with the training and means to join the cavalry."],
  ["mounted_squire", "Mounted Squire", "Human", 3, 850, 750, 1800, 7, "rally_all_150", "A mobile retainer learning to lead a charge from horseback."],
  ["lancer", "Lancer", "Human", 4, 1450, 900, 2450, 7, "human_volley_120", "A heavy cavalry attacker whose charge punishes weakened lines."],
  ["royal_cavalier", "Royal Cavalier", "Human", 5, 1900, 1500, 3300, 7, "rally_all_150", "An elite mounted champion and symbol of human command."],
  ["halberdier", "Halberdier", "Human", 4, 1400, 1250, 2600, 5, "human_brace_160", "A veteran polearm fighter who controls the front line."],
  ["royal_guard", "Royal Guard", "Human", 5, 1720, 2150, 3500, 5, "human_guard_all_180", "The realm's finest defensive infantry."],
  ["orc_youngblood", "Orc Youngblood", "Orc", 1, 400, 180, 900, 5, "orc_bloodrage_180", "An eager raider: dangerous, but still beatable by a new warband."],
  ["kobold_slinger", "Kobold Slinger", "Kobold", 1, 340, 140, 740, 8, "kobold_trap_140", "A skirmisher who wins through distraction and dirty tricks."],
  ["scrap_automaton", "Scrap Automaton", "Machine", 1, 300, 440, 1020, 2, "shield_self_400", "A slow machine assembled from mismatched armor plates."],
  ["maintenance_drone", "Maintenance Drone", "Machine", 1, 270, 350, 820, 4, "machine_repair_180", "A fragile support construct built to repair allied machines."],
  ["ember_spark", "Ember Spark", "Elemental", 1, 410, 140, 740, 7, "burn_weakest_300", "A small but volatile spark of living flame."],
  ["frost_spark", "Frost Spark", "Elemental", 1, 310, 260, 820, 5, "elemental_frost_140", "A shard of cold that slows enemy aggression."],
  ["storm_spark", "Storm Spark", "Elemental", 1, 380, 160, 760, 8, "elemental_chain_160", "Unstable lightning searching for a path through its enemies."],
  ["stray_wolf", "Stray Wolf", "Beast", 1, 390, 230, 880, 7, "beast_hunt_160", "A lean predator that hunts wounded prey."],
  ["giant_rat", "Giant Rat", "Beast", 1, 330, 180, 800, 7, "beast_pack_120", "A vicious scavenger made bold by the pack."],
  ["cave_bat", "Cave Bat", "Beast", 2, 500, 300, 980, 8, "beast_first_strike_140", "A swift cavern hunter that strikes before the line can settle."],
  ["lost_soul", "Lost Soul", "Undead", 1, 300, 220, 800, 6, "undead_drain_200", "A fading spirit that steals warmth from the living."],
  ["plague_rat", "Plague Rat", "Beast", 2, 500, 280, 1000, 7, "beast_pack_120", "A diseased pack hunter hardened by carrion and ruin."],
  ["alpha_rat", "Rat King", "Beast", 3, 820, 560, 1600, 7, "beast_hunt_160", "An enormous alpha that drives its swarm into a frenzy."],
];

const byId = new Map(pack.cards.map((card) => [card.id, card]));
for (const card of pack.cards) {
  if (card.race === "Hero") continue;
  const override = overrides[card.id];
  if (override) {
    const [tier, atk, def, maxHp, initiative, battleEffect] = override;
    Object.assign(card, { tier, atk, def, maxHp, initiative });
    delete card.attack; delete card.defense; delete card.hp;
    if (battleEffect) card.battleEffect = battleEffect;
    else delete card.battleEffect;
    continue;
  }
  const tier = Math.max(1, Math.min(5, card.tier));
  const band = bands[tier];
  card.atk = Math.max(band.atk[0], Math.min(band.atk[1], card.atk));
  card.def = Math.max(band.def[0], Math.min(band.def[1], card.def));
  card.maxHp = Math.max(band.maxHp[0], Math.min(band.maxHp[1], card.maxHp));
  delete card.attack; delete card.defense; delete card.hp;
}

for (const [id, name, race, tier, atk, def, maxHp, initiative, battleEffect, description] of newCards) {
  const existing = byId.get(id);
  const card = existing ?? {
    id,
    nameKey: `cards.${id}.name`,
    descriptionKey: `cards.${id}.description`,
    race,
    rarity: tier >= 5 ? "legendary" : tier >= 4 ? "epic" : tier >= 3 ? "rare" : tier >= 2 ? "uncommon" : "common",
    tier,
    atk,
    def,
    maxHp,
    initiative,
    battleEffect,
  };
  Object.assign(card, { race: race.toLowerCase(), rarity: tier >= 5 ? "legendary" : tier >= 4 ? "epic" : tier >= 3 ? "rare" : tier >= 2 ? "uncommon" : "common", tier, atk, def, maxHp, initiative, battleEffect });
  delete card.attack; delete card.defense; delete card.hp;
  if (!existing) pack.cards.push(card);
  byId.set(id, card);
  locale.cards ??= {};
  locale.cards[id] = { name, description };
}

pack.unitUpgrades = [
  { fromCardId: "village_levy", requiredLevel: 2, options: ["swordsman", "militia_shieldbearer"] },
  { fromCardId: "swordsman", requiredLevel: 3, options: ["soldier", "pikeman"] },
  { fromCardId: "militia_shieldbearer", requiredLevel: 3, options: ["wache", "battle_monk"] },
  { fromCardId: "soldier", requiredLevel: 4, options: ["halberdier", "ranger"] },
  { fromCardId: "halberdier", requiredLevel: 5, options: ["royal_guard"] },
  { fromCardId: "village_slinger", requiredLevel: 2, options: ["novice_archer"] },
  { fromCardId: "novice_archer", requiredLevel: 3, options: ["bogenschutze", "longbowman"] },
  { fromCardId: "bogenschutze", requiredLevel: 4, options: ["ranger"] },
  { fromCardId: "longbowman", requiredLevel: 4, options: ["sniper", "royal_arbalest"] },
  { fromCardId: "noble_recruit", requiredLevel: 3, options: ["mounted_squire"] },
  { fromCardId: "mounted_squire", requiredLevel: 4, options: ["lancer"] },
  { fromCardId: "lancer", requiredLevel: 5, options: ["royal_cavalier"] },
  { fromCardId: "shrine_acolyte", requiredLevel: 2, options: ["priest", "battle_monk"] },
  { fromCardId: "priest", requiredLevel: 4, options: ["high_priest", "crusader"] },
  { fromCardId: "orc_youngblood", requiredLevel: 2, options: ["ork_rekrut", "orc_tracker"] },
  { fromCardId: "ork_rekrut", requiredLevel: 3, options: ["orc", "ork_berserker"] },
  { fromCardId: "orc_tracker", requiredLevel: 3, options: ["orc_wolf_rider", "ember_raider"] },
  { fromCardId: "orc", requiredLevel: 4, options: ["orc_ironhide", "orc_wolf_rider"] },
  { fromCardId: "ork_berserker", requiredLevel: 4, options: ["ember_raider", "orc_ironhide"] },
  { fromCardId: "orc_ironhide", requiredLevel: 5, options: ["ork_kriegsherr", "blood_chieftain"] },
  { fromCardId: "orc_wolf_rider", requiredLevel: 5, options: ["ash_warlord", "blood_chieftain"] },
  { fromCardId: "kobold_jung", requiredLevel: 2, options: ["kobold_speer", "kobold_trapper"] },
  { fromCardId: "kobold_slinger", requiredLevel: 2, options: ["kobold_trapper"] },
  { fromCardId: "kobold_speer", requiredLevel: 3, options: ["goblin", "tunnel_guard"] },
  { fromCardId: "kobold_trapper", requiredLevel: 3, options: ["kobold_shaman", "goblin"] },
  { fromCardId: "goblin", requiredLevel: 4, options: ["kobold_hauptmann", "kobold_jaeger"] },
  { fromCardId: "kobold_hauptmann", requiredLevel: 5, options: ["kobold_koenig"] },
  { fromCardId: "kobold_shaman", requiredLevel: 4, options: ["kobold_hauptmann"] },
  { fromCardId: "kobold_jaeger", requiredLevel: 5, options: ["kobold_koenig", "cave_geomancer"] },
  { fromCardId: "tunnel_guard", requiredLevel: 4, options: ["kobold_hauptmann", "kobold_jaeger"] },
  { fromCardId: "skelett", requiredLevel: 2, options: ["restless_spirit"] },
  { fromCardId: "lost_soul", requiredLevel: 2, options: ["restless_spirit"] },
  { fromCardId: "restless_spirit", requiredLevel: 3, options: ["grave_archer", "knochenwachter"] },
  { fromCardId: "knochenwachter", requiredLevel: 4, options: ["grave_warden", "bone_knight"] },
  { fromCardId: "grave_warden", requiredLevel: 5, options: ["death_paladin", "banshee"] },
  { fromCardId: "grave_archer", requiredLevel: 4, options: ["wraith"] },
  { fromCardId: "wraith", requiredLevel: 5, options: ["banshee"] },
  { fromCardId: "bone_knight", requiredLevel: 5, options: ["death_paladin"] },
  { fromCardId: "scrap_automaton", requiredLevel: 2, options: ["clockwork_scout"] },
  { fromCardId: "maintenance_drone", requiredLevel: 2, options: ["clockwork_scout"] },
  { fromCardId: "clockwork_scout", requiredLevel: 3, options: ["eisenwachter"] },
  { fromCardId: "eisenwachter", requiredLevel: 4, options: ["brass_guardian", "siege_golem"] },
  { fromCardId: "brass_guardian", requiredLevel: 5, options: ["golem", "cannon_golem"] },
  { fromCardId: "ember_spark", requiredLevel: 2, options: ["feuer_geist"] },
  { fromCardId: "frost_spark", requiredLevel: 2, options: ["frost_wisp"] },
  { fromCardId: "storm_spark", requiredLevel: 2, options: ["storm_wisp"] },
  { fromCardId: "feuer_geist", requiredLevel: 3, options: ["flame_elemental"] },
  { fromCardId: "frost_wisp", requiredLevel: 3, options: ["ice_elemental"] },
  { fromCardId: "storm_wisp", requiredLevel: 3, options: ["storm_elemental"] },
  { fromCardId: "flame_elemental", requiredLevel: 4, options: ["phoenix"] },
  { fromCardId: "ice_elemental", requiredLevel: 4, options: ["storm_elemental", "phoenix"] },
  { fromCardId: "stray_wolf", requiredLevel: 2, options: ["dire_wolf"] },
  { fromCardId: "giant_rat", requiredLevel: 2, options: ["plague_rat"] },
  { fromCardId: "plague_rat", requiredLevel: 3, options: ["alpha_rat"] },
  { fromCardId: "riesenbat", requiredLevel: 2, options: ["cave_bat"] },
  { fromCardId: "cave_bat", requiredLevel: 3, options: ["blood_bat"] },
  { fromCardId: "dire_wolf", requiredLevel: 3, options: ["alpha_wolf", "swamp_serpent"] },
  { fromCardId: "alpha_wolf", requiredLevel: 4, options: ["nightwing", "wyvern"] },
  { fromCardId: "swamp_serpent", requiredLevel: 4, options: ["cave_troll", "wyvern"] },
  { fromCardId: "battle_monk", requiredLevel: 4, options: ["crusader"] },
];

const enemyDecks = {
  hungry_wolves: ["stray_wolf", "stray_wolf", "riesenbat"],
  road_reavers: ["orc_youngblood", "orc_youngblood", "giant_rat"],
  kobold_foragers: ["kobold_jung", "kobold_jung", "kobold_slinger"],
  gloam_stalkers: ["riesenbat", "lost_soul", "kobold_trapper"],
  vault_scavengers: ["scrap_automaton", "maintenance_drone", "clockwork_scout"],
  storm_callers: ["storm_spark", "frost_wisp", "storm_wisp"],
};
for (const enemy of pack.enemies ?? []) {
  if (enemyDecks[enemy.id]) enemy.deck = enemyDecks[enemy.id];
}

locale.battle ??= {};
locale.battle.effects ??= {};
Object.assign(locale.battle.effects, {
  human_first_aid_180: "On summon: heal the most wounded ally by 180 HP.",
  human_brace_160: "On summon: all allies gain 160 DEF this round.",
  human_volley_120: "On summon: deal 120 damage to the weakest enemy.",
  orc_bloodrage_180: "On summon: this unit gains 180 ATK this round.",
  orc_overrun_160: "On summon: deal 160 damage to the weakest enemy.",
  kobold_trap_140: "On summon: the strongest enemy loses 140 ATK this round.",
  undead_reanimate_30: "On summon: gain a shield equal to 30% of maximum HP.",
  machine_repair_180: "On summon: repair the most damaged ally by 180 HP.",
  machine_armor_all_140: "On summon: all allies gain 140 DEF this round.",
  elemental_frost_140: "On summon: the strongest enemy loses 140 ATK this round.",
  elemental_chain_160: "On summon: deal 160 damage to every enemy unit.",
  beast_first_strike_140: "On summon: deal 140 damage to the weakest enemy.",
  beast_hunt_160: "On summon: gain 160 ATK if an enemy is wounded.",
});

fs.writeFileSync(packPath, `${JSON.stringify(pack, null, 2)}\n`);
fs.writeFileSync(localePath, `${JSON.stringify(locale, null, 2)}\n`);
console.log(`Rebalanced ${pack.cards.length} cards and ${pack.unitUpgrades.length} upgrade paths.`);
