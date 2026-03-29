/* ============================================================
   core/state.js — Zentraler Spielzustand
   RUN_STATE:    persistenter Zustand über einen Run
   BATTLE_STATE: Zustand für die aktive Battle-Session
   ============================================================ */

/* ── Run-State (über Kämpfe hinweg persistent) ── */
const RUN_STATE = {
  active:         false,
  playerHP:       4000,
  maxHP:          4000,
  gold:           0,
  deck:           [],          // Karten im Run-Deck (zwischen Kämpfen)
  currentActIndex:0,
  currentNodeId:  null,        // ID des aktuellen Knotens
  completedNodes: new Set(),   // IDs abgeschlossener Knoten
  availableNodes: new Set(),   // IDs der nächsten spielbaren Knoten
};

/* ── Battle-State (nur während einer Battle aktiv) ── */
const BATTLE_STATE = {
  active:            false,
  enemy:             null,      // Gegner-Objekt (aus enemies.js)

  playerLP:          4000,
  enemyLP:           3000,

  playerField:       Array(5).fill(null),
  enemyField:        Array(5).fill(null),
  playerSTZone:      Array(3).fill(null), // Spell/Trap-Zone Spieler
  enemySTZone:       Array(3).fill(null), // Spell/Trap-Zone Gegner

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

  hasNormalSummoned: false,
  hasAttacked:       Array(5).fill(false),

  turn:              1,
  gameOver:          false,
  pendingTraps:      [],        // face-down Fallen, die noch nicht aktiviert wurden

  /* ── Ranking-Statistiken (für Drop-System) ── */
  rankingStats: {
    maxSingleDamage:        0,  // Höchster Einzelschaden den der Spieler verursacht hat
    enemyMonstersDestroyed: 0,  // Gegnerkarten durch Spieler zerstört
    spellsTrapsPlayed:      0,  // Spieler-Spells/Traps aktiviert (senkt Score)
    turnsElapsed:           1,  // Rundenanzahl
    totalDamageDealt:       0,  // Gesamtschaden an Gegner-LP
  },
};

/* ── Getter ── */
function getCurrentPhase() {
  return BATTLE_STATE.phases[BATTLE_STATE.phaseIndex];
}

/* ── Run-State Mutationen ── */
function initRunState() {
  // Config aus Editor laden (falls vorhanden) — Fallback auf Defaults
  const cfg = (window.DD_CUSTOM && window.DD_CUSTOM.config) ? window.DD_CUSTOM.config : {};
  const startLP   = Number(cfg['cfg-startlp'])   || 4000;
  const startGold = Number(cfg['cfg-startgold']) || 50;

  RUN_STATE.active          = true;
  RUN_STATE.playerHP        = startLP;
  RUN_STATE.maxHP           = startLP;
  RUN_STATE.gold            = startGold;
  RUN_STATE.deck            = buildStarterDeck();
  RUN_STATE.currentActIndex = 0;
  RUN_STATE.currentNodeId   = null;
  RUN_STATE.completedNodes  = new Set();
  RUN_STATE.availableNodes  = new Set(['1_1a','1_1b']); // Erste wählbare Nodes Akt 1
}

function advanceToNextAct() {
  RUN_STATE.currentActIndex++;
  const act = getActData(RUN_STATE.currentActIndex);
  if (!act) return false; // kein weiterer Akt → Victory
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

  const act = getActData(RUN_STATE.currentActIndex);
  if (!act) return;
  const node = act.nodes.find(n => n.id === nodeId);
  if (!node) return;

  node.next.forEach(nextId => {
    if (nextId === 'act2' || nextId === 'act3') {
      advanceToNextAct();
    } else if (nextId === 'victory') {
      showScreen('victory');
    } else {
      RUN_STATE.availableNodes.add(nextId);
    }
  });
}

/* ── Battle-State Mutationen ── */
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
    hasNormalSummoned: false,
    hasAttacked:       Array(5).fill(false),
    enemyHasAttacked:  Array(5).fill(false),
    turn:              1,
    gameOver:          false,
    pendingTraps:      [],
    rankingStats: {
      startPlayerLP:          RUN_STATE.playerHP,  // LP zu Kampfbeginn (für Rang-Berechnung)
      maxSingleDamage:        0,
      enemyMonstersDestroyed: 0,
      spellsTrapsPlayed:      0,
      turnsElapsed:           1,
      totalDamageDealt:       0,
    },
  });

  /* ── Gegner-Startaufstellung ── */
  _placeEnemyStartField(enemy);
  _placeEnemyStartTraps(enemy);
  _dealEnemyStartHand(enemy);

  // Spieler zieht Startkarten (konfigurierbar, Standard: 5)
  const startHandSize = (window.DD_CUSTOM && window.DD_CUSTOM.config && window.DD_CUSTOM.config['cfg-maxhand'])
    ? Math.min(Number(window.DD_CUSTOM.config['cfg-maxhand']), 7) : 5;
  for (let i = 0; i < startHandSize; i++) engineDrawCard();
}

/** Platziert Gegner-Startmonster auf dem Feld (mit fieldBonus auf ATK/DEF). */
function _placeEnemyStartField(enemy) {
  const bonus = enemy.fieldBonus || 0;
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
  });
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

function resetRoundFlags() {
  BATTLE_STATE.hasNormalSummoned = false;
  BATTLE_STATE.hasAttacked       = Array(5).fill(false);
  BATTLE_STATE.selectedHandIndex = null;
  BATTLE_STATE.attackerIndex     = null;
  BATTLE_STATE.fusionSelect      = [];
  BATTLE_STATE.rankingStats.turnsElapsed++;
}
