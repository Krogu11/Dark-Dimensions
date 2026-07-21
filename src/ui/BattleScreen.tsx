import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  BattleAnimationEvent,
  BattleReward,
  BattleSimulation,
} from "../domain/battle/BattleSimulation";
import { getLeaderCommandValue } from "../domain/battle/LeaderCommands";
import { contentPack, itemsById, upgradesByCardId } from "../content/content";
import {
  getCardDefinition,
  xpNeededForUnitUpgrade,
  type CardInstance,
} from "../domain/cards/CardInstance";
import type { InventoryStack } from "../domain/economy/Economy";
import { gameSession, type VictoryClaimSelection } from "../domain/session/GameSession";
import { playUiSound } from "./UiSoundEffects";

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
  const [pendingLeaderCommandId, setPendingLeaderCommandId] = useState<string | null>(null);
  const [inspectedUid, setInspectedUid] = useState<string>(battle.hero.uid);
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
    setInspectedUid(uid);
    setSelectedHand((current) => (current === uid ? null : uid));
  }

  function toggleField(uid: string): void {
    if (commitLeaderTarget(uid, "player")) return;
    setSelectedHand(null);
    setInspectedUid(uid);
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

  function drawCard(): void {
    battle.drawCard();
    clearSelection();
    setPendingLeaderCommandId(null);
    if (battle.animationEvents.length > 0) setAnimationIndex(0);
    refresh((value) => value + 1);
  }

  function commitLeaderTarget(uid: string, side: "player" | "enemy"): boolean {
    if (!pendingLeaderCommandId) return false;
    const command = battle.leaderActionProgression.find((candidate) => candidate.id === pendingLeaderCommandId);
    const validSide = command?.effect === "attack" ? side === "enemy" : command?.effect === "healLowest" ? side === "player" : false;
    if (!validSide || !battle.commitLeaderAction(pendingLeaderCommandId, uid)) return false;
    setPendingLeaderCommandId(null);
    clearSelection();
    refresh((value) => value + 1);
    return true;
  }

  const activeEvent =
    animationIndex >= 0 ? battle.animationEvents[animationIndex] : null;
  const isAnimating = activeEvent !== null;
  const pendingLeaderCommand = battle.leaderActionProgression.find((command) => command.id === pendingLeaderCommandId);
  const leaderTargetSide = pendingLeaderCommand?.effect === "attack" ? "enemy" : pendingLeaderCommand?.effect === "healLowest" ? "player" : null;

  useEffect(() => {
    if (activeEvent?.type === "attack") playUiSound("claw");
    if (activeEvent?.type === "destroyed") playUiSound("enemy-death");
  }, [activeEvent]);

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
            End Run
          </button>
        </section>
      </div>
    );
  }

  const selectedFieldCard = battle.playerField.find(
    (card) => card.uid === selectedField,
  );
  const canRecall = Boolean(selectedFieldCard);
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
  const inspectedCard = [
    battle.enemyLeader,
    ...enemyField,
    ...playerField,
    battle.hero,
    ...hand,
  ].find((card) => card.uid === inspectedUid) ?? battle.hero;

  return (
    <div className="battle-overlay">
      <main className={`battle-board tactical terrain-${battle.terrainModifiers.terrain}`}>
        <section className="battle-stage">
          <aside className="battle-portrait-rail">
            <LeaderPortrait
              battle={battle}
              card={battle.enemyLeader}
              side="enemy"
              onInspect={(uid) => { commitLeaderTarget(uid, "enemy"); setInspectedUid(uid); }}
              activeEvent={activeEvent}
              visualSnapshot={visualSnapshot}
              targetable={leaderTargetSide === "enemy" && enemyField.every((card) => card.currentHp <= 0)}
              strategicTarget={battle.selectedLeaderTargetUid === battle.enemyLeader.uid}
            />
            <LeaderPortrait
              battle={battle}
              card={battle.hero}
              side="player"
              onInspect={(uid) => {
                commitLeaderTarget(uid, "player");
                setInspectedUid(uid);
              }}
              activeEvent={activeEvent}
              visualSnapshot={visualSnapshot}
              targetable={leaderTargetSide === "player"}
              strategicTarget={battle.selectedLeaderTargetUid === battle.hero.uid}
            />
          </aside>

          <div className="battle-arena">
            {contentPack.terrainBattlefields[battle.terrainModifiers.terrain] ? (
              <img
                className="arena-background-art"
                src={contentPack.terrainBattlefields[battle.terrainModifiers.terrain].image}
                alt=""
                aria-hidden="true"
                style={{
                  objectPosition: `${contentPack.terrainBattlefields[battle.terrainModifiers.terrain].focus.x}% ${contentPack.terrainBattlefields[battle.terrainModifiers.terrain].focus.y}%`,
                }}
              />
            ) : null}
            <div
              className={`arena-battle-context ${battle.terrainModifiers.terrain}`}
              title={t(`terrain.${battle.terrainModifiers.terrain}.battle`)}
            >
              {encounterLabel ? <span>{encounterLabel}</span> : null}
              <strong>{t(`terrain.${battle.terrainModifiers.terrain}.name`)}</strong>
              <em>
                {t("battle.terrainEffect", {
                  attack: formatModifier(battle.terrainModifiers.playerAttack),
                  defense: formatModifier(battle.terrainModifiers.playerDefense),
                })}
              </em>
            </div>
            <BattleRow
              battle={battle}
              cards={enemyField}
              label={t(battle.enemy.nameKey)}
              side="enemy"
              onInspect={(uid) => { commitLeaderTarget(uid, "enemy"); setInspectedUid(uid); }}
              activeEvent={activeEvent}
              visualSnapshot={visualSnapshot}
              targetable={leaderTargetSide === "enemy"}
              strategicTargetUid={battle.selectedLeaderTargetUid}
            />
            <div className="battle-divider">
              <span>
                <strong>{t("battle.turn", { turn: battle.turn })}</strong>
                {activeEvent ? <em>{getBattleEventText(activeEvent, t)}</em> : null}
              </span>
            </div>
            <BattleRow
              battle={battle}
              cards={playerField}
              label={t("battle.yourField")}
              side="player"
              selectedUid={selectedField}
              onSelect={toggleField}
              onInspect={setInspectedUid}
              activeEvent={activeEvent}
              visualSnapshot={visualSnapshot}
              targetable={leaderTargetSide === "player"}
              strategicTargetUid={battle.selectedLeaderTargetUid}
            />
            <div className="battle-actions battle-field-actions">
              <div className="battle-field-actions-left">
                <button className="button ghost" disabled={isAnimating || !canSummonAction || battle.summonsRemaining === 0} onClick={summonOrRecall}>
                  {t(selectedHand ? "battle.summon" : "battle.recall")}
                </button>
                <button className="button ghost" disabled={isAnimating || battle.actionsRemaining === 0 || battle.hand.length >= battle.handLimit || battle.drawPile.length === 0} onClick={drawCard}>
                  {t("battle.drawCard")} ({battle.drawPile.length})
                </button>
              </div>
              <span className="resolve-action-stack">
                <span className="tactical-action-pips" aria-label={t("battle.summons", { count: battle.summonsRemaining })}>
                  {[0, 1, 2].map((index) => (
                    <i className={index < battle.summonsRemaining ? "available" : "spent"} key={index} />
                  ))}
                </span>
                <button className="button primary" disabled={isAnimating || Boolean(pendingLeaderCommandId)} onClick={resolveRound}>
                  {t("battle.resolveRound")}
                </button>
              </span>
              <span className="battle-message">{pendingLeaderCommand?.effect === "attack" ? t("battle.commandEnemyTargetPrompt") : pendingLeaderCommand?.effect === "healLowest" ? t("battle.commandAllyTargetPrompt") : battle.message ? t(`battle.${battle.message}`) : null}</span>
            </div>
          </div>

          <UnitDetailPanel battle={battle} card={inspectedCard} />
        </section>

        <footer className="battle-control-deck">
          <BattleRow
            battle={battle}
            cards={hand}
            label={t("battle.hand")}
            side="hand"
            selectedUid={selectedHand}
            onSelect={toggleHand}
            onInspect={setInspectedUid}
            activeEvent={activeEvent}
            visualSnapshot={visualSnapshot}
          />
          <div className="battle-command-deck">
            <section className="leader-command-bar">
              <span className="leader-command-heading">
                <small>{t("battle.leaderCommands")}</small>
                <strong>{t(`battle.commandRaces.${getCardDefinition(battle.hero.cardId).race}`)}</strong>
              </span>
              <div className="leader-command-list">
              {battle.leaderActionProgression.map((command) => {
                const locked = battle.hero.level < command.unlockLevel;
                const committed = battle.selectedLeaderAction === command.id;
                const pending = pendingLeaderCommandId === command.id;
                const value = getLeaderCommandValue(command, battle.hero.level);
                return (
                <button
                  className={`leader-command ${committed ? "selected" : ""} ${pending ? "pending" : ""} ${locked ? "locked" : ""}`}
                  disabled={isAnimating || locked || Boolean(battle.selectedLeaderAction) || battle.actionsRemaining === 0}
                  key={command.id}
                  onClick={() => {
                    if (command.effect === "attack" || command.effect === "healLowest") {
                      setPendingLeaderCommandId((current) => current === command.id ? null : command.id);
                    } else {
                      battle.commitLeaderAction(command.id);
                    }
                    refresh((render) => render + 1);
                  }}
                  title={locked ? t("battle.commandUnlock", { level: command.unlockLevel }) : t(`battle.commandEffects.${command.effect}`, { value })}
                >
                  <b>{locked ? "◆" : command.icon}</b>
                  <strong>{locked ? t("battle.commandLockedSlot") : t(`battle.leaderActions.${command.id}`)}</strong>
                  <small>{locked ? t("battle.commandLevel", { level: command.unlockLevel }) : t(`battle.commandEffects.${command.effect}`, { value })}</small>
                  <em>{locked ? t("battle.commandLocked") : <><i className="available" />{committed ? t("battle.commandCommitted") : pending ? t("battle.commandChooseTarget") : t("battle.commandCost")}</>}</em>
                </button>
                );
              })}
              </div>
            </section>
          </div>
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
  onInspect?: (uid: string) => void;
  activeEvent: BattleAnimationEvent | null;
  visualSnapshot: BattleVisualSnapshot | null;
  leader?: boolean;
  targetable?: boolean;
  strategicTargetUid?: string | null;
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
                  wounded: false,
                };
                const upgrade = upgradesByCardId.get(card.cardId);
                const upgradeReady = Boolean(upgrade && card.xp >= xpNeededForUnitUpgrade(definition.tier));
                return (
                  <article
                    className={`aftermath-unit ${stats.wounded ? "wounded" : stats.destroyed ? "lost" : ""}`}
                    key={card.uid}
                  >
                    <div>
                      <strong className={`rarity-name ${definition.rarity}`}>
                        {t(definition.nameKey)}
                        {upgradeReady ? <span className="upgrade-sigil">↑</span> : null}
                      </strong>
                      <span>
                        {t("warband.tier", { tier: definition.tier })} · HP{" "}
                        {Math.max(0, card.currentHp)}/{definition.maxHp}
                      </span>
                    </div>
                    <dl>
                      <div><dt>{t("battle.damageDone")}</dt><dd>{stats.damageDealt}</dd></div>
                      <div><dt>{t("battle.healthLost")}</dt><dd>{stats.hpLost}</dd></div>
                      <div>
                        <dt>{t("battle.loss")}</dt>
                        <dd>{stats.wounded ? t("battle.wounded") : stats.destroyed ? t("battle.dead") : t("battle.no")}</dd>
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

function getCapturedCardIds(reward: BattleReward): string[] {
  return reward.capturedCardIds ?? (reward.cardId ? [reward.cardId] : []);
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
      takeCard: getCapturedCardIds(reward).length > 0 && takeCapturedCard,
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
  const capturedCardIds = getCapturedCardIds(reward);
  const releasedUnitSet = new Set(releasedUnitIds);
  const rosterUnits = gameSession.warband;
  const activeRosterUnits = rosterUnits.filter((card) => !releasedUnitSet.has(card.uid));
  const releasedUnits = rosterUnits.filter((card) => releasedUnitSet.has(card.uid));
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
              <span>{(!takeCapturedCard ? capturedCardIds.length : 0) + releasedUnits.length}</span>
            </header>
            {!takeCapturedCard ? capturedCardIds.map((cardId, index) => (
              <TransferUnitCard
                key={`${cardId}-${index}`}
                cardId={cardId}
                label={t("battle.capturedPrisoner")}
                note={t("battle.capturedPrisonerHint")}
                direction="right"
                onMove={onTakeCapturedCard}
              />
            )) : null}
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
            {capturedCardIds.length === 0 && releasedUnits.length === 0 ? (
              <p className="ledger-empty">{t("battle.noCapturedUnits")}</p>
            ) : null}
          </div>

          <div className="exchange-column player-cargo">
            <header>
              <strong>{t("battle.yourUnits")}</strong>
              <span>
                {gameSession.warband.length}/{gameSession.warbandCapacity} ·{" "}
                {t("warband.prisonersCount", { count: gameSession.prisonerCount })}
              </span>
            </header>
            {takeCapturedCard ? capturedCardIds.map((cardId, index) => (
              <TransferUnitCard
                key={`${cardId}-${index}`}
                cardId={cardId}
                label={t("battle.pendingPrisoner")}
                direction="left"
                onMove={onReturnCapturedCard}
              />
            )) : null}
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
  const upgradeReady = Boolean(upgrade && card.xp >= xpNeededForUnitUpgrade(getCardDefinition(card.cardId).tier));
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
  const upgradeReady = Boolean(upgrade && card.xp >= xpNeededForUnitUpgrade(definition.tier));
  return (
    <div className="unit-identity">
      <strong className={`rarity-name ${definition.rarity}`}>
        {t(definition.nameKey)}
        {upgradeReady ? <span className="upgrade-sigil">↑</span> : null}
      </strong>
      <span>
        {t("warband.tier", { tier: definition.tier })} · XP {card.xp}/
        {xpNeededForUnitUpgrade(definition.tier)}
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

function LeaderPortrait({
  battle,
  card,
  side,
  onInspect,
  activeEvent,
  visualSnapshot,
  targetable,
  strategicTarget,
}: {
  battle: BattleSimulation;
  card: CardInstance;
  side: "enemy" | "player";
  onInspect: (uid: string) => void;
  activeEvent: BattleAnimationEvent | null;
  visualSnapshot: BattleVisualSnapshot | null;
  targetable?: boolean;
  strategicTarget?: boolean;
}) {
  const { t } = useTranslation();
  const definition = getCardDefinition(card.cardId);
  const displayedHp = visualSnapshot?.hpByUid.get(card.uid) ?? card.currentHp;
  const healthPercent = Math.max(0, (displayedHp / battle.getMaxHp(card)) * 100);
  return (
    <button className={`leader-portrait ${side} ${targetable ? "targetable" : ""} ${strategicTarget ? "strategic-target" : ""} ${getLeaderMotionClass(card.uid, activeEvent)}`} onClick={() => onInspect(card.uid)}>
      <span className="portrait-art" aria-hidden="true">
        {definition.portraitImage ? (
          <img
            src={definition.portraitImage}
            alt=""
            style={{ objectPosition: `${definition.imageFocus?.x ?? 50}% ${definition.imageFocus?.y ?? 50}%` }}
          />
        ) : (
          <b>{t(definition.nameKey).slice(0, 1)}</b>
        )}
      </span>
      <span className="portrait-copy">
        <strong>{t(definition.nameKey)}</strong>
        <span className="portrait-stats" aria-label={`ATK ${battle.getAttack(card)}, DEF ${battle.getDefense(card)}`}>
          <b>ATK {battle.getAttack(card)}</b>
          <b>DEF {battle.getDefense(card)}</b>
        </span>
        <span className="portrait-hp"><i style={{ width: `${healthPercent}%` }} /></span>
        <em>{displayedHp}/{battle.getMaxHp(card)} HP</em>
      </span>
    </button>
  );
}

function UnitDetailPanel({ battle, card }: { battle: BattleSimulation; card: CardInstance }) {
  const { t } = useTranslation();
  const definition = getCardDefinition(card.cardId);
  const detailImage = definition.portraitImage ?? definition.cardImage;
  return (
    <aside className="unit-detail-panel">
      <p className="eyebrow">{t("battle.unitDetails")}</p>
      <strong className={`rarity-name ${definition.rarity}`}>{t(definition.nameKey)}</strong>
      <span className="unit-detail-meta">
        {definition.race} · {definition.rarity} · {t("warband.tier", { tier: definition.tier })} · XP {card.xp}/
        {xpNeededForUnitUpgrade(definition.tier)}
      </span>
      <div className="unit-detail-summary">
        <div className="unit-detail-art" aria-hidden="true">
          {detailImage ? (
            <img
              src={detailImage}
              alt=""
              style={{ objectPosition: `${definition.imageFocus?.x ?? 50}% ${definition.imageFocus?.y ?? 50}%` }}
            />
          ) : (
            <b>{t(definition.nameKey).slice(0, 1)}</b>
          )}
        </div>
        <dl>
          <div><dt>ATK</dt><dd>{battle.getAttack(card)}</dd></div>
          <div><dt>DEF</dt><dd>{battle.getDefense(card)}</dd></div>
          <div><dt>INI</dt><dd>{battle.getInitiative(card)}</dd></div>
          <div><dt>HP</dt><dd>{card.currentHp}/{battle.getMaxHp(card)}</dd></div>
        </dl>
      </div>
      <div className="unit-effect-copy">
        <small>{t("battle.cardEffect")}</small>
        <span>{definition.battleEffect ? t(`battle.effects.${definition.battleEffect}`) : t("battle.effects.none")}</span>
      </div>
      <p className="unit-lore">
        {definition.descriptionKey
          ? t(definition.descriptionKey)
          : t(`battle.raceIdentity.${definition.race}`)}
      </p>
    </aside>
  );
}

function BattleRow({
  battle,
  cards,
  label,
  side,
  selectedUid,
  onSelect,
  onInspect,
  activeEvent,
  visualSnapshot,
  leader,
  targetable,
  strategicTargetUid,
}: BattleRowProps) {
  return (
    <section className={`battle-row ${side} ${leader ? "leader-row" : ""} ${targetable ? "targeting" : ""}`}>
      <h2>{label}</h2>
      <div className="battle-cards">
        {cards.map((card) => (
          <BattleCard
            key={card.uid}
            battle={battle}
            card={card}
            selected={selectedUid === card.uid}
            onSelect={onSelect}
            onInspect={onInspect}
            showPortrait
            targetable={targetable}
            strategicTarget={strategicTargetUid === card.uid}
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
  onInspect,
  showPortrait,
  targetable,
  strategicTarget,
  activeEvent,
  visualSnapshot,
}: {
  battle: BattleSimulation;
  card: CardInstance;
  selected?: boolean;
  onSelect?: (uid: string) => void;
  onInspect?: (uid: string) => void;
  showPortrait: boolean;
  targetable?: boolean;
  strategicTarget?: boolean;
  activeEvent: BattleAnimationEvent | null;
  visualSnapshot: BattleVisualSnapshot | null;
}) {
  const { t } = useTranslation();
  const definition = getCardDefinition(card.cardId);
  const currentHp = visualSnapshot?.hpByUid.get(card.uid) ?? card.currentHp;
  const healthPercent = Math.max(0, (currentHp / definition.maxHp) * 100);
  const shield = visualSnapshot?.shieldByUid.get(card.uid) ?? battle.getShield(card.uid);
  const motionClass = getCardMotionClass(card.uid, activeEvent);
  const fieldPortrait = showPortrait ? definition.portraitImage ?? definition.cardImage : undefined;

  return (
    <button
      className={`battle-card ${card.isHero ? "hero" : ""} ${fieldPortrait ? "with-portrait" : ""} ${selected ? "selected" : ""} ${targetable ? "targetable" : ""} ${strategicTarget ? "strategic-target" : ""} ${motionClass}`}
      disabled={!onSelect && !onInspect}
      onClick={() => { onInspect?.(card.uid); onSelect?.(card.uid); }}
    >
      {fieldPortrait ? (
        <span className="field-card-portrait" aria-hidden="true">
          <img
            src={fieldPortrait}
            alt=""
            style={{ objectPosition: `${definition.imageFocus?.x ?? 50}% ${definition.imageFocus?.y ?? 50}%` }}
          />
        </span>
      ) : null}
      <span className="card-race">{definition.race}</span>
      <span className="card-combat-copy">
        <strong className={`rarity-name ${definition.rarity}`}>
          {t(definition.nameKey)}
        </strong>
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
  if (event.type === "leaderAction") {
    return event.affectedUids.includes(uid)
      ? `leader-affected leader-${event.actionId}`
      : "";
  }
  if (event.cardUid !== uid) return "";
  if (event.type === "summon") return "summoned";
  if (event.type === "draw") return "drawn";
  if (event.type === "recall") return "recalled";
  if (event.type === "destroyed") return "destroyed";
  return "";
}

function getLeaderMotionClass(
  uid: string,
  event: BattleAnimationEvent | null,
): string {
  if (!event) return "";
  if (event.type === "attack") {
    if (event.attackerUids.includes(uid)) return "leader-attacking";
    if (event.defenderUids.includes(uid)) return "leader-targeted";
    return "";
  }
  if (event.type === "leaderAction") {
    if (event.cardUid === uid) return `leader-acting leader-${event.actionId}`;
    if (event.affectedUids.includes(uid)) return `leader-affected leader-${event.actionId}`;
  }
  return "";
}

function formatModifier(multiplier: number): string {
  const percent = Math.round((multiplier - 1) * 100);
  if (percent === 0) return "±0%";
  return `${percent > 0 ? "+" : ""}${percent}%`;
}

function createBattleVisualSnapshot(
  battle: BattleSimulation,
): BattleVisualSnapshot {
  const visibleCards = [
    battle.enemyLeader,
    battle.hero,
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
  if (event.type === "leaderAction") {
    return t(`battle.leaderActions.${event.actionId}`);
  }
  const cardName = t(getCardDefinition(event.cardId).nameKey);
  return t(`battle.animation.${event.type}`, { card: cardName });
}

