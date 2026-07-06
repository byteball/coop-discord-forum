import { createRoute, z } from '@hono/zod-openapi'
import { logger } from 'hono/logger'
import { Scalar } from '@scalar/hono-api-reference'
import { posts } from './routes/posts.js'
import { createApi } from './factory.js'
import { rateLimit } from './rateLimit.js'
import { pairPageHtml } from './pairPage.js'

export const app = createApi()

// Log every incoming request/response.
app.use('*', logger())
// Per-IP rate limit on everything. All routes are public (no auth).
app.use('*', rateLimit)

const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  tags: ['meta'],
  summary: 'Liveness check',
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ ok: z.boolean() }).openapi('Health') } },
      description: 'Service is up',
    },
  },
})

app.openapi(healthRoute, (c) => c.json({ ok: true }, 200))

// Link target for Discord messages: Discord won't render obyte: links, so this page
// opens the attestation bot's pairing URI in the wallet (with manual-button and
// download-link fallbacks). Deliberately a plain (non-OpenAPI) route — it serves HTML
// for humans clicking a link, not API consumers.
app.get('/pair', (c) => c.html(pairPageHtml))

app.route('/', posts)

// Any uncaught error in a handler → logged + clean 500 (never crashes the process).
app.onError((err, c) => {
  console.error('[http] unhandled error:', err)
  return c.json({ error: 'internal server error' }, 500)
})

// OpenAPI document + interactive reference UI.
app.doc('/doc', {
  openapi: '3.0.0',
  info: { title: 'contribution-log API', version: '1.0.0' },
})
app.get('/reference', Scalar({ url: '/doc' }))
