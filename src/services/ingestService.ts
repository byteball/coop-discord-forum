import type { ThreadChannel } from 'discord.js'
import { extractPostData, collectStarterReactions } from '../discord/forum.js'
import { upsertPost, markNotified, setObyteAddress } from './postService.js'
import { resolveAddress } from './attestationService.js'
import { replyWithVoteLink, replyWithAttestationPrompt } from './notifyService.js'
import { syncReactions } from './reactionService.js'

/**
 * Record (or refresh) a forum post from its thread:
 *  - upsert title/description/author/timestamps
 *  - on first sighting, resolve the author's attestation; unless `silent`, post the one
 *    automated reply (tracked via Post.notified): a COOP vote link for attested authors,
 *    or a prompt to link their account for non-attested ones
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
    const res = await resolveAddress(data.discordUserId)
    if (res.status === 'attested') {
      await setObyteAddress(data.postId, res.address)
      if (opts.silent) {
        await markNotified(data.postId) // backfill: record it without replying
      } else {
        try {
          await replyWithVoteLink(thread, data.discordUserId, res.address)
          await markNotified(data.postId)
          console.log(`[ingest] posted COOP vote link in thread ${data.postId} (user ${data.discordUserId})`)
        } catch (err) {
          console.error(`[ingest] failed to post vote link in thread ${data.postId}:`, err)
        }
      }
    } else if (res.status === 'unattested') {
      if (opts.silent) {
        await markNotified(data.postId) // backfill: never blast prompts into old threads
      } else {
        try {
          await replyWithAttestationPrompt(thread, data.discordUserId)
          await markNotified(data.postId)
          console.log(`[ingest] posted attestation prompt in thread ${data.postId} (user ${data.discordUserId})`)
        } catch (err) {
          console.error(`[ingest] failed to post attestation prompt in thread ${data.postId}:`, err)
        }
      }
    } else {
      // transient hub failure — send nothing and leave notified=false, so the next
      // ingest of this post (typically startup reconciliation) retries
      console.warn(
        `[ingest] attestation lookup failed for user ${data.discordUserId} — deferring reply in thread ${data.postId}`,
      )
    }
  }

  if (opts.syncReactions) {
    const reactions = await collectStarterReactions(starter)
    await syncReactions(data.postId, reactions)
  }

  return post
}
