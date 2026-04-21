// ============================================================
// FILE: renderer/app.js
// Root application controller.
// Orchestrates: FileManager → Editor → Graph → UI sidebar
// ============================================================

const App = (() => {

  // ── DOM refs ─────────────────────────────────────────────
  const elFileList    = document.getElementById('file-list');
  const elBtnNewNote  = document.getElementById('btn-new-note');
  const elBtnGraph    = document.getElementById('btn-graph');
  const elBtnFolder   = document.getElementById('btn-open-folder');
  const elSearchInput = document.getElementById('search-input');
  const elSearchClear = document.getElementById('search-clear');
  const elVaultName   = document.getElementById('vault-name');
  const elToast       = document.getElementById('toast');

  // ── State ────────────────────────────────────────────────
  let _searchQuery = '';
  let _toastTimer  = null;

  // ── Toast notification ───────────────────────────────────
  function showToast(message, type = 'info') {
    clearTimeout(_toastTimer);
    elToast.textContent  = message;
    elToast.className    = `show ${type}`;
    _toastTimer = setTimeout(() => {
      elToast.className = '';
    }, 2800);
  }

  // ── Sidebar rendering ────────────────────────────────────
  function refreshSidebar() {
    const notes   = FileManager.getNotes();
    const query   = _searchQuery.toLowerCase();
    const current = Editor.getCurrentNote();

    const filtered = query
      ? notes.filter(n => n.toLowerCase().includes(query))
      : notes;

    if (filtered.length === 0) {
      elFileList.innerHTML = `
        <div class="empty-notes">
          ${query
            ? `No notes matching<br><strong>"${query}"</strong>`
            : 'No notes yet.<br>Press ＋ to create one.'}
        </div>`;
      return;
    }

    // Sort alphabetically
    const sorted = [...filtered].sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );

    elFileList.innerHTML = sorted.map(title => `
      <li class="file-item${title === current ? ' active' : ''}" data-title="${title}">
        <span class="file-icon">📄</span>
        <span class="file-item-name">${highlight(title, query)}</span>
        <button class="file-item-del" data-title="${title}" title="Delete">✕</button>
      </li>`
    ).join('');

    // Open note on click
    elFileList.querySelectorAll('.file-item').forEach(li => {
      li.addEventListener('click', (e) => {
        if (e.target.classList.contains('file-item-del')) return; // handled below
        openNote(li.dataset.title);
      });
    });

    // Delete button
    elFileList.querySelectorAll('.file-item-del').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const title = btn.dataset.title;
        await deleteNote(title);
      });
    });
  }

  /** Highlight search term in note title */
  function highlight(title, query) {
    if (!query) return title;
    const idx = title.toLowerCase().indexOf(query);
    if (idx === -1) return title;
    return (
      title.slice(0, idx) +
      `<mark style="background:var(--accent-dim);color:var(--accent-hover);border-radius:3px">${title.slice(idx, idx + query.length)}</mark>` +
      title.slice(idx + query.length)
    );
  }

  // ── Open note ────────────────────────────────────────────
  async function openNote(title) {
    // If note doesn't exist yet (clicked from a wiki-link), create it
    if (!FileManager.noteExists(title)) {
      const created = await FileManager.createNote(title);
      await FileManager.listNotes(); // refresh internal list
      showToast(`Created new note: "${created}"`, 'success');
    }
    await Editor.openNote(title);
    refreshSidebar();
  }

  // ── Delete note ──────────────────────────────────────────
  async function deleteNote(title) {
    const ok = await FileManager.deleteNote(title);
    if (ok) {
      showToast(`Deleted "${title}"`, 'info');
      if (Editor.getCurrentNote() === title) {
        Editor.clearEditor();
      }
      refreshSidebar();
    } else {
      showToast('Could not delete note', 'error');
    }
  }

  async function deleteCurrentNote() {
    const title = Editor.getCurrentNote();
    if (!title) return;
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    await deleteNote(title);
  }

  // ── New note ─────────────────────────────────────────────
  async function newNote() {
    const title = await FileManager.createNote('Untitled');
    await FileManager.listNotes();
    await openNote(title);
    showToast(`Created "${title}"`, 'success');
  }

  // ── Search ───────────────────────────────────────────────
  function bindSearch() {
    elSearchInput.addEventListener('input', () => {
      _searchQuery = elSearchInput.value.trim();
      elSearchClear.classList.toggle('hidden', !_searchQuery);
      refreshSidebar();
    });
    elSearchClear.addEventListener('click', () => {
      elSearchInput.value = '';
      _searchQuery = '';
      elSearchClear.classList.add('hidden');
      refreshSidebar();
      elSearchInput.focus();
    });
  }

  // ── Window controls ──────────────────────────────────────
  function bindWindowControls() {
    document.getElementById('btn-minimize').addEventListener('click', () => window.electronAPI.minimize());
    document.getElementById('btn-maximize').addEventListener('click', () => window.electronAPI.maximize());
    document.getElementById('btn-close').addEventListener('click',    () => window.electronAPI.close());
  }

  // ── Sidebar resize handle ─────────────────────────────────
  function bindSidebarResize() {
    const handle  = document.getElementById('sidebar-resize-handle');
    const sidebar = document.getElementById('sidebar');
    let dragging = false, startX, startW;

    handle.addEventListener('mousedown', e => {
      dragging = true;
      startX   = e.clientX;
      startW   = sidebar.getBoundingClientRect().width;
      handle.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      const newW = Math.max(160, Math.min(400, startW + e.clientX - startX));
      sidebar.style.width = `${newW}px`;
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });
  }

  // ── Vault name display ────────────────────────────────────
  async function initVaultName() {
    const dir = await window.electronAPI.getNotesDir();
    const parts = dir.replace(/\\/g, '/').split('/');
    elVaultName.textContent = parts[parts.length - 1] || 'My Vault';
    elVaultName.title = dir;
  }

  // ── Bootstrap ────────────────────────────────────────────
  async function init() {
    // Initialise modules
    await FileManager.init();

    Editor.init();
    Graph.init();

    // Load sidebar
    await FileManager.listNotes();
    refreshSidebar();

    // Vault label
    await initVaultName();

    // Button events
    elBtnNewNote.addEventListener('click', newNote);
    elBtnGraph.addEventListener('click', () => { Graph.rebuild(); Graph.open(); });
    elBtnFolder.addEventListener('click', () => window.electronAPI.openFolder());

    // Keyboard shortcut: Ctrl+N → new note
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); newNote(); }
      if (e.key === 'Escape') Graph.close();
    });

    bindSearch();
    bindWindowControls();
    bindSidebarResize();

    // Open most recent note if any
    const notes = FileManager.getNotes();
    if (notes.length > 0) {
      await openNote(notes[0]);
    }
  }

  // Start when DOM ready
  document.addEventListener('DOMContentLoaded', init);

  return {
    openNote,
    deleteCurrentNote,
    deleteNote,
    refreshSidebar,
    showToast,
    newNote,
  };
})();
