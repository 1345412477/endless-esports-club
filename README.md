<div align="center">

# 🎮 无尽电竞业务系统

**专业的电竞俱乐部订单管理与工资结算系统**

<p align="center">
  <a href="#功能特性">
    <img src="https://img.shields.io/badge/功能-完整-blue?style=for-the-badge" alt="Features">
  </a>
  <a href="#技术栈">
    <img src="https://img.shields.io/badge/技术栈-现代-green?style=for-the-badge" alt="Tech Stack">
  </a>
  <a href="#快速开始">
    <img src="https://img.shields.io/badge/部署-简单-orange?style=for-the-badge" alt="Deploy">
  </a>
  <a href="https://github.com/1345412477/endless-esports-club">
    <img src="https://img.shields.io/github/stars/1345412477/endless-esports-club?style=for-the-badge" alt="Stars">
  </a>
</p>

> 专为电竞俱乐部打造的一站式业务管理平台，涵盖订单管理、人员配置、工资结算、数据统计等核心功能

</div>

---

## ✨ 功能特性

### 🎯 三大角色体系

| 角色 | 功能 |
|------|------|
| 👑 **管理员** | 数据看板、人员配置、订单管理、工资结算、操作日志、系统配置 |
| 💼 **客服** | 创建订单、管理订单、状态跟踪、业绩查看 |
| 🎮 **员工** | 订单查询、工资查询、个人信息 |

### 📊 核心功能模块

- **订单管理** - 多状态流转（接单中/已结单/存单/退单）、员工分配、备注记录
- **人员配置** - 客服/员工增删改查、抽成比例配置、评级管理、账号管理
- **工资结算** - 自动计算抽成、押金管理、一键结算、结算历史、撤销回退
- **数据看板** - 销售统计、业绩排名、订单趋势、类型分布、实时数据
- **操作日志** - 完整审计追踪、详细变更记录、CSV导出
- **多账号体系** - 客服独立账号登录、数据隔离、权限控制

### 🔥 亮点功能

- ✅ **订单状态颜色区分** - 一目了然，提升操作效率
- ✅ **7日订单趋势图** - 直观展示业务走势
- ✅ **财务安全校验** - 已结单修改自动校验，防止数据错乱
- ✅ **操作日志详细描述** - 精确记录每一项变更内容
- ✅ **数据自动备份** - 定时备份，数据安全有保障
- ✅ **响应式设计** - 电脑手机都能用

---

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| **前端** | React 18 + Vite 5 + React Router 6 |
| **后端** | Node.js + Express 4 |
| **数据库** | SQLite (零配置，开箱即用) |
| **认证** | JWT (JSON Web Token) |
| **部署** | PM2 进程守护 + 花生壳内网穿透 |
| **构建工具** | Vite (极速热更新) |

---

## 📸 系统预览

### 数据看板（管理员）
- 今日/本周/本月 销售数据一目了然
- 客服业绩排行榜
- 员工接单排行榜
- 订单类型分布
- 近7日订单趋势
- 完整订单列表管理

### 客服工作台
- 快速创建订单
- 订单状态一键切换
- 个人订单管理
- 实时状态颜色标识

### 工资结算
- 自动计算应付工资
- 押金管理
- 一键结算
- 结算历史可追溯
- 支持撤销回退

---

## 🚀 快速开始

### 环境要求

- Node.js >= 16.x（推荐 v20 LTS）
- npm >= 8.x
- Windows / Linux / macOS 均可运行

### 一键启动

```bash
# 1. 克隆项目
git clone https://github.com/1345412477/endless-esports-club.git
cd endless-esports-club

# 2. 安装依赖
npm install
cd client && npm install && cd ..

# 3. 构建前端
npm run build

# 4. 启动服务
npm start
```

服务启动后访问：**http://localhost:3000**

### 默认账号

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 管理员 | `admin` | `admin123` |

> ⚠️ **重要**：生产环境请务必修改默认密码！在 `ecosystem.config.js` 中配置 `ADMIN_PASSWORD` 环境变量。

### PM2 生产部署（推荐）

```bash
# 安装 PM2
npm install -g pm2 pm2-windows-startup
pm2-startup install

# 启动服务
pm2 start ecosystem.config.js
pm2 save
```

---

## 📁 项目结构

```
endless-esports-club/
├── client/                 # 前端 React 项目
│   ├── src/
│   │   ├── pages/         # 页面组件
│   │   ├── hooks/         # 自定义Hooks
│   │   ├── api/           # API封装
│   │   └── styles/        # 样式文件
│   └── vite.config.js     # Vite配置
├── server/                 # 后端 Express 服务
│   ├── routes/            # API路由
│   ├── middleware/        # 中间件
│   ├── utils/             # 工具函数
│   ├── db.js              # 数据库模块
│   └── index.js           # 服务入口
├── scripts/
│   └── backup.ps1         # 自动备份脚本
├── ecosystem.config.js    # PM2配置
├── DEPLOY.md              # 详细部署文档
└── package.json
```

---

## 🔒 安全特性

- 🔐 JWT 身份认证，Token 24小时自动过期
- 🛡️ 角色权限控制，数据严格隔离
- 📝 完整操作日志，所有变更可追溯
- 💾 定时数据备份，防止数据丢失
- 🔑 支持环境变量配置敏感信息

---

## 📈 适用场景

- 🎮 电竞俱乐部 / 陪玩工作室
- 🎯 游戏代练团队
- 💼 任何需要订单管理 + 佣金结算的小型团队

---

## 🤝 部署方案

### 内网部署（店内使用）
- 一台普通Windows电脑即可
- 店内局域网访问，速度最快
- 零成本，数据完全在本地

### 花生壳外网访问
- 固定域名，随时随地访问
- 无需公网IP，无需备案
- 适合小型团队远程办公

### 云服务器部署
- 阿里云/腾讯云轻量服务器
- 新用户低至38元/年
- 稳定可靠，适合长期使用

> 详细部署说明见 [DEPLOY.md](./DEPLOY.md)

---

## 📄 开源协议

本项目仅供学习和个人/内部商业使用。

---

<div align="center">

**如果这个项目对你有帮助，别忘了点个 ⭐ Star 支持一下！**

Made with ❤️ for 无尽电竞

</div>
