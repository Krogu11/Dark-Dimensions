# Dark Dimensions

> Ein düsteres Singleplayer-Kartenkampfspiel mit Roguelike-Struktur, Weltkarte, Fusionen und permanentem Fortschritt.

**Dark Dimensions** verbindet einen schnellen, gut lesbaren Card-Battler mit einer finsteren Kampagne voller Gegner, Bossketten und stetigem Deck-Ausbau. Du wählst einen Speicherstand, startest einen Run, kämpfst dich über die Karte durch gefährliche Akte, sammelst Karten, investierst `DS` und formst aus einfachen Kreaturen mächtige Fusionen.

Das Projekt ist bewusst ein **Hobby- und Vibecode-Projekt**: entstanden aus Spaß am Bauen, Ausprobieren und Weiterentwickeln. Ein zentraler Inspirationspunkt für das Spielgefühl und besonders für das **Fusionssystem** war das Spielkonzept von `Yu-Gi-Oh! Forbidden Memories`.

## Warum das Spiel besonders ist

- Dark-Fantasy-Atmosphäre mit klarer Arcade-/TCG-Lesbarkeit
- Roguelike-Kampagnenstruktur mit Weltkarte, Hub, Story-Screens und Boss-Fortschritt
- Kartensystem mit Monster-, Zauber-, Fallen-, Spielfeld- und Fusionskarten
- Freies Duell gegen bereits besiegte Gegner zum Farmen und Testen von Decks
- Permanenter Meta-Fortschritt über Save-Slots und `Dimensionsseelen (DS)`
- Integrierter Developer-Editor für Karten, Gegner, Akte, Fusionen, Synergien und Weltenkarte
- Von Anfang an auf einfache Modbarkeit ausgelegt

## Aktueller Umfang

- `110` Karten
- `11` Fusionsmonster
- `24` Fusionsrezepte
- `16` Gegner
- `3` Akte
- `8` Weltenkarten-Orte

## Gameplay-Loop

`Spielstand wählen → Run starten → Welt erkunden → Kämpfe gewinnen → Karte erhalten → Deck verbessern → Boss besiegen → Fortschritt sichern`

Zusätzlich gibt es einen **Free-Duel-Modus**, in dem bereits freigeschaltete Gegner erneut bekämpft werden können, um die Sammlung gezielt auszubauen.

## Kampfsystem

- Rundenphasen: `Draw → Main → Battle → End`
- Pro Runde stehen standardmäßig `2` Beschwörungen zur Verfügung
- Monster können im Angriffs- oder Verteidigungsmodus gespielt werden
- Fusionen funktionieren mit `Hand + Hand` und `Feld + Hand`
- Das Spielfeld nutzt `5` Monster-Slots und `3` Spell/Trap-Slots pro Seite
- Die KI spielt nicht nur stumpf aus, sondern bewertet Lethals, Ziele, Effekte und Fusion-Potenzial

## Progression und Meta

- `DS` bleiben slotübergreifend innerhalb des Speicherstands erhalten
- Karten aus Runs werden erst nach wichtigen Erfolgen dauerhaft gesichert
- Niederlagen bestrafen den aktuellen Run, aber nicht den gesamten Langzeitfortschritt
- Der Deck-Editor erlaubt gültige Decks mit `15` bis `20` Karten

## Steuerung im Spiel

- Karte anklicken: auswählen / ausspielen
- Angreifer wählen, dann Ziel anklicken: Angriff ausführen
- Zwei passende Monster wählen: Fusion vorbereiten
- Deck- und Kampfbildschirme sind komplett ingame erreichbar
- `ESC`: Pause im Kampf

## Projektstruktur

```text
index.html                  Spielstart
editor.html                 Developer-Editor
css/style.css               Komplettes Styling
js/core/                    Engine, KI, Effekte, Saves, Audio, Ranking
js/data/                    Karten-, Gegner- und Map-Basisdaten
js/ui/                      Screens, Battle-UI, Reward-, Title- und Worldmap-Logik
assets/data/runtime-config.json  Exportierte Runtime-Daten
.github/workflows/static.yml     GitHub-Pages-Deployment
```

## Projekt lokal starten

Da das Projekt ohne Build-Step auskommt, reicht ein statischer Start im Browser.

### Spiel starten

1. [index.html](./index.html) im Browser öffnen

### Editor starten

1. [editor.html](./editor.html) im Browser öffnen
2. Inhalte bearbeiten
3. Per Export oder Runtime-Export ins Spiel übernehmen

## Content-Workflow

Der Editor ist ein zentraler Bestandteil des Projekts. Er ist nicht nur ein Entwickler-Tool, sondern die Grundlage dafür, dass **Dark Dimensions leicht modbar** bleibt und künftig als **Community-Projekt** wachsen kann.

Darüber lassen sich unter anderem bearbeiten:

- Karten und Kartengrafiken
- Gegnerdecks und Gegnerverhalten
- Drop-Tabellen
- Akte und Knotengenerierung
- Fusionen und Synergien
- Weltkarte und Konfigurationswerte

Die Grundidee dahinter: Die Community soll beim Erstellen und Erweitern des Spiels aktiv mitwirken können, zum Beispiel bei:

- neuen Karten
- neuen Decks
- neuen Monstern und Gegnern
- neuen Fusionen und Synergien
- neuen Story-Elementen, Events und Worldmap-Inhalten

Langfristig ist das Ziel, dass **Dark Dimensions** nicht nur mein eigenes Hobbyprojekt bleibt, sondern sich zu einem offenen Community-Projekt entwickelt, das durch Ideen, Content und Feedback gemeinsam weitergebaut wird.

Die exportierte Laufzeitdatei liegt unter [`assets/data/runtime-config.json`](./assets/data/runtime-config.json).  
Für das Einspielen und Committen der Runtime-Konfiguration ist zusätzlich [`publish-runtime.ps1`](./publish-runtime.ps1) vorhanden.

## Technik

- Vanilla `HTML`, `CSS`, `JavaScript`
- Kein Build-Step
- Speicherung über `localStorage`
- GitHub Pages Workflow für statisches Deployment

## Status

**Version 1.0** ist erreicht.  
Das Projekt ist spielbar und inhaltlich bereits klar ausformuliert, wird aber weiterhin aktiv über Runtime-Daten und Editor-Workflows erweitert.

## Hinweise

- Das Projekt nutzt stark datengetriebene Inhalte.
- Der Editor-Export und die Runtime-Konfiguration sind für den vollständigen Kampagnenstand wichtig.
- In einzelnen Datenbeständen gibt es aktuell noch sichtbare Encoding-Probleme bei Sonderzeichen.

## Vision

**Dark Dimensions** soll sich wie ein schneller, düsterer Boss-Run anfühlen: harte Kämpfe, starke Fusionen, spürbarer Fortschritt und ein Deck, das mit jedem Sieg gefährlicher wird.

Gleichzeitig soll das Projekt offen, erweiterbar und gemeinschaftlich bleiben: ein modbares Dark-Fantasy-Kartenspiel, bei dem nicht nur gespielt, sondern auch mitgestaltet werden kann.
