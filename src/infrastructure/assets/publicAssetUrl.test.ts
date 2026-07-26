import { describe, expect, it } from "vitest";
import { publicAssetUrl, resolvePublicAssetUrls } from "./publicAssetUrl";

describe("public asset URLs", () => {
  it("uses the configured Vite base for public assets", () => {
    expect(publicAssetUrl("/assets/world/tree.svg")).toBe(
      `${import.meta.env.BASE_URL}assets/world/tree.svg`,
    );
  });

  it("leaves external and non-asset paths unchanged", () => {
    expect(publicAssetUrl("https://example.com/image.webp")).toBe(
      "https://example.com/image.webp",
    );
    expect(publicAssetUrl("cards.hero.name")).toBe("cards.hero.name");
  });

  it("resolves nested content-pack asset fields", () => {
    expect(resolvePublicAssetUrls({
      card: { portraitImage: "/assets/cards/hero/portrait.webp" },
      nameKey: "cards.hero.name",
    })).toEqual({
      card: {
        portraitImage: `${import.meta.env.BASE_URL}assets/cards/hero/portrait.webp`,
      },
      nameKey: "cards.hero.name",
    });
  });
});
