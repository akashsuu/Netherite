// ============================================================
// FILE: renderer/fileManager.js
// All note CRUD + link-map operations.
// Communicates with main via window.electronAPI.
// ============================================================

const FileManager = (() => {

  // ── In-memory state ──────────────────────────────────────
  /** @type {string[]} */
  let _notes   = [];

  /** @type {Map<string, Set<string>>}  noteA → Set of notes it links TO */
  const _linksFrom = new Map();

  /** @type {Map<string, Set<string>>}  noteB → Set of notes that link TO it */
  const _linksTo   = new Map();

  // ── Regex for [[WikiLinks]] ──────────────────────────────
  const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

  // ── Helpers ──────────────────────────────────────────────
  function extractLinks(content) {
    const links = new Set();
    let m;
    WIKILINK_RE.lastIndex = 0;
    while ((m = WIKILINK_RE.exec(content)) !== null) {
      links.add(m[1].trim());
    }
    return links;
  }

  /** Update the link maps when a note's content changes */
  function updateLinkMap(title, content) {
    // Remove old outgoing links for this note
    const oldLinks = _linksFrom.get(title) || new Set();
    oldLinks.forEach(target => {
      const backSet = _linksTo.get(target);
      if (backSet) backSet.delete(title);
    });

    // Compute new outgoing links
    const newLinks = extractLinks(content);
    _linksFrom.set(title, newLinks);

    // Update reverse map
    newLinks.forEach(target => {
      if (!_linksTo.has(target)) _linksTo.set(target, new Set());
      _linksTo.get(target).add(title);
    });
  }

  /** Build complete link maps from scratch (called on startup) */
  async function rebuildLinkMap() {
    _linksFrom.clear();
    _linksTo.clear();
    for (const title of _notes) {
      const content = await window.electronAPI.loadNote(title);
      if (content) updateLinkMap(title, content);
    }
  }

  // ── Public API ───────────────────────────────────────────

  /** Fetch and cache the list of notes */
  async function listNotes() {
    _notes = await window.electronAPI.listNotes();
    return [..._notes];
  }

  async function loadNote(title) {
    return window.electronAPI.loadNote(title);
  }

  async function saveNote(title, content) {
    updateLinkMap(title, content);
    return window.electronAPI.saveNote(title, content);
  }

  async function deleteNote(title) {
    const ok = await window.electronAPI.deleteNote(title);
    if (ok) {
      _notes = _notes.filter(n => n !== title);
      // Clean link maps
      const outLinks = _linksFrom.get(title) || new Set();
      outLinks.forEach(target => {
        const backSet = _linksTo.get(target);
        if (backSet) backSet.delete(title);
      });
      _linksFrom.delete(title);
      _linksTo.delete(title);
    }
    return ok;
  }

  async function createNote(title) {
    const finalTitle = await window.electronAPI.createNote(title || 'Untitled');
    _notes.push(finalTitle);
    return finalTitle;
  }

  async function renameNote(oldTitle, newTitle) {
    const ok = await window.electronAPI.renameNote(oldTitle, newTitle);
    if (ok) {
      _notes = _notes.map(n => n === oldTitle ? newTitle : n);
      // Migrate link maps
      if (_linksFrom.has(oldTitle)) {
        _linksFrom.set(newTitle, _linksFrom.get(oldTitle));
        _linksFrom.delete(oldTitle);
      }
      if (_linksTo.has(oldTitle)) {
        _linksTo.set(newTitle, _linksTo.get(oldTitle));
        _linksTo.delete(oldTitle);
      }
      // Update references in all other notes' linksFrom
      _linksFrom.forEach((targets, src) => {
        if (targets.has(oldTitle)) {
          targets.delete(oldTitle);
          targets.add(newTitle);
        }
      });
    }
    return ok;
  }

  /** Return notes that have outgoing links TO the given note (backlinks) */
  function getBacklinks(title) {
    return [...(_linksTo.get(title) || [])];
  }

  /** Return notes that the given note links TO (outgoing links) */
  function getOutlinks(title) {
    return [...(_linksFrom.get(title) || [])];
  }

  /** Return the entire link graph as { nodes, edges } for graph view */
  function getGraph() {
    const nodes = _notes.map(title => ({ id: title, label: title }));
    const edges = [];
    _linksFrom.forEach((targets, source) => {
      targets.forEach(target => {
        // Only include edges where target is a known note
        if (_notes.includes(target)) {
          edges.push({ from: source, to: target });
        }
      });
    });
    return { nodes, edges };
  }

  function getNotes()             { return [..._notes]; }
  function noteExists(title)      { return _notes.includes(title); }

  // Initialise link maps on startup
  async function init() {
    await listNotes();
    await rebuildLinkMap();
  }

  return {
    init,
    listNotes,
    loadNote,
    saveNote,
    deleteNote,
    createNote,
    renameNote,
    getBacklinks,
    getOutlinks,
    getGraph,
    getNotes,
    noteExists,
    extractLinks,
    updateLinkMap,
  };
})();
