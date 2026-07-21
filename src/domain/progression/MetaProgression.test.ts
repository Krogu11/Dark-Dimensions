import { describe, expect, it } from "vitest";
import { buyMetaUpgrade, createMetaProgression, isMetaUpgradeRevealed, META_UPGRADES, normalizeMetaProgression } from "./MetaProgression";

describe("MetaProgression encyclopedia migration", () => {
  it("adds empty discovery collections to legacy meta saves", () => {
    const migrated = normalizeMetaProgression({
      version: 1,
      souls: 12,
      upgrades: {},
      storyStage: 1,
    });

    expect(migrated.seenUnitIds).toEqual([]);
    expect(migrated.ownedUnitIds).toEqual([]);
    expect(migrated.souls).toBe(12);
  });

  it("deduplicates persistent discoveries", () => {
    const migrated = normalizeMetaProgression({
      version: 1,
      souls: 0,
      upgrades: {},
      storyStage: 0,
      seenUnitIds: ["village_levy", "village_levy"],
      ownedUnitIds: ["village_levy", "village_levy"],
    });

    expect(migrated.seenUnitIds).toEqual(["village_levy"]);
    expect(migrated.ownedUnitIds).toEqual(["village_levy"]);
  });

  it("reveals only roots and direct paths unlocked by their predecessor", () => {
    const state = createMetaProgression();
    state.souls = 100;
    const vitality = META_UPGRADES.find((upgrade) => upgrade.id === "soulVitality")!;
    const might = META_UPGRADES.find((upgrade) => upgrade.id === "soulMight")!;
    const reflex = META_UPGRADES.find((upgrade) => upgrade.id === "soulReflex")!;

    expect(isMetaUpgradeRevealed(state, vitality)).toBe(true);
    expect(isMetaUpgradeRevealed(state, might)).toBe(false);
    expect(isMetaUpgradeRevealed(state, reflex)).toBe(false);

    expect(buyMetaUpgrade(state, "soulVitality")).toBe(true);
    expect(isMetaUpgradeRevealed(state, might)).toBe(true);
    expect(isMetaUpgradeRevealed(state, reflex)).toBe(false);

    expect(buyMetaUpgrade(state, "soulMight")).toBe(true);
    expect(isMetaUpgradeRevealed(state, reflex)).toBe(true);
  });

  it("keeps previously purchased upgrades visible after graph migrations", () => {
    const state = createMetaProgression();
    state.upgrades.orc = 1;
    const orcPact = META_UPGRADES.find((upgrade) => upgrade.id === "orc")!;

    expect(isMetaUpgradeRevealed(state, orcPact)).toBe(true);
  });
});
