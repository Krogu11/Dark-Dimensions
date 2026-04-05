Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

function Resolve-LatestRuntimeConfig {
  $downloads = Join-Path $env:USERPROFILE "Downloads"
  if (-not (Test-Path $downloads)) { return $null }
  return Get-ChildItem -Path $downloads -File |
    Where-Object { $_.Name -like "runtime-config*.json" } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
}

function Append-Log {
  param(
    [System.Windows.Forms.TextBox]$TextBox,
    [string]$Message
  )

  if (-not $TextBox) { return }
  $TextBox.AppendText($Message + [Environment]::NewLine)
  $TextBox.SelectionStart = $TextBox.TextLength
  $TextBox.ScrollToCaret()
}

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$publishScript = Join-Path $repoRoot "publish-runtime.ps1"

$form = New-Object System.Windows.Forms.Form
$form.Text = "Dark Dimensions - Runtime Publish"
$form.Size = New-Object System.Drawing.Size(760, 620)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $true
$form.BackColor = [System.Drawing.Color]::FromArgb(24, 26, 34)
$form.ForeColor = [System.Drawing.Color]::White

$title = New-Object System.Windows.Forms.Label
$title.Text = "Runtime Publish"
$title.Font = New-Object System.Drawing.Font("Segoe UI", 18, [System.Drawing.FontStyle]::Bold)
$title.Location = New-Object System.Drawing.Point(20, 18)
$title.Size = New-Object System.Drawing.Size(300, 34)
$form.Controls.Add($title)

$subtitle = New-Object System.Windows.Forms.Label
$subtitle.Text = "Ein Klick fuer Import, Sync, Commit und Push."
$subtitle.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$subtitle.Location = New-Object System.Drawing.Point(22, 54)
$subtitle.Size = New-Object System.Drawing.Size(380, 24)
$form.Controls.Add($subtitle)

$sourceLabel = New-Object System.Windows.Forms.Label
$sourceLabel.Text = "Exportdatei"
$sourceLabel.Location = New-Object System.Drawing.Point(22, 94)
$sourceLabel.Size = New-Object System.Drawing.Size(100, 20)
$form.Controls.Add($sourceLabel)

$sourceBox = New-Object System.Windows.Forms.TextBox
$sourceBox.Location = New-Object System.Drawing.Point(22, 118)
$sourceBox.Size = New-Object System.Drawing.Size(520, 28)
$sourceBox.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$form.Controls.Add($sourceBox)

$latestButton = New-Object System.Windows.Forms.Button
$latestButton.Text = "Neueste aus Downloads"
$latestButton.Location = New-Object System.Drawing.Point(552, 116)
$latestButton.Size = New-Object System.Drawing.Size(170, 32)
$form.Controls.Add($latestButton)

$browseButton = New-Object System.Windows.Forms.Button
$browseButton.Text = "Datei auswaehlen"
$browseButton.Location = New-Object System.Drawing.Point(552, 154)
$browseButton.Size = New-Object System.Drawing.Size(170, 32)
$form.Controls.Add($browseButton)

$messageLabel = New-Object System.Windows.Forms.Label
$messageLabel.Text = "Commit-Nachricht"
$messageLabel.Location = New-Object System.Drawing.Point(22, 204)
$messageLabel.Size = New-Object System.Drawing.Size(120, 20)
$form.Controls.Add($messageLabel)

$messageBox = New-Object System.Windows.Forms.TextBox
$messageBox.Location = New-Object System.Drawing.Point(22, 228)
$messageBox.Size = New-Object System.Drawing.Size(520, 28)
$messageBox.Font = New-Object System.Drawing.Font("Segoe UI", 10)
$messageBox.Text = "Update runtime-config.json"
$form.Controls.Add($messageBox)

$optionsPanel = New-Object System.Windows.Forms.Panel
$optionsPanel.Location = New-Object System.Drawing.Point(22, 272)
$optionsPanel.Size = New-Object System.Drawing.Size(700, 68)
$optionsPanel.BackColor = [System.Drawing.Color]::FromArgb(34, 36, 46)
$form.Controls.Add($optionsPanel)

$pushCheckbox = New-Object System.Windows.Forms.CheckBox
$pushCheckbox.Text = "Direkt committen und pushen"
$pushCheckbox.Checked = $true
$pushCheckbox.Location = New-Object System.Drawing.Point(14, 12)
$pushCheckbox.Size = New-Object System.Drawing.Size(260, 24)
$optionsPanel.Controls.Add($pushCheckbox)

$helpLabel = New-Object System.Windows.Forms.Label
$helpLabel.Text = "Wenn deaktiviert, werden nur die Repo-Dateien synchronisiert."
$helpLabel.Location = New-Object System.Drawing.Point(14, 38)
$helpLabel.Size = New-Object System.Drawing.Size(420, 20)
$optionsPanel.Controls.Add($helpLabel)

$publishButton = New-Object System.Windows.Forms.Button
$publishButton.Text = "Publish ausfuehren"
$publishButton.Location = New-Object System.Drawing.Point(552, 224)
$publishButton.Size = New-Object System.Drawing.Size(170, 42)
$publishButton.BackColor = [System.Drawing.Color]::FromArgb(55, 140, 90)
$publishButton.ForeColor = [System.Drawing.Color]::White
$publishButton.FlatStyle = "Flat"
$form.Controls.Add($publishButton)

$cliButton = New-Object System.Windows.Forms.Button
$cliButton.Text = "CLI oeffnen"
$cliButton.Location = New-Object System.Drawing.Point(552, 272)
$cliButton.Size = New-Object System.Drawing.Size(170, 32)
$form.Controls.Add($cliButton)

$logLabel = New-Object System.Windows.Forms.Label
$logLabel.Text = "Ausgabe"
$logLabel.Location = New-Object System.Drawing.Point(22, 356)
$logLabel.Size = New-Object System.Drawing.Size(100, 20)
$form.Controls.Add($logLabel)

$logBox = New-Object System.Windows.Forms.TextBox
$logBox.Location = New-Object System.Drawing.Point(22, 380)
$logBox.Size = New-Object System.Drawing.Size(700, 180)
$logBox.Multiline = $true
$logBox.ScrollBars = "Vertical"
$logBox.ReadOnly = $true
$logBox.Font = New-Object System.Drawing.Font("Consolas", 10)
$logBox.BackColor = [System.Drawing.Color]::FromArgb(14, 16, 22)
$logBox.ForeColor = [System.Drawing.Color]::White
$form.Controls.Add($logBox)

$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Filter = "JSON files (*.json)|*.json|All files (*.*)|*.*"
$dialog.Title = "Runtime-Config auswaehlen"

$latest = Resolve-LatestRuntimeConfig
if ($latest) {
  $sourceBox.Text = $latest.FullName
  Append-Log $logBox ("Neueste Exportdatei gefunden: " + $latest.FullName)
} else {
  Append-Log $logBox "Keine runtime-config*.json in Downloads gefunden."
}

$latestButton.Add_Click({
  $latestCandidate = Resolve-LatestRuntimeConfig
  if ($latestCandidate) {
    $sourceBox.Text = $latestCandidate.FullName
    Append-Log $logBox ("Quelle gesetzt: " + $latestCandidate.FullName)
  } else {
    [System.Windows.Forms.MessageBox]::Show("Keine runtime-config*.json in Downloads gefunden.", "Keine Datei", "OK", "Warning") | Out-Null
  }
})

$browseButton.Add_Click({
  if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    $sourceBox.Text = $dialog.FileName
    Append-Log $logBox ("Quelle gesetzt: " + $dialog.FileName)
  }
})

$cliButton.Add_Click({
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "start", "`"Runtime Publish CLI`"", "cmd", "/k", "cd /d `"$repoRoot`" && publish-runtime-cli.bat"
})

$publishButton.Add_Click({
  $sourcePath = $sourceBox.Text.Trim()
  if (-not $sourcePath) {
    [System.Windows.Forms.MessageBox]::Show("Bitte waehle eine Runtime-Config-Datei aus.", "Quelle fehlt", "OK", "Warning") | Out-Null
    return
  }
  if (-not (Test-Path -LiteralPath $sourcePath)) {
    [System.Windows.Forms.MessageBox]::Show("Die ausgewaehlte Datei existiert nicht mehr.", "Datei fehlt", "OK", "Error") | Out-Null
    return
  }

  $publishButton.Enabled = $false
  $latestButton.Enabled = $false
  $browseButton.Enabled = $false
  $cliButton.Enabled = $false
  Append-Log $logBox "Publish gestartet..."

  try {
    $argList = @(
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", $publishScript,
      "-SourcePath", $sourcePath,
      "-CommitMessage", $messageBox.Text
    )
    if (-not $pushCheckbox.Checked) {
      $argList += "-SkipGit"
    }

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = New-Object System.Diagnostics.ProcessStartInfo
    $process.StartInfo.FileName = "powershell.exe"
    $process.StartInfo.WorkingDirectory = $repoRoot
    $process.StartInfo.UseShellExecute = $false
    $process.StartInfo.RedirectStandardOutput = $true
    $process.StartInfo.RedirectStandardError = $true
    $process.StartInfo.CreateNoWindow = $true
    foreach ($arg in $argList) {
      [void]$process.StartInfo.ArgumentList.Add($arg)
    }

    $null = $process.Start()
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()

    if ($stdout) { Append-Log $logBox $stdout.TrimEnd() }
    if ($stderr) { Append-Log $logBox $stderr.TrimEnd() }

    if ($process.ExitCode -eq 0) {
      Append-Log $logBox "Publish erfolgreich abgeschlossen."
      [System.Windows.Forms.MessageBox]::Show("Publish erfolgreich abgeschlossen.", "Fertig", "OK", "Information") | Out-Null
    } else {
      Append-Log $logBox ("Publish fehlgeschlagen. ExitCode=" + $process.ExitCode)
      [System.Windows.Forms.MessageBox]::Show("Publish fehlgeschlagen. Details stehen im Log.", "Fehler", "OK", "Error") | Out-Null
    }
  } catch {
    Append-Log $logBox $_.Exception.Message
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "Fehler", "OK", "Error") | Out-Null
  } finally {
    $publishButton.Enabled = $true
    $latestButton.Enabled = $true
    $browseButton.Enabled = $true
    $cliButton.Enabled = $true
  }
})

[void]$form.ShowDialog()
