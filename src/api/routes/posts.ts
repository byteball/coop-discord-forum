import { createRoute, z } from '@hono/zod-openapi'
import type { Post, Prisma } from '../../generated/prisma/client.js'
import { prisma } from '../../db.js'
import { createApi } from '../factory.js'

export interface ReactionCount {
  emoji: string
  count: number
}

// ---- schemas ---------------------------------------------------------------

const snowflake = z
  .string()
  .regex(/^\d{1,20}$/, 'invalid Discord snowflake id')
  .openapi({ example: '411516467402506240', description: 'Discord snowflake id' })

const ReactionCountSchema = z
  .object({
    emoji: z.emoji().openapi({ example: '👍', description: 'standard unicode emoji char' }),
    count: z.number().int().openapi({ example: 3 }),
  })
  .openapi('ReactionCount')

const PostSchema = z
  .object({
    postId: z.string().openapi({ example: '1234567890' }),
    guildId: z.string().nullable().openapi({
      example: '1122334455667788990',
      description: 'Discord guild id — build thread links as https://discord.com/channels/{guildId}/{postId}',
    }),
    discordUserId: z.string().openapi({ example: '411516467402506240' }),
    obyteAddress: z.string().nullable().openapi({ example: 'YQIHCLB2AB43JIMODIE3ZLNAM4FULVLK' }),
    title: z.string().openapi({ example: 'My contribution' }),
    description: z.string().openapi({ example: 'Post body text' }),
    reactions: z.array(ReactionCountSchema).openapi({ description: 'reaction counts per emoji, busiest first' }),
    createdAt: z.string().openapi({ format: 'date-time', example: '2026-06-26T12:00:00.000Z' }),
    lastActivityAt: z.string().openapi({ format: 'date-time', example: '2026-06-26T12:34:00.000Z' }),
  })
  .openapi('Post')

const UserPostsSchema = z
  .object({
    discordUserId: z.string(),
    total: z.number().int().openapi({ description: 'total posts for this user' }),
    count: z.number().int().openapi({ description: 'posts returned in this page' }),
    limit: z.number().int(),
    offset: z.number().int(),
    sort: z.string(),
    order: z.string(),
    posts: z.array(PostSchema),
  })
  .openapi('UserPosts')

const ErrorSchema = z.object({ error: z.string() }).openapi('Error')

const ListQuerySchema = z.object({
  sort: z
    .enum(['created', 'activity'])
    .default('created')
    .openapi({ description: 'created = createdAt, activity = lastActivityAt' }),
  order: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

const json = <T>(schema: T) => ({ 'application/json': { schema } })

// ---- routes ----------------------------------------------------------------

const getUserPostsRoute = createRoute({
  method: 'get',
  path: '/users/{discordUserId}/posts',
  tags: ['posts'],
  summary: "List a Discord user's posts (sortable, paginated)",
  request: {
    params: z.object({ discordUserId: snowflake }),
    query: ListQuerySchema,
  },
  responses: {
    200: { content: json(UserPostsSchema), description: 'Posts by the user' },
    400: { content: json(ErrorSchema), description: 'Invalid parameters' },
    429: { content: json(ErrorSchema), description: 'Rate limit exceeded' },
  },
})

const getPostRoute = createRoute({
  method: 'get',
  path: '/posts/{postId}',
  tags: ['posts'],
  summary: 'Get a single post by id',
  request: { params: z.object({ postId: snowflake }) },
  responses: {
    200: { content: json(PostSchema), description: 'The post' },
    400: { content: json(ErrorSchema), description: 'Invalid post id' },
    404: { content: json(ErrorSchema), description: 'Post not found' },
    429: { content: json(ErrorSchema), description: 'Rate limit exceeded' },
  },
})

// ---- helpers ---------------------------------------------------------------

function serialize(post: Post, reactions: ReactionCount[]) {
  return {
    postId: post.id,
    guildId: post.guildId,
    discordUserId: post.discordUserId,
    obyteAddress: post.obyteAddress,
    title: post.title,
    description: post.description,
    reactions,
    createdAt: post.createdAt.toISOString(),
    lastActivityAt: post.lastActivityAt.toISOString(),
  }
}

const byCountDesc = (a: ReactionCount, b: ReactionCount) =>
  b.count - a.count || a.emoji.localeCompare(b.emoji)

/** Aggregate reaction counts per emoji for a set of posts (SQL GROUP BY — counts only). */
async function reactionCountsByPost(postIds: string[]): Promise<Map<string, ReactionCount[]>> {
  const map = new Map<string, ReactionCount[]>()
  if (postIds.length === 0) return map
  const grouped = await prisma.reaction.groupBy({
    by: ['postId', 'emoji'],
    where: { postId: { in: postIds } },
    _count: true,
  })
  for (const g of grouped) {
    const arr = map.get(g.postId) ?? []
    arr.push({ emoji: g.emoji, count: g._count })
    map.set(g.postId, arr)
  }
  for (const arr of map.values()) arr.sort(byCountDesc)
  return map
}

function orderByFor(
  sort: 'created' | 'activity',
  order: 'asc' | 'desc',
): Prisma.PostOrderByWithRelationInput[] {
  if (sort === 'activity') return [{ lastActivityAt: order }, { createdAt: 'desc' }]
  return [{ createdAt: order }]
}

// ---- handlers --------------------------------------------------------------

export const posts = createApi()

posts.openapi(getUserPostsRoute, async (c) => {
  const { discordUserId } = c.req.valid('param')
  const { sort, order, limit, offset } = c.req.valid('query')

  const where = { discordUserId, deletedAt: null }
  const [total, rows] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({ where, orderBy: orderByFor(sort, order), take: limit, skip: offset }),
  ])
  const counts = await reactionCountsByPost(rows.map((p) => p.id))

  return c.json(
    {
      discordUserId,
      total,
      count: rows.length,
      limit,
      offset,
      sort,
      order,
      posts: rows.map((p) => serialize(p, counts.get(p.id) ?? [])),
    },
    200,
  )
})

posts.openapi(getPostRoute, async (c) => {
  const { postId } = c.req.valid('param')
  const post = await prisma.post.findUnique({ where: { id: postId } })
  if (!post || post.deletedAt) return c.json({ error: 'post not found' }, 404)
  const counts = (await reactionCountsByPost([postId])).get(postId) ?? []
  return c.json(serialize(post, counts), 200)
})
