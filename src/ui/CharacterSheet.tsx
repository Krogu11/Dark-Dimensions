import { useTranslation } from "react-i18next";
import {
  ATTRIBUTE_KEYS,
  SKILL_DEFINITIONS,
  characterXpNeededForNextLevel,
  type CharacterAttribute,
} from "../domain/character/CharacterProgression";
import { gameSession } from "../domain/session/GameSession";

interface CharacterSheetProps {
  onClose: () => void;
  returnToCity?: boolean;
}

export default function CharacterSheet({
  onClose,
  returnToCity = false,
}: CharacterSheetProps) {
  const { t } = useTranslation();
  const character = gameSession.characterState;
  const nextLevelXp = characterXpNeededForNextLevel(character.level);

  return (
    <div className="character-overlay">
      <main className="character-sheet">
        <header className="character-header">
          <div>
            <p className="eyebrow">{t("character.eyebrow")}</p>
            <h1>{t("character.title")}</h1>
            <p>{t("character.subtitle")}</p>
          </div>
          <div className="character-summary">
            <strong>{t("character.level", { level: character.level })}</strong>
            <span>{t("character.xp", { xp: character.xp, needed: nextLevelXp })}</span>
            <span>
              {t("character.attributePoints", {
                count: character.attributePoints,
              })}
            </span>
            <span>{t("character.skillPoints", { count: character.skillPoints })}</span>
            <button className="button ghost" onClick={onClose}>
              {t(returnToCity ? "trade.returnToCity" : "character.close")}
            </button>
          </div>
        </header>

        <section className="character-derived">
          <DerivedStat label={t("character.derived.heroHp")} value={gameSession.heroMaxHp} />
          <DerivedStat
            label={t("character.derived.mapSpeed")}
            value={gameSession.partyMovementSpeed}
          />
          <DerivedStat
            label={t("character.derived.visibility")}
            value={gameSession.visibilityRadius}
          />
          <DerivedStat
            label={t("character.derived.partySize")}
            value={gameSession.warbandCapacity}
          />
        </section>

        <section className="character-grid">
          {ATTRIBUTE_KEYS.map((attribute) => (
            <article className="attribute-panel" key={attribute}>
              <header>
                <div>
                  <small>{t(`character.attribute.${attribute}.effect`)}</small>
                  <h2>{t(`character.attribute.${attribute}.name`)}</h2>
                </div>
                <button
                  className="mini-action evolve"
                  disabled={character.attributePoints <= 0}
                  onClick={() => gameSession.spendAttribute(attribute)}
                >
                  +1
                </button>
              </header>
              <strong className="attribute-value">
                {character.attributes[attribute]}
              </strong>
              <div className="skill-list">
                {SKILL_DEFINITIONS.filter(
                  (skill) => skill.attribute === attribute,
                ).map((skill) => (
                  <button
                    key={skill.id}
                    className="skill-row"
                    disabled={
                      character.skillPoints <= 0 ||
                      character.skills[skill.id] >= skill.maxRank
                    }
                    onClick={() => gameSession.spendSkill(skill.id)}
                  >
                    <span>
                      <strong>{t(skill.nameKey)}</strong>
                      <small>{t(skill.descriptionKey)}</small>
                    </span>
                    <em>
                      {character.skills[skill.id]}/{skill.maxRank}
                    </em>
                  </button>
                ))}
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}

function DerivedStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
