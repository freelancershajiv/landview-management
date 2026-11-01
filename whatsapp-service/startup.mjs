const PORT = Number(process.env.PORT || 10000)
const BOT_TOKEN = String(process.env.BOT_API_TOKEN || '').trim()
const SESSION_LIST_URL = String(
  process.env.WHATSAPP_SESSION_LIST_URL ||
  'https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-whatsapp-session-list'
).trim()

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
  return [...new Set(rows.map((row) => String(row?.employeeId || '').trim().toUpperCase()).filter(Boolean))]
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
    throw new Error(String(json?.error || `Employee status returned HTTP ${response.status}.`))
  }
  return json
}

async function restorePairedEmployeeSessions() {
  if (!BOT_TOKEN) return
  await sleep(750)
  const employeeIds = await pairedEmployeeIds()
  if (!employeeIds.length) {
    console.info('[WhatsApp startup] No paired employee sessions found to restore.')
    return
  }

  let restored = 0
  for (let index = 0; index < employeeIds.length; index += 3) {
    const batch = employeeIds.slice(index, index + 3)
    const results = await Promise.allSettled(batch.map((employeeId) => wakeEmployee(employeeId)))
    results.forEach((result, resultIndex) => {
      const employeeId = batch[resultIndex]
      if (result.status === 'fulfilled') {
        restored += 1
        console.info(`[WhatsApp startup] Restore started for ${employeeId}.`)
      } else {
        console.error(`[WhatsApp startup] Could not restore ${employeeId}: ${String(result.reason?.message || result.reason)}`)
      }
    })
    if (index + 3 < employeeIds.length) await sleep(250)
  }
  console.info(`[WhatsApp startup] Restore triggered for ${restored}/${employeeIds.length} paired employee session(s).`)
}

restorePairedEmployeeSessions().catch((error) => {
  console.error(`[WhatsApp startup] Automatic employee restore failed: ${String(error?.message || error)}`)
})
