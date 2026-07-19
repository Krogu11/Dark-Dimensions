import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  upgradesByCardId,
} from "../content/content";
import {
  getCardDefinition,
  xpNeededForUnitUpgrade,
  type CardInstance,
} from "../domain/cards/CardInstance";
import { getWeeklyUnitWage } from "../domain/cards/UnitUpkeep";
import {
  gameSession,
  getPrisonerRecruitGoldCost,
  getPrisonerRecruitXpCost,
  getPrisonerSellPrice,
  type RosterActionResult,
} from "../domain/session/GameSession";

interface WarbandManagerProps {
  onClose: () => void;
  onChange?: () => void;
  returnToCity?: boolean;
}

export default function WarbandManager({
  onClose,
  onChange,
  returnToCity = false,
}: WarbandManagerProps) {
  const { t } = useTranslation();
  const [message, setMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"warband" | "prisoners">("warband");
  const [selectedUid, setSelectedUid] = useState(gameSession.warband[0]?.uid ?? "");
  const [selectedPrisonerId, setSelectedPrisonerId] = useState(gameSession.prisoners[0]?.cardId ?? "");
  const selectedCard = gameSession.warband.find((card) => card.uid === selectedUid) ?? null;
  const selectedPrisoner = gameSession.prisoners.find((prisoner) => prisoner.cardId === selectedPrisonerId) ?? null;

  function resultMessage(
    result: RosterActionResult,
    successMessage?: string,
  ): void {
    if (result === "success") {
      setMessage(successMessage ?? null);
      onChange?.();
      return;
    }
    if (result === "notEnoughGold") setMessage(t("warband.poor"));
    else if (result === "notEnoughXp") setMessage(t("warband.notEnoughXp"));
    else if (result === "notInCity") setMessage(t("warband.notInCity"));
    else setMessage(t("warband.full"));
  }

  function upgrade(card: CardInstance, targetCardId: string): void {
    const result = gameSession.upgradeUnit(card.uid, targetCardId);
    resultMessage(
      result,
      result === "success"
        ? t("warband.upgraded", {
            unit: t(getCardDefinition(targetCardId).nameKey),
          })
        : undefined,
    );
  }

  function recruitPrisoner(cardId: string): void {
    const result = gameSession.recruitPrisoner(cardId);
    resultMessage(result, t("warband.prisonerRecruited", { unit: t(getCardDefinition(cardId).nameKey) }));
    if (result === "success" && !gameSession.prisoners.some((prisoner) => prisoner.cardId === cardId)) setSelectedPrisonerId(gameSession.prisoners[0]?.cardId ?? "");
  }

  function sellPrisoner(cardId: string): void {
    const result = gameSession.sellPrisoner(cardId);
    resultMessage(result, t("warband.prisonerSold", { unit: t(getCardDefinition(cardId).nameKey) }));
    if (result === "success" && !gameSession.prisoners.some((prisoner) => prisoner.cardId === cardId)) setSelectedPrisonerId(gameSession.prisoners[0]?.cardId ?? "");
  }

  return (
    <div className="warband-overlay">
      <main className="warband-manager">
        <header className="warband-header warband-command-header">
          <div>
            <p className="eyebrow">{t("warband.subtitle")}</p>
            <h1>{t("warband.title")}</h1>
            <p>Arrange the company. Choose who will carry your banner into the next battle.</p>
          </div>
          <div className="warband-summary">
            <strong>{t("warband.leadership", { level: gameSession.leadershipLevel })}</strong>
            <span>{t("hud.gold")} {gameSession.gold}</span>
            <span>{t("warband.prisonersCount", { count: gameSession.prisonerCount })}</span>
            <button className="button ghost" onClick={onClose}>
              {t(returnToCity ? "trade.returnToCity" : "warband.close")}
            </button>
          </div>
        </header>

        <div className="warband-workspace">
          <aside className="warband-roster-column">
            <nav className="warband-tabs">
              <button className={activeTab === "warband" ? "active" : ""} onClick={() => setActiveTab("warband")}>Warband <span>{gameSession.warband.length}/{gameSession.warbandCapacity}</span></button>
              <button className={activeTab === "prisoners" ? "active" : ""} onClick={() => { setActiveTab("prisoners"); if (!selectedPrisonerId) setSelectedPrisonerId(gameSession.prisoners[0]?.cardId ?? ""); }}>Prisoners <span>{gameSession.prisonerCount}</span></button>
            </nav>
            {activeTab === "warband" ? <RosterSection
            title={t("warband.warband")}
            capacity={t("warband.activeCapacity", {
              count: gameSession.warband.length,
              capacity: gameSession.warbandCapacity,
            })}
            cards={gameSession.warband}
            emptyText={t("warband.emptyActive")}
            selectedUid={selectedUid}
            onSelect={setSelectedUid}
            onDismiss={(card) =>
              resultMessage(
                gameSession.dismissUnit(card.uid),
                t("warband.dismissed", {
                  unit: t(getCardDefinition(card.cardId).nameKey),
                }),
              )
            }
          /> : <PrisonerSection
            selectedCardId={selectedPrisonerId}
            onSelect={setSelectedPrisonerId}
            onRecruit={recruitPrisoner}
            onSell={sellPrisoner}
            />}
          </aside>
          {activeTab === "warband" ? <UnitInspector card={selectedCard} onUpgrade={upgrade} onDismiss={(card) => resultMessage(gameSession.dismissUnit(card.uid), t("warband.dismissed", { unit: t(getCardDefinition(card.cardId).nameKey) }))} /> : <PrisonerInspector prisoner={selectedPrisoner} onRecruit={recruitPrisoner} onSell={sellPrisoner} />}
        </div>
        {message ? <div className="warband-feedback">{message}</div> : null}
      </main>
    </div>
  );
}

function UnitInspector({
  card,
  onUpgrade,
  onDismiss,
}: {
  card: CardInstance | null;
  onUpgrade: (card: CardInstance, targetCardId: string) => void;
  onDismiss: (card: CardInstance) => void;
}) {
  const { t } = useTranslation();
  if (!card) {
    return <section className="unit-inspector muted">{t("warband.selectUnit")}</section>;
  }

  const definition = getCardDefinition(card.cardId);
  const detailImage = definition.portraitImage ?? definition.cardImage;
  const upgrade = upgradesByCardId.get(card.cardId);
  const requiredXp = xpNeededForUnitUpgrade(definition.tier);
  const upgradeReady = Boolean(upgrade && card.xp >= requiredXp);

  return (
    <section className="unit-inspector warband-dossier">
      <div className="inspector-identity">
        <div className="warband-unit-art">
          {detailImage ? <img src={detailImage} alt="" style={{ objectPosition: `${definition.imageFocus?.x ?? 50}% ${definition.imageFocus?.y ?? 50}%` }} /> : <b>{t(definition.nameKey).slice(0, 1)}</b>}
        </div>
        <p className="eyebrow">{t("warband.inspect")}</p>
        <h2 className={`rarity-name ${definition.rarity}`}>
          {t(definition.nameKey)}
        </h2>
        <span>{definition.race} · {definition.rarity}</span>
      </div>
      <div className="warband-dossier-copy">
      <p className="eyebrow">Combat dossier</p>
      <dl className="warband-core-stats">
        <div><dt>ATK</dt><dd>{definition.atk}</dd></div>
        <div><dt>DEF</dt><dd>{definition.def}</dd></div>
        <div><dt>{t("warband.tierLabel")}</dt><dd>{definition.tier}</dd></div>
        <div>
          <dt>{t("warband.weeklyWageLabel")}</dt>
          <dd>{getWeeklyUnitWage(card, definition)}g</dd>
        </div>
        <div>
          <dt>{t("warband.currentHp")}</dt>
          <dd>{card.currentHp} / {definition.maxHp}</dd>
        </div>
        <div>
          <dt>XP</dt>
          <dd>{card.xp} / {requiredXp}</dd>
        </div>
      </dl>
      <div className="warband-xp"><span>Upgrade experience <b>{card.xp}/{requiredXp}</b></span><i><b style={{ width: `${Math.min(100, card.xp / requiredXp * 100)}%` }} /></i></div>
      <div className="warband-effect"><small>Battle effect</small><strong>{definition.battleEffect ? t(`battle.effects.${definition.battleEffect}`) : t("battle.effects.none")}</strong></div>
      <p className="warband-lore">{definition.descriptionKey ? t(definition.descriptionKey) : t(`battle.raceIdentity.${definition.race}`)}</p>
      </div>
      <div className="upgrade-branches warband-upgrades">
        <strong>
          {upgrade
            ? t("warband.chooseUpgrade")
            : t("warband.terminal")}
        </strong>
        {upgrade?.options.map((targetCardId) => {
          const target = getCardDefinition(targetCardId);
          return (
            <button
              key={targetCardId}
              disabled={!upgradeReady || card.isHero}
              onClick={() => onUpgrade(card, targetCardId)}
            >
              <span className={`rarity-name ${target.rarity}`}>
                {t(target.nameKey)}
              </span>
              <small>
                {t("warband.tier", { tier: target.tier })} · ATK {target.atk} · DEF {target.def} · HP {target.maxHp}
              </small>
              {!upgradeReady ? (
                <em>{requiredXp - card.xp} XP remaining</em>
              ) : null}
            </button>
          );
        })}
        <button className="warband-dismiss" onClick={() => onDismiss(card)}>{t("warband.dismiss")}</button>
      </div>
    </section>
  );
}

interface RosterSectionProps {
  title: string;
  capacity: string;
  cards: CardInstance[];
  emptyText: string;
  selectedUid: string;
  onSelect: (uid: string) => void;
  onDismiss: (card: CardInstance) => void;
}

function RosterSection({
  title,
  capacity,
  cards,
  emptyText,
  selectedUid,
  onSelect,
  onDismiss,
}: RosterSectionProps) {
  return (
    <section className="roster-section">
      <div className="roster-heading">
        <h2>{title}</h2>
        <span>{capacity}</span>
      </div>
      <div className="roster-list">
        {cards.map((card) => (
          <RosterCard
            key={card.uid}
            card={card}
            selected={selectedUid === card.uid}
            onSelect={() => onSelect(card.uid)}
            onDismiss={() => onDismiss(card)}
          />
        ))}
        {cards.length === 0 ? <p className="roster-empty">{emptyText}</p> : null}
      </div>
    </section>
  );
}

function RosterCard({
  card,
  selected,
  onSelect,
  onDismiss,
}: {
  card: CardInstance;
  selected: boolean;
  onSelect: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const definition = getCardDefinition(card.cardId);
  const neededXp = xpNeededForUnitUpgrade(definition.tier);
  const upgrade = upgradesByCardId.get(card.cardId);
  const upgradeReady = Boolean(upgrade && card.xp >= neededXp);

  return (
    <article
      className={`roster-card ${selected ? "selected" : ""}`}
      onClick={onSelect}
    >
      <div>
        <small>{t("warband.tier", { tier: definition.tier })}</small>
        <strong className={`rarity-name ${definition.rarity}`}>
          {t(definition.nameKey)}
          {upgradeReady ? <span className="upgrade-sigil">↑</span> : null}
        </strong>
        <span>
          {t("warband.tier", { tier: definition.tier })} · {t("warband.weeklyWage", {
            wage: getWeeklyUnitWage(card, definition),
          })}
        </span>
        <span>{t("warband.xp", { xp: card.xp, needed: neededXp })}</span>
      </div>
      <div className="roster-card-actions">
        <button
          className="mini-action danger"
          onClick={(event) => {
            event.stopPropagation();
            onDismiss();
          }}
        >
          {t("warband.dismiss")}
        </button>
      </div>
    </article>
  );
}

function PrisonerInspector({
  prisoner,
  onRecruit,
  onSell,
}: {
  prisoner: { cardId: string; quantity: number } | null;
  onRecruit: (cardId: string) => void;
  onSell: (cardId: string) => void;
}) {
  const { t } = useTranslation();
  if (!prisoner) return <section className="unit-inspector muted">{t("warband.emptyPrisoners")}</section>;
  const definition = getCardDefinition(prisoner.cardId);
  const detailImage = definition.portraitImage ?? definition.cardImage;
  const recruitGold = getPrisonerRecruitGoldCost(definition.tier);
  const recruitXp = getPrisonerRecruitXpCost(definition.tier);
  const sellPrice = getPrisonerSellPrice(definition.tier);
  const rosterFull = gameSession.warband.length >= gameSession.warbandCapacity;
  const canRecruit = !rosterFull && gameSession.gold >= recruitGold && gameSession.characterState.xp >= recruitXp;

  return <section className="unit-inspector warband-dossier prisoner-dossier">
    <div className="inspector-identity">
      <div className="warband-unit-art">{detailImage ? <img src={detailImage} alt="" style={{ objectPosition: `${definition.imageFocus?.x ?? 50}% ${definition.imageFocus?.y ?? 50}%` }} /> : <b>{t(definition.nameKey).slice(0, 1)}</b>}</div>
      <p className="eyebrow">Captured unit · x{prisoner.quantity}</p>
      <h2 className={`rarity-name ${definition.rarity}`}>{t(definition.nameKey)}</h2>
      <span>{definition.race} · {definition.rarity}</span>
    </div>
    <div className="warband-dossier-copy">
      <p className="eyebrow">Combat dossier</p>
      <dl className="warband-core-stats">
        <div><dt>ATK</dt><dd>{definition.atk}</dd></div><div><dt>DEF</dt><dd>{definition.def}</dd></div>
        <div><dt>INI</dt><dd>{definition.initiative}</dd></div><div><dt>HP</dt><dd>{definition.maxHp}</dd></div>
        <div><dt>{t("warband.tierLabel")}</dt><dd>{definition.tier}</dd></div><div><dt>Captives</dt><dd>{prisoner.quantity}</dd></div>
      </dl>
      <div className="warband-effect"><small>Battle effect</small><strong>{definition.battleEffect ? t(`battle.effects.${definition.battleEffect}`) : t("battle.effects.none")}</strong></div>
      <p className="warband-lore">{definition.descriptionKey ? t(definition.descriptionKey) : t(`battle.raceIdentity.${definition.race}`)}</p>
    </div>
    <div className="upgrade-branches warband-upgrades prisoner-actions">
      <strong>{t("warband.recruitPrisoner")}</strong>
      <p>{t("warband.prisonerRecruitCost", { gold: recruitGold, xp: recruitXp })}</p>
      <button disabled={!canRecruit} onClick={() => onRecruit(prisoner.cardId)}><span>{t("warband.recruitPrisoner")}</span><small>{rosterFull ? t("warband.full") : `${gameSession.gold}/${recruitGold}g · ${gameSession.characterState.xp}/${recruitXp} XP`}</small></button>
      <button className="warband-dismiss" disabled={!gameSession.isInCity} onClick={() => onSell(prisoner.cardId)}>{t("warband.sellPrisoner")} · {sellPrice}g</button>
    </div>
  </section>;
}

function PrisonerSection({
  selectedCardId,
  onSelect,
  onRecruit,
  onSell,
}: {
  selectedCardId: string;
  onSelect: (cardId: string) => void;
  onRecruit: (cardId: string) => void;
  onSell: (cardId: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <section className="roster-section">
      <div className="roster-heading">
        <h2>{t("warband.prisoners")}</h2>
        <span>{t("warband.prisonersCount", { count: gameSession.prisonerCount })}</span>
      </div>
      <div className="roster-list">
        {gameSession.prisoners.map((prisoner) => {
          const definition = getCardDefinition(prisoner.cardId);
          const recruitGold = getPrisonerRecruitGoldCost(definition.tier);
          const recruitXp = getPrisonerRecruitXpCost(definition.tier);
          const sellPrice = getPrisonerSellPrice(definition.tier);
          return (
            <article className={`roster-card ${selectedCardId === prisoner.cardId ? "selected" : ""}`} key={prisoner.cardId} onClick={() => onSelect(prisoner.cardId)}>
              <div>
                <small>{t("warband.tier", { tier: definition.tier })} · x{prisoner.quantity}</small>
                <strong className={`rarity-name ${definition.rarity}`}>
                  {t(definition.nameKey)}
                </strong>
                <span>
                  {t("warband.prisonerRecruitCost", {
                    gold: recruitGold,
                    xp: recruitXp,
                  })}
                </span>
                <span>{t("warband.prisonerSellPrice", { gold: sellPrice })}</span>
              </div>
              <div className="roster-card-actions">
                <button
                  className="mini-action"
                  disabled={
                    gameSession.warband.length >= gameSession.warbandCapacity ||
                    gameSession.gold < recruitGold ||
                    gameSession.characterState.xp < recruitXp
                  }
                  onClick={(event) => { event.stopPropagation(); onRecruit(prisoner.cardId); }}
                >
                  {t("warband.recruitPrisoner")}
                </button>
                <button
                  className="mini-action danger"
                  disabled={!gameSession.isInCity}
                  onClick={(event) => { event.stopPropagation(); onSell(prisoner.cardId); }}
                >
                  {t("warband.sellPrisoner")}
                </button>
              </div>
            </article>
          );
        })}
        {gameSession.prisoners.length === 0 ? (
          <p className="roster-empty">{t("warband.emptyPrisoners")}</p>
        ) : null}
      </div>
    </section>
  );
}
