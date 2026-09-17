import { app, shell, BrowserWindow, ipcMain, dialog, safeStorage } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 20, y: 20 },
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false // Disable CORS to allow fetch from file:// protocol
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Fullscreen IPC
  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.send('fullscreen-change', true)
  })
  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send('fullscreen-change', false)
  })
  ipcMain.removeHandler('is-fullscreen')
  ipcMain.handle('is-fullscreen', () => {
    return mainWindow.isFullScreen()
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock?.setIcon(icon)
    app.setAboutPanelOptions({
      applicationName: app.getName(),
      applicationVersion: app.getVersion(),
      version: app.getVersion(),
      iconPath: join(__dirname, '../../resources/icon.png')
    })
  }

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // Native File System Operations for Local Projects
  ipcMain.handle('create-local-project', async (_, projectName: string) => {
    try {
      const oceanDir = join(os.homedir(), 'Documents', 'Ocean');
      if (!fs.existsSync(oceanDir)) {
        fs.mkdirSync(oceanDir, { recursive: true });
      }
      const projectPath = join(oceanDir, projectName);
      if (!fs.existsSync(projectPath)) {
        fs.mkdirSync(projectPath, { recursive: true });
      }
      return { success: true, path: projectPath };
    } catch (err: any) {
      console.error('Failed to create local project directory:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('open-folder-picker', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory']
      });
      if (!result.canceled && result.filePaths.length > 0) {
        return { success: true, path: result.filePaths[0] };
      }
      return { success: false, canceled: true };
    } catch (err: any) {
      console.error('Failed to open folder picker:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Secure Credential Vault (system keychain via safeStorage) ──
  // Electron 无浏览器密码管理器，autocomplete 不生效；用系统钥匙串做应用内自动填充。
  const credentialsFile = () => join(app.getPath('userData'), 'credentials.bin');

  const readCredentials = (): { email: string; password: string } | null => {
    try {
      if (!safeStorage.isEncryptionAvailable()) return null;
      const p = credentialsFile();
      if (!fs.existsSync(p)) return null;
      const parsed = JSON.parse(safeStorage.decryptString(fs.readFileSync(p)));
      if (parsed && typeof parsed.email === 'string' && typeof parsed.password === 'string') {
        return { email: parsed.email, password: parsed.password };
      }
      return null;
    } catch {
      return null;
    }
  };

  ipcMain.handle('credentials-get', () => readCredentials());

  ipcMain.handle('credentials-save', (_, c: { email: string; password: string }) => {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        return { success: false, error: 'System encryption unavailable' };
      }
      if (!c || typeof c.email !== 'string' || typeof c.password !== 'string') {
        return { success: false, error: 'Invalid credentials payload' };
      }
      fs.writeFileSync(credentialsFile(), safeStorage.encryptString(JSON.stringify(c)));
      return { success: true };
    } catch (err: any) {
      console.error('Failed to save credentials:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('credentials-clear', () => {
    try {
      fs.rmSync(credentialsFile(), { force: true });
      return { success: true };
    } catch (err: any) {
      console.error('Failed to clear credentials:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('reveal-in-finder', async (_, targetPath: string) => {
    try {
      if (fs.existsSync(targetPath)) {
        shell.showItemInFolder(targetPath);
        return { success: true };
      }
      return { success: false, error: 'Path does not exist' };
    } catch (err: any) {
      console.error('Failed to reveal in finder:', err);
      return { success: false, error: err.message };
    }
  });

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
