import express from 'express'
import QRCode from 'qrcode'
import P from 'pino'
import makeWASocket, {
  BufferJSON,
  Browsers,
  DisconnectReason,
  initAuthCreds,
  makeCacheableSignalKeyStore,
  proto,
} from '@whiskeysockets/baileys'

const PORT = Number(process.env.PORT || 10000)
const SESSION_ID = String(process.env.WHATSAPP_SESSION_ID || 'land-view-site-visits').trim()
const STORE_URL = String(process.env.BOT_STORE_URL || 'https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-whatsapp-bot-store').trim()
const BOT_TOKEN = String(process.env.BOT_API_TOKEN || '').trim()
const DEFAULT_INVITE = String(process.env.WHATSAPP_GROUP_INVITE_CODE || 'IyK3AgVZUwB4g3XJ0qokmT').trim()
const logger = P({ level: process.env.LOG_LEVEL || 'info' })

if (!BOT_TOKEN) throw new Error('BOT_API_TOKEN is required.')

async function store(action, input = {}) {
  const response = await fetch(STORE_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-land-view-bot-token': BOT_TOKEN,
    },
    body: JSON.stringify({ action, ...input }),
    signal: AbortSignal.timeout(45000),
  })
  const json = await response.json().catch(() => null)
  if (!response.ok || !json?.success) {
    throw new Error(String(json?.error || `Bot store returned HTTP ${response.status}.`))
  }
  return json.data
}

function serialize(value) {
  return JSON.parse(JSON.stringify(value, BufferJSON.replacer))
}
function deserialize(value) {
  if (value === null || value === undefined) return null
  return JSON.parse(JSON.stringify(value), BufferJSON.reviver)
}

async function useSupabaseAuthState(sessionId) {
  async function readData(keyId) {
    const row = await store('authGet', { sessionId, keyId })
    return deserialize(row?.value)
  }
  async function writeData(keyId, value) {
    await store('authSet', { sessionId, keyId, value: serialize(value) })
  }
  async function writeMany(items) {
    if (!items.length) return
    await store('authSetMany', {
      sessionId,
      items: items.map(({ keyId, value }) => ({ keyId, value: serialize(value) })),
    })
  }
  async function removeData(keyId) {
    await store('authDelete', { sessionId, keyId })
  }

  const creds = (await readData('creds')) || initAuthCreds()
  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {}
          await Promise.all(ids.map(async (id) => {
            let value = await readData(`${type}-${id}`)
            if (type === 'app-state-sync-key' && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value)
            }
            data[id] = value
          }))
          return data
        },
        set: async (data) => {
          const writes = []
          const deletes = []
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category] || {})) {
              const value = data[category][id]
              const keyId = `${category}-${id}`
              if (value) writes.push({ keyId, value })
              else deletes.push(keyId)
            }
          }

          if (writes.length) await writeMany(writes)
          if (deletes.length) {
            for (let i = 0; i < deletes.length; i += 25) {
              await Promise.all(deletes.slice(i, i + 25).map(removeData))
            }
          }
        },
      },
    },
    saveCreds: () => writeData('creds', creds),
  }
}

let sock = null
let connectionState = 'starting'
let qrDataUrl = ''
let lastError = ''
let reconnectTimer = null
let drainTimer = null
let connectingPromise = null
let cachedGroup = { inviteCode: '', jid: '' }

function status() {
  return {
    ok: true,
    connection: connectionState,
    paired: connectionState === 'open',
    qrAvailable: Boolean(qrDataUrl),
    lastError: lastError || null,
  }
}

function disconnectCode(error) {
  return Number(error?.output?.statusCode || error?.statusCode || error?.data?.statusCode || 0)
}

function scheduleReconnect(delay = 5000) {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectWhatsApp().catch((error) => {
      lastError = String(error?.message || error)
      logger.error({ err: lastError }, 'WhatsApp reconnect failed')
      scheduleReconnect(10000)
    })
  }, delay)
}

async function connectWhatsApp() {
  if (connectingPromise) return connectingPromise
  connectingPromise = (async () => {
    connectionState = 'connecting'
    const { state, saveCreds } = await useSupabaseAuthState(SESSION_ID)
    const wa = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      browser: Browsers.ubuntu('LAND VIEW'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
    })
    sock = wa

    wa.ev.on('creds.update', () => {
      saveCreds().catch((error) => {
        lastError = String(error?.message || error)
        logger.error({ err: lastError }, 'WhatsApp credential save failed')
      })
    })
    wa.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        connectionState = 'pairing'
        qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 360 }).catch(() => '')
        logger.info('WhatsApp pairing QR is available at /pair')
      }

      if (connection === 'open') {
        connectionState = 'open'
        qrDataUrl = ''
        lastError = ''
        cachedGroup = { inviteCode: '', jid: '' }
        logger.info({ user: wa.user?.id }, 'WhatsApp connected')
        await store('outboxRecoverStale').catch(() => null)
        scheduleDrain(250)
      }

      if (connection === 'close') {
        sock = null
        const code = disconnectCode(lastDisconnect?.error)
        lastError = String(lastDisconnect?.error?.message || `Disconnected (${code || 'unknown'})`)
        if (code === DisconnectReason.loggedOut) {
          connectionState = 'logged_out'
          qrDataUrl = ''
          logger.warn('WhatsApp device was logged out. Reset pairing from /pair.')
        } else {
          connectionState = 'disconnected'
          scheduleReconnect(code === DisconnectReason.restartRequired ? 1000 : 5000)
        }
      }
    })
  })()

  try {
    await connectingPromise
  } finally {
    connectingPromise = null
  }
}

function inviteCodeFrom(value) {
  const raw = String(value || '').trim()
  const match = raw.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/i)
  return (match?.[1] || raw).slice(0, 200)
}

async function ensureGroup(inviteValue) {
  if (!sock || connectionState !== 'open') throw new Error('WhatsApp is not connected.')
  const inviteCode = inviteCodeFrom(inviteValue || DEFAULT_INVITE)
  if (!inviteCode) throw new Error('WhatsApp group invite code is missing.')
  if (cachedGroup.inviteCode === inviteCode && cachedGroup.jid) return cachedGroup.jid

  const info = await sock.groupGetInviteInfo(inviteCode)
  const groupJid = String(info?.id || '')
  if (!groupJid) throw new Error('Could not resolve the WhatsApp group invite.')

  const groups = await sock.groupFetchAllParticipating().catch(() => ({}))
  if (!groups?.[groupJid]) {
    const joined = await sock.groupAcceptInvite(inviteCode)
    if (joined) cachedGroup = { inviteCode, jid: String(joined) }
  }
  if (!cachedGroup.jid) cachedGroup = { inviteCode, jid: groupJid }
  return cachedGroup.jid
}

async function processOutboxOnce() {
  if (!sock || connectionState !== 'open') return false
  const row = await store('outboxNext')
  if (!row?.id) return false

  try {
    const jid = await ensureGroup(row.group_invite_code)
    const sent = await sock.sendMessage(jid, { text: String(row.message || '').slice(0, 4000) })
    const messageId = String(sent?.key?.id || '')
    await store('outboxSent', { id: row.id, messageId })
    logger.info({ outboxId: row.id, messageId }, 'Site Visit WhatsApp message sent')
  } catch (error) {
    const reason = String(error?.message || error).slice(0, 1000)
    await store('outboxRetry', { id: row.id, attemptCount: row.attempt_count, error: reason }).catch(() => null)
    lastError = reason
    logger.error({ outboxId: row.id, err: reason }, 'Site Visit WhatsApp send failed')
  }
  return true
}

async function drainOutbox() {
  if (!sock || connectionState !== 'open') return
  for (let i = 0; i < 20; i += 1) {
    const processed = await processOutboxOnce()
    if (!processed) break
  }
}

function scheduleDrain(delay = 0) {
  if (drainTimer) return
  drainTimer = setTimeout(async () => {
    drainTimer = null
    try {
      await drainOutbox()
    } catch (error) {
      lastError = String(error?.message || error)
      logger.error({ err: lastError }, 'Outbox drain failed')
    }
  }, delay)
}

function authorized(req) {
  const header = String(req.get('x-land-view-bot-token') || '').trim()
  const bearer = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  const query = String(req.query?.key || '').trim()
  return [header, bearer, query].some((value) => value && value === BOT_TOKEN)
}

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '64kb' }))

app.get('/', (_req, res) => res.json(status()))
app.get('/health', (_req, res) => res.json(status()))

app.post('/wake', (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' })
  scheduleDrain(0)
  return res.status(202).json({ ok: true, queued: true, connection: connectionState })
})

app.get('/pair', (req, res) => {
  if (!authorized(req)) return res.status(401).send('Unauthorized')
  const refreshUrl = `/pair?key=${encodeURIComponent(String(req.query.key || ''))}`
  const body = connectionState === 'open'
    ? '<h2>Connected</h2><p>LAND VIEW WhatsApp automation is paired and ready.</p>'
    : qrDataUrl
      ? `<h2>Scan this QR in WhatsApp</h2><p>WhatsApp → Linked devices → Link a device</p><img src="${qrDataUrl}" alt="WhatsApp QR" width="360" height="360" />`
      : `<h2>${connectionState === 'logged_out' ? 'Pairing reset required' : 'Preparing WhatsApp connection…'}</h2><p>This page refreshes automatically.</p>`
  res.set('cache-control', 'no-store')
  res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="refresh" content="5;url=${refreshUrl}"><title>LAND VIEW WhatsApp Pairing</title><style>body{font-family:system-ui,sans-serif;max-width:680px;margin:40px auto;padding:24px;color:#111}img{max-width:100%;height:auto;border:1px solid #ddd;border-radius:12px}</style></head><body><h1>LAND VIEW WhatsApp Bot</h1>${body}</body></html>`)
})

app.post('/admin/reset', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' })
  try {
    try { await sock?.logout() } catch {}
    sock = null
    qrDataUrl = ''
    cachedGroup = { inviteCode: '', jid: '' }
    await store('authReset', { sessionId: SESSION_ID })
    connectionState = 'resetting'
    scheduleReconnect(500)
    return res.json({ ok: true })
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || error) })
  }
})

app.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT }, 'LAND VIEW WhatsApp bot listening')
  connectWhatsApp().catch((error) => {
    lastError = String(error?.message || error)
    connectionState = 'error'
    logger.error({ err: lastError }, 'Initial WhatsApp connection failed')
    scheduleReconnect(10000)
  })
  setInterval(() => scheduleDrain(0), 15000).unref()
})
