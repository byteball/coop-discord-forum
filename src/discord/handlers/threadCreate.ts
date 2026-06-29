import type { EventHandler } from './types.js'
import { isTrackedForumThread } from '../forum.js'
import { ingestThread } from '../../services/ingestService.js'

export const threadCreateHandler: EventHandler<'threadCreate'> = {
  name: 'threadCreate',
  async execute(thread, newlyCreated) {
    // also fires when the bot merely gains access to an existing thread
    if (!newlyCreated) return
    if (!isTrackedForumThread(thread)) return
    await ingestThread(thread, { syncReactions: false })
    console.log(`[discord] recorded forum post ${thread.id} "${thread.name}"`)
  },
}
