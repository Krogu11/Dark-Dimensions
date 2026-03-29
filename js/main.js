/* ============================================================
   main.js — Einstiegspunkt & Event-Binding
   ============================================================ */

/* ── Battle starten ── */
function startBattle(enemyId) {
  const enemy = getEnemy(enemyId);
  if (!enemy) { console.error('Unbekannter Gegner:', enemyId); return; }

  initBattleState(enemy);
  renderBattle();
  showScreen('battle');
}

/* ── DOMContentLoaded ── */
document.addEventListener('DOMContentLoaded', () => {

  /* Title Screen */
  document.getElementById('btn-new-run')?.addEventListener('click', () => {
    initRunState();
    renderMap();
    showScreen('map');
  });

  /* Battle: Phasen-Button */
  document.getElementById('btn-next-phase')?.addEventListener('click', nextPhase);

  /* Battle: Direktangriff */
  document.getElementById('btn-direct-attack')?.addEventListener('click', executeDirectAttack);

  /* Battle: Fusion */
  document.getElementById('btn-fusion')?.addEventListener('click', tryFusion);

  /* Battle: Flucht (zur Karte → kostet HP) */
  document.getElementById('btn-flee')?.addEventListener('click', () => {
    if (!BATTLE_STATE.active || BATTLE_STATE.gameOver) return;
    const cost = Math.floor(RUN_STATE.maxHP * 0.15);
    RUN_STATE.playerHP = Math.max(1, RUN_STATE.playerHP - cost);
    BATTLE_STATE.active = false;
    showScreen('map');
    renderMap();
  });

  /* Battle: Deck-Ansicht öffnen */
  document.getElementById('btn-view-deck')?.addEventListener('click', showDeckViewer);

  /* Battle: Mode-Toggle (Klick auf Karten im eigenen Feld) */
  document.getElementById('player-field')?.addEventListener('contextmenu', e => {
    e.preventDefault();
    const slot = e.target.closest('.slot');
    if (!slot) return;
    const field = document.getElementById('player-field');
    const idx   = Array.from(field.children).indexOf(slot);
    if (idx >= 0) toggleCardMode(idx);
  });

  /* Reward: Skip */
  document.getElementById('btn-skip-reward')?.addEventListener('click', skipReward);

  /* Shop: Verlassen */
  document.getElementById('btn-leave-shop')?.addEventListener('click', leaveShop);

  /* Rest: Heilen */
  document.getElementById('btn-rest-heal')?.addEventListener('click', restHeal);

  /* Rest: Karte entfernen */
  document.getElementById('btn-rest-remove')?.addEventListener('click', restRemoveCard);

  /* Remove-Overlay schließen */
  document.getElementById('btn-close-remove')?.addEventListener('click', closeRemoveOverlay);

  /* Deck-Viewer schließen */
  document.getElementById('btn-close-deck')?.addEventListener('click', hideDeckViewer);

  /* Game Over: Neuer Run */
  document.getElementById('btn-gameover-restart')?.addEventListener('click', () => {
    showScreen('title');
  });

  /* Victory: Neuer Run */
  document.getElementById('btn-victory-restart')?.addEventListener('click', () => {
    showScreen('title');
  });

  /* Map: Deck-Button */
  document.getElementById('btn-map-deck')?.addEventListener('click', showDeckViewer);

  /* Startscreen anzeigen */
  showScreen('title');
});
