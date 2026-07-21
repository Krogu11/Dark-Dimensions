import type { WorldMapDefinition } from "../content/schemas";

export interface CityState {
  locationId: string;
  population: number;
  garrison: number;
  prosperity: number;
  lordId: string | null;
  recruitmentOffers?: string[];
  recruitmentRestockDay?: number;
}

export type CityStates = Record<string, CityState>;

export function createCityStates(seed: number, map: WorldMapDefinition): CityStates {
  const cities = map.locations.filter((location) => location.type === "city" || location.type === "soulTemple");
  const villages = map.locations.filter((location) => location.type === "village");
  return Object.fromEntries(cities.map((city) => {
    const nearbyVillages = villages.filter((village) =>
      Math.hypot(village.x - city.x, village.y - city.y) < 1750,
    ).length;
    const prosperity = clamp(28 + roll(seed, `${city.id}:prosperity`, 48) + nearbyVillages * 3, 18, 92);
    const population = Math.round((1500 + roll(seed, `${city.id}:population`, 10500) + nearbyVillages * 780) / 50) * 50;
    const garrison = Math.round((90 + roll(seed, `${city.id}:garrison`, 620) + prosperity * 3.2) / 5) * 5;
    return [city.id, { locationId: city.id, population, garrison, prosperity, lordId: null }];
  }));
}

export function normalizeCityStates(
  states: CityStates | undefined,
  seed: number,
  map: WorldMapDefinition,
): CityStates {
  const generated = createCityStates(seed, map);
  for (const [locationId, state] of Object.entries(states ?? {})) {
    if (!generated[locationId]) continue;
    generated[locationId] = {
      locationId,
      population: Math.max(0, Math.floor(state.population)),
      garrison: Math.max(0, Math.floor(state.garrison)),
      prosperity: clamp(Math.floor(state.prosperity), 0, 100),
      lordId: state.lordId ?? null,
      recruitmentOffers: Array.isArray(state.recruitmentOffers)
        ? state.recruitmentOffers.filter((id): id is string => typeof id === "string")
        : undefined,
      recruitmentRestockDay: Number.isFinite(state.recruitmentRestockDay)
        ? Math.max(1, Math.floor(state.recruitmentRestockDay!))
        : undefined,
    };
  }
  return generated;
}

export function prosperityLabel(value: number): string {
  if (value >= 80) return "Flourishing";
  if (value >= 60) return "Prosperous";
  if (value >= 40) return "Stable";
  if (value >= 20) return "Poor";
  return "Destitute";
}

function roll(seed: number, key: string, range: number): number {
  let value = seed | 0;
  for (let index = 0; index < key.length; index += 1) {
    value = Math.imul(value ^ key.charCodeAt(index), 16777619);
  }
  value ^= value >>> 16;
  return Math.abs(value) % range;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
