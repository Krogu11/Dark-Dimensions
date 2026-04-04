/* ============================================================
   main.js �? Einstiegspunkt & Event-Binding
   ============================================================ */

/* �?��?� Screens-Array (muss mit index.html übereinstimmen) �?��?� */
// �Sberschreibt das Array aus screens.js um neue Screens einzubinden
// (wird nach screens.js geladen, daher direkte Zuweisung)
if (typeof SCREENS !== 'undefined') {
  SCREENS.push('mainmenu', 'freeduel', 'deckeditor', 'worldmap', 'hub', 'story');
}

function showHowTo() {
  alert(t('ui.help.message'));
}

/* �?��?� Pause-Menü (global, damit andere Module zugreifen können) �?��?� */
function showPauseMenu() {
  const overlay = document.getElementById('overlay-pause');
  if (overlay) overlay.style.display = 'flex';
}
function hidePauseMenu() {
  const overlay = document.getElementById('overlay-pause');
  if (overlay) overlay.style.display = 'none';
}

/* �?��?� Battle starten �?��?� */
function startBattle(enemyId) {
  const enemy = getEnemy(enemyId);
  if (!enemy) { console.error('Unbekannter Gegner:', enemyId); return; }

  if (typeof setMusicPlaylist === 'function') setMusicPlaylist(MUSIC_PLAYLISTS.campaign);
  initBattleState(enemy);
  showScreen('battle');
  renderBattle();

  /* Initiale Draw Phase anzeigen, dann automatisch in Main Phase wechseln.
     (Die Startkarten wurden bereits in initBattleState gezogen.) */
  animatePhaseAnnounce('DRAW PHASE');
  setTimeout(() => { if (!BATTLE_STATE.gameOver) nextPhase(); }, 750);
}

/* �?��?� DOMContentLoaded �?��?� */
document.addEventListener('DOMContentLoaded', () => {

  /* �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"�
     TITLE SCREEN EVENTS
  �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"� */
  // Slots werden dynamisch via renderTitleScreen() gerendert

  /* �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"�
     HAUPTMEN�S EVENTS
  �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"� */

  /* Kampagne starten / fortsetzen */
  if (typeof applyI18nToDocument === 'function') applyI18nToDocument(document);

  document.getElementById('btn-mainmenu-campaign')?.addEventListener('click', () => {
    if (!SAVE_STATE.slot) return;
    if (typeof window.logDDRuntimeDiagnostics === 'function') {
      window.logDDRuntimeDiagnostics('campaign-button');
    }
    const hasWorldMap = window.DD_CUSTOM && Array.isArray(window.DD_CUSTOM.worldMap) && window.DD_CUSTOM.worldMap.length > 0;
    if (!hasWorldMap || typeof initWorldState !== 'function') {
      strictDataError(t('ui.errors.noWorldMapCampaign'));
      return;
    }
    const saved = SAVE_STATE.slot.worldProgress;
    if (saved && saved.playerHP) RUN_STATE.playerHP = saved.playerHP;
    else { const cfg = (window.DD_CUSTOM?.config) || {}; RUN_STATE.playerHP = Number(cfg['cfg-startlp']) || 4000; }
    RUN_STATE.maxHP = RUN_STATE.playerHP;
    initWorldState();
  });

  /* Freies Duell */
  document.getElementById('btn-mainmenu-freeduel')?.addEventListener('click', () => {
    renderFreeDuelScreen();
    showScreen('freeduel');
  });

  /* Hauptmenü-Shop (permanent verfügbar) */
  document.getElementById('btn-mainmenu-shop')?.addEventListener('click', () => {
    if (typeof showMainMenuShop === 'function') showMainMenuShop();
  });

  /* Kartenbuch / Deck-Editor */
  document.getElementById('btn-mainmenu-deckeditor')?.addEventListener('click', () => {
    renderDeckEditor();
    showScreen('deckeditor');
  });

  /* Zurück zur Slot-Auswahl */
  document.getElementById('btn-mainmenu-back')?.addEventListener('click', () => {
    SAVE_STATE.activeSlotId = null;
    SAVE_STATE.slot = null;
    renderTitleScreen();
    showScreen('title');
  });

  /* �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"�
     FREIES DUELL EVENTS
  �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"� */
  document.getElementById('btn-freeduel-back')?.addEventListener('click', () => {
    showScreen('mainmenu');
    renderMainMenu();
  });

  /* �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"�
     DECK-EDITOR EVENTS
  �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"� */
  document.getElementById('btn-deckeditor-back')?.addEventListener('click', () => {
    showScreen('mainmenu');
    renderMainMenu();
  });

  /* �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"�
     BATTLE EVENTS
  �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"� */

  /* Phasen-Button */
  document.getElementById('btn-next-phase')?.addEventListener('click', nextPhase);

  /* Direktangriff */
  document.getElementById('btn-direct-attack')?.addEventListener('click', executeDirectAttack);

  /* Fusion */
  document.getElementById('btn-fusion')?.addEventListener('click', tryFusion);

  /* Deck-Ansicht öffnen */
  document.getElementById('btn-view-deck')?.addEventListener('click', showDeckViewer);

  /* Mode-Toggle (Rechtsklick auf Karten im eigenen Feld) */
  document.getElementById('player-field')?.addEventListener('contextmenu', e => {
    e.preventDefault();
    const slot = e.target.closest('.slot');
    if (!slot) return;
    const field = document.getElementById('player-field');
    const idx   = Array.from(field.children).indexOf(slot);
    if (idx >= 0) toggleCardMode(idx);
  });

  /* �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"�
     REWARD / SHOP / REST
  �"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"��"� */
  document.getElementById('btn-skip-reward')?.addEventListener('click', skipReward);
  document.getElementById('btn-leave-shop')?.addEventListener('click', leaveShop);
  document.getElementById('btn-rest-heal')?.addEventListener('click', restHeal);
  document.getElementById('btn-rest-skip')?.addEventListener('click', restSkip);
  document.getElementById('btn-close-deck')?.addEventListener('click', hideDeckViewer);

  /* Map: Deck-Button */
  document.getElementById('btn-map-deck')?.addEventListener('click', showDeckViewer);

  /* Pause-Menü */
  function abandonRun() {
    if (!confirm(t('ui.pause.confirmAbandon'))) return;
    hidePauseMenu();
    if (typeof discardRun === 'function') discardRun();
    if (typeof restoreLastSavedProgressState === 'function') restoreLastSavedProgressState();
    else if (typeof reloadCurrentSlotFromDisk === 'function') reloadCurrentSlotFromDisk();
    BATTLE_STATE.active = false;
    BATTLE_STATE.gameOver = true;
    RUN_STATE.active = false;
    RUN_STATE._worldMode = false;
    RUN_STATE._dungeonComplete = false;
    setTimeout(() => showScreen('gameover'), 150);
  }

  document.getElementById('btn-pause-battle')?.addEventListener('click', showPauseMenu);
  document.getElementById('btn-pause-map')?.addEventListener('click', showPauseMenu);
  document.getElementById('btn-pause-resume')?.addEventListener('click', hidePauseMenu);
  document.getElementById('btn-pause-abandon')?.addEventListener('click', abandonRun);

  /* ESC-Taste öffnet/schließt Pause-Overlay */
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const overlay = document.getElementById('overlay-pause');
    const isVisible = overlay && overlay.style.display !== 'none';
    const onBattle   = document.getElementById('screen-battle')?.classList.contains('active');
    const onMap      = document.getElementById('screen-map')?.classList.contains('active');
    const onWorldmap = document.getElementById('screen-worldmap')?.classList.contains('active');
    const onHub      = document.getElementById('screen-hub')?.classList.contains('active');
    const onStory    = document.getElementById('screen-story')?.classList.contains('active');
    if (isVisible) {
      hidePauseMenu();
    } else if (onBattle || onMap || onWorldmap) {
      showPauseMenu();
    } else if (onHub) {
      if (typeof renderWorldMap === 'function') { renderWorldMap(); showScreen('worldmap'); }
    } else if (onStory) {
      if (typeof advanceStory === 'function') advanceStory();
    }
  });

  /* Game Over / Victory */
  document.getElementById('btn-gameover-restart')?.addEventListener('click', () => {
    if (typeof renderTitleScreen === 'function') renderTitleScreen();
    showScreen('title');
  });

  document.getElementById('btn-victory-restart')?.addEventListener('click', () => {
    if (SAVE_STATE.slot) {
      renderMainMenu();
      showScreen('mainmenu');
    } else {
      showScreen('title');
      renderTitleScreen();
    }
  });

  /* Start */
  renderTitleScreen();
  showScreen('title');
});

window.addEventListener('dd-language-changed', () => {
  if (typeof renderTitleScreen === 'function' && document.getElementById('screen-title')?.classList.contains('active')) {
    renderTitleScreen();
  }
  if (typeof renderMainMenu === 'function' && document.getElementById('screen-mainmenu')?.classList.contains('active')) {
    renderMainMenu();
  }
  if (typeof renderFreeDuelScreen === 'function' && document.getElementById('screen-freeduel')?.classList.contains('active')) {
    renderFreeDuelScreen();
  }
  if (typeof renderDeckEditor === 'function' && document.getElementById('screen-deckeditor')?.classList.contains('active')) {
    renderDeckEditor();
  }
  if (typeof renderWorldMap === 'function' && document.getElementById('screen-worldmap')?.classList.contains('active')) {
    renderWorldMap();
  }
  if (typeof showHubScreen === 'function' && document.getElementById('screen-hub')?.classList.contains('active')) {
    const worldMap = typeof _getWorldMapData === 'function' ? _getWorldMapData() : [];
    const currentLoc = Array.isArray(worldMap) ? worldMap.find(loc => loc.id === WORLD_STATE.currentLocationId) : null;
    if (currentLoc) showHubScreen(currentLoc);
  }
  if (typeof showStoryScreen === 'function' && document.getElementById('screen-story')?.classList.contains('active')) {
    showStoryScreen();
  }
  if (typeof renderBattle === 'function' && document.getElementById('screen-battle')?.classList.contains('active')) {
    renderBattle();
  }
  if (typeof renderMap === 'function' && document.getElementById('screen-map')?.classList.contains('active')) {
    renderMap();
  }
});
