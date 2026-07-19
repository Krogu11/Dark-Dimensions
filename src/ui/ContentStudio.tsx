import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { contentPack } from "../content/content";
import { contentPackSchema, type CardDefinition, type ContentPack, type ItemDefinition } from "../domain/content/schemas";
import { xpNeededForUnitUpgrade } from "../domain/cards/CardInstance";

const RACES = ["hero", "human", "orc", "kobold", "undead", "machine", "elemental", "beast"];
const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"] as const;
const EFFECTS = ["", "heal_lowest_300", "burn_weakest_300", "shield_self_400", "rally_all_150", "human_guard_all_180", "orc_rage_self_250", "kobold_pack_100", "undead_drain_200", "beast_pack_120", "human_first_aid_180", "human_brace_160", "human_volley_120", "orc_bloodrage_180", "orc_overrun_160", "kobold_trap_140", "undead_reanimate_30", "machine_repair_180", "machine_armor_all_140", "elemental_frost_140", "elemental_chain_160", "beast_first_strike_140", "beast_hunt_160"] as const;
const TERRAINS = ["plains", "forest", "darkForest", "pineForest", "tundra", "snowMountain", "swamp", "bog", "desert", "badlands", "steppe", "grassland", "heath", "mountain", "hills", "lake", "river", "road"] as const;
const ITEM_TYPES: ItemDefinition["type"][] = ["resource", "tradeGood", "consumable", "equipment"];
const WEAPON_TYPES = ["club", "sword", "axe", "mace", "spear", "bow", "shield"] as const;
const EQUIPMENT_SLOTS = ["rightHand", "leftHand", "accessory"] as const;

type StudioTab = "cards" | "items" | "terrains" | "economy";
type AssetKind = "portrait" | "card" | "item" | "terrain";
type AssetDraft = { kind: AssetKind; source: string; fileName: string };

export default function ContentStudio() {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ContentPack>(() => structuredClone(contentPack));
  const [tab, setTab] = useState<StudioTab>("cards");
  const [selectedCardId, setSelectedCardId] = useState(draft.cards[0]?.id ?? "");
  const [selectedItemId, setSelectedItemId] = useState(draft.items[0]?.id ?? "");
  const [selectedTerrain, setSelectedTerrain] = useState<string>("tundra");
  const [search, setSearch] = useState("");
  const [raceFilter, setRaceFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [itemTypeFilter, setItemTypeFilter] = useState("all");
  const [sort, setSort] = useState("name");
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries([
    ...contentPack.cards.flatMap((card) => [[card.nameKey, t(card.nameKey)], ...(card.descriptionKey ? [[card.descriptionKey, t(card.descriptionKey)]] : [])]),
    ...contentPack.items.flatMap((item) => [[item.nameKey, t(item.nameKey)], [item.descriptionKey, t(item.descriptionKey)]]),
  ]));
  const [assetDraft, setAssetDraft] = useState<AssetDraft | null>(null);
  const [terrainAssetFocus, setTerrainAssetFocus] = useState({ x: 50, y: 50 });
  const [message, setMessage] = useState("Development-only editor · no unsaved changes");
  const [saving, setSaving] = useState(false);

  const card = draft.cards.find((entry) => entry.id === selectedCardId) ?? draft.cards[0];
  const item = draft.items.find((entry) => entry.id === selectedItemId) ?? draft.items[0];
  const terrainDefinition = draft.terrainBattlefields[selectedTerrain];
  const focus = tab === "items" ? item?.imageFocus ?? { x: 50, y: 50 } : card?.imageFocus ?? { x: 50, y: 50 };
  const terrainFocus = assetDraft?.kind === "terrain" ? terrainAssetFocus : terrainDefinition?.focus ?? { x: 50, y: 50 };
  const terrainPreview = assetDraft?.kind === "terrain" ? assetDraft.source : terrainDefinition?.image;

  const cards = useMemo(() => {
    const query = search.trim().toLowerCase();
    return draft.cards.filter((entry) =>
      (!query || `${entry.id} ${names[entry.nameKey] ?? ""} ${entry.race}`.toLowerCase().includes(query)) &&
      (raceFilter === "all" || entry.race === raceFilter) &&
      (tierFilter === "all" || entry.tier === Number(tierFilter)),
    ).sort((a, b) => sort === "tier" ? a.tier - b.tier || a.race.localeCompare(b.race) : sort === "race" ? a.race.localeCompare(b.race) || a.tier - b.tier : (names[a.nameKey] ?? a.id).localeCompare(names[b.nameKey] ?? b.id));
  }, [draft.cards, names, raceFilter, search, sort, tierFilter]);

  const items = useMemo(() => {
    const query = search.trim().toLowerCase();
    return draft.items.filter((entry) =>
      (!query || `${entry.id} ${names[entry.nameKey] ?? ""} ${entry.type}`.toLowerCase().includes(query)) &&
      (itemTypeFilter === "all" || entry.type === itemTypeFilter),
    ).sort((a, b) => sort === "value" ? a.baseValue - b.baseValue : sort === "type" ? a.type.localeCompare(b.type) : (names[a.nameKey] ?? a.id).localeCompare(names[b.nameKey] ?? b.id));
  }, [draft.items, itemTypeFilter, names, search, sort]);

  useEffect(() => setAssetDraft(null), [selectedCardId, selectedItemId, selectedTerrain, tab]);
  useEffect(() => { setSearch(""); setSort("name"); }, [tab]);

  function dirty(label = "Unsaved changes"): void { setMessage(label); }
  function updateCard(patch: Partial<CardDefinition>): void {
    if (!card) return;
    setDraft((current) => ({ ...current, cards: current.cards.map((entry) => entry.id === card.id ? { ...entry, ...patch } : entry) }));
    dirty();
  }
  function updateItem(patch: Partial<ItemDefinition>): void {
    if (!item) return;
    setDraft((current) => ({ ...current, items: current.items.map((entry) => entry.id === item.id ? { ...entry, ...patch } : entry) }));
    dirty();
  }
  function updateRewardRule(key: keyof ContentPack["combatRules"]["rewards"], value: string): void {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    setDraft((current) => ({ ...current, combatRules: { ...current.combatRules, rewards: { ...current.combatRules.rewards, [key]: parsed } } }));
    dirty("Reward economy changed · unsaved");
  }
  function updateCardNumber(key: "tier" | "initiative" | "atk" | "def" | "maxHp" | "recruitCost", value: string): void {
    if (key === "recruitCost" && value === "") updateCard({ recruitCost: undefined });
    else if (Number.isFinite(Number(value))) updateCard({ [key]: Number(value) });
  }
  function updateItemNumber(key: "baseValue" | "weight" | "foodUnits", value: string): void {
    if (key === "foodUnits" && value === "") updateItem({ foodUnits: undefined });
    else if (Number.isFinite(Number(value))) updateItem({ [key]: Number(value) });
  }

  function createCard(copy: boolean): void {
    const source = card;
    const id = uniqueId(copy && source ? `${source.id}_copy` : "new_card", draft.cards.map((entry) => entry.id));
    const nameKey = `card.${toCamelCase(id)}.name`;
    const descriptionKey = `card.${toCamelCase(id)}.description`;
    const created: CardDefinition = copy && source ? { ...structuredClone(source), id, nameKey, descriptionKey, portraitImage: undefined, cardImage: undefined } : { id, nameKey, descriptionKey, race: "human", rarity: "common", tier: 1, initiative: 5, atk: 500, def: 500, maxHp: 1000 };
    setDraft((current) => ({ ...current, cards: [...current.cards, created] }));
    setNames((current) => ({ ...current, [nameKey]: copy && source ? `${current[source.nameKey]} Copy` : "New Card", [descriptionKey]: copy && source && source.descriptionKey ? current[source.descriptionKey] ?? "" : "" }));
    setSelectedCardId(id); dirty("New card created · unsaved");
  }
  function createItem(copy: boolean): void {
    const source = item;
    const id = uniqueId(copy && source ? `${source.id}_copy` : "new_item", draft.items.map((entry) => entry.id));
    const nameKey = `item.${toCamelCase(id)}.name`;
    const descriptionKey = `item.${toCamelCase(id)}.description`;
    const created: ItemDefinition = copy && source ? { ...structuredClone(source), id, nameKey, descriptionKey, itemImage: undefined } : { id, nameKey, descriptionKey, type: "tradeGood", baseValue: 10, weight: 1 };
    setDraft((current) => ({ ...current, items: [...current.items, created] }));
    setNames((current) => ({ ...current, [nameKey]: copy && source ? `${current[source.nameKey]} Copy` : "New Item", [descriptionKey]: copy && source ? current[source.descriptionKey] ?? "" : "" }));
    setSelectedItemId(id); dirty("New item created · unsaved");
  }

  function rename(kind: "card" | "item", raw: string): void {
    const id = sanitizeId(raw); if (!id) return;
    if (kind === "card" && card && !draft.cards.some((entry) => entry.id === id && entry.id !== card.id)) {
      const nameKey = `card.${toCamelCase(id)}.name`; const descriptionKey = `card.${toCamelCase(id)}.description`;
      const oldName = names[card.nameKey]; const oldDescription = card.descriptionKey ? names[card.descriptionKey] : "";
      updateCard({ id, nameKey, descriptionKey }); setNames((current) => ({ ...current, [nameKey]: oldName, [descriptionKey]: oldDescription ?? "" })); setSelectedCardId(id);
    }
    if (kind === "item" && item && !draft.items.some((entry) => entry.id === id && entry.id !== item.id)) {
      const nameKey = `item.${toCamelCase(id)}.name`; const descriptionKey = `item.${toCamelCase(id)}.description`;
      const oldName = names[item.nameKey]; const oldDescription = names[item.descriptionKey];
      updateItem({ id, nameKey, descriptionKey }); setNames((current) => ({ ...current, [nameKey]: oldName, [descriptionKey]: oldDescription })); setSelectedItemId(id);
    }
    dirty("ID changed · references are checked when saving");
  }

  function remove(kind: "card" | "item"): void {
    const selected = kind === "card" ? card : item; if (!selected || !window.confirm(`Delete ${names[selected.nameKey] ?? selected.id}?`)) return;
    if (kind === "card") { const remaining = draft.cards.filter((entry) => entry.id !== selected.id); setDraft((current) => ({ ...current, cards: remaining })); setSelectedCardId(remaining[0]?.id ?? ""); }
    else { const remaining = draft.items.filter((entry) => entry.id !== selected.id); setDraft((current) => ({ ...current, items: remaining })); setSelectedItemId(remaining[0]?.id ?? ""); }
    dirty(`${kind} deleted · references will be validated`);
  }

  async function chooseAsset(kind: AssetKind, event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    if (!file.type.startsWith("image/")) { setMessage("Choose a PNG, JPEG or WebP image."); return; }
    setAssetDraft({ kind, source: await fileToDataUrl(file), fileName: file.name });
    if (kind === "terrain") setTerrainAssetFocus(terrainDefinition?.focus ?? { x: 50, y: 50 });
    dirty(`${kind} image loaded · adjust focus and apply`);
  }

  async function applyAsset(): Promise<void> {
    if (!assetDraft) return; setSaving(true);
    try {
      const isTerrain = assetDraft.kind === "terrain"; const isItem = assetDraft.kind === "item";
      const assetFocus = isTerrain ? terrainAssetFocus : focus;
      const [width, height] = isTerrain ? [1920, 1080] : isItem ? [512, 512] : [768, 1024];
      const dataUrl = await cropToWebp(assetDraft.source, width, height, assetFocus.x, assetFocus.y);
      const endpoint = isTerrain ? "/__content-studio/terrain-asset" : isItem ? "/__content-studio/item-asset" : "/__content-studio/asset";
      const payload = isTerrain ? { terrainId: selectedTerrain, dataUrl } : isItem ? { itemId: item!.id, dataUrl } : { cardId: card!.id, kind: assetDraft.kind, dataUrl };
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { path?: string; error?: string }; if (!response.ok || !result.path) throw new Error(result.error ?? "Asset upload failed");
      if (isTerrain) setDraft((current) => ({ ...current, terrainBattlefields: { ...current.terrainBattlefields, [selectedTerrain]: { image: result.path!, focus: assetFocus } } }));
      else if (isItem) updateItem({ itemImage: result.path, imageFocus: assetFocus });
      else updateCard(assetDraft.kind === "portrait" ? { portraitImage: result.path, imageFocus: assetFocus } : { cardImage: result.path, imageFocus: assetFocus });
      setAssetDraft(null); setMessage("WebP asset written · save the content pack to persist its path");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Asset upload failed"); } finally { setSaving(false); }
  }

  async function saveContent(): Promise<void> {
    const parsed = contentPackSchema.safeParse(draft);
    if (!parsed.success) { setMessage(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).slice(0, 4).join(" · ")); return; }
    const duplicates = [...findDuplicates(draft.cards.map((entry) => entry.id)), ...findDuplicates(draft.items.map((entry) => entry.id))];
    if (duplicates.length) { setMessage(`Duplicate IDs: ${duplicates.join(", ")}`); return; }
    const broken = findBrokenReferences(draft); if (broken.length) { setMessage(`Missing references: ${broken.slice(0, 5).join(", ")}`); return; }
    const upgradeProblems = findUpgradeProblems(draft); if (upgradeProblems.length) { setMessage(`Invalid upgrade paths: ${upgradeProblems.slice(0, 4).join(" · ")}`); return; }
    setSaving(true);
    try { const response = await fetch("/__content-studio/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pack: parsed.data, names }) }); const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error ?? "Save failed"); setMessage("Saved and validated · Vite will reload the updated content"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Save failed"); } finally { setSaving(false); }
  }

  function updateTerrainFocus(axis: "x" | "y", value: number): void {
    if (assetDraft?.kind === "terrain") { setTerrainAssetFocus((current) => ({ ...current, [axis]: value })); return; }
    if (!terrainDefinition) return;
    setDraft((current) => ({ ...current, terrainBattlefields: { ...current.terrainBattlefields, [selectedTerrain]: { ...current.terrainBattlefields[selectedTerrain], focus: { ...current.terrainBattlefields[selectedTerrain].focus, [axis]: value } } } })); dirty();
  }

  return <main className="content-studio">
    <header className="studio-header"><div><span>Dark Dimensions</span><h1>Content Studio</h1></div><nav className="studio-tabs">{(["cards", "items", "terrains", "economy"] as StudioTab[]).map((value) => <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{value}</button>)}</nav><p>{message}</p><div className="studio-header-actions"><a className="button ghost" href="./">Return to game</a><button className="button primary" disabled={saving} onClick={() => void saveContent()}>{saving ? "Saving…" : "Validate & save"}</button></div></header>

    <aside className="studio-library">
      {tab === "cards" || tab === "items" ? <input aria-label={`Search ${tab}`} placeholder={`Search ${tab}…`} value={search} onChange={(event) => setSearch(event.target.value)} /> : <strong className="studio-library-title">{tab === "economy" ? "Reward economy" : "Battlefield terrains"}</strong>}
      {tab === "cards" ? <><div className="studio-filter-grid"><select aria-label="Filter race" value={raceFilter} onChange={(event) => setRaceFilter(event.target.value)}><option value="all">All races</option>{RACES.map((race) => <option key={race}>{race}</option>)}</select><select aria-label="Filter tier" value={tierFilter} onChange={(event) => setTierFilter(event.target.value)}><option value="all">All tiers</option>{[1,2,3,4,5,6].map((tier) => <option key={tier} value={tier}>Tier {tier}</option>)}</select><select aria-label="Sort cards" value={sort} onChange={(event) => setSort(event.target.value)}><option value="name">Name</option><option value="race">Race</option><option value="tier">Tier</option></select></div><CreateActions onNew={() => createCard(false)} onDuplicate={() => createCard(true)} /><Library entries={cards.map((entry) => ({ id: entry.id, title: names[entry.nameKey] ?? entry.id, meta: `${entry.race} · T${entry.tier} · ${entry.rarity}` }))} selectedId={card?.id} onSelect={setSelectedCardId} /></> : null}
      {tab === "items" ? <><div className="studio-filter-grid"><select aria-label="Filter item type" value={itemTypeFilter} onChange={(event) => setItemTypeFilter(event.target.value)}><option value="all">All item types</option>{ITEM_TYPES.map((type) => <option key={type}>{type}</option>)}</select><select aria-label="Sort items" value={sort} onChange={(event) => setSort(event.target.value)}><option value="name">Name</option><option value="type">Type</option><option value="value">Value</option></select></div><CreateActions onNew={() => createItem(false)} onDuplicate={() => createItem(true)} /><Library entries={items.map((entry) => ({ id: entry.id, title: names[entry.nameKey] ?? entry.id, meta: `${entry.type} · ${entry.baseValue}g · ${entry.weight} weight` }))} selectedId={item?.id} onSelect={setSelectedItemId} /></> : null}
      {tab === "terrains" ? <Library entries={TERRAINS.map((terrain) => ({ id: terrain, title: terrain, meta: draft.terrainBattlefields[terrain]?.image ? "Image assigned" : "Gradient fallback" }))} selectedId={selectedTerrain} onSelect={setSelectedTerrain} /> : null}
      {tab === "economy" ? <p className="studio-empty">These values control rewards for every battle. Enemy-specific gold and loot tables remain valid as minimums and source pools.</p> : null}
    </aside>

    <section className="studio-form">
      {tab === "cards" && card ? <><CardForm card={card} names={names} setNames={setNames} update={updateCard} updateNumber={updateCardNumber} rename={(value: string) => rename("card", value)} remove={() => remove("card")} chooseAsset={chooseAsset} applyAsset={applyAsset} assetDraft={assetDraft} focus={focus} saving={saving} dirty={dirty} /><UpgradePathEditor card={card} draft={draft} setDraft={setDraft} names={names} dirty={dirty} /></> : null}
      {tab === "items" && item ? <ItemForm item={item} names={names} setNames={setNames} update={updateItem} updateNumber={updateItemNumber} rename={(value: string) => rename("item", value)} remove={() => remove("item")} chooseAsset={chooseAsset} applyAsset={applyAsset} assetDraft={assetDraft} focus={focus} saving={saving} dirty={dirty} /> : null}
      {tab === "terrains" ? <TerrainForm terrain={selectedTerrain} definition={terrainDefinition} preview={terrainPreview} focus={terrainFocus} assetDraft={assetDraft} saving={saving} chooseAsset={chooseAsset} applyAsset={applyAsset} updateFocus={updateTerrainFocus} /> : null}
      {tab === "economy" ? <RewardEconomyForm rules={draft.combatRules.rewards} update={updateRewardRule} /> : null}
    </section>

    <aside className="studio-preview">{tab === "cards" && card ? <CardPreview card={card} name={names[card.nameKey] ?? card.id} image={assetDraft && assetDraft.kind !== "terrain" && assetDraft.kind !== "item" ? assetDraft.source : card.portraitImage} focus={focus} /> : null}{tab === "items" && item ? <ItemPreview item={item} name={names[item.nameKey] ?? item.id} image={assetDraft?.kind === "item" ? assetDraft.source : item.itemImage} focus={focus} /> : null}{tab === "terrains" ? <><span>Terrain status</span><h2>{selectedTerrain}</h2><p>{terrainDefinition?.image ? "Custom battlefield active" : "Using gradient fallback"}</p><div className="studio-paths"><small>Arena background</small><code>{terrainDefinition?.image ?? "Gradient fallback"}</code></div></> : null}{tab === "economy" ? <><span>Example victory</span><h2>{draft.combatRules.rewards.baseGold + draft.combatRules.rewards.goldPerThreat * 2 + draft.combatRules.rewards.goldPerDefeatedUnit * 5} gold</h2><p>Threat 2 · five defeated units</p><div className="studio-paths"><small>Guaranteed loot rolls</small><code>{draft.combatRules.rewards.minimumItemRolls}</code><small>Maximum prisoners</small><code>{draft.combatRules.rewards.maximumCaptures}</code></div></> : null}</aside>
  </main>;
}

function RewardEconomyForm({ rules, update }: { rules: ContentPack["combatRules"]["rewards"]; update: (key: keyof ContentPack["combatRules"]["rewards"], value: string) => void }) {
  const fields: Array<[keyof typeof rules, string, number]> = [
    ["baseGold", "Base gold", 1], ["goldPerThreat", "Gold per threat", 1], ["goldPerDefeatedUnit", "Gold per defeated unit", 1],
    ["itemChanceMultiplier", "Item chance multiplier", 0.05], ["itemChanceBonus", "Flat item chance bonus", 0.01], ["minimumItemRolls", "Minimum item rolls", 1],
    ["captureBaseChance", "Base capture chance", 0.01], ["captureChancePerDefeatedUnit", "Capture bonus per defeated unit", 0.01], ["captureChanceCap", "Capture chance cap", 0.01],
    ["captureTierPenalty", "Capture penalty per tier", 0.01], ["guaranteedCaptureAfterDefeatedUnits", "Guarantee after defeated units", 1], ["maximumCaptures", "Maximum prisoners", 1],
  ];
  return <><SectionTitle eyebrow="Global balancing" title="Battle rewards" /><div className="studio-form-grid">{fields.map(([key, label, step]) => <StudioField label={label} key={key}><input type="number" min="0" step={step} value={rules[key]} onChange={(event) => update(key, event.target.value)} /></StudioField>)}</div></>;
}

function CardForm({ card, names, setNames, update, updateNumber, rename, remove, chooseAsset, applyAsset, assetDraft, focus, saving, dirty }: any) {
  return <><SectionTitle eyebrow="Card definition" title={names[card.nameKey] ?? card.id} onDelete={remove} /><div className="studio-form-grid"><StudioField label="Card id"><input value={card.id} onChange={(e) => rename(e.target.value)} /></StudioField><StudioField label="Display name"><input value={names[card.nameKey] ?? ""} onChange={(e) => { setNames((current: Record<string,string>) => ({ ...current, [card.nameKey]: e.target.value })); dirty(); }} /></StudioField><StudioField label="Unit description" wide><textarea rows={3} value={card.descriptionKey ? names[card.descriptionKey] ?? "" : ""} onChange={(e) => { const key = card.descriptionKey ?? `card.${toCamelCase(card.id)}.description`; if (!card.descriptionKey) update({ descriptionKey: key }); setNames((current: Record<string,string>) => ({ ...current, [key]: e.target.value })); dirty(); }} /></StudioField><StudioField label="Race"><select value={card.race} onChange={(e) => update({ race: e.target.value })}>{RACES.map((race) => <option key={race}>{race}</option>)}</select></StudioField><StudioField label="Rarity"><select value={card.rarity} onChange={(e) => update({ rarity: e.target.value })}>{RARITIES.map((rarity) => <option key={rarity}>{rarity}</option>)}</select></StudioField>{(["tier","initiative","atk","def","maxHp","recruitCost"] as const).map((key) => <StudioField label={key} key={key}><input type="number" value={card[key] ?? ""} onChange={(e) => updateNumber(key, e.target.value)} /></StudioField>)}<StudioField label="Battle effect" wide><select value={card.battleEffect ?? ""} onChange={(e) => update({ battleEffect: e.target.value || undefined })}>{EFFECTS.map((effect) => <option key={effect} value={effect}>{effect || "No special effect"}</option>)}</select></StudioField></div><AssetSection title="Portrait & card image" description="PNG, JPEG or WebP · exported as 768 × 1024 WebP" kinds={["portrait","card"]} assetDraft={assetDraft} focus={focus} saving={saving} chooseAsset={chooseAsset} applyAsset={applyAsset} updateFocus={(axis: string, value: number) => update({ imageFocus: { ...focus, [axis]: value } })} /></>;
}

function UpgradePathEditor({ card, draft, setDraft, names, dirty }: any) {
  const path = draft.unitUpgrades.find((entry: any) => entry.fromCardId === card.id);
  const candidates = draft.cards.filter((entry: CardDefinition) => entry.id !== card.id && entry.race === card.race && entry.tier > card.tier);
  const updatePath = (patch: Record<string, unknown>) => { setDraft((current: ContentPack) => ({ ...current, unitUpgrades: current.unitUpgrades.map((entry) => entry.fromCardId === card.id ? { ...entry, ...patch } : entry) })); dirty("Upgrade path changed · unsaved"); };
  const createPath = () => { const target = candidates[0]; if (!target) return; setDraft((current: ContentPack) => ({ ...current, unitUpgrades: [...current.unitUpgrades, { fromCardId: card.id, options: [target.id] }] })); dirty("Upgrade path created · unsaved"); };
  const removePath = () => { setDraft((current: ContentPack) => ({ ...current, unitUpgrades: current.unitUpgrades.filter((entry) => entry.fromCardId !== card.id) })); dirty("Upgrade path removed · unsaved"); };
  return <section className="studio-assets studio-upgrade-editor"><SectionTitle eyebrow="Progression" title="Upgrade path" />{path ? <><div className="studio-form-grid"><StudioField label="Required experience"><div className="studio-derived-value">{xpNeededForUnitUpgrade(card.tier)} XP <small>Calculated from Tier {card.tier}</small></div></StudioField>{path.options.map((option: string, index: number) => <StudioField key={`${option}-${index}`} label={`Upgrade option ${index + 1}`}><span className="studio-upgrade-option"><select value={option} onChange={(event) => updatePath({ options: path.options.map((id: string, optionIndex: number) => optionIndex === index ? event.target.value : id) })}>{candidates.map((candidate: CardDefinition) => <option key={candidate.id} value={candidate.id}>{names[candidate.nameKey] ?? candidate.id} · T{candidate.tier}</option>)}</select><button type="button" onClick={() => updatePath({ options: path.options.filter((_: string, optionIndex: number) => optionIndex !== index) })}>Remove</button></span></StudioField>)}</div><div className="studio-create-actions">{path.options.length < 3 && candidates.some((candidate: CardDefinition) => !path.options.includes(candidate.id)) ? <button type="button" onClick={() => updatePath({ options: [...path.options, candidates.find((candidate: CardDefinition) => !path.options.includes(candidate.id))!.id] })}>+ Add option</button> : null}<button type="button" onClick={removePath}>Remove path</button></div></> : <div className="studio-create-actions"><button type="button" disabled={!candidates.length} onClick={createPath}>+ Add upgrade path</button><small>{candidates.length ? `Requires ${xpNeededForUnitUpgrade(card.tier)} XP. Targets are limited to higher tiers of the same race.` : "No higher-tier card of this race exists."}</small></div>}</section>;
}

function ItemForm({ item, names, setNames, update, updateNumber, rename, remove, chooseAsset, applyAsset, assetDraft, focus, saving, dirty }: any) {
  const changeType = (type: ItemDefinition["type"]) => update({ type, foodUnits: type === "consumable" ? item.foodUnits : undefined, effect: type === "consumable" ? item.effect : undefined, equipmentSlot: type === "equipment" ? item.equipmentSlot ?? "rightHand" : undefined, weaponType: type === "equipment" ? item.weaponType : undefined, statBonus: type === "equipment" ? item.statBonus ?? {} : undefined });
  return <><SectionTitle eyebrow="Item definition" title={names[item.nameKey] ?? item.id} onDelete={remove} /><div className="studio-form-grid"><StudioField label="Item id"><input value={item.id} onChange={(e) => rename(e.target.value)} /></StudioField><StudioField label="Display name"><input value={names[item.nameKey] ?? ""} onChange={(e) => { setNames((current: Record<string,string>) => ({ ...current, [item.nameKey]: e.target.value })); dirty(); }} /></StudioField><StudioField label="Description" wide><textarea rows={3} value={names[item.descriptionKey] ?? ""} onChange={(e) => { setNames((current: Record<string,string>) => ({ ...current, [item.descriptionKey]: e.target.value })); dirty(); }} /></StudioField><StudioField label="Item type"><select value={item.type} onChange={(e) => changeType(e.target.value as ItemDefinition["type"])}>{ITEM_TYPES.map((type) => <option key={type}>{type}</option>)}</select></StudioField><StudioField label="Base value"><input type="number" min="1" value={item.baseValue} onChange={(e) => updateNumber("baseValue", e.target.value)} /></StudioField><StudioField label="Weight"><input type="number" min="0" step="0.1" value={item.weight} onChange={(e) => updateNumber("weight", e.target.value)} /></StudioField>{item.type === "consumable" ? <><StudioField label="Consumable effect"><select value={item.effect ?? ""} onChange={(e) => update({ effect: e.target.value || undefined })}><option value="">No effect</option><option value="heal_300">Heal 300</option></select></StudioField><StudioField label="Food units"><input type="number" min="1" value={item.foodUnits ?? ""} onChange={(e) => updateNumber("foodUnits", e.target.value)} /></StudioField></> : null}{item.type === "equipment" ? <><StudioField label="Equipment slot"><select value={item.equipmentSlot ?? "rightHand"} onChange={(e) => update({ equipmentSlot: e.target.value })}>{EQUIPMENT_SLOTS.map((slot) => <option key={slot}>{slot}</option>)}</select></StudioField><StudioField label="Weapon type"><select value={item.weaponType ?? ""} onChange={(e) => update({ weaponType: e.target.value || undefined })}><option value="">None / accessory</option>{WEAPON_TYPES.map((type) => <option key={type}>{type}</option>)}</select></StudioField><StudioField label="ATK bonus"><input type="number" min="0" value={item.statBonus?.atk ?? 0} onChange={(e) => update({ statBonus: { ...item.statBonus, atk: Number(e.target.value) } })} /></StudioField><StudioField label="DEF bonus"><input type="number" min="0" value={item.statBonus?.def ?? 0} onChange={(e) => update({ statBonus: { ...item.statBonus, def: Number(e.target.value) } })} /></StudioField></> : null}</div><AssetSection title="Item image" description="Square image · exported as 512 × 512 WebP" kinds={["item"]} assetDraft={assetDraft} focus={focus} saving={saving} chooseAsset={chooseAsset} applyAsset={applyAsset} updateFocus={(axis: string, value: number) => update({ imageFocus: { ...focus, [axis]: value } })} /><div className="studio-paths"><small>Item image</small><code>{item.itemImage ?? "No image assigned"}</code></div></>;
}

function TerrainForm({ terrain, definition, preview, focus, assetDraft, saving, chooseAsset, applyAsset, updateFocus }: any) { return <><SectionTitle eyebrow="Battlefield artwork" title={terrain} /><section className="studio-assets studio-terrain-assets"><div className="studio-upload-row"><label className="studio-upload">Choose arena background<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void chooseAsset("terrain", event)} /></label><span>16:9 image · exported as 1920 × 1080 WebP</span></div><div className="studio-terrain-preview">{preview ? <img src={preview} alt={`${terrain} battlefield preview`} style={{ objectPosition: `${focus.x}% ${focus.y}%` }} /> : <span>No arena background assigned</span>}</div><div className="studio-focus-controls"><Range label="Horizontal focus" value={focus.x} onChange={(value) => updateFocus("x", value)} /><Range label="Vertical focus" value={focus.y} onChange={(value) => updateFocus("y", value)} /><button disabled={assetDraft?.kind !== "terrain" || saving} onClick={() => void applyAsset()}>{assetDraft?.kind === "terrain" ? `Apply ${assetDraft.fileName}` : "Choose a background first"}</button></div><div className="studio-paths"><small>Arena background</small><code>{definition?.image ?? "Gradient fallback"}</code></div></section></> }

function AssetSection({ title, description, kinds, assetDraft, focus, saving, chooseAsset, applyAsset, updateFocus }: any) { return <section className="studio-assets"><SectionTitle eyebrow="Artwork pipeline" title={title} /><div className="studio-upload-row">{kinds.map((kind: AssetKind) => <label className="studio-upload" key={kind}>Choose {kind} image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void chooseAsset(kind, event)} /></label>)}<span>{description}</span></div><div className="studio-focus-controls"><Range label="Horizontal focus" value={focus.x} onChange={(value) => updateFocus("x", value)} /><Range label="Vertical focus" value={focus.y} onChange={(value) => updateFocus("y", value)} /><button disabled={!assetDraft || !kinds.includes(assetDraft.kind) || saving} onClick={() => void applyAsset()}>{assetDraft && kinds.includes(assetDraft.kind) ? `Apply ${assetDraft.fileName}` : "Choose an image first"}</button></div></section> }
function CardPreview({ card, name, image, focus }: { card: CardDefinition; name: string; image?: string; focus: {x:number;y:number} }) { return <><span>Live battle preview</span><article className="studio-portrait-preview"><div>{image ? <img src={image} alt="" style={{ objectPosition: `${focus.x}% ${focus.y}%` }} /> : <b>{name.slice(0,1)}</b>}</div><strong className={`rarity-name ${card.rarity}`}>{name}</strong><i><span /></i><small>{card.maxHp}/{card.maxHp} HP</small></article><article className="battle-card studio-card-preview"><strong className={`rarity-name ${card.rarity}`}>{name}</strong><span className="card-race">{card.race}</span><span className="card-level">T{card.tier}</span><span className="card-stats"><b>ATK {card.atk}</b><b>DEF {card.def}</b><b>INI {card.initiative}</b></span></article></> }
function ItemPreview({ item, name, image, focus }: { item: ItemDefinition; name: string; image?: string; focus: {x:number;y:number} }) { return <><span>Live inventory preview</span><article className="studio-item-preview"><div>{image ? <img src={image} alt="" style={{ objectPosition: `${focus.x}% ${focus.y}%` }} /> : <b>{name.slice(0,1)}</b>}</div><small>{item.type}</small><strong>{name}</strong><p>{item.baseValue}g · {item.weight} weight</p>{item.type === "equipment" ? <em>ATK +{item.statBonus?.atk ?? 0} · DEF +{item.statBonus?.def ?? 0}</em> : null}</article></> }
function Library({ entries, selectedId, onSelect }: { entries: {id:string;title:string;meta:string}[]; selectedId?: string; onSelect:(id:string)=>void }) { return <nav>{entries.map((entry) => <button className={entry.id === selectedId ? "selected" : ""} key={entry.id} onClick={() => onSelect(entry.id)}><strong>{entry.title}</strong><small>{entry.meta} · {entry.id}</small></button>)}{!entries.length ? <p className="studio-empty">No matching content.</p> : null}</nav> }
function CreateActions({ onNew, onDuplicate }: {onNew:()=>void;onDuplicate:()=>void}) { return <div className="studio-create-actions"><button onClick={onNew}>+ New</button><button onClick={onDuplicate}>Duplicate</button></div> }
function SectionTitle({ eyebrow, title, onDelete }: {eyebrow:string;title:string;onDelete?:()=>void}) { return <div className="studio-section-title"><div><span>{eyebrow}</span><h2>{title}</h2></div>{onDelete ? <button className="studio-delete" onClick={onDelete}>Delete</button> : null}</div> }
function StudioField({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) { return <label className={wide ? "wide" : ""}><span>{label}</span>{children}</label> }
function Range({ label, value, onChange }: {label:string;value:number;onChange:(value:number)=>void}) { return <label>{label}<input type="range" min="0" max="100" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label> }
function uniqueId(base: string, ids: string[]): string { let candidate = base; let index = 2; while (ids.includes(candidate)) candidate = `${base}_${index++}`; return candidate; }
function sanitizeId(value: string): string { return value.toLowerCase().replace(/[^a-z0-9_-]/g, "_").replace(/_+/g, "_"); }
function toCamelCase(value: string): string { return value.replace(/_([a-z0-9])/g, (_, letter: string) => letter.toUpperCase()); }
function findDuplicates(values: string[]): string[] { return values.filter((value, index) => values.indexOf(value) !== index); }
function findBrokenReferences(pack: ContentPack): string[] {
  const cards = new Set(pack.cards.map((entry) => entry.id)); const items = new Set(pack.items.map((entry) => entry.id)); const broken: string[] = [];
  for (const enemy of pack.enemies) { for (const id of [...enemy.deck, ...(enemy.leaderCardId ? [enemy.leaderCardId] : []), ...enemy.dropTable.map((drop) => drop.cardId)]) if (!cards.has(id)) broken.push(`enemy:${enemy.id}:card=${id}`); for (const drop of enemy.itemDropTable) if (!items.has(drop.itemId)) broken.push(`enemy:${enemy.id}:item=${drop.itemId}`); }
  for (const upgrade of pack.unitUpgrades) for (const id of [upgrade.fromCardId, ...upgrade.options]) if (!cards.has(id)) broken.push(`upgrade:card=${id}`);
  for (const recipe of pack.tradeRecipes) for (const id of [recipe.inputItemId, recipe.outputItemId]) if (!items.has(id)) broken.push(`recipe:item=${id}`);
  return broken;
}
function findUpgradeProblems(pack: ContentPack): string[] {
  const cards = new Map(pack.cards.map((card) => [card.id, card])); const problems: string[] = [];
  for (const path of pack.unitUpgrades) { const source = cards.get(path.fromCardId); if (!source) continue; for (const id of path.options) { const target = cards.get(id); if (!target) continue; if (source.race !== target.race) problems.push(`${source.id} → ${target.id} changes race`); if (target.tier <= source.tier) problems.push(`${source.id} → ${target.id} does not increase tier`); } }
  return problems;
}
function fileToDataUrl(file: File): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error ?? new Error("Could not read image")); reader.readAsDataURL(file); }); }
function cropToWebp(source: string, width: number, height: number, focusX: number, focusY: number): Promise<string> { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => { const sourceRatio = image.naturalWidth / image.naturalHeight; const targetRatio = width / height; const cropWidth = sourceRatio > targetRatio ? image.naturalHeight * targetRatio : image.naturalWidth; const cropHeight = sourceRatio > targetRatio ? image.naturalHeight : image.naturalWidth / targetRatio; const sourceX = Math.max(0, Math.min(image.naturalWidth - cropWidth, (image.naturalWidth - cropWidth) * focusX / 100)); const sourceY = Math.max(0, Math.min(image.naturalHeight - cropHeight, (image.naturalHeight - cropHeight) * focusY / 100)); const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; const context = canvas.getContext("2d"); if (!context) { reject(new Error("Canvas is unavailable")); return; } context.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, 0, 0, width, height); resolve(canvas.toDataURL("image/webp", 0.9)); }; image.onerror = () => reject(new Error("Could not decode image")); image.src = source; }); }
