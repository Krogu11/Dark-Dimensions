import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  contentPack,
  itemsById,
  tradeRecipesById,
} from "../content/content";
import { getCardDefinition } from "../domain/cards/CardInstance";
import type {
  InventoryStack,
  MarketOffer,
  MarketProfile,
} from "../domain/economy/Economy";
import {
  gameSession,
  type EquipmentSlot,
  type TradeActionResult,
} from "../domain/session/GameSession";
import type { ItemDefinition } from "../domain/content/schemas";

interface InventoryMarketProps {
  onClose: () => void;
  returnToCity?: boolean;
}

type MarketTab = "market" | "workshops" | "inventory";
type ItemFilter = "all" | "consumable" | "resource" | "tradeGood" | "equipment";
type SortMode = "name" | "price" | "quantity" | "weight";

interface DisplayEntry {
  item: ItemDefinition;
  quantity: number;
  price: number;
  stack?: InventoryStack;
  offer?: MarketOffer;
}

const FILTERS: ItemFilter[] = [
  "all",
  "consumable",
  "resource",
  "tradeGood",
  "equipment",
];
const SORT_MODES: SortMode[] = ["name", "price", "quantity", "weight"];
const EQUIPMENT_SLOTS: Array<{ slot: EquipmentSlot; labelKey: string }> = [
  { slot: "rightHand", labelKey: "trade.rightHand" },
  { slot: "leftHand", labelKey: "trade.leftHand" },
  { slot: "accessory", labelKey: "trade.accessory" },
];

function formatStackAmount(stack: InventoryStack): string {
  const item = itemsById.get(stack.itemId);
  if (!item?.foodUnits) return `×${stack.quantity}`;
  const capacity = item.foodUnits * stack.quantity;
  return `${stack.supply ?? capacity}/${capacity}`;
}

function entryWeight(entry: DisplayEntry): number {
  return entry.item.weight * entry.quantity;
}

function getSlotLabelKey(item: ItemDefinition): string {
  if (item.equipmentSlot === "rightHand") return "trade.rightHand";
  if (item.equipmentSlot === "leftHand") return "trade.leftHand";
  return "trade.accessory";
}

export default function InventoryMarket({
  onClose,
  returnToCity = false,
}: InventoryMarketProps) {
  const { t } = useTranslation();
  const [message, setMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MarketTab>(
    gameSession.marketProfile ? "market" : "inventory",
  );
  const [itemFilter, setItemFilter] = useState<ItemFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const profile = gameSession.marketProfile;
  const location = gameSession.world.nearbyLocation;
  const caravan = gameSession.nearbyCaravan;
  const recipes = (profile?.recipeIds ?? [])
    .map((recipeId) => tradeRecipesById.get(recipeId))
    .filter((recipe) => recipe !== undefined);

  const marketEntries = useMemo(
    () =>
      filterAndSort(
        profile?.offers.map((offer) => ({
          item: itemsById.get(offer.itemId)!,
          quantity: offer.stock,
          price: gameSession.getBuyPrice(offer.itemId),
          offer,
        })) ?? [],
        itemFilter,
        sortMode,
        t,
      ),
    [profile, itemFilter, sortMode, t],
  );
  const inventoryEntries = useMemo(
    () =>
      filterAndSort(
        gameSession.inventory.map((stack) => ({
          item: itemsById.get(stack.itemId)!,
          quantity: stack.quantity,
          price: profile ? gameSession.getSellPrice(stack.itemId) : 0,
          stack,
        })),
        itemFilter,
        sortMode,
        t,
      ),
    [profile, itemFilter, sortMode, t],
  );

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
              {t("hud.wages")} {gameSession.weeklyWageCost}g
            </span>
            <span
              className={
                gameSession.cargoWeight > gameSession.maxCargoWeight
                  ? "cargo-limit warning"
                  : "cargo-limit"
              }
            >
              {t("trade.weight")} {gameSession.cargoWeight.toFixed(1)}/
              {gameSession.maxCargoWeight}
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

        <div className="trade-controls">
          <div>
            {FILTERS.map((filter) => (
              <button
                key={filter}
                className={itemFilter === filter ? "active" : ""}
                onClick={() => setItemFilter(filter)}
              >
                {t(`trade.filter.${filter}`)}
              </button>
            ))}
          </div>
          <label>
            {t("trade.sortBy")}
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
            >
              {SORT_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {t(`trade.sort.${mode}`)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="trade-grid tabbed">
          <section className="ledger-panel" hidden={activeTab !== "inventory"}>
            <div className="ledger-heading">
              <h2>{t("trade.inventory")}</h2>
              <span>
                {gameSession.inventory.reduce((sum, stack) => sum + stack.quantity, 0)} ·{" "}
                {gameSession.cargoWeight.toFixed(1)}/{gameSession.maxCargoWeight}
              </span>
            </div>

            <EquipmentSlots act={act} />

            <ItemList
              entries={inventoryEntries}
              emptyText={t("trade.emptyInventory")}
              renderAction={(entry) => (
                <InventoryActions entry={entry} profileAvailable={Boolean(profile)} act={act} />
              )}
            />
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
                    <MarketNote profile={profile} />
                    <div className="exchange-grid">
                      <section className="exchange-column">
                        <header>
                          <strong>{t("trade.merchantInventory")}</strong>
                          <span>{marketEntries.length}</span>
                        </header>
                        <ItemList
                          entries={marketEntries}
                          emptyText={t("trade.emptyFiltered")}
                          marketList
                          renderAction={(entry) => (
                            <button
                              className="button primary compact"
                              disabled={
                                gameSession.gold < entry.price ||
                                entry.quantity <= 0 ||
                                !gameSession.canBuyItem(entry.item.id)
                              }
                              onClick={() => act(gameSession.buyItem(entry.item.id), "trade.bought")}
                            >
                              {t("trade.buyStock", {
                                price: entry.price,
                                stock: entry.quantity,
                              })}
                            </button>
                          )}
                        />
                      </section>
                      <section className="exchange-column player-cargo">
                        <header>
                          <strong>{t("trade.playerInventory")}</strong>
                          <span>{inventoryEntries.length}</span>
                        </header>
                        <ItemList
                          entries={inventoryEntries}
                          emptyText={t("trade.emptyInventory")}
                          renderAction={(entry) => (
                            <button
                              className="button ghost compact"
                              onClick={() => act(gameSession.sellItem(entry.item.id), "trade.sold")}
                            >
                              {t("trade.sell", { price: entry.price })}
                            </button>
                          )}
                        />
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

function EquipmentSlots({
  act,
}: {
  act: (result: TradeActionResult, successKey: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="equipment-slots expanded">
      {EQUIPMENT_SLOTS.map(({ slot, labelKey }) => {
        const itemId =
          slot === "rightHand"
            ? gameSession.rightHandItemId
            : slot === "leftHand"
              ? gameSession.leftHandItemId
              : gameSession.equippedItemId;
        const equipped = itemId ? itemsById.get(itemId) : null;
        return (
          <article className="equipped-slot" key={slot}>
            <span>{t(labelKey)}</span>
            {equipped ? (
              <>
                <strong>{t(equipped.nameKey)}</strong>
                <small>{t(equipped.descriptionKey)}</small>
                <em>
                  ATK +{equipped.statBonus?.atk ?? 0} · DEF +
                  {equipped.statBonus?.def ?? 0} · {t("trade.weight")}{" "}
                  {equipped.weight}
                </em>
                <button
                  className="button ghost compact"
                  onClick={() => act(gameSession.unequipItem(slot), "trade.unequipped")}
                >
                  {t("trade.unequip")}
                </button>
              </>
            ) : (
              <em>{t("trade.emptyEquipment")}</em>
            )}
          </article>
        );
      })}
    </div>
  );
}

function MarketNote({ profile }: { profile: MarketProfile }) {
  const { t } = useTranslation();
  const itemId =
    profile.locationType === "village"
      ? profile.productionItemId
      : profile.locationType === "city"
        ? profile.demandItemId!
        : profile.productionItemId;
  return (
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
      <span>{t(itemsById.get(itemId)!.nameKey)}</span>
    </div>
  );
}

function ItemList({
  entries,
  emptyText,
  renderAction,
  marketList = false,
}: {
  entries: DisplayEntry[];
  emptyText: string;
  renderAction: (entry: DisplayEntry) => ReactNode;
  marketList?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className={marketList ? "market-list" : "inventory-list"}>
      {entries.map((entry) => (
        <article
          className={`${marketList ? "market-row" : "inventory-row"} ${entry.item.type}`}
          key={entry.item.id}
        >
          <div>
            <span>
              {t(`trade.filter.${entry.item.type}`)} · {t("trade.weight")}{" "}
              {entry.item.weight} · {t("trade.totalWeight")}{" "}
              {entryWeight(entry).toFixed(1)}
            </span>
            <strong>
              {t(entry.item.nameKey)}{" "}
              {entry.stack ? formatStackAmount(entry.stack) : `×${entry.quantity}`}
            </strong>
            <small>{t(entry.item.descriptionKey)}</small>
          </div>
          <div className="inventory-actions">{renderAction(entry)}</div>
        </article>
      ))}
      {entries.length === 0 ? <p className="ledger-empty">{emptyText}</p> : null}
    </div>
  );
}

function InventoryActions({
  entry,
  profileAvailable,
  act,
}: {
  entry: DisplayEntry;
  profileAvailable: boolean;
  act: (result: TradeActionResult, successKey: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {entry.item.type === "consumable" && entry.item.effect ? (
        <button
          className="button ghost compact"
          onClick={() => act(gameSession.useItem(entry.item.id), "trade.used")}
        >
          {t("trade.use")}
        </button>
      ) : null}
      {entry.item.type === "equipment" ? (
        <button
          className="button ghost compact"
          onClick={() => act(gameSession.equipItem(entry.item.id), "trade.equippedResult")}
        >
          {t("trade.equipSlot", {
            slot: t(getSlotLabelKey(entry.item)),
          })}
        </button>
      ) : null}
      {profileAvailable ? (
        <button
          className="button ghost compact"
          onClick={() => act(gameSession.sellItem(entry.item.id), "trade.sold")}
        >
          {t("trade.sell", { price: entry.price })}
        </button>
      ) : null}
    </>
  );
}

function filterAndSort(
  entries: DisplayEntry[],
  filter: ItemFilter,
  sortMode: SortMode,
  t: (key: string) => string,
): DisplayEntry[] {
  return entries
    .filter((entry) => filter === "all" || entry.item.type === filter)
    .sort((left, right) => {
      if (sortMode === "price") return right.price - left.price;
      if (sortMode === "quantity") return right.quantity - left.quantity;
      if (sortMode === "weight") return entryWeight(right) - entryWeight(left);
      return t(left.item.nameKey).localeCompare(t(right.item.nameKey));
    });
}
