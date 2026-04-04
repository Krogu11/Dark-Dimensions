(function initDDI18n() {
  const DEFAULT_LANGUAGE = 'de';
  const FALLBACK_LANGUAGE = 'en';
  const LOCALE_NAMESPACES = ['cards', 'ui', 'story'];
  const SUPPORTED_LANGUAGES = ['de', 'en'];
  const tracked = {
    cards: new Set(),
    enemies: new Set(),
    worldLocations: new Set(),
    storyLines: new Set(),
  };

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function flattenInto(target, source) {
    if (!isPlainObject(source)) return target;
    Object.keys(source).forEach(key => {
      target[key] = source[key];
    });
    return target;
  }

  function safeReadLocalOverrides() {
    if (typeof window === 'undefined' || !window.localStorage) return {};
    try {
      return JSON.parse(localStorage.getItem('dd_custom') || '{}');
    } catch (_error) {
      return {};
    }
  }

  function getDDCustom() {
    if (typeof window !== 'undefined' && window.DD_CUSTOM && isPlainObject(window.DD_CUSTOM)) {
      return window.DD_CUSTOM;
    }
    return safeReadLocalOverrides();
  }

  function ensureDDCustom() {
    if (typeof window === 'undefined') return {};
    if (!window.DD_CUSTOM || !isPlainObject(window.DD_CUSTOM)) {
      window.DD_CUSTOM = safeReadLocalOverrides();
    }
    if (!isPlainObject(window.DD_CUSTOM.locales)) window.DD_CUSTOM.locales = {};
    return window.DD_CUSTOM;
  }

  function ensureLocaleBranch(ddCustom, language, namespace) {
    const root = ddCustom.locales || (ddCustom.locales = {});
    if (!isPlainObject(root[language])) root[language] = {};
    if (!isPlainObject(root[language][namespace])) root[language][namespace] = {};
    return root[language][namespace];
  }

  function loadLocaleFileSync(language, namespace) {
    const path = `locales/${language}/${namespace}.json`;
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', `${path}?v=1`, false);
      xhr.send(null);
      const ok = (xhr.status >= 200 && xhr.status < 300) || (xhr.status === 0 && xhr.responseText);
      if (!ok || !xhr.responseText) return {};
      return JSON.parse(xhr.responseText);
    } catch (_error) {
      return {};
    }
  }

  function normalizeLanguage(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return DEFAULT_LANGUAGE;
    const short = raw.slice(0, 2);
    return SUPPORTED_LANGUAGES.includes(short) ? short : DEFAULT_LANGUAGE;
  }

  function getInitialLanguage() {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('dd_language');
        if (stored) return normalizeLanguage(stored);
      } catch (_error) {}
    }
    const ddCustom = getDDCustom();
    const cfgLang = ddCustom?.config?.['cfg-language'];
    if (cfgLang) return normalizeLanguage(cfgLang);
    if (typeof navigator !== 'undefined' && navigator.language) {
      const navLang = normalizeLanguage(navigator.language);
      if (SUPPORTED_LANGUAGES.includes(navLang)) return navLang;
    }
    return DEFAULT_LANGUAGE;
  }

  const translations = {};
  SUPPORTED_LANGUAGES.forEach(language => {
    translations[language] = {};
    LOCALE_NAMESPACES.forEach(namespace => {
      flattenInto(translations[language], loadLocaleFileSync(language, namespace));
    });
  });

  const ddCustom = getDDCustom();
  if (isPlainObject(ddCustom?.locales)) {
    Object.keys(ddCustom.locales).forEach(language => {
      if (!translations[language]) translations[language] = {};
      const namespaces = ddCustom.locales[language];
      if (!isPlainObject(namespaces)) return;
      Object.keys(namespaces).forEach(namespace => {
        flattenInto(translations[language], namespaces[namespace]);
      });
    });
  }

  function formatTranslation(template, vars) {
    if (!vars || !isPlainObject(vars)) return template;
    return String(template).replace(/\{([^}]+)\}/g, (_match, key) => {
      const value = vars[key];
      return value === undefined || value === null ? `{${key}}` : String(value);
    });
  }

  let currentLanguage = getInitialLanguage();

  function t(key, vars, options) {
    const opts = isPlainObject(options) ? options : {};
    const activeLanguage = normalizeLanguage(opts.language || currentLanguage);
    const fallbackLanguage = normalizeLanguage(opts.fallbackLanguage || FALLBACK_LANGUAGE);
    const keyStr = String(key || '').trim();
    if (!keyStr) return '';

    const activeValue = translations[activeLanguage]?.[keyStr];
    const fallbackValue = translations[fallbackLanguage]?.[keyStr];
    const resolved = activeValue ?? fallbackValue ?? opts.fallbackValue ?? keyStr;
    return formatTranslation(resolved, vars);
  }

  function setLocaleValue(language, namespace, key, value) {
    const lang = normalizeLanguage(language);
    const keyStr = String(key || '').trim();
    if (!keyStr) return;
    if (!translations[lang]) translations[lang] = {};
    translations[lang][keyStr] = value;

    const custom = ensureDDCustom();
    const branch = ensureLocaleBranch(custom, lang, namespace);
    branch[keyStr] = value;
  }

  function seedLocaleValue(language, namespace, key, value) {
    const keyStr = String(key || '').trim();
    if (!keyStr || value === undefined || value === null || value === '') return;
    const lang = normalizeLanguage(language);
    if (translations[lang]?.[keyStr]) return;
    setLocaleValue(lang, namespace, keyStr, value);
  }

  function translateRaceId(raceId) {
    return raceId ? t(`race.${raceId}`, null, { fallbackValue: raceId }) : '';
  }

  function normalizeRaceId(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const normalized = raw.toLowerCase();
    const map = {
      kobold: 'kobold',
      ork: 'orc',
      orc: 'orc',
      daemon: 'demon',
      'dämon': 'demon',
      demon: 'demon',
      drache: 'dragon',
      dragon: 'dragon',
      untoter: 'undead',
      undead: 'undead',
      mensch: 'human',
      human: 'human',
      bestie: 'beast',
      beast: 'beast',
      maschine: 'machine',
      machine: 'machine',
      schattenwesen: 'shadow',
      shadow: 'shadow',
      elementar: 'elemental',
      elemental: 'elemental',
      gemischt: 'mixed',
      mixed: 'mixed',
    };
    return map[normalized] || normalized.replace(/\s+/g, '_');
  }

  function prepareCardLocalization(card) {
    if (!card || !card.id) return card;
    if (!card.nameKey) card.nameKey = `card.${card.id}.name`;
    if (!card.flavorKey) card.flavorKey = `card.${card.id}.flavor`;
    if (card.race) card.race = normalizeRaceId(card.race);
    seedLocaleValue(DEFAULT_LANGUAGE, 'cards', card.nameKey, card.name);
    seedLocaleValue(DEFAULT_LANGUAGE, 'cards', card.flavorKey, card.flavor);
    card.name = t(card.nameKey, null, { fallbackValue: card.name || card.id });
    card.flavor = t(card.flavorKey, null, { fallbackValue: card.flavor || '' });
    tracked.cards.add(card);
    return card;
  }

  function prepareEnemyLocalization(enemy) {
    if (!enemy || !enemy.id) return enemy;
    if (!enemy.nameKey) enemy.nameKey = `enemy.${enemy.id}.name`;
    if (!enemy.titleKey) enemy.titleKey = `enemy.${enemy.id}.title`;
    if (enemy.theme) enemy.theme = normalizeRaceId(enemy.theme);
    seedLocaleValue(DEFAULT_LANGUAGE, 'cards', enemy.nameKey, enemy.name);
    seedLocaleValue(DEFAULT_LANGUAGE, 'cards', enemy.titleKey, enemy.title);
    enemy.name = t(enemy.nameKey, null, { fallbackValue: enemy.name || enemy.id });
    enemy.title = t(enemy.titleKey, null, { fallbackValue: enemy.title || '' });
    tracked.enemies.add(enemy);
    return enemy;
  }

  function prepareWorldLocationLocalization(location) {
    if (!location || !location.id) return location;
    if (!location.nameKey) location.nameKey = `world.${location.id}.name`;
    if (!location.descriptionKey) location.descriptionKey = `world.${location.id}.description`;
    seedLocaleValue(DEFAULT_LANGUAGE, 'story', location.nameKey, location.name);
    seedLocaleValue(DEFAULT_LANGUAGE, 'story', location.descriptionKey, location.description);
    location.name = t(location.nameKey, null, { fallbackValue: location.name || location.id });
    location.description = t(location.descriptionKey, null, { fallbackValue: location.description || '' });
    tracked.worldLocations.add(location);
    if (Array.isArray(location.storyLines)) {
      location.storyLines.forEach((line, index) => prepareStoryLineLocalization(line, location.id, index));
    }
    return location;
  }

  function prepareStoryLineLocalization(line, locationId, index) {
    if (!line) return line;
    if (!line.speakerKey) line.speakerKey = `story.${locationId}.${index}.speaker`;
    if (!line.textKey) line.textKey = `story.${locationId}.${index}.text`;
    seedLocaleValue(DEFAULT_LANGUAGE, 'story', line.speakerKey, line.speaker);
    seedLocaleValue(DEFAULT_LANGUAGE, 'story', line.textKey, line.text);
    line.speaker = t(line.speakerKey, null, { fallbackValue: line.speaker || '' });
    line.text = t(line.textKey, null, { fallbackValue: line.text || '' });
    tracked.storyLines.add(line);
    return line;
  }

  function refreshLocalizedData() {
    tracked.cards.forEach(card => {
      if (!card) return;
      card.name = t(card.nameKey, null, { fallbackValue: card.name || card.id });
      card.flavor = t(card.flavorKey, null, { fallbackValue: card.flavor || '' });
    });
    tracked.enemies.forEach(enemy => {
      if (!enemy) return;
      enemy.name = t(enemy.nameKey, null, { fallbackValue: enemy.name || enemy.id });
      enemy.title = t(enemy.titleKey, null, { fallbackValue: enemy.title || '' });
    });
    tracked.worldLocations.forEach(location => {
      if (!location) return;
      location.name = t(location.nameKey, null, { fallbackValue: location.name || location.id });
      location.description = t(location.descriptionKey, null, { fallbackValue: location.description || '' });
    });
    tracked.storyLines.forEach(line => {
      if (!line) return;
      line.speaker = t(line.speakerKey, null, { fallbackValue: line.speaker || '' });
      line.text = t(line.textKey, null, { fallbackValue: line.text || '' });
    });
  }

  function applyI18nToDocument(root) {
    const scope = root || document;
    if (!scope || !scope.querySelectorAll) return;
    scope.querySelectorAll('[data-i18n]').forEach(node => {
      const key = node.getAttribute('data-i18n');
      node.innerHTML = t(key);
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach(node => {
      const key = node.getAttribute('data-i18n-placeholder');
      node.setAttribute('placeholder', t(key));
    });
    scope.querySelectorAll('[data-i18n-title]').forEach(node => {
      const key = node.getAttribute('data-i18n-title');
      node.setAttribute('title', t(key));
    });
  }

  function setLanguage(language) {
    currentLanguage = normalizeLanguage(language);
    try { localStorage.setItem('dd_language', currentLanguage); } catch (_error) {}
    refreshLocalizedData();
    if (typeof document !== 'undefined') applyI18nToDocument(document);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dd-language-changed', { detail: { language: currentLanguage } }));
    }
    return currentLanguage;
  }

  window.I18N = {
    translations,
    t,
    setLanguage,
    setLocaleValue,
    seedLocaleValue,
    prepareCardLocalization,
    prepareEnemyLocalization,
    prepareWorldLocationLocalization,
    prepareStoryLineLocalization,
    refreshLocalizedData,
    applyI18nToDocument,
    normalizeRaceId,
    translateRaceId,
    get currentLanguage() { return currentLanguage; },
    get fallbackLanguage() { return FALLBACK_LANGUAGE; },
  };

  window.t = t;
  window.setDDLanguage = setLanguage;
  window.prepareCardLocalization = prepareCardLocalization;
  window.prepareEnemyLocalization = prepareEnemyLocalization;
  window.prepareWorldLocationLocalization = prepareWorldLocationLocalization;
  window.prepareStoryLineLocalization = prepareStoryLineLocalization;
  window.refreshLocalizedData = refreshLocalizedData;
  window.applyI18nToDocument = applyI18nToDocument;
  window.normalizeRaceId = normalizeRaceId;
  window.translateRaceId = translateRaceId;
})();
