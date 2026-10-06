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
const SITE_SESSION_ID = String(process.env.WHATSAPP_SESSION_ID || 'land-view-site-visits').trim()
const CLIENT_SESSION_ID = String(process.env.WHATSAPP_CLIENT_SESSION_ID || 'land-view-client-bot').trim()
const STORE_URL = String(process.env.BOT_STORE_URL || 'https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-whatsapp-bot-store').trim()
const CLIENT_FINANCE_URL = String(process.env.BOT_CLIENT_FINANCE_URL || 'https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-whatsapp-client-finance').trim()
const BOT_TOKEN = String(process.env.BOT_API_TOKEN || '').trim()
const DEFAULT_INVITE = String(process.env.WHATSAPP_GROUP_INVITE_CODE || 'IyK3AgVZUwB4g3XJ0qokmT').trim()
const CLIENT_PORTAL_URL = String(process.env.LAND_VIEW_CLIENT_PORTAL_URL || 'https://app.landview.com.bd/client').trim()
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

async function financeStore(action, input = {}) {
  const response = await fetch(CLIENT_FINANCE_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-land-view-bot-token': BOT_TOKEN,
    },
    body: JSON.stringify({ action, ...input }),
    signal: AbortSignal.timeout(30000),
  })
  const json = await response.json().catch(() => null)
  if (!response.ok || !json?.success) {
    throw new Error(String(json?.error || `Client finance service returned HTTP ${response.status}.`))
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

function createManagedSession({ sessionId, label, onOpen, onMessages }) {
  const state = {
    sock: null,
    connection: 'starting',
    qrDataUrl: '',
    lastError: '',
    reconnectTimer: null,
    connectingPromise: null,
    openedAt: 0,
  }

  function status() {
    return {
      ok: true,
      label,
      sessionId,
      connection: state.connection,
      paired: state.connection === 'open',
      qrAvailable: Boolean(state.qrDataUrl),
      lastError: state.lastError || null,
    }
  }

  function scheduleReconnect(delay = 5000) {
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer)
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null
      connect().catch((error) => {
        state.lastError = String(error?.message || error)
        logger.error({ sessionId, err: state.lastError }, `${label} reconnect failed`)
        scheduleReconnect(10000)
      })
    }, delay)
  }

  async function connect() {
    if (state.connectingPromise) return state.connectingPromise
    state.connectingPromise = (async () => {
      state.connection = 'connecting'
      const { state: authState, saveCreds } = await useSupabaseAuthState(sessionId)
      const wa = makeWASocket({
        auth: {
          creds: authState.creds,
          keys: makeCacheableSignalKeyStore(authState.keys, logger),
        },
        logger,
        browser: Browsers.ubuntu(label),
        markOnlineOnConnect: false,
        syncFullHistory: false,
      })
      state.sock = wa

      wa.ev.on('creds.update', () => {
        saveCreds().catch((error) => {
          state.lastError = String(error?.message || error)
          logger.error({ sessionId, err: state.lastError }, `${label} credential save failed`)
        })
      })

      if (onMessages) {
        wa.ev.on('messages.upsert', (event) => {
          Promise.resolve(onMessages(event, wa)).catch((error) => {
            state.lastError = String(error?.message || error)
            logger.error({ sessionId, err: state.lastError }, `${label} inbound message handler failed`)
          })
        })
      }

      wa.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (qr) {
          state.connection = 'pairing'
          state.qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 360 }).catch(() => '')
          logger.info({ sessionId }, `${label} pairing QR is available`)
        }

        if (connection === 'open') {
          state.connection = 'open'
          state.openedAt = Date.now()
          state.qrDataUrl = ''
          state.lastError = ''
          try {
            await saveCreds()
          } catch (error) {
            state.lastError = String(error?.message || error)
            logger.error({ sessionId, err: state.lastError }, `${label} credential save on open failed`)
          }
          logger.info({ sessionId, user: wa.user?.id }, `${label} connected`)
          await Promise.resolve(onOpen?.(wa)).catch((error) => {
            state.lastError = String(error?.message || error)
            logger.error({ sessionId, err: state.lastError }, `${label} open hook failed`)
          })
        }

        if (connection === 'close') {
          if (state.sock === wa) state.sock = null
          const code = disconnectCode(lastDisconnect?.error)
          state.lastError = String(lastDisconnect?.error?.message || `Disconnected (${code || 'unknown'})`)
          if (code === DisconnectReason.loggedOut) {
            state.connection = 'logged_out'
            state.qrDataUrl = ''
            logger.warn({ sessionId }, `${label} was logged out`)
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
    try { await state.sock?.logout() } catch {}
    state.sock = null
    state.qrDataUrl = ''
    await store('authReset', { sessionId })
    state.connection = 'resetting'
    scheduleReconnect(500)
  }

  return { state, status, connect, reset, scheduleReconnect }
}

let cachedGroup = { target: '', jid: '' }
let siteDrainTimer = null
let clientDrainTimer = null

function inviteCodeFrom(value) {
  const raw = String(value || '').trim()
  const match = raw.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/i)
  return (match?.[1] || raw).slice(0, 200)
}

function normalizedGroupName(value) {
  return String(value || '').trim().replace(/^name\s*:/i, '').trim().replace(/\s+/g, ' ')
}

async function listSiteGroups() {
  const sock = siteSession.state.sock
  if (!sock || siteSession.state.connection !== 'open') throw new Error('Site Visit WhatsApp is not connected.')
  const groups = await sock.groupFetchAllParticipating()
  return Object.entries(groups || {}).map(([jid, group]) => ({
    jid: String(jid),
    name: String(group?.subject || '').trim(),
    participantCount: Array.isArray(group?.participants) ? group.participants.length : null,
  })).filter((group) => group.jid && group.name).sort((a, b) => a.name.localeCompare(b.name))
}

async function ensureGroup(targetValue) {
  const sock = siteSession.state.sock
  if (!sock || siteSession.state.connection !== 'open') throw new Error('Site Visit WhatsApp is not connected.')

  const rawTarget = String(targetValue || DEFAULT_INVITE).trim()
  if (!rawTarget) throw new Error('WhatsApp group destination is missing.')

  if (/^name\s*:/i.test(rawTarget)) {
    const groupName = normalizedGroupName(rawTarget)
    if (!groupName) throw new Error('WhatsApp group name is missing.')
    const targetKey = `name:${groupName.toLocaleLowerCase()}`
    if (cachedGroup.target === targetKey && cachedGroup.jid) return cachedGroup.jid

    const groups = await listSiteGroups()
    const matches = groups.filter((group) => group.name.toLocaleLowerCase() === groupName.toLocaleLowerCase())
    if (!matches.length) throw new Error(`WhatsApp group “${groupName}” is not available to the connected LAND VIEW account.`)
    if (matches.length > 1) throw new Error(`More than one WhatsApp group is named “${groupName}”. Rename one group or use an invite link.`)

    cachedGroup = { target: targetKey, jid: matches[0].jid }
    return matches[0].jid
  }

  const inviteCode = inviteCodeFrom(rawTarget)
  if (!inviteCode) throw new Error('WhatsApp group invite code is missing.')
  const targetKey = `invite:${inviteCode}`
  if (cachedGroup.target === targetKey && cachedGroup.jid) return cachedGroup.jid

  const info = await sock.groupGetInviteInfo(inviteCode)
  let groupJid = String(info?.id || '')
  if (!groupJid) throw new Error('Could not resolve the WhatsApp group invite.')

  const groups = await sock.groupFetchAllParticipating().catch(() => ({}))
  if (!groups?.[groupJid]) {
    const joined = await sock.groupAcceptInvite(inviteCode)
    if (joined) groupJid = String(joined)
  }
  cachedGroup = { target: targetKey, jid: groupJid }
  return groupJid
}

async function processSiteOutboxOnce() {
  if (!siteSession.state.sock || siteSession.state.connection !== 'open') return false
  const row = await store('outboxNext')
  if (!row?.id) return false
  try {
    const jid = await ensureGroup(row.group_invite_code)
    const sent = await siteSession.state.sock.sendMessage(jid, { text: String(row.message || '').slice(0, 4000) })
    const messageId = String(sent?.key?.id || '')
    await store('outboxSent', { id: row.id, messageId })
    logger.info({ outboxId: row.id, messageId }, 'Site Visit WhatsApp message sent')
  } catch (error) {
    const reason = String(error?.message || error).slice(0, 1000)
    await store('outboxRetry', { id: row.id, attemptCount: row.attempt_count, error: reason }).catch(() => null)
    siteSession.state.lastError = reason
    logger.error({ outboxId: row.id, err: reason }, 'Site Visit WhatsApp send failed')
  }
  return true
}

async function drainSiteOutbox() {
  if (!siteSession.state.sock || siteSession.state.connection !== 'open') return
  for (let i = 0; i < 20; i += 1) {
    if (!await processSiteOutboxOnce()) break
  }
}

function scheduleSiteDrain(delay = 0) {
  if (siteDrainTimer) return
  siteDrainTimer = setTimeout(async () => {
    siteDrainTimer = null
    try { await drainSiteOutbox() }
    catch (error) {
      siteSession.state.lastError = String(error?.message || error)
      logger.error({ err: siteSession.state.lastError }, 'Site Visit outbox drain failed')
    }
  }, delay)
}

function unwrapMessage(message) {
  let current = message || {}
  for (let i = 0; i < 4; i += 1) {
    if (current.ephemeralMessage?.message) current = current.ephemeralMessage.message
    else if (current.viewOnceMessage?.message) current = current.viewOnceMessage.message
    else if (current.viewOnceMessageV2?.message) current = current.viewOnceMessageV2.message
    else break
  }
  return current
}

function messageBody(message) {
  const m = unwrapMessage(message)
  return String(
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ''
  ).trim().slice(0, 4000)
}

function messageType(message) {
  const m = unwrapMessage(message)
  if (m.conversation || m.extendedTextMessage) return 'text'
  if (m.imageMessage) return 'image'
  if (m.videoMessage) return 'video'
  if (m.documentMessage) return 'document'
  if (m.audioMessage) return 'audio'
  if (m.stickerMessage) return 'sticker'
  if (m.locationMessage || m.liveLocationMessage) return 'location'
  if (m.contactMessage || m.contactsArrayMessage) return 'contact'
  return 'other'
}

function bareUserJid(value) {
  return String(value || '').trim().replace(/:\d+@/, '@')
}

function phoneFromPnJid(value) {
  const jid = bareUserJid(value)
  return jid.endsWith('@s.whatsapp.net') ? jid.split('@')[0].replace(/\D/g, '') : ''
}

async function resolveIncomingAddress(message, sock) {
  const direct = bareUserJid(message?.key?.remoteJid)
  const altCandidates = [
    message?.key?.remoteJidAlt,
    message?.key?.participantAlt,
  ].map(bareUserJid).filter(Boolean)

  if (direct.endsWith('@s.whatsapp.net')) {
    return { jid: direct, phoneNumber: phoneFromPnJid(direct), mapped: true }
  }

  if (direct.endsWith('@lid')) {
    const altPn = altCandidates.find((jid) => jid.endsWith('@s.whatsapp.net'))
    if (altPn) return { jid: direct, phoneNumber: phoneFromPnJid(altPn), mapped: true }

    try {
      const mappedPn = bareUserJid(await sock?.signalRepository?.lidMapping?.getPNForLID?.(direct))
      if (mappedPn.endsWith('@s.whatsapp.net')) {
        return { jid: direct, phoneNumber: phoneFromPnJid(mappedPn), mapped: true }
      }
    } catch (error) {
      logger.warn({ jidType: 'lid', err: String(error?.message || error).slice(0, 300) }, 'Could not resolve inbound WhatsApp LID')
    }
  }

  return { jid: direct, phoneNumber: 'unknown', mapped: false }
}

function projectStatusText(project) {
  if (!project) return ''
  const lines = [
    `🏗️ *${project.projectCode || 'LAND VIEW Project'}${project.projectName ? ` — ${project.projectName}` : ''}*`,
  ]
  if (project.designStage) lines.push(`• Design Stage: ${project.designStage}`)
  if (project.approvalStage) lines.push(`• Approval Stage: ${project.approvalStage}`)
  if (project.supervisionStage) lines.push(`• Supervision/Construction: ${project.supervisionStage}`)
  if (project.location) lines.push(`• Location: ${project.location}`)
  if (lines.length === 1) lines.push('Project status is available in the LAND VIEW client portal.')
  return lines.join('\n')
}

function latestVisitText(project, visit) {
  if (!project) return 'Please verify/select your LAND VIEW File ID first.'
  if (!visit) return `No Site Visit has been recorded yet for ${project.projectCode}.`
  const lines = [
    `📍 *Latest Site Visit — ${project.projectCode}*`,
    `Date: ${visit.visit_date || '—'}`,
  ]
  const purpose = visit.visit_purpose || visit.purpose
  if (purpose) lines.push(`Purpose: ${purpose}`)
  if (visit.observations) lines.push(`Observation: ${String(visit.observations).slice(0, 800)}`)
  if (visit.action_required) lines.push(`Action Required: ${String(visit.action_required).slice(0, 800)}`)
  if (visit.visited_by) lines.push(`Visited By: ${visit.visited_by}`)
  return lines.join('\n')
}

// client-finance-menu-v1
function bdt(value) {
  const amount = Number(value || 0)
  const safe = Number.isFinite(amount) ? amount : 0
  return `BDT ${new Intl.NumberFormat('en-BD', { maximumFractionDigits: 0 }).format(safe)}`
}

function financeCode(bundle) {
  return bundle?.project?.projectCode || 'LAND VIEW Project'
}

async function financeReply(conversationId, formatter) {
  try {
    const bundle = await financeStore('billingBundle', { conversationId })
    return formatter(bundle)
  } catch (error) {
    logger.error({ err: String(error?.message || error).slice(0, 500) }, 'Client finance lookup failed')
    return 'Billing information is temporarily unavailable. Please try again shortly or choose *8* to talk to LAND VIEW.'
  }
}

function billingSummaryText(bundle) {
  const t = bundle?.totals || {}
  const lines = [
    `💳 *Billing Summary — ${financeCode(bundle)}*`,
    `Total Bill: *${bdt(t.billed)}*`,
    `Paid: *${bdt(t.paid)}*`,
    `Due: *${bdt(t.due)}*`,
  ]
  if (Number(t.discount || 0) > 0) lines.push(`Discount: ${bdt(t.discount)}`)
  if (Number(t.writtenOff || 0) > 0) lines.push(`Adjusted / Written Off: ${bdt(t.writtenOff)}`)
  lines.push('', Number(t.due || 0) <= 0.009 ? '✅ No outstanding balance.' : 'Reply *4* for the bill breakdown or *5* for payment history.', '', 'Reply *menu* for all options.')
  return lines.join('\n')
}

function billBreakdownText(bundle) {
  const lines = [`🧾 *Bill Breakdown — ${financeCode(bundle)}*`]
  const order = ['Engineering Bill', 'Supervision Bill', 'Other Services Bill']
  for (const category of order) {
    const row = bundle?.categories?.[category]
    if (!row || (!Number(row.billed || 0) && !Number(row.paid || 0) && !Number(row.due || 0))) continue
    lines.push('', `*${category}*`, `Bill: ${bdt(row.billed)} · Paid: ${bdt(row.paid)} · Due: *${bdt(row.due)}*`)
  }
  const bills = Array.isArray(bundle?.bills) ? bundle.bills.slice(0, 10) : []
  if (bills.length) {
    lines.push('', '*Bill Items*')
    for (const bill of bills) {
      const discount = Number(bill.discount || 0) > 0 ? ` (discount ${bdt(bill.discount)})` : ''
      lines.push(`• ${bill.description || bill.category}: ${bdt(bill.amount)}${discount}`)
    }
  } else {
    lines.push('', 'No bill items have been recorded yet.')
  }
  lines.push('', 'Reply *3* for summary · *5* for payments · *menu* for options.')
  return lines.join('\n').slice(0, 3900)
}

function paymentHistoryText(bundle) {
  const payments = Array.isArray(bundle?.payments) ? bundle.payments.slice(0, 10) : []
  const lines = [`💰 *Payment History — ${financeCode(bundle)}*`]
  if (!payments.length) {
    lines.push('', 'No verified client payments have been recorded yet.')
  } else {
    lines.push('')
    for (const p of payments) {
      const method = p.method ? ` · ${p.method}` : ''
      const category = p.category ? ` · ${p.category}` : ''
      lines.push(`• ${p.date || '—'} — *${bdt(p.amount)}*${category}${method}`)
    }
    lines.push('', `Total verified paid: *${bdt(bundle?.totals?.paid)}*`)
  }
  lines.push('', 'Reply *3* for billing summary · *menu* for options.')
  return lines.join('\n').slice(0, 3900)
}

function invoiceReceiptText(bundle) {
  const invoices = Array.isArray(bundle?.invoices) ? bundle.invoices.slice(0, 5) : []
  const receiptPayments = (Array.isArray(bundle?.payments) ? bundle.payments : []).filter((p) => p.receiptUrl).slice(0, 3)
  const lines = [`📄 *Invoice & Receipt — ${financeCode(bundle)}*`]
  if (!invoices.length) {
    lines.push('', 'No generated invoice PDF is currently attached to this project.')
  } else {
    lines.push('')
    for (const inv of invoices) {
      lines.push(`• ${inv.code || 'Invoice'} · ${inv.date || '—'} · ${bdt(inv.amount)}`)
      if (inv.url) lines.push(inv.url)
    }
  }
  if (receiptPayments.length) {
    lines.push('', '*Payment Receipts*')
    for (const p of receiptPayments) {
      lines.push(`• ${p.date || '—'} · ${bdt(p.amount)}`, p.receiptUrl)
    }
  }
  lines.push('', `For full records, choose *7* to open the Client Portal.`, 'Reply *menu* for options.')
  return lines.join('\n').slice(0, 3900)
}

function menuText(context) {
  const name = context?.conversation?.clientName || context?.client?.name || ''
  const code = context?.project?.projectCode || context?.conversation?.projectCode || ''
  return [
    `👋 Welcome${name ? ` ${name}` : ''} to *LAND VIEW Architects & Engineers*.`,
    code ? `File: *${code}*` : '',
    '',
    'Reply with a number:',
    '1️⃣ Project Status',
    '2️⃣ Latest Site Visit',
    '3️⃣ Billing Summary / Due',
    '4️⃣ Bill Breakdown',
    '5️⃣ Payment History',
    '6️⃣ Invoice / Receipt',
    '7️⃣ Client Portal & Documents',
    '8️⃣ Talk to LAND VIEW',
    '',
    'You can also type *menu* anytime.',
  ].filter(Boolean).join('\n')
}

function projectSelectionText(projects) {
  const codes = (projects || []).map((p) => p?.projectCode).filter(Boolean).slice(0, 12)
  if (!codes.length) return 'For security, please reply with your LAND VIEW File ID, for example *LV-157*, from the registered client phone number.'
  return `We found more than one LAND VIEW project for this number. Reply with the File ID you want to use:\n${codes.map((c) => `• ${c}`).join('\n')}`
}

function normalizedCommand(body) {
  return String(body || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

async function queueAutoReply(conversationId, message) {
  if (!conversationId || !message) return
  await store('clientQueue', { conversationId, message, source: 'bot-auto' })
  scheduleClientDrain(50)
}

async function handleClientInbound(event, sock) {
  const eventType = String(event?.type || '')
  for (const message of event?.messages || []) {
    if (!message?.key || message.key.fromMe) continue

    const timestampSeconds = Number(message.messageTimestamp || 0)
    const messageTimeMs = timestampSeconds > 0 ? timestampSeconds * 1000 : 0
    const freshAppend = eventType === 'append' && messageTimeMs > 0 && messageTimeMs >= Math.max(0, Number(clientSession?.state?.openedAt || 0) - 30000)
    if (eventType && eventType !== 'notify' && !freshAppend) continue

    const address = await resolveIncomingAddress(message, sock)
    const jid = address.jid
    if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast' || jid.endsWith('@broadcast')) continue

    const body = messageBody(message.message)
    const type = messageType(message.message)
    const sentAt = timestampSeconds > 0 ? new Date(timestampSeconds * 1000).toISOString() : new Date().toISOString()

    logger.info({
      eventType: eventType || 'unknown',
      jidType: jid.endsWith('@lid') ? 'lid' : jid.endsWith('@s.whatsapp.net') ? 'pn' : 'other',
      phoneMapped: Boolean(address.mapped),
      messageType: type,
      messageId: String(message.key.id || '').slice(0, 80),
    }, 'Client WhatsApp inbound message received')

    const inbound = await store('clientInbound', {
      jid,
      phoneNumber: address.phoneNumber,
      messageId: String(message.key.id || ''),
      body,
      messageType: type,
      sentAt,
    })
    if (inbound?.duplicate) continue

    const conversationId = inbound?.conversation?.id
    if (!conversationId) continue
    if (inbound?.conversation?.humanHandoff) continue

    const command = normalizedCommand(body)
    const fileIdLike = /(?:^|\b)lv\s*[- ]?\s*\d{1,6}(?:\b|$)/i.test(body) || /^\d{1,6}$/.test(body.trim())

    if (!inbound?.verified) {
      await queueAutoReply(conversationId, projectSelectionText([]))
      continue
    }

    if (!inbound?.project) {
      await queueAutoReply(conversationId, projectSelectionText(inbound?.projects || []))
      continue
    }

    if (fileIdLike) {
      await queueAutoReply(conversationId, `✅ File *${inbound.project.projectCode}* verified for this WhatsApp number.\n\n${menuText(inbound)}`)
      continue
    }

    if (!body || ['hi', 'hello', 'hey', 'menu', 'help', 'start', 'assalamu alaikum', 'salam', 'আসসালামু আলাইকুম'].includes(command)) {
      await queueAutoReply(conversationId, menuText(inbound))
      continue
    }

    if (command === '1' || command.includes('status') || command.includes('project status')) {
      await queueAutoReply(conversationId, `${projectStatusText(inbound.project)}\n\nReply *menu* for more options.`)
      continue
    }

    if (command === '2' || command.includes('site visit') || command.includes('visit')) {
      await queueAutoReply(conversationId, `${latestVisitText(inbound.project, inbound.latestVisit)}\n\nReply *menu* for more options.`)
      continue
    }

    if (command === '3' || command === 'billing' || command === 'bill summary' || command.includes('billing summary') || command.includes('balance') || command.includes('due')) {
      await queueAutoReply(conversationId, await financeReply(conversationId, billingSummaryText))
      continue
    }

    if (command === '4' || command.includes('bill breakdown') || command.includes('bill details') || command.includes('service bill') || command.includes('charges') || command.includes('fees')) {
      await queueAutoReply(conversationId, await financeReply(conversationId, billBreakdownText))
      continue
    }

    if (command === '5' || command === 'payment' || command === 'payments' || command.includes('payment history') || command.includes('paid history')) {
      await queueAutoReply(conversationId, await financeReply(conversationId, paymentHistoryText))
      continue
    }

    if (command === '6' || command.includes('invoice') || command.includes('receipt')) {
      await queueAutoReply(conversationId, await financeReply(conversationId, invoiceReceiptText))
      continue
    }

    if (command === '7' || command.includes('portal') || command.includes('document')) {
      await queueAutoReply(conversationId, `🔐 *LAND VIEW Client Portal*\n${CLIENT_PORTAL_URL}\n\nUse your File ID and registered mobile number to view project records and documents.`)
      continue
    }

    if (command === '8' || command.includes('human') || command.includes('engineer') || command.includes('manager') || command.includes('talk') || command.includes('call me')) {
      await store('clientHandoff', { conversationId, enabled: true })
      await queueAutoReply(conversationId, '👤 Your message has been handed over to the LAND VIEW team. A team member can reply to you here from the LAND VIEW admin inbox.')
      continue
    }

    await queueAutoReply(conversationId, `I can help with your LAND VIEW project.\n\n${menuText(inbound)}`)
  }
}

async function processClientOutboxOnce() {
  const sock = clientSession.state.sock
  if (!sock || clientSession.state.connection !== 'open') return false
  const row = await store('clientOutboxNext')
  if (!row?.id) return false
  try {
    const sent = await sock.sendMessage(String(row.to_jid), { text: String(row.message || '').slice(0, 4000) })
    const messageId = String(sent?.key?.id || '')
    await store('clientOutboxSent', { id: row.id, messageId })
    logger.info({ outboxId: row.id, messageId }, 'Client WhatsApp message sent')
  } catch (error) {
    const reason = String(error?.message || error).slice(0, 1000)
    await store('clientOutboxRetry', { id: row.id, attemptCount: row.attempt_count, error: reason }).catch(() => null)
    clientSession.state.lastError = reason
    logger.error({ outboxId: row.id, err: reason }, 'Client WhatsApp send failed')
  }
  return true
}

async function drainClientOutbox() {
  if (!clientSession.state.sock || clientSession.state.connection !== 'open') return
  for (let i = 0; i < 30; i += 1) {
    if (!await processClientOutboxOnce()) break
  }
}

function scheduleClientDrain(delay = 0) {
  if (clientDrainTimer) return
  clientDrainTimer = setTimeout(async () => {
    clientDrainTimer = null
    try { await drainClientOutbox() }
    catch (error) {
      clientSession.state.lastError = String(error?.message || error)
      logger.error({ err: clientSession.state.lastError }, 'Client outbox drain failed')
    }
  }, delay)
}

const siteSession = createManagedSession({
  sessionId: SITE_SESSION_ID,
  label: 'LAND VIEW Site Visits',
  onOpen: async () => {
    cachedGroup = { target: '', jid: '' }
    await store('outboxRecoverStale').catch(() => null)
    scheduleSiteDrain(250)
  },
})

const clientSession = createManagedSession({
  sessionId: CLIENT_SESSION_ID,
  label: 'LAND VIEW Client Bot',
  onMessages: handleClientInbound,
  onOpen: async () => {
    await store('outboxRecoverStale').catch(() => null)
    scheduleClientDrain(250)
  },
})

function authorized(req) {
  const header = String(req.get('x-land-view-bot-token') || '').trim()
  const bearer = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  const query = String(req.query?.key || '').trim()
  return [header, bearer, query].some((value) => value && value === BOT_TOKEN)
}

function pairHtml(session, key, title) {
  const state = session.status()
  const refreshUrl = `${key.path}?key=${encodeURIComponent(key.value || '')}`
  const body = state.paired
    ? `<h2>Connected</h2><p>${title} is paired and ready.</p>`
    : state.qrAvailable
      ? `<h2>Scan this QR in WhatsApp</h2><p>WhatsApp → Linked devices → Link a device</p><img src="${session.state.qrDataUrl}" alt="WhatsApp QR" width="360" height="360" />`
      : `<h2>${state.connection === 'logged_out' ? 'Pairing reset required' : 'Preparing WhatsApp connection…'}</h2><p>This page refreshes automatically.</p>`
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="refresh" content="5;url=${refreshUrl}"><title>${title}</title><style>body{font-family:system-ui,sans-serif;max-width:680px;margin:40px auto;padding:24px;color:#111}img{max-width:100%;height:auto;border:1px solid #ddd;border-radius:12px}</style></head><body><h1>${title}</h1>${body}</body></html>`
}

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '64kb' }))

app.get('/', (_req, res) => res.json({ ok: true, siteVisitBot: siteSession.status(), clientBot: clientSession.status() }))
app.get('/health', (_req, res) => res.json(siteSession.status()))
app.get('/client/health', (_req, res) => res.json(clientSession.status()))
app.get('/groups', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' })
  try {
    const groups = await listSiteGroups()
    return res.json({ ok: true, groups })
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || error) })
  }
})

app.post('/wake', (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' })
  scheduleSiteDrain(0)
  return res.status(202).json({ ok: true, queued: true, connection: siteSession.state.connection })
})
app.post('/client/wake', (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' })
  scheduleClientDrain(0)
  return res.status(202).json({ ok: true, queued: true, connection: clientSession.state.connection })
})

app.get('/pair', (req, res) => {
  if (!authorized(req)) return res.status(401).send('Unauthorized')
  res.set('cache-control', 'no-store')
  res.send(pairHtml(siteSession, { path: '/pair', value: req.query.key }, 'LAND VIEW Site Visit Bot'))
})
app.get('/client/pair', (req, res) => {
  if (!authorized(req)) return res.status(401).send('Unauthorized')
  res.set('cache-control', 'no-store')
  res.send(pairHtml(clientSession, { path: '/client/pair', value: req.query.key }, 'LAND VIEW Client WhatsApp Bot'))
})

app.post('/admin/reset', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' })
  try {
    cachedGroup = { target: '', jid: '' }
    await siteSession.reset()
    return res.json({ ok: true })
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || error) })
  }
})
app.post('/client/admin/reset', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' })
  try {
    await clientSession.reset()
    return res.json({ ok: true })
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || error) })
  }
})

app.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT }, 'LAND VIEW WhatsApp service listening')
  siteSession.connect().catch((error) => {
    siteSession.state.lastError = String(error?.message || error)
    siteSession.state.connection = 'error'
    logger.error({ err: siteSession.state.lastError }, 'Initial Site Visit WhatsApp connection failed')
    siteSession.scheduleReconnect(10000)
  })
  clientSession.connect().catch((error) => {
    clientSession.state.lastError = String(error?.message || error)
    clientSession.state.connection = 'error'
    logger.error({ err: clientSession.state.lastError }, 'Initial Client WhatsApp connection failed')
    clientSession.scheduleReconnect(10000)
  })
  setInterval(() => scheduleSiteDrain(0), 15000).unref()
  setInterval(() => scheduleClientDrain(0), 10000).unref()
})
