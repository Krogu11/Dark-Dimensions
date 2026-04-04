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

  function buildEditorDataPayload(context) {
    const regularCards = context.editorCards.filter(card => card.type !== 'fusion');
    const fusionCards = context.editorCards.filter(card => card.type === 'fusion');
    const locales = collectEditorLocales(context);

    return {
      cards: regularCards.map(card => sanitizeCardForI18n(card, context.normalizeRaceId)),
      fusionMonsters: fusionCards.map(card => sanitizeCardForI18n(card, context.normalizeRaceId)),
      synergies: context.ddCustom?.synergies || null,
      enemies: Object.values(context.editorEnemies).map(enemy => sanitizeEnemyForI18n(enemy, context.normalizeRaceId)),
      acts: context.editorActs,
      recipes: context.editorRecipes,
      config: context.editorConfig,
      starterDeck: context.editorStarterDeck,
      worldMap: context.editorWorldMap.length > 0 ? sanitizeWorldMapForI18n(context.editorWorldMap) : undefined,
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
      enemies: Array.isArray(data.enemies) ? data.enemies : [],
      synergies: data.synergies || null,
      acts: Array.isArray(data.acts) ? data.acts : [],
      config: data.config || {},
      starterDeck: Array.isArray(data.starterDeck) ? data.starterDeck : [],
      worldMap: Array.isArray(data.worldMap) ? data.worldMap : [],
      recipes: Array.isArray(data.recipes) ? data.recipes : [],
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
