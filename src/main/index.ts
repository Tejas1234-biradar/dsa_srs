import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { initDatabase } from './db/database'
import { registerProblemsHandlers } from './ipc/problems'
import { registerReviewsHandlers } from './ipc/reviews'
import { registerTodayHandlers } from './ipc/today'
import { registerLeetCodeHandlers } from './ipc/leetcode'
import { registerSettingsHandlers } from './ipc/settings'

// ── Dev / prod helper ─────────────────────────────────────────────────────────
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// Disable GPU hardware acceleration — prevents GPU process crash (error_code=1002)
// on Linux systems without compatible GPU drivers. Falls back to software rendering.
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('no-sandbox')

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f1117',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0f1117',
      symbolColor: '#94a3b8',
      height: 36,
    },
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: true,
  })

  // Open external links in the system browser, not Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  // Load renderer
  if (isDev && process.env['VITE_DEV_SERVER_URL']) {
    win.loadURL(process.env['VITE_DEV_SERVER_URL'])
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Show window immediately — don't wait for ready-to-show so a renderer
  // error doesn't leave the window permanently invisible.
  win.once('ready-to-show', () => win.focus())

  return win
}

app.whenReady().then(async () => {
  // Init DB first — everything else depends on it
  initDatabase()

  // Register all IPC handlers
  registerSettingsHandlers(ipcMain)
  registerProblemsHandlers(ipcMain)
  registerReviewsHandlers(ipcMain)
  registerTodayHandlers(ipcMain)
  registerLeetCodeHandlers(ipcMain)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
