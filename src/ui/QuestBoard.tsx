import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { enemiesById, itemsById } from "../content/content";
import { gameSession } from "../domain/session/GameSession";
import type { QuestState } from "../domain/quests/Factions";

interface QuestBoardProps {
  onClose: () => void;
  returnToCity?: boolean;
}

export default function QuestBoard({
  onClose,
  returnToCity = false,
}: QuestBoardProps) {
  const { t } = useTranslation();
  const [message, setMessage] = useState<string | null>(null);

  function accept(questId: string): void {
    setMessage(
      t(gameSession.acceptQuest(questId) ? "quests.accepted" : "quests.unavailable"),
    );
  }

  function claim(questId: string): void {
    setMessage(
      t(gameSession.claimQuest(questId) ? "quests.claimed" : "quests.notReady"),
    );
  }

  return (
    <div className="quest-overlay">
      <main className="quest-ledger">
        <header className="quest-header">
          <div>
            <p className="eyebrow">{t("quests.eyebrow")}</p>
            <h1>{t("quests.title")}</h1>
          </div>
          <button className="button ghost" onClick={onClose}>
            {t(returnToCity ? "trade.returnToCity" : "quests.close")}
          </button>
        </header>

        <section className="faction-reputation">
          {Object.entries(gameSession.factionState.reputation).map(
            ([factionId, reputation]) => (
              <article key={factionId}>
                <span className={`faction-seal ${factionId}`} />
                <strong>{t(`faction.${factionId}.name`)}</strong>
                <em>{t("quests.reputation", { value: reputation })}</em>
              </article>
            ),
          )}
        </section>

        <div className="quest-columns">
          <section className="quest-panel">
            <h2>{t("quests.localBoard")}</h2>
            {gameSession.localAvailableQuests.map((quest) => (
              <QuestCard
                key={quest.id}
                quest={quest}
                action={
                  <button className="button primary compact" onClick={() => accept(quest.id)}>
                    {t("quests.accept")}
                  </button>
                }
              />
            ))}
            {gameSession.localAvailableQuests.length === 0 ? (
              <p className="ledger-empty">{t("quests.noLocalQuests")}</p>
            ) : null}
          </section>

          <section className="quest-panel">
            <h2>{t("quests.active")}</h2>
            {gameSession.activeQuests.map((quest) => (
              <QuestCard
                key={quest.id}
                quest={quest}
                action={
                  <button
                    className="button primary compact"
                    onClick={() => claim(quest.id)}
                  >
                    {t(quest.status === "ready" ? "quests.claim" : "quests.inProgress")}
                  </button>
                }
              />
            ))}
            {gameSession.activeQuests.length === 0 ? (
              <p className="ledger-empty">{t("quests.noActiveQuests")}</p>
            ) : null}
          </section>
        </div>
        {message ? <div className="trade-message">{message}</div> : null}
      </main>
    </div>
  );
}

function QuestCard({
  quest,
  action,
}: {
  quest: QuestState;
    action: ReactNode;
}) {
  const { t } = useTranslation();
  const target = gameSession.world.map.locations.find(
    (location) => location.id === quest.targetLocationId,
  );
  const enemy = quest.enemyId ? enemiesById.get(quest.enemyId) : null;
  const item = quest.itemId ? itemsById.get(quest.itemId) : null;
  const description =
    quest.type === "delivery"
      ? t("quests.deliveryDescription", {
          quantity: quest.requiredQuantity,
          item: item ? t(item.nameKey) : "",
          target: target ? t(target.nameKey) : "",
        })
      : quest.type === "bounty"
        ? t("quests.bountyDescription", {
            count: quest.requiredCount,
            enemy: enemy ? t(enemy.nameKey) : "",
            progress: quest.progress,
          })
        : t("quests.escortDescription", {
            target: target ? t(target.nameKey) : "",
          });

  return (
    <article className={`quest-card ${quest.status}`}>
      <div className="quest-card-heading">
        <span className={`faction-seal ${quest.factionId}`} />
        <div>
          <small>{t(`quests.type.${quest.type}`)}</small>
          <strong>{t(`faction.${quest.factionId}.name`)}</strong>
        </div>
      </div>
      <p>{description}</p>
      <footer>
        <span>
          {t("quests.rewards", {
            gold: quest.rewardGold,
            reputation: quest.rewardReputation,
          })}
        </span>
        {action}
      </footer>
    </article>
  );
}
