/* ============================================================
   ui/worldmap.js — Weltenkarte System
   �Sbergeordnete Weltstruktur mit Story-, Hub- und Dungeon-Orten.
   Das bestehende Dungeon-System (Map, Battle, Engine) wird NICHT
   verändert — nur die übergeordnete Navigation wird hier gesteuert.
   ============================================================ */

/* —�—� Welt-State (persistent über Sessions, Teil des Save-Slots) —�—� */
const WORLD_STATE = {
  active:             false,
  currentLocationId:  null,
  completedLocations: new Set(),  // vollständig abgeschlossene Orte
  visitedLocations:   new Set(),  // bereits besuchte Orte (auch unfertige)
  lastVisitedNodeId:  null,
  lastNodeType:       null,
  lastDungeonId:      null,
};

/* —�—� Story-Fortschritt pro Location —�—� */
const _storyProgress = {};  // { [locationId]: lineIndex }

/* —�—� Interne Refs —�—� */
let _currentStoryLoc  = null;
let _currentStoryLine = 0;

function _wmUi(key, params, fallback) {
  return typeof t === 'function' ? t(key, params, { fallbackValue: fallback }) : (fallback || key);
}

/* —�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�
   HILFSFUNKTIONEN
—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—� */

/** Gibt die Weltenkarten-Daten aus DD_CUSTOM zurück. */
function _getWorldMapData() {
  const worldMap = (window.DD_CUSTOM && Array.isArray(window.DD_CUSTOM.worldMap) && window.DD_CUSTOM.worldMap.length > 0)
    ? window.DD_CUSTOM.worldMap
    : null;
  if (worldMap && typeof prepareWorldLocationLocalization === 'function') {
    worldMap.forEach(prepareWorldLocationLocalization);
  }
  return worldMap;
}

function _showStrictWorldError(message, details) {
  const fullMessage = details ? `${message}\n${details}` : message;
  console.error(`[WorldMap] ${fullMessage}`);
  alert(fullMessage);
  return false;
}

function _getLocationActId(loc) {
  if (!loc) return null;
  if (typeof loc.actId === 'string' && loc.actId.trim()) return loc.actId.trim();
  if (loc.actIndex !== undefined && loc.actIndex !== null) {
    const act = getActData(Number(loc.actIndex));
    return act ? getActId(act) : null;
  }
  return null;
}

/** Erster Story-Ort ohne Unlock-Bedingungen, sonst erster freier Ort. */
function _getStartLocationId(worldMap) {
  const start = worldMap.find(loc => loc.isStart) || worldMap.find(loc =>
    loc.type === 'story' &&
    (!loc.unlockConditions || loc.unlockConditions.length === 0)
  ) || worldMap.find(loc => !loc.unlockConditions || loc.unlockConditions.length === 0);
  return start ? start.id : (worldMap[0] ? worldMap[0].id : null);
}

/** Typ-Label für UI-Anzeige. */
function _getTypeLabel(type) {
  const labels = {
    dungeon: _wmUi('ui.worldmap.type.dungeon', null, '&#9876; Dungeon'),
    hub: _wmUi('ui.worldmap.type.hub', null, '&#127957; Hub'),
    story: _wmUi('ui.worldmap.type.story', null, '&#128220; Story'),
    path: _wmUi('ui.worldmap.type.path', null, '&#10022; Path'),
  };
  return labels[type] || type || _wmUi('ui.worldmap.type.location', null, 'Location');
}

function _isDungeonReentryBlocked(locationId) {
  return !!locationId &&
    WORLD_STATE.lastNodeType === 'dungeon' &&
    WORLD_STATE.lastVisitedNodeId === locationId;
}

function _markVisitedLocation(loc) {
  if (!loc) return;
  WORLD_STATE.currentLocationId = loc.id;
  WORLD_STATE.visitedLocations.add(loc.id);
  WORLD_STATE.lastVisitedNodeId = loc.id;
  WORLD_STATE.lastNodeType = loc.type || null;
  if (loc.type === 'dungeon') WORLD_STATE.lastDungeonId = loc.id;
}

function _getLocationDisplayName(loc, isCurrent, isVisited) {
  if (!loc) return _wmUi('ui.worldmap.unknown', null, '???');
  if (loc.type === 'dungeon' && !isVisited && !isCurrent) return _wmUi('ui.worldmap.unknown', null, '???');
  return loc.name || _wmUi('ui.worldmap.type.location', null, 'Location');
}

function _getLocationHoverText(loc, isCurrent, isVisited) {
  if (!loc) return '';
  if (loc.type === 'dungeon') {
    if (_isDungeonReentryBlocked(loc.id)) return _wmUi('ui.worldmap.hover.dungeonBlocked', null, 'Dungeon locked: enter another location first');
    if (!isVisited && !isCurrent) return _wmUi('ui.worldmap.hover.dungeonUnknown', null, '???\nDungeon must be entered');
    return _wmUi('ui.worldmap.hover.dungeon', { name: loc.name }, `${loc.name}\nDungeon must be entered`);
  }
  return _wmUi('ui.worldmap.hover.location', { name: loc.name, type: _getTypeLabel(loc.type) }, `${loc.name}\n${_getTypeLabel(loc.type)}`);
}

/* —�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�
   INIT
—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—� */

/**
 * Weltenkarte initialisieren.
 * Lädt gespeicherten Fortschritt oder startet frisch.
 * Falls keine Weltenkarten-Daten konfiguriert: Fallback auf normalen Map-Screen.
 */
function initWorldState() {
  const worldMap = _getWorldMapData();

  if (!worldMap) {
    _showStrictWorldError(_wmUi('ui.worldmap.error.noMap', null, 'No world map configured.'), _wmUi('ui.worldmap.error.createMapInEditor', null, 'Please create world map data in the editor.'));
    return;
  }

  /* Fortschritt aus Save laden */
  const saved = SAVE_STATE.slot && SAVE_STATE.slot.worldProgress;
  if (saved) {
    WORLD_STATE.currentLocationId  = saved.currentLocationId || _getStartLocationId(worldMap);
    WORLD_STATE.completedLocations = new Set(saved.completedLocations || []);
    WORLD_STATE.visitedLocations   = new Set(saved.visitedLocations   || []);
    WORLD_STATE.lastVisitedNodeId  = saved.lastVisitedNodeId || null;
    WORLD_STATE.lastNodeType       = saved.lastNodeType || null;
    WORLD_STATE.lastDungeonId      = saved.lastDungeonId || null;
  } else {
    WORLD_STATE.currentLocationId  = _getStartLocationId(worldMap);
    WORLD_STATE.completedLocations = new Set();
    WORLD_STATE.visitedLocations   = new Set();
    WORLD_STATE.lastVisitedNodeId  = WORLD_STATE.currentLocationId;
    WORLD_STATE.lastNodeType       = worldMap.find(l => l.id === WORLD_STATE.currentLocationId)?.type || null;
    WORLD_STATE.lastDungeonId      = null;
  }

  /* Validierung: currentLocationId muss in worldMap existieren */
  if (!worldMap.find(l => l.id === WORLD_STATE.currentLocationId)) {
    WORLD_STATE.currentLocationId = _getStartLocationId(worldMap);
  }

  if (!WORLD_STATE.currentLocationId) {
    _showStrictWorldError(_wmUi('ui.worldmap.error.noStartLocation', null, 'No start location found on the world map.'), _wmUi('ui.worldmap.error.startLocationHint', null, 'A story location without unlock conditions is required.'));
    return;
  }

  WORLD_STATE.active = true;
  RUN_STATE._worldMode       = false;
  RUN_STATE._dungeonComplete = false;

  /* Startort als besucht markieren */
  if (WORLD_STATE.currentLocationId) {
    WORLD_STATE.visitedLocations.add(WORLD_STATE.currentLocationId);
  }

  saveWorldProgress();

  const currentLoc = worldMap.find(loc => loc.id === WORLD_STATE.currentLocationId) || null;
  if (!saved && currentLoc && Array.isArray(currentLoc.storyLines) && currentLoc.storyLines.length > 0) {
    if (typeof startWorldMapLocationStory === 'function') {
      startWorldMapLocationStory(currentLoc);
    } else {
      showStoryScreen(currentLoc);
    }
    return;
  }

  renderWorldMap();
  showScreen('worldmap');
}

/* —�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�
   SAVE / LOAD
—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—� */

/** Aktuellen Welt-Fortschritt im aktiven Save-Slot speichern. */
function saveWorldProgress() {
  if (!SAVE_STATE.slot) return;
  SAVE_STATE.slot.worldProgress = {
    currentLocationId:  WORLD_STATE.currentLocationId,
    completedLocations: Array.from(WORLD_STATE.completedLocations),
    visitedLocations:   Array.from(WORLD_STATE.visitedLocations),
    lastVisitedNodeId:  WORLD_STATE.lastVisitedNodeId,
    lastNodeType:       WORLD_STATE.lastNodeType,
    lastDungeonId:      WORLD_STATE.lastDungeonId,
  };
}

function commitHubSave() {
  if (!SAVE_STATE.slot) return false;
  saveWorldProgress();
  SAVE_STATE.slot.baseDeck = Array.isArray(RUN_STATE.deck) ? RUN_STATE.deck.map(card => card.id) : [];
  if (SAVE_STATE.slot.worldProgress) {
    SAVE_STATE.slot.worldProgress.playerHP = RUN_STATE.playerHP;
    SAVE_STATE.slot.worldProgress.maxHP = RUN_STATE.maxHP;
  }
  SAVE_STATE.slot.activeRun = null;
  if (typeof saveCurrentSlotWithFeedback === 'function') saveCurrentSlotWithFeedback(_wmUi('ui.worldmap.save.saved', null, 'Game saved'));
  else if (typeof saveCurrentSlot === 'function') saveCurrentSlot();
  return true;
}

/* —�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�
   UNLOCK / ZUG�NGLICHKEIT
—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—� */

/**
 * Prüft ob eine Location durch alle Bedingungen freigeschaltet ist.
 * Unterstützte Bedingungstypen:
 *   locationCompleted — bestimmter Ort muss abgeschlossen sein
 *   locationVisited   — bestimmter Ort muss besucht worden sein
 *   cardOwned         — Spieler muss eine bestimmte Karte besitzen
 *   always            — immer freigeschaltet (default)
 */
function isLocationUnlocked(locationId) {
  const worldMap = _getWorldMapData();
  if (!worldMap) return false;
  const loc = worldMap.find(l => l.id === locationId);
  if (!loc) return false;
  if (!loc.unlockConditions || loc.unlockConditions.length === 0) return true;

  return loc.unlockConditions.every(cond => {
    switch (cond.type) {
      case 'locationCompleted':
        return WORLD_STATE.completedLocations.has(cond.locationId);
      case 'locationVisited':
        return WORLD_STATE.visitedLocations.has(cond.locationId);
      case 'cardOwned':
        return SAVE_STATE.slot &&
               (SAVE_STATE.slot.cardCollection || []).includes(cond.cardId);
      case 'always':
      default:
        return true;
    }
  });
}

/**
 * Prüft ob eine Location von der aktuellen Position aus besucht werden kann.
 * (Muss freigeschaltet UND mit currentLocation verbunden sein.)
 */
function isLocationAccessible(locationId) {
  if (!isLocationUnlocked(locationId)) return false;
  const worldMap = _getWorldMapData();
  if (!worldMap) return false;
  const current = worldMap.find(l => l.id === WORLD_STATE.currentLocationId);
  if (!current) return false;
  return (current.connections || []).includes(locationId);
}

/* —�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�
   RENDER WELTENKARTE
—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—� */

/** Hauptfunktion: rendert den Worldmap-Screen komplett. */
function renderWorldMap() {
  const screen = document.getElementById('screen-worldmap');
  if (!screen) return;

  const worldMap = _getWorldMapData();
  if (!worldMap || worldMap.length === 0) {
    screen.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#aaa;gap:16px">
        <div style="font-size:40px">�x�</div>
        <div>${_wmUi('ui.worldmap.error.noMap', null, 'No world map configured.')}</div>
        <div style="font-size:12px;color:#555">${_wmUi('ui.worldmap.error.createMapInEditor', null, 'Create a world map in the editor.')}</div>
      </div>`;
    return;
  }

  if (typeof setMusicPlaylist === 'function') setMusicPlaylist(MUSIC_PLAYLISTS.campaign);

  screen.innerHTML = '';

  /* —�—� Header —�—� */
  const currentHP  = RUN_STATE.playerHP  || (SAVE_STATE.slot && SAVE_STATE.slot.worldProgress && SAVE_STATE.slot.worldProgress.playerHP) || 4000;
  const maxHP      = RUN_STATE.maxHP     || 4000;
  const dimensionsSeelen = typeof getDimensionsSeelen === 'function' ? getDimensionsSeelen() : 0;
  const hpPercent  = Math.max(0, Math.min(100, (currentHP / maxHP) * 100));

  const header = document.createElement('div');
  header.className = 'wm-header';
  header.innerHTML = `
    <div class="wm-title">${_wmUi('ui.title.logo', null, '&#9876; DARK DIMENSIONS')}</div>
    <div class="wm-header-stats">
      <div class="wm-stat">
        <span class="wm-stat-icon">❤</span>
        <div class="wm-hp-bar-wrap">
          <div class="wm-hp-bar" style="width:${hpPercent}%"></div>
        </div>
        <span class="wm-stat-val">${currentHP} / ${maxHP}</span>
      </div>
      <div class="wm-stat">
        <span class="wm-stat-icon">✦</span>
        <span class="wm-stat-val">${dimensionsSeelen} DS</span>
      </div>
    </div>
    <button class="btn-pause-hud wm-pause-btn" id="btn-wm-pause" title="${_wmUi('ui.common.pauseEsc', null, 'Pause (ESC)')}">⏸</button>
  `;
  screen.appendChild(header);

  /* —�—� Map-Bereich —�—� */
  const mapWrap = document.createElement('div');
  mapWrap.className = 'wm-map-wrap';
  screen.appendChild(mapWrap);

  /* SVG für Verbindungslinien (wird nach Node-Platzierung gezeichnet) */
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('wm-svg');
  mapWrap.appendChild(svg);

  /* —�—� Nodes rendern —�—� */
  const nodeEls = {};
  worldMap.forEach(loc => {
    const isCompleted  = WORLD_STATE.completedLocations.has(loc.id);
    const isCurrent    = WORLD_STATE.currentLocationId === loc.id;
    const isVisited    = WORLD_STATE.visitedLocations.has(loc.id);
    const isUnlocked   = isLocationUnlocked(loc.id);
    const isAccessible = isLocationAccessible(loc.id);
    const isReentryBlocked = loc.type === 'dungeon' && _isDungeonReentryBlocked(loc.id);

    /* CSS-Zustandsklasse */
    let stateClass = 'wm-node-locked';
    if (isCurrent)        stateClass = 'wm-node-current';
    else if (isCompleted) stateClass = 'wm-node-completed';
    else if (isAccessible) stateClass = 'wm-node-accessible';
    else if (isVisited && isUnlocked) stateClass = 'wm-node-visited';
    if (isReentryBlocked) stateClass += ' wm-node-blocked';

    const typeIcon  = { dungeon:'&#9876;', hub:'&#127957;', story:'&#128220;', path:'&#10022;' }[loc.type] || '&bull;';
    const typeClass = `wm-node-type-${loc.type || 'dungeon'}`;
    const displayName = _getLocationDisplayName(loc, isCurrent, isVisited);

    const node = document.createElement('div');
    node.className = `wm-node ${stateClass} ${typeClass}`;
    node.style.left = `${Math.max(5, Math.min(95, loc.x || 50))}%`;
    node.style.top  = `${Math.max(8, Math.min(92, loc.y || 50))}%`;
    node.dataset.id  = loc.id;
    node.title       = _getLocationHoverText(loc, isCurrent, isVisited);

    node.innerHTML = `
      <div class="wm-node-pulse"></div>
      <div class="wm-node-icon">${isCompleted ? '&#10003;' : typeIcon}</div>
      <div class="wm-node-label">${displayName}</div>
      ${loc.type === 'dungeon' ? `<div class="wm-node-note">${isReentryBlocked ? _wmUi('ui.worldmap.locked', null, 'Locked') : _wmUi('ui.worldmap.requiredDungeon', null, 'Required dungeon')}</div>` : ''}
      ${loc.type === 'path' ? `<div class="wm-node-note">${_wmUi('ui.worldmap.type.path', null, 'Path')}</div>` : ''}
    `;

    /* Klick-Handler */
    if ((isAccessible && !isCurrent) || isCurrent) {
      node.addEventListener('click', () => travelToLocation(loc.id));
    }

    mapWrap.appendChild(node);
    nodeEls[loc.id] = node;
  });

  /* —�—� Verbindungslinien zeichnen (nach DOM-Einfügen per rAF) —�—� */
  requestAnimationFrame(() => _drawConnections(svg, worldMap, nodeEls, mapWrap));

  /* —�—� Footer —�—� */
  const currentLoc = worldMap.find(l => l.id === WORLD_STATE.currentLocationId);
  const footer = document.createElement('div');
  footer.className = 'wm-footer';

  if (currentLoc) {
    const isCompleted = WORLD_STATE.completedLocations.has(currentLoc.id);
    const isBlocked   = currentLoc.type === 'dungeon' && _isDungeonReentryBlocked(currentLoc.id);
    const btnLabel    = isBlocked ? _wmUi('ui.worldmap.locked', null, 'Locked') : (isCompleted ? _wmUi('ui.worldmap.reenter', null, '&larr; Re-enter') : _wmUi('ui.worldmap.enter', null, '&#9654; Enter'));
    const btnClass    = isBlocked ? 'btn-danger' : (isCompleted ? 'btn-secondary' : 'btn-success');
    const currentName = _getLocationDisplayName(currentLoc, true, WORLD_STATE.visitedLocations.has(currentLoc.id));

    footer.innerHTML = `
      <div class="wm-current-info">
        <div class="wm-current-name">${currentName}</div>
        <div class="wm-current-type">${_getTypeLabel(currentLoc.type)}${isCompleted ? ` <span class="wm-done-badge">${_wmUi('ui.worldmap.completed', null, 'Completed')}</span>` : ''}${isBlocked ? ` <span class="wm-done-badge">${_wmUi('ui.worldmap.waitOtherLocation', null, 'Visit another location first')}</span>` : ''}</div>
      </div>
      <button id="btn-wm-enter" class="${btnClass} wm-enter-btn" ${isBlocked ? 'disabled' : ''}>${btnLabel}</button>
    `;
    footer.querySelector('#btn-wm-enter')?.addEventListener('click', enterCurrentLocation);
  }
  screen.appendChild(footer);

  /* Pause-Button binden */
  document.getElementById('btn-wm-pause')?.addEventListener('click', () => {
    if (typeof showPauseMenu === 'function') showPauseMenu();
  });
}

/** Zeichnet SVG-Verbindungslinien zwischen den Nodes. */
function _drawConnections(svg, worldMap, nodeEls, container) {
  svg.innerHTML = '';
  const cRect = container.getBoundingClientRect();
  if (cRect.width === 0) {
    /* Container hat noch keine Grö�xe �  kurz warten und nochmal */
    setTimeout(() => _drawConnections(svg, worldMap, nodeEls, container), 50);
    return;
  }

  /* Duplikate vermeiden: jede Verbindung nur einmal zeichnen */
  const drawn = new Set();

  worldMap.forEach(loc => {
    (loc.connections || []).forEach(targetId => {
      const key    = [loc.id, targetId].sort().join('� ');
      if (drawn.has(key)) return;
      drawn.add(key);

      const fromEl = nodeEls[loc.id];
      const toEl   = nodeEls[targetId];
      if (!fromEl || !toEl) return;

      const fRect = fromEl.getBoundingClientRect();
      const tRect = toEl.getBoundingClientRect();

      const x1 = fRect.left + fRect.width  / 2 - cRect.left;
      const y1 = fRect.top  + fRect.height / 2 - cRect.top;
      const x2 = tRect.left + tRect.width  / 2 - cRect.left;
      const y2 = tRect.top  + tRect.height / 2 - cRect.top;

      /* Farbe basierend auf Zugänglichkeit */
      const accessible = isLocationAccessible(targetId) || isLocationAccessible(loc.id) ||
                         WORLD_STATE.currentLocationId === loc.id ||
                         WORLD_STATE.currentLocationId === targetId;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1); line.setAttribute('y1', y1);
      line.setAttribute('x2', x2); line.setAttribute('y2', y2);
      line.setAttribute('stroke', accessible ? '#4a6080' : '#1e2535');
      line.setAttribute('stroke-width', accessible ? '2.5' : '1.5');
      if (!accessible) line.setAttribute('stroke-dasharray', '6,5');
      line.setAttribute('opacity', accessible ? '0.8' : '0.4');
      svg.appendChild(line);
    });
  });
}

/* —�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�
   REISEN
—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—� */

/** Spieler zur Ziel-Location bewegen (muss zugänglich sein). */
function travelToLocation(locationId) {
  const worldMap = _getWorldMapData();
  if (!worldMap) return;
  const loc = worldMap.find(entry => entry.id === locationId);
  if (!loc) return;
  const isCurrent = WORLD_STATE.currentLocationId === locationId;

  if (!isCurrent && !isLocationAccessible(locationId)) {
    _showStrictWorldError(_wmUi('ui.worldmap.error.travelBlocked', null, 'Travel blocked.'), _wmUi('ui.worldmap.error.targetNotConnected', null, 'Target is not directly connected or not unlocked.'));
    return;
  }
  if (loc.type === 'dungeon' && _isDungeonReentryBlocked(locationId)) {
    _showStrictWorldError(_wmUi('ui.worldmap.error.dungeonLocked', null, 'Dungeon locked.'), _wmUi('ui.worldmap.error.dungeonLockedDetails', null, 'Enter another location before starting this dungeon again.'));
    return;
  }

  _markVisitedLocation(loc);
  saveWorldProgress();

  if (loc.type === 'path') {
    if (typeof resolveWorldMapNodeEncounter === 'function' && resolveWorldMapNodeEncounter(loc)) return;
    renderWorldMap();
    return;
  }
  if (loc.type === 'dungeon') {
    enterDungeon(loc);
    return;
  }
  if (loc.type === 'hub') {
    showHubScreen(loc);
    return;
  }
  if (loc.type === 'story') {
    if (typeof startWorldMapLocationStory === 'function' && Array.isArray(loc.storyLines) && loc.storyLines.length > 0) {
      startWorldMapLocationStory(loc);
      return;
    }
    showStoryScreen(loc);
    return;
  }

  renderWorldMap();
}

/** Betritt die aktuell ausgewählte Location entsprechend ihres Typs. */
function enterCurrentLocation() {
  const worldMap = _getWorldMapData();
  if (!worldMap) return;
  const loc = worldMap.find(l => l.id === WORLD_STATE.currentLocationId);
  if (!loc) return;
  if (loc.type === 'dungeon' && _isDungeonReentryBlocked(loc.id)) {
    _showStrictWorldError(_wmUi('ui.worldmap.error.dungeonLocked', null, 'Dungeon locked.'), _wmUi('ui.worldmap.error.dungeonLockedDetails', null, 'Enter another location before starting this dungeon again.'));
    return;
  }

  switch (loc.type) {
    case 'path':
      if (typeof resolveWorldMapNodeEncounter === 'function' && resolveWorldMapNodeEncounter(loc)) break;
      renderWorldMap();
      break;
    case 'dungeon': enterDungeon(loc);    break;
    case 'hub':     showHubScreen(loc);  break;
    case 'story':
      if (typeof startWorldMapLocationStory === 'function' && Array.isArray(loc.storyLines) && loc.storyLines.length > 0) startWorldMapLocationStory(loc);
      else showStoryScreen(loc);
      break;
    default:        enterDungeon(loc);    break;
  }
}

/* —�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�
   DUNGEON
—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—� */

/**
 * Dungeon-Run für diese Location starten.
 * Verwendet das bestehende Dungeon-System (Map-Screen + Engine).
 * Setzt World-Mode-Flags, die nach dem Run ausgewertet werden.
 */
function enterDungeon(loc) {
  const cfg       = (window.DD_CUSTOM && window.DD_CUSTOM.config) ? window.DD_CUSTOM.config : {};
  const startLP   = Number(cfg['cfg-startlp']) || 4000;
  const actId     = _getLocationActId(loc);
  const actConfig = requireActData(actId, _wmUi('ui.worldmap.error.dungeonActForLocation', { name: loc.name || loc.id }, `Dungeon act for location "${loc.name || loc.id}"`));
  if (!actConfig) {
    _showStrictWorldError(_wmUi('ui.worldmap.error.dungeonStartFailed', null, 'Dungeon could not be started.'), _wmUi('ui.worldmap.error.locationAct', { name: loc.name || loc.id, actId: String(actId) }, `Location: ${loc.name || loc.id}\nAct ID: ${String(actId)}`));
    return;
  }
  const act = (actConfig.mode === 'random' && actConfig.generatorConfig && typeof generateAct === 'function')
    ? {
        ...generateAct(
          Number(actConfig.actIndex || 0),
          actConfig.actName,
          actConfig.background,
          actConfig.generatorConfig
        ),
        id: actId,
        mode: actConfig.mode,
      }
    : actConfig;

  const startNode = Array.isArray(act.nodes) ? act.nodes.find(node => node.type === 'start') : null;
  if (!startNode || !Array.isArray(startNode.next) || startNode.next.length === 0) {
    _showStrictWorldError(_wmUi('ui.worldmap.error.invalidStartNode', null, 'Dungeon act has no valid start node.'), _wmUi('ui.worldmap.error.actId', { actId }, `Act ID: ${actId}`));
    return;
  }

  /* Laufenden Dungeon-Run für diese Location fortsetzen (Browser-Refresh-Schutz) */
  if (SAVE_STATE.slot && SAVE_STATE.slot.activeRun &&
      SAVE_STATE.slot.activeRun._worldLocationId === loc.id) {
    if (typeof initRunStateFromSave === 'function') initRunStateFromSave();
    RUN_STATE._worldMode       = true;
    RUN_STATE._worldLocationId = loc.id;
    RUN_STATE._dungeonComplete = false;
    if (typeof renderMap === 'function') renderMap();
    showScreen('map');
    return;
  }

  /* Spieler-HP für diesen Dungeon (gespeichert im activeRun oder global) */
  const dungeonHP = RUN_STATE.playerHP || startLP;

  /* Deck ermitteln */
  const deckIds = (Array.isArray(RUN_STATE.deck) && RUN_STATE.deck.length > 0)
    ? RUN_STATE.deck.map(card => card.id)
    : ((SAVE_STATE.slot && SAVE_STATE.slot.baseDeck && SAVE_STATE.slot.baseDeck.length >= 15)
        ? SAVE_STATE.slot.baseDeck
        : (typeof buildStarterDeck === 'function' ? buildStarterDeck().map(c => c.id) : []));

  const startAvailable = new Set(startNode.next);

  const nodeSummary = (act.nodes || []).map(node => `${node.id}:${node.type}`).join(', ');
  const enemySummary = Array.from(new Set((act.nodes || []).flatMap(node => {
    const ids = [];
    if (node.enemyId) ids.push(node.enemyId);
    if (Array.isArray(node.enemyPool)) node.enemyPool.forEach(entry => ids.push(entry.enemyId));
    return ids;
  }).filter(Boolean))).join(', ');
  console.log('[DungeonStart]', {
    locationId: loc.id,
    locationName: loc.name,
    actId,
    nodes: nodeSummary,
    enemies: enemySummary,
  });

  /* activeRun mit World-Mode-Flags setzen */
  SAVE_STATE.slot.activeRun = {
    playerHP:          dungeonHP,
    maxHP:             startLP,
    deck:              deckIds,
    currentActIndex:   Number(act.actIndex || 0),
    currentActId:      actId,
    currentActData:    act,
    currentNodeId:     null,
    completedNodes:    new Set(),
    availableNodes:    startAvailable,
    _worldMode:        true,
    _worldLocationId:  loc.id,
  };

  /* RUN_STATE befüllen */
  RUN_STATE.active           = true;
  RUN_STATE.playerHP         = dungeonHP;
  RUN_STATE.maxHP            = startLP;
  RUN_STATE.deck             = deckIds.map(id => {
    const base = (typeof getCardById === 'function') ? getCardById(id) : null;
    return base ? cloneCard(base) : null;
  }).filter(Boolean);
  RUN_STATE.currentActIndex  = Number(act.actIndex || 0);
  RUN_STATE.currentActId     = actId;
  RUN_STATE.currentActData   = act;
  RUN_STATE.currentNodeId    = null;
  RUN_STATE.completedNodes   = new Set();
  RUN_STATE.availableNodes   = startAvailable;
  RUN_STATE._isFreeDuel      = false;
  RUN_STATE._worldMode       = true;
  RUN_STATE._worldLocationId = loc.id;
  RUN_STATE._dungeonComplete = false;

  if (typeof renderMap === 'function') renderMap();
  showScreen('map');
}

/**
 * Dungeon-Abschluss: wird von _afterReward() aufgerufen wenn im World-Mode
 * ein Dungeon vollständig abgeschlossen wurde (letzter Boss besiegt).
 */
function completeDungeonLocation() {
  const locationId = RUN_STATE._worldLocationId;

  /* World-Mode-Flags zurücksetzen */
  RUN_STATE._worldMode       = false;
  RUN_STATE._dungeonComplete = false;
  RUN_STATE._worldLocationId = null;
  RUN_STATE.active           = false;

  /* Location als abgeschlossen markieren */
  if (locationId) {
    WORLD_STATE.completedLocations.add(locationId);
    WORLD_STATE.currentLocationId = locationId;
    WORLD_STATE.lastVisitedNodeId = locationId;
    WORLD_STATE.lastNodeType = 'dungeon';
    WORLD_STATE.lastDungeonId = locationId;
  }

  /* Dungeon-Run aus Save löschen */
  if (SAVE_STATE.slot) {
    SAVE_STATE.slot.activeRun = null;
  }

  saveWorldProgress();

  /* Zurück zur Weltenkarte */
  renderWorldMap();
  showScreen('worldmap');

  /* Kurz danach: neu freigeschaltete Orte anzeigen */
  setTimeout(() => {
    const worldMap = _getWorldMapData();
    if (!worldMap) return;
    const newlyUnlocked = worldMap.filter(loc =>
      !WORLD_STATE.visitedLocations.has(loc.id) &&
      isLocationUnlocked(loc.id)
    );
    if (newlyUnlocked.length > 0) {
      _showNewLocationNotification(newlyUnlocked);
    }
  }, 700);
}

/** Overlay: neue Orte wurden freigeschaltet. */
function _showNewLocationNotification(locations) {
  const overlay = document.createElement('div');
  overlay.className = 'wm-unlock-overlay';
  overlay.innerHTML = `
    <div class="wm-unlock-box">
      <div class="wm-unlock-title">${_wmUi('ui.worldmap.newLocationsUnlocked', null, '&#128506; New locations unlocked!')}</div>
      <div class="wm-unlock-list">
        ${locations.map(l => `<div class="wm-unlock-item">
          ${({ dungeon:'&#9876;', hub:'&#127957;', story:'&#128220;', path:'&#10022;' }[l.type] || '&bull;')} ${l.name}
        </div>`).join('')}
      </div>
      <button class="btn-success wm-unlock-close">${_wmUi('ui.worldmap.continueExploring', null, 'Continue exploring &#9654;')}</button>
    </div>
  `;
  overlay.querySelector('.wm-unlock-close').addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);

  if (window.gsap) {
    gsap.fromTo(overlay.querySelector('.wm-unlock-box'),
      { scale: 0.6, opacity: 0, y: 30 },
      { scale: 1,   opacity: 1, y: 0, duration: 0.45, ease: 'back.out(1.7)' }
    );
  }
}

/* —�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�
   HUB SCREEN
—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—� */

/**
 * Hub-Screen anzeigen.
 * Hubs bieten verschiedene Optionen: Rasten, Shop, Deck-Editor, Speichern.
 * Welche Optionen verfügbar sind, wird über loc.hubFeatures gesteuert.
 */
function showHubScreen(loc) {
  WORLD_STATE.visitedLocations.add(loc.id);
  saveWorldProgress();
  if (typeof setMusicPlaylist === 'function') setMusicPlaylist(MUSIC_PLAYLISTS.story);

  const screen = document.getElementById('screen-hub');
  if (!screen) return;

  const features = loc.hubFeatures || ['rest', 'shop', 'deck', 'save'];
  const maxHP    = RUN_STATE.maxHP || 4000;
  const curHP    = RUN_STATE.playerHP || maxHP;
  const dimensionsSeelen = typeof getDimensionsSeelen === 'function' ? getDimensionsSeelen() : 0;

  screen.innerHTML = `
    <div class="hub-container">
      <div class="hub-header">
        <div class="hub-name">&#127957; ${loc.name}</div>
        ${loc.description ? `<div class="hub-desc">${loc.description}</div>` : ''}
        <div class="hub-stats">
          <span>❤ ${curHP} / ${maxHP}</span>
          <span>✦ ${dimensionsSeelen} DS</span>
        </div>
      </div>

      <div class="hub-options" id="hub-options">
        ${features.includes('rest') ? `
          <button class="hub-btn hub-btn-rest" id="btn-hub-rest" ${curHP >= maxHP ? 'disabled' : ''}>
            <div class="hub-btn-icon">&#10084;</div>
            <div class="hub-btn-label">${_wmUi('ui.hub.rest', null, 'Rest')}</div>
            <div class="hub-btn-sub">${curHP >= maxHP ? _wmUi('ui.hub.hpFull', null, 'HP already full') : _wmUi('ui.hub.restoreThirty', null, 'Restore 30% HP')}</div>
          </button>` : ''}

        ${features.includes('shop') ? `
          <button class="hub-btn hub-btn-shop" id="btn-hub-shop">
            <div class="hub-btn-icon">&#128722;</div>
            <div class="hub-btn-label">${_wmUi('ui.hub.shop', null, 'Shop')}</div>
            <div class="hub-btn-sub">${_wmUi('ui.hub.shopSub', null, 'Buy cards with DS')}</div>
          </button>` : ''}

        ${features.includes('deck') ? `
          <button class="hub-btn hub-btn-deck" id="btn-hub-deck">
            <div class="hub-btn-icon">&#127183;</div>
            <div class="hub-btn-label">${_wmUi('ui.hub.deck', null, 'Manage deck')}</div>
            <div class="hub-btn-sub">${_wmUi('ui.hub.deckSub', null, 'Add or remove cards')}</div>
          </button>` : ''}

        ${features.includes('save') ? `
          <button class="hub-btn hub-btn-save" id="btn-hub-save">
            <div class="hub-btn-icon">&#128190;</div>
            <div class="hub-btn-label">${_wmUi('ui.hub.save', null, 'Save')}</div>
            <div class="hub-btn-sub">${_wmUi('ui.hub.saveSub', null, 'Store progress')}</div>
          </button>` : ''}
      </div>

      <div class="hub-footer">
        <button class="btn-secondary hub-back-btn" id="btn-hub-back">${_wmUi('ui.hub.backToWorldMap', null, '&larr; Back to world map')}</button>
      </div>
    </div>
  `;

  /* Event-Listener */
  document.getElementById('btn-hub-rest')?.addEventListener('click', () => _hubRest(screen));
  document.getElementById('btn-hub-shop')?.addEventListener('click', () => {
    if (typeof showMainMenuShop === 'function') showMainMenuShop('hub');
  });
  document.getElementById('btn-hub-deck')?.addEventListener('click', () => {
    if (typeof renderDeckEditor === 'function') {
      renderDeckEditor();
      showScreen('deckeditor');
    }
  });
  document.getElementById('btn-hub-save')?.addEventListener('click', () => {
    commitHubSave();
  });
  document.getElementById('btn-hub-back')?.addEventListener('click', () => {
    renderWorldMap();
    showScreen('worldmap');
  });

  showScreen('hub');
}

/** Hub: Spieler rastet und stellt LP wieder her. */
function _hubRest(screen) {
  const maxHP     = RUN_STATE.maxHP || 4000;
  const oldHP     = RUN_STATE.playerHP || maxHP;
  const healAmount = Math.floor(maxHP * 0.3);
  RUN_STATE.playerHP = Math.min(maxHP, oldHP + healAmount);
  const gained     = RUN_STATE.playerHP - oldHP;

  /* In Welt-Fortschritt persistieren */
  if (SAVE_STATE.slot) {
    if (!SAVE_STATE.slot.worldProgress) SAVE_STATE.slot.worldProgress = {};
    SAVE_STATE.slot.worldProgress.playerHP = RUN_STATE.playerHP;
  }

  /* Visuelles Feedback */
  const btn = screen ? screen.querySelector('#btn-hub-rest') : null;
  if (btn) {
    btn.disabled = true;
    btn.querySelector('.hub-btn-sub').textContent = _wmUi('ui.hub.restResult', { gained, current: RUN_STATE.playerHP, max: maxHP }, `+${gained} HP -> now ${RUN_STATE.playerHP} / ${maxHP}`);
    btn.querySelector('.hub-btn-icon').textContent = _wmUi('ui.common.okShort', null, 'OK');
  }
  /* HP-Anzeige aktualisieren */
  const statsEl = screen ? screen.querySelector('.hub-stats') : null;
  if (statsEl) statsEl.querySelector('span').textContent = `❤ ${RUN_STATE.playerHP} / ${maxHP}`;
}

/* —�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�
   STORY SCREEN
—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—�—� */

/**
 * Story-Screen anzeigen.
 * Zeigt einen Dialog mit Textzeilen (storyLines[]).
 * Jede Zeile kann: speaker, portrait, text enthalten.
 */
function showStoryScreen(loc) {
  WORLD_STATE.visitedLocations.add(loc.id);
  _currentStoryLoc  = loc;
  _currentStoryLine = _storyProgress[loc.id] || 0;
  if (typeof setMusicPlaylist === 'function') setMusicPlaylist(MUSIC_PLAYLISTS.story);

  saveWorldProgress();
  _renderStoryLine();
  showScreen('story');
}

/** Rendert die aktuelle Story-Zeile in den Story-Screen. */
function _renderStoryLine() {
  const screen = document.getElementById('screen-story');
  if (!screen || !_currentStoryLoc) return;

  const lines     = _currentStoryLoc.storyLines || [];
  const totalLines = lines.length;
  const line      = lines[_currentStoryLine] || null;
  const isLast    = _currentStoryLine >= totalLines - 1;

  screen.innerHTML = `
    <div class="story-container">
      <div class="story-header">
        <div class="story-location-name">${_currentStoryLoc.name}</div>
        <div class="story-progress">${totalLines > 0 ? `${_currentStoryLine + 1} / ${totalLines}` : ''}</div>
      </div>

      <div class="story-scene">
        ${line && line.portrait ? `
          <div class="story-portrait-wrap">
            <img src="${line.portrait}" class="story-portrait" alt="${line.speaker || ''}">
          </div>` : ''}
        <div class="story-dialog-box">
          ${line && line.speaker ? `<div class="story-speaker">${line.speaker}</div>` : ''}
          <div class="story-text" id="story-text-content">
            ${line ? line.text || '...' : `<em style="color:#444">${_wmUi('ui.story.none', null, 'No story lines available.')}</em>`}
          </div>
        </div>
      </div>

      <div class="story-footer">
        <button class="btn-secondary story-skip-btn" id="btn-story-skip">${_wmUi('ui.story.skip', null, '&olarr; Skip')}</button>
        <button class="btn-success story-next-btn" id="btn-story-next">
          ${isLast ? _wmUi('ui.story.finish', null, '&#10003; Finish') : _wmUi('ui.story.next', null, 'Next &#9654;')}
        </button>
      </div>
    </div>
  `;

  document.getElementById('btn-story-next')?.addEventListener('click', advanceStory);
  document.getElementById('btn-story-skip')?.addEventListener('click', _finishStory);

  /* Text-Einblend-Animation */
  const textEl = document.getElementById('story-text-content');
  if (textEl && window.gsap) {
    gsap.fromTo(textEl,
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out', delay: 0.1 }
    );
  }
}

/** Nächste Story-Zeile anzeigen oder Story abschlie�xen. */
function advanceStory() {
  if (!_currentStoryLoc) return;
  const lines = _currentStoryLoc.storyLines || [];

  if (_currentStoryLine < lines.length - 1) {
    _currentStoryLine++;
    _storyProgress[_currentStoryLoc.id] = _currentStoryLine;
    _renderStoryLine();
  } else {
    _finishStory();
  }
}

/** Story abschlie�xen: als completed markieren, zurück zur Weltenkarte. */
function _finishStory() {
  if (_currentStoryLoc) {
    WORLD_STATE.completedLocations.add(_currentStoryLoc.id);
    _storyProgress[_currentStoryLoc.id] = 0;  // Reset für Wiederholung
    saveWorldProgress();
  }
  _currentStoryLoc  = null;
  _currentStoryLine = 0;

  renderWorldMap();
  showScreen('worldmap');
}



