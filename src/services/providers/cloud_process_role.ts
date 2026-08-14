export const CLOUD_PROCESS_ROLES = ['all', 'web', 'broker', 'worker', 'video'] as const
export type CloudProcessRole = (typeof CLOUD_PROCESS_ROLES)[number]

export const VIDEO_WORKER_MODES = ['broker', 'dedicated'] as const
export type VideoWorkerMode = (typeof VIDEO_WORKER_MODES)[number]

export const resolveCloudProcessRole = (value: unknown): CloudProcessRole => {
  const role = `${value || 'all'}`.trim().toLowerCase()
  if (CLOUD_PROCESS_ROLES.includes(role as CloudProcessRole)) return role as CloudProcessRole
  throw new Error(`Invalid UNOAPI_PROCESS_ROLE: ${role}`)
}

export const resolveVideoWorkerMode = (value: unknown): VideoWorkerMode => {
  const mode = `${value || 'broker'}`.trim().toLowerCase()
  if (VIDEO_WORKER_MODES.includes(mode as VideoWorkerMode)) return mode as VideoWorkerMode
  throw new Error(`Invalid UNOAPI_VIDEO_WORKER_MODE: ${mode}`)
}

export const brokerRunsVideoConsumers = (mode: VideoWorkerMode) => mode === 'broker'
