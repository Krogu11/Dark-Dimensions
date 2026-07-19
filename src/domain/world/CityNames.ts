const PREFIXES = [
  "Ash", "Black", "Briar", "Cinder", "Cold", "Crow", "Dawn", "Dread",
  "Ember", "Fallow", "Frost", "Gloam", "Grey", "Hallow", "Hollow", "Iron",
  "Mist", "Mourn", "Night", "Oak", "Raven", "Red", "Silver", "Stone",
  "Storm", "Thorn", "White", "Willow", "Winter", "Wolf",
] as const;

const SUFFIXES = [
  "barrow", "bridge", "brook", "cliff", "cross", "fall", "fen", "field",
  "ford", "gate", "guard", "haven", "hold", "keep", "marsh", "mere",
  "moor", "reach", "rest", "ridge", "spire", "stead", "vale", "wall",
  "watch", "water", "wick", "wood",
] as const;

const RARE_NAMES = ["Turnipwatch", "Mudbucket"] as const;

export function generateUniqueCityName(
  random: () => number,
  usedNames: Set<string>,
): string {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const rare = random() < 0.006;
    const candidate = rare
      ? RARE_NAMES[Math.floor(random() * RARE_NAMES.length)]
      : `${PREFIXES[Math.floor(random() * PREFIXES.length)]}${SUFFIXES[Math.floor(random() * SUFFIXES.length)]}`;
    if (usedNames.has(candidate)) continue;
    usedNames.add(candidate);
    return candidate;
  }

  const fallback = `Wayhold ${usedNames.size + 1}`;
  usedNames.add(fallback);
  return fallback;
}

