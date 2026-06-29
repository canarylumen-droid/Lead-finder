#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
#  Lead Finder — AWS Deploy Script
#  Usage:  bash deploy.sh
#  Run this every time you git pull on the server.
#  It handles: pull → install deps → install Playwright → build → restart PM2
# ─────────────────────────────────────────────────────────────────────────────
set -e

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

echo ""
echo "══════════════════════════════════════════════════"
echo "  Lead Finder Deploy — $(date '+%Y-%m-%d %H:%M:%S')"
echo "══════════════════════════════════════════════════"

# ── 1. Pull latest code ───────────────────────────────────────────────────────
echo ""
echo "▶ [1/6] Pulling latest code..."
git pull origin main
echo "   ✓ Code up to date"

# ── 2. Install / update Node packages ────────────────────────────────────────
echo ""
echo "▶ [2/6] Installing Node packages (npm install)..."
npm install --no-audit --prefer-offline 2>&1 || npm install --no-audit
echo "   ✓ Node packages ready"

# ── 3. Install Playwright Chromium browser binary ────────────────────────────
echo ""
echo "▶ [3/6] Installing Playwright Chromium browser..."
npx playwright install chromium --with-deps 2>&1 || npx playwright install chromium
echo "   ✓ Playwright Chromium ready"

# ── 4. Apply database migrations ─────────────────────────────────────────────
echo ""
echo "▶ [4/6] Applying database migrations..."
if [ -f "script/migrate.ts" ]; then
  npx tsx script/migrate.ts && echo "   ✓ Migrations applied (migrate.ts)"
else
  npx drizzle-kit push --accept-data-loss 2>/dev/null || npm run db:push
  echo "   ✓ Schema pushed"
fi

# ── 5. Build production bundle ────────────────────────────────────────────────
echo ""
echo "▶ [5/6] Building production bundle..."
npm run build
echo "   ✓ Build complete → dist/"

# ── 6. Restart PM2 ───────────────────────────────────────────────────────────
echo ""
echo "▶ [6/6] Restarting app with PM2..."
if pm2 list | grep -q "lead-finder"; then
  pm2 restart lead-finder --update-env
  echo "   ✓ lead-finder restarted"
else
  pm2 start dist/index.cjs --name lead-finder \
    --max-memory-restart 4000M \
    --restart-delay 3000 \
    --max-restarts 5 \
    --log logs/out.log \
    --error logs/error.log \
    --time
  pm2 save
  echo "   ✓ lead-finder started (new PM2 process)"
fi

echo ""
echo "══════════════════════════════════════════════════"
echo "  ✅ Deploy complete!"
echo ""
pm2 status lead-finder
echo ""
echo "  Tail logs:  pm2 logs lead-finder --lines 30"
echo "══════════════════════════════════════════════════"
echo ""
