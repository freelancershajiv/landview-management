import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
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

const siteOutboxSendMarker = String.raw`    const jid = await ensureGroup(row.group_invite_code)
    const sent = await siteSession.state.sock.sendMessage(jid, { text: String(row.message || '').slice(0, 4000) })
    const messageId = String(sent?.key?.id || '')`

const siteOutboxSendReplacement = String.raw`    const jid = await ensureGroup(row.group_invite_code)
    const messageIdHint = await stableWhatsAppMessageId('site-outbox:' + String(row.dedupe_key || row.id || ''))
    const sent = await siteSession.state.sock.sendMessage(
      jid,
      { text: String(row.message || '').slice(0, 4000) },
      messageIdHint ? { messageId: messageIdHint } : undefined,
    )
    const messageId = String(sent?.key?.id || messageIdHint || '')`

const clientOutboxSendMarker = String.raw`    const jid = String(row.to_jid)
    const media = queuedClientMedia(row.media_json)
    const sentIds = []

    for (const item of media) {
      const sentMedia = await sock.sendMessage(jid, {
        image: item.image,
        mimetype: item.mimeType,
        caption: item.caption || undefined,
      })
      const mediaId = String(sentMedia?.key?.id || '')
      if (mediaId) sentIds.push(mediaId)
    }

    const sentText = await sock.sendMessage(jid, { text: String(row.message || '').slice(0, 4000) })
    const textMessageId = String(sentText?.key?.id || '')
    if (textMessageId) sentIds.push(textMessageId)
    const messageId = textMessageId || sentIds[0] || ''`

const clientOutboxSendReplacement = String.raw`    const jid = String(row.to_jid)
    const media = queuedClientMedia(row.media_json)
    const sentIds = []
    const baseKey = 'client-outbox:' + String(row.dedupe_key || row.id || '')

    for (let index = 0; index < media.length; index += 1) {
      const item = media[index]
      const mediaMessageId = await stableWhatsAppMessageId('media:' + index + ':' + baseKey)
      const sentMedia = await sock.sendMessage(
        jid,
        {
          image: item.image,
          mimetype: item.mimeType,
          caption: item.caption || undefined,
        },
        mediaMessageId ? { messageId: mediaMessageId } : undefined,
      )
      const mediaId = String(sentMedia?.key?.id || mediaMessageId || '')
      if (mediaId) sentIds.push(mediaId)
    }

    const textMessageIdHint = await stableWhatsAppMessageId('text:' + baseKey)
    const sentText = await sock.sendMessage(
      jid,
      { text: String(row.message || '').slice(0, 4000) },
      textMessageIdHint ? { messageId: textMessageIdHint } : undefined,
    )
    const textMessageId = String(sentText?.key?.id || textMessageIdHint || '')
    if (textMessageId) sentIds.push(textMessageId)
    const messageId = textMessageId || sentIds[0] || ''`

const financeSendMarker = String.raw`    if (sharedAdmin) {
      const sent = await legacyAdminRequest('/admin/send-group', {
        method: 'POST',
        body: JSON.stringify({ groupInviteCode: row.group_invite_code, message: String(row.message || '').slice(0, 4000) }),
      })
      messageId = String(sent?.messageId || '')
    } else {
      const jid = await ensureEmployeeGroup(session, row.group_invite_code)
      const sent = await session.state.sock.sendMessage(jid, { text: String(row.message || '').slice(0, 4000) })
      messageId = String(sent?.key?.id || '')
    }`

const financeSendReplacement = String.raw`    const idempotencyKey = 'finance:' + String(row.dedupe_key || row.id || '')
    const messageIdHint = await stableWhatsAppMessageId(idempotencyKey)
    if (sharedAdmin) {
      const sent = await legacyAdminRequest('/admin/send-group', {
        method: 'POST',
        body: JSON.stringify({
          groupInviteCode: row.group_invite_code,
          message: String(row.message || '').slice(0, 4000),
          idempotencyKey,
        }),
      })
      messageId = String(sent?.messageId || messageIdHint || '')
    } else {
      const jid = await ensureEmployeeGroup(session, row.group_invite_code)
      const sent = await session.state.sock.sendMessage(
        jid,
        { text: String(row.message || '').slice(0, 4000) },
        messageIdHint ? { messageId: messageIdHint } : undefined,
      )
      messageId = String(sent?.key?.id || messageIdHint || '')
    }`

await mkdir(runtimeDir, { recursive: true })
await copyFile(join(serviceDir, 'group-delivery.mjs'), join(runtimeDir, 'group-delivery.mjs'))
const source = await readFile(sourcePath, 'utf8')
if (!source.includes(parserMarker)) throw new Error('Could not prepare the WhatsApp invoice document endpoint: server parser marker was not found.')
if (!source.includes(clientAutoReplyMarker)) throw new Error('Could not disable client WhatsApp auto replies: inbound handler marker was not found.')
if (!source.includes(siteOutboxSendMarker)) throw new Error('Could not enable Site Visit retry idempotency: Site Visit outbox marker was not found.')
if (!source.includes(clientOutboxSendMarker)) throw new Error('Could not enable client retry idempotency: client outbox marker was not found.')
const withDocumentRoute = source.includes("app.post('/client/send-document'")
  ? source
  : source.replace(parserMarker, `${documentRoute}\n\n${parserMarker}`)
let patchedServer = withDocumentRoute.replace(
  clientAutoReplyMarker,
  `${clientAutoReplyMarker}\n    if (String(process.env.WHATSAPP_CLIENT_AUTO_REPLY_ENABLED || 'false').trim().toLowerCase() !== 'true') continue`,
)
patchedServer = patchedServer
  .replace(parserMarker, "app.use(express.json({ limit: '16mb' }))")
  .replace(siteOutboxSendMarker, siteOutboxSendReplacement)
  .replace(clientOutboxSendMarker, clientOutboxSendReplacement)
await writeFile(runtimeServerPath, patchedServer, 'utf8')

const gatewaySource = await readFile(gatewaySourcePath, 'utf8')
if (!gatewaySource.includes(gatewayParserMarker)) throw new Error('Could not enable direct Site Visit media: employee JSON parser marker was not found.')
if (!gatewaySource.includes(financeSendMarker)) throw new Error('Could not enable finance retry idempotency: finance send marker was not found.')
const patchedGateway = gatewaySource
  .replace(gatewayParserMarker, "const employeeJson = express.json({ limit: '16mb' })")
  .replace(financeSendMarker, financeSendReplacement)
await writeFile(runtimeGatewayPath, patchedGateway, 'utf8')

process.chdir(runtimeDir)
await import(pathToFileURL(runtimeGatewayPath).href)
