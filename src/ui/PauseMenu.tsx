interface PauseMenuProps {
  onResume: () => void;
  onMainMenu: () => void;
}

export function PauseMenu({ onResume, onMainMenu }: PauseMenuProps) {
  return <section className="pause-overlay"><div className="pause-menu"><span className="eyebrow">The road is still</span><h1>Paused</h1><p>Ironman mode is active. Progress is saved automatically.</p><div><button className="menu-action primary" onClick={onResume}><span>Resume</span><small>Return to the realm</small></button><button className="menu-action" onClick={onMainMenu}><span>Main Menu</span><small>Your latest autosave remains available</small></button></div></div></section>;
}
