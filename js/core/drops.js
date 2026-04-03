/* ============================================================
   core/drops.js — Gewichtetes Drop-System
   ============================================================
   Einheitliche Droptabelle — kein Rang mehr erforderlich.

   Drop-Format (neu):
     enemy.dropTable.drops = [{ cardId, weight }, ...]

   Legacy-Format (Rückwärtskompatibilität):
     enemy.dropTable.S_POW / A_POW / … / TEC
     → Fallback-Kette: S_POW → A_POW → … → TEC

   Öffentliche API:
     resolveDropForEnemy(enemy [, seed])
     simulateDrops(enemy, n [, seed])
     analyzeDropPool(dropTable)
     weightedDraw(pool [, rngFn])
     createSeededRNG(seed)
     setDropSeed(seed) / clearDropSeed()
   ============================================================ */

/* ──────────────────────────────────────────────────
   SEEDED RNG — Mulberry32
   Deterministisch, schnell, gute Verteilung
────────────────────────────────────────────────── */
function createSeededRNG(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── Modul-Level RNG (kann per Seed überschrieben werden) ── */
let _rng = Math.random.bind(Math);

/** Setzt einen deterministischen Seed (für Tests & Replays). */
function setDropSeed(seed) {
  _rng = createSeededRNG(seed);
}

/** Entfernt den Seed — zurück zum echten Zufall. */
function clearDropSeed() {
  _rng = Math.random.bind(Math);
}

/* ──────────────────────────────────────────────────
   GEWICHTETES ZIEHEN
────────────────────────────────────────────────── */
/**
 * Zieht 1 Eintrag aus einem gewichteten Pool.
 * @param {Array<{cardId:string, weight:number}>} pool
 * @param {Function} [rngFn]  — optionale RNG-Funktion (für Simulation)
 * @returns {{ entry, roll, totalWeight } | null}
 */
function weightedDraw(pool, rngFn) {
  if (!pool || pool.length === 0) return null;
  const fn          = rngFn || _rng;
  const totalWeight = pool.reduce((sum, e) => sum + (e.weight || 1), 0);
  let   roll        = fn() * totalWeight;
  const rawRoll     = roll;

  for (const entry of pool) {
    roll -= entry.weight || 1;
    if (roll <= 0) return { entry, roll: rawRoll, totalWeight };
  }
  /* Fallback: letztes Element */
  return { entry: pool[pool.length - 1], roll: rawRoll, totalWeight };
}

/* ──────────────────────────────────────────────────
   EINHEITLICHER POOL-RESOLVER
   Unterstützt neues Format (drops) + Legacy-Keys
────────────────────────────────────────────────── */
/**
 * Gibt den Drop-Pool für eine dropTable zurück.
 * Bevorzugt neues Format (dropTable.drops),
 * fällt sonst auf Legacy-Keys zurück (S_POW → … → TEC).
 * @param {Object} dropTable
 * @returns {Array|null}
 */
function _getUnifiedPool(dropTable) {
  if (!dropTable) return null;

  /* Neues Format */
  if (Array.isArray(dropTable.drops) && dropTable.drops.length > 0) {
    return dropTable.drops;
  }

  /* Legacy-Format: Fallback-Kette S_POW → A_POW → B_POW → C_POW → D_POW → TEC */
  const legacyKeys = ['S_POW', 'A_POW', 'B_POW', 'C_POW', 'D_POW', 'TEC'];
  for (const key of legacyKeys) {
    if (Array.isArray(dropTable[key]) && dropTable[key].length > 0) {
      return dropTable[key];
    }
  }
  return null;
}

/* ──────────────────────────────────────────────────
   HAUPT-DROP-FUNKTION
────────────────────────────────────────────────── */
/**
 * Bestimmt die Drop-Karte für einen Gegner nach dem Kampf.
 * @param {Object}  enemy   — Gegner-Objekt (mit .dropTable)
 * @param {number}  [seed]  — optionaler Seed für deterministische Tests
 * @returns {{ card, totalWeight, roll, dropChance } | null}
 */
function resolveDropForEnemy(enemy, seed) {
  if (!enemy || !enemy.dropTable) return null;

  const pool = _getUnifiedPool(enemy.dropTable);
  if (!pool || pool.length === 0) return null;

  const rngFn = seed !== undefined ? createSeededRNG(seed) : _rng;
  const drawn = weightedDraw(pool, rngFn);
  if (!drawn) return null;

  const card = getCardById(drawn.entry.cardId);
  if (!card) return null;

  return {
    card,
    totalWeight:  drawn.totalWeight,
    roll:         drawn.roll,
    entryWeight:  drawn.entry.weight,
    dropChance:   Math.round((drawn.entry.weight / drawn.totalWeight) * 10000) / 100,
  };
}

/* ──────────────────────────────────────────────────
   SIMULATION (für Editor)
────────────────────────────────────────────────── */
/**
 * Simuliert N Drops und gibt Häufigkeitsstatistiken zurück.
 * @param {Object} enemy
 * @param {number} n       — Anzahl Simulationen
 * @param {number} [seed]  — Seed für reproduzierbare Ergebnisse
 * @returns {Array<{cardId, name, count, percent, rarity}>}
 */
function simulateDrops(enemy, n, seed) {
  const pool = _getUnifiedPool(enemy && enemy.dropTable);
  if (!pool || pool.length === 0) return [];

  const rngFn = seed !== undefined ? createSeededRNG(seed) : () => Math.random();
  const counts = {};

  for (let i = 0; i < n; i++) {
    const drawn = weightedDraw(pool, rngFn);
    if (!drawn) continue;
    const id = drawn.entry.cardId;
    counts[id] = (counts[id] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([cardId, count]) => {
      const c = getCardById(cardId);
      return {
        cardId,
        name:    c ? c.name    : cardId,
        rarity:  c ? c.rarity  : 'common',
        count,
        percent: Math.round((count / n) * 1000) / 10,
      };
    })
    .sort((a, b) => b.count - a.count);
}

/* ──────────────────────────────────────────────────
   GEWICHTSANALYSE (für Editor-Balancing-UI)
────────────────────────────────────────────────── */
/**
 * Gibt alle Karten der einheitlichen Droptabelle mit Prozentanteil zurück.
 * @param {Object} dropTable
 * @returns {Array<{cardId, name, weight, totalWeight, percent, rarity}>}
 */
function analyzeDropPool(dropTable) {
  const pool = _getUnifiedPool(dropTable);
  if (!pool || pool.length === 0) return [];

  const total = pool.reduce((s, e) => s + (e.weight || 1), 0);

  return pool.map(entry => {
    const c = getCardById(entry.cardId);
    return {
      cardId: entry.cardId,
      name:   c ? c.name   : entry.cardId,
      rarity: c ? c.rarity : 'common',
      weight: entry.weight,
      totalWeight: total,
      percent: Math.round((entry.weight / total) * 10000) / 100,
    };
  });
}
