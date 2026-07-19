import { useState } from "react";
import { useTranslation } from "react-i18next";
import { itemsById } from "../content/content";
import type { MapLocation } from "../domain/content/schemas";
import { gameSession } from "../domain/session/GameSession";
import { villageProsperityLabel } from "../domain/world/Villages";

interface VillageMenuProps {
  village: MapLocation;
  message: string | null;
  onMarket: () => void;
  onRecruit: () => void;
  onElder: () => void;
  onHelp: () => void;
  onWaitNight: () => void;
  onRaid: () => void;
  onLeave: () => void;
}

type ServiceId = "market" | "recruits" | "elder" | "help" | "wait" | "raid";

export function VillageMenu({ village, message, onMarket, onRecruit, onElder, onHelp, onWaitNight, onRaid, onLeave }: VillageMenuProps) {
  const { t } = useTranslation();
  const [focusedService, setFocusedService] = useState<ServiceId>("market");
  const state = gameSession.getVillageState(village.id);
  const factionId = gameSession.currentFactionId;
  const linkedCity = gameSession.world.map.locations.find((location) => location.id === state?.linkedCityId);
  const product = state ? itemsById.get(state.productionItemId) : null;
  const quest = gameSession.getCurrentVillageQuest();
  const questItem = quest?.itemId ? itemsById.get(quest.itemId) : null;
  const week = Math.floor((gameSession.gameDay - 1) / 7) + 1;
  const helpAvailable = Boolean(state && state.lastHelpedWeek < week && state.condition !== "looted");
  const services = [
    { id: "market" as const, icon: "◈", title: "Village market", description: `Buy local ${product ? t(product.nameKey) : "produce"} and simple provisions.`, action: onMarket, disabled: state?.condition === "looted" },
    { id: "recruits" as const, icon: "⚔", title: "Ask for recruits", description: "Hire a small number of inexpensive Tier 1 and Tier 2 volunteers.", action: onRecruit, disabled: state?.condition === "looted" },
    { id: "elder" as const, icon: "✦", title: "Speak with the elder", description: quest?.type === "delivery" ? `The village needs ${quest.quantity} ${questItem ? t(questItem.nameKey) : "supplies"}.` : "Bandits are expected after nightfall. Wait until 22:00 and defend the village.", action: () => setFocusedService("elder"), disabled: false },
    { id: "help" as const, icon: "✚", title: "Help the villagers", description: helpAvailable ? "Spend five hours helping. Improves relations, prosperity and militia." : "You have already helped this village this week.", action: onHelp, disabled: !helpAvailable },
    { id: "wait" as const, icon: "☾", title: "Wait until night", description: "Remain in the village until 22:00. Night contracts may begin then.", action: onWaitNight, disabled: false },
    { id: "raid" as const, icon: "◆", title: "Plunder the village", description: "Attack the militia and seize local stock. This gravely damages relations.", action: onRaid, disabled: state?.condition === "looted" },
  ];
  const focused = services.find((service) => service.id === focusedService)!;

  return <div className="city-overlay village-overlay"><main className={`city-menu village-menu focus-${focusedService}`}>
    <header className="city-header village-header"><div className="city-identity"><p className="eyebrow">Rural settlement · {state?.condition ?? "unknown"}</p><h1>{t(village.nameKey)}</h1><p>{t(village.descriptionKey)}</p></div>
      <div className="city-stat-strip"><VillageStat label="Population" value={state?.population.toLocaleString() ?? "—"} detail="Residents" /><VillageStat label="Militia" value={state?.militia.toString() ?? "—"} detail="Able defenders" /><VillageStat label="Prosperity" value={state?.prosperity.toString() ?? "—"} detail={state ? villageProsperityLabel(state.prosperity) : "Unknown"} meter={state?.prosperity} /><VillageStat label="Production" value={product ? t(product.nameKey) : "—"} detail={linkedCity ? `Supplies ${t(linkedCity.nameKey)}` : "Local produce"} /></div>
      <div className="city-standing">{factionId ? <><span className={`faction-seal ${factionId}`} /><strong>{t(`faction.${factionId}.name`)}</strong><small>Village relation {state?.relation ?? 0} · Faction {gameSession.currentFactionReputation}</small></> : null}</div></header>
    <section className="city-content"><nav className="city-districts" aria-label="Village services"><span className="city-nav-label">Village life</span>{services.map((service) => <button key={service.id} className={focusedService === service.id ? "active" : ""} disabled={service.disabled} onMouseEnter={() => setFocusedService(service.id)} onFocus={() => setFocusedService(service.id)} onClick={service.action}><span className="city-service-icon">{service.icon}</span><span><small>{service.id}</small><strong>{service.title}</strong></span><b>›</b></button>)}</nav>
      <div className="city-service-focus"><span className="eyebrow">{focused.id}</span><h2>{focused.title}</h2><p>{focused.description}</p>{focused.id === "elder" && quest ? <div className="village-quest-actions"><small>Reward: {quest.rewardGold}g · +{quest.rewardRelation} village relation</small>{quest.status === "available" ? <button className="city-enter-service" onClick={() => gameSession.acceptVillageQuest(village.id)}>Accept task <span>→</span></button> : null}{quest.type === "delivery" && quest.status === "active" ? <button className="city-enter-service" onClick={() => gameSession.completeVillageDelivery(village.id)}>Deliver {quest.quantity} {questItem ? t(questItem.nameKey) : "items"}<span>→</span></button> : null}{quest.type === "night_bandits" && quest.status === "active" ? <button className="city-enter-service" onClick={() => gameSession.isNight ? gameSession.startVillageNightDefense(village.id) : onWaitNight()}>{gameSession.isNight ? "Defend the village" : "Wait until night"}<span>→</span></button> : null}{quest.status === "completed" ? <strong>Task completed for this week.</strong> : null}</div> : <button className="city-enter-service" disabled={focused.disabled} onClick={focused.action}>{focused.disabled ? "Unavailable" : "Continue"}<span>→</span></button>}</div></section>
    <footer className="city-footer"><div className="city-player-resources"><span><small>Gold</small><strong>{gameSession.gold}</strong></span><span><small>Food</small><strong>{gameSession.rationCount}/{gameSession.foodCapacity}</strong></span><span><small>Morale</small><strong>{gameSession.morale}</strong></span></div><span className="city-autosave-note">◆ Village state is saved persistently</span><button className="city-leave" onClick={onLeave}>Leave village <span>→</span></button></footer>
    {message ? <div className="city-message">{message}</div> : null}
  </main></div>;
}

function VillageStat({ label, value, detail, meter }: { label: string; value: string; detail: string; meter?: number }) { return <div className="city-stat"><span>{label}</span><strong>{value}</strong><small>{detail}</small>{meter !== undefined ? <i><b style={{ width: `${meter}%` }} /></i> : null}</div>; }
