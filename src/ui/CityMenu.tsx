import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { MapLocation } from "../domain/content/schemas";
import { gameSession } from "../domain/session/GameSession";
import { prosperityLabel } from "../domain/world/Cities";

interface CityMenuProps {
  city: MapLocation;
  message: string | null;
  onMarket: () => void;
  onWarband: () => void;
  onCharacter: () => void;
  onQuests: () => void;
  onHeal: () => void;
  onLeave: () => void;
}

type ServiceId = "market" | "recruits" | "contracts" | "healers" | "character";

export function CityMenu({ city, message, onMarket, onWarband, onCharacter, onQuests, onHeal, onLeave }: CityMenuProps) {
  const { t } = useTranslation();
  const [focusedService, setFocusedService] = useState<ServiceId>("market");
  const factionId = gameSession.currentFactionId;
  const state = gameSession.getCityState(city.id);
  const services = [
    { id: "market" as const, icon: "◈", eyebrow: t("city.marketEyebrow"), title: t("city.market"), description: t("city.marketDescription"), action: onMarket, disabled: false },
    { id: "recruits" as const, icon: "⚔", eyebrow: t("city.recruitEyebrow"), title: t("city.recruit"), description: t("city.recruitDescription"), action: onWarband, disabled: false },
    { id: "contracts" as const, icon: "✦", eyebrow: t("city.contractEyebrow"), title: t("city.contracts"), description: t("city.contractDescription"), action: onQuests, disabled: false },
    { id: "healers" as const, icon: "✚", eyebrow: t("city.healerEyebrow"), title: t("city.healers"), description: t("city.healerDescription", { cost: gameSession.healCost }), action: onHeal, disabled: gameSession.healCost === 0 || gameSession.gold < gameSession.healCost },
    { id: "character" as const, icon: "◇", eyebrow: t("city.characterEyebrow"), title: t("city.character"), description: t("city.characterDescription"), action: onCharacter, disabled: false },
  ];
  const focused = services.find((service) => service.id === focusedService)!;

  return (
    <div className="city-overlay">
      <main className={`city-menu focus-${focusedService}`}>
        <header className="city-header">
          <div className="city-identity">
            <p className="eyebrow">{t("city.sanctuary")}</p>
            <h1>{t(city.nameKey)}</h1>
            <p>{t(city.descriptionKey)}</p>
          </div>
          <div className="city-stat-strip">
            <CityStat label="Population" value={state?.population.toLocaleString() ?? "—"} detail="Souls within the walls" />
            <CityStat label="Garrison" value={state?.garrison.toLocaleString() ?? "—"} detail="Sworn defenders" />
            <CityStat label="Prosperity" value={state ? `${state.prosperity}` : "—"} detail={state ? prosperityLabel(state.prosperity) : "Unknown"} meter={state?.prosperity} />
          </div>
          <div className="city-standing">
            {factionId ? <><span className={`faction-seal ${factionId}`} /><strong>{t(`faction.${factionId}.name`)}</strong><small>{t("quests.reputation", { value: gameSession.currentFactionReputation })}</small></> : null}
          </div>
        </header>

        <section className="city-content">
          <nav className="city-districts" aria-label="City districts">
            <span className="city-nav-label">City districts</span>
            {services.map((service) => (
              <button key={service.id} className={focusedService === service.id ? "active" : ""} disabled={service.disabled} onMouseEnter={() => setFocusedService(service.id)} onFocus={() => setFocusedService(service.id)} onClick={service.action}>
                <span className="city-service-icon">{service.icon}</span>
                <span><small>{service.eyebrow}</small><strong>{service.title}</strong></span>
                <b>›</b>
              </button>
            ))}
          </nav>

          <div className="city-service-focus">
            <span className="eyebrow">{focused.eyebrow}</span>
            <h2>{focused.title}</h2>
            <p>{focused.description}</p>
            <button className="city-enter-service" disabled={focused.disabled} onClick={focused.action}>{focused.disabled ? "Unavailable" : "Enter district"}<span>→</span></button>
          </div>
        </section>

        <footer className="city-footer">
          <div className="city-player-resources"><span><small>Gold</small><strong>{gameSession.gold}</strong></span><span><small>Food</small><strong>{gameSession.rationCount}/{gameSession.foodCapacity}</strong></span><span><small>Morale</small><strong>{gameSession.morale}</strong></span></div>
          <span className="city-autosave-note">◆ Ironman autosave recorded on entry</span>
          <button className="city-leave" onClick={onLeave}>Leave city <span>→</span></button>
        </footer>
        {message ? <div className="city-message">{message}</div> : null}
      </main>
    </div>
  );
}

function CityStat({ label, value, detail, meter }: { label: string; value: string; detail: string; meter?: number }) {
  return <div className="city-stat"><span>{label}</span><strong>{value}</strong><small>{detail}</small>{meter !== undefined ? <i><b style={{ width: `${meter}%` }} /></i> : null}</div>;
}
