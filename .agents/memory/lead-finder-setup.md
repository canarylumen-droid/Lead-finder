---
name: Lead Finder setup
description: Key decisions and gotchas from the initial import and fix of the Lead Finder project.
---

## Merge conflicts resolved
The repo landed with git conflict markers in `package.json`, `tsconfig.json`, and `replit.md` because the GitHub code collided with the Replit workspace template. The Lead Finder (HEAD) version was the correct one to keep in all three files.

## Migration must be non-destructive
`script/migrate.ts` originally had `DROP TABLE IF EXISTS … CASCADE` at the top — it wiped all data on every run. Dockerfile CMD runs this at container start, so every container restart would nuke the database. Replaced with `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE … ADD COLUMN IF NOT EXISTS` throughout. The migration is now idempotent and safe.

**Why:** The `include_phone` column existed in `shared/schema.ts` but was missing from the old migration SQL, causing insert failures. Non-destructive ALTER TABLE IF NOT EXISTS adds it without data loss.

**How to apply:** Any future schema column additions should use `ALTER TABLE … ADD COLUMN IF NOT EXISTS` in `script/migrate.ts`, not a full drop-and-recreate.

## TypeScript fixes
- `client/src/pages/Dashboard.tsx`: SVG `title` prop is not in `SVGProps<SVGSVGElement>`. Use `aria-label` instead.
- `server/scraper/email-finder.ts`: Spread of `Set` (`[...new Set(...)]`) fails without a target ≥ ES2015 or downlevelIteration. Use `Array.from(new Set(...))` instead.

## Auth security note
`server/routes.ts` uses a raw `x-user-id` header for auth (no real session validation). This is fine for personal/internal use but is broken access control for any public-facing deployment.

## Environment
- `DATABASE_URL` and `SESSION_SECRET` are pre-set in the Replit environment (postgresql-16 module).
- `OPENAI_API_KEY` and `GEMINI_API_KEY` are NOT set — AI features won't work until the user adds them.
- App runs on port 5000 via `npm run dev` → `tsx server/index.ts`.
- Playwright Chromium is installed in the Replit environment and used for browser-based scraping.
