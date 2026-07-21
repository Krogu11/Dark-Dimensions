import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { gameSession } from "../domain/session/GameSession";
import { getCardDefinition } from "../domain/cards/CardInstance";
import {
  canBuyMetaUpgrade,
  isMetaUpgradeRevealed,
  META_UPGRADES,
  metaRank,
  soulValueForTier,
  type MetaUpgradeDefinition,
  type MetaUpgradeId,
} from "../domain/progression/MetaProgression";

type TempleService = "sacrifice" | "tree" | "altar" | "restoration";

const SERVICES: Array<{ id: TempleService; icon: string; eyebrowKey: string; titleKey: string; descriptionKey: string }> = [
  { id: "sacrifice", icon: "◇", eyebrowKey: "soulTemple.services.sacrifice.eyebrow", titleKey: "soulTemple.services.sacrifice.title", descriptionKey: "soulTemple.services.sacrifice.description" },
  { id: "tree", icon: "✦", eyebrowKey: "soulTemple.services.tree.eyebrow", titleKey: "soulTemple.services.tree.title", descriptionKey: "soulTemple.services.tree.description" },
  { id: "altar", icon: "⚑", eyebrowKey: "soulTemple.services.altar.eyebrow", titleKey: "soulTemple.services.altar.title", descriptionKey: "soulTemple.services.altar.description" },
  { id: "restoration", icon: "✚", eyebrowKey: "soulTemple.services.restoration.eyebrow", titleKey: "soulTemple.services.restoration.title", descriptionKey: "soulTemple.services.restoration.description" },
];

export function SoulTempleMenu({ onChanged, onLeave }: { onChanged: () => void; onLeave: () => void }) {
  const { t } = useTranslation();
  const [service, setService] = useState<TempleService>("sacrifice");
  const [message, setMessage] = useState(t("soulTemple.defaultMessage"));
  const focused = SERVICES.find((entry) => entry.id === service)!;
  const awakenedNodes = META_UPGRADES.filter((upgrade) => metaRank(gameSession.metaProgression, upgrade.id) > 0).length;
  const act = (text: string) => { setMessage(text); onChanged(); };

  return <div className="soul-temple-overlay"><main className={`soul-temple-menu temple-focus-${service}`}>
    <header className="temple-header">
      <div className="temple-identity"><p className="eyebrow">{t("soulTemple.eyebrow")}</p><h1>{t("soulTemple.title")}</h1><p>{t("soulTemple.description")}</p></div>
      <div className="temple-stat-strip"><TempleStat label={t("soulTemple.souls")} value={gameSession.metaProgression.souls} detail={t("soulTemple.acrossRuns")} /><TempleStat label={t("soulTemple.prisoners")} value={gameSession.prisonerCount} detail={t("soulTemple.awaitingTithe")} /><TempleStat label={t("soulTemple.awakened")} value={`${awakenedNodes}/${META_UPGRADES.length}`} detail={t("soulTemple.legacyNodes")} /></div>
      <div className="temple-seal"><span>◉</span><strong>{t("soulTemple.godOfSouls")}</strong><small>{t("soulTemple.eternalWitness")}</small></div>
    </header>

    <section className="temple-workspace">
      <nav className="temple-services" aria-label={t("soulTemple.servicesLabel")}><span>{t("soulTemple.servicesLabel")}</span>{SERVICES.map((entry) => <button key={entry.id} className={service === entry.id ? "active" : ""} onMouseEnter={() => setService(entry.id)} onFocus={() => setService(entry.id)} onClick={() => setService(entry.id)}><i>{entry.icon}</i><span><small>{t(entry.eyebrowKey)}</small><strong>{t(entry.titleKey)}</strong></span><b>›</b></button>)}</nav>
      <div className="temple-service-intro"><span className="eyebrow">{t(focused.eyebrowKey)}</span><h2>{t(focused.titleKey)}</h2><p>{t(focused.descriptionKey)}</p></div>
      <div className="temple-service-content">
        {service === "sacrifice" ? <SacrificeService t={t} act={act} /> : null}
        {service === "tree" ? <SoulConstellation t={t} act={act} /> : null}
        {service === "altar" ? <ForeignBanners t={t} act={act} /> : null}
        {service === "restoration" ? <RestorationService t={t} act={act} /> : null}
      </div>
    </section>

    <footer className="temple-footer"><div><span>{t("soulTemple.souls")}</span><strong>{gameSession.metaProgression.souls}</strong></div><p>{message}</p><button className="temple-leave" onClick={onLeave}>{t("soulTemple.leave")} <span>→</span></button></footer>
  </main></div>;
}

function TempleStat({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

function SacrificeService({ t, act }: { t: TFunction; act: (text: string) => void }) {
  return <div className={`sacrifice-sanctum ${gameSession.prisoners.length ? "has-offerings" : "is-empty"}`}>
    <div className="sacrificial-altar-stage" aria-hidden="true">
      <div className="altar-chain chain-left" /><div className="altar-chain chain-right" />
      <div className="altar-halo"><i /><i /><i /></div>
      <div className="altar-flame">◇</div>
      <div className="altar-stone"><span>{gameSession.metaProgression.souls}</span><small>{t("soulTemple.souls")}</small></div>
    </div>
    <div className="temple-card-grid sacrifice-grid">{gameSession.prisoners.length ? gameSession.prisoners.map((stack) => {
    const card = getCardDefinition(stack.cardId);
    const value = soulValueForTier(card.tier);
    return <article className="sacrifice-card" key={stack.cardId}>{card.portraitImage ? <img src={card.portraitImage} alt="" style={{ objectPosition: `${card.imageFocus?.x ?? 50}% ${card.imageFocus?.y ?? 50}%` }} /> : null}<div><span>{card.race} · {t("soulTemple.tier", { tier: card.tier })}</span><h3 className={`rarity-name ${card.rarity}`}>{t(card.nameKey)}</h3><p>{t("soulTemple.sacrificeValue", { count: stack.quantity, value })}</p></div><footer><button onClick={() => act(t("soulTemple.boundSouls", { count: gameSession.sacrificePrisoner(stack.cardId) }))}>{t("soulTemple.bindOne")}</button><button className="ghost" onClick={() => act(t("soulTemple.boundSouls", { count: gameSession.sacrificePrisoner(stack.cardId, stack.quantity) }))}>{t("soulTemple.bindAll")}</button></footer></article>;
  }) : <div className="temple-empty altar-empty-copy"><span>◇</span><h3>{t("soulTemple.noPrisoners")}</h3><p>{t("soulTemple.noPrisonersText")}</p></div>}</div>
  </div>;
}

function RestorationService({ t, act }: { t: TFunction; act: (text: string) => void }) {
  const disabled = gameSession.healCost === 0 || gameSession.gold < gameSession.healCost;
  return <div className="restoration-sanctum"><span className="restoration-rune">✚</span><p className="eyebrow">{t("soulTemple.restorationEyebrow")}</p><h3>{t("soulTemple.restorationTitle")}</h3><p>{t("soulTemple.restorationText")}</p><div><span>{t("soulTemple.goldAvailable")}</span><strong>{gameSession.gold}</strong><span>{t("soulTemple.restorationCost")}</span><strong>{gameSession.healCost}</strong></div><button disabled={disabled} onClick={() => act(gameSession.healDeck() ? t("soulTemple.restored") : t("soulTemple.restorationUnavailable"))}>{gameSession.healCost > 0 ? t("soulTemple.restoreFor", { cost: gameSession.healCost }) : t("soulTemple.fullyHealed")}</button></div>;
}

function ForeignBanners({ t, act }: { t: TFunction; act: (text: string) => void }) {
  return <div><p className="altar-note">{t("soulTemple.bannerNote")}</p><div className="temple-card-grid altar-offers">{gameSession.soulAltarOffers.map((cardId) => {
    const card = getCardDefinition(cardId);
    return <article key={cardId}>{card.portraitImage ? <img src={card.portraitImage} alt="" style={{ objectPosition: `${card.imageFocus?.x ?? 50}% ${card.imageFocus?.y ?? 50}%` }} /> : null}<span>{card.race} · {t("soulTemple.tier", { tier: card.tier })}</span><h3 className={`rarity-name ${card.rarity}`}>{t(card.nameKey)}</h3><dl><div><dt>ATK</dt><dd>{card.atk}</dd></div><div><dt>DEF</dt><dd>{card.def}</dd></div><div><dt>HP</dt><dd>{card.maxHp}</dd></div></dl><button onClick={() => { const result = gameSession.recruitFromSoulAltar(cardId); act(t(`soulTemple.recruitResult.${result}`, { unit: t(card.nameKey) })); }}>{t("soulTemple.callFor", { cost: gameSession.soulAltarCost(cardId) })}</button></article>;
  })}</div></div>;
}

function SoulConstellation({ t, act }: { t: TFunction; act: (text: string) => void }) {
  const revealedNodes = META_UPGRADES.filter((upgrade) => isMetaUpgradeRevealed(gameSession.metaProgression, upgrade));
  const [selectedId, setSelectedId] = useState<MetaUpgradeId>("soulVitality");
  const selected = revealedNodes.find((upgrade) => upgrade.id === selectedId) ?? revealedNodes[0];

  return <div className="soul-constellation">
    <div className="constellation-layout"><div className="constellation-map">
      <div className="constellation-branch-label branch-wanderer"><strong>{t("soulTemple.branches.wanderer.name")}</strong><small>{t("soulTemple.branches.wanderer.subtitle")}</small></div>
      <div className="constellation-branch-label branch-warband"><strong>{t("soulTemple.branches.warband.name")}</strong><small>{t("soulTemple.branches.warband.subtitle")}</small></div>
      <div className="constellation-branch-label branch-fortune"><strong>{t("soulTemple.branches.fortune.name")}</strong><small>{t("soulTemple.branches.fortune.subtitle")}</small></div>
      <div className="constellation-branch-label branch-peoples"><strong>{t("soulTemple.branches.peoples.name")}</strong><small>{t("soulTemple.branches.peoples.subtitle")}</small></div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {revealedNodes.filter((upgrade) => !upgrade.requires?.length).map((upgrade) => { const position = constellationPosition(upgrade); return <line key={`nexus-${upgrade.id}`} className="nexus-link" x1="50" y1="50" x2={position.x} y2={position.y} />; })}
        {revealedNodes.flatMap((upgrade) => (upgrade.requires ?? []).map((requiredId) => { const parent = META_UPGRADES.find((candidate) => candidate.id === requiredId); if (!parent || !revealedNodes.includes(parent)) return null; const from = constellationPosition(parent); const to = constellationPosition(upgrade); const active = metaRank(gameSession.metaProgression, requiredId) > 0; return <line key={`${requiredId}-${upgrade.id}`} className={active ? "active" : ""} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />; }))}
      </svg>
      <div className="constellation-nexus"><span>◉</span><small>{t("soulTemple.souls")}</small><strong>{gameSession.metaProgression.souls}</strong></div>
      {revealedNodes.map((upgrade) => { const rank = metaRank(gameSession.metaProgression, upgrade.id); const mastered = rank >= upgrade.costs.length; const purchasable = canBuyMetaUpgrade(gameSession.metaProgression, upgrade.id); const position = constellationPosition(upgrade); return <button key={upgrade.id} className={`constellation-node branch-${upgrade.branch} ${rank ? "owned" : ""} ${purchasable ? "available" : ""} ${mastered ? "mastered" : ""} ${selected?.id === upgrade.id ? "selected" : ""}`} style={{ left: `${position.x}%`, top: `${position.y}%` }} onClick={() => setSelectedId(upgrade.id)}><span>{upgrade.icon}</span><small>{rank}/{upgrade.costs.length}</small></button>; })}
    </div>{selected ? <UpgradeDossier t={t} upgrade={selected} act={act} /> : null}</div>
  </div>;
}

function constellationPosition(upgrade: MetaUpgradeDefinition) {
  const branchAngles = { wanderer: 225, warband: 315, fortune: 45, peoples: 135 } as const;
  const progress = Math.max(0, Math.min(1, (upgrade.x - 12) / 77));
  const radius = 10 + progress * 42;
  const spread = ((upgrade.y - 50) / 50) * 34;
  const angle = (branchAngles[upgrade.branch] + spread) * Math.PI / 180;
  return { x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius };
}

function UpgradeDossier({ t, upgrade, act }: { t: TFunction; upgrade: MetaUpgradeDefinition; act: (text: string) => void }) {
  const rank = metaRank(gameSession.metaProgression, upgrade.id);
  const cost = upgrade.costs[rank];
  const mastered = cost === undefined;
  return <aside className="upgrade-dossier"><span className="upgrade-dossier-rune">{upgrade.icon}</span><p className="eyebrow">{t(`soulTemple.branches.${upgrade.branch}.name`)}</p><h3>{t(upgrade.nameKey)}</h3><span>{t("soulTemple.rank", { rank, max: upgrade.costs.length })}</span><p>{t(upgrade.descriptionKey)}</p><div className="upgrade-ranks">{upgrade.costs.map((_, index) => <i className={index < rank ? "filled" : ""} key={index} />)}</div><button disabled={mastered || !canBuyMetaUpgrade(gameSession.metaProgression, upgrade.id)} onClick={() => { if (gameSession.buySoulUpgrade(upgrade.id)) act(t("soulTemple.awakenedMessage", { upgrade: t(upgrade.nameKey) })); }}>{mastered ? t("soulTemple.mastered") : gameSession.metaProgression.souls < cost ? t("soulTemple.needSouls", { cost }) : t("soulTemple.awakenFor", { cost })}</button><small>{t("soulTemple.hiddenPathsHint")}</small></aside>;
}
