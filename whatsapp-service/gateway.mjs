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
const FINANCE_STORE_URL = String(process.env.WHATSAPP_FINANCE_STORE_URL || 'https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-whatsapp-finance-outbox').trim()
const ADMIN_EMPLOYEE_ID = String(process.env.WHATSAPP_ADMIN_EMPLOYEE_ID || 'EMP-0002').trim().toUpperCase()
const FINANCE_EMPLOYEE_ID = String(process.env.WHATSAPP_FINANCE_EMPLOYEE_ID || ADMIN_EMPLOYEE_ID).trim().toUpperCase()
const BOT_TOKEN = String(process.env.BOT_API_TOKEN || '').trim()
const DEFAULT_INVITE = String(process.env.WHATSAPP_GROUP_INVITE_CODE || 'IyK3AgVZUwB4g3XJ0qokmT').trim()
const logger = P({ level: process.env.LOG_LEVEL || 'info' })

if (!BOT_TOKEN) throw new Error('BOT_API_TOKEN is required.')

let legacyProcess = null
let shuttingDown = false
let financeDrainTimer = null

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

async function callStore(url, action, input = {}) {
  const response = await fetch(url, {
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

async function store(action, input = {}) {
  return callStore(STORE_URL, action, input)
}

async function financeStore(action, input = {}) {
  return callStore(FINANCE_STORE_URL, action, input)
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
          if (employeeId === FINANCE_EMPLOYEE_ID) scheduleFinanceDrain(250)
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

function groupNameFrom(value) {
  return String(value || '').trim().replace(/^name\s*:/i, '').trim().replace(/\s+/g, ' ')
}

async function ensureEmployeeGroup(session, targetValue) {
  const sock = session.state.sock
  if (!sock || session.state.connection !== 'open') throw new Error('Employee WhatsApp is not connected.')
  const rawTarget = String(targetValue || DEFAULT_INVITE).trim()
  if (!rawTarget) throw new Error('WhatsApp group destination is missing.')

  const cached = employeeGroupCache.get(session.employeeId)

  if (/^name\s*:/i.test(rawTarget)) {
    const groupName = groupNameFrom(rawTarget)
    if (!groupName) throw new Error('WhatsApp group name is missing.')
    const target = `name:${groupName.toLocaleLowerCase()}`
    if (cached?.target === target && cached?.jid) return cached.jid

    const groups = await sock.groupFetchAllParticipating()
    const matches = Object.entries(groups || {}).filter(([, group]) => String(group?.subject || '').trim().toLocaleLowerCase() === groupName.toLocaleLowerCase())
    if (!matches.length) throw new Error(`WhatsApp group “${groupName}” is not available to the connected employee account.`)
    if (matches.length > 1) throw new Error(`More than one WhatsApp group is named “${groupName}”. Rename one group or use an invite link.`)
    const jid = String(matches[0][0])
    employeeGroupCache.set(session.employeeId, { target, jid })
    return jid
  }

  const inviteCode = inviteCodeFrom(rawTarget)
  if (!inviteCode) throw new Error('WhatsApp group invite code is missing.')
  const target = `invite:${inviteCode}`
  if (cached?.target === target && cached?.jid) return cached.jid

  const info = await sock.groupGetInviteInfo(inviteCode)
  let groupJid = String(info?.id || '')
  if (!groupJid) throw new Error('Could not resolve the WhatsApp group invite.')

  const groups = await sock.groupFetchAllParticipating().catch(() => ({}))
  if (!groups?.[groupJid]) {
    const joined = await sock.groupAcceptInvite(inviteCode)
    if (joined) groupJid = String(joined)
  }
  employeeGroupCache.set(session.employeeId, { target, jid: groupJid })
  return groupJid
}

function isSharedAdminEmployee(value) {
  return normalizedEmployeeId(value) === ADMIN_EMPLOYEE_ID
}

async function legacyAdminRequest(path, init = {}) {
  const headers = new Headers(init.headers || {})
  headers.set('x-land-view-bot-token', BOT_TOKEN)
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  const response = await fetch(`http://127.0.0.1:${LEGACY_PORT}${path}`, { ...init, headers })
  const raw = await response.text()
  let json = null
  try { json = raw ? JSON.parse(raw) : null } catch {}
  if (!response.ok || json?.ok === false) {
    const error = new Error(String(json?.error || `Admin WhatsApp returned HTTP ${response.status}.`))
    error.status = response.status
    throw error
  }
  return json || { ok: true }
}

async function sharedAdminStatus(employeeId = ADMIN_EMPLOYEE_ID) {
  const status = await legacyAdminRequest('/health')
  return {
    ...status,
    ok: true,
    employeeId: normalizedEmployeeId(employeeId),
    sharedWithAdmin: true,
    senderType: 'admin-shared',
  }
}

async function processFinanceOutboxOnce() {
  const sharedAdmin = FINANCE_EMPLOYEE_ID === ADMIN_EMPLOYEE_ID
  let session = null
  if (sharedAdmin) {
    const status = await sharedAdminStatus(FINANCE_EMPLOYEE_ID)
    if (status.connection !== 'open' || !status.paired) return false
  } else {
    session = employeeSessionFor(FINANCE_EMPLOYEE_ID)
    await session.connect()
    if (!session.state.sock || session.state.connection !== 'open') return false
  }

  const row = await financeStore('next')
  if (!row?.id) return false
  try {
    let messageId = ''
    if (sharedAdmin) {
      const sent = await legacyAdminRequest('/admin/send-group', {
        method: 'POST',
        body: JSON.stringify({ groupInviteCode: row.group_invite_code, message: String(row.message || '').slice(0, 4000) }),
      })
      messageId = String(sent?.messageId || '')
    } else {
      const jid = await ensureEmployeeGroup(session, row.group_invite_code)
      const sent = await session.state.sock.sendMessage(jid, { text: String(row.message || '').slice(0, 4000) })
      messageId = String(sent?.key?.id || '')
    }
    await financeStore('sent', { id: row.id, messageId })
    logger.info({ financeOutboxId: row.id, dedupeKey: row.dedupe_key, messageId, sharedAdmin }, 'Finance WhatsApp message sent')
  } catch (error) {
    const reason = String(error?.message || error).slice(0, 1000)
    await financeStore('retry', { id: row.id, attemptCount: row.attempt_count, error: reason }).catch(() => null)
    if (session) session.state.lastError = reason
    logger.error({ financeOutboxId: row.id, err: reason, sharedAdmin }, 'Finance WhatsApp send failed')
  }
  return true
}

async function drainFinanceOutbox() {
  if (FINANCE_EMPLOYEE_ID === ADMIN_EMPLOYEE_ID) {
    const status = await sharedAdminStatus(FINANCE_EMPLOYEE_ID)
    if (status.connection !== 'open' || !status.paired) return
  } else {
    const session = employeeSessionFor(FINANCE_EMPLOYEE_ID)
    await session.connect()
    if (!session.state.sock || session.state.connection !== 'open') return
  }
  for (let i = 0; i < 20; i += 1) {
    if (!await processFinanceOutboxOnce()) break
  }
}

function scheduleFinanceDrain(delay = 0) {
  if (financeDrainTimer) return
  financeDrainTimer = setTimeout(async () => {
    financeDrainTimer = null
    try {
      await drainFinanceOutbox()
    } catch (error) {
      logger.error({ err: String(error?.message || error) }, 'Finance WhatsApp outbox drain failed')
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
const employeeJson = express.json({ limit: '64kb' })

app.get('/employee/status', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' })
  try {
    const employeeId = normalizedEmployeeId(req.query.employeeId)
    if (isSharedAdminEmployee(employeeId)) return res.json(await sharedAdminStatus(employeeId))
    const session = employeeSessionFor(employeeId)
    await session.connect()
    return res.json(session.status())
  } catch (error) {
    return res.status(Number(error?.status) || 500).json({ ok: false, error: String(error?.message || error) })
  }
})

app.get('/finance/status', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' })
  try {
    if (FINANCE_EMPLOYEE_ID === ADMIN_EMPLOYEE_ID) {
      const status = await sharedAdminStatus(FINANCE_EMPLOYEE_ID)
      return res.json({ ...status, senderEmployeeId: FINANCE_EMPLOYEE_ID })
    }
    const session = employeeSessionFor(FINANCE_EMPLOYEE_ID)
    await session.connect()
    return res.json({ ok: true, senderEmployeeId: FINANCE_EMPLOYEE_ID, ...session.status() })
  } catch (error) {
    return res.status(Number(error?.status) || 500).json({ ok: false, error: String(error?.message || error) })
  }
})

app.post('/finance/wake', employeeJson, async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' })
  scheduleFinanceDrain(0)
  return res.status(202).json({ ok: true, queued: true, senderEmployeeId: FINANCE_EMPLOYEE_ID })
})

app.post('/employee/reset', employeeJson, async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' })
  try {
    const employeeId = normalizedEmployeeId(req.body?.employeeId)
    if (isSharedAdminEmployee(employeeId)) {
      await legacyAdminRequest('/admin/reset', { method: 'POST', body: '{}' })
      return res.json(await sharedAdminStatus(employeeId).catch(() => ({ ok: true, employeeId, sharedWithAdmin: true, connection: 'resetting', paired: false })))
    }
    const session = employeeSessionFor(employeeId)
    await session.reset()
    return res.json(session.status())
  } catch (error) {
    return res.status(Number(error?.status) || 500).json({ ok: false, error: String(error?.message || error) })
  }
})

app.post('/employee/send', employeeJson, async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' })
  try {
    const employeeId = normalizedEmployeeId(req.body?.employeeId)
    const message = String(req.body?.message || '').trim().slice(0, 4000)
    if (!message) return res.status(400).json({ ok: false, error: 'WhatsApp message is empty.' })

    if (isSharedAdminEmployee(employeeId)) {
      const sent = await legacyAdminRequest('/admin/send-group', {
        method: 'POST',
        body: JSON.stringify({ groupInviteCode: req.body?.groupInviteCode, message }),
      })
      return res.json({ ...sent, employeeId, sharedWithAdmin: true, senderType: 'admin-shared' })
    }

    const session = employeeSessionFor(employeeId)
    await session.connect()
    if (session.state.connection !== 'open' || !session.state.sock) {
      return res.status(409).json({
        ok: false,
        error: 'Connect WhatsApp from the employee dashboard before sending Site Visit updates.',
        ...session.status(),
      })
    }
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
    return res.status(Number(error?.status) || 500).json({ ok: false, error: reason })
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
  logger.info({ port: PORT, legacyPort: LEGACY_PORT, adminEmployeeId: ADMIN_EMPLOYEE_ID, financeEmployeeId: FINANCE_EMPLOYEE_ID }, 'LAND VIEW WhatsApp gateway listening')
  financeStore('recover').catch((error) => logger.error({ err: String(error?.message || error) }, 'Finance outbox recovery failed'))
  if (FINANCE_EMPLOYEE_ID !== ADMIN_EMPLOYEE_ID) {
    const financeSession = employeeSessionFor(FINANCE_EMPLOYEE_ID)
    financeSession.connect().catch((error) => logger.error({ err: String(error?.message || error) }, 'Initial finance WhatsApp connection failed'))
  }
  setInterval(() => scheduleFinanceDrain(0), 15000).unref()
})
