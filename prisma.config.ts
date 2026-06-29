import 'dotenv/config'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { defineConfig, env } from 'prisma/config'

// Ensure the SQLite directory exists for CLI commands (db push / migrate) — the
// better-sqlite3 adapter won't create it.
const dbFile = (process.env.DATABASE_URL ?? '').replace(/^file:/, '')
if (dbFile && dbFile !== ':memory:') mkdirSync(path.dirname(dbFile), { recursive: true })

// Prisma 7 moved the connection URL out of the schema. The CLI (db push / migrate /
// studio) reads it from here; the runtime client connects via the driver adapter (src/db.ts).
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url: env('DATABASE_URL'),
  },
})
