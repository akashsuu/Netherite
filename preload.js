// ============================================================
// FILE: preload.js  —  Secure IPC Bridge
// Exposes only whitelisted channels to the renderer process.
// ============================================================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Note CRUD ────────────────────────────────────────────
  listNotes:    ()                    => ipcRenderer.invoke('notes:list'),
  loadNote:     (title)               => ipcRenderer.invoke('notes:load',   title),
  saveNote:     (title, content)      => ipcRenderer.invoke('notes:save',   title, content),
  deleteNote:   (title)               => ipcRenderer.invoke('notes:delete', title),
  renameNote:   (oldTitle, newTitle)  => ipcRenderer.invoke('notes:rename', oldTitle, newTitle),
  createNote:   (title)               => ipcRenderer.invoke('notes:create', title),
  openFolder:   ()                    => ipcRenderer.invoke('notes:openFolder'),
  showInExplorer:(title)              => ipcRenderer.invoke('notes:showInExplorer', title),
  getPath:      (title)               => ipcRenderer.invoke('notes:getPath', title),
  getNotesDir:  ()                    => ipcRenderer.invoke('notes:getDir'),

  // ── Window controls ─────────────────────────────────────
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close:    () => ipcRenderer.send('window:close'),
  newWindow:() => ipcRenderer.send('window:new'),
  exportPdf:(title) => ipcRenderer.invoke('window:exportPdf', title),
});
