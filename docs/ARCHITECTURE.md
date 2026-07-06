# Dark Dimensions Architecture

## Product direction

Dark Dimensions is a difficult, RNG-heavy card RPG played on a freely
traversable world map. Cities are the only save points. Defeat restores the
latest city save.

The initial combat contract is:

- Three summons per turn.
- Summoning or recalling a monster consumes one summon action.
- DEF passively reduces incoming damage on every attack.
- Both warbands attack automatically when the round is resolved.
- Monsters have persistent HP between battles.
- A monster reaching zero HP is permanently removed from the deck.
- Surviving monsters can only be healed in cities by paying gold.

## World encounters

Each new game creates a seed-based world containing cities, villages, castles,
dungeons, landmarks, wild regions, roads, encounter zones, and hostile patrols.
The seed is stored in city saves so loading recreates exactly the same map.

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
- Terrain, mounts, skills, weather, injuries, and other future modifiers can
  extend the same travel-speed calculation.

## Living locations

- Villages offer one-time local work for modest gold.
- Castles provide repeatable garrison battles and a first-clear bonus.
- Landmarks and wild regions trigger deterministic seed-based risk events.
- Dungeons contain three consecutive battles with rising local threat.
- Dungeon HP, casualties, XP, gold, and captured cards persist between depths.
- After a cleared depth, the player may descend or retreat with current spoils.
- Only the final depth marks the dungeon cleared and awards its completion bonus.
- Completed location events are stored in city saves.
- Cities must be entered from the world map before their services become
  available.
- The city hub groups its market, recruitment, contracts, healers, and save
  service in one protected menu.
- City markets separate stalls, workshops, and player cargo into focused tabs.
- The market-stall tab places merchant stock and player inventory side by side,
  enabling direct buying and selling without changing screens.

## Loot and economy

- Enemy archetypes define independent card and item drop tables with exact
  probabilities and quantity ranges.
- Captured enemy cards continue to enter the reserve or active Warband.
- Inventory items stack and persist in city saves.
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
  village trader positions are persisted in city saves.
- Consumables can restore a wounded surviving unit outside combat.
- The hero has one equipment slot whose item modifies real battle ATK or DEF.
- The Loot Almanac exposes exact card and item drop chances in the game UI.

## Warband survival

- The hero and every troop consume one food point whenever a new day begins.
- Wheat, bread, meat, dried meat, cheese, fish, milk, and prepared travel
  rations all contribute to the shared food supply.
- Food goods use persistent capacity stacks, such as a wheat sack changing from
  `60/60` to `48/60` after feeding twelve characters for one day.
- Every non-hero troop receives a daily wage; larger rosters cost more to retain.
- Fully paid and fed parties recover morale over time.
- Missing food or wages causes immediate, scaling morale losses.
- Morale modifies world travel speed, making neglected armies easier for hostile
  patrols to catch.
- Food goods have weight, finite settlement stock, caravan stock, and normal
  scarcity-based market pricing.
- The latest daily upkeep report and survival state persist in city saves.

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
- Contract progress, completion, rewards, and reputation persist in city saves.

## Tactical battle loop

1. Spend up to three summon actions on units or recalls.
2. Arrange the deployed warband while considering each unit's passive DEF.
3. Resolve the round to let both warbands choose lanes and attack automatically.
4. Apply all planned attacks simultaneously, then remove defeated units.
5. Begin a new round with refreshed summon actions and replenished hands.

Monster definitions may provide on-summon effects such as healing, direct
damage, shields, or army-wide attack buffs. Consumable battle items are reserved
for a later inventory system and are not part of the current combat loop.

## Warband progression

- A new game starts with no recruitable unit cards.
- The immortal hero card always joins battle and consumes no Warband slot.
- Leadership 1 allows five active unit cards.
- Ten additional unit cards may be held in reserve.
- New city recruits are weak human units and enter the reserve first.
- The human troop tree starts with Village Levy, then branches into Levy
  Spearman or Novice Archer before splitting into further specializations.
- Only active Warband units are drawn in battle.
- Deployed survivors gain XP after victory.
- Every obtainable creature belongs to a multi-tier upgrade tree.
- Experienced units choose between authored upgrade branches in a
  Mount-and-Blade-style progression.
- Dropped enemy cards enter the reserve when capacity is available.
- Warband and reserve management is available anywhere on the world map.
- Recruitment, healing, and saving remain city-only services.
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

The web build stores save games in IndexedDB, not cookies or localStorage.
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
