import type { EventHandler } from './types.js'
import { softDeletePost } from '../../services/postService.js'

export const threadDeleteHandler: EventHandler<'threadDelete'> = {
  name: 'threadDelete',
  async execute(thread) {
    // No-op if the thread isn't one of our tracked posts (count === 0).
    const count = await softDeletePost(thread.id)
    if (count > 0) console.log(`[discord] forum post ${thread.id} deleted`)
  },
}
