import { useEffect } from "react";
import { publicAssetUrl } from "../infrastructure/assets/publicAssetUrl";

export type UiSoundId =
  | "buy-sell"
  | "cancel-1"
  | "cancel-2"
  | "claw"
  | "confirm"
  | "cursor"
  | "enemy-death"
  | "error"
  | "select";

const PLAY_UI_SOUND_EVENT = "dark-dimensions:play-ui-sound";

const UI_SOUND_PATHS: Record<UiSoundId, string> = {
  "buy-sell": publicAssetUrl("/assets/audio/gameplay/buy-sell.wav"),
  "cancel-1": publicAssetUrl("/assets/audio/ui/wood-cancel-1.wav"),
  "cancel-2": publicAssetUrl("/assets/audio/ui/wood-cancel-2.wav"),
  claw: publicAssetUrl("/assets/audio/gameplay/claw.wav"),
  confirm: publicAssetUrl("/assets/audio/ui/wood-confirm.wav"),
  cursor: publicAssetUrl("/assets/audio/ui/wood-cursor.wav"),
  "enemy-death": publicAssetUrl("/assets/audio/gameplay/enemy-death.wav"),
  error: publicAssetUrl("/assets/audio/ui/wood-error.wav"),
  select: publicAssetUrl("/assets/audio/ui/wood-select.wav"),
};

const UI_SOUND_VOLUMES: Record<UiSoundId, number> = {
  "buy-sell": 0.42,
  "cancel-1": 0.34,
  "cancel-2": 0.34,
  claw: 0.48,
  confirm: 0.38,
  cursor: 0.2,
  "enemy-death": 0.48,
  error: 0.34,
  select: 0.3,
};

export function playUiSound(soundId: UiSoundId): void {
  document.dispatchEvent(new CustomEvent<UiSoundId>(PLAY_UI_SOUND_EVENT, { detail: soundId }));
}

const BUTTON_SELECTOR = "button, [role='button'], a.button";
const CANCEL_PATTERN = /\b(back|cancel|close|decline|dismiss|end audience|keep current|leave|main menu|return)\b/i;
const CONFIRM_PATTERN = /\b(accept|apply|begin|buy|claim|confirm|continue|deliver|enter|equip|heal|join|recruit|save|sell|start|trade|upgrade|use|validate)\b/i;

function findButton(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(BUTTON_SELECTOR) : null;
}

function isDisabled(button: HTMLElement): boolean {
  return (button instanceof HTMLButtonElement && button.disabled) || button.getAttribute("aria-disabled") === "true";
}

function getRequestedSound(button: HTMLElement): UiSoundId | "none" | null {
  const requested = button.dataset.uiSound;
  if (requested === "none") return "none";
  return requested && requested in UI_SOUND_PATHS ? requested as UiSoundId : null;
}

function getInteractionSound(button: HTMLElement, cancelIndex: number): UiSoundId | null {
  const requested = getRequestedSound(button);
  if (requested === "none") return null;
  if (requested) return requested;
  if (isDisabled(button)) return "error";

  const description = [
    button.className,
    button.getAttribute("aria-label") ?? "",
    button.textContent ?? "",
  ].join(" ");
  if (CANCEL_PATTERN.test(description)) return cancelIndex % 2 === 0 ? "cancel-1" : "cancel-2";
  if (button.classList.contains("primary") || CONFIRM_PATTERN.test(description)) return "confirm";
  return "select";
}

export function UiSoundEffects() {
  useEffect(() => {
    const sounds = new Map<UiSoundId, HTMLAudioElement>();
    for (const [soundId, path] of Object.entries(UI_SOUND_PATHS) as Array<[UiSoundId, string]>) {
      const audio = new Audio(path);
      audio.preload = "auto";
      audio.volume = UI_SOUND_VOLUMES[soundId];
      sounds.set(soundId, audio);
    }

    let cancelIndex = 0;
    let lastHoveredButton: HTMLElement | null = null;

    const play = (soundId: UiSoundId) => {
      const audio = sounds.get(soundId);
      if (!audio) return;
      audio.pause();
      audio.currentTime = 0;
      void audio.play().catch(() => undefined);
    };

    const handlePointerOver = (event: PointerEvent) => {
      const button = findButton(event.target);
      if (!button || button === lastHoveredButton || isDisabled(button)) return;
      if (event.relatedTarget instanceof Node && button.contains(event.relatedTarget)) return;
      lastHoveredButton = button;
      play("cursor");
    };

    const handlePointerOut = (event: PointerEvent) => {
      const button = findButton(event.target);
      if (!button || event.relatedTarget instanceof Node && button.contains(event.relatedTarget)) return;
      if (lastHoveredButton === button) lastHoveredButton = null;
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const button = findButton(event.target);
      if (!button) return;
      const soundId = getInteractionSound(button, cancelIndex);
      if (!soundId) return;
      if (soundId === "cancel-1" || soundId === "cancel-2") cancelIndex += 1;
      play(soundId);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const button = findButton(event.target);
      if (!button || event.repeat) return;
      const soundId = getInteractionSound(button, cancelIndex);
      if (!soundId) return;
      if (soundId === "cancel-1" || soundId === "cancel-2") cancelIndex += 1;
      play(soundId);
    };

    const handleRequestedSound = (event: Event) => {
      const soundId = (event as CustomEvent<UiSoundId>).detail;
      if (soundId in UI_SOUND_PATHS) play(soundId);
    };

    document.addEventListener("pointerover", handlePointerOver, true);
    document.addEventListener("pointerout", handlePointerOut, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener(PLAY_UI_SOUND_EVENT, handleRequestedSound);

    return () => {
      document.removeEventListener("pointerover", handlePointerOver, true);
      document.removeEventListener("pointerout", handlePointerOut, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener(PLAY_UI_SOUND_EVENT, handleRequestedSound);
      for (const audio of sounds.values()) {
        audio.pause();
        audio.src = "";
      }
    };
  }, []);

  return null;
}
