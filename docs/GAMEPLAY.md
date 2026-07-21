# Gameplay Systems

This document describes the current intended player-facing rules. Exact numbers remain subject to balance changes.

## Campaign loop

1. Create a Wanderer from race, origin, upbringing, and turning point.
2. Enter a procedurally generated realm.
3. Travel between settlements while managing time, food, wages, morale, and cargo.
4. Recruit a small Warband from finite city rosters.
5. Fight patrols, clear locations, take contracts, trade, and improve surviving units.
6. Grow strong enough to challenge elite warbands, deep dungeons, and faction powers.
7. Lose the run permanently if the Wanderer dies.

## Ironman saves

The game exposes no manual save button. One IndexedDB save represents the current run.

Autosaves occur when:

- entering a location
- immediately before battle
- after surviving battle
- recruiting or changing the Warband
- completing important economic actions

An active battle checkpoint reloads into the same encounter. Closing the browser is not a retreat mechanic.

## World travel

The world is traversed directly rather than through a node menu. Terrain affects speed, visibility, food pressure, and battle modifiers. Roads provide faster and generally safer travel, while rivers require crossings and deep water remains impassable.

Game time advances through movement and successful actions. Simply leaving the game open does not advance simulation time.

## Survival

- The Wanderer and troops consume food as days pass.
- Troops require wages.
- Unpaid or hungry parties lose morale.
- Morale affects travel performance.
- Cargo and party size add burden.
- Surviving units retain wounds after battle.
- City healers restore troops for gold.

## Recruitment

Recruitment is separate from Warband management.

- Every city has a finite persistent offer.
- Population and prosperity influence the number of available candidates.
- Prosperity and garrison strength improve the chance of higher-tier recruits.
- Purchased candidates disappear until the city restocks.
- Restocks are deterministic for the world seed and cannot be rerolled by reopening the menu.
- New recruits enter the active Warband when capacity allows.

## Warband experience

Only deployed survivors receive unit XP after victory. A recalled unit still participated and therefore qualifies. Units never deployed receive nothing; fallen troops are lost before rewards are assigned.

Upgrade requirements are derived from the source unit's tier:

```text
required XP = 50 + tier × 50
```

Upgrading consumes the requirement, preserves excess XP, and transfers the unit's current health percentage to its new maximum health. Upgrade paths are authored and may branch into different roles.

## Tactical battles

The Wanderer leads behind the formation and does not consume a unit slot. During preparation the player spends tactical actions to summon cards, recall deployed units, or draw additional cards. The leader then receives a command before the round resolves.

Important principles:

- initiative determines action order
- DEF mitigates damage
- card effects can heal, shield, rally, burn, drain, or alter targeting
- overflow damage can reach the opposing leader
- formations have limited space
- casualties and health persist
- victory rewards may include gold, items, and prisoners

## Economy

Settlement stock is finite. Villages specialize in regional products and move goods toward nearby cities. Larger caravans connect cities. Scarcity changes prices, while player sales increase local supply and reduce future purchase offers.

Markets show merchant stock and player inventory side by side. Equipment displays its stat changes and compares against currently equipped gear.

## Factions and contracts

Settlements belong to the Ember Crown, Gloam Compact, or Iron Concord. Reputation changes market terms and will support deeper political consequences in later updates.

Current contract types:

- delivery of requested goods
- bounty against a specified hostile archetype
- escorting a physical caravan to its destination

## Character progression

The Wanderer has separate character XP, attributes, and skills. This progression is not the same as troop upgrade XP. Origins influence starting capabilities, and several races are designed to unlock through accomplishments across runs.
