import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { SaveGame } from "../infrastructure/save/SaveRepository";
import { characterXpNeededForNextLevel } from "../domain/character/CharacterProgression";
import type { MetaProgressionState } from "../domain/progression/MetaProgression";
import { UnitEncyclopedia } from "./UnitEncyclopedia";

interface StartMenuProps {
  canContinue: boolean;
  activeRun: boolean;
  save: SaveGame | null;
  activeGold: number;
  activeWarbandCount: number;
  activeWarbandCapacity: number;
  notice?: string;
  metaProgression: MetaProgressionState;
  onContinue: () => void;
  onNewRun: () => void;
}

export function StartMenu({ canContinue, activeRun, save, activeGold, activeWarbandCount, activeWarbandCapacity, notice, metaProgression, onContinue, onNewRun }: StartMenuProps) {
  const { t } = useTranslation();
  const [confirmingNewRun, setConfirmingNewRun] = useState(false);
  const [encyclopediaOpen, setEncyclopediaOpen] = useState(false);
  const profile = activeRun ? undefined : save?.runProfile;
  const character = activeRun ? undefined : save?.characterState;
  const level = character?.level ?? 1;
  const xpTarget = characterXpNeededForNextLevel(level);
  const xpPercent = Math.min(100, ((character?.xp ?? 0) / xpTarget) * 100);
  const runGold = activeRun ? activeGold : (save?.gold ?? 0);
  const runWarbandCount = activeRun ? activeWarbandCount : (save?.warband?.length ?? 0);
  const runWarbandCapacity = activeRun ? activeWarbandCapacity : Math.max(5, 5 + ((save?.characterState?.attributes.charisma ?? 1) * 2) + ((save?.characterState?.skills.leadership ?? 0) * 3));

  function requestNewRun(): void {
    if (canContinue && !confirmingNewRun) {
      setConfirmingNewRun(true);
      return;
    }
    onNewRun();
  }

  return (
    <section className="start-menu-overlay" aria-label="Main menu">
      <div className="start-menu-frame">
        <div className="start-menu">
          <h1><span>Dark</span><span>Dimensions</span></h1>

          <div className="start-menu-actions">
            <button className="menu-action primary" disabled={!canContinue} onClick={onContinue}>
              <span>{t("startMenu.continue")}</span>
              <small>{activeRun ? "Return to the road" : save ? "Resume saved run" : "No run found"}</small>
            </button>
            <button className={confirmingNewRun ? "menu-action danger" : "menu-action"} onClick={requestNewRun}>
              <span>{confirmingNewRun ? "Abandon Run & Begin" : "New Run"}</span>
              <small>{confirmingNewRun ? "This cannot be undone" : "Forge another fate"}</small>
            </button>
            <button className="menu-action" onClick={() => setEncyclopediaOpen(true)}><span>{t("encyclopedia.title")}</span><small>{t("encyclopedia.menuHint")}</small></button>
            {confirmingNewRun ? (
              <button className="start-menu-cancel" onClick={() => setConfirmingNewRun(false)}>Keep current run</button>
            ) : null}
          </div>
          <p className={confirmingNewRun ? "start-menu-warning visible" : "start-menu-warning"}>
            {confirmingNewRun ? "Your current autosave will be erased only after character creation is confirmed." : notice ?? (canContinue ? "Ironman autosave ready. Death will end this run." : "No run has yet been written.")}
          </p>
        </div>

        <aside className="run-preview">
          <div className="run-preview-heading">
            <span className="eyebrow">{canContinue ? "Current fate" : "The first path"}</span>
            <span className="run-status">{activeRun ? "Active" : save ? "City save" : "Unwritten"}</span>
          </div>
          <div className="run-preview-copy">
            <h2>{profile?.name ?? (activeRun ? "The Wanderer" : "No wanderer yet")}</h2>
            <p>{profile ? `${profile.raceId} · ${profile.originId}` : "Choose who will face the shattered roads."}</p>
          </div>
          <div className="run-level">
            <div><span>Level progression</span><strong>{canContinue ? level : "—"}</strong></div>
            <div className="run-level-track"><span style={{ width: `${canContinue ? xpPercent : 0}%` }} /></div>
            <small>{canContinue ? `${character?.xp ?? 0} / ${xpTarget} XP` : "Begin a run to gain experience"}</small>
          </div>
          <div className="run-resources">
            <div><span>Gold</span><strong>{canContinue ? runGold : "—"}</strong></div>
            <div><span>Warband</span><strong>{canContinue ? `${runWarbandCount} / ${runWarbandCapacity}` : "—"}</strong></div>
          </div>
        </aside>
      </div>
      <div className="start-menu-footer"><span>v0.1 · The Shattered Realms</span><span>Music: Ashen Keep</span></div>
      {encyclopediaOpen ? <UnitEncyclopedia meta={metaProgression} onClose={() => setEncyclopediaOpen(false)} /> : null}
    </section>
  );
}
