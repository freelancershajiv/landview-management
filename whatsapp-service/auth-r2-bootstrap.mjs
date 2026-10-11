const nativeFetch = globalThis.fetch.bind(globalThis)

const LEGACY_STORE_URL = String(
  process.env.BOT_STORE_URL ||
  'https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-whatsapp-bot-store',
).trim().replace(/\/$/, '')

const AUTH_STATE_URL = String(
  process.env.WHATSAPP_AUTH_STATE_URL ||
  'https://landview-whatsapp-state.landview-management.workers.dev',
).trim().replace(/\/$/, '')

const AUTH_ACTIONS = new Set(['authGet', 'authSet', 'authSetMany', 'authDelete', 'authReset'])

function requestUrl(input) {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return String(input?.url || '')
}

function requestMethod(input, init) {
  return String(init?.method || input?.method || 'GET').toUpperCase()
}

function parseJsonBody(body) {
  if (typeof body === 'string') {
    try { return JSON.parse(body) } catch { return null }
  }
  if (Buffer.isBuffer(body)) {
    try { return JSON.parse(body.toString('utf8')) } catch { return null }
  }
  return null
}

async function stateFetch(payload, sourceInput, sourceInit = {}) {
  const sourceHeaders = new Headers(sourceInit.headers || sourceInput?.headers || {})
  const token = String(sourceHeaders.get('x-land-view-bot-token') || '').trim()
  if (!token) throw new Error('LAND VIEW bot token is missing from the auth-state request.')

  return nativeFetch(AUTH_STATE_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-land-view-bot-token': token,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(45000),
  })
}

async function parsedClone(response) {
  return response.clone().json().catch(() => null)
}

globalThis.fetch = async function landViewFetch(input, init = {}) {
  const url = requestUrl(input).replace(/\/$/, '')
  const method = requestMethod(input, init)
  if (url !== LEGACY_STORE_URL || method !== 'POST') return nativeFetch(input, init)

  const payload = parseJsonBody(init?.body)
  const action = String(payload?.action || '').trim()
  if (!AUTH_ACTIONS.has(action)) return nativeFetch(input, init)

  try {
    if (action === 'authGet') {
      const r2Response = await stateFetch(payload, input, init)
      const r2Json = await parsedClone(r2Response)
      if (!r2Response.ok || !r2Json?.success) {
        throw new Error(String(r2Json?.error || `R2 auth state returned HTTP ${r2Response.status}.`))
      }
      if (r2Json?.data?.value !== null && r2Json?.data?.value !== undefined) return r2Response

      // Lazy migration: read a missing key once from Supabase, then seed R2.
      const legacyResponse = await nativeFetch(input, init)
      const legacyJson = await parsedClone(legacyResponse)
      if (legacyResponse.ok && legacyJson?.success && legacyJson?.data?.value !== null && legacyJson?.data?.value !== undefined) {
        await stateFetch({
          action: 'authSet',
          sessionId: payload.sessionId,
          keyId: payload.keyId,
          value: legacyJson.data.value,
        }, input, init).catch(() => null)
      }
      return legacyResponse
    }

    const r2Response = await stateFetch(payload, input, init)
    const r2Json = await parsedClone(r2Response)
    if (!r2Response.ok || !r2Json?.success) {
      throw new Error(String(r2Json?.error || `R2 auth state returned HTTP ${r2Response.status}.`))
    }

    if (action === 'authDelete' || action === 'authReset') {
      // Remove the legacy copy too so lazy migration cannot resurrect deleted state.
      await nativeFetch(input, init).catch(() => null)
    }
    return r2Response
  } catch (error) {
    console.error('[whatsapp-auth-r2] Cloudflare auth-state request failed; using Supabase fallback.', {
      action,
      error: String(error?.message || error),
    })
    return nativeFetch(input, init)
  }
}

await import('./bootstrap.mjs')
