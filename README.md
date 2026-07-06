# contribution-log

A service that mirrors a **Discord forum** into a local database (SQLite + Prisma) and serves it
over HTTP (Hono). For every forum post it stores the title, description, the author's Discord id
and the post id; it stores standard (unicode) emoji reactions on the post and bumps a
last-activity timestamp on new comments.
For every new post the bot publicly replies in the thread once: if the author has an
**Obyte attestation**, with a vote link to their COOP profile; otherwise, with a prompt asking
them to link their Discord account to their Obyte address (via the attestation bot). On startup
it reconciles against Discord so nothing is lost while the service was down.

## How it works

Discord does **not** deliver forum / comment / reaction events over HTTP webhooks — they can only
be received through a **Gateway bot** (a persistent WebSocket connection). So the service runs two
things in a single process:

- **Discord bot** (`discord.js`, Gateway) — receives events and writes to the DB.
- **HTTP server** (`Hono`) — serves the stored posts.

The Obyte address for a Discord id is resolved via **obyte.js** (`getAttestation` → unit, then
`getJoint` → the address from the attestation payload) using the attestor in
`DISCORD_ATTESTOR_ADDRESS`.

### Gateway events consumed

| Event | Action |
|---|---|
| `clientReady` | startup reconciliation (catch up on anything missed) |
| `threadCreate` | new post → save + reply with a COOP vote link (attested) or an attestation prompt (not attested) |
| `threadUpdate` | post renamed → update the stored title |
| `threadDelete` | post deleted → soft-delete it (hidden from the API) |
| `messageCreate` | comment in a thread → update `lastActivityAt` |
| `messageUpdate` | post body edited → update the stored description |
| `messageReactionAdd` / `messageReactionRemove` | a user's reaction (any emoji) on a post → store/remove it |

## Requirements

- **Node.js >= 20**
- **pnpm**
- A Discord application with a bot
- Access to an Obyte hub (defaults to the public `wss://obyte.org/bb`)

## Installation

```bash
pnpm install
cp .env.example .env   # then edit .env (see below)
pnpm prisma generate   # generate the Prisma Client
pnpm db:push           # create the SQLite database from the schema
```

## Discord bot setup

1. Open <https://discord.com/developers/applications> → **New Application**.
2. **Bot** tab → **Add Bot** → copy the **Token** into `DISCORD_BOT_TOKEN`.
3. Under **Privileged Gateway Intents** enable **MESSAGE CONTENT INTENT** (required to read post
   and comment text). No other privileged intents are needed.
4. Invite the bot to your server (**OAuth2 → URL Generator**): scope `bot`, permissions:
   *View Channels*, *Read Message History*, *Send Messages*, *Send Messages in Threads*.
5. (Optional) To track only specific forum channels, enable **Developer Mode** in Discord
   (Settings → Advanced), right-click a forum channel → **Copy Channel ID**, and put the id(s)
   (comma-separated) into `DISCORD_FORUM_CHANNEL_IDS`. Empty = all forum channels.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `file:./prisma/data/contribution-log.db` | SQLite path (relative to the project root) |
| `DISCORD_BOT_TOKEN` | — | **required**, bot token |
| `DISCORD_FORUM_CHANNEL_IDS` | empty | comma-separated forum channel ids; empty = all |
| `DISCORD_ATTESTOR_ADDRESS` | `5KM36CFPBD2QJLVD65PHZG34WEM4RPY2` | Discord→address attestor |
| `OBYTE_TESTNET` | `false` | `true` connects to the testnet hub |
| `COOP_BASE_URL` | `https://coop.obyte.org` | base URL for COOP profile links |
| `PUBLIC_BASE_URL` | — | **required**, public base URL of this API, used in Discord messages (`<PUBLIC_BASE_URL>/pair`) |
| `ATTESTATION_BOT_PAIRING_URI` | `obyte:Ama48/…@obyte.org/bb#0000` | `obyte:` pairing URI of the attestation bot; the `GET /pair` page opens it |
| `PORT` | `3000` | HTTP server port |
| `CORS_ORIGIN` | `*` | comma-separated list of allowed browser origins (`*` = any; safe for this read-only, credential-less API) |
| `RATE_LIMIT_MAX` | `120` | max requests per IP per window (`0` disables) |
| `RATE_LIMIT_WINDOW_MS` | `60000` | rate-limit window in ms |
| `TRUST_PROXY` | `false` | behind a trusted proxy: rate-limit by `X-Forwarded-For` client IP (leave off on direct exposure) |

COOP profile links are built as `<COOP_BASE_URL>/user/<address>`.

## Running

```bash
pnpm dev     # development (tsx watch)
# or
pnpm build   # prisma generate + tsc -> dist/
pnpm start   # node dist/index.js
```

On startup you should see something like:

```
[http] listening on http://localhost:3000
[discord] logged in as <bot>#0000
[forum-check] ✓ forum <id> ("<name>")
[reconcile] done: N posts checked across M forum(s)
```

## HTTP API (public, no auth)

Routes are defined with [`@hono/zod-openapi`](https://github.com/honojs/middleware/tree/main/packages/zod-openapi),
so request/response schemas, validation and the OpenAPI document all come from one source.

| Method & path | Description |
|---|---|
| `GET /health` | liveness check |
| `GET /pair` | page that opens the attestation bot's `obyte:` pairing URI in the wallet, with a manual button and a [wallet download](https://obyte.org/#download) fallback (not in the OpenAPI doc) |
| `GET /users/{discordUserId}/posts` | a user's posts — sortable & paginated |
| `GET /posts/{postId}` | a single post by id |
| `GET /doc` | the OpenAPI 3.0 document (JSON) |
| `GET /reference` | interactive API reference UI (Scalar) |

**Query params for `/users/{discordUserId}/posts`:**

| Param | Values | Default | Notes |
|---|---|---|---|
| `sort` | `created` \| `activity` | `created` | `activity` = last comment time |
| `order` | `asc` \| `desc` | `desc` | |
| `limit` | `1`–`100` | `20` | page size |
| `offset` | `≥ 0` | `0` | page offset |

The list response includes `total`, `count`, `limit`, `offset`, `sort`, `order`, and `posts[]`.
Each post carries a `reactions[]` array of **aggregated counts** per emoji
(`{ emoji, count }`, busiest first) — counted server-side so the client gets a small payload, not
every individual reaction. Only standard unicode emojis are included; custom (guild) emojis are
skipped, since they aren't portable to other sites.

```bash
curl http://localhost:3000/health                                  # { "ok": true }
curl "http://localhost:3000/users/411516467402506240/posts?sort=activity&order=desc&limit=20"
curl http://localhost:3000/posts/<postId>
curl http://localhost:3000/doc                                     # OpenAPI spec
open  http://localhost:3000/reference                              # docs UI
```

All routes are public (no auth). Invalid params return
`400 { "error": "validation failed", "issues": [...] }` (from the Zod schema); exceeding the rate
limit returns `429`. CORS is enabled (`CORS_ORIGIN`, default any origin), so browser apps can call
the API directly; `guildId` lets them link back to the thread as
`https://discord.com/channels/<guildId>/<postId>` (`null` on rows ingested before this field
existed — backfilled at the next startup reconciliation).

Response for a user's posts:

```json
{
  "discordUserId": "411516467402506240",
  "count": 1,
  "posts": [
    {
      "postId": "1234567890",
      "guildId": "1122334455667788990",
      "discordUserId": "411516467402506240",
      "obyteAddress": "YQIHCLB2AB43JIMODIE3ZLNAM4FULVLK",
      "title": "Post title",
      "description": "Post body",
      "reactions": [
        { "emoji": "👍", "count": 3 },
        { "emoji": "🎉", "count": 1 }
      ],
      "createdAt": "2026-06-26T12:00:00.000Z",
      "lastActivityAt": "2026-06-26T12:34:00.000Z"
    }
  ]
}
```

## Database commands

```bash
pnpm db:push      # sync the schema to the DB (no migration files)
pnpm db:migrate   # create/apply a migration (dev)
pnpm db:studio    # Prisma Studio (browse data)
```

## Notes

- If a post's author has **no attestation**, the post is still saved (keyed by Discord id), and
  the bot replies once asking the author to link their Discord account to their Obyte address —
  the link goes through `GET /pair` because Discord doesn't render `obyte:` links. Exactly one
  automated reply is sent per post (tracked via `Post.notified`), whichever branch applied first.
  If the attestation lookup fails transiently (hub error/timeout), nothing is sent and the reply
  is retried at the next ingest of that post (typically startup reconciliation).
- Reactions are stored one row per `postId + userId + emoji` in the `Reaction` table, which makes
  add/remove handling idempotent. The emoji is validated with `z.emoji()` before storing (custom
  guild emojis are skipped). Startup reconciliation rebuilds the set from the live message. The API
  exposes only **aggregated counts per emoji** (`GROUP BY` in SQL), not individual reactions.
- Only individual user reactions are tracked live (`messageReactionAdd`/`Remove`). Moderator bulk
  actions (clear-all / remove-all-of-one-emoji) are out of scope and instead get corrected at the
  next startup reconciliation.
- A channel's type is only knowable through the Discord API, so the forum-channel check runs at
  startup (after login). It logs `✓ forum <id>` / `✗ ... not a forum` per configured channel, and
  fails loudly if `DISCORD_FORUM_CHANNEL_IDS` is set but none resolve to a usable forum.
- **Deleted posts** are **soft-deleted**: the `Post.deletedAt` column is set and the post is
  hidden from the API, but the row (and its contribution history) is kept. Live deletions come via
  `threadDelete`; deletions that happened while the bot was offline are pruned during startup
  reconciliation — but only when thread enumeration completed fully (no fetch errors, page cap not
  hit), so a transient error can never wipe real posts. Re-seeing a thread clears `deletedAt`.
- Uses **Prisma 7**: the connection URL lives in `prisma.config.ts` (for the CLI) and the runtime
  client connects through the `better-sqlite3` driver adapter (`src/db.ts`). The schema's
  `datasource` has no `url`. The client is generated in-tree to `src/generated/prisma` (gitignored,
  regenerated by `prisma generate` / `pnpm build`) and imported from there — a single generated
  copy, no `node_modules` ambiguity.
- The database (`prisma/data/`) and `.env` are gitignored.
