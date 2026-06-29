import type { EventHandler } from './types.js'
import { isTrackedForumThread, isPostStarterMessage } from '../forum.js'
import { updatePostContent } from '../../services/postService.js'

export const messageUpdateHandler: EventHandler<'messageUpdate'> = {
  name: 'messageUpdate',
  async execute(_oldMessage, newMessage) {
    // discord.js types newMessage as a full (non-partial) Message for this event.
    if (!isTrackedForumThread(newMessage.channel)) return
    if (!isPostStarterMessage(newMessage)) return // only the post body = description
    await updatePostContent(newMessage.channelId, { description: newMessage.content ?? '' })
    console.log(`[discord] post ${newMessage.channelId} description updated`)
  },
}
