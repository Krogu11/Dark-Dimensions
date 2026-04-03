/* ============================================================
   ui/map.js — World Map Rendering
   SVG-basiert: Knoten + Verbindungslinien
   ============================================================ */

function renderMap() {
  const container = document.getElementById('map-container');
  if (!container) return;

  const actData = (typeof getRunActData === 'function')
    ? getRunActData()
    : (RUN_STATE.currentActId ? getActData(RUN_STATE.currentActId) : getActData(RUN_STATE.currentActIndex));
  if (!actData) return;

  if (typeof setMusicPlaylist === 'function') setMusicPlaylist(MUSIC_PLAYLISTS.campaign);

  // Hintergrund
  document.getElementById('screen-map').style.background = actData.background;

  // HUD aktualisieren
  document.getElementById('run-hp').textContent   = RUN_STATE.playerHP;
  document.getElementById('run-ds').textContent = typeof getDimensionsSeelen === 'function' ? getDimensionsSeelen() : 0;
  document.getElementById('run-act-name').textContent = actData.actName;
  document.getElementById('run-deck-count').textContent = RUN_STATE.deck.length;
  document.getElementById('run-maxhp').textContent = RUN_STATE.maxHP;

  // LP-Balken
  const pct = (RUN_STATE.playerHP / RUN_STATE.maxHP) * 100;
  const bar = document.getElementById('run-hp-bar');
  if (bar) {
    bar.style.width = `${Math.max(0, pct)}%`;
    bar.style.background = pct > 50 ? '#44ff88' : pct > 25 ? '#ffaa00' : '#ff4444';
  }

  container.innerHTML = '';
  const W = container.clientWidth  || 900;
  const H = container.clientHeight || 500;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.setAttribute('class', 'map-svg');

  // ── Linien zuerst (hinter Knoten) ──
  actData.nodes.forEach(node => {
    node.next.forEach(nextId => {
      const target = actData.nodes.find(n => n.id === nextId);
      if (!target) return;

      const x1 = (node.x / 100) * W;
      const y1 = (node.y / 100) * H;
      const x2 = (target.x / 100) * W;
      const y2 = (target.y / 100) * H;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1); line.setAttribute('y1', y1);
      line.setAttribute('x2', x2); line.setAttribute('y2', y2);
      line.setAttribute('class', 'map-line');

      const isActive = RUN_STATE.completedNodes.has(node.id) && !RUN_STATE.completedNodes.has(nextId);
      if (isActive) line.classList.add('map-line-active');
      svg.appendChild(line);
    });
  });

  // ── Knoten ──
  actData.nodes.forEach(node => {
    const cx = (node.x / 100) * W;
    const cy = (node.y / 100) * H;
    const completed = RUN_STATE.completedNodes.has(node.id);
    const available = RUN_STATE.availableNodes.has(node.id);
    const isStart   = node.type === 'start';

    // Kreis
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', cx);
    circle.setAttribute('cy', cy);
    circle.setAttribute('r',  node.type === 'boss' ? 28 : 22);
    circle.setAttribute('class', `map-node node-${node.type}`);
    if (completed) circle.classList.add('node-completed');
    if (available) circle.classList.add('node-available');
    if (isStart)   circle.classList.add('node-start');
    svg.appendChild(circle);

    // Icon
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    icon.setAttribute('x', cx);
    icon.setAttribute('y', cy + 6);
    icon.setAttribute('text-anchor', 'middle');
    icon.setAttribute('class', 'map-icon');
    icon.textContent = completed ? '✓' : NODE_ICONS[node.type] || '?';
    svg.appendChild(icon);

    // Label
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', cx);
    label.setAttribute('y', cy + (node.type === 'boss' ? 50 : 42));
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'map-label');
    label.textContent = NODE_LABELS[node.type] || node.type;
    svg.appendChild(label);

    // Klick (nur wenn verfügbar)
    if (available && !isStart) {
      circle.style.cursor = 'pointer';
      icon.style.cursor   = 'pointer';
      circle.addEventListener('click', () => onNodeClick(node));
      icon.addEventListener('click',   () => onNodeClick(node));

      // Pulsierende Animation mit GSAP
      if (window.gsap) {
        gsap.to(circle, { attr:{ r: node.type==='boss'?30:24 }, duration:0.8, repeat:-1, yoyo:true, ease:'sine.inOut' });
      }
    }
  });

  container.appendChild(svg);
}

const NODE_LABELS = {
  start: 'Start',
  battle:'Kampf',
  elite: 'Elite',
  shop:  'Shop',
  rest:  'Lager',
  boss:  'BOSS',
};

/* ── Node-Klick-Handler ── */
function onNodeClick(node) {
  RUN_STATE.currentNodeId   = node.id;
  RUN_STATE.currentNodeType = node.type; // für Boss-Erkennung in engine.js

  switch (node.type) {
    case 'battle':
    case 'elite':
    case 'boss':
      startBattle(resolveNodeEnemy(node));
      break;
    case 'shop':
      showShopScreen();
      break;
    case 'rest':
      showRestScreen();
      break;
  }
}

/* ── Deck-Ansicht öffnen ── */
function showDeckViewer() {
  const overlay = document.getElementById('deck-overlay');
  if (!overlay) return;

  const container = overlay.querySelector('#deck-cards');
  container.innerHTML = '';

  const sorted = [...RUN_STATE.deck].sort((a, b) => a.name.localeCompare(b.name));
  sorted.forEach(card => {
    const el = createCardEl(card, false);
    el.style.cursor = 'default';
    el.addEventListener('mouseover', () => updatePreviewOverlay(card));
    container.appendChild(el);
  });

  overlay.style.display = 'flex';
  if (window.gsap) gsap.fromTo(overlay, { opacity:0 }, { opacity:1, duration:0.3 });
}

function hideDeckViewer() {
  const overlay = document.getElementById('deck-overlay');
  if (overlay) overlay.style.display = 'none';
}

function updatePreviewOverlay(card) {
  const panel = document.getElementById('deck-preview');
  if (!panel) return;
  updatePreviewContent(panel, card);
}

function updatePreviewContent(panel, card) {
  if (!card) { panel.innerHTML = ''; return; }
  const typeLabel = { monster:'Monster', spell:'Zauber', trap:'Falle', fusion:'Fusion' }[card.type] || '';
  const rarLabel  = { common:'Gewöhnlich', rare:'Selten', epic:'Episch', legendary:'Legendär' }[card.rarity] || '';
  panel.innerHTML = `
    <div class="preview-header rarity-${card.rarity}">${card.name}</div>
    <div class="preview-meta">${typeLabel} · ${rarLabel}</div>
    ${card.type==='monster'||card.type==='fusion'?`<div>ATK ${card.atk} / DEF ${card.def}${card.race ? ' · '+card.race : ''}</div>`:''}
    ${card.effect ? `<div>${getEffectDescription(card.effect)}</div>` : ''}
    <div class="preview-flavor">"${card.flavor||''}"</div>
  `;
}
