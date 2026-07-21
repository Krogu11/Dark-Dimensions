import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MapLocation } from "../domain/content/schemas";
import {
  FACTION_IDS,
  FACTION_PROFILES,
  PLAYER_FACTION_ID,
  getFactionRelation,
  type FactionId,
} from "../domain/quests/Factions";
import { gameSession } from "../domain/session/GameSession";
import {
  getLordPersonalityLabel,
  getNobleRankLabel,
  getNpcActivityLabel,
  type WorldWarbandState,
} from "../domain/world/WorldWarbands";

interface FactionCodexProps {
  onFocusLocation: (location: MapLocation) => void;
  onFocusLord: (lord: WorldWarbandState) => void;
  onClose: () => void;
}

export default function FactionCodex({ onFocusLocation, onFocusLord, onClose }: FactionCodexProps) {
  const { t } = useTranslation();
  const [selectedFactionId, setSelectedFactionId] = useState<FactionId>(FACTION_IDS[0]);
  const profile = FACTION_PROFILES[selectedFactionId];
  const reputation = gameSession.factionState.reputation[selectedFactionId];
  const wanted = gameSession.factionState.wanted[selectedFactionId];
  const atWar = gameSession.factionState.atWar[selectedFactionId];
  const relation = getFactionRelation(PLAYER_FACTION_ID, selectedFactionId, gameSession.factionState);
  const holdings = useMemo(
    () => gameSession.world.map.locations.filter(
      (location) =>
        ["city", "village", "castle"].includes(location.type) &&
        gameSession.factionState.locationFactions[location.id] === selectedFactionId,
    ),
    [selectedFactionId],
  );
  const lords = gameSession.world.state.warbands.filter(
    (warband) => warband.type === "lord" && warband.factionId === selectedFactionId,
  );
  const king = lords.find((lord) => lord.nobleRank === "king");
  const capital = (king?.homeLocationId ? holdings.find((location) => location.id === king.homeLocationId) : null) ?? holdings
    .filter((location) => location.type === "city")
    .sort((left, right) => (gameSession.cityStates[right.id]?.population ?? 0) - (gameSession.cityStates[left.id]?.population ?? 0))[0];
  const reports = gameSession.world.state.chronicle
    .filter((entry) => entry.factionIds.length === 0 || entry.factionIds.includes(selectedFactionId))
    .slice(0, 6);

  return <div className="faction-codex-overlay"><main className="faction-codex">
    <header className="faction-codex-header">
      <div><span className="eyebrow">Realm intelligence</span><h1>NPCs &amp; Factions</h1><p>Kings, sworn lords, fiefs and your standing across the known world.</p></div>
      <button className="button ghost" type="button" onClick={onClose}>Return to world</button>
    </header>

    <div className="faction-codex-layout">
      <nav className="faction-codex-nav" aria-label="Known factions">
        <span className="city-nav-label">Known powers</span>
        {FACTION_IDS.map((factionId) => {
          const factionRelation = getFactionRelation(PLAYER_FACTION_ID, factionId, gameSession.factionState);
          return <button key={factionId} className={selectedFactionId === factionId ? "active" : ""} onClick={() => setSelectedFactionId(factionId)}>
            <span className={`faction-seal ${factionId}`} />
            <span><strong>{t(`faction.${factionId}.name`)}</strong><small>{factionRelation} · Reputation {gameSession.factionState.reputation[factionId]}</small></span>
            {gameSession.factionState.atWar[factionId] ? <em>WAR</em> : null}
          </button>;
        })}
      </nav>

      <section className="faction-codex-content">
        <div className="faction-codex-banner">
          <span className={`faction-seal large ${selectedFactionId}`} />
          <div><span className="eyebrow">{profile.motto}</span><h2>{t(`faction.${selectedFactionId}.name`)}</h2><p>{profile.rulerTitle}</p></div>
          <div className={`faction-standing ${relation}`}><small>Your standing</small><strong>{relation}</strong><span>{reputation >= 0 ? "+" : ""}{reputation} reputation</span>{wanted > 0 ? <em>{wanted} wanted</em> : null}{atWar ? <b>At war</b> : null}</div>
        </div>

        <div className="faction-summary-grid">
          <article><span>♛</span><small>Sovereign</small><strong>{king?.displayName ?? profile.rulerName}</strong><p>{profile.rulerTitle}</p></article>
          <article><span>◆</span><small>Royal seat</small><strong>{capital ? t(capital.nameKey) : "Unknown"}</strong>{capital ? <button onClick={() => onFocusLocation(capital)}>View on world map →</button> : null}</article>
          <article><span>♜</span><small>Known realm</small><strong>{lords.length} lords</strong><p>{holdings.filter((holding) => holding.type === "city").length} cities · {holdings.filter((holding) => holding.type === "village").length} villages</p></article>
        </div>

        <article className="faction-lore"><span className="eyebrow">History &amp; character</span><h3>Lore</h3><p>{profile.lore}</p></article>

        <section className="faction-directory">
          <div className="faction-section-heading"><div><span className="eyebrow">Nobility</span><h3>Lords &amp; their fiefs</h3></div><small>{lords.length} known</small></div>
          <div className="faction-lord-list">
            {[...lords].sort((left, right) => ["king", "baron", "count"].indexOf(left.nobleRank ?? "count") - ["king", "baron", "count"].indexOf(right.nobleRank ?? "count") || (left.displayName ?? left.id).localeCompare(right.displayName ?? right.id)).map((lord) => {
              const seat = lord.homeLocationId ? holdings.find((location) => location.id === lord.homeLocationId) : null;
              const domain = gameSession.getLordDomain(lord.id);
              return <article key={lord.id} className={lord.state === "destroyed" ? "fallen" : ""}>
                <div><span className="lord-crown">{lord.nobleRank === "king" ? "♛" : "♜"}</span><span><strong>{lord.displayName ?? t(lord.nameKey)}</strong><small>{getNobleRankLabel(lord.nobleRank)} · {getLordPersonalityLabel(lord.personality)} · {getNpcActivityLabel(lord.activity)}</small><small>{seat ? `Seat: ${t(seat.nameKey)}` : "Landless"} · Relation {gameSession.getLordRelation(lord.id)}</small><small>{lord.roster.length} troops · {lord.gold} gold · {lord.rations} supplies · {lord.prisoners.reduce((sum, stack) => sum + stack.quantity, 0)} prisoners</small></span></div>
                <p>{domain.length > 0 ? domain.map((holding) => t(holding.nameKey)).join(" · ") : "No recorded fiefs"}</p>
                <div><button onClick={() => onFocusLord(lord)} disabled={lord.state === "destroyed"}>Find lord</button>{seat ? <button onClick={() => onFocusLocation(seat)}>View seat</button> : null}</div>
              </article>;
            })}
          </div>
        </section>

        <section className="faction-directory faction-reports">
          <div className="faction-section-heading"><div><span className="eyebrow">Recent reports</span><h3>What is happening in the realm</h3></div><small>{reports.length} reports</small></div>
          {reports.length > 0
            ? <ol>{reports.map((entry) => <li key={entry.id}>{entry.text}</li>)}</ol>
            : <p>No noteworthy reports have reached you yet.</p>}
        </section>

        <section className="faction-directory holdings-directory">
          <div className="faction-section-heading"><div><span className="eyebrow">Territory</span><h3>Cities, villages &amp; strongholds</h3></div><small>{holdings.length} known</small></div>
          <div className="faction-holding-list">
            {holdings.sort((left, right) => left.type.localeCompare(right.type)).map((location) => {
              const lord = lords.find((candidate) => gameSession.getLordDomain(candidate.id).some((holding) => holding.id === location.id));
              const prosperity = location.type === "village" ? gameSession.villageStates[location.id]?.prosperity : gameSession.cityStates[location.id]?.prosperity;
              const condition = location.type === "village" ? gameSession.villageStates[location.id]?.condition : null;
              return <button key={location.id} onClick={() => onFocusLocation(location)}><span className={`holding-mark ${location.type}`}>{location.type === "city" ? "♜" : location.type === "castle" ? "◆" : "⌂"}</span><span><strong>{t(location.nameKey)}</strong><small>{location.type} · {lord?.displayName ?? "Crown domain"}{prosperity !== undefined ? ` · Prosperity ${prosperity}` : ""}{condition && condition !== "normal" ? ` · ${condition}` : ""}</small></span><b>Locate →</b></button>;
            })}
          </div>
        </section>
      </section>
    </div>
  </main></div>;
}
