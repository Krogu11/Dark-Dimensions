/* ============================================================
   core/fieldcards.js — Globales Spielfeld-System
   ============================================================
   Spielfeldkarten sind GLOBAL — kein Besitzer, kein "isPlayer".
   Alle Effekte wirken auf BEIDE Seiten gleichzeitig.

   fieldEffects Format:
   ─────────────────────────────────────────────────────
   Passive Stat-Effekte (trigger:'passive'):
     { type:'statBoost'|'debuff', target:'all'|'race', stat:'atk'|'def',
       race:'Kobold'|..., amount:250, trigger:'passive' }
     → Buff/Malus auf ATK oder DEF aller passenden Monster BEIDER Seiten.
       Wird beim Aktivieren angelegt, beim Ersetzen revertiert.

   LP-Effekte pro Runde (trigger:'each_turn'):
     { type:'heal'|'burn'|'drain', target:'both'|'player'|'enemy',
       amount:300, trigger:'each_turn' }
     → Wird am Ende jeder Runde (End Phase) auf die LP beider Seiten angewendet.
       drain: Gegner verliert LP, Spieler gewinnt LP.
   ============================================================ */


/* ─────────────────────────────────────────────────────
   activateFieldCard(fc, silent)
   → Setzt das neue globale Spielfeld. Vorheriges Spielfeld
     wird deaktiviert (Stat-Effekte revertiert).
     Danach Stat-Effekte des neuen Feldes auf alle aktuellen Monster anwenden.
   silent=true → keine Battle-Log-Ausgabe (für Kampfstart).
───────────────────────────────────────────────────── */
function activateFieldCard(fc, silent) {
  const bs = BATTLE_STATE;

  // Vorheriges Spielfeld entfernen
  if (bs.activeFieldCard) {
    _removeFieldStatEffects();
    if (!silent) {
      battleLog(`🗺 Spielfeld ersetzt: ${bs.activeFieldCard.name} → ${fc.name}`, 'spell');
    }
    bs.playerGrave.push(bs.activeFieldCard);
  } else if (!silent) {
    battleLog(`🗺 Spielfeld aktiviert: ${fc.name}`, 'spell');
  }

  // Neues Spielfeld setzen (keine Owner-Information)
  bs.activeFieldCard = Object.assign({}, fc);

  // Stat-Effekte sofort auf alle Monster BEIDER Seiten anwenden
  _applyFieldStatEffects();

  // Hintergrund + Indikator aktualisieren
  if (typeof applyBattleBackground === 'function') applyBattleBackground();
  if (typeof renderFieldIndicator  === 'function') renderFieldIndicator();
}


/* ─────────────────────────────────────────────────────
   playFieldCard(handIndex)
   → Spieler spielt Spielfeldkarte aus der Hand (Main Phase).
───────────────────────────────────────────────────── */
function playFieldCard(handIndex) {
  const bs   = BATTLE_STATE;
  const card = bs.hand[handIndex];
  if (!card || card.type !== 'field') return;

  if (getCurrentPhase() !== 'Main') {
    battleLog('⚠ Spielfeldkarten nur in der Main Phase spielbar!', 'warn');
    return;
  }

  bs.hand.splice(handIndex, 1);
  bs.selectedHandIndex = null;
  bs.rankingStats.spellsTrapsPlayed++;

  activateFieldCard(card, false);
  renderBattle();
}


/* ─────────────────────────────────────────────────────
   playEnemyFieldCard(handIndex)
   → KI spielt Spielfeldkarte aus der Gegner-Hand.
───────────────────────────────────────────────────── */
function playEnemyFieldCard(handIndex) {
  const bs   = BATTLE_STATE;
  const card = bs.enemyHand[handIndex];
  if (!card || card.type !== 'field') return;

  bs.enemyHand.splice(handIndex, 1);
  activateFieldCard(card, false);
  renderBattle();
}


/* ─────────────────────────────────────────────────────
   applyFieldCardToNewMonster(monster)
   → Wendet passive Stat-Effekte des aktiven Spielfeldes
     auf ein neu beschworenes Monster an (beide Seiten).
───────────────────────────────────────────────────── */
function applyFieldCardToNewMonster(monster) {
  if (!monster) return;
  const fc = BATTLE_STATE.activeFieldCard;
  if (!fc || !fc.fieldEffects) return;

  fc.fieldEffects.forEach(fx => {
    if (fx.trigger === 'passive') _applyFxToMonster(monster, fx);
  });
}


/* ─────────────────────────────────────────────────────
   applyFieldCardPerTurnEffects()
   → Wird am Ende jeder Runde aufgerufen (End Phase).
     Wendet LP-Effekte (heal/burn/drain) auf beide Spieler an.
───────────────────────────────────────────────────── */
function applyFieldCardPerTurnEffects() {
  const bs = BATTLE_STATE;
  const fc = bs.activeFieldCard;
  if (!fc || !fc.fieldEffects) return;

  fc.fieldEffects.forEach(fx => {
    if (fx.trigger === 'each_turn') _applyLPEffect(fc, fx);
  });
}


/* ─────────────────────────────────────────────────────
   getFieldCardDescription(fc)
   → Menschenlesbare Beschreibung aller Effekte.
───────────────────────────────────────────────────── */
function getFieldCardDescription(fc) {
  if (!fc || !fc.fieldEffects) return '';
  const lines = fc.fieldEffects.map(fx => {
    const tgt  = fx.target === 'race' && fx.race ? `(${fx.race})` : 'Alle';
    const each = fx.trigger === 'each_turn' ? '/Runde' : '';
    switch (fx.type) {
      case 'statBoost': return `⬆ ${tgt} +${fx.amount} ${(fx.stat||'atk').toUpperCase()}`;
      case 'debuff':    return `⬇ ${tgt} −${fx.amount} ${(fx.stat||'atk').toUpperCase()}`;
      case 'heal':      return `💚 Beide +${fx.amount} LP${each}`;
      case 'burn':      return `🔥 Beide −${fx.amount} LP${each}`;
      case 'drain':     return `🩸 Drain ${fx.amount} LP${each}`;
      default:          return `${fx.type} ${fx.amount||''}`;
    }
  });
  return lines.join(' • ');
}


/* ══════════════════════════════════════════════════
   INTERNE HILFSFUNKTIONEN
══════════════════════════════════════════════════ */

/** Wendet alle passiven Stat-Effekte des aktiven Feldes auf alle Monster an. */
function _applyFieldStatEffects() {
  const fc = BATTLE_STATE.activeFieldCard;
  if (!fc || !fc.fieldEffects) return;
  const allMonsters = _allFieldMonsters();
  fc.fieldEffects.forEach(fx => {
    if (fx.trigger === 'passive') allMonsters.forEach(m => _applyFxToMonster(m, fx));
  });
}

/** Revertiert alle Stat-Effekte des aktuell aktiven Feldes von allen Monstern. */
function _removeFieldStatEffects() {
  _allFieldMonsters().forEach(m => {
    if (m._fieldATK) { m.atk = Math.max(0, m.atk - m._fieldATK); delete m._fieldATK; }
    if (m._fieldDEF) { m.def = Math.max(0, m.def - m._fieldDEF); delete m._fieldDEF; }
  });
}

/** Alle Monster auf BEIDEN Feldseiten (ohne null-Slots). */
function _allFieldMonsters() {
  const bs = BATTLE_STATE;
  return [...(bs.playerField || []), ...(bs.enemyField || [])].filter(Boolean);
}

/** Prüft ob ein Monster von einem Effekt betroffen ist. */
function _fxMatchesMonster(monster, fx) {
  if (fx.target === 'race') return monster.race === fx.race;
  return true; // 'all' oder anderer Wert → trifft alle
}

/** Wendet einen passiven Stat-Effekt auf ein einzelnes Monster an. */
function _applyFxToMonster(monster, fx) {
  if (!_fxMatchesMonster(monster, fx)) return;

  const raw = fx.amount || 0;
  const amt = fx.type === 'debuff' ? -raw : raw;  // debuff = negativ

  if (fx.stat === 'atk' || !fx.stat) {
    monster.atk = Math.max(0, monster.atk + amt);
    monster._fieldATK = (monster._fieldATK || 0) + amt;
  } else if (fx.stat === 'def') {
    monster.def = Math.max(0, monster.def + amt);
    monster._fieldDEF = (monster._fieldDEF || 0) + amt;
  }
}

/** Wendet einen per-Runde LP-Effekt an (auf beide Spieler). */
function _applyLPEffect(fc, fx) {
  const bs  = BATTLE_STATE;
  const amt = fx.amount || 0;
  const name = fc.name;

  const hitsPlayer = fx.target === 'both' || fx.target === 'player';
  const hitsEnemy  = fx.target === 'both' || fx.target === 'enemy';

  switch (fx.type) {
    case 'heal':
      if (hitsPlayer) bs.playerLP = Math.min(bs.playerLP + amt, RUN_STATE.maxHP);
      if (hitsEnemy)  bs.enemyLP  = Math.min(bs.enemyLP  + amt, bs.enemy.hp);
      battleLog(`💚 ${name}: +${amt} LP (beide Seiten)`, 'heal');
      break;

    case 'burn':
      if (hitsPlayer) { bs.playerLP = Math.max(0, bs.playerLP - amt); animateDamageNumber('player', amt); }
      if (hitsEnemy)  { bs.enemyLP  = Math.max(0, bs.enemyLP  - amt); animateDamageNumber('enemy',  amt); }
      battleLog(`🔥 ${name}: −${amt} LP (beide Seiten)`, 'damage');
      break;

    case 'drain':
      // drain: Gegner verliert LP, Spieler gewinnt LP
      { const d = Math.min(bs.enemyLP, amt);
        bs.enemyLP  = Math.max(0, bs.enemyLP  - d);
        bs.playerLP = Math.min(bs.playerLP + d, RUN_STATE.maxHP);
        battleLog(`🩸 ${name}: Drain ${d} LP (Gegner→Spieler)`, 'damage');
        animateDamageNumber('enemy', d);
      }
      break;
  }
}
