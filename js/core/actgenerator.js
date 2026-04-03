/* ============================================================
   core/actgenerator.js — Roguelike Act Generator v1.0
   ============================================================
   Generiert zufällige Act-Strukturen basierend auf
   Editor-Konfigurationen. Jeder Run kann sich dadurch
   spürbar anders anfühlen.

   Algorithmus:
   ┌─────────────────────────────────────────────────────┐
   │ Start → [Layer 1] → [Layer 2] → … → [Layer N] → Boss│
   │ Jede Layer: 1–maxWidth Nodes                        │
   │ Nodes verbinden sich vorwärts (Branching-Logik)     │
   │ Typen nach gewichteter Distribution zugewiesen      │
   └─────────────────────────────────────────────────────┘
   ============================================================ */

/* ──────────────────────────────────────────────────
   Öffentliche API
────────────────────────────────────────────────── */

/**
 * Generiert einen vollständigen Act aus einer Generator-Config.
 *
 * @param {number} actIndex  - Act-Index (0, 1, 2)
 * @param {string} actName   - Anzeigename des Acts
 * @param {string} background - CSS-Background-String
 * @param {object} cfg       - generatorConfig-Objekt (aus Editor)
 * @returns {object}         - Vollständiges Act-Objekt (wie MAP_DATA)
 */
function generateAct(actIndex, actName, background, cfg) {
  const layers   = Math.max(2, Math.min(8, cfg.layers   || 4));
  const minWidth = Math.max(1, Math.min(3, cfg.minWidth || 1));
  const maxWidth = Math.max(minWidth, Math.min(4, cfg.maxWidth || 3));
  const dist     = cfg.distribution || { battle:50, elite:20, shop:15, rest:15 };

  const prefix = String(actIndex + 1);
  const nodes  = [];

  /* ── Start-Node ── */
  const startNode = {
    id:      `${prefix}_start`,
    type:    'start',
    x:       5,
    y:       50,
    next:    [],
    enemyId: null,
  };
  nodes.push(startNode);

  /* ── Layer-Breiten bestimmen ── */
  const widths = [];
  for (let l = 0; l < layers; l++) {
    widths.push(_randInt(minWidth, maxWidth));
  }

  /* ── Node-IDs für jede Layer generieren ── */
  const layerIds = [];
  for (let l = 0; l < layers; l++) {
    const ids = [];
    for (let n = 0; n < widths[l]; n++) {
      ids.push(`${prefix}_${l + 1}${String.fromCharCode(97 + n)}`);
    }
    layerIds.push(ids);
  }

  /* ── Positionen berechnen ── */
  const xStart = 18;
  const xEnd   = 77;
  const xRange = xEnd - xStart;
  const xStep  = layers > 1 ? xRange / (layers - 1) : 0;

  for (let l = 0; l < layers; l++) {
    const x = layers === 1 ? (xStart + xEnd) / 2 : xStart + l * xStep;
    const w = widths[l];
    for (let n = 0; n < w; n++) {
      const y = w === 1 ? 50 : 12 + (n * 76 / (w - 1));
      nodes.push({
        id:        layerIds[l][n],
        type:      null,   // wird unten zugewiesen
        x:         Math.round(x),
        y:         Math.round(y),
        next:      [],
        enemyId:   null,
        enemyPool: null,
      });
    }
  }

  /* ── Start → Layer 0 verbinden ── */
  layerIds[0].forEach(id => startNode.next.push(id));

  /* ── Layer-zu-Layer verbinden ── */
  for (let l = 0; l < layers - 1; l++) {
    const currIds = layerIds[l];
    const nextIds = layerIds[l + 1];

    /* Jeder Knoten verbindet sich mit mind. 1 Knoten der nächsten Layer */
    currIds.forEach((id, n) => {
      const node = _findNode(nodes, id);
      const primary = n % nextIds.length;
      node.next.push(nextIds[primary]);

      /* 55% Chance auf zweite Verbindung (Branching) */
      if (nextIds.length > 1 && Math.random() < 0.55) {
        const secondary = (primary + 1) % nextIds.length;
        if (!node.next.includes(nextIds[secondary])) {
          node.next.push(nextIds[secondary]);
        }
      }
    });

    /* Sicherstellen: jeder Knoten in nextLayer ist erreichbar */
    nextIds.forEach(nid => {
      const reachable = currIds.some(cid => {
        const cn = _findNode(nodes, cid);
        return cn && cn.next.includes(nid);
      });
      if (!reachable) {
        const src = _findNode(nodes, currIds[_randInt(0, currIds.length - 1)]);
        if (src && !src.next.includes(nid)) src.next.push(nid);
      }
    });
  }

  /* ── Letzte Layer → Boss verbinden ── */
  const bossId = `${prefix}_boss`;
  layerIds[layers - 1].forEach(id => {
    const node = _findNode(nodes, id);
    if (node) node.next.push(bossId);
  });

  /* ── Boss-Node ── */
  const bossNext = actIndex < 2 ? [`act${actIndex + 2}`] : ['victory'];
  nodes.push({
    id:        bossId,
    type:      'boss',
    x:         88,
    y:         50,
    next:      bossNext,
    enemyId:   cfg.bossId || null,
    enemyPool: null,
  });

  /* ── Node-Typen zuweisen ── */
  /* Shop wird nicht in Random-Acts generiert (Shop ist im Hauptmenü permanent verfügbar) */
  const filteredDist = Object.fromEntries(
    Object.entries(dist).filter(([t]) => t !== 'shop')
  );
  const typePool = _buildTypePool(filteredDist);

  for (let l = 0; l < layers; l++) {
    layerIds[l].forEach(id => {
      const node = _findNode(nodes, id);
      if (!node) return;

      let type;
      if (l === 0 || l === layers - 1) {
        /* Erste und letzte Layer: nur Kampf oder Elite */
        type = Math.random() < 0.72 ? 'battle' : 'elite';
      } else {
        type = _weightedPick(typePool);
      }

      node.type = type;
      _assignEnemy(node, type, cfg);
    });
  }

  /* ── Mindestens 1 Rest-Node pro Act garantieren ── */
  const allLayerNodes = layerIds.flat().map(id => _findNode(nodes, id)).filter(Boolean);
  const hasRest = allLayerNodes.some(n => n.type === 'rest');
  if (!hasRest) {
    /* Bevorzuge eine innere Layer; gibt es keine (layers<=2), nimm letzte Layer */
    const innerNodes = [];
    for (let l = 1; l < layers - 1; l++) {
      layerIds[l].forEach(id => { const n = _findNode(nodes, id); if (n) innerNodes.push(n); });
    }
    const candidates = innerNodes.length > 0 ? innerNodes : layerIds[layers - 1]
      .map(id => _findNode(nodes, id)).filter(Boolean);
    if (candidates.length > 0) {
      const pick = candidates[_randInt(0, candidates.length - 1)];
      pick.type    = 'rest';
      pick.enemyId = null;
      pick.enemyPool = null;
    }
  }

  return {
    actIndex,
    actName,
    background,
    generatedAt: Date.now(),
    nodes,
  };
}

/**
 * Prüft alle Acts und generiert zufällige Acts wo mode === 'random'.
 * Fixed-Mode-Acts werden unverändert zurückgegeben.
 *
 * @param {Array} actConfigs - Array von Act-Objekten (MAP_DATA oder DD_CUSTOM.acts)
 * @returns {Array|null}     - Array von Act-Objekten oder null wenn nichts generiert
 */
function generateAllRandomActs(actConfigs) {
  if (!actConfigs || actConfigs.length === 0) return null;

  let hasRandom = false;
  const result = actConfigs.map(actCfg => {
    if (actCfg.mode === 'random' && actCfg.generatorConfig) {
      hasRandom = true;
      return generateAct(
        actCfg.actIndex,
        actCfg.actName,
        actCfg.background,
        actCfg.generatorConfig
      );
    }
    return actCfg; // Fixed — unverändert
  });

  return hasRandom ? result : null;
}

/* ──────────────────────────────────────────────────
   Interne Hilfsfunktionen
────────────────────────────────────────────────── */

function _findNode(nodes, id) {
  return nodes.find(n => n.id === id) || null;
}

/** Weist einem Node den passenden Gegner zu (aus Pool oder fest). */
function _assignEnemy(node, type, cfg) {
  if (type === 'shop' || type === 'rest') {
    node.enemyId   = null;
    node.enemyPool = null;
    return;
  }

  const poolKey = type === 'elite' ? 'elitePool' : 'battlePool';
  const pool    = cfg[poolKey];

  if (!pool || pool.length === 0) return;

  if (pool.length === 1) {
    node.enemyId   = pool[0].enemyId;
    node.enemyPool = null;
  } else {
    /* Pool → gewichtete Laufzeit-Auswahl via resolveNodeEnemy() */
    node.enemyPool = pool.map(e => ({
      enemyId: e.enemyId,
      weight:  Math.max(1, e.weight || 1),
    }));
    node.enemyId = null;
  }
}

/** Erstellt einen Pool von Typ-Strings (z.B. 50× 'battle', 20× 'elite', …). */
function _buildTypePool(dist) {
  const pool    = [];
  const entries = Object.entries(dist);
  const total   = entries.reduce((s, [, v]) => s + (Number(v) || 0), 0) || 100;

  entries.forEach(([type, weight]) => {
    const count = Math.max(1, Math.round((Number(weight) / total) * 100));
    for (let i = 0; i < count; i++) pool.push(type);
  });

  return pool;
}

/** Zieht zufällig aus einem Pool. */
function _weightedPick(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Zufallszahl im Bereich [min, max] inklusiv. */
function _randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
