import { defineConfig } from "drizzle-kit";

// Migrations should use the direct (unpooled) connection when available.
// The Neon/Vercel integration provides both variables.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
});
