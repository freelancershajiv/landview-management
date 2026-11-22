export function phoneFromUserId(value) {
  return /^(\d+)(?::\d+)?@s\.whatsapp\.net$/.exec(String(value || ''))?.[1] || ''
}

function senderConflict(message) {
  return Object.assign(new Error(message), { status: 409 })
}

export function verifiedEmployeeGroupSender(state, expectedPhone) {
  if (typeof expectedPhone !== 'string' || !/^8801[3-9]\d{8}$/.test(expectedPhone)) {
    throw senderConflict('A verified employee mobile number is required for this WhatsApp delivery.')
  }

  const socket = state.sock
  function assertSender() {
    if (!socket || state.sock !== socket || state.connection !== 'open') {
      throw senderConflict('The employee WhatsApp connection changed. Reconnect and retry the Site Visit.')
    }
    // A WhatsApp linked-device ID (LID) is not evidence of a phone number.
    if (phoneFromUserId(socket.user?.id) !== expectedPhone) {
      throw senderConflict('The connected WhatsApp account does not match the visiting employee’s registered number.')
    }
  }

  assertSender()
  return (jid, content, options) => {
    assertSender()
    return socket.sendMessage(jid, content, options)
  }
}

export async function stableWhatsAppMessageId(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)))
  const hex = Array.from(digest.slice(0, 9)).map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
  return '3EB0' + hex
}

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

export async function sendDirectGroupPayload(sendMessage, jid, message, mediaValue, idempotencyKey = '') {
  const media = directImageMedia(mediaValue)
  const messageIds = []
  const baseKey = String(idempotencyKey || '').trim()
  if (message) {
    const messageId = baseKey ? await stableWhatsAppMessageId('text:' + baseKey) : ''
    const sent = await sendMessage(jid, { text: message }, messageId ? { messageId } : undefined)
    const id = String(sent?.key?.id || messageId || '')
    if (id) messageIds.push(id)
  }
  for (let index = 0; index < media.length; index += 1) {
    const item = media[index]
    const messageId = baseKey ? await stableWhatsAppMessageId('media:' + index + ':' + baseKey) : ''
    const sent = await sendMessage(jid, { image: item.image, caption: item.caption }, messageId ? { messageId } : undefined)
    const id = String(sent?.key?.id || messageId || '')
    if (id) messageIds.push(id)
  }
  return { messageIds, mediaCount: media.length }
}
