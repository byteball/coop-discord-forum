import type { MiddlewareHandler } from 'hono'
import { getConnInfo } from '@hono/node-server/conninfo'
import { env } from '../env.js'

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

/** Simple in-memory fixed-window rate limit per client IP. `RATE_LIMIT_MAX=0` disables it. */
export const rateLimit: MiddlewareHandler = async (c, next) => {
  const max = env.RATE_LIMIT_MAX
  if (max <= 0) return next()

  const windowMs = env.RATE_LIMIT_WINDOW_MS
  let ip = 'unknown'
  try {
    // Behind a trusted proxy, the real client is the first X-Forwarded-For entry.
    const forwarded = env.TRUST_PROXY ? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() : undefined
    ip = forwarded || getConnInfo(c).remote.address || 'unknown'
  } catch {
    // no connection info (non-node adapter / test context) — fall back
  }
  const now = Date.now()

  let bucket = buckets.get(ip)
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs }
    buckets.set(ip, bucket)
  }
  bucket.count++

  // opportunistic cleanup so the map can't grow unbounded
  if (buckets.size > 10_000) {
    for (const [key, b] of buckets) if (now >= b.resetAt) buckets.delete(key)
  }

  c.header('X-RateLimit-Limit', String(max))
  c.header('X-RateLimit-Remaining', String(Math.max(0, max - bucket.count)))
  if (bucket.count > max) {
    c.header('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)))
    return c.json({ error: 'too many requests' }, 429)
  }
  return next()
}
