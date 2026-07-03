import type { ThreadChannel } from 'discord.js'
import { env } from '../env.js'

/**
 * Publicly reply in the forum thread with a vote link to the author's COOP profile.
 * Never pings — the <@id> mention still renders as @username for readers.
 */
export async function replyWithVoteLink(
  thread: ThreadChannel,
  discordUserId: string,
  address: string,
) {
  const url = `${env.COOP_BASE_URL}/user/${address}`
  // [text](<url>) — angle brackets suppress Discord's embed preview card
  const content = `Vote for <@${discordUserId}> at [their COOP profile](<${url}>)`
  await thread.send({ content, allowedMentions: { parse: [] } })
}

/**
 * Publicly ask a non-attested author to pair with the attestation bot.
 * Intentionally pings the author (and only them) — the message is addressed to them.
 */
export async function replyWithAttestationPrompt(thread: ThreadChannel, discordUserId: string) {
  const url = `${env.PUBLIC_BASE_URL}/pair`
  const content =
    `<@${discordUserId}> please [link your discord account to your Obyte address](<${url}>) ` +
    'to make it easier for community members to find you on COOP and vote for you'
  await thread.send({ content, allowedMentions: { users: [discordUserId] } })
}
