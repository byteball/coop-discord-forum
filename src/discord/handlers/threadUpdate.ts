import type { EventHandler } from './types.js'
import { isTrackedForumThread } from '../forum.js'
import { updatePostContent } from '../../services/postService.js'

export const threadUpdateHandler: EventHandler<'threadUpdate'> = {
  name: 'threadUpdate',
  async execute(oldThread, newThread) {
    if (!isTrackedForumThread(newThread)) return
    if (oldThread.name === newThread.name) return // only react to title (post name) changes
    await updatePostContent(newThread.id, { title: newThread.name })
    console.log(`[discord] post ${newThread.id} title updated`)
  },
}
