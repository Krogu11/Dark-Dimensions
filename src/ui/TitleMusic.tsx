import { useEffect, useRef } from "react";
import {
  musicTracks,
  publishMusicTitle,
  shuffleMusicTracks,
  type MusicTrack,
} from "./MusicPlaylist";

const MUSIC_VOLUME = 0.42;

export function TitleMusic({ active }: { active: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeRef = useRef(active);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    if (musicTracks.length === 0) return;
    const audio = new Audio();
    let queue: MusicTrack[] = [];
    let queueIndex = 0;
    let previousPath: string | null = null;
    let consecutiveErrors = 0;

    const advance = () => {
      if (queueIndex >= queue.length) {
        queue = shuffleMusicTracks(musicTracks, previousPath);
        queueIndex = 0;
      }
      const track = queue[queueIndex++];
      previousPath = track.path;
      audio.src = track.url;
      audio.load();
      publishMusicTitle(track.title);
    };
    const play = () => {
      if (!activeRef.current) return;
      void audio.play().catch(() => undefined);
    };
    const handleEnded = () => {
      consecutiveErrors = 0;
      advance();
      play();
    };
    const handleError = () => {
      consecutiveErrors += 1;
      if (consecutiveErrors >= musicTracks.length) return;
      advance();
      play();
    };

    audio.preload = "auto";
    audio.volume = 0;
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    advance();
    audioRef.current = audio;

    return () => {
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.pause();
      audio.src = "";
      audioRef.current = null;
      publishMusicTitle("");
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    let frame = 0;
    let cancelled = false;
    const fade = (target: number) => {
      if (cancelled) return;
      const delta = target - audio.volume;
      if (Math.abs(delta) < 0.015) {
        audio.volume = target;
        if (target === 0) audio.pause();
        return;
      }
      audio.volume = Math.max(
        0,
        Math.min(MUSIC_VOLUME, audio.volume + Math.sign(delta) * 0.012),
      );
      frame = window.requestAnimationFrame(() => fade(target));
    };
    if (active) {
      const begin = () => {
        void audio.play().then(() => fade(MUSIC_VOLUME)).catch(() => undefined);
      };
      begin();
      window.addEventListener("pointerdown", begin, { once: true });
      window.addEventListener("keydown", begin, { once: true });
      return () => {
        cancelled = true;
        window.cancelAnimationFrame(frame);
        window.removeEventListener("pointerdown", begin);
        window.removeEventListener("keydown", begin);
      };
    }
    fade(0);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [active]);

  return null;
}
