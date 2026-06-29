# Lead Finder

A lead scraping and email infrastructure platform built with React, Express, and PostgreSQL. Scrapes Google Maps listings, finds emails, analyzes leads with AI, and manages a full transactional email stack (SMTP providers, Mailcow server, DNS, unified relay multiplexer).

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack React Query v5 for server state
- **Styling**: Tailwind CSS with plain CSS variables (no shadcn/ui — raw HTML + Tailwind)
- **Build Tool**: Vite with path aliases (@/, @shared/, @assets/)
- **Pages**: Dashboard, Setup (scraper), SMTP Providers, Mailcow, DNS Manager

## Backend Architecture
- **Framework**: Express.js with TypeScript
- **Runtime**: Node.js with tsx for development (port 5000)
- **Real-time**: WebSocket server (ws) for live job logs
- **Worker Pool**: Custom EventEmitter-based pool (20 workers) for parallel scraping
- **AI Integration**: OpenAI API and Google Gemini API
- **SMTP Relay Multiplexer**: Listens on 127.0.0.1:2525, routes by sender domain

## Navigation
- Sidebar (desktop) + hamburger drawer (mobile) with 5 links:
  - `/` — Dashboard
  - `/setup` — New Scrape
  - `/smtp` — SMTP Providers
  - `/mailcow` — Mailcow
  - `/dns` — DNS Manager

## Data Layer
- **Database**: PostgreSQL with Drizzle ORM
- **Schema**: `shared/schema.ts`
- **Migration**: `npx tsx script/migrate.ts` (non-destructive, safe to re-run)
- **Tables**:
  - `users` — auth
  - `scrape_sessions` / `leads` — scraper data
  - `smtp_providers` — 15 seeded providers with Clearbit logos
  - `smtp_accounts` — per-user accounts (AES-256 encrypted secrets)
  - `domain_account_map` — domain → primary/fallback SMTP account
  - `mailcow_config` — Mailcow URL + encrypted API key per user
  - `dns_records` — SPF/DKIM/DMARC records
  - `relay_logs` — audit log for the SMTP multiplexer

## SMTP Relay Multiplexer (port 2525)
- `server/smtp-relay/index.ts` — smtp-server receives from Mailcow, nodemailer sends upstream
- Mailcow is configured to relay all outbound mail to `127.0.0.1:2525`
- Multiplexer looks up `MAIL FROM` domain → `domain_account_map` → picks primary (or fallback) account
- Supports unlimited domain→account mappings across all 15 providers
- Auth: username=`relay`, password=`SMTP_RELAY_SECRET` env var (default `lf-relay-secret`)

## API Routes
- `server/smtp-routes.ts` — `/api/smtp/*` (providers, accounts CRUD+test+PATCH, mappings, relay stats)
- `server/mailcow-routes.ts` — `/api/mailcow/*` (config, domains, mailboxes, DKIM, relay configure, bulk-set-password, sync-dns)
- `server/dns-routes.ts` — `/api/dns/*` (records CRUD, verify, generate SPF/DKIM/DMARC, push to Hostinger)

# Key Features

## SMTP Providers Page (`/smtp`)
- 15 provider tiles with official Clearbit logos (resend.com, brevo.com, mailgun.com, etc.)
- Provider search filter
- Add account modal with auto-fill (Resend + Brevo: paste API key → fetches SMTP creds automatically)
- Edit account modal (PATCH endpoint)
- Test SMTP connection button
- Domain → relay mapping table (primary + fallback account per domain)
- Relay stats widget (delivered / fallback / failed)

## Mailcow Page (`/mailcow`)
- Connect with Mailcow URL + API key (verified before save)
- Tab switcher: Domains tab | Mailboxes tab
- Add / delete domains and mailboxes
- DKIM viewer per domain (generates 2048-bit key if missing)
- "Set All Passwords" — bulk-sets same IMAP password across all mailboxes
- "Sync DNS" — pulls DKIM from every Mailcow domain, writes SPF+DKIM+DMARC to DNS Manager in one shot
- "→ Set Relay :2525" — auto-configures Mailcow to route through the multiplexer

## DNS Manager (`/dns`)
- Add records manually (TXT, MX, CNAME, A, AAAA)
- Auto-generate SPF+DKIM+DMARC for any domain
- Verify DNS propagation (live lookup)
- Push to Hostinger DNS API (token saved in localStorage, per-domain push buttons)
- Export zone file as .txt (BIND format)
- Color-coded record type badges, copy-to-clipboard on hover

# External Dependencies

## Database
- PostgreSQL via `DATABASE_URL` env var

## AI Services
- OpenAI API — `OPENAI_API_KEY`
- Google Gemini API — `GEMINI_API_KEY`

## Email Infrastructure
- `smtp-server` + `nodemailer` — SMTP relay multiplexer
- Mailcow self-hosted mail server (external, configured via API)
- Hostinger DNS API for auto-pushing DNS records

## Web Scraping
- Playwright Chromium for browser automation
- Cheerio for HTML parsing
- p-limit / p-retry for concurrency + retry

# Run & Operate

```bash
npm run dev           # Start dev server on port 5000
npm run build         # Production build
npx tsx script/migrate.ts   # Run DB migrations + seed 15 SMTP providers
```

**Required env vars:**
- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — used for auth sessions and AES-256 encryption of stored API keys
- `SMTP_RELAY_SECRET` — password for the relay multiplexer (default: `lf-relay-secret`)
- `OPENAI_API_KEY` or `GEMINI_API_KEY` — for AI lead analysis

# Docker

A `Dockerfile` is provided for containerized deployment with Node 20 + Playwright/Chromium system deps. See `EC2_DEPLOYMENT.md` for AWS deployment guide.

# Gotchas

- The app uses `npm` (not pnpm) — the pnpm workspace files in the repo root are Replit scaffold only
- `DATABASE_URL` must be set before running migrations or starting the server
- Playwright Chromium must be installed after npm install: `npx playwright install chromium`
- API keys and SMTP passwords are encrypted with AES-256-CBC using `SESSION_SECRET` as the key derivation input
- The SMTP relay multiplexer only binds on `127.0.0.1:2525` (loopback) — Mailcow must be on the same host
- Clearbit logos are served from `logo.clearbit.com/{domain}` — they fall back to colored initials if unavailable
- Mailcow bulk-password endpoint uses `/api/v1/edit/mailbox` with `items: [username]` array format
