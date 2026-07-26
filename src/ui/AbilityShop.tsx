import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AbilityDefinition } from "../domain/content/schemas";
import { gameSession } from "../domain/session/GameSession";
import { playUiSound } from "./UiSoundEffects";

interface AbilityShopProps {
  onClose: () => void;
  onPurchase?: () => void;
}

export default function AbilityShop({ onClose, onPurchase }: AbilityShopProps) {
  const { t } = useTranslation();
  const [, redraw] = useState(0);
  const offers = gameSession.abilityMerchantOffers;
  const [selectedId, setSelectedId] = useState<string | null>(offers[0]?.id ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const selected = offers.find((ability) => ability.id === selectedId) ?? offers[0];
  const city = gameSession.world.nearbyLocation;

  function purchase(ability: AbilityDefinition): void {
    const result = gameSession.learnAbility(ability.id);
    setMessage(t(result === "success" ? "ability.learned" : `trade.${result}`));
    if (result === "success") {
      playUiSound("buy-sell");
      onPurchase?.();
      setSelectedId(gameSession.abilityMerchantOffers[0]?.id ?? null);
    }
    redraw((value) => value + 1);
  }

  return (
    <div className="ability-shop-overlay">
      <main className="ability-shop-screen">
        <header className="ability-shop-header">
          <div>
            <p className="eyebrow">{t("ability.merchantEyebrow")}</p>
            <h1>{t("ability.merchantTitle")}</h1>
            <p>{city ? t(city.nameKey) : ""} · {t("ability.shopSubtitle")}</p>
          </div>
          <div className="ability-shop-wallet">
            <small>{t("hud.gold")}</small>
            <strong>{gameSession.gold}g</strong>
          </div>
          <button onClick={onClose}>{t("trade.returnToCity")} <span>→</span></button>
        </header>

        <section className="ability-shop-body">
          <aside className="ability-shop-offers">
            <header>
              <div><span>{t("ability.availableTeachings")}</span><h2>{t("ability.weeklySelection")}</h2></div>
              <small>{t("ability.merchantRestock")}</small>
            </header>
            <div className="ability-offer-list">
              {offers.map((ability) => (
                <button
                  key={ability.id}
                  className={selected?.id === ability.id ? "active" : ""}
                  onClick={() => setSelectedId(ability.id)}
                >
                  <b>{ability.icon}</b>
                  <span>
                    <small>{ability.category} · Tier {ability.tier}</small>
                    <strong>{t(ability.nameKey)}</strong>
                    <em>{ability.actionCost} {t("ability.actions")}</em>
                  </span>
                  <i>{gameSession.getAbilityPrice(ability.id)}g</i>
                </button>
              ))}
              {!offers.length ? <EmptyShop title={t("ability.merchantEmpty")} detail={t("ability.returnNextWeek")} /> : null}
            </div>
          </aside>

          <article className="ability-shop-detail">
            {selected ? <>
              <div className={`ability-sigil tier-${selected.tier}`}>{selected.icon}</div>
              <p className="eyebrow">{selected.category} · Tier {selected.tier}</p>
              <h2>{t(selected.nameKey)}</h2>
              <p className="ability-shop-description">{t(selected.descriptionKey)}</p>
              <dl>
                <div><dt>{t("ability.tier")}</dt><dd>{selected.tier} / 5</dd></div>
                <div><dt>{t("ability.actionCost")}</dt><dd>{selected.actionCost}</dd></div>
                <div><dt>{t("ability.target")}</dt><dd>{t(`ability.targets.${selected.target}`)}</dd></div>
                <div><dt>{t("ability.price")}</dt><dd>{gameSession.getAbilityPrice(selected.id)}g</dd></div>
              </dl>
              <div className="ability-tier-cost">
                <span>{Array.from({ length: 5 }, (_, index) => <i key={index} className={index < selected.actionCost ? "spent" : ""} />)}</span>
                <small>{t("ability.costExplanation", { count: selected.actionCost })}</small>
              </div>
              <button className="ability-learn-button" disabled={gameSession.gold < gameSession.getAbilityPrice(selected.id)} onClick={() => purchase(selected)}>
                {gameSession.gold < gameSession.getAbilityPrice(selected.id) ? t("trade.notEnoughGold") : t("ability.learnFor", { price: gameSession.getAbilityPrice(selected.id) })}
              </button>
            </> : <EmptyShop title={t("ability.allKnown")} detail={t("ability.allKnownDescription")} />}
          </article>
        </section>
        {message ? <div className="ability-shop-message">{message}</div> : null}
      </main>
    </div>
  );
}

function EmptyShop({ title, detail }: { title: string; detail: string }) {
  return <div className="ability-shop-empty"><b>✦</b><strong>{title}</strong><span>{detail}</span></div>;
}
