import { z } from "zod";

export const locationTypeSchema = z.enum([
  "city",
  "village",
  "castle",
  "dungeon",
  "landmark",
  "wilds",
]);

export const mapLocationSchema = z.object({
  id: z.string().min(1),
  type: locationTypeSchema,
  nameKey: z.string().min(1),
  descriptionKey: z.string().min(1),
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  radius: z.number().positive(),
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
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  aggroRadius: z.number().positive(),
  speed: z.number().positive(),
  partySize: z.number().int().positive(),
  inventoryWeight: z.number().nonnegative(),
  threat: z.number().int().min(1).max(5),
});

export const terrainZoneTypeSchema = z.enum([
  "forest",
  "swamp",
  "desert",
  "mountain",
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

export const worldMapSchema = z.object({
  id: z.string().min(1),
  width: z.number().positive(),
  height: z.number().positive(),
  boundaryInset: z.number().positive(),
  start: z.object({ x: z.number(), y: z.number() }),
  terrainZones: z.array(terrainZoneSchema),
  terrainRivers: z.array(terrainRiverSchema),
  locations: z.array(mapLocationSchema),
  encounterZones: z.array(encounterZoneSchema),
  enemies: z.array(worldEnemySpawnSchema),
});

export const combatRulesSchema = z.object({
  summonsPerTurn: z.literal(3),
});

export const cardDefinitionSchema = z.object({
  id: z.string().min(1),
  nameKey: z.string().min(1),
  race: z.string().min(1),
  rarity: z.enum(["common", "uncommon", "rare", "epic", "legendary"]),
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
    ])
    .optional(),
});

export const unitUpgradeSchema = z.object({
  fromCardId: z.string().min(1),
  requiredLevel: z.number().int().positive(),
  options: z.array(z.string().min(1)).min(1).max(3),
});

export const itemDefinitionSchema = z.object({
  id: z.string().min(1),
  nameKey: z.string().min(1),
  descriptionKey: z.string().min(1),
  type: z.enum(["resource", "tradeGood", "consumable", "equipment"]),
  baseValue: z.number().int().positive(),
  weight: z.number().nonnegative(),
  foodUnits: z.number().int().positive().optional(),
  effect: z.enum(["heal_300"]).optional(),
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
  cards: z.array(cardDefinitionSchema),
  items: z.array(itemDefinitionSchema),
  tradeRecipes: z.array(tradeRecipeSchema),
  unitUpgrades: z.array(unitUpgradeSchema),
  enemies: z.array(enemyArchetypeSchema),
});

export type ContentPack = z.infer<typeof contentPackSchema>;
export type WorldMapDefinition = z.infer<typeof worldMapSchema>;
export type MapLocation = z.infer<typeof mapLocationSchema>;
export type CardDefinition = z.infer<typeof cardDefinitionSchema>;
export type ItemDefinition = z.infer<typeof itemDefinitionSchema>;
export type TradeRecipe = z.infer<typeof tradeRecipeSchema>;
export type EnemyArchetype = z.infer<typeof enemyArchetypeSchema>;
export type WorldEnemySpawn = z.infer<typeof worldEnemySpawnSchema>;
export type TerrainZoneType = z.infer<typeof terrainZoneTypeSchema>;
export type TerrainZone = z.infer<typeof terrainZoneSchema>;
export type TerrainRiver = z.infer<typeof terrainRiverSchema>;
