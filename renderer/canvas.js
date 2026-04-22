// ============================================================
// FILE: renderer/canvas.js  —  Infinite Canvas (Obsidian-style)
// ============================================================
const Canvas = (() => {
  const STORAGE_KEY = 'netherite_canvas_v1';

  // DOM refs (populated in init)
  let overlay, viewport, world, svgEl, zoomLabel, notePicker, notePickerList, notePickerSearch;
  let imagePicker, linkPicker;
  let ctxMenu, ctxTargetId = null;

  // Sticky color palette map
  const COLOR_MAP = {
    default: { bg: '#1e1e2e', header: '#16162a', text: '#dcddde' },
    yellow:  { bg: '#fef08a', header: '#fde047', text: '#1a1a00' },
    green:   { bg: '#86efac', header: '#4ade80', text: '#052e16' },
    blue:    { bg: '#93c5fd', header: '#60a5fa', text: '#0c1a3d' },
    pink:    { bg: '#f9a8d4', header: '#f472b6', text: '#3d0a1e' },
    orange:  { bg: '#fdba74', header: '#fb923c', text: '#3a1200' },
    purple:  { bg: '#c4b5fd', header: '#a78bfa', text: '#1e0a3d' },
  };

  // Viewport transform
  let vpX = 0, vpY = 0, vpScale = 1;

  // Interaction state
  let isPanning = false;
  let panStart = { mx: 0, my: 0, vx: 0, vy: 0 };
  let draggingCard = null;
  let dragOffset = { x: 0, y: 0 };
  let selectedId = null;
  let isConnecting = false;
  let connectFrom = null;

  // Data
  let cards = [];
  let connections = [];
  let nextId = 1;

  // ── Transform helpers ─────────────────────────────────────
  function screenToWorld(cx, cy) {
    const r = viewport.getBoundingClientRect();
    return { x: (cx - r.left - vpX) / vpScale, y: (cy - r.top - vpY) / vpScale };
  }

  function cardCenterScreen(card) {
    const el = document.getElementById(`ccard-${card.id}`);
    if (!el) return null;
    const r = viewport.getBoundingClientRect();
    return {
      x: card.x * vpScale + vpX + r.left + el.offsetWidth  * vpScale / 2,
      y: card.y * vpScale + vpY + r.top  + el.offsetHeight * vpScale / 2,
    };
  }

  function applyTransform() {
    world.style.transform = `translate(${vpX}px,${vpY}px) scale(${vpScale})`;
    zoomLabel.textContent = `${Math.round(vpScale * 100)}%`;
    redrawConnections();
  }

  // ── Connections (SVG) ─────────────────────────────────────
  function redrawConnections() {
    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);

    // Arrow marker
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'cv-arrow');
    marker.setAttribute('markerWidth', '8'); marker.setAttribute('markerHeight', '6');
    marker.setAttribute('refX', '8'); marker.setAttribute('refY', '3');
    marker.setAttribute('orient', 'auto');
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', '0 0, 8 3, 0 6');
    poly.setAttribute('fill', '#7c5cff');
    marker.appendChild(poly); defs.appendChild(marker); svgEl.appendChild(defs);

    const vr = viewport.getBoundingClientRect();

    connections.forEach(conn => {
      const fc = cards.find(c => c.id === conn.from);
      const tc = cards.find(c => c.id === conn.to);
      if (!fc || !tc) return;
      const fs = cardCenterScreen(fc);
      const ts = cardCenterScreen(tc);
      if (!fs || !ts) return;
      const fx = fs.x - vr.left, fy = fs.y - vr.top;
      const tx = ts.x - vr.left, ty = ts.y - vr.top;
      const mx = (fx + tx) / 2;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M${fx},${fy} C${mx},${fy} ${mx},${ty} ${tx},${ty}`);
      path.setAttribute('stroke', '#7c5cff');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('fill', 'none');
      path.setAttribute('marker-end', 'url(#cv-arrow)');
      path.style.cursor = 'pointer';
      path.addEventListener('click', () => {
        if (confirm('Remove this connection?')) {
          connections = connections.filter(c => !(c.from === conn.from && c.to === conn.to));
          redrawConnections(); saveState();
        }
      });
      svgEl.appendChild(path);
    });
  }

  // ── Card rendering ────────────────────────────────────────
  function renderCard(card) {
    document.getElementById(`ccard-${card.id}`)?.remove();
    const el = document.createElement('div');
    el.className = `ccard ccard-${card.type}${card.id === selectedId ? ' selected' : ''}`;
    el.id = `ccard-${card.id}`;
    el.dataset.cardId = card.id;
    el.style.cssText = `left:${card.x}px;top:${card.y}px;width:${card.w}px;`;
    if (card.color && card.color !== 'default') applyCardColor(el, card.color);

    if (card.type === 'note') {
      const preview = (card.content || '').replace(/[#*`\[\]]/g,'').slice(0, 160).trim()
        || '<em style="opacity:0.4">Empty — double-click to open</em>';
      el.innerHTML = `
        <div class="ccard-header">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span class="ccard-title">${escHtml(card.title)}</span>
          <button class="ccard-del" title="Delete">✕</button>
        </div>
        <div class="ccard-body">${preview}</div>
        <div class="ccard-conn-handle" title="Drag to connect"></div>`;
    } else if (card.type === 'image') {
      const src  = escHtml(card.src  || '');
      const cap  = escHtml(card.caption || '');
      el.innerHTML = `
        <div class="ccard-header">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          <span class="ccard-title">${cap || 'Image'}</span>
          <button class="ccard-del" title="Delete">✕</button>
        </div>
        <div class="ccard-body ccard-img-body">
          <img src="${src}" alt="${cap}" class="ccard-img" draggable="false" />
          ${cap ? `<p class="ccard-img-caption">${cap}</p>` : ''}
        </div>
        <div class="ccard-conn-handle" title="Drag to connect"></div>`;
    } else if (card.type === 'link') {
      const displayUrl = escHtml(card.url || '');
      const title = escHtml(card.title || card.url || 'Link');
      const desc  = escHtml(card.description || '');
      // Extract hostname for favicon / display
      let host = '';
      try { host = new URL(card.url || '').hostname; } catch(_) {}
      el.innerHTML = `
        <div class="ccard-header">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          <span class="ccard-title">${title}</span>
          <button class="ccard-del" title="Delete">✕</button>
        </div>
        <div class="ccard-body ccard-link-body">
          ${desc ? `<p class="ccard-link-desc">${desc}</p>` : ''}
          <a class="ccard-link-url" data-href="${displayUrl}" title="${displayUrl}">
            ${host ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>` : ''}
            ${escHtml(host || displayUrl)}
          </a>
        </div>
        <div class="ccard-conn-handle" title="Drag to connect"></div>`;
    } else if (card.type === 'sticky') {
      el.innerHTML = `
        <div class="ccard-sticky-header">
          <span class="ccard-sticky-title" contenteditable="true" spellcheck="false">${escHtml(card.title||'')}</span>
          <button class="ccard-del" title="Delete">✕</button>
        </div>
        <div class="ccard-sticky-body ccard-editable" contenteditable="true" spellcheck="false">${card.content||''}</div>
        <div class="ccard-conn-handle" title="Drag to connect"></div>`;
    } else {
      el.innerHTML = `
        <div class="ccard-header">
          <span class="ccard-type-icon">T</span>
          <div class="ccard-title-edit" contenteditable="true" spellcheck="false">${escHtml(card.title||'Text')}</div>
          <button class="ccard-del" title="Delete">✕</button>
        </div>
        <div class="ccard-body ccard-editable" contenteditable="true" spellcheck="false">${card.content||''}</div>
        <div class="ccard-conn-handle" title="Drag to connect"></div>`;
    }

    world.appendChild(el);
    bindCardEl(el, card);
    return el;
  }

  function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function applyCardColor(el, color) {
    const c = COLOR_MAP[color] || COLOR_MAP.default;
    el.style.setProperty('--ccard-bg',     c.bg);
    el.style.setProperty('--ccard-header', c.header);
    el.style.setProperty('--ccard-text',   c.text);
    el.classList.toggle('ccard-colored', color !== 'default');
  }

  function bindCardEl(el, card) {
    el.addEventListener('mousedown', e => {
      if (e.target.classList.contains('ccard-del')) return;
      if (e.target.classList.contains('ccard-conn-handle')) return;
      if (e.target.contentEditable === 'true') { selectCard(card.id); return; }
      e.stopPropagation();
      selectCard(card.id);
      draggingCard = card;
      const wp = screenToWorld(e.clientX, e.clientY);
      dragOffset = { x: wp.x - card.x, y: wp.y - card.y };
    });

    if (card.type === 'note') {
      el.addEventListener('dblclick', e => {
        if (!e.target.classList.contains('ccard-del')) { close(); App.openNote(card.title); }
      });
    }

    el.querySelector('.ccard-del').addEventListener('click', e => { e.stopPropagation(); deleteCard(card.id); });

    el.querySelector('.ccard-conn-handle').addEventListener('mousedown', e => {
      e.stopPropagation(); e.preventDefault();
      isConnecting = true; connectFrom = card.id;
    });

    if (card.type === 'text') {
      el.querySelector('.ccard-editable').addEventListener('input', function() { card.content = this.innerHTML; saveState(); });
      el.querySelector('.ccard-title-edit')?.addEventListener('input', function() { card.title = this.textContent; saveState(); });
    }

    if (card.type === 'sticky') {
      el.querySelector('.ccard-sticky-body').addEventListener('input', function() { card.content = this.innerHTML; saveState(); });
      el.querySelector('.ccard-sticky-title').addEventListener('input', function() { card.title = this.textContent; saveState(); });
    }

    if (card.type === 'link') {
      el.querySelector('.ccard-link-url')?.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        const href = e.currentTarget.dataset.href;
        if (href && window.electronAPI?.openExternal) {
          window.electronAPI.openExternal(href);
        } else if (href) {
          window.open(href, '_blank', 'noopener');
        }
      });
    }
  }

  function selectCard(id) {
    document.getElementById(`ccard-${selectedId}`)?.classList.remove('selected');
    selectedId = id;
    document.getElementById(`ccard-${id}`)?.classList.add('selected');
  }

  function deleteCard(id) {
    cards = cards.filter(c => c.id !== id);
    connections = connections.filter(c => c.from !== id && c.to !== id);
    document.getElementById(`ccard-${id}`)?.remove();
    if (selectedId === id) selectedId = null;
    redrawConnections(); saveState();
  }

  // ── State persistence (localStorage) ─────────────────────
  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ cards, connections, nextId }));
  }
  function loadState() {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!s) return;
      cards = s.cards || []; connections = s.connections || []; nextId = s.nextId || 1;
    } catch(_) { cards = []; connections = []; nextId = 1; }
  }

  // ── Note picker ───────────────────────────────────────────
  function showNotePicker(cb) {
    const notes = FileManager.getNotes().sort((a,b) => a.localeCompare(b));
    function render(q) {
      const f = q ? notes.filter(n => n.toLowerCase().includes(q.toLowerCase())) : notes;
      notePickerList.innerHTML = f.map(n => `<div class="cnp-item" data-n="${escHtml(n)}">${escHtml(n)}</div>`).join('');
      notePickerList.querySelectorAll('.cnp-item').forEach(item => {
        item.addEventListener('click', () => { notePicker.classList.add('hidden'); cb(item.dataset.n); });
      });
    }
    notePickerSearch.value = ''; render('');
    notePickerSearch.oninput = () => render(notePickerSearch.value);
    notePicker.classList.remove('hidden');
    notePickerSearch.focus();
    document.getElementById('cnp-close').onclick = () => notePicker.classList.add('hidden');
  }

  // ── Add cards ─────────────────────────────────────────────
  function addNoteCard(title) {
    const cx = (viewport.clientWidth / 2 - vpX) / vpScale;
    const cy = (viewport.clientHeight / 2 - vpY) / vpScale;
    const content = FileManager.getContent ? FileManager.getContent(title) : '';
    const card = { id: nextId++, type: 'note', title, content: content||'', x: cx-160, y: cy-80, w: 320, h: 160 };
    cards.push(card); renderCard(card); saveState(); redrawConnections();
  }

  function addTextCard() {
    const cx = (viewport.clientWidth / 2 - vpX) / vpScale;
    const cy = (viewport.clientHeight / 2 - vpY) / vpScale;
    const card = { id: nextId++, type: 'text', title: 'Text', content: '', x: cx-120, y: cy-60, w: 240, h: 120 };
    cards.push(card);
    const el = renderCard(card); saveState();
    setTimeout(() => el.querySelector('.ccard-editable')?.focus(), 50);
  }

  function addImageCard(src, caption) {
    const cx = (viewport.clientWidth / 2 - vpX) / vpScale;
    const cy = (viewport.clientHeight / 2 - vpY) / vpScale;
    const card = { id: nextId++, type: 'image', src, caption: caption||'', x: cx-160, y: cy-120, w: 320 };
    cards.push(card); renderCard(card); saveState(); redrawConnections();
  }

  function addLinkCard(url, title, description) {
    const cx = (viewport.clientWidth / 2 - vpX) / vpScale;
    const cy = (viewport.clientHeight / 2 - vpY) / vpScale;
    const card = { id: nextId++, type: 'link', url, title: title||url, description: description||'', x: cx-160, y: cy-70, w: 320 };
    cards.push(card); renderCard(card); saveState(); redrawConnections();
  }

  function addStickyCard(x, y) {
    const cx = x !== undefined ? x : (viewport.clientWidth / 2 - vpX) / vpScale - 120;
    const cy = y !== undefined ? y : (viewport.clientHeight / 2 - vpY) / vpScale - 80;
    const card = { id: nextId++, type: 'sticky', title: '', content: '', color: 'yellow', x: cx, y: cy, w: 240 };
    cards.push(card);
    const el = renderCard(card); saveState();
    setTimeout(() => el.querySelector('.ccard-sticky-body')?.focus(), 50);
  }

  // ── Context Menu ──────────────────────────────────────────
  function showCtxMenu(screenX, screenY, cardId) {
    ctxTargetId = cardId;
    const card = cards.find(c => c.id === cardId);
    // Hide color section for image/link types (optional — keep for all)
    const colorSection = document.getElementById('cv-ctx-color-section');
    if (colorSection) colorSection.style.display = '';
    ctxMenu.classList.remove('hidden');
    const vr = viewport.getBoundingClientRect();
    let lx = screenX - vr.left, ly = screenY - vr.top;
    ctxMenu.style.left = `${lx}px`;
    ctxMenu.style.top  = `${ly}px`;
    // Nudge inside viewport
    requestAnimationFrame(() => {
      const mr = ctxMenu.getBoundingClientRect();
      const vRect = viewport.getBoundingClientRect();
      if (mr.right  > vRect.right)  ctxMenu.style.left = `${lx - (mr.right  - vRect.right)  - 4}px`;
      if (mr.bottom > vRect.bottom) ctxMenu.style.top  = `${ly - (mr.bottom - vRect.bottom) - 4}px`;
    });
  }

  function hideCtxMenu() {
    ctxMenu.classList.add('hidden');
    ctxTargetId = null;
  }

  function bindCtxMenu() {
    ctxMenu = document.getElementById('cv-context-menu');

    document.getElementById('cv-ctx-duplicate').addEventListener('click', () => {
      const card = cards.find(c => c.id === ctxTargetId);
      if (!card) return hideCtxMenu();
      const clone = JSON.parse(JSON.stringify(card));
      clone.id = nextId++; clone.x += 24; clone.y += 24;
      cards.push(clone); renderCard(clone); saveState(); redrawConnections();
      hideCtxMenu();
    });

    document.getElementById('cv-ctx-bring-front').addEventListener('click', () => {
      const idx = cards.findIndex(c => c.id === ctxTargetId);
      if (idx === -1) return hideCtxMenu();
      const [card] = cards.splice(idx, 1);
      cards.push(card);
      const el = document.getElementById(`ccard-${card.id}`);
      if (el) world.appendChild(el); // move to end = topmost
      saveState(); hideCtxMenu();
    });

    document.getElementById('cv-ctx-copy-text').addEventListener('click', () => {
      const card = cards.find(c => c.id === ctxTargetId);
      if (!card) return hideCtxMenu();
      const text = card.content
        ? card.content.replace(/<[^>]+>/g, '')
        : card.title || card.url || '';
      navigator.clipboard.writeText(text).catch(() => {});
      if (typeof App !== 'undefined') App.showToast('Content copied', 'success');
      hideCtxMenu();
    });

    document.getElementById('cv-ctx-delete').addEventListener('click', () => {
      if (ctxTargetId !== null) deleteCard(ctxTargetId);
      hideCtxMenu();
    });

    // Color swatches
    document.querySelectorAll('.cv-ctx-color').forEach(swatch => {
      swatch.addEventListener('click', () => {
        const color = swatch.dataset.color;
        const card  = cards.find(c => c.id === ctxTargetId);
        if (!card) return hideCtxMenu();
        card.color = color;
        const el = document.getElementById(`ccard-${card.id}`);
        if (el) applyCardColor(el, color);
        saveState(); hideCtxMenu();
      });
    });

    // Dismiss on outside click
    viewport.addEventListener('mousedown', e => {
      if (!ctxMenu.contains(e.target)) hideCtxMenu();
    });
    // Dismiss on right-click on empty area
    viewport.addEventListener('contextmenu', e => {
      if (e.target === viewport || e.target === world || e.target === svgEl) {
        e.preventDefault();
        hideCtxMenu();
        // Double right-click on empty canvas → add sticky at cursor
      }
    });
  }

  // ── Image Picker ──────────────────────────────────────────
  function showImagePicker() {
    const urlInput    = document.getElementById('cv-img-url');
    const captionInput = document.getElementById('cv-img-caption');
    const previewWrap = document.getElementById('cv-img-preview-wrap');
    const previewImg  = document.getElementById('cv-img-preview');
    const fileInput   = document.getElementById('cv-img-file-input');
    const fileName    = document.getElementById('cv-img-file-name');
    const urlSection  = document.getElementById('cv-img-url-section');
    const fileSection = document.getElementById('cv-img-file-section');
    const tabUrl      = document.getElementById('cv-img-tab-url');
    const tabFile     = document.getElementById('cv-img-tab-file');
    const dropZone    = document.getElementById('cv-img-drop-zone');

    // Reset
    urlInput.value = ''; captionInput.value = '';
    previewWrap.classList.add('hidden'); previewImg.src = '';
    fileInput.value = ''; fileName.classList.add('hidden');
    urlSection.classList.remove('hidden'); fileSection.classList.add('hidden');
    tabUrl.classList.add('active'); tabFile.classList.remove('active');

    let activeTab = 'url';
    let dataUrl = null;

    tabUrl.onclick = () => { activeTab='url'; tabUrl.classList.add('active'); tabFile.classList.remove('active'); urlSection.classList.remove('hidden'); fileSection.classList.add('hidden'); };
    tabFile.onclick = () => { activeTab='file'; tabFile.classList.add('active'); tabUrl.classList.remove('active'); fileSection.classList.remove('hidden'); urlSection.classList.add('hidden'); };

    // URL live preview
    urlInput.oninput = () => {
      const v = urlInput.value.trim();
      if (v) { previewImg.src = v; previewWrap.classList.remove('hidden'); }
      else { previewWrap.classList.add('hidden'); }
    };

    // File browse
    document.getElementById('cv-img-browse').onclick = () => fileInput.click();
    fileInput.onchange = () => {
      const file = fileInput.files[0];
      if (!file) return;
      fileName.textContent = file.name; fileName.classList.remove('hidden');
      const reader = new FileReader();
      reader.onload = e => { dataUrl = e.target.result; };
      reader.readAsDataURL(file);
    };

    // Drag & Drop
    dropZone.ondragover = e => { e.preventDefault(); dropZone.classList.add('cv-drop-active'); };
    dropZone.ondragleave = () => dropZone.classList.remove('cv-drop-active');
    dropZone.ondrop = e => {
      e.preventDefault(); dropZone.classList.remove('cv-drop-active');
      const file = e.dataTransfer.files[0];
      if (!file || !file.type.startsWith('image/')) return;
      fileName.textContent = file.name; fileName.classList.remove('hidden');
      const reader = new FileReader();
      reader.onload = ev => { dataUrl = ev.target.result; };
      reader.readAsDataURL(file);
    };

    imagePicker.classList.remove('hidden');
    urlInput.focus();

    document.getElementById('cv-img-close').onclick = () => imagePicker.classList.add('hidden');
    document.getElementById('cv-img-cancel').onclick = () => imagePicker.classList.add('hidden');
    document.getElementById('cv-img-confirm').onclick = () => {
      const caption = captionInput.value.trim();
      if (activeTab === 'url') {
        const url = urlInput.value.trim();
        if (!url) { urlInput.focus(); return; }
        imagePicker.classList.add('hidden');
        addImageCard(url, caption);
      } else {
        if (!dataUrl) { return; }
        imagePicker.classList.add('hidden');
        addImageCard(dataUrl, caption);
      }
    };
  }

  // ── Link Picker ───────────────────────────────────────────
  function showLinkPicker() {
    const urlInput   = document.getElementById('cv-link-url');
    const titleInput = document.getElementById('cv-link-title');
    const descInput  = document.getElementById('cv-link-desc');

    urlInput.value = ''; titleInput.value = ''; descInput.value = '';
    linkPicker.classList.remove('hidden');
    urlInput.focus();

    // Auto-fill title from URL on blur
    urlInput.onblur = () => {
      if (urlInput.value.trim() && !titleInput.value.trim()) {
        try {
          titleInput.value = new URL(urlInput.value.trim()).hostname;
        } catch(_) {}
      }
    };

    document.getElementById('cv-link-close').onclick  = () => linkPicker.classList.add('hidden');
    document.getElementById('cv-link-cancel').onclick = () => linkPicker.classList.add('hidden');
    document.getElementById('cv-link-confirm').onclick = () => {
      const url = urlInput.value.trim();
      if (!url) { urlInput.focus(); return; }
      const title = titleInput.value.trim();
      const desc  = descInput.value.trim();
      linkPicker.classList.add('hidden');
      addLinkCard(url, title, desc);
    };

    // Enter key confirms
    [urlInput, titleInput, descInput].forEach(inp => {
      inp.onkeydown = e => { if (e.key === 'Enter') document.getElementById('cv-link-confirm').click(); };
    });
  }

  // ── Viewport events ───────────────────────────────────────
  function bindEvents() {
    // Pan start
    viewport.addEventListener('mousedown', e => {
      if (e.target === viewport || e.target === world || e.target === svgEl) {
        isPanning = true;
        panStart = { mx: e.clientX, my: e.clientY, vx: vpX, vy: vpY };
        viewport.style.cursor = 'grabbing';
        selectCard(null); selectedId = null;
      }
    });

    // Move
    window.addEventListener('mousemove', e => {
      if (isPanning) {
        vpX = panStart.vx + e.clientX - panStart.mx;
        vpY = panStart.vy + e.clientY - panStart.my;
        applyTransform();
      }
      if (draggingCard) {
        const wp = screenToWorld(e.clientX, e.clientY);
        draggingCard.x = wp.x - dragOffset.x;
        draggingCard.y = wp.y - dragOffset.y;
        const el = document.getElementById(`ccard-${draggingCard.id}`);
        if (el) { el.style.left = `${draggingCard.x}px`; el.style.top = `${draggingCard.y}px`; }
        redrawConnections();
      }
      if (isConnecting && connectFrom) {
        redrawConnections();
        const from = cardCenterScreen(cards.find(c => c.id === connectFrom));
        if (from) {
          const vr = viewport.getBoundingClientRect();
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.id = 'cv-temp-line';
          line.setAttribute('x1', from.x - vr.left); line.setAttribute('y1', from.y - vr.top);
          line.setAttribute('x2', e.clientX - vr.left); line.setAttribute('y2', e.clientY - vr.top);
          line.setAttribute('stroke', '#7c5cff'); line.setAttribute('stroke-width', '2');
          line.setAttribute('stroke-dasharray', '6,4');
          document.getElementById('cv-temp-line')?.remove();
          svgEl.appendChild(line);
        }
      }
    });

    // Release
    window.addEventListener('mouseup', e => {
      if (isPanning) { isPanning = false; viewport.style.cursor = 'grab'; }
      if (draggingCard) { saveState(); draggingCard = null; }
      if (isConnecting && connectFrom) {
        document.getElementById('cv-temp-line')?.remove();
        const hit = document.elementsFromPoint(e.clientX, e.clientY)
          .find(el => el.classList.contains('ccard') && el.dataset.cardId != connectFrom);
        if (hit) {
          const toId = parseInt(hit.dataset.cardId);
          const dup = connections.find(c => (c.from===connectFrom&&c.to===toId)||(c.from===toId&&c.to===connectFrom));
          if (!dup) { connections.push({ from: connectFrom, to: toId }); saveState(); }
        }
        isConnecting = false; connectFrom = null; redrawConnections();
      }
    });

    // Zoom
    viewport.addEventListener('wheel', e => {
      e.preventDefault();
      const vr = viewport.getBoundingClientRect();
      const mx = e.clientX - vr.left, my = e.clientY - vr.top;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const ns = Math.min(Math.max(vpScale * delta, 0.1), 3);
      vpX = mx - (mx - vpX) * (ns / vpScale);
      vpY = my - (my - vpY) * (ns / vpScale);
      vpScale = ns; applyTransform();
    }, { passive: false });

    // Keyboard
    document.addEventListener('keydown', e => {
      if (overlay.classList.contains('hidden')) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && document.activeElement.contentEditable !== 'true') {
        deleteCard(selectedId);
      }
      if (e.key === 'Escape') {
        if (!notePicker.classList.contains('hidden')) { notePicker.classList.add('hidden'); return; }
        close();
      }
      if ((e.ctrlKey||e.metaKey) && e.key === '0') { vpX=0; vpY=0; vpScale=1; applyTransform(); }
    });

    // Toolbar buttons
    document.getElementById('btn-cv-add-note').addEventListener('click', () => showNotePicker(addNoteCard));
    document.getElementById('btn-cv-add-text').addEventListener('click', addTextCard);
    document.getElementById('btn-cv-add-image').addEventListener('click', showImagePicker);
    document.getElementById('btn-cv-add-link').addEventListener('click', showLinkPicker);
    document.getElementById('btn-cv-add-sticky').addEventListener('click', () => addStickyCard());
    document.getElementById('btn-cv-reset').addEventListener('click', () => { vpX=0;vpY=0;vpScale=1;applyTransform(); });
    document.getElementById('btn-cv-close').addEventListener('click', close);
    document.getElementById('btn-cv-zoom-in').addEventListener('click', () => { vpScale=Math.min(vpScale*1.2,3); applyTransform(); });
    document.getElementById('btn-cv-zoom-out').addEventListener('click', () => { vpScale=Math.max(vpScale/1.2,0.1); applyTransform(); });
    document.getElementById('btn-cv-clear').addEventListener('click', () => {
      if (confirm('Clear all cards and connections?')) {
        cards=[]; connections=[]; world.innerHTML=''; redrawConnections(); saveState();
      }
    });

    bindCtxMenu();

    // Close pickers on Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (!imagePicker.classList.contains('hidden')) { imagePicker.classList.add('hidden'); return; }
        if (!linkPicker.classList.contains('hidden')) { linkPicker.classList.add('hidden'); return; }
      }
    });

    // Resize observer to redraw connections on window resize
    window.addEventListener('resize', redrawConnections);
  }

  function open() {
    loadState();
    overlay.classList.remove('hidden');
    // Re-render all cards
    world.innerHTML = '';
    cards.forEach(c => renderCard(c));
    requestAnimationFrame(() => { applyTransform(); });
  }

  function close() {
    overlay.classList.add('hidden');
  }

  function init() {
    overlay          = document.getElementById('canvas-overlay');
    viewport         = document.getElementById('cv-viewport');
    world            = document.getElementById('cv-world');
    svgEl            = document.getElementById('cv-svg');
    zoomLabel        = document.getElementById('cv-zoom-label');
    notePicker       = document.getElementById('cv-note-picker');
    notePickerList   = document.getElementById('cv-note-picker-list');
    notePickerSearch = document.getElementById('cv-note-picker-search');
    imagePicker      = document.getElementById('cv-image-picker');
    linkPicker       = document.getElementById('cv-link-picker');
    world.style.transformOrigin = '0 0';
    bindEvents();
  }

  return { init, open, close };
})();
