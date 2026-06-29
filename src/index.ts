import { serve } from '@hono/node-server'
import { env } from './env.js'
import { app } from './api/app.js'
import { prisma, initDb } from './db.js'
import { discordClient } from './discord/client.js'
import { registerHandlers } from './discord/registerHandlers.js'

// Last-resort safety nets: log instead of crashing on a stray rejection/exception.
process.on('unhandledRejection', (reason) => {
  console.error('[process] unhandledRejection:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('[process] uncaughtException:', err)
})

async function main() {
  await initDb() // SQLite WAL + busy timeout

  // HTTP read API
  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    console.log(`[http] listening on http://localhost:${info.port}`)
  })

  // Discord Gateway bot. Startup reconciliation runs from the clientReady handler.
  registerHandlers(discordClient)
  await discordClient.login(env.DISCORD_BOT_TOKEN)
}

main().catch(async (err) => {
  console.error('[fatal] startup failed:', err)
  await prisma.$disconnect().catch(() => {})
  process.exit(1)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    console.log(`\n[shutdown] received ${signal}, closing...`)
    try {
      await discordClient.destroy()
    } catch {
      /* ignore */
    }
    await prisma.$disconnect().catch(() => {})
    process.exit(0)
  })
}
