module.exports = {
  apps: [{
    name: 'esports-club',
    script: 'server/index.js',
    cwd: './',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      // 从环境变量读取，如果没有则使用默认值
      ADMIN_PASSWORD: process.env.ESPORTS_ADMIN_PASSWORD || 'admin123',
      JWT_SECRET: process.env.ESPORTS_JWT_SECRET || 'change-this-secret-in-production',
      JWT_EXPIRES_IN: '24h',
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    // 日志轮转配置（需要安装 pm2-logrotate）
    // 安装命令: pm2 install pm2-logrotate
    // 配置命令:
    //   pm2 set pm2-logrotate:max_size 10M
    //   pm2 set pm2-logrotate:retain 7
  }]
};
