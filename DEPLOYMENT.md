# 无尽电竞业务系统 - 远程部署与版本管理方案

## 一、部署架构概览

```
┌─────────────────┐
│   公网用户访问   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  花生壳固定域名  │  ← 外网入口
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  花生壳客户端    │  ← 内网穿透
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  部署电脑:3000   │  ← 目标服务器
│  Node.js + PM2  │
└─────────────────┘
```

## 二、版本管理规范

### 2.1 Git 分支策略

```
main (生产环境)
  │
  ├── develop (开发环境)
  │     │
  │     ├── feature/xxx (功能分支)
  │     │
  │     └── feature/yyy
  │
  └── hotfix/xxx (紧急修复)
```

**分支说明：**
- `main`: 生产环境代码，始终可部署
- `develop`: 开发集成分支
- `feature/*`: 新功能开发
- `hotfix/*`: 生产环境紧急修复

### 2.2 版本标签规范

采用语义化版本 (Semantic Versioning): `v主版本.次版本.修订号`

```
v1.0.0 - 首次稳定发布
v1.1.0 - 新增功能（向后兼容）
v1.1.1 - Bug 修复
v2.0.0 - 重大更新（不兼容变更）
```

**标签命名规则：**
```bash
# 正式版本
v1.0.0

# 预发布版本
v1.0.0-rc.1

# 测试版本
v1.0.0-beta.1
```

### 2.3 提交信息规范

```
feat: 新增订单导出功能
fix: 修复结算金额计算错误
docs: 更新部署文档
refactor: 重构权限验证逻辑
test: 添加订单模块测试
chore: 更新依赖版本
```

## 三、远程部署流程

### 3.1 首次部署准备

#### 在开发机器上：

```powershell
# 1. 初始化 Git 仓库（如果还没有）
cd "c:\Users\13454\Desktop\trae project\endless-esports-club\cs-worker-system"
git init
git add .
git commit -m "feat: 初始版本提交"

# 2. 创建远程仓库（GitHub/Gitee/GitLab）
# 以 GitHub 为例：
gh repo create esports-club --private --source=. --push

# 3. 打标签
git tag -a v1.0.0 -m "首次稳定发布"
git push origin main --tags
```

#### 在目标服务器上：

```powershell
# 1. 安装必要软件
# - Node.js v20.x LTS
# - Git
# - PM2
# - 花生壳客户端

# 2. 克隆项目
cd D:\
git clone https://github.com/your-username/esports-club.git
cd esports-club

# 3. 安装依赖
npm install
cd client && npm install && cd ..

# 4. 构建前端
npm run build

# 5. 配置环境变量
# 编辑 ecosystem.config.js，设置：
# - ADMIN_PASSWORD: 强密码
# - JWT_SECRET: 随机字符串（32位以上）

# 6. 启动服务
pm2 start ecosystem.config.js
pm2 save
pm2-startup install

# 7. 配置花生壳内网穿透
# - 映射类型: HTTP
# - 外网域名: 你的固定域名
# - 内网主机: 127.0.0.1
# - 内网端口: 3000
```

### 3.2 版本更新流程

#### 方式一：Git 拉取更新（推荐）

```powershell
# 在目标服务器上执行
cd D:\esports-club

# 1. 查看可用版本
git tag -l

# 2. 备份当前版本和数据
.\scripts\deploy.ps1 -Action backup

# 3. 切换到新版本
git fetch --tags
git checkout v1.1.0

# 4. 安装新依赖（如果有）
npm install
cd client && npm install && cd ..

# 5. 重新构建前端
npm run build

# 6. 执行数据库迁移（如果有）
npm run migrate

# 7. 重启服务
pm2 restart esports-club

# 8. 验证服务
pm2 status
# 浏览器访问测试
```

#### 方式二：自动化部署脚本

```powershell
# 一键部署到指定版本
.\scripts\deploy.ps1 -Version v1.1.0

# 部署最新版本
.\scripts\deploy.ps1 -Latest

# 仅备份不更新
.\scripts\deploy.ps1 -Action backup
```

## 四、回滚策略

### 4.1 快速回滚流程

```powershell
# 在目标服务器上执行
cd D:\esports-club

# 1. 停止服务
pm2 stop esports-club

# 2. 回滚代码到上一版本
git checkout v1.0.0

# 3. 恢复数据库备份
.\scripts\deploy.ps1 -Action restore -BackupFile "backups\data_20260702_120000.db"

# 4. 重新构建（如果前端有变化）
npm run build

# 5. 启动服务
pm2 start esports-club
```

### 4.2 回滚决策树

```
发现问题
  │
  ├─ 前端显示问题？
  │   └─ 仅需重新构建前端：npm run build
  │
  ├─ 后端接口错误？
  │   └─ 回滚代码 + 重启服务
  │
  ├─ 数据异常？
  │   └─ 回滚代码 + 恢复数据库备份
  │
  └─ 配置问题？
      └─ 修改 ecosystem.config.js + 重启
```

### 4.3 数据库回滚

```powershell
# 查看所有备份
Get-ChildItem backups | Sort-Object LastWriteTime -Descending

# 恢复到指定备份
pm2 stop esports-club
Copy-Item "backups\data_20260702_120000.db" "data.db" -Force
pm2 start esports-club
```

## 五、数据库迁移管理

### 5.1 迁移文件结构

```
migrations/
├── 001_create_initial_tables.sql
├── 002_add_employee_rating.sql
├── 003_modify_order_status.sql
└── migrate.js
```

### 5.2 执行迁移

```powershell
# 自动执行所有未应用的迁移
npm run migrate

# 仅查看迁移状态
npm run migrate:status

# 回滚最近一次迁移
npm run migrate:undo
```

### 5.3 迁移脚本示例

创建 `migrations/migrate.js`:

```javascript
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const db = new Database('data.db');

// 获取已执行的迁移
const executed = db.prepare('SELECT name FROM migrations').all().map(m => m.name);

// 获取所有迁移文件
const files = fs.readdirSync(__dirname)
  .filter(f => f.endsWith('.sql'))
  .sort();

// 执行未应用的迁移
for (const file of files) {
  if (!executed.includes(file)) {
    console.log(`Applying migration: ${file}`);
    const sql = fs.readFileSync(path.join(__dirname, file), 'utf-8');
    db.exec(sql);
    db.prepare('INSERT INTO migrations (name) VALUES (?)').run(file);
    console.log(`Applied: ${file}`);
  }
}

db.close();
```

## 六、配置文件管理

### 6.1 环境配置分离

```
config/
├── default.js      # 默认配置
├── production.js   # 生产环境配置
├── development.js  # 开发环境配置
└── .env.local      # 本地敏感配置（不提交到 Git）
```

### 6.2 .gitignore 配置

```gitignore
# 依赖
node_modules/
client/node_modules/

# 数据库
data.db
backups/

# 日志
logs/
*.log

# 环境配置
.env.local
config/local.js

# 构建产物
client/dist/

# 系统文件
.DS_Store
Thumbs.db
```

### 6.3 敏感信息管理

**方式一：环境变量（推荐）**

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'esports-club',
    script: 'server/index.js',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
      JWT_SECRET: process.env.JWT_SECRET,
    }
  }]
};
```

设置环境变量：
```powershell
# Windows PowerShell
[System.Environment]::SetEnvironmentVariable('ADMIN_PASSWORD', 'your-password', 'User')
[System.Environment]::SetEnvironmentVariable('JWT_SECRET', 'your-secret', 'User')
```

**方式二：配置文件**

创建 `.env.local`（不提交到 Git）:
```
ADMIN_PASSWORD=your-strong-password
JWT_SECRET=your-random-secret-at-least-32-chars
```

## 七、监控与日志

### 7.1 PM2 日志管理

```powershell
# 查看实时日志
pm2 logs esports-club

# 查看错误日志
pm2 logs esports-club --err

# 清空日志
pm2 flush

# 日志轮转（避免日志文件过大）
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### 7.2 健康检查

创建 `scripts/health-check.ps1`:

```powershell
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Write-Host "[OK] Service is healthy"
        exit 0
    } else {
        Write-Host "[ERROR] Service returned status: $($response.StatusCode)"
        exit 1
    }
} catch {
    Write-Host "[ERROR] Service is not responding: $_"
    exit 1
}
```

设置定时任务：每 5 分钟执行一次健康检查

## 八、灾难恢复

### 8.1 完整恢复流程

```powershell
# 1. 在新服务器上安装必要软件
# - Node.js v20.x
# - Git
# - PM2
# - 花生壳客户端

# 2. 克隆项目
git clone https://github.com/your-username/esports-club.git
cd esports-club

# 3. 恢复最新备份
Copy-Item "\\backup-server\backups\latest\data.db" ".\data.db"

# 4. 安装依赖并构建
npm install
cd client && npm install && cd ..
npm run build

# 5. 配置环境变量
# 编辑 ecosystem.config.js 或设置系统环境变量

# 6. 启动服务
pm2 start ecosystem.config.js
pm2 save
pm2-startup install

# 7. 配置花生壳
# 重新配置内网穿透映射
```

### 8.2 异地备份策略

```powershell
# 创建远程备份脚本 scripts\remote-backup.ps1
$BackupSource = "D:\esports-club\backups"
$BackupDest = "\\192.168.1.100\backup$\esports-club"  # NAS 或其他服务器

# 同步备份文件
robocopy $BackupSource $BackupDest /MIR /R:3 /W:5

# 或使用云存储（如阿里云 OSS）
# ossutil cp -r $BackupSource oss://your-bucket/esports-club/backups/
```

## 九、升级迭代工作流

### 9.1 开发流程

```
1. 从 develop 创建功能分支
   git checkout -b feature/new-feature develop

2. 开发完成后合并到 develop
   git checkout develop
   git merge feature/new-feature

3. 测试通过后，合并到 main
   git checkout main
   git merge develop

4. 打标签发布
   git tag -a v1.1.0 -m "新增 XXX 功能"
   git push origin main --tags

5. 在服务器上部署新版本
   .\scripts\deploy.ps1 -Version v1.1.0
```

### 9.2 热修复流程

```
1. 从 main 创建热修复分支
   git checkout -b hotfix/critical-bug main

2. 修复问题并提交
   git commit -m "fix: 修复关键问题"

3. 合并回 main 和 develop
   git checkout main
   git merge hotfix/critical-bug
   git checkout develop
   git merge hotfix/critical-bug

4. 打标签
   git tag -a v1.1.1 -m "修复 XXX 问题"
   git push origin main --tags

5. 部署修复版本
   .\scripts\deploy.ps1 -Version v1.1.1
```

## 十、运维检查清单

### 日常检查（每日）
- [ ] 检查 PM2 服务状态：`pm2 status`
- [ ] 查看错误日志：`pm2 logs --err`
- [ ] 验证外网访问是否正常

### 周检查
- [ ] 检查备份文件是否生成
- [ ] 检查磁盘空间使用情况
- [ ] 查看花生壳客户端连接状态

### 月检查
- [ ] 验证备份恢复流程
- [ ] 检查 Node.js 和依赖包更新
- [ ] 审查系统日志，排查潜在问题

## 十一、常用命令速查

```powershell
# 部署相关
.\scripts\deploy.ps1 -Version v1.1.0    # 部署指定版本
.\scripts\deploy.ps1 -Latest             # 部署最新版本
.\scripts\deploy.ps1 -Action backup      # 仅备份
.\scripts\deploy.ps1 -Action rollback    # 回滚到上一版本

# PM2 管理
pm2 status                               # 查看状态
pm2 logs esports-club                    # 查看日志
pm2 restart esports-club                 # 重启服务
pm2 stop esports-club                    # 停止服务
pm2 start esports-club                   # 启动服务

# Git 版本管理
git tag -l                               # 查看所有标签
git checkout v1.0.0                      # 切换到指定版本
git log --oneline                        # 查看提交历史

# 数据库备份
.\scripts\backup.ps1                     # 手动备份
Copy-Item backups\data_xxx.db data.db    # 恢复备份

# 健康检查
.\scripts\health-check.ps1               # 检查服务状态
```

## 十二、联系与支持

- 花生壳技术支持：https://hsk.oray.com/
- PM2 文档：https://pm2.keymetrics.io/docs/
- Node.js 文档：https://nodejs.org/en/docs/
