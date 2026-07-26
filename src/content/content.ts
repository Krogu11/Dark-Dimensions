import rawContentPack from "./content-pack.json";
import { contentPackSchema } from "../domain/content/schemas";
import { normalizeLegacyCardEffects } from "../domain/battle/CardEffects";

export const contentPack = contentPackSchema.parse(normalizeLegacyCardEffects(rawContentPack));
export const cardsById = new Map(
  contentPack.cards.map((card) => [card.id, card]),
);
export const enemiesById = new Map(
  contentPack.enemies.map((enemy) => [enemy.id, enemy]),
);
export const recruitableCards = contentPack.cards.filter(
  (card) => card.recruitCost !== undefined,
);
export const upgradesByCardId = new Map(
  contentPack.unitUpgrades.map((upgrade) => [upgrade.fromCardId, upgrade]),
);
export const itemsById = new Map(
  contentPack.items.map((item) => [item.id, item]),
);
export const abilitiesById = new Map(
  contentPack.abilities.map((ability) => [ability.id, ability]),
);
export const tradeRecipesById = new Map(
  contentPack.tradeRecipes.map((recipe) => [recipe.id, recipe]),
);
export const heroesById = new Map(
  contentPack.heroes.map((hero) => [hero.id, hero]),
);
