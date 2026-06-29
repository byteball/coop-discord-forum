import { Client, GatewayIntentBits, Partials } from 'discord.js'

/**
 * Discord Gateway client.
 *
 * Intents:
 *  - Guilds              — channels/threads cache (required for forum threads)
 *  - GuildMessages       — messageCreate (comments)
 *  - MessageContent      — read post/comment text (privileged)
 *  - GuildMessageReactions — 👍/👎 add/remove
 *
 * Partials let us receive reaction events on messages that aren't cached
 * (e.g. posts created before the bot started); handlers .fetch() them.
 */
export const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
})
