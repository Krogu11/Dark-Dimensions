/* ============================================================
   core/savesystem.js — 3-Slot Save-System (localStorage)
   ============================================================
   SAVE-FORMAT v2:
     slotId          — 1 | 2 | 3
     timestamp       — letztes Speicherdatum (ms)
     ds              ? persistent ?ber Runs (nie verloren)
     cardCollection  — alle je erhaltenen Karten-IDs
     unlockedActs    — Akt-Indizes die dauerhaft freigeschaltet sind
     activeRun       — laufender Run-State (null = kein aktiver Run)
   ============================================================ */

const SAVE_VERSION = 'dd_save_v2';
const MAX_SLOTS    = 3;

/* ── Zeiger auf den aktiven Slot ── */
const SAVE_STATE = {
  activeSlotId: null,  // 1 | 2 | 3
  slot:         null,  // aktuelles Slot-Objekt
};

/* ── Flag: wurde seit letztem Boss-Sieg bereits gespeichert? ── */
let _bossDefeatedSinceLoad = false;

/* ─────────────────────────────────────────────────────
   Interne Hilfsfunktionen
───────────────────────────────────────────────────── */
function _slotKey(id) { return `${SAVE_VERSION}_slot${id}`; }

function _emptySlot(id) {
  return {
    slotId:          id,
    timestamp:       null,
    ds:              0,
    cardCollection:  [],      // Array von Karten-IDs (verdiente Karten)
    baseDeck:        null,    // Konfiguriertes Deck für den nächsten Run (Array von IDs, null = Starter)
    unlockedActs:    [0],     // Akt 0 immer freigeschaltet
    defeatedEnemies: [],      // Array von Gegner-IDs die mindestens einmal besiegt wurden
    freeDuelRecord:  {},      // { [enemyId]: { wins: N, losses: N } }
    activeRun:       null,    // laufender Run oder null
    worldProgress:   null,    // Weltenkarten-Fortschritt oder null
  };
}

function _saveUi(key, vars, fallbackValue) {
  if (typeof t === 'function') return t(key, vars, { fallbackValue });
  return fallbackValue ?? key;
}

function _getSlotLocationName(slotData) {
  const locationId = slotData?.worldProgress?.currentLocationId || null;
  if (!locationId) return _saveUi('ui.mainmenu.unknownLocation', null, 'Unknown location');

  const worldMap = typeof _getWorldMapData === 'function'
    ? (_getWorldMapData() || [])
    : ((window.DD_CUSTOM && Array.isArray(window.DD_CUSTOM.worldMap)) ? window.DD_CUSTOM.worldMap : []);

  const currentLocation = worldMap.find(loc => loc && loc.id === locationId);
  if (currentLocation) {
    if (currentLocation.nameKey) return _saveUi(currentLocation.nameKey, null, currentLocation.name || locationId);
    return currentLocation.name || _saveUi(`world.${locationId}.name`, null, locationId);
  }

  return _saveUi(`world.${locationId}.name`, null, locationId);
}

function getSlotSummary(slotData) {
  if (!slotData) return { line1: 'â€” Leer â€”', line2: '' };
  return {
    line1: _getSlotLocationName(slotData),
    line2: _saveUi('ui.mainmenu.dimensionsSeelen', { count: slotData.ds || 0 }, `${slotData.ds || 0} Dimensionsseelen`),
  };
}

/** Stellt sicher dass ein Slot alle Felder hat (Migration älterer Saves). */
function _migrateSlot(slot) {
  if (!slot) return slot;
  if (slot.ds === undefined) slot.ds = Number(slot.gold) || 0;
  delete slot.gold;
  if (!slot.defeatedEnemies) slot.defeatedEnemies = [];
  if (!slot.freeDuelRecord)  slot.freeDuelRecord  = {};
  if (slot.worldProgress === undefined) slot.worldProgress = null;
  return slot;
}

/**
 * Serialisiert ein Slot-Objekt für localStorage.
 * Sets → Arrays für JSON-Kompatibilität.
 */
function _serializeSlot(slotData) {
  const out = { ...slotData };
  out.activeRun = null;
  /* worldProgress: Sets → Arrays */
  if (out.worldProgress) {
    out.worldProgress = {
      ...out.worldProgress,
      completedLocations: Array.from(out.worldProgress.completedLocations || []),
      visitedLocations:   Array.from(out.worldProgress.visitedLocations   || []),
    };
  }
  return out;
}

/**
 * Deserialisiert ein Slot-Objekt aus localStorage.
 * Arrays → Sets für die Verwendung im Run-State.
 */
function _deserializeSlot(data) {
  if (!data) return null;
  const out = { ...data };
  if (out.activeRun) {
    out.activeRun = {
      ...out.activeRun,
      completedNodes: new Set(out.activeRun.completedNodes || []),
      availableNodes: new Set(out.activeRun.availableNodes || []),
    };
  }
  /* worldProgress: Arrays → Sets */
  if (out.worldProgress) {
    out.worldProgress = {
      ...out.worldProgress,
      completedLocations: Array.isArray(out.worldProgress.completedLocations)
        ? out.worldProgress.completedLocations : [],
      visitedLocations:   Array.isArray(out.worldProgress.visitedLocations)
        ? out.worldProgress.visitedLocations : [],
    };
  }
  return out;
}

function _saveSlotToDisk(slotData) {
  try {
    localStorage.setItem(_slotKey(slotData.slotId), JSON.stringify(_serializeSlot(slotData)));
  } catch(e) {
    console.error('[SaveSystem] Speichern fehlgeschlagen:', e);
  }
}

function _loadSlotFromDisk(id) {
  try {
    const raw = localStorage.getItem(_slotKey(id));
    if (!raw) return null;
    return _migrateSlot(_deserializeSlot(JSON.parse(raw)));
  } catch(e) {
    console.error('[SaveSystem] Laden fehlgeschlagen Slot', id, e);
    return null;
  }
}

/* ─────────────────────────────────────────────────────
   Öffentliche Slot-API
───────────────────────────────────────────────────── */

/** Gibt alle 3 Slot-Daten zurück (null wenn leer). */
function getAllSlots() {
  const result = [];
  for (let i = 1; i <= MAX_SLOTS; i++) {
    result.push(_loadSlotFromDisk(i));
  }
  return result;
}

/** Slot laden & als aktiv setzen. Gibt das Slot-Objekt zurück. */
function loadSlot(id) {
  let data = _loadSlotFromDisk(id);
  if (!data) data = _emptySlot(id);
  SAVE_STATE.activeSlotId = id;
  SAVE_STATE.slot = data;
  _bossDefeatedSinceLoad = false;
  return data;
}

/** Aktuellen Slot sofort auf Disk schreiben. */
function saveCurrentSlot() {
  if (!SAVE_STATE.slot) return;
  SAVE_STATE.slot.timestamp = Date.now();
  _saveSlotToDisk(SAVE_STATE.slot);
}

function showSaveFeedback(message = 'Spiel gespeichert') {
  let toast = document.getElementById('save-feedback-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'save-feedback-toast';
    toast.style.cssText = 'position:fixed;top:24px;right:24px;z-index:9999;padding:10px 16px;border:1px solid rgba(255,215,0,0.45);border-radius:10px;background:rgba(14,16,28,0.92);color:#ffd86b;font-weight:700;box-shadow:0 10px 30px rgba(0,0,0,0.35);opacity:0;transform:translateY(-8px);transition:opacity .18s ease, transform .18s ease;pointer-events:none;';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';
  clearTimeout(showSaveFeedback._timer);
  showSaveFeedback._timer = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-8px)';
  }, 1600);
}

function saveCurrentSlotWithFeedback(message = 'Spiel gespeichert') {
  saveCurrentSlot();
  showSaveFeedback(message);
}

function reloadCurrentSlotFromDisk() {
  if (!SAVE_STATE.activeSlotId) return null;
  const data = _loadSlotFromDisk(SAVE_STATE.activeSlotId) || _emptySlot(SAVE_STATE.activeSlotId);
  SAVE_STATE.slot = data;
  return data;
}

function restoreLastSavedProgressState() {
  const data = reloadCurrentSlotFromDisk();
  if (!data) return null;

  RUN_STATE.active = false;
  RUN_STATE.playerHP = 4000;
  RUN_STATE.maxHP = 4000;
  RUN_STATE.deck = [];
  RUN_STATE.currentActIndex = 0;
  RUN_STATE.currentActId = null;
  RUN_STATE.currentActData = null;
  RUN_STATE.currentNodeId = null;
  RUN_STATE.completedNodes = new Set();
  RUN_STATE.availableNodes = new Set();
  RUN_STATE._worldMode = false;
  RUN_STATE._worldLocationId = null;
  RUN_STATE._dungeonComplete = false;
  RUN_STATE._isFreeDuel = false;
  RUN_STATE._freeDuelReturn = false;

  if (typeof WORLD_STATE !== 'undefined') {
    const worldMap = (window.DD_CUSTOM && Array.isArray(window.DD_CUSTOM.worldMap) && window.DD_CUSTOM.worldMap.length > 0)
      ? window.DD_CUSTOM.worldMap
      : [];
    const saved = data.worldProgress || null;
    const fallbackStart = worldMap[0] ? worldMap[0].id : null;
    WORLD_STATE.currentLocationId = (saved && saved.currentLocationId) || fallbackStart;
    WORLD_STATE.completedLocations = new Set(saved && saved.completedLocations ? saved.completedLocations : []);
    WORLD_STATE.visitedLocations = new Set(saved && saved.visitedLocations ? saved.visitedLocations : []);
    WORLD_STATE.lastVisitedNodeId = (saved && saved.lastVisitedNodeId) || WORLD_STATE.currentLocationId || null;
    WORLD_STATE.lastNodeType = (saved && saved.lastNodeType) || null;
    WORLD_STATE.lastDungeonId = (saved && saved.lastDungeonId) || null;
  }

  return data;
}

function getDimensionsSeelen() {
  return SAVE_STATE && SAVE_STATE.slot ? Number(SAVE_STATE.slot.ds) || 0 : 0;
}

function setDimensionsSeelen(amount, saveImmediately = false) {
  if (!SAVE_STATE || !SAVE_STATE.slot) return 0;
  SAVE_STATE.slot.ds = Math.max(0, Number(amount) || 0);
  if (saveImmediately && typeof saveCurrentSlot === 'function') saveCurrentSlot();
  return SAVE_STATE.slot.ds;
}

function gainDimensionsSeelen(amount, saveImmediately = true) {
  if (!SAVE_STATE || !SAVE_STATE.slot) return 0;
  return setDimensionsSeelen(getDimensionsSeelen() + Math.max(0, Number(amount) || 0), saveImmediately);
}

function spendDimensionsSeelen(amount, saveImmediately = true) {
  const cost = Math.max(0, Number(amount) || 0);
  if (getDimensionsSeelen() < cost) return false;
  setDimensionsSeelen(getDimensionsSeelen() - cost, saveImmediately);
  return true;
}

/** Slot-Daten löschen. */
function deleteSlot(id) {
  try { localStorage.removeItem(_slotKey(id)); } catch(e) {}
  if (SAVE_STATE.activeSlotId === id) {
    SAVE_STATE.activeSlotId = null;
    SAVE_STATE.slot = null;
  }
}

/* ─────────────────────────────────────────────────────
   Run-Lifecycle
───────────────────────────────────────────────────── */

/**
 * Neuen Run im aktiven Slot initialisieren.
 * Wird vor initRunStateFromSave() aufgerufen.
 * Generiert bei Bedarf zufällige Acts (Roguelike-Modus).
 */
function startNewRun() {
  if (!SAVE_STATE.slot) return;
  const cfg = (window.DD_CUSTOM && window.DD_CUSTOM.config) ? window.DD_CUSTOM.config : {};
  const startLP = Number(cfg['cfg-startlp']) || 4000;

  /* Deck: konfiguriertes baseDeck nutzen, sonst Starter */
  const deckIds = (SAVE_STATE.slot.baseDeck && SAVE_STATE.slot.baseDeck.length >= 15)
    ? SAVE_STATE.slot.baseDeck
    : buildStarterDeck().map(c => c.id);

  /* Acts generieren falls Zufalls-Modus aktiv */
  let generatedActs = null;
  if (typeof generateAllRandomActs === 'function') {
    /* MAP_DATA enthält bereits DD_CUSTOM-Overrides (actgenerator prüft mode-Flag) */
    generatedActs = generateAllRandomActs(MAP_DATA);
  }

  /* Start-Nodes der generierten oder statischen Acts bestimmen */
  const actSource = generatedActs || MAP_DATA;
  const firstAct  = actSource[0];
  let startAvailable = new Set();
  if (firstAct) {
    const startNode = firstAct.nodes.find(n => n.type === 'start');
    if (startNode && startNode.next && startNode.next.length > 0) {
      startAvailable = new Set(startNode.next);
    }
  }

  SAVE_STATE.slot.activeRun = {
    playerHP:        startLP,
    maxHP:           startLP,
    deck:            deckIds,
    currentActIndex: 0,
    currentNodeId:   null,
    completedNodes:  new Set(),
    availableNodes:  startAvailable,
    generatedActs,   // null wenn alles fest, sonst Array von generierten Acts
  };
}

/**
 * RUN_STATE aus SAVE_STATE.slot initialisieren.
 * Entweder laufenden Run fortsetzen oder neuen Run starten.
 */
function initRunStateFromSave() {
  const slot = SAVE_STATE.slot;
  const cfg  = (window.DD_CUSTOM && window.DD_CUSTOM.config) ? window.DD_CUSTOM.config : {};
  const startLP = Number(cfg['cfg-startlp']) || 4000;

  if (slot && slot.activeRun) {
    /* ── Run fortsetzen ── */
    const run = slot.activeRun;
    RUN_STATE.active          = true;
    RUN_STATE.playerHP        = run.playerHP   || startLP;
    RUN_STATE.maxHP           = run.maxHP      || startLP;
    RUN_STATE.deck            = (run.deck || []).map(id => {
      const base = getCardById(id);
      return base ? cloneCard(base) : null;
    }).filter(Boolean);
    RUN_STATE.currentActIndex = run.currentActIndex || 0;
    RUN_STATE.currentNodeId   = run.currentNodeId   || null;
    RUN_STATE.completedNodes  = new Set(run.completedNodes || []);
    RUN_STATE.availableNodes  = new Set(run.availableNodes || []);
    RUN_STATE.generatedActs   = run.generatedActs || null; // Generierten Akt-Plan wiederherstellen
  } else {
    /* ── Neuer Run ── */
    startNewRun(); // setzt slot.activeRun (inkl. deck + generatedActs)
    RUN_STATE.active          = true;
    RUN_STATE.playerHP        = startLP;
    RUN_STATE.maxHP           = startLP;
    /* Deck aus activeRun laden — wurde soeben von startNewRun() mit baseDeck befüllt */
    RUN_STATE.deck            = (slot && slot.activeRun && slot.activeRun.deck || [])
      .map(id => { const base = getCardById(id); return base ? cloneCard(base) : null; })
      .filter(Boolean);
    RUN_STATE.currentActIndex = 0;
    RUN_STATE.currentNodeId   = null;
    RUN_STATE.completedNodes  = new Set();
    /* Start-Nodes aus dem generierten/statischen Act bestimmen */
    RUN_STATE.generatedActs   = (slot && slot.activeRun) ? (slot.activeRun.generatedActs || null) : null;
    const _firstAct = getActData(0);
    const _startNode = _firstAct ? _firstAct.nodes.find(n => n.type === 'start') : null;
    RUN_STATE.availableNodes  = (_startNode && _startNode.next && _startNode.next.length > 0)
      ? new Set(_startNode.next)
      : new Set();
  }
  RUN_STATE._isFreeDuel = false;

  /* World-Mode-Flags aus gespeichertem Run wiederherstellen */
  if (slot && slot.activeRun) {
    RUN_STATE._worldMode       = !!slot.activeRun._worldMode;
    RUN_STATE._worldLocationId = slot.activeRun._worldLocationId || null;
  } else {
    RUN_STATE._worldMode       = false;
    RUN_STATE._worldLocationId = null;
  }
  RUN_STATE._dungeonComplete = false;
}

/* ─────────────────────────────────────────────────────
   Karten-Buffer (Run-Karten erst nach Boss committen)
───────────────────────────────────────────────────── */

let _runCardBuffer = [];

/**
 * Karte während Run verdient (geht in Buffer, noch nicht permanent).
 * @param {string} cardId
 */
function earnRunCard(cardId) {
  if (!_runCardBuffer.includes(cardId)) _runCardBuffer.push(cardId);
}

/**
 * Permadeath: Run-Buffer verwerfen, Run löschen.
 * Dimensionsseelen bleiben als Meta-Fortschritt im Slot erhalten.
 */
function discardRun() {
  _runCardBuffer = [];
  if (SAVE_STATE.slot) {
    SAVE_STATE.slot.activeRun = null;
  }
}

/**
 * Fortschritt committen: Buffer → Collection, Akt freischalten, speichern.
 * Wird nach Boss-Sieg aufgerufen.
 */
function commitRunProgress() {
  if (!SAVE_STATE.slot) return;

  /* Karten aus Buffer permanent in Collection übernehmen */
  _runCardBuffer.forEach(id => {
    if (!SAVE_STATE.slot.cardCollection.includes(id)) {
      SAVE_STATE.slot.cardCollection.push(id);
    }
  });
  _runCardBuffer = [];

  /* Nächsten Akt freischalten */
  const run = SAVE_STATE.slot.activeRun;
  if (run) {
    const nextAct = run.currentActIndex + 1;
    if (nextAct < 3 && !SAVE_STATE.slot.unlockedActs.includes(nextAct)) {
      SAVE_STATE.slot.unlockedActs.push(nextAct);
    }
  }

  /* Run-State nur in Memory synchronisieren */
  _syncRunStateToSave();
}

/**
 * Victory: letzten Run abschließen.
 */
function onVictory() {
  commitRunProgress();
  if (SAVE_STATE.slot) {
    SAVE_STATE.slot.activeRun = null;
  }
}

/**
 * Boss-Sieg-Hook: wird von checkWinCondition() aufgerufen,
 * wenn der besiegte Gegner vom Typ 'boss' ist.
 */
function onBossDefeated() {
  _bossDefeatedSinceLoad = true;
  commitRunProgress();
}

/** Aktuellen RUN_STATE → SAVE_STATE.slot.activeRun synchronisieren (öffentlich). */
function syncRunStateToSave() { _syncRunStateToSave(); }

function _syncRunStateToSave() {
  if (!SAVE_STATE.slot) return;
  if (!SAVE_STATE.slot.activeRun) SAVE_STATE.slot.activeRun = {};

  const run = SAVE_STATE.slot.activeRun;
  run.playerHP        = RUN_STATE.playerHP;
  run.maxHP           = RUN_STATE.maxHP;
  run.deck            = RUN_STATE.deck.map(c => c.id);
  run.currentActIndex = RUN_STATE.currentActIndex;
  run.currentNodeId   = RUN_STATE.currentNodeId;
  run.completedNodes  = new Set(RUN_STATE.completedNodes);
  run.availableNodes  = new Set(RUN_STATE.availableNodes);
  run.generatedActs   = RUN_STATE.generatedActs || null; // Acts persistent machen

  /* World-Mode-Flags persistent speichern (für Seiten-Refresh-Schutz) */
  if (RUN_STATE._worldMode) {
    run._worldMode       = true;
    run._worldLocationId = RUN_STATE._worldLocationId || null;
  }

}

/* ─────────────────────────────────────────────────────
   Freies Duell
───────────────────────────────────────────────────── */

/**
 * Freies Duell für einen bestimmten Akt starten.
 * Nutzt normalen Run-Flow, aber mit Flag für Auto-Save.
 */
function startFreeDuel(actIndex) {
  const act = getActData(actIndex);
  if (!act) return;

  const cfg = (window.DD_CUSTOM && window.DD_CUSTOM.config) ? window.DD_CUSTOM.config : {};
  const startLP = Number(cfg['cfg-startlp']) || 4000;

  RUN_STATE.active          = true;
  RUN_STATE.playerHP        = startLP;
  RUN_STATE.maxHP           = startLP;
  RUN_STATE.currentActIndex = actIndex;
  RUN_STATE.currentNodeId   = null;
  RUN_STATE._isFreeDuel     = true;
  RUN_STATE.generatedActs   = null; // Freies Duell nutzt immer statische Acts

  /* Starter-Deck mit bekannten Karten anreichern */
  const base = buildStarterDeck();
  if (SAVE_STATE.slot && SAVE_STATE.slot.cardCollection.length > 0) {
    /* Bis zu 5 Collection-Karten ins Free-Duel-Deck mischen */
    const pool = SAVE_STATE.slot.cardCollection.slice(0, 5);
    pool.forEach(id => {
      const c = getCardById(id);
      if (c) base.push(cloneCard(c));
    });
  }
  RUN_STATE.deck = base;

  /* Start-Node freischalten */
  const startNode = act.nodes.find(n => n.type === 'start');
  if (startNode) {
    RUN_STATE.completedNodes = new Set([startNode.id]);
    RUN_STATE.availableNodes = new Set(startNode.next);
  } else {
    RUN_STATE.completedNodes = new Set();
    RUN_STATE.availableNodes = new Set(['1_1a','1_1b']);
  }

  showScreen('map');
  renderMap();
}

/* ─────────────────────────────────────────────────────
   Gegner-Tracking (für Freies Duell)
───────────────────────────────────────────────────── */

/**
 * Zeichnet einen besiegten Gegner im Speicherstand auf.
 * Wird nach jedem gewonnenen Kampf aufgerufen.
 */
function recordEnemyDefeated(enemyId) {
  if (!enemyId || !SAVE_STATE.slot) return;
  if (!SAVE_STATE.slot.defeatedEnemies) SAVE_STATE.slot.defeatedEnemies = [];
  if (!SAVE_STATE.slot.defeatedEnemies.includes(enemyId)) {
    SAVE_STATE.slot.defeatedEnemies.push(enemyId);
  }
}

/**
 * Freies Duell: Sieg oder Niederlage für einen Gegner aufzeichnen.
 * @param {string}  enemyId
 * @param {boolean} won — true = Sieg, false = Niederlage
 */
function recordFreeDuelResult(enemyId, won) {
  if (!enemyId || !SAVE_STATE.slot) return;
  if (!SAVE_STATE.slot.freeDuelRecord) SAVE_STATE.slot.freeDuelRecord = {};
  const rec = SAVE_STATE.slot.freeDuelRecord;
  if (!rec[enemyId]) rec[enemyId] = { wins: 0, losses: 0 };
  if (won) rec[enemyId].wins++;
  else     rec[enemyId].losses++;
}

/**
 * Freies Duell: Direkt gegen einen bestimmten Gegner antreten.
 * Kein Karte, kein Map — sofort in den Kampf.
 */
function startFreeDuelEnemy(enemyId) {
  if (!SAVE_STATE.slot) return;

  const cfg     = (window.DD_CUSTOM?.config) || {};
  const startLP = Number(cfg['cfg-startlp']) || 4000;

  // Deck aufbauen: baseDeck (wenn konfiguriert) oder Starter + Collection-Karten
  let deck;
  if (SAVE_STATE.slot.baseDeck && SAVE_STATE.slot.baseDeck.length >= 5) {
    deck = SAVE_STATE.slot.baseDeck
      .map(id => { const c = getCardById(id); return c ? cloneCard(c) : null; })
      .filter(Boolean);
  } else {
    deck = buildStarterDeck();
    // Collection-Karten beimischen (bis zu 10, nach Seltenheit sortiert)
    const rare = ['legendary','epic','rare','uncommon','common'];
    const sorted = (SAVE_STATE.slot.cardCollection || [])
      .map(id => getCardById(id)).filter(Boolean)
      .sort((a,b) => rare.indexOf(a.rarity) - rare.indexOf(b.rarity));
    sorted.slice(0, 10).forEach(c => deck.push(cloneCard(c)));
  }

  RUN_STATE.active          = true;
  RUN_STATE.playerHP        = startLP;
  RUN_STATE.maxHP           = startLP;
  RUN_STATE.currentActIndex = 0;
  RUN_STATE.currentNodeId   = null;
  RUN_STATE.currentNodeType = 'battle';
  RUN_STATE._isFreeDuel     = true;
  RUN_STATE._freeDuelReturn = true; // Signalisiert: nach Kampf zur Gegner-Liste zurück
  RUN_STATE.generatedActs   = null;
  RUN_STATE.completedNodes  = new Set();
  RUN_STATE.availableNodes  = new Set();
  RUN_STATE.deck            = deck;

  // Direkt Kampf starten (keine Karte notwendig)
  startBattle(enemyId);
}

/* ─────────────────────────────────────────────────────
   Format-Hilfsfunktionen (für UI)
───────────────────────────────────────────────────── */

function formatSaveDate(timestamp) {
  if (!timestamp) return '—';
  const d = new Date(timestamp);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function getSlotSummary(slotData) {
  if (!slotData) return { line1: '— Leer —', line2: '' };
  const actNames = ['Akt I', 'Akt II', 'Akt III', 'Abgeschlossen'];
  const maxAct   = Math.min(Math.max(...slotData.unlockedActs), 3);
  const hasRun   = !!slotData.activeRun;
  return {
    line1: _getSlotLocationName(slotData),
    line2: _saveUi('ui.mainmenu.dimensionsSeelen', { count: slotData.ds || 0 }, `${slotData.ds || 0} Dimensionsseelen`),
  };
}
