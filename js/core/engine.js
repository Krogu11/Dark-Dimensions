/* ============================================================
   core/engine.js — Battle Engine
   ============================================================
   Changelog:
   • Tribute-System entfernt — jedes Monster frei beschwörbar
   • Beschwörungs-Modus-Modal (ATK / DEF wählbar)
   • DEF-Kampflogik: ATK ≥ DEF → Zerstörung, kein LP-Schaden
                     ATK < DEF → Rückstoß-Schaden beim Angreifer, Verteidiger bleibt
   ============================================================ */

/* ── Pending-Summon-State (Modul-Level) ── */
let _pendingSummonSlot = null;

/* ── Karte ziehen ── */
function engineDrawCard() {
  const bs = BATTLE_STATE;
  if (bs.playerDeck.length === 0) { battleLog('⚠ Deck leer!', 'warn'); return; }
  const maxHand = (window.DD_CUSTOM && window.DD_CUSTOM.config && window.DD_CUSTOM.config['cfg-maxhand'])
    ? Number(window.DD_CUSTOM.config['cfg-maxhand']) : 7;
  if (bs.hand.length >= maxHand) { battleLog(`⚠ Hand voll (max. ${maxHand})`, 'warn'); return; }
  const card = bs.playerDeck.pop();
  card.mode   = 'attack';
  card.hidden = false;
  bs.hand.push(card);
}

/* ── Phase-Wechsel ── */
function nextPhase() {
  if (BATTLE_STATE.gameOver) return;

  const bs       = BATTLE_STATE;
  const oldPhase = getCurrentPhase();
  bs.phaseIndex++;

  if (bs.phaseIndex >= bs.phases.length) {
    bs.phaseIndex = 0;
    bs.turn++;
    enemyFullTurn();
    resetRoundFlags();
  }

  const newPhase = getCurrentPhase();
  battleLog(`📌 ${oldPhase} → ${newPhase}`, 'phase');
  if (newPhase === 'Draw') engineDrawCard();

  bs.fusionSelect      = [];
  bs.selectedHandIndex = null;
  bs.attackerIndex     = null;

  renderBattle();
}

/* ──────────────────────────────────────────────────
   HAND-INTERAKTION
────────────────────────────────────────────────── */
function handleHandClick(index) {
  const bs   = BATTLE_STATE;
  const card = bs.hand[index];
  if (!card) return;

  const phase = getCurrentPhase();

  if (card.type === 'spell' && phase === 'Main') {
    activateSpellFromHand(index); return;
  }
  if (card.type === 'trap' && phase === 'Main') {
    setTrapFromHand(index); return;
  }

  if (card.type === 'monster' || card.type === 'fusion') {
    // Zweite Karte für Fusion auswählen
    if (bs.fusionSelect.length === 1 && bs.fusionSelect[0] !== index) {
      bs.fusionSelect.push(index);
      tryFusion(); return;
    }
    if (bs.selectedHandIndex === index) {
      bs.selectedHandIndex = null;
      bs.fusionSelect      = [];
    } else {
      bs.selectedHandIndex = index;
      bs.fusionSelect      = [index];
    }
  }
  renderBattle();
}

function activateSpellFromHand(index) {
  const bs   = BATTLE_STATE;
  const card = bs.hand[index];
  bs.hand.splice(index, 1);
  bs.selectedHandIndex = null;
  applySpellEffect(card, true);
  sendToGrave(card, true);
  _trackSpellTrap();
  battleLog(`✨ Spell aktiviert: ${card.name}`, 'spell');
  renderBattle();
}

function setTrapFromHand(index) {
  const bs   = BATTLE_STATE;
  const card = bs.hand[index];
  const slot = bs.playerSTZone.findIndex(c => c === null);
  if (slot < 0) { battleLog('⚠ Keine freie Fallen-Zone', 'warn'); return; }
  bs.hand.splice(index, 1);
  bs.selectedHandIndex = null;
  card.hidden = true;
  bs.playerSTZone[slot] = card;
  _trackSpellTrap();
  battleLog(`🔽 Falle aufgestellt`, 'spell');
  renderBattle();
}

/* ──────────────────────────────────────────────────
   BESCHWÖRUNG — Modus-Modal
────────────────────────────────────────────────── */
function summonToSlot(slotIndex) {
  const bs    = BATTLE_STATE;
  const idx   = bs.selectedHandIndex;
  const phase = getCurrentPhase();

  if (idx === null) return;
  if (phase !== 'Main') { battleLog('⚠ Beschwörung nur in Main Phase', 'warn'); return; }
  if (bs.hasNormalSummoned) { battleLog('⚠ Bereits eine Beschwörung diese Runde', 'warn'); return; }
  if (bs.playerField[slotIndex] !== null) { battleLog('⚠ Slot belegt', 'warn'); return; }

  const card = bs.hand[idx];
  if (!card || (card.type !== 'monster' && card.type !== 'fusion')) return;

  // Modal öffnen (kein Tribut-Check mehr!)
  _pendingSummonSlot = slotIndex;
  _showSummonModal(card);
}

function _showSummonModal(card) {
  const modal   = document.getElementById('summon-modal');
  const nameEl  = document.getElementById('summon-modal-card');
  const statsEl = document.getElementById('summon-modal-stats');
  if (!modal) { _executeSummon(_pendingSummonSlot, 'attack'); return; }

  if (nameEl)  nameEl.textContent  = card.name;
  if (statsEl) statsEl.textContent = `ATK ${card.atk}  /  DEF ${card.def}`;

  modal.style.display = 'flex';
  if (window.gsap) {
    gsap.fromTo(modal.querySelector('.summon-modal-box'),
      { scale: 0.75, opacity: 0 },
      { scale: 1,    opacity: 1, duration: 0.25, ease: 'back.out(1.5)' }
    );
  }
}

/** Aufgerufen durch Button im Modal */
function confirmSummon(mode) {
  const modal = document.getElementById('summon-modal');
  if (modal) modal.style.display = 'none';
  _executeSummon(_pendingSummonSlot, mode);
  _pendingSummonSlot = null;
}

function cancelSummon() {
  const modal = document.getElementById('summon-modal');
  if (modal) modal.style.display = 'none';
  _pendingSummonSlot = null;
}

function _executeSummon(slotIndex, mode) {
  const bs  = BATTLE_STATE;
  const idx = bs.selectedHandIndex;
  if (idx === null || slotIndex === null) return;

  const card = bs.hand[idx];
  if (!card) return;

  card.mode = mode;
  bs.playerField[slotIndex] = card;
  bs.hand.splice(idx, 1);
  bs.selectedHandIndex = null;
  bs.fusionSelect      = [];
  bs.hasNormalSummoned = true;

  const raceStr = card.race ? ` [${card.race}]` : '';
  const modeStr = mode === 'defense' ? '🛡 Verteidigung' : '⚔ Angriff';
  battleLog(`✅ ${card.name}${raceStr} beschworen [${modeStr}] ATK ${card.atk} / DEF ${card.def}`, 'summon');
  animateSummon(slotIndex, true);
  applyOnSummonEffect(card, true);

  /* ── Synergien nach Beschwörung neu berechnen ── */
  applyFieldSynergies(true);
  checkOnSummonSynergies(card, true);

  renderBattle();
}

/* ──────────────────────────────────────────────────
   FUSION (Spieler)
────────────────────────────────────────────────── */
function tryFusion() {
  const bs  = BATTLE_STATE;
  const sel = bs.fusionSelect;
  if (sel.length < 2) return;

  const c1 = bs.hand[sel[0]];
  const c2 = bs.hand[sel[1]];
  if (!c1 || !c2) { bs.fusionSelect = []; return; }

  const recipe = getFusionResult(c1.id, c2.id);
  if (!recipe) {
    battleLog(`✗ Keine Fusion: ${c1.name} + ${c2.name}`, 'warn');
    bs.fusionSelect      = [sel[0]];
    bs.selectedHandIndex = sel[0];
    renderBattle(); return;
  }

  const fusionCard = cloneCard(getCardById(recipe.result));

  // Materialien entfernen (höheren Index zuerst)
  [sel[1], sel[0]].sort((a, b) => b - a).forEach(i => bs.hand.splice(i, 1));

  // Slot suchen
  const slot = bs.playerField.findIndex(c => c === null);
  if (slot < 0) { battleLog('⚠ Kein freier Slot für Fusion', 'warn'); return; }

  // Modus-Modal für Fusion
  bs.selectedHandIndex = null;
  bs.fusionSelect      = [];

  // Fusion-Karte temporär in Hand legen für Modal-Flow
  fusionCard._isFusionPending = true;
  bs.hand.push(fusionCard);
  bs.selectedHandIndex = bs.hand.length - 1;

  _pendingSummonSlot = slot;
  _showSummonModal(fusionCard);

  battleLog(`⚗ Fusion bereit: ${c1.name} + ${c2.name} → ${fusionCard.name}!`, 'summon');
}

/* ──────────────────────────────────────────────────
   FELD-INTERAKTIONEN
────────────────────────────────────────────────── */
function handlePlayerFieldClick(slotIndex) {
  const bs = BATTLE_STATE;
  const card = bs.playerField[slotIndex];
  if (!card) return;

  if (getCurrentPhase() === 'Battle') {
    if (card.mode === 'defense') { battleLog('⚠ Monster im Verteidigungsmodus kann nicht angreifen', 'warn'); return; }
    if (bs.hasAttacked[slotIndex]) { battleLog('⚠ Monster hat bereits angegriffen', 'warn'); return; }
    bs.attackerIndex = slotIndex;
    battleLog(`⚔ ${card.name} (ATK ${card.atk}) bereit zum Angriff`, 'combat');
    renderBattle();
  }
  else if (getCurrentPhase() === 'Main') {
    // Rechtsklick handled toggleCardMode, Linksklick hier wählt Monster
    bs.attackerIndex = null;
  }
}

function handleEnemyFieldClick(targetSlot) {
  const bs = BATTLE_STATE;
  if (getCurrentPhase() !== 'Battle') return;
  if (bs.attackerIndex === null) { battleLog('⚠ Wähle erst einen Angreifer', 'warn'); return; }

  if (checkEnemyTraps(bs.attackerIndex)) return;

  const enemyHasMonsters = bs.enemyField.some(Boolean);
  if (!enemyHasMonsters) { executeDirectAttack(); return; }
  if (!bs.enemyField[targetSlot]) return;

  resolveCombat(bs.attackerIndex, targetSlot, false);
}

function executeDirectAttack() {
  const bs = BATTLE_STATE;
  if (bs.attackerIndex === null) return;
  if (bs.enemyField.some(Boolean)) { battleLog('⚠ Direktangriff nur wenn Gegnerfeld leer', 'warn'); return; }

  if (checkEnemyTraps(bs.attackerIndex)) return;

  const a = bs.playerField[bs.attackerIndex];
  if (!a) return;
  bs.enemyLP -= a.atk;
  _trackDamage(a.atk);
  battleLog(`💥 Direktangriff! ${a.name} → ${a.atk} Schaden`, 'damage');
  animateDamageNumber('enemy', a.atk);
  bs.hasAttacked[bs.attackerIndex] = true;
  bs.attackerIndex = null;

  checkWinCondition();
  renderBattle();
}

/* ──────────────────────────────────────────────────
   KERNKAMPF — Korrekte DEF-Mechanik
   ──────────────────────────────────────────────────
   ATK vs ATK: Differenz = LP-Schaden für Verlierer, Verlierer-Monster zerstört
   ATK vs DEF:
     ATK ≥ DEF → Verteidiger zerstört, KEIN LP-Schaden
     ATK < DEF → Angreifer nimmt (DEF-ATK) als LP-Schaden, Verteidiger BLEIBT
────────────────────────────────────────────────── */
function resolveCombat(atkSlot, defSlot, isEnemyAttack) {
  const bs       = BATTLE_STATE;
  const atkField = isEnemyAttack ? bs.enemyField  : bs.playerField;
  const defField = isEnemyAttack ? bs.playerField : bs.enemyField;
  const atkIsPlayer = !isEnemyAttack;

  const attacker = atkField[atkSlot];
  const defender = defField[defSlot];
  if (!attacker) return;

  // Spieler-Fallen prüfen (wenn Gegner angreift)
  if (isEnemyAttack && checkAndActivateTraps(atkSlot)) {
    bs.attackerIndex = null;
    checkWinCondition();
    renderBattle();
    return;
  }

  if (!defender) {
    /* ── Direktangriff ── */
    const dmg = attacker.atk;
    if (isEnemyAttack) { bs.playerLP -= dmg; animateDamageNumber('player', dmg); }
    else               { bs.enemyLP  -= dmg; animateDamageNumber('enemy',  dmg); _trackDamage(dmg); }
    battleLog(`💥 Direktangriff! ${attacker.name} → ${dmg} Schaden`, 'damage');
  }
  else if (defender.mode === 'defense') {
    /* ── Angriff auf Verteidigungsposition ── */
    /* Shield reduziert effektiven ATK des Angreifers */
    const effectiveAtk = Math.max(0, attacker.atk - (defender._shield || 0));
    const diff = effectiveAtk - defender.def;

    if (diff >= 0) {
      /* Angreifer gewinnt → Verteidiger zerstört, KEIN LP-Schaden */
      _destroyCardOnField(defField, defSlot, !atkIsPlayer);
      if (!isEnemyAttack) _trackEnemyKill();
      const shieldNote = defender._shield ? ` [Rüstung ${defender._shield}]` : '';
      battleLog(`⚔ ${attacker.name} (${attacker.atk}) vs ${defender.name} DEF (${defender.def})${shieldNote} → Zerstört`, 'combat');
      applyFieldSynergies(!atkIsPlayer);
    } else {
      /* Verteidiger zu stark → Rückstoß-Schaden, Verteidiger bleibt */
      const bounce = Math.abs(diff);
      if (atkIsPlayer) {
        bs.playerLP -= bounce;
        animateDamageNumber('player', bounce);
      } else {
        bs.enemyLP -= bounce;
        animateDamageNumber('enemy', bounce);
      }
      battleLog(`💢 ${attacker.name} (${attacker.atk}) prallt an ${defender.name} (DEF ${defender.def}) ab — ${bounce} Rückstoß!`, 'damage');
    }
  }
  else {
    /* ── Angriff auf Angriffsposition: ATK vs ATK ── */
    /* Shield des Verteidigers reduziert effektiven ATK */
    const effAtkA = Math.max(0, attacker.atk - (defender._shield || 0));
    const effAtkD = Math.max(0, defender.atk - (attacker._shield || 0));
    const diff = effAtkA - effAtkD;

    if (diff > 0) {
      _destroyCardOnField(defField, defSlot, !atkIsPlayer);
      const dmg = diff;
      if (isEnemyAttack) { bs.playerLP -= dmg; animateDamageNumber('player', dmg); }
      else {
        bs.enemyLP -= dmg;
        animateDamageNumber('enemy', dmg);
        _trackDamage(dmg);
        _trackEnemyKill();
      }
      battleLog(`⚔ ${attacker.name} (${attacker.atk}) besiegt ${defender.name} (${defender.atk}) → +${dmg} Schaden`, 'combat');
      applyFieldSynergies(!atkIsPlayer);
    } else if (diff < 0) {
      _destroyCardOnField(atkField, atkSlot, atkIsPlayer);
      const dmg = Math.abs(diff);
      if (atkIsPlayer) { bs.playerLP -= dmg; animateDamageNumber('player', dmg); }
      else             { bs.enemyLP  -= dmg; animateDamageNumber('enemy',  dmg); }
      battleLog(`⚔ ${defender.name} (${defender.atk}) besiegt ${attacker.name} (${attacker.atk}) → +${dmg} Schaden`, 'combat');
      applyFieldSynergies(atkIsPlayer);
    } else {
      _destroyCardOnField(atkField, atkSlot, atkIsPlayer);
      _destroyCardOnField(defField, defSlot, !atkIsPlayer);
      battleLog(`⚔ ${attacker.name} vs ${defender.name} — Gleichstand, beide zerstört`, 'combat');
      applyFieldSynergies(atkIsPlayer);
      applyFieldSynergies(!atkIsPlayer);
    }
  }

  if (!isEnemyAttack) {
    bs.hasAttacked[atkSlot] = true;
    bs.attackerIndex = null;
  }

  checkWinCondition();
  renderBattle();
}

/* ── Modus-Toggle (Rechtsklick auf eigene Karte im Main) ── */
function toggleCardMode(slotIndex) {
  const card = BATTLE_STATE.playerField[slotIndex];
  if (!card || getCurrentPhase() !== 'Main') return;
  card.mode = card.mode === 'defense' ? 'attack' : 'defense';
  battleLog(`🔄 ${card.name}: Wechsel zu ${card.mode === 'defense' ? '🛡 Verteidigung' : '⚔ Angriff'}`, '');
  renderBattle();
}

/* ── Siegbedingung ── */
function checkWinCondition() {
  const bs = BATTLE_STATE;
  if (bs.gameOver) return;

  if (bs.enemyLP <= 0) {
    bs.gameOver = true;
    battleLog('🏆 SIEG! Gegner besiegt!', 'summon');
    RUN_STATE.playerHP = Math.max(1, Math.min(bs.playerLP, RUN_STATE.maxHP));
    const goldGain = randomBetween(bs.enemy.gold[0], bs.enemy.gold[1]);
    RUN_STATE.gold += goldGain;
    battleLog(`💰 +${goldGain} Gold`, 'buff');
    // Kampf-Statistiken für Debug-Editor speichern
    try {
      const rs = bs.rankingStats;
      localStorage.setItem('dd_last_battle_stats', JSON.stringify({
        'Gegner':              bs.enemy.name,
        'Verbliebene LP':      bs.playerLP,
        'Start-LP':            rs.startPlayerLP || '—',
        'Rundenanzahl':        rs.turnsElapsed,
        'Höchster Einzelschaden': rs.maxSingleDamage,
        'Gesamtschaden':       rs.totalDamageDealt,
        'Monster zerstört':    rs.enemyMonstersDestroyed,
        'Spells/Fallen':       rs.spellsTrapsPlayed,
      }));
    } catch(e) {}
    setTimeout(() => { completeNode(RUN_STATE.currentNodeId); showRewardScreen(); }, 1200);
  } else if (bs.playerLP <= 0) {
    bs.gameOver = true;
    battleLog('💀 NIEDERLAGE!', 'damage');
    setTimeout(() => showScreen('gameover'), 1200);
  }
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
