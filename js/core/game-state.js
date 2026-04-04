/* ============================================================
   core/game-state.js - centralized facade over legacy state
   Keeps old globals intact while exposing a single state object.
   ============================================================ */

const gameState = (function createGameStateFacade() {
  const meta = {
    currentScene: null,
    flags: {},
    effects: {},
  };

  function cloneSet(setValue) {
    return setValue instanceof Set ? [...setValue] : [];
  }

  return {
    meta,
    run: RUN_STATE,
    battle: BATTLE_STATE,
    get save() {
      return typeof SAVE_STATE !== 'undefined' ? SAVE_STATE : null;
    },
    get player() {
      return {
        hp: BATTLE_STATE.active ? BATTLE_STATE.playerLP : RUN_STATE.playerHP,
        maxHP: RUN_STATE.maxHP,
        hand: BATTLE_STATE.hand,
        field: BATTLE_STATE.playerField,
        grave: BATTLE_STATE.playerGrave,
      };
    },
    get enemy() {
      return {
        data: BATTLE_STATE.enemy,
        hp: BATTLE_STATE.enemyLP,
        field: BATTLE_STATE.enemyField,
        grave: BATTLE_STATE.enemyGrave,
      };
    },
    get deck() {
      return {
        run: RUN_STATE.deck,
        active: BATTLE_STATE.playerDeck,
      };
    },
    get currentScene() {
      return meta.currentScene;
    },
    set currentScene(sceneName) {
      meta.currentScene = sceneName || null;
    },
    get flags() {
      return meta.flags;
    },
    get effects() {
      return meta.effects;
    },
    snapshot() {
      return {
        currentScene: meta.currentScene,
        flags: { ...meta.flags },
        effects: { ...meta.effects },
        run: {
          active: RUN_STATE.active,
          playerHP: RUN_STATE.playerHP,
          maxHP: RUN_STATE.maxHP,
          deckSize: Array.isArray(RUN_STATE.deck) ? RUN_STATE.deck.length : 0,
          currentActIndex: RUN_STATE.currentActIndex,
          currentActId: RUN_STATE.currentActId,
          currentNodeId: RUN_STATE.currentNodeId,
          completedNodes: cloneSet(RUN_STATE.completedNodes),
          availableNodes: cloneSet(RUN_STATE.availableNodes),
        },
        battle: {
          active: BATTLE_STATE.active,
          enemyId: BATTLE_STATE.enemy?.id || null,
          playerLP: BATTLE_STATE.playerLP,
          enemyLP: BATTLE_STATE.enemyLP,
          phase: typeof getCurrentPhase === 'function' ? getCurrentPhase() : null,
          turn: BATTLE_STATE.turn,
          handSize: Array.isArray(BATTLE_STATE.hand) ? BATTLE_STATE.hand.length : 0,
        },
      };
    },
  };
})();
