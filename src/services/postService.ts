import { prisma } from '../db.js'

// Discord limits: forum thread name ≤ 100 chars, message content ≤ 2000 (4000 with Nitro).
// Clip defensively at the persistence layer so no oversized text can ever be stored.
const TITLE_MAX = 100
const DESCRIPTION_MAX = 4000
const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s)

export interface UpsertPostInput {
  postId: string
  discordUserId: string
  title: string
  description: string
  createdAt: Date
  lastActivityAt?: Date
  obyteAddress?: string | null
}

/** Create the post or refresh its mutable fields (title/description). */
export async function upsertPost(input: UpsertPostInput) {
  const lastActivityAt = input.lastActivityAt ?? input.createdAt
  const title = clip(input.title, TITLE_MAX)
  const description = clip(input.description, DESCRIPTION_MAX)
  return prisma.post.upsert({
    where: { id: input.postId },
    create: {
      id: input.postId,
      discordUserId: input.discordUserId,
      title,
      description,
      createdAt: input.createdAt,
      lastActivityAt,
      obyteAddress: input.obyteAddress ?? null,
    },
    update: {
      title,
      description,
      deletedAt: null, // we're seeing the thread, so it exists (undo any stale soft-delete)
      // lastActivityAt is advanced separately via touchActivity (monotonic)
      ...(input.obyteAddress !== undefined ? { obyteAddress: input.obyteAddress } : {}),
    },
  })
}

/** Move the last-activity timestamp forward (no-op if the post is unknown or older). */
export async function touchActivity(postId: string, at: Date) {
  await prisma.post.updateMany({
    where: { id: postId, lastActivityAt: { lt: at } },
    data: { lastActivityAt: at },
  })
}

export async function setObyteAddress(postId: string, address: string) {
  await prisma.post.update({ where: { id: postId }, data: { obyteAddress: address } })
}

/** Update the post's title and/or description (no-op if the post is unknown). */
export async function updatePostContent(
  postId: string,
  fields: { title?: string; description?: string },
) {
  const data: { title?: string; description?: string } = {}
  if (fields.title !== undefined) data.title = clip(fields.title, TITLE_MAX)
  if (fields.description !== undefined) data.description = clip(fields.description, DESCRIPTION_MAX)
  if (Object.keys(data).length === 0) return
  await prisma.post.updateMany({ where: { id: postId }, data })
}

export async function markNotified(postId: string) {
  await prisma.post.update({ where: { id: postId }, data: { notified: true } })
}

export async function postExists(postId: string): Promise<boolean> {
  const found = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } })
  return found !== null
}

/** Mark a post deleted (hidden from the API). Returns the number of rows changed (0 if unknown/already deleted). */
export async function softDeletePost(postId: string, at: Date = new Date()): Promise<number> {
  const { count } = await prisma.post.updateMany({
    where: { id: postId, deletedAt: null },
    data: { deletedAt: at },
  })
  return count
}

/**
 * Soft-delete every live post whose id is NOT in `keepIds` (reconciliation pruning).
 * Computes the (usually small) missing set in JS and deletes it in chunks, so we never
 * build a giant `NOT IN (...)` that could exceed SQLite's bound-parameter limit.
 */
export async function softDeleteMissing(keepIds: string[], at: Date = new Date()): Promise<number> {
  const keep = new Set(keepIds)
  const live = await prisma.post.findMany({ where: { deletedAt: null }, select: { id: true } })
  const missing = live.filter((p) => !keep.has(p.id)).map((p) => p.id)
  if (missing.length === 0) return 0

  let count = 0
  for (let i = 0; i < missing.length; i += 500) {
    const { count: n } = await prisma.post.updateMany({
      where: { id: { in: missing.slice(i, i + 500) }, deletedAt: null },
      data: { deletedAt: at },
    })
    count += n
  }
  return count
}
