/* ============================================================
   ui/titlescreen.js — Title, Main Menu, Free Duel, Deck-Editor
   ============================================================ */

function _ui(key, vars, fallbackValue) {
  return t(key, vars, { fallbackValue });
}

function _actLabel(index, suffixKey = '') {
  const base = _ui(`ui.act.${index + 1}`, null, `Act ${index + 1}`);
  return suffixKey ? `${base} · ${_ui(suffixKey, null, suffixKey)}` : base;
}

function renderLanguageControls() {
  const screen = document.getElementById('screen-title');
  if (!screen) return;

  let wrap = document.getElementById('title-language-controls');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'title-language-controls';
    wrap.style.cssText = 'display:flex;justify-content:center;margin:12px 0 0;';
    const box = document.createElement('div');
    box.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(8,10,20,.55);backdrop-filter:blur(8px);';
    box.innerHTML = `
      <span id="title-language-label" style="font-size:12px;color:#d7d7e8"></span>
      <select id="title-language-select" style="padding:4px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.18);background:#14182b;color:#fff">
        <option value="system">System</option>
        <option value="en">English</option>
        <option value="de">Deutsch</option>
      </select>
    `;
    wrap.appendChild(box);
    const anchor = screen.querySelector('.title-save-label');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
    const select = box.querySelector('#title-language-select');
    select?.addEventListener('change', () => setDDLanguage(select.value));
  }

  const label = wrap.querySelector('#title-language-label');
  const select = wrap.querySelector('#title-language-select');
  if (label) label.textContent = _ui('ui.language.label', null, 'Language');
  if (select) {
    const mode = window.I18N?.languageMode || 'system';
    select.value = ['system', 'en', 'de'].includes(mode) ? mode : 'system';
    Array.from(select.options).forEach(option => {
      option.textContent = _ui(`ui.language.${option.value}`, null, option.value);
    });
  }
}

/* ─────────────────────────────────────────────────────
   TITLE SCREEN — Save-Slot-Auswahl
───────────────────────────────────────────────────── */
function renderTitleScreen() {
  if (typeof setMusicPlaylist === 'function') setMusicPlaylist(MUSIC_PLAYLISTS.menu);
  const container = document.getElementById('title-slots');
  if (!container) return;
  renderLanguageControls();

  const slots = getAllSlots();
  container.innerHTML = '';

  for (let i = 0; i < MAX_SLOTS; i++) {
    const id   = i + 1;
    const slot = slots[i];
    const hasData = !!slot;

    const el = document.createElement('div');
    el.className = `save-slot ${hasData ? 'save-slot-used' : 'save-slot-empty'}`;

    if (hasData) {
      const sum = getSlotSummary(slot);
      el.innerHTML = `
        <div class="slot-header">
          <span class="slot-id-badge">SLOT ${id}</span>
          <span class="slot-date">💾 ${formatSaveDate(slot.timestamp)}</span>
        </div>
        <div class="slot-info-line">${sum.line1}</div>
        <div class="slot-info-sub">${sum.line2}</div>
        <div class="slot-act-bar" data-act="${Math.min(Math.max(...(slot.unlockedActs||[0])), 2)}"></div>
        <div class="slot-actions">
          <button class="btn-slot-load" data-slot="${id}">${_ui('ui.title.loadSlot', null, '▶ Load')}</button>
          <button class="btn-slot-delete" data-slot="${id}">🗑</button>
        </div>
      `;
    } else {
      el.innerHTML = `
        <div class="slot-header">
          <span class="slot-id-badge">SLOT ${id}</span>
        </div>
        <div class="slot-empty-label">${_ui('ui.title.emptySlot', null, '— Empty Slot —')}</div>
        <div class="slot-actions">
          <button class="btn-slot-new" data-slot="${id}">${_ui('ui.title.newGame', null, '✦ New Game')}</button>
        </div>
      `;
    }

    container.appendChild(el);
  }

  /* ── Event-Handler ── */
  container.querySelectorAll('.btn-slot-new').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.slot);
      loadSlot(id);
      if (typeof window.logDDRuntimeDiagnostics === 'function') {
        window.logDDRuntimeDiagnostics('new-game-click');
      }
      const hasWorldMap = window.DD_CUSTOM && Array.isArray(window.DD_CUSTOM.worldMap) && window.DD_CUSTOM.worldMap.length > 0;
      if (!hasWorldMap || typeof initWorldState !== 'function') {
        strictDataError(_ui('ui.errors.noWorldMapNewGame', null, 'No world map configured. A new game cannot be started.'));
        return;
      }
      if (SAVE_STATE.slot) SAVE_STATE.slot.activeRun = null;
      initWorldState();
    });
  });

  container.querySelectorAll('.btn-slot-load').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.slot);
      loadSlot(id);
      showScreen('mainmenu');
      renderMainMenu();
    });
  });

  container.querySelectorAll('.btn-slot-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.slot);
      if (confirm(_ui('ui.title.confirmDelete', { slot: id }, `Delete slot ${id}? All data will be lost.`))) {
        deleteSlot(id);
        renderTitleScreen();
      }
    });
  });
}

/* ─────────────────────────────────────────────────────
   HAUPTMENÜ — nach Slot-Auswahl
───────────────────────────────────────────────────── */
function renderMainMenu() {
  if (typeof setMusicPlaylist === 'function') setMusicPlaylist(MUSIC_PLAYLISTS.menu);
  const slot = SAVE_STATE.slot;
  if (!slot) { showScreen('title'); renderTitleScreen(); return; }

  /* Slot-Info Panel */
  const infoEl = document.getElementById('mainmenu-slot-info');
  if (infoEl) {
    const actNames = [_actLabel(0), _actLabel(1), _actLabel(2)];
    const maxAct = Math.min(Math.max(...(slot.unlockedActs || [0])), 2);
    infoEl.innerHTML = `
      <div class="mm-slot-title">${_ui('ui.mainmenu.saveSlot', { slot: slot.slotId }, `Save Slot ${slot.slotId}`)}</div>
      <div class="mm-slot-stats">
        <span>✦ ${slot.ds || 0} DS</span>
        <span>${_ui('ui.mainmenu.cardCount', { count: slot.cardCollection.length }, `🃏 ${slot.cardCollection.length} cards`)}</span>
        <span>📍 ${actNames[maxAct]}</span>
      </div>
      <div class="mm-save-date">${_ui('ui.mainmenu.lastPlayed', { date: formatSaveDate(slot.timestamp) }, `Last played: ${formatSaveDate(slot.timestamp)}`)}</div>
    `;
  }

  /* Kampagnen-Button anpassen */
  const btnCampaign = document.getElementById('btn-mainmenu-campaign');
  if (btnCampaign) {
    btnCampaign.textContent = _ui('ui.mainmenu.campaign', null, '⚔ Campaign');
    btnCampaign.classList.remove('btn-resume');
  }

}

/* ─────────────────────────────────────────────────────
   FREIES DUELL SCREEN — Gegner-Roster
   Zeigt alle Gegner des Spiels. Freigeschaltet werden
   Gegner erst nachdem der Spieler sie einmal besiegt hat.
───────────────────────────────────────────────────── */

/** Reihenfolge der Gegner im Roster (aufsteigend nach Schwierigkeit). */
const ROSTER_ORDER = [
  'goblin_chief', 'skeleton_mage', 'orc_warlord', 'forest_demon',
  'shadow_knight', 'dark_priest', 'iron_golem_guard', 'chaos_lord',
  'void_reaper', 'soul_devourer', 'dark_dimension_god',
];

/** Akt-Label für Gegner-Karten. */
const ROSTER_ACT_LABEL = {
  goblin_chief:      { act: 0 }, skeleton_mage:     { act: 0 },
  orc_warlord:       { act: 0 }, forest_demon:      { act: 0, suffix: 'ui.common.boss' },
  shadow_knight:     { act: 1 }, dark_priest:       { act: 1 },
  iron_golem_guard:  { act: 1 }, chaos_lord:        { act: 1, suffix: 'ui.common.boss' },
  void_reaper:       { act: 2 }, soul_devourer:     { act: 2 },
  dark_dimension_god:{ act: 2, suffix: 'ui.common.finalBoss' },
};

function renderFreeDuelScreen() {
  if (typeof setMusicPlaylist === 'function') setMusicPlaylist(MUSIC_PLAYLISTS.menu);
  const container = document.getElementById('freeduel-acts');
  if (!container) return;

  const slot     = SAVE_STATE.slot;
  const defeated = slot ? (slot.defeatedEnemies || []) : [];
  const record   = slot ? (slot.freeDuelRecord  || {}) : {};

  // ── Gegner-Liste zusammenstellen ──
  const customEnemyMap = window.DD_CUSTOM?.enemies || {};
  const cfgOrder = window.DD_CUSTOM?.config?.['cfg-roster-order'];
  const rosterOrder = (cfgOrder && Array.isArray(cfgOrder) && cfgOrder.length > 0)
    ? cfgOrder : ROSTER_ORDER;

  const allEnemies = [];
  const addedIds   = new Set();
  rosterOrder.forEach(id => {
    const base   = (typeof ENEMIES !== 'undefined' && ENEMIES[id]) ? ENEMIES[id] : null;
    const custom = customEnemyMap[id];
    if (base || custom) { allEnemies.push({ ...base, ...custom }); addedIds.add(id); }
  });
  Object.values(customEnemyMap).forEach(e => {
    if (e && e.id && !addedIds.has(e.id)) { allEnemies.push(e); addedIds.add(e.id); }
  });

  // ── Header-Zähler ──
  const subEl = document.querySelector('#screen-freeduel .freeduel-sub');
  if (subEl) subEl.textContent =
    _ui('ui.freeduel.progress', {
      unlocked: defeated.length,
      total: allEnemies.length,
    }, `${defeated.length} / ${allEnemies.length} enemies unlocked · Defeat them again for their cards`);

  container.innerHTML = '';

  if (allEnemies.length === 0) {
    container.innerHTML = `<p style="color:#555;text-align:center;padding:60px 0">${_ui('ui.freeduel.none', null, 'No enemies available')}</p>`;
    return;
  }

  // ── Karten rendern ──
  allEnemies.forEach(enemy => {
    if (!enemy || !enemy.id) return;

    const unlocked = defeated.includes(enemy.id);
    const isBoss   = !!(enemy.title?.toLowerCase().includes('boss') || (enemy.difficulty || 0) >= 4);
    const rec      = record[enemy.id] || { wins: 0, losses: 0 };
    const actMeta = ROSTER_ACT_LABEL[enemy.id];
    const actLabel = actMeta
      ? _actLabel(actMeta.act, actMeta.suffix || '')
      : (enemy.theme ? translateRaceId(enemy.theme) : '');
    const stars    = '★'.repeat(Math.min(enemy.difficulty || 1, 6));
    const empty    = '☆'.repeat(Math.max(0, 6 - (enemy.difficulty || 1)));

    // Portrait: echtes Bild oder Emoji
    const p = enemy.portrait || '';
    const imgHtml = (p.startsWith('data:') || p.startsWith('http'))
      ? `<img class="fd-img" src="${p}" alt="${enemy.name || ''}">`
      : `<div class="fd-emoji">${p || '👾'}</div>`;

    const card = document.createElement('div');
    card.className = `fd-card${unlocked ? ' fd-unlocked' : ' fd-locked'}${isBoss ? ' fd-boss' : ''}`;

    card.innerHTML = `
      <div class="fd-img-wrap">
        ${imgHtml}
        ${!unlocked ? '<div class="fd-lock">🔒</div>' : ''}
      </div>
      <div class="fd-info">
        <div class="fd-name">${unlocked ? (enemy.name || enemy.id) : _ui('ui.common.lockedName', null, '???')}</div>
        <div class="fd-meta">
          <span class="fd-act">${actLabel}</span>
          <span class="fd-stars"><span class="fd-s">${stars}</span><span class="fd-e">${empty}</span></span>
        </div>
        ${unlocked ? `
          <div class="fd-record">
            <div class="fd-rec-w">
              <span class="fd-rec-num">${rec.wins}</span>
              <span class="fd-rec-lbl">${_ui('ui.common.wins', null, 'Wins')}</span>
            </div>
            <div class="fd-rec-sep"></div>
            <div class="fd-rec-l">
              <span class="fd-rec-num">${rec.losses}</span>
              <span class="fd-rec-lbl">${_ui('ui.common.losses', null, 'Losses')}</span>
            </div>
          </div>
          <div class="fd-lp">${_ui('ui.common.hpValue', { value: enemy.hp || '?' }, `💚 ${enemy.hp || '?'} HP`)}</div>
          <div class="fd-actions">
            <button class="fd-btn-fight">${_ui('ui.freeduel.challenge', null, '⚔ Challenge')}</button>
            <button class="fd-btn-drops">${_ui('ui.freeduel.drops', null, '📊 Drops')}</button>
          </div>
        ` : `
          <div class="fd-hint">${_ui('ui.freeduel.unlockHint', null, 'Defeat in the campaign')}</div>
        `}
      </div>
    `;

    // ── Event-Listener ──
    if (unlocked) {
      card.querySelector('.fd-btn-fight').addEventListener('click', e => {
        e.stopPropagation();
        startFreeDuelEnemy(enemy.id);
      });
      card.querySelector('.fd-btn-drops').addEventListener('click', e => {
        e.stopPropagation();
        showDropChanceModal(enemy);
      });
      // Klick auf die Karte selbst (außer Buttons) startet auch den Kampf
      card.addEventListener('click', e => {
        if (!e.target.closest('.fd-btn-fight') && !e.target.closest('.fd-btn-drops')) {
          startFreeDuelEnemy(enemy.id);
        }
      });
    } else {
      card.addEventListener('click', () => {
        card.style.outline = '2px solid #ff3355';
        setTimeout(() => { card.style.outline = ''; }, 400);
      });
    }

    container.appendChild(card);
  });

  // ── Einblend-Animation ──
  if (window.gsap) {
    gsap.fromTo(container.querySelectorAll('.fd-card'),
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.3, stagger: 0.05, ease: 'power2.out' }
    );
  }
}

/* ─────────────────────────────────────────────────────
   DROP-CHANCE MODAL
───────────────────────────────────────────────────── */

/** Öffnet das Drop-Chancen-Modal für einen Gegner. */
function showDropChanceModal(enemy) {
  const modal = document.getElementById('drop-chance-modal');
  if (!modal) return;

  // Header: Portrait
  const portraitEl = document.getElementById('drop-modal-enemy-portrait');
  if (portraitEl) {
    const p = enemy.portrait || '';
    if (p.startsWith('data:') || p.startsWith('http')) {
      portraitEl.innerHTML = `<img src="${p}" alt="${enemy.name}">`;
    } else {
      portraitEl.textContent = p || '👾';
    }
  }
  // Header: Name & Titel
  const nameEl  = document.getElementById('drop-modal-enemy-name');
  const titleEl = document.getElementById('drop-modal-enemy-title');
  if (nameEl)  nameEl.textContent  = enemy.name || enemy.id;
  if (titleEl) {
    const actMeta = ROSTER_ACT_LABEL[enemy.id];
    titleEl.textContent = enemy.title || (actMeta ? _actLabel(actMeta.act, actMeta.suffix || '') : '');
  }

  // Content: einheitliche Droptabelle
  const content = document.getElementById('drop-modal-content');
  if (!content) return;
  content.innerHTML = '';

  const entries = (typeof analyzeDropPool === 'function' && enemy.dropTable)
    ? analyzeDropPool(enemy.dropTable).sort((a, b) => (a.percent || 0) - (b.percent || 0))
    : [];

  if (entries.length === 0) {
    content.innerHTML = `<div style="color:var(--clr-muted);text-align:center;padding:30px">${_ui('ui.drops.none', null, 'This enemy has no drop table.')}</div>`;
  } else {
    const table = document.createElement('table');
    table.className = 'drop-rank-table';

    entries.forEach(entry => {
      const pct    = entry.percent || 0;
      const barPct = Math.min(100, pct);
      const tr     = document.createElement('tr');
      tr.innerHTML = `
        <td class="drop-row-name">${entry.name}</td>
        <td class="drop-row-rarity rarity-${entry.rarity || 'common'}">${entry.rarity || 'common'}</td>
        <td class="drop-row-bar-wrap">
          <div class="drop-row-bar-bg">
            <div class="drop-row-bar-fill" style="width:${barPct}%"></div>
          </div>
        </td>
        <td class="drop-row-percent">${pct.toFixed(1)}%</td>
      `;
      table.appendChild(tr);
    });

    content.appendChild(table);
  }

  modal.style.display = 'flex';

  // Animation
  if (window.gsap) {
    const box = modal.querySelector('.drop-modal-box');
    gsap.fromTo(box,
      { opacity: 0, y: 30, scale: 0.93 },
      { opacity: 1, y: 0,  scale: 1, duration: 0.35, ease: 'back.out(1.5)' }
    );
  }
}

/** Schließt das Drop-Chancen-Modal. */
function closeDropChanceModal(event) {
  // Klick außerhalb der Box = Overlay-Klick → schließen
  if (event && event.target !== event.currentTarget) return;
  const modal = document.getElementById('drop-chance-modal');
  if (modal) modal.style.display = 'none';
}

/* ═══════════════════════════════════════════════════════════
   DECK-EDITOR — vollständige Implementierung
   ═══════════════════════════════════════════════════════════
   - Pool = Starter-Karten + gewonnene Karten (je bis zu 3×)
   - Deck = Min 15, Max 20 Karten
   - Änderungen werden in SAVE_STATE.slot.baseDeck gespeichert
   ─────────────────────────────────────────────────────── */

const DE = {
  filter:  'all',    // 'all' | 'monster' | 'spell' | 'trap' | 'fusion'
  sort:    'rarity', // 'rarity' | 'atk' | 'name'
  deck:    [],       // Array von card-IDs (aktuelle Bearbeitung)
  pool:    {},       // { cardId: { card, owned } }
  MIN:     15,
  MAX:     20,
};

/* ── Pool aufbauen: Starter (immer je 1×) + Collection ── */
function _buildDeckPool() {
  const counts = {};

  /* Starter-Karten immer verfügbar (je 1 Kopie) */
  buildStarterDeck().forEach(c => {
    counts[c.id] = (counts[c.id] || 0) + 1;
  });

  /* Verdiente Karten aus Collection */
  const coll = SAVE_STATE.slot ? (SAVE_STATE.slot.cardCollection || []) : [];
  coll.forEach(id => {
    counts[id] = (counts[id] || 0) + 1;
  });

  /* Pool-Objekt aufbauen (max 3 Kopien pro Karte) */
  const pool = {};
  Object.entries(counts).forEach(([id, n]) => {
    const card = getCardById(id);
    if (card) pool[id] = { card, owned: Math.min(n, 3) };
  });
  return pool;
}

/* ── Anzahl einer Karte im aktuellen Edit-Deck ── */
function _deCount(cardId) {
  return DE.deck.filter(id => id === cardId).length;
}

/* ── Karte zum Deck hinzufügen ── */
function _deAdd(cardId) {
  const entry = DE.pool[cardId];
  if (!entry) return;
  if (DE.deck.length >= DE.MAX) { _deFlash(_ui('ui.deckeditor.maxReached', null, '⚠ Maximum 20 cards reached!'), false); return; }
  if (_deCount(cardId) >= entry.owned) { _deFlash(_ui('ui.deckeditor.noMoreCopies', null, '⚠ No more copies available'), false); return; }
  if (_deCount(cardId) >= 3) { _deFlash(_ui('ui.deckeditor.maxCopies', null, '⚠ Max. 3× the same card'), false); return; }
  DE.deck.push(cardId);
  _deRefresh();
}

/* ── Karte aus Deck entfernen (letzte Kopie) ── */
function _deRemove(cardId) {
  const idx = DE.deck.lastIndexOf(cardId);
  if (idx >= 0) { DE.deck.splice(idx, 1); _deRefresh(); }
}

/* ── Deck komplett neu laden (z.B. Reset) ── */
function _deLoadDeck(ids) {
  DE.deck = ids ? [...ids] : [];
  _deRefresh();
}

/* ── Kurze Statusmeldung ── */
function _deFlash(msg, ok) {
  const el = document.getElementById('de-flash');
  if (!el) return;
  el.textContent = msg;
  el.className   = ok ? 'de-flash de-flash-ok' : 'de-flash de-flash-warn';
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 2200);
}

/* ── Zähler-Display aktualisieren ── */
function _deUpdateCounter() {
  const n    = DE.deck.length;
  const ok   = n >= DE.MIN && n <= DE.MAX;
  const el   = document.getElementById('de-count');
  const ico  = document.getElementById('de-count-status');
  const bar  = document.getElementById('de-count-bar');
  const btn  = document.getElementById('btn-de-save');
  if (el)  el.textContent   = n;
  if (el)  el.style.color   = ok ? 'var(--clr-green)' : n < DE.MIN ? 'var(--clr-orange)' : 'var(--clr-red)';
  if (ico) ico.textContent  = ok ? '✓' : n < DE.MIN ? '↑' : '⚠';
  if (ico) ico.style.color  = ok ? 'var(--clr-green)' : 'var(--clr-orange)';
  if (bar) { bar.style.width = `${Math.min(100, (n / DE.MAX) * 100)}%`; bar.style.background = ok ? 'var(--clr-green)' : n < DE.MIN ? 'var(--clr-orange)' : 'var(--clr-red)'; }
  if (btn) btn.disabled = !ok;
}

/* ── Pool-Panel neu rendern ── */
function _deRenderPool() {
  const container = document.getElementById('de-pool');
  if (!container) return;
  container.innerHTML = '';

  /* Filter + Sort */
  const RARITY_ORD = { legendary:0, epic:1, rare:2, uncommon:3, common:4 };
  let entries = Object.values(DE.pool);

  if (DE.filter !== 'all') entries = entries.filter(e => e.card.type === DE.filter);

  entries.sort((a, b) => {
    if (DE.sort === 'atk')    return (b.card.atk||0) - (a.card.atk||0);
    if (DE.sort === 'name')   return a.card.name.localeCompare(b.card.name);
    /* default: rarity */
    const rd = (RARITY_ORD[a.card.rarity]??5) - (RARITY_ORD[b.card.rarity]??5);
    return rd !== 0 ? rd : (b.card.atk||0) - (a.card.atk||0);
  });

  if (entries.length === 0) {
    container.innerHTML = `<div class="de-empty">${_ui('ui.deckeditor.emptyCategory', null, 'No cards in this category.')}</div>`;
    return;
  }

  entries.forEach(({ card, owned }) => {
    const inDeck  = _deCount(card.id);
    const maxed   = inDeck >= owned || inDeck >= 3;

    const wrap = document.createElement('div');
    wrap.className = `de-pool-card${maxed ? ' de-pool-maxed' : ''}`;

    /* Karten-Miniatur */
    const cardEl = createCardEl(card, false);
    cardEl.style.pointerEvents = 'none'; // Verhindert Hover-Preview-Konflikte

    /* Badge: in Deck / verfügbar */
    const badge = document.createElement('div');
    badge.className = 'de-pool-badge';
    badge.innerHTML = `<span class="${inDeck > 0 ? 'de-badge-active' : ''}">${inDeck}/${owned}</span>`;

    /* Klick = hinzufügen */
    wrap.addEventListener('click', () => _deAdd(card.id));

    /* Hover = Preview */
    wrap.addEventListener('mouseenter', () => _deShowPreview(card));

    wrap.appendChild(cardEl);
    wrap.appendChild(badge);
    container.appendChild(wrap);
  });
}

/* ── Deck-Liste rechts rendern ── */
function _deRenderDeck() {
  const list = document.getElementById('de-deck-list');
  if (!list) return;
  list.innerHTML = '';

  if (DE.deck.length === 0) {
    list.innerHTML = `<div class="de-deck-empty">${_ui('ui.deckeditor.emptyDeck', null, 'Deck is empty.<br>Click a card on the left.')}</div>`;
    return;
  }

  /* Karten gruppieren: ID → count */
  const grouped = {};
  DE.deck.forEach(id => { grouped[id] = (grouped[id] || 0) + 1; });

  /* Sortierung: Typ (Monster zuerst), dann Rarity */
  const RARITY_ORD = { legendary:0, epic:1, rare:2, uncommon:3, common:4 };
  const TYPE_ORD   = { fusion:0, monster:1, spell:2, trap:3 };
  const deckEntries = Object.entries(grouped)
    .map(([id, count]) => ({ card: getCardById(id), count }))
    .filter(e => e.card)
    .sort((a, b) => {
      const td = (TYPE_ORD[a.card.type]??5) - (TYPE_ORD[b.card.type]??5);
      if (td !== 0) return td;
      return (RARITY_ORD[a.card.rarity]??5) - (RARITY_ORD[b.card.rarity]??5);
    });

  deckEntries.forEach(({ card, count }) => {
    const row = document.createElement('div');
    row.className = `de-deck-row rarity-border-${card.rarity}`;
    row.title = _ui('ui.deckeditor.removeCardTitle', { card: card.name }, `${card.name} remove`);

    const typeIcon = { monster:'⚔', spell:'✨', trap:'🕸', fusion:'⚗' }[card.type] || '?';
    const statsStr = (card.type === 'monster' || card.type === 'fusion')
      ? `<span class="de-row-stats">${card.atk}/${card.def}</span>`
      : '';

    row.innerHTML = `
      <span class="de-row-type">${typeIcon}</span>
      <span class="de-row-name rarity-${card.rarity}">${card.name}</span>
      ${statsStr}
      <span class="de-row-count">×${count}</span>
      <button class="de-row-remove" title="${_ui('ui.common.remove', null, 'Remove')}">−</button>
    `;

    row.querySelector('.de-row-remove').addEventListener('click', e => {
      e.stopPropagation();
      _deRemove(card.id);
    });

    /* Hover → Preview */
    row.addEventListener('mouseenter', () => _deShowPreview(card));

    list.appendChild(row);
  });
}

/* ── Karten-Preview aktualisieren ── */
function _deShowPreview(card) {
  const panel = document.getElementById('de-preview');
  if (!panel) return;
  const typeLabel = _ui(`ui.type.${card.type}`, null, card.type || '');
  const rarLabel  = _ui(`ui.rarity.${card.rarity}`, null, card.rarity || '');
  panel.innerHTML = `
    <div class="preview-header rarity-${card.rarity}">${card.name}</div>
    <div class="preview-meta">${typeLabel} · ${rarLabel}${card.race ? ' · ' + translateRaceId(card.race) : ''}</div>
    ${(card.type === 'monster' || card.type === 'fusion')
      ? `<div class="de-preview-stats"><span>ATK <b>${card.atk}</b></span><span>DEF <b>${card.def}</b></span></div>`
      : ''}
    ${card.effect
      ? `<div class="de-preview-effect">${typeof getEffectDescription==='function' ? getEffectDescription(card.effect) : card.effect}</div>`
      : ''}
    ${card.flavor ? `<div class="preview-flavor">"${card.flavor}"</div>` : ''}
  `;
}

/* ── Filter/Sort-Buttons Event-Binding ── */
function _deBindFilters() {
  document.querySelectorAll('.de-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.de-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      DE.filter = btn.dataset.filter;
      _deRenderPool();
    });
  });

  document.querySelectorAll('.de-sort').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.de-sort').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      DE.sort = btn.dataset.sort;
      _deRenderPool();
    });
  });

  /* Deck speichern */
  document.getElementById('btn-de-save')?.addEventListener('click', () => {
    if (DE.deck.length < DE.MIN || DE.deck.length > DE.MAX) return;
    if (!SAVE_STATE.slot) return;
    SAVE_STATE.slot.baseDeck = [...DE.deck];
    saveCurrentSlot();
    _deFlash(_ui('ui.deckeditor.saved', { count: DE.deck.length }, `✓ Deck saved! (${DE.deck.length} cards)`), true);
  });

  /* Reset auf gespeichertes Deck */
  document.getElementById('btn-de-reset')?.addEventListener('click', () => {
    const base = SAVE_STATE.slot?.baseDeck;
    _deLoadDeck(base || buildStarterDeck().map(c => c.id));
    _deFlash(_ui('ui.deckeditor.resetSaved', null, '↩ Reset to saved deck'), true);
  });

  /* Zurück-Button */
  document.getElementById('btn-deckeditor-back')?.addEventListener('click', () => {
    showScreen('mainmenu');
    renderMainMenu();
  });
}

/* ── Komplett-Refresh (nach jeder Deck-Änderung) ── */
function _deRefresh() {
  _deRenderPool();
  _deRenderDeck();
  _deUpdateCounter();
}

/* ── Öffentlicher Einstieg ── */
function renderDeckEditor() {
  const slot = SAVE_STATE.slot;

  /* Pool neu aufbauen */
  DE.pool   = _buildDeckPool();
  DE.filter = 'all';
  DE.sort   = 'rarity';

  /* Aktuelles Deck laden: baseDeck > starter */
  const savedIds = slot?.baseDeck
    || buildStarterDeck().map(c => c.id);
  DE.deck = [...savedIds];

  /* Filter/Sort auf "Alle" / "Seltenheit" zurücksetzen */
  document.querySelectorAll('.de-filter').forEach(b => b.classList.toggle('active', b.dataset.filter === 'all'));
  document.querySelectorAll('.de-sort').forEach(b => b.classList.toggle('active', b.dataset.sort === 'rarity'));

  /* Events einmalig binden (nur beim ersten Mal) */
  if (!DE._bound) {
    _deBindFilters();
    DE._bound = true;
  }

  _deRefresh();
}

/* ══════════════════════════════════════════════════════
   SYNERGIE-EDITOR — Rassen-Boni anpassen
══════════════════════════════════════════════════════ */

function openSynergyEditor() {
  const rules = getSynergyRules();
  const overlay = document.createElement('div');
  overlay.className = 'editor-overlay';
  overlay.innerHTML = `
    <div class="editor-modal">
      <div class="editor-modal-header">
        <span>${_ui('ui.editor.synergy.title', null, '⚗ Synergy Editor')}</span>
        <button class="editor-modal-close">✕</button>
      </div>
      <div class="editor-modal-body">
        <p class="editor-hint">${_ui('ui.editor.synergy.hint', null, 'Adjust race synergies and save to apply your changes.')}</p>
        <div id="synergy-editor-list"></div>
      </div>
      <div class="editor-modal-footer">
        <button class="editor-btn-save">${_ui('ui.common.save', null, '💾 Save')}</button>
        <button class="editor-btn-reset">${_ui('ui.common.reset', null, '↩ Reset')}</button>
        <button class="editor-btn-cancel">${_ui('ui.common.cancel', null, 'Cancel')}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const list = overlay.querySelector('#synergy-editor-list');
  const typeLabels = {
    passive_atk_per_card:    'ATK pro Karte (passiv)',
    passive_atk_flat:        'ATK Pauschal (passiv)',
    passive_def_flat:        'DEF Pauschal (passiv)',
    passive_atk_def_flat:    'ATK+DEF Pauschal (passiv)',
    on_death_revive:         'Bei Tod: Revival (Trigger)',
    on_summon_debuff_enemies:'Bei Beschwörung: Feinde schwächen (Trigger)',
  };

  rules.forEach((rule, i) => {
    const row = document.createElement('div');
    row.className = 'syn-editor-row';
    const hasValue = rule.value !== undefined;
    row.innerHTML = `
      <div class="syn-row-header" style="border-left:3px solid ${rule.color || '#aaa'}">
        <span class="syn-race" style="color:${rule.color || '#aaa'}">${rule.race}</span>
        <span class="syn-type">${typeLabels[rule.type] || rule.type}</span>
      </div>
      <div class="syn-row-fields">
        <label>Schwellenwert:
          <input type="number" class="syn-input" data-idx="${i}" data-field="threshold"
            value="${rule.threshold}" min="1" max="5">
        </label>
        ${hasValue ? `<label>Wert (Bonus):
          <input type="number" class="syn-input" data-idx="${i}" data-field="value"
            value="${rule.value}" min="0" max="9999">
        </label>` : '<span class="syn-no-val">Trigger-Synergie (kein Zahlenwert)</span>'}
      </div>
      <div class="syn-desc">${rule.description}</div>
    `;
    list.appendChild(row);
  });

  overlay.querySelector('.editor-modal-close').onclick = () => overlay.remove();
  overlay.querySelector('.editor-btn-cancel').onclick  = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('.editor-btn-reset').onclick = () => {
    if (!confirm(_ui('ui.editor.synergy.confirmReset', null, 'Reset synergies?'))) return;
    const c = window.DD_CUSTOM || {};
    delete c.synergies;
    localStorage.setItem('dd_custom', JSON.stringify(c));
    window.DD_CUSTOM = c;
    overlay.remove();
    _showEditorToast(_ui('ui.editor.synergy.resetDone', null, '↩ Synergies reset'));
  };

  overlay.querySelector('.editor-btn-save').onclick = () => {
    const inputs  = overlay.querySelectorAll('.syn-input');
    const updated = rules.map(r => ({ ...r }));
    inputs.forEach(inp => {
      updated[Number(inp.dataset.idx)][inp.dataset.field] = Number(inp.value);
    });
    const c = window.DD_CUSTOM || {};
    c.synergies = updated;
    localStorage.setItem('dd_custom', JSON.stringify(c));
    window.DD_CUSTOM = c;
    overlay.remove();
    _showEditorToast(_ui('ui.editor.synergy.saved', null, '✓ Synergies saved'));
  };
}

/* ══════════════════════════════════════════════════════
   SPIELFELD-EDITOR — Startfeld für Gegner konfigurieren
══════════════════════════════════════════════════════ */

function openFieldCardEditor() {
  const enemies    = typeof getEnemyList === 'function' ? getEnemyList() : [];
  const fieldCards = typeof FIELD_CARDS !== 'undefined' ? FIELD_CARDS : [];

  const overlay = document.createElement('div');
  overlay.className = 'editor-overlay';
  overlay.innerHTML = `
    <div class="editor-modal">
      <div class="editor-modal-header">
        <span>${_ui('ui.editor.field.title', null, '🗺 Field Editor')}</span>
        <button class="editor-modal-close">✕</button>
      </div>
      <div class="editor-modal-body">
        <p class="editor-hint">${_ui('ui.editor.field.hint', null, 'Choose which field card each enemy starts with at the beginning of battle.')}</p>
        <div id="field-editor-list"></div>
        <div class="field-editor-preview-box">
          <div class="fe-section-label">${_ui('ui.editor.field.overview', null, '📖 Field Card Overview')}</div>
          ${fieldCards.map(fc => `
            <div class="fe-card-row">
              <span class="fe-card-emoji">${_feEmoji(fc.background)}</span>
              <span class="fe-card-name">${fc.name}</span>
              <span class="fe-card-rarity rarity-${fc.rarity}">${fc.rarity}</span>
              <span class="fe-card-desc">${typeof getFieldCardDescription === 'function' ? getFieldCardDescription(fc) : ''}</span>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="editor-modal-footer">
        <button class="editor-btn-save">${_ui('ui.common.save', null, '💾 Save')}</button>
        <button class="editor-btn-cancel">${_ui('ui.common.cancel', null, 'Cancel')}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const list = overlay.querySelector('#field-editor-list');
  const customEnemies = window.DD_CUSTOM?.enemies || {};

  enemies.forEach(enemy => {
    const current = customEnemies[enemy.id]?.startFieldCard || enemy.startFieldCard || '';
    const row = document.createElement('div');
    row.className = 'fe-enemy-row';
    row.innerHTML = `
      <div class="fe-enemy-name">${enemy.name || enemy.id}</div>
      <select class="fe-select" data-enemy="${enemy.id}">
        <option value="">${_ui('ui.editor.field.none', null, '— No Field —')}</option>
        ${fieldCards.map(fc => `
          <option value="${fc.id}" ${current === fc.id ? 'selected' : ''}>
            ${_feEmoji(fc.background)} ${fc.name} (${fc.rarity})
          </option>
        `).join('')}
      </select>
    `;
    list.appendChild(row);
  });

  overlay.querySelector('.editor-modal-close').onclick = () => overlay.remove();
  overlay.querySelector('.editor-btn-cancel').onclick  = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('.editor-btn-save').onclick = () => {
    const selects = overlay.querySelectorAll('.fe-select');
    const c = window.DD_CUSTOM || {};
    if (!c.enemies) c.enemies = {};
    selects.forEach(sel => {
      const eid = sel.dataset.enemy;
      if (!c.enemies[eid]) c.enemies[eid] = {};
      if (sel.value) c.enemies[eid].startFieldCard = sel.value;
      else           delete c.enemies[eid].startFieldCard;
    });
    localStorage.setItem('dd_custom', JSON.stringify(c));
    window.DD_CUSTOM = c;
    overlay.remove();
    _showEditorToast(_ui('ui.editor.field.saved', null, '✓ Field settings saved'));
  };
}

function _feEmoji(bg) {
  const m = { koboldwald:'🌲', vulkan:'🌋', heilig:'✨', schatten:'🌑', toten:'💀', drache:'🐉', maschine:'⚙️', bestie:'🐾', chaos:'🌀' };
  return m[bg] || '🗺';
}

function _showEditorToast(msg) {
  const t = document.createElement('div');
  t.className = 'editor-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('editor-toast-in'), 10);
  setTimeout(() => { t.classList.remove('editor-toast-in'); setTimeout(() => t.remove(), 400); }, 2500);
}
