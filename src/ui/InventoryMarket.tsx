import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  contentPack,
  itemsById,
  tradeRecipesById,
} from "../content/content";
import { getCardDefinition } from "../domain/cards/CardInstance";
import type { InventoryStack } from "../domain/economy/Economy";
import { gameSession, type TradeActionResult } from "../domain/session/GameSession";

interface InventoryMarketProps {
  onClose: () => void;
  returnToCity?: boolean;
}

function formatStackAmount(stack: InventoryStack): string {
  const item = itemsById.get(stack.itemId);
  if (!item?.foodUnits) return `×${stack.quantity}`;
  const capacity = item.foodUnits * stack.quantity;
  return `${stack.supply ?? capacity}/${capacity}`;
}

type MarketTab = "market" | "workshops" | "inventory";

export default function InventoryMarket({
  onClose,
  returnToCity = false,
}: InventoryMarketProps) {
  const { t } = useTranslation();
  const [message, setMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MarketTab>(
    gameSession.marketProfile ? "market" : "inventory",
  );
  const profile = gameSession.marketProfile;
  const location = gameSession.world.nearbyLocation;
  const caravan = gameSession.nearbyCaravan;
  const recipes = (profile?.recipeIds ?? [])
    .map((recipeId) => tradeRecipesById.get(recipeId))
    .filter((recipe) => recipe !== undefined);
  const equipped = gameSession.equippedItemId
    ? itemsById.get(gameSession.equippedItemId)
    : null;

  function act(result: TradeActionResult, successKey: string): void {
    setMessage(t(result === "success" ? successKey : `trade.${result}`));
  }

  return (
    <div className="ledger-overlay">
      <main className="trade-ledger">
        <header className="trade-header">
          <div>
            <p className="eyebrow">{t("trade.eyebrow")}</p>
            <h1>{profile ? t("trade.marketTitle") : t("trade.inventoryTitle")}</h1>
            <p>
              {location
                ? t(location.nameKey)
                : caravan
                  ? t(
                      caravan.kind === "villager"
                        ? "trade.villagerName"
                        : "trade.caravanName",
                    )
                  : t("trade.roadInventory")}
            </p>
          </div>
          <div className="trade-header-actions">
            <strong>{t("hud.gold")} {gameSession.gold}</strong>
            <span>
              {t("hud.food")} {gameSession.rationCount}/{gameSession.foodCapacity} ·{" "}
              {t("hud.wages")} {gameSession.dailyWageCost}g
            </span>
            {gameSession.currentFactionId ? (
              <span className="market-reputation">
                {t(`faction.${gameSession.currentFactionId}.name`)} ·{" "}
                {t("quests.reputation", {
                  value: gameSession.currentFactionReputation,
                })}
              </span>
            ) : null}
            <button className="button ghost" onClick={onClose}>
              {t(returnToCity ? "trade.returnToCity" : "trade.close")}
            </button>
          </div>
        </header>

        <nav className="trade-tabs">
          {profile ? (
            <>
              <button
                className={activeTab === "market" ? "active" : ""}
                onClick={() => setActiveTab("market")}
              >
                {t("trade.marketTab")}
              </button>
              <button
                className={activeTab === "workshops" ? "active" : ""}
                onClick={() => setActiveTab("workshops")}
              >
                {t("trade.workshopTab")}
              </button>
            </>
          ) : null}
          <button
            className={activeTab === "inventory" ? "active" : ""}
            onClick={() => setActiveTab("inventory")}
          >
            {t("trade.inventoryTab")}
          </button>
        </nav>

        <div className="trade-grid tabbed">
          <section className="ledger-panel" hidden={activeTab !== "inventory"}>
            <div className="ledger-heading">
              <h2>{t("trade.inventory")}</h2>
              <span>{gameSession.inventory.reduce((sum, stack) => sum + stack.quantity, 0)}</span>
            </div>

            <article className="equipped-slot">
              <span>{t("trade.equipped")}</span>
              {equipped ? (
                <>
                  <strong>{t(equipped.nameKey)}</strong>
                  <small>{t(equipped.descriptionKey)}</small>
                  <button
                    className="button ghost compact"
                    onClick={() => act(gameSession.unequipItem(), "trade.unequipped")}
                  >
                    {t("trade.unequip")}
                  </button>
                </>
              ) : (
                <em>{t("trade.emptyEquipment")}</em>
              )}
            </article>

            <div className="inventory-list">
              {gameSession.inventory.map((stack) => {
                const item = itemsById.get(stack.itemId)!;
                const sellPrice =
                  profile ? gameSession.getSellPrice(item.id) : 0;
                return (
                  <article className={`inventory-row ${item.type}`} key={item.id}>
                    <div>
                      <span>{item.type}</span>
                      <strong>
                        {t(item.nameKey)} {formatStackAmount(stack)}
                      </strong>
                      <small>{t(item.descriptionKey)}</small>
                    </div>
                    <div className="inventory-actions">
                      {item.type === "consumable" && item.effect ? (
                        <button
                          className="button ghost compact"
                          onClick={() => act(gameSession.useItem(item.id), "trade.used")}
                        >
                          {t("trade.use")}
                        </button>
                      ) : null}
                      {item.type === "equipment" ? (
                        <button
                          className="button ghost compact"
                          onClick={() => act(gameSession.equipItem(item.id), "trade.equippedResult")}
                        >
                          {t("trade.equip")}
                        </button>
                      ) : null}
                      {profile ? (
                        <button
                          className="button ghost compact"
                          onClick={() => act(gameSession.sellItem(item.id), "trade.sold")}
                        >
                          {t("trade.sell", { price: sellPrice })}
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
              {gameSession.inventory.length === 0 ? (
                <p className="ledger-empty">{t("trade.emptyInventory")}</p>
              ) : null}
            </div>
          </section>

          <section className="ledger-panel" hidden={activeTab === "inventory"}>
            <div className="ledger-heading">
              <h2>
                {activeTab === "workshops"
                  ? t("trade.workshops")
                  : profile
                    ? t("trade.localMarket")
                    : t("trade.noMarket")}
              </h2>
              <span>{profile?.locationType ?? "—"}</span>
            </div>

            {profile ? (
              <>
                {activeTab === "market" ? (
                  <>
                <div className="market-note">
                  <strong>
                    {t(
                      profile.locationType === "village"
                        ? "trade.localProduction"
                        : profile.locationType === "city"
                          ? "trade.cityDemand"
                          : "trade.caravanStock",
                    )}
                  </strong>
                  <span>
                    {t(
                      itemsById.get(
                        profile.locationType === "village"
                          ? profile.productionItemId
                          : profile.locationType === "city"
                            ? profile.demandItemId!
                            : profile.productionItemId,
                      )!.nameKey,
                    )}
                  </span>
                </div>
                <div className="exchange-grid">
                  <section className="exchange-column">
                    <header>
                      <strong>{t("trade.merchantInventory")}</strong>
                      <span>{profile.offers.length}</span>
                    </header>
                <div className="market-list">
                  {profile.offers.map((offer) => {
                    const item = itemsById.get(offer.itemId)!;
                    const buyPrice = gameSession.getBuyPrice(item.id);
                    return (
                      <article className="market-row" key={item.id}>
                        <div>
                          <span>{item.type}</span>
                          <strong>{t(item.nameKey)}</strong>
                          <small>
                            {item.foodUnits
                              ? t("trade.foodSupply", {
                                  current: item.foodUnits,
                                  maximum: item.foodUnits,
                                })
                              : t(item.descriptionKey)}
                          </small>
                        </div>
                        <button
                          className="button primary compact"
                          disabled={gameSession.gold < buyPrice || offer.stock <= 0}
                          onClick={() => act(gameSession.buyItem(item.id), "trade.bought")}
                        >
                          {t("trade.buyStock", {
                            price: buyPrice,
                            stock: offer.stock,
                          })}
                        </button>
                      </article>
                    );
                  })}
                </div>
                  </section>
                  <section className="exchange-column player-cargo">
                    <header>
                      <strong>{t("trade.playerInventory")}</strong>
                      <span>{gameSession.inventory.length}</span>
                    </header>
                    <div className="inventory-list">
                      {gameSession.inventory.map((stack) => {
                        const item = itemsById.get(stack.itemId)!;
                        return (
                          <article
                            className={`inventory-row ${item.type}`}
                            key={item.id}
                          >
                            <div>
                              <span>{item.type}</span>
                              <strong>
                                {t(item.nameKey)} {formatStackAmount(stack)}
                              </strong>
                              <small>{t(item.descriptionKey)}</small>
                            </div>
                            <button
                              className="button ghost compact"
                              onClick={() =>
                                act(gameSession.sellItem(item.id), "trade.sold")
                              }
                            >
                              {t("trade.sell", {
                                price: gameSession.getSellPrice(item.id),
                              })}
                            </button>
                          </article>
                        );
                      })}
                      {gameSession.inventory.length === 0 ? (
                        <p className="ledger-empty">
                          {t("trade.emptyInventory")}
                        </p>
                      ) : null}
                    </div>
                  </section>
                </div>
                  </>
                ) : null}
                {activeTab === "workshops"
                  ? recipes.map((recipe) => (
                  <article className="workshop-card" key={recipe.id}>
                    <span>{t("trade.workshop")}</span>
                    <strong>
                      {t(itemsById.get(recipe.inputItemId)!.nameKey)} ×
                      {recipe.inputQuantity} →{" "}
                      {t(itemsById.get(recipe.outputItemId)!.nameKey)} ×
                      {recipe.outputQuantity}
                    </strong>
                    <button
                      className="button primary compact"
                      onClick={() =>
                        act(gameSession.processTrade(recipe.id), "trade.processed")
                      }
                    >
                      {t("trade.process", { price: recipe.goldCost })}
                    </button>
                  </article>
                    ))
                  : null}
              </>
            ) : (
              <p className="ledger-empty">{t("trade.marketHint")}</p>
            )}
          </section>
        </div>

        <details className="loot-almanac">
          <summary>{t("trade.lootAlmanac")}</summary>
          <div>
            {contentPack.enemies.map((enemy) => (
              <article key={enemy.id}>
                <strong>{t(enemy.nameKey)}</strong>
                {enemy.dropTable.map((drop) => (
                  <span key={drop.cardId}>
                    {t("trade.cardChance", {
                      name: t(getCardDefinition(drop.cardId).nameKey),
                      chance: Math.round(drop.chance * 100),
                    })}
                  </span>
                ))}
                {enemy.itemDropTable.map((drop) => (
                  <span key={drop.itemId}>
                    {t("trade.itemChance", {
                      name: t(itemsById.get(drop.itemId)!.nameKey),
                      chance: Math.round(drop.chance * 1000) / 10,
                      minimum: drop.minimum,
                      maximum: drop.maximum,
                    })}
                  </span>
                ))}
              </article>
            ))}
          </div>
        </details>

        {message ? <div className="trade-message">{message}</div> : null}
      </main>
    </div>
  );
}
