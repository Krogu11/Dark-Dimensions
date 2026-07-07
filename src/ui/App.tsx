import { lazy, Suspense, useEffect, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { gameSession } from "../domain/session/GameSession";
import { getCardDefinition } from "../domain/cards/CardInstance";
import { itemsById } from "../content/content";
import { IndexedDbSaveRepository } from "../infrastructure/save/IndexedDbSaveRepository";
import type { SaveGame } from "../infrastructure/save/SaveRepository";
import { GameCanvas } from "./GameCanvas";
import { BattleScreen } from "./BattleScreen";
import { CityMenu } from "./CityMenu";
import { WorldMapControls } from "./WorldMapControls";
import { StartMenu } from "./StartMenu";

const WarbandManager = lazy(() => import("./WarbandManager"));
const InventoryMarket = lazy(() => import("./InventoryMarket"));
const QuestBoard = lazy(() => import("./QuestBoard"));
const StrategicMap = lazy(() => import("./StrategicMap"));
const CharacterSheet = lazy(() => import("./CharacterSheet"));
const saveRepository = new IndexedDbSaveRepository();

export function App() {
  const { t } = useTranslation();
  const [warbandOpen, setWarbandOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [questOpen, setQuestOpen] = useState(false);
  const [characterOpen, setCharacterOpen] = useState(false);
  const [cityMenuOpen, setCityMenuOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [startMenuOpen, setStartMenuOpen] = useState(true);
  const [storedSave, setStoredSave] = useState<SaveGame | null>(null);
  const [sessionStarted, setSessionStarted] = useState(false);
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
          setCharacterOpen(false);
          setCityMenuOpen(false);
          setMapOpen(false);
        }
        refresh((value) => value + 1);
      }),
    [],
  );

  useEffect(() => {
    gameSession.uiBlocked =
      startMenuOpen ||
      warbandOpen ||
      inventoryOpen ||
      questOpen ||
      characterOpen ||
      cityMenuOpen ||
      mapOpen;
    return () => {
      gameSession.uiBlocked = false;
    };
  }, [
    startMenuOpen,
    warbandOpen,
    inventoryOpen,
    questOpen,
    characterOpen,
    cityMenuOpen,
    mapOpen,
  ]);

  useEffect(() => {
    void saveRepository.read().then((save) => {
      setStoredSave(save);
      setReady(true);
    });
  }, []);

  function continueGame(): void {
    if (!sessionStarted && storedSave) gameSession.restore(storedSave);
    setSessionStarted(true);
    setStartMenuOpen(false);
  }

  async function startNewGame(): Promise<void> {
    await saveRepository.delete();
    gameSession.reset();
    setStoredSave(null);
    setSessionStarted(true);
    setStartMenuOpen(false);
  }

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

  function prepareVictory(): ReturnType<typeof gameSession.prepareVictoryReward> {
    return gameSession.prepareVictoryReward();
  }

  function claimVictory(
    selection: Parameters<typeof gameSession.claimVictoryReward>[0],
  ): ReturnType<typeof gameSession.claimVictoryReward> {
    const reward = gameSession.claimVictoryReward(selection);
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
      <div className="desktop-required">
        <span className="eyebrow">{t("app.desktopOnlyEyebrow")}</span>
        <h1>{t("app.desktopOnlyTitle")}</h1>
        <p>{t("app.desktopOnlyText")}</p>
      </div>
      {ready && startMenuOpen ? (
        <StartMenu
          canContinue={sessionStarted || storedSave !== null}
          hasStoredSave={storedSave !== null}
          onContinue={continueGame}
          onNewGame={startNewGame}
        />
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
            {t("hud.speed")} <strong>{gameSession.effectiveMovementSpeed}</strong>
          </span>
          <span>
            {t("hud.terrain")}{" "}
            <strong>{t(`terrain.${gameSession.currentTerrain}.name`)}</strong>
          </span>
          <span>{t("hud.worldSeed")} <strong>{gameSession.worldSeed}</strong></span>
        </div>
      </header>

      <aside
        className={`context-prompt ${
          nearbyLocation || nearbyCaravan ? "" : "hidden"
        }`}
      >
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
            {t("hud.speed")} {gameSession.effectiveMovementSpeed}
          </span>
          <span>
            {t("hud.terrain")} {t(`terrain.${gameSession.currentTerrain}.name`)}
          </span>
          <span>
            {t("hud.terrainFood")} ×{gameSession.terrainFoodMultiplier.toFixed(2)}
          </span>
          <span>
            {t("hud.cargo")} {gameSession.cargoWeight.toFixed(1)}/{gameSession.maxCargoWeight}
          </span>
          <span>
            {t("hud.morale")} {gameSession.morale}
          </span>
          <span>
            {t("hud.food")} {gameSession.rationCount}/{gameSession.foodCapacity}
            {" · "}-{gameSession.dailyFoodRequirement}/{t("hud.dayShort")}
          </span>
          <span>
            {t("hud.wages")} {gameSession.weeklyWageCost}g
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
        {nearbyCaravan && gameSession.mode === "world" ? (
          <div className="location-actions">
            <button
              className="button primary"
              onClick={() => setInventoryOpen(true)}
            >
              {t("trade.openMarket")}
            </button>
          </div>
        ) : null}
      </aside>

      {ready &&
      gameSession.mode === "world" &&
      !warbandOpen &&
      !inventoryOpen &&
      !questOpen &&
      !characterOpen &&
      !cityMenuOpen &&
      !mapOpen ? (
        <WorldMapControls onOpenMap={() => setMapOpen(true)} />
      ) : null}

      {nearbyLocation?.type !== "city" && !cityMenuOpen && !mapOpen ? (
      <div className="save-panel">
        <button
          className="button ghost"
          disabled={!ready || gameSession.mode !== "world"}
          onClick={() => setStartMenuOpen(true)}
        >
          {t("startMenu.open")}
        </button>
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
        <button
          className="button ghost"
          disabled={!ready}
          onClick={() => setCharacterOpen(true)}
        >
          {t("character.open")}
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
          onCharacter={() => openCityService(setCharacterOpen)}
          onQuests={() => openCityService(setQuestOpen)}
          onHeal={healDeck}
          onSave={() => void saveGame()}
          onLeave={() => setCityMenuOpen(false)}
        />
      ) : null}
      {gameSession.mode === "battle" && gameSession.battle ? (
        <BattleScreen
          battle={gameSession.battle}
          onPrepareVictory={prepareVictory}
          onClaimVictory={claimVictory}
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
      {characterOpen ? (
        <Suspense fallback={<div className="loading">{t("app.loading")}</div>}>
          <CharacterSheet
            returnToCity={gameSession.isInCity}
            onClose={() => closeCityService(setCharacterOpen)}
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
      {mapOpen ? (
        <Suspense fallback={<div className="loading">{t("app.loading")}</div>}>
          <StrategicMap onClose={() => setMapOpen(false)} />
        </Suspense>
      ) : null}
    </main>
  );
}
