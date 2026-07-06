import Phaser from "phaser";
import { WorldScene } from "./scenes/WorldScene";

export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#111613",
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: "100%",
      height: "100%",
    },
    render: {
      antialias: true,
      pixelArt: false,
    },
    scene: [WorldScene],
  });
}
