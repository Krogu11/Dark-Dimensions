import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cardsById, contentPack } from "../content/content";
import {
  ORIGINS,
  TURNING_POINTS,
  UPBRINGINGS,
  getRunChoices,
  type OriginId,
  type RunProfile,
  type TurningPointId,
  type UpbringingId,
} from "../domain/character/CharacterOrigins";

type CreationStep = "hero" | "origin" | "upbringing" | "turningPoint" | "summary";
const STEPS: CreationStep[] = ["hero", "origin", "upbringing", "turningPoint", "summary"];
const STEP_LABELS: Record<CreationStep, string> = { hero: "Hero", origin: "Origin", upbringing: "Upbringing", turningPoint: "Turning point", summary: "Begin" };

interface CharacterCreatorProps {
  onCancel: () => void;
  onConfirm: (profile: RunProfile) => Promise<void>;
}

export function CharacterCreator({ onCancel, onConfirm }: CharacterCreatorProps) {
  const { t } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);
  const [heroId, setHeroId] = useState(contentPack.heroes[0]?.id ?? "");
  const [originId, setOriginId] = useState<OriginId>("cityWard");
  const [upbringingId, setUpbringingId] = useState<UpbringingId>("artisan");
  const [turningPointId, setTurningPointId] = useState<TurningPointId>("survivor");
  const [starting, setStarting] = useState(false);
  const step = STEPS[stepIndex];
  const hero = contentPack.heroes.find((entry) => entry.id === heroId) ?? contentPack.heroes[0];
  const heroCard = hero ? cardsById.get(hero.heroCardId) : undefined;
  const profile = useMemo<RunProfile>(() => ({
    heroId: hero?.id,
    name: hero ? t(hero.nameKey) : "The Wanderer",
    raceId: hero?.raceId ?? "human",
    originId,
    upbringingId,
    turningPointId,
    portraitId: hero?.heroCardId ?? "player_wanderer",
    startedAt: new Date().toISOString(),
  }), [hero, originId, t, turningPointId, upbringingId]);
  const choices = getRunChoices(profile);

  async function confirm(): Promise<void> {
    setStarting(true);
    await onConfirm(profile);
  }

  return <section className="creator-overlay">
    <header className="creator-header"><button onClick={onCancel} className="creator-back">← Main menu</button><div><span className="eyebrow">Forge a new fate</span><h1>Choose who walks the shattered roads</h1></div><span className="creator-step-count">{stepIndex + 1} / {STEPS.length}</span></header>
    <nav className="creator-steps">{STEPS.map((candidate, index) => <button key={candidate} className={index === stepIndex ? "active" : index < stepIndex ? "complete" : ""} onClick={() => index <= stepIndex && setStepIndex(index)}><span>{index + 1}</span>{STEP_LABELS[candidate]}</button>)}</nav>
    <div className={`creator-body${step === "hero" ? " hero-step-body" : ""}`}>
      {step !== "hero" ? <div className="creator-art hero-creator-art">{heroCard?.portraitImage ? <img src={heroCard.portraitImage} alt="" style={{ objectPosition: `${heroCard.imageFocus?.x ?? 50}% ${heroCard.imageFocus?.y ?? 50}%` }} /> : <div className="creator-silhouette">?</div>}<span>{hero?.raceId ?? "human"}</span><strong>{profile.name}</strong><small>{hero ? t(hero.descriptionKey) : ""}</small></div> : null}
      <div className="creator-content">
        {step === "hero" ? <HeroGrid selected={heroId} onSelect={setHeroId} /> : null}
        {step === "origin" ? <OptionGrid title="Choose an origin" intro="Where this hero came from changes what they carry and how they face the world." options={ORIGINS} selected={originId} onSelect={(id) => setOriginId(id as OriginId)} /> : null}
        {step === "upbringing" ? <OptionGrid title="How were they raised?" intro="Their early years left habits that no training can fully replace." options={UPBRINGINGS} selected={upbringingId} onSelect={(id) => setUpbringingId(id as UpbringingId)} /> : null}
        {step === "turningPoint" ? <OptionGrid title="What changed everything?" intro="Every journey begins with a wound, a promise, or an unanswered question." options={TURNING_POINTS} selected={turningPointId} onSelect={(id) => setTurningPointId(id as TurningPointId)} /> : null}
        {step === "summary" ? <div className="creator-summary"><span className="eyebrow">The road awaits</span><h2>{profile.name}</h2><p>Review the hero, starting warband and history that shape this run.</p><div className="summary-choices"><div><span>Hero</span><strong>{hero ? t(hero.descriptionKey) : ""}</strong></div><div><span>Starting warband</span><strong>{hero?.startingDeck.map((cardId) => t(cardsById.get(cardId)?.nameKey ?? cardId)).join(" · ")}</strong></div>{choices.slice(1).map((choice) => <div key={choice.id}><span>{choice.name}</span><strong>{choice.effect}</strong></div>)}</div><div className="summary-warning">The current saved run is replaced only when you begin.</div></div> : null}
      </div>
    </div>
    <footer className="creator-footer"><button className="button ghost" disabled={stepIndex === 0 || starting} onClick={() => setStepIndex((value) => value - 1)}>Back</button>{step === "summary" ? <button className="button primary" disabled={starting || !hero} onClick={() => void confirm()}>{starting ? "Generating realm…" : "Begin run"}</button> : <button className="button primary" disabled={!hero} onClick={() => setStepIndex((value) => value + 1)}>Continue</button>}</footer>
  </section>;
}

function HeroGrid({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  const { t } = useTranslation();
  return <><span className="eyebrow">Choose your champion</span><h2>Heroes</h2><p>Each hero has a fixed identity, a unique leader card and a different starting warband.</p><div className="hero-choice-grid">{contentPack.heroes.map((hero) => { const card = cardsById.get(hero.heroCardId); return <button key={hero.id} className={selected === hero.id ? "selected" : ""} onClick={() => onSelect(hero.id)}>{card?.portraitImage ? <img src={card.portraitImage} alt="" style={{ objectPosition: `${card.imageFocus?.x ?? 50}% ${card.imageFocus?.y ?? 50}%` }} /> : <span className="hero-choice-placeholder">?</span>}<span className="hero-choice-copy"><small>{hero.raceId}</small><strong>{t(hero.nameKey)}</strong><em>{t(hero.descriptionKey)}</em><b>{hero.startingDeck.length} starting units</b></span></button>; })}</div></>;
}

function OptionGrid({ title, intro, options, selected, onSelect }: { title: string; intro: string; options: Array<{ id: string; name: string; description: string; effect: string }>; selected: string; onSelect: (id: string) => void }) {
  return <><span className="eyebrow">Character history</span><h2>{title}</h2><p>{intro}</p><div className="creator-options">{options.map((option) => <button key={option.id} className={selected === option.id ? "selected" : ""} onClick={() => onSelect(option.id)}><span className="option-mark">{selected === option.id ? "◆" : "◇"}</span><span><strong>{option.name}</strong><small>{option.description}</small><em>{option.effect}</em></span></button>)}</div></>;
}
