/* ============================================================
   data/map.js — World Map Definitionen
   3 Akte, je mit Nodes: battle | elite | shop | rest | boss
   ============================================================ */

/**
 * Node-Struktur:
 * { id, type, x, y, next[], enemyId, completed, available }
 * x/y in % des Map-Containers (0..100)
 */
const MAP_DATA = [
  /* ══════════════════════════════════════════
     AKT 1 — Der Dunkle Wald
  ══════════════════════════════════════════ */
  {
    actIndex:   0,
    actName:    'Akt I — Der Dunkle Wald',
    background: 'linear-gradient(135deg, #0a0f06 0%, #0d1a0d 100%)',
    nodes: [
      { id:'1_start',  type:'start',  x:5,  y:50, next:['1_1a','1_1b'] },

      { id:'1_1a', type:'battle', x:22, y:28, next:['1_2a','1_2b'], enemyId:'goblin_chief' },
      { id:'1_1b', type:'shop',   x:22, y:72, next:['1_2b','1_2c'], enemyId:null },

      { id:'1_2a', type:'battle', x:42, y:18, next:['1_3a'],        enemyId:'skeleton_mage' },
      { id:'1_2b', type:'elite',  x:42, y:50, next:['1_3a','1_3b'], enemyId:'orc_warlord' },
      { id:'1_2c', type:'rest',   x:42, y:82, next:['1_3b'],        enemyId:null },

      { id:'1_3a', type:'battle', x:62, y:33, next:['1_boss'],      enemyId:'skeleton_mage' },
      { id:'1_3b', type:'shop',   x:62, y:68, next:['1_boss'],      enemyId:null },

      { id:'1_boss', type:'boss', x:82, y:50, next:['act2'],        enemyId:'forest_demon' },
    ]
  },

  /* ══════════════════════════════════════════
     AKT 2 — Die Verfluchten Ruinen
  ══════════════════════════════════════════ */
  {
    actIndex:   1,
    actName:    'Akt II — Die Verfluchten Ruinen',
    background: 'linear-gradient(135deg, #0f0806 0%, #1a0d0d 100%)',
    nodes: [
      { id:'2_start',  type:'start',  x:5,  y:50, next:['2_1a','2_1b'] },

      { id:'2_1a', type:'battle', x:22, y:25, next:['2_2a','2_2b'], enemyId:'shadow_knight' },
      { id:'2_1b', type:'rest',   x:22, y:75, next:['2_2b','2_2c'], enemyId:null },

      { id:'2_2a', type:'elite',  x:40, y:15, next:['2_3a'],        enemyId:'iron_golem_guard' },
      { id:'2_2b', type:'battle', x:40, y:50, next:['2_3a','2_3b'], enemyId:'dark_priest' },
      { id:'2_2c', type:'shop',   x:40, y:85, next:['2_3b'],        enemyId:null },

      { id:'2_3a', type:'battle', x:58, y:25, next:['2_4a','2_4b'], enemyId:'shadow_knight' },
      { id:'2_3b', type:'rest',   x:58, y:75, next:['2_4b'],        enemyId:null },

      { id:'2_4a', type:'elite',  x:75, y:35, next:['2_boss'],      enemyId:'iron_golem_guard' },
      { id:'2_4b', type:'shop',   x:75, y:65, next:['2_boss'],      enemyId:null },

      { id:'2_boss', type:'boss', x:90, y:50, next:['act3'],        enemyId:'chaos_lord' },
    ]
  },

  /* ══════════════════════════════════════════
     AKT 3 — Die Dunkle Dimension
  ══════════════════════════════════════════ */
  {
    actIndex:   2,
    actName:    'Akt III — Die Dunkle Dimension',
    background: 'linear-gradient(135deg, #060612 0%, #0d0a1a 100%)',
    nodes: [
      { id:'3_start',  type:'start',  x:5,  y:50, next:['3_1a','3_1b'] },

      { id:'3_1a', type:'battle', x:20, y:30, next:['3_2a','3_2b'], enemyId:'void_reaper' },
      { id:'3_1b', type:'shop',   x:20, y:70, next:['3_2b','3_2c'], enemyId:null },

      { id:'3_2a', type:'elite',  x:38, y:20, next:['3_3a'],        enemyId:'soul_devourer' },
      { id:'3_2b', type:'battle', x:38, y:50, next:['3_3a','3_3b'], enemyId:'void_reaper' },
      { id:'3_2c', type:'rest',   x:38, y:80, next:['3_3b'],        enemyId:null },

      { id:'3_3a', type:'battle', x:57, y:30, next:['3_4a','3_4b'], enemyId:'void_reaper' },
      { id:'3_3b', type:'shop',   x:57, y:70, next:['3_4b'],        enemyId:null },

      { id:'3_4a', type:'elite',  x:73, y:40, next:['3_boss'],      enemyId:'soul_devourer' },
      { id:'3_4b', type:'rest',   x:73, y:60, next:['3_boss'],      enemyId:null },

      { id:'3_boss', type:'boss', x:88, y:50, next:['victory'],     enemyId:'dark_dimension_god' },
    ]
  }
];

/* ──────────────────────────────────────────────────
   DD_CUSTOM OVERRIDE — Editor schreibt hier rein
   Unterstützt: actName, background, nodes (inkl. enemyPool)
────────────────────────────────────────────────── */
(function _applyMapOverrides() {
  if (!window.DD_CUSTOM || !window.DD_CUSTOM.acts) return;
  window.DD_CUSTOM.acts.forEach(customAct => {
    const idx = MAP_DATA.findIndex(a => a.actIndex === customAct.actIndex);
    if (idx >= 0) MAP_DATA.splice(idx, 1, customAct);
    else          MAP_DATA.push(customAct);
  });
})();

/* ── Hilfsfunktionen ── */

/**
 * Löst den Gegner eines Nodes auf.
 * Wenn enemyPool gesetzt, wird ein Gegner gewichtet zufällig gezogen.
 * Sonst wird enemyId direkt verwendet.
 */
function resolveNodeEnemy(node) {
  if (node.enemyPool && node.enemyPool.length > 0) {
    const total = node.enemyPool.reduce((s, e) => s + (e.weight || 1), 0);
    let rnd = Math.floor(Math.random() * total);
    for (const entry of node.enemyPool) {
      rnd -= (entry.weight || 1);
      if (rnd < 0) return entry.enemyId;
    }
    return node.enemyPool[node.enemyPool.length - 1].enemyId;
  }
  return node.enemyId;
}

function getActData(actIndex) {
  return MAP_DATA[actIndex] || null;
}

function getNodeById(actIndex, nodeId) {
  const act = getActData(actIndex);
  if (!act) return null;
  return act.nodes.find(n => n.id === nodeId) || null;
}

/** Icons je Node-Typ */
const NODE_ICONS = {
  start:  '▶',
  battle: '⚔',
  elite:  '⚡',
  shop:   '🏪',
  rest:   '🏕',
  boss:   '💀',
};

/** Farben je Node-Typ */
const NODE_COLORS = {
  start:  '#aaa',
  battle: '#ff8844',
  elite:  '#cc44ff',
  shop:   '#44aaff',
  rest:   '#44ff88',
  boss:   '#ff2244',
};
