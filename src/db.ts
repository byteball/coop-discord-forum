import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { PrismaClient } from './generated/prisma/client.js'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { env } from './env.js'

// Prisma 7 connects through a driver adapter. The adapter strips the `file:` prefix and
// opens the SQLite file relative to the working dir. better-sqlite3 won't create the
// parent directory, so ensure it exists first.
const dbFile = env.DATABASE_URL.replace(/^file:/, '')
if (dbFile && dbFile !== ':memory:') mkdirSync(dirname(dbFile), { recursive: true })

const adapter = new PrismaBetterSqlite3({ url: env.DATABASE_URL })

/** Shared Prisma client (single connection for the whole process). */
export const prisma = new PrismaClient({ adapter })

/**
 * Enable SQLite WAL mode + a busy timeout for better read/write concurrency
 * (readers don't block the writer) and fewer "database is locked" errors. Call once at startup.
 */
export async function initDb() {
  await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL;')
  await prisma.$queryRawUnsafe('PRAGMA busy_timeout=5000;')
}
