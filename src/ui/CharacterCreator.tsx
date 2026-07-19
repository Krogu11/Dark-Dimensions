import { useMemo, useState } from "react";
import {
  ORIGINS,
  RACES,
  TURNING_POINTS,
  UPBRINGINGS,
  getRunChoices,
  type OriginId,
  type RaceId,
  type RunProfile,
  type TurningPointId,
  type UpbringingId,
} from "../domain/character/CharacterOrigins";

type CreationStep = "identity" | "race" | "origin" | "upbringing" | "turningPoint" | "summary";
const STEPS: CreationStep[] = ["identity", "race", "origin", "upbringing", "turningPoint", "summary"];
const STEP_LABELS: Record<CreationStep, string> = { identity: "Identity", race: "Race", origin: "Origin", upbringing: "Upbringing", turningPoint: "Turning point", summary: "Begin" };

interface CharacterCreatorProps {
  onCancel: () => void;
  onConfirm: (profile: RunProfile) => Promise<void>;
}

export function CharacterCreator({ onCancel, onConfirm }: CharacterCreatorProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState("The Wanderer");
  const [raceId, setRaceId] = useState<RaceId>("human");
  const [originId, setOriginId] = useState<OriginId>("cityWard");
  const [upbringingId, setUpbringingId] = useState<UpbringingId>("artisan");
  const [turningPointId, setTurningPointId] = useState<TurningPointId>("survivor");
  const [starting, setStarting] = useState(false);
  const step = STEPS[stepIndex];
  const profile = useMemo<RunProfile>(() => ({ name: name.trim() || "The Wanderer", raceId, originId, upbringingId, turningPointId, portraitId: "wanderer", startedAt: new Date().toISOString() }), [name, raceId, originId, upbringingId, turningPointId]);
  const choices = getRunChoices(profile);

  async function confirm(): Promise<void> {
    setStarting(true);
    await onConfirm(profile);
  }

  return (
    <section className="creator-overlay">
      <header className="creator-header">
        <button onClick={onCancel} className="creator-back">← Main menu</button>
        <div><span className="eyebrow">Forge a new fate</span><h1>Who walks the shattered roads?</h1></div>
        <span className="creator-step-count">{stepIndex + 1} / {STEPS.length}</span>
      </header>
      <nav className="creator-steps">
        {STEPS.map((candidate, index) => <button key={candidate} className={index === stepIndex ? "active" : index < stepIndex ? "complete" : ""} onClick={() => index <= stepIndex && setStepIndex(index)}><span>{index + 1}</span>{STEP_LABELS[candidate]}</button>)}
      </nav>
      <div className="creator-body">
        <div className="creator-art"><div className="creator-silhouette">{profile.name.slice(0, 1).toUpperCase()}</div><span>{RACES.find((race) => race.id === raceId)?.name}</span><strong>{profile.name}</strong></div>
        <div className="creator-content">
          {step === "identity" ? <><span className="eyebrow">Name the wanderer</span><h2>Identity</h2><p>This name will be written into the history of the run.</p><label className="creator-name">Character name<input value={name} maxLength={28} autoFocus onChange={(event) => setName(event.target.value)} /></label></> : null}
          {step === "race" ? <OptionGrid title="Choose a race" intro="Other peoples remember your deeds. Meet their conditions to unlock new beginnings." options={RACES} selected={raceId} onSelect={(id) => setRaceId(id as RaceId)} /> : null}
          {step === "origin" ? <OptionGrid title="Choose an origin" intro="Where you came from changes what you carry and how you face the world." options={ORIGINS} selected={originId} onSelect={(id) => setOriginId(id as OriginId)} /> : null}
          {step === "upbringing" ? <OptionGrid title="How were you raised?" intro="Your early years left habits that no training can fully replace." options={UPBRINGINGS} selected={upbringingId} onSelect={(id) => setUpbringingId(id as UpbringingId)} /> : null}
          {step === "turningPoint" ? <OptionGrid title="What changed everything?" intro="Every journey begins with a wound, a promise, or an unanswered question." options={TURNING_POINTS} selected={turningPointId} onSelect={(id) => setTurningPointId(id as TurningPointId)} /> : null}
          {step === "summary" ? <div className="creator-summary"><span className="eyebrow">The road awaits</span><h2>{profile.name}</h2><p>Review the life that shaped your starting stats and equipment.</p><div className="summary-choices">{choices.map((choice) => <div key={choice.id}><span>{choice.name}</span><strong>{choice.effect}</strong></div>)}</div><div className="summary-warning">The current saved run is replaced only when you begin.</div></div> : null}
        </div>
      </div>
      <footer className="creator-footer"><button className="button ghost" disabled={stepIndex === 0 || starting} onClick={() => setStepIndex((value) => value - 1)}>Back</button>{step === "summary" ? <button className="button primary" disabled={starting} onClick={() => void confirm()}>{starting ? "Generating realm…" : "Begin run"}</button> : <button className="button primary" disabled={step === "identity" && name.trim().length === 0} onClick={() => setStepIndex((value) => value + 1)}>Continue</button>}</footer>
    </section>
  );
}

function OptionGrid({ title, intro, options, selected, onSelect }: { title: string; intro: string; options: Array<{ id: string; name: string; description: string; effect: string; unlocked?: boolean; unlockCondition?: string }>; selected: string; onSelect: (id: string) => void }) {
  return <><span className="eyebrow">Character history</span><h2>{title}</h2><p>{intro}</p><div className="creator-options">{options.map((option) => { const locked = option.unlocked === false; return <button key={option.id} className={selected === option.id ? "selected" : ""} disabled={locked} onClick={() => onSelect(option.id)}><span className="option-mark">{locked ? "⌑" : selected === option.id ? "◆" : "◇"}</span><span><strong>{option.name}</strong><small>{option.description}</small><em>{locked ? option.unlockCondition : option.effect}</em></span>{locked ? <b>Locked</b> : null}</button>; })}</div></>;
}
