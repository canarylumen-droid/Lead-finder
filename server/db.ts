import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

// DATABASE_URL is not strictly required for local development 
// if you are only running the frontend part or mocking data.
// Uncomment the throw error if you intend to connect to a real database.

/*
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}
*/

export const pool = new Pool({ connectionString: process.env.DATABASE_URL || "postgresql://user:password@localhost:5432/dbname" });
export const db = drizzle(pool, { schema });
