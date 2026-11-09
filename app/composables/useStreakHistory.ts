export type StreakHistory = {
  days: { date: string; count: number; completed: boolean; protection_used: boolean }[]
  events: { date: string; actor_id: string | null; note: string | null; created_at: string }[]
  milestones: { days: number; achieved_at: string }[]
}

export function useStreakHistory() {
  const { $supabase } = useNuxtApp()
  const history = ref<StreakHistory>()
  const loading = ref(false)
  const error = ref('')
  let version = 0

  async function load(month: string) {
    if (!$supabase) return
    const requested = ++version
    loading.value = true
    error.value = ''
    const response = await $supabase.rpc('get_couple_streak_history', { p_month: `${month}-01` })
    if (requested !== version) return
    history.value = response.error ? undefined : response.data as StreakHistory
    if (response.error) error.value = '打卡历史暂时无法读取，请重试。'
    loading.value = false
  }

  onScopeDispose(() => { version += 1 })
  return { history, loading, error, load }
}
