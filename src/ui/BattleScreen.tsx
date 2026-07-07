import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  BattleAnimationEvent,
  BattleReward,
  BattleSimulation,
} from "../domain/battle/BattleSimulation";
import { itemsById, upgradesByCardId } from "../content/content";
import {
  getCardDefinition,
  xpNeededForNextLevel,
  type CardInstance,
} from "../domain/cards/CardInstance";
import type { InventoryStack } from "../domain/economy/Economy";
import { gameSession, type VictoryClaimSelection } from "../domain/session/GameSession";

interface BattleScreenProps {
  battle: BattleSimulation;
  onPrepareVictory: () => BattleReward | null;
  onClaimVictory: (selection: VictoryClaimSelection) => BattleReward | null;
  onDefeat: () => void;
  encounterLabel?: string;
  victoryPrimaryLabel?: string;
  victorySecondaryLabel?: string;
}

interface BattleVisualSnapshot {
  enemyField: CardInstance[];
  playerField: CardInstance[];
  hand: CardInstance[];
  hpByUid: Map<string, number>;
  shieldByUid: Map<string, number>;
}

export function BattleScreen({
  battle,
  onPrepareVictory,
  onClaimVictory,
  onDefeat,
  encounterLabel,
  victoryPrimaryLabel,
  victorySecondaryLabel,
}: BattleScreenProps) {
  const { t } = useTranslation();
  const [selectedHand, setSelectedHand] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [renderVersion, refresh] = useState(0);
  const [animationIndex, setAnimationIndex] = useState(-1);
  const [visualSnapshot, setVisualSnapshot] =
    useState<BattleVisualSnapshot | null>(null);
  const [victoryStep, setVictoryStep] = useState<"summary" | "units" | "loot">("summary");
  const [pendingReward, setPendingReward] = useState<BattleReward | null>(null);
  const [takeCapturedCard, setTakeCapturedCard] = useState(false);
  const [releasedUnitIds, setReleasedUnitIds] = useState<string[]>([]);

  useEffect(() => {
    if (battle.animationEvents.length === 0) {
      setAnimationIndex(-1);
      setVisualSnapshot(null);
      return;
    }

    let cancelled = false;
    setAnimationIndex(0);
    const timers = battle.animationEvents.map((_, index) =>
      window.setTimeout(() => {
        if (cancelled) return;
        setAnimationIndex(
          index + 1 < battle.animationEvents.length ? index + 1 : -1,
        );
        if (index + 1 >= battle.animationEvents.length) {
          setVisualSnapshot(null);
        }
      }, 520 * (index + 1)),
    );

    return () => {
      cancelled = true;
      timers.forEach(window.clearTimeout);
    };
  }, [battle, renderVersion]);

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
    const snapshot = selectedField ? createBattleVisualSnapshot(battle) : null;
    const succeeded = selectedHand
      ? battle.summon(selectedHand)
      : selectedField
        ? battle.recall(selectedField)
        : false;
    if (succeeded) {
      clearSelection();
      setVisualSnapshot(snapshot);
      if (battle.animationEvents.length > 0) setAnimationIndex(0);
    } else {
      setVisualSnapshot(null);
      setAnimationIndex(-1);
    }
    refresh((value) => value + 1);
  }

  function resolveRound(): void {
    const snapshot = createBattleVisualSnapshot(battle);
    battle.resolveRound();
    clearSelection();
    setVisualSnapshot(battle.animationEvents.length > 0 ? snapshot : null);
    if (battle.animationEvents.length > 0) setAnimationIndex(0);
    refresh((value) => value + 1);
  }

  const activeEvent =
    animationIndex >= 0 ? battle.animationEvents[animationIndex] : null;
  const isAnimating = activeEvent !== null;

  if (battle.outcome === "victory" && !isAnimating && !visualSnapshot) {
    if (victoryStep === "units" && pendingReward) {
      return (
        <VictoryUnitsScreen
          reward={pendingReward}
          takeCapturedCard={takeCapturedCard}
          releasedUnitIds={releasedUnitIds}
          onTakeCapturedCard={() => setTakeCapturedCard(true)}
          onReturnCapturedCard={() => setTakeCapturedCard(false)}
          onReleaseUnit={(uid) =>
            setReleasedUnitIds((current) =>
              current.includes(uid) ? current : [...current, uid],
            )
          }
          onRestoreUnit={(uid) =>
            setReleasedUnitIds((current) =>
              current.filter((candidate) => candidate !== uid),
            )
          }
          onContinue={() => {
            for (const uid of releasedUnitIds) gameSession.dismissUnit(uid);
            setReleasedUnitIds([]);
            setVictoryStep("loot");
          }}
        />
      );
    }

    if (victoryStep === "loot" && pendingReward) {
      return (
        <VictoryLootScreen
          reward={pendingReward}
          takeCapturedCard={takeCapturedCard}
          continueLabel={victoryPrimaryLabel ?? t("battle.continue")}
          retreatLabel={victorySecondaryLabel}
          canContinueDungeon={Boolean(victorySecondaryLabel)}
          onClaim={onClaimVictory}
        />
      );
    }

    return (
      <BattleAftermathSummary
        battle={battle}
        encounterLabel={encounterLabel}
        onContinue={() => {
          const reward = onPrepareVictory();
          if (reward) {
            setPendingReward(reward);
            setTakeCapturedCard(false);
            setVictoryStep("units");
          }
        }}
      />
    );
  }

  if (battle.outcome === "defeat" && !isAnimating && !visualSnapshot) {
    return (
      <div className="battle-overlay">
        <section className={`battle-result ${battle.outcome}`}>
          <p className="eyebrow">{t("battle.title")}</p>
          <h1>{t(`battle.${battle.outcome}`)}</h1>
          <p>{t(`battle.${battle.outcome}Text`)}</p>
          {encounterLabel ? <span className="encounter-label">{encounterLabel}</span> : null}
          <button
            className="button primary"
            onClick={onDefeat}
          >
            {t("battle.retreat")}
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
  const resolvedDestroyedUids = getResolvedDestroyedUids(
    battle.animationEvents,
    animationIndex,
  );
  const enemyField = filterVisibleCards(
    visualSnapshot?.enemyField ?? battle.enemyField,
    resolvedDestroyedUids,
  );
  const playerField = filterVisibleCards(
    visualSnapshot?.playerField ?? battle.playerField,
    resolvedDestroyedUids,
  );
  const hand = filterVisibleCards(
    visualSnapshot?.hand ?? battle.hand,
    resolvedDestroyedUids,
  );

  return (
    <div className="battle-overlay">
      <main className="battle-board tactical">
        <header className="battle-header">
          <div>
            <p className="eyebrow">{t("battle.title")}</p>
            <h1>{t(battle.enemy.nameKey)}</h1>
            {encounterLabel ? <span className="encounter-label">{encounterLabel}</span> : null}
            <span className={`terrain-battle-tag ${battle.terrainModifiers.terrain}`}>
              {t(`terrain.${battle.terrainModifiers.terrain}.name`)} ·{" "}
              {t(`terrain.${battle.terrainModifiers.terrain}.battle`)}
            </span>
          </div>
          <div className="battle-turn">
            <strong>{t("battle.turn", { turn: battle.turn })}</strong>
            <span>{t("battle.summons", { count: battle.summonsRemaining })}</span>
            <span>{t("battle.threat", { level: battle.enemy.threat })}</span>
          </div>
        </header>

        <BattleRow
          battle={battle}
          cards={enemyField}
          label={t("battle.enemyField")}
          side="enemy"
          activeEvent={activeEvent}
          visualSnapshot={visualSnapshot}
        />

        <div className="battle-divider">
          {activeEvent ? <span>{getBattleEventText(activeEvent, t)}</span> : null}
        </div>

        <BattleRow
          battle={battle}
          cards={playerField}
          label={t("battle.yourField")}
          side="player"
          selectedUid={selectedField}
          onSelect={toggleField}
          activeEvent={activeEvent}
          visualSnapshot={visualSnapshot}
        />

        <BattleRow
          battle={battle}
          cards={hand}
          label={t("battle.hand")}
          side="hand"
          selectedUid={selectedHand}
          onSelect={toggleHand}
          activeEvent={activeEvent}
          visualSnapshot={visualSnapshot}
        />

        <footer className="battle-actions">
          <span className="battle-message">
            {battle.message ? t(`battle.${battle.message}`) : null}
          </span>
          <button
            className="button ghost"
            disabled={
              isAnimating || !canSummonAction || battle.summonsRemaining === 0
            }
            onClick={summonOrRecall}
          >
            {t(selectedHand ? "battle.summon" : "battle.recall")}
          </button>
          <button
            className="button primary"
            disabled={isAnimating}
            onClick={resolveRound}
          >
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
  activeEvent: BattleAnimationEvent | null;
  visualSnapshot: BattleVisualSnapshot | null;
}

function BattleAftermathSummary({
  battle,
  encounterLabel,
  onContinue,
}: {
  battle: BattleSimulation;
  encounterLabel?: string;
  onContinue: () => void;
}) {
  const { t } = useTranslation();
  const playerUnits = [battle.hero, ...battle.playerDeck];
  return (
    <div className="battle-overlay">
      <main className="aftermath-board">
        <header className="battle-header">
          <div>
            <p className="eyebrow">{t("battle.aftermathEyebrow")}</p>
            <h1>{t("battle.victory")}</h1>
            {encounterLabel ? <span className="encounter-label">{encounterLabel}</span> : null}
          </div>
          <button className="button primary" onClick={onContinue}>
            {t("battle.collectRewards")}
          </button>
        </header>

        <section className="aftermath-grid">
          <div className="ledger-panel aftermath-left">
            <div className="ledger-heading">
              <h2>{t("battle.yourWarbandReport")}</h2>
              <span>{playerUnits.length}</span>
            </div>
            <div className="aftermath-unit-list">
              {playerUnits.map((card) => {
                const definition = getCardDefinition(card.cardId);
                const stats = battle.unitStats.get(card.uid) ?? {
                  damageDealt: 0,
                  hpLost: 0,
                  destroyed: card.currentHp <= 0,
                };
                const upgrade = upgradesByCardId.get(card.cardId);
                const upgradeReady = Boolean(upgrade && card.level >= upgrade.requiredLevel);
                return (
                  <article
                    className={`aftermath-unit ${stats.destroyed ? "lost" : ""}`}
                    key={card.uid}
                  >
                    <div>
                      <strong className={`rarity-name ${definition.rarity}`}>
                        {t(definition.nameKey)}
                        {upgradeReady ? <span className="upgrade-sigil">↑</span> : null}
                      </strong>
                      <span>
                        {t("warband.level", { level: card.level })} · HP{" "}
                        {Math.max(0, card.currentHp)}/{definition.maxHp}
                      </span>
                    </div>
                    <dl>
                      <div><dt>{t("battle.damageDone")}</dt><dd>{stats.damageDealt}</dd></div>
                      <div><dt>{t("battle.healthLost")}</dt><dd>{stats.hpLost}</dd></div>
                      <div>
                        <dt>{t("battle.loss")}</dt>
                        <dd>{stats.destroyed ? t("battle.yes") : t("battle.no")}</dd>
                      </div>
                    </dl>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="ledger-panel aftermath-right">
            <h2>{t("battle.victoryText")}</h2>
            <p>{t("battle.afterReportHint")}</p>
          </div>
        </section>
      </main>
    </div>
  );
}

function VictoryLootScreen({
  reward,
  takeCapturedCard,
  continueLabel,
  retreatLabel,
  canContinueDungeon,
  onClaim,
}: {
  reward: BattleReward;
  takeCapturedCard: boolean;
  continueLabel: string;
  retreatLabel?: string;
  canContinueDungeon: boolean;
  onClaim: (selection: VictoryClaimSelection) => BattleReward | null;
}) {
  const { t } = useTranslation();
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const selectedItemSet = new Set(selectedItems);

  function toggleItem(itemId: string): void {
    setSelectedItems((current) =>
      current.includes(itemId)
        ? current.filter((candidate) => candidate !== itemId)
        : [...current, itemId],
    );
  }

  function claim(continueDungeon: boolean): void {
    onClaim({
      continueDungeon,
      takeCard: Boolean(reward.cardId && takeCapturedCard),
      itemIds: selectedItems,
    });
  }

  return (
    <div className="battle-overlay">
      <main className="aftermath-board loot-board">
        <header className="battle-header">
          <div>
            <p className="eyebrow">{t("battle.spoilsEyebrow")}</p>
            <h1>{t("battle.spoilsTitle")}</h1>
            <p>{t("battle.lootInstruction")}</p>
          </div>
          <div className="battle-actions">
            {canContinueDungeon && retreatLabel ? (
              <button className="button ghost" onClick={() => claim(false)}>
                {retreatLabel}
              </button>
            ) : null}
            <button className="button primary" onClick={() => claim(true)}>
              {continueLabel}
            </button>
          </div>
        </header>

        <section className="exchange-grid loot-exchange">
          <div className="exchange-column">
            <header>
              <strong>{t("battle.lootPile")}</strong>
              <span>{reward.items.filter((item) => !selectedItemSet.has(item.itemId)).length}</span>
            </header>

            {reward.items.filter((item) => !selectedItemSet.has(item.itemId)).map((item) => {
              const definition = itemsById.get(item.itemId)!;
              return (
                <article className="loot-choice" key={item.itemId}>
                  <div>
                    <span>{t(`trade.filter.${definition.type}`)}</span>
                    <strong>{t(definition.nameKey)} ×{item.quantity}</strong>
                    <small>
                      {t(definition.descriptionKey)} · {t("trade.weight")}{" "}
                      {(definition.weight * item.quantity).toFixed(1)}
                    </small>
                  </div>
                  <button
                    className="button ghost compact"
                    onClick={() => toggleItem(item.itemId)}
                  >
                    {t("battle.take")}
                  </button>
                </article>
              );
            })}
            {reward.items.filter((item) => !selectedItemSet.has(item.itemId)).length === 0 ? (
              <p className="ledger-empty">{t("battle.noLoot")}</p>
            ) : null}
          </div>

          <div className="exchange-column player-cargo">
            <header>
              <strong>{t("trade.playerInventory")}</strong>
              <span>
                {gameSession.cargoWeight.toFixed(1)}/{gameSession.maxCargoWeight}
              </span>
            </header>
            <InventoryPreview inventory={gameSession.inventory} />
            <CarriedLootPreview
              items={reward.items.filter((item) => selectedItemSet.has(item.itemId))}
              onReturn={toggleItem}
            />
          </div>
        </section>
      </main>
    </div>
  );
}

function VictoryUnitsScreen({
  reward,
  takeCapturedCard,
  releasedUnitIds,
  onTakeCapturedCard,
  onReturnCapturedCard,
  onReleaseUnit,
  onRestoreUnit,
  onContinue,
}: {
  reward: BattleReward;
  takeCapturedCard: boolean;
  releasedUnitIds: string[];
  onTakeCapturedCard: () => void;
  onReturnCapturedCard: () => void;
  onReleaseUnit: (uid: string) => void;
  onRestoreUnit: (uid: string) => void;
  onContinue: () => void;
}) {
  const { t } = useTranslation();
  const [, refresh] = useState(0);
  const capturedDefinition = reward.cardId ? getCardDefinition(reward.cardId) : null;
  const releasedUnitSet = new Set(releasedUnitIds);
  const rosterUnits = [...gameSession.warband, ...gameSession.reserve];
  const activeRosterUnits = rosterUnits.filter((card) => !releasedUnitSet.has(card.uid));
  const releasedUnits = rosterUnits.filter((card) => releasedUnitSet.has(card.uid));
  const canTakeCard =
    !reward.cardId ||
    gameSession.reserve.length < gameSession.reserveCapacity ||
    gameSession.warband.length < gameSession.warbandCapacity;

  return (
    <div className="battle-overlay">
      <main className="aftermath-board units-board">
        <header className="battle-header">
          <div>
            <p className="eyebrow">{t("battle.unitsEyebrow")}</p>
            <h1>{t("battle.unitsTitle")}</h1>
            <p>{t("battle.unitsInstruction")}</p>
          </div>
          <button className="button primary" onClick={onContinue}>
            {t("battle.continueToLoot")}
          </button>
        </header>

        <section className="exchange-grid loot-exchange">
          <div className="exchange-column">
            <header>
              <strong>{t("battle.availableUnits")}</strong>
              <span>{(reward.cardId && !takeCapturedCard ? 1 : 0) + releasedUnits.length}</span>
            </header>
            {capturedDefinition && !takeCapturedCard ? (
              <TransferUnitCard
                cardId={reward.cardId!}
                label={t("battle.capturedUnit")}
                note={canTakeCard ? t("battle.capturedUnitHint") : t("battle.noRosterSpace")}
                direction="right"
                disabled={!canTakeCard}
                onMove={onTakeCapturedCard}
              />
            ) : null}
            {releasedUnits.map((card) => (
              <TransferUnitCard
                key={card.uid}
                card={card}
                label={t("battle.releasedUnit")}
                note={t("battle.releasedUnitHint")}
                direction="right"
                onMove={() => onRestoreUnit(card.uid)}
              />
            ))}
            {!capturedDefinition && releasedUnits.length === 0 ? (
              <p className="ledger-empty">{t("battle.noCapturedUnits")}</p>
            ) : null}
          </div>

          <div className="exchange-column player-cargo">
            <header>
              <strong>{t("battle.yourUnits")}</strong>
              <span>
                {gameSession.warband.length}/{gameSession.warbandCapacity} ·{" "}
                {gameSession.reserve.length}/{gameSession.reserveCapacity}
              </span>
            </header>
            {capturedDefinition && takeCapturedCard ? (
              <TransferUnitCard
                cardId={reward.cardId!}
                label={t("battle.pendingRecruit")}
                direction="left"
                onMove={onReturnCapturedCard}
              />
            ) : null}
            <div className="loot-roster-actions unit-management">
              {activeRosterUnits.map((card) => (
                <LootRosterAction
                  key={card.uid}
                  card={card}
                  onRelease={() => onReleaseUnit(card.uid)}
                  onRefresh={() => refresh((value) => value + 1)}
                />
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function LootRosterAction({
  card,
  onRelease,
  onRefresh,
}: {
  card: CardInstance;
  onRelease: () => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const upgrade = upgradesByCardId.get(card.cardId);
  const upgradeReady = Boolean(upgrade && card.level >= upgrade.requiredLevel);
  return (
    <article className="loot-roster-card">
      <UnitIdentity card={card} />
      <div>
        {upgradeReady
          ? upgrade!.options.map((targetCardId) => {
              const target = getCardDefinition(targetCardId);
              return (
                <button
                  className="mini-action"
                  key={targetCardId}
                  onClick={() => {
                    gameSession.upgradeUnit(card.uid, targetCardId);
                    onRefresh();
                  }}
                >
                  {t(target.nameKey)}
                </button>
              );
            })
          : null}
        <button className="transfer-chevron" onClick={onRelease}>‹</button>
      </div>
    </article>
  );
}

function TransferUnitCard({
  card,
  cardId,
  label,
  note,
  direction,
  disabled = false,
  onMove,
}: {
  card?: CardInstance;
  cardId?: string;
  label: string;
  note?: string;
  direction: "left" | "right";
  disabled?: boolean;
  onMove: () => void;
}) {
  const { t } = useTranslation();
  const definition = getCardDefinition(card?.cardId ?? cardId!);
  return (
    <article className="loot-choice unit-transfer-card">
      <div>
        <span>{label}</span>
        {card ? (
          <UnitIdentity card={card} />
        ) : (
          <strong className={`rarity-name ${definition.rarity}`}>
            {t(definition.nameKey)}
          </strong>
        )}
        {note ? <small>{note}</small> : null}
      </div>
      <button className="transfer-chevron" disabled={disabled} onClick={onMove}>
        {direction === "right" ? "›" : "‹"}
      </button>
    </article>
  );
}

function UnitIdentity({ card }: { card: CardInstance }) {
  const { t } = useTranslation();
  const definition = getCardDefinition(card.cardId);
  const upgrade = upgradesByCardId.get(card.cardId);
  const upgradeReady = Boolean(upgrade && card.level >= upgrade.requiredLevel);
  return (
    <div className="unit-identity">
      <strong className={`rarity-name ${definition.rarity}`}>
        {t(definition.nameKey)}
        {upgradeReady ? <span className="upgrade-sigil">↑</span> : null}
      </strong>
      <span>
        {t("warband.level", { level: card.level })} ·{" "}
        {t("warband.tier", { tier: definition.tier })} · XP {card.xp}/
        {xpNeededForNextLevel(card.level)}
      </span>
      <span>
        HP {card.currentHp}/{definition.maxHp} · ATK {definition.atk} · INI{" "}
        {definition.initiative}
      </span>
    </div>
  );
}
function InventoryPreview({ inventory }: { inventory: InventoryStack[] }) {
  const { t } = useTranslation();
  return (
    <div className="inventory-list loot-inventory-preview">
      {inventory.map((stack) => {
        const item = itemsById.get(stack.itemId)!;
        return (
          <article className={`inventory-row ${item.type}`} key={stack.itemId}>
            <div>
              <span>{t(`trade.filter.${item.type}`)}</span>
              <strong>{t(item.nameKey)} ×{stack.quantity}</strong>
              <small>{t(item.descriptionKey)}</small>
            </div>
          </article>
        );
      })}
      {inventory.length === 0 ? (
        <p className="ledger-empty">{t("trade.emptyInventory")}</p>
      ) : null}
    </div>
  );
}

function CarriedLootPreview({
  items,
  onReturn,
}: {
  items: Array<{ itemId: string; quantity: number }>;
  onReturn: (itemId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="carried-loot-preview">
      <header>
        <strong>{t("battle.carriedLoot")}</strong>
        <span>{items.length}</span>
      </header>
      {items.map((item) => {
        const definition = itemsById.get(item.itemId)!;
        return (
          <article className="loot-choice carried" key={item.itemId}>
            <div>
              <span>{t(`trade.filter.${definition.type}`)}</span>
              <strong>{t(definition.nameKey)} ×{item.quantity}</strong>
              <small>{t(definition.descriptionKey)}</small>
            </div>
            <button
              className="button ghost compact"
              onClick={() => onReturn(item.itemId)}
            >
              {t("battle.returnToLoot")}
            </button>
          </article>
        );
      })}
      {items.length === 0 ? (
        <p className="ledger-empty">{t("battle.noCarriedLoot")}</p>
      ) : null}
    </div>
  );
}

function BattleRow({
  battle,
  cards,
  label,
  side,
  selectedUid,
  onSelect,
  activeEvent,
  visualSnapshot,
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
            activeEvent={activeEvent}
            visualSnapshot={visualSnapshot}
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
  activeEvent,
  visualSnapshot,
}: {
  battle: BattleSimulation;
  card: CardInstance;
  selected?: boolean;
  onSelect?: (uid: string) => void;
  activeEvent: BattleAnimationEvent | null;
  visualSnapshot: BattleVisualSnapshot | null;
}) {
  const { t } = useTranslation();
  const definition = getCardDefinition(card.cardId);
  const currentHp = visualSnapshot?.hpByUid.get(card.uid) ?? card.currentHp;
  const healthPercent = Math.max(0, (currentHp / definition.maxHp) * 100);
  const shield = visualSnapshot?.shieldByUid.get(card.uid) ?? battle.getShield(card.uid);
  const motionClass = getCardMotionClass(card.uid, activeEvent);

  return (
    <button
      className={`battle-card ${card.isHero ? "hero" : ""} ${selected ? "selected" : ""} ${motionClass}`}
      disabled={!onSelect}
      onClick={() => onSelect?.(card.uid)}
    >
      <span className="card-rarity">{definition.rarity}</span>
      <strong className={`rarity-name ${definition.rarity}`}>
        {t(definition.nameKey)}
      </strong>
      <span className="card-race">{definition.race}</span>
      <span className="card-level">LV {card.level}</span>
      <span className="card-stats">
        <b>ATK {battle.getAttack(card)}</b>
        <b>DEF {battle.getDefense(card)}</b>
        <b>INI {battle.getInitiative(card)}</b>
      </span>
      <span className="hp-track">
        <span style={{ width: `${healthPercent}%` }} />
      </span>
      <span className="card-hp">
        {t("battle.hp")} {currentHp}/{definition.maxHp}
        {shield > 0 ? ` · SH ${shield}` : ""}
      </span>
    </button>
  );
}

function getCardMotionClass(
  uid: string,
  event: BattleAnimationEvent | null,
): string {
  if (!event) return "";
  if (event.type === "attack") {
    if (event.attackerUids.includes(uid)) return "attacking";
    if (event.defenderUids.includes(uid)) return "targeted";
    return "";
  }
  if (event.cardUid !== uid) return "";
  if (event.type === "summon") return "summoned";
  if (event.type === "draw") return "drawn";
  if (event.type === "recall") return "recalled";
  if (event.type === "destroyed") return "destroyed";
  return "";
}

function createBattleVisualSnapshot(
  battle: BattleSimulation,
): BattleVisualSnapshot {
  const visibleCards = [
    ...battle.enemyField,
    ...battle.playerField,
    ...battle.hand,
  ];
  return {
    enemyField: [...battle.enemyField],
    playerField: [...battle.playerField],
    hand: [...battle.hand],
    hpByUid: new Map(visibleCards.map((card) => [card.uid, card.currentHp])),
    shieldByUid: new Map(
      visibleCards.map((card) => [card.uid, battle.getShield(card.uid)]),
    ),
  };
}

function getResolvedDestroyedUids(
  events: BattleAnimationEvent[],
  animationIndex: number,
): Set<string> {
  if (animationIndex <= 0) return new Set();
  return new Set(
    events
      .slice(0, animationIndex)
      .filter((event) => event.type === "destroyed")
      .map((event) => event.cardUid),
  );
}

function filterVisibleCards(
  cards: CardInstance[],
  removedUids: Set<string>,
): CardInstance[] {
  if (removedUids.size === 0) return cards;
  return cards.filter((card) => !removedUids.has(card.uid));
}

function getBattleEventText(
  event: BattleAnimationEvent,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (event.type === "attack") {
    return t(event.simultaneous ? "battle.simultaneousAttack" : "battle.initiativeAttack", {
      initiative: event.initiative,
    });
  }
  const cardName = t(getCardDefinition(event.cardId).nameKey);
  return t(`battle.animation.${event.type}`, { card: cardName });
}

