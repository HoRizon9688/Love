import { daysUntil, useAnniversaries } from './useAnniversaries'
import { useMediaUploadQueue, type UploadJob } from './useMediaUploadQueue'
import { useActivityFeed, type ActivityKind, type ActivityTarget } from './useActivityFeed'
import type { Component } from 'vue'

export type NotificationType = ActivityKind | 'upload'
export type NotificationTarget = ActivityTarget
export type AppNotification = {
  id: string
  type: NotificationType
  title: string
  body: string
  createdAt: string
  target: NotificationTarget
  read: boolean
  icon?: Component
}

const readIds = ref<string[]>([])
const initialized = ref(false)

function readStorageKey(coupleId?: string, userId?: string) {
  return `couple-space-notification-read-v1:${coupleId || userId || 'guest'}`
}

function loadReadIds(coupleId?: string, userId?: string) {
  if (!import.meta.client) return
  try {
    const raw = JSON.parse(localStorage.getItem(readStorageKey(coupleId, userId)) || '[]')
    readIds.value = Array.isArray(raw) ? raw.map(String).slice(-500) : []
  } catch { readIds.value = [] }
}

function persistReadIds(coupleId?: string, userId?: string) {
  if (!import.meta.client) return
  localStorage.setItem(readStorageKey(coupleId, userId), JSON.stringify(readIds.value.slice(-500)))
}

function isRead(id: string) { return readIds.value.includes(id) }
function markIds(ids: string[], coupleId?: string, userId?: string) {
  const next = new Set(readIds.value)
  ids.forEach(id => next.add(id))
  readIds.value = [...next].slice(-500)
  persistReadIds(coupleId, userId)
}

function shortText(value: string, fallback: string) {
  const text = String(value || '').trim()
  return text ? (text.length > 72 ? `${text.slice(0, 72)}…` : text) : fallback
}

function uploadBody(job: UploadJob) {
  if (job.status === 'failed') return `${job.name} 上传失败，点击查看。`
  if (job.status === 'completed') return `${job.name} 已完成上传。`
  return `${job.name} 正在上传，当前进度 ${job.progress}%。`
}

export function useNotificationCenter() {
  const { profile } = useCoupleAuth()
  const { anniversaries } = useAnniversaries()
  const { jobs } = useMediaUploadQueue()
  const activity = useActivityFeed()
  let startedScope = ''

  if (import.meta.client && !initialized.value) {
    initialized.value = true
  }

  function currentScope() {
    return {
      coupleId: profile.value?.coupleId || '',
      userId: profile.value?.id || '',
    }
  }

  watch(() => `${profile.value?.coupleId || ''}:${profile.value?.id || ''}`, scopeKey => {
    const coupleId = profile.value?.coupleId || ''
    if (!coupleId) {
      startedScope = ''
      readIds.value = []
      void activity.stop()
      return
    }
    if (startedScope === scopeKey) return
    startedScope = scopeKey
    const scope = currentScope()
    loadReadIds(scope.coupleId, scope.userId)
    void activity.start()
  }, { immediate: true })

  const notifications = computed<AppNotification[]>(() => {
    const result: AppNotification[] = []
    const ownId = profile.value?.id
    const activityEntityIds = new Set<string>()

    activity.events.value
      .filter(event => event.actorId !== ownId)
      .forEach(event => {
        if (event.entityId) activityEntityIds.add(`${event.kind}:${event.entityId}`)
        result.push({
          id: `activity:${event.id}`,
          type: event.kind,
          title: event.title,
          body: shortText(event.body, '点击查看详情'),
          createdAt: event.createdAt,
          target: event.target,
          read: isRead(`activity:${event.id}`),
        })
      })

    anniversaries.value
      .filter(event => daysUntil(event) <= 30)
      .slice(0, 3)
      .filter(event => !activityEntityIds.has(`anniversary:${event.id}`))
      .forEach(event => {
        const id = `anniversary:${event.id}:${new Date().getFullYear()}`
        result.push({ id, type: 'anniversary', title: event.title, body: daysUntil(event) === 0 ? '就是今天，记得给 TA 一个拥抱。' : `还有 ${daysUntil(event)} 天，一起期待这个特别的日子。`, createdAt: new Date().toISOString(), target: '纪念日', read: isRead(id) })
      })

    jobs.value.filter(job => ['failed', 'uploading', 'retrying', 'paused'].includes(job.status)).slice(-6).reverse().forEach(job => {
      const id = `upload:${job.id}`
      const target = job.operation?.kind === 'voice-capsule' ? '声音胶囊' : job.operation?.kind === 'memory' ? '时光' : '相册'
      result.push({ id, type: 'upload', title: job.status === 'failed' ? '上传失败' : '上传进行中', body: uploadBody(job), createdAt: job.createdAt, target, read: isRead(id) })
    })

    return result.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  })
  const unreadCount = computed(() => notifications.value.filter(item => !item.read).length)
  function markRead(id: string) {
    const scope = currentScope()
    markIds([id], scope.coupleId, scope.userId)
  }
  function markAllRead() {
    const scope = currentScope()
    markIds(notifications.value.map(item => item.id), scope.coupleId, scope.userId)
  }
  function clearReadHistory() {
    const scope = currentScope()
    readIds.value = []
    persistReadIds(scope.coupleId, scope.userId)
  }

  return { notifications, unreadCount, loading: activity.loading, refresh: activity.load, markRead, markAllRead, clearReadHistory }
}
