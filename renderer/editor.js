// ============================================================
// FILE: renderer/editor.js
// Editor module handling markdown, preview, and tabs logic
// ============================================================

const Editor = (() => {
  const elEditorPane = document.getElementById('editor-pane');
  const elPreviewPane = document.getElementById('preview-pane');
  const elEditor = document.getElementById('md-editor');
  const elPreview = document.getElementById('md-preview');
  const elTitleInput = document.getElementById('note-title-input');
  const elNoteView = document.getElementById('note-view');
  const elWelcomeScreen = document.getElementById('welcome-screen');
  
  const elStatusMode = document.getElementById('status-mode');
  const elStatusWords = document.getElementById('status-words');
  const elStatusChars = document.getElementById('status-chars');
  const elStatusSaved = document.getElementById('status-saved');
  const elStatusBacklinks = document.getElementById('status-backlinks');
  
  const elRightPanelOutline = document.getElementById('right-panel-outline');
  const elOutlineList = document.getElementById('outline-list');
  const elOutlineEmpty = document.getElementById('outline-empty');
  
  const elBacklinksBody = document.getElementById('backlinks-body');
  const elOutlinksBody = document.getElementById('outlinks-body');

  let _currentNote = null;
  let _mode = 'edit'; // 'edit' or 'preview'
  let _dirty = false;
  let _autoSaveTimer = null;

  marked.setOptions({ breaks: true, gfm: true });

  function processWikiLinks(html) {
    return html.replace(/\[\[([^\]]+)\]\]/g, (_, name) => {
      const exists = FileManager.noteExists(name.trim());
      const cls = exists ? 'wiki-link' : 'wiki-link missing';
      const escaped = name.replace(/"/g, '&quot;');
      return `<span class="${cls}" data-note="${escaped}">[[${name}]]</span>`;
    });
  }

  function renderPreview() {
    const raw = elEditor.value;
    const html = processWikiLinks(marked.parse(raw));
    elPreview.innerHTML = html;

    elPreview.querySelectorAll('.wiki-link').forEach(el => {
      el.addEventListener('click', () => {
        const noteName = el.dataset.note;
        if (noteName) App.openNote(noteName);
      });
    });
  }

  function generateOutline() {
    const raw = elEditor.value;
    const lines = raw.split('\n');
    let outlineHtml = '';
    let hasHeadings = false;

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^(#{1,6})\s+(.*)$/);
      if (match) {
        hasHeadings = true;
        const level = match[1].length;
        const text = match[2];
        const padding = (level - 1) * 12;
        outlineHtml += `<div class="link-item" style="padding-left: ${8 + padding}px" data-line="${i}">${text}</div>`;
      }
    }

    if (hasHeadings) {
      elOutlineList.innerHTML = outlineHtml;
      elOutlineEmpty.style.display = 'none';
      elOutlineList.style.display = 'block';
    } else {
      elOutlineList.innerHTML = '';
      elOutlineEmpty.style.display = 'block';
      elOutlineList.style.display = 'none';
    }
  }

  function updateStatus() {
    const text = elEditor.value;
    const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
    const chars = text.length;
    elStatusWords.textContent = `${words} word${words !== 1 ? 's' : ''}`;
    elStatusChars.textContent = `${chars} character${chars !== 1 ? 's' : ''}`;
  }

  function refreshRightPanelLinks() {
    if (!_currentNote) return;

    const backlinks = FileManager.getBacklinks(_currentNote);
    elStatusBacklinks.textContent = `${backlinks.length} backlink${backlinks.length !== 1 ? 's' : ''}`;
    
    if (backlinks.length === 0) {
      elBacklinksBody.innerHTML = '<p class="right-panel-empty-msg">No backlinks found.</p>';
    } else {
      elBacklinksBody.innerHTML = backlinks.map(title => `
        <div class="link-item" data-note="${title}">${title}</div>
      `).join('');
      elBacklinksBody.querySelectorAll('.link-item').forEach(el => {
        el.addEventListener('click', () => App.openNote(el.dataset.note));
      });
    }

    const outlinks = FileManager.getOutlinks(_currentNote);
    if (outlinks.length === 0) {
      elOutlinksBody.innerHTML = '<p class="right-panel-empty-msg">No outgoing links.</p>';
    } else {
      elOutlinksBody.innerHTML = outlinks.map(title => `
        <div class="link-item" data-note="${title}">${title}</div>
      `).join('');
      elOutlinksBody.querySelectorAll('.link-item').forEach(el => {
        el.addEventListener('click', () => App.openNote(el.dataset.note));
      });
    }
  }

  function scheduleAutoSave() {
    clearTimeout(_autoSaveTimer);
    elStatusSaved.classList.remove('saved');
    
    _autoSaveTimer = setTimeout(async () => {
      if (_currentNote && _dirty) {
        await FileManager.saveNote(_currentNote, elEditor.value);
        _dirty = false;
        elStatusSaved.classList.add('saved');
        refreshRightPanelLinks();
        generateOutline();
      }
    }, 1500);
  }

  async function openNote(title) {
    if (_currentNote && _dirty) {
      await FileManager.saveNote(_currentNote, elEditor.value);
    }

    _currentNote = title;
    const content = await FileManager.loadNote(title);
    elEditor.value = content || '';
    _dirty = false;

    elTitleInput.value = title;
    
    elWelcomeScreen.classList.add('hidden');
    elNoteView.classList.remove('hidden');

    updateStatus();
    generateOutline();
    refreshRightPanelLinks();
    
    if (_mode === 'preview') renderPreview();
    elStatusSaved.classList.add('saved');
    
    // Focus logic
    setTimeout(() => {
      elEditor.focus();
    }, 10);
  }

  function clearEditor() {
    _currentNote = null;
    elEditor.value = '';
    elPreview.innerHTML = '';
    elTitleInput.value = '';
    
    elWelcomeScreen.classList.remove('hidden');
    elNoteView.classList.add('hidden');
    
    elBacklinksBody.innerHTML = '<p class="right-panel-empty-msg">No backlinks found.</p>';
    elOutlinksBody.innerHTML = '<p class="right-panel-empty-msg">No outgoing links.</p>';
    elOutlineEmpty.style.display = 'block';
    elOutlineList.style.display = 'none';
    
    elStatusWords.textContent = '0 words';
    elStatusChars.textContent = '0 characters';
    elStatusBacklinks.textContent = '0 backlinks';
  }

  async function saveNow() {
    if (!_currentNote) return;
    clearTimeout(_autoSaveTimer);
    await FileManager.saveNote(_currentNote, elEditor.value);
    _dirty = false;
    elStatusSaved.classList.add('saved');
    refreshRightPanelLinks();
    generateOutline();
  }

  function setMode(mode) {
    _mode = mode;
    if (mode === 'edit') {
      elEditorPane.classList.remove('hidden');
      elPreviewPane.classList.add('hidden');
      elStatusMode.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="vertical-align:middle;margin-right:4px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Editing`;
      elEditor.focus();
    } else {
      renderPreview();
      elEditorPane.classList.add('hidden');
      elPreviewPane.classList.remove('hidden');
      elStatusMode.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="vertical-align:middle;margin-right:4px"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Reading`;
    }
  }

  function toggleMode() {
    setMode(_mode === 'edit' ? 'preview' : 'edit');
  }

  function init() {
    elEditor.addEventListener('input', () => {
      _dirty = true;
      updateStatus();
      scheduleAutoSave();
    });

    elTitleInput.addEventListener('change', async () => {
      const newTitle = elTitleInput.value.trim();
      if (!newTitle || newTitle === _currentNote) {
        elTitleInput.value = _currentNote || '';
        return;
      }
      
      const ok = await FileManager.renameNote(_currentNote, newTitle);
      if (ok) {
        App.renameTab(_currentNote, newTitle);
        _currentNote = newTitle;
        App.refreshSidebar();
        App.showToast(`Renamed to "${newTitle}"`, 'success');
      } else {
        App.showToast('Rename failed. Note may already exist.', 'error');
        elTitleInput.value = _currentNote;
      }
    });

    elStatusMode.addEventListener('click', toggleMode);
    
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        toggleMode();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveNow();
      }
    });
    
    setMode('edit');
  }

  return {
    init,
    openNote,
    clearEditor,
    saveNow,
    getCurrentNote: () => _currentNote,
    refreshLinksPanel: refreshRightPanelLinks
  };
})();
