import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const serviceDir = dirname(fileURLToPath(import.meta.url))
const runtimeDir = join(serviceDir, '.runtime')
const sourcePath = join(serviceDir, 'server.mjs')
const gatewaySourcePath = join(serviceDir, 'gateway.mjs')
const runtimeServerPath = join(runtimeDir, 'server.mjs')
const runtimeGatewayPath = join(runtimeDir, 'gateway.mjs')
const parserMarker = "app.use(express.json({ limit: '64kb' }))"
const clientAutoReplyMarker = "if (inbound?.conversation?.humanHandoff) continue"
const gatewayParserMarker = "const employeeJson = express.json({ limit: '64kb' })"

const directMediaHelpers = String.raw`
function directImageMedia(value) {
  const items = Array.isArray(value) ? value.slice(0, 2) : []
  return items.map((item, index) => {
    const mimeType = String(item?.mimeType || '').trim().toLowerCase()
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
      throw new Error('Only JPG, PNG and WebP Site Visit photos can be sent to WhatsApp.')
    }
    const base64 = String(item?.base64 || '').replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '').trim()
    if (!base64) throw new Error('Site Visit photo data is missing.')
    const image = Buffer.from(base64, 'base64')
    if (!image.length || image.length > 4 * 1024 * 1024) {
      throw new Error('Each Site Visit WhatsApp photo must be 4 MB or smaller.')
    }
    return {
      image,
      caption: String(item?.caption || (index === 0 ? '📷 LAND VIEW Site Visit Photo' : '⚠️ LAND VIEW Site Problem Photo')).trim().slice(0, 700),
    }
  })
}

async function sendDirectGroupPayload(sock, jid, message, mediaValue) {
  const media = directImageMedia(mediaValue)
  const messageIds = []
  if (message) {
    const sent = await sock.sendMessage(jid, { text: message })
    const id = String(sent?.key?.id || '')
    if (id) messageIds.push(id)
  }
  for (const item of media) {
    const sent = await sock.sendMessage(jid, { image: item.image, caption: item.caption })
    const id = String(sent?.key?.id || '')
    if (id) messageIds.push(id)
  }
  return { messageIds, mediaCount: media.length }
}
`.trim()

const documentRoute = String.raw`
app.post('/client/send-document', express.raw({ type: 'application/pdf', limit: '3mb' }), async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' })
  const sock = clientSession.state.sock
  if (!sock || clientSession.state.connection !== 'open') {
    return res.status(503).json({ ok: false, error: 'Admin WhatsApp bot is not connected. Open Admin → WhatsApp and pair the Admin Bot first.' })
  }

  const waNumber = canonicalInternationalPhone(req.get('x-client-phone'))
  if (!waNumber) {
    return res.status(400).json({ ok: false, error: 'The client WhatsApp number is invalid. Bangladesh 01XXXXXXXXX or a full international number is required.' })
  }

  const pdf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0)
  if (!pdf.length || pdf.length > 2_600_000 || pdf.subarray(0, 5).toString('ascii') !== '%PDF-') {
    return res.status(pdf.length > 2_600_000 ? 413 : 400).json({ ok: false, error: 'The invoice PDF is invalid or too large for direct WhatsApp sending.' })
  }

  const fileName = String(req.get('x-file-name') || 'LAND-VIEW-Invoice.pdf')
    .trim()
    .replace(/[^A-Za-z0-9._ -]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 160) || 'LAND-VIEW-Invoice.pdf'
  let caption = ''
  try {
    caption = Buffer.from(String(req.get('x-caption-b64') || ''), 'base64').toString('utf8').trim().slice(0, 1000)
  } catch {}

  try {
    const results = await sock.onWhatsApp(waNumber)
    const match = Array.isArray(results) ? results.find((item) => item?.exists) : null
    if (!match?.exists) return res.status(404).json({ ok: false, error: 'The client phone number is not registered on WhatsApp.' })
    const jid = String(match.jid || '') || (waNumber + '@s.whatsapp.net')
    const sent = await sock.sendMessage(jid, {
      document: pdf,
      mimetype: 'application/pdf',
      fileName,
      caption,
    })
    const messageId = String(sent?.key?.id || '')
    logger.info({ messageId, fileName, byteLength: pdf.length }, 'Client invoice PDF sent on WhatsApp')
    return res.json({ ok: true, sent: true, messageId, normalizedPhone: '+' + waNumber })
  } catch (error) {
    const reason = String(error?.message || error).slice(0, 1000)
    clientSession.state.lastError = reason
    logger.error({ err: reason, fileName }, 'Client invoice PDF WhatsApp send failed')
    return res.status(502).json({ ok: false, error: reason })
  }
})
`.trim()

const adminSendMarker = String.raw`app.post('/admin/send-group', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' })
  const sock = siteSession.state.sock
  if (!sock || siteSession.state.connection !== 'open') {
    return res.status(409).json({ ok: false, error: 'Admin WhatsApp is not connected.', ...siteSession.status() })
  }
  const message = String(req.body?.message || '').trim().slice(0, 4000)
  if (!message) return res.status(400).json({ ok: false, error: 'WhatsApp message is empty.' })
  try {
    const jid = await ensureGroup(req.body?.groupInviteCode)
    const sent = await sock.sendMessage(jid, { text: message })
    return res.json({ ok: true, sent: true, messageId: String(sent?.key?.id || ''), sharedAdminSession: true })
  } catch (error) {
    const reason = String(error?.message || error).slice(0, 1000)
    siteSession.state.lastError = reason
    return res.status(500).json({ ok: false, error: reason })
  }
})`

const adminSendReplacement = String.raw`${directMediaHelpers}

app.post('/admin/send-group', async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' })
  const sock = siteSession.state.sock
  if (!sock || siteSession.state.connection !== 'open') {
    return res.status(409).json({ ok: false, error: 'Admin WhatsApp is not connected.', ...siteSession.status() })
  }
  const message = String(req.body?.message || '').trim().slice(0, 4000)
  const media = Array.isArray(req.body?.media) ? req.body.media.slice(0, 2) : []
  if (!message && !media.length) return res.status(400).json({ ok: false, error: 'WhatsApp message and media are empty.' })
  try {
    const jid = await ensureGroup(req.body?.groupInviteCode)
    const sent = await sendDirectGroupPayload(sock, jid, message, media)
    return res.json({
      ok: true,
      sent: true,
      messageId: sent.messageIds[0] || '',
      messageIds: sent.messageIds,
      mediaCount: sent.mediaCount,
      sharedAdminSession: true,
    })
  } catch (error) {
    const reason = String(error?.message || error).slice(0, 1000)
    siteSession.state.lastError = reason
    return res.status(500).json({ ok: false, error: reason })
  }
})`

const employeeSendMarker = String.raw`app.post('/employee/send', employeeJson, async (req, res) => {
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
})`

const employeeSendReplacement = String.raw`${directMediaHelpers}

app.post('/employee/send', employeeJson, async (req, res) => {
  if (!authorized(req)) return res.status(401).json({ ok: false, error: 'Unauthorized.' })
  try {
    const employeeId = normalizedEmployeeId(req.body?.employeeId)
    const message = String(req.body?.message || '').trim().slice(0, 4000)
    const media = Array.isArray(req.body?.media) ? req.body.media.slice(0, 2) : []
    if (!message && !media.length) return res.status(400).json({ ok: false, error: 'WhatsApp message and media are empty.' })

    if (isSharedAdminEmployee(employeeId)) {
      const sent = await legacyAdminRequest('/admin/send-group', {
        method: 'POST',
        body: JSON.stringify({ groupInviteCode: req.body?.groupInviteCode, message, media }),
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
    const sent = await sendDirectGroupPayload(session.state.sock, jid, message, media)
    return res.json({
      ok: true,
      sent: true,
      messageId: sent.messageIds[0] || '',
      messageIds: sent.messageIds,
      mediaCount: sent.mediaCount,
      phoneNumber: phoneFromUserId(session.state.sock?.user?.id) || null,
    })
  } catch (error) {
    const reason = String(error?.message || error)
    return res.status(Number(error?.status) || 500).json({ ok: false, error: reason })
  }
})`

await mkdir(runtimeDir, { recursive: true })
const source = await readFile(sourcePath, 'utf8')
if (!source.includes(parserMarker)) throw new Error('Could not prepare the WhatsApp invoice document endpoint: server parser marker was not found.')
if (!source.includes(clientAutoReplyMarker)) throw new Error('Could not disable client WhatsApp auto replies: inbound handler marker was not found.')
if (!source.includes(adminSendMarker)) throw new Error('Could not enable direct Site Visit media: Admin group send route marker was not found.')
const withDocumentRoute = source.includes("app.post('/client/send-document'")
  ? source
  : source.replace(parserMarker, `${documentRoute}\n\n${parserMarker}`)
let patchedServer = withDocumentRoute.replace(
  clientAutoReplyMarker,
  `${clientAutoReplyMarker}\n    if (String(process.env.WHATSAPP_CLIENT_AUTO_REPLY_ENABLED || 'false').trim().toLowerCase() !== 'true') continue`,
)
patchedServer = patchedServer
  .replace(parserMarker, "app.use(express.json({ limit: '16mb' }))")
  .replace(adminSendMarker, adminSendReplacement)
await writeFile(runtimeServerPath, patchedServer, 'utf8')

const gatewaySource = await readFile(gatewaySourcePath, 'utf8')
if (!gatewaySource.includes(gatewayParserMarker)) throw new Error('Could not enable direct Site Visit media: employee JSON parser marker was not found.')
if (!gatewaySource.includes(employeeSendMarker)) throw new Error('Could not enable direct Site Visit media: employee send route marker was not found.')
const patchedGateway = gatewaySource
  .replace(gatewayParserMarker, "const employeeJson = express.json({ limit: '16mb' })")
  .replace(employeeSendMarker, employeeSendReplacement)
await writeFile(runtimeGatewayPath, patchedGateway, 'utf8')

process.chdir(runtimeDir)
await import(pathToFileURL(runtimeGatewayPath).href)
