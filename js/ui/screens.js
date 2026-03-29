/* ============================================================
   ui/screens.js — Screen-Manager
   Alle Screens als <div class="screen"> — nur einer sichtbar
   ============================================================ */

const SCREENS = ['title','map','battle','reward','shop','rest','gameover','victory'];

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
  gsap.fromTo(slot,
    { scale: 0.3, opacity: 0 },
    { scale: 1,   opacity: 1, duration: 0.45, ease: 'back.out(1.4)' }
  );
}
