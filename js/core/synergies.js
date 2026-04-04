/* ============================================================
   core/synergies.js — Rassen-Synergie-System
   ============================================================
   Synergien feuern wenn X Monster einer Rasse auf dem Feld stehen.
   Passive Boni werden bei jeder Feldänderung neu berechnet.
   Trigger-Synergien feuern bei Beschwörung / Tod.
   ============================================================ */

/* ── Synergie-Regeln ── */
const SYNERGY_RULES = [
  /* KOBOLD — Schwarm stärkt die Herde */
  {
    id: 'kobold_schwarm',
    race: 'Kobold',
    threshold: 2,
    type: 'passive_atk_per_card',   // jeder zusätzliche Kobold über threshold gibt bonus
    value: 150,                      // +150 ATK je Kobold auf dem Feld
    description: 'Kobold-Schwarm: +150 ATK pro Kobold (ab 2)',
    color: '#7aff7a',
  },

  /* ORK — Kampfwut bei Zahlen */
  {
    id: 'ork_rage',
    race: 'Ork',
    threshold: 2,
    type: 'passive_atk_flat',        // fixer Bonus wenn threshold erreicht
    value: 350,
    description: 'Ork-Wut: +350 ATK für alle Orken (ab 2)',
    color: '#ff7a3a',
  },

  /* DÄMON — Lebenssauger */
  {
    id: 'daemon_hunger',
    race: 'Dämon',
    threshold: 2,
    type: 'passive_atk_flat',
    value: 250,
    description: 'Dämonenhunger: +250 ATK für alle Dämonen (ab 2)',
    color: '#c03aff',
  },

  /* DRACHE — Stolz der Drachen */
  {
    id: 'drachen_stolz',
    race: 'Drache',
    threshold: 2,
    type: 'passive_atk_def_flat',    // beide Stats werden gebufft
    value: 450,
    description: 'Drachenstolz: +450 ATK & DEF für alle Drachen (ab 2)',
    color: '#ff4a4a',
  },

  /* UNTOTER — Rückkehr der Toten */
  {
    id: 'untoten_horde',
    race: 'Untoter',
    threshold: 3,
    type: 'on_death_revive',         // wenn Untoter stirbt und threshold erfüllt → Revival
    description: 'Untoten-Horde: Stirbt ein Untoter (3+ auf Feld) → schwächsten aus Friedhof beleben',
    color: '#6aff6a',
  },

  /* MENSCH — Menschenmauer */
  {
    id: 'menschenmauer',
    race: 'Mensch',
    threshold: 2,
    type: 'passive_def_flat',
    value: 250,
    description: 'Menschenmauer: +250 DEF für alle Menschen (ab 2)',
    color: '#7ac8ff',
  },

  /* BESTIE — Jagdfieber */
  {
    id: 'bestien_jagd',
    race: 'Bestie',
    threshold: 2,
    type: 'passive_atk_flat',
    value: 300,
    description: 'Jagdfieber: +300 ATK für alle Bestien (ab 2)',
    color: '#d4a017',
  },

  /* MASCHINE — Maschinenfestung */
  {
    id: 'maschinen_festung',
    race: 'Maschine',
    threshold: 2,
    type: 'passive_def_flat',
    value: 450,
    description: 'Maschinenfestung: +450 DEF für alle Maschinen (ab 2)',
    color: '#7a8aff',
  },

  /* SCHATTENWESEN — Schattenfluche bei Beschwörung */
  {
    id: 'schatten_fluch',
    race: 'Schattenwesen',
    threshold: 2,
    type: 'on_summon_debuff_enemies', // bei Beschwörung: alle Feinde -ATK
    value: 200,
    description: 'Schattenfluche: Beschwörung eines Schattenwesens → alle Feinde -200 ATK (ab 2)',
    color: '#9a3aff',
  },

  /* ELEMENTAR — Elementarkette */
  {
    id: 'elementar_kette',
    race: 'Elementar',
    threshold: 2,
    type: 'passive_atk_flat',
    value: 350,
    description: 'Elementarkette: +350 ATK für alle Elementare (ab 2)',
    color: '#ff9a3a',
  },
];

(function _normalizeSynergyRaces() {
  if (typeof normalizeRaceId !== 'function') return;
  SYNERGY_RULES.forEach(rule => {
    rule.race = normalizeRaceId(rule.race);
  });
})();

/* ── Getter ── */
function getSynergyRules() {
  if (window.DD_CUSTOM && window.DD_CUSTOM.synergies) return window.DD_CUSTOM.synergies;
  return SYNERGY_RULES;
}

/* ── Hilfsfunktion: Rassen auf dem Feld zählen ── */
function _countRace(field, race) {
  return field.filter(c => c && c.race === race).length;
}

/* ─────────────────────────────────────────────────────────
   applyFieldSynergies(isPlayer)
   → Entfernt alle alten Synergie-Boni, berechnet neu,
     wendet auf jedes Monster an.
   Aufgerufen nach: Beschwörung, Tod, Feldänderung.
───────────────────────────────────────────────────────── */
function applyFieldSynergies(isPlayer) {
  const bs    = BATTLE_STATE;
  const field = isPlayer ? bs.playerField : bs.enemyField;
  const rules = getSynergyRules();

  /* 1. Bestehende Synergie-Boni entfernen */
  field.forEach(card => {
    if (!card) return;
    if (card._synergyATK) { card.atk -= card._synergyATK; card._synergyATK = 0; }
    if (card._synergyDEF) { card.def -= card._synergyDEF; card._synergyDEF = 0; }
  });

  /* 2. Passive Synergien neu berechnen */
  rules.forEach(rule => {
    if (!rule.type.startsWith('passive')) return;
    const count = _countRace(field, rule.race);
    if (count < rule.threshold) return;

    field.forEach(card => {
      if (!card || card.race !== rule.race) return;

      let bonusATK = 0;
      let bonusDEF = 0;

      switch (rule.type) {
        case 'passive_atk_per_card':
          bonusATK = rule.value * count;
          break;
        case 'passive_atk_flat':
          bonusATK = rule.value;
          break;
        case 'passive_def_flat':
          bonusDEF = rule.value;
          break;
        case 'passive_atk_def_flat':
          bonusATK = rule.value;
          bonusDEF = rule.value;
          break;
      }

      card.atk          += bonusATK;
      card.def          += bonusDEF;
      card._synergyATK   = (card._synergyATK || 0) + bonusATK;
      card._synergyDEF   = (card._synergyDEF || 0) + bonusDEF;
    });
  });
}

/* ─────────────────────────────────────────────────────────
   checkOnSummonSynergies(card, isPlayer)
   → Feuert Trigger-Synergien bei Beschwörung eines Monsters.
   Aktuell: Schattenwesen-Debuff auf Feinde.
───────────────────────────────────────────────────────── */
function checkOnSummonSynergies(card, isPlayer) {
  if (!card || !card.race) return;
  const bs    = BATTLE_STATE;
  const field = isPlayer ? bs.playerField : bs.enemyField;
  const enemyField = isPlayer ? bs.enemyField : bs.playerField;
  const rules = getSynergyRules();

  rules.forEach(rule => {
    if (rule.race !== card.race) return;
    if (rule.type !== 'on_summon_debuff_enemies') return;
    const count = _countRace(field, rule.race);
    if (count < rule.threshold) return;

    /* Alle feindlichen Monster schwächen */
    enemyField.forEach(e => {
      if (!e) return;
      e.atk = Math.max(0, e.atk - rule.value);
    });
    battleLog(
      `🌑 ${rule.description.split(':')[0]}: Alle Feinde -${rule.value} ATK!`,
      'buff'
    );
  });
}

/* ─────────────────────────────────────────────────────────
   checkOnDeathSynergies(dyingCard, isPlayer)
   → Feuert Trigger-Synergien wenn ein Monster stirbt.
   Aktuell: Untoten-Revival wenn 3+ Untote auf Feld waren.
───────────────────────────────────────────────────────── */
function checkOnDeathSynergies(dyingCard, isPlayer) {
  if (!dyingCard || !dyingCard.race) return;
  const bs    = BATTLE_STATE;
  /* Feld VOR dem Tod (Karte noch im alten Slot oder bereits null — check grave) */
  const field = isPlayer ? bs.playerField : bs.enemyField;
  const grave = isPlayer ? bs.playerGrave : bs.enemyGrave;
  const rules = getSynergyRules();

  rules.forEach(rule => {
    if (rule.race !== dyingCard.race) return;
    if (rule.type !== 'on_death_revive') return;

    /* Zähle lebendige Gleichrassige NACH dem Tod */
    const aliveCount = _countRace(field, rule.race);
    if (aliveCount < (rule.threshold - 1)) return; /* war threshold vor dem Tod */

    /* Revival: schwächstes Monster aus Friedhof */
    const monsters = grave.filter(c => c.type === 'monster' && c.race === rule.race);
    if (!monsters.length) return;
    const weakest = monsters.reduce((a, b) => a.atk <= b.atk ? a : b);
    const slot    = field.findIndex(c => c === null);
    if (slot < 0) return;

    const revived = cloneCard(weakest);
    revived.mode   = 'attack';
    revived.hidden = false;
    field[slot] = revived;
    battleLog(`💀 ${rule.description.split(':')[0]}: ${revived.name} aus dem Grab zurückgekehrt!`, 'heal');
    applyFieldSynergies(isPlayer);
  });
}

/* ─────────────────────────────────────────────────────────
   getActiveSynergies(isPlayer) → [{rule, count}]
   → Gibt alle aktuell aktiven Synergien zurück (für UI).
───────────────────────────────────────────────────────── */
function getActiveSynergies(isPlayer) {
  const bs    = BATTLE_STATE;
  const field = isPlayer ? bs.playerField : bs.enemyField;
  const rules = getSynergyRules();
  const active = [];

  rules.forEach(rule => {
    const count = _countRace(field, rule.race);
    if (count >= rule.threshold) {
      active.push({ rule, count });
    }
  });
  return active;
}
