# scripts/journal-archive.ps1
#
# Move past-month entries out of Project-Journal-Obsidian.md
# into docs/journal-archive/YYYY-MM.md.
#
# Usage:
#   pwsh ./scripts/journal-archive.ps1
#
# Run on or after the 1st of each month (or weekly — calling it more often is a no-op).
# An entry's month is determined by its '## YYYY-MM-DD' heading line.
# The canonical template header at the very top of the file is preserved.

param(
  [string]$JournalPath = (Join-Path $PSScriptRoot '..\Project-Journal-Obsidian.md')
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $JournalPath)) {
  Write-Error "Journal file not found: $JournalPath"
  exit 1
}

$JournalPath = (Resolve-Path $JournalPath).Path
$RepoRoot = Split-Path $JournalPath -Parent
$ArchiveDir = Join-Path $RepoRoot 'docs\journal-archive'

$lines = Get-Content $JournalPath

# Locate the first dated entry header. Everything above it is the canonical template / preamble.
$firstEntryIdx = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($lines[$i] -match '^## \d{4}-\d{2}-\d{2}\s*$') {
    $firstEntryIdx = $i
    break
  }
}

if ($firstEntryIdx -lt 0) {
  Write-Host "No dated entries found. Nothing to archive."
  exit 0
}

$header = $lines[0..($firstEntryIdx - 1)]
$body   = $lines[$firstEntryIdx..($lines.Count - 1)]

# Split body into per-entry blocks. An entry starts at a '## YYYY-MM-DD' line and runs until the next one.
$entries = @()
$current = $null
foreach ($line in $body) {
  if ($line -match '^## (\d{4}-\d{2}-\d{2})\s*$') {
    if ($current) { $entries += $current }
    $current = [PSCustomObject]@{
      Date  = [datetime]::ParseExact($matches[1], 'yyyy-MM-dd', $null)
      Lines = @($line)
    }
  } else {
    if ($current) { $current.Lines += $line }
  }
}
if ($current) { $entries += $current }

# Bucket: keep current month, archive the rest by YYYY-MM.
$currentYearMonth = '{0:yyyy-MM}' -f (Get-Date)
$keep = @()
$toArchive = @{}
foreach ($e in $entries) {
  $ym = '{0:yyyy-MM}' -f $e.Date
  if ($ym -eq $currentYearMonth) {
    $keep += $e
  } else {
    if (-not $toArchive.ContainsKey($ym)) { $toArchive[$ym] = @() }
    $toArchive[$ym] += $e
  }
}

if ($toArchive.Keys.Count -eq 0) {
  Write-Host "No past-month entries to archive (everything is in $currentYearMonth)."
  exit 0
}

if (-not (Test-Path $ArchiveDir)) {
  New-Item -ItemType Directory -Path $ArchiveDir | Out-Null
}

foreach ($ym in $toArchive.Keys | Sort-Object) {
  $archiveFile = Join-Path $ArchiveDir "$ym.md"
  $entriesForMonth = $toArchive[$ym] | Sort-Object Date -Descending  # newest within month on top

  $newBlocks = @()
  foreach ($e in $entriesForMonth) {
    $newBlocks += ($e.Lines -join "`n").TrimEnd()
  }
  $newSection = ($newBlocks -join "`n`n") + "`n"

  if (Test-Path $archiveFile) {
    $existing = (Get-Content $archiveFile -Raw).TrimEnd()
    $output = "$existing`n`n$newSection"
  } else {
    $output = "# Archive — $ym`n`n$newSection"
  }

  Set-Content -Path $archiveFile -Value $output -Encoding UTF8 -NoNewline
  Write-Host "Archived $($entriesForMonth.Count) entries -> $archiveFile"
}

# Rewrite live file: header + current-month entries (newest on top).
$keep = $keep | Sort-Object Date -Descending
$keepBlocks = @()
foreach ($e in $keep) {
  $keepBlocks += ($e.Lines -join "`n").TrimEnd()
}

$headerText = ($header -join "`n").TrimEnd()
if ($keepBlocks.Count -gt 0) {
  $output = "$headerText`n`n" + (($keepBlocks -join "`n`n").TrimEnd()) + "`n"
} else {
  $output = "$headerText`n"
}

Set-Content -Path $JournalPath -Value $output -Encoding UTF8 -NoNewline
Write-Host "Live journal kept $($keep.Count) entries (current month: $currentYearMonth)."
