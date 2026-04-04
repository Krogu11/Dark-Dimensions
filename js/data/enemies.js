/* ============================================================
   data/enemies.js — Gegner-Definitionen v3.0
   ============================================================
   Gegner sind nun thematisch nach Rasse aufgebaut.
   Jeder Gegner spielt ein spezifisches Theme-Deck.

   Felder:
     startField     — Karten beim Start BEREITS auf dem Feld
     startTraps     — Fallen beim Start BEREITS verdeckt
     startHandCount — Starthand des Gegners
     fieldBonus     — ATK-Bonus für ALLE Gegner-Monster
     maxSummons     — Monster pro Runde beschwörbar
     multiAttack    — Monster darf mehrfach angreifen?
     behavior       — KI-Verhaltensmuster
   ============================================================ */

const ENEMIES = {

  /* ══════════════════════════════════════════
     AKT 1 — Einstieg. Aber bereits fordernd.
     Theme: Kobold-Schwarm, Untote, Ork-Gewalt
  ══════════════════════════════════════════ */

  goblin_chief: {
    id:        'goblin_chief',
    name:      'Kobold-Häuptling',
    title:     'Anführer des Waldstamms',
    portrait:  '👺',
    theme:     'Kobold',
    hp:        4000,
    behavior:  'swarm',
    difficulty: 1,
    fieldBonus:  0,
    maxSummons:  3,       // Kobolde SCHWÄRMEN — 3 pro Runde!
    multiAttack: false,
    startField:  ['kobold_jung', 'kobold_jung', 'kobold_speer'],
    startTraps:  ['sacredwall'],
    startFieldCard: 'feld_koboldwald',   // 🌲 Koboldwald aktiv von Beginn
    startHandCount: 5,
    deckIds: [
      'kobold_jung','kobold_jung','kobold_jung','kobold_jung',
      'kobold_speer','kobold_speer','goblin','goblin','goblin',
      'kobold_jaeger','kobold_jaeger',
      'fireball','kleine_flamme','kleine_flamme',
      'sacredwall','sacredwall','counterstrike',
    ],
    dropTable: {
      S_POW:  [{ cardId:'kobold_hauptmann', weight:5 }, { cardId:'kobold_jaeger', weight:8 }, { cardId:'goblin', weight:10 }],
      A_POW:  [{ cardId:'goblin',           weight:20}, { cardId:'kobold_jaeger', weight:15}, { cardId:'kobold_speer', weight:10}],
      B_POW:  [{ cardId:'kobold_speer',     weight:30}, { cardId:'goblin',        weight:20}, { cardId:'kleine_flamme',weight:15}],
      C_POW:  [{ cardId:'kobold_jung',      weight:40}, { cardId:'kleine_flamme', weight:25}, { cardId:'sacredwall',   weight:15}],
      D_POW:  [{ cardId:'kobold_jung',      weight:60}, { cardId:'kleine_flamme', weight:30}],
      TEC:    [{ cardId:'sacredwall',       weight:20}, { cardId:'counterstrike', weight:12}, { cardId:'goblin',       weight:15}],
    }
  },

  skeleton_mage: {
    id:        'skeleton_mage',
    name:      'Skelettmagier',
    title:     'Hüter vergessener Gräber',
    portrait:  '💀',
    theme:     'Untoter',
    hp:        4500,
    behavior:  'control',
    difficulty: 1,
    fieldBonus:  100,
    maxSummons:  2,
    multiAttack: false,
    startField:  ['skelett', 'zombie', 'knochenwachter'],
    startTraps:  ['sacredwall', 'counterstrike'],
    startHandCount: 5,
    deckIds: [
      'skelett','skelett','skelett','zombie','zombie','zombie',
      'knochenwachter','knochenwachter','lich',
      'heallight','heallight','darkinsight','soulsteal',
      'sacredwall','sacredwall','counterstrike','counterstrike','ragequit',
    ],
    dropTable: {
      S_POW:  [{ cardId:'lich',         weight:5 }, { cardId:'knochenwachter',weight:8 }, { cardId:'todesritter',  weight:2}],
      A_POW:  [{ cardId:'knochenwachter',weight:15},{ cardId:'lich',          weight:10}, { cardId:'zombie',       weight:15}],
      B_POW:  [{ cardId:'zombie',       weight:25}, { cardId:'skelett',       weight:20}, { cardId:'soulsteal',    weight:10}],
      C_POW:  [{ cardId:'skelett',      weight:35}, { cardId:'heallight',     weight:20}, { cardId:'darkinsight',  weight:15}],
      D_POW:  [{ cardId:'skelett',      weight:50}, { cardId:'zombie',        weight:30}],
      TEC:    [{ cardId:'ragequit',     weight:15}, { cardId:'counterstrike', weight:15}, { cardId:'soulsteal',    weight:12}],
    }
  },

  orc_warlord: {
    id:        'orc_warlord',
    name:      'Ork-Kriegsherr',
    title:     'Elite des Waldschwarms',
    portrait:  '⚔️',
    theme:     'Ork',
    hp:        5000,
    behavior:  'aggressive',
    difficulty: 2,
    fieldBonus:  200,
    maxSummons:  2,
    multiAttack: false,
    startField:  ['orc', 'orc', 'ork_berserker'],
    startTraps:  ['mirrorforce'],
    startHandCount: 5,
    deckIds: [
      'ork_rekrut','ork_rekrut','orc','orc','orc','ork_berserker','ork_berserker',
      'ork_schamane',
      'warcry','warcry','fireball','lightning',
      'counterstrike','mirrorforce','ragequit',
    ],
    dropTable: {
      S_POW:  [{ cardId:'ork_berserker',  weight:5 }, { cardId:'ork_schamane',  weight:5 }, { cardId:'orc',          weight:10}],
      A_POW:  [{ cardId:'orc',            weight:15}, { cardId:'ork_berserker', weight:10}, { cardId:'warcry',       weight:8 }],
      B_POW:  [{ cardId:'orc',            weight:25}, { cardId:'ork_rekrut',    weight:20}, { cardId:'warcry',       weight:10}],
      C_POW:  [{ cardId:'ork_rekrut',     weight:30}, { cardId:'fireball',      weight:20}, { cardId:'lightning',    weight:10}],
      D_POW:  [{ cardId:'ork_rekrut',     weight:50}, { cardId:'fireball',      weight:30}],
      TEC:    [{ cardId:'mirrorforce',    weight:12}, { cardId:'warcry',        weight:20}, { cardId:'ork_schamane', weight:10}],
    }
  },

  forest_demon: {
    id:        'forest_demon',
    name:      'Walddämon',
    title:     'Boss — Wächter des Dunklen Waldes',
    portrait:  '🌑',
    theme:     'Dämon',
    hp:        6500,
    behavior:  'boss_balanced',
    difficulty: 3,
    fieldBonus:  250,
    maxSummons:  2,
    multiAttack: true,
    startField:  ['feuerdaemon', 'dunkelherr', 'kleiner_daemon'],
    startTraps:  ['mirrorforce', 'counterstrike'],
    startHandCount: 6,
    deckIds: [
      'kleiner_daemon','kleiner_daemon','daemon_lakai','daemon_lakai','feuerdaemon','feuerdaemon',
      'dunkelherr','cursed_knight',
      'orc','ork_berserker',
      'warcry','fireball','lightning','soulsteal',
      'counterstrike','counterstrike','mirrorforce','mirrorforce','ragequit',
    ],
    dropTable: {
      S_POW:  [{ cardId:'dunkelherr',     weight:3 }, { cardId:'cursed_knight', weight:5 }, { cardId:'feuerdaemon',  weight:8}],
      A_POW:  [{ cardId:'feuerdaemon',    weight:12}, { cardId:'cursed_knight', weight:8 }, { cardId:'daemon_lakai', weight:10}],
      B_POW:  [{ cardId:'daemon_lakai',   weight:20}, { cardId:'feuerdaemon',   weight:15}, { cardId:'soulsteal',    weight:10}],
      C_POW:  [{ cardId:'kleiner_daemon', weight:25}, { cardId:'fireball',      weight:20}, { cardId:'lightning',    weight:10}],
      D_POW:  [{ cardId:'kleiner_daemon', weight:40}, { cardId:'fireball',      weight:30}],
      TEC:    [{ cardId:'mirrorforce',    weight:12}, { cardId:'soulsteal',     weight:15}, { cardId:'dunkelherr',   weight:5}],
    }
  },

  /* ══════════════════════════════════════════
     AKT 2 — Gefährlich & thematisch stark
     Theme: Schatten, Maschinen, Untote Eliten
  ══════════════════════════════════════════ */

  shadow_knight: {
    id:        'shadow_knight',
    name:      'Schattenritter',
    title:     'Gefallener Paladin des Schattens',
    portrait:  '🗡️',
    theme:     'Schattenwesen',
    hp:        5200,
    behavior:  'aggressive',
    difficulty: 2,
    fieldBonus:  250,
    maxSummons:  2,
    multiAttack: false,
    startField:  ['schattenklinge', 'assassin', 'schattenschleicher'],
    startTraps:  ['counterstrike', 'ragequit'],
    startHandCount: 5,
    deckIds: [
      'schattenschleicher','schattenschleicher','schattenklinge','schattenklinge',
      'witch','witch','assassin','assassin',
      'soldier','orc',
      'lightning','soulsteal','soulsteal','gedankenraub',
      'counterstrike','counterstrike','ragequit','ragequit',
    ],
    dropTable: {
      S_POW:  [{ cardId:'assassin',      weight:5 }, { cardId:'schattenklinge', weight:8 }, { cardId:'gedankenraub', weight:2}],
      A_POW:  [{ cardId:'schattenklinge',weight:15}, { cardId:'assassin',       weight:10}, { cardId:'witch',        weight:12}],
      B_POW:  [{ cardId:'witch',         weight:20}, { cardId:'schattenschleicher',weight:15},{cardId:'soulsteal',   weight:10}],
      C_POW:  [{ cardId:'schattenschleicher',weight:30},{cardId:'soulsteal',    weight:20}, { cardId:'lightning',    weight:15}],
      D_POW:  [{ cardId:'schattenschleicher',weight:40},{cardId:'soldier',      weight:30}],
      TEC:    [{ cardId:'ragequit',      weight:15}, { cardId:'gedankenraub',   weight:8 }, { cardId:'soulsteal',    weight:15}],
    }
  },

  dark_priest: {
    id:        'dark_priest',
    name:      'Untoten-Beschwörer',
    title:     'Meister der Wiederkehr',
    portrait:  '🧿',
    theme:     'Untoter',
    hp:        5800,
    behavior:  'control',
    difficulty: 3,
    fieldBonus:  200,
    maxSummons:  2,
    multiAttack: false,
    startField:  ['todesritter', 'lich', 'knochenwachter'],
    startTraps:  ['mirrorforce', 'sacredwall', 'ragequit'],
    startHandCount: 6,
    deckIds: [
      'skelett','zombie','zombie','knochenwachter','knochenwachter',
      'todesritter','todesritter','lich','lich','necro','necro',
      'heallight','heallight','darkinsight','soulsteal','soulsteal','ruf_der_toten',
      'sacredwall','sacredwall','mirrorforce','mirrorforce','ragequit','counterstrike',
    ],
    dropTable: {
      S_POW:  [{ cardId:'todesritter',   weight:4 }, { cardId:'lich',           weight:5 }, { cardId:'necro',        weight:6}],
      A_POW:  [{ cardId:'necro',         weight:12}, { cardId:'todesritter',    weight:10}, { cardId:'lich',         weight:8}],
      B_POW:  [{ cardId:'lich',          weight:20}, { cardId:'knochenwachter', weight:15}, { cardId:'ruf_der_toten',weight:8}],
      C_POW:  [{ cardId:'knochenwachter',weight:25}, { cardId:'zombie',         weight:20}, { cardId:'soulsteal',    weight:12}],
      D_POW:  [{ cardId:'zombie',        weight:40}, { cardId:'skelett',        weight:30}],
      TEC:    [{ cardId:'mirrorforce',   weight:10}, { cardId:'ruf_der_toten',  weight:12}, { cardId:'soulsteal',    weight:15}],
    }
  },

  iron_golem_guard: {
    id:        'iron_golem_guard',
    name:      'Maschinenwächter',
    title:     'Elite der Verfluchten Fabrik',
    portrait:  '🤖',
    theme:     'Maschine',
    hp:        7500,
    behavior:  'tank',
    difficulty: 3,
    fieldBonus:  400,
    maxSummons:  2,
    multiAttack: false,
    startField:  ['belagerungsgolem', 'golem', 'eisenwachter'],
    startTraps:  ['mirrorforce', 'mirrorforce', 'counterstrike'],
    startHandCount: 5,
    deckIds: [
      'eisenwachter','eisenwachter','kampfkanone','kampfkanone',
      'golem','golem','belagerungsgolem','belagerungsgolem',
      'knight','shieldguard',
      'warcry','warcry','lightning','annihilate',
      'mirrorforce','mirrorforce','mirrorforce','ragequit','ragequit','counterstrike','counterstrike',
    ],
    dropTable: {
      S_POW:  [{ cardId:'belagerungsgolem',weight:3}, { cardId:'golem',         weight:5 }, { cardId:'kampfkanone',  weight:8}],
      A_POW:  [{ cardId:'golem',          weight:10}, { cardId:'belagerungsgolem',weight:7},{ cardId:'kampfkanone',  weight:12}],
      B_POW:  [{ cardId:'kampfkanone',    weight:20}, { cardId:'golem',          weight:15},{ cardId:'annihilate',   weight:8}],
      C_POW:  [{ cardId:'eisenwachter',   weight:25}, { cardId:'warcry',         weight:20},{ cardId:'lightning',    weight:12}],
      D_POW:  [{ cardId:'eisenwachter',   weight:40}, { cardId:'warcry',         weight:30}],
      TEC:    [{ cardId:'mirrorforce',    weight:12}, { cardId:'annihilate',     weight:8 }, { cardId:'golem',        weight:6}],
    }
  },

  chaos_lord: {
    id:        'chaos_lord',
    name:      'Chaos-Herrscher',
    title:     'Boss — Herr aller Dimensionen',
    portrait:  '🌀',
    theme:     'Dämon',
    hp:        9000,
    behavior:  'boss_aggro',
    difficulty: 4,
    fieldBonus:  350,
    maxSummons:  3,
    multiAttack: true,
    startField:  ['dunkelherr', 'cursed_knight', 'schattenlord'],
    startTraps:  ['mirrorforce', 'counterstrike', 'ragequit'],
    startHandCount: 7,
    deckIds: [
      'kleiner_daemon','daemon_lakai','feuerdaemon','feuerdaemon','dunkelherr','dunkelherr',
      'cursed_knight','cursed_knight','schattenlord',
      'assassin','schattenklinge',
      'lightning','lightning','annihilate','annihilate','soulsteal','soulsteal','gedankenraub','warcry',
      'mirrorforce','mirrorforce','mirrorforce','counterstrike','counterstrike','ragequit','ragequit',
    ],
    dropTable: {
      S_POW:  [{ cardId:'schattenlord',   weight:3 }, { cardId:'dunkelherr',    weight:5 }, { cardId:'cursed_knight',weight:6}],
      A_POW:  [{ cardId:'dunkelherr',     weight:8 }, { cardId:'schattenlord',  weight:6 }, { cardId:'feuerdaemon',  weight:10}],
      B_POW:  [{ cardId:'feuerdaemon',    weight:15}, { cardId:'annihilate',    weight:10}, { cardId:'soulsteal',    weight:12}],
      C_POW:  [{ cardId:'cursed_knight',  weight:20}, { cardId:'lightning',     weight:18}, { cardId:'soulsteal',    weight:15}],
      D_POW:  [{ cardId:'lightning',      weight:35}, { cardId:'warcry',        weight:25}],
      TEC:    [{ cardId:'mirrorforce',    weight:10}, { cardId:'gedankenraub',  weight:8 }, { cardId:'annihilate',   weight:10}],
    }
  },

  /* ══════════════════════════════════════════
     AKT 3 — Brutal. "Unfair". Kein Pardon.
     Theme: Drachen, Elementare, Finaler Boss
  ══════════════════════════════════════════ */

  void_reaper: {
    id:        'void_reaper',
    name:      'Drachen-Beschwörer',
    title:     'Meister der alten Drachen',
    portrait:  '🐉',
    theme:     'Drache',
    hp:        7000,
    behavior:  'boss_aggro',
    difficulty: 4,
    fieldBonus:  400,
    maxSummons:  2,
    multiAttack: true,
    startField:  ['shadowdrake', 'dragon', 'eisdrache'],
    startTraps:  ['mirrorforce', 'mirrorforce', 'counterstrike'],
    startHandCount: 6,
    deckIds: [
      'drachen_hatchling','drachen_hatchling',
      'eisdrache','eisdrache','shadowdrake','shadowdrake','dragon','dragon',
      'dunkelherr','ork_berserker',
      'lightning','lightning','annihilate','warcry','warcry','soulsteal',
      'mirrorforce','mirrorforce','counterstrike','counterstrike','ragequit','ragequit',
    ],
    dropTable: {
      S_POW:  [{ cardId:'dragon',         weight:5 }, { cardId:'eisdrache',     weight:6 }, { cardId:'shadowdrake',  weight:8}],
      A_POW:  [{ cardId:'shadowdrake',    weight:12}, { cardId:'dragon',        weight:8 }, { cardId:'eisdrache',    weight:10}],
      B_POW:  [{ cardId:'eisdrache',      weight:15}, { cardId:'dunkelherr',    weight:12}, { cardId:'annihilate',   weight:8}],
      C_POW:  [{ cardId:'drachen_hatchling',weight:25},{cardId:'lightning',     weight:18}, { cardId:'soulsteal',    weight:12}],
      D_POW:  [{ cardId:'drachen_hatchling',weight:40},{cardId:'lightning',     weight:30}],
      TEC:    [{ cardId:'mirrorforce',    weight:10}, { cardId:'annihilate',    weight:8 }, { cardId:'dragon',       weight:5}],
    }
  },

  soul_devourer: {
    id:        'soul_devourer',
    name:      'Elementar-König',
    title:     'Herrscher über die Elementare',
    portrait:  '💠',
    theme:     'Elementar',
    hp:        9500,
    behavior:  'final_boss',
    difficulty: 5,
    fieldBonus:  500,
    maxSummons:  3,
    multiAttack: true,
    startField:  ['thundergod', 'chaos_elementar', 'sturm_elementar'],
    startTraps:  ['mirrorforce', 'mirrorforce', 'ragequit'],
    startHandCount: 7,
    deckIds: [
      'feuer_geist','feuer_geist','eis_geist','eis_geist',
      'sturm_elementar','sturm_elementar','phoenix','chaos_elementar','chaos_elementar',
      'thundergod','thundergod',
      'hoellenfeuer','hoellenfeuer','annihilate','annihilate','lightning','soulsteal','soulsteal','warcry',
      'mirrorforce','mirrorforce','mirrorforce','counterstrike','counterstrike','ragequit','ragequit',
    ],
    dropTable: {
      S_POW:  [{ cardId:'thundergod',     weight:3 }, { cardId:'chaos_elementar',weight:5},{ cardId:'phoenix',      weight:5}],
      A_POW:  [{ cardId:'chaos_elementar',weight:8 }, { cardId:'thundergod',    weight:5 }, { cardId:'sturm_elementar',weight:10}],
      B_POW:  [{ cardId:'sturm_elementar',weight:15}, { cardId:'phoenix',       weight:8 }, { cardId:'hoellenfeuer', weight:8}],
      C_POW:  [{ cardId:'feuer_geist',    weight:25}, { cardId:'annihilate',    weight:15}, { cardId:'lightning',    weight:12}],
      D_POW:  [{ cardId:'feuer_geist',    weight:40}, { cardId:'eis_geist',     weight:30}],
      TEC:    [{ cardId:'mirrorforce',    weight:8 }, { cardId:'phoenix',       weight:6 }, { cardId:'hoellenfeuer', weight:8}],
    }
  },

  dark_dimension_god: {
    id:        'dark_dimension_god',
    name:      'Gott der Dunklen Dimension',
    title:     '⚠ FINALER BOSS — Keine Gnade.',
    portrait:  '👁️',
    theme:     'Gemischt',
    hp:        14000,
    behavior:  'final_boss',
    difficulty: 6,
    fieldBonus:  700,
    maxSummons:  3,
    multiAttack: true,
    startField:  ['thundergod', 'dragon', 'dunkelherr', 'shadowdrake', 'chaos_elementar'],
    startTraps:  ['mirrorforce', 'counterstrike', 'ragequit'],
    startHandCount: 7,
    deckIds: [
      /* Drachen */
      'dragon','dragon','shadowdrake','shadowdrake','eisdrache',
      /* Dämonen */
      'dunkelherr','dunkelherr','cursed_knight','cursed_knight',
      /* Elementare */
      'thundergod','thundergod','chaos_elementar','chaos_elementar','phoenix','phoenix',
      /* Untote */
      'todesritter','lich','lich','necro',
      /* Spells: maximaler Schaden */
      'hoellenfeuer','hoellenfeuer','annihilate','annihilate','annihilate',
      'lightning','lightning','soulsteal','soulsteal','warcry','gedankenraub',
      /* Fallen: alle Arten */
      'mirrorforce','mirrorforce','mirrorforce',
      'counterstrike','counterstrike','ragequit','ragequit','seelenfalle',
    ],
    dropTable: {
      S_POW:  [
        { cardId:'thundergod',      weight:3  },
        { cardId:'chaos_elementar', weight:5  },
        { cardId:'dragon',          weight:8  },
        { cardId:'dunkelherr',      weight:6  },
      ],
      A_POW:  [
        { cardId:'dragon',          weight:10 },
        { cardId:'thundergod',      weight:6  },
        { cardId:'chaos_elementar', weight:8  },
      ],
      B_POW:  [
        { cardId:'shadowdrake',     weight:15 },
        { cardId:'cursed_knight',   weight:12 },
        { cardId:'hoellenfeuer',    weight:10 },
      ],
      C_POW:  [
        { cardId:'eisdrache',       weight:20 },
        { cardId:'lightning',       weight:18 },
        { cardId:'soulsteal',       weight:15 },
      ],
      D_POW:  [
        { cardId:'drachen_hatchling',weight:30 },
        { cardId:'annihilate',      weight:25 },
        { cardId:'lightning',       weight:20 },
      ],
      TEC:    [
        { cardId:'mirrorforce',     weight:8  },
        { cardId:'phoenix',         weight:5  },
        { cardId:'gedankenraub',    weight:8  },
        { cardId:'thundergod',      weight:1  },
      ],
    }
  },
};

/* ──────────────────────────────────────────────────
   DD_CUSTOM OVERRIDE — Editor
   DD_CUSTOM.enemies ist ein OBJEKT: { [enemyId]: { ...overrides } }
────────────────────────────────────────────────── */
(function _applyEnemyOverrides() {
  if (!window.DD_CUSTOM || !window.DD_CUSTOM.enemies) return;
  const overrides = window.DD_CUSTOM.enemies;
  // Unterstützt sowohl Objekt- als auch Array-Format (Abwärtskompatibilität)
  const entries = Array.isArray(overrides)
    ? overrides.map(c => [c.id, c])
    : Object.entries(overrides);
  entries.forEach(([id, custom]) => {
    if (ENEMIES[id]) {
      ENEMIES[id] = Object.assign({}, ENEMIES[id], custom);
    } else {
      ENEMIES[id] = { id, ...custom };
    }
  });
})();

/** Gibt alle Gegner als Array zurück (für den Editor). */
function _getCustomEnemyById(enemyId) {
  if (!window.DD_CUSTOM || !window.DD_CUSTOM.enemies || !enemyId) return null;
  const overrides = window.DD_CUSTOM.enemies;
  if (Array.isArray(overrides)) {
    return overrides.find(entry => entry && entry.id === enemyId) || null;
  }
  if (typeof overrides === 'object') {
    return overrides[enemyId] ? { id: enemyId, ...overrides[enemyId] } : null;
  }
  return null;
}

function _ensureEnemyLoaded(enemyId) {
  if (!enemyId) return null;
  if (ENEMIES[enemyId]) return ENEMIES[enemyId];

  const customEnemy = _getCustomEnemyById(enemyId);
  if (!customEnemy) return null;

  ENEMIES[enemyId] = { id: enemyId, ...customEnemy };
  console.info('[Enemies] Runtime fallback loaded custom enemy:', enemyId);
  return ENEMIES[enemyId];
}

function getEnemyList() {
  const overrides = window.DD_CUSTOM?.enemies;
  if (Array.isArray(overrides)) {
    overrides.forEach(enemy => {
      if (enemy && enemy.id && !ENEMIES[enemy.id]) {
        ENEMIES[enemy.id] = { id: enemy.id, ...enemy };
      }
    });
  } else if (overrides && typeof overrides === 'object') {
    Object.entries(overrides).forEach(([id, enemy]) => {
      if (id && enemy && !ENEMIES[id]) {
        ENEMIES[id] = { id, ...enemy };
      }
    });
  }
  return Object.values(ENEMIES);
}

function getEnemy(enemyId) {
  const enemy = _ensureEnemyLoaded(enemyId);
  if (!enemy) return null;

  const deckIds = Array.isArray(enemy.deckIds)
    ? enemy.deckIds
    : Array.isArray(enemy.deck)
      ? enemy.deck.map(card => card.id || card)
      : [];

  return {
    ...enemy,
    deckIds: [...deckIds],
  };
}

(function _prepareLocalizedEnemies() {
  if (typeof prepareEnemyLocalization !== 'function') return;
  Object.values(ENEMIES).forEach(prepareEnemyLocalization);
})();

