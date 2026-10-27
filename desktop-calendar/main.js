const { app, BrowserWindow, Tray, Menu, ipcMain, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let tray;
const eventsFile = path.join(app.getPath('userData'), 'events.json');
const notifiedFile = path.join(app.getPath('userData'), 'notified.json');
let notifiedCache = { date: '', items: [] };

Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  createWindow();
  setInterval(checkNotify, 60000);
  checkNotify();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

function ensureEventsFile() {
  const dir = path.dirname(eventsFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(eventsFile)) fs.writeFileSync(eventsFile, '[]');
}

function loadEvents() {
  ensureEventsFile();
  try { return JSON.parse(fs.readFileSync(eventsFile, 'utf-8')); }
  catch(e) { return []; }
}

function saveEvents(events) {
  ensureEventsFile();
  fs.writeFileSync(eventsFile, JSON.stringify(events, null, 2));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 820,
    height: 520,
    minWidth: 600,
    minHeight: 380,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#ffffff', symbolColor: '#111111', height: 32 },
    resizable: true,
    hasShadow: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => { mainWindow.show(); });

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) { e.preventDefault(); mainWindow.hide(); }
  });

  createTray();
}

function createTray() {
  const iconPath = path.join(__dirname, 'icon.png');
  if (!fs.existsSync(iconPath)) return;
  try {
    tray = new Tray(iconPath);
    updateTrayMenu();
    tray.on('double-click', () => { mainWindow.show(); mainWindow.focus(); });
  } catch(e) {}
}

function updateTrayMenu() {
  const menu = Menu.buildFromTemplate([
    { label: 'Mở Calendar', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { label: 'Kiểm tra sự kiện', click: checkNotify },
    { type: 'separator' },
    { label: 'Thoát', click: () => { app.isQuitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip('Calendo');
}

function loadNotifiedFromDisk() {
  try {
    const data = JSON.parse(fs.readFileSync(notifiedFile, 'utf-8'));
    if (data && data.date && Array.isArray(data.items)) return data;
    return { date: '', items: [] };
  } catch(e) { return { date: '', items: [] }; }
}

function saveNotifiedToDisk(data) {
  try { fs.writeFileSync(notifiedFile, JSON.stringify(data)); } catch(e) {}
}

function checkNotify() {
  const events = loadEvents();
  const now = new Date();
  const today = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');

  if (notifiedCache.date === '' || notifiedCache.date !== today) {
    const disk = loadNotifiedFromDisk();
    if (disk.date === today) { notifiedCache = disk; }
    else { notifiedCache = { date: today, items: [] }; saveNotifiedToDisk(notifiedCache); }
  }

  const nowTotal = now.getHours() * 60 + now.getMinutes();

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.date !== today) continue;
    if (ev.notify === false) continue;
    if (ev.done === true) continue;
    if (!ev.time || ev.time.indexOf(':') === -1) continue;
    if (notifiedCache.items.indexOf(ev.id) !== -1) continue;

    const parts = ev.time.split(':');
    const evH = parseInt(parts[0], 10);
    const evM = parseInt(parts[1], 10);
    if (isNaN(evH) || isNaN(evM)) continue;

    if (nowTotal >= evH * 60 + evM) {
      if (Notification.isSupported()) {
        new Notification({ title: 'Nhắc nhở', body: ev.title + ' - ' + ev.time, silent: false }).show();
        notifiedCache.items.push(ev.id);
        saveNotifiedToDisk(notifiedCache);
        ev.done = true;
        saveEvents(events);
      }
    }
  }
}

ipcMain.handle('load-events', () => loadEvents());
ipcMain.handle('save-events', (_, events) => { saveEvents(events); return true; });
ipcMain.handle('refresh-events', () => loadEvents());
ipcMain.handle('close-window', () => mainWindow.hide());
ipcMain.handle('minimize-window', () => mainWindow.minimize());
ipcMain.handle('maximize-window', () => { mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(); });

ipcMain.handle('load-slides', () => {
  const slidesFile = path.join(__dirname, 'slides.json');
  if (!fs.existsSync(slidesFile)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(slidesFile, 'utf-8'));
    return data.map(item => ({
      url: item.url.startsWith('http') ? item.url : 'file://' + path.join(__dirname, item.url).replace(/\\/g, '/'),
      time: item.time
    }));
  } catch(e) { return []; }
});
