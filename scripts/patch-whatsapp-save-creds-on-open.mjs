import fs from 'node:fs'

const file = 'whatsapp-service/server.mjs'
let source = fs.readFileSync(file, 'utf8')
const before = `        if (connection === 'open') {\n          state.connection = 'open'\n          state.openedAt = Date.now()\n          state.qrDataUrl = ''\n          state.lastError = ''\n          logger.info({ sessionId, user: wa.user?.id }, \`${'${label}'} connected\`)\n`
const after = `        if (connection === 'open') {\n          state.connection = 'open'\n          state.openedAt = Date.now()\n          state.qrDataUrl = ''\n          state.lastError = ''\n          try {\n            await saveCreds()\n          } catch (error) {\n            state.lastError = String(error?.message || error)\n            logger.error({ sessionId, err: state.lastError }, \`${'${label}'} credential save on open failed\`)\n          }\n          logger.info({ sessionId, user: wa.user?.id }, \`${'${label}'} connected\`)\n`
if (source.includes('credential save on open failed')) {
  console.log('Already patched.')
  process.exit(0)
}
if (!source.includes(before)) throw new Error('Target connection-open block not found.')
source = source.replace(before, after)
fs.writeFileSync(file, source)
console.log('Patched WhatsApp auth persistence on connection open.')
