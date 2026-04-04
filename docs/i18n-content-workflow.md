# I18n Content Workflow

## Goal

All new content should be authored once, stored with stable keys, and translated separately.
Gameplay logic must never depend on displayed text.

## Authoring Language

Recommended source language: `de`

Reason:
- Your current design/editor workflow is German-first.
- The editor already seeds German locale data from content.
- English and future languages can be generated from the German source files.

## Rule Set

1. Cards, enemies, world map locations, story lines, acts, fusion labels and future content must use stable IDs.
2. Every user-facing text needs a locale key.
3. Runtime/export data should store keys, IDs, numbers, flags and references, not translated prose.
4. Translation files live in `locales/<language>/`.

## Key Conventions

Use predictable keys based on IDs:

- Card name: `card.<cardId>.name`
- Card flavor/description: `card.<cardId>.flavor`
- Enemy name: `enemy.<enemyId>.name`
- Enemy title: `enemy.<enemyId>.title`
- World location name: `world.<locationId>.name`
- World location description: `world.<locationId>.description`
- Story speaker: `story.<locationId>.<index>.speaker`
- Story text: `story.<locationId>.<index>.text`

If you later add act-specific text:

- Act name: `act.<actId>.name`
- Act description: `act.<actId>.description`

If you later add fusion-specific display text:

- Fusion recipe label: `fusion.<resultId>.label`
- Fusion hint text: `fusion.<resultId>.hint`

## Recommended Editing Workflow

### Cards

1. Create or edit the card in the editor.
2. Keep the stable `id` unchanged after release.
3. Enter German source text.
4. Export runtime data.
5. Export translation template for `en`.
6. Translate only the locale values, never the IDs.

### Enemies

1. Keep enemy `id` stable.
2. Author `name` and `title` in German.
3. Let export generate/update locale keys.
4. Translate `enemy.*` entries in `locales/en/cards.json`.

### Story and World Map

1. Keep location IDs stable.
2. Edit German location names, descriptions and story lines in the editor.
3. Export runtime and translation template.
4. Translate generated `world.*` and `story.*` keys in `locales/en/story.json`.

### Acts and Fusions

Current recommendation:
- Keep logic/config in runtime data.
- If a field is player-visible, move it behind a locale key before treating it as final content.

For future act/fusion authoring:
- Add `nameKey` / `descriptionKey` style fields exactly like cards and locations.
- Seed German values into locale files during export.
- Translate only locale JSON, not gameplay JSON.

## Translation Workflow With AI

Recommended loop:

1. Maintain source content in German.
2. Export runtime data from the editor.
3. Export an English template.
4. Let AI translate only missing or changed values.
5. Review tone, card flavor and consistency in the game via the language switcher.
6. Commit both runtime/config and locale updates together.

## Important Stability Rules

- Never rename published IDs unless you also migrate every dependent reference.
- Never use translated names for lookups, comparisons or fusion logic.
- Never branch gameplay based on displayed strings.
- Prefer adding a new locale key over reusing an unrelated one.

## Suggested Next Improvements

- Add locale buckets for `acts`
- Add locale buckets for `fusions`
- Add an editor report for missing keys per language
- Add an import path for translated locale JSON back into the project
