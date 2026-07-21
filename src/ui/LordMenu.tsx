import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getCardDefinition } from "../domain/cards/CardInstance";
import { PLAYER_FACTION_ID, getFactionRelation } from "../domain/quests/Factions";
import { gameSession } from "../domain/session/GameSession";
import { getLordPersonalityLabel, getNobleRankLabel, getNpcActivityLabel, type WorldWarbandState } from "../domain/world/WorldWarbands";

interface LordMenuProps {
  lord: WorldWarbandState;
  onChanged: () => void;
  onAttack: () => void;
  onClose: () => void;
}

type AudienceTab = "audience" | "realm" | "gift" | "aid" | "pardon";

export function LordMenu({ lord, onChanged, onAttack, onClose }: LordMenuProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<AudienceTab>("audience");
  const [message, setMessage] = useState<string | null>(null);
  const relation = gameSession.getLordRelation(lord.id);
  const factionRelation = getFactionRelation(PLAYER_FACTION_ID, lord.factionId, gameSession.factionState);
  const wanted = gameSession.factionState.wanted[lord.factionId];
  const atWar = gameSession.factionState.atWar[lord.factionId];
  const pardonCost = gameSession.getFactionBountyPayment(lord.factionId);
  const hero = getCardDefinition(lord.leaderCardId ?? lord.unitIds[0]);
  const seat = lord.homeLocationId ? gameSession.world.map.locations.find((location) => location.id === lord.homeLocationId) : null;
  const holdings = gameSession.getLordDomain(lord.id);
  const tabs = [
    { id: "audience" as const, icon: "♛", title: "Audience", detail: "Speak with the lord" },
    { id: "realm" as const, icon: "◆", title: "Realm", detail: "Fiefs and allegiance" },
    { id: "gift" as const, icon: "◇", title: "Offer gift", detail: "Improve personal standing" },
    { id: "aid" as const, icon: "✚", title: "Request aid", detail: "Supplies and morale" },
    { id: "pardon" as const, icon: "✦", title: atWar ? "Negotiate peace" : "Seek pardon", detail: wanted > 0 || atWar ? `${pardonCost} gold` : "No bounty", disabled: pardonCost <= 0 },
  ];

  const act = (success: boolean, successText: string, failureText: string) => {
    setMessage(success ? successText : failureText);
    if (success) onChanged();
  };

  return <div className="city-overlay lord-overlay"><main className={`city-menu lord-menu focus-${tab}`}>
    <header className="city-header lord-header">
      <div className="city-identity"><p className="eyebrow">Audience with the {getNobleRankLabel(lord.nobleRank)}</p><h1>{lord.displayName ?? t(lord.nameKey)}</h1><p>{t(`faction.${lord.factionId}.name`)} · {seat ? `Seat of ${t(seat.nameKey)}` : "Landless"}</p><p>{getLordPersonalityLabel(lord.personality)} · {getNpcActivityLabel(lord.activity)}</p></div>
      <div className="lord-hero-card">{hero.portraitImage ? <img src={hero.portraitImage} alt="" /> : <span>♛</span>}<div><small>Retinue hero</small><strong>{t(hero.nameKey)}</strong><em>Level {lord.leaderLevel}</em></div></div>
      <div className="city-standing"><span className={`faction-seal ${lord.factionId}`} /><strong>{factionRelation}</strong><small>Personal {relation} · Faction {gameSession.factionState.reputation[lord.factionId]}</small>{atWar ? <em>At war with the Wanderer</em> : wanted > 0 ? <em>Wanted level {wanted}</em> : null}</div>
    </header>
    <section className="city-content">
      <nav className="city-districts" aria-label="Lord audience options"><span className="city-nav-label">Audience</span>{tabs.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} disabled={item.disabled} onMouseEnter={() => setTab(item.id)} onFocus={() => setTab(item.id)} onClick={() => setTab(item.id)}><span className="city-service-icon">{item.icon}</span><span><small>{item.detail}</small><strong>{item.title}</strong></span><b>›</b></button>)}</nav>
      <div className="city-service-focus lord-service">
        {tab === "audience" ? <><span className="eyebrow">Formal audience</span><h2>{factionRelation === "hostile" ? "Words beneath drawn steel" : "The road grants a brief audience"}</h2><p>{atWar ? "The lord names you an enemy of the realm. Only tribute and a negotiated peace can end the pursuit." : relation >= 20 ? "The lord greets you as a proven ally and listens to your request." : wanted > 0 ? "The lord knows the accusations against you and expects restitution." : "The lord offers guarded courtesies and news from the realm."}</p><p>This lord is {getLordPersonalityLabel(lord.personality).toLowerCase()} and is currently {getNpcActivityLabel(lord.activity).toLowerCase()}.</p><button className="city-enter-service" onClick={() => setMessage(`${lord.displayName ?? "The lord"} reports troop movements, threatened villages and unrest along the trade roads.`)}>Ask for news <span>→</span></button></> : null}
        {tab === "realm" ? <><span className="eyebrow">Lands and allegiance</span><h2>{t(`faction.${lord.factionId}.name`)}</h2><p>{lord.displayName ?? "This lord"} rides from {seat ? t(seat.nameKey) : "no fixed seat"}. The realm controls {holdings.length} known settlements and fortifications.</p><div className="lord-holdings">{holdings.slice(0, 8).map((holding) => <span key={holding.id}>{t(holding.nameKey)} <small>{holding.type}</small></span>)}</div></> : null}
        {tab === "gift" ? <><span className="eyebrow">Personal diplomacy</span><h2>A gift of respect</h2><p>Offer 50 gold to gain 8 personal relation and 2 faction reputation. Gifts cannot by themselves end a war.</p><button className="city-enter-service" disabled={gameSession.gold < 50 || atWar} onClick={() => act(gameSession.giftLord(lord.id), "The gift is accepted and your standing improves.", "The lord refuses the gift.")}>Offer 50 gold <span>→</span></button></> : null}
        {tab === "aid" ? <><span className="eyebrow">Call upon favor</span><h2>Request provisions</h2><p>Requires 20 personal relation and 10 faction reputation. Once per week, the lord grants two ration crates and restores 6 morale.</p><button className="city-enter-service" disabled={atWar} onClick={() => act(gameSession.requestLordAid(lord.id), "The lord grants provisions and rallies your troops.", "Your standing is insufficient, or aid was already granted this week.")}>Request aid <span>→</span></button></> : null}
        {tab === "pardon" ? <><span className="eyebrow">Law and consequence</span><h2>{atWar ? "Negotiate an end to the war" : "Purchase a sealed pardon"}</h2><p>{atWar ? "A costly settlement ends the war, clears the faction bounty and recalls its hunters." : "The payment clears this faction's wanted level and recalls its bounty hunters."}</p><button className="city-enter-service" disabled={gameSession.gold < pardonCost || pardonCost <= 0} onClick={() => act(gameSession.settleBountyWithLord(lord.id), "The seal is struck. The bounty and war are ended.", `You need ${pardonCost} gold.`)}>Pay {pardonCost} gold <span>→</span></button></> : null}
      </div>
    </section>
    <footer className="city-footer"><div className="city-player-resources"><span><small>Lord's troops</small><strong>{lord.roster.length}</strong></span><span><small>Treasury</small><strong>{lord.gold}</strong></span><span><small>Supplies</small><strong>{lord.rations}</strong></span><span><small>Prisoners</small><strong>{lord.prisoners.reduce((sum, stack) => sum + stack.quantity, 0)}</strong></span></div><button className="city-leave danger" onClick={onAttack}>Attack lord <span>⚔</span></button><button className="city-leave" onClick={onClose}>End audience <span>→</span></button></footer>
    {message ? <div className="city-message">{message}</div> : null}
  </main></div>;
}
