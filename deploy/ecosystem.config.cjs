/** pm2 进程配置
 * interpreter 固定走 /usr/local/bin/node，避免落到系统自带的 Node 12（Nest 会直接挂掉 → Nginx 502）。
 * 部署脚本会在启动前把可用的 Node>=18 落到该路径。
 */
module.exports = {
  apps: [
    {
      name: 'classpilot-backend',
      cwd: '/opt/classpilot/backend',
      script: 'dist/main.js',
      interpreter: '/usr/local/bin/node',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      max_memory_restart: '400M',
    },
  ],
};
