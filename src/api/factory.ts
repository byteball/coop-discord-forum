import { OpenAPIHono } from '@hono/zod-openapi'

/**
 * Create an OpenAPIHono instance with our shared validation hook so that Zod
 * validation failures return a consistent `400 { error, issues }` JSON response
 * on every router (the app and each mounted sub-router).
 */
export const createApi = () =>
  new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json({ error: 'validation failed', issues: result.error.issues }, 400)
      }
    },
  })
