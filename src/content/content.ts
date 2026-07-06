import rawContentPack from "./content-pack.json";
import { contentPackSchema } from "../domain/content/schemas";

export const contentPack = contentPackSchema.parse(rawContentPack);
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
export const tradeRecipesById = new Map(
  contentPack.tradeRecipes.map((recipe) => [recipe.id, recipe]),
);
