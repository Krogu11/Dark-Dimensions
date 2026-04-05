/* ============================================================
   utils/runtime-data-loader.js - shared runtime/editor data boot
   Loads deployed JSON data, merges local overrides, preserves
   the existing DD_CUSTOM contract for the game and editor.
   ============================================================ */

(function bootRuntimeData(global) {
  const options = global.DD_RUNTIME_OPTIONS || {};
  const fallbackPlaylists = options.fallbackPlaylists || {
    'cfg-music-menu': ['assets/audio/shadow-sigil-title.mp3'],
    'cfg-music-campaign': ['assets/audio/cursed-data-duel.mp3'],
    'cfg-music-story': ['assets/audio/cursed-data-duel.mp3'],
  };
  const dataBasePath = options.dataBasePath || 'assets/data';
  const runtimeConfigBasePath = options.runtimeConfigBasePath || `${dataBasePath}/runtime-config.json`;
  const loadSplitDataFiles = options.loadSplitDataFiles === true;
  const cacheSuffix = options.cacheBust ? `?v=${Date.now()}` : '';
  const sectionFiles = [
    'cards.json',
    'enemies.json',
    'effects.json',
    'acts.json',
    'recipes.json',
    'config.json',
    'starter-deck.json',
    'world-map.json',
    'story-content.json',
  ];
  const embeddedRuntimeGlobal = options.embeddedRuntimeGlobal || 'DD_RUNTIME_EMBEDDED_DATA';

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function cloneValue(value) {
    if (Array.isArray(value)) return value.map(cloneValue);
    if (isPlainObject(value)) {
      const out = {};
      Object.keys(value).forEach(key => { out[key] = cloneValue(value[key]); });
      return out;
    }
    return value;
  }

  function normalizeMojibakeString(value) {
    const raw = String(value || '');
    if (!raw || (!raw.includes('Ã') && !raw.includes('Â') && !raw.includes('â'))) return raw;
    return raw
      .replace(/Â/g, '')
      .replace(/Ã¤/g, 'ä')
      .replace(/Ã„/g, 'Ä')
      .replace(/Ã¶/g, 'ö')
      .replace(/Ã–/g, 'Ö')
      .replace(/Ã¼/g, 'ü')
      .replace(/Ãœ/g, 'Ü')
      .replace(/ÃŸ/g, 'ß')
      .replace(/â€¦/g, '…')
      .replace(/â€“/g, '–')
      .replace(/â€”/g, '—')
      .replace(/â€ž/g, '„')
      .replace(/â€œ/g, '“')
      .replace(/â€�/g, '”')
      .replace(/â€˜/g, '‘')
      .replace(/â€™/g, '’')
      .replace(/â‚¬/g, '€')
      .replace(/â€¢/g, '•');
  }

  function normalizeMojibakeDeep(value) {
    if (Array.isArray(value)) return value.map(normalizeMojibakeDeep);
    if (isPlainObject(value)) {
      const out = {};
      Object.keys(value).forEach(key => {
        out[key] = normalizeMojibakeDeep(value[key]);
      });
      return out;
    }
    return typeof value === 'string' ? normalizeMojibakeString(value) : value;
  }

  function mergeRuntimeData(baseValue, overrideValue) {
    if (overrideValue === undefined) return cloneValue(baseValue);
    if (Array.isArray(overrideValue)) return overrideValue.map(cloneValue);
    if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
      const out = {};
      const keys = new Set([...Object.keys(baseValue), ...Object.keys(overrideValue)]);
      keys.forEach(key => {
        out[key] = mergeRuntimeData(baseValue[key], overrideValue[key]);
      });
      return out;
    }
    return cloneValue(overrideValue);
  }

  function normalizeTrackPath(track) {
    return String(track || '')
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\.\//, '')
      .replace(/^\/+/, '')
      .replace(/^audio\//, 'assets/audio/')
      .replace(/^assets\/assets\//, 'assets/')
      .replace(/shadow-sigil[^/]*title-screen-theme\.mp3$/i, 'shadow-sigil-title.mp3');
  }

  function normalizePlaylist(list) {
    return Array.isArray(list)
      ? list.map(normalizeTrackPath).filter(Boolean)
      : [];
  }

  function shouldAllowLocalOverrides() {
    if (typeof options.allowLocalOverrides === 'boolean') return options.allowLocalOverrides;
    const isLocalFile = global.location.protocol === 'file:';
    const isLocalhost = ['localhost', '127.0.0.1'].includes(global.location.hostname);
    const devOverrideEnabled = new URLSearchParams(global.location.search).get('devOverrides') === '1';
    return isLocalFile || isLocalhost || devOverrideEnabled;
  }

  function readLocalOverrides() {
    if (!shouldAllowLocalOverrides()) return {};
    try {
      return normalizeMojibakeDeep(JSON.parse(global.localStorage.getItem('dd_custom') || '{}'));
    } catch (error) {
      console.warn('[RuntimeData] localStorage dd_custom konnte nicht gelesen werden:', error);
      return {};
    }
  }

  function loadEmbeddedRuntimeData() {
    const embedded = global[embeddedRuntimeGlobal];
    if (!isPlainObject(embedded)) return { loaded: false, error: 'embedded-runtime-missing', data: {} };
    return {
      loaded: true,
      error: null,
      data: normalizeMojibakeDeep(cloneValue(embedded)),
    };
  }

  function loadJsonFile(basePath) {
    if (global.location.protocol === 'file:') {
      return {
        loaded: false,
        error: 'file-protocol-disabled',
        data: {},
      };
    }
    const path = `${basePath}${cacheSuffix}`;
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', path, false);
      xhr.send(null);

      const isSuccess = (xhr.status >= 200 && xhr.status < 300) || (xhr.status === 0 && xhr.responseText);
      if (!isSuccess || !xhr.responseText) {
        return { loaded: false, error: `HTTP ${xhr.status || 0}`, data: {} };
      }

      return { loaded: true, error: null, data: normalizeMojibakeDeep(JSON.parse(xhr.responseText)) };
    } catch (error) {
      return {
        loaded: false,
        error: error && error.message ? error.message : String(error),
        data: {},
      };
    }
  }

  function loadFileSet() {
    if (global.location.protocol === 'file:') {
      const embeddedRuntime = loadEmbeddedRuntimeData();
      return {
        data: embeddedRuntime.data || {},
        runtimeConfigLoaded: embeddedRuntime.loaded,
        runtimeConfigError: embeddedRuntime.error,
        sources: [{
          path: `${embeddedRuntimeGlobal}`,
          loaded: embeddedRuntime.loaded,
          error: embeddedRuntime.error,
        }],
      };
    }
    if (global.location.protocol === 'file:') {
      console.warn('[RuntimeData] file:// detected. Runtime JSON is not loaded via XHR in this mode. Use serve-local.ps1 or a local HTTP server for full parity with GitHub Pages.');
    }
    const runtimeConfig = loadJsonFile(runtimeConfigBasePath);
    let mergedData = runtimeConfig.data || {};
    const sources = [{
      path: runtimeConfigBasePath,
      loaded: runtimeConfig.loaded,
      error: runtimeConfig.error,
    }];

    if (loadSplitDataFiles) {
      sectionFiles.forEach(fileName => {
        const sectionPath = `${dataBasePath}/${fileName}`;
        const result = loadJsonFile(sectionPath);
        sources.push({
          path: sectionPath,
          loaded: result.loaded,
          error: result.error,
        });
        if (result.loaded) {
          mergedData = mergeRuntimeData(mergedData, result.data || {});
        }
      });
    }

    return {
      data: mergedData,
      runtimeConfigLoaded: runtimeConfig.loaded,
      runtimeConfigError: runtimeConfig.error,
      sources,
    };
  }

  function applyRuntimeFallbacks(ddCustom, fileData) {
    const next = isPlainObject(ddCustom) ? ddCustom : {};
    const fileCfg = isPlainObject(fileData?.config) ? fileData.config : {};

    if ((!Array.isArray(next.worldMap) || next.worldMap.length === 0) && Array.isArray(fileData?.worldMap) && fileData.worldMap.length > 0) {
      next.worldMap = cloneValue(fileData.worldMap);
    }

    if ((!Array.isArray(next.acts) || next.acts.length === 0) && Array.isArray(fileData?.acts) && fileData.acts.length > 0) {
      next.acts = cloneValue(fileData.acts);
    }

    if ((!Array.isArray(next.starterDeck) || next.starterDeck.length === 0) && Array.isArray(fileData?.starterDeck) && fileData.starterDeck.length > 0) {
      next.starterDeck = cloneValue(fileData.starterDeck);
    }

    if ((!Array.isArray(next.quests) || next.quests.length === 0) && Array.isArray(fileData?.quests) && fileData.quests.length > 0) {
      next.quests = cloneValue(fileData.quests);
    }

    if ((!Array.isArray(next.hubs) || next.hubs.length === 0) && Array.isArray(fileData?.hubs) && fileData.hubs.length > 0) {
      next.hubs = cloneValue(fileData.hubs);
    }

    if ((!Array.isArray(next.events) || next.events.length === 0) && Array.isArray(fileData?.events) && fileData.events.length > 0) {
      next.events = cloneValue(fileData.events);
    }

    next.config = isPlainObject(next.config) ? next.config : {};
    Object.keys(fallbackPlaylists).forEach(key => {
      if (normalizePlaylist(next.config[key]).length === 0 && normalizePlaylist(fileCfg[key]).length > 0) {
        next.config[key] = cloneValue(fileCfg[key]);
      }
      if (normalizePlaylist(next.config[key]).length === 0) {
        next.config[key] = [...fallbackPlaylists[key]];
      }
    });

    return next;
  }

  const fileSet = loadFileSet();
  const localOverrides = readLocalOverrides();
  const mergedData = mergeRuntimeData(fileSet.data || {}, localOverrides || {});
  global.DD_CUSTOM = applyRuntimeFallbacks(mergedData, fileSet.data || {});
  global.DD_EFFECTS_CONFIG = isPlainObject(fileSet.data?.effects) ? cloneValue(fileSet.data.effects) : {};

  global.__DD_RUNTIME_BOOT = {
    page: options.page || 'runtime',
    runtimeConfigPath: `${runtimeConfigBasePath}${cacheSuffix}`,
    runtimeConfigBasePath,
    runtimeConfigLoaded: !!fileSet.runtimeConfigLoaded,
    runtimeConfigError: fileSet.runtimeConfigError,
    hasLocalOverrides: !!(localOverrides && Object.keys(localOverrides).length > 0),
    localOverrideMode: shouldAllowLocalOverrides() ? 'enabled' : 'disabled',
    playlistFallbacks: cloneValue(fallbackPlaylists),
    dataSources: fileSet.sources,
    loadSplitDataFiles,
  };

  console.log('Runtime config path:', global.__DD_RUNTIME_BOOT.runtimeConfigPath);
  console.log('Loaded config:', cloneValue(global.DD_CUSTOM || {}));
  console.log('Runtime data sources:', cloneValue(global.__DD_RUNTIME_BOOT.dataSources || []));

  global.logDDRuntimeDiagnostics = function logDDRuntimeDiagnostics(context) {
    const worldMap = Array.isArray(global.DD_CUSTOM?.worldMap) ? global.DD_CUSTOM.worldMap : [];
    const acts = Array.isArray(global.DD_CUSTOM?.acts) ? global.DD_CUSTOM.acts : [];
    const cfg = global.DD_CUSTOM?.config || {};
    const details = {
      context: context || 'runtime',
      runtimeConfigLoaded: global.__DD_RUNTIME_BOOT?.runtimeConfigLoaded || false,
      runtimeConfigPath: global.__DD_RUNTIME_BOOT?.runtimeConfigPath || runtimeConfigBasePath,
      hasLocalOverrides: global.__DD_RUNTIME_BOOT?.hasLocalOverrides || false,
      runtimeConfigError: global.__DD_RUNTIME_BOOT?.runtimeConfigError || null,
      worldMapLoaded: worldMap.length > 0,
      worldMapCount: worldMap.length,
      actsLoaded: acts.length > 0,
      actCount: acts.length,
      playlistCounts: {
        menu: normalizePlaylist(cfg['cfg-music-menu']).length,
        campaign: normalizePlaylist(cfg['cfg-music-campaign']).length,
        story: normalizePlaylist(cfg['cfg-music-story']).length,
      },
      dataSources: cloneValue(global.__DD_RUNTIME_BOOT?.dataSources || []),
    };

    global.__DD_RUNTIME_BOOT.lastDiagnostics = details;
    console.info('[RuntimeData]', details);
    return details;
  };
})(window);
