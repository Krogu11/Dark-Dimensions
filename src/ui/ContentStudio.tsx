import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { contentPack } from "../content/content";
import { cardEffectSchema, contentPackSchema, type AbilityDefinition, type CardDefinition, type CardEffect, type ContentPack, type HeroDefinition, type ItemDefinition, type NobleProfile } from "../domain/content/schemas";
import { xpNeededForUnitUpgrade } from "../domain/cards/CardInstance";
import { describeCardEffect, describeCardEffects, getCardEffects } from "../domain/battle/CardEffects";

const RACES = ["hero", "human", "orc", "kobold", "undead", "machine", "elemental", "beast"];
const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"] as const;
const TERRAINS = ["plains", "forest", "darkForest", "pineForest", "tundra", "snowMountain", "swamp", "bog", "desert", "badlands", "steppe", "grassland", "heath", "mountain", "hills", "lake", "river", "road"] as const;
const ITEM_TYPES: ItemDefinition["type"][] = ["resource", "tradeGood", "consumable", "equipment"];
const WEAPON_TYPES = ["club", "sword", "axe", "mace", "spear", "bow", "shield", "dagger", "greatsword", "crossbow", "staff", "halberd"] as const;
const EQUIPMENT_SLOTS = ["rightHand", "leftHand", "accessory"] as const;
const EQUIPMENT_RARITIES = ["common", "uncommon", "rare", "epic", "legendary"] as const;

type StudioTab = "cards" | "heroes" | "nobles" | "items" | "abilities" | "terrains" | "economy";
type AssetKind = "portrait" | "card" | "item" | "terrain";
type AssetDraft = { kind: AssetKind; source: string; fileName: string };

export default function ContentStudio() {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ContentPack>(() => structuredClone(contentPack));
  const [tab, setTab] = useState<StudioTab>("cards");
  const [selectedCardId, setSelectedCardId] = useState(draft.cards[0]?.id ?? "");
  const [selectedItemId, setSelectedItemId] = useState(draft.items[0]?.id ?? "");
  const [selectedAbilityId, setSelectedAbilityId] = useState(draft.abilities[0]?.id ?? "");
  const [selectedNobleId, setSelectedNobleId] = useState(draft.nobles[0]?.id ?? "");
  const [selectedHeroId, setSelectedHeroId] = useState(draft.heroes[0]?.id ?? "");
  const [selectedTerrain, setSelectedTerrain] = useState<string>("tundra");
  const [search, setSearch] = useState("");
  const [raceFilter, setRaceFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [itemTypeFilter, setItemTypeFilter] = useState("all");
  const [sort, setSort] = useState("name");
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries([
    ...contentPack.cards.flatMap((card) => [[card.nameKey, t(card.nameKey)], ...(card.descriptionKey ? [[card.descriptionKey, t(card.descriptionKey)]] : [])]),
    ...contentPack.items.flatMap((item) => [[item.nameKey, t(item.nameKey)], [item.descriptionKey, t(item.descriptionKey)]]),
    ...contentPack.abilities.flatMap((ability) => [[ability.nameKey, t(ability.nameKey)], [ability.descriptionKey, t(ability.descriptionKey)]]),
    ...contentPack.heroes.flatMap((hero) => [[hero.nameKey, t(hero.nameKey)], [hero.descriptionKey, t(hero.descriptionKey)]]),
  ]));
  const [assetDraft, setAssetDraft] = useState<AssetDraft | null>(null);
  const [terrainAssetFocus, setTerrainAssetFocus] = useState({ x: 50, y: 50 });
  const [message, setMessage] = useState("Development-only editor · no unsaved changes");
  const [saving, setSaving] = useState(false);

  const card = draft.cards.find((entry) => entry.id === selectedCardId) ?? draft.cards[0];
  const item = draft.items.find((entry) => entry.id === selectedItemId) ?? draft.items[0];
  const ability = draft.abilities.find((entry) => entry.id === selectedAbilityId) ?? draft.abilities[0];
  const noble = draft.nobles.find((entry) => entry.id === selectedNobleId) ?? draft.nobles[0];
  const hero = draft.heroes.find((entry) => entry.id === selectedHeroId) ?? draft.heroes[0];
  const nobleLeader = noble ? draft.cards.find((entry) => entry.id === noble.leaderCardId) : undefined;
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

  const nobles = useMemo(() => {
    const query = search.trim().toLowerCase();
    return draft.nobles.filter((entry) =>
      !query || `${entry.id} ${entry.displayName} ${entry.factionId} ${entry.rank}`.toLowerCase().includes(query),
    ).sort((left, right) => left.factionId.localeCompare(right.factionId) || ["king", "baron", "count"].indexOf(left.rank) - ["king", "baron", "count"].indexOf(right.rank) || left.displayName.localeCompare(right.displayName));
  }, [draft.nobles, search]);

  useEffect(() => setAssetDraft(null), [selectedCardId, selectedHeroId, selectedItemId, selectedTerrain, tab]);
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
  function updateAbility(patch: Partial<AbilityDefinition>): void {
    if (!ability) return;
    setDraft((current) => ({ ...current, abilities: current.abilities.map((entry) => entry.id === ability.id ? { ...entry, ...patch } : entry) }));
    dirty("Ability changed · unsaved");
  }
  function updateNoble(patch: Partial<NobleProfile>): void {
    if (!noble) return;
    setDraft((current) => ({ ...current, nobles: current.nobles.map((entry) => entry.id === noble.id ? { ...entry, ...patch } : entry) }));
    dirty("Noble profile changed · unsaved");
  }
  function updateHero(patch: Partial<HeroDefinition>): void {
    if (!hero) return;
    setDraft((current) => ({ ...current, heroes: current.heroes.map((entry) => entry.id === hero.id ? { ...entry, ...patch } : entry) }));
    dirty("Hero changed · unsaved");
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
  function createNoble(copy: boolean): void {
    const source = noble;
    const id = uniqueId(copy && source ? `${source.id}_copy` : "new_noble", draft.nobles.map((entry) => entry.id));
    const created: NobleProfile = copy && source
      ? { ...structuredClone(source), id, displayName: `${source.displayName} Copy` }
      : { id, factionId: "ember_crown", rank: "count", displayName: "New Noble", leaderCardId: draft.cards.find((entry) => entry.portraitImage)?.id ?? draft.cards[0].id, leaderLevel: 3 };
    setDraft((current) => ({ ...current, nobles: [...current.nobles, created] }));
    setSelectedNobleId(id);
    dirty("New noble created · unsaved");
  }
  function createHero(copy: boolean): void {
    const source = hero;
    const id = uniqueId(copy && source ? `${source.id}_copy` : "new_hero", draft.heroes.map((entry) => entry.id));
    const nameKey = `hero.${toCamelCase(id)}.name`;
    const descriptionKey = `hero.${toCamelCase(id)}.description`;
    const created: HeroDefinition = copy && source
      ? { ...structuredClone(source), id, nameKey, descriptionKey }
      : { id, nameKey, descriptionKey, raceId: "human", heroCardId: draft.cards.find((entry) => entry.id.startsWith("player_"))?.id ?? draft.cards[0].id, startingDeck: ["village_levy"], startingGoldBonus: 0 };
    setDraft((current) => ({ ...current, heroes: [...current.heroes, created] }));
    setNames((current) => ({ ...current, [nameKey]: copy && source ? `${current[source.nameKey]} Copy` : "New Hero", [descriptionKey]: copy && source ? current[source.descriptionKey] : "A new champion of the shattered roads." }));
    setSelectedHeroId(id);
    dirty("New hero created · unsaved");
  }

  function removeNoble(): void {
    if (!noble || !window.confirm(`Delete ${noble.displayName}?`)) return;
    const remaining = draft.nobles.filter((entry) => entry.id !== noble.id);
    setDraft((current) => ({ ...current, nobles: remaining }));
    setSelectedNobleId(remaining[0]?.id ?? "");
    dirty("Noble deleted · unsaved");
  }
  function removeHero(): void {
    if (!hero || draft.heroes.length <= 1 || !window.confirm(`Delete ${names[hero.nameKey] ?? hero.id}?`)) return;
    const remaining = draft.heroes.filter((entry) => entry.id !== hero.id);
    setDraft((current) => ({ ...current, heroes: remaining }));
    setSelectedHeroId(remaining[0]?.id ?? "");
    dirty("Hero deleted · unsaved");
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
    const duplicates = [...findDuplicates(draft.cards.map((entry) => entry.id)), ...findDuplicates(draft.items.map((entry) => entry.id)), ...findDuplicates(draft.abilities.map((entry) => entry.id)), ...findDuplicates(draft.heroes.map((entry) => entry.id)), ...findDuplicates(draft.nobles.map((entry) => entry.id))];
    if (duplicates.length) { setMessage(`Duplicate IDs: ${duplicates.join(", ")}`); return; }
    const broken = findBrokenReferences(draft); if (broken.length) { setMessage(`Missing references: ${broken.slice(0, 5).join(", ")}`); return; }
    const upgradeProblems = findUpgradeProblems(draft); if (upgradeProblems.length) { setMessage(`Invalid upgrade paths: ${upgradeProblems.slice(0, 4).join(" · ")}`); return; }
    const nobleProblems = findNobleProblems(draft); if (nobleProblems.length) { setMessage(`Invalid nobility: ${nobleProblems.slice(0, 4).join(" · ")}`); return; }
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
    <header className="studio-header"><div><span>Dark Dimensions</span><h1>Content Studio</h1></div><nav className="studio-tabs">{(["cards", "heroes", "nobles", "items", "abilities", "terrains", "economy"] as StudioTab[]).map((value) => <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{value}</button>)}</nav><p>{message}</p><div className="studio-header-actions"><a className="button ghost" href="./">Return to game</a><button className="button primary" disabled={saving} onClick={() => void saveContent()}>{saving ? "Saving…" : "Validate & save"}</button></div></header>

    <aside className="studio-library">
      {tab === "cards" || tab === "items" || tab === "abilities" || tab === "heroes" || tab === "nobles" ? <input aria-label={`Search ${tab}`} placeholder={`Search ${tab}…`} value={search} onChange={(event) => setSearch(event.target.value)} /> : <strong className="studio-library-title">{tab === "economy" ? "Reward economy" : "Battlefield terrains"}</strong>}
      {tab === "cards" ? <><div className="studio-filter-grid"><select aria-label="Filter race" value={raceFilter} onChange={(event) => setRaceFilter(event.target.value)}><option value="all">All races</option>{RACES.map((race) => <option key={race}>{race}</option>)}</select><select aria-label="Filter tier" value={tierFilter} onChange={(event) => setTierFilter(event.target.value)}><option value="all">All tiers</option>{[1,2,3,4,5,6].map((tier) => <option key={tier} value={tier}>Tier {tier}</option>)}</select><select aria-label="Sort cards" value={sort} onChange={(event) => setSort(event.target.value)}><option value="name">Name</option><option value="race">Race</option><option value="tier">Tier</option></select></div><CreateActions onNew={() => createCard(false)} onDuplicate={() => createCard(true)} /><Library entries={cards.map((entry) => ({ id: entry.id, title: names[entry.nameKey] ?? entry.id, meta: `${entry.race} · T${entry.tier} · ${entry.rarity}` }))} selectedId={card?.id} onSelect={setSelectedCardId} /></> : null}
      {tab === "items" ? <><div className="studio-filter-grid"><select aria-label="Filter item type" value={itemTypeFilter} onChange={(event) => setItemTypeFilter(event.target.value)}><option value="all">All item types</option>{ITEM_TYPES.map((type) => <option key={type}>{type}</option>)}</select><select aria-label="Sort items" value={sort} onChange={(event) => setSort(event.target.value)}><option value="name">Name</option><option value="type">Type</option><option value="value">Value</option></select></div><CreateActions onNew={() => createItem(false)} onDuplicate={() => createItem(true)} /><Library entries={items.map((entry) => ({ id: entry.id, title: names[entry.nameKey] ?? entry.id, meta: `${entry.type}${entry.type === "equipment" ? ` · T${entry.tier} · ${entry.rarity}` : ""} · ${entry.baseValue}g · ${entry.weight} weight` }))} selectedId={item?.id} onSelect={setSelectedItemId} /></> : null}
      {tab === "abilities" ? <Library entries={draft.abilities.filter((entry) => !search.trim() || `${entry.id} ${names[entry.nameKey] ?? ""}`.toLowerCase().includes(search.toLowerCase())).map((entry) => ({ id: entry.id, title: names[entry.nameKey] ?? entry.id, meta: `${entry.category} · T${entry.tier} · ${entry.actionCost} actions · ${entry.basePrice}g` }))} selectedId={ability?.id} onSelect={setSelectedAbilityId} /> : null}
      {tab === "heroes" ? <><CreateActions onNew={() => createHero(false)} onDuplicate={() => createHero(true)} /><Library entries={draft.heroes.filter((entry) => !search.trim() || `${entry.id} ${names[entry.nameKey] ?? ""} ${entry.raceId}`.toLowerCase().includes(search.toLowerCase())).map((entry) => ({ id: entry.id, title: names[entry.nameKey] ?? entry.id, meta: `${entry.raceId} · ${entry.startingDeck.length} units` }))} selectedId={hero?.id} onSelect={setSelectedHeroId} /></> : null}
      {tab === "nobles" ? <><CreateActions onNew={() => createNoble(false)} onDuplicate={() => createNoble(true)} /><Library entries={nobles.map((entry) => ({ id: entry.id, title: entry.displayName, meta: `${entry.factionId} · ${entry.rank} · leader ${entry.leaderCardId}` }))} selectedId={noble?.id} onSelect={setSelectedNobleId} /></> : null}
      {tab === "terrains" ? <Library entries={TERRAINS.map((terrain) => ({ id: terrain, title: terrain, meta: draft.terrainBattlefields[terrain]?.image ? "Image assigned" : "Gradient fallback" }))} selectedId={selectedTerrain} onSelect={setSelectedTerrain} /> : null}
      {tab === "economy" ? <p className="studio-empty">These values control rewards for every battle. Enemy-specific gold and loot tables remain valid as minimums and source pools.</p> : null}
    </aside>

    <section className="studio-form">
      {tab === "cards" && card ? <><CardForm card={card} names={names} setNames={setNames} update={updateCard} updateNumber={updateCardNumber} rename={(value: string) => rename("card", value)} remove={() => remove("card")} chooseAsset={chooseAsset} applyAsset={applyAsset} assetDraft={assetDraft} focus={focus} saving={saving} dirty={dirty} /><UpgradePathEditor card={card} draft={draft} setDraft={setDraft} names={names} dirty={dirty} /></> : null}
      {tab === "items" && item ? <ItemForm item={item} names={names} setNames={setNames} update={updateItem} updateNumber={updateItemNumber} rename={(value: string) => rename("item", value)} remove={() => remove("item")} chooseAsset={chooseAsset} applyAsset={applyAsset} assetDraft={assetDraft} focus={focus} saving={saving} dirty={dirty} /> : null}
      {tab === "abilities" && ability ? <AbilityForm ability={ability} names={names} setNames={setNames} update={updateAbility} /> : null}
      {tab === "heroes" && hero ? <HeroForm hero={hero} cards={draft.cards} names={names} setNames={setNames} update={updateHero} remove={removeHero} editCard={() => { setSelectedCardId(hero.heroCardId); setTab("cards"); }} /> : null}
      {tab === "nobles" && noble ? <NobleForm noble={noble} cards={draft.cards} names={names} update={updateNoble} remove={removeNoble} editLeader={() => { setSelectedCardId(noble.leaderCardId); setTab("cards"); }} /> : null}
      {tab === "terrains" ? <TerrainForm terrain={selectedTerrain} definition={terrainDefinition} preview={terrainPreview} focus={terrainFocus} assetDraft={assetDraft} saving={saving} chooseAsset={chooseAsset} applyAsset={applyAsset} updateFocus={updateTerrainFocus} /> : null}
      {tab === "economy" ? <RewardEconomyForm rules={draft.combatRules.rewards} update={updateRewardRule} /> : null}
    </section>

    <aside className="studio-preview">{tab === "cards" && card ? <CardPreview card={card} name={names[card.nameKey] ?? card.id} image={assetDraft && assetDraft.kind !== "terrain" && assetDraft.kind !== "item" ? assetDraft.source : card.portraitImage} focus={focus} /> : null}{tab === "heroes" && hero ? <HeroPreview hero={hero} card={draft.cards.find((entry) => entry.id === hero.heroCardId)} names={names} /> : null}{tab === "nobles" && noble ? <NoblePreview noble={noble} leader={nobleLeader} leaderName={nobleLeader ? names[nobleLeader.nameKey] ?? nobleLeader.id : "Missing leader"} /> : null}{tab === "items" && item ? <ItemPreview item={item} name={names[item.nameKey] ?? item.id} image={assetDraft?.kind === "item" ? assetDraft.source : item.itemImage} focus={focus} /> : null}{tab === "terrains" ? <><span>Terrain status</span><h2>{selectedTerrain}</h2><p>{terrainDefinition?.image ? "Custom battlefield active" : "Using gradient fallback"}</p><div className="studio-paths"><small>Arena background</small><code>{terrainDefinition?.image ?? "Gradient fallback"}</code></div></> : null}{tab === "economy" ? <><span>Example victory</span><h2>{draft.combatRules.rewards.baseGold + draft.combatRules.rewards.goldPerThreat * 2 + draft.combatRules.rewards.goldPerDefeatedUnit * 5} gold</h2><p>Threat 2 · five defeated units</p><div className="studio-paths"><small>Guaranteed loot rolls</small><code>{draft.combatRules.rewards.minimumItemRolls}</code><small>Maximum prisoners</small><code>{draft.combatRules.rewards.maximumCaptures}</code></div></> : null}</aside>
  </main>;
}

function AbilityForm({ ability, names, setNames, update }: { ability: AbilityDefinition; names: Record<string, string>; setNames: React.Dispatch<React.SetStateAction<Record<string, string>>>; update: (patch: Partial<AbilityDefinition>) => void }) {
  const effect = ability.effects[0];
  const updateEffect = (patch: Partial<typeof effect>) => update({ effects: [{ ...effect, ...patch }, ...ability.effects.slice(1)] });
  return <><SectionTitle eyebrow="Combat ability" title={names[ability.nameKey] ?? ability.id} /><div className="studio-form-grid">
    <StudioField label="Ability id"><input value={ability.id} readOnly /></StudioField>
    <StudioField label="Display name"><input value={names[ability.nameKey] ?? ""} onChange={(event) => setNames((current) => ({ ...current, [ability.nameKey]: event.target.value }))} /></StudioField>
    <StudioField label="Description" wide><textarea rows={3} value={names[ability.descriptionKey] ?? ""} onChange={(event) => setNames((current) => ({ ...current, [ability.descriptionKey]: event.target.value }))} /></StudioField>
    <StudioField label="Category"><select value={ability.category} onChange={(event) => update({ category: event.target.value as AbilityDefinition["category"] })}><option value="skill">Skill</option><option value="magic">Magic</option></select></StudioField>
    <StudioField label="Tier"><select value={ability.tier} onChange={(event) => update({ tier: Number(event.target.value), actionCost: Number(event.target.value) })}>{[1,2,3,4,5].map((tier) => <option key={tier} value={tier}>Tier {tier}</option>)}</select></StudioField>
    <StudioField label="Action cost"><input type="number" min="1" max="5" value={ability.actionCost} onChange={(event) => update({ actionCost: Number(event.target.value) })} /></StudioField>
    <StudioField label="Base price"><input type="number" min="0" value={ability.basePrice} onChange={(event) => update({ basePrice: Number(event.target.value) })} /></StudioField>
    <StudioField label="Target"><select value={ability.target} onChange={(event) => update({ target: event.target.value as AbilityDefinition["target"] })}><option value="ally">One ally</option><option value="enemy">One enemy</option><option value="allAllies">All allies</option><option value="allEnemies">All enemies</option></select></StudioField>
    <StudioField label="Effect"><select value={effect.type} onChange={(event) => updateEffect({ type: event.target.value as typeof effect.type })}><option value="heal">Heal</option><option value="damage">Damage</option><option value="burn">Burn</option><option value="modifyStat">Modify stat</option><option value="shield">Shield</option></select></StudioField>
    <StudioField label="Value"><input type="number" min="1" value={effect.value} onChange={(event) => updateEffect({ value: Number(event.target.value) })} /></StudioField>
    {effect.type === "modifyStat" ? <StudioField label="Stat"><select value={effect.stat ?? "atk"} onChange={(event) => updateEffect({ stat: event.target.value as "atk" | "def" | "initiative" })}><option value="atk">ATK</option><option value="def">DEF</option><option value="initiative">Initiative</option></select></StudioField> : null}
    {effect.type === "burn" || effect.type === "modifyStat" ? <StudioField label="Duration rounds"><input type="number" min="1" max="99" value={effect.durationRounds ?? 1} onChange={(event) => updateEffect({ durationRounds: Number(event.target.value) })} /></StudioField> : null}
    <StudioField label="Icon"><input value={ability.icon} onChange={(event) => update({ icon: event.target.value || "✦" })} /></StudioField>
  </div></>;
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

function HeroForm({ hero, cards, names, setNames, update, remove, editCard }: { hero: HeroDefinition; cards: CardDefinition[]; names: Record<string, string>; setNames: React.Dispatch<React.SetStateAction<Record<string, string>>>; update: (patch: Partial<HeroDefinition>) => void; remove: () => void; editCard: () => void }) {
  const orderedCards = [...cards].sort((left, right) => (names[left.nameKey] ?? left.id).localeCompare(names[right.nameKey] ?? right.id));
  const deckCandidates = orderedCards.filter((card) => !card.id.startsWith("player_"));
  return <><SectionTitle eyebrow="Playable hero" title={names[hero.nameKey] ?? hero.id} onDelete={remove} /><div className="studio-form-grid">
    <StudioField label="Hero id"><input value={hero.id} readOnly /></StudioField>
    <StudioField label="Display name"><input value={names[hero.nameKey] ?? ""} onChange={(event) => setNames((current) => ({ ...current, [hero.nameKey]: event.target.value }))} /></StudioField>
    <StudioField label="Description" wide><textarea rows={3} value={names[hero.descriptionKey] ?? ""} onChange={(event) => setNames((current) => ({ ...current, [hero.descriptionKey]: event.target.value }))} /></StudioField>
    <StudioField label="Race"><select value={hero.raceId} onChange={(event) => update({ raceId: event.target.value as HeroDefinition["raceId"] })}><option value="human">Human</option><option value="kobold">Kobold</option><option value="orc">Orc</option><option value="revenant">Revenant</option></select></StudioField>
    <StudioField label="Starting gold modifier"><input type="number" value={hero.startingGoldBonus} onChange={(event) => update({ startingGoldBonus: Number(event.target.value) || 0 })} /></StudioField>
    <StudioField label="Hero card" wide><span className="studio-upgrade-option"><select value={hero.heroCardId} onChange={(event) => update({ heroCardId: event.target.value })}>{orderedCards.map((card) => <option key={card.id} value={card.id}>{names[card.nameKey] ?? card.id} · {card.race} · T{card.tier}</option>)}</select><button type="button" onClick={editCard}>Edit portrait &amp; stats</button></span></StudioField>
  </div><section className="studio-assets studio-upgrade-editor"><SectionTitle eyebrow="Starting warband" title={`${hero.startingDeck.length} units`} /><div className="studio-form-grid">{hero.startingDeck.map((cardId, index) => <StudioField key={`${cardId}-${index}`} label={`Deck slot ${index + 1}`}><span className="studio-upgrade-option"><select value={cardId} onChange={(event) => update({ startingDeck: hero.startingDeck.map((id, deckIndex) => deckIndex === index ? event.target.value : id) })}>{deckCandidates.map((card) => <option key={card.id} value={card.id}>{names[card.nameKey] ?? card.id} · T{card.tier}</option>)}</select><button type="button" disabled={hero.startingDeck.length <= 1} onClick={() => update({ startingDeck: hero.startingDeck.filter((_, deckIndex) => deckIndex !== index) })}>Remove</button></span></StudioField>)}</div><div className="studio-create-actions"><button type="button" disabled={!deckCandidates.length || hero.startingDeck.length >= 30} onClick={() => update({ startingDeck: [...hero.startingDeck, deckCandidates[0].id] })}>+ Add unit</button><small>Duplicate unit cards are allowed.</small></div></section></>;
}

function NobleForm({ noble, cards, names, update, remove, editLeader }: { noble: NobleProfile; cards: CardDefinition[]; names: Record<string, string>; update: (patch: Partial<NobleProfile>) => void; remove: () => void; editLeader: () => void }) {
  const orderedCards = [...cards].sort((left, right) => Number(Boolean(right.portraitImage)) - Number(Boolean(left.portraitImage)) || (names[left.nameKey] ?? left.id).localeCompare(names[right.nameKey] ?? right.id));
  const leader = cards.find((card) => card.id === noble.leaderCardId);
  return <><SectionTitle eyebrow="Noble profile" title={noble.displayName} onDelete={remove} /><div className="studio-form-grid">
    <StudioField label="Profile id"><input value={noble.id} readOnly /></StudioField>
    <StudioField label="Display name"><input value={noble.displayName} onChange={(event) => update({ displayName: event.target.value })} /></StudioField>
    <StudioField label="Faction"><select value={noble.factionId} onChange={(event) => update({ factionId: event.target.value as NobleProfile["factionId"] })}><option value="ember_crown">Ember Crown</option><option value="gloam_compact">Gloam Compact</option><option value="iron_concord">Iron Concord</option></select></StudioField>
    <StudioField label="Rank"><select value={noble.rank} onChange={(event) => update({ rank: event.target.value as NobleProfile["rank"] })}><option value="king">King</option><option value="baron">Baron · city</option><option value="count">Count · village domain</option></select></StudioField>
    <StudioField label="Leader card" wide><select value={noble.leaderCardId} onChange={(event) => update({ leaderCardId: event.target.value })}>{orderedCards.map((card) => <option key={card.id} value={card.id}>{card.portraitImage ? "Portrait" : "No portrait"} · {names[card.nameKey] ?? card.id} · T{card.tier}</option>)}</select></StudioField>
    <StudioField label="Leader level"><input type="number" min="1" max="20" value={noble.leaderLevel} onChange={(event) => update({ leaderLevel: Math.max(1, Number(event.target.value)) })} /></StudioField>
  </div><section className="studio-assets studio-noble-help"><SectionTitle eyebrow="Leader artwork" title={leader?.portraitImage ? "Portrait assigned" : "Portrait missing"} /><p>The selected leader is a normal unit card. Edit that card to upload its portrait, battle card and focus point.</p><button type="button" onClick={editLeader}>Edit leader card &amp; portrait</button></section></>;
}

function CardForm({ card, names, setNames, update, updateNumber, rename, remove, chooseAsset, applyAsset, assetDraft, focus, saving, dirty }: any) {
  return <><SectionTitle eyebrow="Card definition" title={names[card.nameKey] ?? card.id} onDelete={remove} /><div className="studio-form-grid"><StudioField label="Card id"><input value={card.id} onChange={(e) => rename(e.target.value)} /></StudioField><StudioField label="Display name"><input value={names[card.nameKey] ?? ""} onChange={(e) => { setNames((current: Record<string,string>) => ({ ...current, [card.nameKey]: e.target.value })); dirty(); }} /></StudioField><StudioField label="Unit description" wide><textarea rows={3} value={card.descriptionKey ? names[card.descriptionKey] ?? "" : ""} onChange={(e) => { const key = card.descriptionKey ?? `card.${toCamelCase(card.id)}.description`; if (!card.descriptionKey) update({ descriptionKey: key }); setNames((current: Record<string,string>) => ({ ...current, [key]: e.target.value })); dirty(); }} /></StudioField><StudioField label="Race"><select value={card.race} onChange={(e) => update({ race: e.target.value })}>{RACES.map((race) => <option key={race}>{race}</option>)}</select></StudioField><StudioField label="Rarity"><select value={card.rarity} onChange={(e) => update({ rarity: e.target.value })}>{RARITIES.map((rarity) => <option key={rarity}>{rarity}</option>)}</select></StudioField>{(["tier","initiative","atk","def","maxHp","recruitCost"] as const).map((key) => <StudioField label={key} key={key}><input type="number" value={card[key] ?? ""} onChange={(e) => updateNumber(key, e.target.value)} /></StudioField>)}</div><EffectEditor effects={getCardEffects(card)} tier={card.tier} update={(battleEffects) => update({ battleEffects, battleEffect: undefined })} /><AssetSection title="Portrait & card image" description="PNG, JPEG or WebP · exported as 768 × 1024 WebP" kinds={["portrait","card"]} assetDraft={assetDraft} focus={focus} saving={saving} chooseAsset={chooseAsset} applyAsset={applyAsset} updateFocus={(axis: string, value: number) => update({ imageFocus: { ...focus, [axis]: value } })} /></>;
}

const EFFECT_TRIGGERS: CardEffect["trigger"][] = ["onSummon", "onAttack", "onDeath"];
const EFFECT_ACTIONS: CardEffect["action"][] = ["heal", "damage", "drain", "shield", "modifyStat", "draw", "returnToHand"];
const EFFECT_TARGETS: NonNullable<CardEffect["target"]>[] = ["self", "lowestAlly", "weakestEnemy", "strongestEnemy", "allAllies", "allEnemies", "sameRaceAllies", "randomEnemy"];
const EFFECT_ZONES: NonNullable<CardEffect["zone"]>[] = ["field", "hand", "fieldAndHand"];

function EffectEditor({ effects, tier, update }: { effects: CardEffect[]; tier: number; update: (effects: CardEffect[]) => void }) {
  const replace = (index: number, effect: CardEffect) => update(effects.map((entry, effectIndex) => effectIndex === index ? effect : entry));
  const move = (index: number, offset: number) => {
    const next = [...effects];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    update(next);
  };
  return <section className="studio-assets studio-effect-editor">
    <SectionTitle eyebrow="Battle behavior" title={`Card effects · ${effects.length}/3`} />
    {!effects.length ? <p className={tier >= 3 ? "studio-effect-warning" : "studio-empty"}>{tier >= 3 ? "Tier 3+ cards require at least one effect before saving." : "This card currently has no special effect."}</p> : null}
    <div className="studio-effect-list">{effects.map((effect, index) => {
      const parsed = cardEffectSchema.safeParse(effect);
      return <article className="studio-effect-row" key={index}>
        <header><strong>Effect {index + 1}</strong><div><button disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move effect up">↑</button><button disabled={index === effects.length - 1} onClick={() => move(index, 1)} aria-label="Move effect down">↓</button><button disabled={effects.length >= 3} onClick={() => update([...effects.slice(0, index + 1), structuredClone(effect), ...effects.slice(index + 1)])}>Duplicate</button><button className="danger" onClick={() => update(effects.filter((_, effectIndex) => effectIndex !== index))}>Delete</button></div></header>
        <div className="studio-effect-fields">
          <StudioField label="Trigger"><select value={effect.trigger} disabled={effect.action === "returnToHand"} onChange={(event) => replace(index, { ...effect, trigger: event.target.value as CardEffect["trigger"] })}>{EFFECT_TRIGGERS.map((trigger) => <option key={trigger} value={trigger}>{humanizeEffectTerm(trigger)}</option>)}</select></StudioField>
          <StudioField label="Action"><select value={effect.action} onChange={(event) => replace(index, effectForAction(event.target.value as CardEffect["action"], effect.trigger))}>{EFFECT_ACTIONS.map((action) => <option key={action} value={action}>{humanizeEffectTerm(action)}</option>)}</select></StudioField>
          {effect.action !== "draw" ? <StudioField label="Target"><select value={effect.target ?? "self"} disabled={effect.action === "returnToHand"} onChange={(event) => replace(index, { ...effect, target: event.target.value as CardEffect["target"] })}>{EFFECT_TARGETS.map((target) => <option key={target} value={target}>{humanizeEffectTerm(target)}</option>)}</select></StudioField> : null}
          {effect.action === "heal" ? <StudioField label="Zone"><select value={effect.zone ?? "field"} onChange={(event) => replace(index, { ...effect, zone: event.target.value as CardEffect["zone"] })}>{EFFECT_ZONES.map((zone) => <option key={zone} value={zone}>{humanizeEffectTerm(zone)}</option>)}</select></StudioField> : null}
          {effect.action === "modifyStat" ? <><StudioField label="Attribute"><select value={effect.stat ?? "atk"} onChange={(event) => replace(index, { ...effect, stat: event.target.value as CardEffect["stat"] })}><option value="atk">ATK</option><option value="def">DEF</option><option value="initiative">Initiative</option></select></StudioField><StudioField label="Change"><select value={effect.modifier ?? "increase"} onChange={(event) => replace(index, { ...effect, modifier: event.target.value as CardEffect["modifier"] })}><option value="increase">Increase</option><option value="decrease">Decrease</option></select></StudioField><StudioField label="Duration"><select value={effect.duration ?? "round"} onChange={(event) => replace(index, { ...effect, duration: event.target.value as CardEffect["duration"] })}><option value="round">Current round</option><option value="battle">Entire battle</option></select></StudioField></> : null}
          <StudioField label={effect.action === "draw" ? "Cards" : effect.action === "returnToHand" ? "Return HP %" : "Value"}><input type="number" min="1" max={effect.action === "draw" ? 3 : effect.action === "returnToHand" ? 100 : undefined} step="1" value={effect.value} onChange={(event) => replace(index, { ...effect, value: Math.max(1, Number(event.target.value) || 1) })} /></StudioField>
          {(effect.action === "heal" || effect.action === "shield") ? <StudioField label="Value type"><select value={effect.valueMode ?? "flat"} onChange={(event) => replace(index, { ...effect, valueMode: event.target.value as CardEffect["valueMode"] })}><option value="flat">Flat points</option><option value="percentMaxHp">% maximum HP</option></select></StudioField> : null}
          <StudioField label="Condition"><select value={effect.condition ?? ""} onChange={(event) => { const condition = event.target.value as CardEffect["condition"] | ""; replace(index, { ...effect, condition: condition || undefined, conditionValue: condition === "allyRaceCount" ? effect.conditionValue ?? 2 : undefined }); }}><option value="">Always</option><option value="enemyWounded">Enemy wounded</option><option value="selfBelowHalf">Self below 50% HP</option><option value="allyRaceCount">Minimum same-race allies</option></select></StudioField>
          {effect.condition === "allyRaceCount" ? <StudioField label="Minimum allies"><input type="number" min="1" max="7" value={effect.conditionValue ?? 2} onChange={(event) => replace(index, { ...effect, conditionValue: Math.max(1, Number(event.target.value) || 1) })} /></StudioField> : null}
          <StudioField label="Uses per battle"><input type="number" min="1" max="9" placeholder="Unlimited" value={effect.limitPerBattle ?? ""} onChange={(event) => replace(index, { ...effect, limitPerBattle: event.target.value ? Math.max(1, Number(event.target.value)) : undefined })} /></StudioField>
        </div>
        <p className={`studio-effect-preview ${parsed.success ? "" : "invalid"}`}>{parsed.success ? describeCardEffect(effect) : parsed.error.issues[0]?.message}</p>
      </article>;
    })}</div>
    <div className="studio-create-actions"><button type="button" disabled={effects.length >= 3} onClick={() => update([...effects, effectForAction("heal", "onSummon")])}>+ Add effect</button><small>Effects resolve from top to bottom. Maximum three per card.</small></div>
  </section>;
}

function effectForAction(action: CardEffect["action"], trigger: CardEffect["trigger"]): CardEffect {
  if (action === "draw") return { trigger, action, value: 1 };
  if (action === "returnToHand") return { trigger: "onDeath", action, target: "self", value: 50, limitPerBattle: 1 };
  if (action === "modifyStat") return { trigger, action, target: "self", value: 100, stat: "atk", modifier: "increase", duration: "round" };
  if (action === "heal") return { trigger, action, target: "lowestAlly", zone: "field", value: 140, valueMode: "flat" };
  return { trigger, action, target: action === "shield" ? "self" : "weakestEnemy", value: 100, ...(action === "shield" ? { valueMode: "flat" as const } : {}) };
}

function humanizeEffectTerm(value: string): string {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
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
  const changeType = (type: ItemDefinition["type"]) => update({ type, foodUnits: type === "consumable" ? item.foodUnits : undefined, effect: type === "consumable" ? item.effect : undefined, equipmentSlot: type === "equipment" ? item.equipmentSlot ?? "rightHand" : undefined, weaponType: type === "equipment" ? item.weaponType : undefined, tier: type === "equipment" ? item.tier ?? 1 : undefined, rarity: type === "equipment" ? item.rarity ?? "common" : undefined, dropChance: type === "equipment" ? item.dropChance ?? 0.1 : undefined, statBonus: type === "equipment" ? item.statBonus ?? {} : undefined });
  return <><SectionTitle eyebrow="Item definition" title={names[item.nameKey] ?? item.id} onDelete={remove} /><div className="studio-form-grid"><StudioField label="Item id"><input value={item.id} onChange={(e) => rename(e.target.value)} /></StudioField><StudioField label="Display name"><input value={names[item.nameKey] ?? ""} onChange={(e) => { setNames((current: Record<string,string>) => ({ ...current, [item.nameKey]: e.target.value })); dirty(); }} /></StudioField><StudioField label="Description" wide><textarea rows={3} value={names[item.descriptionKey] ?? ""} onChange={(e) => { setNames((current: Record<string,string>) => ({ ...current, [item.descriptionKey]: e.target.value })); dirty(); }} /></StudioField><StudioField label="Item type"><select value={item.type} onChange={(e) => changeType(e.target.value as ItemDefinition["type"])}>{ITEM_TYPES.map((type) => <option key={type}>{type}</option>)}</select></StudioField><StudioField label="Base value"><input type="number" min="1" value={item.baseValue} onChange={(e) => updateNumber("baseValue", e.target.value)} /></StudioField><StudioField label="Weight"><input type="number" min="0" step="0.1" value={item.weight} onChange={(e) => updateNumber("weight", e.target.value)} /></StudioField>{item.type === "consumable" ? <><StudioField label="Consumable effect"><select value={item.effect ?? ""} onChange={(e) => update({ effect: e.target.value || undefined })}><option value="">No effect</option><option value="heal_300">Heal 300</option></select></StudioField><StudioField label="Food units"><input type="number" min="1" value={item.foodUnits ?? ""} onChange={(e) => updateNumber("foodUnits", e.target.value)} /></StudioField></> : null}{item.type === "equipment" ? <><StudioField label="Equipment tier"><select value={item.tier ?? 1} onChange={(e) => update({ tier: Number(e.target.value) })}>{[1,2,3,4,5].map((tier) => <option key={tier} value={tier}>Tier {tier}</option>)}</select></StudioField><StudioField label="Rarity"><select value={item.rarity ?? "common"} onChange={(e) => update({ rarity: e.target.value })}>{EQUIPMENT_RARITIES.map((rarity) => <option key={rarity}>{rarity}</option>)}</select></StudioField><StudioField label="Base drop chance"><input type="number" min="0.001" max="0.5" step="0.001" value={item.dropChance ?? 0.1} onChange={(e) => update({ dropChance: Number(e.target.value) })} /></StudioField><StudioField label="Equipment slot"><select value={item.equipmentSlot ?? "rightHand"} onChange={(e) => update({ equipmentSlot: e.target.value })}>{EQUIPMENT_SLOTS.map((slot) => <option key={slot}>{slot}</option>)}</select></StudioField><StudioField label="Weapon type"><select value={item.weaponType ?? ""} onChange={(e) => update({ weaponType: e.target.value || undefined })}><option value="">None / accessory</option>{WEAPON_TYPES.map((type) => <option key={type}>{type}</option>)}</select></StudioField><StudioField label="ATK bonus"><input type="number" min="0" value={item.statBonus?.atk ?? 0} onChange={(e) => update({ statBonus: { ...item.statBonus, atk: Number(e.target.value) } })} /></StudioField><StudioField label="DEF bonus"><input type="number" min="0" value={item.statBonus?.def ?? 0} onChange={(e) => update({ statBonus: { ...item.statBonus, def: Number(e.target.value) } })} /></StudioField></> : null}</div><AssetSection title="Item image" description="Square image · exported as 512 × 512 WebP" kinds={["item"]} assetDraft={assetDraft} focus={focus} saving={saving} chooseAsset={chooseAsset} applyAsset={applyAsset} updateFocus={(axis: string, value: number) => update({ imageFocus: { ...focus, [axis]: value } })} /><div className="studio-paths"><small>Item image</small><code>{item.itemImage ?? "No image assigned"}</code></div></>;
}

function TerrainForm({ terrain, definition, preview, focus, assetDraft, saving, chooseAsset, applyAsset, updateFocus }: any) { return <><SectionTitle eyebrow="Battlefield artwork" title={terrain} /><section className="studio-assets studio-terrain-assets"><div className="studio-upload-row"><label className="studio-upload">Choose arena background<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void chooseAsset("terrain", event)} /></label><span>16:9 image · exported as 1920 × 1080 WebP</span></div><div className="studio-terrain-preview">{preview ? <img src={preview} alt={`${terrain} battlefield preview`} style={{ objectPosition: `${focus.x}% ${focus.y}%` }} /> : <span>No arena background assigned</span>}</div><div className="studio-focus-controls"><Range label="Horizontal focus" value={focus.x} onChange={(value) => updateFocus("x", value)} /><Range label="Vertical focus" value={focus.y} onChange={(value) => updateFocus("y", value)} /><button disabled={assetDraft?.kind !== "terrain" || saving} onClick={() => void applyAsset()}>{assetDraft?.kind === "terrain" ? `Apply ${assetDraft.fileName}` : "Choose a background first"}</button></div><div className="studio-paths"><small>Arena background</small><code>{definition?.image ?? "Gradient fallback"}</code></div></section></> }

function AssetSection({ title, description, kinds, assetDraft, focus, saving, chooseAsset, applyAsset, updateFocus }: any) { return <section className="studio-assets"><SectionTitle eyebrow="Artwork pipeline" title={title} /><div className="studio-upload-row">{kinds.map((kind: AssetKind) => <label className="studio-upload" key={kind}>Choose {kind} image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void chooseAsset(kind, event)} /></label>)}<span>{description}</span></div><div className="studio-focus-controls"><Range label="Horizontal focus" value={focus.x} onChange={(value) => updateFocus("x", value)} /><Range label="Vertical focus" value={focus.y} onChange={(value) => updateFocus("y", value)} /><button disabled={!assetDraft || !kinds.includes(assetDraft.kind) || saving} onClick={() => void applyAsset()}>{assetDraft && kinds.includes(assetDraft.kind) ? `Apply ${assetDraft.fileName}` : "Choose an image first"}</button></div></section> }
function CardPreview({ card, name, image, focus }: { card: CardDefinition; name: string; image?: string; focus: {x:number;y:number} }) { const descriptions = describeCardEffects(card); return <><span>Live battle preview</span><article className="studio-portrait-preview"><div>{image ? <img src={image} alt="" style={{ objectPosition: `${focus.x}% ${focus.y}%` }} /> : <b>{name.slice(0,1)}</b>}</div><strong className={`rarity-name ${card.rarity}`}>{name}</strong><i><span /></i><small>{card.maxHp}/{card.maxHp} HP</small></article><article className="battle-card studio-card-preview"><strong className={`rarity-name ${card.rarity}`}>{name}</strong><span className="card-race">{card.race}</span><span className="card-level">T{card.tier}</span><span className="card-stats"><b>ATK {card.atk}</b><b>DEF {card.def}</b><b>INI {card.initiative}</b></span></article><div className="studio-effect-summary"><small>Battle effects</small>{descriptions.length ? descriptions.map((description, index) => <p key={index}>{description}</p>) : <p>No special effect.</p>}</div></> }
function HeroPreview({ hero, card, names }: { hero: HeroDefinition; card?: CardDefinition; names: Record<string, string> }) { const focus = card?.imageFocus ?? { x: 50, y: 50 }; return <><span>Character creation preview</span><article className="studio-portrait-preview studio-noble-preview"><div>{card?.portraitImage ? <img src={card.portraitImage} alt="" style={{ objectPosition: `${focus.x}% ${focus.y}%` }} /> : <b>{(names[hero.nameKey] ?? hero.id).slice(0,1)}</b>}</div><small>{hero.raceId} · {hero.startingDeck.length} starting units</small><strong>{names[hero.nameKey] ?? hero.id}</strong><i><span /></i><p>{names[hero.descriptionKey] ?? ""}</p></article><div className="studio-paths"><small>Hero card</small><code>{hero.heroCardId}</code><small>Starting deck</small><code>{hero.startingDeck.join(", ")}</code></div></> }
function NoblePreview({ noble, leader, leaderName }: { noble: NobleProfile; leader?: CardDefinition; leaderName: string }) { const focus = leader?.imageFocus ?? { x: 50, y: 50 }; return <><span>Noble audience preview</span><article className="studio-portrait-preview studio-noble-preview"><div>{leader?.portraitImage ? <img src={leader.portraitImage} alt="" style={{ objectPosition: `${focus.x}% ${focus.y}%` }} /> : <b>{noble.displayName.slice(0,1)}</b>}</div><small>{noble.factionId.replaceAll("_", " ")}</small><strong>{noble.rank.toUpperCase()} {noble.displayName}</strong><i><span /></i><p>{leaderName} · Level {noble.leaderLevel}</p></article></> }
function ItemPreview({ item, name, image, focus }: { item: ItemDefinition; name: string; image?: string; focus: {x:number;y:number} }) { return <><span>Live inventory preview</span><article className="studio-item-preview"><div>{image ? <img src={image} alt="" style={{ objectPosition: `${focus.x}% ${focus.y}%` }} /> : <b>{name.slice(0,1)}</b>}</div><small>{item.type}{item.type === "equipment" ? ` · T${item.tier} · ${item.rarity}` : ""}</small><strong>{name}</strong><p>{item.baseValue}g · {item.weight} weight</p>{item.type === "equipment" ? <><em>ATK +{item.statBonus?.atk ?? 0} · DEF +{item.statBonus?.def ?? 0}</em><small>Base drop chance {((item.dropChance ?? 0) * 100).toFixed(1)}% · Tier {item.tier} enemies only</small></> : null}</article></> }
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
  for (const noble of pack.nobles) if (!cards.has(noble.leaderCardId)) broken.push(`noble:${noble.id}:leader=${noble.leaderCardId}`);
  for (const hero of pack.heroes) for (const id of [hero.heroCardId, ...hero.startingDeck]) if (!cards.has(id)) broken.push(`hero:${hero.id}:card=${id}`);
  for (const upgrade of pack.unitUpgrades) for (const id of [upgrade.fromCardId, ...upgrade.options]) if (!cards.has(id)) broken.push(`upgrade:card=${id}`);
  for (const recipe of pack.tradeRecipes) for (const id of [recipe.inputItemId, recipe.outputItemId]) if (!items.has(id)) broken.push(`recipe:item=${id}`);
  return broken;
}
function findUpgradeProblems(pack: ContentPack): string[] {
  const cards = new Map(pack.cards.map((card) => [card.id, card])); const problems: string[] = [];
  for (const card of pack.cards) if (card.tier >= 3 && getCardEffects(card).length === 0) problems.push(`${card.id} requires an effect at Tier ${card.tier}`);
  for (const path of pack.unitUpgrades) { const source = cards.get(path.fromCardId); if (!source) continue; for (const id of path.options) { const target = cards.get(id); if (!target) continue; if (source.race !== target.race) problems.push(`${source.id} → ${target.id} changes race`); if (target.tier <= source.tier) problems.push(`${source.id} → ${target.id} does not increase tier`); } }
  return problems;
}
function findNobleProblems(pack: ContentPack): string[] {
  const problems: string[] = [];
  for (const factionId of ["ember_crown", "gloam_compact", "iron_concord"] as const) {
    const kings = pack.nobles.filter((noble) => noble.factionId === factionId && noble.rank === "king");
    if (kings.length !== 1) problems.push(`${factionId} requires exactly one king`);
  }
  return problems;
}
function fileToDataUrl(file: File): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error ?? new Error("Could not read image")); reader.readAsDataURL(file); }); }
function cropToWebp(source: string, width: number, height: number, focusX: number, focusY: number): Promise<string> { return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => { const sourceRatio = image.naturalWidth / image.naturalHeight; const targetRatio = width / height; const cropWidth = sourceRatio > targetRatio ? image.naturalHeight * targetRatio : image.naturalWidth; const cropHeight = sourceRatio > targetRatio ? image.naturalHeight : image.naturalWidth / targetRatio; const sourceX = Math.max(0, Math.min(image.naturalWidth - cropWidth, (image.naturalWidth - cropWidth) * focusX / 100)); const sourceY = Math.max(0, Math.min(image.naturalHeight - cropHeight, (image.naturalHeight - cropHeight) * focusY / 100)); const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; const context = canvas.getContext("2d"); if (!context) { reject(new Error("Canvas is unavailable")); return; } context.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, 0, 0, width, height); resolve(canvas.toDataURL("image/webp", 0.9)); }; image.onerror = () => reject(new Error("Could not decode image")); image.src = source; }); }
