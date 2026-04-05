/* ============================================================
   editor/data-manager.js - reusable editor persistence helpers
   ============================================================ */

window.DDEditorDataManager = (function createEditorDataManager() {
  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function ensureLocaleBucket(locales, language, namespace) {
    if (!locales[language]) locales[language] = {};
    if (!locales[language][namespace]) locales[language][namespace] = {};
    return locales[language][namespace];
  }

  function collectEditorLocales(context) {
    const locales = cloneJson(context.ddCustom?.locales || {});
    const deCards = ensureLocaleBucket(locales, 'de', 'cards');
    const deStory = ensureLocaleBucket(locales, 'de', 'story');

    context.editorCards.forEach(card => {
      if (!card || !card.id) return;
      const nameKey = card.nameKey || `card.${card.id}.name`;
      const flavorKey = card.flavorKey || `card.${card.id}.flavor`;
      if (card.name) deCards[nameKey] = card.name;
      if (card.flavor) deCards[flavorKey] = card.flavor;
    });

    Object.values(context.editorEnemies).forEach(enemy => {
      if (!enemy || !enemy.id) return;
      const nameKey = enemy.nameKey || `enemy.${enemy.id}.name`;
      const titleKey = enemy.titleKey || `enemy.${enemy.id}.title`;
      if (enemy.name) deCards[nameKey] = enemy.name;
      if (enemy.title) deCards[titleKey] = enemy.title;
    });

    (context.editorWorldMap || []).forEach(loc => {
      if (!loc || !loc.id) return;
      const nameKey = loc.nameKey || `world.${loc.id}.name`;
      const descriptionKey = loc.descriptionKey || `world.${loc.id}.description`;
      if (loc.name) deStory[nameKey] = loc.name;
      if (loc.description) deStory[descriptionKey] = loc.description;
      (loc.storyLines || []).forEach((line, index) => {
        const speakerKey = line.speakerKey || `story.${loc.id}.${index}.speaker`;
        const textKey = line.textKey || `story.${loc.id}.${index}.text`;
        if (line.speaker) deStory[speakerKey] = line.speaker;
        if (line.text) deStory[textKey] = line.text;
      });
    });

    (context.editorEvents || []).forEach(event => {
      if (!event || !event.id) return;
      const titleKey = event.titleKey || `event.${event.id}.title`;
      if (event.title) deStory[titleKey] = event.title;
      (event.dialog || []).forEach((step, stepIndex) => {
        const speakerKey = step.speakerKey || `event.${event.id}.step.${stepIndex}.speaker`;
        const textKey = step.textKey || `event.${event.id}.step.${stepIndex}.text`;
        if (step.speaker) deStory[speakerKey] = step.speaker;
        if (step.text) deStory[textKey] = step.text;
        (step.choices || []).forEach((choice, choiceIndex) => {
          const choiceKey = choice.textKey || `event.${event.id}.step.${stepIndex}.choice.${choiceIndex}`;
          if (choice.text) deStory[choiceKey] = choice.text;
        });
      });
    });

    (context.editorQuests || []).forEach(quest => {
      if (!quest || !quest.id) return;
      const titleKey = quest.titleKey || `quest.${quest.id}.title`;
      const descriptionKey = quest.descriptionKey || `quest.${quest.id}.description`;
      if (quest.title) deStory[titleKey] = quest.title;
      if (quest.description) deStory[descriptionKey] = quest.description;
    });

    (context.editorHubs || []).forEach(hub => {
      if (!hub || !hub.id) return;
      const nameKey = hub.nameKey || `hub.${hub.id}.name`;
      const descriptionKey = hub.descriptionKey || `hub.${hub.id}.description`;
      if (hub.name) deStory[nameKey] = hub.name;
      if (hub.description) deStory[descriptionKey] = hub.description;
      (hub.npcs || []).forEach((npc, npcIndex) => {
        const npcKey = npc.nameKey || `hub.${hub.id}.npc.${npcIndex}.name`;
        if (npc.name) deStory[npcKey] = npc.name;
      });
      (hub.tournaments || []).forEach((tournament, index) => {
        const titleKey = tournament.titleKey || `hub.${hub.id}.tournament.${index}.title`;
        const descriptionKey = tournament.descriptionKey || `hub.${hub.id}.tournament.${index}.description`;
        if (tournament.title) deStory[titleKey] = tournament.title;
        if (tournament.description) deStory[descriptionKey] = tournament.description;
      });
      (hub.challenges || []).forEach((challenge, index) => {
        const titleKey = challenge.titleKey || `hub.${hub.id}.challenge.${index}.title`;
        const descriptionKey = challenge.descriptionKey || `hub.${hub.id}.challenge.${index}.description`;
        if (challenge.title) deStory[titleKey] = challenge.title;
        if (challenge.description) deStory[descriptionKey] = challenge.description;
      });
    });

    return locales;
  }

  function sanitizeCardForI18n(card, normalizeRaceId) {
    const next = cloneJson(card);
    next.nameKey = next.nameKey || `card.${next.id}.name`;
    next.flavorKey = next.flavorKey || `card.${next.id}.flavor`;
    delete next.name;
    delete next.flavor;
    if (next.race && typeof normalizeRaceId === 'function') next.race = normalizeRaceId(next.race);
    return next;
  }

  function sanitizeEnemyForI18n(enemy, normalizeRaceId) {
    const next = cloneJson(enemy);
    next.nameKey = next.nameKey || `enemy.${next.id}.name`;
    next.titleKey = next.titleKey || `enemy.${next.id}.title`;
    delete next.name;
    delete next.title;
    if (next.theme && typeof normalizeRaceId === 'function') next.theme = normalizeRaceId(next.theme);
    return next;
  }

  function sanitizeWorldMapForI18n(worldMap) {
    return (worldMap || []).map(loc => {
      const next = cloneJson(loc);
      next.nameKey = next.nameKey || `world.${next.id}.name`;
      next.descriptionKey = next.descriptionKey || `world.${next.id}.description`;
      delete next.name;
      delete next.description;
      next.storyLines = (next.storyLines || []).map((line, index) => {
        const storyLine = cloneJson(line);
        storyLine.speakerKey = storyLine.speakerKey || `story.${next.id}.${index}.speaker`;
        storyLine.textKey = storyLine.textKey || `story.${next.id}.${index}.text`;
        delete storyLine.speaker;
        delete storyLine.text;
        return storyLine;
      });
      return next;
    });
  }

  function sanitizeEventsForI18n(events) {
    return (events || []).map(event => {
      const next = cloneJson(event);
      next.titleKey = next.titleKey || `event.${next.id}.title`;
      delete next.title;
      next.dialog = (next.dialog || []).map((step, stepIndex) => {
        const storyStep = cloneJson(step);
        storyStep.speakerKey = storyStep.speakerKey || `event.${next.id}.step.${stepIndex}.speaker`;
        storyStep.textKey = storyStep.textKey || `event.${next.id}.step.${stepIndex}.text`;
        delete storyStep.speaker;
        delete storyStep.text;
        storyStep.choices = (storyStep.choices || []).map((choice, choiceIndex) => {
          const nextChoice = cloneJson(choice);
          nextChoice.textKey = nextChoice.textKey || `event.${next.id}.step.${stepIndex}.choice.${choiceIndex}`;
          delete nextChoice.text;
          return nextChoice;
        });
        return storyStep;
      });
      return next;
    });
  }

  function sanitizeQuestsForI18n(quests) {
    return (quests || []).map(quest => {
      const next = cloneJson(quest);
      next.titleKey = next.titleKey || `quest.${next.id}.title`;
      next.descriptionKey = next.descriptionKey || `quest.${next.id}.description`;
      delete next.title;
      delete next.description;
      return next;
    });
  }

  function sanitizeHubsForI18n(hubs) {
    return (hubs || []).map(hub => {
      const next = cloneJson(hub);
      next.nameKey = next.nameKey || `hub.${next.id}.name`;
      next.descriptionKey = next.descriptionKey || `hub.${next.id}.description`;
      delete next.name;
      delete next.description;
      next.npcs = (next.npcs || []).map((npc, npcIndex) => {
        const nextNpc = cloneJson(npc);
        nextNpc.nameKey = nextNpc.nameKey || `hub.${next.id}.npc.${npcIndex}.name`;
        delete nextNpc.name;
        return nextNpc;
      });
      next.tournaments = (next.tournaments || []).map((tournament, index) => {
        const nextTournament = cloneJson(tournament);
        nextTournament.titleKey = nextTournament.titleKey || `hub.${next.id}.tournament.${index}.title`;
        nextTournament.descriptionKey = nextTournament.descriptionKey || `hub.${next.id}.tournament.${index}.description`;
        delete nextTournament.title;
        delete nextTournament.description;
        return nextTournament;
      });
      next.challenges = (next.challenges || []).map((challenge, index) => {
        const nextChallenge = cloneJson(challenge);
        nextChallenge.titleKey = nextChallenge.titleKey || `hub.${next.id}.challenge.${index}.title`;
        nextChallenge.descriptionKey = nextChallenge.descriptionKey || `hub.${next.id}.challenge.${index}.description`;
        delete nextChallenge.title;
        delete nextChallenge.description;
        return nextChallenge;
      });
      return next;
    });
  }

  function buildEditorDataPayload(context) {
    const regularCards = context.editorCards.filter(card => card.type !== 'fusion');
    const fusionCards = context.editorCards.filter(card => card.type === 'fusion');
    const locales = collectEditorLocales(context);
    const effects = cloneJson(window.DD_EFFECTS_CONFIG || {});

    return {
      cards: regularCards.map(card => sanitizeCardForI18n(card, context.normalizeRaceId)),
      fusionMonsters: fusionCards.map(card => sanitizeCardForI18n(card, context.normalizeRaceId)),
      effects,
      synergies: context.ddCustom?.synergies || null,
      enemies: Object.values(context.editorEnemies).map(enemy => sanitizeEnemyForI18n(enemy, context.normalizeRaceId)),
      acts: context.editorActs,
      recipes: context.editorRecipes,
      config: context.editorConfig,
      starterDeck: context.editorStarterDeck,
      worldMap: context.editorWorldMap.length > 0 ? sanitizeWorldMapForI18n(context.editorWorldMap) : undefined,
      events: context.editorEvents?.length > 0 ? sanitizeEventsForI18n(context.editorEvents) : undefined,
      quests: context.editorQuests?.length > 0 ? sanitizeQuestsForI18n(context.editorQuests) : undefined,
      hubs: context.editorHubs?.length > 0 ? sanitizeHubsForI18n(context.editorHubs) : undefined,
      locales,
    };
  }

  function buildEditorExportPayload(context) {
    return {
      version: '2.1',
      timestamp: new Date().toISOString(),
      ...buildEditorDataPayload(context),
    };
  }

  function buildRuntimeConfigPayload(context) {
    const data = buildEditorDataPayload(context);
    return {
      version: 'runtime-config-v2',
      generatedFrom: 'editor-export',
      generatedAt: new Date().toISOString(),
      cards: data.cards || [],
      fusionMonsters: data.fusionMonsters || [],
      effects: data.effects || {},
      enemies: Array.isArray(data.enemies) ? data.enemies : [],
      synergies: data.synergies || null,
      acts: Array.isArray(data.acts) ? data.acts : [],
      config: data.config || {},
      starterDeck: Array.isArray(data.starterDeck) ? data.starterDeck : [],
      worldMap: Array.isArray(data.worldMap) ? data.worldMap : [],
      events: Array.isArray(data.events) ? data.events : [],
      quests: Array.isArray(data.quests) ? data.quests : [],
      hubs: Array.isArray(data.hubs) ? data.hubs : [],
      recipes: Array.isArray(data.recipes) ? data.recipes : [],
      locales: data.locales || {},
    };
  }

  function buildSplitDataFilesPayload(context) {
    const runtimeConfig = buildRuntimeConfigPayload(context);
    return {
      'cards.json': {
        cards: runtimeConfig.cards,
        fusionMonsters: runtimeConfig.fusionMonsters,
      },
      'enemies.json': {
        enemies: runtimeConfig.enemies,
      },
      'effects.json': {
        effects: cloneJson(window.DD_EFFECTS_CONFIG || {}),
      },
      'acts.json': {
        acts: runtimeConfig.acts,
      },
      'recipes.json': {
        recipes: runtimeConfig.recipes,
      },
      'config.json': {
        config: runtimeConfig.config,
      },
      'starter-deck.json': {
        starterDeck: runtimeConfig.starterDeck,
      },
      'world-map.json': {
        worldMap: runtimeConfig.worldMap,
      },
      'story-content.json': {
        events: runtimeConfig.events,
        quests: runtimeConfig.quests,
        hubs: runtimeConfig.hubs,
        locales: runtimeConfig.locales,
      },
    };
  }

  return {
    cloneJson,
    buildEditorDataPayload,
    buildEditorExportPayload,
    buildRuntimeConfigPayload,
    buildSplitDataFilesPayload,
  };
})();
