/* ============================================================
   core/ranking.js — Kampf-Tracking-Hooks
   ============================================================
   Das Rang-System wurde entfernt.
   Diese Datei enthält nur noch leichtgewichtige Tracking-Hooks,
   die von engine.js aufgerufen werden, um Kampfstatistiken
   für den Debug-Export zu erfassen.
   ============================================================ */

/* ──────────────────────────────────────────────────
   TRACKING-HOOKS  (aufgerufen aus engine.js)
   Schreiben in BATTLE_STATE.rankingStats
────────────────────────────────────────────────── */
function _trackDamage(amount) {
  if (!BATTLE_STATE || !BATTLE_STATE.rankingStats) return;
  const rs = BATTLE_STATE.rankingStats;
  if (amount > rs.maxSingleDamage) rs.maxSingleDamage = amount;
  rs.totalDamageDealt += amount;
}

function _trackEnemyKill() {
  if (!BATTLE_STATE || !BATTLE_STATE.rankingStats) return;
  BATTLE_STATE.rankingStats.enemyMonstersDestroyed++;
}

function _trackSpellTrap() {
  if (!BATTLE_STATE || !BATTLE_STATE.rankingStats) return;
  BATTLE_STATE.rankingStats.spellsTrapsPlayed++;
}
