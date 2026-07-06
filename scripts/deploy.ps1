<#
.SYNOPSIS
    Endless Esports Club - Automated Deployment Script
.DESCRIPTION
    Supports version switching, auto-backup, rollback, dependency install, and service restart.
.EXAMPLE
    .\deploy.ps1 -Version v1.1.0
    .\deploy.ps1 -Latest
    .\deploy.ps1 -Action backup
    .\deploy.ps1 -Action rollback
#>

param(
    [string]$Version,
    [switch]$Latest,
    [string]$Action,
    [string]$BackupFile
)

$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path -Parent $PSScriptRoot
$DbPath = Join-Path $ProjectDir "data.db"
$BackupDir = Join-Path $ProjectDir "backups"
$VersionFile = Join-Path $ProjectDir ".current-version"
$DeployLog = Join-Path $ProjectDir "deploy.log"

function Write-Info  { param($msg) Write-Host "[INFO]  $msg" -ForegroundColor Cyan }
function Write-OK    { param($msg) Write-Host "[OK]    $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Write-Err   { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red }
function Write-Step  { param($msg) Write-Host ""; Write-Host ">> $msg" -ForegroundColor Magenta }

function Write-Log {
    param($msg)
    $t = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$t - $msg" | Out-File -Append -FilePath $DeployLog -Encoding UTF8
}

function Test-GitRepo {
    return Test-Path (Join-Path $ProjectDir ".git")
}

function Get-CurrentVersion {
    if (Test-Path $VersionFile) {
        return (Get-Content $VersionFile -Raw).Trim()
    }
    try {
        Push-Location $ProjectDir
        $tag = git describe --tags --exact-match 2>$null
        if ($tag) { return $tag.Trim() }
        return "branch:$(git rev-parse --abbrev-ref HEAD)"
    }
    catch { return "unknown" }
    finally { Pop-Location }
}

function Save-CurrentVersion {
    param([string]$ver)
    $ver | Out-File -FilePath $VersionFile -Encoding UTF8 -NoNewline
}

function Invoke-Backup {
    Write-Step "Creating backup..."
    if (-not (Test-Path $BackupDir)) {
        New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
    }
    $ver = Get-CurrentVersion
    $ts = Get-Date -Format "yyyyMMdd_HHmmss"
    $prefix = "backup_${ts}_${ver}"

    if (Test-Path $DbPath) {
        $dbBak = Join-Path $BackupDir "${prefix}_data.db"
        Copy-Item $DbPath $dbBak -Force
        Write-OK "Database backup: $dbBak"
    }
    else {
        Write-Warn "Database file not found, skipping"
    }

    foreach ($f in @("ecosystem.config.js")) {
        $fp = Join-Path $ProjectDir $f
        if (Test-Path $fp) {
            Copy-Item $fp (Join-Path $BackupDir "${prefix}_${f}") -Force
        }
    }

    $commit = "no-git"
    if (Test-GitRepo) {
        try { $commit = (git rev-parse --short HEAD).Trim() } catch {}
    }
    @{ version = $ver; timestamp = $ts; commit = $commit } | ConvertTo-Json |
        Out-File -FilePath (Join-Path $BackupDir "${prefix}_version.json") -Encoding UTF8

    Write-Log "Backup: $prefix"
    return $prefix
}

function Invoke-Restore {
    param([string]$backupFile)
    if (-not $backupFile) { Write-Err "Please specify backup file path"; return }
    if (-not (Test-Path $backupFile)) { Write-Err "Backup file not found: $backupFile"; return }

    Write-Step "Restoring database..."
    Write-Info "Stopping service..."
    pm2 stop esports-club 2>$null
    Copy-Item $backupFile $DbPath -Force
    Write-OK "Database restored"
    Write-Info "Starting service..."
    pm2 start esports-club 2>$null
    Write-OK "Service started"
    Write-Log "Restored from: $backupFile"
}

function Invoke-Rollback {
    Write-Step "Rolling back..."
    if (-not (Test-GitRepo)) { Write-Err "Not a Git repository"; return }

    Push-Location $ProjectDir
    try {
        $tags = git tag -l --sort=-version:refname | Select-Object -First 5
        if ($tags.Count -lt 2) { Write-Err "No previous version to rollback to"; return }

        $prev = $tags[1]
        $current = $tags[0]
        Write-Info "Current: $current => Rollback to: $prev"

        Invoke-Backup
        Write-Info "Switching code..."
        git checkout $prev --force
        Invoke-Build
        Save-CurrentVersion $prev
        Write-OK "Rolled back to $prev"
        Write-Log "Rolled back to: $prev"
    }
    catch { Write-Err "Rollback failed: $_" }
    finally { Pop-Location }
}

function Invoke-InstallDeps {
    Write-Step "Installing dependencies..."
    Push-Location $ProjectDir
    try {
        Write-Info "Backend dependencies..."
        npm install --production
        Write-Info "Frontend dependencies..."
        Push-Location "client"
        npm install
        Pop-Location
        Write-OK "Dependencies installed"
    }
    catch { Write-Err "Dependency install failed: $_" }
    finally { Pop-Location }
}

function Invoke-Build {
    Write-Step "Building frontend..."
    Push-Location $ProjectDir
    try {
        npm run build
        Write-OK "Build completed"
    }
    catch { Write-Err "Build failed: $_" }
    finally { Pop-Location }
}

function Invoke-DeployVersion {
    param([string]$targetVersion)
    if (-not (Test-GitRepo)) { Write-Err "Not a Git repository"; return }

    Push-Location $ProjectDir
    try {
        $exists = git tag -l | Where-Object { $_ -eq $targetVersion }
        if (-not $exists) {
            Write-Err "Tag not found: $targetVersion"
            Write-Info "Available versions:"
            git tag -l --sort=-version:refname | Select-Object -First 10
            return
        }

        $cur = Get-CurrentVersion
        Write-Info "Current: $cur => Target: $targetVersion"
        if ($cur -eq $targetVersion) { Write-Warn "Already at target version"; return }

        Invoke-Backup
        Write-Step "Stopping service..."
        pm2 stop esports-club 2>$null

        Write-Step "Switching to $targetVersion..."
        git fetch --tags
        git checkout $targetVersion --force

        Invoke-InstallDeps
        Invoke-Build

        Write-Step "Restarting service..."
        pm2 restart esports-club 2>$null
        Save-CurrentVersion $targetVersion
        Write-OK "Deployed: $targetVersion"
        Write-Log "Deployed: $targetVersion"

        Start-Sleep -Seconds 3
        Invoke-HealthCheck
    }
    catch { Write-Err "Deploy failed: $_" }
    finally { Pop-Location }
}

function Invoke-DeployLatest {
    if (-not (Test-GitRepo)) { Write-Err "Not a Git repository"; return }
    Push-Location $ProjectDir
    try {
        $latest = git tag -l --sort=-version:refname | Select-Object -First 1
        if (-not $latest) { Write-Err "No version tags found"; return }
        Invoke-DeployVersion $latest
    }
    catch { Write-Err "Deploy failed: $_" }
    finally { Pop-Location }
}

function Invoke-HealthCheck {
    Write-Step "Health check..."
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 10 -UseBasicParsing
        if ($r.StatusCode -eq 200) {
            Write-OK "Service is healthy"
            return $true
        }
        Write-Err "Unexpected status: $($r.StatusCode)"
        return $false
    }
    catch {
        Write-Err "Service not responding: $_"
        return $false
    }
}

function Show-Versions {
    if (-not (Test-GitRepo)) { Write-Warn "Not a Git repository"; return }
    Push-Location $ProjectDir
    try {
        Write-Host ""; Write-Host "Available versions:" -ForegroundColor Cyan
        git tag -l --sort=-version:refname | Select-Object -First 10 | ForEach-Object {
            $d = git log -1 --format="%ci" $_ 2>$null
            Write-Host "  $_  ($d)"
        }
    }
    catch {}
    finally { Pop-Location }
}

function Show-Backups {
    if (-not (Test-Path $BackupDir)) { Write-Warn "No backups found"; return }
    Write-Host ""; Write-Host "Backup files:" -ForegroundColor Cyan
    Get-ChildItem $BackupDir -Filter "backup_*_data.db" |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 10 |
        ForEach-Object {
            $s = [math]::Round($_.Length / 1KB, 2)
            Write-Host "  $($_.Name)  ($s KB)  $($_.LastWriteTime)"
        }
}

function Show-Help {
    Write-Host ""
    Write-Host "Endless Esports Club - Deployment Script" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Usage:" -ForegroundColor Cyan
    Write-Host "  .\deploy.ps1                         Show help and status"
    Write-Host "  .\deploy.ps1 -Version v1.1.0         Deploy to specific version"
    Write-Host "  .\deploy.ps1 -Latest                 Deploy latest version"
    Write-Host "  .\deploy.ps1 -Action backup          Backup only"
    Write-Host "  .\deploy.ps1 -Action rollback        Rollback to previous version"
    Write-Host "  .\deploy.ps1 -Action restore -BackupFile <path>  Restore backup"
    Write-Host "  .\deploy.ps1 -Action list-versions   List available versions"
    Write-Host "  .\deploy.ps1 -Action list-backups    List backup files"
    Write-Host "  .\deploy.ps1 -Action health          Health check"
    Write-Host ""
}

# === Main ===
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Endless Esports Club - Deploy Tool" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

if ($Action) {
    switch ($Action) {
        "backup"        { Invoke-Backup }
        "restore"       { Invoke-Restore $BackupFile }
        "rollback"      { Invoke-Rollback }
        "list-versions" { Show-Versions }
        "list-backups"  { Show-Backups }
        "health"        { Invoke-HealthCheck }
        default {
            Write-Err "Unknown action: $Action"
            Show-Help
        }
    }
}
elseif ($Version) {
    Invoke-DeployVersion $Version
}
elseif ($Latest) {
    Invoke-DeployLatest
}
else {
    Show-Help
    Show-Versions
    Show-Backups
}

Write-Host ""
Write-OK "Done"