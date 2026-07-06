<#
.SYNOPSIS
    无尽电竞业务系统 - 健康检查脚本

.DESCRIPTION
    检查服务运行状态，可用于定时任务监控

.PARAMETER Url
    检查的 URL，默认 http://localhost:3000

.PARAMETER Timeout
    超时时间（秒），默认 10

.PARAMETER Quiet
    静默模式，仅返回退出码

.EXAMPLE
    .\health-check.ps1
    .\health-check.ps1 -Url "http://localhost:3000" -Timeout 5
    .\health-check.ps1 -Quiet
#>

param(
    [string]$Url = "http://localhost:3000",
    [int]$Timeout = 10,
    [switch]$Quiet
)

$ErrorActionPreference = "Stop"

function Write-Info { param($msg) if (-not $Quiet) { Write-Host "[INFO] $msg" -ForegroundColor Cyan } }
function Write-Success { param($msg) if (-not $Quiet) { Write-Host "[OK] $msg" -ForegroundColor Green } }
function Write-Error { param($msg) if (-not $Quiet) { Write-Host "[ERROR] $msg" -ForegroundColor Red } }

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

try {
    # 检查 PM2 进程状态
    $pm2Status = pm2 list 2>$null | Select-String "esports-club"
    if (-not $pm2Status) {
        Write-Error "PM2 进程不存在"
        exit 1
    }

    if ($pm2Status -match "errored|stopped") {
        Write-Error "PM2 进程状态异常: $pm2Status"
        exit 1
    }

    # HTTP 健康检查
    $response = Invoke-WebRequest -Uri $Url -TimeoutSec $Timeout -UseBasicParsing

    if ($response.StatusCode -eq 200) {
        Write-Success "服务正常运行 ($timestamp)"
        exit 0
    } else {
        Write-Error "服务返回异常状态码: $($response.StatusCode)"
        exit 1
    }

} catch {
    Write-Error "服务无响应: $($_.Exception.Message)"
    exit 1
}
