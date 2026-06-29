import type { ThreadChannel } from 'discord.js'
import { extractPostData, collectStarterReactions } from '../discord/forum.js'
import { upsertPost, markNotified, setObyteAddress } from './postService.js'
import { resolveAddress } from './attestationService.js'
import { replyWithProfileLinks } from './notifyService.js'
import { syncReactions } from './reactionService.js'

/**
 * Record (or refresh) a forum post from its thread:
 *  - upsert title/description/author/timestamps
 *  - on first sighting, resolve the author's attestation and store the address; unless
 *    `silent`, also post the profile links in the thread (once; tracked via Post.notified)
 *  - optionally re-sync all reactions from the live starter message (reconciliation)
 *
 * `silent` is used by the initial backfill so we don't blast replies into many old threads.
 * Shared by the threadCreate handler and the startup reconciliation.
 */
export async function ingestThread(
  thread: ThreadChannel,
  opts: { syncReactions?: boolean; silent?: boolean } = {},
) {
  // fetch the starter message once and reuse it for both the body and the reactions
  const starter = await thread.fetchStarterMessage().catch(() => null)
  const data = await extractPostData(thread, starter)
  const post = await upsertPost(data)

  if (!post.notified) {
    const address = await resolveAddress(data.discordUserId)
    if (address) {
      await setObyteAddress(data.postId, address)
      if (opts.silent) {
        await markNotified(data.postId) // backfill: record it without replying
      } else {
        try {
          await replyWithProfileLinks(thread, address)
          await markNotified(data.postId)
        } catch (err) {
          console.error(`[ingest] failed to post profile links in thread ${data.postId}:`, err)
        }
      }
    }
  }

  if (opts.syncReactions) {
    const reactions = await collectStarterReactions(starter)
    await syncReactions(data.postId, reactions)
  }

  return post
}
