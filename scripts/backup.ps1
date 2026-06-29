$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path -Parent $PSScriptRoot
$DbPath = Join-Path $ProjectDir "data.db"
$BackupDir = Join-Path $ProjectDir "backups"
$MaxBackups = 60
$DateStr = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupFile = Join-Path $BackupDir "data_$DateStr.db"

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

if (-not (Test-Path $DbPath)) {
    Write-Host "[WARN] Database file not found: $DbPath"
    exit 1
}

Copy-Item $DbPath $BackupFile -Force
Write-Host "[OK] Backup created: $BackupFile"

$existing = Get-ChildItem $BackupDir -Filter "data_*.db" | Sort-Object LastWriteTime -Descending
if ($existing.Count -gt $MaxBackups) {
    $toDelete = $existing | Select-Object -Skip $MaxBackups
    $toDelete | ForEach-Object {
        Remove-Item $_.FullName -Force
        Write-Host "[CLEAN] Removed old backup: $($_.Name)"
    }
}

Write-Host "[DONE] Backup completed. Total backups: $($existing.Count)"
