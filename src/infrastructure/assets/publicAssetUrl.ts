export function publicAssetUrl(path: string): string {
  if (!path.startsWith("/assets/")) return path;
  return `${import.meta.env.BASE_URL}${path.slice(1)}`;
}

export function resolvePublicAssetUrls<T>(value: T): T {
  if (typeof value === "string") return publicAssetUrl(value) as T;
  if (Array.isArray(value)) return value.map(resolvePublicAssetUrls) as T;
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, resolvePublicAssetUrls(entry)]),
  ) as T;
}
