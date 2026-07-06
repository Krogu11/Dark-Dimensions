export interface GameTimeState {
  totalMinutes: number;
}

export const INITIAL_GAME_MINUTES = 8 * 60;

export function createGameTimeState(): GameTimeState {
  return { totalMinutes: INITIAL_GAME_MINUTES };
}

export function getGameDay(time: GameTimeState): number {
  return Math.floor(time.totalMinutes / 1440) + 1;
}

export function getGameHour(time: GameTimeState): number {
  return Math.floor((time.totalMinutes % 1440) / 60);
}

export function getGameMinute(time: GameTimeState): number {
  return Math.floor(time.totalMinutes % 60);
}

export function isNightTime(time: GameTimeState): boolean {
  const hour = getGameHour(time);
  return hour < 6 || hour >= 20;
}

export function formatGameTime(time: GameTimeState): string {
  const hour = getGameHour(time).toString().padStart(2, "0");
  const minute = getGameMinute(time).toString().padStart(2, "0");
  return `${hour}:${minute}`;
}
