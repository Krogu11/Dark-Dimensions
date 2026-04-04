/* ============================================================
   ui/reward.js — Karten-Belohnung, Shop, Lager
   ============================================================
   Vereinfachtes Drop-System: kein Rang, einheitliche Droptabelle.
   ============================================================ */

/* ─────────────────────────────────────────────────────
   REWARD SCREEN: Sieg-Anzeige + 1 Drop-Karte
───────────────────────────────────────────────────── */
function showRewardScreen() {
  /* _isFreeDuel SOFORT sichern — vor möglichen Side-Effects */
  const isFreeDuel = !!RUN_STATE._isFreeDuel;

  const bs    = BATTLE_STATE;
  const enemy = bs.enemy;

  /* Drop aus einheitlicher Tabelle ziehen (drops.js) */
  const dropResult  = enemy ? resolveDropForEnemy(enemy) : null;
  const droppedCard = dropResult ? dropResult.card : null;

  _renderRewardScreen(droppedCard, dropResult, isFreeDuel);
  showScreen('reward');
}

/* ─────────────────────────────────────────────────────
   REWARD SCREEN RENDERN
───────────────────────────────────────────────────── */
function _renderRewardScreen(droppedCard, dropResult, isFreeDuel) {
  const container = document.getElementById('reward-cards');
  if (!container) return;
  container.innerHTML = '';

  /* Sieg-Header animieren */
  const victoryEl = document.getElementById('reward-victory-icon');
  if (victoryEl && window.gsap) {
    gsap.fromTo(victoryEl,
      { scale: 0.3, opacity: 0 },
      { scale: 1,   opacity: 1, duration: 0.5, ease: 'elastic.out(1,0.5)', delay: 0.1 }
    );
  }

  const subEl = document.getElementById('reward-sub-text');
  if (subEl) {
    if (!droppedCard) {
      subEl.textContent = t('ui.reward.noCardAvailable', null, { fallbackValue: 'NO CARD AVAILABLE' });
    } else if (isFreeDuel) {
      subEl.textContent = t('ui.reward.lootToCollection', null, { fallbackValue: 'LOOT — goes straight to the collection' });
    } else {
      subEl.textContent = t('ui.reward.yourDrop', null, { fallbackValue: 'YOUR DROP' });
    }
  }

  /* "Überspringen"-Button kontextuell anpassen */
  const skipBtn = document.getElementById('btn-skip-reward');
  if (skipBtn) {
    skipBtn.textContent = isFreeDuel
      ? t('ui.reward.declineBack', null, { fallbackValue: 'Decline — back to list' })
      : t('ui.reward.skipContinue', null, { fallbackValue: 'Skip — continue' });
  }

  // Kein Drop? Weiter-Button anzeigen
  if (!droppedCard) {
    const noCard = document.createElement('div');
    noCard.style.cssText = 'color:#555;font-size:14px;margin:20px 0';
    noCard.textContent   = t('ui.reward.noMatchingDrop', null, { fallbackValue: 'This enemy did not drop a matching card.' });
    container.appendChild(noCard);
    return;
  }

  // Drop-Karte rendern
  const wrapper = document.createElement('div');
  wrapper.className = 'reward-card-wrapper';

  const typeNames   = { monster:t('ui.type.monster'), spell:t('ui.type.spell'), trap:t('ui.type.trap'), fusion:t('ui.type.fusion') };
  const rarityNames = { common:t('ui.rarity.common'), uncommon:t('ui.rarity.uncommon'), rare:t('ui.rarity.rare'), epic:t('ui.rarity.epic'), legendary:t('ui.rarity.legendary') };
  const typeIcon    = { monster:'🐉', spell:'✨', trap:'⚡', fusion:'⚗' }[droppedCard.type] || '?';

  // Drop-Chance anzeigen (wenn verfügbar)
  const chanceStr = dropResult
    ? `<div class="reward-drop-chance">${dropResult.dropChance}% Drop-Chance</div>`
    : '';

  // Artwork-Block wenn Bild vorhanden, sonst kleines Karten-Element
  if (droppedCard.image) {
    const artWrap = document.createElement('div');
    artWrap.className = 'reward-art-wrap';
    artWrap.innerHTML = `
      <img src="${droppedCard.image}" class="reward-art-img" alt="${droppedCard.name}">
      <div class="reward-art-overlay rarity-${droppedCard.rarity}">
        <span class="reward-art-icon">${typeIcon}</span>
        <span class="reward-art-name">${droppedCard.name}</span>
      </div>
    `;
    wrapper.appendChild(artWrap);
  } else {
    const el = createCardEl(droppedCard, false);
    el.style.transform = 'scale(1.2)';
    wrapper.appendChild(el);
  }

  const info = document.createElement('div');
  info.className = 'reward-card-info';
  info.innerHTML = `
    <div class="reward-card-name">${droppedCard.name}</div>
    <div class="reward-card-type">${typeNames[droppedCard.type] || droppedCard.type}</div>
    <div class="reward-card-rarity rarity-${droppedCard.rarity}">
      ${rarityNames[droppedCard.rarity] || droppedCard.rarity}
    </div>
    ${droppedCard.type === 'monster' || droppedCard.type === 'fusion' ? `
      <div class="reward-card-stats">⚔ ${droppedCard.atk} / 🛡 ${droppedCard.def}</div>` : ''}
    ${(droppedCard.effects?.length > 0 || droppedCard.effect) ? `<div class="reward-effect">${getEffectDescription(droppedCard.effects || droppedCard.effect, droppedCard)}</div>` : ''}
    ${chanceStr}
  `;

  const btn = document.createElement('button');
  btn.className = 'btn-reward-pick';
  if (isFreeDuel) {
    // Freies Duell: Karte geht direkt ins Kartenbuch, nicht ins Run-Deck
    btn.textContent = t('ui.reward.addToCollection', null, { fallbackValue: '🎒 Add to collection' });
    btn.addEventListener('click', () => pickFreeDuelCard(droppedCard));
  } else {
    btn.textContent = t('ui.reward.addToDeck', null, { fallbackValue: '✓ Add to deck' });
    btn.addEventListener('click', () => pickRewardCard(droppedCard));
  }

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

/**
 * Kampagnen-Run: Karte ins Run-Deck + Buffer.
 * Buffer wird erst bei Boss-Sieg (commitRunProgress) permanent ins Kartenbuch übernommen.
 */
function pickRewardCard(card) {
  RUN_STATE.deck.push(cloneCard(card));
  battleLog && battleLog(`🃏 ${card.name} dem Deck hinzugefügt`, 'summon');

  /* In Run-Buffer aufnehmen — wird nach Boss-Sieg permanent ins Kartenbuch übertragen */
  if (typeof earnRunCard === 'function') earnRunCard(card.id);

  _afterReward();
}

/**
 * Freies Duell: Karte sofort und dauerhaft ins Kartenbuch (Beutel).
 * Kein Einfluss auf Run-Deck oder Run-Buffer.
 */
function pickFreeDuelCard(card) {
  console.log('[FreeDuel] pickFreeDuelCard aufgerufen:', card?.id, card?.name);
  console.log('[FreeDuel] SAVE_STATE:', SAVE_STATE ? 'vorhanden' : 'NULL');
  console.log('[FreeDuel] SAVE_STATE.slot:', SAVE_STATE?.slot ? 'vorhanden' : 'NULL');

  if (!card || !card.id) {
    console.error('[FreeDuel] Karte hat keine ID!', card);
    _afterReward();
    return;
  }

  if (SAVE_STATE && SAVE_STATE.slot) {
    // cardCollection ist ein Array — mehrere Kopien derselben Karte sind erlaubt
    if (!Array.isArray(SAVE_STATE.slot.cardCollection)) {
      SAVE_STATE.slot.cardCollection = [];
    }
    SAVE_STATE.slot.cardCollection.push(card.id);
    console.log('[FreeDuel] cardCollection nach Push:', SAVE_STATE.slot.cardCollection);

    if (typeof saveCurrentSlotWithFeedback === 'function') {
      saveCurrentSlotWithFeedback(t('ui.common.gameSaved', null, { fallbackValue: 'Game saved' }));
      console.log('[FreeDuel] saveCurrentSlotWithFeedback() aufgerufen');
    } else if (typeof saveCurrentSlot === 'function') {
      saveCurrentSlot();
      console.log('[FreeDuel] saveCurrentSlot() aufgerufen');
    } else {
      console.error('[FreeDuel] saveCurrentSlot ist keine Funktion!');
    }
  } else {
    console.error('[FreeDuel] Kein SAVE_STATE.slot — Karte kann nicht gespeichert werden!');
  }

  battleLog && battleLog(`🎒 ${card.name} zum Beutel hinzugefügt`, 'summon');
  _afterReward();
}

function skipReward() {
  _afterReward();
}

/** Zentrale Rückkehr-Logik nach Reward-Screen. */
function _afterReward() {
  if (RUN_STATE._freeDuelReturn) {
    /* Freies Duell: direkt zurück zur Gegner-Liste */
    RUN_STATE._freeDuelReturn = false;
    RUN_STATE._isFreeDuel     = false;
    renderFreeDuelScreen();
    showScreen('freeduel');
  } else if (RUN_STATE._worldMode && RUN_STATE._dungeonComplete) {
    /* World-Mode: Dungeon abgeschlossen → zurück zur Weltenkarte */
    if (typeof completeDungeonLocation === 'function') {
      completeDungeonLocation();
    } else {
      strictDataError(t('ui.errors.dungeonCompleteFailed', null, { fallbackValue: 'Dungeon completion could not be processed.' }), 'Worldmap function completeDungeonLocation is missing.');
    }
  } else {
    /* Normaler Run: zurück zur Dungeon-Karte */
    showScreen('map');
    renderMap();
  }
}

/* ─────────────────────────────────────────────────────
   SHOP SCREEN
───────────────────────────────────────────────────── */
let _shopOffer = [];

/* Flag: Shop wurde vom Hauptmenü aus geöffnet (kein Map-Node) */
let _shopFromMainMenu = false;
let _shopReturnMode   = 'mainmenu';

function showShopScreen() {
  _shopFromMainMenu = false;
  _shopOffer = buildShopOffer();
  renderShop();
  showScreen('shop');
}

/**
 * Shop aus dem Hauptmenü öffnen.
 * DS kommen aus dem persistenten Meta-State, gekaufte Karten gehen in die Sammlung.
 */
function showMainMenuShop(returnMode = 'mainmenu') {
  if (!SAVE_STATE || !SAVE_STATE.slot) return;
  _shopFromMainMenu = true;
  _shopReturnMode = returnMode;
  _shopOffer = buildShopOffer();
  renderShop();
  showScreen('shop');
}

function renderShop() {
  const container = document.getElementById('shop-cards');
  if (!container) return;
  container.innerHTML = '';

  document.getElementById('shop-ds').textContent = typeof getDimensionsSeelen === 'function' ? getDimensionsSeelen() : 0;

  _shopOffer.forEach((card, i) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'shop-item';

    const el       = createCardEl(card, false);
    const priceTag = document.createElement('div');
    priceTag.className   = 'shop-price';
    priceTag.textContent = `✦ ${card.price} DS`;

    const btn = document.createElement('button');
    btn.className   = 'btn-shop-buy';
    const canAfford = typeof getDimensionsSeelen === 'function' ? getDimensionsSeelen() >= card.price : false;
    btn.textContent = canAfford
      ? t('ui.shop.buy', null, { fallbackValue: 'Buy' })
      : t('ui.shop.tooExpensive', null, { fallbackValue: 'Too expensive' });
    btn.disabled    = !canAfford;
    btn.addEventListener('click', () => buyCard(i));

    wrapper.appendChild(el);
    wrapper.appendChild(priceTag);
    wrapper.appendChild(btn);
    container.appendChild(wrapper);

    if (window.gsap) {
      gsap.fromTo(wrapper, { opacity:0, x:-20 }, { opacity:1, x:0, duration:0.4, delay:i*0.1 });
    }
  });
}

function buyCard(offerIndex) {
  const card = _shopOffer[offerIndex];
  if (!card || typeof spendDimensionsSeelen !== 'function' || !spendDimensionsSeelen(card.price, false)) return;

  if (_shopFromMainMenu) {
    /* Hauptmenü-Shop: Karte geht in die persistente Sammlung des Slots */
    if (SAVE_STATE && SAVE_STATE.slot) {
      if (!SAVE_STATE.slot.cardCollection) SAVE_STATE.slot.cardCollection = [];
      SAVE_STATE.slot.cardCollection.push(card.id);
    }
  } else {
    /* Run-Shop: Karte geht ins aktive Run-Deck */
    RUN_STATE.deck.push(cloneCard(card));
  }

  _shopOffer.splice(offerIndex, 1);
  if (_shopFromMainMenu) {
    if (typeof saveCurrentSlotWithFeedback === 'function') {
      saveCurrentSlotWithFeedback(t('ui.common.gameSaved', null, { fallbackValue: 'Game saved' }));
    } else if (typeof saveCurrentSlot === 'function') {
      saveCurrentSlot();
    }
  }
  renderShop();
}


function leaveShop() {
  if (_shopFromMainMenu) {
    _shopFromMainMenu = false;
    if (_shopReturnMode === 'hub' && typeof showHubScreen === 'function' && typeof _getWorldMapData === 'function') {
      const worldMap = _getWorldMapData();
      const currentLoc = worldMap ? worldMap.find(loc => loc.id === WORLD_STATE.currentLocationId) : null;
      if (currentLoc) {
        showHubScreen(currentLoc);
        return;
      }
    }
    if (typeof renderMainMenu === 'function') renderMainMenu();
    showScreen('mainmenu');
  } else {
    /* Run-Shop: Node abschließen und zurück zur Karte */
    completeNode(RUN_STATE.currentNodeId);
    showScreen('map');
    renderMap();
  }
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

/** Lagerfeuer überspringen — kein Heileffekt, Node abschließen und weiter. */
function restSkip() {
  completeNode(RUN_STATE.currentNodeId);
  showScreen('map');
  renderMap();
}
