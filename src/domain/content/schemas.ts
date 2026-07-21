import { z } from "zod";

export const locationTypeSchema = z.enum([
  "city",
  "village",
  "castle",
  "dungeon",
  "landmark",
  "wilds",
  "soulTemple",
]);

export const mapLocationSchema = z.object({
  id: z.string().min(1),
  type: locationTypeSchema,
  nameKey: z.string().min(1),
  descriptionKey: z.string().min(1),
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  radius: z.number().positive(),
  spawnProfile: z
    .object({
      biome: z.string().min(1),
      spriteKey: z.string().min(1).optional(),
      enemyIds: z.array(z.string().min(1)).min(1),
      bossEnemyId: z.string().min(1),
      respawnHours: z.number().positive(),
    })
    .optional(),
});

export const encounterEntrySchema = z.object({
  enemyId: z.string().min(1),
  weight: z.number().positive(),
});

export const encounterZoneSchema = z.object({
  id: z.string().min(1),
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  radius: z.number().positive(),
  encounterChancePerStep: z.number().min(0).max(1),
  encounters: z.array(encounterEntrySchema).min(1),
});

export const worldEnemySpawnSchema = z.object({
  id: z.string().min(1),
  archetypeId: z.string().min(1),
  sourceLocationId: z.string().min(1).optional(),
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  aggroRadius: z.number().positive(),
  speed: z.number().positive(),
  partySize: z.number().int().positive(),
  inventoryWeight: z.number().nonnegative(),
  threat: z.number().int().min(1).max(5),
});

export const warbandTypeSchema = z.enum([
  "lord",
  "patrol",
  "scout",
  "merchantEscort",
  "militia",
  "army",
  "elite",
]);

export const warbandStateSchema = z.enum([
  "idle",
  "patrolling",
  "traveling",
  "chasing",
  "fighting",
  "retreating",
  "returning",
  "destroyed",
]);

export const nobleRankSchema = z.enum(["king", "baron", "count"]);

export const nobleProfileSchema = z.object({
  id: z.string().min(1),
  factionId: z.enum(["ember_crown", "gloam_compact", "iron_concord"]),
  rank: nobleRankSchema,
  displayName: z.string().min(1),
  leaderCardId: z.string().min(1),
  leaderLevel: z.number().int().positive().default(1),
});

export const warbandTemplateSchema = z.object({
  id: z.string().min(1),
  nameKey: z.string().min(1),
  type: warbandTypeSchema,
  factionId: z.string().min(1),
  unitIds: z.array(z.string().min(1)).min(1),
  speed: z.number().positive(),
  detectionRadius: z.number().positive(),
  aggressionRadius: z.number().positive(),
  aggression: z.number().min(0).max(1),
  maxPursuitDistance: z.number().positive(),
  respawnHours: z.number().positive(),
  leaderCardId: z.string().min(1).optional(),
  leaderLevel: z.number().int().positive().optional(),
  equipmentItemIds: z.array(z.string().min(1)).default([]),
  lootItemIds: z.array(z.string().min(1)).default([]),
  bountyHunter: z.boolean().default(false),
});

export const warbandSpawnSchema = z.object({
  id: z.string().min(1),
  templateId: z.string().min(1),
  homeLocationId: z.string().min(1).optional(),
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  patrolPoints: z
    .array(
      z.object({
        x: z.number().nonnegative(),
        y: z.number().nonnegative(),
      }),
    )
    .optional(),
  allowedRadius: z.number().positive().optional(),
  spawnChance: z.number().min(0).max(1).default(1),
  nobleRank: nobleRankSchema.optional(),
  nobleProfileId: z.string().min(1).optional(),
  displayName: z.string().min(1).optional(),
  leaderCardId: z.string().min(1).optional(),
  leaderLevel: z.number().int().positive().optional(),
});

export const terrainZoneTypeSchema = z.enum([
  "forest",
  "darkForest",
  "pineForest",
  "tundra",
  "snowMountain",
  "swamp",
  "bog",
  "desert",
  "badlands",
  "steppe",
  "grassland",
  "heath",
  "mountain",
  "hills",
  "lake",
]);

export const terrainZoneSchema = z.object({
  id: z.string().min(1),
  type: terrainZoneTypeSchema,
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  radiusX: z.number().positive(),
  radiusY: z.number().positive(),
});

export const terrainCellSchema = z.object({
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  size: z.number().positive(),
  type: z.enum([
    "plains",
    "forest",
    "darkForest",
    "pineForest",
    "tundra",
    "snowMountain",
    "swamp",
    "bog",
    "desert",
    "badlands",
    "steppe",
    "grassland",
    "heath",
    "mountain",
    "hills",
    "lake",
  ]),
});

export const terrainRiverSchema = z.object({
  id: z.string().min(1),
  width: z.number().positive(),
  points: z
    .array(
      z.object({
        x: z.number().nonnegative(),
        y: z.number().nonnegative(),
      }),
    )
    .min(2),
});

export const terrainRoadSchema = z.object({
  id: z.string().min(1),
  originId: z.string().min(1).optional(),
  destinationId: z.string().min(1).optional(),
  width: z.number().positive(),
  points: z
    .array(
      z.object({
        x: z.number().nonnegative(),
        y: z.number().nonnegative(),
      }),
    )
    .min(2),
});

export const worldMapSchema = z.object({
  id: z.string().min(1),
  width: z.number().positive(),
  height: z.number().positive(),
  boundaryInset: z.number().positive(),
  start: z.object({ x: z.number(), y: z.number() }),
  terrainZones: z.array(terrainZoneSchema),
  terrainCells: z.array(terrainCellSchema),
  terrainRivers: z.array(terrainRiverSchema),
  terrainRoads: z.array(terrainRoadSchema),
  locations: z.array(mapLocationSchema),
  encounterZones: z.array(encounterZoneSchema),
  enemies: z.array(worldEnemySpawnSchema),
  warbandTemplates: z.array(warbandTemplateSchema).optional(),
  warbandSpawns: z.array(warbandSpawnSchema).optional(),
});

export const combatRulesSchema = z.object({
  summonsPerTurn: z.literal(3),
  rewards: z.object({
    baseGold: z.number().int().nonnegative(),
    goldPerThreat: z.number().int().nonnegative(),
    goldPerDefeatedUnit: z.number().int().nonnegative(),
    itemChanceMultiplier: z.number().nonnegative(),
    itemChanceBonus: z.number().min(0).max(1),
    minimumItemRolls: z.number().int().min(0).max(10),
    captureBaseChance: z.number().min(0).max(1),
    captureChancePerDefeatedUnit: z.number().min(0).max(1),
    captureChanceCap: z.number().min(0).max(1),
    captureTierPenalty: z.number().min(0).max(1),
    guaranteedCaptureAfterDefeatedUnits: z.number().int().min(1),
    maximumCaptures: z.number().int().min(1).max(5),
  }),
});

export const terrainBattlefieldSchema = z.object({
  image: z.string().min(1),
  focus: z.object({
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
  }).default({ x: 50, y: 50 }),
});

export const cardDefinitionSchema = z.object({
  id: z.string().min(1),
  nameKey: z.string().min(1),
  descriptionKey: z.string().min(1).optional(),
  portraitImage: z.string().min(1).optional(),
  cardImage: z.string().min(1).optional(),
  imageFocus: z
    .object({
      x: z.number().min(0).max(100),
      y: z.number().min(0).max(100),
    })
    .optional(),
  race: z.string().min(1),
  rarity: z.enum(["common", "uncommon", "rare", "epic", "legendary"]),
  tier: z.number().int().min(1).max(6),
  initiative: z.number().int().min(1).max(12),
  atk: z.number().nonnegative(),
  def: z.number().nonnegative(),
  maxHp: z.number().positive(),
  recruitCost: z.number().int().positive().optional(),
  battleEffect: z
    .enum([
      "heal_lowest_300",
      "burn_weakest_300",
      "shield_self_400",
      "rally_all_150",
      "human_guard_all_180",
      "orc_rage_self_250",
      "kobold_pack_100",
      "undead_drain_200",
      "beast_pack_120",
      "human_first_aid_180",
      "human_brace_160",
      "human_volley_120",
      "orc_bloodrage_180",
      "orc_overrun_160",
      "kobold_trap_140",
      "undead_reanimate_30",
      "machine_repair_180",
      "machine_armor_all_140",
      "elemental_frost_140",
      "elemental_chain_160",
      "beast_first_strike_140",
      "beast_hunt_160",
    ])
    .optional(),
});

export const unitUpgradeSchema = z.object({
  fromCardId: z.string().min(1),
  requiredLevel: z.number().int().positive().optional(),
  options: z.array(z.string().min(1)).min(1).max(3),
});

export const itemDefinitionSchema = z.object({
  id: z.string().min(1),
  nameKey: z.string().min(1),
  descriptionKey: z.string().min(1),
  itemImage: z.string().min(1).optional(),
  imageFocus: z
    .object({
      x: z.number().min(0).max(100),
      y: z.number().min(0).max(100),
    })
    .optional(),
  type: z.enum(["resource", "tradeGood", "consumable", "equipment"]),
  baseValue: z.number().int().positive(),
  weight: z.number().nonnegative(),
  foodUnits: z.number().int().positive().optional(),
  effect: z.enum(["heal_300"]).optional(),
  equipmentSlot: z.enum(["rightHand", "leftHand", "accessory"]).optional(),
  weaponType: z
    .enum(["club", "sword", "axe", "mace", "spear", "bow", "shield"])
    .optional(),
  statBonus: z
    .object({
      atk: z.number().int().nonnegative().optional(),
      def: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export const tradeRecipeSchema = z.object({
  id: z.string().min(1),
  inputItemId: z.string().min(1),
  inputQuantity: z.number().int().positive(),
  goldCost: z.number().int().nonnegative(),
  outputItemId: z.string().min(1),
  outputQuantity: z.number().int().positive(),
});

export const enemyArchetypeSchema = z.object({
  id: z.string().min(1),
  nameKey: z.string().min(1),
  leaderCardId: z.string().min(1).optional(),
  leaderLevel: z.number().int().positive().optional(),
  deck: z.array(z.string().min(1)).min(1),
  goldReward: z.number().int().nonnegative(),
  threat: z.number().int().min(1).max(5),
  dropTable: z.array(
    z.object({
      cardId: z.string().min(1),
      chance: z.number().min(0).max(1),
    }),
  ),
  itemDropTable: z.array(
    z.object({
      itemId: z.string().min(1),
      chance: z.number().min(0).max(1),
      minimum: z.number().int().positive(),
      maximum: z.number().int().positive(),
    }),
  ),
});

export const contentPackSchema = z.object({
  version: z.literal(1),
  combatRules: combatRulesSchema,
  terrainBattlefields: z.record(z.string(), terrainBattlefieldSchema).default({}),
  cards: z.array(cardDefinitionSchema),
  items: z.array(itemDefinitionSchema),
  tradeRecipes: z.array(tradeRecipeSchema),
  unitUpgrades: z.array(unitUpgradeSchema),
  enemies: z.array(enemyArchetypeSchema),
  nobles: z.array(nobleProfileSchema).default([]),
});

export type ContentPack = z.infer<typeof contentPackSchema>;
export type WorldMapDefinition = z.infer<typeof worldMapSchema>;
export type MapLocation = z.infer<typeof mapLocationSchema>;
export type CardDefinition = z.infer<typeof cardDefinitionSchema>;
export type ItemDefinition = z.infer<typeof itemDefinitionSchema>;
export type TradeRecipe = z.infer<typeof tradeRecipeSchema>;
export type EnemyArchetype = z.infer<typeof enemyArchetypeSchema>;
export type WorldEnemySpawn = z.infer<typeof worldEnemySpawnSchema>;
export type WarbandTemplate = z.infer<typeof warbandTemplateSchema>;
export type WarbandSpawn = z.infer<typeof warbandSpawnSchema>;
export type WarbandType = z.infer<typeof warbandTypeSchema>;
export type WarbandState = z.infer<typeof warbandStateSchema>;
export type NobleRank = z.infer<typeof nobleRankSchema>;
export type NobleProfile = z.infer<typeof nobleProfileSchema>;
export type TerrainZoneType = z.infer<typeof terrainZoneTypeSchema>;
export type TerrainZone = z.infer<typeof terrainZoneSchema>;
export type TerrainCell = z.infer<typeof terrainCellSchema>;
export type TerrainRiver = z.infer<typeof terrainRiverSchema>;
export type TerrainRoad = z.infer<typeof terrainRoadSchema>;
