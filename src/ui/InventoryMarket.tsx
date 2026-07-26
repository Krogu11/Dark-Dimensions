import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { abilitiesById, itemsById } from "../content/content";
import type { InventoryStack, MarketOffer } from "../domain/economy/Economy";
import { gameSession } from "../domain/session/GameSession";
import type { ItemDefinition } from "../domain/content/schemas";
import { getCardDefinition } from "../domain/cards/CardInstance";
import { playUiSound } from "./UiSoundEffects";

interface InventoryMarketProps {
  onClose: () => void;
  onTrade?: () => void;
  returnToCity?: boolean;
  inventoryOnly?: boolean;
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

export default function InventoryMarket({ onClose, onTrade, returnToCity = false, inventoryOnly = false }: InventoryMarketProps) {
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
    if (result === "success") {
      playUiSound("buy-sell");
      onTrade?.();
    }
    redraw((value) => value + 1);
  }

  const marketName = location ? t(location.nameKey) : caravan ? t(caravan.kind === "villager" ? "trade.villagerName" : "trade.caravanName") : t("trade.roadInventory");

  if (inventoryOnly || !profile) return <InventoryOnly onClose={onClose} onChange={onTrade} returnToCity={returnToCity} />;

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

        {/* The ability merchant is a separate city service.
          <header><div><span className="eyebrow">{t("ability.merchantEyebrow")}</span><h2>{t("ability.merchantTitle")}</h2></div><small>{t("ability.merchantRestock")}</small></header>
          <div className="ability-merchant-grid">
            {gameSession.abilityMerchantOffers.map((ability) => {
              const price = gameSession.getAbilityPrice(ability.id);
              return <article key={ability.id}>
                <b>{ability.icon}</b>
                <span><small>{ability.category} · Tier {ability.tier} · {ability.actionCost} Actions</small><strong>{t(ability.nameKey)}</strong><em>{t(ability.descriptionKey)}</em></span>
                <button disabled={gameSession.gold < price} onClick={() => learnAbility(ability.id)}>{price}g</button>
              </article>;
            })}
            {!gameSession.abilityMerchantOffers.length ? <p>{t("ability.merchantEmpty")}</p> : null}
          </div>
        </section> */}

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
            <button className="market-confirm" data-ui-sound="none" disabled={maxQuantity(selectedEntry, selected.side) <= 0} onClick={trade}>{selected.side === "merchant" ? t("trade.buyNow") : t("trade.sellNow")}</button>
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
    T{item.tier ?? 1} {item.rarity ?? "common"} · {equipmentSlotLabel(item)} · ATK +{item.statBonus?.atk ?? 0} · DEF +{item.statBonus?.def ?? 0}
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

const EQUIPMENT_SLOTS = ["rightHand", "leftHand", "accessory"] as const;
type EquipmentSlot = typeof EQUIPMENT_SLOTS[number];

function InventoryOnly({
  onClose,
  onChange,
  returnToCity,
}: {
  onClose: () => void;
  onChange?: () => void;
  returnToCity: boolean;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<ItemFilter>("all");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(
    gameSession.inventory[0]?.itemId ?? null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [, redraw] = useState(0);
  const heroDefinition = getCardDefinition(gameSession.hero.cardId);
  const equipmentItems = gameSession.equippedItemIds
    .map((itemId) => itemsById.get(itemId))
    .filter((item): item is ItemDefinition => Boolean(item));
  const equipmentAtk = equipmentItems.reduce((sum, item) => sum + (item.statBonus?.atk ?? 0), 0);
  const equipmentDef = equipmentItems.reduce((sum, item) => sum + (item.statBonus?.def ?? 0), 0);
  const totalAttack = heroDefinition.atk + gameSession.battleCombatBonuses.heroAtk;
  const totalDefense = heroDefinition.def + gameSession.battleCombatBonuses.heroDef;
  const entries = filterEntries(gameSession.inventory.map((stack) => ({
    item: itemsById.get(stack.itemId)!,
    quantity: stack.quantity,
    price: 0,
    stack,
  })), filter);
  const selectedStack = gameSession.inventory.find((stack) => stack.itemId === selectedItemId);
  const selectedItem = selectedStack ? itemsById.get(selectedStack.itemId) : undefined;

  function performItemAction(item: ItemDefinition): void {
    const result = item.type === "equipment"
      ? gameSession.equipItem(item.id)
      : item.type === "consumable"
        ? gameSession.useItem(item.id)
        : "invalid";
    setMessage(t(result === "success"
      ? item.type === "equipment" ? "trade.equippedResult" : "trade.used"
      : `trade.${result}`));
    if (result === "success") {
      playUiSound(item.type === "equipment" ? "confirm" : "buy-sell");
      onChange?.();
      if (!gameSession.inventory.some((stack) => stack.itemId === item.id)) {
        setSelectedItemId(gameSession.inventory[0]?.itemId ?? null);
      }
    }
    redraw((value) => value + 1);
  }

  function unequip(slot: EquipmentSlot): void {
    const result = gameSession.unequipItem(slot);
    setMessage(t(result === "success" ? "trade.unequipped" : `trade.${result}`));
    if (result === "success") {
      playUiSound("confirm");
      onChange?.();
    }
    redraw((value) => value + 1);
  }

  return (
    <div className="market-overlay inventory-overlay">
      <main className="inventory-screen">
        <header className="inventory-header">
          <div>
            <p className="eyebrow">{t("trade.roadInventory")}</p>
            <h1>{t("trade.inventoryTitle")}</h1>
            <p>Manage the Wanderer&apos;s loadout, supplies and campaign cargo.</p>
          </div>
          <div className="inventory-resources">
            <span><small>{t("hud.gold")}</small><strong>{gameSession.gold}g</strong></span>
            <span><small>{t("trade.weight")}</small><strong>{gameSession.cargoWeight.toFixed(1)} / {gameSession.maxCargoWeight}</strong></span>
            <span><small>{t("hud.food")}</small><strong>{gameSession.rationCount} / {gameSession.foodCapacity}</strong></span>
          </div>
          <button className="market-close" onClick={onClose}>
            {t(returnToCity ? "trade.returnToCity" : "trade.close")} <b>→</b>
          </button>
        </header>

        <section className="inventory-layout">
          <aside className="equipment-panel">
            <header>
              <span>{t("trade.equipped")}</span>
              <h2>{gameSession.runProfile?.name ?? t(heroDefinition.nameKey)}</h2>
            </header>
            <div className="equipment-hero">
              <span className="equipment-hero-art">
                {heroDefinition.portraitImage ? (
                  <img
                    src={heroDefinition.portraitImage}
                    alt=""
                    style={{ objectPosition: `${heroDefinition.imageFocus?.x ?? 50}% ${heroDefinition.imageFocus?.y ?? 50}%` }}
                  />
                ) : t(heroDefinition.nameKey).slice(0, 1)}
              </span>
              <div className="equipment-combat-summary">
                <EquipmentTotal label="ATK" base={heroDefinition.atk} equipment={equipmentAtk} total={totalAttack} tone="attack" />
                <EquipmentTotal label="DEF" base={heroDefinition.def} equipment={equipmentDef} total={totalDefense} tone="defense" />
              </div>
            </div>
            <div className="equipment-slots">
              {EQUIPMENT_SLOTS.map((slot) => (
                <EquipmentSlotCard key={slot} slot={slot} onUnequip={() => unequip(slot)} />
              ))}
            </div>
          </aside>

          <section className="inventory-cargo">
            <header>
              <div><span>Warband cargo</span><h2>{t("trade.playerInventory")}</h2></div>
              <small>{gameSession.inventory.length} {t("trade.stacks")}</small>
            </header>
            <nav className="inventory-filters" aria-label="Inventory filters">
              {FILTERS.map((value) => (
                <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
                  {t(`trade.filter.${value}`)}
                </button>
              ))}
            </nav>
            <div className="inventory-grid">
              {entries.map(({ item, quantity }) => (
                <button
                  key={item.id}
                  className={`inventory-item-card ${selectedItemId === item.id ? "selected" : ""}`}
                  onClick={() => setSelectedItemId(item.id)}
                >
                  <ItemIcon item={item} />
                  <span className="inventory-item-copy">
                    <small>{t(`trade.filter.${item.type}`)}</small>
                    <strong>{t(item.nameKey)}</strong>
                    {item.type === "equipment" ? <EquipmentStats item={item} /> : null}
                  </span>
                  <b>×{quantity}</b>
                </button>
              ))}
              {!entries.length ? <p className="inventory-empty">{t(filter === "all" ? "trade.emptyInventory" : "trade.emptyFiltered")}</p> : null}
            </div>
          </section>

          <aside className="inventory-detail">
            {selectedItem ? (
              <>
                <div className="inventory-detail-art"><ItemIcon item={selectedItem} large /></div>
                <span className="eyebrow">{t(`trade.filter.${selectedItem.type}`)}</span>
                <h2>{t(selectedItem.nameKey)}</h2>
                <p>{t(selectedItem.descriptionKey)}</p>
                <dl>
                  <div><dt>Quantity</dt><dd>{selectedStack?.quantity ?? 0}</dd></div>
                  <div><dt>{t("trade.weight")}</dt><dd>{selectedItem.weight}</dd></div>
                  <div><dt>Value</dt><dd>{selectedItem.baseValue}g</dd></div>
                </dl>
                {selectedItem.type === "equipment" ? <EquipmentDetail item={selectedItem} /> : null}
                {selectedItem.foodUnits ? <div className="inventory-effect-line"><small>Supply value</small><strong>+{selectedItem.foodUnits} food</strong></div> : null}
                {selectedItem.effect === "heal_300" ? <div className="inventory-effect-line"><small>Use effect</small><strong>Heal the most wounded unit by 300 HP</strong></div> : null}
                {(selectedItem.type === "equipment" || selectedItem.type === "consumable") ? (
                  <button className="inventory-primary-action" onClick={() => performItemAction(selectedItem)}>
                    {t(selectedItem.type === "equipment" ? "trade.equipSlot" : "trade.use", {
                      slot: equipmentSlotLabel(selectedItem),
                    })}
                  </button>
                ) : null}
              </>
            ) : (
              <div className="inventory-detail-empty">
                <strong>Select an item</strong>
                <span>Review its properties and available actions.</span>
              </div>
            )}
          </aside>
        </section>
        <section className="ability-loadout-panel">
          <header><div><span className="eyebrow">{t("ability.loadoutEyebrow")}</span><h2>{t("ability.loadoutTitle")}</h2></div><small>{gameSession.equippedAbilityIds.length}/4</small></header>
          <div className="ability-loadout-slots">
            <article className="ability-card fixed"><b>⚔</b><span><strong>{t("battle.strategicAttack")}</strong><small>{t("battle.strategicAttackDescription")}</small></span><em>1 Action</em></article>
            {gameSession.equippedAbilityIds.map((abilityId) => {
              const ability = abilitiesById.get(abilityId);
              return ability ? <article className="ability-card equipped" key={ability.id}><b>{ability.icon}</b><span><strong>{t(ability.nameKey)}</strong><small>{t(ability.descriptionKey)}</small></span><em>T{ability.tier} · {ability.actionCost} Actions</em><button onClick={() => { gameSession.unequipAbility(ability.id); redraw((value) => value + 1); }}>Unequip</button></article> : null;
            })}
          </div>
          <div className="ability-library">
            {gameSession.learnedAbilityIds.filter((abilityId) => !gameSession.equippedAbilityIds.includes(abilityId)).map((abilityId) => {
              const ability = abilitiesById.get(abilityId);
              return ability ? <button key={ability.id} disabled={gameSession.equippedAbilityIds.length >= 4} onClick={() => { gameSession.equipAbility(ability.id); redraw((value) => value + 1); }}><b>{ability.icon}</b><span><strong>{t(ability.nameKey)}</strong><small>T{ability.tier} · {ability.actionCost} Actions</small></span><em>Equip →</em></button> : null;
            })}
          </div>
        </section>
        {message ? <div className="inventory-message">{message}</div> : null}
      </main>
    </div>
  );
}

function ItemIcon({ item, large = false }: { item: ItemDefinition; large?: boolean }) {
  const { t } = useTranslation();
  return (
    <span className={`inventory-item-icon ${item.type} ${large ? "large" : ""}`}>
      {item.itemImage ? (
        <img
          src={item.itemImage}
          alt=""
          style={{ objectPosition: `${item.imageFocus?.x ?? 50}% ${item.imageFocus?.y ?? 50}%` }}
        />
      ) : t(item.nameKey).slice(0, 1)}
    </span>
  );
}

function EquipmentTotal({ label, base, equipment, total, tone }: { label: string; base: number; equipment: number; total: number; tone: string }) {
  return <div className={`equipment-total ${tone}`}><span>{label}</span><strong>{total}</strong><small>Base {base} · Gear +{equipment}</small></div>;
}

function EquipmentSlotCard({ slot, onUnequip }: { slot: EquipmentSlot; onUnequip: () => void }) {
  const { t } = useTranslation();
  const itemId = slot === "rightHand"
    ? gameSession.rightHandItemId
    : slot === "leftHand"
      ? gameSession.leftHandItemId
      : gameSession.equippedItemId;
  const item = itemId ? itemsById.get(itemId) : undefined;
  return (
    <article className={`equipment-slot ${item ? "filled" : "empty"}`}>
      <span className="equipment-slot-label">{t(`trade.${slot}`)}</span>
      {item ? (
        <>
          <ItemIcon item={item} />
          <span><strong>{t(item.nameKey)}</strong><EquipmentStats item={item} /></span>
          <button onClick={onUnequip} title={t("trade.unequip")}>×</button>
        </>
      ) : (
        <span className="equipment-empty-slot">＋ <small>{t("trade.emptyEquipment")}</small></span>
      )}
    </article>
  );
}

function EquipmentDetail({ item }: { item: ItemDefinition }) {
  const { t } = useTranslation();
  const equippedId = item.equipmentSlot === "leftHand"
    ? gameSession.leftHandItemId
    : item.equipmentSlot === "accessory"
      ? gameSession.equippedItemId
      : gameSession.rightHandItemId;
  const equipped = equippedId ? itemsById.get(equippedId) : undefined;
  const attackDifference = (item.statBonus?.atk ?? 0) - (equipped?.statBonus?.atk ?? 0);
  const defenseDifference = (item.statBonus?.def ?? 0) - (equipped?.statBonus?.def ?? 0);
  return (
    <section className="inventory-equipment-detail">
      <header>
        <span>{equipmentSlotLabel(item)}</span>
        <b className={`equipment-rarity ${item.rarity ?? "common"}`}>Tier {item.tier ?? 1} · {item.rarity ?? "common"}</b>
        <small>Compared with {equipped ? t(equipped.nameKey) : "empty slot"}</small>
      </header>
      <div><strong>ATK +{item.statBonus?.atk ?? 0}</strong><em className={differenceClass(attackDifference)}>{formatDifference(attackDifference)}</em></div>
      <div><strong>DEF +{item.statBonus?.def ?? 0}</strong><em className={differenceClass(defenseDifference)}>{formatDifference(defenseDifference)}</em></div>
    </section>
  );
}

function filterEntries(entries: DisplayEntry[], filter: ItemFilter): DisplayEntry[] {
  const priority: Record<ItemDefinition["type"], number> = { consumable: 0, equipment: 1, tradeGood: 2, resource: 3 };
  return entries
    .filter((entry) => entry.item && (filter === "all" || entry.item.type === filter))
    .sort((a, b) => priority[a.item.type] - priority[b.item.type] || a.price - b.price);
}
