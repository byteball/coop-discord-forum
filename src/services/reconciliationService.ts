import { ChannelType } from 'discord.js'
import type { Client, ForumChannel, ThreadChannel } from 'discord.js'
import { env } from '../env.js'
import { prisma } from '../db.js'
import { ingestThread } from './ingestService.js'
import { softDeleteMissing } from './postService.js'

const ARCHIVE_PAGE_CAP = 50 // safety bound: up to 50 * 100 archived threads per forum

/**
 * Verify each configured channel actually IS a GuildForum and the bot can see it,
 * logging a ✓/✗ line per channel. A channel's type is only knowable via the Discord
 * API, so this runs at startup (after login), not before the process starts.
 *
 * Throws if `DISCORD_FORUM_CHANNEL_IDS` is set but none resolve to a usable forum,
 * so a misconfiguration fails loudly instead of silently tracking nothing.
 * With no ids configured, every visible GuildForum is discovered instead.
 */
export async function resolveForumChannels(client: Client): Promise<ForumChannel[]> {
  const ids = env.DISCORD_FORUM_CHANNEL_IDS
  const out: ForumChannel[] = []

  if (ids.length === 0) {
    for (const guild of client.guilds.cache.values()) {
      const channels = await guild.channels.fetch().catch(() => null)
      if (!channels) continue
      for (const ch of channels.values()) {
        if (ch?.type === ChannelType.GuildForum) {
          console.log(`[forum-check] ✓ discovered forum ${ch.id} ("${ch.name}")`)
          out.push(ch)
        }
      }
    }
    if (out.length === 0) {
      console.warn('[forum-check] no GuildForum channels visible to the bot')
    }
    return out
  }

  for (const id of ids) {
    const ch = await client.channels.fetch(id).catch(() => null)
    if (!ch) {
      console.error(`[forum-check] ✗ channel ${id} not found or the bot has no access`)
    } else if (ch.type !== ChannelType.GuildForum) {
      const label = 'name' in ch && ch.name ? `"${ch.name}"` : `type ${ch.type}`
      console.error(`[forum-check] ✗ channel ${id} is ${label}, not a forum — skipping`)
    } else {
      console.log(`[forum-check] ✓ forum ${id} ("${ch.name}")`)
      out.push(ch)
    }
  }

  if (out.length === 0) {
    throw new Error(
      'DISCORD_FORUM_CHANNEL_IDS is set but none of the ids are GuildForum channels the bot can access — check the ids and the bot permissions',
    )
  }
  return out
}

/**
 * All threads (posts) of a forum: active + public archived, paginated.
 * `complete` is false if a fetch failed or the page cap was hit — in that case the
 * thread set is partial and must NOT be used to prune (we'd delete real posts).
 */
async function collectThreads(
  forum: ForumChannel,
): Promise<{ threads: ThreadChannel[]; complete: boolean }> {
  const threads = new Map<string, ThreadChannel>()
  let complete = true

  const active = await forum.threads.fetchActive().catch(() => null)
  if (active) active.threads.forEach((t) => threads.set(t.id, t))
  else complete = false // couldn't list active threads

  let before: string | undefined
  let page = 0
  for (; page < ARCHIVE_PAGE_CAP; page++) {
    const archived = await forum.threads
      .fetchArchived({ type: 'public', limit: 100, before })
      .catch(() => null)
    if (!archived) {
      complete = false // archive fetch failed mid-way
      break
    }
    if (archived.threads.size === 0) break
    archived.threads.forEach((t) => threads.set(t.id, t))
    if (!archived.hasMore) break
    before = archived.threads.last()?.id
  }
  if (page === ARCHIVE_PAGE_CAP) {
    complete = false
    console.warn(`[reconcile] forum ${forum.id}: hit archived page cap, some old threads may be unscanned`)
  }

  return { threads: [...threads.values()], complete }
}

/**
 * Startup catch-up: walk every tracked forum, (re)record each post, post the automated
 * reply for any post we hadn't notified yet, and re-sync reaction counts.
 */
export async function syncAllForums(client: Client) {
  const forums = await resolveForumChannels(client)
  if (forums.length === 0) {
    console.warn('[reconcile] no forum channels to track — nothing to sync')
    return
  }

  // First run on an existing forum: backfill silently so we don't blast automated
  // replies into many old threads. New posts after startup still get replies (threadCreate).
  const silent = (await prisma.post.count()) === 0
  if (silent) {
    console.log('[reconcile] empty database — backfilling existing posts silently (no replies)')
  }

  let checked = 0
  let errors = 0
  let complete = true
  const seenIds: string[] = []
  for (const forum of forums) {
    const { threads, complete: forumComplete } = await collectThreads(forum)
    if (!forumComplete) complete = false
    for (const thread of threads) {
      try {
        await ingestThread(thread, { syncReactions: true, silent })
        seenIds.push(thread.id)
        checked++
      } catch (err) {
        errors++
        console.error(`[reconcile] failed thread ${thread.id}:`, err)
      }
    }
  }

  // Prune posts deleted while we were offline — only when enumeration was complete,
  // so a transient fetch error or the page cap can never wipe real posts.
  let pruned = 0
  if (complete && errors === 0) {
    pruned = await softDeleteMissing(seenIds)
  } else {
    console.warn('[reconcile] incomplete thread enumeration — skipping deletion pruning this run')
  }

  console.log(
    `[reconcile] done: ${checked} posts checked across ${forums.length} forum(s), ` +
      `${pruned} pruned` +
      (errors ? `, ${errors} errors` : ''),
  )
}
