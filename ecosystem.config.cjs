module.exports = {
  apps: [
    {
      name: "lead-finder",
      script: "dist/index.cjs",
      instances: 1,          // Single instance — scraper manages own concurrency
      exec_mode: "fork",
      node_args: "--max-old-space-size=8192",
      env: {
        NODE_ENV: "production",
        PORT: "5000",
      },
      // Auto-restart config
      watch: false,
      max_memory_restart: "12G",
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: "10s",
      // Logging
      out_file: "./logs/out.log",
      error_file: "./logs/error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
