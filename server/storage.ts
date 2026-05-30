import { db } from "./db.js";
import { users, scrapeSessions, leads } from "../shared/schema.js";
import { eq, desc, and } from "drizzle-orm";
import type { InsertUser, InsertSession, InsertLead, ScrapeSession, Lead, User } from "../shared/schema.js";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

// ── Password helpers ──────────────────────────────────────────────────────────
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function verifyPassword(stored: string, supplied: string): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  const buf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(buf, Buffer.from(hashed, "hex"));
}

// ── Users ─────────────────────────────────────────────────────────────────────
export async function createUser(email: string, password: string): Promise<User> {
  const passwordHash = await hashPassword(password);
  const [user] = await db.insert(users).values({ email, passwordHash }).returning();
  return user;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user ?? null;
}

// ── Sessions ──────────────────────────────────────────────────────────────────
export async function createSession(data: InsertSession): Promise<ScrapeSession> {
  const [session] = await db.insert(scrapeSessions).values(data).returning();
  return session;
}

export async function getSessionsByUser(userId: number): Promise<ScrapeSession[]> {
  return db
    .select()
    .from(scrapeSessions)
    .where(eq(scrapeSessions.userId, userId))
    .orderBy(desc(scrapeSessions.startedAt));
}

export async function getSession(id: number): Promise<ScrapeSession | null> {
  const [s] = await db.select().from(scrapeSessions).where(eq(scrapeSessions.id, id));
  return s ?? null;
}

// ── Leads ─────────────────────────────────────────────────────────────────────
export async function getLeadsBySession(
  sessionId: number,
  userId: number,
  limit = 100,
  offset = 0
): Promise<Lead[]> {
  return db
    .select()
    .from(leads)
    .where(and(eq(leads.sessionId, sessionId), eq(leads.userId, userId)))
    .limit(limit)
    .offset(offset);
}

export async function streamLeadsForCSV(
  sessionId: number,
  userId: number
): Promise<Lead[]> {
  return db
    .select()
    .from(leads)
    .where(and(eq(leads.sessionId, sessionId), eq(leads.userId, userId)));
}
