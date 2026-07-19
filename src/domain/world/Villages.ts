import { contentPack } from "../../content/content";
import { createMarketProfile } from "../economy/Economy";
import type { WorldMapDefinition } from "../content/schemas";

export type VillageCondition = "normal" | "threatened" | "looted" | "recovering";

export interface VillageState {
  locationId: string;
  linkedCityId: string;
  productionItemId: string;
  population: number;
  militia: number;
  prosperity: number;
  relation: number;
  condition: VillageCondition;
  recoveryDay: number | null;
  lastHelpedWeek: number;
  recruitmentOffers?: string[];
  recruitmentRestockWeek?: number;
  elderQuest?: VillageQuest;
}

export interface VillageQuest {
  week: number;
  type: "delivery" | "night_bandits";
  status: "available" | "active" | "ready" | "completed";
  itemId: string | null;
  quantity: number;
  rewardGold: number;
  rewardRelation: number;
}

export type VillageStates = Record<string, VillageState>;

export function createVillageStates(seed: number, map: WorldMapDefinition): VillageStates {
  const villages = map.locations.filter((location) => location.type === "village");
  const cities = map.locations.filter((location) => location.type === "city");
  return Object.fromEntries(villages.map((village) => {
    const city = cities.reduce((nearest, candidate) => Math.hypot(candidate.x - village.x, candidate.y - village.y) < Math.hypot(nearest.x - village.x, nearest.y - village.y) ? candidate : nearest);
    const prosperity = clamp(24 + hash(seed, `${village.id}:prosperity`) % 53, 15, 82);
    const population = Math.round((180 + hash(seed, `${village.id}:population`) % 720) / 10) * 10;
    const militia = Math.max(8, Math.round((population * 0.055 + prosperity * 0.28) / 2) * 2);
    const productionItemId = createMarketProfile(seed, village)?.productionItemId ?? "wheat";
    return [village.id, { locationId: village.id, linkedCityId: city.id, productionItemId, population, militia, prosperity, relation: 0, condition: "normal" as const, recoveryDay: null, lastHelpedWeek: 0 }];
  }));
}

export function normalizeVillageStates(states: VillageStates | undefined, seed: number, map: WorldMapDefinition): VillageStates {
  const generated = createVillageStates(seed, map);
  for (const [id, saved] of Object.entries(states ?? {})) {
    if (!generated[id]) continue;
    generated[id] = {
      ...generated[id],
      ...saved,
      population: Math.max(0, Math.floor(saved.population)),
      militia: Math.max(0, Math.floor(saved.militia)),
      prosperity: clamp(Math.floor(saved.prosperity), 0, 100),
      relation: clamp(Math.floor(saved.relation), -100, 100),
      lastHelpedWeek: Math.max(0, Math.floor(saved.lastHelpedWeek)),
      recruitmentOffers: saved.recruitmentOffers?.filter((id) => contentPack.cards.some((card) => card.id === id && card.race === "human" && card.tier <= 2)),
    };
  }
  return generated;
}

export function ensureVillageRecruitmentOffers(village: VillageState, seed: number, day: number): string[] {
  const week = Math.floor((Math.max(1, day) - 1) / 7) + 1;
  if (village.condition === "looted") return [];
  if (village.recruitmentOffers && village.recruitmentRestockWeek === week) return village.recruitmentOffers;
  const slotCount = clamp(1 + (village.population >= 500 ? 1 : 0) + (village.prosperity >= 65 && village.relation >= 10 ? 1 : 0), 1, 3);
  const candidates = contentPack.cards.filter((card) => card.race === "human" && card.tier <= 2 && !card.id.startsWith("player_"));
  const tierTwoChance = clamp(8 + Math.floor(village.prosperity / 4) + Math.max(0, village.relation), 8, 58);
  const offers: string[] = [];
  const levy = candidates.find((card) => card.id === "village_levy");
  if (levy) offers.push(levy.id);
  for (let slot = offers.length; slot < slotCount; slot += 1) {
    const desiredTier = hash(seed, `${village.locationId}:${week}:${slot}:tier`) % 100 < tierTwoChance ? 2 : 1;
    const pool = candidates.filter((card) => card.tier === desiredTier && !offers.includes(card.id));
    const fallback = candidates.filter((card) => !offers.includes(card.id));
    const selected = pool.length ? pool : fallback;
    if (!selected.length) break;
    offers.push(selected[hash(seed, `${village.locationId}:${week}:${slot}:unit`) % selected.length].id);
  }
  village.recruitmentOffers = offers;
  village.recruitmentRestockWeek = week;
  return offers;
}

export function ensureVillageQuest(village: VillageState, seed: number, day: number): VillageQuest {
  const week = Math.floor((Math.max(1, day) - 1) / 7) + 1;
  if (village.elderQuest?.week === week) return village.elderQuest;
  const delivery = hash(seed, `${village.locationId}:${week}:elder`) % 2 === 0;
  const requested = ["iron", "wood", "wheat", "stone", "herbs"].filter((id) => id !== village.productionItemId);
  const itemId = requested[hash(seed, `${village.locationId}:${week}:item`) % requested.length];
  village.elderQuest = delivery
    ? { week, type: "delivery", status: "available", itemId, quantity: 3 + hash(seed, `${village.locationId}:${week}:quantity`) % 3, rewardGold: 30 + hash(seed, `${village.locationId}:${week}:gold`) % 24, rewardRelation: 7 }
    : { week, type: "night_bandits", status: "available", itemId: null, quantity: 0, rewardGold: 45 + hash(seed, `${village.locationId}:${week}:gold`) % 30, rewardRelation: 10 };
  return village.elderQuest;
}

export function villageProsperityLabel(value: number): string {
  if (value >= 75) return "Thriving";
  if (value >= 55) return "Comfortable";
  if (value >= 35) return "Struggling";
  return "Impoverished";
}

function hash(seed: number, key: string): number {
  let value = seed | 0;
  for (let index = 0; index < key.length; index += 1) value = Math.imul(value ^ key.charCodeAt(index), 16777619);
  return (value ^ (value >>> 16)) >>> 0;
}

function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)); }
