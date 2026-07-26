import { describe, expect, it } from "vitest";
import { cardsById, contentPack } from "./content";
import { getCardEffects } from "../domain/battle/CardEffects";

describe("unit upgrade trees", () => {
  it("ships every card with one to three valid structured effects", () => {
    for (const card of contentPack.cards) {
      expect(getCardEffects(card).length, card.id).toBeGreaterThanOrEqual(1);
      expect(getCardEffects(card).length, card.id).toBeLessThanOrEqual(3);
      expect(card.battleEffect, card.id).toBeUndefined();
    }
  });
  it("offers an early-game tier 1 unit for every playable race", () => {
    for (const race of ["human", "orc", "kobold", "undead", "machine", "elemental", "beast"]) {
      expect(contentPack.cards.some((card) => card.race === race && card.tier === 1)).toBe(true);
    }
  });

  it("references existing source and target cards", () => {
    for (const upgrade of contentPack.unitUpgrades) {
      expect(cardsById.has(upgrade.fromCardId)).toBe(true);
      for (const option of upgrade.options) {
        expect(cardsById.has(option)).toBe(true);
      }
    }
  });

  it("gives every recruit and enemy unit an upgrade path or terminal tier", () => {
    const obtainableIds = new Set<string>();
    for (const card of contentPack.cards) {
      if (card.recruitCost) obtainableIds.add(card.id);
    }
    for (const enemy of contentPack.enemies) {
      enemy.deck.forEach((cardId) => obtainableIds.add(cardId));
      enemy.dropTable.forEach(({ cardId }) => obtainableIds.add(cardId));
    }

    const terminalIds = new Set([
      "kobold_koenig",
      "ork_kriegsherr",
      "lich",
      "knight",
      "shieldguard",
      "sniper",
      "banner_knight",
      "royal_arbalest",
      "crusader",
      "high_priest",
      "phoenix",
      "storm_elemental",
      "nightwing",
      "cave_troll",
      "wyvern",
      "golem",
      "siege_golem",
      "cannon_golem",
      "ash_warlord",
      "blood_chieftain",
      "necromancer",
      "death_paladin",
      "cave_geomancer",
      "banshee",
    ]);
    const upgradeSources = new Set(
      contentPack.unitUpgrades.map(({ fromCardId }) => fromCardId),
    );

    for (const cardId of obtainableIds) {
      expect(upgradeSources.has(cardId) || terminalIds.has(cardId)).toBe(true);
    }
  });

  it("keeps unit tiers aligned with upgrade paths", () => {
    for (const card of contentPack.cards) {
      expect(card.tier).toBeGreaterThanOrEqual(1);
      expect(card.tier).toBeLessThanOrEqual(6);
      expect(card.initiative).toBeGreaterThanOrEqual(1);
      expect(card.initiative).toBeLessThanOrEqual(12);
    }

    for (const upgrade of contentPack.unitUpgrades) {
      const source = cardsById.get(upgrade.fromCardId)!;
      for (const option of upgrade.options) {
        const target = cardsById.get(option)!;
        expect(target.tier).toBeGreaterThanOrEqual(source.tier + 1);
        expect(target.race).toBe(source.race);
      }
    }
  });

  it("makes every Tier 3+ upgrade visibly improve its effect package", () => {
    const signature = (effect: ReturnType<typeof getCardEffects>[number]) => [
      effect.trigger, effect.action, effect.target ?? "", effect.zone ?? "", effect.valueMode ?? "flat",
      effect.stat ?? "", effect.modifier ?? "", effect.duration ?? "", effect.condition ?? "",
    ].join(":");
    for (const upgrade of contentPack.unitUpgrades) {
      const source = cardsById.get(upgrade.fromCardId)!;
      for (const targetId of upgrade.options) {
        const target = cardsById.get(targetId)!;
        if (target.tier < 3) continue;
        const sourceEffects = getCardEffects(source);
        const targetEffects = getCardEffects(target);
        const visiblyImproved = targetEffects.length > sourceEffects.length || targetEffects.some((effect) => {
          const matching = sourceEffects.find((candidate) => signature(candidate) === signature(effect));
          return !matching || effect.value > matching.value;
        });
        expect(visiblyImproved, `${source.id} → ${target.id}`).toBe(true);
      }
    }
  });

  it("references valid items in recipes and enemy loot tables", () => {
    const itemIds = new Set(contentPack.items.map((item) => item.id));
    for (const recipe of contentPack.tradeRecipes) {
      expect(itemIds.has(recipe.inputItemId)).toBe(true);
      expect(itemIds.has(recipe.outputItemId)).toBe(true);
    }
    for (const enemy of contentPack.enemies) {
      for (const drop of enemy.itemDropTable) {
        expect(itemIds.has(drop.itemId)).toBe(true);
        expect(drop.maximum).toBeGreaterThanOrEqual(drop.minimum);
      }
    }
  });

  it("ships tiered, illustrated equipment with valid rarity-based drop chances", () => {
    const equipment = contentPack.items.filter((item) => item.type === "equipment");
    expect(equipment.length).toBeGreaterThanOrEqual(40);
    for (const item of equipment) {
      expect(item.tier, item.id).toBeGreaterThanOrEqual(1);
      expect(item.tier, item.id).toBeLessThanOrEqual(5);
      expect(item.rarity, item.id).toMatch(/^(common|uncommon|rare|epic|legendary)$/);
      expect(item.dropChance, item.id).toBeGreaterThan(0);
      expect(item.dropChance, item.id).toBeLessThanOrEqual(0.15);
      expect(item.itemImage, item.id).toMatch(/^\/assets\/items\//);
      expect((item.statBonus?.atk ?? 0) + (item.statBonus?.def ?? 0), item.id).toBeGreaterThan(0);
    }
  });

  it("uses standardized economic goods instead of legacy fantasy resources", () => {
    const itemIds = new Set(contentPack.items.map((item) => item.id));

    expect(
      ["wood", "iron", "copper", "wheat", "bread", "cattle", "leather"].every(
        (itemId) => itemIds.has(itemId),
      ),
    ).toBe(true);
    expect(itemIds.has("darkwood")).toBe(false);
    expect(itemIds.has("moon_herbs")).toBe(false);
  });

  it("provides one portrayed king and editable noble leaders for every faction", () => {
    for (const factionId of ["ember_crown", "gloam_compact", "iron_concord"] as const) {
      const nobles = contentPack.nobles.filter((noble) => noble.factionId === factionId);
      expect(nobles.filter((noble) => noble.rank === "king")).toHaveLength(1);
      expect(nobles.some((noble) => noble.rank === "baron")).toBe(true);
      expect(nobles.some((noble) => noble.rank === "count")).toBe(true);
      for (const noble of nobles) {
        expect(cardsById.get(noble.leaderCardId)?.portraitImage).toBeTruthy();
      }
    }
  });

  it("provides playable heroes with valid portraits and starting decks", () => {
    expect(contentPack.heroes.length).toBeGreaterThanOrEqual(3);
    for (const hero of contentPack.heroes) {
      expect(cardsById.get(hero.heroCardId)?.portraitImage).toBeTruthy();
      expect(hero.startingDeck.length).toBeGreaterThan(0);
      expect(hero.startingDeck.every((cardId) => cardsById.has(cardId))).toBe(true);
    }
  });
});
