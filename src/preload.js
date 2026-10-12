const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mom', {
  platform: process.platform,
  send: (channel, data) => ipcRenderer.send(channel, data),
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),
  on: (channel, fn) => ipcRenderer.on(channel, (_event, data) => fn(data)),
});
