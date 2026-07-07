import { useState } from "react";
import { useTranslation } from "react-i18next";

interface StartMenuProps {
  canContinue: boolean;
  hasStoredSave: boolean;
  onContinue: () => void;
  onNewGame: () => Promise<void>;
}

export function StartMenu({
  canContinue,
  hasStoredSave,
  onContinue,
  onNewGame,
}: StartMenuProps) {
  const { t } = useTranslation();
  const [confirmingNewGame, setConfirmingNewGame] = useState(false);
  const [starting, setStarting] = useState(false);

  async function startNewGame(): Promise<void> {
    if (canContinue && !confirmingNewGame) {
      setConfirmingNewGame(true);
      return;
    }
    setStarting(true);
    await onNewGame();
  }

  return (
    <section className="start-menu-overlay">
      <div className="start-menu">
        <div className="start-menu-sigil">DD</div>
        <span className="eyebrow">{t("startMenu.eyebrow")}</span>
        <h1>{t("app.title")}</h1>
        <p className="start-menu-subtitle">{t("app.subtitle")}</p>

        <div className="start-menu-actions">
          <button
            className="button primary"
            disabled={!canContinue || starting}
            onClick={onContinue}
          >
            {t("startMenu.continue")}
          </button>
          <button
            className={confirmingNewGame ? "button danger" : "button ghost"}
            disabled={starting}
            onClick={() => void startNewGame()}
          >
            {starting
              ? t("startMenu.generating")
              : confirmingNewGame
                ? t("startMenu.confirmNewGame")
                : t("startMenu.newGame")}
          </button>
          {confirmingNewGame ? (
            <button
              className="start-menu-cancel"
              disabled={starting}
              onClick={() => setConfirmingNewGame(false)}
            >
              {t("startMenu.cancel")}
            </button>
          ) : null}
        </div>

        <p className={confirmingNewGame ? "start-menu-warning visible" : "start-menu-warning"}>
          {confirmingNewGame
            ? t("startMenu.warning")
            : hasStoredSave
              ? t("startMenu.saveFound")
              : canContinue
                ? t("startMenu.activeCampaign")
              : t("startMenu.noSave")}
        </p>
      </div>
    </section>
  );
}
