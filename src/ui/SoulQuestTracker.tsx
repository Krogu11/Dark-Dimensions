import { useTranslation } from "react-i18next";
import { gameSession } from "../domain/session/GameSession";
import { getCardDefinition } from "../domain/cards/CardInstance";
import { focusWorldCamera } from "../phaser/WorldCameraEvents";
import { shouldDispatchBountyHunters } from "../domain/quests/Factions";

export function SoulQuestTracker() {
  const { t } = useTranslation();
  const humanPrisoners = gameSession.prisoners.reduce((sum, stack) => sum + (getCardDefinition(stack.cardId).race === "human" ? stack.quantity : 0), 0);
  const step = gameSession.villagersAttackedThisRun === 0 ? 1 : humanPrisoners < 3 ? 2 : gameSession.world.nearbyLocation?.type !== "soulTemple" ? 3 : 4;
  const objectives = ["Attack a group of travelling villagers", `Capture three humans (${humanPrisoners}/3)`, "Bring three human prisoners to the Soul Temple", `Offer three human souls at the altar (${gameSession.humanSoulsOfferedThisRun}/3)`];
  const trackedQuests = gameSession.activeQuests.slice(0, 3);
  const bountyHunter = gameSession.world.state.warbands
    .filter((warband) =>
      warband.bountyHunter &&
      shouldDispatchBountyHunters(
        warband.factionId,
        gameSession.factionState,
      ))
    .sort((left, right) => {
      if ((left.state === "destroyed") !== (right.state === "destroyed")) {
        return left.state === "destroyed" ? 1 : -1;
      }
      const leftDistance = Math.hypot(left.x - gameSession.world.state.x, left.y - gameSession.world.state.y);
      const rightDistance = Math.hypot(right.x - gameSession.world.state.x, right.y - gameSession.world.state.y);
      return leftDistance - rightDistance;
    })[0];
  if (gameSession.soulQuestCompleted && trackedQuests.length === 0 && !bountyHunter) return null;
  return <aside className="quest-tracker-stack">
    {!gameSession.soulQuestCompleted ? <QuestTrackerCard kind="main" label="Main quest" title="The Soul God's Tithe" objective={objectives[step - 1]} progress={Math.min(95, (step - 1) * 25 + gameSession.humanSoulsOfferedThisRun * 8)} complete={false} /> : null}
    {trackedQuests.map((quest) => {
      const title = t(`quests.type.${quest.type}`);
      const objective = quest.type === "bounty" ? `${quest.progress} / ${quest.requiredCount}` : quest.status === "ready" ? "Return to claim your reward" : "Contract in progress";
      const progress = quest.type === "bounty" ? Math.min(100, quest.progress / Math.max(1, quest.requiredCount) * 100) : quest.status === "ready" ? 100 : 20;
      return <QuestTrackerCard key={quest.id} kind="contract" label={t(`faction.${quest.factionId}.name`)} title={title} objective={objective} progress={progress} complete={quest.status === "ready"} />;
    })}
    {bountyHunter ? <BountyHunterCard hunter={bountyHunter} /> : null}
  </aside>;
}

function QuestTrackerCard({ kind, label, title, objective, progress, complete }: { kind: "main" | "contract"; label: string; title: string; objective: string; progress: number; complete: boolean }) {
  return <article className={`soul-quest-tracker ${kind} ${complete ? "complete" : ""}`}><small>{label}</small><strong>{title}</strong><span>{objective}</span><i><b style={{ width: `${progress}%` }} /></i></article>;
}

function BountyHunterCard({ hunter }: { hunter: typeof gameSession.world.state.warbands[number] }) {
  const { t } = useTranslation();
  const destroyed = hunter.state === "destroyed";
  const distance = Math.round(Math.hypot(
    hunter.x - gameSession.world.state.x,
    hunter.y - gameSession.world.state.y,
  ));
  const returnHours = Math.ceil(hunter.respawnRemainingHours);
  return <article className="soul-quest-tracker hunter-threat">
    <small>Bounty hunters dispatched</small>
    <strong>{hunter.displayName ?? "Faction Hunters"}</strong>
    <span>{t(`faction.${hunter.factionId}.name`)} · {destroyed ? returnHours > 0 ? `Regrouping · ${returnHours}h` : "Awaiting deployment" : `${distance}m away`}</span>
    {!destroyed ? <button type="button" onClick={() => focusWorldCamera(hunter.x, hunter.y)}>Locate hunters</button> : null}
  </article>;
}
