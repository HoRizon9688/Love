import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const config = readFileSync(resolve(process.cwd(), 'nuxt.config.ts'), 'utf8')
const envExample = readFileSync(resolve(process.cwd(), '.env.example'), 'utf8')
const readme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf8')

describe('public runtime config', () => {
  it('does not expose server credentials through Nuxt public config', () => {
    expect(config).not.toMatch(/turnUrl:|turnUrls:|turnUsername:|turnCredential:|zegoAppSign:/)
    expect(envExample).not.toMatch(/NUXT_PUBLIC_TURN_|NUXT_PUBLIC_ZEGO_APPSIGN/)
    expect(readme).not.toMatch(/NUXT_PUBLIC_TURN_|NUXT_PUBLIC_ZEGO_APPSIGN/)
  })

  it('omits retired integrations from public configuration and runtime dependencies', () => {
    const manifest = readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')
    expect(config).not.toMatch(/zego|amap|geolocation|push-notifications/i)
    expect(envExample).not.toMatch(/ZEGO|AMAP|PUSH_NOTIFICATIONS/)
    expect(manifest).not.toMatch(/"leaflet"|"three"|zego|geolocation|push-notifications/)
  })

  it('keeps local reminders and audio recording without Android call or GPS permissions', () => {
    const android = readFileSync(resolve(process.cwd(), 'android/app/src/main/AndroidManifest.xml'), 'utf8')
    const plugins = readFileSync(resolve(process.cwd(), 'android/capacitor.settings.gradle'), 'utf8')
    expect(android).not.toMatch(/ACCESS_(?:COARSE|FINE|BACKGROUND)_LOCATION|USE_FULL_SCREEN_INTENT|SYSTEM_ALERT_WINDOW|FOREGROUND_SERVICE|android\.permission\.CAMERA|CallForegroundService/)
    expect(android).toContain('android.permission.RECORD_AUDIO')
    expect(android).toContain('android.permission.POST_NOTIFICATIONS')
    expect(plugins).toContain('capacitor-local-notifications')
    expect(plugins).not.toMatch(/geolocation|push-notifications/)
  })
})
