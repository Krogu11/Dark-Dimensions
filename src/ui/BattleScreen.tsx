import { useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  BattleReward,
  BattleSimulation,
} from "../domain/battle/BattleSimulation";
import {
  getCardDefinition,
  type CardInstance,
} from "../domain/cards/CardInstance";

interface BattleScreenProps {
  battle: BattleSimulation;
  onVictory: () => BattleReward | null;
  onDefeat: () => void;
  encounterLabel?: string;
  victoryPrimaryLabel?: string;
  victorySecondaryLabel?: string;
  onVictorySecondary?: () => BattleReward | null;
}

export function BattleScreen({
  battle,
  onVictory,
  onDefeat,
  encounterLabel,
  victoryPrimaryLabel,
  victorySecondaryLabel,
  onVictorySecondary,
}: BattleScreenProps) {
  const { t } = useTranslation();
  const [selectedHand, setSelectedHand] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [, refresh] = useState(0);

  function clearSelection(): void {
    setSelectedHand(null);
    setSelectedField(null);
  }

  function toggleHand(uid: string): void {
    setSelectedField(null);
    setSelectedHand((current) => (current === uid ? null : uid));
  }

  function toggleField(uid: string): void {
    setSelectedHand(null);
    setSelectedField((current) => (current === uid ? null : uid));
  }

  function summonOrRecall(): void {
    const succeeded = selectedHand
      ? battle.summon(selectedHand)
      : selectedField
        ? battle.recall(selectedField)
        : false;
    if (succeeded) clearSelection();
    refresh((value) => value + 1);
  }

  function resolveRound(): void {
    battle.resolveRound();
    clearSelection();
    refresh((value) => value + 1);
  }

  if (battle.outcome !== "active") {
    return (
      <div className="battle-overlay">
        <section className={`battle-result ${battle.outcome}`}>
          <p className="eyebrow">{t("battle.title")}</p>
          <h1>{t(`battle.${battle.outcome}`)}</h1>
          <p>{t(`battle.${battle.outcome}Text`)}</p>
          {encounterLabel ? <span className="encounter-label">{encounterLabel}</span> : null}
          {battle.outcome === "victory" && onVictorySecondary ? (
            <button className="button ghost" onClick={onVictorySecondary}>
              {victorySecondaryLabel}
            </button>
          ) : null}
          <button
            className="button primary"
            onClick={battle.outcome === "victory" ? onVictory : onDefeat}
          >
            {battle.outcome === "victory"
              ? victoryPrimaryLabel ?? t("battle.continue")
              : t("battle.retreat")}
          </button>
        </section>
      </div>
    );
  }

  const selectedFieldCard = battle.playerField.find(
    (card) => card.uid === selectedField,
  );
  const canRecall = Boolean(selectedFieldCard && !selectedFieldCard.isHero);
  const canSummonAction = Boolean(selectedHand || canRecall);

  return (
    <div className="battle-overlay">
      <main className="battle-board tactical">
        <header className="battle-header">
          <div>
            <p className="eyebrow">{t("battle.title")}</p>
            <h1>{t(battle.enemy.nameKey)}</h1>
            {encounterLabel ? <span className="encounter-label">{encounterLabel}</span> : null}
          </div>
          <div className="battle-turn">
            <strong>{t("battle.turn", { turn: battle.turn })}</strong>
            <span>{t("battle.summons", { count: battle.summonsRemaining })}</span>
            <span>{t("battle.threat", { level: battle.enemy.threat })}</span>
          </div>
        </header>

        <BattleRow
          battle={battle}
          cards={battle.enemyField}
          label={t("battle.enemyField")}
          side="enemy"
        />

        <div className="battle-divider">
          <span>{t("battle.autoInstructions")}</span>
        </div>

        <BattleRow
          battle={battle}
          cards={battle.playerField}
          label={t("battle.yourField")}
          side="player"
          selectedUid={selectedField}
          onSelect={toggleField}
        />

        <BattleRow
          battle={battle}
          cards={battle.hand}
          label={t("battle.hand")}
          side="hand"
          selectedUid={selectedHand}
          onSelect={toggleHand}
        />

        <footer className="battle-actions">
          <span className="battle-message">
            {battle.message ? t(`battle.${battle.message}`) : null}
          </span>
          <button
            className="button ghost"
            disabled={!canSummonAction || battle.summonsRemaining === 0}
            onClick={summonOrRecall}
          >
            {t(selectedHand ? "battle.summon" : "battle.recall")}
          </button>
          <button className="button primary" onClick={resolveRound}>
            {t("battle.resolveRound")}
          </button>
        </footer>
      </main>
    </div>
  );
}

interface BattleRowProps {
  battle: BattleSimulation;
  cards: CardInstance[];
  label: string;
  side: "enemy" | "player" | "hand";
  selectedUid?: string | null;
  onSelect?: (uid: string) => void;
}

function BattleRow({
  battle,
  cards,
  label,
  side,
  selectedUid,
  onSelect,
}: BattleRowProps) {
  return (
    <section className={`battle-row ${side}`}>
      <h2>{label}</h2>
      <div className="battle-cards">
        {cards.map((card) => (
          <BattleCard
            key={card.uid}
            battle={battle}
            card={card}
            selected={selectedUid === card.uid}
            onSelect={onSelect}
          />
        ))}
        {cards.length === 0 ? <span className="empty-slot">—</span> : null}
      </div>
    </section>
  );
}

function BattleCard({
  battle,
  card,
  selected,
  onSelect,
}: {
  battle: BattleSimulation;
  card: CardInstance;
  selected?: boolean;
  onSelect?: (uid: string) => void;
}) {
  const { t } = useTranslation();
  const definition = getCardDefinition(card.cardId);
  const healthPercent = Math.max(0, (card.currentHp / definition.maxHp) * 100);
  const shield = battle.getShield(card.uid);

  return (
    <button
      className={`battle-card ${card.isHero ? "hero" : ""} ${selected ? "selected" : ""}`}
      disabled={!onSelect}
      onClick={() => onSelect?.(card.uid)}
    >
      <span className="card-rarity">{definition.rarity}</span>
      <strong>{t(definition.nameKey)}</strong>
      <span className="card-race">{definition.race}</span>
      <span className="card-level">LV {card.level}</span>
      <span className="card-stats">
        <b>ATK {battle.getAttack(card)}</b>
        <b>DEF {battle.getDefense(card)}</b>
      </span>
      <span className="hp-track">
        <span style={{ width: `${healthPercent}%` }} />
      </span>
      <span className="card-hp">
        {t("battle.hp")} {card.currentHp}/{definition.maxHp}
        {shield > 0 ? ` · SH ${shield}` : ""}
      </span>
    </button>
  );
}
