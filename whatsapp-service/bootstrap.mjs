import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const serviceDir = dirname(fileURLToPath(import.meta.url))
const runtimeDir = join(serviceDir, '.runtime')
const sourcePath = join(serviceDir, 'server.mjs')
const runtimeServerPath = join(runtimeDir, 'server.mjs')
const parserMarker = "app.use(express.json({ limit: '64kb' }))"
const clientAutoReplyMarker = "if (inbound?.conversation?.humanHandoff) continue"

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

await mkdir(runtimeDir, { recursive: true })
const source = await readFile(sourcePath, 'utf8')
if (!source.includes(parserMarker)) throw new Error('Could not prepare the WhatsApp invoice document endpoint: server parser marker was not found.')
if (!source.includes(clientAutoReplyMarker)) throw new Error('Could not disable client WhatsApp auto replies: inbound handler marker was not found.')
const withDocumentRoute = source.includes("app.post('/client/send-document'")
  ? source
  : source.replace(parserMarker, `${documentRoute}\n\n${parserMarker}`)
const patched = withDocumentRoute.replace(
  clientAutoReplyMarker,
  `${clientAutoReplyMarker}\n    if (String(process.env.WHATSAPP_CLIENT_AUTO_REPLY_ENABLED || 'false').trim().toLowerCase() !== 'true') continue`,
)
await writeFile(runtimeServerPath, patched, 'utf8')
process.chdir(runtimeDir)
await import(pathToFileURL(join(serviceDir, 'gateway.mjs')).href)
