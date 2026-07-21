import { useState } from "react";
import { gameSession } from "../domain/session/GameSession";

const LINES = [
  { speaker: "The Wanderer", side: "player", text: "Where am I? This is not the sky I remember." },
  { speaker: "The God of Souls", side: "god", text: "No. Your world lies beyond a veil you cannot cross alone. I pulled your soul through the fracture before death could claim it." },
  { speaker: "The Wanderer", side: "player", text: "You stole me from my home. Why?" },
  { speaker: "The God of Souls", side: "god", text: "Because this realm is bleeding souls. Armies die, dimensions break, and what should pass onward is lost between worlds. You will gather what escapes me." },
  { speaker: "The Wanderer", side: "player", text: "And if I refuse?" },
  { speaker: "The God of Souls", side: "god", text: "Then you will die here as mortals do—forgotten. Serve me, and every bound soul will follow you into the next realm. Each death will make you stronger." },
  { speaker: "The God of Souls", side: "god", text: "Five levies wait beyond the temple. Find travelling villagers, attack them, and bring three humans alive to my altar. Let them be your first tithe." },
] as const;

export function SoulCallingTutorial({ onComplete }: { onComplete: () => void }) {
  const [line, setLine] = useState(0); const entry = LINES[line];
  const speaker = entry.side === "player" ? gameSession.runProfile?.name || entry.speaker : entry.speaker;
  return <div className="soul-story-overlay"><section className={`soul-story-dialog ${entry.side}`}><div className="story-portrait"><span>{entry.side === "god" ? "♢" : speaker.slice(0,1).toUpperCase()}</span><small>{entry.side === "god" ? "The one beyond the veil" : "The summoned wanderer"}</small></div><div className="story-copy"><small>{speaker}</small><p>“{entry.text}”</p><footer><span>{line + 1} / {LINES.length}</span><button onClick={() => line === LINES.length - 1 ? onComplete() : setLine(line + 1)}>{line === LINES.length - 1 ? "Accept the quest" : "Continue"} →</button></footer></div></section></div>;
}

export function SoulQuestCompletion({ onClose }: { onClose: () => void }) {
  return <div className="soul-story-overlay"><section className="soul-story-dialog god completion"><div className="story-portrait"><span>♢</span><small>The one beyond the veil</small></div><div className="story-copy"><small>The God of Souls</small><p>“Three human souls, torn from the road and bound to my altar. You have paid your first tithe. Carry this reward, Wanderer—then bring me legions.”</p><div className="quest-reward"><span>Quest complete</span><strong>The Soul God's Tithe</strong><b>Reward: 100 gold</b></div><footer><span>A greater tithe awaits</span><button onClick={onClose}>Continue →</button></footer></div></section></div>;
}
