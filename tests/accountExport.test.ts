import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { redactHistoricalLocations } from '../app/utils/historicalMessages'

const source = readFileSync(resolve(process.cwd(), 'app/composables/useAccountSecurity.ts'), 'utf8')

describe('account export', () => {
  it('uses paged reads and includes the newer shared-space modules', () => {
    expect(source).toContain('.range(offset, offset + pageSize - 1)')
    for (const table of ['mood_checkins', 'daily_questions', 'daily_answers', 'shared_events', 'voice_capsules', 'streak_day_actions']) {
      expect(source).toContain(`fetchOptionalPaged('${table}'`)
    }
    expect(source).toContain("fetchPagedRpc('get_future_letters')")
  })

  it('excludes retired feature tables and redacts old location shares from both export paths', () => {
    expect(source).not.toMatch(/ai_saved_works|music_room_messages|listening_sessions|call_records/)
    expect(source.match(/redactHistoricalLocations\(/g)).toHaveLength(2)
  })

  it('replaces legacy location payloads and keeps ordinary history intact', () => {
    const rows = [
      { id: 'location', content: '::location:31.2:121.5:6::' },
      { id: 'legacy', content: { text: '::location:-12:34:2::', content: '::location:12:34:2::' } },
      { id: 'message', content: '今天去公园', media_path: 'photos/a.webp' },
    ]
    expect(redactHistoricalLocations(rows)).toEqual([
      { id: 'location', content: '[历史位置已隐藏]' },
      { id: 'legacy', content: '[历史位置已隐藏]' },
      rows[2],
    ])
    expect(rows[0]?.content).toBe('::location:31.2:121.5:6::')
  })

  it('exports posters and audio media paths', () => {
    expect(source).toContain('item.media_poster_path')
    expect(source).toContain('item.audio_path')
    expect(source).toContain('item.video_poster_path')
  })
})
