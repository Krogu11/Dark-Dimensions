import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCardDefinition } from "../domain/cards/CardInstance";
import { getTierBaseWeeklyWage } from "../domain/cards/UnitUpkeep";
import { gameSession, type RosterActionResult } from "../domain/session/GameSession";
import { getGameDay } from "../domain/time/GameClock";
import { getRecruitmentCost } from "../domain/world/Recruitment";

interface RecruitmentScreenProps {
  onClose: () => void;
  onRecruit: () => void;
}

export default function RecruitmentScreen({ onClose, onRecruit }: RecruitmentScreenProps) {
  const { t } = useTranslation();
  const villageMode = gameSession.world.nearbyLocation?.type === "village";
  const offers = villageMode ? gameSession.currentVillageRecruitmentOffers : gameSession.currentRecruitmentOffers;
  const [selectedId, setSelectedId] = useState<string | null>(offers[0] ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const selected = useMemo(
    () => selectedId && offers.includes(selectedId) ? getCardDefinition(selectedId) : offers[0] ? getCardDefinition(offers[0]) : null,
    [offers, selectedId],
  );
  const city = gameSession.world.nearbyLocation;
  const restockDay = gameSession.currentRecruitmentRestockDay;
  const daysLeft = villageMode ? 7 - ((getGameDay(gameSession.timeState) - 1) % 7) : restockDay === null ? 0 : Math.max(0, restockDay - getGameDay(gameSession.timeState));
  const recruitmentCost = (cardId: string) => villageMode ? gameSession.getVillageRecruitmentCost(cardId) : getRecruitmentCost(getCardDefinition(cardId));

  function recruit(): void {
    if (!selected) return;
    const result = villageMode ? gameSession.recruitFromVillageOffer(selected.id) : gameSession.recruitFromCityOffer(selected.id);
    setMessage(resultMessage(result));
    if (result === "success") {
      onRecruit();
      const next = (villageMode ? gameSession.currentVillageRecruitmentOffers : gameSession.currentRecruitmentOffers)[0] ?? null;
      setSelectedId(next);
    }
  }

  function resultMessage(result: RosterActionResult): string {
    if (result === "success") return "The recruit has joined your Warband.";
    if (result === "notEnoughGold") return "You cannot afford this recruit.";
    if (result === "capacityFull") return "Your Warband has no free unit slot.";
    if (result === "notAvailable") return "This recruit is no longer available.";
    return "Recruitment is unavailable.";
  }

  return (
    <div className="recruitment-overlay">
      <main className="recruitment-screen">
        <header className="recruitment-header">
          <div><p className="eyebrow">{villageMode ? "Village levy" : "Barracks & taverns"}</p><h1>{villageMode ? "Ask for volunteers" : "Recruitment Hall"}</h1><span>{city ? t(city.nameKey) : "Unknown settlement"}</span></div>
          <div className="recruitment-resources">
            <span><small>Gold</small><strong>{gameSession.gold}g</strong></span>
            <span><small>Warband</small><strong>{gameSession.warband.length}/{gameSession.warbandCapacity}</strong></span>
            <span><small>Weekly pay</small><strong>{gameSession.weeklyWageCost}g</strong></span>
            <button className="button ghost" onClick={onClose}>Return to {villageMode ? "village" : "city"}</button>
          </div>
        </header>

        <section className="recruitment-layout">
          <aside className="recruitment-roster">
            <div className="recruitment-panel-title"><div><small>Available today</small><h2>Local recruits</h2></div><span>{offers.length}</span></div>
            <div className="recruitment-offers">
              {offers.map((cardId) => {
                const card = getCardDefinition(cardId);
                const image = card.portraitImage ?? card.cardImage;
                return <button key={cardId} className={`recruit-offer ${selected?.id === cardId ? "selected" : ""}`} onClick={() => setSelectedId(cardId)}>
                  <span className="recruit-offer-art">{image ? <img src={image} alt="" style={{ objectPosition: `${card.imageFocus?.x ?? 50}% ${card.imageFocus?.y ?? 50}%` }} /> : <b>{t(card.nameKey).slice(0, 1)}</b>}</span>
                  <span><small>{card.race} · Tier {card.tier}</small><strong className={`rarity-name ${card.rarity}`}>{t(card.nameKey)}</strong><em>{recruitmentCost(card.id)}g · {getTierBaseWeeklyWage(card.tier)}g/week</em></span>
                </button>;
              })}
              {offers.length === 0 ? <div className="recruitment-empty"><strong>No recruits remain.</strong><p>Travel onward or return after the next levy gathering.</p></div> : null}
            </div>
            <footer>New candidates expected in <strong>{daysLeft} {daysLeft === 1 ? "day" : "days"}</strong>.</footer>
          </aside>

          <section className="recruitment-detail">
            {selected ? <RecruitDetail cardId={selected.id} /> : <div className="recruitment-detail-empty"><span>◇</span><h2>The benches stand empty</h2><p>This city has no more candidates for your banner.</p></div>}
          </section>

          <aside className="recruitment-contract">
            <p className="eyebrow">Contract of service</p>
            {selected ? <>
              <h2>{t(selected.nameKey)}</h2>
              <dl><div><dt>Hiring fee</dt><dd>{recruitmentCost(selected.id)}g</dd></div><div><dt>Weekly pay</dt><dd>{getTierBaseWeeklyWage(selected.tier)}g</dd></div><div><dt>Open places</dt><dd>{Math.max(0, gameSession.warbandCapacity - gameSession.warband.length)}</dd></div></dl>
              <p>The unit joins the active Warband immediately. This offer is unique until the city restocks.</p>
              <button className="recruit-confirm" disabled={gameSession.gold < recruitmentCost(selected.id) || gameSession.warband.length >= gameSession.warbandCapacity} onClick={recruit}>Recruit for {recruitmentCost(selected.id)}g <span>→</span></button>
            </> : null}
            {message ? <div className="recruitment-message">{message}</div> : null}
          </aside>
        </section>
      </main>
    </div>
  );
}

function RecruitDetail({ cardId }: { cardId: string }) {
  const { t } = useTranslation();
  const card = getCardDefinition(cardId);
  const image = card.portraitImage ?? card.cardImage;
  return <>
    <div className="recruit-detail-art">{image ? <img src={image} alt="" style={{ objectPosition: `${card.imageFocus?.x ?? 50}% ${card.imageFocus?.y ?? 50}%` }} /> : <b>{t(card.nameKey).slice(0, 1)}</b>}<span>Tier {card.tier}</span></div>
    <div className="recruit-detail-copy"><p className="eyebrow">Candidate dossier</p><h2 className={`rarity-name ${card.rarity}`}>{t(card.nameKey)}</h2><span>{card.race} · {card.rarity}</span>
      <dl><div><dt>ATK</dt><dd>{card.atk}</dd></div><div><dt>DEF</dt><dd>{card.def}</dd></div><div><dt>INI</dt><dd>{card.initiative}</dd></div><div><dt>HP</dt><dd>{card.maxHp}</dd></div></dl>
      <div className="recruit-effect"><small>Battle effect</small><strong>{card.battleEffect ? t(`battle.effects.${card.battleEffect}`) : t("battle.effects.none")}</strong></div>
      <p className="recruit-lore">{card.descriptionKey ? t(card.descriptionKey) : t(`battle.raceIdentity.${card.race}`)}</p>
    </div>
  </>;
}
