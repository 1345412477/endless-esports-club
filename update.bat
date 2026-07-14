@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

title 无尽电竞 - 部署更新工具

:: ==========================================================
::  无尽电竞业务系统 - 一键部署更新脚本
::  用法: 双击运行
::  注意: update.bat 放在桌面，项目路径固定为
::        D:\endless-esports-club
:: ==========================================================

set "PROJECT_DIR=D:\endless-esports-club"
set "BACKUP_DIR=D:\endless-esports-club\backups"
set "DB_PATH=D:\endless-esports-club\data.db"
set "VERSION_FILE=D:\endless-esports-club\.current-version"
set "DEPLOY_LOG=D:\endless-esports-club\deploy.log"
set "PM2_NAME=esports-club"
set "SERVER_PORT=3000"

:: ========== 配置区（可按需修改）==========
set "GIT_REMOTE=origin"
set "BRANCH=main"
:: =========================================

if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

:: ========== 工具函数 ==========

:log
set "_msg_=%*"
set "_time_=%DATE% %TIME%"
echo [%_time_%] %_msg_% >>"%DEPLOY_LOG%"
exit /b 0

:print_step
cls
echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║      无尽电竞业务系统 - 部署更新                  ║
echo  ╚══════════════════════════════════════════════════╝
echo.
echo  [%*]
echo.
exit /b 0

:print_ok
echo  [OK] %*
call :log "[OK] %*"
exit /b 0

:print_info
echo  [..] %*
exit /b 0

:print_warn
echo  [!W] %*
call :log "[WARN] %*"
exit /b 0

:print_err
echo.
echo  [!!] 失败: %*
echo  [!!] 详细错误请查看: %DEPLOY_LOG%
call :log "[ERROR] %*"
pause
exit /b 1

:: ========== 进度条 ==========

:progress_bar
set "_pct_=%~1"
set "_label_=%~2"
set /a "_filled_=%_pct_% / 2"
set "_bar_="
for /l %%i in (1,1,%_filled_%) do set "_bar_=!_bar_!█"
set /a "_empty_=50 - %_filled_%"
for /l %%i in (1,1,%_empty_%) do set "_bar_=!_bar_!░"
echo  ║ !_bar_!║ %_pct_%%

exit /b 0

:: ========== 备份数据库 ==========

:do_backup
call :print_info "备份数据库..."
for /f "tokens=2 delims==" %%a in ('wmic os get localdatetime /value 2^>nul ^| find "="') do set "_dt_=%%a"
if not defined _dt_ set "_dt_=%DATE:/=%%TIME::=%"
set "_dt_=%_dt_:~0,4%%_dt_:~4,2%%_dt_:~6,2%_%_dt_:~8,2%%_dt_:~10,2%%_dt_:~12,2%"

call :get_current_version
set "_bak_name_=backup_%_dt_%_%CURRENT_VER%"

if exist "%DB_PATH%" (
    copy /Y "%DB_PATH%" "%BACKUP_DIR%\%_bak_name_%_data.db" >nul 2>&1
    if !errorlevel! equ 0 (
        call :print_ok "数据库备份完成: %_bak_name_%_data.db"
    ) else (
        call :print_warn "数据库备份失败，继续执行..."
    )
) else (
    call :print_warn "未找到数据库文件，跳过备份"
)

if exist "D:\endless-esports-club\ecosystem.config.js" (
    copy /Y "D:\endless-esports-club\ecosystem.config.js" "%BACKUP_DIR%\%_bak_name_%_ecosystem.config.js" >nul 2>&1
)
call :log "BACKUP: %_bak_name_%"
exit /b 0

:: ========== 健康检查 ==========

:health_check
call :print_info "健康检查..."
set "_hc_retry_=0"
:hc_loop
set /a "_hc_retry_+=1"
if !_hc_retry_! gtr 12 (
    call :print_warn "健康检查超时（已等待约60秒），请手动确认服务状态"
    exit /b 1
)
>nul 2>&1 powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:%SERVER_PORT%' -TimeoutSec 5 -UseBasicParsing; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
if !errorlevel! equ 0 (
    call :print_ok "服务运行正常 (localhost:%SERVER_PORT%)"
    exit /b 0
)
ping -n 6 127.0.0.1 >nul
goto hc_loop

:: ========== 获取版本 ==========

:get_current_version
if exist "%VERSION_FILE%" (
    set /p "CURRENT_VER=" <"%VERSION_FILE%"
    if defined CURRENT_VER exit /b 0
)
for /f "tokens=*" %%a in ('git -C "D:\endless-esports-club" describe --tags --exact-match 2^>nul') do set "CURRENT_VER=%%a"
if not defined CURRENT_VER (
    for /f "tokens=*" %%a in ('git -C "D:\endless-esports-club" rev-parse --abbrev-ref HEAD 2^>nul') do set "CURRENT_VER=branch:%%a"
)
if not defined CURRENT_VER set "CURRENT_VER=unknown"
exit /b 0

:save_version
echo %~1>"%VERSION_FILE%"
exit /b 0

:get_latest_version
for /f "tokens=*" %%a in ('git -C "D:\endless-esports-club" tag -l --sort=-version:refname 2^>nul') do (
    set "LATEST_VER=%%a"
    goto :lv_end
)
:lv_end
if not defined LATEST_VER set "LATEST_VER=%BRANCH%"
exit /b 0

:get_prev_version
set "_prev_found_=0"
for /f "tokens=*" %%a in ('git -C "D:\endless-esports-club" tag -l --sort=-version:refname 2^>nul') do (
    if !_prev_found_! equ 1 (
        set "PREV_VER=%%a"
        goto :pv_end
    )
    set "_prev_found_=1"
)
:pv_end
if not defined PREV_VER set "PREV_VER="
exit /b 0

:: ========== 核心部署流程 ==========

:do_deploy
set "_target_ver_=%~1"

call :print_step "正在部署 %_target_ver_% ..."
call :progress_bar 0 "开始部署"

call :do_backup
if !errorlevel! neq 0 (
    call :print_err 数据库备份失败，请检查磁盘空间和权限
    exit /b 1
)
call :progress_bar 15 "备份完成"

call :print_info "切换到版本 %_target_ver_%..."
if not "%_target_ver_%"=="latest" (
    git -C "D:\endless-esports-club" fetch --tags "%GIT_REMOTE%" 2>&1
)
git -C "D:\endless-esports-club" checkout "%_target_ver_%" --force 2>&1
if !errorlevel! neq 0 (
    call :print_err "Git 切换版本失败，请确认版本号 '%_target_ver_%' 是否存在"
    echo.
    echo   可用版本列表:
    git -C "D:\endless-esports-club" tag -l --sort=-version:refname
    exit /b 1
)
call :print_ok "已切换到 %_target_ver_%"
call :progress_bar 30 "代码切换完成"

call :print_info "安装后端依赖..."
cd /d "D:\endless-esports-club"
call npm install --production 2>&1
if !errorlevel! neq 0 (
    call :print_err "后端依赖安装失败，请检查网络连接或 package.json"
    echo   尝试运行: cd /d "D:\endless-esports-club" ^&^& npm install
    exit /b 1
)
call :print_ok "后端依赖安装完成"
call :progress_bar 50 "后端依赖完成"

call :print_info "安装前端依赖..."
cd /d "D:\endless-esports-club\client"
if not exist "node_modules" (
    call npm install 2>&1
    if !errorlevel! neq 0 (
        call :print_err "前端依赖安装失败，请检查网络连接"
        echo   尝试运行: cd /d "D:\endless-esports-club\client" ^&^& npm install
        exit /b 1
    )
) else (
    call :print_info "前端依赖已存在，跳过安装"
)
call :print_ok "前端依赖就绪"
call :progress_bar 65 "前端依赖完成"

cd /d "D:\endless-esports-club"
call :print_info "构建前端..."
call npm run build 2>&1
if !errorlevel! neq 0 (
    call :print_err "前端构建失败，请检查代码是否有语法错误"
    exit /b 1
)
call :print_ok "前端构建完成"
call :progress_bar 85 "前端构建完成"

call :print_info "重启服务..."
call :save_version "%_target_ver_%"
>nul 2>&1 pm2 reload "%PM2_NAME%"
if !errorlevel! equ 0 (
    call :print_ok "PM2 热重载成功"
) else (
    >nul 2>&1 pm2 restart "%PM2_NAME%"
    if !errorlevel! equ 0 (
        call :print_ok "PM2 重启成功"
    ) else (
        >nul 2>&1 pm2 start "D:\endless-esports-club\ecosystem.config.js" --env production
        if !errorlevel! equ 0 (
            call :print_ok "PM2 已启动"
        ) else (
            call :print_info "PM2 未安装，尝试直接启动..."
            start "" /B node "D:\endless-esports-club\server\index.js"
            call :print_info "已用 node 直接启动"
        )
    )
)
call :progress_bar 95 "服务已重启"

call :health_check
call :progress_bar 100 "部署完成"

echo.
call :print_ok "=================================================="
call :print_ok "  部署成功！"
call :print_ok "  版本: %_target_ver_%"
call :print_ok "  时间: %DATE% %TIME%"
call :print_ok "=================================================="
call :log "DEPLOY_SUCCESS: %_target_ver_%"

cd /d "D:\endless-esports-club"
exit /b 0

:: ========== 列出版本 ==========

:list_versions
call :print_step "可用版本列表"
call :get_current_version
echo  当前版本: %CURRENT_VER%
echo.
echo  ─── Git 标签版本 ───
echo.
set "_idx_=0"
for /f "tokens=*" %%a in ('git -C "D:\endless-esports-club" tag -l --sort=-version:refname 2^>nul') do (
    set /a "_idx_+=1"
    if !_idx_! lss 10 (
        echo   [!_idx_!]  %%a
    ) else (
        echo   [!_idx_!] %%a
    )
)
if !_idx_! equ 0 (
    echo   (暂无标签版本)
    echo   提示: 使用 git tag v1.0.0 ^&^& git push origin v1.0.0 创建版本
)
echo.
echo  ─── 快捷命令 ───
echo   [L]  latest  - 部署最新版本
echo   [R]  rollback- 回滚到上一版本
echo   [Q]  quit    - 退出
echo.
exit /b 0

:: ========== 交互选择 ==========

:interactive_select
call :list_versions
set "_choice_="
set /p "_choice_=请输入选择 [1-9/L/R/Q]: "

if /i "!_choice_!"=="Q" (
    echo  已取消部署
    exit /b 0
)
if /i "!_choice_!"=="L" (
    call :get_latest_version
    if not defined LATEST_VER (
        call :print_err "没有找到任何版本标签"
        pause
        exit /b 1
    )
    echo  即将部署最新版本: %LATEST_VER%
    choice /c YN /M "确认部署"
    if !errorlevel! equ 1 (
        call :do_deploy "%LATEST_VER%"
    )
    goto :is_end
)
if /i "!_choice_!"=="R" (
    call :get_prev_version
    if not defined PREV_VER (
        call :print_err "没有找到上一个版本，无法回滚"
        pause
        exit /b 1
    )
    echo  即将回滚到: %PREV_VER%
    choice /c YN /M "确认回滚"
    if !errorlevel! equ 1 (
        call :do_deploy "%PREV_VER%"
    )
    goto :is_end
)

set "_ver_="
set "_idx_=0"
for /f "tokens=*" %%a in ('git -C "D:\endless-esports-club" tag -l --sort=-version:refname 2^>nul') do (
    set /a "_idx_+=1"
    if "!_idx_!"=="%_choice_%" set "_ver_=%%a"
)
if not defined _ver_ (
    call :print_err "无效选择: %_choice_%"
    pause
    exit /b 1
)
echo  即将部署: %_ver_%
choice /c YN /M "确认部署"
if !errorlevel! equ 1 (
    call :do_deploy "%_ver_%"
)
:is_end
exit /b 0

:: ========== 主入口 ==========

cls
echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║                                                  ║
echo  ║        无尽电竞业务系统 - 一键部署更新             ║
echo  ║         Endless Esports Club - Deploy Tool        ║
echo  ║                                                  ║
echo  ╚══════════════════════════════════════════════════╝
echo.

:: 检查 Git 仓库
git -C "D:\endless-esports-club" status >nul 2>&1
if !errorlevel! neq 0 (
    call :print_err "D:\endless-esports-club 不是 Git 仓库"
    pause
    exit /b 1
)
call :print_ok "Git 仓库正常"

:: 检查 Node.js
where node >nul 2>&1
if !errorlevel! neq 0 (
    call :print_err "未检测到 Node.js，请先安装 Node.js"
    pause
    exit /b 1
)
for /f "tokens=1-3 delims=v." %%a in ('node -v') do set "NODE_V=%%a.%%b.%%c"
call :print_ok "Node.js %NODE_V%"

:: 检查 npm
where npm >nul 2>&1
if !errorlevel! neq 0 (
    call :print_err "未检测到 npm"
    pause
    exit /b 1
)

call :get_current_version
echo  当前版本: %CURRENT_VER%
echo  项目目录: D:\endless-esports-club
echo  日志文件: %DEPLOY_LOG%
echo.

if not "%1"=="" (
    if /i "%1"=="list" (
        call :list_versions
        goto :end
    )
    if /i "%1"=="rollback" (
        call :get_current_version
        call :get_prev_version
        if not defined PREV_VER (
            echo  当前版本: %CURRENT_VER%
            call :print_err "没有找到上一个版本"
            goto :end
        )
        echo  当前版本: %CURRENT_VER%  ^|  回滚目标: %PREV_VER%
        choice /c YN /M "确认回滚"
        if !errorlevel! equ 1 call :do_deploy "%PREV_VER%"
        goto :end
    )
    if /i "%1"=="latest" (
        call :get_latest_version
        if not defined LATEST_VER (
            call :print_err "没有找到任何版本标签"
            goto :end
        )
        echo  当前版本: %CURRENT_VER%  ^|  最新版本: %LATEST_VER%
        choice /c YN /M "确认部署"
        if !errorlevel! equ 1 call :do_deploy "%LATEST_VER%"
        goto :end
    )
    echo  当前版本: %CURRENT_VER%  ^|  目标版本: %1
    choice /c YN /M "确认部署"
    if !errorlevel! equ 1 call :do_deploy "%1"
    goto :end
)

if /i "%CURRENT_VER%"=="unknown" (
    call :get_latest_version
    if defined LATEST_VER (
        call :do_deploy "%LATEST_VER%"
    ) else (
        call :print_err "没有找到版本标签"
    )
    goto :end
)

call :interactive_select

:end
echo.
call :print_info "按任意键退出..."
pause >nul