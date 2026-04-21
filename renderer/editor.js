// ============================================================
// FILE: renderer/editor.js
// Markdown editor with live preview, auto-save, and wiki-link
// rendering.  Depends on: FileManager, marked (CDN)
// ============================================================

const Editor = (() => {

  // ── DOM refs ─────────────────────────────────────────────
  const elEditor      = document.getElementById('md-editor');
  const elPreview     = document.getElementById('md-preview');
  const elEditorPane  = document.getElementById('editor-pane');
  const elPreviewPane = document.getElementById('preview-pane');
  const elContainer   = document.getElementById('editor-container');
  const elTitleDisplay = document.getElementById('current-note-title');
  const elTitleBar    = document.getElementById('note-title-bar');
  const elTitleInput  = document.getElementById('note-title-input');
  const elStatusWords = document.getElementById('status-words');
  const elStatusChars = document.getElementById('status-chars');
  const elStatusSaved = document.getElementById('status-saved');
  const elBtnMode     = document.getElementById('btn-toggle-mode');
  const elBtnDelete   = document.getElementById('btn-delete-note');
  const elBackBody    = document.getElementById('backlinks-body');
  const elOutBody     = document.getElementById('outlinks-body');

  // ── State ────────────────────────────────────────────────
  let _currentNote   = null;   // active note title
  let _dirty         = false;  // unsaved changes?
  let _mode          = 'edit'; // 'edit' | 'preview' | 'split'
  let _autoSaveTimer = null;

  // ── marked configuration ─────────────────────────────────
  marked.setOptions({
    breaks: true,
    gfm: true,
  });

  // ── Wiki-link post-processor ─────────────────────────────
  /**
   * Replaces [[Note Name]] patterns inside rendered HTML with
   * clickable spans.  Must run AFTER marked() since marked
   * doesn't know about [[...]].
   */
  function processWikiLinks(html) {
    return html.replace(/\[\[([^\]]+)\]\]/g, (_, name) => {
      const exists  = FileManager.noteExists(name.trim());
      const cls     = exists ? 'wiki-link' : 'wiki-link missing';
      const escaped = name.replace(/"/g, '&quot;');
      return `<span class="${cls}" data-note="${escaped}">[[${name}]]</span>`;
    });
  }

  // ── Render preview ───────────────────────────────────────
  function renderPreview() {
    const raw  = elEditor.value;
    const html = processWikiLinks(marked.parse(raw));
    elPreview.innerHTML = html;

    // Bind click on wiki-links in preview
    elPreview.querySelectorAll('.wiki-link').forEach(el => {
      el.addEventListener('click', () => {
        const noteName = el.dataset.note;
        if (noteName) App.openNote(noteName);
      });
    });
  }

  // ── Status bar ───────────────────────────────────────────
  function updateStatus() {
    const text  = elEditor.value;
    const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
    const chars = text.length;
    elStatusWords.textContent = `${words} word${words !== 1 ? 's' : ''}`;
    elStatusChars.textContent = `${chars} char${chars !== 1 ? 's' : ''}`;
  }

  // ── Backlinks / Outlinks panel ───────────────────────────
  function refreshLinksPanel() {
    if (!_currentNote) return;

    // Backlinks
    const backlinks = FileManager.getBacklinks(_currentNote);
    if (backlinks.length === 0) {
      elBackBody.innerHTML = '<p class="empty-msg">No backlinks found.</p>';
    } else {
      elBackBody.innerHTML = backlinks.map(title => `
        <div class="backlink-item" data-note="${title}">
          <span class="backlink-icon">◁</span>
          <span>${title}</span>
        </div>`).join('');
      elBackBody.querySelectorAll('.backlink-item').forEach(el => {
        el.addEventListener('click', () => App.openNote(el.dataset.note));
      });
    }

    // Outgoing links
    const outlinks = FileManager.getOutlinks(_currentNote);
    if (outlinks.length === 0) {
      elOutBody.innerHTML = '<p class="empty-msg">No outgoing links.</p>';
    } else {
      elOutBody.innerHTML = outlinks.map(title => `
        <div class="outlink-item" data-note="${title}">
          <span class="backlink-icon">▷</span>
          <span>${title}</span>
        </div>`).join('');
      elOutBody.querySelectorAll('.outlink-item').forEach(el => {
        el.addEventListener('click', () => App.openNote(el.dataset.note));
      });
    }
  }

  // ── Auto-save (debounced 1.5 s) ──────────────────────────
  function scheduleAutoSave() {
    clearTimeout(_autoSaveTimer);
    elStatusSaved.textContent = '● Unsaved';
    elStatusSaved.classList.add('saving');
    elStatusSaved.style.color = 'var(--text-muted)';

    _autoSaveTimer = setTimeout(async () => {
      if (_currentNote && _dirty) {
        await FileManager.saveNote(_currentNote, elEditor.value);
        _dirty = false;
        elStatusSaved.textContent = '✔ Saved';
        elStatusSaved.classList.remove('saving');
        elStatusSaved.style.color = 'var(--success)';
        refreshLinksPanel();
      }
    }, 1500);
  }

  // ── Open a note in the editor ────────────────────────────
  async function openNote(title) {
    // Save current note first
    if (_currentNote && _dirty) {
      await FileManager.saveNote(_currentNote, elEditor.value);
    }

    _currentNote = title;
    const content = await FileManager.loadNote(title);
    elEditor.value = content || '';
    _dirty = false;

    elTitleDisplay.textContent = title;
    elTitleInput.value         = title;
    elTitleBar.classList.remove('hidden');
    elBtnDelete.classList.remove('hidden');

    updateStatus();
    if (_mode !== 'edit') renderPreview();
    refreshLinksPanel();

    elStatusSaved.textContent = '✔ Saved';
    elStatusSaved.style.color = 'var(--success)';
    elStatusSaved.classList.remove('saving');

    elEditor.focus();
  }

  // ── Clear editor (no note open) ──────────────────────────
  function clearEditor() {
    _currentNote = null;
    elEditor.value = '';
    elPreview.innerHTML = '';
    elTitleDisplay.textContent = '—';
    elTitleInput.value = '';
    elTitleBar.classList.add('hidden');
    elBtnDelete.classList.add('hidden');
    elBackBody.innerHTML = '<p class="empty-msg">No backlinks found.</p>';
    elOutBody.innerHTML  = '<p class="empty-msg">No outgoing links.</p>';
    elStatusWords.textContent = '0 words';
    elStatusChars.textContent = '0 chars';
  }

  // ── Force save ───────────────────────────────────────────
  async function saveNow() {
    if (!_currentNote) return;
    clearTimeout(_autoSaveTimer);
    await FileManager.saveNote(_currentNote, elEditor.value);
    _dirty = false;
    elStatusSaved.textContent = '✔ Saved';
    elStatusSaved.style.color = 'var(--success)';
    elStatusSaved.classList.remove('saving');
    refreshLinksPanel();
  }

  // ── Set view mode ────────────────────────────────────────
  function setMode(mode) {
    _mode = mode;
    elContainer.classList.remove('split');

    switch (mode) {
      case 'edit':
        elEditorPane.classList.remove('hidden');
        elPreviewPane.classList.add('hidden');
        elBtnMode.textContent = '⚡ Preview';
        break;
      case 'preview':
        renderPreview();
        elEditorPane.classList.add('hidden');
        elPreviewPane.classList.remove('hidden');
        elBtnMode.textContent = '✏ Edit';
        break;
      case 'split':
        renderPreview();
        elEditorPane.classList.remove('hidden');
        elPreviewPane.classList.remove('hidden');
        elContainer.classList.add('split');
        elBtnMode.textContent = '⊟ Exit Split';
        break;
    }
  }

  // ── Toggle mode: edit → split → preview → edit ───────────
  function toggleMode() {
    if (_mode === 'edit')    setMode('split');
    else if (_mode === 'split') setMode('preview');
    else                     setMode('edit');
  }

  // ── Handle [[link]] autocomplete in editor ───────────────
  function handleBracketAutocomplete(e) {
    if (e.key === '[') {
      const start = elEditor.selectionStart;
      const val   = elEditor.value;
      // If the previous char is also '[', we just opened [[ 
      if (val[start - 1] === '[') {
        e.preventDefault();
        const before = val.slice(0, start - 1);
        const after  = val.slice(start);
        elEditor.value = `${before}[[]]${after}`;
        elEditor.selectionStart = elEditor.selectionEnd = start + 1;
      }
    }
  }

  // ── Bind events ──────────────────────────────────────────
  function init() {
    elEditor.addEventListener('input', () => {
      _dirty = true;
      updateStatus();
      scheduleAutoSave();
      if (_mode !== 'edit') renderPreview();
    });

    elEditor.addEventListener('keydown', handleBracketAutocomplete);

    // Ctrl+S — force save
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveNow();
      }
    });

    // Mode toggle
    elBtnMode.addEventListener('click', toggleMode);

    // Title rename
    elTitleInput.addEventListener('change', async () => {
      const newTitle = elTitleInput.value.trim();
      if (!newTitle || newTitle === _currentNote) return;

      const ok = await FileManager.renameNote(_currentNote, newTitle);
      if (ok) {
        const old = _currentNote;
        _currentNote = newTitle;
        elTitleDisplay.textContent = newTitle;
        App.refreshSidebar();
        App.showToast(`Renamed "${old}" → "${newTitle}"`, 'success');
      } else {
        App.showToast('Rename failed (title already exists?)', 'error');
        elTitleInput.value = _currentNote; // revert
      }
    });

    // Delete
    elBtnDelete.addEventListener('click', () => {
      if (!_currentNote) return;
      App.deleteCurrentNote();
    });
  }

  return {
    init,
    openNote,
    clearEditor,
    saveNow,
    getCurrentNote:  () => _currentNote,
    refreshLinksPanel,
    renderPreview,
  };
})();
