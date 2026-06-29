import obyte from 'obyte'
import { env } from './env.js'

const hubUrl = `wss://obyte.org/bb${env.OBYTE_TESTNET ? '-test' : ''}`

/**
 * Shared Obyte light client (one persistent WebSocket connection to the hub).
 * Used read-only: getAttestation + getJoint for the Discord→address lookup.
 */
export const obyteClient = new obyte.Client(hubUrl, {
  testnet: env.OBYTE_TESTNET,
  reconnect: true,
})
