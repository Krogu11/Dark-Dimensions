import { lazy, Suspense, useEffect, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { gameSession } from "../domain/session/GameSession";
import { getCardDefinition } from "../domain/cards/CardInstance";
import { itemsById } from "../content/content";
import { IndexedDbSaveRepository } from "../infrastructure/save/IndexedDbSaveRepository";
import { GameCanvas } from "./GameCanvas";
import { BattleScreen } from "./BattleScreen";
import { CityMenu } from "./CityMenu";
import { TouchJoystick } from "./TouchJoystick";

const WarbandManager = lazy(() => import("./WarbandManager"));
const InventoryMarket = lazy(() => import("./InventoryMarket"));
const QuestBoard = lazy(() => import("./QuestBoard"));
const saveRepository = new IndexedDbSaveRepository();

export function App() {
  const { t } = useTranslation();
  const [warbandOpen, setWarbandOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [questOpen, setQuestOpen] = useState(false);
  const [cityMenuOpen, setCityMenuOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [, refresh] = useState(0);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const nearbyLocation = gameSession.world.nearbyLocation;
  const nearbyCaravan = gameSession.nearbyCaravan;

  useEffect(
    () =>
      gameSession.subscribe(() => {
        if (gameSession.mode === "battle") {
          setWarbandOpen(false);
          setInventoryOpen(false);
          setQuestOpen(false);
          setCityMenuOpen(false);
        }
        refresh((value) => value + 1);
      }),
    [],
  );

  useEffect(() => {
    gameSession.uiBlocked =
      warbandOpen || inventoryOpen || questOpen || cityMenuOpen;
    return () => {
      gameSession.uiBlocked = false;
    };
  }, [warbandOpen, inventoryOpen, questOpen, cityMenuOpen]);

  useEffect(() => {
    void saveRepository.read().then((save) => {
      if (save) gameSession.restore(save);
      setReady(true);
    });
  }, []);

  async function saveGame(): Promise<void> {
    const saved = await gameSession.save(saveRepository);
    setSaveMessage(t(saved ? "hud.saved" : "hud.saveBlocked"));
    window.setTimeout(() => setSaveMessage(null), 2600);
  }

  function healDeck(): void {
    const healed = gameSession.healDeck();
    setSaveMessage(t(healed ? "hud.healed" : "hud.healBlocked"));
    window.setTimeout(() => setSaveMessage(null), 2600);
  }

  function finishVictory(): ReturnType<typeof gameSession.finishVictory> {
    return processVictory(true);
  }

  function retreatAfterVictory(): ReturnType<typeof gameSession.finishVictory> {
    return processVictory(false);
  }

  function processVictory(
    continueDungeon: boolean,
  ): ReturnType<typeof gameSession.finishVictory> {
    const reward = gameSession.finishVictory(continueDungeon);
    if (reward) {
      const cardName = reward.cardId
        ? t(getCardDefinition(reward.cardId).nameKey)
        : null;
      const rewardParts = [t("battle.goldReward", { gold: reward.gold })];
      rewardParts.push(
        cardName
          ? t("battle.cardReward", { card: cardName })
          : t("battle.noCardReward"),
      );
      for (const item of reward.items) {
        rewardParts.push(
          t("battle.itemReward", {
            item: t(itemsById.get(item.itemId)!.nameKey),
            quantity: item.quantity,
          }),
        );
      }
      setSaveMessage(rewardParts.join(" · "));
      window.setTimeout(() => setSaveMessage(null), 4200);
    }
    return reward;
  }

  function runLocationAction(): void {
    if (!nearbyLocation) return;
    const result = gameSession.resolveLocationEvent(nearbyLocation.id);
    if (result.kind === "gold") {
      setSaveMessage(t("locationActions.goldResult", { amount: result.amount }));
    } else if (result.kind === "danger") {
      setSaveMessage(t("locationActions.dangerResult", { amount: result.amount }));
    } else if (result.kind === "alreadyVisited") {
      setSaveMessage(t("locationActions.alreadyVisited"));
    }
    window.setTimeout(() => setSaveMessage(null), 3600);
  }

  function startLocationEncounter(): void {
    if (!nearbyLocation) return;
    if (nearbyLocation.type === "dungeon") {
      gameSession.enterDungeon(nearbyLocation.id);
    } else if (nearbyLocation.type === "castle") {
      gameSession.challengeCastle(nearbyLocation.id);
    }
  }

  function openCityService(
    setServiceOpen: (open: boolean) => void,
  ): void {
    setCityMenuOpen(false);
    setServiceOpen(true);
  }

  function closeCityService(
    setServiceOpen: (open: boolean) => void,
  ): void {
    setServiceOpen(false);
    if (gameSession.isInCity) setCityMenuOpen(true);
  }

  function finishDefeat(): void {
    void saveRepository.read().then((save) => {
      if (save) gameSession.restore(save);
      else gameSession.reset();
    });
  }

  return (
    <main className="game-shell">
      {ready ? (
        <GameCanvas key={gameSession.worldSeed} />
      ) : (
        <div className="loading">{t("app.loading")}</div>
      )}
      <div
        className={`world-visibility ${gameSession.isNight ? "night" : "day"}`}
        style={
          {
            "--visibility-radius": `${gameSession.visibilityRadius}px`,
          } as CSSProperties
        }
      />
      {ready &&
      gameSession.mode === "world" &&
      !warbandOpen &&
      !inventoryOpen &&
      !questOpen &&
      !cityMenuOpen ? (
        <TouchJoystick />
      ) : null}
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">DD</span>
          <span>
            <strong>{t("app.title")}</strong>
            <small>{t("app.subtitle")}</small>
          </span>
        </div>
        <div className="resource-strip">
          <span>{t("hud.gold")} <strong>{gameSession.gold}</strong></span>
          <span>
            {t("hud.deck")}{" "}
            <strong>{gameSession.warband.length}/{gameSession.warbandCapacity}</strong>
          </span>
          <span>
            {t("hud.strength")} <strong>{gameSession.warbandThreatRating}</strong>
          </span>
          <span>
            {t("hud.morale")} <strong>{gameSession.morale}</strong>
          </span>
          <span>
            {t("hud.food")}{" "}
            <strong>
              {gameSession.rationCount}/{gameSession.foodCapacity}
            </strong>
          </span>
          <span>
            {t("hud.time")}{" "}
            <strong>
              {t("hud.day", { day: gameSession.gameDay })} {gameSession.gameTimeLabel}
            </strong>
          </span>
          <span>
            {t("hud.speed")} <strong>{gameSession.partyMovementSpeed}</strong>
          </span>
          <span>{t("hud.worldSeed")} <strong>{gameSession.worldSeed}</strong></span>
        </div>
      </header>

      <aside className="location-card">
        <span className="eyebrow">{t("hud.region")}</span>
        <h1>
          {nearbyLocation
            ? t(nearbyLocation.nameKey)
            : nearbyCaravan
              ? t(
                  nearbyCaravan.kind === "villager"
                    ? "trade.villagerName"
                    : "trade.caravanName",
                )
              : t("hud.unknown")}
        </h1>
        <p>
          {nearbyLocation
            ? t(nearbyLocation.descriptionKey)
            : nearbyCaravan
              ? t(
                  nearbyCaravan.kind === "villager"
                    ? "trade.villagerDescription"
                    : "trade.caravanDescription",
                )
              : "No walls. No witnesses. Only the road ahead."}
        </p>
        <div className="status-line">
          <span className={nearbyLocation?.type === "city" ? "status safe" : "status danger"}>
            {t(
              nearbyLocation?.type === "city"
                ? "hud.safe"
                : nearbyCaravan
                  ? "trade.merchant"
                  : "hud.danger",
            )}
          </span>
          <span>{t("hud.controls")}</span>
        </div>
        <div className="travel-readout">
          <span>
            {t("hud.day", { day: gameSession.gameDay })} · {gameSession.gameTimeLabel}
          </span>
          <span>
            {t("hud.speed")} {gameSession.partyMovementSpeed}
          </span>
          <span>
            {t("hud.cargo")} {gameSession.cargoWeight.toFixed(1)}
          </span>
          <span>
            {t("hud.morale")} {gameSession.morale}
          </span>
          <span>
            {t("hud.food")} {gameSession.rationCount}/{gameSession.foodCapacity}
            {" · "}-{gameSession.dailyFoodRequirement}/{t("hud.dayShort")}
          </span>
          <span>
            {t("hud.wages")} {gameSession.dailyWageCost}g
          </span>
        </div>
        {gameSession.survivalState.lastUpkeep ? (
          <p
            className={
              gameSession.survivalState.lastUpkeep.moraleChange < 0
                ? "upkeep-report warning"
                : "upkeep-report"
            }
          >
            {t("hud.lastUpkeep", {
              gold: gameSession.survivalState.lastUpkeep.wagesPaid,
              food: gameSession.survivalState.lastUpkeep.foodConsumed,
              morale: gameSession.survivalState.lastUpkeep.moraleChange,
            })}
          </p>
        ) : null}
        <p className="hostile-hint">{t("hud.hostiles")}</p>
        {nearbyLocation && gameSession.currentFactionId ? (
          <div className="location-faction">
            <span className={`faction-seal ${gameSession.currentFactionId}`} />
            <strong>{t(`faction.${gameSession.currentFactionId}.name`)}</strong>
            <em>
              {t("quests.reputation", {
                value: gameSession.currentFactionReputation,
              })}
            </em>
          </div>
        ) : null}
        {nearbyLocation?.type === "city" &&
        gameSession.mode === "world" ? (
          <div className="location-actions">
            <button
              className="button primary"
              onClick={() => setCityMenuOpen(true)}
            >
              {t("city.enter")}
            </button>
          </div>
        ) : null}
        {nearbyLocation &&
        nearbyLocation.type !== "city" &&
        gameSession.mode === "world" ? (
          <div className="location-actions">
            {nearbyLocation.type === "dungeon" ? (
              <button className="button danger" onClick={startLocationEncounter}>
                {t(
                  gameSession.completedLocationIds.has(nearbyLocation.id)
                    ? "locationActions.reenterDungeon"
                    : "locationActions.enterDungeon",
                )}
              </button>
            ) : null}
            {nearbyLocation.type === "castle" ? (
              <button className="button danger" onClick={startLocationEncounter}>
                {t("locationActions.challengeCastle")}
              </button>
            ) : null}
            {["village", "landmark", "wilds"].includes(nearbyLocation.type) ? (
              <button
                className="button ghost"
                disabled={gameSession.completedLocationIds.has(nearbyLocation.id)}
                onClick={runLocationAction}
              >
                {t(
                  gameSession.completedLocationIds.has(nearbyLocation.id)
                    ? "locationActions.completed"
                    : `locationActions.${nearbyLocation.type}`,
                )}
              </button>
            ) : null}
          </div>
        ) : null}
      </aside>

      {nearbyLocation?.type !== "city" && !cityMenuOpen ? (
      <div className="save-panel">
        <button
          className="button ghost"
          disabled={!ready || gameSession.mode !== "world"}
          onClick={() => setQuestOpen(true)}
        >
          {t("quests.open", { count: gameSession.activeQuests.length })}
        </button>
        <button
          className="button ghost"
          disabled={!ready || gameSession.mode !== "world"}
          onClick={() => setInventoryOpen(true)}
        >
          {t(
            gameSession.marketProfile
              ? "trade.openMarket"
              : "trade.openInventory",
          )}
        </button>
        <button
          className="button ghost"
          disabled={!ready}
          onClick={() => setWarbandOpen(true)}
        >
          {t("warband.open")}
        </button>
        {saveMessage ? <span className="toast">{saveMessage}</span> : null}
      </div>
      ) : null}
      {cityMenuOpen && nearbyLocation?.type === "city" ? (
        <CityMenu
          city={nearbyLocation}
          message={saveMessage}
          onMarket={() => openCityService(setInventoryOpen)}
          onWarband={() => openCityService(setWarbandOpen)}
          onQuests={() => openCityService(setQuestOpen)}
          onHeal={healDeck}
          onSave={() => void saveGame()}
          onLeave={() => setCityMenuOpen(false)}
        />
      ) : null}
      {gameSession.mode === "battle" && gameSession.battle ? (
        <BattleScreen
          battle={gameSession.battle}
          onVictory={finishVictory}
          onDefeat={finishDefeat}
          encounterLabel={
            gameSession.dungeonRun
              ? t("locationActions.dungeonStage", {
                  stage: gameSession.dungeonRun.stage,
                  total: gameSession.dungeonRun.totalStages,
                })
              : gameSession.battleContext === "castle"
                ? t("locationActions.castleBattle")
                : undefined
          }
          victoryPrimaryLabel={
            gameSession.canContinueDungeon
              ? t("locationActions.descend")
              : undefined
          }
          victorySecondaryLabel={
            gameSession.canContinueDungeon
              ? t("locationActions.retreatDungeon")
              : undefined
          }
          onVictorySecondary={
            gameSession.canContinueDungeon ? retreatAfterVictory : undefined
          }
        />
      ) : null}
      {warbandOpen ? (
        <Suspense fallback={<div className="loading">{t("app.loading")}</div>}>
          <WarbandManager
            returnToCity={gameSession.isInCity}
            onClose={() => closeCityService(setWarbandOpen)}
          />
        </Suspense>
      ) : null}
      {inventoryOpen ? (
        <Suspense fallback={<div className="loading">{t("app.loading")}</div>}>
          <InventoryMarket
            returnToCity={gameSession.isInCity}
            onClose={() => closeCityService(setInventoryOpen)}
          />
        </Suspense>
      ) : null}
      {questOpen ? (
        <Suspense fallback={<div className="loading">{t("app.loading")}</div>}>
          <QuestBoard
            returnToCity={gameSession.isInCity}
            onClose={() => closeCityService(setQuestOpen)}
          />
        </Suspense>
      ) : null}
    </main>
  );
}
