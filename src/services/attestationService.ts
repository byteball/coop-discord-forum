import obyte from 'obyte'
import { obyteClient } from '../obyte.js'
import { env } from '../env.js'

// discordUserId -> { value, expires }. Positive results are cached for the process
// lifetime; negative results expire so a user who attests later is eventually picked up.
const cache = new Map<string, { value: string | null; expires: number }>()

const HUB_TIMEOUT_MS = 10_000
const NEGATIVE_TTL_MS = 10 * 60_000 // re-check non-attested users every 10 min

/** Reject if the hub call doesn't resolve in time, so a slow hub can't stall reconciliation. */
function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const t = setTimeout(() => reject(new Error(`${label} timed out after ${HUB_TIMEOUT_MS}ms`)), HUB_TIMEOUT_MS)
      t.unref?.()
    }),
  ])
}

export type AddressResolution =
  | { status: 'attested'; address: string }
  | { status: 'unattested' } // confirmed by the hub: no attestation (cached with a TTL)
  | { status: 'error' } // transient hub/network failure: unknown, retry later

const toResolution = (value: string | null): AddressResolution =>
  value ? { status: 'attested', address: value } : { status: 'unattested' }

/**
 * Reverse lookup: Discord user id -> attested Obyte address.
 *
 * `getAttestation` returns only the attestation unit hash, so we read the
 * attested address back from that unit's `attestation` message via `getJoint`.
 * `unattested` means the hub confirmed there is no attestation by the configured
 * attestor; `error` means the lookup failed and the answer is unknown.
 */
export async function resolveAddress(discordUserId: string): Promise<AddressResolution> {
  const cached = cache.get(discordUserId)
  if (cached && cached.expires > Date.now()) return toResolution(cached.value)

  const remember = (value: string | null) => {
    cache.set(discordUserId, { value, expires: value ? Infinity : Date.now() + NEGATIVE_TTL_MS })
    return toResolution(value)
  }

  try {
    const unit = await withTimeout(
      obyteClient.api.getAttestation({
        attestor_address: env.DISCORD_ATTESTOR_ADDRESS,
        field: 'userId',
        value: discordUserId,
      }),
      'getAttestation',
    )
    if (!unit) return remember(null)

    const { joint } = await withTimeout(obyteClient.api.getJoint(unit), 'getJoint')
    const message = joint.unit.messages.find((m) => m.app === 'attestation')
    const address = message?.payload?.address
    // only trust a well-formed Obyte address (valid checksum) before using it
    const valid = typeof address === 'string' && obyte.utils.isValidAddress(address) ? address : null
    return remember(valid)
  } catch (err) {
    // transient hub/network error — don't cache, allow a later retry
    console.error(`[attestation] lookup failed for userId=${discordUserId}:`, err)
    return { status: 'error' }
  }
}
