const { app, BrowserWindow, shell } = require('electron')
const path = require('node:path')

function webUrl(value) {
  const url = URL.canParse(value) ? new URL(value) : null
  return url && ['http:', 'https:'].includes(url.protocol) ? url : null
}

const appUrl = webUrl(process.env.LOVE_HOME_DESKTOP_URL || 'http://127.0.0.1:3200/')
const supabaseOrigin = webUrl(process.env.NUXT_PUBLIC_SUPABASE_URL)?.origin
if (!appUrl) throw new Error('LOVE_HOME_DESKTOP_URL 必须为 HTTP 或 HTTPS 地址')

if (!app.requestSingleInstanceLock()) app.quit()

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f7edf9',
    icon: path.join(__dirname, '..', 'public', 'desktop-icon.png'),
    title: 'Love小家',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.once('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(({ url }) => {
    const target = webUrl(url)
    if (target?.origin === appUrl.origin) return { action: 'allow' }
    if (target) void shell.openExternal(target.href)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const target = webUrl(url)
    if (!target || (target.origin !== appUrl.origin && target.origin !== supabaseOrigin)) {
      event.preventDefault()
      if (target) void shell.openExternal(target.href)
    }
  })
  const appPermissions = new Set(['notifications', 'fullscreen', 'clipboard-sanitized-write'])
  window.webContents.session.setPermissionCheckHandler((_contents, permission, origin, details) => {
    if (webUrl(origin)?.origin !== appUrl.origin) return false
    return permission === 'media' ? details.mediaType === 'audio' : appPermissions.has(permission)
  })
  window.webContents.session.setPermissionRequestHandler((_contents, permission, callback, details) => {
    const sameOrigin = webUrl(details.requestingUrl)?.origin === appUrl.origin
    const micOnly = details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'audio'
    callback(sameOrigin && (permission === 'media' ? micOnly : appPermissions.has(permission)))
  })
  window.loadURL(appUrl.href)
}

app.whenReady().then(createWindow)
app.on('second-instance', () => {
  const window = BrowserWindow.getAllWindows()[0]
  if (window) { if (window.isMinimized()) window.restore(); window.focus() }
})
app.on('window-all-closed', () => app.quit())
