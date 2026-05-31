#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Lead Finder — Universal Setup Script
# Works on: AWS EC2 (Ubuntu/Amazon Linux), any Debian/RHEL VPS, macOS, local dev
# Usage:  chmod +x setup.sh && ./setup.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC}   $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
die()     { echo -e "${RED}[ERR]${NC}  $1"; exit 1; }

echo ""
echo "  Lead Finder — Automated Setup"
echo "  ─────────────────────────────"
echo ""

# ── 1. Detect OS ──────────────────────────────────────────────────────────────
OS=""
PKG=""
if   [ -f /etc/os-release ]; then source /etc/os-release; OS="$ID"; fi
if   command -v apt-get &>/dev/null; then PKG="apt";
elif command -v dnf     &>/dev/null; then PKG="dnf";
elif command -v yum     &>/dev/null; then PKG="yum";
elif command -v brew    &>/dev/null; then PKG="brew";
else warn "Unknown package manager — skipping system package installs. Install Node 20+ manually if needed."; fi

info "Detected OS: ${OS:-unknown}, Package manager: ${PKG:-none}"

# ── 2. Install Node.js 20 if missing ─────────────────────────────────────────
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 18 ]]; then
  info "Installing Node.js 20..."
  if [ "$PKG" = "apt" ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif [ "$PKG" = "dnf" ] || [ "$PKG" = "yum" ]; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo $PKG install -y nodejs
  elif [ "$PKG" = "brew" ]; then
    brew install node@20
  fi
  success "Node.js installed: $(node -v)"
else
  success "Node.js already installed: $(node -v)"
fi

# ── 3. Install Chromium system dependencies ───────────────────────────────────
info "Installing Chromium system dependencies..."
if [ "$PKG" = "apt" ]; then
  sudo apt-get update -qq
  sudo apt-get install -y --no-install-recommends \
    ca-certificates wget gnupg curl \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libdbus-1-3 libexpat1 \
    libxcb1 libxkbcommon0 libx11-6 libxcomposite1 \
    libxdamage1 libxext6 libxfixes3 libxrandr2 \
    libgbm1 libpango-1.0-0 libcairo2 libasound2 \
    libatspi2.0-0 libglib2.0-0 fonts-liberation \
    2>/dev/null || true
elif [ "$PKG" = "dnf" ] || [ "$PKG" = "yum" ]; then
  sudo $PKG install -y \
    nss nspr atk at-spi2-atk cups-libs \
    dbus-libs libdrm libXcomposite libXdamage \
    libXext libXfixes libXrandr libxcb libxkbcommon \
    pango cairo alsa-lib mesa-libgbm \
    gtk3 glib2 expat \
    2>/dev/null || true
fi
success "System dependencies ready"

# ── 4. npm install ────────────────────────────────────────────────────────────
info "Installing npm packages..."
npm install
success "npm packages installed"

# ── 5. Install Playwright Chromium ───────────────────────────────────────────
info "Installing Playwright Chromium browser..."
npx playwright install chromium
success "Playwright Chromium installed"

# ── 6. Install PM2 globally (keeps server alive on crashes / reboots) ─────────
if ! command -v pm2 &>/dev/null; then
  info "Installing PM2..."
  sudo npm install -g pm2
  success "PM2 installed"
else
  success "PM2 already installed: $(pm2 -v)"
fi

# ── 7. Require DATABASE_URL ───────────────────────────────────────────────────
if [ -z "$DATABASE_URL" ]; then
  echo ""
  warn "DATABASE_URL is not set."
  echo "   Get a free PostgreSQL DB from neon.tech or supabase.com, then run:"
  echo ""
  echo "     export DATABASE_URL=\"postgresql://user:password@host:5432/dbname\""
  echo ""
  read -rp "   Paste your DATABASE_URL now (or press Enter to skip): " DB_INPUT
  if [ -n "$DB_INPUT" ]; then
    export DATABASE_URL="$DB_INPUT"
    # Persist it
    SHELL_RC="$HOME/.bashrc"
    [ -f "$HOME/.zshrc" ] && SHELL_RC="$HOME/.zshrc"
    echo "export DATABASE_URL=\"$DB_INPUT\"" >> "$SHELL_RC"
    success "DATABASE_URL saved to $SHELL_RC"
  else
    warn "Skipping migration. Set DATABASE_URL and run: node_modules/.bin/tsx script/migrate.ts"
  fi
fi

# ── 8. Run DB migration ───────────────────────────────────────────────────────
if [ -n "$DATABASE_URL" ]; then
  info "Running database migration..."
  node_modules/.bin/tsx script/migrate.ts
  success "Database tables created"
fi

# ── 9. Set NODE_ENV ───────────────────────────────────────────────────────────
export NODE_ENV=production
SHELL_RC="$HOME/.bashrc"
[ -f "$HOME/.zshrc" ] && SHELL_RC="$HOME/.zshrc"
grep -q "NODE_ENV=production" "$SHELL_RC" 2>/dev/null || echo "export NODE_ENV=production" >> "$SHELL_RC"

# ── 10. Build app ─────────────────────────────────────────────────────────────
info "Building application..."
npm run build
success "Build complete"

# ── 11. Start with PM2 ───────────────────────────────────────────────────────
info "Starting Lead Finder with PM2..."
pm2 delete lead-finder 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

# Enable PM2 startup on reboot
STARTUP_CMD=$(pm2 startup 2>&1 | grep "sudo" | tail -1)
if [ -n "$STARTUP_CMD" ]; then
  info "Enabling PM2 auto-restart on reboot..."
  eval "$STARTUP_CMD" || warn "Run manually: $STARTUP_CMD"
fi

echo ""
echo -e "${GREEN}✓ Lead Finder is running!${NC}"
echo ""
pm2 status lead-finder
echo ""
echo "  Commands:"
echo "    pm2 logs lead-finder     — view live logs"
echo "    pm2 restart lead-finder  — restart server"
echo "    pm2 stop lead-finder     — stop server"
echo ""
