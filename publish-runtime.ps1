param(
  [string]$SourcePath = "",
  [string]$CommitMessage = "Update runtime-config.json",
  [string]$Branch = ""
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

function Assert-RuntimeConfig($json, [string]$path) {
  $required = @("cards", "fusionMonsters", "enemies", "acts", "config", "starterDeck", "worldMap", "recipes")
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

Write-Step "Quelle: $sourceFile"
Write-Step "Ziel:   $targetFile"

$json = Read-JsonFile $sourceFile
Assert-RuntimeConfig $json $sourceFile

Write-Step ("Validiert: {0} Karten, {1} Gegner, {2} Akte, {3} Worldmap-Orte" -f $json.cards.Count, $json.enemies.Count, $json.acts.Count, $json.worldMap.Count)

if (([System.IO.Path]::GetFullPath($sourceFile)) -ne ([System.IO.Path]::GetFullPath($targetFile))) {
  Copy-Item -LiteralPath $sourceFile -Destination $targetFile -Force
  Write-Step "Runtime-Datei ins Repo kopiert."
} else {
  Write-Step "Quelle ist bereits die Repo-Runtime-Datei."
}

$runtimeJsonRaw = Get-Content -LiteralPath $targetFile -Raw -Encoding UTF8
$runtimeJs = "window.DD_RUNTIME_EMBEDDED_DATA = $runtimeJsonRaw;`n"
[System.IO.File]::WriteAllText($targetJsFile, $runtimeJs, (New-Object System.Text.UTF8Encoding($false)))
Write-Step "Runtime-JS-Fallback aktualisiert."

git add -- "assets/data/runtime-config.json" "assets/data/runtime-config.js"

$status = git status --short -- "assets/data/runtime-config.json" "assets/data/runtime-config.js"
if (-not $status) {
  Write-Step "Keine Aenderungen an den Runtime-Dateien vorhanden."
  exit 0
}

git commit -m $CommitMessage
git push origin $Branch

Write-Step ("Fertig. Branch {0} wurde aktualisiert und gepusht." -f $Branch)
