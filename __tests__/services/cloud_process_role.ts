import {
  brokerRunsVideoConsumers,
  resolveCloudProcessRole,
  resolveVideoWorkerMode,
} from '../../src/services/providers/cloud_process_role'

describe('cloud process role', () => {
  test('keeps the legacy all-in-one role as default', () => {
    expect(resolveCloudProcessRole(undefined)).toBe('all')
  })

  test.each(['web', 'broker', 'worker', 'video'] as const)('accepts the isolated %s role', (role) => {
    expect(resolveCloudProcessRole(` ${role.toUpperCase()} `)).toBe(role)
  })

  test('keeps video consumers in the broker by default for backward compatibility', () => {
    expect(resolveVideoWorkerMode(undefined)).toBe('broker')
    expect(brokerRunsVideoConsumers(resolveVideoWorkerMode(undefined))).toBe(true)
  })

  test('disables broker video consumers only in explicit dedicated mode', () => {
    expect(resolveVideoWorkerMode(' DEDICATED ')).toBe('dedicated')
    expect(brokerRunsVideoConsumers(resolveVideoWorkerMode('dedicated'))).toBe(false)
  })

  test('rejects unknown video worker modes', () => {
    expect(() => resolveVideoWorkerMode('automatic')).toThrow('Invalid UNOAPI_VIDEO_WORKER_MODE')
  })

  test('rejects unknown roles before importing application processes', () => {
    expect(() => resolveCloudProcessRole('database')).toThrow('Invalid UNOAPI_PROCESS_ROLE')
  })
})
