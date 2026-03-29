/* ============================================================
   ui/battle.js — Battle-Screen Rendering & Interaktion
   ============================================================ */

/* ── Haupt-Render ── */
function renderBattle() {
  const bs = BATTLE_STATE;
  if (!bs.active) return;

  // LP & HUD
  document.getElementById('player-lp').textContent = Math.max(0, bs.playerLP);
  document.getElementById('enemy-lp').textContent  = Math.max(0, bs.enemyLP);
  document.getElementById('phase-label').textContent = getCurrentPhase();
  document.getElementById('turn-label').textContent  = bs.turn;
  document.getElementById('deck-count').textContent  = bs.playerDeck.length;
  document.getElementById('grave-count').textContent = bs.playerGrave.length;
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

  // Gegner-Fallenanzahl anzeigen
  const trapCount  = bs.enemySTZone.filter(Boolean).length;
  const trapWarning = document.getElementById('enemy-trap-count');
  if (trapWarning) {
    trapWarning.textContent = trapCount > 0 ? `⚡ ${trapCount} Falle${trapCount > 1 ? 'n' : ''}` : '';
    trapWarning.style.color = trapCount > 0 ? '#ff4444' : 'transparent';
  }

  renderField('player-field', bs.playerField, true);
  renderField('enemy-field',  bs.enemyField,  false);
  renderSTZone('player-st', bs.playerSTZone);
  renderEnemySTZone('enemy-st', bs.enemySTZone);
  renderHand();

  // Phase-Button-Zustand
  const btnNext = document.getElementById('btn-next-phase');
  if (btnNext) btnNext.textContent = getCurrentPhase() === 'End'
    ? 'Runde beenden ⏭'
    : 'Nächste Phase ▶';

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
}

/* ── Synergie-Panel ── */
function renderSynergyPanel() {
  const panel = document.getElementById('synergy-panel');
  if (!panel) return;

  const active = getActiveSynergies(true); // nur Spieler-Synergien anzeigen
  if (active.length === 0) {
    panel.innerHTML = '<div style="color:#555;font-size:11px;padding:4px">Keine Synergien aktiv</div>';
    return;
  }

  panel.innerHTML = active.map(({ rule, count }) => `
    <div class="synergy-entry" style="border-left:2px solid ${rule.color || '#aaa'}">
      <span style="color:${rule.color || '#aaa'}">${rule.race}</span>
      <span style="color:#ddd">${rule.description.split(':')[1]?.trim() || ''}</span>
      <span style="color:#888">(${count}× auf Feld)</span>
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
        el.innerHTML = `<span class="st-icon">🔽</span><span class="st-name">Falle</span>`;
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
      el.innerHTML = `<span class="st-icon">❓</span><span class="st-name" style="color:#ff6666">Falle!</span>`;
      el.title = 'Gegner-Falle — aktiviert bei deinem Angriff!';
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

  const typeIcon = { monster:'🐉', spell:'✨', trap:'⚡', fusion:'⚗' }[card.type] || '?';

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
      ${card.race ? `<div class="card-race">${card.race}</div>` : ''}
    ` : `
      <div class="card-spell-type">${card.type === 'spell' ? 'Zauber' : 'Falle'}</div>
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
    panel.innerHTML = `<div class="preview-empty">Hover über eine Karte</div>`;
    return;
  }

  const typeLabel   = { monster:'Monster', spell:'Zauber', trap:'Falle', fusion:'Fusion' }[card.type] || '';
  const rarityLabel = { common:'Gewöhnlich', uncommon:'Ungewöhnlich', rare:'Selten', epic:'Episch', legendary:'Legendär' }[card.rarity] || '';
  const typeIcon    = { monster:'🐉', spell:'✨', trap:'⚡', fusion:'⚗' }[card.type] || '?';

  const shieldInfo  = card._shield ? `<div>🛡 Rüstung: <b>${card._shield}</b></div>` : '';
  const synInfo     = card._synergyATK ? `<div style="color:#7aff7a">⬆ Synergie: +${card._synergyATK} ATK</div>` : '';

  panel.innerHTML = `
    <div class="preview-header rarity-${card.rarity}">
      <span>${typeIcon}</span>
      <span class="preview-name">${card.name}</span>
    </div>
    <div class="preview-meta">${typeLabel} · ${rarityLabel}${card.race ? ` · <span style="color:#afd4ff">${card.race}</span>` : ''}</div>
    ${(card.type === 'monster' || card.type === 'fusion') ? `
      <div class="preview-stats">
        <div>⚔ ATK: <b>${card.atk}</b></div>
        <div>🛡 DEF: <b>${card.def}</b></div>
        ${shieldInfo}${synInfo}
      </div>
    ` : ''}
    ${card.effect ? `<div class="preview-effect">Effekt: ${getEffectDescription(card.effect)}</div>` : '<div class="preview-effect">Kein Effekt</div>'}
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

/* ── Effekt-Beschreibungen ── */
const EFFECT_DESC = {
  heal500:        'Heilt 500 LP bei Beschwörung',
  heal800:        'Heilt 800 LP',
  heal1000:       'Heilt 1000 LP',
  buff400:        '+400 ATK bei Beschwörung',
  destroy1:       'Zerstört 1 feindliches Monster bei Beschwörung',
  destroyAll:     'Zerstört ALLE feindlichen Monster',
  destroyAllSpell:'Zerstört alle feindlichen Monster',
  burn600:        '600 Direktschaden',
  burn800:        '800 Direktschaden',
  burn1200:       '1200 Direktschaden',
  drain500:       'Saugt 500 LP — Schaden + Heilung',
  drain1000:      'Saugt 1000 LP — Schaden + Heilung',
  revive:         'Belebt das zuletzt zerstörte Monster wieder',
  draw1:          'Ziehe 1 Karte',
  draw2:          'Ziehe 2 Karten',
  weaken500:      'Reduziert ATK eines feindlichen Monsters um 500',
  taunt:          'Zieht alle feindlichen Angriffe auf sich',
  buffAllAtk400:  'Alle eigenen Monster +400 ATK',
  destroyAttacker:'Zerstört den angreifenden Feind (Falle)',
  destroyAllAtk:  'Zerstört alle angreifenden Feinde (Falle)',
  healBuff:       '+500 LP & +400 ATK bei Beschwörung',
  negate:         'Negiert einen Angriff vollständig (Falle)',
};

function getEffectDescription(effectId) {
  return EFFECT_DESC[effectId] || effectId;
}

/* ── Karten-Modus wechseln (DEF/ATK) ── */
function toggleCardMode(slotIndex) {
  const card = BATTLE_STATE.playerField[slotIndex];
  if (!card || getCurrentPhase() !== 'Main') return;
  card.mode = card.mode === 'defense' ? 'attack' : 'defense';
  battleLog(`🔄 ${card.name}: ${card.mode === 'defense' ? 'Verteidigung' : 'Angriff'}smodus`, '');
  renderBattle();
}
