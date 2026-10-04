const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('desktop', {
  exportMarkdown: (data, title) => ipcRenderer.invoke('xushi:markdown', data, title),
  startPng: (count, title) => ipcRenderer.invoke('xushi:png-start', count, title),
  writePng: (session, index, data) => ipcRenderer.invoke('xushi:png-page', session, index, data),
  load: () => ipcRenderer.invoke('xushi:load'),
  read: (id) => ipcRenderer.invoke('xushi:read', id),
  save: (data) => ipcRenderer.invoke('xushi:save', data),
  settings: (data) => ipcRenderer.invoke('xushi:settings', data),
  remove: (id) => ipcRenderer.invoke('xushi:remove', id),
  importMany: (data) => ipcRenderer.invoke('xushi:import-many', data),
  importJson: () => ipcRenderer.invoke('xushi:import'),
  exportJson: (data, title) => ipcRenderer.invoke('xushi:export', data, title),
  version: () => ipcRenderer.invoke('xushi:version'),
  onClosing: (callback) => ipcRenderer.on('xushi:closing', callback),
  close: () => ipcRenderer.invoke('xushi:close'),
  forceClose: () => ipcRenderer.invoke('xushi:force-close'),
})
