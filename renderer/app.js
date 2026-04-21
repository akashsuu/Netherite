// ============================================================
// FILE: renderer/app.js
// Main Application Controller for Obsidian UI clone
// ============================================================

const App = (() => {
  // DOM Elements
  const elFileList = document.getElementById('file-list');
  const elVaultName = document.getElementById('vault-name');
  const elVaultDirName = document.getElementById('vault-dir-name');
  const elBtnNewNote = document.getElementById('btn-new-note');
  const elSearchInput = document.getElementById('search-input');
  const elSearchClear = document.getElementById('search-clear');
  const elSearchResults = document.getElementById('search-results');
  const elToast = document.getElementById('toast');
  const elTabsContainer = document.getElementById('tabs-container');
  const elBtnNewTab = document.getElementById('btn-new-tab');
  
  // Ribbon
  const elRibbonFiles = document.getElementById('ribbon-files');
  const elRibbonSearch = document.getElementById('ribbon-search');
  const elRibbonGraph = document.getElementById('ribbon-graph');
  const elRibbonVault = document.getElementById('ribbon-vault');
  
  // Panels
  const elPanelFiles = document.getElementById('panel-files');
  const elPanelSearch = document.getElementById('panel-search');
  
  // Right Sidebar
  const elRightTabBtns = document.querySelectorAll('.right-tab-btn');
  const elRightPanels = document.querySelectorAll('.right-panel');

  // Context Menu
  const elContextMenu = document.getElementById('context-menu');
  const elMenuOpen = document.getElementById('menu-open');
  const elMenuRename = document.getElementById('menu-rename');
  const elMenuDelete = document.getElementById('menu-delete');
  let _contextMenuTarget = null;

  // State
  let _searchQuery = '';
  let _toastTimer = null;
  let _tabs = [];
  let _activeTabId = null;
  let _tabCounter = 0;

  function showToast(message, type = 'info') {
    clearTimeout(_toastTimer);
    elToast.textContent = message;
    elToast.className = `show ${type}`;
    _toastTimer = setTimeout(() => {
      elToast.className = '';
    }, 3000);
  }

  function renderSidebarFiles() {
    const notes = FileManager.getNotes();
    const current = Editor.getCurrentNote();

    if (notes.length === 0) {
      elFileList.innerHTML = '<div style="padding:12px;color:var(--text-faint);font-size:12px;text-align:center;">No files found</div>';
      return;
    }

    const sorted = [...notes].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    elFileList.innerHTML = sorted.map(title => `
      <li class="file-item${title === current ? ' active' : ''}" data-title="${title}">
        <svg class="file-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
        </svg>
        <span class="file-item-name" style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${title}</span>
      </li>`
    ).join('');

    elFileList.querySelectorAll('.file-item').forEach(li => {
      li.addEventListener('click', () => openNoteInActiveTab(li.dataset.title));
      
      li.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        _contextMenuTarget = li.dataset.title;
        
        // Ensure menu doesn't go off-screen
        elContextMenu.classList.remove('hidden');
        const rect = elContextMenu.getBoundingClientRect();
        let x = e.clientX;
        let y = e.clientY;
        
        if (x + rect.width > window.innerWidth) x -= rect.width;
        if (y + rect.height > window.innerHeight) y -= rect.height;
        
        elContextMenu.style.left = `${x}px`;
        elContextMenu.style.top = `${y}px`;
      });
    });
  }

  function doSearch() {
    if (!_searchQuery) {
      elSearchResults.innerHTML = '';
      elSearchClear.classList.add('hidden');
      return;
    }
    
    elSearchClear.classList.remove('hidden');
    const notes = FileManager.getNotes();
    const query = _searchQuery.toLowerCase();
    const filtered = notes.filter(n => n.toLowerCase().includes(query));
    
    if (filtered.length === 0) {
      elSearchResults.innerHTML = `<div style="padding:12px;color:var(--text-faint);font-size:12px;text-align:center;">No results for "${_searchQuery}"</div>`;
      return;
    }
    
    elSearchResults.innerHTML = filtered.map(title => `
      <div class="file-item" data-title="${title}">
        <svg class="file-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        </svg>
        <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${title}</span>
      </div>
    `).join('');
    
    elSearchResults.querySelectorAll('.file-item').forEach(el => {
      el.addEventListener('click', () => openNoteInActiveTab(el.dataset.title));
    });
  }

  // --- TABS SYSTEM ---

  function createTab(title = null) {
    const id = `tab-${_tabCounter++}`;
    const isNew = title === null;
    
    _tabs.push({ id, title: isNew ? 'New tab' : title });
    renderTabs();
    activateTab(id);
    
    if (!isNew) {
      Editor.openNote(title);
    } else {
      Editor.clearEditor();
    }
    
    return id;
  }

  function closeTab(id, e) {
    if (e) e.stopPropagation();
    
    const idx = _tabs.findIndex(t => t.id === id);
    if (idx === -1) return;
    
    _tabs.splice(idx, 1);
    
    if (_tabs.length === 0) {
      Editor.clearEditor();
      _activeTabId = null;
    } else if (_activeTabId === id) {
      const nextTab = _tabs[Math.min(idx, _tabs.length - 1)];
      activateTab(nextTab.id);
      if (nextTab.title !== 'New tab') {
        Editor.openNote(nextTab.title);
      } else {
        Editor.clearEditor();
      }
    }
    
    renderTabs();
  }

  function activateTab(id) {
    _activeTabId = id;
    renderTabs();
    
    const tab = _tabs.find(t => t.id === id);
    if (tab) {
      if (tab.title === 'New tab') {
        Editor.clearEditor();
      } else {
        Editor.openNote(tab.title);
      }
      renderSidebarFiles();
    }
  }

  function renderTabs() {
    if (_tabs.length === 0) {
      elTabsContainer.innerHTML = '';
      return;
    }
    
    elTabsContainer.innerHTML = _tabs.map(tab => `
      <div class="tab${tab.id === _activeTabId ? ' active' : ''}" data-id="${tab.id}">
        <svg class="tab-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        </svg>
        <span class="tab-title">${tab.title}</span>
        <button class="tab-close" data-id="${tab.id}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `).join('');
    
    elTabsContainer.querySelectorAll('.tab').forEach(el => {
      el.addEventListener('click', (e) => {
        if (!e.target.closest('.tab-close')) {
          activateTab(el.dataset.id);
        }
      });
    });
    
    elTabsContainer.querySelectorAll('.tab-close').forEach(btn => {
      btn.addEventListener('click', (e) => closeTab(btn.dataset.id, e));
    });
  }

  async function openNoteInActiveTab(title) {
    if (_tabs.length === 0) {
      createTab(title);
      return;
    }
    
    if (!FileManager.noteExists(title)) {
      await FileManager.createNote(title);
      await FileManager.listNotes();
      showToast(`Created new note: "${title}"`, 'success');
    }
    
    const tab = _tabs.find(t => t.id === _activeTabId);
    if (tab) {
      tab.title = title;
      renderTabs();
      await Editor.openNote(title);
      renderSidebarFiles();
    }
  }

  function renameTab(oldTitle, newTitle) {
    let changed = false;
    _tabs.forEach(t => {
      if (t.title === oldTitle) {
        t.title = newTitle;
        changed = true;
      }
    });
    if (changed) renderTabs();
  }

  async function deleteNote(title) {
    const ok = await FileManager.deleteNote(title);
    if (ok) {
      showToast(`Deleted "${title}"`);
      
      // Close tabs that had this note open
      const tabsToClose = _tabs.filter(t => t.title === title).map(t => t.id);
      tabsToClose.forEach(id => closeTab(id));
      
      renderSidebarFiles();
    }
  }

  async function newNote() {
    const title = await FileManager.createNote('Untitled');
    await FileManager.listNotes();
    await openNoteInActiveTab(title);
    showToast(`Created "${title}"`);
  }

  // --- UI BINDINGS ---

  function bindWindowControls() {
    document.getElementById('btn-minimize').addEventListener('click', () => window.electronAPI.minimize());
    document.getElementById('btn-maximize').addEventListener('click', () => window.electronAPI.maximize());
    document.getElementById('btn-close').addEventListener('click', () => window.electronAPI.close());
  }

  function bindSidebarResize() {
    const bindHandle = (handleId, panelId, isRight) => {
      const handle = document.getElementById(handleId);
      const panel = document.getElementById(panelId);
      if (!handle || !panel) return;

      let dragging = false, startX, startW;

      handle.addEventListener('mousedown', e => {
        dragging = true;
        startX = e.clientX;
        startW = panel.getBoundingClientRect().width;
        handle.classList.add('dragging');
        document.body.style.cursor = 'col-resize';
      });

      document.addEventListener('mousemove', e => {
        if (!dragging) return;
        let newW;
        if (isRight) {
          newW = Math.max(160, Math.min(600, startW - (e.clientX - startX)));
        } else {
          newW = Math.max(160, Math.min(600, startW + (e.clientX - startX)));
        }
        panel.style.width = `${newW}px`;
      });

      document.addEventListener('mouseup', () => {
        if (!dragging) return;
        dragging = false;
        handle.classList.remove('dragging');
        document.body.style.cursor = '';
      });
    };

    bindHandle('sidebar-resize-handle', 'sidebar', false);
    bindHandle('right-sidebar-resize-handle', 'right-sidebar', true);
  }

  function bindRibbonAndPanels() {
    elRibbonFiles.addEventListener('click', () => {
      elRibbonFiles.classList.add('active');
      elRibbonSearch.classList.remove('active');
      elPanelFiles.classList.add('active-panel');
      elPanelSearch.classList.remove('active-panel');
    });

    elRibbonSearch.addEventListener('click', () => {
      elRibbonSearch.classList.add('active');
      elRibbonFiles.classList.remove('active');
      elPanelSearch.classList.add('active-panel');
      elPanelFiles.classList.remove('active-panel');
      elSearchInput.focus();
    });

    elRibbonGraph.addEventListener('click', () => {
      Graph.rebuild();
      Graph.open();
    });

    elRibbonVault.addEventListener('click', () => {
      window.electronAPI.openFolder();
    });

    // Right sidebar tabs
    elRightTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        elRightTabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        elRightPanels.forEach(p => p.classList.remove('active-right-panel'));
        const panelId = `right-panel-${btn.dataset.panel}`;
        document.getElementById(panelId).classList.add('active-right-panel');
      });
    });
  }

  function bindContextMenu() {
    document.addEventListener('click', () => {
      if (!elContextMenu.classList.contains('hidden')) {
        elContextMenu.classList.add('hidden');
      }
    });

    elMenuOpen.addEventListener('click', () => {
      if (_contextMenuTarget) {
        openNoteInActiveTab(_contextMenuTarget);
      }
    });

    elMenuRename.addEventListener('click', async () => {
      if (_contextMenuTarget) {
        const newTitle = prompt('Rename note to:', _contextMenuTarget);
        if (newTitle && newTitle.trim() !== '' && newTitle !== _contextMenuTarget) {
          const ok = await FileManager.renameNote(_contextMenuTarget, newTitle);
          if (ok) {
            renameTab(_contextMenuTarget, newTitle);
            
            // If the note being renamed is currently open in the editor, update its title input
            if (Editor.getCurrentNote() === _contextMenuTarget) {
              document.getElementById('note-title-input').value = newTitle;
              // We don't want to call Editor.openNote again because it might clear dirty state, 
              // but we need to update internal state. A full openNote is safest though.
              Editor.openNote(newTitle);
            }
            
            renderSidebarFiles();
            showToast(`Renamed to "${newTitle}"`, 'success');
          } else {
            showToast('Rename failed. Note may already exist.', 'error');
          }
        }
      }
    });

    elMenuDelete.addEventListener('click', async () => {
      if (_contextMenuTarget) {
        if (confirm(`Delete "${_contextMenuTarget}"?`)) {
          await deleteNote(_contextMenuTarget);
        }
      }
    });
  }

  // Note Options Menu
  const elBtnNoteOptions = document.getElementById('btn-note-options');
  const elNoteOptionsMenu = document.getElementById('note-options-menu');

  function bindNoteOptionsMenu() {
    elBtnNoteOptions.addEventListener('click', (e) => {
      e.stopPropagation();
      const rect = elBtnNoteOptions.getBoundingClientRect();
      elNoteOptionsMenu.style.top = `${rect.bottom + 4}px`;
      elNoteOptionsMenu.style.right = `${window.innerWidth - rect.right}px`;
      elNoteOptionsMenu.style.left = 'auto'; 
      elNoteOptionsMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!elBtnNoteOptions.contains(e.target)) {
        elNoteOptionsMenu.classList.add('hidden');
      }
    });

    document.getElementById('opt-backlinks').addEventListener('click', () => {
      document.querySelector('[data-panel="backlinks"]').click();
    });
    document.getElementById('opt-reading-view').addEventListener('click', () => {
      Editor.setMode('preview');
    });
    document.getElementById('opt-source-mode').addEventListener('click', () => {
      Editor.setMode('edit');
    });
    
    document.getElementById('opt-split-right').addEventListener('click', () => showToast('Split right coming soon', 'info'));
    document.getElementById('opt-split-down').addEventListener('click', () => showToast('Split down coming soon', 'info'));
    
    document.getElementById('opt-new-window').addEventListener('click', () => window.electronAPI.newWindow());
    
    document.getElementById('opt-rename').addEventListener('click', () => {
      document.getElementById('note-title-input').focus();
    });
    
    document.getElementById('opt-move').addEventListener('click', () => showToast('Move file coming soon', 'info'));
    document.getElementById('opt-bookmark').addEventListener('click', () => showToast('Bookmark added', 'success'));
    document.getElementById('opt-merge').addEventListener('click', () => showToast('Merge file coming soon', 'info'));
    document.getElementById('opt-add-property').addEventListener('click', () => showToast('Properties coming soon', 'info'));
    
    document.getElementById('opt-export-pdf').addEventListener('click', async () => {
      showToast('Exporting to PDF...', 'info');
      const ok = await window.electronAPI.exportPdf(Editor.getCurrentNote());
      if (ok) showToast('Exported to Downloads', 'success');
      else showToast('Export failed', 'error');
    });
    
    document.getElementById('opt-find').addEventListener('click', () => {
      Editor.openFind();
    });
    document.getElementById('opt-replace').addEventListener('click', () => {
      Editor.openReplace();
    });
    
    document.getElementById('opt-copy-path').addEventListener('click', async () => {
      const cur = Editor.getCurrentNote();
      if (cur) {
        const p = await window.electronAPI.getPath(cur);
        navigator.clipboard.writeText(p);
        showToast('Path copied to clipboard', 'success');
      }
    });
    
    document.getElementById('opt-version-history').addEventListener('click', () => showToast('Version history unavailable', 'info'));
    document.getElementById('opt-linked-view').addEventListener('click', () => showToast('Linked view coming soon', 'info'));
    
    document.getElementById('opt-show-explorer').addEventListener('click', async () => {
      const cur = Editor.getCurrentNote();
      if (cur) await window.electronAPI.showInExplorer(cur);
    });
    
    document.getElementById('opt-reveal-nav').addEventListener('click', () => {
      document.getElementById('ribbon-files').click();
      const items = document.querySelectorAll('.file-item');
      items.forEach(el => {
        if (el.dataset.title === Editor.getCurrentNote()) {
          el.scrollIntoView({behavior: 'smooth', block: 'center'});
          el.style.backgroundColor = 'var(--interactive-accent)';
          setTimeout(() => el.style.backgroundColor = '', 1000);
        }
      });
    });
    
    document.getElementById('opt-delete').addEventListener('click', () => {
      const cur = Editor.getCurrentNote();
      if (cur && confirm(`Delete "${cur}"?`)) {
        deleteNote(cur);
      }
    });
  }

  async function init() {
    await FileManager.init();
    Editor.init();
    Graph.init();

    await FileManager.listNotes();
    renderSidebarFiles();

    const dir = await window.electronAPI.getNotesDir();
    const parts = dir.replace(/\\\\/g, '/').split('/');
    const vname = parts[parts.length - 1] || 'Vault';
    elVaultName.textContent = vname;
    elVaultDirName.textContent = vname;

    elBtnNewNote.addEventListener('click', newNote);
    elBtnNewTab.addEventListener('click', () => createTab());

    elSearchInput.addEventListener('input', () => {
      _searchQuery = elSearchInput.value.trim();
      doSearch();
    });
    
    elSearchClear.addEventListener('click', () => {
      elSearchInput.value = '';
      _searchQuery = '';
      doSearch();
      elSearchInput.focus();
    });

    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') { e.preventDefault(); newNote(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 't') { e.preventDefault(); createTab(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') { 
        e.preventDefault(); 
        if (_activeTabId) closeTab(_activeTabId);
      }
      if (e.key === 'Escape') Graph.close();
    });

    bindWindowControls();
    bindSidebarResize();
    bindRibbonAndPanels();
    bindContextMenu();
    bindNoteOptionsMenu();

    const notes = FileManager.getNotes();
    if (notes.length > 0) {
      createTab(notes[0]);
    } else {
      createTab();
    }
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    openNote: openNoteInActiveTab,
    deleteNote,
    refreshSidebar: renderSidebarFiles,
    showToast,
    newNote,
    renameTab
  };
})();
