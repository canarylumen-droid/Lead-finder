FROM node:20-bookworm-slim

# ── System dependencies for Playwright Chromium ───────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    wget \
    gnupg \
    curl \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libexpat1 \
    libxcb1 \
    libxkbcommon0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libatspi2.0-0 \
    libglib2.0-0 \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Install Node deps (cached layer — only re-runs if package.json changes) ───
COPY package*.json ./
RUN npm ci

# ── Install Playwright Chromium (deps already installed above) ────────────────
RUN npx playwright install chromium

# ── Copy source and build ─────────────────────────────────────────────────────
COPY . .
RUN npm run build

# ── Create logs dir ───────────────────────────────────────────────────────────
RUN mkdir -p logs

EXPOSE 5000

# ── Run migration then start (migration is idempotent — safe on every deploy) ─
CMD ["sh", "-c", "node_modules/.bin/tsx script/migrate.ts && node dist/index.cjs"]
