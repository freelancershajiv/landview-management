const PORT = Number(process.env.PORT || 10000)
const BOT_TOKEN = String(process.env.BOT_API_TOKEN || '').trim()
const SESSION_LIST_URL = String(
  process.env.WHATSAPP_SESSION_LIST_URL ||
  'https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-whatsapp-session-list'
).trim()
const RESTORE_SPACING_MS = Math.max(5000, Number(process.env.WHATSAPP_RESTORE_SPACING_MS || 12000))
const ADMIN_EMPLOYEE_ID = String(process.env.WHATSAPP_ADMIN_EMPLOYEE_ID || 'EMP-0002').trim().toUpperCase()
const FINANCE_EMPLOYEE_ID = String(
  process.env.WHATSAPP_FINANCE_EMPLOYEE_ID ||
  ADMIN_EMPLOYEE_ID
).trim().toUpperCase()

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))


await import('./bootstrap.mjs')

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
  const ids = [...new Set(rows
    .map((row) => String(row?.employeeId || '').trim().toUpperCase())
    .filter((employeeId) => employeeId && employeeId !== ADMIN_EMPLOYEE_ID))]
  return ids.sort((a, b) => {
    if (a === FINANCE_EMPLOYEE_ID) return -1
    if (b === FINANCE_EMPLOYEE_ID) return 1
    return a.localeCompare(b)
  })
}

async function wakeEmployee(employeeId) {
  const url = new URL(`http://127.0.0.1:${PORT}/employee/status`)
  url.searchParams.set('employeeId', employeeId)

  let lastNetworkError = null
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    let response
    try {
      response = await fetch(url, {
        headers: { 'x-land-view-bot-token': BOT_TOKEN },
        signal: AbortSignal.timeout(30000),
      })
    } catch (error) {
      lastNetworkError = error
      if (attempt < 4) {
        await sleep(2000)
        continue
      }
      throw error
    }

    const json = await response.json().catch(() => null)
    if (!response.ok || json?.ok === false) {
      const error = new Error(String(json?.error || `Employee status returned HTTP ${response.status}.`))
      error.status = response.status
      throw error
    }
    return json
  }

  throw lastNetworkError || new Error('Could not reach the local WhatsApp gateway.')
}

async function restorePairedEmployeeSessions() {
  if (!BOT_TOKEN) return
  await sleep(1500)
  const employeeIds = await pairedEmployeeIds()
  if (!employeeIds.length) {
    console.info('[WhatsApp startup] No non-admin paired employee sessions found to restore.')
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

  console.info(`[WhatsApp startup] Restore triggered for ${restored}/${employeeIds.length} paired non-admin employee session(s), one at a time.`)
}

restorePairedEmployeeSessions().catch((error) => {
  console.error(`[WhatsApp startup] Automatic employee restore failed: ${String(error?.message || error)}`)
})
