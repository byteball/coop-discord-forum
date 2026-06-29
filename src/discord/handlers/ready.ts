import type { EventHandler } from './types.js'
import { syncAllForums } from '../../services/reconciliationService.js'

export const readyHandler: EventHandler<'clientReady'> = {
  name: 'clientReady',
  once: true,
  async execute(client) {
    console.log(`[discord] logged in as ${client.user.tag}`)
    await syncAllForums(client)
  },
}
