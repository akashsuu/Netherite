// ============================================================
// FILE: main.js  —  Electron Main Process
// ============================================================

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');

// ── Notes directory ──────────────────────────────────────────
const NOTES_DIR = path.join(app.getPath('userData'), 'notes');

function ensureNotesDir() {
  if (!fs.existsSync(NOTES_DIR)) {
    fs.mkdirSync(NOTES_DIR, { recursive: true });
  }
}

// ── Window factory ───────────────────────────────────────────
function createWindow() {
  ensureNotesDir();
  
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,          // custom title-bar
    backgroundColor: '#0d0d0f',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,   // secure context
      nodeIntegration: false,   // no direct Node in renderer
      sandbox: false,           // preload needs require
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Expose window-control events from renderer
  ipcMain.on('window:minimize', () => win.minimize());
  ipcMain.on('window:maximize', () =>
    win.isMaximized() ? win.unmaximize() : win.maximize()
  );
  ipcMain.on('window:close', () => win.close());
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC handlers – File System ────────────────────────────────

/** List all .md files */
ipcMain.handle('notes:list', () => {
  ensureNotesDir();
  return fs.readdirSync(NOTES_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''));
});

/** Read a note by title */
ipcMain.handle('notes:load', (_, title) => {
  const filePath = path.join(NOTES_DIR, `${title}.md`);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
});

/** Save (create or update) a note */
ipcMain.handle('notes:save', (_, title, content) => {
  ensureNotesDir();
  const filePath = path.join(NOTES_DIR, `${title}.md`);
  fs.writeFileSync(filePath, content, 'utf-8');
  return true;
});

/** Delete a note */
ipcMain.handle('notes:delete', (_, title) => {
  const filePath = path.join(NOTES_DIR, `${title}.md`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
});

/** Rename a note */
ipcMain.handle('notes:rename', (_, oldTitle, newTitle) => {
  const oldPath = path.join(NOTES_DIR, `${oldTitle}.md`);
  const newPath = path.join(NOTES_DIR, `${newTitle}.md`);
  if (!fs.existsSync(oldPath)) return false;
  if (fs.existsSync(newPath)) return false; // conflict
  fs.renameSync(oldPath, newPath);
  return true;
});

/** Create a new untitled note (returns final title) */
ipcMain.handle('notes:create', (_, suggestedTitle) => {
  ensureNotesDir();
  let title = suggestedTitle || 'Untitled';
  let counter = 1;
  while (fs.existsSync(path.join(NOTES_DIR, `${title}.md`))) {
    title = `${suggestedTitle || 'Untitled'} ${counter++}`;
  }
  fs.writeFileSync(path.join(NOTES_DIR, `${title}.md`), `# ${title}\n\n`, 'utf-8');
  return title;
});

/** Open the notes folder in the OS file explorer */
ipcMain.handle('notes:openFolder', () => {
  const { shell } = require('electron');
  shell.openPath(NOTES_DIR);
});

/** Return the notes directory path (for display) */
ipcMain.handle('notes:getDir', () => NOTES_DIR);
