// ============================================================
// FILE: renderer/graph.js
// Force-directed knowledge graph rendered on an HTML canvas.
// Nodes = notes, Edges = [[wikilinks]] between them.
// No external lib required — pure canvas physics simulation.
// ============================================================

const Graph = (() => {

  // ── DOM ──────────────────────────────────────────────────
  const overlay     = document.getElementById('graph-overlay');
  const canvas      = document.getElementById('graph-canvas');
  const ctx         = canvas.getContext('2d');
  const tooltip     = document.getElementById('graph-tooltip');
  const searchInput = document.getElementById('graph-search');
  const btnClose    = document.getElementById('btn-graph-close');

  // ── Simulation constants ─────────────────────────────────
  const REPULSION    = 4000;   // node-node repulsion strength
  const SPRING_K     = 0.05;   // edge spring stiffness
  const SPRING_L     = 160;    // natural spring length
  const DAMPING      = 0.82;   // velocity damping
  const NODE_RADIUS  = 20;
  const ITERATIONS   = 1;      // physics steps per frame
  const MAX_SPEED    = 8;

  // ── Graph state ──────────────────────────────────────────
  let nodes   = [];   // { id, x, y, vx, vy, label }
  let edges   = [];   // { from, to }
  let running = false;
  let animId  = null;
  let filterText = '';
  let activeNote = null;

  // ── Camera (pan + zoom) ──────────────────────────────────
  let cam = { x: 0, y: 0, scale: 1 };
  let isDraggingCam   = false;
  let dragStart       = { x: 0, y: 0 };
  let isDraggingNode  = null;  // node being dragged

  // ── Colours (match CSS vars) ─────────────────────────────
  const COLORS = {
    nodeNormal:   '#4a4a60',
    nodeLinked:   '#9d6fff',
    nodeActive:   '#7c4dff',
    nodeFiltered: '#50505f',
    nodeBorder:   '#7c4dff',
    edge:         'rgba(124,77,255,0.25)',
    edgeActive:   'rgba(124,77,255,0.7)',
    label:        '#c8c8d8',
    labelActive:  '#fff',
    bg:           '#141417',
  };

  // ── Resize canvas ────────────────────────────────────────
  function resizeCanvas() {
    const wrap = canvas.parentElement;
    canvas.width  = wrap.clientWidth;
    canvas.height = wrap.clientHeight;
  }

  // ── Build node/edge arrays from FileManager ───────────────
  function buildGraph() {
    const data = FileManager.getGraph();
    activeNote = Editor.getCurrentNote();

    // Centre randomly in canvas space
    const cx = canvas.width  / 2;
    const cy = canvas.height / 2;

    // Keep existing positions for notes that were already in graph
    const oldPosMap = new Map(nodes.map(n => [n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy }]));

    nodes = data.nodes.map(n => {
      const old = oldPosMap.get(n.id);
      return {
        id:    n.id,
        label: n.label,
        x:     old ? old.x : cx + (Math.random() - 0.5) * 300,
        y:     old ? old.y : cy + (Math.random() - 0.5) * 300,
        vx:    old ? old.vx : 0,
        vy:    old ? old.vy : 0,
      };
    });

    edges = data.edges;
  }

  // ── Force layout step ────────────────────────────────────
  function physicsStep() {
    const n = nodes.length;

    // Repulsion between every pair of nodes
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = REPULSION / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx -= fx; a.vy -= fy;
        b.vx += fx; b.vy += fy;
      }
    }

    // Spring attraction along edges
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    edges.forEach(e => {
      const a = nodeMap.get(e.from);
      const b = nodeMap.get(e.to);
      if (!a || !b) return;
      const dx   = b.x - a.x;
      const dy   = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const disp = dist - SPRING_L;
      const fx   = (dx / dist) * SPRING_K * disp;
      const fy   = (dy / dist) * SPRING_K * disp;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    });

    // Gravity toward centre
    const cx = canvas.width  / 2;
    const cy = canvas.height / 2;
    nodes.forEach(node => {
      node.vx += (cx - node.x) * 0.003;
      node.vy += (cy - node.y) * 0.003;
    });

    // Integrate + damp
    nodes.forEach(node => {
      if (node === isDraggingNode) return; // don't move dragged node
      node.vx *= DAMPING;
      node.vy *= DAMPING;
      // clamp speed
      const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
      if (speed > MAX_SPEED) { node.vx = (node.vx/speed)*MAX_SPEED; node.vy = (node.vy/speed)*MAX_SPEED; }
      node.x += node.vx;
      node.y += node.vy;
    });
  }

  // ── Helpers: world ↔ screen coords ───────────────────────
  function worldToScreen(wx, wy) {
    return {
      x: wx * cam.scale + cam.x,
      y: wy * cam.scale + cam.y,
    };
  }
  function screenToWorld(sx, sy) {
    return {
      x: (sx - cam.x) / cam.scale,
      y: (sy - cam.y) / cam.scale,
    };
  }

  // ── Draw ─────────────────────────────────────────────────
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(cam.x, cam.y);
    ctx.scale(cam.scale, cam.scale);

    const nodeMap     = new Map(nodes.map(n => [n.id, n]));
    const linkedNotes = new Set();
    if (activeNote) {
      FileManager.getOutlinks(activeNote).forEach(t => linkedNotes.add(t));
      FileManager.getBacklinks(activeNote).forEach(t => linkedNotes.add(t));
    }

    // Draw edges
    edges.forEach(e => {
      const a = nodeMap.get(e.from);
      const b = nodeMap.get(e.to);
      if (!a || !b) return;
      const isActiveEdge = e.from === activeNote || e.to === activeNote;

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = isActiveEdge ? COLORS.edgeActive : COLORS.edge;
      ctx.lineWidth   = isActiveEdge ? 2 : 1;
      ctx.stroke();
    });

    // Draw nodes
    nodes.forEach(node => {
      const isActive   = node.id === activeNote;
      const isLinked   = linkedNotes.has(node.id);
      const isFiltered = filterText && !node.label.toLowerCase().includes(filterText);
      const r = isActive ? NODE_RADIUS * 1.3 : NODE_RADIUS;

      // Glow for active node
      if (isActive) {
        ctx.shadowColor = COLORS.nodeActive;
        ctx.shadowBlur  = 20;
      }

      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fillStyle = isFiltered ? COLORS.nodeFiltered
                    : isActive   ? COLORS.nodeActive
                    : isLinked   ? COLORS.nodeLinked
                    : COLORS.nodeNormal;
      ctx.fill();

      ctx.shadowBlur = 0;

      // Border
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = isActive ? '#fff' : 'rgba(255,255,255,0.12)';
      ctx.lineWidth   = isActive ? 2.5 : 1;
      ctx.stroke();

      // Label
      if (!isFiltered) {
        ctx.font      = `${isActive ? 600 : 400} ${isActive ? 13 : 12}px Inter, sans-serif`;
        ctx.fillStyle = isActive ? COLORS.labelActive : COLORS.label;
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x, node.y + r + 14);
      }
    });

    ctx.restore();
  }

  // ── Animation loop ───────────────────────────────────────
  function loop() {
    for (let i = 0; i < ITERATIONS; i++) physicsStep();
    draw();
    if (running) animId = requestAnimationFrame(loop);
  }

  // ── Node hit-test (in world space) ───────────────────────
  function hitNode(wx, wy) {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const r = n.id === activeNote ? NODE_RADIUS * 1.3 : NODE_RADIUS;
      const dx = wx - n.x, dy = wy - n.y;
      if (dx*dx + dy*dy <= r*r) return n;
    }
    return null;
  }

  // ── Mouse events ─────────────────────────────────────────
  function bindMouseEvents() {
    let lastMouse = { x: 0, y: 0 };
    let clickStartPos = null;

    canvas.addEventListener('mousedown', e => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const wp = screenToWorld(sx, sy);
      clickStartPos = { x: sx, y: sy };
      const hit = hitNode(wp.x, wp.y);
      if (hit) {
        isDraggingNode = hit;
      } else {
        isDraggingCam = true;
        dragStart = { x: sx - cam.x, y: sy - cam.y };
      }
    });

    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      const sx   = e.clientX - rect.left;
      const sy   = e.clientY - rect.top;
      lastMouse  = { x: sx, y: sy };

      if (isDraggingNode) {
        const wp = screenToWorld(sx, sy);
        isDraggingNode.x  = wp.x;
        isDraggingNode.y  = wp.y;
        isDraggingNode.vx = 0;
        isDraggingNode.vy = 0;
      } else if (isDraggingCam) {
        cam.x = sx - dragStart.x;
        cam.y = sy - dragStart.y;
      }

      // Tooltip
      const wp  = screenToWorld(sx, sy);
      const hit = hitNode(wp.x, wp.y);
      if (hit) {
        tooltip.textContent = hit.label;
        tooltip.classList.remove('hidden');
        tooltip.style.left = `${sx}px`;
        tooltip.style.top  = `${sy}px`;
        canvas.style.cursor = 'pointer';
      } else {
        tooltip.classList.add('hidden');
        canvas.style.cursor = isDraggingCam ? 'grabbing' : 'grab';
      }
    });

    canvas.addEventListener('mouseup', e => {
      const rect = canvas.getBoundingClientRect();
      const sx   = e.clientX - rect.left;
      const sy   = e.clientY - rect.top;

      // Click (not drag) on a node → open note
      if (clickStartPos) {
        const dx = sx - clickStartPos.x;
        const dy = sy - clickStartPos.y;
        const moved = Math.sqrt(dx*dx + dy*dy);
        if (moved < 5 && isDraggingNode) {
          const title = isDraggingNode.id;
          close();
          App.openNote(title);
        }
      }

      isDraggingNode = null;
      isDraggingCam  = false;
      clickStartPos  = null;
      canvas.style.cursor = 'grab';
    });

    canvas.addEventListener('mouseleave', () => {
      isDraggingNode = null;
      isDraggingCam  = false;
      tooltip.classList.add('hidden');
    });

    // Scroll to zoom
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const rect  = canvas.getBoundingClientRect();
      const sx    = e.clientX - rect.left;
      const sy    = e.clientY - rect.top;
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.min(Math.max(cam.scale * delta, 0.2), 4);
      // Zoom toward cursor
      cam.x = sx - (sx - cam.x) * (newScale / cam.scale);
      cam.y = sy - (sy - cam.y) * (newScale / cam.scale);
      cam.scale = newScale;
    }, { passive: false });
  }

  // ── Open / Close overlay ─────────────────────────────────
  function open() {
    overlay.classList.remove('hidden');
    resizeCanvas();
    buildGraph();

    // Reset camera to center
    cam = { x: 0, y: 0, scale: 1 };

    running = true;
    loop();
  }

  function close() {
    running = false;
    cancelAnimationFrame(animId);
    overlay.classList.add('hidden');
  }

  // ── Filter ───────────────────────────────────────────────
  searchInput.addEventListener('input', () => {
    filterText = searchInput.value.trim().toLowerCase();
  });

  // ── Init ─────────────────────────────────────────────────
  function init() {
    bindMouseEvents();
    btnClose.addEventListener('click', close);
    window.addEventListener('resize', () => { if (!overlay.classList.contains('hidden')) resizeCanvas(); });
    // Close on overlay backdrop click
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  }

  return { init, open, close, rebuild: buildGraph };
})();
