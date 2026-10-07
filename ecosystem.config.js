// ===================================================
// ecosystem.config.js — PM2 Process Manager Configuration
// รองรับการรันแยกโปรเจกต์ Bear Cafe Production และ Dev
// ===================================================

module.exports = {
  apps: [
    {
      name: "bearcafe-prod",
      script: "index.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "600M",
      env: {
        NODE_ENV: "production",
        DEV_MODE: "false",
        PORT: 8000
      }
    },
    {
      name: "bearcafe-dev",
      script: "index.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "development",
        DEV_MODE: "true",
        PORT: 8001
      }
    }
  ]
};
