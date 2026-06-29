import type { Client, ClientEvents } from 'discord.js'
import type { EventHandler } from './handlers/types.js'
import { readyHandler } from './handlers/ready.js'
import { threadCreateHandler } from './handlers/threadCreate.js'
import { threadUpdateHandler } from './handlers/threadUpdate.js'
import { threadDeleteHandler } from './handlers/threadDelete.js'
import { messageCreateHandler } from './handlers/messageCreate.js'
import { messageUpdateHandler } from './handlers/messageUpdate.js'
import { reactionAddHandler, reactionRemoveHandler } from './handlers/reaction.js'

/** Wrap a handler so a thrown/rejected execute is logged, never crashing the client. */
function wrap<K extends keyof ClientEvents>(handler: EventHandler<K>) {
  return (...args: ClientEvents[K]) => {
    void Promise.resolve(handler.execute(...args)).catch((err) =>
      console.error(`[discord] handler "${handler.name}" failed:`, err),
    )
  }
}

export function registerHandlers(client: Client) {
  // discord.js Client is an EventEmitter: an unhandled 'error' event would crash the
  // process, so always listen. 'shardError'/'warn' are informational.
  client.on('error', (err) => console.error('[discord] client error:', err))
  client.on('shardError', (err) => console.error('[discord] shard error:', err))
  client.on('warn', (msg) => console.warn('[discord] warn:', msg))

  client.once(readyHandler.name, wrap(readyHandler))
  client.on(threadCreateHandler.name, wrap(threadCreateHandler))
  client.on(threadUpdateHandler.name, wrap(threadUpdateHandler))
  client.on(threadDeleteHandler.name, wrap(threadDeleteHandler))
  client.on(messageCreateHandler.name, wrap(messageCreateHandler))
  client.on(messageUpdateHandler.name, wrap(messageUpdateHandler))
  client.on(reactionAddHandler.name, wrap(reactionAddHandler))
  client.on(reactionRemoveHandler.name, wrap(reactionRemoveHandler))
}
