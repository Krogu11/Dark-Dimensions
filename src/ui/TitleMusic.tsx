import { useEffect, useRef } from "react";

export function TitleMusic({ active }: { active: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const audio = new Audio("/assets/music/ashen-keep.mp3");
    audio.loop = true;
    audio.volume = 0;
    audioRef.current = audio;
    return () => { audio.pause(); audio.src = ""; audioRef.current = null; };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    let frame = 0;
    let cancelled = false;
    const fade = (target: number) => {
      if (cancelled) return;
      const delta = target - audio.volume;
      if (Math.abs(delta) < 0.015) { audio.volume = target; if (target === 0) audio.pause(); return; }
      audio.volume = Math.max(0, Math.min(0.42, audio.volume + Math.sign(delta) * 0.012));
      frame = window.requestAnimationFrame(() => fade(target));
    };
    if (active) {
      const begin = () => { void audio.play().then(() => fade(0.42)).catch(() => undefined); };
      begin();
      window.addEventListener("pointerdown", begin, { once: true });
      window.addEventListener("keydown", begin, { once: true });
      return () => { cancelled = true; window.cancelAnimationFrame(frame); window.removeEventListener("pointerdown", begin); window.removeEventListener("keydown", begin); };
    }
    fade(0);
    return () => { cancelled = true; window.cancelAnimationFrame(frame); };
  }, [active]);
  return null;
}
