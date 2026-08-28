/** pm2 进程配置 */
module.exports = {
  apps: [
    {
      name: 'classpilot-backend',
      cwd: '/opt/classpilot/backend',
      script: 'dist/main.js',
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
