import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { itemsById } from "../content/content";
import type { InventoryStack, MarketOffer } from "../domain/economy/Economy";
import { gameSession } from "../domain/session/GameSession";
import type { ItemDefinition } from "../domain/content/schemas";

interface InventoryMarketProps {
  onClose: () => void;
  onTrade?: () => void;
  returnToCity?: boolean;
}

type ItemFilter = "all" | "consumable" | "resource" | "tradeGood" | "equipment";
type QuantityMode = 1 | 5 | "max";
type Side = "merchant" | "player";

interface DisplayEntry {
  item: ItemDefinition;
  quantity: number;
  price: number;
  stack?: InventoryStack;
  offer?: MarketOffer;
}

const FILTERS: ItemFilter[] = ["all", "consumable", "resource", "tradeGood", "equipment"];

export default function InventoryMarket({ onClose, onTrade, returnToCity = false }: InventoryMarketProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<ItemFilter>("all");
  const [quantityMode, setQuantityMode] = useState<QuantityMode>(1);
  const [selected, setSelected] = useState<{ side: Side; itemId: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [, redraw] = useState(0);
  const profile = gameSession.marketProfile;
  const location = gameSession.world.nearbyLocation;
  const caravan = gameSession.nearbyCaravan;

  const merchantEntries = useMemo(() => filterEntries((profile?.offers ?? []).map((offer) => ({
    item: itemsById.get(offer.itemId)!, quantity: offer.stock,
    price: gameSession.getBuyPrice(offer.itemId), offer,
  })), filter), [profile, filter]);
  const playerEntries = useMemo(() => filterEntries(gameSession.inventory.map((stack) => ({
    item: itemsById.get(stack.itemId)!, quantity: stack.quantity,
    price: profile ? gameSession.getSellPrice(stack.itemId) : 0, stack,
  })), filter), [profile, filter, gameSession.inventory.length]);
  const selectedEntry = selected?.side === "merchant"
    ? merchantEntries.find((entry) => entry.item.id === selected.itemId)
    : playerEntries.find((entry) => entry.item.id === selected?.itemId);
  const merchantGold = profile?.locationId
    ? (gameSession.economyState.merchantGold[profile.locationId] ?? profile.merchantGold)
    : profile?.merchantGold ?? 0;

  function maxQuantity(entry: DisplayEntry, side: Side): number {
    if (side === "player") return Math.max(0, Math.min(entry.quantity, Math.floor(merchantGold / Math.max(1, entry.price))));
    const weightRoom = entry.item.weight <= 0 ? entry.quantity : Math.floor((gameSession.maxCargoWeight - gameSession.cargoWeight) / entry.item.weight);
    return Math.max(0, Math.min(entry.quantity, Math.floor(gameSession.gold / Math.max(1, entry.price)), weightRoom));
  }

  function selectedQuantity(entry: DisplayEntry, side: Side): number {
    return quantityMode === "max"
      ? maxQuantity(entry, side)
      : Math.min(quantityMode, maxQuantity(entry, side));
  }

  function trade(): void {
    if (!selected || !selectedEntry || !profile) return;
    const quantity = selectedQuantity(selectedEntry, selected.side);
    if (quantity <= 0) return;
    const result = selected.side === "merchant"
      ? gameSession.buyItem(selectedEntry.item.id, quantity)
      : gameSession.sellItem(selectedEntry.item.id, quantity);
    setMessage(t(result === "success" ? (selected.side === "merchant" ? "trade.bought" : "trade.sold") : `trade.${result}`));
    if (result === "success") onTrade?.();
    redraw((value) => value + 1);
  }

  const marketName = location ? t(location.nameKey) : caravan ? t(caravan.kind === "villager" ? "trade.villagerName" : "trade.caravanName") : t("trade.roadInventory");

  if (!profile) return <InventoryOnly onClose={onClose} />;

  return (
    <div className="market-overlay">
      <main className="market-screen">
        <header className="market-header">
          <div><p className="eyebrow">{t("trade.eyebrow")}</p><h1>{marketName}</h1><p>{t("trade.marketTitle")}</p></div>
          <div className="market-wallet"><span><small>{t("hud.gold")}</small><strong>{gameSession.gold}g</strong></span><span><small>{t("trade.weight")}</small><strong>{gameSession.cargoWeight.toFixed(1)} / {gameSession.maxCargoWeight}</strong></span><span><small>{t("trade.merchantFunds")}</small><strong>{merchantGold}g</strong></span></div>
          <button className="market-close" onClick={onClose}>{t(returnToCity ? "trade.returnToCity" : "trade.close")} <b>→</b></button>
        </header>

        <section className="market-intel">
          <MarketSignals title={t("trade.inDemand")} modifier="+20–50%" itemIds={profile.demandItemIds} tone="demand" />
          <MarketSignals title={t("trade.localSurplus")} modifier="Lower buy prices" itemIds={profile.surplusItemIds} tone="surplus" />
          <div className="market-supply"><span>{t("hud.food")}</span><strong>{gameSession.rationCount} / {gameSession.foodCapacity}</strong><small>{t("trade.weeklyNeeds", { wages: gameSession.weeklyWageCost })}</small></div>
        </section>

        <nav className="market-filters" aria-label="Item filters">
          {FILTERS.map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{t(`trade.filter.${value}`)}</button>)}
        </nav>

        <section className="market-columns">
          <TradeColumn side="merchant" title={t("trade.merchantInventory")} subtitle={`${merchantEntries.length} ${t("trade.offers")}`} entries={merchantEntries} selected={selected} onSelect={setSelected} />
          <TradeColumn side="player" title={t("trade.playerInventory")} subtitle={`${playerEntries.length} ${t("trade.stacks")}`} entries={playerEntries} selected={selected} onSelect={setSelected} />
        </section>

        <footer className="market-tradebar">
          {selectedEntry && selected ? <>
            <div className="market-selection"><span>{selected.side === "merchant" ? t("trade.buying") : t("trade.selling")}</span><strong>{t(selectedEntry.item.nameKey)}</strong><small>{t(selectedEntry.item.descriptionKey)}</small></div>
            <div className="quantity-picker"><span>{t("trade.quantity")}</span>{([1, 5, "max"] as QuantityMode[]).map((value) => <button key={value} className={quantityMode === value ? "active" : ""} onClick={() => setQuantityMode(value)}>{value === "max" ? t("trade.max") : value}</button>)}</div>
            <div className="trade-total"><span>{selectedQuantity(selectedEntry, selected.side)} × {selectedEntry.price}g</span><strong>{selectedQuantity(selectedEntry, selected.side) * selectedEntry.price}g</strong></div>
            <button className="market-confirm" disabled={maxQuantity(selectedEntry, selected.side) <= 0} onClick={trade}>{selected.side === "merchant" ? t("trade.buyNow") : t("trade.sellNow")}</button>
          </> : <p className="market-prompt">{t("trade.selectPrompt")}</p>}
        </footer>
        {message ? <div className="market-message">{message}</div> : null}
      </main>
    </div>
  );
}

function MarketSignals({ title, modifier, itemIds, tone }: { title: string; modifier: string; itemIds: string[]; tone: string }) {
  const { t } = useTranslation();
  return <div className={`market-signals ${tone}`}><span>{title}</span><div>{itemIds.map((itemId) => <strong key={itemId}>{t(itemsById.get(itemId)?.nameKey ?? itemId)}</strong>)}</div><small>{modifier}</small></div>;
}

function TradeColumn({ side, title, subtitle, entries, selected, onSelect }: { side: Side; title: string; subtitle: string; entries: DisplayEntry[]; selected: { side: Side; itemId: string } | null; onSelect: (value: { side: Side; itemId: string }) => void }) {
  const { t } = useTranslation();
  return <section className={`market-column ${side}`}><header><div><span>{side === "merchant" ? "Local wares" : "Warband cargo"}</span><h2>{title}</h2></div><small>{subtitle}</small></header><div className="market-scroll-list">
    {entries.map((entry) => <button key={entry.item.id} className={`market-item ${selected?.side === side && selected.itemId === entry.item.id ? "selected" : ""}`} onClick={() => onSelect({ side, itemId: entry.item.id })}>
      <span className={`market-item-mark ${entry.item.type}`}>{entry.item.itemImage ? <img src={entry.item.itemImage} alt="" style={{ objectPosition: `${entry.item.imageFocus?.x ?? 50}% ${entry.item.imageFocus?.y ?? 50}%` }} /> : t(entry.item.nameKey).slice(0, 1)}</span><span className="market-item-copy"><small>{t(`trade.filter.${entry.item.type}`)} · {entry.item.weight} {t("trade.weight")}</small><strong>{t(entry.item.nameKey)}</strong><em>{t(entry.item.descriptionKey)}</em>{entry.item.type === "equipment" ? <EquipmentStats item={entry.item} /> : null}</span><span className="market-item-value"><strong>{entry.price}g</strong><small>×{entry.quantity}</small></span>
      {entry.item.type === "equipment" ? <EquipmentComparison item={entry.item} /> : null}
    </button>)}
    {entries.length === 0 ? <p className="ledger-empty">{t("trade.emptyFiltered")}</p> : null}
  </div></section>;
}

function EquipmentStats({ item }: { item: ItemDefinition }) {
  return <span className="market-equipment-stats">
    {equipmentSlotLabel(item)} · ATK +{item.statBonus?.atk ?? 0} · DEF +{item.statBonus?.def ?? 0}
  </span>;
}

function EquipmentComparison({ item }: { item: ItemDefinition }) {
  const { t } = useTranslation();
  const equippedId = item.equipmentSlot === "leftHand"
    ? gameSession.leftHandItemId
    : item.equipmentSlot === "accessory"
      ? gameSession.equippedItemId
      : gameSession.rightHandItemId;
  const equipped = equippedId ? itemsById.get(equippedId) : undefined;
  const attackDifference = (item.statBonus?.atk ?? 0) - (equipped?.statBonus?.atk ?? 0);
  const defenseDifference = (item.statBonus?.def ?? 0) - (equipped?.statBonus?.def ?? 0);
  return <span className="equipment-comparison-tooltip" role="tooltip">
    <span>Compared with {equipped ? t(equipped.nameKey) : "empty slot"}</span>
    <strong>{equipmentSlotLabel(item)}</strong>
    <em className={differenceClass(attackDifference)}>ATK {formatDifference(attackDifference)}</em>
    <em className={differenceClass(defenseDifference)}>DEF {formatDifference(defenseDifference)}</em>
  </span>;
}

function equipmentSlotLabel(item: ItemDefinition): string {
  if (item.equipmentSlot === "leftHand") return "Left hand";
  if (item.equipmentSlot === "accessory") return "Accessory";
  return "Right hand";
}

function differenceClass(value: number): string {
  return value > 0 ? "better" : value < 0 ? "worse" : "equal";
}

function formatDifference(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function InventoryOnly({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [, redraw] = useState(0);
  return <div className="market-overlay"><main className="market-screen inventory-only"><header className="market-header"><div><p className="eyebrow">{t("trade.roadInventory")}</p><h1>{t("trade.inventoryTitle")}</h1></div><button className="market-close" onClick={onClose}>{t("trade.close")} →</button></header><section className="inventory-only-list">
    {gameSession.inventory.map((stack) => { const item = itemsById.get(stack.itemId)!; return <article key={item.id}><div><strong>{t(item.nameKey)} ×{stack.quantity}</strong><small>{t(item.descriptionKey)}</small></div><div>{item.type === "consumable" ? <button onClick={() => { gameSession.useItem(item.id); redraw(v => v + 1); }}>{t("trade.use")}</button> : null}{item.type === "equipment" ? <button onClick={() => { gameSession.equipItem(item.id); redraw(v => v + 1); }}>{t("trade.equip")}</button> : null}</div></article>; })}
  </section></main></div>;
}

function filterEntries(entries: DisplayEntry[], filter: ItemFilter): DisplayEntry[] {
  const priority: Record<ItemDefinition["type"], number> = { consumable: 0, equipment: 1, tradeGood: 2, resource: 3 };
  return entries
    .filter((entry) => entry.item && (filter === "all" || entry.item.type === filter))
    .sort((a, b) => priority[a.item.type] - priority[b.item.type] || a.price - b.price);
}
