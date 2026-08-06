import { readFileSync } from 'node:fs'

const runtimePath = process.argv[2] || '/app/dist/services/voice_router.js'
const runtime = readFileSync(runtimePath, 'utf8')

const forbidden = [
  'no_available_voip_slot',
  'outbound_slot',
  'account.slots',
  'deviceSlotIds',
  'hasSlotCapacity',
  'isSlotAvailableForOutbound',
]
const required = [
  'outbound_line',
  'maxConcurrentCalls',
  'line_capacity_exhausted',
  'zapo_line_unavailable',
]

const staleTokens = forbidden.filter(token => runtime.includes(token))
const missingTokens = required.filter(token => !runtime.includes(token))

if (staleTokens.length || missingTokens.length) {
  console.error('VoIP slotless runtime validation failed', {
    runtimePath,
    staleTokens,
    missingTokens,
  })
  process.exit(1)
}

console.log('VoIP slotless runtime validated', { runtimePath })
