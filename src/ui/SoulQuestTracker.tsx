import { useTranslation } from "react-i18next";
import { gameSession } from "../domain/session/GameSession";
import { getCardDefinition } from "../domain/cards/CardInstance";

export function SoulQuestTracker() {
  const { t } = useTranslation();
  const humanPrisoners = gameSession.prisoners.reduce((sum, stack) => sum + (getCardDefinition(stack.cardId).race === "human" ? stack.quantity : 0), 0);
  const step = gameSession.villagersAttackedThisRun === 0 ? 1 : humanPrisoners < 3 ? 2 : gameSession.world.nearbyLocation?.type !== "soulTemple" ? 3 : 4;
  const objectives = ["Attack a group of travelling villagers", `Capture three humans (${humanPrisoners}/3)`, "Bring three human prisoners to the Soul Temple", `Offer three human souls at the altar (${gameSession.humanSoulsOfferedThisRun}/3)`];
  const trackedQuests = gameSession.activeQuests.slice(0, 3);
  if (gameSession.soulQuestCompleted && trackedQuests.length === 0) return null;
  return <aside className="quest-tracker-stack">
    {!gameSession.soulQuestCompleted ? <QuestTrackerCard kind="main" label="Main quest" title="The Soul God's Tithe" objective={objectives[step - 1]} progress={Math.min(95, (step - 1) * 25 + gameSession.humanSoulsOfferedThisRun * 8)} complete={false} /> : null}
    {trackedQuests.map((quest) => {
      const title = t(`quests.type.${quest.type}`);
      const objective = quest.type === "bounty" ? `${quest.progress} / ${quest.requiredCount}` : quest.status === "ready" ? "Return to claim your reward" : "Contract in progress";
      const progress = quest.type === "bounty" ? Math.min(100, quest.progress / Math.max(1, quest.requiredCount) * 100) : quest.status === "ready" ? 100 : 20;
      return <QuestTrackerCard key={quest.id} kind="contract" label={t(`faction.${quest.factionId}.name`)} title={title} objective={objective} progress={progress} complete={quest.status === "ready"} />;
    })}
  </aside>;
}

function QuestTrackerCard({ kind, label, title, objective, progress, complete }: { kind: "main" | "contract"; label: string; title: string; objective: string; progress: number; complete: boolean }) {
  return <article className={`soul-quest-tracker ${kind} ${complete ? "complete" : ""}`}><small>{label}</small><strong>{title}</strong><span>{objective}</span><i><b style={{ width: `${progress}%` }} /></i></article>;
}
