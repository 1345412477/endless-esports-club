<#
.SYNOPSIS
    无尽电竞业务系统 - 自动化部署脚本

.DESCRIPTION
    支持版本切换、自动备份、回滚、依赖安装、前端构建和服务重启

.PARAMETER Version
    部署到指定版本标签（如 v1.1.0）

.PARAMETER Latest
    部署到最新版本

.PARAMETER Action
    执行指定操作：backup（备份）、restore（恢复）、rollback（回滚）

.PARAMETER BackupFile
    恢复操作时指定的备份文件路径

.EXAMPLE
    .\deploy.ps1 -Version v1.1.0
    .\deploy.ps1 -Latest
    .\deploy.ps1 -Action backup
    .\deploy.ps1 -Action restore -BackupFile "backups\data_20260702_120000.db"
    .\deploy.ps1 -Action rollback
#>

param(
    [string]$Version,
    [switch]$Latest,
    [string]$Action,
    [string]$BackupFile
)

$ErrorActionPreference = "Stop"

# 项目根目录
$ProjectDir = Split-Path -Parent $PSScriptRoot
$DbPath = Join-Path $ProjectDir "data.db"
$BackupDir = Join-Path $ProjectDir "backups"
$VersionFile = Join-Path $ProjectDir ".current-version"
$DeployLog = Join-Path $ProjectDir "deploy.log"

# 颜色输出函数
function Write-Info { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Error { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red }
function Write-Step { param($msg) Write-Host "`n>> $msg" -ForegroundColor Magenta }

# 日志函数
function Write-Log {
    param($msg)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp - $msg" | Out-File -Append -FilePath $DeployLog -Encoding UTF8
}

# 检查是否在 Git 仓库中
function Test-GitRepo {
    $gitDir = Join-Path $ProjectDir ".git"
    return Test-Path $gitDir
}

# 获取当前版本
function Get-CurrentVersion {
    if (Test-Path $VersionFile) {
        return Get-Content $VersionFile -Raw
    }
    # 尝试从 git 获取
    try {
        Push-Location $ProjectDir
        $tag = git describe --tags --exact-match 2>$null
        if ($tag) { return $tag.Trim() }
        $branch = git rev-parse --abbrev-ref HEAD
        return "branch:$branch"
    } finally {
        Pop-Location
    }
}

# 保存当前版本
function Save-CurrentVersion {
    param([string]$ver)
    $ver | Out-File -FilePath $VersionFile -Encoding UTF8 -NoNewline
}

# 备份函数
function Invoke-Backup {
    Write-Step "执行备份"

    if (-not (Test-Path $BackupDir)) {
        New-Item -ItemType Directory -Path $BackupDir | Out-Null
    }

    $currentVersion = Get-CurrentVersion
    $DateStr = Get-Date -Format "yyyyMMdd_HHmmss"
    $BackupPrefix = "backup_${DateStr}_${currentVersion}"

    # 备份数据库
    if (Test-Path $DbPath) {
        $DbBackup = Join-Path $BackupDir "${BackupPrefix}_data.db"
        Copy-Item $DbPath $DbBackup -Force
        Write-Success "数据库备份: $DbBackup"
    } else {
        Write-Warn "数据库文件不存在，跳过数据库备份"
    }

    # 备份配置文件
    $ConfigFiles = @("ecosystem.config.js")
    foreach ($file in $ConfigFiles) {
        $filePath = Join-Path $ProjectDir $file
        if (Test-Path $filePath) {
            $configBackup = Join-Path $BackupDir "${BackupPrefix}_${file}"
            Copy-Item $filePath $configBackup -Force
            Write-Success "配置备份: $configBackup"
        }
    }

    # 保存版本信息到备份
    $VersionInfo = @{
        version = $currentVersion
        timestamp = $DateStr
        commit = if (Test-GitRepo) { git rev-parse --short HEAD } else { "no-git" }
    } | ConvertTo-Json
    $VersionInfo | Out-File -FilePath (Join-Path $BackupDir "${BackupPrefix}_version.json") -Encoding UTF8

    Write-Log "Backup created: $BackupPrefix"
    return $BackupPrefix
}

# 恢复函数
function Invoke-Restore {
    param([string]$backupFile)

    if (-not $backupFile) {
        Write-Error "请指定备份文件路径"
        exit 1
    }

    if (-not (Test-Path $backupFile)) {
        Write-Error "备份文件不存在: $backupFile"
        exit 1
    }

    Write-Step "恢复数据库"

    # 停止服务
    Write-Info "停止服务..."
    pm2 stop esports-club 2>$null

    # 恢复数据库
    Copy-Item $backupFile $DbPath -Force
    Write-Success "数据库已恢复: $backupFile"

    # 启动服务
    Write-Info "启动服务..."
    pm2 start esports-club
    Write-Success "服务已启动"

    Write-Log "Restored from: $backupFile"
}

# 回滚到上一版本
function Invoke-Rollback {
    Write-Step "执行回滚"

    if (-not (Test-GitRepo)) {
        Write-Error "不是 Git 仓库，无法回滚"
        exit 1
    }

    # 获取上一个标签
    Push-Location $ProjectDir
    try {
        $tags = git tag -l --sort=-version:refname | Select-Object -First 5
        if ($tags.Count -lt 2) {
            Write-Error "没有可回滚的版本"
            exit 1
        }

        $currentTag = $tags[0]
        $previousTag = $tags[1]

        Write-Info "当前版本: $currentTag"
        Write-Info "回滚到: $previousTag"

        # 先备份
        Invoke-Backup

        # 切换到上一版本
        Write-Info "切换代码版本..."
        git checkout $previousTag --force

        # 重新构建
        Invoke-Build

        Save-CurrentVersion $previousTag
        Write-Success "已回滚到 $previousTag"
        Write-Log "Rolled back to: $previousTag"

    } finally {
        Pop-Location
    }
}

# 安装依赖
function Invoke-InstallDeps {
    Write-Step "安装依赖"

    Push-Location $ProjectDir
    try {
        Write-Info "安装后端依赖..."
        npm install --production
        Write-Success "后端依赖安装完成"

        Write-Info "安装前端依赖..."
        Push-Location "client"
        npm install
        Pop-Location
        Write-Success "前端依赖安装完成"
    } finally {
        Pop-Location
    }
}

# 构建前端
function Invoke-Build {
    Write-Step "构建前端"

    Push-Location $ProjectDir
    try {
        Write-Info "执行前端构建..."
        npm run build
        Write-Success "前端构建完成"
    } finally {
        Pop-Location
    }
}

# 部署到指定版本
function Invoke-DeployVersion {
    param([string]$targetVersion)

    if (-not (Test-GitRepo)) {
        Write-Error "不是 Git 仓库，无法使用版本部署"
        exit 1
    }

    Push-Location $ProjectDir
    try {
        # 检查标签是否存在
        $tagExists = git tag -l | Where-Object { $_ -eq $targetVersion }
        if (-not $tagExists) {
            Write-Error "版本标签不存在: $targetVersion"
            Write-Info "可用版本:"
            git tag -l --sort=-version:refname | Select-Object -First 10
            exit 1
        }

        $currentVersion = Get-CurrentVersion
        Write-Info "当前版本: $currentVersion"
        Write-Info "目标版本: $targetVersion"

        if ($currentVersion -eq $targetVersion) {
            Write-Warn "已经是目标版本，无需部署"
            return
        }

        # 备份当前版本
        Write-Step "备份当前版本"
        Invoke-Backup

        # 停止服务
        Write-Step "停止服务"
        pm2 stop esports-club 2>$null

        # 切换版本
        Write-Step "切换到目标版本"
        git fetch --tags
        git checkout $targetVersion --force

        # 安装依赖
        Invoke-InstallDeps

        # 构建前端
        Invoke-Build

        # 重启服务
        Write-Step "重启服务"
        pm2 restart esports-club

        # 保存版本信息
        Save-CurrentVersion $targetVersion

        Write-Success "部署完成: $targetVersion"
        Write-Log "Deployed version: $targetVersion"

        # 健康检查
        Start-Sleep -Seconds 3
        Invoke-HealthCheck

    } finally {
        Pop-Location
    }
}

# 部署最新版本
function Invoke-DeployLatest {
    if (-not (Test-GitRepo)) {
        Write-Error "不是 Git 仓库，无法使用版本部署"
        exit 1
    }

    Push-Location $ProjectDir
    try {
        $latestTag = git tag -l --sort=-version:refname | Select-Object -First 1
        if (-not $latestTag) {
            Write-Error "没有找到任何版本标签"
            exit 1
        }

        Write-Info "最新版本: $latestTag"
        Invoke-DeployVersion $latestTag
    } finally {
        Pop-Location
    }
}

# 健康检查
function Invoke-HealthCheck {
    Write-Step "健康检查"

    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 10 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            Write-Success "服务运行正常"
            return $true
        } else {
            Write-Error "服务返回异常状态: $($response.StatusCode)"
            return $false
        }
    } catch {
        Write-Error "服务无响应: $_"
        return $false
    }
}

# 列出可用版本
function Show-AvailableVersions {
    if (-not (Test-GitRepo)) {
        Write-Warn "不是 Git 仓库"
        return
    }

    Push-Location $ProjectDir
    try {
        Write-Host "`n可用版本:" -ForegroundColor Cyan
        git tag -l --sort=-version:refname | Select-Object -First 10 | ForEach-Object {
            $date = git log -1 --format="%ci" $_
            Write-Host "  $_ ($date)"
        }
    } finally {
        Pop-Location
    }
}

# 列出备份文件
function Show-Backups {
    if (-not (Test-Path $BackupDir)) {
        Write-Warn "没有备份文件"
        return
    }

    Write-Host "`n备份文件:" -ForegroundColor Cyan
    Get-ChildItem $BackupDir -Filter "backup_*_data.db" |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 10 |
        ForEach-Object {
            $size = [math]::Round($_.Length / 1KB, 2)
            Write-Host "  $($_.Name) ($size KB) - $($_.LastWriteTime)"
        }
}

# 显示帮助
function Show-Help {
    Write-Host @"

无尽电竞业务系统 - 部署脚本

用法:
  .\deploy.ps1 -Version <version>     部署到指定版本
  .\deploy.ps1 -Latest                部署到最新版本
  .\deploy.ps1 -Action backup         仅执行备份
  .\deploy.ps1 -Action restore -BackupFile <path>   恢复指定备份
  .\deploy.ps1 -Action rollback       回滚到上一版本
  .\deploy.ps1 -Action list-versions  列出可用版本
  .\deploy.ps1 -Action list-backups   列出备份文件
  .\deploy.ps1 -Action health         健康检查

示例:
  .\deploy.ps1 -Version v1.1.0
  .\deploy.ps1 -Latest
  .\deploy.ps1 -Action backup
  .\deploy.ps1 -Action restore -BackupFile "backups\backup_20260702_120000_v1.0.0_data.db"

"@ -ForegroundColor Yellow
}

# 主逻辑
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  无尽电竞业务系统 - 部署工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($Action) {
    switch ($Action) {
        "backup" { Invoke-Backup }
        "restore" { Invoke-Restore $BackupFile }
        "rollback" { Invoke-Rollback }
        "list-versions" { Show-AvailableVersions }
        "list-backups" { Show-Backups }
        "health" { Invoke-HealthCheck }
        default {
            Write-Error "未知操作: $Action"
            Show-Help
            exit 1
        }
    }
} elseif ($Version) {
    Invoke-DeployVersion $Version
} elseif ($Latest) {
    Invoke-DeployLatest
} else {
    Show-Help
    Show-AvailableVersions
    Show-Backups
}

Write-Host ""
Write-Success "操作完成"
