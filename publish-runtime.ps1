param(
  [string]$SourcePath = "",
  [string]$CommitMessage = "Update runtime-config.json",
  [string]$Branch = "",
  [switch]$SkipGit
)

$ErrorActionPreference = "Stop"

function Write-Step($message) {
  Write-Host "[publish-runtime] $message"
}

function Resolve-DownloadsRuntimeConfig {
  $downloads = Join-Path $env:USERPROFILE "Downloads"
  if (-not (Test-Path $downloads)) {
    throw "Downloads-Ordner nicht gefunden: $downloads"
  }

  $candidates = Get-ChildItem -Path $downloads -File |
    Where-Object { $_.Name -like "runtime-config*.json" } |
    Sort-Object LastWriteTime -Descending

  if (-not $candidates) {
    throw "Keine runtime-config*.json im Downloads-Ordner gefunden."
  }

  return $candidates[0].FullName
}

function Read-JsonFile([string]$path) {
  try {
    return Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
  } catch {
    throw "JSON konnte nicht gelesen werden: $path`n$($_.Exception.Message)"
  }
}

function Write-JsonFile([string]$path, $data) {
  $json = $data | ConvertTo-Json -Depth 100
  [System.IO.File]::WriteAllText($path, $json + "`n", (New-Object System.Text.UTF8Encoding($false)))
}

function Assert-RuntimeConfig($json, [string]$path) {
  $required = @("cards", "fusionMonsters", "enemies", "acts", "config", "starterDeck", "worldMap", "recipes", "effects")
  foreach ($key in $required) {
    if (-not ($json.PSObject.Properties.Name -contains $key)) {
      throw "Pflichtfeld '$key' fehlt in $path"
    }
  }

  if ($json.worldMap.Count -lt 1) {
    throw "worldMap ist leer in $path"
  }

  if ($json.acts.Count -lt 1) {
    throw "acts ist leer in $path"
  }

  if ($json.enemies.Count -lt 1) {
    throw "enemies ist leer in $path"
  }
}

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

if (-not $Branch) {
  $Branch = (git branch --show-current).Trim()
}

if (-not $Branch) {
  throw "Aktueller Git-Branch konnte nicht ermittelt werden."
}

if (-not $SourcePath) {
  $SourcePath = Resolve-DownloadsRuntimeConfig
}

$resolvedSource = Resolve-Path -LiteralPath $SourcePath
$sourceFile = $resolvedSource.Path
$targetFile = Join-Path $repoRoot "assets\data\runtime-config.json"
$targetJsFile = Join-Path $repoRoot "assets\data\runtime-config.js"
$effectsFile = Join-Path $repoRoot "assets\data\effects.json"
$cardsFile = Join-Path $repoRoot "assets\data\cards.json"
$enemiesFile = Join-Path $repoRoot "assets\data\enemies.json"
$actsFile = Join-Path $repoRoot "assets\data\acts.json"
$recipesFile = Join-Path $repoRoot "assets\data\recipes.json"
$configFile = Join-Path $repoRoot "assets\data\config.json"
$starterDeckFile = Join-Path $repoRoot "assets\data\starter-deck.json"
$worldMapFile = Join-Path $repoRoot "assets\data\world-map.json"
$storyContentFile = Join-Path $repoRoot "assets\data\story-content.json"
$localeDeCardsFile = Join-Path $repoRoot "locales\de\cards.json"
$localeDeStoryFile = Join-Path $repoRoot "locales\de\story.json"
$localeEnCardsFile = Join-Path $repoRoot "locales\en\cards.json"
$localeEnStoryFile = Join-Path $repoRoot "locales\en\story.json"

Write-Step "Quelle: $sourceFile"
Write-Step "Ziel:   $targetFile"

$json = Read-JsonFile $sourceFile
$runtime = $json | ConvertTo-Json -Depth 100 | ConvertFrom-Json
if (-not ($runtime.PSObject.Properties.Name -contains 'effects')) {
  Write-Step "effects fehlen im Export - uebernehme aktuelle Repo-Effekte als Rueckfall."
  $runtime | Add-Member -NotePropertyName effects -NotePropertyValue (Read-JsonFile $effectsFile).effects
}
if (-not ($runtime.PSObject.Properties.Name -contains 'locales')) {
  $runtime | Add-Member -NotePropertyName locales -NotePropertyValue @{}
}

Assert-RuntimeConfig $runtime $sourceFile

Write-Step ("Validiert: {0} Karten, {1} Gegner, {2} Akte, {3} Worldmap-Orte" -f $runtime.cards.Count, $runtime.enemies.Count, $runtime.acts.Count, $runtime.worldMap.Count)

if (([System.IO.Path]::GetFullPath($sourceFile)) -ne ([System.IO.Path]::GetFullPath($targetFile))) {
  Write-JsonFile $targetFile $runtime
  Write-Step "Runtime-Datei ins Repo kopiert."
} else {
  Write-JsonFile $targetFile $runtime
  Write-Step "Quelle ist bereits die Repo-Runtime-Datei."
}

$runtimeJsonRaw = Get-Content -LiteralPath $targetFile -Raw -Encoding UTF8
$runtimeJs = "window.DD_RUNTIME_EMBEDDED_DATA = $runtimeJsonRaw;`n"
[System.IO.File]::WriteAllText($targetJsFile, $runtimeJs, (New-Object System.Text.UTF8Encoding($false)))
Write-Step "Runtime-JS-Fallback aktualisiert."

Write-JsonFile $cardsFile @{
  cards = @($runtime.cards)
  fusionMonsters = @($runtime.fusionMonsters)
}
Write-JsonFile $enemiesFile @{ enemies = @($runtime.enemies) }
Write-JsonFile $effectsFile @{ effects = $runtime.effects }
Write-JsonFile $actsFile @{ acts = @($runtime.acts) }
Write-JsonFile $recipesFile @{ recipes = @($runtime.recipes) }
Write-JsonFile $configFile @{ config = $runtime.config }
Write-JsonFile $starterDeckFile @{ starterDeck = @($runtime.starterDeck) }
Write-JsonFile $worldMapFile @{ worldMap = @($runtime.worldMap) }
Write-JsonFile $storyContentFile @{
  events = @($runtime.events)
  quests = @($runtime.quests)
  hubs = @($runtime.hubs)
  locales = $runtime.locales
}

$localeRoot = $runtime.locales
$deLocales = if ($localeRoot.de) { $localeRoot.de } else { @{} }
$enLocales = if ($localeRoot.en) { $localeRoot.en } else { @{} }
Write-JsonFile $localeDeCardsFile $(if ($deLocales.cards) { $deLocales.cards } else { @{} })
Write-JsonFile $localeDeStoryFile $(if ($deLocales.story) { $deLocales.story } else { @{} })
Write-JsonFile $localeEnCardsFile $(if ($enLocales.cards) { $enLocales.cards } else { @{} })
Write-JsonFile $localeEnStoryFile $(if ($enLocales.story) { $enLocales.story } else { @{} })
Write-Step "Abgeleitete Split-Dateien und Locale-Dateien synchronisiert."

if ($SkipGit) {
  Write-Step "SkipGit aktiv - keine Git-Aktionen ausgefuehrt."
  exit 0
}

git add -- `
  "assets/data/runtime-config.json" `
  "assets/data/runtime-config.js" `
  "assets/data/cards.json" `
  "assets/data/enemies.json" `
  "assets/data/effects.json" `
  "assets/data/acts.json" `
  "assets/data/recipes.json" `
  "assets/data/config.json" `
  "assets/data/starter-deck.json" `
  "assets/data/world-map.json" `
  "assets/data/story-content.json" `
  "locales/de/cards.json" `
  "locales/de/story.json" `
  "locales/en/cards.json" `
  "locales/en/story.json"

$status = git status --short -- `
  "assets/data/runtime-config.json" `
  "assets/data/runtime-config.js" `
  "assets/data/cards.json" `
  "assets/data/enemies.json" `
  "assets/data/effects.json" `
  "assets/data/acts.json" `
  "assets/data/recipes.json" `
  "assets/data/config.json" `
  "assets/data/starter-deck.json" `
  "assets/data/world-map.json" `
  "assets/data/story-content.json" `
  "locales/de/cards.json" `
  "locales/de/story.json" `
  "locales/en/cards.json" `
  "locales/en/story.json"
if (-not $status) {
  Write-Step "Keine Aenderungen an den Runtime-Dateien vorhanden."
  exit 0
}

git commit -m $CommitMessage
git push origin $Branch

Write-Step ("Fertig. Branch {0} wurde aktualisiert und gepusht." -f $Branch)
