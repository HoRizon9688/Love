// https://nuxt.com/docs/api/configuration/nuxt-config
import packageJson from './package.json'

export default defineNuxtConfig({
  app: {
    head: {
      viewport: 'width=device-width, initial-scale=1, viewport-fit=cover',
      title: 'Love小家 · CoupleSpace',
      meta: [
        { name: 'referrer', content: 'no-referrer' },
        { name: 'theme-color', content: '#f7edf9' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        { name: 'apple-mobile-web-app-title', content: 'Love小家' },
      ],
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', href: '/desktop-icon.png' },
      ],
    },
  },
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  vite: {
    resolve: {
      dedupe: ['vue'],
    },
    optimizeDeps: {
      include: [
        '@capacitor/core',
        '@capacitor/local-notifications',
        '@capacitor/splash-screen',
        '@capacitor/status-bar',
          '@lucide/vue',
        'gsap',
        'gsap/ScrollTrigger',
        'gsap/Flip',
        'gsap/Observer',
        'gsap/ScrollToPlugin',
        'gsap/SplitText',
        '@supabase/supabase-js',
        '@uppy/core',
        '@uppy/golden-retriever',
        'tus-js-client',
        '@vue/devtools-core',
        '@vue/devtools-kit',
      ],
    },
  },
  runtimeConfig: {
    public: {
      supabaseUrl: process.env.NUXT_PUBLIC_SUPABASE_URL || '',
      supabaseAnonKey: process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY || '',
      mediaStorageProvider: process.env.NUXT_PUBLIC_MEDIA_STORAGE_PROVIDER || 'supabase',
      mediaWorkerUrl: process.env.NUXT_PUBLIC_MEDIA_WORKER_URL || '',
      appVersion: process.env.NUXT_PUBLIC_APP_VERSION || packageJson.version,
      appBuild: process.env.NUXT_PUBLIC_APP_BUILD || 'local',
      updateManifestUrl: process.env.NUXT_PUBLIC_UPDATE_MANIFEST_URL || '/app-update.json',
    },
  },
  nitro: {
    prerender: {
      failOnError: false,
    },
  },
  routeRules: {
    '/**': { headers: { 'cache-control': 'no-store, max-age=0' } },
  },
})
