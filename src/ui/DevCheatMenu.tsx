import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { contentPack } from "../content/content";
import { getCardDefinition } from "../domain/cards/CardInstance";
import { gameSession } from "../domain/session/GameSession";

interface DevCheatMenuProps {
  open: boolean;
  onToggle: () => void;
  onChanged: () => void;
}

export function DevCheatMenu({ open, onToggle, onChanged }: DevCheatMenuProps) {
  const { t } = useTranslation();
  const [unitUid, setUnitUid] = useState(gameSession.warband[0]?.uid ?? "");
  const [cardId, setCardId] = useState("");
  const [query, setQuery] = useState("");
  const availableCards = useMemo(
    () => contentPack.cards
      .filter((card) => !card.id.startsWith("player_"))
      .filter((card) => {
        const search = query.trim().toLocaleLowerCase();
        return !search || card.id.includes(search) || t(card.nameKey).toLocaleLowerCase().includes(search);
      })
      .sort((left, right) => t(left.nameKey).localeCompare(t(right.nameKey))),
    [query, t],
  );
  const selectedCardId = availableCards.some((card) => card.id === cardId)
    ? cardId
    : availableCards[0]?.id ?? "";

  const change = (action: () => void): void => {
    action();
    onChanged();
  };

  return (
    <aside className={`dev-cheat ${open ? "open" : "closed"}`} onKeyDown={(event) => event.stopPropagation()}>
      <button className="dev-cheat-toggle" type="button" onClick={onToggle} aria-expanded={open}>
        <span>⚙</span> DEV
      </button>
      {open ? (
        <div className="dev-cheat-panel">
          <header><div><small>Testing tools</small><h2>Cheat Menu</h2></div><button type="button" onClick={onToggle}>×</button></header>
          <CheatRow label={`Gold · ${gameSession.gold}`} actions={[
            ["+100", () => gameSession.devGrantGold(100)],
            ["+1,000", () => gameSession.devGrantGold(1_000)],
          ]} change={change} />
          <CheatRow label={`Souls · ${gameSession.metaProgression.souls}`} actions={[
            ["+10", () => gameSession.devGrantSouls(10)],
            ["+100", () => gameSession.devGrantSouls(100)],
          ]} change={change} />
          <CheatRow label={`Hero XP · ${gameSession.characterState.xp}`} actions={[
            ["+100", () => gameSession.devGrantCharacterXp(100)],
            ["+1,000", () => gameSession.devGrantCharacterXp(1_000)],
          ]} change={change} />
          <section className="dev-cheat-section">
            <label htmlFor="dev-unit">Unit card XP</label>
            <select id="dev-unit" value={unitUid} onChange={(event) => setUnitUid(event.target.value)}>
              <option value="">Choose a warband card</option>
              {gameSession.warband.map((unit) => (
                <option key={unit.uid} value={unit.uid}>{t(getCardDefinition(unit.cardId).nameKey)} · {unit.xp} XP</option>
              ))}
            </select>
            <div className="dev-cheat-actions">
              <button disabled={!unitUid} onClick={() => change(() => gameSession.devGrantUnitXp(unitUid, 100))}>+100 XP</button>
              <button disabled={!unitUid} onClick={() => change(() => gameSession.devGrantUnitXp(unitUid, 500))}>+500 XP</button>
            </div>
          </section>
          <section className="dev-cheat-section">
            <label htmlFor="dev-card-search">Give card</label>
            <input id="dev-card-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or id…" />
            <select value={selectedCardId} onChange={(event) => setCardId(event.target.value)}>
              {availableCards.map((card) => <option key={card.id} value={card.id}>{t(card.nameKey)} · T{card.tier}</option>)}
            </select>
            <button className="dev-cheat-give" disabled={!selectedCardId} onClick={() => change(() => { gameSession.devGrantCard(selectedCardId); })}>Add to Warband</button>
          </section>
        </div>
      ) : null}
    </aside>
  );
}

function CheatRow({ label, actions, change }: { label: string; actions: Array<[string, () => void]>; change: (action: () => void) => void }) {
  return <section className="dev-cheat-section"><label>{label}</label><div className="dev-cheat-actions">{actions.map(([text, action]) => <button key={text} onClick={() => change(action)}>{text}</button>)}</div></section>;
}
