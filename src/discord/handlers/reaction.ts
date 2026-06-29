import type { MessageReaction, PartialMessageReaction, User, PartialUser } from 'discord.js'
import type { EventHandler } from './types.js'
import { isTrackedForumThread, isPostStarterMessage, unicodeEmoji } from '../forum.js'
import { applyReaction } from '../../services/reactionService.js'

async function handleReaction(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
  action: 'add' | 'remove',
) {
  if (user.bot) return
  const emoji = unicodeEmoji(reaction.emoji)
  if (!emoji) return // skip custom emojis (not portable)

  const message = reaction.message.partial
    ? await reaction.message.fetch().catch(() => null)
    : reaction.message
  if (!message) return
  if (!isTrackedForumThread(message.channel)) return
  if (!isPostStarterMessage(message)) return // reactions on the post itself only

  await applyReaction({ postId: message.channelId, userId: user.id, emoji, action })
  console.log(
    `[discord] reaction ${action === 'add' ? 'added' : 'removed'}: ${emoji} by ${user.id} on post ${message.channelId}`,
  )
}

export const reactionAddHandler: EventHandler<'messageReactionAdd'> = {
  name: 'messageReactionAdd',
  execute: (reaction, user) => handleReaction(reaction, user, 'add'),
}

export const reactionRemoveHandler: EventHandler<'messageReactionRemove'> = {
  name: 'messageReactionRemove',
  execute: (reaction, user) => handleReaction(reaction, user, 'remove'),
}
