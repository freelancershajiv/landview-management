import { readFile, writeFile } from 'node:fs/promises'

const PORT = Number(process.env.PORT || 10000)
const BOT_TOKEN = String(process.env.BOT_API_TOKEN || '').trim()
const SESSION_LIST_URL = String(
  process.env.WHATSAPP_SESSION_LIST_URL ||
  'https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-whatsapp-session-list'
).trim()
const RESTORE_SPACING_MS = Math.max(5000, Number(process.env.WHATSAPP_RESTORE_SPACING_MS || 12000))
const FINANCE_EMPLOYEE_ID = String(
  process.env.WHATSAPP_FINANCE_EMPLOYEE_ID ||
  process.env.WHATSAPP_ADMIN_EMPLOYEE_ID ||
  'EMP-0002'
).trim().toUpperCase()

async function applyRateLimitReconnectGuard() {
  try {
    const gatewayPath = new URL('./gateway.mjs', import.meta.url)
    const marker = 'scheduleReconnect(code === DisconnectReason.restartRequired ? 1000 : 5000)'
    const replacement = 'scheduleReconnect(code === DisconnectReason.restartRequired ? 1000 : code === 429 ? 60000 : 5000)'
    const source = await readFile(gatewayPath, 'utf8')
    if (source.includes(replacement)) return
    if (!source.includes(marker)) {
      console.warn('[WhatsApp startup] Could not install the HTTP 429 reconnect cooldown because the gateway marker changed.')
      return
    }
    await writeFile(gatewayPath, source.replace(marker, replacement), 'utf8')
    console.info('[WhatsApp startup] HTTP 429 reconnect cooldown enabled (60 seconds).')
  } catch (error) {
    console.warn(`[WhatsApp startup] Could not install the HTTP 429 reconnect cooldown: ${String(error?.message || error)}`)
  }
}

await applyRateLimitReconnectGuard()
await import('./bootstrap.mjs')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function pairedEmployeeIds() {
  if (!BOT_TOKEN || !SESSION_LIST_URL) return []
  const response = await fetch(SESSION_LIST_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-land-view-bot-token': BOT_TOKEN,
    },
    body: JSON.stringify({ action: 'listPairedEmployeeSessions' }),
    signal: AbortSignal.timeout(30000),
  })
  const json = await response.json().catch(() => null)
  if (!response.ok || !json?.success) {
    throw new Error(String(json?.error || `WhatsApp session list returned HTTP ${response.status}.`))
  }
  const rows = Array.isArray(json?.data?.employees) ? json.data.employees : []
  const ids = [...new Set(rows.map((row) => String(row?.employeeId || '').trim().toUpperCase()).filter(Boolean))]
  return ids.sort((a, b) => {
    if (a === FINANCE_EMPLOYEE_ID) return -1
    if (b === FINANCE_EMPLOYEE_ID) return 1
    return a.localeCompare(b)
  })
}

async function wakeEmployee(employeeId) {
  const url = new URL(`http://127.0.0.1:${PORT}/employee/status`)
  url.searchParams.set('employeeId', employeeId)
  const response = await fetch(url, {
    headers: { 'x-land-view-bot-token': BOT_TOKEN },
    signal: AbortSignal.timeout(30000),
  })
  const json = await response.json().catch(() => null)
  if (!response.ok || json?.ok === false) {
    const error = new Error(String(json?.error || `Employee status returned HTTP ${response.status}.`))
    error.status = response.status
    throw error
  }
  return json
}

async function restorePairedEmployeeSessions() {
  if (!BOT_TOKEN) return
  await sleep(1000)
  const employeeIds = await pairedEmployeeIds()
  if (!employeeIds.length) {
    console.info('[WhatsApp startup] No paired employee sessions found to restore.')
    return
  }

  let restored = 0
  for (let index = 0; index < employeeIds.length; index += 1) {
    const employeeId = employeeIds[index]
    try {
      await wakeEmployee(employeeId)
      restored += 1
      console.info(`[WhatsApp startup] Restore started for ${employeeId}.`)
    } catch (error) {
      const status = Number(error?.status || 0)
      if (status === 429) {
        console.warn(`[WhatsApp startup] ${employeeId} was rate-limited; leaving it for the normal reconnect path instead of retrying immediately.`)
      } else {
        console.error(`[WhatsApp startup] Could not restore ${employeeId}: ${String(error?.message || error)}`)
      }
    }

    if (index < employeeIds.length - 1) {
      await sleep(RESTORE_SPACING_MS)
    }
  }

  console.info(`[WhatsApp startup] Restore triggered for ${restored}/${employeeIds.length} paired employee session(s), one at a time.`)
}

restorePairedEmployeeSessions().catch((error) => {
  console.error(`[WhatsApp startup] Automatic employee restore failed: ${String(error?.message || error)}`)
})
