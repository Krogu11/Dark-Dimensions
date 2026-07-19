import { contentPack } from "../../content/content";
import type { CardDefinition } from "../content/schemas";
import type { CityState } from "./Cities";

export const RECRUITMENT_RESTOCK_DAYS = 4;

export function getRecruitmentCost(card: CardDefinition): number {
  if (card.recruitCost) return card.recruitCost;
  const rarityMultiplier = card.rarity === "uncommon" ? 1.25 : card.rarity === "rare" ? 1.6 : 1;
  return Math.round((10 + card.tier * card.tier * 12) * rarityMultiplier);
}

export function ensureRecruitmentOffers(
  city: CityState,
  worldSeed: number,
  currentDay: number,
): string[] {
  if (city.recruitmentOffers && city.recruitmentRestockDay && currentDay < city.recruitmentRestockDay) {
    return city.recruitmentOffers;
  }

  const cycle = Math.floor(Math.max(0, currentDay - 1) / RECRUITMENT_RESTOCK_DAYS);
  const slotCount = Math.max(2, Math.min(5, 2 + Math.floor(city.population / 5_000) + (city.prosperity >= 70 ? 1 : 0)));
  const candidates = contentPack.cards.filter((card) => card.race === "human" && !card.id.startsWith("player_") && card.tier <= 3);
  const offers: string[] = [];

  // Every settlement can raise a levy; wealth and garrison unlock rarer specialists.
  const levy = candidates.find((card) => card.id === "village_levy");
  if (levy) offers.push(levy.id);
  for (let slot = offers.length; slot < slotCount; slot += 1) {
    const roll = hash(worldSeed, `${city.locationId}:${cycle}:${slot}:tier`) % 100;
    const tier = roll < Math.min(22, 4 + city.prosperity / 5)
      ? 3
      : roll < Math.min(68, 30 + city.garrison / 18)
        ? 2
        : 1;
    const pool = candidates.filter((card) => card.tier === tier && !offers.includes(card.id));
    const fallback = candidates.filter((card) => !offers.includes(card.id));
    const selectedPool = pool.length > 0 ? pool : fallback;
    if (selectedPool.length === 0) break;
    offers.push(selectedPool[hash(worldSeed, `${city.locationId}:${cycle}:${slot}:unit`) % selectedPool.length].id);
  }

  city.recruitmentOffers = offers;
  city.recruitmentRestockDay = (cycle + 1) * RECRUITMENT_RESTOCK_DAYS + 1;
  return offers;
}

function hash(seed: number, key: string): number {
  let value = seed | 0;
  for (let index = 0; index < key.length; index += 1) {
    value = Math.imul(value ^ key.charCodeAt(index), 16777619);
  }
  value ^= value >>> 16;
  return Math.abs(value);
}
