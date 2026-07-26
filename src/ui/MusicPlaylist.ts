export interface MusicTrack {
  path: string;
  title: string;
  url: string;
}

const discoveredMusic = import.meta.glob(
  "/assets/source/music/*.{mp3,ogg,wav,m4a,aac,flac,opus}",
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;

export const musicTracks: MusicTrack[] = Object.entries(discoveredMusic)
  .map(([path, url]) => ({
    path,
    title: musicTitleFromPath(path),
    url,
  }))
  .sort((left, right) => left.path.localeCompare(right.path));

let currentTrackTitle = "";
const titleListeners = new Set<(title: string) => void>();

export function musicTitleFromPath(path: string): string {
  const filename = path.split("/").at(-1) ?? path;
  return filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
}

export function shuffleMusicTracks(
  tracks: MusicTrack[],
  previousPath: string | null = null,
  random: () => number = Math.random,
): MusicTrack[] {
  const shuffled = [...tracks];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  if (shuffled.length > 1 && shuffled[0].path === previousPath) {
    const swapIndex = 1 + Math.floor(random() * (shuffled.length - 1));
    [shuffled[0], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[0]];
  }
  return shuffled;
}

export function publishMusicTitle(title: string): void {
  currentTrackTitle = title;
  for (const listener of titleListeners) listener(title);
}

export function subscribeMusicTitle(listener: (title: string) => void): () => void {
  titleListeners.add(listener);
  listener(currentTrackTitle);
  return () => titleListeners.delete(listener);
}
