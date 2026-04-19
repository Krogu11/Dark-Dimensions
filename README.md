# Dark Dimensions

> A dark single-player card battler with roguelike progression, world map exploration, fusion mechanics, and persistent progression.

**Dark Dimensions** blends a fast, readable card-battling experience with a grim campaign full of enemies, bosses, and constant deck growth. You choose a save slot, start a run, fight your way across dangerous acts, collect cards, invest `DS`, and turn simple creatures into powerful fusion monsters.

This project is intentionally a **hobby vibecode project**: built for the joy of creating, experimenting, and expanding it over time. One of the biggest inspirations for the overall feel of the game, especially the **fusion system**, was the design concept of `Yu-Gi-Oh! Forbidden Memories`.

## What Makes It Special

- Dark fantasy atmosphere with clear arcade/TCG readability
- Roguelike campaign structure with world map, hub areas, story screens, and boss progression
- Card system with monsters, spells, traps, field cards, and fusion monsters
- Free Duel mode for replaying unlocked enemies, farming cards, and testing decks
- Persistent meta progression through save slots and `Dimensionsseelen (DS)`
- Built-in developer editor for cards, enemies, acts, fusions, synergies, and the world map
- Designed from the start to be easy to mod

## Current Scope

- `110` cards
- `11` fusion monsters
- `24` fusion recipes
- `16` enemies
- `3` acts
- `8` world map locations

## Gameplay Loop

`Choose save slot → Start run → Explore the world → Win battles → Earn cards → Improve your deck → Defeat bosses → Secure progress`

There is also a **Free Duel mode** where already unlocked enemies can be challenged again to expand your collection more directly.

## Combat System

- Turn phases: `Draw → Main → Battle → End`
- You normally have `2` summons per turn
- Monsters can be played in attack or defense mode
- Fusions work with `Hand + Hand` and `Field + Hand`
- The battlefield uses `5` monster slots and `3` spell/trap slots per side
- The AI does more than just play cards randomly: it evaluates lethals, targets, effects, and fusion potential

## Progression and Meta

- `DS` persists within each save slot
- Cards earned during runs are only permanently secured after important milestones
- Losing a run hurts the current run, but not your entire long-term progress
- The deck editor supports valid decks with `15` to `20` cards

## Controls

- Click a card: select / play it
- Select an attacker, then click a target: perform an attack
- Select two compatible monsters: prepare a fusion
- Deck and combat screens are fully accessible ingame
- `ESC`: pause during battle

## Project Structure

```text
index.html                       Game entry point
editor.html                      Developer editor
css/style.css                    Main styling
js/core/                         Engine, AI, effects, save system, audio, ranking
js/data/                         Base card, enemy, and map data
js/ui/                           Screens, battle UI, rewards, title screen, world map logic
assets/data/runtime-config.json  Exported runtime data
.github/workflows/static.yml     GitHub Pages deployment
```

## Run Locally

Do not rely on `file://` for normal development. Browsers handle locale loading and media behavior differently there than on GitHub Pages.

Use a local HTTP server instead.

### Start the Game

1. Start a local server:
   - PowerShell: `./serve-local.ps1`
   - Or manually: `python -m http.server 8000`
2. Open [http://127.0.0.1:8000/index.html](http://127.0.0.1:8000/index.html)

### Start the Editor

1. Start the same local server
2. Open [http://127.0.0.1:8000/editor.html](http://127.0.0.1:8000/editor.html)
3. Edit content
4. Export or runtime-export it back into the game

### Why this matters

- `file://` can trigger CORS restrictions for locale loading
- audio autoplay behavior differs more strongly without a normal page lifecycle
- GitHub Pages runs over HTTP, so local HTTP development is the closest match

## Content Workflow

The editor is a core part of the project. It is not just a developer tool, but the foundation that keeps **Dark Dimensions highly moddable** and capable of growing into a true **community project**.

With it, you can edit things like:

- cards and card art
- enemy decks and enemy behaviors
- drop tables
- acts and node generation
- fusions and synergies
- world map data and configuration values

The main idea is that the community should be able to actively help shape and expand the game, for example by creating:

- new cards
- new decks
- new monsters and enemies
- new fusions and synergies
- new story elements, events, and world map content

The long-term goal is for **Dark Dimensions** to become more than just my own hobby project. It is meant to grow into an open, community-driven project shaped by ideas, content, and feedback from the people who play it and build for it.

The exported runtime file lives at [`assets/data/runtime-config.json`](./assets/data/runtime-config.json).  
For publishing, use [`publish-runtime.bat`](./publish-runtime.bat). It opens a small Windows GUI that can automatically pick the newest `runtime-config*.json` from `Downloads` or let you choose a file manually, then sync and publish in one step.  
If you still want the old console workflow, use [`publish-runtime-cli.bat`](./publish-runtime-cli.bat) or [`publish-runtime.ps1`](./publish-runtime.ps1).

## Tech Stack

- Vanilla `HTML`, `CSS`, `JavaScript`
- No build step
- Save data stored via `localStorage`
- GitHub Pages workflow for static deployment

## Status

**Version 1.0** has been reached.  
The project is playable and already has a clear gameplay identity, but it is still actively expanding through runtime data and editor-driven workflows.

## Notes

- The project relies heavily on data-driven content
- The editor export and runtime configuration are important for the complete campaign setup
- Some data still contains visible character encoding issues

## Vision

**Dark Dimensions** should feel like a fast, dark boss-run card battler: tough fights, powerful fusions, meaningful progression, and a deck that becomes more dangerous with every win.

At the same time, the project should stay open, extensible, and collaborative: a moddable dark-fantasy card game that is not only played, but also built together.
