/* ============================================================
   ui/screens.js — Screen-Manager
   Alle Screens als <div class="screen"> — nur einer sichtbar
   ============================================================ */

const SCREENS = ['title','map','battle','reward','shop','rest','gameover','victory','mainmenu','freeduel','deckeditor'];

function showScreen(name) {
  SCREENS.forEach(s => {
    const el = document.getElementById(`screen-${s}`);
    if (el) el.classList.toggle('active', s === name);
  });

  // GSAP: Einblenden
  const active = document.getElementById(`screen-${name}`);
  if (active && window.gsap) {
    gsap.fromTo(active, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' });
  }
}

/* ── Battle Log ── */
function battleLog(text, type = '') {
  const log = document.getElementById('battle-log');
  if (!log) return;
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = text;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
  // Max. 80 Einträge
  while (log.children.length > 80) log.removeChild(log.firstChild);
}

/* ── Floating Damage Number ── */
function animateDamageNumber(side, amount) {
  const anchor = document.getElementById(`${side}-lp-box`);
  if (!anchor || !window.gsap) return;

  const el = document.createElement('div');
  el.className = 'dmg-float';
  el.textContent = `-${amount}`;
  anchor.appendChild(el);

  gsap.fromTo(el,
    { opacity: 1, y: 0, scale: 1.2 },
    { opacity: 0, y: -55, scale: 0.9, duration: 0.9, ease: 'power2.out',
      onComplete: () => el.remove() }
  );
}

/* ── Summon Animation ── */
function animateSummon(slotIndex, isPlayer) {
  if (!window.gsap) return;
  const fieldId = isPlayer ? 'player-field' : 'enemy-field';
  const field   = document.getElementById(fieldId);
  if (!field) return;
  const slot = field.children[slotIndex];
  if (!slot) return;

  // Pop-in
  gsap.fromTo(slot,
    { scale: 0.25, opacity: 0, rotation: -8 },
    {
      scale: 1, opacity: 1, rotation: 0,
      duration: 0.5, ease: 'back.out(1.7)',
      onComplete: () => {
        // Kurzer Summon-Pulse auf der Karte
        const card = slot.querySelector('.card');
        if (card) {
          card.classList.add('card-summon-flash');
          setTimeout(() => card.classList.remove('card-summon-flash'), 520);
        }
      }
    }
  );

  // Spawn-Partikel (lila, für Monster)
  if (isPlayer) {
    const rect = slot.getBoundingClientRect();
    if (rect.width > 0) {
      const palette = ['#aa44ff','#cc88ff','#ffffff','#6600cc'];
      for (let i = 0; i < 8; i++) {
        const p = document.createElement('div');
        p.style.cssText = `
          position:fixed;width:5px;height:5px;border-radius:50%;
          left:${rect.left + rect.width/2}px;top:${rect.top + rect.height/2}px;
          background:${palette[i % palette.length]};
          z-index:9999;pointer-events:none;transform:translate(-50%,-50%);
        `;
        document.body.appendChild(p);
        const angle = (i / 8) * Math.PI * 2;
        gsap.fromTo(p,
          { x:0, y:0, scale:1, opacity:1 },
          {
            x: Math.cos(angle) * (25 + Math.random() * 40),
            y: Math.sin(angle) * (25 + Math.random() * 40),
            scale: 0, opacity: 0, duration: 0.45,
            ease: 'power2.out', onComplete: () => p.remove()
          }
        );
      }
    }
  }
}

/* ══════════════════════════════════════════════════════
   COMBAT ANIMATIONS
══════════════════════════════════════════════════════ */

/* ── Global animation lock — prevents input during animations ── */
let _animLock = false;
function isAnimating() { return _animLock; }

/* ── Angriffs-Animation: Angreifer stürzt sich auf Verteidiger ── */
function animateAttackLunge(atkFieldId, atkSlot, defFieldId, defSlot, callback) {
  if (!window.gsap) { callback(); return; }

  const atkField = document.getElementById(atkFieldId);
  const defField = document.getElementById(defFieldId);
  if (!atkField || !defField) { callback(); return; }

  const atkSlotEl = atkField.children[atkSlot];
  const defSlotEl = defField.children[defSlot];
  if (!atkSlotEl || !defSlotEl) { callback(); return; }

  const atkCard = atkSlotEl.querySelector('.card') || atkSlotEl;
  const defCard = defSlotEl.querySelector('.card') || defSlotEl;

  const atkRect = atkCard.getBoundingClientRect();
  const defRect = defCard.getBoundingClientRect();

  const dx = (defRect.left + defRect.width  / 2) - (atkRect.left + atkRect.width  / 2);
  const dy = (defRect.top  + defRect.height / 2) - (atkRect.top  + atkRect.height / 2);

  _animLock = true;

  const tl = gsap.timeline({
    onComplete: () => { _animLock = false; callback(); }
  });

  // Angreifer stürzt vor
  tl.to(atkCard, {
    x: dx * 0.72, y: dy * 0.72,
    scale: 1.12,
    duration: 0.17,
    ease: 'power3.in'
  })
  // Einschlag: Verteidiger zittert + Blitz-Flash
  .add(() => {
    defCard.style.filter = 'brightness(4) saturate(0)';
    setTimeout(() => { defCard.style.filter = ''; }, 110);
  })
  .to(defCard, { x: -14, y:  3, duration: 0.05, ease: 'power4.out' }, '<')
  .to(defCard, { x:  10, y: -2, duration: 0.05, ease: 'power4.out' })
  .to(defCard, { x:  -6, y:  2, duration: 0.04, ease: 'power4.out' })
  .to(defCard, { x:   0, y:  0, duration: 0.07, ease: 'power2.out' })
  // Angreifer zurück
  .to(atkCard, {
    x: 0, y: 0, scale: 1,
    duration: 0.22,
    ease: 'back.out(2)'
  }, '-=0.1');
}

/* ── Direktangriff Animation: stürzt auf Gegner-Portrait ── */
function animateDirectAttackLunge(atkFieldId, atkSlot, callback) {
  if (!window.gsap) { callback(); return; }

  const atkField = document.getElementById(atkFieldId);
  const target   = document.getElementById('enemy-portrait') ||
                   document.getElementById('enemy-lp-box');
  if (!atkField || !target) { callback(); return; }

  const atkSlotEl = atkField.children[atkSlot];
  if (!atkSlotEl) { callback(); return; }

  const atkCard  = atkSlotEl.querySelector('.card') || atkSlotEl;
  const atkRect  = atkCard.getBoundingClientRect();
  const trgRect  = target.getBoundingClientRect();

  const dx = (trgRect.left + trgRect.width  / 2) - (atkRect.left + atkRect.width  / 2);
  const dy = (trgRect.top  + trgRect.height / 2) - (atkRect.top  + atkRect.height / 2);

  _animLock = true;

  gsap.timeline({ onComplete: () => { _animLock = false; callback(); } })
    .to(atkCard, { x: dx * 0.6, y: dy * 0.6, scale: 1.1, duration: 0.2, ease: 'power3.in' })
    .add(() => {
      target.style.filter = 'brightness(3)';
      setTimeout(() => { target.style.filter = ''; }, 130);
    })
    .to(target, { x: -8, duration: 0.05, yoyo: true, repeat: 3, ease: 'none' }, '<')
    .to(atkCard, { x: 0, y: 0, scale: 1, duration: 0.25, ease: 'back.out(2)' });
}

/* ── Karten-Zertrümmerungs-Animation (fire & forget, fixed-position clone) ── */
function animateCardShatter(fieldId, slotIdx) {
  if (!window.gsap) return;
  const field = document.getElementById(fieldId);
  if (!field) return;
  const slotEl = field.children[slotIdx];
  if (!slotEl) return;
  const cardEl = slotEl.querySelector('.card') || slotEl;

  const rect = cardEl.getBoundingClientRect();
  if (rect.width === 0) return;

  // Sichtbaren Klon über Original legen
  const clone = cardEl.cloneNode(true);
  clone.style.cssText += `
    position:fixed !important;
    left:${rect.left}px !important;
    top:${rect.top}px !important;
    width:${rect.width}px !important;
    height:${rect.height}px !important;
    margin:0 !important;
    pointer-events:none;
    z-index:9998;
    transform:none !important;
  `;
  document.body.appendChild(clone);

  // Splitter-Partikel
  _spawnShatterParticles(rect);

  // Klon zersplittert
  gsap.to(clone, {
    scale: 0.05,
    rotation: (Math.random() - 0.5) * 55,
    opacity: 0,
    duration: 0.42,
    ease: 'power3.in',
    onComplete: () => clone.remove()
  });
}

function _spawnShatterParticles(rect) {
  if (!window.gsap) return;
  const cx = rect.left + rect.width  / 2;
  const cy = rect.top  + rect.height / 2;
  const palette = ['#ff3344','#ff7700','#ffe444','#ffffff','#aa44ff','#44ddff'];
  const count = 12;

  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    const w = 3 + Math.random() * 9;
    const h = 3 + Math.random() * 9;
    p.style.cssText = `
      position:fixed;
      width:${w}px;height:${h}px;
      left:${cx}px;top:${cy}px;
      background:${palette[i % palette.length]};
      border-radius:${Math.random() > 0.4 ? '50%' : '2px'};
      z-index:9999;pointer-events:none;
      transform:translate(-50%,-50%);
    `;
    document.body.appendChild(p);

    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.8;
    const dist  = 35 + Math.random() * 90;
    gsap.fromTo(p,
      { x: 0, y: 0, scale: 1, opacity: 1 },
      {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        scale: 0,
        opacity: 0,
        rotation: Math.random() * 360,
        duration: 0.38 + Math.random() * 0.32,
        ease: 'power2.out',
        onComplete: () => p.remove()
      }
    );
  }
}

/* ── Fusions-Animation: Karten leuchten auf und verschmelzen ── */
function animateFusionCards(idx1, idx2, callback) {
  if (!window.gsap) { callback(); return; }
  const hand = document.getElementById('hand-zone');
  if (!hand) { callback(); return; }

  const el1 = hand.children[idx1];
  const el2 = hand.children[idx2];
  if (!el1 || !el2) { callback(); return; }

  // Mittelpunkt zwischen den beiden Karten bestimmen
  const r1 = el1.getBoundingClientRect();
  const r2 = el2.getBoundingClientRect();
  const midX = (r1.left + r1.width / 2 + r2.left + r2.width / 2) / 2;
  const midY = (r1.top  + r1.height/ 2 + r2.top  + r2.height/ 2) / 2;

  // Fusion-Lichtblitz
  const flash = document.createElement('div');
  flash.style.cssText = `
    position:fixed;left:${midX}px;top:${midY}px;
    width:12px;height:12px;border-radius:50%;
    background:radial-gradient(circle, #ffffff, #aa44ff, transparent);
    transform:translate(-50%,-50%);
    pointer-events:none;z-index:9998;
  `;
  document.body.appendChild(flash);

  _animLock = true;

  const tl = gsap.timeline({
    onComplete: () => { _animLock = false; flash.remove(); callback(); }
  });

  // Beide Karten aufleuchten
  tl.to([el1, el2], {
    filter: 'brightness(2.5) saturate(2)',
    scale: 1.08,
    duration: 0.2,
    ease: 'power2.in'
  })
  // Lichtblitz expandiert
  .to(flash, { scale: 18, opacity: 0.9, duration: 0.25, ease: 'power2.out' }, '<0.1')
  // Beide fliegen zur Mitte und verschwinden
  .to(el1, {
    x: midX - (r1.left + r1.width  / 2),
    y: midY - (r1.top  + r1.height / 2),
    scale: 0.1, opacity: 0,
    duration: 0.25, ease: 'power3.in'
  }, '-=0.1')
  .to(el2, {
    x: midX - (r2.left + r2.width  / 2),
    y: midY - (r2.top  + r2.height / 2),
    scale: 0.1, opacity: 0,
    duration: 0.25, ease: 'power3.in'
  }, '<')
  // Flash verblasst
  .to(flash, { opacity: 0, duration: 0.15 }, '-=0.1')
  // Reset
  .set([el1, el2], { x: 0, y: 0, scale: 1, opacity: 1, filter: 'none' });
}

/* ── Phase-Ankündigung: großes Label blendet kurz auf ── */
function animatePhaseAnnounce(label) {
  if (!window.gsap) return;

  let overlay = document.getElementById('phase-announce-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'phase-announce-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
      pointer-events:none;z-index:9000;
    `;
    document.body.appendChild(overlay);
  }

  const colors = {
    'DRAW PHASE':   '#44ddff',
    'MAIN PHASE':   '#aaffaa',
    'BATTLE PHASE': '#ff6644',
    'END PHASE':    '#ffcc44',
  };
  const color = colors[label] || '#ffffff';

  overlay.innerHTML = `
    <div style="
      font-family:'Cinzel',serif;
      font-size:clamp(22px,4vw,48px);
      font-weight:900;
      color:${color};
      text-shadow:0 0 20px ${color}, 0 0 50px ${color}88, 2px 2px 0 #000;
      letter-spacing:0.15em;
      white-space:nowrap;
    ">${label}</div>
  `;

  gsap.fromTo(overlay.firstElementChild,
    { opacity: 0, scale: 0.6, y: 20 },
    {
      opacity: 1, scale: 1, y: 0, duration: 0.3, ease: 'back.out(1.5)',
      onComplete: () => {
        gsap.to(overlay.firstElementChild, {
          opacity: 0, scale: 1.1, y: -15, delay: 0.55, duration: 0.3, ease: 'power2.in',
          onComplete: () => { overlay.innerHTML = ''; }
        });
      }
    }
  );
}
