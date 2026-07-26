import { describe, expect, it } from "vitest";
import {
  musicTitleFromPath,
  shuffleMusicTracks,
  type MusicTrack,
} from "./MusicPlaylist";

const tracks: MusicTrack[] = ["a", "b", "c"].map((path) => ({
  path,
  title: path.toUpperCase(),
  url: `/${path}.mp3`,
}));

describe("music playlist", () => {
  it("derives readable titles from filenames", () => {
    expect(musicTitleFromPath("/music/Banner_and-Dust.mp3")).toBe(
      "Banner and Dust",
    );
  });

  it("shuffles every track exactly once", () => {
    const randomValues = [0.1, 0.8];
    let randomIndex = 0;
    const shuffled = shuffleMusicTracks(
      tracks,
      null,
      () => randomValues[randomIndex++] ?? 0,
    );

    expect(shuffled.map((track) => track.path).sort()).toEqual(["a", "b", "c"]);
    expect(new Set(shuffled.map((track) => track.path))).toHaveLength(3);
  });

  it("does not repeat the previous track at the start of a new cycle", () => {
    const shuffled = shuffleMusicTracks(tracks, "c", () => 0.99);

    expect(shuffled[0].path).not.toBe("c");
  });
});
