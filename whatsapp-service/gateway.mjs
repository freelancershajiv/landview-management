import express from 'express'
import QRCode from 'qrcode'
import P from 'pino'
import { spawn } from 'node:child_process'
import makeWASocket, {
  BufferJSON,
  Browsers,
  DisconnectReason,
  initAuthCreds,
  makeCacheableSignalKeyStore,
  proto,
} from '@whiskeysockets/baileys'

const PORT = Number(process.env.PORT || 10000)
const LEGACY_PORT = Number(process.env.WHATSAPP_LEGACY_PORT || (PORT === 10001 ? 10002 : 10001))
const STORE_URL = String(process.env.BOT_STORE_URL || 'https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-whatsapp-bot-store').trim()
const BOT_TOKEN = String(process.env.BOT_API_TOKEN || '').trim()
const DEFAULT_INVITE = String(process.env.WHATSAPP_GROUP_INVITE_CODE || 'IyK3AgVZUwB4g3XJ0qokmT').trim()
const logger = P({ level: process.env.LOG_LEVEL || 'info' })

if (!BOT_TOKEN) throw new Error('BOT_API_TOKEN is required.')

let legacyProcess = null
let shuttingDown = false

function startLegacyService() {
  if (shuttingDown) return
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(LEGACY_PORT) },
    stdio: 'inherit',
  })
  legacyProcess = child
  child.on('exit', (code, signal) => {
    if (legacyProcess === child) legacyProcess = null
    if (shuttingDown) return
    logger.error({ code, signal }, 'Legacy WhatsApp service exited; restarting')
    setTimeout(startLegacyService, 3000).unref()
  })
}

function stopChildren() {
  shuttingDown = true
  try { legacyProcess?.kill('SIGTERM') } catch {}
}
process.once('SIGTERM', () => { stopChildren(); process.exit(0) })
process.once('SIGINT', () => { stopChildren(); process.exit(0) })

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

function disconnectCode(error) {
  return Number(error?.output?.statusCode || error?.statusCode || error?.data?.statusCode || 0)
}

function normalizedEmployeeId(value) {
  const id = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 80)
  if (!id) throw new Error('Employee ID is required.')
  return id
}

function phoneFromUserId(value) {
  const left = String(value || '').split('@')[0].split(':')[0]
  return left.replace(/\D/g, '')
}

const employeeSessions = new Map()
const employeeGroupCache = new Map()

function createEmployeeSession(employeeId) {
  const sessionId = `land-view-employee-${employeeId.toLowerCase()}`
  const state = {
    sock: null,
    connection: 'idle',
    qrDataUrl: '',
    lastError: '',
    reconnectTimer: null,
    connectingPromise: null,
  }

  function status() {
    return {
      ok: true,
      employeeId,
      sessionId,
      connection: state.connection,
      paired: state.connection === 'open',
      qrAvailable: Boolean(state.qrDataUrl),
      qrDataUrl: state.qrDataUrl || null,
      phoneNumber: phoneFromUserId(state.sock?.user?.id) || null,
      lastError: state.lastError || null,
    }
  }

  function scheduleReconnect(delay = 5000) {
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer)
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null
      if (!state.sock) connect().catch((error) => {
        state.lastError = String(error?.message || error)
        logger.error({ employeeId, err: state.lastError }, 'Employee WhatsApp reconnect failed')
        scheduleReconnect(10000)
      })
    }, delay)
  }

  async function connect() {
    if (state.sock && ['connecting', 'pairing', 'open'].includes(state.connection)) return
    if (state.connectingPromise) return state.connectingPromise
    state.connectingPromise = (async () => {
      state.connection = 'connecting'
      state.lastError = ''
      const { state: authState, saveCreds } = await useSupabaseAuthState(sessionId)
      const wa = makeWASocket({
        auth: {
          creds: authState.creds,
          keys: makeCacheableSignalKeyStore(authState.keys, logger),
        },
        logger,
        browser: Browsers.ubuntu(`LAND VIEW ${employeeId}`),
        markOnlineOnConnect: false,
        syncFullHistory: false,
      })
      state.sock = wa

      wa.ev.on('creds.update', () => {
        saveCreds().catch((error) => {
          state.lastError = String(error?.message || error)
          logger.error({ employeeId, err: state.lastError }, 'Employee WhatsApp credential save failed')
        })
      })

      wa.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (qr) {
          state.connection = 'pairing'
          state.qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 360 }).catch(() => '')
        }
        if (connection === 'open') {
          state.connection = 'open'
          state.qrDataUrl = ''
          state.lastError = ''
          employeeGroupCache.delete(employeeId)
          await saveCreds().catch((error) => {
            state.lastError = String(error?.message || error)
          })
          logger.info({ employeeId, phoneNumber: phoneFromUserId(wa.user?.id) }, 'Employee WhatsApp connected')
        }
        if (connection === 'close') {
          if (state.sock === wa) state.sock = null
          const code = disconnectCode(lastDisconnect?.error)
          state.lastError = String(lastDisconnect?.error?.message || `Disconnected (${code || 'unknown'})`)
          state.qrDataUrl = ''
          if (code === DisconnectReason.loggedOut) {
            state.connection = 'logged_out'
          } else {
            state.connection = 'disconnected'
            scheduleReconnect(code === DisconnectReason.restartRequired ? 1000 : 5000)
          }
        }
      })
    })()

    try {
      await state.connectingPromise
    } finally {
      state.connectingPromise = null
    }
  }

  async function reset() {
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer)
    state.reconnectTimer = null
    try { await state.sock?.logout() } catch {}
    state.sock = null
    state.qrDataUrl = ''
    state.lastError = ''
    state.connection = 'resetting'
    employeeGroupCache.delete(employeeId)
    await store('authReset', { sessionId })
    await connect()
  }

  return { employeeId, sessionId, state, status, connect, reset }
}

function employeeSessionFor(value) {
  const employeeId = normalizedEmployeeId(value)
  let session = employeeSessions.get(employeeId)
  if (!session) {
    session = createEmployeeSession(employeeId)
    employeeSessions.set(employeeId, session)
  }
  return session
}

function inviteCodeFrom(value) {
  const raw = String(value || '').trim()
  const match = raw.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/i)
  return (match?.[1] || raw).slice(0, 200)
}

async function ensureEmployeeGroup(session, inviteValue) {
  const sock = session.state.sock
  if (!sock || session.state.connection !== 'open') throw new Error('Employee WhatsApp is not connected.')
  const inviteCode = inviteCodeFrom(inviteValue || DEFAULT_INVITE)
  if (!inviteCode) throw new Error('WhatsApp group invite code is missing.')

  const cached = employeeGroupCache.get(session.employeeId)
  if (cached?.inviteCode === inviteCode && cached?.jid) return cached.jid

  const info = await sock.groupGetInviteInfo(inviteCode)
  let groupJid = String(info?.id || '')
  if (!groupJid) throw new Error('Could not resolve the WhatsApp group invite.')

  const groups = await sock.groupFetchAllParticipating().catch(() => ({}))
  if (!groups?.[groupJid]) {
    const joined = await sock.groupAcceptInvite(inviteCode)
    if (joined) groupJid = String(joined)
  }
  employeeGroupCache.set(session.employeeId, { inviteCode, jid: groupJid })
  return groupJid
}

function authorized(req) {
  const header = String(req.get('x-land-view-bot-token') || '').trim()
  const bearer = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  const query = String(req.query?.key || '').trim()
  return [header, bearer, query].some((value) => value && value === BOT_TOKEN)
}

const app = express()
const employeeJson = express.json({ limit: '64kb' })

app.get('/employee/status', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' })
  try {
    const session = employeeSessionFor(req.query.employeeId)
    await session.connect()
    return res.json(session.status())
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || error) })
  }
})

app.post('/employee/reset', employeeJson, async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' })
  try {
    const session = employeeSessionFor(req.body?.employeeId)
    await session.reset()
    return res.json(session.status())
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || error) })
  }
})

app.post('/employee/send', employeeJson, async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' })
  try {
    const session = employeeSessionFor(req.body?.employeeId)
    await session.connect()
    if (session.state.connection !== 'open' || !session.state.sock) {
      return res.status(409).json({
        ok: false,
        error: 'Connect WhatsApp from the employee dashboard before sending Site Visit updates.',
        ...session.status(),
      })
    }
    const message = String(req.body?.message || '').trim().slice(0, 4000)
    if (!message) return res.status(400).json({ ok: false, error: 'WhatsApp message is empty.' })
    const jid = await ensureEmployeeGroup(session, req.body?.groupInviteCode)
    const sent = await session.state.sock.sendMessage(jid, { text: message })
    return res.json({
      ok: true,
      sent: true,
      messageId: String(sent?.key?.id || ''),
      phoneNumber: phoneFromUserId(session.state.sock?.user?.id) || null,
    })
  } catch (error) {
    const reason = String(error?.message || error)
    logger.error({ err: reason }, 'Employee WhatsApp send failed')
    return res.status(500).json({ ok: false, error: reason })
  }
})

app.use(async (req, res) => {
  try {
    const chunks = []
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    const body = chunks.length ? Buffer.concat(chunks) : undefined
    const target = new URL(req.originalUrl || req.url, `http://127.0.0.1:${LEGACY_PORT}`)
    const headers = {}
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined || ['host', 'content-length', 'connection'].includes(key.toLowerCase())) continue
      headers[key] = Array.isArray(value) ? value.join(', ') : String(value)
    }
    const response = await fetch(target, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
      redirect: 'manual',
      signal: AbortSignal.timeout(60000),
    })
    res.status(response.status)
    response.headers.forEach((value, key) => {
      if (!['content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) res.setHeader(key, value)
    })
    const payload = Buffer.from(await response.arrayBuffer())
    return res.send(payload)
  } catch (error) {
    return res.status(502).json({ ok: false, error: `WhatsApp service proxy failed: ${String(error?.message || error)}` })
  }
})

startLegacyService()
app.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT, legacyPort: LEGACY_PORT }, 'LAND VIEW WhatsApp gateway listening')
})
