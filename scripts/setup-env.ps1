<#
.SYNOPSIS
    无尽电竞业务系统 - 环境配置脚本

.DESCRIPTION
    设置生产环境所需的环境变量

.PARAMETER AdminPassword
    管理员密码

.PARAMETER JwtSecret
    JWT 密钥（至少32位）

.PARAMETER Action
    操作类型：set（设置）、show（显示）、remove（移除）

.EXAMPLE
    .\setup-env.ps1 -Action set -AdminPassword "your-password" -JwtSecret "your-secret"
    .\setup-env.ps1 -Action show
    .\setup-env.ps1 -Action remove
#>

param(
    [string]$AdminPassword,
    [string]$JwtSecret,
    [ValidateSet("set", "show", "remove")]
    [string]$Action = "show"
)

$ErrorActionPreference = "Stop"

function Write-Info { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Error { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red }

switch ($Action) {
    "set" {
        if (-not $AdminPassword) {
            Write-Error "请提供管理员密码: -AdminPassword <password>"
            exit 1
        }

        if (-not $JwtSecret) {
            Write-Error "请提供 JWT 密钥: -JwtSecret <secret>"
            exit 1
        }

        if ($JwtSecret.Length -lt 32) {
            Write-Error "JWT 密钥长度至少为32位"
            exit 1
        }

        # 设置用户级环境变量
        [System.Environment]::SetEnvironmentVariable('ESPORTS_ADMIN_PASSWORD', $AdminPassword, 'User')
        [System.Environment]::SetEnvironmentVariable('ESPORTS_JWT_SECRET', $JwtSecret, 'User')

        Write-Success "环境变量已设置"
        Write-Info "请重启 PowerShell 窗口使环境变量生效"
        Write-Info "然后执行: pm2 restart esports-club"
    }

    "show" {
        Write-Host "`n当前环境变量配置:" -ForegroundColor Cyan

        $adminPwd = [System.Environment]::GetEnvironmentVariable('ESPORTS_ADMIN_PASSWORD', 'User')
        $jwtSecret = [System.Environment]::GetEnvironmentVariable('ESPORTS_JWT_SECRET', 'User')

        if ($adminPwd) {
            $masked = $adminPwd.Substring(0, [Math]::Min(3, $adminPwd.Length)) + "****"
            Write-Host "  ADMIN_PASSWORD: $masked"
        } else {
            Write-Warn "  ADMIN_PASSWORD: 未设置"
        }

        if ($jwtSecret) {
            $masked = $jwtSecret.Substring(0, [Math]::Min(4, $jwtSecret.Length)) + "****"
            Write-Host "  JWT_SECRET: $masked (长度: $($jwtSecret.Length))"
        } else {
            Write-Warn "  JWT_SECRET: 未设置"
        }

        Write-Host ""
    }

    "remove" {
        [System.Environment]::SetEnvironmentVariable('ESPORTS_ADMIN_PASSWORD', $null, 'User')
        [System.Environment]::SetEnvironmentVariable('ESPORTS_JWT_SECRET', $null, 'User')

        Write-Success "环境变量已移除"
    }
}

# 生成随机密钥的辅助函数
function New-RandomSecret {
    param([int]$Length = 32)
    $chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
    $secret = -join ((1..$Length) | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
    return $secret
}

if ($Action -eq "show") {
    Write-Host "提示: 生成随机密钥命令:" -ForegroundColor Yellow
    Write-Host '  .\setup-env.ps1 -Action show  # 查看当前配置'
    Write-Host '  .\setup-env.ps1 -Action set -AdminPassword "xxx" -JwtSecret "xxx"'
    Write-Host ""
    Write-Host "生成随机 JWT 密钥:" -ForegroundColor Yellow
    Write-Host '  -join ((1..32) | ForEach-Object { [char](Get-Random -Minimum 33 -Maximum 127) })'
    Write-Host ""
}
