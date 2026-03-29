/* ============================================================
   ui/reward.js — Karten-Belohnung, Shop, Lager
   ============================================================
   Neu: Ranking-basiertes Drop-System nach gewonnenem Kampf
   ============================================================ */

/* ─────────────────────────────────────────────────────
   REWARD SCREEN: Rang-Anzeige + 1 Drop-Karte
───────────────────────────────────────────────────── */
function showRewardScreen() {
  const bs    = BATTLE_STATE;
  const enemy = bs.enemy;

  // Rang berechnen (ranking.js)
  const rankResult   = calculateBattleRank(
    bs.rankingStats,
    bs.playerLP,
    bs.rankingStats.startPlayerLP || RUN_STATE.maxHP
  );

  // Drop-Karte ermitteln (drops.js)
  const dropResult   = enemy ? resolveDropForEnemy(enemy, rankResult.rank, rankResult.type) : null;
  const droppedCard  = dropResult ? dropResult.card : null;

  renderRankRewardScreen(rankResult, droppedCard, dropResult);
  showScreen('reward');
}

/* ─────────────────────────────────────────────────────
   RANG-REWARD RENDERN
───────────────────────────────────────────────────── */
function renderRankRewardScreen(rankResult, droppedCard, dropResult) {
  const container = document.getElementById('reward-cards');
  if (!container) return;
  container.innerHTML = '';

  // Rang-Buchstabe updaten
  const rankEl  = document.getElementById('reward-rank-letter');
  const typeEl  = document.getElementById('reward-rank-type');
  const scoreEl = document.getElementById('reward-rank-score');
  const subEl   = document.getElementById('reward-sub-text');

  if (rankEl) {
    rankEl.textContent = rankResult.rank;
    rankEl.style.color = getRankColor(rankResult.rank);
    if (window.gsap) {
      gsap.fromTo(rankEl,
        { scale: 0.3, opacity: 0 },
        { scale: 1,   opacity: 1, duration: 0.5, ease: 'elastic.out(1,0.5)', delay: 0.1 }
      );
    }
  }
  if (typeEl)  typeEl.textContent  = rankResult.type === 'TEC' ? '🧠 TAKTIK' : '⚔ KRAFT';
  if (scoreEl) scoreEl.textContent = `Score: ${rankResult.score}`;
  if (subEl)   subEl.textContent   = droppedCard ? 'DEIN DROP' : 'KEINE KARTE VERFÜGBAR';

  // Kein Drop? Weiter-Button anzeigen
  if (!droppedCard) {
    const noCard = document.createElement('div');
    noCard.style.cssText = 'color:#555;font-size:14px;margin:20px 0';
    noCard.textContent   = 'Der Gegner hat keine passende Karte fallen lassen.';
    container.appendChild(noCard);
    return;
  }

  // Drop-Karte rendern
  const wrapper = document.createElement('div');
  wrapper.className = 'reward-card-wrapper';

  const el = createCardEl(droppedCard, false);
  el.style.transform = 'scale(1.2)';

  const info = document.createElement('div');
  info.className = 'reward-card-info';

  const typeNames = { monster:'Monster', spell:'Zauber', trap:'Falle', fusion:'Fusion' };
  const rarityNames = { common:'Gewöhnlich', uncommon:'Ungewöhnlich', rare:'Selten', epic:'Episch', legendary:'Legendär' };

  // Drop-Chance anzeigen (wenn verfügbar)
  const chanceStr = dropResult
    ? `<div class="reward-drop-chance">${dropResult.dropChance}% Drop-Chance</div>`
    : '';

  info.innerHTML = `
    <div class="reward-card-name">${droppedCard.name}</div>
    <div class="reward-card-type">${typeNames[droppedCard.type] || droppedCard.type}</div>
    <div class="reward-card-rarity rarity-${droppedCard.rarity}">
      ${rarityNames[droppedCard.rarity] || droppedCard.rarity}
    </div>
    ${droppedCard.effect ? `<div class="reward-effect">${getEffectDescription(droppedCard.effect)}</div>` : ''}
    ${chanceStr}
  `;

  const btn = document.createElement('button');
  btn.className   = 'btn-reward-pick';
  btn.textContent = '✓ Dem Deck hinzufügen';
  btn.addEventListener('click', () => pickRewardCard(droppedCard));

  wrapper.appendChild(el);
  wrapper.appendChild(info);
  wrapper.appendChild(btn);
  container.appendChild(wrapper);

  if (window.gsap) {
    gsap.fromTo(wrapper,
      { opacity: 0, y: 40, scale: 0.85 },
      { opacity: 1, y: 0,  scale: 1, duration: 0.55, ease: 'back.out(1.5)', delay: 0.35 }
    );
  }
}

function pickRewardCard(card) {
  RUN_STATE.deck.push(cloneCard(card));
  battleLog && battleLog(`🃏 ${card.name} dem Deck hinzugefügt`, 'summon');
  showScreen('map');
  renderMap();
}

function skipReward() {
  showScreen('map');
  renderMap();
}

/* ─────────────────────────────────────────────────────
   SHOP SCREEN
───────────────────────────────────────────────────── */
let _shopOffer = [];

function showShopScreen() {
  _shopOffer = buildShopOffer();
  renderShop();
  showScreen('shop');
}

function renderShop() {
  const container = document.getElementById('shop-cards');
  if (!container) return;
  container.innerHTML = '';

  document.getElementById('shop-gold').textContent = RUN_STATE.gold;

  _shopOffer.forEach((card, i) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'shop-item';

    const el       = createCardEl(card, false);
    const priceTag = document.createElement('div');
    priceTag.className   = 'shop-price';
    priceTag.textContent = `💰 ${card.price} Gold`;

    const btn = document.createElement('button');
    btn.className   = 'btn-shop-buy';
    btn.textContent = RUN_STATE.gold >= card.price ? 'Kaufen' : 'Zu teuer';
    btn.disabled    = RUN_STATE.gold < card.price;
    btn.addEventListener('click', () => buyCard(i));

    wrapper.appendChild(el);
    wrapper.appendChild(priceTag);
    wrapper.appendChild(btn);
    container.appendChild(wrapper);

    if (window.gsap) {
      gsap.fromTo(wrapper, { opacity:0, x:-20 }, { opacity:1, x:0, duration:0.4, delay:i*0.1 });
    }
  });

  renderRemoveCardZone();
}

function buyCard(offerIndex) {
  const card = _shopOffer[offerIndex];
  if (!card || RUN_STATE.gold < card.price) return;
  RUN_STATE.gold -= card.price;
  RUN_STATE.deck.push(cloneCard(card));
  _shopOffer.splice(offerIndex, 1);
  renderShop();
}

function renderRemoveCardZone() {
  const zone = document.getElementById('shop-remove-zone');
  if (!zone) return;
  zone.innerHTML = `
    <h3>🗑 Karte aus Deck entfernen</h3>
    <p style="font-size:12px;color:#888">Kosten: 25 Gold. Stärkt dein Deck durch Fokussierung.</p>
    <div id="remove-card-list" class="remove-card-list"></div>
  `;

  const list = document.getElementById('remove-card-list');
  RUN_STATE.deck.forEach((card, i) => {
    const el = document.createElement('div');
    el.className = 'remove-card-item';
    el.innerHTML = `<span>${card.name}</span><span class="rarity-${card.rarity}">${card.rarity}</span>`;
    el.addEventListener('click', () => removeCardFromDeck(i));
    list.appendChild(el);
  });
}

function removeCardFromDeck(index) {
  if (RUN_STATE.gold < 25)          { alert('Nicht genug Gold (25 benötigt)'); return; }
  if (RUN_STATE.deck.length <= 5)   { alert('Deck muss mindestens 5 Karten haben'); return; }
  RUN_STATE.deck.splice(index, 1);
  RUN_STATE.gold -= 25;
  renderShop();
}

function leaveShop() {
  completeNode(RUN_STATE.currentNodeId);
  showScreen('map');
  renderMap();
}

/* ─────────────────────────────────────────────────────
   REST SCREEN (Lager)
───────────────────────────────────────────────────── */
function showRestScreen() {
  const healAmount = Math.floor(RUN_STATE.maxHP * 0.3);
  document.getElementById('rest-heal-amount').textContent = healAmount;
  document.getElementById('rest-current-hp').textContent  = RUN_STATE.playerHP;
  document.getElementById('rest-max-hp').textContent      = RUN_STATE.maxHP;
  showScreen('rest');
}

function restHeal() {
  const healPct = (window.DD_CUSTOM && window.DD_CUSTOM.config && window.DD_CUSTOM.config['cfg-restratio'])
    ? Number(window.DD_CUSTOM.config['cfg-restratio']) / 100 : 0.3;
  const healAmount = Math.floor(RUN_STATE.maxHP * healPct);
  RUN_STATE.playerHP = Math.min(RUN_STATE.playerHP + healAmount, RUN_STATE.maxHP);
  completeNode(RUN_STATE.currentNodeId);
  showScreen('map');
  renderMap();
}

function restRemoveCard() {
  showRemoveCardScreen();
}

function showRemoveCardScreen() {
  const overlay = document.getElementById('remove-overlay');
  if (!overlay) return;

  const list = document.getElementById('remove-overlay-list');
  list.innerHTML = '';

  RUN_STATE.deck.forEach((card, i) => {
    const row = document.createElement('div');
    row.className = 'remove-overlay-row';
    row.innerHTML = `
      <div class="remove-row-card">
        <span>${card.name}</span>
        <span class="rarity-${card.rarity}">${card.rarity}</span>
        ${card.type === 'monster' ? `<span>ATK ${card.atk}</span>` : ''}
      </div>
      <button class="btn-remove" onclick="removeForRest(${i})">Entfernen</button>
    `;
    list.appendChild(row);
  });

  overlay.style.display = 'flex';
}

function removeForRest(index) {
  RUN_STATE.deck.splice(index, 1);
  document.getElementById('remove-overlay').style.display = 'none';
  completeNode(RUN_STATE.currentNodeId);
  showScreen('map');
  renderMap();
}

function closeRemoveOverlay() {
  document.getElementById('remove-overlay').style.display = 'none';
}
