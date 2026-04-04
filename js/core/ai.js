/* ============================================================
   core/ai.js — Smarte Gegner-KI v3.0
   ============================================================
   Verbesserungen gegenüber v2.0:

   • Lethal Check: KI prüft zu Beginn des Angriffs ob der Spieler
     diesen Zug besiegt werden kann — optimiert dann Angriff
     vollständig auf maximalen Schaden

   • Support-Monster-Targeting: Buff- und Rassen-Buff-Monster
     werden als erste Angriffsziele priorisiert (da sie andere
     Monster verstärken → Entfernung senkt feindliche Stärke)

   • Dynamische Neubewertung: Nach Vernichtung eines Support-
     Monsters ruft die KI sofort aiAdaptFieldModes() auf —
     geschwächte Monster wechseln ggf. in DEF-Modus

   • Effekt-bewusste Beschwörung & Fusion: Karten mit starken
     Effekten bekommen einen Score-Bonus → Effekt-Karten werden
     gegenüber reinen Stat-Karten bevorzugt

   • Combo Awareness / Fusion-Hold: KI hält Fusion-Materialien
     zurück wenn ein passendes Material in Hand oder Deck liegt
     (außer bei aggressiven Behaviors)

   • Risikoabschätzung: Kein Angriff wenn KI-Monster dabei stirbt
     und kein strategischer Vorteil entsteht (threshold-gesteuert)
   ============================================================ */


/* ══════════════════════════════════════════════════
   KI-SCORING KONSTANTEN
══════════════════════════════════════════════════ */

/**
 * Effekte die ANDERE Monster stärken → hohe Targeting-Priorität.
 * Diese Monster sollten zuerst eliminiert werden.
 */
const _AI_SUPPORT_FX = new Set([
  'raceBuffATK150', 'raceBuffATK300',
  'buffAllAtk300',  'buffAllAtk400',
]);

/**
 * Bedrohungs-Bonus pro Effekt — erhöht den "Gefährlichkeits-Score"
 * bei der Zielauswahl. Hoher Wert = höhere Priorität als Angriffsziel.
 */
const _AI_THREAT_FX = {
  raceBuffATK150: 200,  raceBuffATK300: 450,
  buffAllAtk300:  400,  buffAllAtk400:  600,
  buff300: 80,   buff400: 120,  buff600: 200,
  burn300: 100,  burn400: 150,  burn600: 250,  burn800: 350, burn1200: 500,
  drain500: 200, drain800: 300,
  destroy1: 350, destroyAll: 900,
  weaken200: 100, weaken500: 250,
  stealHand: 300, graveRevive: 180,
  heal500: 80,   heal800: 160,
  taunt: 50,
};

/**
 * Beschwörungs-Bonus pro Effekt — erhöht den Score bei der Auswahl
 * des zu beschworenen Monsters. Starke Effekte werden bevorzugt.
 */
const _AI_SUMMON_FX = {
  raceBuffATK150: 200, raceBuffATK300: 380,
  buffAllAtk300:  300, buffAllAtk400:  500,
  destroy1: 280,  destroyAll: 800,
  drain500: 220,  drain800:   380,
  burn400: 120,   burn600: 200, burn800: 320,
  weaken500: 240, buff400: 100, buff600: 150,
  graveRevive: 180, stealHand: 250, heal800: 120,
};

function _aiUi(key, params, fallback) {
  return typeof t === 'function' ? t(key, params, { fallbackValue: fallback }) : (fallback || key);
}


/* ══════════════════════════════════════════════════
   HAUPT-ROUTINE
══════════════════════════════════════════════════ */
function enemyFullTurn() {
  const bs       = BATTLE_STATE;
  const enemy    = bs.enemy;
  const behavior = enemy.behavior;

  if (!bs.enemyHand) bs.enemyHand = [];
  battleLog(_aiUi('ui.battle.ai.enemyDrawTurn', { portrait: enemy.portrait || '', name: enemy.name }, `-- ${enemy.portrait} ${enemy.name} draws --`), 'phase');

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

  // 2. Spielfeldkarte spielen (höchste Priorität)
  aiPlayFieldCard(behavior);

  // 2b. Spells aktivieren
  aiPlaySpells(behavior);

  // Gemeinsamer Beschwörungs-Zähler für Fusion + Normal
  const maxSummons  = enemy.maxSummons || 1;
  const summonState = { count: 0, max: maxSummons };

  // 3. Fusion versuchen (zählt zum Limit)
  aiFusion(behavior, summonState);

  // 4. Monster beschwören (restliche Slots)
  while (summonState.count < summonState.max) {
    if (!aiSummon(behavior, summonState)) break;
  }

  // 5. Feld-Modi anpassen
  aiAdaptFieldModes();

  // 6. Fallen setzen
  aiSetTraps();

  // 7. Angriff — mit Lethal Check + dynamischer Neubewertung
  aiAttack(behavior);

  battleLog(_aiUi('ui.battle.ai.yourTurn', null, '-- Your turn --'), 'phase');
}


/* ══════════════════════════════════════════════════
   SCORING & ANALYSE HILFSFUNKTIONEN
══════════════════════════════════════════════════ */

/** Stärkste effektive Stat auf dem Spieler-Feld (ATK oder DEF je Modus) */
function _strongestPlayerATK() {
  let best = 0;
  BATTLE_STATE.playerField.forEach(c => {
    if (!c) return;
    const stat = c.mode === 'defense' ? c.def : c.atk;
    if (stat > best) best = stat;
  });
  return best;
}

/** Wendet fieldBonus des Gegners auf eine Karte an (nur einmal) */
function _applyFieldBonus(card) {
  if (card._fieldBonus) return card;
  const bonus  = BATTLE_STATE.enemy.fieldBonus || 0;
  const placed = { ...card };
  placed.atk  += bonus;
  placed.def  += Math.floor(bonus * 0.5);
  placed._fieldBonus = bonus;
  return placed;
}

/**
 * Bedrohungs-Score eines Spieler-Monsters (höher = gefährlicher).
 * Support-Monster erhalten massiven Bonus da sie das gesamte Spieler-Board stärken.
 */
function _aiMonsterThreat(monster) {
  if (!monster) return 0;
  const baseStat    = monster.mode === 'defense' ? monster.def : monster.atk;
  const effectBonus = _AI_THREAT_FX[monster.effect] || 0;
  const supportBump = _AI_SUPPORT_FX.has(monster.effect) ? 500 : 0;
  return baseStat + effectBonus + supportBump;
}

/**
 * Beschwörungs-Score einer Karte (ATK + behavior-gewichteter Effekt-Bonus).
 * Control/Boss-Behaviors schätzen Effekte stärker.
 */
function _aiSummonScore(card, behavior) {
  const effectBonus = _AI_SUMMON_FX[card.effect] || 0;
  const mult = (behavior === 'final_boss' || behavior === 'control' || behavior === 'boss_balanced')
    ? 1.5 : 1.0;
  return card.atk + effectBonus * mult;
}

/** Angriff-Schwellenwert: Diff > threshold → Angriff erlaubt */
function _aiThreshold(behavior) {
  switch (behavior) {
    case 'final_boss':    return -Infinity; // immer angreifen
    case 'boss_aggro':    return -200;      // auch bei leichtem Nachteil
    case 'aggressive':    return 0;
    case 'swarm':         return 50;        // nur wenn klar vorteilhaft
    case 'control':
    case 'boss_balanced': return 0;
    default:              return 0;
  }
}

/**
 * Prüft ob eine Karte Fusion-Potential hat:
 * Gibt true zurück wenn in Hand oder Deck ein passendes Material liegt.
 * → KI hält Fusion-Material zurück (außer bei aggressiven Behaviors).
 */
function _aiHasFusionPotential(card) {
  const bs   = BATTLE_STATE;
  const pool = [...(bs.enemyHand || []), ...(bs.enemyDeck || [])];
  return pool.some(other => other !== card && getFusionResult(card.id, other.id) !== null);
}


/* ══════════════════════════════════════════════════
   LETHAL CHECK
   Prüft ob der Spieler diesen Zug besiegt werden kann.

   Algorithmus (Greedy):
   1. Sortiere Spieler-Monster nach Widerstandskraft (aufsteigend)
   2. Weise jedem Spieler-Monster den schwächsten KI-Angreifer zu,
      der es besiegen kann (→ stärkere Angreifer frei für Direktangriff)
   3. Prüfe ob verbleibende Angreifer >= playerLP Direktschaden machen
══════════════════════════════════════════════════ */

/**
 * Gibt { lethal:true, killers:[], directAttackers:[] } zurück,
 * oder null wenn kein Lethal möglich ist.
 */
function _aiLethalInfo() {
  const bs = BATTLE_STATE;

  const attackers = bs.enemyField
    .map((c, i) => c && c.mode !== 'defense' ? { card: c, slot: i } : null)
    .filter(Boolean);

  if (attackers.length === 0) return null;

  const playerMonsters = bs.playerField
    .map((c, i) => c ? { card: c, slot: i } : null)
    .filter(Boolean);

  // Kein Spieler-Monster → reiner Direktangriff-Check
  if (playerMonsters.length === 0) {
    const totalDmg = attackers.reduce((s, a) => s + a.card.atk, 0);
    return totalDmg >= bs.playerLP
      ? { lethal: true, killers: [], directAttackers: attackers }
      : null;
  }

  // Spieler hat Monster — sortiere nach Widerstandskraft (schwächstes zuerst)
  const sortedTargets = [...playerMonsters].sort((a, b) => {
    const aStat = a.card.mode === 'defense' ? a.card.def : a.card.atk;
    const bStat = b.card.mode === 'defense' ? b.card.def : b.card.atk;
    return aStat - bStat;
  });

  const usedSlots = new Set();
  const killers   = [];

  for (const target of sortedTargets) {
    const tStat = target.card.mode === 'defense' ? target.card.def : target.card.atk;
    // ATK vs DEF: ATK >= DEF ist ausreichend für Vernichtung
    // ATK vs ATK: ATK >  ATK (strikte Bedingung um Gegentreffer zu vermeiden)
    const threshold = target.card.mode === 'defense' ? tStat : tStat + 1;

    // Schwächsten Angreifer suchen der dieses Monster besiegen kann
    const killer = attackers
      .filter(a => !usedSlots.has(a.slot) && a.card.atk >= threshold)
      .sort((a, b) => a.card.atk - b.card.atk)[0]; // schwächster passender

    if (!killer) return null; // Monster nicht besiegbar → kein Lethal

    usedSlots.add(killer.slot);
    killers.push({ attacker: killer, target });
  }

  // Verbleibende Angreifer → Direktschaden
  const directAttackers = attackers.filter(a => !usedSlots.has(a.slot));
  const directDmg       = directAttackers.reduce((s, a) => s + a.card.atk, 0);

  return directDmg >= bs.playerLP
    ? { lethal: true, killers, directAttackers }
    : null;
}

/** Führt die Lethal-Sequenz aus: erst alle Blocker eliminieren, dann Direktangriff */
function _aiExecuteLethal(info, behavior) {
  const bs = BATTLE_STATE;
  battleLog(_aiUi('ui.battle.ai.seesLethal', { name: bs.enemy.name }, `${bs.enemy.name} sees lethal!`), 'damage');

  // Phase A: Blocker-Monster eliminieren
  for (const { attacker, target } of info.killers) {
    if (bs.gameOver) return;
    if (!bs.enemyField[attacker.slot]) continue; // Angreifer könnte bereits weg sein
    resolveCombat(attacker.slot, target.slot, true);
  }

  // Phase B: Direktangriff mit verbleibenden Angreifern
  for (const a of info.directAttackers) {
    if (bs.gameOver) return;
    const card = bs.enemyField[a.slot];
    if (!card) continue;
    const dmg = card.atk;
    bs.playerLP -= dmg;
    animateDamageNumber('player', dmg);
    battleLog(_aiUi('ui.battle.ai.directAttackLethal', { name: card.name, damage: dmg }, `${card.name} direct attack (lethal) -> ${dmg} damage`), 'damage');
    checkWinCondition();
  }
}


/* ══════════════════════════════════════════════════
   KI: SPELLS AKTIVIEREN
══════════════════════════════════════════════════ */
function aiPlaySpells(behavior) {
  const bs = BATTLE_STATE;
  if (!bs.enemyHand) return;

  const toPlay = [];
  bs.enemyHand.forEach((card, idx) => {
    if (card.type !== 'spell') return;
    const eff  = card.effect || '';
    let   play = false;

    if (behavior === 'final_boss') {
      play = true;
    } else if (behavior === 'control' || behavior === 'boss_balanced') {
      play = true;
    } else if (behavior === 'aggressive' || behavior === 'boss_aggro') {
      play = ['burn800','burn1200','drain1000','buffAllAtk400','destroyAllSpell'].includes(eff);
    } else if (behavior === 'swarm') {
      play = eff.includes('heal') || eff.includes('buff');
    } else {
      play = eff.includes('destroy') || eff.includes('heal');
    }

    if (play) toPlay.push(idx);
  });

  toPlay.reverse().forEach(idx => {
    const card = bs.enemyHand[idx];
    battleLog(_aiUi('ui.battle.ai.enemyActivates', { name: bs.enemy.name, card: card.name }, `${bs.enemy.name} activates: ${card.name}`), 'spell');
    applySpellEffect(card, false);
    sendToGrave(card, false);
    bs.enemyHand.splice(idx, 1);
  });
}


/* ══════════════════════════════════════════════════
   KI: SPIELFELDKARTE SPIELEN
══════════════════════════════════════════════════ */
function aiPlayFieldCard(behavior) {
  const bs = BATTLE_STATE;
  if (!bs.enemyHand) return;

  const fieldIdx = bs.enemyHand.findIndex(c => c.type === 'field');
  if (fieldIdx < 0) return;

  const current    = bs.activeFieldCard;
  const shouldPlay =
    !current ||
    current._playedByPlayer === true ||
    behavior === 'final_boss' ||
    behavior === 'boss_aggro' ||
    behavior === 'boss_balanced';

  if (!shouldPlay) return;

  if (typeof playEnemyFieldCard === 'function') {
    playEnemyFieldCard(fieldIdx);
  }
}


/* ══════════════════════════════════════════════════
   KI: FUSION
   Verbessert: verwendet composite Score (ATK + Effekt-Bonus)
   statt reinem ATK-Vergleich. Fusion wird nur durchgeführt
   wenn Fusion-Score > bester Einzel-Score.
══════════════════════════════════════════════════ */
function aiFusion(behavior, summonState) {
  const bs = BATTLE_STATE;
  if (!bs.enemyHand) return;

  let fused = true;
  while (fused) {
    fused = false;
    if (summonState.count >= summonState.max) break;

    const freeSlot = bs.enemyField.findIndex(c => c === null);
    if (freeSlot < 0) break;

    const monsters = bs.enemyHand.filter(c => c.type === 'monster' || c.type === 'fusion');
    if (monsters.length < 2) break;

    // Bester Einzel-Summon-Score aller verfügbaren Monster
    const bestSingleScore = monsters.reduce(
      (best, c) => Math.max(best, _aiSummonScore(c, behavior)), 0
    );

    let bestFusion      = null;
    let bestFusionScore = -1;
    let bestIdx1        = -1;
    let bestIdx2        = -1;

    for (let i = 0; i < monsters.length; i++) {
      for (let j = i + 1; j < monsters.length; j++) {
        const recipe = getFusionResult(monsters[i].id, monsters[j].id);
        if (!recipe) continue;
        const result = getCardById(recipe.result);
        if (!result) continue;
        const score = _aiSummonScore(result, behavior);
        if (score > bestFusionScore) {
          bestFusionScore = score;
          bestFusion      = result;
          bestIdx1        = bs.enemyHand.indexOf(monsters[i]);
          bestIdx2        = bs.enemyHand.indexOf(monsters[j]);
        }
      }
    }

    // Fusion nur wenn Ergebnis-Score wirklich besser als bestes Einzel-Monster
    if (!bestFusion || bestFusionScore <= bestSingleScore) break;

    const fusionCard = _applyFieldBonus(cloneCard(bestFusion));

    const removeIndices = [bestIdx1, bestIdx2].sort((a, b) => b - a);
    const mat1name = bs.enemyHand[removeIndices[1]].name;
    const mat2name = bs.enemyHand[removeIndices[0]].name;
    removeIndices.forEach(i => bs.enemyHand.splice(i, 1));

    const strongestPlayer = _strongestPlayerATK();
    const useATK = fusionCard.atk > strongestPlayer
      || behavior === 'final_boss'
      || behavior === 'boss_aggro';
    fusionCard.mode = useATK ? 'attack' : 'defense';

    bs.enemyField[freeSlot] = fusionCard;
    summonState.count++;
    battleLog(`⚗ ${bs.enemy.name} fusioniert: ${mat1name} + ${mat2name} → ${fusionCard.name} (ATK ${fusionCard.atk}) [${useATK ? '⚔' : '🛡'}]`, 'summon');
    applyOnSummonEffect(fusionCard, false);
    if (typeof applyFieldCardToNewMonster === 'function') applyFieldCardToNewMonster(fusionCard);
    applyFieldSynergies(false);
    checkOnSummonSynergies(fusionCard, false);

    fused = true; // Nochmal prüfen ob weitere Fusion möglich
  }
}


/* ══════════════════════════════════════════════════
   KI: MONSTER BESCHWÖREN
   Verbessert: Effekt-Score, Fusion-Hold, Combo Awareness.

   Strategie:
   • Karten mit starken Effekten werden gegenüber reinen Stat-
     Karten bevorzugt (via _aiSummonScore)
   • Fusion-Materialien werden zurückgehalten wenn passendes
     Material in Hand/Deck liegt (außer boss/aggressive)
   • ATK-Modus wenn möglich, sonst beste DEF
══════════════════════════════════════════════════ */
function aiSummon(behavior, summonState) {
  const bs = BATTLE_STATE;
  if (!bs.enemyHand) return false;

  const freeSlot = bs.enemyField.findIndex(c => c === null);
  if (freeSlot < 0) return false;

  const monsters = bs.enemyHand.filter(c => c.type === 'monster');
  if (monsters.length === 0) return false;

  const strongestPlayer = _strongestPlayerATK();
  const isBoss = behavior === 'final_boss' || behavior === 'boss_aggro';

  // Alle Kandidaten bewerten
  const candidates = monsters.map(c => {
    const withBonus  = _applyFieldBonus({ ...c });
    const score      = _aiSummonScore(withBonus, behavior);
    // Fusion-Material: zurückhalten wenn Fusion möglich (außer boss/aggressive)
    const holdForFusion = !isBoss && behavior !== 'aggressive' && _aiHasFusionPotential(c);
    return { card: c, withBonus, score, holdForFusion };
  });

  // Bevorzugte Kandidaten: keine Fusion-Materialien falls vorhanden
  const preferred = candidates.filter(c => !c.holdForFusion);
  const pool      = preferred.length > 0 ? preferred : candidates; // Fallback: alle

  const canWin = pool.some(({ withBonus }) => withBonus.atk > strongestPlayer);

  let chosen;
  if (canWin || isBoss) {
    // Wähle bestes Monster das den Spieler schlagen kann, sortiert nach Score
    const atkPool = pool.filter(({ withBonus }) => withBonus.atk > strongestPlayer || isBoss);
    chosen = (atkPool.length > 0 ? atkPool : pool)
      .sort((a, b) => b.score - a.score)[0];
  } else {
    // Kein Sieg möglich → bestes DEF-Monster (mit Effekt-Bonus)
    chosen = pool.sort((a, b) => (b.withBonus.def + (b.score - b.withBonus.atk))
                                - (a.withBonus.def + (a.score - a.withBonus.atk)))[0];
  }

  if (!chosen) return false;

  const placed = _applyFieldBonus({ ...chosen.card });

  // Modus: ATK wenn möglich, sonst DEF
  if (canWin || isBoss) {
    placed.mode = 'attack';
  } else {
    placed.mode = 'defense';
  }
  if (behavior === 'tank') placed.mode = 'defense';

  bs.enemyField[freeSlot] = placed;

  const hi = bs.enemyHand.indexOf(chosen.card);
  if (hi >= 0) bs.enemyHand.splice(hi, 1);

  const modeStr = placed.mode === 'defense' ? _aiUi('ui.battle.ai.modeDefense', null, 'Defense') : _aiUi('ui.battle.ai.modeAttack', null, 'Attack');
  const raceStr = placed.race ? ` [${placed.race}]` : '';
  summonState.count++;
  battleLog(_aiUi('ui.battle.ai.enemySummons', { name: bs.enemy.name, card: placed.name, race: raceStr, mode: modeStr, atk: placed.atk, def: placed.def }, `${bs.enemy.name} summons: ${placed.name}${raceStr} [${modeStr}] ATK ${placed.atk} / DEF ${placed.def}`), 'summon');
  applyOnSummonEffect(placed, false);
  if (typeof applyFieldCardToNewMonster === 'function') applyFieldCardToNewMonster(placed);
  applyFieldSynergies(false);
  checkOnSummonSynergies(placed, false);
  return true;
}


/* ══════════════════════════════════════════════════
   KI: FELD-MODUS ANPASSEN
   Wird auch nach Support-Monster-Kills aufgerufen
   (dynamische Neubewertung).
══════════════════════════════════════════════════ */
function aiAdaptFieldModes() {
  const bs             = BATTLE_STATE;
  const strongestPlayer = _strongestPlayerATK();
  if (strongestPlayer === 0) return; // Spieler hat keine Monster

  bs.enemyField.forEach(card => {
    if (!card) return;
    if (bs.enemy.behavior === 'final_boss') return; // Final Boss weicht nie zurück

    const wouldWin = card.atk > strongestPlayer;

    if (!wouldWin && card.mode !== 'defense') {
      card.mode = 'defense';
      battleLog(_aiUi('ui.battle.ai.switchesDefense', { name: card.name, def: card.def }, `${card.name} switches to defense mode (DEF ${card.def})`), 'combat');
    } else if (wouldWin && card.mode !== 'attack') {
      card.mode = 'attack';
      battleLog(_aiUi('ui.battle.ai.switchesAttack', { name: card.name, atk: card.atk }, `${card.name} switches to attack mode (ATK ${card.atk})`), 'combat');
    }
  });
}


/* ══════════════════════════════════════════════════
   KI: FALLEN SETZEN
══════════════════════════════════════════════════ */
function aiSetTraps() {
  const bs = BATTLE_STATE;
  if (!bs.enemyHand) return;

  const toSet = [];
  bs.enemyHand.forEach((card, idx) => {
    if (card.type !== 'trap') return;
    const freeSlot = bs.enemySTZone.findIndex(c => c === null);
    if (freeSlot >= 0) toSet.push({ idx });
  });

  toSet.reverse().forEach(({ idx }) => {
    const actualSlot = bs.enemySTZone.findIndex(c => c === null);
    if (actualSlot < 0) return;
    const card = bs.enemyHand[idx];
    card.hidden = true;
    bs.enemySTZone[actualSlot] = card;
    bs.enemyHand.splice(idx, 1);
    battleLog(_aiUi('ui.battle.ai.setsTrap', { name: bs.enemy.name }, `${bs.enemy.name} sets a trap...`), 'spell');
  });
}


/* ══════════════════════════════════════════════════
   KI: ANGRIFF v3.0

   Ablauf:
   1. Lethal Check — kann ich den Spieler DIESEN Zug besiegen?
      → Ja: Führe optimale Kill-Sequenz aus
      → Nein: Weiter mit normaler Angriffs-Logik

   2. Normaler Angriff (Prioritätssystem via aiFindTarget):
      a. Taunt-Monster (Pflicht)
      b. Support/Buff-Monster (strategische Priorität)
      c. Bedrohlichstes Monster (threat-score-basiert)
      d. Direktangriff wenn Spielerfeld leer

   3. Dynamische Neubewertung nach Support-Kill:
      → aiAdaptFieldModes() prüft ob geschwächte Monster
        jetzt angreifbar sind
══════════════════════════════════════════════════ */
function aiAttack(behavior) {
  const bs          = BATTLE_STATE;
  const multiAttack = bs.enemy.multiAttack || false;
  const multiCount  = multiAttack ? (behavior === 'final_boss' ? 3 : 2) : 1;

  // ── PHASE 1: LETHAL CHECK ──
  const lethalInfo = _aiLethalInfo();
  if (lethalInfo) {
    _aiExecuteLethal(lethalInfo, behavior);
    return;
  }

  // ── PHASE 2: NORMALER ANGRIFF ──
  // Angreifer nach ATK sortieren (stärkster zuerst für maximalen Board Impact)
  const attackerSlots = bs.enemyField
    .map((c, i) => c && c.mode !== 'defense' ? i : -1)
    .filter(i => i >= 0)
    .sort((a, b) => (bs.enemyField[b]?.atk || 0) - (bs.enemyField[a]?.atk || 0));

  for (const atkSlot of attackerSlots) {
    if (bs.gameOver) break;

    for (let hit = 0; hit < multiCount; hit++) {
      if (bs.gameOver) break;
      const attacker = bs.enemyField[atkSlot];
      if (!attacker) break;

      const playerHasMonsters = bs.playerField.some(Boolean);

      if (!playerHasMonsters) {
        // Direktangriff
        const dmg = attacker.atk;
        bs.playerLP -= dmg;
        animateDamageNumber('player', dmg);
        battleLog(_aiUi('ui.battle.ai.directAttack', { name: attacker.name, damage: dmg }, `${attacker.name} direct attack -> ${dmg} damage`), 'damage');
        checkWinCondition();

      } else {
        const target = aiFindTarget(attacker, behavior);

        if (target !== null) {
          // Merken ob das Ziel ein Support-Monster war
          const targetCard  = bs.playerField[target];
          const wasSupport  = targetCard && _AI_SUPPORT_FX.has(targetCard.effect);
          const targetSlot  = target;

          resolveCombat(atkSlot, target, true);

          // Dynamische Neubewertung: nach Support-Kill können geschwächte
          // Spieler-Monster jetzt angreifbar sein → Modi neu prüfen
          if (wasSupport && !bs.playerField[targetSlot]) {
            aiAdaptFieldModes();
          }

        } else if (behavior === 'final_boss' || behavior === 'boss_aggro') {
          // Diese Behaviors greifen auch ohne klaren Vorteil an
          const forceTarget = aiFindForceTarget();
          if (forceTarget >= 0) resolveCombat(atkSlot, forceTarget, true);
        }
        // Alle anderen Behaviors: kein Angriff wenn kein Vorteil
      }
    }
  }
}


/* ══════════════════════════════════════════════════
   KI: ZIEL FINDEN v3.0

   Prioritäts-Hierarchie:
   ① Taunt-Monster    (Pflicht wenn besiegbar)
   ② Support-Monster  (Buff-/Rassen-Buff-Effekte, strategisch)
   ③ Threat-basiert   (ATK + Effekt-Score des Ziels)
   ④ Behavior-Modifier (aggressive/control/swarm/boss)
══════════════════════════════════════════════════ */
function aiFindTarget(attacker, behavior) {
  const field = BATTLE_STATE.playerField;

  // ── ① TAUNT (Pflicht) ──
  const tauntSlot = field.findIndex(c => c && c.isTaunt);
  if (tauntSlot >= 0) {
    const taunt     = field[tauntSlot];
    const tauntStat = taunt.mode === 'defense' ? taunt.def : taunt.atk;
    const canKill   = taunt.mode === 'defense'
      ? attacker.atk >= tauntStat
      : attacker.atk >  tauntStat;
    if (canKill || behavior === 'final_boss') return tauntSlot;
    return null; // Taunt vorhanden aber unbesiegbar → kein Angriff
  }

  // ── ② SUPPORT-MONSTER PRIORITÄT ──
  // Buff-Monster stärken das gesamte Spieler-Board → sofort eliminieren
  const destroyableSupports = field
    .map((c, i) => {
      if (!c || !_AI_SUPPORT_FX.has(c.effect)) return null;
      const defStat = c.mode === 'defense' ? c.def : c.atk;
      const canKill = c.mode === 'defense'
        ? attacker.atk >= defStat
        : attacker.atk >  defStat;
      if (!canKill) return null;
      return { idx: i, threat: _aiMonsterThreat(c) };
    })
    .filter(Boolean);

  if (destroyableSupports.length > 0) {
    // Bedrohlichstes Support-Monster zuerst
    destroyableSupports.sort((a, b) => b.threat - a.threat);
    return destroyableSupports[0].idx;
  }

  // ── ③ THREAT-BASIERTES TARGETING ──
  const threshold = _aiThreshold(behavior);

  let bestSlot  = null;
  let bestScore = -Infinity;

  field.forEach((def, idx) => {
    if (!def) return;

    const defStat = def.mode === 'defense' ? def.def : def.atk;
    const diff    = attacker.atk - defStat;

    // Schwellenwert prüfen (wie klar gewinne ich diesen Trade?)
    if (diff <= threshold && behavior !== 'final_boss') return;

    // Basis-Score: Trade-Vorteil + Bedrohungs-Score des Ziels
    const threat  = _aiMonsterThreat(def);
    let   score   = diff;

    // ── Behavior-spezifische Scoring-Modifikation ──
    switch (behavior) {

      case 'aggressive':
      case 'boss_aggro':
        // Ziel: bedrohlichstes Monster eliminieren
        score = diff + threat * 0.7;
        break;

      case 'control':
      case 'boss_balanced':
        // Ziel: bester Trade + Effekt-Removal
        score = diff * 1.2 + threat * 0.5 + (def.effect ? 200 : 0);
        break;

      case 'swarm':
        // Ziel: schwächstes Monster claren (Board-Presence aufbauen)
        score = diff > 0 ? (1000 + 5000 / (defStat + 1)) : -1000;
        break;

      case 'final_boss':
        // Ziel: maximale Bedrohung neutralisieren
        score = diff + threat;
        break;

      default:
        // Standard: Trade-Qualität + moderate Threat-Gewichtung
        score = diff + threat * 0.3;
    }

    if (score > bestScore) { bestScore = score; bestSlot = idx; }
  });

  return bestSlot;
}


/* ══════════════════════════════════════════════════
   FORCE TARGET — für final_boss / boss_aggro
   Wählt das schwächste Monster wenn normales
   Targeting nichts findet.
══════════════════════════════════════════════════ */
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
