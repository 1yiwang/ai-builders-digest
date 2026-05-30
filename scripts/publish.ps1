#!/usr/bin/env pwsh
# ============================================================================
# AI Builders Digest — Publish Script (Windows PowerShell)
# ============================================================================
# Renders the magazine JSON → HTML, updates archive, commits and pushes.
#
# Usage:
#   .\scripts\publish.ps1 -Date "2026-05-25"
#   .\scripts\publish.ps1 -Date "2026-05-25" -SkipPush
#   .\scripts\publish.ps1 -Date "2026-05-25" -SkipGit
# ============================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$Date,
    [switch]$SkipPush,
    [switch]$SkipGit
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$JsonPath = Join-Path $RepoRoot "data\issues\ai-builders-digest-$Date.json"
$HtmlPath = Join-Path $RepoRoot "issues\ai-builders-digest-$Date.html"
$IndexPath = Join-Path $RepoRoot "index.html"

# Check JSON exists
if (-not (Test-Path $JsonPath)) {
    Write-Error "JSON file not found: $JsonPath"
    exit 1
}

# Step 1: Render JSON → HTML
Write-Output "Rendering $JsonPath → $HtmlPath"
Push-Location $RepoRoot
try {
    node scripts/render-ai-builders-digest.js $JsonPath $HtmlPath
    if ($LASTEXITCODE -ne 0) { throw "Render failed" }
    Write-Output "  Rendered: $HtmlPath"

    # Step 2: Update archive index
    Write-Output "Updating archive index..."
    node scripts/update-index-archive.js $IndexPath
    if ($LASTEXITCODE -ne 0) { throw "Archive update failed" }
    Write-Output "  Updated: $IndexPath"

    # Step 3: Git commit + push
    if (-not $SkipGit) {
        Write-Output "Committing and pushing..."
        git add $JsonPath $HtmlPath $IndexPath assets/avatars/ data/issues/ issues/
        git commit -m "Publish AI Builders Digest for $Date" --allow-empty

        if (-not $SkipPush) {
            git push origin main
            if ($LASTEXITCODE -ne 0) { throw "Git push failed" }
            Write-Output "  Pushed to origin/main"
        } else {
            Write-Output "  Skipped push (--SkipPush)"
        }
    } else {
        Write-Output "Skipped git operations (--SkipGit)"
    }
} finally {
    Pop-Location
}

# Output the public URL
$PublicUrl = "https://1yiwang.github.io/ai-builders-digest/issues/ai-builders-digest-$Date.html"
Write-Output ""
Write-Output "Published: $PublicUrl"
Write-Output "Archive: https://1yiwang.github.io/ai-builders-digest/"
