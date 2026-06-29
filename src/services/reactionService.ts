import { prisma } from '../db.js'

/**
 * Add or remove a single user's reaction (a standard unicode emoji). Idempotent via the
 * (postId, userId, emoji) unique constraint. No-op if the post isn't tracked.
 */
export async function applyReaction(input: {
  postId: string
  userId: string
  emoji: string
  action: 'add' | 'remove'
}) {
  const { postId, userId, emoji, action } = input
  const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } })
  if (!post) return

  if (action === 'add') {
    await prisma.reaction.upsert({
      where: { postId_userId_emoji: { postId, userId, emoji } },
      create: { postId, userId, emoji },
      update: {},
    })
  } else {
    await prisma.reaction.deleteMany({ where: { postId, userId, emoji } })
  }
}

/** Replace all reactions of a post with the given live snapshot (used by reconciliation). */
export async function syncReactions(
  postId: string,
  reactions: { userId: string; emoji: string }[],
) {
  await prisma.$transaction(async (tx) => {
    await tx.reaction.deleteMany({ where: { postId } })
    if (reactions.length > 0) {
      await tx.reaction.createMany({
        data: reactions.map((r) => ({ postId, userId: r.userId, emoji: r.emoji })),
      })
    }
  })
}
