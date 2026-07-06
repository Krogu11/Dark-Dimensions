import { describe, expect, it } from "vitest";
import {
  getTouchMovement,
  resetTouchMovement,
  setTouchMovement,
} from "./WorldInput";

describe("touch world input", () => {
  it("clamps and resets analog movement", () => {
    setTouchMovement(1.4, -0.65);

    expect(getTouchMovement()).toEqual({ x: 1, y: -0.65 });

    resetTouchMovement();
    expect(getTouchMovement()).toEqual({ x: 0, y: 0 });
  });
});
