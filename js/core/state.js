/* ============================================================
   core/state.js �? Zentraler Spielzustand
   RUN_STATE:    persistenter Zustand über einen Run
   BATTLE_STATE: Zustand für die aktive Battle-Session
   ============================================================ */

/* �?��?� Run-State (über Kämpfe hinweg persistent) �?��?� */
const RUN_STATE = {
  active:          false,
  playerHP:        4000,
  maxHP:           4000,
  deck:            [],          // Karten im Run-Deck (zwischen Kämpfen)
  currentActIndex: 0,
  currentActId:    null,
  currentActData:  null,
  currentNodeId:   null,        // ID des aktuellen Knotens
  completedNodes:  new Set(),   // IDs abgeschlossener Knoten
  availableNodes:  new Set(),   // IDs der nächsten spielbaren Knoten
};

/* �?��?� Battle-State (nur während einer Battle aktiv) �?��?� */
const BATTLE_STATE = {
  active:            false,
  enemy:             null,      // Gegner-Objekt (aus enemies.js)

  playerLP:          4000,
  enemyLP:           3000,

  playerField:       Array(5).fill(null),
  enemyField:        Array(5).fill(null),
  playerSTZone:      Array(3).fill(null), // Spell/Trap-Zone Spieler
  enemySTZone:       Array(3).fill(null), // Spell/Trap-Zone Gegner

  activeFieldCard:   null,   // geteiltes Spielfeld (ein Slot für beide Seiten)

  playerDeck:        [],
  playerGrave:       [],        // Friedhof Spieler
  enemyDeck:         [],
  enemyGrave:        [],        // Friedhof Gegner
  hand:              [],

  phases:            ['Draw','Main','Battle','End'],
  phaseIndex:        0,

  selectedHandIndex: null,      // ausgewählte Handkarte (Index)
  fusionSelect:      [],        // Indizes für Fusion (max 2 Monster)
  attackerIndex:     null,      // ausgewählter Angreifer (Feldindex)

  summonCount:       0,         // Beschwörungen diese Runde (Normal + Fusion zusammen)
  maxPlayerSummons:  2,         // Max Beschwörungen pro Runde (konfigurierbar)
  hasAttacked:       Array(5).fill(false),

  turn:              1,
  gameOver:          false,
  pendingTraps:      [],        // face-down Fallen, die noch nicht aktiviert wurden

  /* �?��?� Kampf-Statistiken (für Debug-Export) �?��?� */
  rankingStats: {
    maxSingleDamage:        0,  // Höchster Einzelschaden den der Spieler verursacht hat
    enemyMonstersDestroyed: 0,  // Gegnerkarten durch Spieler zerstört
    spellsTrapsPlayed:      0,  // Spieler-Spells/Traps aktiviert
    turnsElapsed:           1,  // Rundenanzahl
    totalDamageDealt:       0,  // Gesamtschaden an Gegner-LP
  },
};

/* �?��?� Getter �?��?� */
function getCurrentPhase() {
  return BATTLE_STATE.phases[BATTLE_STATE.phaseIndex];
}

/* �?��?� Run-State Mutationen �?��?� */
/**
 * initRunState: Legacy-Wrapper.
 * Wenn ein aktiver Save-Slot vorhanden ist �  nutzt initRunStateFromSave().
 * Sonst: klassischer Start ohne Save-System (Debug / direkter Aufruf).
 */
function initRunState() {
  if (typeof initRunStateFromSave === 'function' && SAVE_STATE && SAVE_STATE.slot) {
    initRunStateFromSave();
    return;
  }
  // Fallback (kein Save-Slot aktiv �? z.B. beim direkten Aufruf ohne Slot-Auswahl)
  const cfg = (window.DD_CUSTOM && window.DD_CUSTOM.config) ? window.DD_CUSTOM.config : {};
  const startLP   = Number(cfg['cfg-startlp'])   || 4000;
  RUN_STATE.active          = true;
  RUN_STATE.playerHP        = startLP;
  RUN_STATE.maxHP           = startLP;
  RUN_STATE.deck            = buildStarterDeck();
  const firstAct            = getAllActs()[0] || null;
  if (!firstAct) {
    strictDataError('Kein Editor-Act fuer Run-Start gefunden.');
    return;
  }
  RUN_STATE.currentActIndex = Number(firstAct.actIndex || 0);
  RUN_STATE.currentActId    = getActId(firstAct);
  RUN_STATE.currentNodeId   = null;
  RUN_STATE.completedNodes  = new Set();
  /* Start-Nodes dynamisch aus dem ersten Editor-Act bestimmen */
  const _fa   = getActData(RUN_STATE.currentActId);
  const _sn   = _fa ? _fa.nodes.find(n => n.type === 'start') : null;
  RUN_STATE.availableNodes  = (_sn && _sn.next && _sn.next.length > 0)
    ? new Set(_sn.next)
    : new Set();
  RUN_STATE._isFreeDuel     = false;
}

function advanceToNextAct() {
  RUN_STATE.currentActIndex++;
  const act = getActData(RUN_STATE.currentActIndex);
  if (!act) return false; // kein weiterer Akt �  Victory
  // Startknoten des neuen Akts als completed markieren und nächste freischalten
  const startNode = act.nodes.find(n => n.type === 'start');
  if (startNode) {
    RUN_STATE.completedNodes.add(startNode.id);
    startNode.next.forEach(id => RUN_STATE.availableNodes.add(id));
  }
  return true;
}

function completeNode(nodeId) {
  RUN_STATE.completedNodes.add(nodeId);
  RUN_STATE.availableNodes.delete(nodeId);

  const act = RUN_STATE.currentActId
    ? getActData(RUN_STATE.currentActId)
    : getActData(RUN_STATE.currentActIndex);
  if (!act) return;
  const node = act.nodes.find(n => n.id === nodeId);
  if (!node) return;

  node.next.forEach(nextId => {
    const nextAct = getActData(nextId);
    if (nextAct) {
      if (RUN_STATE._worldMode) {
        RUN_STATE._dungeonComplete = true;
      } else {
        RUN_STATE.currentActIndex = Number(nextAct.actIndex || 0);
        RUN_STATE.currentActId = getActId(nextAct);
        const startNode = Array.isArray(nextAct.nodes) ? nextAct.nodes.find(n => n.type === 'start') : null;
        if (startNode) {
          RUN_STATE.completedNodes.add(startNode.id);
          (startNode.next || []).forEach(id => RUN_STATE.availableNodes.add(id));
        }
      }
    } else if (nextId === 'victory') {
      if (RUN_STATE._worldMode) {
        RUN_STATE._dungeonComplete = true;
      } else {
        showScreen('victory');
      }
    } else {
      RUN_STATE.availableNodes.add(nextId);
    }
  });
}

/* Battle-State Mutationen */
function initBattleState(enemy) {
  const deck = [...RUN_STATE.deck].map(cloneCard);
  shuffleDeck(deck);
  Object.assign(BATTLE_STATE, {
    active:            true,
    enemy,
    playerLP:          RUN_STATE.playerHP,
    enemyLP:           enemy.hp,
    playerField:       Array(5).fill(null),
    enemyField:        Array(5).fill(null),
    playerSTZone:      Array(3).fill(null),
    enemySTZone:       Array(3).fill(null),
    activeFieldCard:   null,
    playerDeck:        deck,
    playerGrave:       [],
    enemyDeck:         (enemy.deckIds || []).map(cardId => cloneCard(getCardById(cardId))).filter(Boolean),
    enemyGrave:        [],
    enemyHand:         [],
    hand:              [],
    phaseIndex:        0,
    selectedHandIndex: null,
    fusionSelect:      [],
    attackerIndex:     null,
    summonCount:       0,
    maxPlayerSummons:  _getMaxPlayerSummons(),
    hasAttacked:       Array(5).fill(false),
    enemyHasAttacked:  Array(5).fill(false),
    turn:              1,
    gameOver:          false,
    pendingTraps:      [],
    rankingStats: {
      startPlayerLP:          RUN_STATE.playerHP,  // LP zu Kampfbeginn
      maxSingleDamage:        0,
      enemyMonstersDestroyed: 0,
      spellsTrapsPlayed:      0,
      turnsElapsed:           1,
      totalDamageDealt:       0,
    },
  });

  /* �?��?� Gegner-Startaufstellung �?��?� */
  _placeEnemyStartField(enemy);
  _placeEnemyStartTraps(enemy);
  _dealEnemyStartHand(enemy);

  /* �?��?� Startfeld-Karte aktivieren (global, kein Besitzer) �?��?� */
  if (enemy.startFieldCard) {
    const fc = getCardById(enemy.startFieldCard);
    if (fc && fc.type === 'field') {
      // silent=true: keine Log-Ausgabe beim Kampfstart
      if (typeof activateFieldCard === 'function') activateFieldCard(cloneCard(fc), true);
    }
  }

  // Spieler zieht Startkarten (konfigurierbar, Standard: 5)
  const startHandSize = (window.DD_CUSTOM && window.DD_CUSTOM.config && window.DD_CUSTOM.config['cfg-maxhand'])
    ? Math.min(Number(window.DD_CUSTOM.config['cfg-maxhand']), 7) : 5;
  for (let i = 0; i < startHandSize; i++) engineDrawCard();
}

/** Platziert Gegner-Startmonster auf dem Feld (mit fieldBonus auf ATK/DEF). */
function _placeEnemyStartField(enemy) {
  const bonus = enemy.fieldBonus || 0;
  const placed = [];

  (enemy.startField || []).forEach((cardId, idx) => {
    if (idx >= 5) return;
    const base = getCardById(cardId);
    if (!base) return;
    const card = cloneCard(base);
    card.mode   = 'attack';
    card.hidden = false;
    card.atk    = card.atk + bonus;
    card.def    = card.def + Math.floor(bonus * 0.5);
    card._fieldBonus = bonus;
    BATTLE_STATE.enemyField[idx] = card;
    placed.push({ card, idx });
  });

  if (placed.length === 0) return;

  /* On-Summon-Effekte für alle Startkarten anwenden */
  placed.forEach(({ card }) => applyOnSummonEffect(card, false));

  /* Passive Synergien neu berechnen (alle Karten liegen jetzt auf dem Feld) */
  applyFieldSynergies(false);

  /* On-Summon-Synergien (z.B. Schattenwesen-Debuff bei �0�2 auf Feld) */
  placed.forEach(({ card }) => checkOnSummonSynergies(card, false));
}

/** Platziert Gegner-Startfallen verdeckt in der Spell/Trap-Zone. */
function _placeEnemyStartTraps(enemy) {
  (enemy.startTraps || []).forEach((cardId, idx) => {
    if (idx >= 3) return;
    const base = getCardById(cardId);
    if (!base) return;
    const card = cloneCard(base);
    card.hidden = true;
    BATTLE_STATE.enemySTZone[idx] = card;
  });
}

/** Gibt dem Gegner eine Starthand aus seinem Deck. */
function _dealEnemyStartHand(enemy) {
  const count = enemy.startHandCount || 3;
  const bs    = BATTLE_STATE;
  for (let i = 0; i < count && bs.enemyDeck.length > 0; i++) {
    const c = bs.enemyDeck.pop();
    c.mode = 'attack';
    bs.enemyHand.push(c);
  }
}

/* Maximale Spieler-Beschwörungen aus Editor-Konfiguration lesen */
function _getMaxPlayerSummons() {
  return Number(
    (window.DD_CUSTOM && window.DD_CUSTOM.config && window.DD_CUSTOM.config['cfg-maxsummons']) || 2
  );
}

function resetRoundFlags() {
  BATTLE_STATE.summonCount       = 0;
  BATTLE_STATE.hasAttacked       = Array(5).fill(false);
  BATTLE_STATE.enemyHasAttacked  = Array(5).fill(false);
  BATTLE_STATE.selectedHandIndex = null;
  BATTLE_STATE.attackerIndex     = null;
  BATTLE_STATE.fusionSelect      = [];
  BATTLE_STATE.rankingStats.turnsElapsed++;
}
