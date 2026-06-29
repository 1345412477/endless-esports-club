# 无尽电竞业务系统 - 花生壳固定域名部署方案

## 一、部署架构

```
公网用户 → 花生壳固定域名 → 花生壳客户端(内网穿透) → 部署电脑:3000 → Node.js服务
```

## 二、部署准备

### 2.1 硬件要求
- 空余电脑一台（Windows 10/11 系统）
- CPU：双核及以上
- 内存：4GB 及以上
- 硬盘：至少 10GB 可用空间
- 网络：能稳定上网，建议有线连接

### 2.2 软件安装
1. **Node.js**
   - 下载地址：https://nodejs.org/ （选 LTS 版本，推荐 v20.x）
   - 安装时勾选 "Add to PATH"
   - 验证：打开 PowerShell，执行 `node -v` 和 `npm -v`

2. **PM2（进程管理器）**
   ```powershell
   npm install -g pm2
   npm install -g pm2-windows-startup
   pm2-startup install
   ```

3. **花生壳客户端**
   - 官网：https://hsk.oray.com/
   - 下载并安装 Windows 版客户端
   - 注册/登录贝锐账号
   - 购买花生壳付费版（支持固定域名）

## 三、项目部署步骤

### 3.1 上传项目文件
将整个 `cs-worker-system` 文件夹复制到部署电脑，建议放在非系统盘：
```
D:\esports-club\cs-worker-system\
```

### 3.2 安装依赖
```powershell
cd D:\esports-club\cs-worker-system
npm install
cd client
npm install
```

### 3.3 构建前端
```powershell
cd D:\esports-club\cs-worker-system
npm run build
```

### 3.4 配置环境变量
编辑 `ecosystem.config.js`，修改以下配置：

```javascript
env: {
  NODE_ENV: 'production',
  PORT: 3000,
  ADMIN_PASSWORD: '你的管理员强密码',   // 改成复杂密码
  JWT_SECRET: '你的随机密钥至少32位字符',  // 改成随机字符串
  JWT_EXPIRES_IN: '24h',
}
```

> 提示：JWT_SECRET 可以用以下方式生成随机字符串：
> ```powershell
> -join ((1..32) | ForEach-Object { [char](Get-Random -Minimum 33 -Maximum 127) })
> ```

### 3.5 启动服务
```powershell
cd D:\esports-club\cs-worker-system
pm2 start ecosystem.config.js
pm2 save
```

### 3.6 验证服务
浏览器打开 `http://localhost:3000`，确认能看到人员查询页面。

## 四、花生壳配置（固定域名）

### 4.1 购买花生壳服务
1. 登录花生壳官网：https://hsk.oray.com/
2. 购买支持固定域名的套餐（如标准版）
3. 在控制台中设置你的固定二级域名

### 4.2 配置内网映射
1. 打开花生壳客户端并登录
2. 点击「内网穿透」→「添加映射」
3. 填写配置：
   - **映射名称**：电竞业务系统
   - **映射类型**：HTTP 或 HTTPS
   - **外网域名**：选择你购买的固定域名
   - **外网端口**：80（HTTP）或 443（HTTPS）
   - **内网主机**：127.0.0.1
   - **内网端口**：3000
4. 点击「确定」保存

### 4.3 验证外网访问
1. 用手机4G网络（不要连WiFi）
2. 浏览器打开你的花生壳域名
3. 确认能正常访问系统

## 五、数据备份（重要！）

### 5.1 手动备份
```powershell
cd D:\esports-club\cs-worker-system
.\scripts\backup.ps1
```
备份文件会保存在 `backups/` 目录下。

### 5.2 设置自动定时备份
1. 打开「任务计划程序」（Win+S 搜索"任务计划程序"）
2. 点击右侧「创建基本任务」
3. 名称：电竞系统数据备份
4. 触发器：每天，凌晨 3:00
5. 操作：启动程序
6. 程序或脚本：`powershell.exe`
7. 添加参数：`-ExecutionPolicy Bypass -File "D:\esports-club\cs-worker-system\scripts\backup.ps1"`
8. 完成创建

## 六、日常运维命令

```powershell
# 查看服务状态
pm2 status

# 查看实时日志
pm2 logs esports-club

# 重启服务
pm2 restart esports-club

# 停止服务
pm2 stop esports-club

# 启动服务
pm2 start esports-club

# 查看详细信息
pm2 show esports-club
```

## 七、代码更新流程

当系统有代码更新时：

```powershell
# 1. 用新代码覆盖旧代码（注意不要覆盖 data.db 和 backups 目录！）

# 2. 重新安装依赖（如果有新依赖）
cd D:\esports-club\cs-worker-system
npm install
cd client
npm install
cd ..

# 3. 重新构建前端
npm run build

# 4. 重启服务
pm2 restart esports-club
```

## 八、安全建议

1. **修改默认管理员密码**：在 ecosystem.config.js 中设置强密码
2. **设置 JWT 密钥**：使用随机生成的 32 位以上字符串
3. **定期备份**：务必开启自动定时备份
4. **Windows 电源设置**：关闭电脑自动休眠/睡眠
   - 控制面板 → 电源选项 → 更改计算机睡眠时间 → 全部设为"从不"
5. **Windows 更新**：设置为手动更新，避免半夜自动重启
6. **花生壳账号安全**：开启贝锐账号的二次验证

## 九、常见问题

### Q1: 服务启动后外网访问不了？
A: 检查以下几点：
- 花生壳客户端是否在线
- 内网映射配置是否正确
- 本地 `http://localhost:3000` 是否能访问
- Windows 防火墙是否阻止了 Node.js

### Q2: 电脑重启后服务没自动启动？
A: 确保执行了 `pm2-startup install` 和 `pm2 save`

### Q3: 数据库文件在哪里？
A: `cs-worker-system/data.db`，这个文件很重要，定期备份！

### Q4: 如何恢复备份？
A: 停止服务后，用备份文件覆盖 data.db：
```powershell
pm2 stop esports-club
Copy-Item backups\data_xxx.db data.db -Force
pm2 start esports-club
```

### Q5: 忘记管理员密码怎么办？
A: 编辑 `ecosystem.config.js` 中的 `ADMIN_PASSWORD`，然后 `pm2 restart esports-club`

## 十、文件目录说明

```
cs-worker-system/
├── server/              # 后端代码
├── client/              # 前端源码
│   └── dist/            # 前端构建产物（生产环境用这个）
├── scripts/
│   └── backup.ps1       # 备份脚本
├── backups/             # 备份文件目录（自动创建）
├── logs/                # PM2 日志目录
├── data.db              # SQLite 数据库文件（最重要！）
├── ecosystem.config.js  # PM2 启动配置
└── package.json         # 项目依赖
```
