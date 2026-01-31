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
- Gemini API for offering analysis and keyword generation
- Environment variable: GEMINI_API_KEY
- Used for: offering analysis, profile analysis, lead qualification scoring, buyer intent detection

## Web Scraping (Vercel-Compatible)
- Cheerio for HTML parsing (no browser binaries needed)
- Custom Vercel-compatible scraper in server/scrapers/vercel-scraper.ts
- Google advanced search operators for finding business websites
- Email filtering: skips no-reply, generic domains (wix, squarespace, etc.)
- Contact name extraction from email patterns
- Priority: business emails (contact@, info@, hello@) over personal emails

## Batch Processing
- p-limit for concurrency control
- p-retry for automatic retry with exponential backoff

## Additional Integrations
- Stripe (payment processing)
- Nodemailer (email sending)
- Multer (file uploads)
- XLSX (spreadsheet export)