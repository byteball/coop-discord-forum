import 'dotenv/config'
import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

/** Split a comma-separated env value into a trimmed, non-empty list. */
const csv = (fallback: string) =>
  z
    .string()
    .optional()
    .default(fallback)
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))

export const env = createEnv({
  server: {
    // Discord
    DISCORD_BOT_TOKEN: z.string().min(1, 'DISCORD_BOT_TOKEN is required'),
    DISCORD_FORUM_CHANNEL_IDS: csv(''), // empty => track every GuildForum thread
    // Obyte
    DISCORD_ATTESTOR_ADDRESS: z
      .string()
      .min(1)
      .default('5KM36CFPBD2QJLVD65PHZG34WEM4RPY2'),
    OBYTE_TESTNET: z
      .string()
      .optional()
      .default('false')
      .transform((s) => s === 'true' || s === '1'),
    // COOP profile link posted in-thread: <COOP_BASE_URL>/user/<address>
    COOP_BASE_URL: z
      .url()
      .default('https://coop.obyte.org')
      .transform((s) => s.replace(/\/+$/, '')),
    // Public base URL of this API, used in Discord messages (e.g. <PUBLIC_BASE_URL>/pair).
    // No default: a wrong fallback would put broken localhost links into public messages,
    // so fail loudly at startup instead.
    PUBLIC_BASE_URL: z.url().transform((s) => s.replace(/\/+$/, '')),
    // Full obyte: pairing URI of the Discord attestation bot; the GET /pair page opens it.
    ATTESTATION_BOT_PAIRING_URI: z
      .string()
      .regex(/^obyte(-tn)?:.+/, 'must be an obyte: (or obyte-tn:) pairing URI')
      .default('obyte:Ama48/uKO+/Tjv28zFKwElBO4SEQNuWAM1VPJkl4DTZO@obyte.org/bb#0000'),
    // HTTP
    PORT: z.coerce.number().int().positive().default(3000),
    // Per-IP rate limit (0 disables it).
    RATE_LIMIT_MAX: z.coerce.number().int().min(0).default(120),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    // Behind a trusted reverse proxy? Then rate-limit by the X-Forwarded-For client IP.
    // Leave false on direct exposure — otherwise clients could spoof the header.
    TRUST_PROXY: z
      .string()
      .optional()
      .default('false')
      .transform((s) => s === 'true' || s === '1'),
    // Prisma (also read directly by the Prisma CLI/client from .env)
    DATABASE_URL: z.string().min(1).default('file:./data/contribution-log.db'),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})
