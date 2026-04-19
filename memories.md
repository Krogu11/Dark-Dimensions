# Dark Dimensions Memories

## Purpose
`memories.md` is the working source of truth for future humans and AI agents. Update it when structure, rules, data contracts, or cross-system interactions change.

## Project Structure
- `/index.html`: production game entry point. Keep boot order stable.
- `/editor.html`: custom content editor entry point. Must remain usable without a build step.
- `/css`: shared styling.
- `/assets/audio`: shipped music assets.
- `/assets/data/runtime-config.json`: canonical runtime source of truth for deployed game content.
- `/assets/data/cards.json`: baseline `cards` and `fusionMonsters`.
- `/assets/data/enemies.json`: baseline `enemies`.
- `/assets/data/effects.json`: baseline effect alias/config data.
- `/assets/data/acts.json`: baseline campaign acts.
- `/assets/data/recipes.json`: baseline fusion recipes.
- `/assets/data/config.json`: baseline runtime config values.
- `/assets/data/starter-deck.json`: baseline starter deck.
- `/assets/data/world-map.json`: baseline world map.
- `/js/core`: gameplay/runtime systems. Keep battle logic, state, saves, AI, effects, and cross-system runtime code here.
- `/js/ui`: game-facing rendering, screens, HUD, map, reward, and title/menu UI.
- `/js/editor`: editor-only helpers and persistence utilities.
- `/js/data`: runtime data adapters and helpers that expose cards, enemies, map/act accessors to the rest of the game.
- `/js/utils`: shared low-risk helpers used by both game and editor.
- `/locales`: translation files.

## Runtime Boot Rules
- Do not change how the game starts: `index.html` must still be directly loadable on GitHub Pages.
- Do not introduce bundlers, frameworks, or module-only loading.
- `js/utils/runtime-data-loader.js` is the shared boot layer for game and editor.
- The loader now treats `assets/data/runtime-config.json` as the default single runtime source and then applies optional local `dd_custom` overrides.
- Split JSON files are now derived artifacts for tooling/export compatibility and must not override deployed runtime content unless `loadSplitDataFiles: true` is explicitly enabled.
- `assets/data/runtime-config.js` mirrors `runtime-config.json` as `window.DD_RUNTIME_EMBEDDED_DATA` and is loaded before `runtime-data-loader.js`.
- On `file://`, the runtime loader now falls back to `window.DD_RUNTIME_EMBEDDED_DATA` instead of failing to load JSON via XHR. This is the parity fallback for local double-click testing.
- `index.html` explicitly disables local `dd_custom` overrides with `allowLocalOverrides: false`; editor-only local overrides stay enabled in `editor.html`.
- Runtime boot now logs `Runtime config path`, `Loaded config`, and `Runtime data sources` to the console for deployment diagnostics.
- Use `serve-local.ps1` or another local HTTP server for closest GitHub Pages parity, but `file://` should no longer hard-fail campaign boot when the embedded runtime file is present.

## State Architecture
- Legacy globals remain in place for compatibility: `RUN_STATE`, `BATTLE_STATE`, `SAVE_STATE`.
- Central facade: `gameState` in `/js/core/game-state.js`.
- `gameState.run` wraps run-level state.
- `gameState.battle` wraps active battle state.
- `gameState.save` exposes save state when available.
- `gameState.currentScene` is the canonical UI scene tracker and is updated by `showScreen`.
- Future systems should prefer `gameState` over reaching for scattered globals.

## Event System
- Global lightweight bus lives in `/js/core/events.js`.
- Public API:
  - `emit(eventName, payload)`
  - `on(eventName, callback)`
  - `off(eventName, callback)`
- Current lifecycle hooks:
  - `scene:changed`
  - `battle:initialized`
  - `battle:round-reset`
  - `effect:applied`
- Events must stay observational/lightweight. Do not move critical combat flow into async or delayed event handlers without deliberate design.

## Editor and Game Interaction
- The editor writes working data to `localStorage['dd_custom']` via `saveToGame()`.
- The game reads `dd_custom` only in allowed local/dev override contexts; production GitHub Pages relies on committed JSON files unless overrides are explicitly enabled.
- The editor runtime export must include `effects` and `locales` so the exported runtime file is self-sufficient.
- The publish helper must regenerate `assets/data/runtime-config.js`, all split JSON files, and locale files from `assets/data/runtime-config.json`.
- Editor helper logic belongs in `/js/editor`; avoid adding more large inline utility code to `editor.html` when an external helper is enough.
- Do not break existing editor globals such as `editorCards`, `editorEnemies`, `editorActs`, `editorRecipes`, `editorConfig`, `editorStarterDeck`, and `editorWorldMap`.

## Local Editor vs Online Game
- There are three distinct states and they must not be confused:
  - editor working state in `localStorage['dd_custom']`
  - exported runtime snapshot in `runtime-config*.json`
  - deployed GitHub Pages files committed in the repo
- Changing data in `editor.html` does not update GitHub Pages by itself. Editor saves only update the local working state until a runtime export is created and published.
- The local editor is the authoring tool. The exported runtime JSON is the transport artifact. The committed repo files are the deployed source for the online game.
- The online game on GitHub Pages does not read your local browser `dd_custom` state. It only reads committed files from the repository.
- The game runtime on GitHub Pages loads `assets/data/runtime-config.json` as the canonical deployed content source, then applies no local overrides by default.
- `assets/data/runtime-config.js` exists as an embedded fallback mirror of `runtime-config.json`, mainly for `file://` compatibility and defensive fallback behavior.
- Split files such as `assets/data/world-map.json`, `assets/data/story-content.json`, and `locales/*/*.json` are derived deployment artifacts and must stay in sync with `runtime-config.json`.
- If `runtime-config.json` and derived files diverge, the online game can show stale world map data or missing localization even when the editor export itself is correct.
- The publish pipeline is responsible for removing that drift by regenerating all derived files from one runtime export before commit/push.
- Local verification rule:
  - if something looks correct in the editor but wrong online, first ask whether the change only exists in `dd_custom` or has actually been exported and published
  - then compare online `runtime-config.json`, `world-map.json`, and relevant `locales/*/*.json`
  - if online `runtime-config.json` is new but `world-map.json` or locale files are old or empty, the publish step was incomplete or used a bad export
- Runtime localization rule:
  - world map locations use `nameKey` and `descriptionKey`
  - displayed names depend on locale keys existing in `locales/*/story.json` or in `runtime-config.json.locales`
  - if a location falls back to its ID online, treat it as a locale export/publish sync issue, not a map rendering issue
- Editor-to-online path of truth:
  1. edit data in `editor.html`
  2. save to game if needed for local testing
  3. create a fresh runtime export
  4. publish that runtime export through the publish tool
  5. let the tool sync repo deployment artifacts
  6. commit and push
  7. GitHub Pages serves the committed files
- Never manually copy JSON from `Downloads` into `assets/data` anymore. That old process caused repeated runtime drift and locale wipeouts.

## Deployment Flow
- Required deployment path:
  1. Export `runtime-config.json` from `editor.html`.
  2. Run `publish-runtime.bat`.
  3. In the GUI, either use the newest `runtime-config*.json` from `Downloads` or choose a file manually.
  4. Click the publish button once.
- `publish-runtime.ps1` is responsible for keeping derived files in sync. Manual copying between runtime, split JSON files, and locale files is no longer an accepted workflow.
- `publish-runtime.ps1 -SkipGit` is the safe local validation mode for checking generation without commit/push.
- `publish-runtime.bat` is now the preferred user-facing entry point. It launches `publish-runtime-gui.ps1` as a one-window publish tool.
- `publish-runtime-cli.bat` is the legacy console entry point for fallback/debugging.
- `publish-runtime-gui.ps1` supports two practical modes:
  - auto mode using the newest `runtime-config*.json` from `Downloads`
  - manual mode choosing a specific runtime export file
- The GUI can either:
  - sync only repo files without git push when `Direkt committen und pushen` is disabled
  - sync, commit, and push in one run when it stays enabled
- If GitHub Pages shows stale data, verify `runtime-config.json` and `world-map.json` online first. A mismatch means derived files were not regenerated before push.

## Data Contracts
- `cards.json`:
  - `{ cards: Card[], fusionMonsters: Card[] }`
- `enemies.json`:
  - `{ enemies: Enemy[] }`
- `effects.json`:
  - `{ effects: { legacyAliases: Record<string, EffectDefinition> } }`
- `acts.json`:
  - `{ acts: Act[] }`
- `recipes.json`:
  - `{ recipes: FusionRecipe[] }`
- `config.json`:
  - `{ config: Record<string, unknown> }`
- `starter-deck.json`:
  - `{ starterDeck: string[] }`
- `world-map.json`:
  - `{ worldMap: WorldMapLocation[] }`
- `story-content.json`:
  - `{ events: Event[], quests: Quest[], hubs: Hub[], locales: LocaleRoot }`
- `runtime-config.js`:
  - `window.DD_RUNTIME_EMBEDDED_DATA = <runtime-config-json>`
- `runtime-config.json`:
  - self-contained runtime payload including `cards`, `fusionMonsters`, `effects`, `enemies`, `acts`, `recipes`, `config`, `starterDeck`, `worldMap`, `events`, `quests`, `hubs`, and `locales`
- Keep localization keys in data objects and human-readable text in locale buckets when possible.
- Preserve backward compatibility for legacy fields like `card.effect` while favoring normalized `card.effects`.

## Localization and Encoding
- Runtime and i18n loaders now normalize common mojibake sequences (`Ã¤`, `Ã¶`, `Ã¼`, `ÃŸ`, `â€¦`, etc.) when reading runtime JSON, locale JSON, and local `dd_custom` overrides.
- UTF-8 remains the intended source encoding for JSON and JS assets; the normalization layer is only a defensive compatibility guard for older corrupted values.
- If umlauts regress again, check both committed JSON files and `localStorage['dd_custom']` before assuming the renderer is at fault.

## Story and Hub Event Rules
- Story runtime state now tracks both `seenEvents` and `completedEvents`.
- `once: true` events must not auto-trigger again once they have been seen or completed.
- Hub auto-events are gated per hub entry via a runtime key and must not re-trigger on every hub re-render.
- Returning to the world map resets the current auto-hub-event gate so legitimate future re-entry events can fire once on the next visit.
- The village intro softlock was caused by repeated `enter_hub` auto-triggering during hub re-renders; preserve the new gating behavior when extending hub logic.

## Coding Rules
- No gameplay rule changes during cleanup/refactor work unless explicitly requested.
- No editor regressions.
- No changes to the static loading model.
- Prefer additive compatibility layers over destructive rewrites.
- Keep data-loading changes fallback-safe.
- Avoid new hidden global variables. If cross-file access is needed, hang it off an intentional facade or documented global.
- Preserve top-level function names that HTML inline handlers or older scripts rely on.

## Naming Conventions
- Files: lowercase kebab-case or existing lowercase names. Match current folder style when touching old files.
- Data keys: stable machine-readable IDs in lowercase snake_case unless an existing legacy ID already ships.
- Event names: `domain:action` style, lowercase.
- New helper files should be named by responsibility, not by ticket or version.

## Safe Refactor Checklist
- Keep `index.html` and `editor.html` script order intentional.
- Keep `DD_CUSTOM` shape compatible with older code.
- Keep `runtime-config.json` complete and deployable on its own even when split files exist.
- Do not remove old helper APIs unless all callers are migrated in the same change.
- Smoke-check for syntax errors after edits.

## AI Agent Rules
- Work on the assigned branch only.
- Do not commit directly to `main`.
- Keep changes scoped to one subsystem where possible.
- Do not rewrite unrelated files while doing cleanup.
- Before moving code, confirm the entry-point and inline-handler dependencies.
- When uncertain, prefer wrappers/facades over deep rewrites.
- Update this file when adding new directories, globals, runtime contracts, or branch policies.

## Branch Policy
- Target branch roles:
  - `main`: stable production branch
  - `dev`: integration branch
  - `feature/editor`: editor-only work
  - `feature/gameplay`: gameplay/runtime systems
  - `feature/ui`: menus, HUD, rendering, presentation
  - `feature/audio`: music and sound
  - `experimental`: AI or risky prototype work
- `1.1` is the current known-good source branch and should be used as the basis for the new `main`.

## Known Risks
- Several legacy files still contain encoding issues.
- Much editor logic is still inline in `editor.html`; move it only in small verified slices.
- Many runtime systems still read legacy globals directly. `gameState` is the compatibility facade for gradual migration, not proof that all callers are already rewritten.

## Update Log
- 2026-04-04: Added shared runtime data loader, split baseline JSON files, central `gameState` facade, lightweight event bus, and editor data helper module.
- 2026-04-05: Rebased the structure branch onto the parity fixes. Preserved HTTP-first local dev guidance, file-protocol warnings, normalized audio paths, and deferred music start until user interaction.
- 2026-04-05: Added `file://` runtime fallback via `assets/data/runtime-config.js`, disabled game-side local overrides by default, hardened mojibake normalization in runtime/i18n loaders, and fixed hub auto-event repeat loops using `seenEvents` plus per-hub auto-trigger gating.
- 2026-04-05: Fixed recurring local-vs-online drift by making `assets/data/runtime-config.json` the deployed runtime source of truth, preventing split JSON override by default, adding runtime boot diagnostics, and making `publish-runtime.ps1` regenerate all derived data and locale files from the runtime export.
- 2026-04-05: Added a one-window publish GUI via `publish-runtime.bat` and `publish-runtime-gui.ps1`, with automatic latest-export pickup from `Downloads`, optional manual file selection, and integrated sync/commit/push flow.
