import type { ThreadChannel } from 'discord.js'
import { buildProfileLinks } from './attestationService.js'

const capitalize = (s: string) => (s.length ? s[0].toUpperCase() + s.slice(1) : s)

/** Publicly reply in the forum thread with the author's Obyte profile links. */
export async function replyWithProfileLinks(thread: ThreadChannel, address: string) {
  const links = buildProfileLinks(address)
  if (links.length === 0) return

  const lines = links.map((l) => `• ${capitalize(l.project)}: ${l.url}`)
  const content = [
    'Thanks for your post! 🎉',
    'Your Obyte ecosystem profiles:',
    ...lines,
  ].join('\n')

  // never ping anyone from an automated message
  await thread.send({ content, allowedMentions: { parse: [] } })
}
