// Links & Notes - one Windows window with two tabs: My Links and My Notes.
// Data is read/written straight from a normal folder (default D:\MY FOLDER\Sync_data), so no browser
// folder picker is involved (the picker is what Windows policy blocks on this PC).
const { app, BrowserWindow, Menu, dialog, ipcMain, shell, protocol, session, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }
]);

if (process.env.LN_USERDATA) app.setPath('userData', process.env.LN_USERDATA);   // used by tests

const APP_DIR = path.join(__dirname, 'app');
let mainWindow = null;
let config = {};

// ---------- small settings file (sync folder, window size) ----------
const cfgFile = () => path.join(app.getPath('userData'), 'config.json');
function loadConfig() { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')) || {}; } catch (e) { return {}; } }
function saveConfig() { try { fs.mkdirSync(path.dirname(cfgFile()), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify(config, null, 2)); } catch (e) { } }

function defaultSyncDir() {
  if (process.env.LN_SYNC_DIR) return process.env.LN_SYNC_DIR;
  const mine = 'D:\\MY FOLDER\\Sync_data';
  if (fs.existsSync(mine)) return mine;
  return path.join(app.getPath('documents'), 'LinksAndNotes');
}
function syncDir() {
  const d = config.syncDir || defaultSyncDir();
  try { fs.mkdirSync(d, { recursive: true }); } catch (e) { }
  return d;
}

// ---------- files: only plain *.json names inside the sync folder ----------
function safeFile(name) {
  if (typeof name !== 'string' || name !== path.basename(name) || !/\.json$/i.test(name)) throw new Error('bad file name');
  return path.join(syncDir(), name);
}
ipcMain.on('fs-folder', (e) => { const dir = syncDir(); e.returnValue = { dir, name: path.basename(dir) }; });
ipcMain.handle('fs-read', async (_e, name) => {
  const f = safeFile(name);
  try { return await fs.promises.readFile(f, 'utf8'); }
  catch (err) { if (err.code === 'ENOENT') return ''; throw err; }
});
let writeQueue = Promise.resolve();              // writes happen one after another, never at the same time
ipcMain.handle('fs-write', (_e, name, text) => {
  const f = safeFile(name);
  if (typeof text !== 'string') throw new Error('bad data');
  const job = writeQueue.then(async () => {
    const tmp = f + '.tmp';                     // write beside it, then swap: a crash never leaves half a file
    await fs.promises.writeFile(tmp, text, 'utf8');
    await fs.promises.rename(tmp, f);
    return true;
  });
  writeQueue = job.catch(() => { });
  return job;
});
async function chooseFolder() {
  const r = await dialog.showOpenDialog(mainWindow, { title: 'Choose the folder that holds notes_data.json', defaultPath: syncDir(), properties: ['openDirectory', 'createDirectory'] });
  if (r.canceled || !r.filePaths[0]) return false;
  config.syncDir = r.filePaths[0];
  saveConfig();
  if (mainWindow) mainWindow.webContents.reload();
  return true;
}
ipcMain.handle('fs-choose', () => chooseFolder());

// ---------- prompt(): Electron has none, so this gives the pages a blocking one ----------
let promptSeq = 0;
ipcMain.on('app-prompt', (event, message, def) => {
  const id = ++promptSeq;
  let finished = false;
  const win = new BrowserWindow({
    parent: mainWindow, modal: true, width: 470, height: 200, resizable: false, minimizable: false, maximizable: false,
    show: false, autoHideMenuBar: true, backgroundColor: '#252526', title: 'Links & Notes',
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  win.setMenu(null);
  const finish = (val) => { if (finished) return; finished = true; event.returnValue = val; if (!win.isDestroyed()) win.close(); };
  ipcMain.once('prompt-result-' + id, (_e, val) => finish(val));
  win.on('closed', () => { ipcMain.removeAllListeners('prompt-result-' + id); finish(null); });
  win.once('ready-to-show', () => win.show());
  win.loadURL('app://local/prompt.html?id=' + id + '&m=' + encodeURIComponent(message || '') + '&d=' + encodeURIComponent(def || ''));
});

// ---------- window ----------
function switchTab(i) { if (mainWindow) { mainWindow.webContents.send('switch-tab', i); mainWindow.focus(); } }

function createWindow() {
  const b = config.bounds || { width: 1280, height: 820 };
  mainWindow = new BrowserWindow({
    width: b.width, height: b.height, x: b.x, y: b.y, minWidth: 900, minHeight: 560,
    backgroundColor: '#1e1e1e', autoHideMenuBar: true, title: 'Links & Notes',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  if (config.maximized) mainWindow.maximize();
  mainWindow.loadURL('app://local/shell.html');

  // links and the "Save Notes" button open in the browser / the other tab, never as stray windows
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/save-notes\.html/i.test(url)) switchTab(1);
    else if (/MyLinks\.html/i.test(url)) switchTab(0);
    else if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); } });

  // unsaved edits in My Notes: ask before reload / close (the page asks the browser to; Electron needs this to show it)
  mainWindow.webContents.on('will-prevent-unload', (e) => {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question', buttons: ['Leave anyway', 'Stay'], defaultId: 1, cancelId: 1, title: 'Unsaved changes',
      message: 'You have unsaved changes in My Notes.', detail: 'Leave now and lose them?'
    });
    if (choice === 0) e.preventDefault();       // preventDefault = ignore the warning and go on
  });

  const rememberBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    config.maximized = mainWindow.isMaximized();
    if (!config.maximized) config.bounds = mainWindow.getBounds();
    saveConfig();
  };
  mainWindow.on('close', rememberBounds);
  mainWindow.on('closed', () => { mainWindow = null; });
}

function buildMenu() {
  const template = [
    {
      label: 'File', submenu: [
        { label: 'Choose sync folder…', click: () => chooseFolder() },
        { label: 'Open sync folder', click: () => shell.openPath(syncDir()) },
        { type: 'separator' },
        {
          label: 'Start with Windows', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
          click: (mi) => app.setLoginItemSettings({ openAtLogin: mi.checked, path: process.execPath })
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'View', submenu: [
        { label: 'My Links', accelerator: 'CmdOrCtrl+1', click: () => switchTab(0) },
        { label: 'My Notes', accelerator: 'CmdOrCtrl+2', click: () => switchTab(1) },
        { label: 'Other tab', accelerator: 'Ctrl+Tab', click: () => switchTab(-1) },
        { type: 'separator' },
        { role: 'reload' }, { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { label: 'Developer tools', accelerator: 'Ctrl+Shift+I', click: () => mainWindow && mainWindow.webContents.toggleDevTools() }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- start-up ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });

  app.whenReady().then(() => {
    config = loadConfig();

    // app://local/<file>  ->  files inside ./app (nothing outside it can be reached)
    protocol.handle('app', (req) => {
      const u = new URL(req.url);
      let p = decodeURIComponent(u.pathname);
      if (p === '/' || p === '') p = '/shell.html';
      const file = path.normalize(path.join(APP_DIR, p));
      if (!file.startsWith(APP_DIR)) return new Response('Forbidden', { status: 403 });
      return net.fetch(pathToFileURL(file).toString());
    });

    // downloads (Export, daily backup) go straight to Downloads instead of asking every time
    session.defaultSession.on('will-download', (_e, item) => {
      const dl = app.getPath('downloads');
      const name = item.getFilename();
      const ext = path.extname(name), base = path.basename(name, ext);
      let target = path.join(dl, name), i = 1;
      while (fs.existsSync(target)) target = path.join(dl, base + ' (' + (i++) + ')' + ext);
      item.setSavePath(target);
      item.once('done', (_ev, state) => {
        if (state === 'completed' && mainWindow) mainWindow.webContents.send('toast', 'Saved to Downloads: ' + path.basename(target));
      });
    });

    buildMenu();
    createWindow();
  });

  app.on('window-all-closed', () => { app.quit(); });
}
