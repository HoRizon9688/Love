import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'app/app.vue'), 'utf8')

describe('mobile navigation', () => {
  it('keeps every page entry visible in the mobile navigation bar', () => {
    expect(source).toContain('v-for="item in navItems"')
    expect(source).toContain('grid-template-columns: repeat(6, minmax(0, 1fr))')
    expect(source).not.toContain('mobile-more-menu')
    expect(source).not.toContain('MoreHorizontal')
  })

  it('keeps removed features out of navigation and the application shell', () => {
    expect(source).not.toMatch(/label: '(悄悄话|心动AI|一起听)'/)
    expect(source).not.toMatch(/LazyChatPanel|HeartAiView|ListenTogetherView/)
  })
})
