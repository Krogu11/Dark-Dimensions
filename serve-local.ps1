param(
  [int]$Port = 8000
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

function Test-Command($name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

if (Test-Command python) {
  Write-Host "[serve-local] Serving $repoRoot on http://127.0.0.1:$Port/index.html"
  python -m http.server $Port
  exit $LASTEXITCODE
}

if (Test-Command py) {
  Write-Host "[serve-local] Serving $repoRoot on http://127.0.0.1:$Port/index.html"
  py -m http.server $Port
  exit $LASTEXITCODE
}

throw "Python was not found. Install Python or use a local static server such as VS Code Live Server."
