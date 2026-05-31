FROM node:20-bookworm-slim

# Install Chromium system dependencies (required by Playwright)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    wget \
    gnupg \
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

# Install Node deps first (layer cache)
COPY package*.json ./
RUN npm ci

# Install Playwright Chromium browser (uses already-installed system libs)
RUN npx playwright install chromium

# Copy source and build
COPY . .
RUN npm run build

# Run migration then start server
EXPOSE 5000

CMD ["sh", "-c", "node_modules/.bin/tsx script/migrate.ts && node dist/index.cjs"]
