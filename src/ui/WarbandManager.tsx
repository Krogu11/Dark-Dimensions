import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  recruitableCards,
  upgradesByCardId,
} from "../content/content";
import {
  getCardDefinition,
  xpNeededForNextLevel,
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
  returnToCity?: boolean;
}

export default function WarbandManager({
  onClose,
  returnToCity = false,
}: WarbandManagerProps) {
  const { t } = useTranslation();
  const [message, setMessage] = useState<string | null>(null);
  const [selectedUid, setSelectedUid] = useState(gameSession.hero.uid);
  const selectedCard =
    selectedUid === gameSession.hero.uid
      ? gameSession.hero
      : gameSession.allUnits.find((card) => card.uid === selectedUid) ?? null;

  function resultMessage(
    result: RosterActionResult,
    successMessage?: string,
  ): void {
    if (result === "success") {
      setMessage(successMessage ?? null);
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

  return (
    <div className="warband-overlay">
      <main className="warband-manager">
        <header className="warband-header">
          <div>
            <p className="eyebrow">{t("warband.subtitle")}</p>
            <h1>{t("warband.title")}</h1>
            <p>{t("warband.heroNote")}</p>
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

        <button
          className="hero-roster-card"
          onClick={() => setSelectedUid(gameSession.hero.uid)}
        >
          <span className="hero-sigil">I</span>
          <span className="hero-copy">
            <small>Immortal Hero</small>
            <strong className={`rarity-name ${getCardDefinition(gameSession.hero.cardId).rarity}`}>
              {t(getCardDefinition(gameSession.hero.cardId).nameKey)}
            </strong>
          </span>
          <span>ATK {getCardDefinition(gameSession.hero.cardId).atk}</span>
          <span>DEF {getCardDefinition(gameSession.hero.cardId).def}</span>
        </button>

        <div className="warband-columns">
          <RosterSection
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
          />
          <PrisonerSection
            onRecruit={(cardId) =>
              resultMessage(
                gameSession.recruitPrisoner(cardId),
                t("warband.prisonerRecruited", {
                  unit: t(getCardDefinition(cardId).nameKey),
                }),
              )
            }
            onSell={(cardId) =>
              resultMessage(
                gameSession.sellPrisoner(cardId),
                t("warband.prisonerSold", {
                  unit: t(getCardDefinition(cardId).nameKey),
                }),
              )
            }
          />
        </div>

        <UnitInspector card={selectedCard} onUpgrade={upgrade} />

        <section className="recruitment-section">
          <div className="roster-heading">
            <h2>{t("warband.recruitment")}</h2>
            <span>
              {gameSession.isInCity
                ? message
                : t("warband.recruitmentLocked")}
            </span>
          </div>
          <div className="recruit-grid">
            {recruitableCards.map((definition) => {
              const upgradePath = upgradesByCardId.get(definition.id);
              return (
                <article className="recruit-card" key={definition.id}>
                  <small>{definition.race}</small>
                  <h3 className={`rarity-name ${definition.rarity}`}>
                    {t(definition.nameKey)}
                  </h3>
                  <div>
                    <span>{t("warband.tier", { tier: definition.tier })}</span>
                    <span>ATK {definition.atk}</span>
                    <span>DEF {definition.def}</span>
                    <span>HP {definition.maxHp}</span>
                  </div>
                  <p>
                    {upgradePath
                      ? t("warband.upgradeAt", {
                          level: upgradePath.requiredLevel,
                        })
                      : t("warband.terminal")}
                  </p>
                  <button
                    className="button primary"
                    disabled={
                      !gameSession.isInCity ||
                      gameSession.gold < (definition.recruitCost ?? 0) ||
                      gameSession.warband.length >= gameSession.warbandCapacity
                    }
                    onClick={() =>
                      resultMessage(
                        gameSession.recruit(definition.id),
                        t("warband.recruited", {
                          unit: t(definition.nameKey),
                        }),
                      )
                    }
                  >
                    {t("warband.recruit", { cost: definition.recruitCost })}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

function UnitInspector({
  card,
  onUpgrade,
}: {
  card: CardInstance | null;
  onUpgrade: (card: CardInstance, targetCardId: string) => void;
}) {
  const { t } = useTranslation();
  if (!card) {
    return <section className="unit-inspector muted">{t("warband.selectUnit")}</section>;
  }

  const definition = getCardDefinition(card.cardId);
  const upgrade = upgradesByCardId.get(card.cardId);
  const upgradeReady = Boolean(upgrade && card.level >= upgrade.requiredLevel);

  return (
    <section className="unit-inspector">
      <div className="inspector-identity">
        <p className="eyebrow">{t("warband.inspect")}</p>
        <h2 className={`rarity-name ${definition.rarity}`}>
          {t(definition.nameKey)}
        </h2>
        <span>{definition.race} · {definition.rarity}</span>
      </div>
      <dl>
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
        <div><dt>Level</dt><dd>{card.level}</dd></div>
        <div>
          <dt>XP</dt>
          <dd>{card.xp} / {xpNeededForNextLevel(card.level)}</dd>
        </div>
      </dl>
      <div className="upgrade-branches">
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
                <em>{t("warband.upgradeAt", { level: upgrade.requiredLevel })}</em>
              ) : null}
            </button>
          );
        })}
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
  const neededXp = xpNeededForNextLevel(card.level);
  const upgrade = upgradesByCardId.get(card.cardId);
  const upgradeReady = Boolean(upgrade && card.level >= upgrade.requiredLevel);

  return (
    <article
      className={`roster-card ${selected ? "selected" : ""}`}
      onClick={onSelect}
    >
      <div>
        <small>{t("warband.level", { level: card.level })}</small>
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

function PrisonerSection({
  onRecruit,
  onSell,
}: {
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
            <article className="roster-card" key={prisoner.cardId}>
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
                  onClick={() => onRecruit(prisoner.cardId)}
                >
                  {t("warband.recruitPrisoner")}
                </button>
                <button
                  className="mini-action danger"
                  disabled={!gameSession.isInCity}
                  onClick={() => onSell(prisoner.cardId)}
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
