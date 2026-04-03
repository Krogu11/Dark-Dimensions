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
  if (isAnimating()) return;

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

  bs.fusionSelect      = [];
  bs.selectedHandIndex = null;
  bs.attackerIndex     = null;

  if (newPhase === 'Draw') {
    /* Karte ziehen, dann automatisch in Main Phase weiter */
    engineDrawCard();
    animatePhaseAnnounce('DRAW PHASE');
    renderBattle();
    setTimeout(() => { if (!BATTLE_STATE.gameOver) nextPhase(); }, 750);
    return;
  }

  if (newPhase === 'Main') {
    animatePhaseAnnounce('MAIN PHASE');
  } else if (newPhase === 'Battle') {
    animatePhaseAnnounce('BATTLE PHASE');
  } else if (newPhase === 'End') {
    /* Spielfeld-Rundeneffekte (Heal/Burn/Drain) — global für beide Seiten */
    if (typeof applyFieldCardPerTurnEffects === 'function') applyFieldCardPerTurnEffects();
    /* End Phase anzeigen, dann automatisch Gegnerzug starten */
    animatePhaseAnnounce('END PHASE');
    renderBattle();
    setTimeout(() => { if (!BATTLE_STATE.gameOver) nextPhase(); }, 850);
    return;
  }

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
  if (card.type === 'field' && phase === 'Main') {
    playFieldCard(index); return;
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
  if (bs.summonCount >= bs.maxPlayerSummons) { battleLog(`⚠ Keine Beschwörungen mehr übrig (${bs.summonCount}/${bs.maxPlayerSummons})`, 'warn'); return; }
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
  const artEl   = document.getElementById('summon-modal-art');
  if (!modal) { _executeSummon(_pendingSummonSlot, 'attack'); return; }

  if (nameEl)  nameEl.textContent  = card.name;
  if (statsEl) statsEl.textContent = `ATK ${card.atk}  /  DEF ${card.def}`;

  // Artwork anzeigen wenn vorhanden
  if (artEl) {
    if (card.image) {
      artEl.innerHTML = `<img src="${card.image}" class="summon-modal-art-img" alt="${card.name}">`;
      artEl.style.display = 'block';
    } else {
      artEl.innerHTML = '';
      artEl.style.display = 'none';
    }
  }

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
  bs.summonCount++;

  const raceStr = card.race ? ` [${card.race}]` : '';
  const modeStr = mode === 'defense' ? '🛡 Verteidigung' : '⚔ Angriff';
  battleLog(`✅ ${card.name}${raceStr} beschworen [${modeStr}] ATK ${card.atk} / DEF ${card.def}`, 'summon');
  animateSummon(slotIndex, true);
  applyOnSummonEffect(card, true);

  /* ── Spielfeld-Boni auf neu beschworenes Monster anwenden ── */
  if (typeof applyFieldCardToNewMonster === 'function') applyFieldCardToNewMonster(card);

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
  if (isAnimating()) return;
  if (getCurrentPhase() !== 'Main') {
    battleLog('⚠ Fusion nur in der Main Phase möglich', 'warn');
    renderBattle();
    return;
  }
  if (bs.summonCount >= bs.maxPlayerSummons) {
    battleLog(`⚠ Keine Beschwörungen mehr übrig (${bs.summonCount}/${bs.maxPlayerSummons})`, 'warn');
    bs.fusionSelect = [];
    bs.selectedHandIndex = null;
    renderBattle();
    return;
  }

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
  const savedSel   = [sel[0], sel[1]];

  // Fusions-Animation — Logik im Callback
  animateFusionCards(savedSel[0], savedSel[1], () => {
    // Materialien entfernen (höheren Index zuerst)
    [...savedSel].sort((a, b) => b - a).forEach(i => bs.hand.splice(i, 1));

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
    renderBattle();
  });
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
    // Wenn eine Handkarte für Fusion ausgewählt ist → Feld-Fusion versuchen
    if (bs.fusionSelect.length === 1) {
      const hCard = bs.hand[bs.fusionSelect[0]];
      if (hCard && (hCard.type === 'monster' || hCard.type === 'fusion')) {
        tryFieldFusion(slotIndex);
        return;
      }
    }
    bs.attackerIndex = null;
  }
}

/* ──────────────────────────────────────────────────
   FELD-FUSION (Spieler: Feldmonster + Handkarte)
────────────────────────────────────────────────── */
function tryFieldFusion(fieldSlot) {
  const bs = BATTLE_STATE;
  if (bs.summonCount >= bs.maxPlayerSummons) {
    battleLog(`⚠ Keine Beschwörungen mehr übrig (${bs.summonCount}/${bs.maxPlayerSummons})`, 'warn');
    bs.fusionSelect = [];
    bs.selectedHandIndex = null;
    renderBattle();
    return;
  }

  const handIdx  = bs.fusionSelect[0];
  const handCard = bs.hand[handIdx];
  const fieldCard = bs.playerField[fieldSlot];

  if (!handCard || !fieldCard) {
    bs.fusionSelect = [];
    bs.selectedHandIndex = null;
    renderBattle();
    return;
  }

  const recipe = getFusionResult(handCard.id, fieldCard.id);
  if (!recipe) {
    battleLog(`✗ Keine Fusion möglich: ${handCard.name} + ${fieldCard.name}`, 'warn');
    bs.fusionSelect = [];
    bs.selectedHandIndex = null;
    renderBattle();
    return;
  }

  const fusionCard = cloneCard(getCardById(recipe.result));

  // Materialien entfernen
  bs.hand.splice(handIdx, 1);
  bs.playerField[fieldSlot] = null;

  bs.selectedHandIndex = null;
  bs.fusionSelect = [];

  // Fusion-Karte temporär in Hand für Modal-Flow (nutzt denselben Slot)
  fusionCard._isFusionPending = true;
  bs.hand.push(fusionCard);
  bs.selectedHandIndex = bs.hand.length - 1;

  _pendingSummonSlot = fieldSlot;
  _showSummonModal(fusionCard);

  battleLog(`⚗ Feld-Fusion: ${fieldCard.name} + ${handCard.name} → ${fusionCard.name}!`, 'summon');
  renderBattle();
}

function handleEnemyFieldClick(targetSlot) {
  const bs = BATTLE_STATE;
  if (getCurrentPhase() !== 'Battle') return;
  if (isAnimating()) return;
  if (bs.attackerIndex === null) { battleLog('⚠ Wähle erst einen Angreifer', 'warn'); return; }

  if (checkEnemyTraps(bs.attackerIndex)) return;

  const enemyHasMonsters = bs.enemyField.some(Boolean);
  if (!enemyHasMonsters) { executeDirectAttack(); return; }
  if (!bs.enemyField[targetSlot]) return;

  const savedAtk = bs.attackerIndex;
  const savedDef = targetSlot;
  animateAttackLunge('player-field', savedAtk, 'enemy-field', savedDef, () => {
    resolveCombat(savedAtk, savedDef, false);
  });
}

function executeDirectAttack() {
  const bs = BATTLE_STATE;
  if (isAnimating()) return;
  if (bs.attackerIndex === null) return;
  if (bs.enemyField.some(Boolean)) { battleLog('⚠ Direktangriff nur wenn Gegnerfeld leer', 'warn'); return; }

  if (checkEnemyTraps(bs.attackerIndex)) return;

  const a = bs.playerField[bs.attackerIndex];
  if (!a) return;

  const savedAtk = bs.attackerIndex;
  animateDirectAttackLunge('player-field', savedAtk, () => {
    bs.enemyLP -= a.atk;
    _trackDamage(a.atk);
    battleLog(`💥 Direktangriff! ${a.name} → ${a.atk} Schaden`, 'damage');
    animateDamageNumber('enemy', a.atk);
    bs.hasAttacked[savedAtk] = true;
    bs.attackerIndex = null;
    checkWinCondition();
    renderBattle();
  });
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
    /* ── Gegner als besiegt markieren (für Freies Duell Roster) ── */
    if (bs.enemy && bs.enemy.id && typeof recordEnemyDefeated === 'function') {
      recordEnemyDefeated(bs.enemy.id);
    }
    /* ── Freies Duell: Sieg aufzeichnen ── */
    if (RUN_STATE._isFreeDuel && bs.enemy && bs.enemy.id
        && typeof recordFreeDuelResult === 'function') {
      recordFreeDuelResult(bs.enemy.id, true);
    }

    /* ── Boss-Sieg: Fortschritt committen & speichern ── */
    const currentAct = (typeof getRunActData === 'function')
      ? getRunActData()
      : (RUN_STATE.currentActId ? getActData(RUN_STATE.currentActId) : getActData(RUN_STATE.currentActIndex));
    const currentNode = RUN_STATE.currentNodeId
      ? ((currentAct || { nodes: [] }).nodes.find(n => n.id === RUN_STATE.currentNodeId))
      : null;
    const isBoss = currentNode && currentNode.type === 'boss';
    if (isBoss && typeof onBossDefeated === 'function') {
      onBossDefeated();
    }

    /* ── Freies Duell: Slot-Änderungen sofort speichern (auch nicht-Boss) ── */
    if (RUN_STATE._isFreeDuel && SAVE_STATE && SAVE_STATE.slot) {
      if (typeof saveCurrentSlotWithFeedback === 'function') saveCurrentSlotWithFeedback('Spiel gespeichert');
      else if (typeof saveCurrentSlot === 'function') saveCurrentSlot();
    }

    setTimeout(() => {
      if (!RUN_STATE._freeDuelReturn) {
        completeNode(RUN_STATE.currentNodeId);
      }
      /* Victory-Hook (letzter Boss) */
      if (typeof onVictory === 'function' && isBoss && currentNode && Array.isArray(currentNode.next) && currentNode.next.includes('victory')
          && !RUN_STATE._freeDuelReturn) {
        onVictory();
      }
      showRewardScreen();
    }, 1200);
  } else if (bs.playerLP <= 0) {
    bs.gameOver = true;
    battleLog('💀 NIEDERLAGE!', 'damage');
    /* ── Freies Duell: Niederlage aufzeichnen (kein Permadeath) ── */
    if (RUN_STATE._isFreeDuel && bs.enemy && bs.enemy.id
        && typeof recordFreeDuelResult === 'function') {
      recordFreeDuelResult(bs.enemy.id, false);
    }
    /* Im Freien Duell → zurück zum Roster statt Game-Over */
    if (RUN_STATE._isFreeDuel) {
      RUN_STATE._freeDuelReturn = false;
      RUN_STATE._isFreeDuel     = false;
      setTimeout(() => {
        if (typeof renderFreeDuelScreen === 'function') renderFreeDuelScreen();
        showScreen('freeduel');
      }, 1200);
      return;
    }
    /* Kampagne: Permadeath: Run verwerfen */
    if (typeof discardRun === 'function') discardRun();
    if (typeof restoreLastSavedProgressState === 'function') restoreLastSavedProgressState();
    else if (typeof reloadCurrentSlotFromDisk === 'function') reloadCurrentSlotFromDisk();
    setTimeout(() => showScreen('gameover'), 1200);
  }
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
