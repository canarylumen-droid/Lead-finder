# Lead Finder — EC2 / VPS Deployment Guide

> **TL;DR — one command install:**
> ```bash
> git clone https://github.com/canarylumen-droid/Lead-finder lead-finder && cd lead-finder && chmod +x setup.sh && ./setup.sh
> ```
> The script installs Node, Chromium, all dependencies, runs migrations, builds, and starts the app with PM2.

---

## Recommended AWS Instance Sizes

| RAM   | Maps workers | Email workers | Instance          |
|-------|-------------|---------------|-------------------|
| 8 GB  | 4           | 100           | `t3.large`        |
| 16 GB | 12          | 400           | `t3.xlarge`       |
| 32 GB | 500         | 7,500         | `m5.2xlarge`      |
| 64 GB | 800         | 15,000        | `m5.4xlarge`      |

> Workers are auto-detected from available RAM. Override with env vars:
> `SCRAPER_CONCURRENCY=500 EMAIL_CONCURRENCY=7500`

**OS:** Ubuntu 22.04 LTS (recommended) or Amazon Linux 2023

---

## Step-by-Step (manual)

### Step 1 — Launch EC2 & SSH in

1. Launch instance (Ubuntu 22.04 LTS, pick size from table above)
2. Open ports **22** (SSH) and **80** (HTTP) in Security Groups
3. SSH in: `ssh -i your-key.pem ubuntu@<PUBLIC_IP>`

---

### Step 2 — Clone & run setup

```bash
# Install git if missing
sudo apt-get install -y git

# Clone the repo
git clone https://github.com/canarylumen-droid/Lead-finder lead-finder
cd lead-finder

# One-command setup (installs Node 20, Chromium deps, npm packages, PM2, builds)
chmod +x setup.sh
./setup.sh
```

The script will prompt you for `DATABASE_URL` if it's not set. See Step 3 for options.

---

### Step 3 — PostgreSQL database

**Option A — local (same server, simplest):**
```bash
sudo apt-get install -y postgresql postgresql-contrib
sudo systemctl start postgresql && sudo systemctl enable postgresql
sudo -i -u postgres psql <<'SQL'
CREATE DATABASE leadfinder;
CREATE USER leaduser WITH PASSWORD 'ChangeMe123!';
GRANT ALL PRIVILEGES ON DATABASE leadfinder TO leaduser;
SQL
# Your DATABASE_URL:
# postgresql://leaduser:ChangeMe123!@localhost:5432/leadfinder
```

**Option B — managed (recommended for production):**
- [Neon](https://neon.tech) — free tier, serverless Postgres, copy the connection string
- [Supabase](https://supabase.com) — free tier with connection pooler
- AWS RDS — same region as your EC2 for lowest latency

---

### Step 4 — Set environment variables

```bash
# Edit .env (or export directly in your shell / PM2 ecosystem config)
nano .env
```

```env
# Required
DATABASE_URL=postgresql://leaduser:ChangeMe123!@localhost:5432/leadfinder
SESSION_SECRET=change_this_to_something_long_and_random_at_least_32_chars

# Optional AI features (app works without these — scraping always runs)
GEMINI_API_KEY=your_gemini_key
OPENAI_API_KEY=your_openai_key

# Optional concurrency override (auto-detected from RAM if not set)
# SCRAPER_CONCURRENCY=500
# EMAIL_CONCURRENCY=7500

PORT=5000
NODE_ENV=production
```

---

### Step 5 — Run migrations & start

If you ran `setup.sh` these are done automatically. To run manually:

```bash
# Create/update database tables (safe, non-destructive, idempotent)
npx tsx script/migrate.ts

# Build for production
npm run build

# Start with PM2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # follow the printed command to enable auto-start on reboot
```

---

### Step 6 — Nginx reverse proxy (optional but recommended)

Serves on port 80 and handles WebSocket upgrades:

```bash
sudo apt-get install -y nginx
sudo tee /etc/nginx/sites-available/leadfinder > /dev/null <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/leadfinder /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx
```

Access the dashboard at `http://<YOUR_EC2_PUBLIC_IP>`

---

### Step 7 — Docker alternative

Build and run with Docker (no Node install required on the host):

```bash
# Build image
docker build -t lead-finder .

# Run (replace DATABASE_URL and SESSION_SECRET)
docker run -d \
  --name lead-finder \
  --restart unless-stopped \
  -p 5000:5000 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/db" \
  -e SESSION_SECRET="your_secret_here" \
  -e NODE_ENV=production \
  lead-finder
```

---

## PM2 Cheatsheet

```bash
pm2 status                  # show all processes
pm2 logs lead-finder        # live logs
pm2 restart lead-finder     # restart
pm2 stop lead-finder        # stop
pm2 delete lead-finder      # remove from PM2
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| App not starting | `pm2 logs lead-finder` — check for missing DATABASE_URL |
| Chromium crashes | `npx playwright install-deps chromium` — reinstall OS deps |
| Port 5000 in use | `fuser -k 5000/tcp` then restart |
| DB connection refused | Check `DATABASE_URL` and that PostgreSQL is running |
| Out of memory | Reduce `SCRAPER_CONCURRENCY` via env var, or upgrade instance |
| Maps scraping slow | Confirm RAM — 32GB unlocks 500 concurrent tabs automatically |
