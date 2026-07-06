import { env } from '../env.js'

const WALLET_DOWNLOAD_URL = 'https://obyte.org/#download'

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Self-contained page served at GET /pair. Discord can't link to obyte: URIs, so this
 * page auto-opens the attestation bot's pairing URI in the wallet and falls back to a
 * manual button (browsers may block scheme navigation without a user gesture) and a
 * wallet download link for users who don't have the app yet.
 */
export const pairPageHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Link your Discord account — Obyte</title>
<style>
  html { background: #09090b; color: #e2e8f0; font-family: system-ui, -apple-system, sans-serif; }
  /* always-dark palette matching coop-ui (shadcn zinc theme) */
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         font-family: system-ui, -apple-system, sans-serif; background: #09090b; color: #e2e8f0; }
  main { max-width: 26rem; padding: 2rem; text-align: center; background: #09090b; }
  h1 { font-size: 2rem; line-height: 1.2; }
  p { line-height: 1.5; }
  .btn { display: inline-block; margin: 0.5rem 0 1.5rem; padding: 0.75rem 1.5rem; border-radius: 0.625rem;
         background: #e2e8f0; color: #18181b; text-decoration: none; font-weight: 600; }
  .muted { font-size: 0.875rem; color: #a1a1aa; }
  a { color: #4e80f9; }
</style>
</head>
<body>
<main>
  <h1>Opening the Obyte wallet…</h1>
  <p>Your wallet should open a chat with the attestation bot — follow its instructions to
     link your Discord account to your Obyte address.</p>
  <p>If nothing happens, tap the button:</p>
  <a class="btn" href="${escapeHtml(env.ATTESTATION_BOT_PAIRING_URI)}">Open Obyte wallet</a>
  <p class="muted">Don't have the wallet yet? <a href="${WALLET_DOWNLOAD_URL}">Download Obyte</a>,
     install it, then come back and tap the button above.</p>
</main>
<script>location.href = ${JSON.stringify(env.ATTESTATION_BOT_PAIRING_URI)}</script>
</body>
</html>`
