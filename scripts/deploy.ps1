<#
.SYNOPSIS
    无尽电竞业务系统 - 自动化部署脚本
.DESCRIPTION
    支持版本切换、自动备份、回滚、依赖安装、前端构建和服务重启
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
    Write-Step "执行备份"
    if (-not (Test-Path $BackupDir)) {
        New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
    }
    $ver = Get-CurrentVersion
    $ts = Get-Date -Format "yyyyMMdd_HHmmss"
    $prefix = "backup_${ts}_${ver}"

    if (Test-Path $DbPath) {
        $dbBak = Join-Path $BackupDir "${prefix}_data.db"
        Copy-Item $DbPath $dbBak -Force
        Write-OK "数据库备份: $dbBak"
    }
    else {
        Write-Warn "数据库文件不存在，跳过备份"
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
    if (-not $backupFile) { Write-Err "请指定备份文件路径"; return }
    if (-not (Test-Path $backupFile)) { Write-Err "备份文件不存在: $backupFile"; return }

    Write-Step "恢复数据库"
    Write-Info "停止服务..."
    pm2 stop esports-club 2>$null
    Copy-Item $backupFile $DbPath -Force
    Write-OK "数据库已恢复"
    Write-Info "启动服务..."
    pm2 start esports-club 2>$null
    Write-OK "服务已启动"
    Write-Log "Restored from: $backupFile"
}

function Invoke-Rollback {
    Write-Step "执行回滚"
    if (-not (Test-GitRepo)) { Write-Err "不是 Git 仓库"; return }

    Push-Location $ProjectDir
    try {
        $tags = git tag -l --sort=-version:refname | Select-Object -First 5
        if ($tags.Count -lt 2) { Write-Err "没有可回滚的版本"; return }

        $prev = $tags[1]
        Write-Info "当前版本: $($tags[0])"
        Write-Info "回滚到: $prev"

        Invoke-Backup
        Write-Info "切换代码..."
        git checkout $prev --force
        Invoke-Build
        Save-CurrentVersion $prev
        Write-OK "已回滚到 $prev"
        Write-Log "Rolled back to: $prev"
    }
    catch { Write-Err "回滚失败: $_" }
    finally { Pop-Location }
}

function Invoke-InstallDeps {
    Write-Step "安装依赖"
    Push-Location $ProjectDir
    try {
        Write-Info "后端依赖..."
        npm install --production
        Write-Info "前端依赖..."
        Push-Location "client"
        npm install
        Pop-Location
        Write-OK "依赖安装完成"
    }
    catch { Write-Err "依赖安装失败: $_" }
    finally { Pop-Location }
}

function Invoke-Build {
    Write-Step "构建前端"
    Push-Location $ProjectDir
    try {
        npm run build
        Write-OK "构建完成"
    }
    catch { Write-Err "构建失败: $_" }
    finally { Pop-Location }
}

function Invoke-DeployVersion {
    param([string]$targetVersion)
    if (-not (Test-GitRepo)) { Write-Err "不是 Git 仓库"; return }

    Push-Location $ProjectDir
    try {
        $exists = git tag -l | Where-Object { $_ -eq $targetVersion }
        if (-not $exists) {
            Write-Err "标签不存在: $targetVersion"
            Write-Info "可用版本:"
            git tag -l --sort=-version:refname | Select-Object -First 10
            return
        }

        $cur = Get-CurrentVersion
        Write-Info "当前: $cur -> 目标: $targetVersion"
        if ($cur -eq $targetVersion) { Write-Warn "已是目标版本"; return }

        Invoke-Backup
        Write-Step "停止服务"
        pm2 stop esports-club 2>$null

        Write-Step "切换版本"
        git fetch --tags
        git checkout $targetVersion --force

        Invoke-InstallDeps
        Invoke-Build

        Write-Step "重启服务"
        pm2 restart esports-club 2>$null
        Save-CurrentVersion $targetVersion
        Write-OK "部署完成: $targetVersion"
        Write-Log "Deployed: $targetVersion"

        Start-Sleep -Seconds 3
        Invoke-HealthCheck
    }
    catch { Write-Err "部署失败: $_" }
    finally { Pop-Location }
}

function Invoke-DeployLatest {
    if (-not (Test-GitRepo)) { Write-Err "不是 Git 仓库"; return }
    Push-Location $ProjectDir
    try {
        $latest = git tag -l --sort=-version:refname | Select-Object -First 1
        if (-not $latest) { Write-Err "没有版本标签"; return }
        Invoke-DeployVersion $latest
    }
    catch { Write-Err "部署失败: $_" }
    finally { Pop-Location }
}

function Invoke-HealthCheck {
    Write-Step "健康检查"
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 10 -UseBasicParsing
        if ($r.StatusCode -eq 200) {
            Write-OK "服务运行正常"
            return $true
        }
        Write-Err "状态异常: $($r.StatusCode)"
        return $false
    }
    catch {
        Write-Err "服务无响应: $_"
        return $false
    }
}

function Show-Versions {
    if (-not (Test-GitRepo)) { Write-Warn "非 Git 仓库"; return }
    Push-Location $ProjectDir
    try {
        Write-Host ""; Write-Host "可用版本:" -ForegroundColor Cyan
        git tag -l --sort=-version:refname | Select-Object -First 10 | ForEach-Object {
            $d = git log -1 --format="%ci" $_ 2>$null
            Write-Host "  $_  ($d)"
        }
    }
    catch {}
    finally { Pop-Location }
}

function Show-Backups {
    if (-not (Test-Path $BackupDir)) { Write-Warn "无备份文件"; return }
    Write-Host ""; Write-Host "备份文件:" -ForegroundColor Cyan
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
    Write-Host "无尽电竞业务系统 - 部署脚本" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "用法:" -ForegroundColor Cyan
    Write-Host "  .\deploy.ps1                         查看帮助和状态"
    Write-Host "  .\deploy.ps1 -Version v1.1.0         部署到指定版本"
    Write-Host "  .\deploy.ps1 -Latest                 部署最新版本"
    Write-Host "  .\deploy.ps1 -Action backup          仅备份"
    Write-Host "  .\deploy.ps1 -Action rollback        回滚到上一版本"
    Write-Host "  .\deploy.ps1 -Action restore -BackupFile <path>  恢复备份"
    Write-Host "  .\deploy.ps1 -Action list-versions   列出可用版本"
    Write-Host "  .\deploy.ps1 -Action list-backups    列出备份"
    Write-Host "  .\deploy.ps1 -Action health          健康检查"
    Write-Host ""
}

# === 主逻辑 ===
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  无尽电竞业务系统 - 部署工具" -ForegroundColor Cyan
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
            Write-Err "未知操作: $Action"
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
Write-OK "操作完成"