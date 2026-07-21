# Dark Dimensions Architecture

## Product direction

Dark Dimensions is a difficult, RNG-heavy card RPG played on a freely
traversable world map. Runs use a single Ironman autosave. Entering a location
and crossing into or out of battle writes the autosave automatically. Defeat
permanently ends the run and deletes that save.

The initial combat contract is:

- Three tactical actions per turn.
- Summoning, recalling, or drawing one additional card consumes one tactical action.
- The opening hand contains five cards, each round draws one free card, and the hand limit is seven.
- DEF passively reduces incoming damage on every attack.
- Units choose random targets by default; authored cards may prefer wounded, weak,
  armored, or other specialized targets.
- Both formations attack automatically when the round is resolved.
- Each side has a leader behind its formation. Leaders act every round but never
  occupy a unit slot; the player selects the hero's action before resolution.
- Damage beyond a defeated unit's remaining HP pierces through to its leader.
- An empty formation exposes its leader to direct attacks.
- A side loses when its leader dies or it has no living units on field, hand, or draw pile.
- Monsters have persistent HP between battles.
- A monster reaching zero HP is permanently removed from the deck.
- Surviving monsters can only be healed in cities by paying gold.

## World encounters

Each new game creates a seed-based world containing cities, villages, castles,
dungeons, landmarks, wild regions, roads, encounter zones, and hostile patrols.
The seed is stored in the Ironman autosave so loading recreates exactly the same map.

The same seed generates plains, forests, swamps, deserts, mountains, lakes,
rivers, and a coastal sea boundary. `WorldTerrain.ts` owns terrain lookup,
future movement modifiers, and shared collision rules so players and patrols
cannot cross impassable terrain while Phaser remains a rendering layer.

Roads are generated as map data rather than decorative lines. They accelerate
travel, lower hostile encounter pressure, define caravan and villager routes,
and create the only traversable crossings over rivers. Terrain also modifies
visibility, travel ration pressure, patrol movement, and battle ATK/DEF.

Exploration is stored as coarse world sectors. The React strategic map renders
terrain, discovered locations, threats, roads, fog of war, and player-selected
waypoints without moving authoritative world state into the UI layer.

The world map is freely traversable. Hostile warbands are represented by red
markers, wander around generated spawn regions, and pursue the player inside
their aggro radius. Cities are safe zones. Contact with a hostile warband starts
a card battle.

Enemy markers display one to five threat diamonds. Enemy archetypes own their
deck size, rewards, and threat rating independently, allowing visible
patrol, elite, and boss difficulty before contact.

Patrol travel speed uses the same burden philosophy as the player. Every enemy
warband has a simulated party size and carried inventory weight. Clearly weaker
patrols flee when they detect a much stronger player Warband; comparable and
stronger patrols continue to pursue.

## World time and travel

- Game time advances through world movement and successful actions, never from
  real-time idling.
- Opening or reading menus pauses the world completely.
- Travel speed is derived from the full troop roster and carried item weight.
- Enemy patrols, merchant caravans, market restocks, and quest readiness advance
  from elapsed game hours.
- Daylight controls map sight distance; locations, patrols, and caravans outside
  the current radius are hidden.
- Terrain already modifies travel; mounts, skills, weather, injuries, and
  equipment can extend the same calculation later.

## Living locations

- Villages offer one-time local work for modest gold.
- Castles provide repeatable garrison battles and a first-clear bonus.
- Landmarks and wild regions trigger deterministic seed-based risk events.
- Dungeons contain three consecutive battles with rising local threat.
- Dungeon HP, casualties, XP, gold, and captured cards persist between depths.
- After a cleared depth, the player may descend or retreat with current spoils.
- Only the final depth marks the dungeon cleared and awards its completion bonus.
- Completed location events are stored in the Ironman autosave.
- Cities must be entered from the world map before their services become
  available.
- City names are assembled deterministically from curated dark-fantasy word
  lists, with duplicate protection inside each generated world.
- Every city owns persistent population, garrison, prosperity, and a reserved
  future lord assignment. Initial values derive from the world seed and nearby
  settlements; mutable values persist in the Ironman autosave.
- The city hub groups its market, finite recruitment roster, contracts, healers,
  and character service in one protected menu.
- City markets place merchant stock and player inventory side by side, enabling
  direct buying and selling without changing screens.

## Loot and economy

- Enemy archetypes define independent card and item drop tables with exact
  probabilities and quantity ranges.
- Captured enemy cards continue to enter the reserve or active Warband.
- Inventory items stack and persist in the Ironman autosave.
- The economy uses reusable standard goods such as wood, iron, copper, stone,
  wheat, livestock, flour, bread, wine, wool, meat, milk, cheese, and leather.
- Twelve generated villages each specialize in one raw product and also sell
  several local staples.
- Cities have broad multi-category markets, seed-selected demand, and four
  available processing recipes.
- Selling demanded raw materials earns a substantial city premium.
- City workshops process linked production chains such as wheat to flour to
  bread, grapes to wine, milk to cheese, and clay to pottery.
- Every settlement has finite stock; scarcity raises sale prices and player sales
  gradually depress that market's purchase price.
- Village resources and city medicine replenish slowly instead of being infinite.
- Visible village traders carry local products from villages to their nearest
  city and gradually add those goods to city stock.
- Large merchant caravans travel exclusively between cities with broader cargo.
- Both trader types carry limited stock and can be traded with when approached.
- Market inventories, scarcity, replenishment timers, caravan positions, and
  village trader positions are persisted in the Ironman autosave.
- Consumables can restore a wounded surviving unit outside combat.
- The hero has right-hand, left-hand, and accessory equipment whose bonuses feed
  into battle ATK or DEF.

## Warband survival

- The hero and every troop consume one food point whenever a new day begins.
- Wheat, bread, meat, dried meat, cheese, fish, milk, and prepared travel
  rations all contribute to the shared food supply.
- Food goods use persistent capacity stacks, such as a wheat sack changing from
  `60/60` to `48/60` after feeding twelve characters for one day.
- Every non-hero troop contributes to a weekly payroll; higher tiers cost more.
- Fully paid and fed parties recover morale over time.
- Missing food or wages causes immediate, scaling morale losses.
- Morale modifies world travel speed, making neglected armies easier for hostile
  patrols to catch.
- Food goods have weight, finite settlement stock, caravan stock, and normal
  scarcity-based market pricing.
- The latest daily upkeep report and survival state persist in the Ironman autosave.

## Factions and contracts

- Every generated city, village, and castle belongs to one of three factions.
- Faction ownership is deterministic for the world seed and visible on map markers.
- Reputation is tracked separately for the Ember Crown, Gloam Compact, and Iron
  Concord.
- Positive local reputation lowers merchant sale prices and improves purchase
  offers up to authored caps.
- Settlements generate deterministic delivery, bounty, or caravan escort contracts.
- Delivery contracts consume specified trade goods at their destination.
- Bounties count only victories against the requested enemy archetype.
- Escort contracts require the assigned caravan and player to reach the target
  settlement together.
- Contract progress, completion, rewards, and reputation persist in the Ironman autosave.

## Tactical battle loop

1. Spend up to three tactical actions on summons, recalls, or additional draws.
2. Choose the hero's attack or support command.
3. Resolve the round; units acquire random or card-specific targets without fixed lanes.
4. Apply initiative groups, piercing overflow, leader actions, and defeat checks.
5. Begin a new round with refreshed actions and one free draw.

Monster definitions may provide on-summon effects such as healing, direct
damage, shields, or army-wide attack buffs. Consumable battle items are reserved
for a later inventory system and are not part of the current combat loop.

## Warband progression

- A new game starts with no recruitable unit cards.
- The immortal hero leads behind the formation and consumes no unit slot.
- Battle formation capacity starts at three and rises with Leadership, to a
  maximum of seven deployed cards.
- Warband roster capacity derives from Charisma and Leadership.
- There is currently no separate reserve roster.
- New city recruits enter the active Warband when a slot is available.
- The human troop tree starts with Village Levy, then branches into Levy
  Spearman or Novice Archer before splitting into further specializations.
- Only active Warband units are drawn in battle.
- Deployed survivors gain XP after victory.
- Every obtainable creature belongs to a multi-tier upgrade tree.
- Deployed survivors earn direct tier-based XP. Upgrade requirements follow
  `50 + tier × 50`; upgrades preserve excess XP and current health percentage.
- Experienced units choose between authored upgrade branches in a
  Mount-and-Blade-style progression.
- Captured enemy cards become prisoners and can later be recruited or sold.
- Warband and reserve management is available anywhere on the world map.
- Recruitment, healing, and prisoner sales remain city-only services. Saving is
  automatic under the Ironman rules.
- Recalling a non-hero field monster to the hand consumes one summon action.

## Technical boundaries

- `src/domain` owns all rules and serializable state.
- `src/phaser` renders the world and forwards input.
- `src/ui` owns menus, HUD, and localization.
- `src/content` contains versioned authored data.
- `src/infrastructure` provides replaceable persistence adapters.

Phaser objects are never written into a save game.

Mobile world movement uses a DOM touch joystick connected through a small
renderer-independent input bridge. Keyboard and touch vectors feed the same
world movement method, so travel time, collision, speed, and encounter rules
remain identical across desktop and mobile.

## Persistence

The web build stores one Ironman autosave in IndexedDB, not cookies or localStorage.
Manual saves are not exposed. Active battle checkpoints force a reloaded run
back into its pending encounter, preventing a page reload from escaping combat.
The `SaveRepository` interface allows a future Tauri desktop build to use
normal files in the operating system's application-data directory.

Authored cards, enemies, upgrades, and future item definitions remain validated,
versioned JSON. World layouts are generated from the saved seed instead of
being authored in an editor.

## Localization

English is the source language. Content records contain stable localization
keys such as `location.hollowmere.name`; translated prose does not live in
game-rule data.

Additional languages receive their own resource file matching the English
key structure.

## Legacy card migration

The root `cards.js` remains untouched as source material. Its IDs and stats
can be migrated into the versioned content pack after combat effects receive
typed definitions. German names and flavor text become localization entries.
