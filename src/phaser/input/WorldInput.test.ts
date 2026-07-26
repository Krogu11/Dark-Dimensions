import { describe, expect, it } from "vitest";
import {
  consumeWorldZoom,
  getWorldTimeScale,
  requestWorldZoom,
} from "./WorldInput";

describe("world input", () => {
  it("accumulates and consumes map zoom requests", () => {
    requestWorldZoom(1);
    requestWorldZoom(-0.25);

    expect(consumeWorldZoom()).toBe(0.75);
    expect(consumeWorldZoom()).toBe(0);
  });

  it("uses Control for a four-times world-map fast forward", () => {
    expect(getWorldTimeScale(false)).toBe(1);
    expect(getWorldTimeScale(true)).toBe(4);
  });
});
