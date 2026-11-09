<script setup lang="ts">
import { Flame } from '@lucide/vue'

type StreakStatus = {
  today: string
  today_action_count: number
  today_completed: boolean
  today_actor_ids: string[]
  streak: { current_days: number; longest_days: number; protection_count: number }
}

const { $supabase } = useNuxtApp()
const { profile, demoMode } = useCoupleAuth()
const status = ref<StreakStatus>()
const error = ref('')
const submitError = ref('')
const saving = ref(false)
const showHistory = ref(false)
const revision = ref(0)
const ownCheckIn = computed(() => status.value?.today_actor_ids.includes(profile.value?.id || '') ?? false)
const businessDate = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
})
let readVersion = 0
let scopeVersion = 0
let request: { date: string; id: string } | undefined

async function refresh() {
  if (!$supabase || !profile.value?.coupleId || demoMode.value) return
  const version = ++readVersion
  const response = await $supabase.rpc('get_daily_couple_check_in')
  if (version !== readVersion) return
  if (response.error) {
    error.value = response.error.code === 'PGRST202'
      ? '当前空间的数据库尚未启用新版打卡。'
      : '暂时无法读取打卡状态，请重试。'
    return
  }
  const next = response.data as StreakStatus
  if (request && request.date !== next.today) request = undefined
  status.value = next
  error.value = ''
  revision.value += 1
}

async function checkIn() {
  if (!$supabase || !status.value || error.value || ownCheckIn.value || saving.value) return
  const scope = scopeVersion
  const date = status.value.today
  saving.value = true
  submitError.value = ''
  try {
    request ??= { date, id: crypto.randomUUID() }
    const response = await $supabase.rpc('check_in_couple', { p_request_id: request.id, p_expected_date: date })
    if (scope !== scopeVersion) return
    await refresh()
    if (scope !== scopeVersion) return
    if (status.value?.today !== date) {
      submitError.value = '已进入新的一天，请确认日期后打卡。'
    } else if (response.error && !ownCheckIn.value) {
      submitError.value = '打卡暂未确认，请重试。'
    }
  } catch {
    if (scope === scopeVersion) submitError.value = '打卡暂未确认，请重试。'
  } finally {
    if (scope === scopeVersion) saving.value = false
  }
}

onMounted(() => {
  watch([() => profile.value?.coupleId, () => profile.value?.id, demoMode], ([coupleId, userId, demo], _, onCleanup) => {
    scopeVersion += 1
    request = undefined
    status.value = undefined
    error.value = ''
    submitError.value = ''
    saving.value = false
    showHistory.value = false
    if (!$supabase || !coupleId || !userId || demo) return

    const reload = () => { void refresh() }
    const resume = () => { if (!document.hidden) reload() }
    let observedDate = businessDate.format(new Date())
    const clock = window.setInterval(() => {
      const date = businessDate.format(new Date())
      if (date === observedDate) return
      observedDate = date
      reload()
    }, 15000)
    const channel = $supabase.channel(`streak-status:${coupleId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'streak_day_actions', filter: `couple_id=eq.${coupleId}`,
      }, reload)
      .subscribe(result => { if (result === 'SUBSCRIBED') reload() })
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('online', reload)
    reload()
    onCleanup(() => {
      readVersion += 1
      scopeVersion += 1
      window.clearInterval(clock)
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('online', reload)
      void $supabase.removeChannel(channel)
    })
  }, { immediate: true })
})
</script>

<template>
  <section class="panel check-in-card" aria-labelledby="check-in-heading">
    <header>
      <div>
        <p class="eyebrow">DAILY CHECK-IN</p>
        <h2 id="check-in-heading"><Flame :size="22" aria-hidden="true" /> 每日打卡</h2>
        <p class="check-in-date">{{ status?.today }} · 北京时间 00:00 换日</p>
      </div>
      <button v-if="status" class="check-in-action" type="button" :disabled="ownCheckIn || saving || Boolean(error)" @click="checkIn">
        {{ saving ? '打卡中…' : ownCheckIn ? '你已打卡' : '今日打卡' }}
      </button>
    </header>
    <p v-if="demoMode">连接真实情侣空间后即可打卡。</p>
    <p v-else-if="!status && !error" role="status">正在读取打卡状态…</p>
    <template v-if="status">
      <div class="check-in-stats" aria-live="polite">
        <strong>{{ status.today_action_count }}/2 人已打卡</strong>
        <span>当前连续 {{ status.streak.current_days }} 天</span>
        <span>历史最高 {{ status.streak.longest_days }} 天</span>
        <span>保护卡 {{ status.streak.protection_count }}/3</span>
      </div>
      <p>{{ status.today_completed ? '今天你们都完成了打卡。' : '两个人都打卡后，当天计入连续记录。' }}</p>
      <p class="protection-rule">每连续完成 7 天获得一张保护卡。漏一天后，下一次双人完成可自动消耗一张续上。</p>
      <button type="button" class="check-in-history-button" :aria-expanded="showHistory" @click="showHistory = !showHistory">
        {{ showHistory ? '收起打卡历史' : '查看打卡历史' }}
      </button>
      <StreakHistoryPanel v-if="showHistory" :today="status.today" :revision="revision" />
    </template>
    <p v-if="submitError" role="alert">{{ submitError }}</p>
    <div v-if="error" role="alert">{{ error }} <button type="button" class="check-in-history-button" @click="refresh">重新加载</button></div>
  </section>
</template>

<style scoped>
.check-in-card { margin: 16px 0; padding: clamp(16px, 3vw, 24px); color: var(--ink); }
.check-in-card > header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
.check-in-card h2 { display: flex; align-items: center; gap: 7px; margin: 0; font-size: 20px; }
.check-in-card h2 svg { color: var(--theme-accent); }
.check-in-card p:not(.eyebrow) { color: var(--muted); font-size: 13px; }
.check-in-date { margin: 7px 0 0; }
.check-in-action, .check-in-history-button { min-height: 44px; padding: 8px 14px; border: 1px solid var(--line); border-radius: 12px; font-weight: 750; cursor: pointer; }
.check-in-action { background: var(--theme-accent); color: white; }
.check-in-action:disabled { background: var(--theme-soft); color: var(--theme-accent); cursor: default; }
.check-in-history-button { background: var(--surface-solid); color: var(--theme-accent); }
.check-in-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(117px, 1fr)); gap: 8px; margin-top: 16px; }
.check-in-stats > * { padding: 10px; border-radius: 10px; background: var(--theme-soft); font-size: 13px; }
.protection-rule { margin-bottom: 14px; }
</style>
