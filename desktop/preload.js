const { contextBridge, ipcRenderer } = require('electron');

const info = ipcRenderer.sendSync('fs-folder');

// what the pages use when they run inside the desktop app
contextBridge.exposeInMainWorld('nativeFS', {
  isDesktop: true,
  folderName: info.name,
  folderPath: info.dir,
  read: (name) => ipcRenderer.invoke('fs-read', name),
  write: (name, text) => ipcRenderer.invoke('fs-write', name, text),
  chooseFolder: () => ipcRenderer.invoke('fs-choose'),
  prompt: (message, def) => ipcRenderer.sendSync('app-prompt', String(message == null ? '' : message), def == null ? '' : String(def)),
  promptResult: (id, value) => ipcRenderer.send('prompt-result-' + id, value)
});

contextBridge.exposeInMainWorld('shellAPI', {
  onSwitchTab: (cb) => ipcRenderer.on('switch-tab', (_e, i) => cb(i)),
  onToast: (cb) => ipcRenderer.on('toast', (_e, m) => cb(m))
});
