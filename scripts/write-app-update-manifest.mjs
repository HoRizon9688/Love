import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const manifestPath = path.join(root, 'public', 'app-update.json')
const previous = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  : {}

const notes = String(process.env.APP_UPDATE_NOTES || '')
  .split('||')
  .map(value => value.trim())
  .filter(Boolean)

const apkFilename = 'Love小家-latest.apk'
const baseUrl = process.env.APP_UPDATE_BASE_URL ? new URL('/', process.env.APP_UPDATE_BASE_URL) : null
if (baseUrl && (baseUrl.protocol !== 'https:' || baseUrl.username || baseUrl.password)) {
  throw new Error('APP_UPDATE_BASE_URL must be an HTTPS URL without credentials')
}
const hasApk = fs.existsSync(path.join(root, 'public', 'downloads', apkFilename))

const manifest = {
  version: packageJson.version,
  buildId: process.env.NUXT_PUBLIC_APP_BUILD || process.env.GITHUB_SHA || `local-${packageJson.version}`,
  title: previous.title || 'Love小家有新版本了',
  notes: notes.length ? notes : Array.isArray(previous.notes) ? previous.notes : [],
  apkUrl: baseUrl && hasApk ? new URL(`downloads/${encodeURIComponent(apkFilename)}`, baseUrl).href : '',
  desktopUrl: previous.desktopUrl || '',
  webUrl: baseUrl?.href || '',
  publishedAt: process.env.APP_UPDATE_PUBLISHED_AT || new Date().toISOString(),
  mandatory: previous.mandatory === true,
}

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Wrote ${path.relative(root, manifestPath)} for ${manifest.version} (${manifest.buildId})`)
