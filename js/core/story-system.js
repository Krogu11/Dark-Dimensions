(function initDDStorySystem(global) {
  const runtime = {
    initialized: false,
    activeEvent: null,
    pendingBattle: null,
    currentHubId: null,
    lastAutoHubEventKey: null,
  };

  function getWorldMap() {
    if (typeof global._getWorldMapData === 'function') return global._getWorldMapData() || [];
    return Array.isArray(global.DD_CUSTOM?.worldMap) ? global.DD_CUSTOM.worldMap : [];
  }

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
    const hubs = Array.isArray(getCustom().hubs) ? getCustom().hubs : [];
    hubs.forEach(hub => {
      if (!hub || typeof hub !== 'object') return;
      const questIds = Array.isArray(hub.questIds)
        ? hub.questIds.filter(Boolean)
        : Array.isArray(hub.quests)
          ? hub.quests.filter(Boolean)
          : [];
      hub.questIds = Array.from(new Set(questIds));
    });
    return hubs;
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
        seenEvents: [],
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
    const state = SAVE_STATE.slot.storyState;
    if (!Array.isArray(state.seenEvents)) state.seenEvents = [];
    if (!Array.isArray(state.completedEvents)) state.completedEvents = [];
    if (!state.activeQuests || typeof state.activeQuests !== 'object') state.activeQuests = {};
    if (!state.completedQuests || typeof state.completedQuests !== 'object') state.completedQuests = {};
    if (!Array.isArray(state.inventory)) state.inventory = [];
    if (!state.flags || typeof state.flags !== 'object') state.flags = {};
    if (!state.activeChallenges || typeof state.activeChallenges !== 'object') state.activeChallenges = {};
    if (!state.completedChallenges || typeof state.completedChallenges !== 'object') state.completedChallenges = {};
    if (!state.completedTournaments || typeof state.completedTournaments !== 'object') state.completedTournaments = {};
    return state;
  }

  function getQuestSave(questId) {
    const state = ensureStoryState();
    if (!state) return null;
    return state.activeQuests[questId] || state.completedQuests[questId] || null;
  }

  function getInventoryItems() {
    const state = ensureStoryState();
    if (!state) return [];
    if (!Array.isArray(state.inventory)) state.inventory = [];
    return state.inventory;
  }

  function getInventoryItemCount(itemId) {
    if (!itemId) return 0;
    return getInventoryItems().filter(entry => entry === itemId).length;
  }

  function removeInventoryItems(itemId, amount) {
    const items = getInventoryItems();
    let remaining = Math.max(0, Number(amount || 0));
    if (!itemId || remaining <= 0) return true;
    for (let index = items.length - 1; index >= 0 && remaining > 0; index -= 1) {
      if (items[index] !== itemId) continue;
      items.splice(index, 1);
      remaining -= 1;
    }
    return remaining === 0;
  }

  function normalizeQuestGoal(quest) {
    const rawGoal = quest?.goal;
    if (rawGoal && typeof rawGoal === 'object' && !Array.isArray(rawGoal)) {
      const type = String(rawGoal.type || '').trim().toLowerCase() || 'kill';
      return {
        type,
        target: rawGoal.target || rawGoal.kill || rawGoal.enemyId || null,
        amount: Math.max(1, Number(rawGoal.amount || 1)),
        item: rawGoal.item || null,
        targetNpc: rawGoal.targetNpc || null,
      };
    }
    return {
      type: 'kill',
      target: Array.isArray(quest?.enemyIds) && quest.enemyIds.length === 1 ? quest.enemyIds[0] : null,
      amount: Math.max(1, Number(rawGoal || 1)),
      item: null,
      targetNpc: null,
    };
  }

  function getQuestTargetList(quest) {
    const goal = normalizeQuestGoal(quest);
    if (goal.type !== 'kill') return [];
    if (Array.isArray(quest?.enemyIds) && quest.enemyIds.length > 0) return quest.enemyIds.filter(Boolean);
    return goal.target ? [goal.target] : [];
  }

  function getQuestProgressValue(quest, entry) {
    const goal = normalizeQuestGoal(quest);
    if (!quest) return { progress: 0, goal: 1, status: 'locked' };
    if (goal.type === 'collect' || goal.type === 'deliver') {
      const progress = Math.min(goal.amount, getInventoryItemCount(goal.item));
      return {
        progress,
        goal: goal.amount,
        status: progress >= goal.amount ? 'claimable' : 'active',
      };
    }
    const goalAmount = Math.max(1, Number(entry?.goal || goal.amount || 1));
    const progress = Math.min(goalAmount, Math.max(0, Number(entry?.progress || 0)));
    return {
      progress,
      goal: goalAmount,
      status: progress >= goalAmount ? 'claimable' : 'active',
    };
  }

  function logQuestState(questId, status, details) {
    console.log('Quest State:', questId, status, details || '');
  }

  function refreshQuestViews() {
    const hubScreen = global.document?.getElementById('screen-hub');
    const worldmapScreen = global.document?.getElementById('screen-worldmap');
    if (runtime.currentHubId && hubScreen && hubScreen.style.display !== 'none') {
      renderHubScreen({ id: runtime.currentHubId, hubId: runtime.currentHubId }, { suppressAutoEvent: true });
      return;
    }
    if (worldmapScreen && worldmapScreen.style.display !== 'none' && typeof renderWorldMap === 'function') {
      renderWorldMap();
    }
  }

  function isQuestReadyToTurnIn(questId) {
    const state = ensureStoryState();
    return !!state?.activeQuests?.[questId]?.readyToTurnIn;
  }

  function shouldAutoCompleteQuest(quest) {
    if (!quest) return false;
    if (quest.turnInRequired === true) return false;
    return quest.autoComplete === true;
  }

  function getWorldProgressIds(kind) {
    const source = SAVE_STATE?.slot?.worldProgress?.[kind];
    if (typeof Set !== 'undefined' && source instanceof Set) return source;
    return new Set(Array.isArray(source) ? source : []);
  }

  function hasReachedVillageHub() {
    const currentLocationId = typeof WORLD_STATE !== 'undefined' ? WORLD_STATE?.currentLocationId : SAVE_STATE?.slot?.worldProgress?.currentLocationId;
    if (currentLocationId === 'hub_village_01') return true;
    const visited = typeof WORLD_STATE !== 'undefined' && WORLD_STATE?.visitedLocations instanceof Set
      ? WORLD_STATE.visitedLocations
      : getWorldProgressIds('visitedLocations');
    const completed = typeof WORLD_STATE !== 'undefined' && WORLD_STATE?.completedLocations instanceof Set
      ? WORLD_STATE.completedLocations
      : getWorldProgressIds('completedLocations');
    return visited.has('hub_village_01') || completed.has('hub_village_01');
  }

  function reconcileStoryQuestState() {
    const state = ensureStoryState();
    if (!state || !SAVE_STATE?.slot) return false;
    let changed = false;

    Object.keys(state.activeQuests || {}).forEach(questId => {
      const quest = byId(getQuests(), questId);
      if (!quest || state.completedQuests[questId]) {
        delete state.activeQuests[questId];
        changed = true;
        return;
      }
      const beforeProgress = Number(state.activeQuests[questId].progress || 0);
      const beforeGoal = Number(state.activeQuests[questId].goal || 0);
      const beforeReady = !!state.activeQuests[questId].readyToTurnIn;
      syncQuestState(questId);
      if (
        beforeProgress !== Number(state.activeQuests[questId].progress || 0) ||
        beforeGoal !== Number(state.activeQuests[questId].goal || 0) ||
        beforeReady !== !!state.activeQuests[questId].readyToTurnIn ||
        state.activeQuests[questId].status !== 'active'
      ) {
        changed = true;
      }
    });

    const villageReached = hasReachedVillageHub();
    if (villageReached && !state.completedEvents.includes('world_story_loc_intro_river')) {
      state.completedEvents.push('world_story_loc_intro_river');
      changed = true;
    }

    if (state.completedEvents.includes('world_story_loc_intro_river') && getQuestStatus('quest_main_001') === 'available') {
      changed = startQuest('quest_main_001') || changed;
    }

    if (villageReached && getQuestStatus('quest_main_001') !== 'completed') {
      if (getQuestStatus('quest_main_001') === 'locked') {
        if (!state.completedEvents.includes('world_story_loc_intro_river')) state.completedEvents.push('world_story_loc_intro_river');
        changed = true;
        startQuest('quest_main_001');
      }
      changed = completeQuest('quest_main_001', { returnMode: 'hub', returnHubId: 'hub_village_01' }) || changed;
      if (!state.completedEvents.includes('event_village_arrival')) {
        state.completedEvents.push('event_village_arrival');
        changed = true;
      }
    }

    if (state.completedQuests.quest_main_001 && getQuestStatus('quest_main_002') === 'available') {
      changed = startQuest('quest_main_002') || changed;
    }

    const defeatedEnemies = Array.isArray(SAVE_STATE.slot.defeatedEnemies) ? SAVE_STATE.slot.defeatedEnemies : [];
    if (defeatedEnemies.includes('goblin_chief') && getQuestStatus('quest_main_002') !== 'completed') {
      if (getQuestStatus('quest_main_002') === 'locked' && state.completedQuests.quest_main_001) {
        startQuest('quest_main_002');
      }
      changed = completeQuest('quest_main_002', { returnMode: 'worldmap', returnLocationId: 'loc_river_crossing' }) || changed;
    }

    if (changed && typeof saveCurrentSlot === 'function') saveCurrentSlot();
    return changed;
  }

  function syncQuestState(questId) {
    const state = ensureStoryState();
    const quest = byId(getQuests(), questId);
    const entry = state?.activeQuests?.[questId];
    if (!quest || !entry) return false;
    const progressState = getQuestProgressValue(quest, entry);
    entry.progress = progressState.progress;
    entry.goal = progressState.goal;
    entry.status = 'active';
    entry.readyToTurnIn = progressState.status === 'claimable';
    return true;
  }

  function isQuestUnlocked(quest, payload) {
    if (!quest) return false;
    return (quest.conditions || quest.unlockConditions || []).every(condition => conditionMatches(condition, payload));
  }

  function maybeStartAutoQuests(payload) {
    getQuests().forEach(quest => {
      if (!quest || quest.acceptMode !== 'auto') return;
      if (getQuestStatus(quest.id) !== 'available') return;
      if (!isQuestUnlocked(quest, payload)) return;
      startQuest(quest.id);
    });
  }

  function canStartEvent(eventId) {
    const event = typeof eventId === 'string' ? byId(getEvents(), eventId) : eventId;
    const state = ensureStoryState();
    if (!event) return false;
    if (!event.once) return true;
    if (runtime.activeEvent?.eventId === event.id) return false;
    return !(state?.completedEvents?.includes(event.id) || state?.seenEvents?.includes(event.id));
  }

  function getQuestStatus(questId) {
    const quest = byId(getQuests(), questId);
    const state = ensureStoryState();
    if (!quest) return 'locked';
    if (!state) return 'available';
    if (state.completedQuests[questId]) return 'completed';
    if (state.activeQuests[questId]) return 'active';
    if (!isQuestUnlocked(quest)) return 'locked';
    return 'available';
  }

  function emitQuestProgress(questId, status) {
    triggerStoryEvents('quest_progress', { questId, status });
  }

  function startQuest(questId) {
    const quest = byId(getQuests(), questId);
    const state = ensureStoryState();
    if (!quest || !state || state.completedQuests[questId] || !isQuestUnlocked(quest)) return false;
    if (!state.activeQuests[questId]) {
      const goal = normalizeQuestGoal(quest);
      state.activeQuests[questId] = {
        id: questId,
        progress: Number(quest.progress || 0),
        goal: goal.amount,
        status: 'active',
        goalType: goal.type,
        readyToTurnIn: false,
      };
      syncQuestState(questId);
      if (typeof saveCurrentSlot === 'function') saveCurrentSlot();
      logQuestState(questId, 'active', state.activeQuests[questId]);
      emitQuestProgress(questId, state.activeQuests[questId].status);
      refreshQuestViews();
      return true;
    }
    syncQuestState(questId);
    return false;
  }

  function completeQuest(questId, options) {
    const quest = byId(getQuests(), questId);
    const state = ensureStoryState();
    if (!quest || !state || state.completedQuests[questId]) return false;
    if (!state.activeQuests[questId] && !startQuest(questId)) return false;
    const entry = state.activeQuests[questId];
    if (!entry) return false;
    const goal = normalizeQuestGoal(quest);
    entry.progress = goal.amount;
    entry.goal = goal.amount;
    entry.status = 'active';
    entry.readyToTurnIn = false;
    if (goal.type === 'deliver' && !removeInventoryItems(goal.item, goal.amount)) return false;
    applyReward(quest.reward);
    state.completedQuests[questId] = {
      id: questId,
      progress: entry.progress,
      status: 'completed',
      completedAt: Date.now(),
    };
    delete state.activeQuests[questId];
    logQuestState(questId, 'completed', state.completedQuests[questId]);
    emitQuestProgress(questId, 'completed');
    const completionEffects = [];
    if (quest.onCompleteQuest) completionEffects.push({ type: 'start_quest', questId: quest.onCompleteQuest });
    if (Array.isArray(quest.onCompleteEffects)) completionEffects.push(...quest.onCompleteEffects);
    completionEffects.forEach(effect => applyEffect(effect, options || {}));
    if (typeof saveCurrentSlot === 'function') saveCurrentSlot();
    refreshQuestViews();
    return true;
  }

  function addQuestProgress(questId, amount) {
    const quest = byId(getQuests(), questId);
    const state = ensureStoryState();
    if (!quest || !state) return false;
    const goal = normalizeQuestGoal(quest);
    if (goal.type !== 'kill') {
      syncQuestState(questId);
      return false;
    }
    if (!state.activeQuests[questId]) startQuest(questId);
    const entry = state.activeQuests[questId];
    if (!entry) return false;
    entry.progress = Math.min(goal.amount, Number(entry.progress || 0) + Math.max(0, Number(amount || 0)));
    entry.goal = goal.amount;
    entry.status = 'active';
    entry.readyToTurnIn = entry.progress >= goal.amount;
    if (entry.readyToTurnIn && shouldAutoCompleteQuest(quest)) return completeQuest(questId);
    logQuestState(questId, 'active', entry);
    emitQuestProgress(questId, 'active');
    if (typeof saveCurrentSlot === 'function') saveCurrentSlot();
    refreshQuestViews();
    return true;
  }

  function applyReward(reward) {
    const state = ensureStoryState();
    if (!state || !reward) return;
    const soulReward = Number((reward.ds ?? reward.gold) || 0);
    if (soulReward && typeof gainDimensionsSeelen === 'function') {
      gainDimensionsSeelen(soulReward, false);
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
    const goal = normalizeQuestGoal(quest);
    syncQuestState(questId);
    if (!entry || !entry.readyToTurnIn) return false;
    if (goal.type === 'deliver' && getInventoryItemCount(goal.item) < goal.amount) return false;
    return completeQuest(questId);
  }

  function rewardSummary(reward) {
    if (!reward) return '-';
    const parts = [];
    if (reward.ds || reward.gold) parts.push(`${Number((reward.ds ?? reward.gold) || 0)} DS`);
    if (reward.card) {
      const card = typeof getCardById === 'function' ? getCardById(reward.card) : null;
      parts.push(card ? card.name : reward.card);
    }
    if (reward.item) parts.push(reward.item);
    return parts.join(' · ') || '-';
  }

  function matchesQuestObjective(quest, enemyId) {
    if (!quest) return false;
    const goal = normalizeQuestGoal(quest);
    if (goal.type !== 'kill') return false;
    const targets = getQuestTargetList(quest);
    if (targets.length === 0) return true;
    return targets.includes(enemyId);
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
    if (event.once && (state?.completedEvents?.includes(event.id) || state?.seenEvents?.includes(event.id))) return false;
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
    const state = ensureStoryState();
    if (!event || !canStartEvent(event)) return false;
    if (state && event.id && !state.seenEvents.includes(event.id)) state.seenEvents.push(event.id);
    runtime.activeEvent = {
      eventId,
      eventData: event,
      stepIndex: Math.max(0, Number(options?.stepIndex || 0)),
      returnMode: options?.returnMode || 'worldmap',
      returnHubId: options?.returnHubId || null,
      returnLocationId: options?.returnLocationId || null,
    };
    renderActiveEvent();
    if (typeof showScreen === 'function') showScreen('story');
    return true;
  }

  function startSyntheticEvent(eventData, options) {
    if (!eventData) return false;
    runtime.activeEvent = {
      eventId: eventData.id || null,
      eventData,
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
    const current = runtime.activeEvent?.eventData || (runtime.activeEvent ? byId(getEvents(), runtime.activeEvent.eventId) : null);
    if (state && current && !state.completedEvents.includes(current.id)) {
      state.completedEvents.push(current.id);
    }
    const pendingEvent = runtime.activeEvent;
    const fallbackMode = pendingEvent?.returnMode || 'worldmap';
    const fallbackHubId = pendingEvent?.returnHubId || runtime.currentHubId;
    const locationId = pendingEvent?.returnLocationId || null;
    runtime.activeEvent = null;

    (current?.onFinishEffects || []).forEach(effect => applyEffect(effect, {
      returnMode: fallbackMode,
      returnHubId: fallbackHubId,
      returnLocationId: locationId,
    }));
    maybeStartAutoQuests({ hubId: fallbackHubId, locationId });

    if (current?.afterBattleEnemyId) {
      startStoryBattle({
        enemyId: current.afterBattleEnemyId,
        returnMode: current.afterBattleReturnMode || fallbackMode,
        returnHubId: current.afterBattleReturnHubId || fallbackHubId,
        returnLocationId: current.afterBattleReturnLocationId || locationId,
        markCompletedLocationId: current.markCompletedLocationId || locationId,
        onWinGoToLocationId: current.onWinGoToLocationId || null,
      });
      return;
    }

    if (fallbackMode === 'worldmap' && locationId) {
      completeWorldLocation(current?.markCompletedLocationId || locationId, current?.onWinGoToLocationId || locationId);
      return;
    }

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

  function ensureStoryBattleDeck() {
    if (Array.isArray(RUN_STATE.deck) && RUN_STATE.deck.length > 0) return true;

    const cfg = (global.DD_CUSTOM && global.DD_CUSTOM.config) ? global.DD_CUSTOM.config : {};
    const startLP = Number(cfg['cfg-startlp']) || 4000;
    let deck = [];

    if (SAVE_STATE?.slot?.baseDeck && SAVE_STATE.slot.baseDeck.length > 0) {
      deck = SAVE_STATE.slot.baseDeck
        .map(id => {
          const card = typeof getCardById === 'function' ? getCardById(id) : null;
          return card ? cloneCard(card) : null;
        })
        .filter(Boolean);
    }

    if (deck.length === 0 && typeof buildStarterDeck === 'function') {
      deck = buildStarterDeck();
    }

    if (deck.length === 0) return false;

    RUN_STATE.active = true;
    RUN_STATE.playerHP = Number(RUN_STATE.playerHP || startLP);
    RUN_STATE.maxHP = Number(RUN_STATE.maxHP || startLP);
    RUN_STATE.deck = deck;
    RUN_STATE.currentNodeId = null;
    RUN_STATE.completedNodes = RUN_STATE.completedNodes instanceof Set ? RUN_STATE.completedNodes : new Set();
    RUN_STATE.availableNodes = RUN_STATE.availableNodes instanceof Set ? RUN_STATE.availableNodes : new Set();
    RUN_STATE._isFreeDuel = false;
    return true;
  }

  function startStoryBattle(config) {
    if (!config?.enemyId || typeof startBattle !== 'function') return false;
    if (!ensureStoryBattleDeck()) return false;
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
        Object.keys(state?.activeQuests || {}).forEach(syncQuestState);
        if (typeof saveCurrentSlot === 'function') saveCurrentSlot();
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
      case 'complete_quest':
        completeQuest(effect.value || effect.questId, context);
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
          returnLocationId: context?.returnLocationId || null,
        });
      case 'start_battle':
        return startStoryBattle({
          enemyId: effect.enemyId || effect.value,
          returnMode: context?.returnMode || 'worldmap',
          returnHubId: context?.returnHubId || runtime.currentHubId,
          returnLocationId: context?.returnLocationId || null,
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
      returnLocationId: runtime.activeEvent.returnLocationId,
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
    const event = eventState?.eventData || (eventState ? byId(getEvents(), eventState.eventId) : null);
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

  function _questStatusLabel(status) {
    const labels = {
      available: translateKey('ui.quest.log.available', 'Verfügbar'),
      active: translateKey('ui.quest.log.active', 'Aktiv'),
      completed: translateKey('ui.quest.log.completed', 'Abgeschlossen'),
    };
    return labels[status] || status;
  }

  function _questStatusColor(status) {
    return { available: '#98a3d1', active: '#cdd5f7', completed: '#6fe29c' }[status] || '#ccc';
  }

  function getQuestObjectiveText(quest, entry) {
    const goal = normalizeQuestGoal(quest);
    const progressState = getQuestProgressValue(quest, entry);
    switch (goal.type) {
      case 'collect':
        return `${translateKey('ui.quest.objective.collect', 'Sammeln')}: ${progressState.progress} / ${progressState.goal}`;
      case 'deliver':
        return `${translateKey('ui.quest.objective.deliver', 'Abgeben')}: ${progressState.progress} / ${progressState.goal}`;
      case 'kill':
      default:
        return `${translateKey('ui.quest.progress', 'Fortschritt')}: ${progressState.progress} / ${progressState.goal}`;
    }
  }

  function _renderQuestCard(quest, entry, status) {
    const typeBadge = quest.type === 'main'
      ? `<span style="font-size:10px;padding:2px 7px;border-radius:4px;background:rgba(255,215,0,0.18);color:#ffd700;font-weight:700;letter-spacing:1px">${translateKey('ui.quest.type.main', 'HAUPTQUEST')}</span>`
      : quest.type === 'side'
        ? `<span style="font-size:10px;padding:2px 7px;border-radius:4px;background:rgba(150,150,200,0.18);color:#b0b8e0;font-weight:700;letter-spacing:1px">${translateKey('ui.quest.type.side', 'NEBENQUEST')}</span>`
        : '';
    const progress = entry ? `<div style="margin-top:8px;font-size:12px;color:#cdd5f7">${getQuestObjectiveText(quest, entry)}</div>` : '';
    const statusLabel = `<div style="margin-top:4px;font-size:12px;color:${_questStatusColor(status)}">${_questStatusLabel(status)}</div>`;
    return `<div style="padding:14px;border-radius:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06)">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">${typeBadge}<div style="font-size:15px;font-weight:700">${quest.title}</div></div>
      <div style="color:#9aa3ca;font-size:13px">${quest.description}</div>
      ${progress}
      <div style="margin-top:6px;font-size:12px;color:#8a92b8">${translateKey('ui.common.reward', 'Belohnung')}: ${rewardSummary(quest.reward)}</div>
      ${statusLabel}
    </div>`;
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
    const allQuests = getQuests();
    // Collect all quest IDs visible via hubs
    const knownQuestIds = new Set(getHubs().flatMap(hub => hub.questIds || []));
    allQuests.forEach(q => { if (q && q.id) knownQuestIds.add(q.id); });

    const mainQuests = [];
    const sideQuests = [];
    knownQuestIds.forEach(questId => {
      const quest = byId(allQuests, questId);
      if (!quest) return;
      const status = getQuestStatus(questId);
      if (status === 'locked') return;
      const entry = state?.activeQuests?.[questId] || null;
      const bucket = quest.type === 'side' ? sideQuests : mainQuests;
      bucket.push({ quest, entry, status });
    });
    // Sort: active first, then available, then completed
    const sortOrder = { active: 0, available: 1, completed: 2 };
    const sortFn = (a, b) => (sortOrder[a.status] ?? 9) - (sortOrder[b.status] ?? 9);
    mainQuests.sort(sortFn);
    sideQuests.sort(sortFn);

    function renderSection(label, items) {
      if (items.length === 0) return '';
      return `
        <div style="margin-bottom:18px">
          <div style="font-size:13px;font-weight:700;color:#ffd700;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px">${label}</div>
          <div style="display:flex;flex-direction:column;gap:10px">
            ${items.map(({ quest, entry, status }) => _renderQuestCard(quest, entry, status)).join('')}
          </div>
        </div>`;
    }

    const hasAny = mainQuests.length + sideQuests.length > 0;
    overlay.innerHTML = `
      <div style="width:min(760px,100%);max-height:82vh;overflow:auto;background:#0f1324;border:1px solid rgba(255,255,255,0.08);border-radius:18px;padding:24px;color:#d8def5;box-shadow:0 20px 70px rgba(0,0,0,0.35)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
          <div style="font-size:20px;font-weight:700">📖 ${translateKey('ui.quest.log.title', 'Questbuch')}</div>
          <button class="btn-secondary" id="btn-close-quest-log">${translateKey('ui.quest.log.close', 'Schließen')}</button>
        </div>
        ${!hasAny ? `<div style="color:#8a92b8">${translateKey('ui.quest.log.empty', 'Keine Quests.')}</div>` : ''}
        ${renderSection(translateKey('ui.quest.log.main', 'Hauptquests'), mainQuests)}
        ${renderSection(translateKey('ui.quest.log.side', 'Nebenquests'), sideQuests)}
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

  function renderHubScreen(loc, options) {
    const hub = getHubByLocation(loc);
    if (!hub) return false;
    maybeStartAutoQuests({ hubId: hub.id, locationId: loc?.id || hub.id });
    runtime.currentHubId = hub.id;
    const screen = global.document.getElementById('screen-hub');
    if (!screen) return true;
    const state = ensureStoryState() || {
      activeQuests: {},
      completedQuests: {},
      activeChallenges: {},
      completedChallenges: {},
      completedTournaments: {},
    };
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
            <button class="btn-sm" id="btn-open-quest-log">📖 ${translateKey('ui.quest.log.title', 'Questbuch')}</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px">
            <div style="font-size:15px;font-weight:700">NPCs</div>
            ${(hub.npcs || []).map(npc => {
              const eventId = npc.dialogEventId || npc.dialog_event || '';
              const disabled = eventId && !canStartEvent(eventId);
              return `<button class="btn-secondary" data-hub-npc="${eventId}" ${disabled ? 'disabled' : ''}>${npc.name}</button>`;
            }).join('') || '<div style="color:#8a92b8">No NPCs.</div>'}
          </div>
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px">
            <div style="font-size:15px;font-weight:700">${translateKey('ui.hub.quests', 'Quests')}</div>
            ${(hub.questIds || []).map(questId => {
              const quest = byId(getQuests(), questId);
              if (!quest) return '';
              const status = getQuestStatus(questId);
              const readyToTurnIn = isQuestReadyToTurnIn(questId);
              if (status === 'locked') return '';
              const acceptMode = quest.acceptMode || 'manual';
              const typeBadge = quest.type === 'main'
                ? `<span style="font-size:10px;padding:1px 6px;border-radius:3px;background:rgba(255,215,0,0.18);color:#ffd700;font-weight:700">${translateKey('ui.quest.type.main', 'HAUPTQUEST')}</span>`
                : quest.type === 'side'
                  ? `<span style="font-size:10px;padding:1px 6px;border-radius:3px;background:rgba(150,150,200,0.18);color:#b0b8e0;font-weight:700">${translateKey('ui.quest.type.side', 'NEBENQUEST')}</span>`
                  : '';
              return `<div style="padding:10px;border-radius:10px;background:rgba(0,0,0,0.18)">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">${typeBadge}<div style="font-weight:700">${quest.title}</div></div>
                <div style="font-size:13px;color:#9aa3ca;margin:4px 0">${quest.description}</div>
                <div style="font-size:12px;margin-bottom:8px">${translateKey('ui.common.reward', 'Belohnung')}: ${rewardSummary(quest.reward)}</div>
                ${status === 'available' && acceptMode === 'manual' ? `<button class="btn-success" data-quest-start="${questId}">${translateKey('ui.quest.accept', 'Annehmen')}</button>` : ''}
                ${status === 'available' && acceptMode === 'dialog' ? `<div style="font-size:12px;color:#98a3d1">${translateKey('ui.quest.accept.viaDialog', 'Mit einer Person im Dorf sprechen, um diese Quest anzunehmen.')}</div>` : ''}
                ${status === 'active' ? `<div style="font-size:12px;color:${readyToTurnIn ? '#ffd700' : '#cdd5f7'}">${getQuestObjectiveText(quest, state.activeQuests?.[questId])}${readyToTurnIn ? ` - ${translateKey('ui.quest.log.claimable', 'Abschließbar')}` : ''}</div>` : ''}
                ${status === 'active' && readyToTurnIn ? `<button class="btn-success" data-quest-claim="${questId}">${translateKey('ui.quest.turnin', 'Abgeben')}</button>` : ''}
                ${status === 'completed' ? `<div style="font-size:12px;color:#6fe29c">${translateKey('ui.quest.log.completed', 'Abgeschlossen')}</div>` : ''}
              </div>`;
            }).join('') || `<div style="color:#8a92b8">${translateKey('ui.quest.log.empty', 'Keine Quests.')}</div>`}
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
          <button class="hub-btn hub-btn-rest" id="btn-hub-rest-lite" ${hp >= maxHP ? 'disabled' : ''}>${translateKey('ui.hub.rest', 'Rasten')}</button>
          <button class="hub-btn hub-btn-shop" id="btn-hub-shop-lite">${translateKey('ui.hub.shop', 'Shop')}</button>
          <button class="hub-btn hub-btn-deck" id="btn-hub-deck-lite">${translateKey('ui.hub.deck', 'Deck')}</button>
          <button class="hub-btn hub-btn-save" id="btn-hub-save-lite">${translateKey('ui.hub.save', 'Speichern')}</button>
          <button class="btn-secondary hub-back-btn" id="btn-hub-back-lite">${translateKey('ui.hub.backToWorldMap', '← Weltkarte')}</button>
        </div>
      </div>
    `;

    screen.querySelector('#btn-open-quest-log')?.addEventListener('click', openQuestLog);
    screen.querySelectorAll('[data-hub-npc]').forEach(button => button.addEventListener('click', () => startEventById(button.dataset.hubNpc, { returnMode: 'hub', returnHubId: hub.id })));
    screen.querySelectorAll('[data-quest-start]').forEach(button => button.addEventListener('click', () => {
      const qid = button.dataset.questStart;
      const accepted = startQuest(qid);
      if (accepted) {
        const q = byId(getQuests(), qid);
        const msg = `${translateKey('ui.quest.accepted.toast', 'Quest angenommen')}: ${q ? q.title : qid}`;
        if (typeof showToast === 'function') showToast(msg);
        else if (typeof DDToast === 'function') DDToast(msg);
      }
      renderHubScreen({ id: hub.id, hubId: hub.id }, { suppressAutoEvent: true });
    }));
    screen.querySelectorAll('[data-quest-claim]').forEach(button => button.addEventListener('click', () => {
      claimQuest(button.dataset.questClaim);
      renderHubScreen({ id: hub.id, hubId: hub.id }, { suppressAutoEvent: true });
    }));
    screen.querySelectorAll('[data-tournament-start]').forEach(button => button.addEventListener('click', () => startTournament(hub.id, button.dataset.tournamentStart)));
    screen.querySelectorAll('[data-tournament-claim]').forEach(button => button.addEventListener('click', () => {
      claimTournamentReward(button.dataset.tournamentClaim);
      renderHubScreen({ id: hub.id, hubId: hub.id }, { suppressAutoEvent: true });
    }));
    screen.querySelectorAll('[data-challenge-start]').forEach(button => button.addEventListener('click', () => {
      startChallenge(hub.id, button.dataset.challengeStart);
      renderHubScreen({ id: hub.id, hubId: hub.id }, { suppressAutoEvent: true });
    }));
    screen.querySelectorAll('[data-challenge-claim]').forEach(button => button.addEventListener('click', () => {
      claimChallenge(hub.id, button.dataset.challengeClaim);
      renderHubScreen({ id: hub.id, hubId: hub.id }, { suppressAutoEvent: true });
    }));
    screen.querySelector('#btn-hub-rest-lite')?.addEventListener('click', () => {
      if (typeof _hubRest === 'function') _hubRest(screen);
      renderHubScreen({ id: hub.id, hubId: hub.id }, { suppressAutoEvent: true });
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
    const autoHubKey = `enter_hub:${hub.id}`;
    if (!options?.suppressAutoEvent && runtime.lastAutoHubEventKey !== autoHubKey) {
      runtime.lastAutoHubEventKey = autoHubKey;
      triggerStoryEvents('enter_hub', { hubId: hub.id, returnMode: 'hub', returnHubId: hub.id });
    }
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

    if (pending.markCompletedLocationId || pending.onWinGoToLocationId || pending.returnLocationId) {
      const completedId = pending.markCompletedLocationId || pending.returnLocationId || null;
      const targetId = pending.onWinGoToLocationId || pending.returnLocationId || pending.markCompletedLocationId || null;
      runtime.pendingBattle = null;
      RUN_STATE._storyBattleSafeReturn = false;
      completeWorldLocation(completedId, targetId);
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

  function completeWorldLocation(locationId, goToLocationId) {
    if (typeof WORLD_STATE === 'undefined') return;
    runtime.lastAutoHubEventKey = null;
    const targetId = goToLocationId || locationId || WORLD_STATE.currentLocationId;
    if (locationId) WORLD_STATE.completedLocations.add(locationId);
    if (targetId) {
      WORLD_STATE.currentLocationId = targetId;
      WORLD_STATE.visitedLocations.add(targetId);
      WORLD_STATE.lastVisitedNodeId = targetId;
    }
    if (typeof saveWorldProgress === 'function') saveWorldProgress();
    if (typeof renderWorldMap === 'function') renderWorldMap();
    if (typeof showScreen === 'function') showScreen('worldmap');
  }

  function weightedPick(entries) {
    const valid = (entries || []).filter(entry => Number(entry.weight || 0) > 0);
    const total = valid.reduce((sum, entry) => sum + Number(entry.weight || 0), 0);
    if (total <= 0) return null;
    let roll = Math.random() * total;
    for (const entry of valid) {
      roll -= Number(entry.weight || 0);
      if (roll <= 0) return entry;
    }
    return valid[valid.length - 1] || null;
  }

  function chooseEnemyFromPool(pool) {
    const pick = weightedPick(pool);
    return pick ? pick.enemyId : null;
  }

  function startWorldMapLocationStory(loc) {
    if (!loc || !Array.isArray(loc.storyLines) || loc.storyLines.length === 0) return false;
    const dialog = loc.storyLines.map((line, index) => ({
      speaker: line.speaker || '',
      speakerKey: line.speakerKey,
      text: line.text || '',
      textKey: line.textKey,
      choices: index < loc.storyLines.length - 1 ? [{ text: translateKey('ui.story.next', 'Next'), next: index + 1 }] : [{ text: translateKey('ui.story.finish', 'Continue') }],
    }));
    return startSyntheticEvent({
      id: `world_story_${loc.id}`,
      title: loc.name || loc.id,
      titleKey: loc.nameKey,
      dialog,
      onFinishEffects: cloneJson(loc.onCompleteEffects || []),
      afterBattleEnemyId: loc.postStoryBattleEnemyId || null,
      afterBattleReturnMode: loc.postStoryBattleEnemyId ? 'worldmap' : null,
      afterBattleReturnLocationId: loc.id,
      markCompletedLocationId: loc.id,
      onWinGoToLocationId: loc.postStoryGoToLocationId || null,
    }, {
      returnMode: 'worldmap',
      returnLocationId: loc.id,
    });
  }

  function resolveWorldMapNodeEncounter(loc) {
    if (!loc || !loc.worldEventConfig) return false;
    const config = loc.worldEventConfig || {};
    const outcome = weightedPick([
      { type: 'none', weight: Number(config.noneWeight || 0) },
      { type: 'event', weight: Number(config.eventWeight || 0), eventId: config.eventId || '' },
      { type: 'battle', weight: Number(config.battleWeight || 0), enemyId: config.enemyId || chooseEnemyFromPool(config.enemyPool || []) },
    ]);
    if (!outcome) return false;
    if (outcome.type === 'none') {
      completeWorldLocation(loc.id);
      return true;
    }
    if (outcome.type === 'event' && outcome.eventId) {
      return startEventById(outcome.eventId, { returnMode: 'worldmap', returnLocationId: loc.id });
    }
    if (outcome.type === 'battle' && outcome.enemyId) {
      return startStoryBattle({
        enemyId: outcome.enemyId,
        returnMode: 'worldmap',
        returnLocationId: loc.id,
        markCompletedLocationId: loc.id,
      });
    }
    completeWorldLocation(loc.id);
    return true;
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

    // Count available quests across all hubs
    const allQuests = getQuests();
    let availableCount = 0;
    getHubs().forEach(hub => {
      (hub.questIds || []).forEach(qid => {
        if (getQuestStatus(qid) === 'available') availableCount++;
      });
    });

    const panel = global.document.createElement('div');
    panel.dataset.questSummaryPanel = '1';
    panel.style.cssText = 'position:absolute;right:20px;bottom:88px;width:min(290px,calc(100vw - 40px));background:rgba(8,12,24,0.85);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:14px;z-index:20;backdrop-filter:blur(6px);';
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="font-weight:700">📖 ${translateKey('ui.quest.log.title', 'Questbuch')}</div>
        <button class="btn-sm" id="btn-world-quest-log">${translateKey('ui.common.open', 'Öffnen')}</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${activeEntries.length === 0
          ? `<div style="font-size:12px;color:#98a3d1">${translateKey('ui.worldmap.noActiveQuests', 'Keine aktiven Quests.')}</div>`
          : activeEntries.map(entry => {
              const quest = byId(allQuests, entry.id);
              if (!quest) return '';
              const readyToTurnIn = !!entry.readyToTurnIn;
              return `<div style="font-size:12px;color:${readyToTurnIn ? '#ffd700' : '#dce3ff'}"><strong>${quest.title}</strong><br>${entry.progress} / ${entry.goal}${readyToTurnIn ? ` - <em>${translateKey('ui.quest.log.claimable', 'Abschließbar')}</em>` : ''}</div>`;
            }).join('')}
      </div>
      ${availableCount > 0 ? `<div style="margin-top:8px;font-size:11px;color:#7a85b0;border-top:1px solid rgba(255,255,255,0.06);padding-top:7px">${availableCount} ${translateKey('ui.worldmap.questsAvailableInHubs', 'Quest(s) verfügbar — betrete einen Hub zum Annehmen')}</div>` : ''}
    `;
    screen.style.position = 'relative';
    screen.appendChild(panel);
    panel.querySelector('#btn-world-quest-log')?.addEventListener('click', openQuestLog);
  }

  function initStorySystem() {
    ensureStoryState();
    prepareLocalizedContent();
    attachBattleHooks();
    reconcileStoryQuestState();
    maybeStartAutoQuests();
    runtime.initialized = true;
    return true;
  }

  const legacyShowHubScreen = global.showHubScreen;
  global.showHubScreen = function patchedShowHubScreen(loc) {
    initStorySystem();
    if (renderHubScreen(loc, arguments[1])) return;
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
    if (typeof legacyInitWorldState === 'function') return legacyInitWorldState.apply(this, arguments);
  };

  const legacyRenderWorldMap = global.renderWorldMap;
  global.renderWorldMap = function patchedRenderWorldMap() {
    initStorySystem();
    runtime.lastAutoHubEventKey = null;
    if (typeof legacyRenderWorldMap === 'function') legacyRenderWorldMap();
    injectWorldmapQuestPanel();
  };

  global.initStorySystem = initStorySystem;
  global.triggerStoryEvents = triggerStoryEvents;
  global.startEventById = startEventById;
  global.startWorldMapLocationStory = startWorldMapLocationStory;
  global.resolveWorldMapNodeEncounter = resolveWorldMapNodeEncounter;
  global.handleStoryBattleReturn = handleStoryBattleReturn;
  global.handleSafeStoryBattleLoss = handleSafeStoryBattleLoss;
  global.openQuestLog = openQuestLog;
  global.DDStoryDebug = {
    normalizeQuestGoal,
    getQuestStatus,
    startQuest,
    completeQuest,
    addQuestProgress,
    claimQuest,
    syncQuestState,
    updateObjectivesFromBattle,
    canStartEvent,
    maybeStartAutoQuests,
    reconcileStoryQuestState,
  };
})(window);
