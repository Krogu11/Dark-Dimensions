/* ============================================================
   core/ranking.js — Battle-Ranking-System
   ============================================================
   Berechnet nach einem Sieg:
     type: 'POW' (aggressiv) | 'TEC' (taktisch)
     rank: 'S' | 'A' | 'B' | 'C' | 'D'

   POW-Score  → hoher Schaden, viele Kills, wenige Züge
   TEC-Score  → hohe LP übrig, effiziente Kills, sauberes Spiel
   Spells/Traps beeinflussen BEIDE Typen leicht negativ
   ============================================================ */

/**
 * Berechnet Rank + Type nach dem Kampf.
 * @param {Object} stats  — BATTLE_STATE.rankingStats
 * @param {number} playerLP  — verbliebene Spieler-LP
 * @param {number} maxLP     — max. LP des Spielers
 * @returns {{ rank, type, score, powScore, tecScore, breakdown }}
 */
function calculateBattleRank(stats, playerLP, maxLP) {
  const s = stats;

  /* ── POW-Score (aggressiver Spielstil) ──────────────── */
  // Hoher Einzelschaden = raw power
  const dmgPts    = Math.min(Math.floor(s.maxSingleDamage / 8), 600);
  // Kills = offensive Präsenz
  const killPts   = s.enemyMonstersDestroyed * 180;
  // Schnelle Siege = mehr Punkte
  const speedPts  = Math.max(0, 1800 - s.turnsElapsed * 90);
  const powScore  = dmgPts + killPts + speedPts;

  /* ── TEC-Score (taktischer Spielstil) ───────────────── */
  // Hohe LP = kein Schaden genommen
  const lpRatio   = maxLP > 0 ? playerLP / maxLP : 0;
  const lpPts     = Math.floor(lpRatio * 900);
  // Kills sind weniger wert, aber zählen noch
  const killPts2  = s.enemyMonstersDestroyed * 120;
  // Gesamtschaden (Effizienz)
  const dmgTec    = Math.min(Math.floor(s.totalDamageDealt / 20), 300);
  const tecScore  = lpPts + killPts2 + dmgTec;

  /* ── Globale Strafe für Spell/Trap-Spam ─────────────── */
  const spellPenalty = s.spellsTrapsPlayed * 40;

  const finalPOW  = Math.max(0, powScore - spellPenalty);
  const finalTEC  = Math.max(0, tecScore  - spellPenalty);

  /* ── Typ bestimmen ──────────────────────────────────── */
  const type  = finalPOW >= finalTEC ? 'POW' : 'TEC';
  const score = Math.max(finalPOW, finalTEC);

  /* ── Rang bestimmen ─────────────────────────────────── */
  let rank;
  if      (score >= 2200) rank = 'S';
  else if (score >= 1700) rank = 'A';
  else if (score >= 1100) rank = 'B';
  else if (score >= 600)  rank = 'C';
  else                    rank = 'D';

  return {
    rank,
    type,
    score,
    powScore: finalPOW,
    tecScore: finalTEC,
    breakdown: { dmgPts, killPts, speedPts, lpPts, killPts2, dmgTec, spellPenalty }
  };
}

/**
 * Gibt den Drop-Key für eine Rank+Type-Kombination zurück.
 * TEC hat immer einen gemeinsamen Pool (unabhängig vom Rang).
 * POW ist nach Rang gestuft (S_POW > A_POW > ... > D_POW).
 */
function getRankDropKey(rank, type) {
  if (type === 'TEC') return 'TEC';
  return `${rank}_POW`;
}

/**
 * Gibt eine lesbare Rang-Beschreibung zurück (für das UI).
 */
function getRankLabel(rank, type) {
  const rankLabels = { S:'S-Rang', A:'A-Rang', B:'B-Rang', C:'C-Rang', D:'D-Rang' };
  const typeLabels = { POW:'⚔ Kraft', TEC:'🧠 Taktik' };
  return `${rankLabels[rank]} · ${typeLabels[type]}`;
}

function getRankColor(rank) {
  return { S:'#ffd700', A:'#c0a0ff', B:'#60c0ff', C:'#80ff80', D:'#999' }[rank] || '#fff';
}

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
