import { useEffect, useRef } from "react";
import type Phaser from "phaser";
import { createGame } from "../phaser/createGame";

export function GameCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!hostRef.current || gameRef.current) return;
    gameRef.current = createGame(hostRef.current);

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return <div className="game-canvas" ref={hostRef} />;
}
