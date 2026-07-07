import { describe, expect, it } from "vitest";
import {
  consumeWorldZoom,
  requestWorldZoom,
} from "./WorldInput";

describe("world input", () => {
  it("accumulates and consumes map zoom requests", () => {
    requestWorldZoom(1);
    requestWorldZoom(-0.25);

    expect(consumeWorldZoom()).toBe(0.75);
    expect(consumeWorldZoom()).toBe(0);
  });
});
