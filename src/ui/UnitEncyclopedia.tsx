import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { contentPack, upgradesByCardId } from "../content/content";
import type { CardDefinition } from "../domain/content/schemas";
import type { MetaProgressionState } from "../domain/progression/MetaProgression";

type DiscoveryFilter = "all" | "seen" | "owned" | "unknown";

export function UnitEncyclopedia({ meta, onClose }: { meta: MetaProgressionState; onClose: () => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [race, setRace] = useState("all");
  const [tier, setTier] = useState("all");
  const [discovery, setDiscovery] = useState<DiscoveryFilter>("all");
  const cards = useMemo(() => contentPack.cards.filter((card) => !card.id.startsWith("player_")), []);
  const seen = useMemo(() => new Set(meta.seenUnitIds), [meta.seenUnitIds]);
  const owned = useMemo(() => new Set(meta.ownedUnitIds), [meta.ownedUnitIds]);
  const seenCount = cards.filter((card) => seen.has(card.id)).length;
  const ownedCount = cards.filter((card) => owned.has(card.id)).length;
  const races = useMemo(() => [...new Set(cards.map((card) => card.race))].sort(), [cards]);
  const visibleCards = useMemo(() => cards
    .filter((card) => race === "all" || card.race === race)
    .filter((card) => tier === "all" || card.tier === Number(tier))
    .filter((card) => discovery === "all" || discovery === "owned" && owned.has(card.id) || discovery === "seen" && seen.has(card.id) || discovery === "unknown" && !seen.has(card.id))
    .filter((card) => !query.trim() || seen.has(card.id) && t(card.nameKey).toLowerCase().includes(query.trim().toLowerCase()))
    .sort((left, right) => discoveryRank(right, seen, owned) - discoveryRank(left, seen, owned) || left.tier - right.tier || t(left.nameKey).localeCompare(t(right.nameKey))),
  [cards, discovery, owned, query, race, seen, t, tier]);
  const [selectedId, setSelectedId] = useState(() => cards.find((card) => owned.has(card.id))?.id ?? cards.find((card) => seen.has(card.id))?.id ?? cards[0]?.id ?? "");
  const selected = cards.find((card) => card.id === selectedId) ?? visibleCards[0] ?? cards[0];
  const selectedSeen = Boolean(selected && seen.has(selected.id));
  const selectedOwned = Boolean(selected && owned.has(selected.id));

  return <section className="encyclopedia-overlay" aria-label={t("encyclopedia.title")}>
    <header className="encyclopedia-header">
      <div><span className="eyebrow">{t("encyclopedia.eyebrow")}</span><h1>{t("encyclopedia.title")}</h1><p>{t("encyclopedia.subtitle")}</p></div>
      <div className="encyclopedia-progress"><span>{t("encyclopedia.seen")}</span><strong>{seenCount} / {cards.length}</strong><span>{t("encyclopedia.owned")}</span><strong>{ownedCount} / {cards.length}</strong></div>
      <button className="encyclopedia-close" onClick={onClose}>{t("encyclopedia.close")} <span>×</span></button>
    </header>
    <div className="encyclopedia-toolbar">
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("encyclopedia.search")} />
      <select value={discovery} onChange={(event) => setDiscovery(event.target.value as DiscoveryFilter)}><option value="all">{t("encyclopedia.filters.all")}</option><option value="seen">{t("encyclopedia.filters.seen")}</option><option value="owned">{t("encyclopedia.filters.owned")}</option><option value="unknown">{t("encyclopedia.filters.unknown")}</option></select>
      <select value={race} onChange={(event) => setRace(event.target.value)}><option value="all">{t("encyclopedia.filters.allRaces")}</option>{races.map((value) => <option key={value} value={value}>{value}</option>)}</select>
      <select value={tier} onChange={(event) => setTier(event.target.value)}><option value="all">{t("encyclopedia.filters.allTiers")}</option>{[1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>{t("encyclopedia.tier", { tier: value })}</option>)}</select>
    </div>
    <div className="encyclopedia-content">
      <div className="encyclopedia-grid">
        {visibleCards.map((card) => <UnitEntry key={card.id} card={card} seen={seen.has(card.id)} owned={owned.has(card.id)} selected={selected?.id === card.id} onSelect={() => setSelectedId(card.id)} />)}
        {visibleCards.length === 0 ? <p className="encyclopedia-empty">{t("encyclopedia.empty")}</p> : null}
      </div>
      {selected ? <UnitDossier card={selected} seen={selectedSeen} owned={selectedOwned} /> : null}
    </div>
  </section>;
}

function UnitEntry({ card, seen, owned, selected, onSelect }: { card: CardDefinition; seen: boolean; owned: boolean; selected: boolean; onSelect: () => void }) {
  const { t } = useTranslation();
  return <button className={`encyclopedia-entry ${selected ? "selected" : ""} ${seen ? "discovered" : "unknown"}`} onClick={onSelect}>
    <span className="encyclopedia-portrait">{seen && card.portraitImage ? <img src={card.portraitImage} alt="" style={{ objectPosition: `${card.imageFocus?.x ?? 50}% ${card.imageFocus?.y ?? 50}%` }} /> : <b>?</b>}{owned ? <i title={t("encyclopedia.commanded")}>◆</i> : null}</span>
    <span><small>{seen ? `${card.race} · ${t("encyclopedia.tier", { tier: card.tier })}` : t("encyclopedia.unrecorded")}</small><strong className={seen ? `rarity-name ${card.rarity}` : ""}>{seen ? t(card.nameKey) : "???"}</strong></span>
  </button>;
}

function UnitDossier({ card, seen, owned }: { card: CardDefinition; seen: boolean; owned: boolean }) {
  const { t } = useTranslation();
  const upgrade = upgradesByCardId.get(card.id);
  if (!seen) return <aside className="encyclopedia-dossier sealed"><span className="sealed-rune">?</span><h2>{t("encyclopedia.unknownTitle")}</h2><p>{t("encyclopedia.unknownText")}</p></aside>;
  return <aside className={`encyclopedia-dossier ${owned ? "owned" : "observed"}`}>
    <div className="dossier-portrait">{card.portraitImage ? <img src={card.portraitImage} alt="" style={{ objectPosition: `${card.imageFocus?.x ?? 50}% ${card.imageFocus?.y ?? 50}%` }} /> : null}</div>
    <span className="eyebrow">{card.race} · {card.rarity} · {t("encyclopedia.tier", { tier: card.tier })}</span>
    <h2 className={`rarity-name ${card.rarity}`}>{t(card.nameKey)}</h2>
    {owned ? <>
      <div className="dossier-owned">◆ {t("encyclopedia.commanded")}</div>
      <p>{card.descriptionKey ? t(card.descriptionKey) : t("encyclopedia.noDescription")}</p>
      <dl className="dossier-stats"><div><dt>ATK</dt><dd>{card.atk}</dd></div><div><dt>DEF</dt><dd>{card.def}</dd></div><div><dt>HP</dt><dd>{card.maxHp}</dd></div><div><dt>INI</dt><dd>{card.initiative}</dd></div></dl>
      <section><span>{t("encyclopedia.ability")}</span><strong>{t(`battle.effects.${card.battleEffect ?? "none"}`)}</strong></section>
      <section><span>{t("encyclopedia.upgrades")}</span>{upgrade ? <div className="dossier-upgrades">{upgrade.options.map((id) => { const target = contentPack.cards.find((candidate) => candidate.id === id); return target ? <strong className={`rarity-name ${target.rarity}`} key={id}>{t(target.nameKey)}</strong> : null; })}</div> : <strong>{t("encyclopedia.finalTier")}</strong>}</section>
    </> : <div className="dossier-observed"><strong>{t("encyclopedia.observed")}</strong><p>{t("encyclopedia.observedText")}</p></div>}
  </aside>;
}

function discoveryRank(card: CardDefinition, seen: Set<string>, owned: Set<string>): number {
  return owned.has(card.id) ? 2 : seen.has(card.id) ? 1 : 0;
}
