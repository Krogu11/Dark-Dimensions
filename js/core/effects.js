/* ============================================================
   core/effects.js — Effektsystem v4.0 (Modular, Multi-Effekt)
   ============================================================

   NEUE ARCHITEKTUR:
   Karten speichern Effekte als Array von Objekten:
     card.effects = [
       { type: 'burn',         amount: 400 },
       { type: 'heal',         amount: 200 },
       { type: 'specialSummon',cardId: 'dark_knight' }
     ]

   Rückwärtskompatibel: card.effect (String) wird automatisch
   in das neue Format konvertiert.

   ALLE EFFEKTTYPEN:
   ─ Schaden    : burn, burnPercent, drain
   ─ Heilung    : heal, healPercent
   ─ Buff       : buff (ATK self), buffDef (DEF self), buffAll, buffDefAll
   ─ Schwächen  : weakenOne, weakenAll, weakenDefOne
   ─ Zerstören  : destroy1, destroyAll, destroyAttacker, destroyAllAtk
   ─ Beschwören : revive, reviveBest, massRevive, specialSummon
   ─ Karten     : draw, stealHand, stealField
   ─ Defensiv   : shield, taunt, negate
   ─ Rasse      : raceBuffATK
   ─ Kombiniert : healBuff (legacy alias)
   ─ Passiv     : burnOnAttack, weakenOnAttack (hooks in engine.js)
   ============================================================ */

/* ══════════════════════════════════════════════════
   INTERNE HILFSFUNKTIONEN
══════════════════════════════════════════════════ */

/**
 * Konvertiert card.effect (String, Altformat) in ein effects-Array.
 * Gibt das card.effects-Array zurück — oder leeres Array.
 */
function _resolveEffects(card) {
  // Neues Format: Array von Objekten
  if (Array.isArray(card.effects) && card.effects.length > 0) {
    return card.effects;
  }

  // Altformat: einzelner String → in Objekt konvertieren
  if (typeof card.effect === 'string' && card.effect) {
    return [_legacyStringToEffect(card.effect)];
  }

  return [];
}

/**
 * Übersetzt einen alten Effekt-String in ein Effekt-Objekt.
 */
function _legacyStringToEffect(str) {
  const configuredAliases = window.DD_EFFECTS_CONFIG?.legacyAliases;
  const map = configuredAliases && typeof configuredAliases === 'object' ? configuredAliases : {
    heal500:         { type:'heal',      amount:500  },
    heal800:         { type:'heal',      amount:800  },
    heal1000:        { type:'heal',      amount:1000 },
    heal1500:        { type:'heal',      amount:1500 },
    buff300:         { type:'buff',      amount:300  },
    buff400:         { type:'buff',      amount:400  },
    buffAllAtk300:   { type:'buffAll',   amount:300  },
    buffAllAtk400:   { type:'buffAll',   amount:400  },
    buffAllAtk500:   { type:'buffAll',   amount:500  },
    burn300:         { type:'burn',      amount:300  },
    burn400:         { type:'burn',      amount:400  },
    burn600:         { type:'burn',      amount:600  },
    burn800:         { type:'burn',      amount:800  },
    burn1200:        { type:'burn',      amount:1200 },
    burn1600:        { type:'burn',      amount:1600 },
    destroy1:        { type:'destroy1'              },
    destroyAll:      { type:'destroyAll'            },
    destroyAllSpell: { type:'destroyAll'            },
    drain500:        { type:'drain',     amount:500  },
    drain1000:       { type:'drain',     amount:1000 },
    revive:          { type:'revive'                },
    graveRevive:     { type:'revive'                },
    graveReviveSpell:{ type:'reviveBest'            },
    massRevive:      { type:'massRevive'            },
    draw1:           { type:'draw',      count:1     },
    draw2:           { type:'draw',      count:2     },
    weaken200:       { type:'weakenOne', amount:200  },
    weaken500:       { type:'weakenOne', amount:500  },
    weaken800:       { type:'weakenOne', amount:800  },
    weakenAll300:    { type:'weakenAll', amount:300  },
    taunt:           { type:'taunt'                 },
    stealHand:       { type:'stealHand'             },
    stealField:      { type:'stealField'            },
    shield300:       { type:'shield',    amount:300  },
    raceBuffATK150:  { type:'raceBuffATK',amount:150 },
    raceBuffATK300:  { type:'raceBuffATK',amount:300 },
    destroyAttacker: { type:'destroyAttacker'        },
    destroyAllAtk:   { type:'destroyAllAtk'          },
    negate:          { type:'negate'                },
    negateEffect:    { type:'negate'                },
    healBuff:        { type:'healBuff'              },
    drain500Trap:    { type:'drain',     amount:500  },
  };
  return map[str] || { type: str };
}

/**
 * Führt EINEN Effekt-Eintrag aus.
 * @param {Object} eff      – Effekt-Objekt { type, amount, count, cardId, … }
 * @param {Object} card     – Die auslösende Karte
 * @param {boolean} isPlayer – true = Spieler-Effekt
 */
function _applyOneEffect(eff, card, isPlayer) {
  const bs  = BATTLE_STATE;
  const fld = isPlayer ? bs.playerField : bs.enemyField;
  const eFld = isPlayer ? bs.enemyField  : bs.playerField;
  const tag  = isPlayer ? '' : '(Gegner) ';
  const maxLP = isPlayer ? RUN_STATE.maxHP : bs.enemy.hp;

  switch (eff.type) {

    /* ── Direktschaden ── */
    case 'burn': {
      const dmg = eff.amount || 0;
      if (isPlayer) bs.enemyLP  -= dmg; else bs.playerLP -= dmg;
      battleLog(`🔥 ${tag}${card.name}: ${dmg} Direktschaden`, 'damage');
      animateDamageNumber(isPlayer ? 'enemy' : 'player', dmg);
      break;
    }

    /* ── Prozentualer Schaden (% des gegnerischen max-LP) ── */
    case 'burnPercent': {
      const pct  = eff.amount || 10;
      const dmg  = Math.floor((isPlayer ? bs.enemy.hp : RUN_STATE.maxHP) * pct / 100);
      if (isPlayer) bs.enemyLP  -= dmg; else bs.playerLP -= dmg;
      battleLog(`🔥 ${tag}${card.name}: ${pct}% Schaden (${dmg} LP)`, 'damage');
      animateDamageNumber(isPlayer ? 'enemy' : 'player', dmg);
      break;
    }

    /* ── Heilung ── */
    case 'heal': {
      const hp = eff.amount || 0;
      if (isPlayer) bs.playerLP = Math.min(bs.playerLP + hp, maxLP);
      else          bs.enemyLP  = Math.min(bs.enemyLP  + hp, maxLP);
      battleLog(`💚 ${tag}${card.name}: +${hp} LP`, 'heal');
      break;
    }

    /* ── Prozentualer Heal ── */
    case 'healPercent': {
      const pct = eff.amount || 10;
      const hp  = Math.floor(maxLP * pct / 100);
      if (isPlayer) bs.playerLP = Math.min(bs.playerLP + hp, maxLP);
      else          bs.enemyLP  = Math.min(bs.enemyLP  + hp, maxLP);
      battleLog(`💚 ${tag}${card.name}: +${pct}% LP (+${hp})`, 'heal');
      break;
    }

    /* ── Drain (Schaden + Heilung) ── */
    case 'drain': {
      const dmg = eff.amount || 0;
      if (isPlayer) {
        bs.enemyLP  -= dmg;
        bs.playerLP  = Math.min(bs.playerLP + dmg, maxLP);
      } else {
        bs.playerLP -= dmg;
        bs.enemyLP   = Math.min(bs.enemyLP  + dmg, maxLP);
      }
      battleLog(`🩸 ${tag}${card.name}: Drain ${dmg} LP`, 'damage');
      animateDamageNumber(isPlayer ? 'enemy' : 'player', dmg);
      break;
    }

    /* ── Selbst-Buff ATK ── */
    case 'buff': {
      const amt = eff.amount || 0;
      card.atk += amt;
      battleLog(`⬆ ${tag}${card.name}: ATK +${amt} → ${card.atk}`, 'buff');
      break;
    }

    /* ── Selbst-Buff DEF ── */
    case 'buffDef': {
      const amt = eff.amount || 0;
      card.def += amt;
      battleLog(`🛡 ${tag}${card.name}: DEF +${amt} → ${card.def}`, 'buff');
      break;
    }

    /* ── Alle Verbündeten ATK ── */
    case 'buffAll': {
      const amt = eff.amount || 0;
      fld.forEach(c => { if (c && c !== card) c.atk += amt; });
      battleLog(`⬆ ${tag}${card.name}: Alle Verbündeten +${amt} ATK`, 'buff');
      break;
    }

    /* ── Alle Verbündeten DEF ── */
    case 'buffDefAll': {
      const amt = eff.amount || 0;
      fld.forEach(c => { if (c && c !== card) c.def += amt; });
      battleLog(`🛡 ${tag}${card.name}: Alle Verbündeten +${amt} DEF`, 'buff');
      break;
    }

    /* ── Schwächste/erste feindliche Karte schwächen ATK ── */
    case 'weakenOne': {
      const amt = eff.amount || 0;
      const t   = eFld.find(c => c !== null);
      if (t) {
        t.atk = Math.max(0, t.atk - amt);
        battleLog(`⬇ ${tag}${card.name}: ${t.name} -${amt} ATK → ${t.atk}`, 'buff');
      }
      break;
    }

    /* ── Schwächste/erste feindliche Karte schwächen DEF ── */
    case 'weakenDefOne': {
      const amt = eff.amount || 0;
      const t   = eFld.find(c => c !== null);
      if (t) {
        t.def = Math.max(0, t.def - amt);
        battleLog(`⬇ ${tag}${card.name}: ${t.name} -${amt} DEF`, 'buff');
      }
      break;
    }

    /* ── Alle Feinde schwächen ATK ── */
    case 'weakenAll': {
      const amt = eff.amount || 0;
      eFld.forEach(e => { if (e) e.atk = Math.max(0, e.atk - amt); });
      battleLog(`⬇ ${tag}${card.name}: Alle Feinde -${amt} ATK`, 'buff');
      break;
    }

    /* ── 1 Feind zerstören (schwächstes zuerst, dann erstes) ── */
    case 'destroy1': {
      // Schwächstes Monster bevorzugen
      const aliveSlots = eFld.map((c,i) => c ? i : -1).filter(i => i >= 0);
      if (aliveSlots.length > 0) {
        const target = aliveSlots.reduce((a, b) =>
          (eFld[a]?.atk ?? 9999) < (eFld[b]?.atk ?? 9999) ? a : b
        );
        battleLog(`💥 ${tag}${card.name}: Zerstört ${eFld[target].name}`, 'damage');
        _destroyCardOnField(eFld, target, !isPlayer);
      } else {
        battleLog(`✨ ${tag}${card.name}: Kein Ziel`, '');
      }
      break;
    }

    /* ── Alle Feinde zerstören ── */
    case 'destroyAll': {
      let count = 0;
      for (let i = 0; i < eFld.length; i++) {
        if (eFld[i]) { battleLog(`💥 ${tag}${card.name}: Zerstört ${eFld[i].name}`, 'damage'); _destroyCardOnField(eFld, i, !isPlayer); count++; }
      }
      if (count === 0) battleLog(`✨ ${tag}${card.name}: Keine Ziele`, '');
      break;
    }

    /* ── Angreifer zerstören (nur in Trap-Kontext sinnvoll) ── */
    case 'destroyAttacker': {
      // Wird per checkAndActivateTraps mit attackerSlot aufgerufen,
      // daher hier als Fallback: erstes feindliches Monster
      const ai = eFld.findIndex(c => c !== null);
      if (ai >= 0) {
        battleLog(`💥 ${tag}${card.name}: ${eFld[ai].name} zerstört!`, 'damage');
        _destroyCardOnField(eFld, ai, !isPlayer);
      }
      break;
    }

    /* ── Alle angreifenden Monster zerstören ── */
    case 'destroyAllAtk': {
      eFld.forEach((c, i) => {
        if (c && c.mode === 'attack') {
          battleLog(`💥 ${tag}${card.name}: ${c.name} zerstört!`, 'damage');
          _destroyCardOnField(eFld, i, !isPlayer);
        }
      });
      break;
    }

    /* ── Karte ziehen ── */
    case 'draw': {
      const n = eff.count || 1;
      if (isPlayer) { for (let i = 0; i < n; i++) engineDrawCard(); }
      battleLog(`🃏 ${tag}${card.name}: ${n} Karte${n > 1 ? 'n' : ''} ziehen`, 'buff');
      break;
    }

    /* ── Letztes Monster vom Friedhof ── */
    case 'revive': {
      const grave    = isPlayer ? bs.playerGrave : bs.enemyGrave;
      const monsters = grave.filter(c => c.type === 'monster' || c.type === 'fusion');
      const monster  = monsters.at(-1);
      if (monster) {
        const slot = fld.findIndex(c => c === null);
        if (slot >= 0) {
          fld[slot] = { ...monster, mode:'attack', uid: crypto.randomUUID() };
          battleLog(`✨ ${tag}${card.name}: ${monster.name} wiederbelebt`, 'heal');
          applyFieldSynergies(isPlayer);
        }
      } else {
        battleLog(`✨ ${tag}${card.name}: Friedhof leer`, '');
      }
      break;
    }

    /* ── Stärkstes Monster vom Friedhof ── */
    case 'reviveBest': {
      const grave    = isPlayer ? bs.playerGrave : bs.enemyGrave;
      const monsters = grave.filter(c => c.type === 'monster' || c.type === 'fusion');
      if (monsters.length === 0) { battleLog(`✨ ${tag}${card.name}: Friedhof leer`, ''); break; }
      const best = monsters.reduce((a, b) => a.atk >= b.atk ? a : b);
      const slot  = fld.findIndex(c => c === null);
      if (slot >= 0) {
        fld[slot] = { ...best, mode:'attack', uid: crypto.randomUUID() };
        battleLog(`✨ ${tag}${card.name}: ${best.name} (${best.atk} ATK) wiederbelebt!`, 'heal');
        applyFieldSynergies(isPlayer);
      }
      break;
    }

    /* ── Alle Monster vom Friedhof ── */
    case 'massRevive': {
      const grave    = isPlayer ? bs.playerGrave : bs.enemyGrave;
      const monsters = grave.filter(c => c.type === 'monster');
      let revived = 0;
      for (const m of monsters) {
        const slot = fld.findIndex(c => c === null);
        if (slot < 0) break;
        fld[slot] = { ...m, mode:'attack', uid: crypto.randomUUID() };
        revived++;
      }
      battleLog(`💀 ${tag}${card.name}: ${revived} Monster wiederbelebt!`, 'heal');
      if (revived > 0) applyFieldSynergies(isPlayer);
      break;
    }

    /* ── Spezialbeschwörung: Karte X aus Deck/Pool ── */
    case 'specialSummon': {
      const cid  = eff.cardId;
      if (!cid) { battleLog(`⚠ specialSummon: Keine cardId`, 'warn'); break; }
      const slot  = fld.findIndex(c => c === null);
      if (slot < 0) { battleLog(`⚠ ${tag}${card.name}: Kein freier Slot`, 'warn'); break; }

      // Karte suchen: im Deck, in Handkarten, oder im globalen Pool
      let target = null;
      const deck = isPlayer ? bs.playerDeck : bs.enemyDeck;
      const deckIdx = deck ? deck.findIndex(c => c.id === cid) : -1;
      if (deckIdx >= 0) {
        target = deck.splice(deckIdx, 1)[0];
      } else {
        // Fallback: aus globalem Karten-Pool klonen
        const allCards = [
          ...(window.DD_CUSTOM?.cards || []),
          ...(typeof CARDS !== 'undefined' ? CARDS : [])
        ];
        const found = allCards.find(c => c.id === cid);
        if (found) target = cloneCard(found);
      }

      if (target) {
        fld[slot] = { ...target, mode:'attack', uid: crypto.randomUUID() };
        battleLog(`⚡ ${tag}${card.name}: Beschwört ${target.name}!`, 'summon');
        applyOnSummonEffect(fld[slot], isPlayer); // Kettenbeschwörung möglich
        applyFieldSynergies(isPlayer);
      } else {
        battleLog(`✨ ${tag}${card.name}: ${cid} nicht gefunden`, '');
      }
      break;
    }

    /* ── Stiehlt Karte aus Gegnerhand ── */
    case 'stealHand': {
      if (!isPlayer) break;
      const eHand = bs.enemyHand;
      if (!eHand || eHand.length === 0) { battleLog(`✨ ${card.name}: Gegnerhand leer`, ''); break; }
      const idx    = Math.floor(Math.random() * eHand.length);
      const stolen = eHand.splice(idx, 1)[0];
      bs.hand.push(stolen);
      battleLog(`🃏 ${card.name}: Gestohlen — ${stolen.name}!`, 'buff');
      break;
    }

    /* ── Übernimmt ein Gegnerfeld-Monster ── */
    case 'stealField': {
      const tIdx = eFld.findIndex(c => c !== null);
      if (tIdx < 0) { battleLog(`✨ ${card.name}: Kein Ziel auf Gegnerfeld`, ''); break; }
      const fSlot = fld.findIndex(c => c === null);
      if (fSlot < 0) { battleLog(`⚠ ${card.name}: Kein freier Slot`, 'warn'); break; }
      const stolen = eFld[tIdx];
      eFld[tIdx]   = null;
      fld[fSlot]   = { ...stolen, mode:'attack', uid: crypto.randomUUID() };
      battleLog(`⚡ ${card.name}: ${stolen.name} übernommen!`, 'buff');
      applyFieldSynergies(isPlayer);
      applyFieldSynergies(!isPlayer);
      break;
    }

    /* ── Rüstung ── */
    case 'shield': {
      const amt = eff.amount || 0;
      card._shield = (card._shield || 0) + amt;
      battleLog(`🛡 ${tag}${card.name}: +${amt} Rüstung aktiv`, 'buff');
      break;
    }

    /* ── Taunt (wird bevorzugt angegriffen) ── */
    case 'taunt':
      card.isTaunt = true;
      battleLog(`🛡 ${tag}${card.name}: Zieht alle Angriffe auf sich`, 'buff');
      break;

    /* ── Angriff negieren ── */
    case 'negate':
      battleLog(`🛡 ${tag}${card.name}: Angriff negiert!`, 'buff');
      // Rückgabe-Flag wird im Trap-Kontext behandelt
      break;

    /* ── Rassen-Buff ATK ── */
    case 'raceBuffATK': {
      const amt  = eff.amount || 0;
      const race = card.race;
      if (!race) break;
      fld.forEach(c => { if (c && c !== card && c.race === race) c.atk += amt; });
      battleLog(`⬆ ${tag}${card.name}: Alle ${race} +${amt} ATK`, 'buff');
      break;
    }

    /* ── Rassen-Buff DEF ── */
    case 'raceBuffDEF': {
      const amt  = eff.amount || 0;
      const race = card.race;
      if (!race) break;
      fld.forEach(c => { if (c && c !== card && c.race === race) c.def += amt; });
      battleLog(`🛡 ${tag}${card.name}: Alle ${race} +${amt} DEF`, 'buff');
      break;
    }

    /* ── Passiver Angriffs-Burn (wird in engine.js beim Angriff geprüft) ── */
    case 'burnOnAttack':
      card._burnOnAttack = eff.amount || 0;
      // Kein battleLog hier — wird beim Angriff ausgelöst
      break;

    /* ── Legacy: healBuff (500 LP + 400 ATK) ── */
    case 'healBuff':
      if (isPlayer) bs.playerLP = Math.min(bs.playerLP + 500, maxLP);
      card.atk += 400;
      battleLog(`✨ ${tag}${card.name}: +500 LP & ATK +400`, 'heal');
      break;

    default:
      // Unbekannter Effekt — ignorieren
      break;
  }

  if (typeof emit === 'function') {
    emit('effect:applied', {
      effectType: eff.type,
      cardId: card?.id || null,
      isPlayer,
    });
  }
}

/* ══════════════════════════════════════════════════
   ÖFFENTLICHE EFFEKT-AUSLÖSER
══════════════════════════════════════════════════ */

/**
 * Monster-On-Summon-Effekte ausführen.
 * Unterstützt card.effects (Array) UND card.effect (String, Legacy).
 */
function applyOnSummonEffect(card, isPlayer) {
  const effs = _resolveEffects(card);
  if (effs.length === 0) return;

  for (const eff of effs) {
    _applyOneEffect(eff, card, isPlayer);
  }
  checkWinCondition();
}

/**
 * Spell-Effekte (von Hand aktiviert).
 * Gleiche Effektliste wie Summon — Kontext entscheidet.
 */
function applySpellEffect(card, isPlayer) {
  const effs = _resolveEffects(card);
  if (effs.length === 0) return;

  for (const eff of effs) {
    _applyOneEffect(eff, card, isPlayer);
  }
  checkWinCondition();
}

/**
 * Wird aus engine.js aufgerufen wenn ein Monster
 * mit burnOnAttack-Passiv angreift.
 */
function applyBurnOnAttack(card, isPlayer) {
  if (!card._burnOnAttack) return;
  const bs  = BATTLE_STATE;
  const dmg = card._burnOnAttack;
  if (isPlayer) bs.enemyLP  -= dmg; else bs.playerLP -= dmg;
  battleLog(`🔥 ${card.name}: ${dmg} Brandschaden beim Angriff!`, 'damage');
  animateDamageNumber(isPlayer ? 'enemy' : 'player', dmg);
  checkWinCondition();
}

/* ══════════════════════════════════════════════════
   FALLEN (Spieler- und Gegner-Fallen)
══════════════════════════════════════════════════ */

function checkAndActivateTraps(attackerSlot) {
  const bs = BATTLE_STATE;
  let attackCancelled = false;

  bs.playerSTZone.forEach((card, idx) => {
    if (!card || card.type !== 'trap' || card.trigger !== 'onAttacked') return;

    battleLog(`⚡ Falle aktiviert: ${card.name}!`, 'damage');
    bs.playerSTZone[idx] = null;

    const effs = _resolveEffects(card);
    for (const eff of effs) {
      if (eff.type === 'destroyAttacker') {
        if (bs.enemyField[attackerSlot]) {
          battleLog(`💥 ${card.name}: ${bs.enemyField[attackerSlot].name} zerstört!`, 'damage');
          _destroyCardOnField(bs.enemyField, attackerSlot, false);
          attackCancelled = true;
        }
      } else if (eff.type === 'destroyAllAtk') {
        bs.enemyField.forEach((c, i) => {
          if (c && c.mode === 'attack') {
            battleLog(`💥 ${card.name}: ${c.name} zerstört!`, 'damage');
            _destroyCardOnField(bs.enemyField, i, false);
          }
        });
        attackCancelled = true;
      } else if (eff.type === 'negate') {
        battleLog(`🛡 ${card.name}: Angriff negiert!`, 'buff');
        attackCancelled = true;
      } else {
        _applyOneEffect(eff, card, true);
      }
    }
  });

  if (attackCancelled) applyFieldSynergies(false);
  return attackCancelled;
}

function checkEnemyTraps(playerAttackerSlot) {
  const bs = BATTLE_STATE;
  let attackCancelled = false;

  bs.enemySTZone.forEach((card, idx) => {
    if (!card || card.type !== 'trap' || card.trigger !== 'onAttacked') return;

    battleLog(`⚡⚡ GEGNER-FALLE: ${card.name} aktiviert!`, 'damage');
    bs.enemySTZone[idx] = null;
    card.hidden = false;

    const effs = _resolveEffects(card);
    for (const eff of effs) {
      if (eff.type === 'destroyAttacker') {
        const attacker = bs.playerField[playerAttackerSlot];
        if (attacker) {
          battleLog(`💥 ${card.name}: ${attacker.name} zerstört!`, 'damage');
          _destroyCardOnField(bs.playerField, playerAttackerSlot, true);
          attackCancelled = true;
        }
      } else if (eff.type === 'destroyAllAtk') {
        bs.playerField.forEach((c, i) => {
          if (c && c.mode === 'attack') {
            battleLog(`💥 ${card.name}: ${c.name} zerstört!`, 'damage');
            _destroyCardOnField(bs.playerField, i, true);
          }
        });
        attackCancelled = true;
      } else if (eff.type === 'negate') {
        battleLog(`🛡 ${card.name}: Dein Angriff wurde negiert!`, 'buff');
        attackCancelled = true;
      } else {
        _applyOneEffect(eff, card, false);
      }
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

/* ══════════════════════════════════════════════════
   HILFSFUNKTIONEN
══════════════════════════════════════════════════ */

function _destroyCardOnField(field, slotIdx, isPlayerCard) {
  const card = field[slotIdx];
  if (!card) return;
  const fieldId = isPlayerCard ? 'player-field' : 'enemy-field';
  animateCardShatter(fieldId, slotIdx);
  if (!isPlayerCard && typeof gainDimensionsSeelen === 'function') {
    gainDimensionsSeelen(1, true);
    if (typeof battleLog === 'function') battleLog('✦ +1 DS', 'buff');
  }
  sendToGrave(card, isPlayerCard);
  checkOnDeathSynergies(card, isPlayerCard);
  field[slotIdx] = null;
}

function sendToGrave(card, isPlayerCard) {
  if (!card) return;
  if (isPlayerCard) BATTLE_STATE.playerGrave.push(card);
  else              BATTLE_STATE.enemyGrave.push(card);
}

/* ══════════════════════════════════════════════════
   EFFEKT-BESCHREIBUNG (für UI / Hover-Preview)
══════════════════════════════════════════════════ */

/**
 * Gibt eine lesbare Beschreibung für card.effects (Array)
 * oder card.effect (String, Legacy) zurück.
 */
function getEffectDescription(effectInput, card) {
  if (!effectInput) return '';

  // Altes String-Format (Legacy)
  if (typeof effectInput === 'string') {
    const eff = _legacyStringToEffect(effectInput);
    return _describeOneEffect(eff, card);
  }

  // Neues Array-Format
  if (Array.isArray(effectInput)) {
    return effectInput.map(e => _describeOneEffect(e, card)).filter(Boolean).join(' • ');
  }

  return String(effectInput);
}

function _describeOneEffect(eff, card) {
  if (!eff || !eff.type) return '';
  const a = eff.amount || 0;
  const n = eff.count  || 1;

  switch (eff.type) {
    case 'burn':           return `🔥 ${a} Direktschaden`;
    case 'burnPercent':    return `🔥 ${a}% Schaden (Gegner-LP)`;
    case 'heal':           return `💚 Heile ${a} LP`;
    case 'healPercent':    return `💚 Heile ${a}% max. LP`;
    case 'drain':          return `🩸 Drain ${a} LP`;
    case 'buff':           return `⬆ +${a} ATK (selbst)`;
    case 'buffDef':        return `🛡 +${a} DEF (selbst)`;
    case 'buffAll':        return `⬆ Alle Verbündeten +${a} ATK`;
    case 'buffDefAll':     return `🛡 Alle Verbündeten +${a} DEF`;
    case 'weakenOne':      return `⬇ Feind -${a} ATK`;
    case 'weakenDefOne':   return `⬇ Feind -${a} DEF`;
    case 'weakenAll':      return `⬇ Alle Feinde -${a} ATK`;
    case 'destroy1':       return `💥 Zerstört 1 feindl. Monster`;
    case 'destroyAll':     return `💥 Zerstört ALLE feindl. Monster`;
    case 'destroyAttacker':return `💥 Zerstört angreifendes Monster`;
    case 'destroyAllAtk':  return `💥 Zerstört alle angreifenden Monster`;
    case 'draw':           return `🃏 Ziehe ${n} Karte${n > 1 ? 'n' : ''}`;
    case 'revive':         return `✨ Belebt letztes Monster aus Friedhof`;
    case 'reviveBest':     return `✨ Belebt stärkstes Monster aus Friedhof`;
    case 'massRevive':     return `💀 Belebt ALLE Monster aus Friedhof`;
    case 'specialSummon': {
      const cid = eff.cardId || '?';
      const name = _lookupCardName(cid);
      return `⚡ Beschwört ${name} bei Beschwörung`;
    }
    case 'stealHand':      return `🃏 Stiehlt Karte aus Gegnerhand`;
    case 'stealField':     return `⚡ Übernimmt ein Gegnerfeld-Monster`;
    case 'shield':         return `🛡 +${a} Rüstung`;
    case 'taunt':          return `🛡 Taunt: Wird bevorzugt angegriffen`;
    case 'negate':         return `🛡 Negiert Angriff`;
    case 'raceBuffATK':    return `⬆ Gleichrassige +${a} ATK`;
    case 'raceBuffDEF':    return `🛡 Gleichrassige +${a} DEF`;
    case 'burnOnAttack':   return `🔥 Bei Angriff: +${a} Brandschaden`;
    case 'healBuff':       return `✨ +500 LP & +400 ATK`;
    default: return eff.type;
  }
}

/** Hilfsfunktion: Kartenname via ID nachschlagen */
function _lookupCardName(cardId) {
  const all = [
    ...(window.DD_CUSTOM?.cards || []),
    ...(window.DD_CUSTOM?.fusionMonsters || []),
    ...(typeof CARDS !== 'undefined' ? CARDS : []),
  ];
  return all.find(c => c.id === cardId)?.name || cardId;
}
