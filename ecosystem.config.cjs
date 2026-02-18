// PM2 ecosystem config — keeps OpenClaw gateway always running
// Usage:
//   npm install -g pm2
//   pm2 start ecosystem.config.cjs
//   pm2 save          # persist across reboots
//   pm2 startup       # enable boot start (follow printed instructions)
//   pm2 logs openclaw # stream logs

module.exports = {
  apps: [
    {
      name: "openclaw",
      script: "scripts/run-node.mjs",
      args: "gateway",
      interpreter: "node",

      // Restart on crash, not on clean exit
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 5000,

      // Env — add your tokens here or use a .env file
      env: {
        NODE_ENV: "production",
        // TELEGRAM_BOT_TOKEN: "YOUR_TOKEN_HERE",
      },

      // Logging
      out_file: "./logs/gateway.log",
      error_file: "./logs/gateway-error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      max_size: "50M",
      retain: 7,
    },
  ],
};
