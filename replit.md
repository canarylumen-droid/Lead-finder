# Lead Finder

A lead scraping and qualification platform built with React, Express, and PostgreSQL. The application allows users to scrape social media profiles (Instagram, LinkedIn) and Google Maps listings, analyze them using AI to determine business fit, and manage qualified leads through a dashboard interface. It features real-time job progress tracking via WebSocket, a worker pool for concurrent scraping, and AI-powered profile analysis to score and categorize leads.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack React Query for server state
- **Styling**: Tailwind CSS with shadcn/ui component library (New York style)
- **Theming**: next-themes for dark/light mode support
- **Animations**: Framer Motion for UI transitions
- **Build Tool**: Vite with custom path aliases (@/, @shared/, @assets/)

## Backend Architecture
- **Framework**: Express.js with TypeScript
- **Runtime**: Node.js with tsx for development
- **Real-time Communication**: WebSocket server (ws) integrated with HTTP server for live job logs
- **Worker Pool**: Custom EventEmitter-based worker pool (20 concurrent workers) for parallel scraping tasks
- **AI Integration**: OpenAI API and Google Gemini API for profile analysis and lead qualification

## Data Layer
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: shared/schema.ts contains all table definitions
- **Key Tables**: 
  - `leads` - Scraped profiles with deduplication hash
  - `scrapeJobs` - Job tracking with progress metrics
  - `jobLogs` - Real-time logging for job monitoring
  - `dedupeHashes` - Prevent duplicate lead entries
  - `conversations/messages` - Chat storage for AI integrations
- **Migrations**: Drizzle Kit with push command (db:push)

## API Design
- REST API endpoints defined in shared/routes.ts with Zod validation
- Route pattern: /api/* for all backend endpoints
- WebSocket endpoint at /ws for real-time job updates

## Build System
- **Development**: Vite dev server with HMR (`npm run dev`)
- **Production**: 
  - Client: Vite builds to dist/public
  - Server: esbuild bundles server to dist/index.cjs

# External Dependencies

## Database
- PostgreSQL via DATABASE_URL environment variable
- Connection pooling with pg package
- Session storage: connect-pg-simple

## AI Services
- OpenAI API — OPENAI_API_KEY env var
- Google Gemini API — GEMINI_API_KEY env var
- Used for: profile analysis, lead qualification scoring, buyer intent detection

## Web Scraping
- Cheerio for HTML parsing
- Playwright Chromium for browser automation
- Puppeteer-extra with stealth plugin for anti-bot evasion
- Custom scraper modules in server/scraper/

## Batch Processing
- p-limit for concurrency control
- p-retry for automatic retry with exponential backoff

# Run & Operate

- `npm run dev` — start dev server (port 5000)
- `npm run build` — production build
- `npm run db:push` — push DB schema changes (requires DATABASE_URL)
- Required env vars: `DATABASE_URL`, `OPENAI_API_KEY` or `GEMINI_API_KEY`, `SESSION_SECRET`

# Docker

A `Dockerfile` is provided for containerized deployment. Uses Node 20 slim with all Chromium/Playwright system dependencies pre-installed. See `EC2_DEPLOYMENT.md` for AWS deployment guide.

# Gotchas

- Playwright Chromium must be installed after npm install: `npx playwright install chromium`
- The app uses `npm` (not pnpm) — ignore the pnpm workspace files, they belong to the Replit template scaffold
- DATABASE_URL must be set before running migrations or starting the server
