import { describe, expect, it } from "vitest";
import {
  createGameTimeState,
  formatGameTime,
  getGameDay,
  isNightTime,
} from "./GameClock";

describe("game clock", () => {
  it("starts on day one at eight in the morning", () => {
    const time = createGameTimeState();

    expect(getGameDay(time)).toBe(1);
    expect(formatGameTime(time)).toBe("08:00");
    expect(isNightTime(time)).toBe(false);
  });

  it("rolls into later days and recognizes night", () => {
    const time = { totalMinutes: 1440 + 22 * 60 + 7 };

    expect(getGameDay(time)).toBe(2);
    expect(formatGameTime(time)).toBe("22:07");
    expect(isNightTime(time)).toBe(true);
  });
});
