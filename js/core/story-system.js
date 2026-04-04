(function initDDStorySystem(global) {
  const runtime = {
    initialized: false,
    activeEvent: null,
    pendingBattle: null,
    currentHubId: null,
  };

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getCustom() {
    return global.DD_CUSTOM || {};
  }

  function getEvents() {
    return Array.isArray(getCustom().events) ? getCustom().events : [];
  }

  function getQuests() {
    return Array.isArray(getCustom().quests) ? getCustom().quests : [];
  }

  function getHubs() {
    return Array.isArray(getCustom().hubs) ? getCustom().hubs : [];
  }

  function byId(list, id) {
    return (list || []).find(entry => entry && entry.id === id) || null;
  }

  function translateKey(key, fallback) {
    return typeof t === 'function' ? t(key, null, { fallbackValue: fallback || key || '' }) : (fallback || key || '');
  }

  function seedLocale(key, value) {
    if (!key || value === undefined || value === null || value === '') return;
    if (global.I18N && typeof global.I18N.seedLocaleValue === 'function') {
      global.I18N.seedLocaleValue('de', 'story', key, value);
    }
  }

  function prepareLocalizedContent() {
    getEvents().forEach(event => {
      if (!event) return;
      event.titleKey = event.titleKey || `event.${event.id}.title`;
      seedLocale(event.titleKey, event.title);
      event.title = translateKey(event.titleKey, event.title || event.id);
      (event.dialog || []).forEach((step, stepIndex) => {
        if (!step) return;
        step.speakerKey = step.speakerKey || `event.${event.id}.step.${stepIndex}.speaker`;
        step.textKey = step.textKey || `event.${event.id}.step.${stepIndex}.text`;
        seedLocale(step.speakerKey, step.speaker);
        seedLocale(step.textKey, step.text);
        step.speaker = translateKey(step.speakerKey, step.speaker || '');
        step.text = translateKey(step.textKey, step.text || '');
        (step.choices || []).forEach((choice, choiceIndex) => {
          choice.textKey = choice.textKey || `event.${event.id}.step.${stepIndex}.choice.${choiceIndex}`;
          seedLocale(choice.textKey, choice.text);
          choice.text = translateKey(choice.textKey, choice.text || '');
        });
      });
    });

    getQuests().forEach(quest => {
      if (!quest) return;
      quest.titleKey = quest.titleKey || `quest.${quest.id}.title`;
      quest.descriptionKey = quest.descriptionKey || `quest.${quest.id}.description`;
      seedLocale(quest.titleKey, quest.title);
      seedLocale(quest.descriptionKey, quest.description);
      quest.title = translateKey(quest.titleKey, quest.title || quest.id);
      quest.description = translateKey(quest.descriptionKey, quest.description || '');
    });

    getHubs().forEach(hub => {
      if (!hub) return;
      hub.nameKey = hub.nameKey || `hub.${hub.id}.name`;
      hub.descriptionKey = hub.descriptionKey || `hub.${hub.id}.description`;
      seedLocale(hub.nameKey, hub.name);
      seedLocale(hub.descriptionKey, hub.description);
      hub.name = translateKey(hub.nameKey, hub.name || hub.id);
      hub.description = translateKey(hub.descriptionKey, hub.description || '');
      (hub.npcs || []).forEach((npc, npcIndex) => {
        npc.nameKey = npc.nameKey || `hub.${hub.id}.npc.${npcIndex}.name`;
        seedLocale(npc.nameKey, npc.name);
        npc.name = translateKey(npc.nameKey, npc.name || npc.id || `NPC ${npcIndex + 1}`);
      });
      (hub.tournaments || []).forEach((tournament, index) => {
        tournament.titleKey = tournament.titleKey || `hub.${hub.id}.tournament.${index}.title`;
        tournament.descriptionKey = tournament.descriptionKey || `hub.${hub.id}.tournament.${index}.description`;
        seedLocale(tournament.titleKey, tournament.title);
        seedLocale(tournament.descriptionKey, tournament.description);
        tournament.title = translateKey(tournament.titleKey, tournament.title || tournament.id || `Tournament ${index + 1}`);
        tournament.description = translateKey(tournament.descriptionKey, tournament.description || '');
      });
      (hub.challenges || []).forEach((challenge, index) => {
        challenge.titleKey = challenge.titleKey || `hub.${hub.id}.challenge.${index}.title`;
        challenge.descriptionKey = challenge.descriptionKey || `hub.${hub.id}.challenge.${index}.description`;
        seedLocale(challenge.titleKey, challenge.title);
        seedLocale(challenge.descriptionKey, challenge.description);
        challenge.title = translateKey(challenge.titleKey, challenge.title || challenge.id || `Challenge ${index + 1}`);
        challenge.description = translateKey(challenge.descriptionKey, challenge.description || '');
      });
    });
  }

  function ensureStoryState() {
    if (!global.SAVE_STATE || !SAVE_STATE.slot) return null;
    if (!SAVE_STATE.slot.storyState || typeof SAVE_STATE.slot.storyState !== 'object') {
      SAVE_STATE.slot.storyState = {
        started: false,
        completedEvents: [],
        activeQuests: {},
        completedQuests: {},
        inventory: [],
        flags: {},
        activeChallenges: {},
        completedChallenges: {},
        completedTournaments: {},
      };
    }
    return SAVE_STATE.slot.storyState;
  }

  function getQuestSave(questId) {
    const state = ensureStoryState();
    if (!state) return null;
    return state.activeQuests[questId] || state.completedQuests[questId] || null;
  }

  function getQuestStatus(questId) {
    const state = ensureStoryState();
    if (!state) return 'locked';
    if (state.completedQuests[questId]) return 'completed';
    if (state.activeQuests[questId]?.status === 'claimable') return 'claimable';
    if (state.activeQuests[questId]) return 'active';
    return 'locked';
  }

  function emitQuestProgress(questId, status) {
    triggerStoryEvents('quest_progress', { questId, status });
  }

  function startQuest(questId) {
    const quest = byId(getQuests(), questId);
    const state = ensureStoryState();
    if (!quest || !state || state.completedQuests[questId]) return false;
    if (!state.activeQuests[questId]) {
      state.activeQuests[questId] = {
        id: questId,
        progress: Number(quest.progress || 0),
        goal: Number(quest.goal || 1),
        status: 'active',
      };
      if (typeof saveCurrentSlot === 'function') saveCurrentSlot();
      emitQuestProgress(questId, 'active');
      return true;
    }
    return false;
  }

  function addQuestProgress(questId, amount) {
    const quest = byId(getQuests(), questId);
    const state = ensureStoryState();
    if (!quest || !state) return false;
    if (!state.activeQuests[questId]) startQuest(questId);
    const entry = state.activeQuests[questId];
    if (!entry || entry.status === 'claimable') return false;
    entry.progress = Math.min(Number(quest.goal || 1), Number(entry.progress || 0) + Math.max(0, Number(amount || 0)));
    if (entry.progress >= Number(quest.goal || 1)) {
      entry.status = 'claimable';
      emitQuestProgress(questId, 'claimable');
    } else {
      emitQuestProgress(questId, 'active');
    }
    if (typeof saveCurrentSlot === 'function') saveCurrentSlot();
    return true;
  }

  function applyReward(reward) {
    const state = ensureStoryState();
    if (!state || !reward) return;
    if (reward.gold && typeof gainDimensionsSeelen === 'function') {
      gainDimensionsSeelen(Number(reward.gold) || 0, false);
    }
    if (reward.card && SAVE_STATE.slot) {
      if (!Array.isArray(SAVE_STATE.slot.cardCollection)) SAVE_STATE.slot.cardCollection = [];
      SAVE_STATE.slot.cardCollection.push(reward.card);
    }
    if (reward.item) state.inventory.push(reward.item);
    if (typeof saveCurrentSlotWithFeedback === 'function') saveCurrentSlotWithFeedback(translateKey('ui.worldmap.save.saved', 'Game saved'));
    else if (typeof saveCurrentSlot === 'function') saveCurrentSlot();
  }

  function claimQuest(questId) {
    const quest = byId(getQuests(), questId);
    const state = ensureStoryState();
    if (!quest || !state) return false;
    const entry = state.activeQuests[questId];
    if (!entry || entry.status !== 'claimable') return false;
    applyReward(quest.reward);
    state.completedQuests[questId] = { id: questId, progress: entry.progress, completedAt: Date.now() };
    delete state.activeQuests[questId];
    emitQuestProgress(questId, 'completed');
    return true;
  }

  function rewardSummary(reward) {
    if (!reward) return '-';
    const parts = [];
    if (reward.gold) parts.push(`${reward.gold} DS`);
    if (reward.card) {
      const card = typeof getCardById === 'function' ? getCardById(reward.card) : null;
      parts.push(card ? card.name : reward.card);
    }
    if (reward.item) parts.push(reward.item);
    return parts.join(' · ') || '-';
  }

  function matchesQuestObjective(quest, enemyId) {
    if (!quest) return false;
    if (!Array.isArray(quest.enemyIds) || quest.enemyIds.length === 0) return true;
    return quest.enemyIds.includes(enemyId);
  }

  function updateObjectivesFromBattle(enemyId) {
    const state = ensureStoryState();
    if (!state) return;
    Object.keys(state.activeQuests || {}).forEach(questId => {
      const quest = byId(getQuests(), questId);
      if (!quest || !matchesQuestObjective(quest, enemyId)) return;
      addQuestProgress(questId, 1);
    });

    Object.keys(state.activeChallenges || {}).forEach(challengeId => {
      const challengeState = state.activeChallenges[challengeId];
      const hub = getHubs().find(entry => (entry.challenges || []).some(ch => ch.id === challengeId));
      const challenge = hub ? (hub.challenges || []).find(ch => ch.id === challengeId) : null;
      if (!challenge || (Array.isArray(challenge.enemyIds) && challenge.enemyIds.length > 0 && !challenge.enemyIds.includes(enemyId))) return;
      challengeState.progress = Math.min(Number(challenge.goal || 1), Number(challengeState.progress || 0) + 1);
      if (challengeState.progress >= Number(challenge.goal || 1)) challengeState.status = 'claimable';
    });
  }

  function conditionMatches(condition, payload) {
    const state = ensureStoryState();
    switch (condition?.type) {
      case 'quest_status':
        return getQuestStatus(condition.questId) === condition.status;
      case 'event_completed':
        return !!state && state.completedEvents.includes(condition.eventId);
      case 'flag':
        return !!state && String(state.flags?.[condition.key]) === String(condition.value);
      case 'location_visited':
        return typeof WORLD_STATE !== 'undefined' && WORLD_STATE.visitedLocations?.has(condition.locationId);
      case 'location_completed':
        return typeof WORLD_STATE !== 'undefined' && WORLD_STATE.completedLocations?.has(condition.locationId);
      case 'hub':
        return payload?.hubId === condition.hubId;
      default:
        return true;
    }
  }

  function eventMatchesTrigger(event, trigger, payload) {
    const state = ensureStoryState();
    if (!event || event.trigger !== trigger) return false;
    if (event.once && state?.completedEvents?.includes(event.id)) return false;
    if (event.hubId && payload?.hubId && event.hubId !== payload.hubId) return false;
    if (event.locationId && payload?.locationId && event.locationId !== payload.locationId) return false;
    if (event.questId && payload?.questId && event.questId !== payload.questId) return false;
    if (event.status && payload?.status && event.status !== payload.status) return false;
    if (event.enemyId && payload?.enemyId && event.enemyId !== payload.enemyId) return false;
    if (Number(event.chance || 1) < 1 && Math.random() > Number(event.chance || 1)) return false;
    return (event.conditions || []).every(condition => conditionMatches(condition, payload));
  }

  function startEventById(eventId, options) {
    const event = byId(getEvents(), eventId);
    if (!event) return false;
    runtime.activeEvent = {
      eventId,
      stepIndex: Math.max(0, Number(options?.stepIndex || 0)),
      returnMode: options?.returnMode || 'worldmap',
      returnHubId: options?.returnHubId || null,
      returnLocationId: options?.returnLocationId || null,
    };
    renderActiveEvent();
    if (typeof showScreen === 'function') showScreen('story');
    return true;
  }

  function triggerStoryEvents(trigger, payload) {
    const match = getEvents().find(event => eventMatchesTrigger(event, trigger, payload || {}));
    if (!match) return false;
    return startEventById(match.id, payload || {});
  }

  function finishActiveEvent() {
    const state = ensureStoryState();
    const current = runtime.activeEvent ? byId(getEvents(), runtime.activeEvent.eventId) : null;
    if (state && current && !state.completedEvents.includes(current.id)) {
      state.completedEvents.push(current.id);
    }
    const fallbackMode = runtime.activeEvent?.returnMode || 'worldmap';
    const fallbackHubId = runtime.activeEvent?.returnHubId || runtime.currentHubId;
    runtime.activeEvent = null;
    if (fallbackMode === 'hub' && fallbackHubId) {
      showHubScreen({ id: fallbackHubId, hubId: fallbackHubId });
    } else if (typeof renderWorldMap === 'function' && typeof showScreen === 'function') {
      renderWorldMap();
      showScreen('worldmap');
    }
  }

  function normalizeEffect(rawEffect) {
    if (!rawEffect) return null;
    if (typeof rawEffect === 'string') {
      const [type, value] = rawEffect.split(':');
      if (!type) return null;
      return { type, value };
    }
    return rawEffect;
  }

  function startStoryBattle(config) {
    if (!config?.enemyId || typeof startBattle !== 'function') return false;
    runtime.pendingBattle = {
      ...config,
      outcome: null,
      previousHP: RUN_STATE.playerHP,
    };
    RUN_STATE._storyBattleSafeReturn = true;
    RUN_STATE.currentNodeId = null;
    startBattle(config.enemyId);
    return true;
  }

  function applyEffect(rawEffect, context) {
    const effect = normalizeEffect(rawEffect);
    const state = ensureStoryState();
    if (!effect) return false;
    switch (effect.type) {
      case 'gain_item':
        if (state) state.inventory.push(effect.value || effect.itemId || '');
        return false;
      case 'give_gold':
      case 'gain_gold':
        if (typeof gainDimensionsSeelen === 'function') gainDimensionsSeelen(Number(effect.value || effect.amount || 0), false);
        return false;
      case 'give_card':
        if (SAVE_STATE?.slot) {
          if (!Array.isArray(SAVE_STATE.slot.cardCollection)) SAVE_STATE.slot.cardCollection = [];
          SAVE_STATE.slot.cardCollection.push(effect.value || effect.cardId);
        }
        return false;
      case 'start_quest':
        startQuest(effect.value || effect.questId);
        return false;
      case 'update_quest':
        addQuestProgress(effect.questId || effect.value, Number(effect.amount || 1));
        return false;
      case 'claim_quest':
        claimQuest(effect.questId || effect.value);
        return false;
      case 'set_flag':
        if (state) state.flags[effect.key] = effect.value;
        return false;
      case 'trigger_event':
        return startEventById(effect.value || effect.eventId, {
          returnMode: context?.returnMode || 'worldmap',
          returnHubId: context?.returnHubId || runtime.currentHubId,
        });
      case 'start_battle':
        return startStoryBattle({
          enemyId: effect.enemyId || effect.value,
          returnMode: context?.returnMode || 'worldmap',
          returnHubId: context?.returnHubId || runtime.currentHubId,
          resumeEventId: context?.eventId || null,
          resumeStepIndex: Number.isInteger(effect.nextAfterBattle) ? Number(effect.nextAfterBattle) : null,
          onWinEventId: effect.onWinEventId || null,
          onLossEventId: effect.onLossEventId || null,
          onWinEffects: cloneJson(effect.onWinEffects || []),
          onLossEffects: cloneJson(effect.onLossEffects || []),
          tournamentId: effect.tournamentId || null,
          challengeId: effect.challengeId || null,
          battleChain: cloneJson(effect.battleChain || []),
          battleIndex: Number(effect.battleIndex || 0),
        });
      default:
        return false;
    }
  }

  function handleChoice(choice) {
    if (!runtime.activeEvent) return;
    const context = {
      eventId: runtime.activeEvent.eventId,
      returnMode: runtime.activeEvent.returnMode,
      returnHubId: runtime.activeEvent.returnHubId,
    };
    const effects = [];
    if (choice.effect) effects.push(choice.effect);
    if (Array.isArray(choice.effects)) effects.push(...choice.effects);
    let interrupted = false;
    effects.forEach(effect => {
      if (applyEffect(effect, context)) interrupted = true;
    });
    if (interrupted) return;
    if (Number.isInteger(choice.next)) {
      runtime.activeEvent.stepIndex = choice.next;
      renderActiveEvent();
      return;
    }
    finishActiveEvent();
  }

  function renderActiveEvent() {
    const eventState = runtime.activeEvent;
    const event = eventState ? byId(getEvents(), eventState.eventId) : null;
    const screen = global.document.getElementById('screen-story');
    if (!screen || !event) return;
    const step = (event.dialog || [])[eventState.stepIndex] || null;
    const choices = Array.isArray(step?.choices) && step.choices.length > 0
      ? step.choices
      : [{ text: translateKey('ui.story.next', 'Continue'), next: eventState.stepIndex + 1 }];
    const totalSteps = Math.max(1, (event.dialog || []).length);

    screen.innerHTML = `
      <div class="story-container" style="max-width:880px;margin:0 auto;padding:32px 20px;display:flex;flex-direction:column;gap:18px">
        <div class="story-header">
          <div class="story-location-name">${event.title || event.id}</div>
          <div class="story-progress">${Math.min((eventState.stepIndex || 0) + 1, totalSteps)} / ${totalSteps}</div>
        </div>
        <div class="story-scene">
          <div class="story-dialog-box" style="width:100%">
            ${step?.speaker ? `<div class="story-speaker">${step.speaker}</div>` : ''}
            <div class="story-text" id="story-text-content">${step?.text || ''}</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${choices.map((choice, index) => `<button class="btn-success" data-story-choice="${index}" style="text-align:left;padding:14px 16px;border-radius:10px">${choice.text || translateKey('ui.story.next', 'Continue')}</button>`).join('')}
        </div>
        <div class="story-footer">
          <button class="btn-secondary story-skip-btn" id="btn-story-skip">${translateKey('ui.story.skip', 'Skip')}</button>
        </div>
      </div>
    `;

    screen.querySelectorAll('[data-story-choice]').forEach(button => {
      button.addEventListener('click', () => {
        const choice = choices[Number(button.dataset.storyChoice)];
        if (Number.isInteger(choice.next) && !(event.dialog || [])[choice.next]) {
          finishActiveEvent();
          return;
        }
        handleChoice(choice);
      });
    });
    screen.querySelector('#btn-story-skip')?.addEventListener('click', finishActiveEvent);
  }

  function getHubByLocation(loc) {
    if (!loc) return null;
    if (loc.hubId) return byId(getHubs(), loc.hubId);
    return byId(getHubs(), loc.id);
  }

  function openQuestLog() {
    let overlay = global.document.getElementById('quest-log-overlay');
    if (!overlay) {
      overlay = global.document.createElement('div');
      overlay.id = 'quest-log-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(5,8,18,0.72);backdrop-filter:blur(6px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
      global.document.body.appendChild(overlay);
    }
    const state = ensureStoryState();
    const activeEntries = Object.values(state?.activeQuests || {});
    overlay.innerHTML = `
      <div style="width:min(720px,100%);max-height:80vh;overflow:auto;background:#0f1324;border:1px solid rgba(255,255,255,0.08);border-radius:18px;padding:22px;color:#d8def5;box-shadow:0 20px 70px rgba(0,0,0,0.35)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div style="font-size:20px;font-weight:700">Quest Log</div>
          <button class="btn-secondary" id="btn-close-quest-log">Close</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px">
          ${activeEntries.length === 0 ? '<div style="color:#8a92b8">No active quests.</div>' : activeEntries.map(entry => {
            const quest = byId(getQuests(), entry.id);
            if (!quest) return '';
            return `<div style="padding:14px;border-radius:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06)"><div style="font-size:16px;font-weight:700">${quest.title}</div><div style="color:#9aa3ca;margin-top:4px">${quest.description}</div><div style="margin-top:10px;font-size:13px">Progress: ${entry.progress} / ${entry.goal}</div><div style="margin-top:4px;font-size:13px">Reward: ${rewardSummary(quest.reward)}</div><div style="margin-top:4px;font-size:13px">Status: ${entry.status === 'claimable' ? 'Ready to turn in' : 'Active'}</div></div>`;
          }).join('')}
        </div>
      </div>
    `;
    overlay.onclick = event => {
      if (event.target === overlay) overlay.remove();
    };
    overlay.querySelector('#btn-close-quest-log')?.addEventListener('click', () => overlay.remove());
  }

  function startChallenge(hubId, challengeId) {
    const state = ensureStoryState();
    const hub = byId(getHubs(), hubId);
    const challenge = hub ? (hub.challenges || []).find(entry => entry.id === challengeId) : null;
    if (!state || !challenge || state.completedChallenges[challengeId]) return false;
    if (!state.activeChallenges[challengeId]) {
      state.activeChallenges[challengeId] = { id: challengeId, progress: 0, goal: Number(challenge.goal || 1), status: 'active' };
      if (typeof saveCurrentSlot === 'function') saveCurrentSlot();
    }
    return true;
  }

  function claimChallenge(hubId, challengeId) {
    const state = ensureStoryState();
    const hub = byId(getHubs(), hubId);
    const challenge = hub ? (hub.challenges || []).find(entry => entry.id === challengeId) : null;
    const entry = state?.activeChallenges?.[challengeId];
    if (!challenge || !entry || entry.status !== 'claimable') return false;
    applyReward(challenge.reward);
    state.completedChallenges[challengeId] = { completedAt: Date.now() };
    delete state.activeChallenges[challengeId];
    return true;
  }

  function startTournament(hubId, tournamentId) {
    const state = ensureStoryState();
    const hub = byId(getHubs(), hubId);
    const tournament = hub ? (hub.tournaments || []).find(entry => entry.id === tournamentId) : null;
    if (!state || !tournament || state.completedTournaments[tournamentId]) return false;
    const enemyIds = Array.isArray(tournament.enemyIds) ? tournament.enemyIds.filter(Boolean) : [];
    if (enemyIds.length === 0) return false;
    return startStoryBattle({
      enemyId: enemyIds[0],
      returnMode: 'hub',
      returnHubId: hubId,
      tournamentId,
      battleChain: enemyIds,
      battleIndex: 0,
    });
  }

  function claimTournamentReward(tournamentId) {
    const state = ensureStoryState();
    const hub = getHubs().find(entry => (entry.tournaments || []).some(tournament => tournament.id === tournamentId));
    const tournament = hub ? (hub.tournaments || []).find(entry => entry.id === tournamentId) : null;
    if (!state || !tournament || !state.completedTournaments[tournamentId] || state.completedTournaments[tournamentId].rewardClaimed) return false;
    applyReward(tournament.reward);
    state.completedTournaments[tournamentId].rewardClaimed = true;
    return true;
  }

  function renderHubScreen(loc) {
    const hub = getHubByLocation(loc);
    if (!hub) return false;
    runtime.currentHubId = hub.id;
    const screen = global.document.getElementById('screen-hub');
    if (!screen) return true;
    const state = ensureStoryState();
    const hp = RUN_STATE.playerHP || RUN_STATE.maxHP || 4000;
    const maxHP = RUN_STATE.maxHP || 4000;

    screen.innerHTML = `
      <div class="hub-container" style="max-width:1100px;margin:0 auto;padding:26px 20px;display:flex;flex-direction:column;gap:18px">
        <div class="hub-header">
          <div class="hub-name">🏘 ${hub.name}</div>
          ${hub.description ? `<div class="hub-desc">${hub.description}</div>` : ''}
          <div class="hub-stats">
            <span>❤ ${hp} / ${maxHP}</span>
            <span>✦ ${typeof getDimensionsSeelen === 'function' ? getDimensionsSeelen() : 0} DS</span>
            <button class="btn-sm" id="btn-open-quest-log">Quest Log</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px">
            <div style="font-size:15px;font-weight:700">NPCs</div>
            ${(hub.npcs || []).map(npc => `<button class="btn-secondary" data-hub-npc="${npc.dialogEventId || npc.dialog_event || ''}">${npc.name}</button>`).join('') || '<div style="color:#8a92b8">No NPCs.</div>'}
          </div>
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px">
            <div style="font-size:15px;font-weight:700">Quests</div>
            ${(hub.questIds || []).map(questId => {
              const quest = byId(getQuests(), questId);
              if (!quest) return '';
              const status = getQuestStatus(questId);
              return `<div style="padding:10px;border-radius:10px;background:rgba(0,0,0,0.18)"><div style="font-weight:700">${quest.title}</div><div style="font-size:13px;color:#9aa3ca;margin:4px 0">${quest.description}</div><div style="font-size:12px;margin-bottom:8px">Reward: ${rewardSummary(quest.reward)}</div>${status === 'locked' ? `<button class="btn-success" data-quest-start="${questId}">Accept</button>` : ''}${status === 'active' ? `<div style="font-size:12px;color:#cdd5f7">In progress: ${(state.activeQuests?.[questId]?.progress || 0)} / ${quest.goal}</div>` : ''}${status === 'claimable' ? `<button class="btn-success" data-quest-claim="${questId}">Turn in</button>` : ''}${status === 'completed' ? `<div style="font-size:12px;color:#6fe29c">Completed</div>` : ''}</div>`;
            }).join('') || '<div style="color:#8a92b8">No quests.</div>'}
          </div>
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px">
            <div style="font-size:15px;font-weight:700">Tournament</div>
            ${(hub.tournaments || []).map(tournament => {
              const completed = state.completedTournaments?.[tournament.id];
              const rewardClaimed = !!completed?.rewardClaimed;
              return `<div style="padding:10px;border-radius:10px;background:rgba(0,0,0,0.18)"><div style="font-weight:700">${tournament.title}</div><div style="font-size:13px;color:#9aa3ca;margin:4px 0">${tournament.description}</div><div style="font-size:12px;margin-bottom:8px">Reward: ${rewardSummary(tournament.reward)}</div>${!completed ? `<button class="btn-success" data-tournament-start="${tournament.id}">Start</button>` : ''}${completed && !rewardClaimed ? `<button class="btn-success" data-tournament-claim="${tournament.id}">Claim reward</button>` : ''}${completed && rewardClaimed ? `<div style="font-size:12px;color:#6fe29c">Completed</div>` : ''}</div>`;
            }).join('') || '<div style="color:#8a92b8">No tournament.</div>'}
          </div>
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px">
            <div style="font-size:15px;font-weight:700">Challenges</div>
            ${(hub.challenges || []).map(challenge => {
              const challengeState = state.activeChallenges?.[challenge.id];
              const completed = state.completedChallenges?.[challenge.id];
              return `<div style="padding:10px;border-radius:10px;background:rgba(0,0,0,0.18)"><div style="font-weight:700">${challenge.title}</div><div style="font-size:13px;color:#9aa3ca;margin:4px 0">${challenge.description}</div><div style="font-size:12px;margin-bottom:8px">Reward: ${rewardSummary(challenge.reward)}</div>${!challengeState && !completed ? `<button class="btn-secondary" data-challenge-start="${challenge.id}">Activate</button>` : ''}${challengeState && challengeState.status !== 'claimable' ? `<div style="font-size:12px;color:#cdd5f7">Progress: ${challengeState.progress} / ${challenge.goal}</div>` : ''}${challengeState && challengeState.status === 'claimable' ? `<button class="btn-success" data-challenge-claim="${challenge.id}">Claim reward</button>` : ''}${completed ? `<div style="font-size:12px;color:#6fe29c">Completed</div>` : ''}</div>`;
            }).join('') || '<div style="color:#8a92b8">No challenges.</div>'}
          </div>
        </div>
        <div class="hub-options" style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="hub-btn hub-btn-rest" id="btn-hub-rest-lite" ${hp >= maxHP ? 'disabled' : ''}>Rest</button>
          <button class="hub-btn hub-btn-shop" id="btn-hub-shop-lite">Shop</button>
          <button class="hub-btn hub-btn-deck" id="btn-hub-deck-lite">Deck</button>
          <button class="hub-btn hub-btn-save" id="btn-hub-save-lite">Save</button>
          <button class="btn-secondary hub-back-btn" id="btn-hub-back-lite">Back to world map</button>
        </div>
      </div>
    `;

    screen.querySelector('#btn-open-quest-log')?.addEventListener('click', openQuestLog);
    screen.querySelectorAll('[data-hub-npc]').forEach(button => button.addEventListener('click', () => startEventById(button.dataset.hubNpc, { returnMode: 'hub', returnHubId: hub.id })));
    screen.querySelectorAll('[data-quest-start]').forEach(button => button.addEventListener('click', () => {
      startQuest(button.dataset.questStart);
      renderHubScreen({ id: hub.id, hubId: hub.id });
    }));
    screen.querySelectorAll('[data-quest-claim]').forEach(button => button.addEventListener('click', () => {
      claimQuest(button.dataset.questClaim);
      renderHubScreen({ id: hub.id, hubId: hub.id });
    }));
    screen.querySelectorAll('[data-tournament-start]').forEach(button => button.addEventListener('click', () => startTournament(hub.id, button.dataset.tournamentStart)));
    screen.querySelectorAll('[data-tournament-claim]').forEach(button => button.addEventListener('click', () => {
      claimTournamentReward(button.dataset.tournamentClaim);
      renderHubScreen({ id: hub.id, hubId: hub.id });
    }));
    screen.querySelectorAll('[data-challenge-start]').forEach(button => button.addEventListener('click', () => {
      startChallenge(hub.id, button.dataset.challengeStart);
      renderHubScreen({ id: hub.id, hubId: hub.id });
    }));
    screen.querySelectorAll('[data-challenge-claim]').forEach(button => button.addEventListener('click', () => {
      claimChallenge(hub.id, button.dataset.challengeClaim);
      renderHubScreen({ id: hub.id, hubId: hub.id });
    }));
    screen.querySelector('#btn-hub-rest-lite')?.addEventListener('click', () => {
      if (typeof _hubRest === 'function') _hubRest(screen);
      renderHubScreen({ id: hub.id, hubId: hub.id });
    });
    screen.querySelector('#btn-hub-shop-lite')?.addEventListener('click', () => {
      if (typeof showMainMenuShop === 'function') showMainMenuShop('hub');
    });
    screen.querySelector('#btn-hub-deck-lite')?.addEventListener('click', () => {
      if (typeof renderDeckEditor === 'function' && typeof showScreen === 'function') {
        renderDeckEditor();
        showScreen('deckeditor');
      }
    });
    screen.querySelector('#btn-hub-save-lite')?.addEventListener('click', () => {
      if (typeof commitHubSave === 'function') commitHubSave();
    });
    screen.querySelector('#btn-hub-back-lite')?.addEventListener('click', () => {
      if (typeof renderWorldMap === 'function' && typeof showScreen === 'function') {
        renderWorldMap();
        showScreen('worldmap');
      }
    });

    if (typeof showScreen === 'function') showScreen('hub');
    triggerStoryEvents('enter_hub', { hubId: hub.id, returnMode: 'hub', returnHubId: hub.id });
    return true;
  }

  function handleStoryBattleReturn() {
    const pending = runtime.pendingBattle;
    if (!pending || !pending.outcome) return false;

    if (pending.outcome === 'lost') {
      runtime.pendingBattle = null;
      RUN_STATE._storyBattleSafeReturn = false;
      if (pending.onLossEventId) {
        startEventById(pending.onLossEventId, { returnMode: pending.returnMode, returnHubId: pending.returnHubId });
        return true;
      }
      if (pending.returnMode === 'hub' && pending.returnHubId) {
        showHubScreen({ id: pending.returnHubId, hubId: pending.returnHubId });
        return true;
      }
      return false;
    }

    if (pending.challengeId) {
      const state = ensureStoryState();
      if (state?.activeChallenges?.[pending.challengeId]) {
        const entry = state.activeChallenges[pending.challengeId];
        entry.progress = Number(entry.progress || 0) + 1;
        const hub = getHubs().find(item => (item.challenges || []).some(challenge => challenge.id === pending.challengeId));
        const challenge = hub ? (hub.challenges || []).find(item => item.id === pending.challengeId) : null;
        if (challenge && entry.progress >= Number(challenge.goal || 1)) entry.status = 'claimable';
      }
    }

    if (Array.isArray(pending.battleChain) && pending.battleChain.length > pending.battleIndex + 1) {
      const nextIndex = pending.battleIndex + 1;
      runtime.pendingBattle = {
        ...pending,
        battleIndex: nextIndex,
        enemyId: pending.battleChain[nextIndex],
        outcome: null,
        previousHP: RUN_STATE.playerHP,
      };
      startBattle(pending.battleChain[nextIndex]);
      return true;
    }

    if (pending.tournamentId) {
      const state = ensureStoryState();
      if (state) {
        state.completedTournaments[pending.tournamentId] = state.completedTournaments[pending.tournamentId] || {
          completedAt: Date.now(),
          rewardClaimed: false,
        };
      }
    }

    (pending.onWinEffects || []).forEach(effect => applyEffect(effect, {
      returnMode: pending.returnMode,
      returnHubId: pending.returnHubId,
    }));
    if (pending.onWinEventId) {
      runtime.pendingBattle = null;
      RUN_STATE._storyBattleSafeReturn = false;
      startEventById(pending.onWinEventId, { returnMode: pending.returnMode, returnHubId: pending.returnHubId });
      return true;
    }
    if (pending.resumeEventId) {
      runtime.pendingBattle = null;
      RUN_STATE._storyBattleSafeReturn = false;
      startEventById(pending.resumeEventId, {
        stepIndex: Number.isInteger(pending.resumeStepIndex) ? pending.resumeStepIndex : 0,
        returnMode: pending.returnMode,
        returnHubId: pending.returnHubId,
      });
      return true;
    }

    runtime.pendingBattle = null;
    RUN_STATE._storyBattleSafeReturn = false;
    if (pending.returnMode === 'hub' && pending.returnHubId) {
      showHubScreen({ id: pending.returnHubId, hubId: pending.returnHubId });
      return true;
    }
    return false;
  }

  function handleSafeStoryBattleLoss() {
    const pending = runtime.pendingBattle;
    RUN_STATE.playerHP = Math.max(1, Number(pending?.previousHP || RUN_STATE.playerHP || 1));
    BATTLE_STATE.active = false;
    BATTLE_STATE.gameOver = true;
    handleStoryBattleReturn();
  }

  function attachBattleHooks() {
    if (runtime.initialized) return;
    on('battle:won', payload => {
      updateObjectivesFromBattle(payload?.enemyId || null);
      triggerStoryEvents('after_battle', { enemyId: payload?.enemyId || null, result: 'won' });
      if (runtime.pendingBattle) runtime.pendingBattle.outcome = 'won';
    });
    on('battle:lost', () => {
      if (runtime.pendingBattle) runtime.pendingBattle.outcome = 'lost';
    });
  }

  function injectWorldmapQuestPanel() {
    const screen = global.document.getElementById('screen-worldmap');
    if (!screen || screen.querySelector('[data-quest-summary-panel]')) return;
    const state = ensureStoryState();
    const activeEntries = Object.values(state?.activeQuests || {}).slice(0, 3);
    const panel = global.document.createElement('div');
    panel.dataset.questSummaryPanel = '1';
    panel.style.cssText = 'position:absolute;right:20px;bottom:88px;width:min(280px,calc(100vw - 40px));background:rgba(8,12,24,0.82);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:14px;z-index:20;backdrop-filter:blur(6px);';
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="font-weight:700">Active Quests</div>
        <button class="btn-sm" id="btn-world-quest-log">Open</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${activeEntries.length === 0 ? '<div style="font-size:12px;color:#98a3d1">No active quests yet.</div>' : activeEntries.map(entry => {
          const quest = byId(getQuests(), entry.id);
          if (!quest) return '';
          return `<div style="font-size:12px;color:#dce3ff"><strong>${quest.title}</strong><br>${entry.progress} / ${entry.goal}</div>`;
        }).join('')}
      </div>
    `;
    screen.style.position = 'relative';
    screen.appendChild(panel);
    panel.querySelector('#btn-world-quest-log')?.addEventListener('click', openQuestLog);
  }

  function initStorySystem() {
    ensureStoryState();
    prepareLocalizedContent();
    attachBattleHooks();
    runtime.initialized = true;
    return true;
  }

  const legacyShowHubScreen = global.showHubScreen;
  global.showHubScreen = function patchedShowHubScreen(loc) {
    initStorySystem();
    if (renderHubScreen(loc)) return;
    if (typeof legacyShowHubScreen === 'function') legacyShowHubScreen(loc);
  };

  const legacyShowStoryScreen = global.showStoryScreen;
  global.showStoryScreen = function patchedShowStoryScreen(loc) {
    initStorySystem();
    if (runtime.activeEvent) {
      renderActiveEvent();
      if (typeof showScreen === 'function') showScreen('story');
      return;
    }
    if (typeof legacyShowStoryScreen === 'function') legacyShowStoryScreen(loc);
  };

  const legacyInitWorldState = global.initWorldState;
  global.initWorldState = function patchedInitWorldState() {
    initStorySystem();
    if (typeof legacyInitWorldState === 'function') legacyInitWorldState();
    const state = ensureStoryState();
    if (state && !state.started) {
      state.started = true;
      triggerStoryEvents('game_start', { returnMode: 'worldmap' });
    }
  };

  const legacyRenderWorldMap = global.renderWorldMap;
  global.renderWorldMap = function patchedRenderWorldMap() {
    initStorySystem();
    if (typeof legacyRenderWorldMap === 'function') legacyRenderWorldMap();
    injectWorldmapQuestPanel();
  };

  global.initStorySystem = initStorySystem;
  global.triggerStoryEvents = triggerStoryEvents;
  global.startEventById = startEventById;
  global.handleStoryBattleReturn = handleStoryBattleReturn;
  global.handleSafeStoryBattleLoss = handleSafeStoryBattleLoss;
  global.openQuestLog = openQuestLog;
})(window);
