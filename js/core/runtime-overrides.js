/* ============================================================
   core/runtime-overrides.js
   Strikte, editorgetriebene Runtime-Overrides fuer Worldmap/Dungeon.
   ============================================================ */

function getRunActData() {
  if (RUN_STATE.currentActData && Array.isArray(RUN_STATE.currentActData.nodes)) {
    return RUN_STATE.currentActData;
  }
  return RUN_STATE.currentActId ? getActData(RUN_STATE.currentActId) : getActData(RUN_STATE.currentActIndex);
}

function completeNode(nodeId) {
  RUN_STATE.completedNodes.add(nodeId);
  RUN_STATE.availableNodes.delete(nodeId);

  const act = getRunActData();
  if (!act || !Array.isArray(act.nodes)) return;

  const node = act.nodes.find(entry => entry.id === nodeId);
  if (!node) return;

  if (RUN_STATE._worldMode && node.type === 'boss') {
    RUN_STATE._dungeonComplete = true;
    return;
  }

  (node.next || []).forEach(nextId => {
    if (nextId === 'victory') {
      if (RUN_STATE._worldMode) RUN_STATE._dungeonComplete = true;
      else showScreen('victory');
      return;
    }

    const nextAct = getActData(nextId);
    if (nextAct) {
      RUN_STATE.currentActIndex = Number(nextAct.actIndex || 0);
      RUN_STATE.currentActId = getActId(nextAct);
      RUN_STATE.currentActData = nextAct;
      const startNode = Array.isArray(nextAct.nodes)
        ? nextAct.nodes.find(entry => entry.type === 'start')
        : null;
      if (startNode && Array.isArray(startNode.next)) {
        RUN_STATE.completedNodes.add(startNode.id);
        startNode.next.forEach(id => RUN_STATE.availableNodes.add(id));
      }
      return;
    }

    if (act.nodes.some(entry => entry.id === nextId)) {
      RUN_STATE.availableNodes.add(nextId);
    }
  });
}

function startNewRun() {
  if (!SAVE_STATE.slot) return;

  const cfg = (window.DD_CUSTOM && window.DD_CUSTOM.config) ? window.DD_CUSTOM.config : {};
  const startLP = Number(cfg['cfg-startlp']) || 4000;
  const deckIds = (SAVE_STATE.slot.baseDeck && SAVE_STATE.slot.baseDeck.length >= 15)
    ? SAVE_STATE.slot.baseDeck
    : buildStarterDeck().map(card => card.id);

  const firstAct = getAllActs()[0] || null;
  if (!firstAct) {
    strictDataError('Kein Editor-Act fuer neuen Run gefunden.');
    return;
  }

  const startNode = Array.isArray(firstAct.nodes)
    ? firstAct.nodes.find(node => node.type === 'start')
    : null;

  SAVE_STATE.slot.activeRun = {
    playerHP:        startLP,
    maxHP:           startLP,
    deck:            deckIds,
    currentActIndex: Number(firstAct.actIndex || 0),
    currentActId:    getActId(firstAct),
    currentNodeId:   null,
    completedNodes:  new Set(),
    availableNodes:  new Set(startNode && Array.isArray(startNode.next) ? startNode.next : []),
  };
}

function initRunStateFromSave() {
  const slot = SAVE_STATE.slot;
  const cfg  = (window.DD_CUSTOM && window.DD_CUSTOM.config) ? window.DD_CUSTOM.config : {};
  const startLP = Number(cfg['cfg-startlp']) || 4000;

  if (slot && slot.activeRun) {
    const run = slot.activeRun;
    RUN_STATE.active          = true;
    RUN_STATE.playerHP        = run.playerHP || startLP;
    RUN_STATE.maxHP           = run.maxHP || startLP;
    RUN_STATE.deck            = (run.deck || []).map(id => {
      const base = getCardById(id);
      return base ? cloneCard(base) : null;
    }).filter(Boolean);
    RUN_STATE.currentActIndex = run.currentActIndex || 0;
    RUN_STATE.currentActId    = run.currentActId || null;
    RUN_STATE.currentActData  = run.currentActData || null;
    RUN_STATE.currentNodeId   = run.currentNodeId || null;
    RUN_STATE.completedNodes  = new Set(run.completedNodes || []);
    RUN_STATE.availableNodes  = new Set(run.availableNodes || []);
  } else {
    startNewRun();
    if (!slot || !slot.activeRun) return;

    RUN_STATE.active          = true;
    RUN_STATE.playerHP        = startLP;
    RUN_STATE.maxHP           = startLP;
    RUN_STATE.deck            = (slot.activeRun.deck || []).map(id => {
      const base = getCardById(id);
      return base ? cloneCard(base) : null;
    }).filter(Boolean);
    RUN_STATE.currentActIndex = slot.activeRun.currentActIndex || 0;
    RUN_STATE.currentActId    = slot.activeRun.currentActId || null;
    RUN_STATE.currentActData  = slot.activeRun.currentActData || null;
    RUN_STATE.currentNodeId   = null;
    RUN_STATE.completedNodes  = new Set();

    const firstAct = getRunActData();
    const startNode = firstAct && Array.isArray(firstAct.nodes)
      ? firstAct.nodes.find(node => node.type === 'start')
      : null;
    RUN_STATE.availableNodes = new Set(startNode && Array.isArray(startNode.next) ? startNode.next : []);
  }

  RUN_STATE._isFreeDuel = false;
  if (slot && slot.activeRun) {
    RUN_STATE._worldMode       = !!slot.activeRun._worldMode;
    RUN_STATE._worldLocationId = slot.activeRun._worldLocationId || null;
  } else {
    RUN_STATE._worldMode       = false;
    RUN_STATE._worldLocationId = null;
  }
  RUN_STATE._dungeonComplete = false;
}

function _syncRunStateToSave() {
  if (!SAVE_STATE.slot) return;
  if (!SAVE_STATE.slot.activeRun) SAVE_STATE.slot.activeRun = {};

  const run = SAVE_STATE.slot.activeRun;
  run.playerHP        = RUN_STATE.playerHP;
  run.maxHP           = RUN_STATE.maxHP;
  run.deck            = RUN_STATE.deck.map(card => card.id);
  run.currentActIndex = RUN_STATE.currentActIndex;
  run.currentActId    = RUN_STATE.currentActId || null;
  run.currentActData  = RUN_STATE.currentActData || null;
  run.currentNodeId   = RUN_STATE.currentNodeId;
  run.completedNodes  = new Set(RUN_STATE.completedNodes);
  run.availableNodes  = new Set(RUN_STATE.availableNodes);

  if (RUN_STATE._worldMode) {
    run._worldMode       = true;
    run._worldLocationId = RUN_STATE._worldLocationId || null;
  } else {
    delete run._worldMode;
    delete run._worldLocationId;
  }

}

function startFreeDuel(actIndex) {
  const act = getActData(actIndex);
  if (!act) return;

  const cfg = (window.DD_CUSTOM && window.DD_CUSTOM.config) ? window.DD_CUSTOM.config : {};
  const startLP = Number(cfg['cfg-startlp']) || 4000;

  RUN_STATE.active          = true;
  RUN_STATE.playerHP        = startLP;
  RUN_STATE.maxHP           = startLP;
  RUN_STATE.currentActIndex = Number(act.actIndex || actIndex || 0);
  RUN_STATE.currentActId    = getActId(act);
  RUN_STATE.currentActData  = act;
  RUN_STATE.currentNodeId   = null;
  RUN_STATE._isFreeDuel     = true;

  const base = buildStarterDeck();
  if (SAVE_STATE.slot && SAVE_STATE.slot.cardCollection.length > 0) {
    SAVE_STATE.slot.cardCollection.slice(0, 5).forEach(id => {
      const card = getCardById(id);
      if (card) base.push(cloneCard(card));
    });
  }
  RUN_STATE.deck = base;

  const startNode = act.nodes.find(node => node.type === 'start');
  RUN_STATE.completedNodes = startNode ? new Set([startNode.id]) : new Set();
  RUN_STATE.availableNodes = startNode ? new Set(startNode.next) : new Set();

  showScreen('map');
  renderMap();
}

function startFreeDuelEnemy(enemyId) {
  if (!SAVE_STATE.slot) return;

  const cfg     = (window.DD_CUSTOM?.config) || {};
  const startLP = Number(cfg['cfg-startlp']) || 4000;

  let deck;
  if (SAVE_STATE.slot.baseDeck && SAVE_STATE.slot.baseDeck.length >= 5) {
    deck = SAVE_STATE.slot.baseDeck
      .map(id => { const card = getCardById(id); return card ? cloneCard(card) : null; })
      .filter(Boolean);
  } else {
    deck = buildStarterDeck();
    const rare = ['legendary', 'epic', 'rare', 'uncommon', 'common'];
    const sorted = (SAVE_STATE.slot.cardCollection || [])
      .map(id => getCardById(id)).filter(Boolean)
      .sort((a, b) => rare.indexOf(a.rarity) - rare.indexOf(b.rarity));
    sorted.slice(0, 10).forEach(card => deck.push(cloneCard(card)));
  }

  RUN_STATE.active          = true;
  RUN_STATE.playerHP        = startLP;
  RUN_STATE.maxHP           = startLP;
  RUN_STATE.currentActIndex = 0;
  RUN_STATE.currentActId    = null;
  RUN_STATE.currentActData  = null;
  RUN_STATE.currentNodeId   = null;
  RUN_STATE.currentNodeType = 'battle';
  RUN_STATE._isFreeDuel     = true;
  RUN_STATE._freeDuelReturn = true;
  RUN_STATE.completedNodes  = new Set();
  RUN_STATE.availableNodes  = new Set();
  RUN_STATE.deck            = deck;

  startBattle(enemyId);
}

document.addEventListener('click', event => {
  const newSlotBtn = event.target.closest('.btn-slot-new');
  if (newSlotBtn) {
    event.preventDefault();
    event.stopImmediatePropagation();

    const id = Number(newSlotBtn.dataset.slot);
    loadSlot(id);
    if (typeof window.logDDRuntimeDiagnostics === 'function') {
      window.logDDRuntimeDiagnostics('runtime-new-game-click');
    }

    const hasWorldMap = window.DD_CUSTOM && Array.isArray(window.DD_CUSTOM.worldMap) && window.DD_CUSTOM.worldMap.length > 0;
    if (!hasWorldMap) {
      strictDataError('Keine Weltenkarte konfiguriert. Neues Spiel kann nicht gestartet werden.');
      return;
    }

    if (SAVE_STATE.slot) SAVE_STATE.slot.activeRun = null;
    initWorldState();
    return;
  }

  const campaignBtn = event.target.closest('#btn-mainmenu-campaign');
  if (!campaignBtn) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  if (typeof window.logDDRuntimeDiagnostics === 'function') {
    window.logDDRuntimeDiagnostics('runtime-campaign-button');
  }

  const hasWorldMap = window.DD_CUSTOM && Array.isArray(window.DD_CUSTOM.worldMap) && window.DD_CUSTOM.worldMap.length > 0;
  if (!hasWorldMap) {
    strictDataError('Keine Weltenkarte konfiguriert. Kampagne kann nicht gestartet werden.');
    return;
  }

  if (!SAVE_STATE.slot) return;
  initWorldState();
}, true);
