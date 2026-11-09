export type PersistedUploadJob = {
  id: string
  name: string
  size: number
  progress: number
  status: 'queued' | 'uploading' | 'retrying' | 'paused' | 'completed' | 'failed'
  attempts: number
  error: string
  createdAt: string
  operation?: Record<string, unknown>
  uppyFileId?: string
  restored?: boolean
}

export const uploadQueueStorageKey = 'couple-space-upload-queue-v2'

function restoreOperation(operation: Record<string, unknown> | undefined, name: string) {
  if (operation?.kind !== 'message') return operation
  // The old queue also marked voice capsules as message uploads.
  return operation.mediaType === 'audio' && name.startsWith('声音胶囊 · ')
    ? { ...operation, kind: 'voice-capsule' }
    : null
}

export function restorePersistedJobs(raw: string | null): PersistedUploadJob[] {
  if (!raw) return []
  try {
    const value = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    const jobs: PersistedUploadJob[] = []
    for (const item of value) {
      if (!item || typeof item.id !== 'string') continue
      const operation = restoreOperation(item.operation, String(item.name || ''))
      if (operation === null) continue
      jobs.push({
        ...item,
        operation,
        status: item.status === 'failed' ? 'failed' : 'paused',
        restored: Boolean(item.uppyFileId),
        error: item.status === 'failed' ? String(item.error || '上传失败') : '正在检查本地恢复文件…',
      })
    }
    return jobs
  } catch {
    return []
  }
}

export function restoredJobPatch(file: { id: string; name?: string; size?: number; isGhost?: boolean; meta?: Record<string, unknown> }) {
  const jobId = typeof file.meta?.jobId === 'string' ? file.meta.jobId : ''
  const name = String(file.meta?.displayName || file.name || '待恢复文件')
  const operation = restoreOperation(file.meta?.operation as Record<string, unknown> | undefined, name)
  if (!jobId || operation === null) return null
  return {
    id: jobId,
    name,
    size: Number(file.size || file.meta?.size || 0),
    progress: 0,
    status: 'paused' as const,
    attempts: 0,
    error: file.isGhost ? '浏览器未能恢复文件内容，请重新选择文件' : '文件已从本地恢复，等待继续上传',
    createdAt: new Date().toISOString(),
    operation,
    uppyFileId: file.id,
    restored: true,
  }
}
