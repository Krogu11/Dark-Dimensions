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
  const [selectedQuestId, setSelectedQuestId] = useState<string | null>(null);
  const selectedQuest =
    gameSession.localAvailableQuests.find((quest) => quest.id === selectedQuestId) ??
    null;

  function accept(questId: string): void {
    const accepted = gameSession.acceptQuest(questId);
    setMessage(t(accepted ? "quests.accepted" : "quests.unavailable"));
    if (accepted) setSelectedQuestId(null);
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
                  <button
                    className="button primary compact"
                    onClick={() => setSelectedQuestId(quest.id)}
                  >
                    {t("quests.talk")}
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
        {selectedQuest ? (
          <QuestDialog
            quest={selectedQuest}
            onAccept={() => accept(selectedQuest.id)}
            onClose={() => setSelectedQuestId(null)}
          />
        ) : null}
        {message ? <div className="trade-message">{message}</div> : null}
      </main>
    </div>
  );
}

function QuestDialog({
  quest,
  onAccept,
  onClose,
}: {
  quest: QuestState;
  onAccept: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const issuer = gameSession.world.map.locations.find(
    (location) => location.id === quest.issuerLocationId,
  );
  const target = gameSession.world.map.locations.find(
    (location) => location.id === quest.targetLocationId,
  );
  const enemy = quest.enemyId ? enemiesById.get(quest.enemyId) : null;
  const item = quest.itemId ? itemsById.get(quest.itemId) : null;

  return (
    <section className="quest-dialog">
      <div>
        <p className="eyebrow">
          {t("quests.dialogMayor", {
            location: issuer ? t(issuer.nameKey) : "",
          })}
        </p>
        <h2>{t(`quests.type.${quest.type}`)}</h2>
        <p className="quest-dialog-text">
          {t(`quests.dialog.${quest.type}`, {
            quantity: quest.requiredQuantity,
            item: item ? t(item.nameKey) : "",
            target: target ? t(target.nameKey) : "",
            enemy: enemy ? t(enemy.nameKey) : "",
            count: quest.requiredCount,
          })}
        </p>
        <p className="quest-dialog-reward">
          {t("quests.rewards", {
            gold: quest.rewardGold,
            reputation: quest.rewardReputation,
          })}
        </p>
      </div>
      <footer>
        <button className="button ghost compact" onClick={onClose}>
          {t("quests.decline")}
        </button>
        <button className="button primary compact" onClick={onAccept}>
          {t("quests.acceptContract")}
        </button>
      </footer>
    </section>
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
