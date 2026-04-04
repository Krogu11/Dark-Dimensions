/* ============================================================
   ui/battle.js — Battle-Screen Rendering & Interaktion
   ============================================================ */

function _battleUi(key, vars, fallbackValue) {
  return t(key, vars, { fallbackValue });
}

/* ── Haupt-Render ── */
function renderBattle() {
  const bs = BATTLE_STATE;
  if (!bs.active) return;

  // LP & HUD
  document.getElementById('player-lp').textContent = Math.max(0, bs.playerLP);
  document.getElementById('enemy-lp').textContent  = Math.max(0, bs.enemyLP);

  const curPhase = getCurrentPhase();
  const phaseEl  = document.getElementById('phase-label');
  if (phaseEl) {
    phaseEl.textContent = t(`ui.phase.${curPhase.toLowerCase()}`, null, { fallbackValue: curPhase });
    phaseEl.className   = `phase-badge phase-${curPhase.toLowerCase()}`;
  }

  document.getElementById('turn-label').textContent  = bs.turn;
  document.getElementById('deck-count').textContent  = bs.playerDeck.length;
  document.getElementById('grave-count').textContent = bs.playerGrave.length;

  // Beschwörungszähler
  const summonEl = document.getElementById('summon-count');
  if (summonEl) {
    const remaining = bs.maxPlayerSummons - bs.summonCount;
    summonEl.textContent = _battleUi('ui.battle.summonsRemaining', {
      remaining,
      max: bs.maxPlayerSummons,
    }, `⚡ ${remaining}/${bs.maxPlayerSummons}`);
    summonEl.className   = remaining > 0 ? 'summon-count-ok' : 'summon-count-empty';
  }
  document.getElementById('enemy-name').textContent  = bs.enemy.name;
  _renderPortrait(document.getElementById('enemy-portrait'), bs.enemy.portrait);
  document.getElementById('enemy-title').textContent = bs.enemy.title;

  // LP-Balken mit Farbwarnung
  const maxHP = RUN_STATE.maxHP;
  const playerPct = Math.max(0, (bs.playerLP / maxHP) * 100);
  const enemyPct  = Math.max(0, (bs.enemyLP  / bs.enemy.hp) * 100);
  const playerBar = document.getElementById('player-lp-bar');
  const enemyBar  = document.getElementById('enemy-lp-bar');
  if (playerBar) {
    playerBar.style.width = `${playerPct}%`;
    playerBar.style.background = playerPct > 50 ? '#33ff88' : playerPct > 25 ? '#ffaa00' : '#ff3355';
  }
  if (enemyBar) enemyBar.style.width = `${enemyPct}%`;

  renderField('player-field', bs.playerField, true);
  renderField('enemy-field',  bs.enemyField,  false);
  renderSTZone('player-st', bs.playerSTZone);
  renderEnemySTZone('enemy-st', bs.enemySTZone);
  renderHand();

  // Phase-Button: nur in Main und Battle sichtbar
  const btnNext = document.getElementById('btn-next-phase');
  if (btnNext) {
    const autoPhase = curPhase === 'Draw' || curPhase === 'End';
    btnNext.style.display = autoPhase ? 'none' : '';
    if (curPhase === 'Main')    btnNext.textContent = _battleUi('ui.battle.toBattlePhase', null, '⚔ Battle Phase');
    if (curPhase === 'Battle')  btnNext.textContent = _battleUi('ui.battle.endBattlePhase', null, '🏳 End Battle');
  }

  // Direktangriff Button
  const btnDirect = document.getElementById('btn-direct-attack');
  if (btnDirect) {
    const canDirect = getCurrentPhase() === 'Battle'
      && bs.attackerIndex !== null
      && !bs.enemyField.some(Boolean);
    btnDirect.style.display = canDirect ? 'inline-block' : 'none';
  }

  // Fusion-Button
  const btnFusion = document.getElementById('btn-fusion');
  if (btnFusion) {
    const canFuse = getCurrentPhase() === 'Main'
      && bs.fusionSelect.length === 2;
    btnFusion.style.display = canFuse ? 'inline-block' : 'none';
  }

  // Vorschau leeren wenn nichts ausgewählt
  const prevCard = bs.selectedHandIndex !== null
    ? bs.hand[bs.selectedHandIndex]
    : null;
  updatePreview(prevCard);

  // Synergie-Panel aktualisieren
  renderSynergyPanel();

  // Spielfeld-Indikator + Hintergrund aktualisieren
  renderFieldIndicator();
  applyBattleBackground();
}

/* ── Spielfeld-Indikator (rechte Sidebar) — geteilter Slot ── */
function renderFieldIndicator() {
  const bs        = BATTLE_STATE;
  const fieldCard = bs.activeFieldCard;
  const el        = document.getElementById('fi-active-card');
  if (!el) {
    console.warn('[FieldIndicator] Element fi-active-card nicht gefunden!');
    return;
  }

  if (!fieldCard) {
    el.innerHTML = '—';
    el.className = 'fi-card-thumb';
    el.title     = '';
    return;
  }

  // Thumbnail: Karten-Bild oder Fallback-Emoji 🗺
  const thumb = fieldCard.image
    ? `<img src="${fieldCard.image}" style="width:100%;height:100%;object-fit:cover;border-radius:4px">`
    : `<div class="fi-card-emoji">🗺</div>`;
  el.innerHTML = `${thumb}<div class="fi-card-name">${fieldCard.name}</div>`;
  el.className = 'fi-card-thumb fi-active';
  el.title     = `${fieldCard.name}\n${typeof getFieldCardDescription === 'function' ? getFieldCardDescription(fieldCard) : ''}`;
}

/* ── Spielfeld-Hintergrund anwenden (bild-basiert) ── */
function applyBattleBackground() {
  const col = document.getElementById('battle-field-col');
  if (!col) return;

  // Alte Theme-Klassen entfernen (Abwärtskompatibilität)
  [...col.classList].forEach(cls => { if (cls.startsWith('field-theme-')) col.classList.remove(cls); });

  const fc = BATTLE_STATE.activeFieldCard;
  if (fc && fc.image) {
    col.style.backgroundImage    = `url(${fc.image})`;
    col.style.backgroundSize     = 'cover';
    col.style.backgroundPosition = 'center';
    col.style.backgroundRepeat   = 'no-repeat';
  } else {
    // Kein Bild → Standard-Hintergrund
    col.style.backgroundImage    = '';
    col.style.backgroundSize     = '';
    col.style.backgroundPosition = '';
    col.style.backgroundRepeat   = '';
  }
}

/* ── Synergie-Panel ── */
function renderSynergyPanel() {
  const panel = document.getElementById('synergy-panel');
  if (!panel) return;

  const active = getActiveSynergies(true); // nur Spieler-Synergien anzeigen
  if (active.length === 0) {
    panel.innerHTML = `<div style="color:#555;font-size:11px;padding:4px">${_battleUi('ui.battle.noSynergies', null, 'No active synergies')}</div>`;
    return;
  }

  panel.innerHTML = active.map(({ rule, count }) => `
    <div class="synergy-entry" style="border-left:2px solid ${rule.color || '#aaa'}">
      <span style="color:${rule.color || '#aaa'}">${translateRaceId(rule.race)}</span>
      <span style="color:#ddd">${rule.description.split(':')[1]?.trim() || ''}</span>
      <span style="color:#888">${_battleUi('ui.battle.onFieldCount', { count }, `(${count}× on field)`)}</span>
    </div>
  `).join('');
}

/* ── Feld rendern ── */
function renderField(containerId, fieldArr, isPlayer) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const bs = BATTLE_STATE;

  container.innerHTML = '';
  fieldArr.forEach((card, i) => {
    const slot = document.createElement('div');
    slot.className = 'slot';

    if (card) {
      const el = createCardEl(card);
      // Angreifer-Markierung
      if (isPlayer && bs.attackerIndex === i) el.classList.add('c-attacker');
      // Feld-Fusion: eigene Feldkarten als Fusionsziel markieren wenn Handkarte ausgewählt
      if (isPlayer && bs.fusionSelect.length === 1 && getCurrentPhase() === 'Main') {
        el.classList.add('c-fusion-target');
      }
      // Hover
      el.addEventListener('mouseover', () => updatePreview(card));
      // Klick
      el.addEventListener('click', () => {
        if (isPlayer) handlePlayerFieldClick(i);
        else          handleEnemyFieldClick(i);
      });
      slot.appendChild(el);
    } else if (isPlayer && bs.selectedHandIndex !== null && getCurrentPhase() === 'Main') {
      slot.classList.add('slot-available');
      slot.addEventListener('click', () => summonToSlot(i));
    }
    container.appendChild(slot);
  });
}

/* ── Spell/Trap-Zone ── */
function renderSTZone(containerId, stZone) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';
  stZone.forEach((card) => {
    const slot = document.createElement('div');
    slot.className = 'st-slot';
    if (card) {
      const el = document.createElement('div');
      el.className = `st-card ${card.type}`;
      if (card.hidden) {
        el.innerHTML = `<span class="st-icon">🔽</span><span class="st-name">${_battleUi('ui.card.trap', null, 'Trap')}</span>`;
      } else {
        el.innerHTML = `<span class="st-icon">${card.type === 'spell' ? '✨' : '⚡'}</span><span class="st-name">${card.name}</span>`;
        el.addEventListener('mouseover', () => updatePreview(card));
      }
      slot.appendChild(el);
    }
    container.appendChild(slot);
  });
}

/* ── Gegner Spell/Trap-Zone (immer verdeckt) ── */
function renderEnemySTZone(containerId, stZone) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';
  stZone.forEach((card) => {
    const slot = document.createElement('div');
    slot.className = 'st-slot';
    if (card) {
      const el = document.createElement('div');
      // Gegner-Fallen immer als unbekannte Bedrohung zeigen (rot)
      el.className = 'st-card trap enemy-trap';
      el.innerHTML = `<span class="st-icon">❓</span><span class="st-name" style="color:#ff6666">${_battleUi('ui.battle.enemyTrap', null, 'Trap!')}</span>`;
      el.title = _battleUi('ui.battle.enemyTrapTitle', null, 'Enemy trap — it triggers when you attack!');
      slot.appendChild(el);
    }
    container.appendChild(slot);
  });
}

/* ── Hand rendern ── */
function renderHand() {
  const container = document.getElementById('hand-zone');
  if (!container) return;
  const bs = BATTLE_STATE;

  container.innerHTML = '';
  bs.hand.forEach((card, i) => {
    const el = createCardEl(card, true);
    if (bs.selectedHandIndex === i) el.classList.add('c-selected');
    if (bs.fusionSelect.includes(i)) el.classList.add('c-fusion-sel');
    el.addEventListener('mouseover', () => updatePreview(card));
    el.addEventListener('click', () => handleHandClick(i));
    container.appendChild(el);
  });
}

/* ── Karte als DOM-Element ── */
function createCardEl(card, inHand = false) {
  const el = document.createElement('div');
  el.className = `card rarity-${card.rarity}`;

  if (card.hidden) {
    el.classList.add('card-hidden');
    el.innerHTML = `<div class="card-back"></div>`;
    return el;
  }

  const modeLabel = card.type === 'monster'
    ? `<div class="card-mode">${card.mode === 'defense' ? 'DEF' : 'ATK'}</div>`
    : '';

  const typeIcon = { monster:'🐉', spell:'✨', trap:'⚡', fusion:'⚗', field:'🗺' }[card.type] || '?';

  el.innerHTML = `
    <div class="card-header">
      <span class="card-type-icon">${typeIcon}</span>
      <span class="card-rarity-dot"></span>
    </div>
    <div class="card-name">${card.name}</div>
    ${card.type === 'monster' || card.type === 'fusion' ? `
      <div class="card-stats">
        <span class="atk">⚔ ${card.atk}</span>
        <span class="def">🛡 ${card.def}</span>
      </div>
      ${card.race ? `<div class="card-race">${translateRaceId(card.race)}</div>` : ''}
    ` : card.type === 'field' ? `
      <div class="card-spell-type card-field-type">${_battleUi('ui.card.field', null, '🗺 Field')}</div>
      ${card.flavor ? `<div class="card-flavor">${card.flavor}</div>` : ''}
    ` : `
      <div class="card-spell-type">${card.type === 'spell' ? t('ui.card.spell') : t('ui.card.trap')}</div>
    `}
    ${modeLabel}
  `;

  if (card.mode === 'defense') el.classList.add('card-defense');

  return el;
}

/* ── Vorschau-Panel ── */
function updatePreview(card) {
  const panel = document.getElementById('preview-panel');
  if (!panel) return;

  if (!card || card.hidden) {
    panel.innerHTML = `<div class="preview-empty">${_battleUi('ui.common.hoverCard', null, 'Hover over a card')}</div>`;
    return;
  }

  const typeLabel   = t(`ui.type.${card.type}`, null, { fallbackValue: card.type || '' });
  const rarityLabel = t(`ui.rarity.${card.rarity}`, null, { fallbackValue: card.rarity || '' });
  const typeIcon    = { monster:'🐉', spell:'✨', trap:'⚡', fusion:'⚗', field:'🗺' }[card.type] || '?';

  const shieldInfo  = card._shield ? `<div>${_battleUi('ui.preview.armor', { value: card._shield }, `🛡 Armor: ${card._shield}`)}</div>` : '';
  const synInfo     = card._synergyATK ? `<div style="color:#7aff7a">${_battleUi('ui.preview.synergyAtk', { value: card._synergyATK }, `⬆ Synergy: +${card._synergyATK} ATK`)}</div>` : '';

  panel.innerHTML = `
    ${card.image ? `
      <div class="preview-art-wrap">
        <img src="${card.image}" class="preview-art-img" alt="${card.name}">
        <div class="preview-art-overlay">
          <span class="preview-art-name rarity-${card.rarity}">${card.name}</span>
        </div>
      </div>
    ` : `
      <div class="preview-header rarity-${card.rarity}">
        <span>${typeIcon}</span>
        <span class="preview-name">${card.name}</span>
      </div>
    `}
    <div class="preview-meta">${typeLabel} · ${rarityLabel}${card.race ? ` · <span style="color:#afd4ff">${translateRaceId(card.race)}</span>` : ''}</div>
    ${(card.type === 'monster' || card.type === 'fusion') ? `
      <div class="preview-stats">
        <div>⚔ ATK: <b>${card.atk}</b></div>
        <div>🛡 DEF: <b>${card.def}</b></div>
        ${shieldInfo}${synInfo}
      </div>
    ` : ''}
    ${card.type === 'field' ? `
      <div class="preview-effect preview-field-effects">
        🗺 <b>${_battleUi('ui.card.fieldEffects', null, 'Field effects')}:</b><br>
        ${typeof getFieldCardDescription === 'function' ? getFieldCardDescription(card).split(' • ').join('<br>') : ''}
      </div>
    ` : (card.effects?.length > 0 || card.effect) ? `<div class="preview-effect">${t('ui.card.effect')}: ${getEffectDescription(card.effects || card.effect, card)}</div>` : `<div class="preview-effect">${_battleUi('ui.card.noEffect', null, 'No effect')}</div>`}
    <div class="preview-flavor">"${card.flavor || ''}"</div>
  `;
}

/* ── Portrait-Rendering (Emoji oder Bild-URL) ── */
function _renderPortrait(el, portrait) {
  if (!el) return;
  if (portrait && (portrait.startsWith('data:') || portrait.startsWith('http'))) {
    el.innerHTML = `<img src="${portrait}"
      style="width:48px;height:48px;object-fit:cover;border-radius:50%;border:2px solid #3a3a6a">`;
    el.style.fontSize = '0';
  } else {
    el.textContent    = portrait || '👾';
    el.style.fontSize = '';
  }
}

/* ── Effekt-Beschreibungen werden jetzt von effects.js bereitgestellt ──
   getEffectDescription(effectInput, card) ist in effects.js definiert
   und unterstützt sowohl Strings (Legacy) als auch Arrays (v4.0). ── */

/* ── Karten-Modus wechseln (DEF/ATK) ── */
function toggleCardMode(slotIndex) {
  const card = BATTLE_STATE.playerField[slotIndex];
  if (!card || getCurrentPhase() !== 'Main') return;
  card.mode = card.mode === 'defense' ? 'attack' : 'defense';
  battleLog(_battleUi(
    'ui.battle.modeChanged',
    {
      card: card.name,
      mode: card.mode === 'defense'
        ? _battleUi('ui.card.defenseMode', null, 'Defense Mode')
        : _battleUi('ui.card.attackMode', null, 'Attack Mode'),
    },
    `${card.name}: ${card.mode}`
  ), '');
  renderBattle();
}

