Dark Dimensions – Project Memory (Updated)
1. Core Vision

Spielidee:
Dark-Fantasy-Kartenkampfspiel mit Worldmap-basierter Kampagne. Der Spieler reist zwischen Orten, erlebt Story, bestreitet Dungeons und baut sein Deck durch Kämpfe und Meta-Fortschritt auf.

Genre:
Singleplayer Card Battler / Deckbuilder mit Worldmap-Progression + Roguelike-Elementen

Core Feeling:
Düster, strategisch, belohnend
→ „Stark werden durch Synergien, nicht durch Grinding“

2. Game Design
2.1 Core Gameplay Loop

Kampagne:

Save-Slot wählen
Worldmap starten
Story / Hub / Dungeon betreten
Dungeon absolvieren (Node-System)
Kämpfe gewinnen → Karten erhalten
Deck verbessern
Boss besiegen → Fortschritt committen
Neue Orte freischalten

WICHTIG (korrigiert):

❌ Kein klassischer „Run durch mehrere Acts“
✅ Worldmap mit freier Bewegung + Pflicht-Dungeons
2.2 Meta-Progression (KORRIGIERT)

Dimensionsseelen (DS)
→ einzige Währung

+1 DS pro zerstörtes Monster
Bleiben immer erhalten (Meta-State)
Werden direkt gespeichert (kein Hub nötig)

Karten:

Kampagne:
Karten sind temporär, bis Boss besiegt
Free Duel / Shop:
Karten gehen direkt in Sammlung
2.3 Kartensystem
Typen:
Monster
Zauber
Fallen
Spielfeldkarten
Fusionen
Regeln:
15–20 Karten pro Deck
max. 3 Kopien
keine Tribute / Level
2.4 Fusionen
Hand + Hand
Feld + Hand
Immer Ergebnis = Monster
Fokus:
Synergien
Evolutionsketten
Cross-Race Builds
2.5 Kampfsystem

Phasen:

Draw → Main → Battle → End

Mechaniken:

ATK vs ATK → Schaden + Zerstörung
ATK vs DEF → kein Schaden (wenn DEF hält)

Board:

5 Monster Slots
3 Spell/Trap Slots
2.6 KI-System (sehr wichtig)

Die KI ist strategisch, nicht zufällig:

nutzt Fusionen aktiv
priorisiert:
Buff-Monster zerstören
stärkste Gegner eliminieren
maximalen LP-Schaden

Features:

Lethal Check
Dynamic Recalculation nach jedem Angriff
Risk Assessment (keine schlechten Trades)
3. World System (WICHTIG – stark verändert)
3.1 Worldmap (zentraler Kern)
Knotenbasierte Map
Spieler bewegt sich zwischen Orten

Ortstypen:

Story
Hub
Dungeon
3.2 Bewegungsregeln (KRITISCH)
Story / Hub → frei betretbar
Dungeon → muss gespielt werden

Kein Durchlaufen!

Nach Dungeon:
kein sofortiger Rücktritt möglich
Keine Schnellreise
3.3 Progression
Orte haben:
Verbindungen
Unlock Conditions
3.4 Beispiel-Flow

Start → Story
→ Anfangslager (Hub)
→ Flussweg (Dungeon)
→ Dorf (Hub + Story)
→ mehrere Dungeons zur Auswahl

4. Save-System (KRITISCH)
4.1 Grundprinzip

Speichern nur an Hubs

4.2 Zwei Zustände
Save-State (persistent)
Position
Deck
Sammlung
Fortschritt
Run-State (temporär)
alles innerhalb eines Runs
4.3 Verhalten

Bei:

Tod
Aufgeben
Spiel schließen

→ Reset auf letzten Save

4.4 Ausnahme

DS werden IMMER gespeichert

4.5 Auto-Save Regeln
Kartenkauf → Auto-Save
Free Duel Sieg → Auto-Save
Kampagne → KEIN Auto-Save
5. Rewardsystem (vereinfacht)
❌ Keine Ränge mehr
✅ Eine Drop-Tabelle mit Gewichtung
6. Shopsystem
Währung: DS
Zwei Arten:
Hub Shop
Main Menu Shop
7. UI / UX Prinzipien
Klar, schnell lesbar
Kein Overengineering

Wichtig:

Save-Feedback („Spiel gespeichert“)
klare Zustände (Map, Kampf etc.)
8. Musiksystem (neu!)
Playlists statt Track-Wechsel

3 Playlists:

Menü
Kampagne (Map + Dungeon + Kampf)
Story / Hub
Verhalten:
Tracks werden:
geshuffelt
vollständig abgespielt
❌ keine harten Neustarts
9. Tech Stack
HTML / CSS / JS
localStorage (DD_CUSTOM)
10. WICHTIGE DESIGNREGELN
❌ keine Hardcodes
❌ keine Fallback-Acts
✅ alles Editor-gesteuert
11. KORREKTUREN zu alter Version

❌ Entfernt:

lineares Act-System
Rangsystem
Geldsystem

✅ Neu:

Worldmap-System
DS-System
Playlist-Audio
Hard Save-Regeln
12. Offene ToDos (aktualisiert)
DD_CUSTOM exportierbar machen
Editor stabilisieren
Gegner-/Act-Daten vollständig entkoppeln
Encoding fixen
Audio-System finalisieren
13. Entscheidungslog (erweitert)
2026-04-04 – Worldmap ersetzt lineare Acts
2026-04-04 – Pflicht-Dungeon-System eingeführt
2026-04-04 – Save-System auf Hub-only geändert
2026-04-04 – DS ersetzen Geldsystem
2026-04-04 – Rewardsystem ohne Ränge
2026-04-04 – Musiksystem auf Playlists umgestellt
