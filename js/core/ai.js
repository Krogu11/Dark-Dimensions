/* ============================================================
   core/ai.js — Smarte Gegner-KI v2.0
   ============================================================
   Neue Logik:
   • Fusion wird IMMER zuerst probiert (stärkstes Ergebnis zählt)
   • Beschwörung: ATK wenn Sieg möglich, sonst DEF-Modus mit bester DEF
   • Angriff: NUR wenn Sieg garantiert (ATK > Ziel-Stat)
   • Feld-Modus-Anpassung: Outmatched-Monster wechseln zu DEF
   • multiAttack / maxSummons / final_boss bleiben erhalten
   ============================================================ */

/* ──────────────────────────────────────────────────
   HAUPT-ROUTINE
────────────────────────────────────────────────── */
function enemyFullTurn() {
  const bs       = BATTLE_STATE;
  const enemy    = bs.enemy;
  const behavior = enemy.behavior;

  if (!bs.enemyHand) bs.enemyHand = [];
  battleLog(`── ${enemy.portrait} ${enemy.name} zieht ──`, 'phase');

  // 1. Karten ziehen
  const drawCount = (behavior.startsWith('boss') || behavior === 'final_boss') ? 3 : 2;
  for (let i = 0; i < drawCount && bs.enemyDeck.length > 0; i++) {
    if (bs.enemyHand.length < 8) {
      const c = bs.enemyDeck.pop();
      c.mode   = 'attack';
      c.hidden = false;
      bs.enemyHand.push(c);
    }
  }

  // 2. Spells aktivieren (vor Beschwörung)
  aiPlaySpells(behavior);

  // 3. Fusion versuchen (bis Feld voll oder keine Rezepte mehr)
  aiFusion(behavior);

  // 4. Monster beschwören (maxSummons mal)
  const maxSummons = enemy.maxSummons || 1;
  for (let s = 0; s < maxSummons; s++) {
    if (!aiSummon(behavior)) break;
  }

  // 5. Bestehende Feld-Monster ggf. in DEF wechseln
  aiAdaptFieldModes();

  // 6. Fallen setzen
  aiSetTraps();

  // 7. Angreifen
  aiAttack(behavior);

  battleLog(`── Dein Zug ──`, 'phase');
}

/* ──────────────────────────────────────────────────
   HILFSFUNKTION: Stärkste Spieler-ATK
────────────────────────────────────────────────── */
function _strongestPlayerATK() {
  const field = BATTLE_STATE.playerField;
  let best = 0;
  field.forEach(c => {
    if (!c) return;
    const stat = c.mode === 'defense' ? c.def : c.atk;
    if (stat > best) best = stat;
  });
  return best;
}

/* ──────────────────────────────────────────────────
   HILFSFUNKTION: fieldBonus anwenden (nur einmal)
────────────────────────────────────────────────── */
function _applyFieldBonus(card) {
  if (card._fieldBonus) return card; // bereits angewendet
  const bonus = BATTLE_STATE.enemy.fieldBonus || 0;
  const placed = { ...card };
  placed.atk += bonus;
  placed.def += Math.floor(bonus * 0.5);
  placed._fieldBonus = bonus;
  return placed;
}

/* ──────────────────────────────────────────────────
   KI: SPELLS AKTIVIEREN
────────────────────────────────────────────────── */
function aiPlaySpells(behavior) {
  const bs = BATTLE_STATE;
  if (!bs.enemyHand) return;

  const toPlay = [];
  bs.enemyHand.forEach((card, idx) => {
    if (card.type !== 'spell') return;
    let play = false;

    if (behavior === 'final_boss') {
      play = true;
    } else if (behavior === 'control' || behavior === 'boss_balanced') {
      play = true;
    } else if (behavior === 'aggressive' || behavior === 'boss_aggro') {
      play = ['burn800','burn1200','drain1000','buffAllAtk400','destroyAllSpell'].includes(card.effect);
    } else if (behavior === 'swarm') {
      play = card.effect.includes('heal') || card.effect.includes('buff');
    } else {
      play = card.effect.includes('destroy') || card.effect.includes('heal');
    }

    if (play) toPlay.push(idx);
  });

  toPlay.reverse().forEach(idx => {
    const card = bs.enemyHand[idx];
    battleLog(`🃏 ${bs.enemy.name} aktiviert: ${card.name}`, 'spell');
    applySpellEffect(card, false);
    sendToGrave(card, false);
    bs.enemyHand.splice(idx, 1);
  });
}

/* ──────────────────────────────────────────────────
   KI: FUSION
   Prüft alle Hand-Kombinationen auf Rezepte.
   Führt Fusion durch wenn Ergebnis stärker als
   das beste Einzelmonster in der Hand ist.
────────────────────────────────────────────────── */
function aiFusion(behavior) {
  const bs = BATTLE_STATE;
  if (!bs.enemyHand) return;

  // Solange Fusionen möglich sind und freie Slots existieren
  let fused = true;
  while (fused) {
    fused = false;
    const freeSlot = bs.enemyField.findIndex(c => c === null);
    if (freeSlot < 0) break;

    const monsters = bs.enemyHand.filter(c => c.type === 'monster' || c.type === 'fusion');
    if (monsters.length < 2) break;

    // Beste Einzel-ATK in der Hand (Vergleichswert)
    const bestSingleATK = monsters.reduce((best, c) => Math.max(best, c.atk), 0);

    let bestFusion = null;
    let bestFusionATK = -1;
    let bestIdx1 = -1;
    let bestIdx2 = -1;

    // Alle Paare prüfen
    for (let i = 0; i < monsters.length; i++) {
      for (let j = i + 1; j < monsters.length; j++) {
        const recipe = getFusionResult(monsters[i].id, monsters[j].id);
        if (!recipe) continue;
        const result = getCardById(recipe.result);
        if (!result) continue;
        if (result.atk > bestFusionATK) {
          bestFusionATK   = result.atk;
          bestFusion      = result;
          bestIdx1        = bs.enemyHand.indexOf(monsters[i]);
          bestIdx2        = bs.enemyHand.indexOf(monsters[j]);
        }
      }
    }

    // Nur fusionieren wenn Ergebnis wirklich besser als Einzelkarte
    if (!bestFusion || bestFusionATK <= bestSingleATK) break;

    const fusionCard = _applyFieldBonus(cloneCard(bestFusion));

    // Materialien aus Hand entfernen (höherer Index zuerst)
    const removeIndices = [bestIdx1, bestIdx2].sort((a, b) => b - a);
    const mat1name = bs.enemyHand[removeIndices[1]].name;
    const mat2name = bs.enemyHand[removeIndices[0]].name;
    removeIndices.forEach(i => bs.enemyHand.splice(i, 1));

    // Modus bestimmen
    const strongestPlayer = _strongestPlayerATK();
    const useATK = fusionCard.atk > strongestPlayer || behavior === 'final_boss' || behavior === 'boss_aggro';
    fusionCard.mode = useATK ? 'attack' : 'defense';

    bs.enemyField[freeSlot] = fusionCard;
    battleLog(`⚗ ${bs.enemy.name} fusioniert: ${mat1name} + ${mat2name} → ${fusionCard.name} (ATK ${fusionCard.atk}) [${useATK ? '⚔' : '🛡'}]`, 'summon');
    applyOnSummonEffect(fusionCard, false);
    applyFieldSynergies(false);
    checkOnSummonSynergies(fusionCard, false);

    fused = true; // nochmal prüfen ob weitere Fusion möglich
  }
}

/* ──────────────────────────────────────────────────
   KI: MONSTER BESCHWÖREN
   Entscheidet zwischen ATK- und DEF-Modus
   basierend auf stärkstem Spieler-Monster.
────────────────────────────────────────────────── */
function aiSummon(behavior) {
  const bs = BATTLE_STATE;
  if (!bs.enemyHand) return false;

  const freeSlot = bs.enemyField.findIndex(c => c === null);
  if (freeSlot < 0) return false;

  // Nur Monster-Karten (kein Fusion — wird separat behandelt)
  const monsters = bs.enemyHand.filter(c => c.type === 'monster');
  if (monsters.length === 0) return false;

  const strongestPlayer = _strongestPlayerATK();

  // Kandidaten mit Bonus berechnen
  const candidates = monsters.map(c => {
    const withBonus = _applyFieldBonus({ ...c });
    return { card: c, withBonus };
  });

  // Kann irgendein Monster den Spieler schlagen?
  const canWin = candidates.some(({ withBonus }) => withBonus.atk > strongestPlayer);

  let chosen;
  if (canWin) {
    // Stärkstes angriffsfähiges Monster wählen
    chosen = candidates
      .filter(({ withBonus }) => withBonus.atk > strongestPlayer || behavior === 'final_boss')
      .sort((a, b) => b.withBonus.atk - a.withBonus.atk)[0];

    // Falls kein Filter-Treffer (z.B. final_boss): stärkstes gesamt
    if (!chosen) chosen = candidates.sort((a, b) => b.withBonus.atk - a.withBonus.atk)[0];
  } else {
    // Beste DEF beschwören
    chosen = candidates.sort((a, b) => b.withBonus.def - a.withBonus.def)[0];
  }

  if (!chosen) return false;

  const placed = _applyFieldBonus({ ...chosen.card });

  // Modus: ATK wenn Sieg möglich, sonst DEF
  if (canWin || behavior === 'final_boss' || behavior === 'boss_aggro') {
    placed.mode = 'attack';
  } else {
    placed.mode = 'defense';
  }

  // tank-Behavior: immer DEF
  if (behavior === 'tank') placed.mode = 'defense';

  bs.enemyField[freeSlot] = placed;

  // Aus Hand entfernen
  const hi = bs.enemyHand.indexOf(chosen.card);
  if (hi >= 0) bs.enemyHand.splice(hi, 1);

  const modeStr = placed.mode === 'defense' ? '🛡 Verteidigung' : '⚔ Angriff';
  const raceStr = placed.race ? ` [${placed.race}]` : '';
  battleLog(`👹 ${bs.enemy.name} beschwört: ${placed.name}${raceStr} [${modeStr}] ATK ${placed.atk} / DEF ${placed.def}`, 'summon');
  applyOnSummonEffect(placed, false);
  applyFieldSynergies(false);
  checkOnSummonSynergies(placed, false);
  return true;
}

/* ──────────────────────────────────────────────────
   KI: FELD-MODUS ANPASSEN
   Outmatched-Monster wechseln zu DEF,
   stärkere Monster gehen in ATK zurück.
────────────────────────────────────────────────── */
function aiAdaptFieldModes() {
  const bs = BATTLE_STATE;
  const strongestPlayer = _strongestPlayerATK();
  if (strongestPlayer === 0) return; // Spieler hat keine Monster

  bs.enemyField.forEach((card, i) => {
    if (!card) return;
    if (BATTLE_STATE.enemy.behavior === 'final_boss') return; // Final Boss weicht nie

    const wouldWin = card.atk > strongestPlayer;

    if (!wouldWin && card.mode !== 'defense') {
      card.mode = 'defense';
      battleLog(`🛡 ${card.name} wechselt in Verteidigungsmodus (DEF ${card.def})`, 'combat');
    } else if (wouldWin && card.mode !== 'attack') {
      card.mode = 'attack';
      battleLog(`⚔ ${card.name} geht in Angriffsmodus (ATK ${card.atk})`, 'combat');
    }
  });
}

/* ──────────────────────────────────────────────────
   KI: FALLEN SETZEN
────────────────────────────────────────────────── */
function aiSetTraps() {
  const bs = BATTLE_STATE;
  if (!bs.enemyHand) return;

  const toSet = [];
  bs.enemyHand.forEach((card, idx) => {
    if (card.type !== 'trap') return;
    const freeSlot = bs.enemySTZone.findIndex(c => c === null);
    if (freeSlot >= 0) toSet.push({ idx, slot: freeSlot });
  });

  toSet.reverse().forEach(({ idx }) => {
    const actualSlot = bs.enemySTZone.findIndex(c => c === null);
    if (actualSlot < 0) return;
    const card = bs.enemyHand[idx];
    card.hidden = true;
    bs.enemySTZone[actualSlot] = card;
    bs.enemyHand.splice(idx, 1);
    battleLog(`🔽 ${bs.enemy.name} stellt eine Falle auf...`, 'spell');
  });
}

/* ──────────────────────────────────────────────────
   KI: ANGRIFF
   Greift NUR an wenn Sieg garantiert.
   final_boss / boss_aggro greifen immer an.
────────────────────────────────────────────────── */
function aiAttack(behavior) {
  const bs          = BATTLE_STATE;
  const multiAttack = bs.enemy.multiAttack || false;

  // Alle Monster im Angriffsmodus sammeln
  const attackerSlots = [];
  bs.enemyField.forEach((c, i) => {
    if (c && c.mode !== 'defense') attackerSlots.push(i);
  });

  attackerSlots.forEach(atkSlot => {
    if (bs.gameOver) return;

    const attacker = bs.enemyField[atkSlot];
    if (!attacker) return;

    const attackCount = multiAttack
      ? (behavior === 'final_boss' ? 3 : 2)
      : 1;

    for (let hit = 0; hit < attackCount; hit++) {
      if (bs.gameOver) break;
      if (!bs.enemyField[atkSlot]) break;

      const playerHasMonsters = bs.playerField.some(Boolean);

      if (!playerHasMonsters) {
        // Direktangriff — immer erlaubt
        const dmg = bs.enemyField[atkSlot].atk;
        bs.playerLP -= dmg;
        animateDamageNumber('player', dmg);
        battleLog(`💥 ${bs.enemyField[atkSlot].name} Direktangriff → ${dmg} Schaden`, 'damage');
        checkWinCondition();
      } else {
        const target = aiFindTarget(bs.enemyField[atkSlot], behavior);
        if (target !== null) {
          resolveCombat(atkSlot, target, true);
        } else if (behavior === 'final_boss' || behavior === 'boss_aggro') {
          // Diese Behaviors greifen auch bei Nachteil an
          const forceTarget = aiFindForceTarget();
          if (forceTarget >= 0) resolveCombat(atkSlot, forceTarget, true);
        }
        // Alle anderen: kein Angriff wenn kein Vorteil
      }
    }
  });
}

/* ──────────────────────────────────────────────────
   KI: ZIEL FINDEN (smarkt)
   Gibt Slot-Index zurück, NUR wenn Angriff gewinnt.
   Sonst null.
────────────────────────────────────────────────── */
function aiFindTarget(attacker, behavior) {
  const bs    = BATTLE_STATE;
  const field = bs.playerField;

  // Taunt zuerst — und nur wenn wir den auch schlagen können
  const tauntSlot = field.findIndex(c => c && c.isTaunt);
  if (tauntSlot >= 0) {
    const taunt = field[tauntSlot];
    const tauntStat = taunt.mode === 'defense' ? taunt.def : taunt.atk;
    if (attacker.atk > tauntStat || behavior === 'final_boss') return tauntSlot;
    return null; // Taunt aber nicht besiegbar → kein Angriff
  }

  let bestSlot  = null;
  let bestScore = -Infinity;

  field.forEach((def, idx) => {
    if (!def) return;

    const defStat = def.mode === 'defense' ? def.def : def.atk;
    const diff    = attacker.atk - defStat;

    // Grundregel: nur angreifen wenn Vorteil (diff > 0)
    // final_boss / boss_aggro: auch bei Gleichstand oder leichtem Nachteil
    const threshold = (behavior === 'final_boss') ? -Infinity
                    : (behavior === 'boss_aggro')  ? -200
                    : (behavior === 'aggressive')   ? 0
                    : (behavior === 'swarm')         ? 50
                    : (behavior === 'control' || behavior === 'boss_balanced') ? 0
                    : 0; // default: nur klare Siege

    if (diff <= threshold && behavior !== 'final_boss') return; // kein Angriff

    let score = diff;

    // Prioritäten je Behavior
    if (behavior === 'aggressive' || behavior === 'boss_aggro') {
      // Stärkstes Monster zuerst eliminieren
      score = diff + defStat * 0.5;
    } else if (behavior === 'control' || behavior === 'boss_balanced') {
      // Effektivsten Trade suchen
      score = diff + (def.effect ? 100 : 0);
    } else if (behavior === 'swarm') {
      // Schwächstes zuerst
      score = -defStat + (diff > 0 ? 500 : 0);
    }

    if (score > bestScore) { bestScore = score; bestSlot = idx; }
  });

  return bestSlot;
}

/* ──────────────────────────────────────────────────
   FORCE TARGET: Für final_boss / boss_aggro
   Wählt das schwächste gegnerische Monster
   (wenn normales Targeting nichts findet).
────────────────────────────────────────────────── */
function aiFindForceTarget() {
  const field = BATTLE_STATE.playerField;
  let weakestSlot = -1;
  let weakestStat = Infinity;

  field.forEach((c, i) => {
    if (!c) return;
    const stat = c.mode === 'defense' ? c.def : c.atk;
    if (stat < weakestStat) { weakestStat = stat; weakestSlot = i; }
  });

  return weakestSlot;
}
