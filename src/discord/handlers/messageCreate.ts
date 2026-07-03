import type { EventHandler } from './types.js'
import { isTrackedForumThread, isPostStarterMessage } from '../forum.js'
import { postExists, touchActivity } from '../../services/postService.js'
import { ingestThread } from '../../services/ingestService.js'

export const messageCreateHandler: EventHandler<'messageCreate'> = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot) return
    const channel = message.channel
    if (!isTrackedForumThread(channel)) return
    if (isPostStarterMessage(message)) return // the post body, not a comment

    // a comment on a thread created before the bot started won't be in the DB yet —
    // record it silently (a comment must never trigger the automated reply)
    if (!(await postExists(message.channelId))) {
      await ingestThread(channel, { syncReactions: false, silent: true })
    }
    await touchActivity(message.channelId, message.createdAt)
  },
}
