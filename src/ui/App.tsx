import { lazy, Suspense, useEffect, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { gameSession, WARBAND_INTERACTION_RANGE } from "../domain/session/GameSession";
import { getCardDefinition } from "../domain/cards/CardInstance";
import {
  getFactionRelation,
  PLAYER_FACTION_ID,
} from "../domain/quests/Factions";
import { estimateWarbandStrength } from "../domain/world/WorldWarbands";
import { itemsById } from "../content/content";
import { IndexedDbSaveRepository } from "../infrastructure/save/IndexedDbSaveRepository";
import type { SaveGame } from "../infrastructure/save/SaveRepository";
import { GameCanvas } from "./GameCanvas";
import { BattleScreen } from "./BattleScreen";
import { CityMenu } from "./CityMenu";
import { WorldMapControls } from "./WorldMapControls";
import { StartMenu } from "./StartMenu";
import { getTerrainBattleModifiers } from "../domain/world/WorldTerrain";

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
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [startMenuOpen, setStartMenuOpen] = useState(true);
  const [storedSave, setStoredSave] = useState<SaveGame | null>(null);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [ready, setReady] = useState(false);
  const [, refresh] = useState(0);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const nearbyLocation = gameSession.world.nearbyLocation;
  const nearbyCaravan = gameSession.nearbyCaravan;
  const selectedWarband = gameSession.interactableSelectedWarband;
  const selectedWarbandDistance = selectedWarband
    ? gameSession.selectedWarbandDistance
    : Number.POSITIVE_INFINITY;
  const selectedWarbandRelation = selectedWarband
    ? getFactionRelation(
        PLAYER_FACTION_ID,
        selectedWarband.factionId,
        gameSession.factionState,
      )
    : null;
  const foodDays =
    gameSession.dailyFoodRequirement > 0
      ? gameSession.rationCount / gameSession.dailyFoodRequirement
      : Number.POSITIVE_INFINITY;
  const foodDaysLabel = Number.isFinite(foodDays)
    ? foodDays >= 10
      ? `${Math.floor(foodDays)}d`
      : `${foodDays.toFixed(1)}d`
    : "\u221e";
  const moraleFace =
    gameSession.morale >= 80
      ? "\u2726"
      : gameSession.morale >= 55
        ? "\u2727"
        : gameSession.morale >= 30
          ? "\u2736"
          : "\u2737";
  const terrainBattle = getTerrainBattleModifiers(gameSession.currentTerrain);
  const terrainTooltip = [
    `${t(`terrain.${gameSession.currentTerrain}.name`)}`,
    `${t("hud.speed")} \u00d7${gameSession.terrainMovementMultiplier.toFixed(2)}`,
    `${t("hud.terrainFood")} \u00d7${gameSession.terrainFoodMultiplier.toFixed(2)}`,
    `${t("hud.sight")} ${gameSession.visibilityRadius}m`,
    `${t("hud.attack")} ${Math.round(terrainBattle.playerAttack * 100)}%`,
    `${t("hud.defense")} ${Math.round(terrainBattle.playerDefense * 100)}%`,
  ].join("\n");
  const dayMinutes = gameSession.timeState.totalMinutes % 1440;
  const clockRotation = (dayMinutes / 1440) * 360;
  const hasCharacterLevelUp =
    gameSession.characterState.attributePoints > 0 ||
    gameSession.characterState.skillPoints > 0;

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

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape" || gameSession.mode !== "world") return;
      if (
        warbandOpen ||
        inventoryOpen ||
        questOpen ||
        characterOpen ||
        cityMenuOpen ||
        mapOpen
      ) {
        return;
      }
      event.preventDefault();
      setSideMenuOpen(false);
      setStartMenuOpen(true);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    warbandOpen,
    inventoryOpen,
    questOpen,
    characterOpen,
    cityMenuOpen,
    mapOpen,
  ]);

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

  function followSelectedWarband(): void {
    if (!selectedWarband) return;
    gameSession.pursueWarband(selectedWarband.id);
  }

  function joinSelectedWarbandBattle(): void {
    if (!selectedWarband?.activeBattleId) return;
    if (selectedWarbandDistance > 86) {
      gameSession.pursueWarband(selectedWarband.id);
      return;
    }
    gameSession.joinWarbandBattle(selectedWarband.activeBattleId, selectedWarband.id);
  }

  function talkToSelectedWarband(kind: "talk" | "info"): void {
    if (!selectedWarband) return;
    setSaveMessage(
      t(`world.warbandInteraction.${kind}Result`, {
        name: t(selectedWarband.nameKey),
      }),
    );
    window.setTimeout(() => setSaveMessage(null), 3200);
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
          ? t("battle.prisonerReward", { card: cardName })
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
          <span
            className="hud-chip"
            title={t("hud.goldTooltip", { wages: gameSession.weeklyWageCost })}
          >
            <span className="hud-icon">{"\u25cf"}</span>
            <span className="hud-label">{t("hud.gold")}</span>
            <strong>{gameSession.gold}</strong>
          </span>
          <span className="hud-chip" title={t("warband.capacity")}>
            <span className="hud-icon">{"\u2694"}</span>
            <span className="hud-label">{t("hud.deck")}</span>
            <strong>{gameSession.warband.length}/{gameSession.warbandCapacity}</strong>
          </span>
          <span className={`hud-chip morale-chip morale-${moraleMood(gameSession.morale)}`}>
            <span className="hud-icon">{moraleFace}</span>
            <span className="hud-label">{t("hud.morale")}</span>
            <strong>{gameSession.morale}</strong>
          </span>
          <span
            className="hud-chip"
            title={`${gameSession.rationCount}/${gameSession.foodCapacity} \u00b7 -${gameSession.dailyFoodRequirement}/${t("hud.dayShort")}`}
          >
            <span className="hud-icon">{"\u25e7"}</span>
            <span className="hud-label">{t("hud.food")}</span>
            <strong>{foodDaysLabel}</strong>
          </span>
          <span className="hud-chip">
            <span className="hud-icon arrows">{"\u00bb\u00bb\u00bb"}</span>
            <span className="hud-label">{t("hud.speed")}</span>
            <strong>{gameSession.effectiveMovementSpeed}</strong>
          </span>
          <span className="hud-chip terrain-chip" title={terrainTooltip}>
            <span className="hud-icon">{"\u25c6"}</span>
            <span className="hud-label">{t("hud.terrain")}</span>
            <strong>{t(`terrain.${gameSession.currentTerrain}.name`)}</strong>
          </span>
        </div>
      </header>

      <aside
        className={`context-prompt ${
          selectedWarband || nearbyLocation || nearbyCaravan ? "" : "hidden"
        }`}
      >
        <span className="eyebrow">{t("hud.region")}</span>
        <h1>
          {selectedWarband
            ? t(selectedWarband.nameKey)
            : nearbyLocation
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
          {selectedWarband
            ? t("world.warbandInteraction.description", {
                faction: t(`faction.${selectedWarband.factionId}.name`),
                type: t(`world.warbandType.${selectedWarband.type}`),
                strength: Math.round(estimateWarbandStrength(selectedWarband)),
                units: selectedWarband.unitIds.length,
                state: t(`world.warbandState.${selectedWarband.state}`),
              })
            : nearbyLocation
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
          <span className={nearbyLocation?.type === "city" || selectedWarbandRelation === "friendly" || selectedWarbandRelation === "allied" ? "status safe" : "status danger"}>
            {t(
              selectedWarbandRelation
                ? `world.relation.${selectedWarbandRelation}`
                : nearbyLocation?.type === "city"
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
        {selectedWarband ? (
          <>
            <div className="location-faction">
              <span className={`faction-seal ${selectedWarband.factionId}`} />
              <strong>{t(`faction.${selectedWarband.factionId}.name`)}</strong>
              <em>
                {t("world.warbandInteraction.distance", {
                  distance: Math.round(selectedWarbandDistance),
                })}
              </em>
            </div>
            <div className="location-actions">
              <button className="button primary" onClick={followSelectedWarband}>
                {t("world.warbandInteraction.follow")}
              </button>
              {selectedWarband.activeBattleId ? (
                <button className="button danger" onClick={joinSelectedWarbandBattle}>
                  {t(
                    selectedWarbandDistance <= 86
                      ? "world.warbandInteraction.joinBattle"
                      : "world.warbandInteraction.travelToBattle",
                  )}
                </button>
              ) : null}
              {selectedWarbandRelation !== "hostile" ? (
                <>
                  <button
                    className="button ghost"
                    onClick={() => talkToSelectedWarband("talk")}
                  >
                    {t("world.warbandInteraction.talk")}
                  </button>
                  <button
                    className="button ghost"
                    onClick={() => talkToSelectedWarband("info")}
                  >
                    {t("world.warbandInteraction.info")}
                  </button>
                </>
              ) : null}
              <button
                className="button ghost"
                onClick={() => gameSession.selectWarband(null)}
              >
                {t("world.warbandInteraction.close")}
              </button>
              <span className="interaction-range-note">
                {t("world.warbandInteraction.range", {
                  distance: WARBAND_INTERACTION_RANGE,
                })}
              </span>
            </div>
          </>
        ) : null}
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

      {ready && gameSession.mode === "world" && !startMenuOpen ? (
        <aside className="right-hud" aria-label={t("hud.menu")}>
          <WorldMapControls onOpenMap={() => setMapOpen(true)} />
          <div className="time-orb" title={`${t("hud.day", { day: gameSession.gameDay })} \u00b7 ${gameSession.gameTimeLabel}`}>
            <span className="clock-face">
              <span
                className="clock-hand"
                style={{ transform: `translateX(-50%) rotate(${clockRotation}deg)` }}
              />
            </span>
            <span>
              <strong>{t("hud.day", { day: gameSession.gameDay })}</strong>
              <small>{gameSession.gameTimeLabel}</small>
            </span>
          </div>
          <button
            className={`side-menu-toggle ${sideMenuOpen ? "open" : ""}`}
            type="button"
            onClick={() => setSideMenuOpen((open) => !open)}
            aria-expanded={sideMenuOpen}
          >
            <span>{"\u2630"}</span>
            <strong>{t("startMenu.open")}</strong>
          </button>
          <nav className={`side-menu ${sideMenuOpen ? "open" : "collapsed"}`}>
            <button
              className="side-menu-button"
              disabled={!ready || gameSession.mode !== "world"}
              onClick={() => {
                setSideMenuOpen(false);
                setQuestOpen(true);
              }}
              title={t("quests.open", { count: gameSession.activeQuests.length })}
            >
              <span>!</span>
              <small>{t("quests.short")}</small>
              {gameSession.activeQuests.length > 0 ? (
                <em>{gameSession.activeQuests.length}</em>
              ) : null}
            </button>
            <button
              className="side-menu-button"
              disabled={!ready || gameSession.mode !== "world"}
              onClick={() => {
                setSideMenuOpen(false);
                setInventoryOpen(true);
              }}
              title={t(
                gameSession.marketProfile
                  ? "trade.openMarket"
                  : "trade.openInventory",
              )}
            >
              <span>{"\u25c8"}</span>
              <small>{gameSession.marketProfile ? t("trade.marketShort") : t("trade.inventory")}</small>
            </button>
            <button
              className="side-menu-button"
              disabled={!ready}
              onClick={() => {
                setSideMenuOpen(false);
                setWarbandOpen(true);
              }}
              title={t("warband.open")}
            >
              <span>{"\u2694"}</span>
              <small>{t("warband.short")}</small>
            </button>
            <button
              className={`side-menu-button ${hasCharacterLevelUp ? "attention" : ""}`}
              disabled={!ready}
              onClick={() => {
                setSideMenuOpen(false);
                setCharacterOpen(true);
              }}
              title={t("character.open")}
            >
              <span>{"\u2726"}</span>
              <small>{t("character.short")}</small>
              {hasCharacterLevelUp ? <em>+</em> : null}
            </button>
          </nav>
          {saveMessage ? <span className="toast">{saveMessage}</span> : null}
        </aside>
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

function moraleMood(morale: number): "high" | "steady" | "low" | "angry" {
  if (morale >= 80) return "high";
  if (morale >= 55) return "steady";
  if (morale >= 30) return "low";
  return "angry";
}
