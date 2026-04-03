/* ============================================================
   data/map.js - Act-Daten aus dem Editor
   Acts werden ausschliesslich ueber DD_CUSTOM.acts geladen.
   Keine Hardcodes, keine Default-Acts, keine Fallbacks.
   ============================================================ */

const MAP_DATA = [];

function getActId(act) {
  if (!act || typeof act !== 'object') return null;
  if (typeof act.id === 'string' && act.id.trim()) return act.id.trim();
  if (act.actIndex !== undefined && act.actIndex !== null) return `act_${act.actIndex}`;
  return null;
}

function normalizeAct(act) {
  if (!act || typeof act !== 'object') return act;
  return {
    ...act,
    id: getActId(act),
  };
}

function strictDataError(message, details) {
  const fullMessage = details ? `${message}\n${details}` : message;
  console.error(`[StrictMode] ${fullMessage}`);
  if (typeof window !== 'undefined') window.__DD_LAST_STRICT_ERROR = fullMessage;
  return null;
}

(function applyMapOverrides() {
  if (!window.DD_CUSTOM || !Array.isArray(window.DD_CUSTOM.acts)) return;
  window.DD_CUSTOM.acts
    .map(normalizeAct)
    .forEach(customAct => {
      const actId = getActId(customAct);
      if (!actId) return;
      const idx = MAP_DATA.findIndex(act => getActId(act) === actId);
      if (idx >= 0) MAP_DATA.splice(idx, 1, customAct);
      else MAP_DATA.push(customAct);
    });
})();

function getAllActs() {
  return [...MAP_DATA].sort((a, b) => Number(a.actIndex || 0) - Number(b.actIndex || 0));
}

function getActData(actRef) {
  if (typeof actRef === 'string' && actRef.trim()) {
    return MAP_DATA.find(act => getActId(act) === actRef.trim()) || null;
  }
  if (typeof actRef === 'number' && Number.isFinite(actRef)) {
    return MAP_DATA.find(act => Number(act.actIndex) === Number(actRef)) || null;
  }
  return null;
}

function requireActData(actRef, contextLabel = 'Act') {
  const act = getActData(actRef);
  if (act) return act;
  return strictDataError(`${contextLabel} nicht gefunden`, `Referenz: ${String(actRef)}`);
}

function getNodeById(actRef, nodeId) {
  const act = getActData(actRef);
  if (!act || !Array.isArray(act.nodes)) return null;
  return act.nodes.find(node => node.id === nodeId) || null;
}

function resolveNodeEnemy(node) {
  if (node.enemyPool && node.enemyPool.length > 0) {
    const total = node.enemyPool.reduce((sum, entry) => sum + (entry.weight || 1), 0);
    let rnd = Math.floor(Math.random() * total);
    for (const entry of node.enemyPool) {
      rnd -= (entry.weight || 1);
      if (rnd < 0) return entry.enemyId;
    }
    return node.enemyPool[node.enemyPool.length - 1].enemyId;
  }
  return node.enemyId || null;
}

const NODE_ICONS = {
  start: '▶',
  battle: '⚔',
  elite: '⚡',
  shop: '🏪',
  rest: '🏕',
  boss: '💀',
};

const NODE_COLORS = {
  start: '#aaa',
  battle: '#ff8844',
  elite: '#cc44ff',
  shop: '#44aaff',
  rest: '#44ff88',
  boss: '#ff2244',
};
