const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  loadEvents: () => ipcRenderer.invoke('load-events'),
  saveEvents: (events) => ipcRenderer.invoke('save-events', events),
  refreshEvents: () => ipcRenderer.invoke('refresh-events'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  checkEventsNotification: () => ipcRenderer.invoke('check-events-notification'),
  loadSlides: () => ipcRenderer.invoke('load-slides')
});
