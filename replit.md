<<<<<<< HEAD
# Overview

This is a lead scraping and qualification platform built with React, Express, and PostgreSQL. The application allows users to scrape social media profiles (Instagram, LinkedIn), analyze them using AI to determine business fit, and manage qualified leads through a dashboard interface. It features real-time job progress tracking via WebSocket, a worker pool for concurrent scraping, and AI-powered profile analysis to score and categorize leads.

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
- **AI Integration**: OpenAI API via Replit AI Integrations for profile analysis and lead qualification

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
- **Development**: Vite dev server with HMR
- **Production**: 
  - Client: Vite builds to dist/public
  - Server: esbuild bundles server to dist/index.cjs with selective dependency bundling

# External Dependencies

## Database
- PostgreSQL via DATABASE_URL environment variable
- Connection pooling with pg package
- Session storage: connect-pg-simple

## AI Services
- OpenAI API (standard format for Vercel deployment)
- Environment variable: OPENAI_API_KEY
- Used for: offering analysis, profile analysis, lead qualification scoring, buyer intent detection

## Web Scraping
- Cheerio for HTML parsing
- Custom scraper module in server/scraper/

## Batch Processing
- p-limit for concurrency control
- p-retry for automatic retry with exponential backoff

## Additional Integrations
- Stripe (payment processing)
- Nodemailer (email sending)
- Multer (file uploads)
- XLSX (spreadsheet export)
=======
# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
>>>>>>> 185439b (Initial commit)
