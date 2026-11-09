<script setup lang="ts">
import { ChevronLeft, ChevronRight, Flame } from '@lucide/vue'

const props = defineProps<{ today: string; revision: number }>()
const { history, loading, error, load } = useStreakHistory()
const { members } = useAccountManagement()
const month = ref(props.today.slice(0, 7))
const currentMonth = computed(() => props.today.slice(0, 7))
const milestoneOptions = [3, 7, 14, 30, 100]
const monthTitle = computed(() => {
  const [year, value] = month.value.split('-')
  return `${year} 年 ${Number(value)} 月`
})
const dayMap = computed(() => new Map(history.value?.days.map(day => [day.date, day])))
const calendarCells = computed(() => {
  const first = new Date(`${month.value}-01T00:00:00Z`)
  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  return [
    ...Array<null>(first.getUTCDay()).fill(null),
    ...Array.from({ length: count }, (_, index) => `${month.value}-${String(index + 1).padStart(2, '0')}`),
  ]
})
const memberName = (id: string | null) => members.value.find(member => member.id === id)?.displayName || '成员'

function shiftMonth(offset: number) {
  const date = new Date(`${month.value}-01T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + offset)
  month.value = date.toISOString().slice(0, 7)
}
function dayLabel(date: string) {
  const day = dayMap.value.get(date)
  const result = day?.completed ? '双方完成' : day?.count ? '一人完成' : '未完成'
  return `${date} · ${result}${day?.protection_used ? ' · 已使用保护卡' : ''}`
}

watch(currentMonth, (value, previous) => {
  if (month.value === previous) month.value = value
})
onMounted(() => watch([month, () => props.revision], ([value]) => { void load(value) }, { immediate: true }))
</script>

<template>
  <section class="streak-history" aria-labelledby="streak-history-heading">
    <header class="history-header">
      <h3 id="streak-history-heading">打卡历史</h3>
      <div class="history-month">
        <button type="button" aria-label="上个月" @click="shiftMonth(-1)"><ChevronLeft :size="18" /></button>
        <strong aria-live="polite">{{ monthTitle }}</strong>
        <button type="button" aria-label="下个月" :disabled="month >= currentMonth" @click="shiftMonth(1)"><ChevronRight :size="18" /></button>
      </div>
    </header>
    <p v-if="loading" role="status">正在读取打卡历史…</p>
    <div v-else-if="error" role="alert">{{ error }} <button type="button" @click="load(month)">重试</button></div>
    <template v-else-if="history">
      <div class="week-labels" aria-hidden="true"><span v-for="day in '日一二三四五六'" :key="day">{{ day }}</span></div>
      <div class="heatmap">
        <div
          v-for="(date, index) in calendarCells" :key="date || `empty-${index}`" class="heat-cell"
          :class="{ empty: !date, level1: date && dayMap.get(date)?.count && !dayMap.get(date)?.completed, level2: date && dayMap.get(date)?.completed }"
          :title="date ? dayLabel(date) : undefined"
        >
          <template v-if="date">
            <span aria-hidden="true">{{ Number(date.slice(-2)) }}<sup v-if="dayMap.get(date)?.protection_used">★</sup></span>
            <span class="screen-reader">{{ dayLabel(date) }}</span>
          </template>
        </div>
      </div>
      <div class="history-legend">
        <span><i />未完成</span><span><i class="level1" />一人完成</span><span><i class="level2" />双方完成</span><span>★ 使用保护卡</span>
      </div>
      <div class="milestone-row" aria-label="连续打卡里程碑">
        <span v-for="days in milestoneOptions" :key="days" :class="{ done: history.milestones.some(item => item.days === days) }">
          <Flame :size="14" aria-hidden="true" /> {{ days }} 天
        </span>
      </div>
      <ul v-if="history.events.length" class="history-events" aria-label="本月打卡记录">
        <li v-for="(event, index) in history.events" :key="`${event.created_at}-${index}`">
          <strong>{{ memberName(event.actor_id) }} · 打卡</strong>
          <span>{{ event.date }}<template v-if="event.note"> · {{ event.note }}</template></span>
        </li>
      </ul>
      <p v-else>这个月还没有打卡记录。</p>
    </template>
  </section>
</template>

<style scoped>
.streak-history { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--line); color: var(--ink); }
.history-header, .history-month, .history-legend, .milestone-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.history-header { justify-content: space-between; margin-bottom: 12px; }
.history-header h3 { margin: 0; }
.history-month button { display: grid; place-items: center; min-width: 44px; min-height: 44px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-solid); color: var(--theme-accent); cursor: pointer; }
.history-month button:disabled { opacity: .5; cursor: default; }
.week-labels, .heatmap { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; text-align: center; }
.week-labels { margin-bottom: 5px; color: var(--muted); font-size: 12px; }
.heat-cell { display: grid; place-items: center; min-height: 34px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface-solid); font-size: 12px; }
.heat-cell.empty { visibility: hidden; }
.history-legend, .milestone-row { margin-top: 10px; font-size: 12px; }
.history-legend span, .milestone-row span { display: flex; align-items: center; gap: 4px; }
.history-legend i { width: 12px; height: 12px; border: 1px solid var(--line); border-radius: 3px; background: var(--surface-solid); }
.heat-cell.level1, .history-legend i.level1 { background: var(--theme-soft); color: var(--theme-accent); }
.heat-cell.level2, .history-legend i.level2 { background: var(--theme-accent); color: white; }
.milestone-row span { padding: 5px 8px; border: 1px solid var(--line); border-radius: 8px; color: var(--muted); }
.milestone-row span.done { border-color: var(--theme-accent); color: var(--theme-accent); background: var(--theme-soft); }
.history-events { display: grid; gap: 6px; max-height: 240px; overflow: auto; margin: 12px 0 0; padding: 0; list-style: none; }
.history-events li { display: flex; justify-content: space-between; gap: 10px; padding: 8px; border-bottom: 1px solid var(--line); font-size: 12px; }
.screen-reader { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>
