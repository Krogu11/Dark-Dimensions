import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from "react";
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
import { VillageMenu } from "./VillageMenu";
import { WorldMapControls } from "./WorldMapControls";
import { StartMenu } from "./StartMenu";
import { CharacterCreator } from "./CharacterCreator";
import { PauseMenu } from "./PauseMenu";
import { TitleMusic } from "./TitleMusic";
import type { RunProfile } from "../domain/character/CharacterOrigins";
import { getTerrainBattleModifiers } from "../domain/world/WorldTerrain";
import { SoulTempleMenu } from "./SoulTempleMenu";
import { SoulCallingTutorial, SoulQuestCompletion } from "./SoulCallingTutorial";
import { LordMenu } from "./LordMenu";
import { SoulQuestTracker } from "./SoulQuestTracker";
import { focusWorldCamera } from "../phaser/WorldCameraEvents";
import type { MapLocation } from "../domain/content/schemas";
import type { WorldWarbandState } from "../domain/world/WorldWarbands";

const WarbandManager = lazy(() => import("./WarbandManager"));
const RecruitmentScreen = lazy(() => import("./RecruitmentScreen"));
const InventoryMarket = lazy(() => import("./InventoryMarket"));
const QuestBoard = lazy(() => import("./QuestBoard"));
const StrategicMap = lazy(() => import("./StrategicMap"));
const CharacterSheet = lazy(() => import("./CharacterSheet"));
const FactionCodex = lazy(() => import("./FactionCodex"));
const saveRepository = new IndexedDbSaveRepository();

export function App() {
  const { t } = useTranslation();
  const [warbandOpen, setWarbandOpen] = useState(false);
  const [recruitmentOpen, setRecruitmentOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [questOpen, setQuestOpen] = useState(false);
  const [characterOpen, setCharacterOpen] = useState(false);
  const [cityMenuOpen, setCityMenuOpen] = useState(false);
  const [villageMenuOpen, setVillageMenuOpen] = useState(false);
  const [soulTempleOpen, setSoulTempleOpen] = useState(false);
  const [soulTutorialOpen, setSoulTutorialOpen] = useState(false);
  const [soulCompletionOpen, setSoulCompletionOpen] = useState(false);
  const [lordMenuOpen, setLordMenuOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [factionCodexOpen, setFactionCodexOpen] = useState(false);
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [startMenuOpen, setStartMenuOpen] = useState(true);
  const [characterCreatorOpen, setCharacterCreatorOpen] = useState(false);
  const [pauseMenuOpen, setPauseMenuOpen] = useState(false);
  const [storedSave, setStoredSave] = useState<SaveGame | null>(null);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [ready, setReady] = useState(false);
  const [, refresh] = useState(0);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [runEnded, setRunEnded] = useState(false);
  const autosaveQueue = useRef<Promise<void>>(Promise.resolve());
  const lastAutosavedLocation = useRef<string | null>(null);
  const previousMode = useRef(gameSession.mode);
  const previousSoulQuestCompleted = useRef(gameSession.soulQuestCompleted);
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
  const encyclopediaRevision = `${gameSession.metaProgression.seenUnitIds.join("|")}::${gameSession.metaProgression.ownedUnitIds.join("|")}`;

  useEffect(
    () =>
      gameSession.subscribe(() => {
        if (!previousSoulQuestCompleted.current && gameSession.soulQuestCompleted) setSoulCompletionOpen(true);
        previousSoulQuestCompleted.current = gameSession.soulQuestCompleted;
        if (gameSession.mode === "battle") {
          setWarbandOpen(false);
          setRecruitmentOpen(false);
          setInventoryOpen(false);
          setQuestOpen(false);
          setCharacterOpen(false);
          setCityMenuOpen(false);
          setVillageMenuOpen(false);
          setSoulTempleOpen(false);
          setLordMenuOpen(false);
          setMapOpen(false);
          setFactionCodexOpen(false);
        }
        refresh((value) => value + 1);
      }),
    [],
  );

  useEffect(() => {
    gameSession.uiBlocked =
      startMenuOpen ||
      characterCreatorOpen ||
      pauseMenuOpen ||
      warbandOpen ||
      recruitmentOpen ||
      inventoryOpen ||
      questOpen ||
      characterOpen ||
      cityMenuOpen ||
      villageMenuOpen ||
      soulTempleOpen ||
      soulTutorialOpen ||
      soulCompletionOpen ||
      lordMenuOpen ||
      mapOpen ||
      factionCodexOpen;
    return () => {
      gameSession.uiBlocked = false;
    };
  }, [
    startMenuOpen,
    characterCreatorOpen,
    pauseMenuOpen,
    warbandOpen,
    inventoryOpen,
    questOpen,
    characterOpen,
    cityMenuOpen,
    villageMenuOpen,
    soulTempleOpen,
    soulTutorialOpen,
    soulCompletionOpen,
    lordMenuOpen,
    mapOpen,
    factionCodexOpen,
  ]);

  useEffect(() => {
    void Promise.all([saveRepository.read(), saveRepository.readMeta()]).then(([save, meta]) => {
      gameSession.setMetaProgression(meta, [
        ...(save?.hero ? [save.hero.cardId] : []),
        ...(save?.warband ?? []).map((card) => card.cardId),
      ]);
      setStoredSave(save);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    void saveRepository.writeMeta(gameSession.metaProgression);
  }, [ready, encyclopediaRevision]);

  useEffect(() => {
    if (!sessionStarted) return;
    const locationId = nearbyLocation?.id ?? null;
    if (locationId && locationId !== lastAutosavedLocation.current) {
      lastAutosavedLocation.current = locationId;
      queueAutosave("Location entered");
    }
  }, [sessionStarted, nearbyLocation?.id]);

  useEffect(() => {
    if (!sessionStarted) {
      previousMode.current = gameSession.mode;
      return;
    }
    if (previousMode.current !== "battle" && gameSession.mode === "battle") {
      queueAutosave("Battle checkpoint");
    } else if (previousMode.current === "battle" && gameSession.mode === "world") {
      queueAutosave("Battle survived");
    }
    previousMode.current = gameSession.mode;
  }, [sessionStarted, gameSession.mode]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape" || gameSession.mode !== "world") return;
      if (
        warbandOpen ||
        recruitmentOpen ||
        inventoryOpen ||
        questOpen ||
        characterOpen ||
        cityMenuOpen ||
        villageMenuOpen ||
        mapOpen ||
        factionCodexOpen
      ) {
        return;
      }
      event.preventDefault();
      setSideMenuOpen(false);
      setPauseMenuOpen((open) => !open);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    warbandOpen,
    recruitmentOpen,
    inventoryOpen,
    questOpen,
    characterOpen,
    cityMenuOpen,
    villageMenuOpen,
    soulTempleOpen,
    mapOpen,
    factionCodexOpen,
  ]);

  function focusLocationFromCodex(location: MapLocation): void {
    setFactionCodexOpen(false);
    focusWorldCamera(location.x, location.y);
  }

  function focusLordFromCodex(lord: WorldWarbandState): void {
    setFactionCodexOpen(false);
    focusWorldCamera(lord.x, lord.y);
  }

  function continueGame(): void {
    if (!sessionStarted && storedSave) gameSession.restore(storedSave);
    setSessionStarted(true);
    setStartMenuOpen(false);
    setPauseMenuOpen(false);
    setRunEnded(false);
  }

  function openCharacterCreator(): void {
    setStartMenuOpen(false);
    setCharacterCreatorOpen(true);
  }

  async function startNewGame(profile: RunProfile): Promise<void> {
    await autosaveQueue.current;
    await saveRepository.delete();
    gameSession.beginNewRun(profile);
    setStoredSave(null);
    setSessionStarted(true);
    setRunEnded(false);
    setCharacterCreatorOpen(false);
    setStartMenuOpen(false);
    setSoulTutorialOpen(true);
    await writeAutosave();
  }

  async function writeAutosave(): Promise<void> {
    await gameSession.save(saveRepository);
    setStoredSave(await saveRepository.read());
  }

  function queueAutosave(label: string): void {
    autosaveQueue.current = autosaveQueue.current.then(async () => {
      await writeAutosave();
      setSaveMessage(`${label} · Autosaved`);
      window.setTimeout(() => setSaveMessage(null), 1800);
    });
  }

  function healDeck(): void {
    const healed = gameSession.healDeck();
    setSaveMessage(t(healed ? "hud.healed" : "hud.healBlocked"));
    window.setTimeout(() => setSaveMessage(null), 2600);
  }

  function persistMeta(): void {
    void saveRepository.writeMeta(gameSession.metaProgression);
    queueAutosave("Soul temple");
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

  function attackSelectedWarband(): void {
    if (!selectedWarband) return;
    const startsWar = selectedWarband.type === "lord" && !gameSession.factionState.atWar[selectedWarband.factionId];
    if (!window.confirm(startsWar ? `Attack ${selectedWarband.displayName ?? "this lord"}? This declares war on the entire faction.` : `Attack ${selectedWarband.displayName ?? "this warband"}?`)) return;
    if (gameSession.challengeWarband(selectedWarband.id)) setLordMenuOpen(false);
  }

  function prepareVictory(): ReturnType<typeof gameSession.prepareVictoryReward> {
    return gameSession.prepareVictoryReward();
  }

  function claimVictory(
    selection: Parameters<typeof gameSession.claimVictoryReward>[0],
  ): ReturnType<typeof gameSession.claimVictoryReward> {
    const reward = gameSession.claimVictoryReward(selection);
    if (reward) {
      queueAutosave("Battle survived");
      const capturedCardIds = reward.capturedCardIds ?? (reward.cardId ? [reward.cardId] : []);
      const cardName = capturedCardIds.length
        ? capturedCardIds.map((cardId) => t(getCardDefinition(cardId).nameKey)).join(", ")
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
    setVillageMenuOpen(false);
    setServiceOpen(true);
  }

  function closeCityService(
    setServiceOpen: (open: boolean) => void,
  ): void {
    setServiceOpen(false);
    if (gameSession.isInCity) setCityMenuOpen(true);
    else if (gameSession.world.nearbyLocation?.type === "village") setVillageMenuOpen(true);
  }

  function helpCurrentVillage(): void {
    if (!nearbyLocation || nearbyLocation.type !== "village") return;
    const result = gameSession.helpVillage(nearbyLocation.id);
    setSaveMessage(result === "success" ? "You helped the villagers. Relations, prosperity and militia improved." : result === "alreadyHelped" ? "You have already helped this village this week." : "Village help is unavailable.");
  }

  function waitInCurrentVillage(): void {
    if (!nearbyLocation || nearbyLocation.type !== "village") return;
    if (gameSession.waitInVillageUntilNight(nearbyLocation.id)) setSaveMessage("You wait in the village until 22:00.");
  }

  function raidCurrentVillage(): void {
    if (!nearbyLocation || nearbyLocation.type !== "village") return;
    if (!window.confirm("Plunder this village? You will fight its militia and lose 50 village relation and 20 faction reputation.")) return;
    gameSession.startVillageRaid(nearbyLocation.id);
  }

  async function finishDefeat(): Promise<void> {
    await autosaveQueue.current;
    await saveRepository.delete();
    setStoredSave(null);
    setSessionStarted(false);
    setRunEnded(true);
    setPauseMenuOpen(false);
    setStartMenuOpen(true);
    gameSession.reset();
  }

  return (
    <main className="game-shell">
      <TitleMusic active />
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
          activeRun={sessionStarted}
          save={storedSave}
          notice={runEnded ? "The run is over. The realm has claimed another wanderer." : undefined}
          activeGold={gameSession.gold}
          activeWarbandCount={gameSession.warband.length}
          activeWarbandCapacity={gameSession.warbandCapacity}
          metaProgression={gameSession.metaProgression}
          onContinue={continueGame}
          onNewRun={openCharacterCreator}
        />
      ) : null}
      {ready && characterCreatorOpen ? (
        <CharacterCreator
          onCancel={() => {
            setCharacterCreatorOpen(false);
            setStartMenuOpen(true);
          }}
          onConfirm={startNewGame}
        />
      ) : null}
      {ready && pauseMenuOpen && !startMenuOpen && !characterCreatorOpen ? (
        <PauseMenu
          onResume={() => setPauseMenuOpen(false)}
          onMainMenu={() => {
            setPauseMenuOpen(false);
            setStartMenuOpen(true);
          }}
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
          {gameSession.highestWantedLevel > 0 ? <span className="hud-chip wanted-chip" title="Faction hunters become active at 25 wanted; lords join the hunt at 50."><span className="hud-icon">✥</span><span className="hud-label">{gameSession.outlawTitle}</span><strong>{gameSession.highestWantedLevel}</strong></span> : null}
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

      {gameSession.isWaiting ? (
        <div className="waiting-indicator" role="status">
          <strong>{t("hud.waiting")}</strong>
          <span>{t("hud.waitingHint")}</span>
        </div>
      ) : null}

      <aside
        className={`context-prompt ${
          selectedWarband || nearbyLocation || nearbyCaravan ? "" : "hidden"
        }`}
      >
        <span className="eyebrow">{t("hud.region")}</span>
        <h1>
          {selectedWarband
            ? selectedWarband.displayName ?? t(selectedWarband.nameKey)
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
              {selectedWarband.type === "lord" ? <button className="button ghost" onClick={() => setLordMenuOpen(true)}>Talk</button> : null}
              <button className="button danger" disabled={Boolean(selectedWarband.activeBattleId)} onClick={attackSelectedWarband}>Attack</button>
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
        {nearbyLocation?.type === "village" && gameSession.mode === "world" ? <div className="location-actions"><button className="button primary" onClick={() => setVillageMenuOpen(true)}>Enter village</button></div> : null}
        {nearbyLocation?.type === "soulTemple" && gameSession.mode === "world" ? <div className="location-actions"><button className="button primary" onClick={() => setSoulTempleOpen(true)}>Enter Soul Temple</button></div> : null}
        {nearbyLocation &&
        nearbyLocation.type !== "city" && nearbyLocation.type !== "soulTemple" &&
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
            {["landmark", "wilds"].includes(nearbyLocation.type) ? (
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
            {nearbyCaravan.kind === "villager" ? <button className="button danger" onClick={() => { if (window.confirm("Attack these villagers and seize their cargo? This damages village and faction relations.")) gameSession.attackNearbyVillager(); }}>Attack villagers</button> : null}
          </div>
        ) : null}
      </aside>

      {ready && gameSession.mode === "world" && !startMenuOpen && !characterCreatorOpen && !pauseMenuOpen ? (
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
            <button
              className="side-menu-button"
              disabled={!ready || gameSession.mode !== "world"}
              onClick={() => {
                setSideMenuOpen(false);
                setFactionCodexOpen(true);
              }}
              title="NPCs, factions and known fiefs"
            >
              <span>♛</span>
              <small>NPCs &amp; Factions</small>
            </button>
          </nav>
          {saveMessage ? <span className="toast">{saveMessage}</span> : null}
        </aside>
      ) : null}
      {sessionStarted && gameSession.mode === "world" && !startMenuOpen && !characterCreatorOpen && !pauseMenuOpen && !warbandOpen && !recruitmentOpen && !inventoryOpen && !questOpen && !characterOpen && !cityMenuOpen && !villageMenuOpen && !lordMenuOpen && !soulTempleOpen && !mapOpen && !factionCodexOpen && !soulTutorialOpen && !soulCompletionOpen ? <SoulQuestTracker /> : null}
      {soulTutorialOpen ? <SoulCallingTutorial onComplete={() => setSoulTutorialOpen(false)} /> : null}
      {soulCompletionOpen ? <SoulQuestCompletion onClose={() => setSoulCompletionOpen(false)} /> : null}
      {lordMenuOpen && selectedWarband?.type === "lord" ? <LordMenu lord={selectedWarband} onChanged={() => queueAutosave("Lord audience")} onAttack={attackSelectedWarband} onClose={() => setLordMenuOpen(false)} /> : null}
      {cityMenuOpen && nearbyLocation?.type === "city" ? (
        <CityMenu
          city={nearbyLocation}
          message={saveMessage}
          onMarket={() => openCityService(setInventoryOpen)}
          onWarband={() => openCityService(setRecruitmentOpen)}
          onCharacter={() => openCityService(setCharacterOpen)}
          onQuests={() => openCityService(setQuestOpen)}
          onHeal={healDeck}
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
            onChange={() => queueAutosave("Warband updated")}
            onClose={() => closeCityService(setWarbandOpen)}
          />
        </Suspense>
      ) : null}
      {soulTempleOpen && nearbyLocation?.type === "soulTemple" ? <SoulTempleMenu onChanged={persistMeta} onLeave={() => setSoulTempleOpen(false)} /> : null}
      {villageMenuOpen && nearbyLocation?.type === "village" ? <VillageMenu village={nearbyLocation} message={saveMessage} onMarket={() => openCityService(setInventoryOpen)} onRecruit={() => openCityService(setRecruitmentOpen)} onElder={() => undefined} onHelp={helpCurrentVillage} onWaitNight={waitInCurrentVillage} onRaid={raidCurrentVillage} onLeave={() => setVillageMenuOpen(false)} /> : null}
      {recruitmentOpen ? (
        <Suspense fallback={<div className="loading">{t("app.loading")}</div>}>
          <RecruitmentScreen
            onRecruit={() => queueAutosave("Recruit joined")}
            onClose={() => closeCityService(setRecruitmentOpen)}
          />
        </Suspense>
      ) : null}
      {inventoryOpen ? (
        <Suspense fallback={<div className="loading">{t("app.loading")}</div>}>
          <InventoryMarket
            returnToCity={gameSession.isInCity}
            onTrade={() => queueAutosave("Trade completed")}
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
      {factionCodexOpen ? (
        <Suspense fallback={<div className="loading">{t("app.loading")}</div>}>
          <FactionCodex
            onFocusLocation={focusLocationFromCodex}
            onFocusLord={focusLordFromCodex}
            onClose={() => setFactionCodexOpen(false)}
          />
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
