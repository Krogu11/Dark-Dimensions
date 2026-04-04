# Dark Dimensions – Project Memory

## 1. Core Vision
- Spielidee: Dark-Fantasy-Kartenkampfspiel mit Roguelike-/Campaign-Struktur, in dem der Spieler Dungeons, Weltkarte und Bossketten durchspielt, Karten verdient und sein Deck laufend verbessert.
- Genre: Singleplayer Card Battler / Deckbuilder mit Roguelike-Run, Worldmap-Navigation und Auto-verwalteter Gegner-KI.
- Zielgefühl / Experience: Düster, druckvoll, belohnend. Kämpfe sollen schnell lesbar, aber taktisch sein. Fusionen, Synergien und starke Bosskämpfe sind der Power-Fantasy-Kern.

## 2. Game Design
### 2.1 Core Gameplay Loop
- Save-Slot wählen → Kampagne starten → Weltenkarte erkunden → Story/Hub/Dungeon betreten → Node-Kämpfe absolvieren → Drop-Karte wählen → Deck verbessern → Boss besiegen → Fortschritt permanent sichern → nächste Orte/Akte freischalten.
- Alternative Schleife: Freies Duell gegen bereits besiegte Gegner für wiederholbare Karten-Drops und Sammlungsausbau.
- Meta-Fortschritt: `DS` bleiben permanent im Slot; Karten aus Kampagnen-Runs werden erst nach Boss-Sieg permanent committed; Free-Duel- und Hauptmenü-Shop-Karten gehen direkt in die Sammlung.

### 2.2 Kartensystem
- Kartentypen: Monster, Zauber, Fallen, Fusionen, Spielfeldkarten.
- Mechaniken: Monster haben ATK/DEF, Rasse, Seltenheit, optionale Effekte; Zauber/Fallen lösen direkte Effekte aus; Spielfeldkarten wirken global auf beide Seiten; Deckgröße im Editor: 15 bis 20 Karten, max. 3 Kopien pro Karte.
- Fusionen: 2 Materialien ergeben definierte Fusionen; Hand+Hand und Feld+Hand sind möglich; Fusionen zählen mit zur Beschwörungsgrenze; Evolutionsketten und Cross-Race-Fusionen sind fester Kern des Systems; Fusionsergebnisse sind aktuell immer Monster.

### 2.3 Progression
- Es gibt 3 Kern-Akte: Akt I `Der Dunkle Wald`, Akt II `Die Verfluchten Ruinen`, Akt III `Die Dunkle Dimension`.
- Gegner und Drops werden über besiegte Kämpfe freigeschaltet; Bosse schalten den nächsten Akt frei.
- Save-Slots speichern: DS, Kartensammlung, Base-Deck, freigeschaltete Akte, besiegte Gegner, Free-Duel-Record, World-Progress.
- Kampagnen-Runs haben Permadeath: Bei Niederlage gehen ungecommitete Run-Karten verloren, DS bleiben.

### 2.4 Kampfsystem
- Rundenphasen: Draw → Main → Battle → End.
- Spieler: Standard 2 Beschwörungen pro Runde, konfigurierbar über Editor.
- Tribute-/Level-System ist entfernt; Monster sind frei beschwörbar.
- Beschwörungen nutzen ein Modal für Angriffs- oder Verteidigungsmodus.
- Kampfregeln: ATK vs ATK verursacht Differenzschaden und zerstört den Verlierer. ATK vs DEF zerstört den Verteidiger ohne LP-Schaden, wenn ATK >= DEF; sonst erleidet der Angreifer Rückstoß-Schaden.
- Fallen liegen verdeckt in 3 Spell/Trap-Slots; Spielfeld hat 5 Monster-Slots pro Seite plus 3 ST-Slots.
- Gegner-KI ist stark ausgebaut: Lethal-Checks, Support-Targeting, Effektbewertung, Fusion-Hold, dynamische Moduswechsel, behavior-spezifisches Angriffsmuster.

## 3. World & Lore
- Weltbeschreibung: Eine düstere Dimensionen-Welt aus verdorbenen Wäldern, verfluchten Ruinen, Maschinenorten, Schattenzonen und finalen göttlichen Bossräumen.
- Fraktionen: Kobolde, Orks, Dämonen, Drachen, Untote, Menschen, Bestien, Maschinen, Schattenwesen, Elementare.
- Story (Kurzfassung): Der Spieler kämpft sich durch aufeinanderfolgende dunkle Regionen, besiegt Stammesführer, Beschwörer, Chaos-Herrscher und Elementarkönige und stellt sich am Ende dem `Gott der Dunklen Dimension`. Die Worldmap unterstützt Story-Orte, Lager und Dungeons, aber konkrete Story-Texte liegen aktuell editorgetrieben vor und nicht fest im Repo.

## 4. Systems & Features
- Decksystem: Base-Deck pro Save-Slot, Deck-Editor im Spiel, Pool aus Starterkarten plus Sammlung, max. 3 Kopien pro Karte.
- Shop: Zwei Modi. Im Run-Shop gehen Käufe ins Run-Deck. Im Hauptmenü-/Hub-Shop gehen Käufe direkt in die persistente Sammlung. Bezahlt wird mit `DS`.
- KI-Verhalten: Behaviors wie `swarm`, `aggressive`, `control`, `tank`, `boss_balanced`, `boss_aggro`, `final_boss`; Gegner können Startfeld, Startfallen, Start-Spielfeldkarte, Summon-Limits und Mehrfachangriffe haben.
- Währungen: `Dimensionsseelen (DS)` sind die einzige persistente Währung. Kartenentfernung und Shop-Preise sind konfigurierbar.

## 5. UI / UX Prinzipien
- Starke Screen-Struktur: Title, Main Menu, Free Duel, Worldmap, Hub, Story, Dungeon-Map, Battle, Reward, Shop, Rest, Game Over, Victory.
- Kämpfe sollen auf einen Blick lesbar sein: Gegner links, Phase mittig, Spieler rechts; links Preview/Synergien/Log, Mitte Board, rechts Aktionen.
- Spieleraktionen sind bewusst direkt: Klick für Auswahl/Beschwörung, Rechtsklick für Mode-Switch, klar beschriftete Buttons für Phasen, Fusion, Deck und Shop.
- Feedback ist wichtig: Kampf-Log, Save-Toast, Reward-Animationen, Slot-Zusammenfassungen, Drop-Chance-Modal.
- Worldmap folgt einem klaren Regelwerk: freigeschaltete, besuchte, abgeschlossene und gesperrte Orte sind visuell unterscheidbar.

## 6. Art & Style Guide
- Stil: Dark Fantasy mit Arcade-/TCG-Lesbarkeit. UI nutzt Kontrastfarben für Kartentypen, Raritäten, Node-Typen und Bossstatus.
- Referenzen: Klassische Duel-Monster-Struktur, Roguelike-Node-Map, düstere Fantasy-Bossprogression.
- No-Gos: Unlesbare Kampffelder, zu komplexe Tribute-Regeln, versteckte Kernsysteme, unscharfe Progression ohne visuelle Zustände.

## 7. Sound & Musik
- Audio ist vorhanden und editor-konfigurierbar.
- Es gibt getrennte Playlists für Menü, Kampagne und ruhig/Story.
- Repo enthält aktuell mindestens `cursed-data-duel.mp3` und `shadow-sigil-–-title-screen-theme.mp3`.
- Musikwechsel wird je nach Screen gesetzt: Menü für Title/Main/Free Duel, Kampagne für Worldmap/Dungeons/Battles, Story für Hub/Dialog.

## 8. Tech Stack
- Technologien: Vanilla HTML, CSS und JavaScript ohne Build-Step; GSAP via CDN für Animationen; localStorage für Saves und Editor-Overrides.
- Struktur: `index.html` als Spiel-Entry, `editor.html` als Ingame-Content-Editor, `js/data` für Karten/Gegner/Map-Grunddaten, `js/core` für State/Engine/AI/Save/Systems, `js/ui` für Screen-Rendering.
- Besonderheiten: `DD_CUSTOM` in localStorage ist zentral. Acts, Worldmap, Config, Rezepte, Gegner-Overrides, Starterdeck und Synergien werden darüber gespeichert. `MAP_DATA` ist im Repo leer; ohne `DD_CUSTOM.acts` und praktisch auch ohne `DD_CUSTOM.worldMap` ist die Kampagne nicht vollständig spielbar. Das Projekt hat außerdem sichtbare Encoding-Probleme in mehreren Dateien.

## 9. Regeln & Designprinzipien
- Single Source of Truth für Laufzeit-Content ist aktuell `DD_CUSTOM` plus Code-Baseline; diese `memory.md` wird die dokumentarische Single Source of Truth.
- Kampfklarheit vor Simulationskomplexität.
- Boss-Siege committen Fortschritt; normale Kämpfe allein nicht.
- Fusionen, Rassen und Effekte sind Hauptidentität des Spiels und dürfen nicht zu Nebensystemen degradiert werden.
- Worldmap ist strikt datengetrieben: keine Hardcode-Fallback-Acts, keine stillen Defaults für fehlende Kampagnen-Daten.
- Save-Slots und Permadeath sind Kern des Spannungsbogens; DS bleiben bewusst permanent.

## 10. Offene ToDos
- `DD_CUSTOM`-Inhalte aus localStorage in versionierte Repo-Daten überführen oder exportierte JSON-Datei mitliefern, damit das Projekt ohne lokalen Editor-Zustand vollständig startbar ist.
- Eine echte, versionierte Worldmap- und Act-Konfiguration ins Projekt übernehmen.
- Lore- und Story-Texte aus dem Editor verbindlich definieren und dokumentieren.
- Encoding-Probleme in mehreren `.js`-Dateien bereinigen.
- Prüfen, ob Shop-Preis-Defaults und Editor-Defaults konsistent sind.
- Optional: `memory.md` künftig bei Systemänderungen direkt mitpflegen.

## 11. Entscheidungslog (wichtig!)
- 2026-03-29 – Kampfsystem repariert – Kernkampf wurde stabilisiert, damit der Run-Loop zuverlässig spielbar bleibt.
- 2026-03-29 – Fusionsergebnisse sind jetzt immer Monster – Fusionen wurden auf beschwörbare Kampfergebnisse vereinheitlicht und damit im Combat-Loop klarer gemacht.
- 2026-04-04 – Version 1.0 erstellt – Projektstand wurde als `Version 1.0` markiert.
- 2026-04-04 – Projekt-Gedächtnis als `memory.md` eingeführt – Zentrale, dauerhafte Dokumentation für Design-, Technik- und Fortschrittswissen geschaffen.
- 2026-04-04 – `memory.md` als Single Source of Truth festgelegt – Neue Entscheidungen sollen hier dokumentiert und veraltete Punkte überschrieben statt angehäuft werden.
