/* ============================================================
   core/drops.js — Gewichtetes Drop-System mit Seeded RNG
   ============================================================
   Verwendung:
     const result = resolveDropForEnemy(enemy, rank, type);
     // → { card, key, totalWeight, roll } | null

   Seeded RNG (Mulberry32-Algorithmus):
     const rng  = createSeededRNG(12345);
     const roll = rng(); // → float [0, 1)
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
  // Fallback: letztes Element
  return { entry: pool[pool.length - 1], roll: rawRoll, totalWeight };
}

/* ──────────────────────────────────────────────────
   FALLBACK-KETTE für Drop-Keys
   Wenn S_POW leer, versuche A_POW → B_POW → C_POW → D_POW
────────────────────────────────────────────────── */
const _powFallback = ['S_POW', 'A_POW', 'B_POW', 'C_POW', 'D_POW'];

function _resolvePool(dropTable, key) {
  if (!dropTable) return null;

  const direct = dropTable[key];
  if (direct && direct.length > 0) return { pool: direct, resolvedKey: key };

  // TEC kann auf D_POW zurückfallen
  if (key === 'TEC') {
    if (dropTable['D_POW'] && dropTable['D_POW'].length > 0)
      return { pool: dropTable['D_POW'], resolvedKey: 'D_POW' };
    return null;
  }

  // POW: Fallback-Kette aufwärts prüfen
  const startIdx = _powFallback.indexOf(key);
  for (let i = startIdx + 1; i < _powFallback.length; i++) {
    const fb = _powFallback[i];
    if (dropTable[fb] && dropTable[fb].length > 0)
      return { pool: dropTable[fb], resolvedKey: fb };
  }
  return null;
}

/* ──────────────────────────────────────────────────
   HAUPT-DROP-FUNKTION
────────────────────────────────────────────────── */
/**
 * Bestimmt die Drop-Karte für einen Gegner nach dem Kampf.
 * @param {Object}  enemy   — Gegner-Objekt (mit .dropTable)
 * @param {string}  rank    — 'S'|'A'|'B'|'C'|'D'
 * @param {string}  type    — 'POW'|'TEC'
 * @param {number}  [seed]  — optionaler Seed für deterministische Tests
 * @returns {{ card, key, resolvedKey, totalWeight, roll } | null}
 */
function resolveDropForEnemy(enemy, rank, type, seed) {
  if (!enemy || !enemy.dropTable) return null;

  const key = getRankDropKey(rank, type);
  const rngFn = seed !== undefined ? createSeededRNG(seed) : _rng;
  const resolved = _resolvePool(enemy.dropTable, key);
  if (!resolved) return null;

  const { pool, resolvedKey } = resolved;
  const drawn = weightedDraw(pool, rngFn);
  if (!drawn) return null;

  const card = getCardById(drawn.entry.cardId);
  if (!card) return null;

  return {
    card,
    key,
    resolvedKey,
    totalWeight: drawn.totalWeight,
    roll: drawn.roll,
    entryWeight: drawn.entry.weight,
    dropChance: Math.round((drawn.entry.weight / drawn.totalWeight) * 10000) / 100,
  };
}

/* ──────────────────────────────────────────────────
   SIMULATION (für Editor)
────────────────────────────────────────────────── */
/**
 * Simuliert N Drops und gibt Häufigkeitsstatistiken zurück.
 * @param {Object} enemy
 * @param {string} rank
 * @param {string} type
 * @param {number} n       — Anzahl Simulationen
 * @param {number} [seed]  — Seed für reproduzierbare Ergebnisse
 * @returns {Array<{cardId, name, count, percent, rarity}>}
 */
function simulateDrops(enemy, rank, type, n, seed) {
  const rngFn = seed !== undefined ? createSeededRNG(seed) : () => Math.random();
  const key   = getRankDropKey(rank, type);
  const resolved = _resolvePool(enemy.dropTable, key);
  if (!resolved) return [];

  const { pool } = resolved;
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
 * Gibt für einen Drop-Key alle Karten mit Prozentanteil zurück.
 * @param {Object} dropTable
 * @param {string} key
 * @returns {Array<{cardId, name, weight, totalWeight, percent, rarity}>}
 */
function analyzeDropPool(dropTable, key) {
  const resolved = _resolvePool(dropTable, key);
  if (!resolved) return [];

  const { pool } = resolved;
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
