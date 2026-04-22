import { app, BrowserWindow, protocol } from 'electron';
import * as path from 'path';
import { promises as fs } from 'fs';
import { registerIpcHandlers } from './ipc-handlers';

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
};

let mainWindow: BrowserWindow | null = null;

protocol.registerSchemesAsPrivileged([
  { scheme: 'safe-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#111',
    title: 'Image Sorter',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setMenuBarVisibility(false);

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Serve local image files via a custom scheme so the renderer can display them
  // without needing to disable web security or expose file://.
  protocol.handle('safe-file', async (request) => {
    try {
      const url = new URL(request.url);
      // Pathname comes back like "/C:/Users/.../file.jpg" on Windows because
      // we encoded the absolute path after "safe-file:///".
      let p = decodeURIComponent(url.pathname);
      if (process.platform === 'win32' && /^\/[A-Za-z]:\//.test(p)) p = p.slice(1);
      // Normalize separators for fs on Windows.
      p = path.normalize(p);

      const data = await fs.readFile(p);
      const ext = path.extname(p).toLowerCase();
      const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
      console.log('[safe-file] serving', p, contentType, data.byteLength, 'bytes');
      return new Response(data, {
        status: 200,
        headers: { 'Content-Type': contentType, 'Cache-Control': 'no-cache' }
      });
    } catch (err) {
      console.error('[safe-file] failed', request.url, err);
      const message = (err as Error)?.message ?? 'Not found';
      return new Response(message, { status: 404 });
    }
  });

  registerIpcHandlers(() => mainWindow);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
