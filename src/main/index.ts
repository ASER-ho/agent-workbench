import { app, shell, BrowserWindow } from 'electron'
import { mkdirSync } from 'fs'
import { isAbsolute, join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerAllIpcHandlers } from './ipc'
import { configureWorkspacePaths } from './utils/paths'
import { isAllowedExternalUrl } from './utils/navigation-security'

let mainWindow: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'Agent Workbench',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  win.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })

  win.webContents.setWindowOpenHandler((details) => {
    const externalUrl = details.url
    if (isAllowedExternalUrl(externalUrl)) {
      void shell.openExternal(externalUrl)
    }
    return { action: 'deny' }
  })

  // Load renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.setName('Agent Workbench')
const e2eFixtureRoot = process.env['AGENT_WORKBENCH_FIXTURE_ROOT']?.trim()
if (process.env['AGENT_WORKBENCH_E2E'] === '1' && e2eFixtureRoot && isAbsolute(e2eFixtureRoot)) {
  app.setPath('userData', join(resolve(e2eFixtureRoot), 'user-data'))
}

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    const userDataRoot = app.getPath('userData')
    const workspaceRoot = join(userDataRoot, 'workspace')
    const backupDir = join(userDataRoot, 'backups')

    mkdirSync(workspaceRoot, { recursive: true })
    mkdirSync(backupDir, { recursive: true })
    configureWorkspacePaths({
      workspaceRoot,
      settingsGlobalPath: join(userDataRoot, 'settings.json'),
      projectRoot: app.getAppPath(),
      backupDir,
      shareOutputDir: app.getPath('downloads')
    })

    electronApp.setAppUserModelId('com.agentworkbench.desktop')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    mainWindow = createWindow()
    registerAllIpcHandlers(mainWindow)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow()
      }
    })
  })
}

app.on('window-all-closed', () => {
  mainWindow = null
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
