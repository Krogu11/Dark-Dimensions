/* ============================================================
   core/effects.js — Zentrales Effektsystem v3.0
   ============================================================
   Neue Effekte:
     burn300, burn400, burn1600, heal1500
     raceBuffATK150, raceBuffATK300, raceBuffDEF250
     buffAllAtk300, buffAllAtk500
     stealHand, stealField
     graveRevive, graveReviveSpell, massRevive
     shield300
     weaken200, weaken800, weakenAll300
     drain500 (spell-version), drain500Trap
     destroyAllSpell → identisch mit destroyAll (Umbenennung)
   ============================================================ */

/**
 * Führt einen Monster-On-Summon-Effekt aus.
 */
function applyOnSummonEffect(card, isPlayer) {
  if (!card.effect) return;

  const bs = BATTLE_STATE;
  const friendlyField = isPlayer ? bs.playerField : bs.enemyField;
  const enemyField    = isPlayer ? bs.enemyField  : bs.playerField;
  const tag = isPlayer ? '' : '(Gegner) ';

  switch (card.effect) {

    /* ── Heilung ── */
    case 'heal500':
      if (isPlayer) bs.playerLP = Math.min(bs.playerLP + 500, RUN_STATE.maxHP);
      else          bs.enemyLP  = Math.min(bs.enemyLP  + 500, bs.enemy.hp);
      battleLog(`💚 ${tag}${card.name}: +500 LP`, 'heal');
      break;

    case 'heal800':
      if (isPlayer) bs.playerLP = Math.min(bs.playerLP + 800, RUN_STATE.maxHP);
      else          bs.enemyLP  = Math.min(bs.enemyLP  + 800, bs.enemy.hp);
      battleLog(`💚 ${tag}${card.name}: +800 LP`, 'heal');
      break;

    case 'heal1000':
      if (isPlayer) bs.playerLP = Math.min(bs.playerLP + 1000, RUN_STATE.maxHP);
      else          bs.enemyLP  = Math.min(bs.enemyLP  + 1000, bs.enemy.hp);
      battleLog(`💚 ${tag}${card.name}: +1000 LP`, 'heal');
      break;

    case 'heal1500':
      if (isPlayer) bs.playerLP = Math.min(bs.playerLP + 1500, RUN_STATE.maxHP);
      else          bs.enemyLP  = Math.min(bs.enemyLP  + 1500, bs.enemy.hp);
      battleLog(`💚 ${tag}${card.name}: +1500 LP`, 'heal');
      break;

    /* ── Self-Buff ── */
    case 'buff300':
      card.atk += 300;
      battleLog(`⬆ ${tag}${card.name}: ATK +300 → ${card.atk}`, 'buff');
      break;

    case 'buff400':
      card.atk += 400;
      battleLog(`⬆ ${tag}${card.name}: ATK +400 → ${card.atk}`, 'buff');
      break;

    /* ── Feld-Buff ── */
    case 'buffAllAtk300':
      friendlyField.forEach(c => { if (c && c !== card) c.atk += 300; });
      battleLog(`⬆ ${tag}${card.name}: Alle Verbündeten +300 ATK`, 'buff');
      break;

    /* ── Direktschaden ── */
    case 'burn300':
      if (isPlayer) bs.enemyLP  -= 300; else bs.playerLP -= 300;
      battleLog(`🔥 ${tag}${card.name}: 300 Direktschaden`, 'damage');
      animateDamageNumber(isPlayer ? 'enemy' : 'player', 300);
      break;

    case 'burn400':
      if (isPlayer) bs.enemyLP  -= 400; else bs.playerLP -= 400;
      battleLog(`🔥 ${tag}${card.name}: 400 Direktschaden`, 'damage');
      animateDamageNumber(isPlayer ? 'enemy' : 'player', 400);
      break;

    case 'burn600':
      if (isPlayer) bs.enemyLP  -= 600; else bs.playerLP -= 600;
      battleLog(`🔥 ${tag}${card.name}: 600 Direktschaden`, 'damage');
      animateDamageNumber(isPlayer ? 'enemy' : 'player', 600);
      break;

    /* ── Zerstören ── */
    case 'destroy1': {
      const target = enemyField.findIndex(c => c !== null);
      if (target >= 0) {
        battleLog(`💥 ${tag}${card.name}: Zerstört ${enemyField[target].name}`, 'damage');
        _destroyCardOnField(enemyField, target, !isPlayer);
      } else {
        battleLog(`✨ ${tag}${card.name}: Kein Ziel`, '');
      }
      break;
    }

    case 'destroyAll':
      for (let i = 0; i < enemyField.length; i++) {
        if (enemyField[i]) {
          battleLog(`💥 ${tag}${card.name}: Zerstört ${enemyField[i].name}`, 'damage');
          _destroyCardOnField(enemyField, i, !isPlayer);
        }
      }
      break;

    /* ── Drain: Schaden + Heilung ── */
    case 'drain500':
      if (isPlayer) { bs.enemyLP -= 500; bs.playerLP = Math.min(bs.playerLP + 500, RUN_STATE.maxHP); }
      else          { bs.playerLP -= 500; bs.enemyLP  = Math.min(bs.enemyLP  + 500, bs.enemy.hp); }
      battleLog(`🩸 ${tag}${card.name}: Drain 500 LP`, 'damage');
      animateDamageNumber(isPlayer ? 'enemy' : 'player', 500);
      break;

    /* ── Revive: Monster vom Friedhof ── */
    case 'revive':
    case 'graveRevive': {
      const grave = isPlayer ? bs.playerGrave : bs.enemyGrave;
      const field = isPlayer ? bs.playerField : bs.enemyField;
      const monsters = grave.filter(c => c.type === 'monster' || c.type === 'fusion');
      const monster  = monsters.at(-1); // zuletzt gestorben
      if (monster) {
        const slot = field.findIndex(c => c === null);
        if (slot >= 0) {
          field[slot] = { ...monster, mode:'attack', uid: crypto.randomUUID() };
          battleLog(`✨ ${tag}${card.name}: Wiederbelebt ${monster.name}`, 'heal');
          applyFieldSynergies(isPlayer);
        }
      } else {
        battleLog(`✨ ${tag}${card.name}: Kein Monster auf dem Friedhof`, '');
      }
      break;
    }

    /* ── Massenrevival (Fusion-Effekt) ── */
    case 'massRevive': {
      const grave = isPlayer ? bs.playerGrave : bs.enemyGrave;
      const field = isPlayer ? bs.playerField : bs.enemyField;
      const monsters = grave.filter(c => c.type === 'monster');
      let revived = 0;
      for (const m of monsters) {
        const slot = field.findIndex(c => c === null);
        if (slot < 0) break;
        field[slot] = { ...m, mode:'attack', uid: crypto.randomUUID() };
        revived++;
      }
      battleLog(`💀 ${tag}${card.name}: ${revived} Monster wiederbelebt!`, 'heal');
      if (revived > 0) applyFieldSynergies(isPlayer);
      break;
    }

    /* ── Draw ── */
    case 'draw1':
      if (isPlayer) { engineDrawCard(); battleLog(`🃏 ${card.name}: 1 Karte ziehen`, 'buff'); }
      break;

    /* ── Weaken ── */
    case 'weaken200': {
      const t = enemyField.find(c => c !== null);
      if (t) { t.atk = Math.max(0, t.atk - 200); battleLog(`⬇ ${tag}${card.name}: ${t.name} -200 ATK`, 'buff'); }
      break;
    }

    case 'weaken500': {
      const t = enemyField.find(c => c !== null);
      if (t) { t.atk = Math.max(0, t.atk - 500); battleLog(`⬇ ${tag}${card.name}: ${t.name} -500 ATK`, 'buff'); }
      break;
    }

    case 'weaken800': {
      const t = enemyField.find(c => c !== null);
      if (t) { t.atk = Math.max(0, t.atk - 800); battleLog(`⬇ ${tag}${card.name}: ${t.name} -800 ATK`, 'buff'); }
      break;
    }

    /* ── Taunt ── */
    case 'taunt':
      card.isTaunt = true;
      battleLog(`🛡 ${tag}${card.name}: Zieht alle Angriffe auf sich`, 'buff');
      break;

    /* ── Rassen-Buff (Kobold-Karten) ── */
    case 'raceBuffATK150': {
      const race = card.race;
      friendlyField.forEach(c => {
        if (c && c !== card && c.race === race) { c.atk += 150; }
      });
      battleLog(`⬆ ${tag}${card.name}: Alle ${race} +150 ATK`, 'buff');
      break;
    }

    case 'raceBuffATK300': {
      const race = card.race;
      friendlyField.forEach(c => {
        if (c && c !== card && c.race === race) { c.atk += 300; }
      });
      battleLog(`⬆ ${tag}${card.name}: Alle ${race} +300 ATK`, 'buff');
      break;
    }

    /* ── Stehlen: Karte aus Gegnerkiste ── */
    case 'stealHand': {
      if (!isPlayer) break; // Gegner nutzt diese Mechanik nur limitiert
      const enemyHand = bs.enemyHand;
      if (!enemyHand || enemyHand.length === 0) {
        battleLog(`✨ ${card.name}: Keine Karte in der Gegnerhand`, '');
        break;
      }
      const idx = Math.floor(Math.random() * enemyHand.length);
      const stolen = enemyHand.splice(idx, 1)[0];
      bs.hand.push(stolen);
      battleLog(`🃏 ${card.name}: Gestohlen — ${stolen.name} aus der Gegnerhand!`, 'buff');
      break;
    }

    /* ── Stehlen: Gegnerfeld-Monster übernehmen ── */
    case 'stealField': {
      const targetIdx = enemyField.findIndex(c => c !== null);
      if (targetIdx < 0) { battleLog(`✨ ${card.name}: Kein Ziel auf dem Gegnerfeld`, ''); break; }
      const slot = friendlyField.findIndex(c => c === null);
      if (slot < 0) { battleLog(`⚠ ${card.name}: Kein freier Slot`, 'warn'); break; }
      const stolen = enemyField[targetIdx];
      enemyField[targetIdx] = null;
      friendlyField[slot]   = { ...stolen, mode:'attack', uid: crypto.randomUUID() };
      battleLog(`⚡ ${card.name}: ${stolen.name} übernommen!`, 'buff');
      applyFieldSynergies(isPlayer);
      applyFieldSynergies(!isPlayer);
      break;
    }

    /* ── Shield (physischer Schutz) ── */
    case 'shield300':
      card._shield = (card._shield || 0) + 300;
      battleLog(`🛡 ${tag}${card.name}: +300 Rüstung aktiv`, 'buff');
      break;

    /* ── HealBuff (Fusion-Effekt) ── */
    case 'healBuff':
      if (isPlayer) bs.playerLP = Math.min(bs.playerLP + 500, RUN_STATE.maxHP);
      card.atk += 400;
      battleLog(`✨ ${tag}${card.name}: +500 LP & ATK +400`, 'heal');
      break;
  }

  checkWinCondition();
}

/* ──────────────────────────────────────────────────
   SPELL-EFFEKTE (von Hand aktiviert)
────────────────────────────────────────────────── */
function applySpellEffect(card, isPlayer) {
  const bs = BATTLE_STATE;
  const enemyField    = isPlayer ? bs.enemyField  : bs.playerField;
  const friendlyField = isPlayer ? bs.playerField : bs.enemyField;

  switch (card.effect) {

    case 'burn400':
      if (isPlayer) bs.enemyLP  -= 400; else bs.playerLP -= 400;
      battleLog(`🔥 ${card.name}: 400 Direktschaden`, 'damage');
      animateDamageNumber(isPlayer ? 'enemy' : 'player', 400);
      break;

    case 'burn800':
      if (isPlayer) bs.enemyLP  -= 800; else bs.playerLP -= 800;
      battleLog(`🔥 ${card.name}: 800 Direktschaden`, 'damage');
      animateDamageNumber(isPlayer ? 'enemy' : 'player', 800);
      break;

    case 'burn1200':
      if (isPlayer) bs.enemyLP  -= 1200; else bs.playerLP -= 1200;
      battleLog(`⚡ ${card.name}: 1200 Direktschaden`, 'damage');
      animateDamageNumber(isPlayer ? 'enemy' : 'player', 1200);
      break;

    case 'burn1600':
      if (isPlayer) bs.enemyLP  -= 1600; else bs.playerLP -= 1600;
      battleLog(`🔥 ${card.name}: 1600 HÖLLENFEUER!`, 'damage');
      animateDamageNumber(isPlayer ? 'enemy' : 'player', 1600);
      break;

    case 'heal1000':
      if (isPlayer) bs.playerLP = Math.min(bs.playerLP + 1000, RUN_STATE.maxHP);
      else          bs.enemyLP  = Math.min(bs.enemyLP  + 1000, bs.enemy.hp);
      battleLog(`💚 ${card.name}: +1000 LP`, 'heal');
      break;

    case 'heal1500':
      if (isPlayer) bs.playerLP = Math.min(bs.playerLP + 1500, RUN_STATE.maxHP);
      else          bs.enemyLP  = Math.min(bs.enemyLP  + 1500, bs.enemy.hp);
      battleLog(`💚 ${card.name}: +1500 LP`, 'heal');
      break;

    case 'buffAllAtk400':
      friendlyField.forEach(c => { if (c) c.atk += 400; });
      battleLog(`⬆ ${card.name}: Alle Monster +400 ATK`, 'buff');
      break;

    case 'buffAllAtk500':
      friendlyField.forEach(c => { if (c) c.atk += 500; });
      battleLog(`⬆ ${card.name}: Alle Monster +500 ATK`, 'buff');
      break;

    case 'destroyAllSpell':
    case 'destroyAll':
      for (let i = 0; i < enemyField.length; i++) {
        if (enemyField[i]) {
          _destroyCardOnField(enemyField, i, !isPlayer);
        }
      }
      battleLog(`💥 ${card.name}: Alle feindlichen Monster vernichtet!`, 'damage');
      applyFieldSynergies(!isPlayer);
      break;

    case 'draw2':
      if (isPlayer) { engineDrawCard(); engineDrawCard(); }
      battleLog(`🃏 ${card.name}: 2 Karten ziehen`, 'buff');
      break;

    case 'drain1000':
      if (isPlayer) {
        bs.enemyLP  -= 1000;
        bs.playerLP  = Math.min(bs.playerLP + 1000, RUN_STATE.maxHP);
      } else {
        bs.playerLP -= 1000;
        bs.enemyLP   = Math.min(bs.enemyLP  + 1000, bs.enemy.hp);
      }
      battleLog(`🩸 ${card.name}: Drain 1000 LP`, 'damage');
      animateDamageNumber(isPlayer ? 'enemy' : 'player', 1000);
      break;

    case 'graveReviveSpell': {
      const grave = isPlayer ? bs.playerGrave : bs.enemyGrave;
      const field = isPlayer ? bs.playerField : bs.enemyField;
      const monsters = grave.filter(c => c.type === 'monster' || c.type === 'fusion');
      if (monsters.length === 0) { battleLog(`✨ ${card.name}: Friedhof leer`, ''); break; }
      /* Stärkstes Monster */
      const strongest = monsters.reduce((a, b) => a.atk >= b.atk ? a : b);
      const slot = field.findIndex(c => c === null);
      if (slot >= 0) {
        field[slot] = { ...strongest, mode:'attack', uid: crypto.randomUUID() };
        battleLog(`✨ ${card.name}: ${strongest.name} aus dem Friedhof beschworen!`, 'heal');
        applyFieldSynergies(isPlayer);
      }
      break;
    }

    case 'stealHand': {
      if (!isPlayer) break;
      const enemyHand = bs.enemyHand;
      if (!enemyHand || enemyHand.length === 0) {
        battleLog(`✨ ${card.name}: Gegnerhand leer`, '');
        break;
      }
      const idx = Math.floor(Math.random() * enemyHand.length);
      const stolen = enemyHand.splice(idx, 1)[0];
      bs.hand.push(stolen);
      battleLog(`🃏 ${card.name}: Gestohlen → ${stolen.name}!`, 'buff');
      break;
    }

    case 'weakenAll300':
      enemyField.forEach(e => { if (e) e.atk = Math.max(0, e.atk - 300); });
      battleLog(`⬇ ${card.name}: Alle Feinde -300 ATK`, 'buff');
      break;
  }

  checkWinCondition();
}

/* ──────────────────────────────────────────────────
   TRAP-EFFEKTE (Spieler-Fallen bei Gegner-Angriff)
────────────────────────────────────────────────── */
function checkAndActivateTraps(attackerSlot) {
  const bs = BATTLE_STATE;
  let attackCancelled = false;

  bs.playerSTZone.forEach((card, idx) => {
    if (!card || card.type !== 'trap' || card.trigger !== 'onAttacked') return;

    battleLog(`⚡ Falle aktiviert: ${card.name}!`, 'damage');
    bs.playerSTZone[idx] = null;

    switch (card.effect) {
      case 'destroyAttacker':
        if (bs.enemyField[attackerSlot]) {
          battleLog(`💥 ${card.name}: ${bs.enemyField[attackerSlot].name} zerstört!`, 'damage');
          _destroyCardOnField(bs.enemyField, attackerSlot, false);
          attackCancelled = true;
        }
        break;

      case 'destroyAllAtk':
        bs.enemyField.forEach((c, i) => {
          if (c && c.mode === 'attack') {
            battleLog(`💥 ${card.name}: ${c.name} zerstört!`, 'damage');
            _destroyCardOnField(bs.enemyField, i, false);
          }
        });
        attackCancelled = true;
        break;

      case 'heal800':
        bs.playerLP = Math.min(bs.playerLP + 800, RUN_STATE.maxHP);
        battleLog(`💚 ${card.name}: +800 LP`, 'heal');
        break;

      case 'drain500Trap':
        bs.enemyLP -= 500;
        bs.playerLP = Math.min(bs.playerLP + 500, RUN_STATE.maxHP);
        battleLog(`🩸 ${card.name}: Drain 500 LP vom Angreifer!`, 'damage');
        animateDamageNumber('enemy', 500);
        break;

      case 'negate':
      case 'negateEffect':
        battleLog(`🛡 ${card.name}: Angriff negiert!`, 'buff');
        attackCancelled = true;
        break;
    }
  });

  if (attackCancelled) applyFieldSynergies(false);
  return attackCancelled;
}

/* ──────────────────────────────────────────────────
   GEGNER-FALLEN (aktivieren wenn SPIELER angreift)
────────────────────────────────────────────────── */
function checkEnemyTraps(playerAttackerSlot) {
  const bs = BATTLE_STATE;
  let attackCancelled = false;

  bs.enemySTZone.forEach((card, idx) => {
    if (!card || card.type !== 'trap' || card.trigger !== 'onAttacked') return;

    battleLog(`⚡⚡ GEGNER-FALLE: ${card.name} aktiviert!`, 'damage');
    bs.enemySTZone[idx] = null;
    card.hidden = false;

    switch (card.effect) {
      case 'destroyAttacker': {
        const attacker = bs.playerField[playerAttackerSlot];
        if (attacker) {
          battleLog(`💥 ${card.name}: ${attacker.name} zerstört!`, 'damage');
          _destroyCardOnField(bs.playerField, playerAttackerSlot, true);
          attackCancelled = true;
        }
        break;
      }

      case 'destroyAllAtk':
        bs.playerField.forEach((c, i) => {
          if (c && c.mode === 'attack') {
            battleLog(`💥 ${card.name}: ${c.name} zerstört!`, 'damage');
            _destroyCardOnField(bs.playerField, i, true);
          }
        });
        attackCancelled = true;
        break;

      case 'heal800':
        bs.enemyLP = Math.min(bs.enemyLP + 800, bs.enemy.hp);
        battleLog(`💚 ${card.name}: Gegner +800 LP`, 'heal');
        break;

      case 'drain500Trap':
        bs.playerLP -= 500;
        bs.enemyLP  = Math.min(bs.enemyLP + 500, bs.enemy.hp);
        battleLog(`🩸 ${card.name}: Gegner saugt 500 LP!`, 'damage');
        animateDamageNumber('player', 500);
        break;

      case 'negate':
      case 'negateEffect':
        battleLog(`🛡 ${card.name}: Dein Angriff wurde negiert!`, 'buff');
        attackCancelled = true;
        break;
    }
  });

  if (attackCancelled) {
    bs.attackerIndex = null;
    applyFieldSynergies(true);
    checkWinCondition();
    renderBattle();
  }
  return attackCancelled;
}

/* ──────────────────────────────────────────────────
   INTERNE HILFSFUNKTION:
   Karte von einem Feld-Slot zerstören + Synergien
────────────────────────────────────────────────── */
function _destroyCardOnField(field, slotIdx, isPlayerCard) {
  const card = field[slotIdx];
  if (!card) return;
  sendToGrave(card, isPlayerCard);
  /* Death-Synergien prüfen BEVOR Slot geleert wird */
  checkOnDeathSynergies(card, isPlayerCard);
  field[slotIdx] = null;
}

/* ── Hilfsfunktion: Karte auf Friedhof ── */
function sendToGrave(card, isPlayerCard) {
  if (!card) return;
  if (isPlayerCard) BATTLE_STATE.playerGrave.push(card);
  else              BATTLE_STATE.enemyGrave.push(card);
}

/* ──────────────────────────────────────────────────
   Effekt-Beschreibungen (für UI / Hover)
────────────────────────────────────────────────── */
function getEffectDescription(effect) {
  const DESCS = {
    heal500:         '+500 LP bei Beschwörung',
    heal800:         '+800 LP bei Beschwörung',
    heal1000:        '+1000 LP bei Beschwörung',
    heal1500:        '+1500 LP bei Beschwörung',
    buff300:         'Selbst +300 ATK bei Beschwörung',
    buff400:         'Selbst +400 ATK bei Beschwörung',
    buffAllAtk300:   'Alle Verbündeten +300 ATK',
    buffAllAtk400:   'Alle Verbündeten +400 ATK',
    buffAllAtk500:   'Alle Verbündeten +500 ATK',
    burn300:         '300 Direktschaden bei Beschwörung',
    burn400:         '400 Direktschaden bei Beschwörung',
    burn600:         '600 Direktschaden bei Beschwörung',
    burn800:         '800 Direktschaden (Spell)',
    burn1200:        '1200 Direktschaden (Spell)',
    burn1600:        '1600 Direktschaden (Spell)',
    destroy1:        'Zerstört 1 Gegnermonster bei Beschwörung',
    destroyAll:      'Zerstört ALLE Gegnermonster bei Beschwörung',
    destroyAllSpell: 'Zerstört ALLE Gegnermonster (Spell)',
    drain500:        'Saugt 500 LP vom Gegner',
    drain1000:       'Saugt 1000 LP vom Gegner (Spell)',
    drain500Trap:    'Saugt 500 LP bei Aktivierung (Falle)',
    revive:          'Belebt Monster aus Friedhof',
    graveRevive:     'Belebt zuletzt gestorbenes Monster',
    graveReviveSpell:'Belebt stärkstes Monster aus Friedhof (Spell)',
    massRevive:      'Belebt ALLE Monster aus Friedhof',
    draw1:           'Ziehe 1 Karte bei Beschwörung',
    draw2:           'Ziehe 2 Karten (Spell)',
    weaken200:       'Gegner -200 ATK bei Beschwörung',
    weaken500:       'Gegner -500 ATK bei Beschwörung',
    weaken800:       'Gegner -800 ATK bei Beschwörung',
    weakenAll300:    'Alle Feinde -300 ATK (Spell)',
    taunt:           'Zieht alle Angriffe auf sich',
    stealHand:       'Stiehlt Karte aus Gegnerhand',
    stealField:      'Übernimmt ein Gegnerfeld-Monster',
    shield300:       '+300 Rüstung (reduziert eingehenden ATK)',
    raceBuffATK150:  '+150 ATK für alle Gleichrassigen auf dem Feld',
    raceBuffATK300:  '+300 ATK für alle Gleichrassigen auf dem Feld',
    destroyAttacker: 'Zerstört angreifendes Monster (Falle)',
    destroyAllAtk:   'Zerstört alle angreifenden Monster (Falle)',
    negate:          'Negiert Angriff (Falle)',
    negateEffect:    'Negiert Effekt/Angriff (Falle)',
    healBuff:        '+500 LP & +400 ATK',
  };
  return DESCS[effect] || effect;
}
