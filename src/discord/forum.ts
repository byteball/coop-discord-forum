import { ChannelType } from 'discord.js'
import type { AnyThreadChannel, Channel, Message, ThreadChannel } from 'discord.js'
import { z } from 'zod'
import { env } from '../env.js'
import type { UpsertPostInput } from '../services/postService.js'

const emojiSchema = z.emoji()

/**
 * Return the standard unicode emoji char, or null for custom (guild) emojis.
 * Custom emojis have an `id` and aren't portable to other sites, so we skip them.
 * The name is validated with zod so only real emoji reach the DB.
 */
export function unicodeEmoji(emoji: { id: string | null; name: string | null }): string | null {
  if (emoji.id) return null // custom emoji
  const name = emoji.name
  if (!name) return null
  if (!emojiSchema.safeParse(name).success) {
    console.warn(`[reaction] ignoring non-emoji reaction: ${JSON.stringify(name)}`)
    return null
  }
  return name
}

/** Is this forum channel one we track? Empty config => track all forums. */
export function isTrackedForumChannelId(id: string | null | undefined): boolean {
  const ids = env.DISCORD_FORUM_CHANNEL_IDS
  if (ids.length === 0) return true
  return id != null && ids.includes(id)
}

/** A thread under a (tracked) GuildForum channel. */
export function isTrackedForumThread(channel: Channel | null | undefined): channel is AnyThreadChannel {
  if (!channel || !channel.isThread()) return false
  const parent = channel.parent
  if (!parent || parent.type !== ChannelType.GuildForum) return false
  return isTrackedForumChannelId(channel.parentId)
}

/** The post body message (its id equals the thread id), as opposed to a comment. */
export function isPostStarterMessage(message: Message): boolean {
  return message.id === message.channelId
}

/** Build the DB record for a post from its thread + (already fetched) starter message. */
export async function extractPostData(
  thread: ThreadChannel,
  starter: Message | null,
): Promise<UpsertPostInput> {
  const lastMessage = (await thread.messages.fetch({ limit: 1 }).catch(() => null))?.first()
  const createdAt = thread.createdAt ?? new Date()

  return {
    postId: thread.id,
    discordUserId: thread.ownerId ?? starter?.author.id ?? 'unknown',
    title: thread.name,
    description: starter?.content ?? '',
    createdAt,
    lastActivityAt: lastMessage?.createdAt ?? createdAt,
  }
}

/** Read all live unicode reactions (emoji + reactor) from a post's starter message. */
export async function collectStarterReactions(
  starter: Message | null,
): Promise<{ userId: string; emoji: string }[]> {
  const out: { userId: string; emoji: string }[] = []
  if (!starter) return out

  for (const reaction of starter.reactions.cache.values()) {
    const emoji = unicodeEmoji(reaction.emoji)
    if (!emoji) continue // skip custom emojis
    const users = await reaction.users.fetch().catch(() => null)
    if (!users) continue
    for (const user of users.values()) {
      if (!user.bot) out.push({ userId: user.id, emoji })
    }
  }
  return out
}
