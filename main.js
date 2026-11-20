const { app, BrowserWindow } = require('electron');
const path = require('path');

// We require your existing server so it runs in the background
require('./server.js');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true, // hides the top file menu
    webPreferences: {
      nodeIntegration: false
    }
  });

  // Give the local server a tiny bit of time to start up
  setTimeout(() => {
    mainWindow.loadURL('http://localhost:3000/MyLinks.html');
  }, 500);

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

// Automatically run this app when your computer starts!
app.setLoginItemSettings({
  openAtLogin: true,
  path: app.getPath('exe') // This ensures the final .exe is added to Windows startup
});

app.whenReady().then(createWindow);

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
