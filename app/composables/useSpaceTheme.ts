export const spaceThemes = [
  { id: 'apricot', name: '杏桃晨光', description: '蜜桃渐变，轻柔通透', swatches: ['#fff3e9', '#f4c3ad', '#9f4534'] },
  { id: 'caramel', name: '焦糖手记', description: '奶油纸感，复古沉静', swatches: ['#fbf2df', '#e6cc9f', '#795020'] },
  { id: 'rose', name: '玫瑰晚霞', description: '暖玫瑰色，柔和深邃', swatches: ['#fcecf0', '#eab4bf', '#943e53'] },
] as const

type SpaceThemeId = (typeof spaceThemes)[number]['id']

export function useSpaceTheme() {
  const preference = useCookie<string | null>('couple-space-theme', {
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  })
  const theme = useState<SpaceThemeId>('space-theme', () =>
    spaceThemes.find(option => option.id === preference.value)?.id ?? spaceThemes[0].id,
  )
  const selectedTheme = computed(() => spaceThemes.find(option => option.id === theme.value) ?? spaceThemes[0])

  function setTheme(id: SpaceThemeId) {
    theme.value = id
    preference.value = id
  }

  return { theme, selectedTheme, setTheme }
}
