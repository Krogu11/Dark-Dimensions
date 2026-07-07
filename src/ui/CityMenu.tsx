import { useTranslation } from "react-i18next";
import type { MapLocation } from "../domain/content/schemas";
import { gameSession } from "../domain/session/GameSession";

interface CityMenuProps {
  city: MapLocation;
  message: string | null;
  onMarket: () => void;
  onWarband: () => void;
  onCharacter: () => void;
  onQuests: () => void;
  onHeal: () => void;
  onSave: () => void;
  onLeave: () => void;
}

export function CityMenu({
  city,
  message,
  onMarket,
  onWarband,
  onCharacter,
  onQuests,
  onHeal,
  onSave,
  onLeave,
}: CityMenuProps) {
  const { t } = useTranslation();
  const factionId = gameSession.currentFactionId;

  return (
    <div className="city-overlay">
      <main className="city-menu">
        <header className="city-header">
          <div>
            <p className="eyebrow">{t("city.sanctuary")}</p>
            <h1>{t(city.nameKey)}</h1>
            <p>{t(city.descriptionKey)}</p>
          </div>
          <div className="city-standing">
            {factionId ? (
              <>
                <span className={`faction-seal ${factionId}`} />
                <strong>{t(`faction.${factionId}.name`)}</strong>
                <small>
                  {t("quests.reputation", {
                    value: gameSession.currentFactionReputation,
                  })}
                </small>
              </>
            ) : null}
          </div>
        </header>

        <section className="city-services">
          <button className="city-service market" onClick={onMarket}>
            <span>{t("city.marketEyebrow")}</span>
            <strong>{t("city.market")}</strong>
            <small>{t("city.marketDescription")}</small>
          </button>
          <button className="city-service recruits" onClick={onWarband}>
            <span>{t("city.recruitEyebrow")}</span>
            <strong>{t("city.recruit")}</strong>
            <small>{t("city.recruitDescription")}</small>
          </button>
          <button className="city-service character" onClick={onCharacter}>
            <span>{t("city.characterEyebrow")}</span>
            <strong>{t("city.character")}</strong>
            <small>{t("city.characterDescription")}</small>
          </button>
          <button className="city-service contracts" onClick={onQuests}>
            <span>{t("city.contractEyebrow")}</span>
            <strong>{t("city.contracts")}</strong>
            <small>{t("city.contractDescription")}</small>
          </button>
          <button
            className="city-service healers"
            disabled={
              gameSession.healCost === 0 ||
              gameSession.gold < gameSession.healCost
            }
            onClick={onHeal}
          >
            <span>{t("city.healerEyebrow")}</span>
            <strong>{t("city.healers")}</strong>
            <small>
              {t("city.healerDescription", { cost: gameSession.healCost })}
            </small>
          </button>
          <button className="city-service save" onClick={onSave}>
            <span>{t("city.restEyebrow")}</span>
            <strong>{t("city.save")}</strong>
            <small>{t("city.saveDescription")}</small>
          </button>
        </section>

        <footer className="city-footer">
          <div>
            <span>{t("hud.gold")} {gameSession.gold}</span>
            <span>
              {t("hud.food")} {gameSession.rationCount}/{gameSession.foodCapacity}
            </span>
            <span>{t("hud.morale")} {gameSession.morale}</span>
          </div>
          <button className="button ghost" onClick={onLeave}>
            {t("city.leave")}
          </button>
        </footer>
        {message ? <div className="city-message">{message}</div> : null}
      </main>
    </div>
  );
}
