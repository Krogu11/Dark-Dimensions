import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  BattleAnimationEvent,
  BattleHistoryEntry,
  BattleReward,
  BattleSimulation,
} from "../domain/battle/BattleSimulation";
import { describeCardEffects } from "../domain/battle/CardEffects";
import { abilitiesById, contentPack, itemsById, upgradesByCardId } from "../content/content";
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
  heroName?: string;
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
  cardsByUid: Map<string, CardInstance>;
  hpByUid: Map<string, number>;
  shieldByUid: Map<string, number>;
  attackByUid: Map<string, number>;
  defenseByUid: Map<string, number>;
  initiativeByUid: Map<string, number>;
}

export function BattleScreen({
  battle,
  heroName,
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
  const [selectedCapturedIndexes, setSelectedCapturedIndexes] = useState<number[]>([]);
  const [combatLogOpen, setCombatLogOpen] = useState(false);

  useEffect(() => {
    if (battle.animationEvents.length === 0) {
      setAnimationIndex(-1);
      setVisualSnapshot(null);
      return;
    }

    let cancelled = false;
    const eventCount = battle.animationEvents.length;
    setAnimationIndex(0);
    const timers = battle.animationEvents.map((_, index) =>
      window.setTimeout(() => {
        if (cancelled) return;
        setAnimationIndex(
          index + 1 < eventCount ? index + 1 : -1,
        );
        if (index + 1 >= eventCount) {
          setVisualSnapshot(null);
          battle.clearAnimationEvents();
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
    const snapshot = createBattleVisualSnapshot(battle);
    const succeeded = selectedHand
      ? battle.summon(selectedHand)
      : selectedField
        ? battle.recall(selectedField)
        : false;
    if (succeeded) {
      clearSelection();
      setVisualSnapshot(battle.animationEvents.length > 0 ? snapshot : null);
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
    const snapshot = createBattleVisualSnapshot(battle);
    const succeeded = battle.drawCard();
    clearSelection();
    setPendingLeaderCommandId(null);
    setVisualSnapshot(succeeded && battle.animationEvents.length > 0 ? snapshot : null);
    if (succeeded && battle.animationEvents.length > 0) setAnimationIndex(0);
    refresh((value) => value + 1);
  }

  function commitLeaderTarget(uid: string, side: "player" | "enemy"): boolean {
    if (!pendingLeaderCommandId) return false;
    const ability = abilitiesById.get(pendingLeaderCommandId);
    const validSide = pendingLeaderCommandId === "strategic_attack" || ability?.target === "enemy"
      ? side === "enemy"
      : ability?.target === "ally"
        ? side === "player"
        : false;
    if (!validSide || !battle.commitAbility(pendingLeaderCommandId, uid)) return false;
    setPendingLeaderCommandId(null);
    clearSelection();
    refresh((value) => value + 1);
    return true;
  }

  const activeEvent =
    animationIndex >= 0 ? battle.animationEvents[animationIndex] : null;
  const animatedVisualSnapshot = visualSnapshot
    ? applyAnimationEventsToSnapshot(
        visualSnapshot,
        battle.animationEvents,
        animationIndex,
      )
    : null;
  const isAnimating = activeEvent !== null;
  const pendingLeaderCommand = pendingLeaderCommandId === "strategic_attack"
    ? { target: "enemy" as const }
    : abilitiesById.get(pendingLeaderCommandId ?? "");
  const leaderTargetSide = pendingLeaderCommand?.target === "enemy" ? "enemy" : pendingLeaderCommand?.target === "ally" ? "player" : null;

  useEffect(() => {
    if (activeEvent?.type === "attack") playUiSound("claw");
    if (activeEvent?.type === "destroyed") playUiSound("enemy-death");
  }, [activeEvent]);

  if (battle.outcome === "victory" && !isAnimating && !visualSnapshot) {
    if (victoryStep === "units" && pendingReward) {
      return (
        <PrisonerSelectionScreen
          reward={pendingReward}
          selectedCapturedIndexes={selectedCapturedIndexes}
          onTakeCapturedCard={(index) => setSelectedCapturedIndexes((current) =>
            current.includes(index) ? current : [...current, index]
          )}
          onReturnCapturedCard={(index) => setSelectedCapturedIndexes((current) =>
            current.filter((candidate) => candidate !== index)
          )}
          onContinue={() => {
            setVictoryStep("loot");
          }}
        />
      );
    }

    if (victoryStep === "loot" && pendingReward) {
      return (
        <VictoryLootScreen
          reward={pendingReward}
          selectedCapturedIndexes={selectedCapturedIndexes}
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
            setSelectedCapturedIndexes([]);
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
    visualSnapshot
      ? getAnimatedFieldCards(
          visualSnapshot.enemyField,
          visualSnapshot.cardsByUid,
          battle.animationEvents,
          animationIndex,
          "enemy",
        )
      : battle.enemyField,
    resolvedDestroyedUids,
  );
  const playerField = filterVisibleCards(
    visualSnapshot
      ? getAnimatedFieldCards(
          visualSnapshot.playerField,
          visualSnapshot.cardsByUid,
          battle.animationEvents,
          animationIndex,
          "player",
        )
      : battle.playerField,
    resolvedDestroyedUids,
  );
  const hand = filterVisibleCards(
    visualSnapshot
      ? getAnimatedPlayerHand(
          visualSnapshot.hand,
          visualSnapshot.cardsByUid,
          battle.animationEvents,
          animationIndex,
        )
      : battle.hand,
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
              visualSnapshot={animatedVisualSnapshot}
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
              visualSnapshot={animatedVisualSnapshot}
              targetable={leaderTargetSide === "player"}
              strategicTarget={battle.selectedLeaderTargetUid === battle.hero.uid}
              displayName={heroName}
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
            <BattleRow
              battle={battle}
              cards={enemyField}
              label={t(battle.enemy.nameKey)}
              side="enemy"
              onInspect={(uid) => { commitLeaderTarget(uid, "enemy"); setInspectedUid(uid); }}
              activeEvent={activeEvent}
              visualSnapshot={animatedVisualSnapshot}
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
              label=""
              side="player"
              selectedUid={selectedField}
              onSelect={toggleField}
              onInspect={setInspectedUid}
              activeEvent={activeEvent}
              visualSnapshot={animatedVisualSnapshot}
              targetable={leaderTargetSide === "player"}
              strategicTargetUid={battle.selectedLeaderTargetUid}
            />
            <div
              className={`arena-terrain-context ${battle.terrainModifiers.terrain}`}
              title={t(`terrain.${battle.terrainModifiers.terrain}.battle`)}
            >
              <strong>{t(`terrain.${battle.terrainModifiers.terrain}.name`)}</strong>
              <em>
                {t("battle.terrainEffect", {
                  attack: formatModifier(battle.terrainModifiers.playerAttack),
                  defense: formatModifier(battle.terrainModifiers.playerDefense),
                })}
              </em>
            </div>
            <div className="battle-actions battle-field-actions">
              <div className="battle-field-actions-left">
                <div className="battle-field-action-buttons">
                  <button className="button ghost" disabled={isAnimating || !canSummonAction || battle.summonsRemaining === 0} onClick={summonOrRecall}>
                    {t(selectedHand ? "battle.summon" : "battle.recall")}
                  </button>
                  <button className="button ghost" disabled={isAnimating || battle.actionsRemaining === 0 || battle.hand.length >= battle.handLimit || battle.drawPile.length === 0} onClick={drawCard}>
                    {t("battle.drawCard")} ({battle.drawPile.length})
                  </button>
                </div>
              </div>
              <span className="resolve-action-stack">
                <span className="tactical-action-budget" aria-label={`Actions ${battle.actionsRemaining} of ${battle.strategicActionsThisRound}`}>
                  <small>ACTIONS {battle.actionsRemaining}/{battle.strategicActionsThisRound}</small>
                  <span className="tactical-action-pips">
                    {Array.from({ length: battle.strategicActionsThisRound }, (_, index) => (
                      <i className={index < battle.actionsRemaining ? "available" : "spent"} key={index} />
                    ))}
                  </span>
                </span>
                <button className="button primary" disabled={isAnimating || Boolean(pendingLeaderCommandId)} onClick={resolveRound}>
                  {t("battle.resolveRound")}
                </button>
              </span>
              <span className="battle-message">{pendingLeaderCommand?.target === "enemy" ? t("battle.commandEnemyTargetPrompt") : pendingLeaderCommand?.target === "ally" ? t("battle.commandAllyTargetPrompt") : battle.message ? t(`battle.${battle.message}`) : null}</span>
            </div>
          </div>

          <UnitDetailPanel
            battle={battle}
            card={inspectedCard}
            visualSnapshot={animatedVisualSnapshot}
          />
          <CombatLogDrawer
            battle={battle}
            open={combatLogOpen}
            onToggle={() => setCombatLogOpen((current) => !current)}
          />
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
            visualSnapshot={animatedVisualSnapshot}
          />
          <div className="battle-command-deck">
            <section className="leader-command-bar">
              <span className="leader-command-heading">
                <small>{t("battle.abilities")}</small>
                <strong>{t("battle.abilityLoadout")}</strong>
              </span>
              <div className="leader-command-list">
              {[
                { id: "strategic_attack", nameKey: "battle.strategicAttack", descriptionKey: "battle.strategicAttackDescription", icon: "⚔", actionCost: 1, target: "enemy" as const },
                ...battle.availableAbilities,
              ].map((command) => {
                const locked = battle.actionsRemaining < command.actionCost;
                const committed = battle.queuedAbilities.some((entry) => entry.abilityId === command.id);
                const pending = pendingLeaderCommandId === command.id;
                return (
                <button
                  className={`leader-command ${committed ? "selected" : ""} ${pending ? "pending" : ""} ${locked ? "locked" : ""}`}
                  disabled={isAnimating || locked}
                  key={command.id}
                  onClick={() => {
                    if (command.target === "enemy" || command.target === "ally") {
                      setPendingLeaderCommandId((current) => current === command.id ? null : command.id);
                    } else {
                      setPendingLeaderCommandId(null);
                      battle.commitAbility(command.id);
                    }
                    refresh((render) => render + 1);
                  }}
                  title={t(command.descriptionKey)}
                >
                  <b>{locked ? "◆" : command.icon}</b>
                  <strong>{t(command.nameKey)}</strong>
                  <small>{t(command.descriptionKey)}</small>
                  <em><i className="available" />{pending ? t("battle.commandChooseTarget") : t("battle.abilityCost", { cost: command.actionCost })}</em>
                </button>
                );
              })}
              </div>
              {battle.queuedAbilities.length ? <div className="ability-queue">
                {battle.queuedAbilities.map((entry, index) => (
                  <button key={`${entry.abilityId}:${index}`} onClick={() => { battle.cancelAbility(index); refresh((value) => value + 1); }}>
                    {t(entry.abilityId === "strategic_attack" ? "battle.strategicAttack" : abilitiesById.get(entry.abilityId)?.nameKey ?? entry.abilityId)}
                    <span>−{entry.actionCost} · Undo</span>
                  </button>
                ))}
              </div> : null}
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
  const reportUnits = playerUnits.map((card) => {
    const definition = getCardDefinition(card.cardId);
    const stats = battle.unitStats.get(card.uid) ?? {
      damageDealt: 0,
      hpLost: 0,
      destroyed: card.currentHp <= 0,
      wounded: false,
      kills: 0,
      killXp: 0,
    };
    const upgrade = upgradesByCardId.get(card.cardId);
    return {
      card,
      definition,
      stats,
      upgradeReady: Boolean(upgrade && card.xp >= xpNeededForUnitUpgrade(definition.tier)),
    };
  });
  const totalDamage = reportUnits.reduce((total, unit) => total + unit.stats.damageDealt, 0);
  const totalKills = reportUnits.reduce((total, unit) => total + unit.stats.kills, 0);
  const totalHpLost = reportUnits.reduce((total, unit) => total + unit.stats.hpLost, 0);
  const casualties = reportUnits.filter((unit) => unit.stats.destroyed).length;
  const wounded = reportUnits.filter((unit) => !unit.stats.destroyed && unit.stats.wounded).length;
  const survivors = reportUnits.length - casualties;
  return (
    <div className="battle-overlay">
      <main className="aftermath-board report-board">
        <header className="battle-header report-header">
          <div>
            <p className="eyebrow">{t("battle.aftermathEyebrow")}</p>
            <h1>{t("battle.victory")}</h1>
            {encounterLabel ? <span className="encounter-label">{encounterLabel}</span> : null}
          </div>
          <button className="button primary" onClick={onContinue}>
            {t("battle.collectRewards")}
          </button>
        </header>

        <section className="aftermath-overview" aria-label={t("battle.aftermathEyebrow")}>
          <article className="primary">
            <span>{t("battle.reportUnits")}</span>
            <strong>{reportUnits.length}</strong>
            <small>{t("battle.reportSurvivors", { count: survivors })}</small>
          </article>
          <article>
            <span>{t("battle.damageDone")}</span>
            <strong>{totalDamage}</strong>
            <small>{t("battle.reportTotal")}</small>
          </article>
          <article>
            <span>{t("battle.kills")}</span>
            <strong>{totalKills}</strong>
            <small>{t("battle.reportConfirmed")}</small>
          </article>
          <article>
            <span>{t("battle.healthLost")}</span>
            <strong>{totalHpLost}</strong>
            <small>{t("battle.reportTotal")}</small>
          </article>
          <article className={casualties > 0 ? "danger" : ""}>
            <span>{t("battle.reportCasualties")}</span>
            <strong>{casualties}</strong>
            <small>
              {wounded > 0
                ? t("battle.reportWounded", { count: wounded })
                : t("battle.reportNoWounded")}
            </small>
          </article>
        </section>

        <section className="ledger-panel aftermath-roster">
          <div className="ledger-heading aftermath-roster-heading">
            <div>
              <h2>{t("battle.yourWarbandReport")}</h2>
              <p>{t("battle.afterReportHint")}</p>
            </div>
            <span>{reportUnits.length}</span>
          </div>
          <div className="aftermath-unit-list">
              {reportUnits.map(({ card, definition, stats, upgradeReady }) => {
                const portrait = definition.portraitImage ?? definition.cardImage;
                const hpPercent = Math.max(0, Math.min(100, (card.currentHp / definition.maxHp) * 100));
                return (
                  <article
                    className={`aftermath-unit ${stats.destroyed ? "lost" : stats.wounded ? "wounded" : ""}`}
                    key={card.uid}
                  >
                    <div className="aftermath-unit-art">
                      {portrait ? (
                        <img
                          src={portrait}
                          alt=""
                          style={{
                            objectPosition: `${definition.imageFocus?.x ?? 50}% ${definition.imageFocus?.y ?? 50}%`,
                          }}
                        />
                      ) : (
                        <b>{t(definition.nameKey).slice(0, 1)}</b>
                      )}
                    </div>
                    <div className="aftermath-unit-copy">
                      <strong className={`rarity-name ${definition.rarity}`}>
                        {t(definition.nameKey)}
                        {upgradeReady ? <span className="upgrade-sigil">↑</span> : null}
                      </strong>
                      <span>
                        {t("warband.tier", { tier: definition.tier })} · HP{" "}
                        {Math.max(0, card.currentHp)}/{definition.maxHp}
                      </span>
                      <i className="aftermath-hp" aria-hidden="true">
                        <b style={{ width: `${hpPercent}%` }} />
                      </i>
                    </div>
                    <dl>
                      <div><dt>{t("battle.damageDone")}</dt><dd>{stats.damageDealt}</dd></div>
                      <div><dt>{t("battle.kills")}</dt><dd>{stats.kills}</dd></div>
                      <div><dt>{t("battle.healthLost")}</dt><dd>{stats.hpLost}</dd></div>
                    </dl>
                  </article>
                );
              })}
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
  selectedCapturedIndexes,
  continueLabel,
  retreatLabel,
  canContinueDungeon,
  onClaim,
}: {
  reward: BattleReward;
  selectedCapturedIndexes: number[];
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
      takeCard: selectedCapturedIndexes.length > 0,
      capturedCardIndexes: selectedCapturedIndexes,
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
                  <ItemArtwork itemId={item.itemId} />
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

function PrisonerSelectionScreen({
  reward,
  selectedCapturedIndexes,
  onTakeCapturedCard,
  onReturnCapturedCard,
  onContinue,
}: {
  reward: BattleReward;
  selectedCapturedIndexes: number[];
  onTakeCapturedCard: (index: number) => void;
  onReturnCapturedCard: (index: number) => void;
  onContinue: () => void;
}) {
  const { t } = useTranslation();
  const capturedCardIds = getCapturedCardIds(reward);
  const selectedIndexSet = new Set(selectedCapturedIndexes);

  return (
    <div className="battle-overlay aftermath-overlay">
      <main className="aftermath-board units-board prisoner-board">
        <header className="battle-header aftermath-header">
          <div>
            <p className="eyebrow">{t("battle.unitsEyebrow")}</p>
            <h1>{t("battle.unitsTitle")}</h1>
            <p>{t("battle.unitsInstruction")}</p>
          </div>
          <button className="button primary" onClick={onContinue}>{t("battle.continueToLoot")}</button>
        </header>

        <section className="exchange-grid loot-exchange aftermath-exchange">
          <div className="exchange-column aftermath-column">
            <header>
              <strong>{t("battle.availableUnits")}</strong>
              <span>{capturedCardIds.length - selectedCapturedIndexes.length}</span>
            </header>
            <div className="aftermath-card-list">
              {capturedCardIds.map((cardId, index) => !selectedIndexSet.has(index) ? (
                <PrisonerCard
                  key={`${cardId}-${index}`}
                  cardId={cardId}
                  label={t("battle.capturedPrisoner")}
                  note={t("battle.capturedPrisonerHint")}
                  direction="right"
                  onMove={() => onTakeCapturedCard(index)}
                />
              ) : null)}
              {capturedCardIds.length === selectedCapturedIndexes.length ? <p className="ledger-empty">{t("battle.noCapturedUnits")}</p> : null}
            </div>
          </div>

          <div className="exchange-column aftermath-column player-cargo">
            <header>
              <strong>{t("battle.yourUnits")}</strong>
              <span>{gameSession.prisonerCount + selectedCapturedIndexes.length}</span>
            </header>
            <div className="aftermath-card-list prisoner-collection">
              {gameSession.prisoners.map((stack) => (
                <PrisonerCard key={`existing-${stack.cardId}`} cardId={stack.cardId} label={t("battle.existingPrisoner")} quantity={stack.quantity} />
              ))}
              {selectedCapturedIndexes.map((index) => (
                <PrisonerCard
                  key={`pending-${capturedCardIds[index]}-${index}`}
                  cardId={capturedCardIds[index]}
                  label={t("battle.pendingPrisoner")}
                  direction="left"
                  onMove={() => onReturnCapturedCard(index)}
                />
              ))}
              {gameSession.prisoners.length === 0 && selectedCapturedIndexes.length === 0 ? <p className="ledger-empty">{t("warband.emptyPrisoners")}</p> : null}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function PrisonerCard({
  cardId,
  label,
  note,
  direction,
  quantity,
  onMove,
}: {
  cardId: string;
  label: string;
  note?: string;
  direction?: "left" | "right";
  quantity?: number;
  onMove?: () => void;
}) {
  const { t } = useTranslation();
  const definition = getCardDefinition(cardId);
  const portrait = definition.portraitImage ?? definition.cardImage;
  return (
    <article className="loot-choice prisoner-card">
      <span className="prisoner-art">
        {portrait ? <img src={portrait} alt="" style={{ objectPosition: `${definition.imageFocus?.x ?? 50}% ${definition.imageFocus?.y ?? 50}%` }} /> : <b>{t(definition.nameKey).slice(0, 1)}</b>}
      </span>
      <div className="prisoner-copy">
        <span>{label}</span>
        <strong className={`rarity-name ${definition.rarity}`}>{t(definition.nameKey)}{quantity ? ` ×${quantity}` : ""}</strong>
        <small>{definition.race.toUpperCase()} · TIER {definition.tier}</small>
        {note ? <small>{note}</small> : null}
      </div>
      {onMove && direction ? <button className="transfer-chevron" onClick={onMove}>{direction === "right" ? "›" : "‹"}</button> : null}
    </article>
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
            <ItemArtwork itemId={stack.itemId} />
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
            <ItemArtwork itemId={item.itemId} />
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

function ItemArtwork({ itemId }: { itemId: string }) {
  const { t } = useTranslation();
  const definition = itemsById.get(itemId);
  if (!definition) return <span className="loot-item-art">?</span>;
  return (
    <span className={`loot-item-art ${definition.type}`}>
      {definition.itemImage ? (
        <img
          src={definition.itemImage}
          alt=""
          style={{ objectPosition: `${definition.imageFocus?.x ?? 50}% ${definition.imageFocus?.y ?? 50}%` }}
        />
      ) : t(definition.nameKey).slice(0, 1)}
    </span>
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
  displayName,
}: {
  battle: BattleSimulation;
  card: CardInstance;
  side: "enemy" | "player";
  onInspect: (uid: string) => void;
  activeEvent: BattleAnimationEvent | null;
  visualSnapshot: BattleVisualSnapshot | null;
  targetable?: boolean;
  strategicTarget?: boolean;
  displayName?: string;
}) {
  const { t } = useTranslation();
  const definition = getCardDefinition(card.cardId);
  const displayedHp = visualSnapshot?.hpByUid.get(card.uid) ?? card.currentHp;
  const healthPercent = Math.max(0, (displayedHp / battle.getMaxHp(card)) * 100);
  const displayedAttack = visualSnapshot?.attackByUid.get(card.uid) ?? battle.getAttack(card);
  const displayedDefense = visualSnapshot?.defenseByUid.get(card.uid) ?? battle.getDefense(card);
  const displayedInitiative = visualSnapshot?.initiativeByUid.get(card.uid) ?? battle.getInitiative(card);
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
        <strong>{displayName ?? t(definition.nameKey)}</strong>
        <span className="portrait-stats" aria-label={`ATK ${displayedAttack}, DEF ${displayedDefense}, INI ${displayedInitiative}`}>
          <b>ATK {displayedAttack}</b>
          <b>DEF {displayedDefense}</b>
          <b>INI {displayedInitiative}</b>
        </span>
        <span className="portrait-hp"><i style={{ width: `${healthPercent}%` }} /></span>
        <em>{displayedHp}/{battle.getMaxHp(card)} HP</em>
      </span>
      <CombatFeedback uid={card.uid} event={activeEvent} />
    </button>
  );
}

function UnitDetailPanel({
  battle,
  card,
  visualSnapshot,
}: {
  battle: BattleSimulation;
  card: CardInstance;
  visualSnapshot: BattleVisualSnapshot | null;
}) {
  const { t } = useTranslation();
  const definition = getCardDefinition(card.cardId);
  const detailImage = definition.portraitImage ?? definition.cardImage;
  const displayedHp = visualSnapshot?.hpByUid.get(card.uid) ?? card.currentHp;
  const displayedAttack = visualSnapshot?.attackByUid.get(card.uid) ?? battle.getAttack(card);
  const displayedDefense = visualSnapshot?.defenseByUid.get(card.uid) ?? battle.getDefense(card);
  const displayedInitiative = visualSnapshot?.initiativeByUid.get(card.uid) ?? battle.getInitiative(card);
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
          <div><dt>ATK</dt><dd>{displayedAttack}</dd></div>
          <div><dt>DEF</dt><dd>{displayedDefense}</dd></div>
          <div><dt>INI</dt><dd>{displayedInitiative}</dd></div>
          <div><dt>HP</dt><dd>{displayedHp}/{battle.getMaxHp(card)}</dd></div>
        </dl>
      </div>
      <div className="unit-effect-copy">
        <small>{t("battle.cardEffect")}</small>
        {describeCardEffects(definition).map((description, index) => <span key={index}>{description}</span>)}
        {!describeCardEffects(definition).length ? <span>{t("battle.effects.none")}</span> : null}
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
      {label ? <h2>{label}</h2> : null}
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
  const displayedAttack = visualSnapshot?.attackByUid.get(card.uid) ?? battle.getAttack(card);
  const displayedDefense = visualSnapshot?.defenseByUid.get(card.uid) ?? battle.getDefense(card);
  const displayedInitiative = visualSnapshot?.initiativeByUid.get(card.uid) ?? battle.getInitiative(card);
  const isFieldUnit = battle.playerField.includes(card) || battle.enemyField.includes(card);
  const deploying = isFieldUnit && !battle.isUnitReady(card.uid);

  return (
    <button
      className={`battle-card ${card.isHero ? "hero" : ""} ${fieldPortrait ? "with-portrait" : ""} ${selected ? "selected" : ""} ${targetable ? "targetable" : ""} ${strategicTarget ? "strategic-target" : ""} ${deploying ? "deploying" : ""} ${motionClass}`}
      disabled={!onSelect && !onInspect}
      onClick={() => { onInspect?.(card.uid); onSelect?.(card.uid); }}
      title={deploying ? "Deploying · attacks next round" : undefined}
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
      {deploying ? <span className="deployment-status">DEPLOYING</span> : null}
      <span className="card-combat-copy">
        <strong className={`rarity-name ${definition.rarity}`}>
          {t(definition.nameKey)}
        </strong>
        <span className="card-stats">
          <b><small>ATK</small><span>{displayedAttack}</span></b>
          <b><small>DEF</small><span>{displayedDefense}</span></b>
          <b><small>INI</small><span>{displayedInitiative}</span></b>
        </span>
        <span className="hp-track">
          <span style={{ width: `${healthPercent}%` }} />
        </span>
        <span className="card-hp">
          {t("battle.hp")} {currentHp}/{definition.maxHp}
          {shield > 0 ? ` · SH ${shield}` : ""}
        </span>
      </span>
      <CombatFeedback uid={card.uid} event={activeEvent} />
    </button>
  );
}

function CombatFeedback({ uid, event }: { uid: string; event: BattleAnimationEvent | null }) {
  if (!event) return null;
  let shield = 0;
  let hp = 0;
  let heal = 0;
  let overkill = 0;
  let statCopy: string | null = null;
  if (event.type === "attack") {
    for (const hit of event.hits) {
      if (hit.defenderUid === uid) {
        shield += hit.shieldAbsorbed;
        hp += hit.hpDamage;
      }
      if (hit.overkillTargetUid === uid) overkill += hit.overkillDamage;
    }
  }
  if (event.type === "effect" || event.type === "leaderAction") {
    for (const result of event.results ?? []) {
      if (result.uid !== uid) continue;
      const hpDelta = result.hpAfter - result.hpBefore;
      const shieldDelta = result.shieldAfter - result.shieldBefore;
      if (hpDelta > 0) heal += hpDelta;
      if (hpDelta < 0) hp += -hpDelta;
      if (shieldDelta > 0) statCopy = `+${shieldDelta} SH`;
      if (shieldDelta < 0) shield += -shieldDelta;
    }
  }
  const statChange = (event.type === "effect" || event.type === "leaderAction")
    ? event.statChanges?.find((change) => change.uid === uid)
    : undefined;
  if (statChange) {
    const delta = statChange.after - statChange.before;
    statCopy = `${delta >= 0 ? "+" : ""}${delta} ${statChange.stat === "initiative" ? "INI" : statChange.stat.toUpperCase()}`;
  }
  if (!shield && !hp && !heal && !overkill && !statCopy) return null;
  return (
    <span className="combat-feedback" aria-live="polite">
      {shield > 0 ? <b className="shield-damage">-{shield} SH</b> : null}
      {hp > 0 ? <b className="hp-damage">-{hp} HP</b> : null}
      {overkill > 0 ? <b className="overkill-damage">OVERKILL -{overkill}</b> : null}
      {heal > 0 ? <b className="healing">+{heal} HP</b> : null}
      {statCopy ? <b className="stat-change">{statCopy}</b> : null}
    </span>
  );
}

function CombatLogDrawer({
  battle,
  open,
  onToggle,
}: {
  battle: BattleSimulation;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const rounds = new Map<number, BattleHistoryEntry[]>();
  for (const entry of battle.combatHistory) {
    const entries = rounds.get(entry.round) ?? [];
    entries.push(entry);
    rounds.set(entry.round, entries);
  }
  const latest = battle.combatHistory.at(-1);
  return (
    <aside className={`combat-log-drawer ${open ? "open" : "collapsed"}`}>
      <button className="combat-log-toggle" onClick={onToggle} aria-expanded={open}>
        <span>{t("battle.combatLog")}</span>
        <b>{open ? "×" : battle.combatHistory.length}</b>
      </button>
      {!open && latest ? <p className="combat-log-latest">{formatHistoryEntry(latest, battle, t)[0]}</p> : null}
      {open ? (
        <div className="combat-log-scroll">
          {[...rounds.entries()].reverse().map(([round, entries]) => (
            <section key={round}>
              <h3>{t("battle.turn", { turn: round })}</h3>
              <ol>
                {entries.flatMap((entry, entryIndex) => formatHistoryEntry(entry, battle, t).map((line, lineIndex) => (
                  <li key={`${entryIndex}-${lineIndex}`}>{line}</li>
                )))}
              </ol>
            </section>
          ))}
          {!battle.combatHistory.length ? <p>{t("battle.combatLogEmpty")}</p> : null}
        </div>
      ) : null}
    </aside>
  );
}

function formatHistoryEntry(
  entry: BattleHistoryEntry,
  battle: BattleSimulation,
  t: (key: string, options?: Record<string, unknown>) => string,
): string[] {
  const event = entry.event;
  const name = (cardId: string) => t(getCardDefinition(cardId).nameKey);
  if (event.type === "attack") return event.hits.map((hit) => {
    const shield = hit.shieldAbsorbed ? `, ${hit.shieldAbsorbed} shield` : "";
    const overkill = hit.overkillDamage ? `, ${hit.overkillDamage} overkill to leader` : "";
    return `${name(hit.attackerCardId)} → ${name(hit.defenderCardId)}: ${hit.damage} damage (ATK ${hit.attack} vs DEF ${hit.defense}; ${hit.hpDamage} HP${shield}${overkill})`;
  });
  if (event.type === "leaderAction") {
    const targets = event.affectedUids.map((uid) => getHistoryCardName(uid, battle, t)).join(", ");
    const change = event.statChanges?.[0];
    const healing = event.results?.reduce((sum, result) => sum + Math.max(0, result.hpAfter - result.hpBefore), 0) ?? 0;
    const shield = event.results?.reduce((sum, result) => sum + Math.max(0, result.shieldAfter - result.shieldBefore), 0) ?? 0;
    const detail = change
      ? ` (${change.stat.toUpperCase()} ${change.after - change.before >= 0 ? "+" : ""}${change.after - change.before})`
      : healing ? ` (+${healing} HP)`
        : shield ? ` (+${shield} shield)`
          : "";
    return [`${name(event.cardId)}: ${t(`battle.leaderActions.${event.actionId}`)}${detail}${targets ? ` → ${targets}` : ""}`];
  }
  if (event.type === "effect") {
    const targetNames = event.results.map((result) => name(result.cardId)).join(", ");
    const change = event.statChanges?.[0];
    const hpDamage = event.results.reduce((sum, result) => sum + Math.max(0, result.hpBefore - result.hpAfter), 0);
    const healing = event.results.reduce((sum, result) => sum + Math.max(0, result.hpAfter - result.hpBefore), 0);
    const shieldDamage = event.results.reduce((sum, result) => sum + Math.max(0, result.shieldBefore - result.shieldAfter), 0);
    const shieldGain = event.results.reduce((sum, result) => sum + Math.max(0, result.shieldAfter - result.shieldBefore), 0);
    const detail = change
      ? `${change.stat.toUpperCase()} ${change.after - change.before >= 0 ? "+" : ""}${change.after - change.before}`
      : event.action === "heal" ? `+${healing} HP`
        : event.action === "shield" ? `+${shieldGain} shield`
          : event.action === "damage" || event.action === "drain"
            ? `${event.action} ${hpDamage + shieldDamage} (${hpDamage} HP${shieldDamage ? `, ${shieldDamage} shield` : ""})`
          : `${event.action} ${event.value}`;
    return [`${name(event.cardId)}: ${detail}${targetNames ? ` → ${targetNames}` : ""}`];
  }
  const cardName = name(event.cardId);
  return [t(`battle.animation.${event.type}`, { card: cardName })];
}

function getHistoryCardName(
  uid: string,
  battle: BattleSimulation,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const visible = [battle.hero, battle.enemyLeader, ...battle.playerField, ...battle.enemyField, ...battle.hand, ...battle.enemyHand, ...battle.drawPile, ...battle.enemyDrawPile];
  const card = visible.find((candidate) => candidate.uid === uid);
  if (card) return t(getCardDefinition(card.cardId).nameKey);
  for (const { event } of battle.combatHistory) {
    if (event.type === "attack") {
      const hit = event.hits.find((candidate) => candidate.attackerUid === uid || candidate.defenderUid === uid);
      if (hit) return t(getCardDefinition(hit.attackerUid === uid ? hit.attackerCardId : hit.defenderCardId).nameKey);
    }
    if (event.type === "effect") {
      const result = event.results.find((candidate) => candidate.uid === uid);
      if (result) return t(getCardDefinition(result.cardId).nameKey);
    }
  }
  return t("battle.unknownTarget");
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
  if (event.type === "effect") {
    const classes: string[] = [];
    if (event.cardUid === uid) classes.push("effect-source");
    if (event.affectedUids.includes(uid)) classes.push(`effect-target effect-${event.action}`);
    return classes.join(" ");
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
  if (event.type === "effect") {
    const classes: string[] = [];
    if (event.cardUid === uid) classes.push("effect-source");
    if (event.affectedUids.includes(uid)) classes.push(`effect-target effect-${event.action}`);
    return classes.join(" ");
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
    ...battle.enemyHand,
    ...battle.enemyDrawPile,
    ...battle.playerField,
    ...battle.hand,
    ...battle.drawPile,
  ];
  return {
    enemyField: [...battle.enemyField],
    playerField: [...battle.playerField],
    hand: [...battle.hand],
    cardsByUid: new Map(visibleCards.map((card) => [card.uid, card])),
    hpByUid: new Map(visibleCards.map((card) => [card.uid, card.currentHp])),
    shieldByUid: new Map(
      visibleCards.map((card) => [card.uid, battle.getShield(card.uid)]),
    ),
    attackByUid: new Map(
      visibleCards.map((card) => [card.uid, battle.getAttack(card)]),
    ),
    defenseByUid: new Map(
      visibleCards.map((card) => [card.uid, battle.getDefense(card)]),
    ),
    initiativeByUid: new Map(
      visibleCards.map((card) => [card.uid, battle.getInitiative(card)]),
    ),
  };
}

function applyAnimationEventsToSnapshot(
  initial: BattleVisualSnapshot,
  events: BattleAnimationEvent[],
  animationIndex: number,
): BattleVisualSnapshot {
  if (animationIndex < 0) return initial;
  const snapshot: BattleVisualSnapshot = {
    ...initial,
    hpByUid: new Map(initial.hpByUid),
    shieldByUid: new Map(initial.shieldByUid),
    attackByUid: new Map(initial.attackByUid),
    defenseByUid: new Map(initial.defenseByUid),
    initiativeByUid: new Map(initial.initiativeByUid),
  };

  const subtract = (values: Map<string, number>, uid: string, amount: number) => {
    if (amount <= 0) return;
    values.set(uid, Math.max(0, (values.get(uid) ?? 0) - amount));
  };

  for (const event of events.slice(0, animationIndex + 1)) {
    if (event.type === "attack") {
      for (const hit of event.hits) {
        subtract(snapshot.shieldByUid, hit.defenderUid, hit.shieldAbsorbed);
        subtract(snapshot.hpByUid, hit.defenderUid, hit.hpDamage);
        if (hit.overkillTargetUid) {
          subtract(snapshot.hpByUid, hit.overkillTargetUid, hit.overkillDamage);
        }
      }
      continue;
    }
    if (event.type !== "effect" && event.type !== "leaderAction") continue;
    for (const result of event.results ?? []) {
      snapshot.hpByUid.set(result.uid, result.hpAfter);
      snapshot.shieldByUid.set(result.uid, result.shieldAfter);
    }
    for (const change of event.statChanges ?? []) {
      const values = change.stat === "def"
        ? snapshot.defenseByUid
        : change.stat === "initiative"
          ? snapshot.initiativeByUid
          : snapshot.attackByUid;
      values.set(change.uid, change.after);
    }
  }
  return snapshot;
}

function getAnimatedFieldCards(
  initialCards: CardInstance[],
  cardsByUid: Map<string, CardInstance>,
  events: BattleAnimationEvent[],
  animationIndex: number,
  side: "player" | "enemy",
): CardInstance[] {
  if (animationIndex < 0) return initialCards;
  const cards = [...initialCards];
  for (const [index, event] of events.entries()) {
    if (index > animationIndex) break;
    if (event.type === "summon" && event.side === side) {
      const card = cardsByUid.get(event.cardUid);
      if (card && !cards.some((candidate) => candidate.uid === card.uid)) cards.push(card);
    }
    if (event.type === "recall" && event.side === side && index < animationIndex) {
      const cardIndex = cards.findIndex((candidate) => candidate.uid === event.cardUid);
      if (cardIndex >= 0) cards.splice(cardIndex, 1);
    }
    if (
      event.type === "effect"
      && event.side === side
      && event.action === "returnToHand"
      && index < animationIndex
    ) {
      const cardIndex = cards.findIndex((candidate) => candidate.uid === event.cardUid);
      if (cardIndex >= 0) cards.splice(cardIndex, 1);
    }
  }
  return cards;
}

function getAnimatedPlayerHand(
  initialCards: CardInstance[],
  cardsByUid: Map<string, CardInstance>,
  events: BattleAnimationEvent[],
  animationIndex: number,
): CardInstance[] {
  if (animationIndex < 0) return initialCards;
  const cards = [...initialCards];
  for (const [index, event] of events.entries()) {
    if (index > animationIndex) break;
    if (event.type === "summon" && event.side === "player") {
      const cardIndex = cards.findIndex((candidate) => candidate.uid === event.cardUid);
      if (cardIndex >= 0) cards.splice(cardIndex, 1);
    }
    if (
      (event.type === "recall" && event.side === "player" && index < animationIndex)
      || (event.type === "draw" && event.side === "player")
    ) {
      const card = cardsByUid.get(event.cardUid);
      if (card && !cards.some((candidate) => candidate.uid === card.uid)) cards.push(card);
    }
    if (event.type === "effect" && event.side === "player") {
      const cardUids = event.action === "draw"
        ? event.affectedUids
        : event.action === "returnToHand" && index < animationIndex
          ? [event.cardUid]
          : [];
      for (const uid of cardUids) {
        const card = cardsByUid.get(uid);
        if (card && !cards.some((candidate) => candidate.uid === uid)) cards.push(card);
      }
    }
  }
  return cards;
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
    const totalDamage = event.hits.reduce((sum, hit) => sum + hit.damage, 0);
    if (event.hits.length === 1) {
      const hit = event.hits[0];
      return `${t(getCardDefinition(hit.attackerCardId).nameKey)} → ${t(getCardDefinition(hit.defenderCardId).nameKey)}: ${hit.damage} DMG`;
    }
    return `${t("battle.simultaneousAttack", { initiative: event.initiative })} · ${totalDamage} DMG`;
  }
  if (event.type === "leaderAction") {
    return `${t(getCardDefinition(event.cardId).nameKey)}: ${t(`battle.leaderActions.${event.actionId}`)}`;
  }
  if (event.type === "effect") {
    const cardName = t(getCardDefinition(event.cardId).nameKey);
    const change = event.statChanges?.[0];
    const action = change
      ? `${change.stat.toUpperCase()} ${change.after - change.before >= 0 ? "+" : ""}${change.after - change.before}`
      : event.action === "modifyStat" ? "stat change" : event.action.replace(/([A-Z])/g, " $1").toLowerCase();
    return `${cardName}: ${action}${change ? "" : ` ${event.value}`}`;
  }
  const cardName = t(getCardDefinition(event.cardId).nameKey);
  return t(`battle.animation.${event.type}`, { card: cardName });
}

