#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Lead Finder — Universal Setup Script
# Works on: AWS EC2 (Ubuntu/Amazon Linux), any Debian/RHEL VPS, macOS
# Usage:  chmod +x setup.sh && ./setup.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC}   $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
die()     { echo -e "${RED}[ERR]${NC}  $1"; exit 1; }

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║   Lead Finder — Automated Setup       ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# ── 1. Detect OS & package manager ───────────────────────────────────────────
OS=""
PKG=""
if [ -f /etc/os-release ]; then source /etc/os-release; OS="$ID"; fi
if   command -v apt-get &>/dev/null; then PKG="apt";
elif command -v dnf     &>/dev/null; then PKG="dnf";
elif command -v yum     &>/dev/null; then PKG="yum";
elif command -v brew    &>/dev/null; then PKG="brew";
else warn "Unknown package manager — skipping system package installs. Install Node 20+ manually if needed."; fi

info "OS: ${OS:-unknown} | Package manager: ${PKG:-none}"

# ── 2. Install git if missing ─────────────────────────────────────────────────
if ! command -v git &>/dev/null; then
  info "Installing git..."
  if   [ "$PKG" = "apt" ]; then sudo apt-get install -y git;
  elif [ "$PKG" = "dnf" ] || [ "$PKG" = "yum" ]; then sudo $PKG install -y git;
  elif [ "$PKG" = "brew" ]; then brew install git; fi
  success "git installed"
else
  success "git: $(git --version)"
fi

# ── 3. Install Node.js 20 if missing or old ───────────────────────────────────
NODE_OK=false
if command -v node &>/dev/null; then
  NODE_VER=$(node -v | cut -d. -f1 | tr -d 'v')
  [ "$NODE_VER" -ge 20 ] && NODE_OK=true
fi

if [ "$NODE_OK" = false ]; then
  info "Installing Node.js 20..."
  if [ "$PKG" = "apt" ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
  elif [ "$PKG" = "dnf" ] || [ "$PKG" = "yum" ]; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo $PKG install -y nodejs
  elif [ "$PKG" = "brew" ]; then
    brew install node@20
    brew link node@20 --force
  fi
fi
success "Node.js: $(node -v) | npm: $(npm -v)"

# ── 4. Install Chromium system dependencies ───────────────────────────────────
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

# ── 5. npm install ────────────────────────────────────────────────────────────
info "Installing npm packages..."
npm install || die "npm install failed — check your internet connection"
success "npm packages installed ($(ls node_modules | wc -l) packages)"

# ── 6. Install Playwright Chromium browser ───────────────────────────────────
info "Installing Playwright Chromium browser..."
npx playwright install chromium 2>/dev/null || warn "Playwright install had warnings — may still work"
success "Playwright Chromium ready"

# ── 7. Install PM2 globally ───────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  info "Installing PM2..."
  sudo npm install -g pm2 || npm install -g pm2
fi
success "PM2: $(pm2 -v)"

# ── 8. Require DATABASE_URL ───────────────────────────────────────────────────
if [ -z "$DATABASE_URL" ]; then
  echo ""
  warn "DATABASE_URL is not set."
  echo "   Options:"
  echo "   • Local PostgreSQL: postgresql://leaduser:password@localhost:5432/leadfinder"
  echo "   • Free cloud:       https://neon.tech  or  https://supabase.com"
  echo ""
  read -rp "   Paste your DATABASE_URL now (or press Enter to skip and set later): " DB_INPUT
  if [ -n "$DB_INPUT" ]; then
    export DATABASE_URL="$DB_INPUT"
    SHELL_RC="$HOME/.bashrc"
    [ -f "$HOME/.zshrc" ] && SHELL_RC="$HOME/.zshrc"
    # Remove old DATABASE_URL line if present, then append
    grep -v "^export DATABASE_URL=" "$SHELL_RC" > /tmp/.bashrc_tmp 2>/dev/null || true
    cat /tmp/.bashrc_tmp > "$SHELL_RC"
    echo "export DATABASE_URL=\"$DB_INPUT\"" >> "$SHELL_RC"
    success "DATABASE_URL saved to $SHELL_RC"
  else
    warn "Skipping migration. Set DATABASE_URL and run: npx tsx script/migrate.ts"
  fi
fi

# ── 9. Set SESSION_SECRET if missing ─────────────────────────────────────────
if [ -z "$SESSION_SECRET" ]; then
  SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  export SESSION_SECRET
  SHELL_RC="$HOME/.bashrc"
  [ -f "$HOME/.zshrc" ] && SHELL_RC="$HOME/.zshrc"
  echo "export SESSION_SECRET=\"$SESSION_SECRET\"" >> "$SHELL_RC"
  success "SESSION_SECRET generated and saved"
fi

# ── 10. Run DB migration ──────────────────────────────────────────────────────
if [ -n "$DATABASE_URL" ]; then
  info "Running database migration..."
  node_modules/.bin/tsx script/migrate.ts && success "Database tables ready" \
    || warn "Migration failed — check DATABASE_URL is reachable"
fi

# ── 11. Set NODE_ENV ──────────────────────────────────────────────────────────
export NODE_ENV=production
SHELL_RC="$HOME/.bashrc"
[ -f "$HOME/.zshrc" ] && SHELL_RC="$HOME/.zshrc"
grep -q "NODE_ENV=production" "$SHELL_RC" 2>/dev/null || echo "export NODE_ENV=production" >> "$SHELL_RC"

# ── 12. Build app ─────────────────────────────────────────────────────────────
info "Building application (server + client)..."
npm run build && success "Build complete" || die "Build failed — check logs above"

# ── 13. Start with PM2 ───────────────────────────────────────────────────────
info "Starting Lead Finder with PM2..."
pm2 delete lead-finder 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

# Try to enable PM2 startup on reboot
STARTUP_CMD=$(pm2 startup 2>&1 | grep "sudo" | tail -1)
if [ -n "$STARTUP_CMD" ]; then
  eval "$STARTUP_CMD" 2>/dev/null || warn "Run manually to enable auto-start: $STARTUP_CMD"
fi

echo ""
echo -e "${GREEN}✓ Lead Finder is live!${NC}"
echo ""
pm2 status lead-finder
echo ""
echo "  ┌─────────────────────────────────────────┐"
echo "  │  Dashboard → http://$(curl -s ifconfig.me 2>/dev/null || echo '<YOUR_IP>'):5000   │"
echo "  └─────────────────────────────────────────┘"
echo ""
echo "  Commands:"
echo "    pm2 logs lead-finder      — live logs"
echo "    pm2 restart lead-finder   — restart server"
echo "    pm2 stop lead-finder      — stop server"
echo ""
echo "  Concurrency (auto-detected from RAM):"
RAM_GB=$(node -e "console.log((require('os').totalmem()/1024**3).toFixed(1))")
echo "    RAM: ${RAM_GB} GB"
echo "    Override: SCRAPER_CONCURRENCY=N EMAIL_CONCURRENCY=N pm2 restart lead-finder"
echo ""
