/* Goe Admin: map editor, things, camera training, learning, settings */
(function () {
  const I = window.Icons, V = window.Venue, R = window.Router, VIS = window.Vision, H = window.HOUSE;
  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const SNAP = 5;
  const KIND = {
    living: ["#E6EEFF", "#3563E9"], room: ["#F0E9FF", "#7A4FE0"], service: ["#FFF1E3", "#D9730D"], shared: ["#E2F6EE", "#0E9F6E"],
    circulation: ["#F3F5F9", "#8590A6"], stairs: ["#FCEBDD", "#C2621C"], work: ["#E5F1FB", "#2B7BBF"],
  };
  const KIND_LABEL = { living: "Living / sitting", room: "Bedroom / room", service: "Kitchen / store / toilet", shared: "Shared space", circulation: "Corridor / hall", stairs: "Stairs", work: "Work / study" };
  const OBJECT_TYPES = [
    ["Bed", "bed-double"], ["Sofa", "sofa"], ["TV", "tv"], ["Fridge", "refrigerator"], ["Cooker", "chef-hat"], ["Microwave", "microwave"],
    ["Sink", "bath"], ["Dining table", "utensils"], ["Desk", "lamp-desk"], ["Chair", "armchair"], ["Toilet", "toilet"], ["Shower", "shower-head"],
    ["Wardrobe", "shirt"], ["Shelf", "archive"], ["Drawer", "box"], ["Washing machine", "washing-machine"], ["Wi-Fi router", "router"],
    ["Socket", "plug"], ["Lamp", "lamp"], ["Key holder", "key"], ["Bin", "trash-2"], ["Other", "map-pin"],
  ];

  const A = {
    v: null, floor: null, tool: "select", sel: null, view: null,
    showGraph: false, showPlan: true, undo: [], redo: [], dirty: false,
    pin: sessionStorage.getItem("goe.admin.pin") || "", canWrite: false, storage: false,
    pendingStairs: null, measure: null, route: null, drag: null, pointers: new Map(),
  };

  // ---------------- utils ----------------
  const uid = (p) => p + "_" + Math.random().toString(36).slice(2, 7);
  const snap = (n) => Math.round(n / SNAP) * SNAP;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function toast(msg, ms = 2600) { const t = $("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), ms); }
  function el(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  function svgIcon(parent, name, x, y, size, color) {
    const g = el("g", { transform: `translate(${x - size / 2} ${y - size / 2}) scale(${size / 24})`, fill: "none", stroke: color, "stroke-width": 2.2, "stroke-linecap": "round", "stroke-linejoin": "round", "pointer-events": "none" }, parent);
    g.innerHTML = I.inner(name); return g;
  }
  const floors = () => Object.entries(A.v.floors).sort((a, b) => (b[1].level || 0) - (a[1].level || 0));
  const roomOf = (f, x, y) => V.bestRoomAt(A.v, f, x, y);
  const findSel = () => {
    if (!A.sel) return null;
    const list = { room: A.v.rooms, door: A.v.doors, object: A.v.objects, stairs: A.v.stairs, waypoint: A.v.waypoints }[A.sel.kind];
    return list && list.find((x) => x.id === A.sel.id);
  };

  // ---------------- state changes ----------------
  function snapshot() { return JSON.stringify(A.v); }
  function pushUndo(s) { A.undo.push(s || snapshot()); if (A.undo.length > 60) A.undo.shift(); A.redo = []; }
  function commit(fn) { pushUndo(); fn(); changed(); }
  function changed(opts = {}) {
    V.apply(A.v);
    try { localStorage.setItem("goe.venue.draft", JSON.stringify({ ...A.v, draftSavedAt: new Date().toISOString() })); } catch (e) { toast("Draft too big for this browser — publish to save"); }
    if (!opts.silent) { A.dirty = true; updateSaveState(); }
    renderAll();
  }
  function updateSaveState() {
    const s = $("save-state");
    s.textContent = A.dirty ? "Unpublished changes" : "Published";
    s.classList.toggle("dirty", A.dirty);
  }
  $("ed-undo").onclick = undo; $("ed-redo").onclick = redo;
  function undo() { if (!A.undo.length) return; A.redo.push(snapshot()); A.v = JSON.parse(A.undo.pop()); A.sel = null; changed(); }
  function redo() { if (!A.redo.length) return; A.undo.push(snapshot()); A.v = JSON.parse(A.redo.pop()); A.sel = null; changed(); }

  // ---------------- tabs ----------------
  document.querySelectorAll("#atabs button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#atabs button").forEach((x) => x.classList.toggle("on", x === b));
    document.querySelectorAll(".apane").forEach((p) => p.classList.toggle("on", p.id === "pane-" + b.dataset.tab));
    if (b.dataset.tab === "map") requestAnimationFrame(renderEditor);
    if (b.dataset.tab === "things") renderThings();
    if (b.dataset.tab === "train") renderSpots();
    if (b.dataset.tab === "settings") renderSettings();
  }));

  // =====================================================================
  // MAP EDITOR
  // =====================================================================
  const svg = $("ed");
  document.querySelectorAll("#ed-tools [data-tool]").forEach((b) => b.addEventListener("click", () => setTool(b.dataset.tool)));
  function setTool(t) {
    A.tool = t; A.pendingStairs = t === "stairs" ? A.pendingStairs : null;
    document.querySelectorAll("#ed-tools [data-tool]").forEach((b) => b.classList.toggle("on", b.dataset.tool === t));
    const hints = {
      select: "Click to select · drag to move · drag corners to resize · drag empty space to pan",
      room: "Drag a rectangle to draw a room",
      door: "Click on a wall between two rooms (it snaps to the nearest wall)",
      object: "Click where the object is (bed, fridge, TV…)",
      stairs: A.pendingStairs ? "Now switch floor and click where the stairs arrive" : "Click where the stairs start on this floor",
      waypoint: "Click to add an extra walking point inside a room",
      measure: "Click two points of something you know the real length of",
    };
    $("ed-hint").textContent = hints[t] || "";
    svg.style.cursor = t === "select" ? "default" : "crosshair";
  }
  $("ed-graph").onclick = () => { A.showGraph = !A.showGraph; $("ed-graph").classList.toggle("on", A.showGraph); renderEditor(); };
  $("ed-plan").onclick = () => { A.showPlan = !A.showPlan; $("ed-plan").classList.toggle("on", A.showPlan); renderEditor(); };
  $("ed-fit").onclick = () => { fitView(); renderEditor(); };
  $("ed-zin").onclick = () => zoomAt(0.8); $("ed-zout").onclick = () => zoomAt(1.25);

  function fitView() {
    const b = H.bounds || [0, 0, 600, 800];
    const pad = 60;
    A.view = { x: b[0] - pad, y: b[1] - pad, w: b[2] - b[0] + pad * 2, h: b[3] - b[1] + pad * 2 };
  }
  function zoomAt(f, cx, cy) {
    const v = A.view;
    cx = cx ?? v.x + v.w / 2; cy = cy ?? v.y + v.h / 2;
    const nw = Math.max(80, Math.min(4000, v.w * f)), k = nw / v.w;
    A.view = { x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k, w: nw, h: v.h * k };
    renderEditor();
  }
  function toSvg(e) {
    const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    return p.matrixTransform(svg.getScreenCTM().inverse());
  }
  const unitsPerPx = () => A.view.w / Math.max(1, svg.clientWidth);

  function renderFloors() {
    const box = $("ed-floors"); box.innerHTML = "";
    floors().forEach(([id, f]) => {
      const b = document.createElement("button");
      b.className = id === A.floor ? "on" : ""; b.textContent = f.name;
      b.onclick = () => { A.floor = id; A.sel = null; renderAll(); if (A.tool === "stairs" && A.pendingStairs) setTool("stairs"); };
      box.appendChild(b);
    });
  }

  function renderEditor() {
    if (!A.view) fitView();
    const v = A.view, k = unitsPerPx(), f = A.floor;
    svg.setAttribute("viewBox", `${v.x} ${v.y} ${v.w} ${v.h}`);
    svg.innerHTML = "";
    const defs = el("defs", {}, svg);
    const pat = el("pattern", { id: "grid", width: 20, height: 20, patternUnits: "userSpaceOnUse" }, defs);
    el("path", { d: "M20 0H0V20", fill: "none", stroke: "#E2E7F0", "stroke-width": 1 }, pat);
    el("rect", { x: v.x - 2000, y: v.y - 2000, width: v.w + 4000, height: v.h + 4000, fill: "url(#grid)", "data-bg": 1 }, svg);

    const plan = A.v.plans && A.v.plans[f];
    if (A.showPlan && plan && plan.src) {
      el("image", { href: plan.src, x: plan.x || 0, y: plan.y || 0, width: plan.w || 1000, height: (plan.w || 1000) * 3, preserveAspectRatio: "xMinYMin meet", opacity: plan.opacity ?? 0.45, "pointer-events": "none" }, svg);
    }

    // rooms
    for (const r of A.v.rooms.filter((r) => r.floor === f)) {
      const [x1, y1, x2, y2] = r.rect, c = KIND[r.kind] || KIND.circulation;
      const sel = A.sel && A.sel.kind === "room" && A.sel.id === r.id;
      el("rect", { x: x1, y: y1, width: x2 - x1, height: y2 - y1, fill: c[0], "fill-opacity": A.showPlan && plan ? 0.72 : 1, stroke: sel ? "#2F5BFF" : "#7D8AA5", "stroke-width": (sel ? 3 : 1.5) * k, "stroke-dasharray": r.hidden ? `${6 * k} ${4 * k}` : null, "data-k": "room", "data-id": r.id, class: "ed-room" }, svg);
      const fs = Math.max(10 * k, Math.min(16 * k, (x2 - x1) / 8));
      svgIcon(svg, r.icon || "map-pin", (x1 + x2) / 2, (y1 + y2) / 2 - fs, fs * 1.5, c[1]);
      const t = el("text", { x: (x1 + x2) / 2, y: (y1 + y2) / 2 + fs * 0.9, "text-anchor": "middle", "font-size": fs, "font-weight": 650, fill: "#2A3448", "pointer-events": "none" }, svg);
      t.textContent = r.name;
    }

    // walkways (generated graph)
    if (A.showGraph) {
      for (const [a, b, type] of H.edges) {
        const na = H.nodes[a], nb = H.nodes[b];
        if (!na || !nb || na.floor !== f || nb.floor !== f || type === "stairs") continue;
        const key = V.edgeKey(a, b), meta = A.v.edgeMeta[key] || {};
        el("line", { x1: na.x, y1: na.y, x2: nb.x, y2: nb.y, stroke: meta.penalty > 1 ? "#F08C00" : "#2F5BFF", "stroke-width": 2 * k, opacity: 0.45, "data-k": "edge", "data-id": key, class: "ed-edge" }, svg);
      }
      for (const key in A.v.edgeMeta) {
        if (!A.v.edgeMeta[key].blocked) continue;
        const [a, b] = key.split("|"), na = H.nodes[a], nb = H.nodes[b];
        if (!na || !nb || na.floor !== f) continue;
        el("line", { x1: na.x, y1: na.y, x2: nb.x, y2: nb.y, stroke: "#E5484D", "stroke-width": 3 * k, "stroke-dasharray": `${6 * k} ${5 * k}`, "data-k": "edge", "data-id": key, class: "ed-edge" }, svg);
      }
      for (const id in H.nodes) { const n = H.nodes[id]; if (n.floor === f && id.startsWith("c_")) el("circle", { cx: n.x, cy: n.y, r: 3 * k, fill: "#2F5BFF", "pointer-events": "none" }, svg); }
    }

    // test route
    if (A.route) {
      const pts = [];
      const flush = () => { if (pts.length > 1) el("polyline", { points: pts.join(" "), fill: "none", stroke: "#2F5BFF", "stroke-width": 6 * k, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0.85, "pointer-events": "none" }, svg); pts.length = 0; };
      for (const s of A.route.segs) {
        const na = H.nodes[s.from], nb = H.nodes[s.to];
        if (s.type === "stairs" || na.floor !== f) { flush(); continue; }
        if (!pts.length) pts.push(`${na.x},${na.y}`);
        pts.push(`${nb.x},${nb.y}`);
      }
      flush();
    }

    // doors
    for (const d of A.v.doors.filter((d) => d.floor === f)) {
      const sel = A.sel && A.sel.kind === "door" && A.sel.id === d.id;
      const g = el("g", { "data-k": "door", "data-id": d.id, class: "ed-pt" }, svg);
      el("circle", { cx: d.x, cy: d.y, r: (d.exit ? 11 : 8) * k, fill: d.exit ? "#E5484D" : "#F08C00", stroke: sel ? "#2F5BFF" : "#fff", "stroke-width": (sel ? 3.5 : 2) * k }, g);
      if (d.exit) svgIcon(g, "door-open", d.x, d.y, 12 * k, "#fff");
    }
    // stairs
    for (const s of A.v.stairs) for (const end of ["a", "b"]) {
      const p = s[end]; if (p.floor !== f) continue;
      const sel = A.sel && A.sel.kind === "stairs" && A.sel.id === s.id;
      const g = el("g", { "data-k": "stairs", "data-id": s.id, "data-end": end, class: "ed-pt" }, svg);
      el("rect", { x: p.x - 12 * k, y: p.y - 12 * k, width: 24 * k, height: 24 * k, rx: 6 * k, fill: "#C2621C", stroke: sel ? "#2F5BFF" : "#fff", "stroke-width": (sel ? 3.5 : 2) * k }, g);
      svgIcon(g, "stairs", p.x, p.y, 15 * k, "#fff");
      const other = s[end === "a" ? "b" : "a"];
      const t = el("text", { x: p.x, y: p.y + 24 * k, "text-anchor": "middle", "font-size": 10 * k, fill: "#C2621C", "font-weight": 700, "pointer-events": "none" }, svg);
      t.textContent = "↔ " + (A.v.floors[other.floor] ? A.v.floors[other.floor].name : "?");
    }
    // objects
    for (const o of A.v.objects.filter((o) => o.floor === f)) {
      const sel = A.sel && A.sel.kind === "object" && A.sel.id === o.id;
      const g = el("g", { "data-k": "object", "data-id": o.id, class: "ed-pt" }, svg);
      el("circle", { cx: o.x, cy: o.y, r: 12 * k, fill: "#fff", stroke: sel ? "#2F5BFF" : "#5E6A82", "stroke-width": (sel ? 3.5 : 1.5) * k }, g);
      svgIcon(g, o.icon || "map-pin", o.x, o.y, 14 * k, "#33405A");
      if (o.items && o.items.length) { el("circle", { cx: o.x + 9 * k, cy: o.y - 9 * k, r: 6 * k, fill: "#2F5BFF" }, g); const t = el("text", { x: o.x + 9 * k, y: o.y - 6.5 * k, "text-anchor": "middle", "font-size": 8 * k, fill: "#fff", "font-weight": 700 }, g); t.textContent = o.items.length; }
    }
    // waypoints
    for (const w of A.v.waypoints.filter((w) => w.floor === f)) {
      const sel = A.sel && A.sel.kind === "waypoint" && A.sel.id === w.id;
      el("circle", { cx: w.x, cy: w.y, r: 6 * k, fill: "#2F5BFF", stroke: sel ? "#0F1729" : "#fff", "stroke-width": 2 * k, "data-k": "waypoint", "data-id": w.id, class: "ed-pt" }, svg);
    }
    // pending stairs / measure
    if (A.pendingStairs && A.pendingStairs.floor === f) el("circle", { cx: A.pendingStairs.x, cy: A.pendingStairs.y, r: 10 * k, fill: "none", stroke: "#C2621C", "stroke-width": 3 * k, "stroke-dasharray": `${4 * k} ${3 * k}` }, svg);
    if (A.measure && A.measure.p0) {
      const p1 = A.measure.p1 || A.measure.p0;
      el("line", { x1: A.measure.p0.x, y1: A.measure.p0.y, x2: p1.x, y2: p1.y, stroke: "#E5484D", "stroke-width": 3 * k }, svg);
    }
    // selection handles
    const r = A.sel && A.sel.kind === "room" && findSel();
    if (r && r.floor === f) {
      const [x1, y1, x2, y2] = r.rect;
      [["nw", x1, y1], ["ne", x2, y1], ["sw", x1, y2], ["se", x2, y2], ["n", (x1 + x2) / 2, y1], ["s", (x1 + x2) / 2, y2], ["w", x1, (y1 + y2) / 2], ["e", x2, (y1 + y2) / 2]].forEach(([h, x, y]) =>
        el("rect", { x: x - 6 * k, y: y - 6 * k, width: 12 * k, height: 12 * k, rx: 2 * k, fill: "#fff", stroke: "#2F5BFF", "stroke-width": 2 * k, "data-k": "handle", "data-h": h, class: "ed-handle", style: `cursor:${h.length === 2 ? h + "-resize" : (h === "n" || h === "s" ? "ns-resize" : "ew-resize")}` }, svg));
    }
    if (A.drag && A.drag.type === "draw") {
      const { p0, p1 } = A.drag; if (p1) el("rect", { x: Math.min(p0.x, p1.x), y: Math.min(p0.y, p1.y), width: Math.abs(p1.x - p0.x), height: Math.abs(p1.y - p0.y), fill: "#2F5BFF", "fill-opacity": 0.12, stroke: "#2F5BFF", "stroke-width": 2 * k, "stroke-dasharray": `${5 * k} ${4 * k}` }, svg);
    }
  }

  // nearest point on any room wall on this floor
  function snapToWall(p) {
    let best = null, bd = Infinity;
    for (const r of A.v.rooms.filter((r) => r.floor === A.floor)) {
      const [x1, y1, x2, y2] = r.rect;
      const cands = [[clamp(p.x, x1, x2), y1], [clamp(p.x, x1, x2), y2], [x1, clamp(p.y, y1, y2)], [x2, clamp(p.y, y1, y2)]];
      for (const [x, y] of cands) { const d = Math.hypot(x - p.x, y - p.y); if (d < bd) { bd = d; best = { x, y }; } }
    }
    return best && bd < 30 * unitsPerPx() + 20 ? { x: Math.round(best.x), y: Math.round(best.y) } : { x: snap(p.x), y: snap(p.y) };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  svg.addEventListener("pointerdown", (e) => {
    svg.setPointerCapture(e.pointerId);
    A.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (A.pointers.size === 2) { const [a, b] = [...A.pointers.values()]; A.drag = { type: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y), view0: { ...A.view } }; return; }
    const p = toSvg(e), t = e.target.closest("[data-k]");
    const kind = t && t.dataset.k;
    if (A.tool === "measure") {
      if (!A.measure.p0) { A.measure.p0 = p; renderEditor(); }
      else { A.measure.p1 = p; finishMeasure(); }
      return;
    }
    if (A.tool === "select") {
      if (kind === "handle") { const r = findSel(); A.drag = { type: "resize", h: t.dataset.h, snap0: snapshot(), moved: false, r }; return; }
      if (kind === "edge") { toggleEdge(t.dataset.id); return; }
      if (kind && kind !== "handle") {
        A.sel = { kind, id: t.dataset.id, end: t.dataset.end };
        const obj = findSel();
        const pos = kind === "room" ? null : kind === "stairs" ? obj[t.dataset.end] : obj;
        A.drag = { type: "move", p0: p, snap0: snapshot(), moved: false, obj, pos, rect0: kind === "room" ? obj.rect.slice() : null, x0: pos && pos.x, y0: pos && pos.y };
        renderProps(); renderEditor();
        return;
      }
      A.sel = null; renderProps();
      A.drag = { type: "pan", c0: { x: e.clientX, y: e.clientY }, view0: { ...A.view } };
      renderEditor();
      return;
    }
    if (A.tool === "room") { A.drag = { type: "draw", p0: { x: snap(p.x), y: snap(p.y) } }; return; }
    if (A.tool === "door") {
      const q = snapToWall(p), id = uid("d");
      commit(() => A.v.doors.push({ id, floor: A.floor, x: q.x, y: q.y }));
      A.sel = { kind: "door", id }; renderProps(); renderEditor();
      const n = H.nodes["d_" + id.replace(/^d_/, "")];
      toast(n && n.rooms.length >= 2 ? `Door joins ${n.rooms.map((r) => roomName(r)).join(" and ")}` : "Door touches only one room. Move it onto a shared wall, or mark it as an exit.");
      return;
    }
    if (A.tool === "object") {
      const id = uid("o");
      commit(() => A.v.objects.push({ id, floor: A.floor, x: snap(p.x), y: snap(p.y), name: "Object", icon: "map-pin", items: [] }));
      A.sel = { kind: "object", id }; renderProps(); pickObjectType(id);
      return;
    }
    if (A.tool === "waypoint") {
      const id = uid("w");
      commit(() => A.v.waypoints.push({ id, floor: A.floor, x: snap(p.x), y: snap(p.y) }));
      A.sel = { kind: "waypoint", id }; renderProps();
      return;
    }
    if (A.tool === "stairs") {
      if (!A.pendingStairs) { A.pendingStairs = { floor: A.floor, x: snap(p.x), y: snap(p.y) }; setTool("stairs"); renderEditor(); toast("Now pick the other floor above the map, then click where the stairs arrive"); }
      else if (A.pendingStairs.floor === A.floor) toast("Switch to the other floor first");
      else {
        const id = uid("st"), a = A.pendingStairs, b = { floor: A.floor, x: snap(p.x), y: snap(p.y) };
        commit(() => A.v.stairs.push({ id, steps: A.v.stairSteps, a, b }));
        A.pendingStairs = null; A.sel = { kind: "stairs", id }; setTool("select"); renderProps(); toast("Stairs linked");
      }
    }
  });
  svg.addEventListener("pointermove", (e) => {
    if (A.pointers.has(e.pointerId)) A.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = A.drag; if (!d) { if (A.tool === "measure" && A.measure && A.measure.p0) { A.measure.p1 = toSvg(e); renderEditor(); } return; }
    if (d.type === "pinch" && A.pointers.size === 2) {
      const [a, b] = [...A.pointers.values()]; const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const f = d.d0 / dist, v0 = d.view0, cx = v0.x + v0.w / 2, cy = v0.y + v0.h / 2;
      A.view = { x: cx - (v0.w * f) / 2, y: cy - (v0.h * f) / 2, w: v0.w * f, h: v0.h * f }; renderEditor(); return;
    }
    if (d.type === "pan") {
      const k = unitsPerPx();
      A.view = { ...d.view0, x: d.view0.x - (e.clientX - d.c0.x) * k, y: d.view0.y - (e.clientY - d.c0.y) * k };
      renderEditor(); return;
    }
    const p = toSvg(e);
    if (d.type === "draw") { d.p1 = { x: snap(p.x), y: snap(p.y) }; renderEditor(); return; }
    if (d.type === "move") {
      const dx = snap(p.x - d.p0.x), dy = snap(p.y - d.p0.y);
      if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      d.moved = true;
      if (d.rect0) d.obj.rect = [d.rect0[0] + dx, d.rect0[1] + dy, d.rect0[2] + dx, d.rect0[3] + dy];
      else if (A.sel.kind === "door") { const q = snapToWall({ x: d.x0 + dx, y: d.y0 + dy }); d.pos.x = q.x; d.pos.y = q.y; }
      else { d.pos.x = d.x0 + dx; d.pos.y = d.y0 + dy; }
      renderEditor(); return;
    }
    if (d.type === "resize") {
      const r = d.r.rect, x = snap(p.x), y = snap(p.y);
      if (d.h.includes("w")) r[0] = Math.min(x, r[2] - 10); if (d.h.includes("e")) r[2] = Math.max(x, r[0] + 10);
      if (d.h.includes("n")) r[1] = Math.min(y, r[3] - 10); if (d.h.includes("s")) r[3] = Math.max(y, r[1] + 10);
      d.moved = true; renderEditor();
    }
  });
  function endPointer(e) {
    A.pointers.delete(e.pointerId);
    const d = A.drag; A.drag = null;
    if (!d) return;
    if (d.type === "draw" && d.p1) {
      const x1 = Math.min(d.p0.x, d.p1.x), y1 = Math.min(d.p0.y, d.p1.y), x2 = Math.max(d.p0.x, d.p1.x), y2 = Math.max(d.p0.y, d.p1.y);
      if (x2 - x1 > 15 && y2 - y1 > 15) {
        const id = uid("r");
        commit(() => A.v.rooms.push({ id, floor: A.floor, name: "New room", kind: "room", icon: "bed-double", rect: [x1, y1, x2, y2], about: "", activities: [] }));
        A.sel = { kind: "room", id }; setTool("select"); renderProps();
        setTimeout(() => { const i = $("p-name"); if (i) { i.focus(); i.select(); } }, 50);
      } else renderEditor();
      return;
    }
    if ((d.type === "move" || d.type === "resize") && d.moved) { pushUndo(d.snap0); changed(); }
  }
  svg.addEventListener("pointerup", endPointer);
  svg.addEventListener("pointercancel", endPointer);
  svg.addEventListener("wheel", (e) => { e.preventDefault(); const p = toSvg(e); zoomAt(e.deltaY > 0 ? 1.12 : 0.89, p.x, p.y); }, { passive: false });
  window.addEventListener("keydown", (e) => {
    if (/input|textarea|select/i.test(document.activeElement.tagName)) return;
    if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if ((e.key === "Delete" || e.key === "Backspace") && A.sel) { deleteSel(); return; }
    const map = { v: "select", r: "room", d: "door", o: "object", s: "stairs", w: "waypoint" };
    if (map[e.key]) setTool(map[e.key]);
    if (e.key === "Escape") { A.sel = null; A.pendingStairs = null; A.measure = null; setTool("select"); renderAll(); }
  });
  window.addEventListener("resize", () => renderEditor());

  function toggleEdge(key) {
    commit(() => {
      const m = A.v.edgeMeta[key] = A.v.edgeMeta[key] || {};
      m.blocked = !m.blocked;
      if (!m.blocked && !m.learnedLen && !m.penalty) delete A.v.edgeMeta[key];
    });
    toast(A.v.edgeMeta[key] && A.v.edgeMeta[key].blocked ? "Walkway blocked: routes will avoid it" : "Walkway open again");
  }
  function deleteSel() {
    if (!A.sel) return;
    const k = A.sel.kind, id = A.sel.id;
    const key = { room: "rooms", door: "doors", object: "objects", stairs: "stairs", waypoint: "waypoints" }[k];
    commit(() => { A.v[key] = A.v[key].filter((x) => x.id !== id); });
    A.sel = null; renderProps();
  }
  const roomName = (id) => (A.v.rooms.find((r) => r.id === id) || {}).name || id;

  // ---------------- properties panel ----------------
  function field(label, html) { return `<div class="field"><label>${label}</label>${html}</div>`; }
  function renderProps() {
    const box = $("props"), o = findSel();
    if (!o) {
      box.innerHTML = `<div class="card muted-card"><h4><i>${I.svg("mouse-pointer-2", 16)}</i> Nothing selected</h4>
        <p class="sub small">Pick a tool above. Draw each <b>room</b> as a rectangle, put a <b>door</b> on every wall people can walk through, link the <b>stairs</b> between floors, and place <b>objects</b> (bed, fridge, wardrobe…). Walkways are made automatically.</p></div>`;
      return;
    }
    const k = A.sel.kind;
    let html = "";
    if (k === "room") {
      html = `<div class="card"><div class="p-head"><span class="p-ic" style="--c:${(KIND[o.kind] || KIND.circulation)[1]}">${I.svg(o.icon || "map-pin", 18)}</span><h4>Room</h4></div>
        ${field("Name", `<input id="p-name" value="${esc(o.name)}" />`)}
        <div class="grid2">${field("Type", `<select id="p-kind">${Object.entries(KIND_LABEL).map(([v, l]) => `<option value="${v}" ${o.kind === v ? "selected" : ""}>${l}</option>`).join("")}</select>`)}
        ${field("Icon", `<button class="icon-pick" id="p-icon">${I.svg(o.icon || "map-pin", 18)}<span>Change</span></button>`)}</div>
        ${field("Description", `<input id="p-about" value="${esc(o.about)}" placeholder="e.g. Cooking and food area" />`)}
        ${field("What you can do here (one per line)", `<textarea id="p-acts" rows="3">${esc((o.activities || []).join("\n"))}</textarea>`)}
        <label class="check"><input type="checkbox" id="p-hidden" ${o.hidden ? "checked" : ""}/> Walk-through only (not a destination)</label>
        <p class="sub small">Size: ${Math.round((o.rect[2] - o.rect[0]) * A.v.metersPerPx * 10) / 10} × ${Math.round((o.rect[3] - o.rect[1]) * A.v.metersPerPx * 10) / 10} m · ${doorCount(o.id)} door(s)</p>
        <button class="btn tonal sm danger-t" id="p-del">${I.svg("trash-2", 16)}<span>Delete room</span></button></div>`;
    } else if (k === "door") {
      const n = H.nodes["d_" + o.id.replace(/^d_/, "")] || { rooms: [] };
      html = `<div class="card"><div class="p-head"><span class="p-ic" style="--c:#F08C00">${I.svg("door-open", 18)}</span><h4>${o.exit ? "Exit" : "Door"}</h4></div>
        <p class="sub small">${n.rooms.length ? "Connects: " + n.rooms.map(roomName).join(" ↔ ") : "Not on a room wall yet. Drag it onto a wall."}</p>
        ${field("Name (optional)", `<input id="p-name" value="${esc(o.name || "")}" placeholder="e.g. Opening to the chill zone" />`)}
        <label class="check"><input type="checkbox" id="p-exit" ${o.exit ? "checked" : ""}/> This is a way in / out (people can navigate to it)</label>
        ${o.exit ? field("Description", `<input id="p-about" value="${esc(o.about || "")}" />`) + field("What you can do here (one per line)", `<textarea id="p-acts" rows="2">${esc((o.activities || []).join("\n"))}</textarea>`) : ""}
        <button class="btn tonal sm danger-t" id="p-del">${I.svg("trash-2", 16)}<span>Delete door</span></button></div>`;
    } else if (k === "object") {
      const r = roomOf(o.floor, o.x, o.y);
      html = `<div class="card"><div class="p-head"><span class="p-ic" style="--c:#33405A">${I.svg(o.icon || "map-pin", 18)}</span><h4>Object</h4></div>
        <p class="sub small">${r ? "In " + esc(r.name) : "Not inside a room. Move it into one."}</p>
        ${field("Name", `<input id="p-name" value="${esc(o.name)}" />`)}
        <div class="row-btns tight"><button class="btn tonal sm" id="p-type">${I.svg("list", 16)}<span>Type</span></button><button class="btn tonal sm" id="p-icon">${I.svg(o.icon || "map-pin", 16)}<span>Icon</span></button></div>
        <h5>Items kept here</h5>
        <ul class="items">${(o.items || []).map((it, i) => `<li><b>${esc(it.name)}</b><span>${esc(it.where || "")}</span><button data-rm="${i}" title="Remove">${I.svg("x", 14)}</button></li>`).join("") || `<li class="empty">No items yet</li>`}</ul>
        <div class="grid2"><input id="p-it-name" placeholder="Item (e.g. keys)" /><input id="p-it-where" placeholder="Where exactly" /></div>
        <button class="btn tonal sm" id="p-it-add">${I.svg("plus", 16)}<span>Add item</span></button>
        <button class="btn tonal sm danger-t" id="p-del">${I.svg("trash-2", 16)}<span>Delete object</span></button></div>`;
    } else if (k === "stairs") {
      html = `<div class="card"><div class="p-head"><span class="p-ic" style="--c:#C2621C">${I.svg("stairs", 18)}</span><h4>Stairs</h4></div>
        <p class="sub small">${A.v.floors[o.a.floor]?.name} ↔ ${A.v.floors[o.b.floor]?.name}. Drag each end to where the stairs start and finish.</p>
        ${field("Number of steps", `<input id="p-steps" type="number" min="2" max="80" value="${o.steps || A.v.stairSteps}" />`)}
        <button class="btn tonal sm danger-t" id="p-del">${I.svg("trash-2", 16)}<span>Delete stairs</span></button></div>`;
    } else if (k === "waypoint") {
      html = `<div class="card"><div class="p-head"><span class="p-ic" style="--c:#2F5BFF">${I.svg("circle-dot", 18)}</span><h4>Walking point</h4></div>
        <p class="sub small">Extra point inside a room, useful to steer routes around furniture in big rooms.</p>
        <button class="btn tonal sm danger-t" id="p-del">${I.svg("trash-2", 16)}<span>Delete point</span></button></div>`;
    }
    box.innerHTML = html;
    const on = (id, ev, fn) => { const e = $(id); if (e) e.addEventListener(ev, fn); };
    on("p-name", "change", (e) => commit(() => (o.name = e.target.value.trim() || o.name)));
    on("p-kind", "change", (e) => commit(() => (o.kind = e.target.value)));
    on("p-about", "change", (e) => commit(() => (o.about = e.target.value)));
    on("p-acts", "change", (e) => commit(() => (o.activities = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))));
    on("p-hidden", "change", (e) => commit(() => (o.hidden = e.target.checked || undefined)));
    on("p-exit", "change", (e) => { commit(() => { o.exit = e.target.checked || undefined; if (o.exit && !o.name) o.name = "Exit"; }); renderProps(); });
    on("p-steps", "change", (e) => commit(() => (o.steps = +e.target.value || A.v.stairSteps)));
    on("p-del", "click", deleteSel);
    on("p-icon", "click", () => pickIcon((ic) => { commit(() => (o.icon = ic)); renderProps(); }));
    on("p-type", "click", () => pickObjectType(o.id));
    on("p-it-add", "click", () => {
      const n = $("p-it-name").value.trim(); if (!n) return;
      commit(() => o.items.push({ id: uid("i"), name: n, where: $("p-it-where").value.trim() })); renderProps();
    });
    box.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => { commit(() => o.items.splice(+b.dataset.rm, 1)); renderProps(); }));
  }
  const doorCount = (roomId) => Object.values(H.nodes).filter((n) => n.isDoor && (n.rooms || []).includes(roomId)).length;

  function modal(html, onMount) {
    $("modal-card").innerHTML = html; $("modal").classList.remove("hidden");
    I.hydrate($("modal-card")); onMount && onMount($("modal-card"));
  }
  const closeModal = () => $("modal").classList.add("hidden");
  $("modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
  function pickIcon(cb) {
    modal(`<div class="sc-head"><h3>Choose an icon</h3><button class="icon-btn flat" data-close>${I.svg("x", 18)}</button></div>
      <div class="icon-grid">${I.names.map((n) => `<button data-ic-name="${n}" title="${n}">${I.svg(n, 22)}</button>`).join("")}</div>`, (c) => {
      c.querySelector("[data-close]").onclick = closeModal;
      c.querySelectorAll("[data-ic-name]").forEach((b) => (b.onclick = () => { closeModal(); cb(b.dataset.icName); }));
    });
  }
  function pickObjectType(id) {
    modal(`<div class="sc-head"><h3>What is it?</h3><button class="icon-btn flat" data-close>${I.svg("x", 18)}</button></div>
      <div class="type-grid">${OBJECT_TYPES.map(([n, ic]) => `<button data-t="${n}" data-i="${ic}">${I.svg(ic, 22)}<span>${n}</span></button>`).join("")}</div>`, (c) => {
      c.querySelector("[data-close]").onclick = closeModal;
      c.querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => {
        closeModal();
        const o = A.v.objects.find((x) => x.id === id); if (!o) return;
        commit(() => {
          o.icon = b.dataset.i;
          const r = roomOf(o.floor, o.x, o.y);
          o.name = b.dataset.t === "Other" ? "Object" : (r && !/^room|^new/i.test(r.name) ? `${r.name} ${b.dataset.t.toLowerCase()}` : r ? `${r.name} ${b.dataset.t.toLowerCase()}` : b.dataset.t);
        });
        renderProps(); setTimeout(() => { const i = $("p-name"); if (i) { i.focus(); i.select(); } }, 50);
      }));
    });
  }

  // ---------------- route test + checks ----------------
  function placeOptions() {
    const opts = H.rooms.filter((r) => !r.hidden).map((r) => [r.node, `${r.name} · ${A.v.floors[r.floor]?.name || ""}`]);
    (A.v.objects || []).forEach((o) => opts.push(["o_" + o.id, `${o.name} (object)`]));
    return opts;
  }
  function renderRouteSelects() {
    const opts = placeOptions().map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("");
    for (const id of ["rt-from", "rt-to"]) { const s = $(id), cur = s.value; s.innerHTML = `<option value="">Choose…</option>` + opts; if ([...s.options].some((o) => o.value === cur)) s.value = cur; }
  }
  ["rt-from", "rt-to"].forEach((id) => $(id).addEventListener("change", runRouteTest));
  function runRouteTest() {
    const a = $("rt-from").value, b = $("rt-to").value, out = $("rt-out");
    A.route = null;
    if (!a || !b || a === b || !H.nodes[a] || !H.nodes[b]) { out.innerHTML = ""; renderEditor(); return; }
    const r = R.buildRoute(a, b);
    if (!r) { out.innerHTML = `<p class="bad">${I.svg("triangle-alert", 16)} No route. Something is not connected (check doors and stairs).</p>`; renderEditor(); return; }
    A.route = r;
    out.innerHTML = `<p class="good"><b>${r.total.toFixed(1)} m</b> · about ${Math.round(r.total / (A.v.defaultStride || 0.7))} steps · shortest path</p>
      <ol>${r.legs.map((l) => `<li>${I.svg(l.icon, 14)} ${esc(l.text)}</li>`).join("")}</ol>`;
    if (H.nodes[a].floor !== A.floor) { A.floor = H.nodes[a].floor; renderFloors(); }
    renderEditor();
  }
  function renderChecks() {
    const out = [];
    const adj = {}; for (const id in H.nodes) adj[id] = [];
    for (const [a, b] of H.edges) { if (adj[a] && adj[b]) { adj[a].push(b); adj[b].push(a); } }
    const start = (H.rooms.find((r) => r.kind === "exit") || H.rooms[0] || {}).node;
    const seen = new Set();
    if (start) { const q = [start]; seen.add(start); while (q.length) { const u = q.shift(); for (const w of adj[u]) if (!seen.has(w)) { seen.add(w); q.push(w); } } }
    for (const r of A.v.rooms) {
      if (!doorCount(r.id) && !A.v.stairs.some((s) => [s.a, s.b].some((p) => p.floor === r.floor && V.inRect(r.rect, p.x, p.y, 14)))) out.push(["bad", `<b>${esc(r.name)}</b> has no door`, { kind: "room", id: r.id }]);
      else if (start && !seen.has("c_" + r.id)) out.push(["bad", `<b>${esc(r.name)}</b> can't be reached from ${esc(roomNameByNode(start))}`, { kind: "room", id: r.id }]);
    }
    for (const d of A.v.doors) {
      const n = H.nodes["d_" + d.id.replace(/^d_/, "")];
      if (!n || !n.rooms.length) out.push(["bad", `A door isn't on any room wall`, { kind: "door", id: d.id }]);
      else if (n.rooms.length === 1 && !d.exit) out.push(["warn", `Door in <b>${esc(roomName(n.rooms[0]))}</b> leads nowhere. Mark it as an exit or move it`, { kind: "door", id: d.id }]);
    }
    for (const o of A.v.objects) if (!roomOf(o.floor, o.x, o.y)) out.push(["warn", `<b>${esc(o.name)}</b> is outside every room`, { kind: "object", id: o.id }]);
    for (const f of Object.keys(A.v.floors)) if (Object.keys(A.v.floors).length > 1 && !A.v.stairs.some((s) => s.a.floor === f || s.b.floor === f)) out.push(["bad", `${esc(A.v.floors[f].name)} has no stairs`, null]);
    const ul = $("checks");
    ul.innerHTML = out.length ? out.map(([c, t], i) => `<li class="${c}" data-i="${i}">${I.svg(c === "bad" ? "triangle-alert" : "info", 15)}<span>${t}</span></li>`).join("") : `<li class="good">${I.svg("circle-check", 15)}<span>Everything is connected. Every room can be reached.</span></li>`;
    ul.querySelectorAll("[data-i]").forEach((li) => li.addEventListener("click", () => {
      const s = out[+li.dataset.i][2]; if (!s) return;
      const o = { room: A.v.rooms, door: A.v.doors, object: A.v.objects }[s.kind].find((x) => x.id === s.id);
      if (o) { A.floor = o.floor; A.sel = s; renderAll(); }
    }));
  }
  const roomNameByNode = (id) => (H.nodes[id] ? H.nodes[id].label : id);

  // =====================================================================
  // THINGS
  // =====================================================================
  function renderThings() {
    const sel = $("it-obj");
    sel.innerHTML = A.v.objects.map((o) => { const r = roomOf(o.floor, o.x, o.y); return `<option value="${o.id}">${esc(o.name)}${r ? " · " + esc(r.name) : ""}</option>`; }).join("");
    const q = $("th-search").value.trim().toLowerCase();
    const groups = {};
    for (const o of A.v.objects) {
      const r = roomOf(o.floor, o.x, o.y);
      const text = (o.name + " " + (o.items || []).map((i) => i.name + " " + i.where).join(" ")).toLowerCase();
      if (q && !text.includes(q) && !(r && r.name.toLowerCase().includes(q))) continue;
      const key = r ? r.id : "_none";
      (groups[key] = groups[key] || { room: r, list: [] }).list.push(o);
    }
    const box = $("things-list");
    box.innerHTML = Object.values(groups).map((g) => `<div class="card thing-group"><h4>${g.room ? I.svg(g.room.icon || "map-pin", 16) + " " + esc(g.room.name) + ` <small>${esc(A.v.floors[g.room.floor]?.name || "")}</small>` : "Outside any room"}</h4>
      ${g.list.map((o) => `<div class="thing"><span class="tile sm">${I.svg(o.icon || "map-pin", 18)}</span><div class="thing-body"><b>${esc(o.name)}</b>
        <div class="tags">${(o.items || []).map((it, i) => `<span>${esc(it.name)}${it.where ? ` <em>· ${esc(it.where)}</em>` : ""}<button data-o="${o.id}" data-rm="${i}">${I.svg("x", 12)}</button></span>`).join("") || `<em class="none">No items</em>`}</div></div>
        <button class="btn tonal sm" data-show="${o.id}">${I.svg("map-pin", 15)}<span>Map</span></button></div>`).join("")}</div>`).join("") || `<div class="empty-state">${I.svg("package", 28)}<p>No objects yet. Use the Object tool on the Map tab.</p></div>`;
    box.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => { const o = A.v.objects.find((x) => x.id === b.dataset.o); commit(() => o.items.splice(+b.dataset.rm, 1)); renderThings(); }));
    box.querySelectorAll("[data-show]").forEach((b) => b.addEventListener("click", () => {
      const o = A.v.objects.find((x) => x.id === b.dataset.show); A.floor = o.floor; A.sel = { kind: "object", id: o.id };
      document.querySelector('#atabs [data-tab="map"]').click(); renderAll();
    }));
  }
  $("th-search").addEventListener("input", renderThings);
  $("it-add").onclick = () => {
    const n = $("it-name").value.trim(), o = A.v.objects.find((x) => x.id === $("it-obj").value);
    if (!n || !o) { toast("Type an item name and choose where it's kept"); return; }
    commit(() => o.items.push({ id: uid("i"), name: n, where: $("it-where").value.trim() }));
    $("it-name").value = ""; $("it-where").value = ""; renderThings(); toast(`Added “${n}” to ${o.name}`);
  };

  // =====================================================================
  // TRAIN (camera ML)
  // =====================================================================
  const T = { stream: null, testing: false, detecting: false, recording: false, dets: [], modelDirty: false };
  const video = $("tr-video");
  $("tr-cam-btn").onclick = async () => {
    if (T.stream) { stopCam(); return; }
    try {
      T.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      video.srcObject = T.stream; await video.play().catch(() => {});
      $("tr-cam-empty").classList.add("hidden");
      $("tr-cam-btn").innerHTML = `${I.svg("x", 18)}<span>Stop camera</span>`;
    } catch (e) { toast("Camera blocked or not available"); return; }
    try {
      await VIS.load((m) => ($("tr-status").textContent = m));
      $("tr-status").textContent = "AI model ready. Choose a spot and press Record.";
      $("tr-test-btn").disabled = false; $("tr-det-btn").disabled = false;
      renderSpots();
    } catch (e) { $("tr-status").textContent = "Couldn't load the AI model: " + e.message; }
  };
  function stopCam() {
    T.testing = T.detecting = false;
    if (T.stream) T.stream.getTracks().forEach((t) => t.stop());
    T.stream = null; video.srcObject = null;
    $("tr-cam-empty").classList.remove("hidden"); $("tr-pred").classList.add("hidden");
    $("tr-cam-btn").innerHTML = `${I.svg("camera", 18)}<span>Start camera</span>`;
    clearDet();
  }
  $("tr-test-btn").onclick = () => {
    T.testing = !T.testing; $("tr-test-btn").classList.toggle("on", T.testing);
    $("tr-pred").classList.toggle("hidden", !T.testing);
    if (T.testing) testLoop();
  };
  async function testLoop() {
    if (!T.testing || !T.stream) return;
    if (!VIS.hasModel()) { $("tr-pred").innerHTML = `<p>Record at least two spots first.</p>`; }
    else {
      const v = VIS.embed(video), p = VIS.predict(v, T.dets.map((d) => d.class));
      if (p) $("tr-pred").innerHTML = p.ranking.slice(0, 3).map((r, i) => `<div class="pr ${i ? "" : "top"}"><span>${esc(r.label.name)}</span><i style="width:${Math.round(r.conf * 100)}%"></i><b>${Math.round(r.conf * 100)}%</b></div>`).join("") + `<small>similarity ${(p.sim * 100).toFixed(0)}%</small>`;
    }
    setTimeout(testLoop, 450);
  }
  $("tr-det-btn").onclick = async () => {
    T.detecting = !T.detecting; $("tr-det-btn").classList.toggle("on", T.detecting);
    if (!T.detecting) { clearDet(); return; }
    $("tr-status").textContent = "Loading object detector…";
    try { await VIS.loadDetector(); $("tr-status").textContent = "Detecting objects (bed, sofa, TV, toilet, fridge, sink, table, chair…)"; detLoop(); }
    catch (e) { $("tr-status").textContent = "Couldn't load the detector: " + e.message; T.detecting = false; }
  };
  async function detLoop() {
    if (!T.detecting || !T.stream) return;
    T.dets = await VIS.detect(video);
    drawDet($("tr-det"), video, T.dets);
    setTimeout(detLoop, 500);
  }
  function clearDet() { const c = $("tr-det"); c.getContext("2d").clearRect(0, 0, c.width, c.height); T.dets = []; }
  function drawDet(canvas, vid, dets) {
    const W = canvas.clientWidth, Hh = canvas.clientHeight, dpr = devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = Hh * dpr;
    const ctx = canvas.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, Hh);
    const vw = vid.videoWidth, vh = vid.videoHeight; if (!vw) return;
    const s = Math.max(W / vw, Hh / vh), ox = (W - vw * s) / 2, oy = (Hh - vh * s) / 2;
    ctx.lineWidth = 3; ctx.font = "600 13px Inter, sans-serif";
    for (const d of dets) {
      const [x, y, w, h] = d.bbox;
      ctx.strokeStyle = "#46E3B7"; ctx.strokeRect(ox + x * s, oy + y * s, w * s, h * s);
      const label = `${d.class} ${Math.round(d.score * 100)}%`, tw = ctx.measureText(label).width + 12;
      ctx.fillStyle = "#46E3B7"; ctx.fillRect(ox + x * s, oy + y * s - 22, tw, 22);
      ctx.fillStyle = "#06261C"; ctx.fillText(label, ox + x * s + 6, oy + y * s - 6);
    }
  }

  function spotPositionOptions(roomId) {
    const r = A.v.rooms.find((x) => x.id === roomId); if (!r) return [];
    const opts = [["centre", "Middle of the room", (r.rect[0] + r.rect[2]) / 2, (r.rect[1] + r.rect[3]) / 2]];
    for (const id in H.nodes) { const n = H.nodes[id]; if (n.isDoor && (n.rooms || []).includes(roomId)) opts.push([id, `At ${n.label}`, n.x, n.y]); }
    for (const o of A.v.objects) if (roomOf(o.floor, o.x, o.y)?.id === roomId) opts.push(["o_" + o.id, `By the ${o.name}`, o.x, o.y]);
    return opts;
  }
  function makeLabel(room, name, x, y) {
    return { id: uid("sp"), name, room: room.id, roomName: room.name, floor: room.floor, x, y,
      objects: A.v.objects.filter((o) => roomOf(o.floor, o.x, o.y)?.id === room.id).map((o) => o.name) };
  }
  $("sp-auto").onclick = () => {
    let n = 0;
    for (const r of A.v.rooms) {
      if (VIS.labels.some((l) => l.room === r.id && l.name === r.name)) continue;
      VIS.labels.push(makeLabel(r, r.name, (r.rect[0] + r.rect[2]) / 2, (r.rect[1] + r.rect[3]) / 2)); n++;
    }
    T.modelDirty = true; renderSpots(); toast(n ? `Added ${n} spots` : "Every room already has a spot");
  };
  $("sp-add").onclick = () => {
    const roomOpts = A.v.rooms.map((r) => `<option value="${r.id}">${esc(r.name)} · ${esc(A.v.floors[r.floor]?.name || "")}</option>`).join("");
    modal(`<div class="sc-head"><h3>New spot</h3><button class="icon-btn flat" data-close>${I.svg("x", 18)}</button></div>
      <p class="sub">A spot is a place the camera should recognise: a room, a doorway, or a corner by an object.</p>
      ${field("Room", `<select id="ns-room">${roomOpts}</select>`)}
      ${field("Exactly where", `<select id="ns-pos"></select>`)}
      ${field("Name", `<input id="ns-name" />`)}
      <div class="row"><button class="btn tonal" data-close>Cancel</button><button class="btn primary" id="ns-ok">Add spot</button></div>`, (c) => {
      c.querySelectorAll("[data-close]").forEach((b) => (b.onclick = closeModal));
      const upd = () => {
        const opts = spotPositionOptions($("ns-room").value);
        $("ns-pos").innerHTML = opts.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("");
        updName();
      };
      const updName = () => {
        const r = A.v.rooms.find((x) => x.id === $("ns-room").value), opt = spotPositionOptions(r.id).find((o) => o[0] === $("ns-pos").value);
        $("ns-name").value = opt && opt[0] !== "centre" ? `${r.name}: ${opt[1].replace(/^At |^By /, "").replace(/^the /, "")}` : r.name;
      };
      $("ns-room").onchange = upd; $("ns-pos").onchange = updName; upd();
      $("ns-ok").onclick = () => {
        const r = A.v.rooms.find((x) => x.id === $("ns-room").value), opt = spotPositionOptions(r.id).find((o) => o[0] === $("ns-pos").value);
        VIS.labels.push(makeLabel(r, $("ns-name").value.trim() || r.name, opt[2], opt[3]));
        T.modelDirty = true; closeModal(); renderSpots();
      };
    });
  };
  function renderSpots() {
    const box = $("spots");
    const maxN = Math.max(40, ...VIS.labels.map((l) => VIS.countFor(l.id)));
    box.innerHTML = VIS.labels.length ? VIS.labels.map((l) => {
      const n = VIS.countFor(l.id), q = n >= 60 ? "good" : n >= 25 ? "ok" : "low";
      return `<div class="spot"><div class="spot-body"><b>${esc(l.name)}</b><small>${esc(A.v.floors[l.floor]?.name || "")} · ${n} samples ${q === "low" ? "· needs more" : q === "ok" ? "· okay" : "· good"}</small>
        <div class="bar ${q}"><i style="width:${Math.min(100, (n / maxN) * 100)}%"></i></div></div>
        <button class="btn primary sm rec" data-rec="${l.id}" ${VIS.ready && T.stream ? "" : "disabled"}>${I.svg("circle-dot", 15)}<span>Record</span></button>
        <button class="icon-btn flat" data-clear="${l.id}" title="Clear samples">${I.svg("refresh-cw", 16)}</button>
        <button class="icon-btn flat" data-del="${l.id}" title="Delete spot">${I.svg("trash-2", 16)}</button></div>`;
    }).join("") : `<div class="empty-state small">${I.svg("target", 26)}<p>No spots yet. Press “One per room” to start.</p></div>`;
    box.querySelectorAll("[data-rec]").forEach((b) => (b.onclick = () => record(b.dataset.rec)));
    box.querySelectorAll("[data-clear]").forEach((b) => (b.onclick = () => { VIS.clearSamples(b.dataset.clear); T.modelDirty = true; renderSpots(); }));
    box.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => { if (confirm("Delete this spot and its samples?")) { VIS.removeLabel(b.dataset.del); T.modelDirty = true; renderSpots(); } }));
    const labelsWith = new Set(VIS.samples.map((s) => s.l)).size;
    $("tr-stats").innerHTML = `<div>${I.svg("target", 18)}<b>${VIS.labels.length}</b><span>spots</span></div><div>${I.svg("brain", 18)}<b>${VIS.samples.length}</b><span>samples</span></div><div>${I.svg("check-check", 18)}<b>${labelsWith}</b><span>trained</span></div>`;
    $("tr-save").classList.toggle("pulse-btn", T.modelDirty);
  }
  async function record(labelId) {
    if (T.recording || !VIS.ready || !T.stream) return;
    const lab = VIS.labels.find((l) => l.id === labelId);
    T.recording = true;
    const ring = $("tr-rec"), arc = $("tr-rec-arc"), num = $("tr-rec-n");
    ring.classList.remove("hidden");
    const total = 36; let n = 0;
    $("tr-status").textContent = `Recording “${lab.name}”: slowly turn around and tilt up and down…`;
    await new Promise((res) => {
      const iv = setInterval(() => {
        VIS.addSample(labelId, VIS.embed(video)); n++;
        num.textContent = n; arc.style.strokeDashoffset = String(100 - (n / total) * 100);
        if (n >= total) { clearInterval(iv); res(); }
      }, 220);
    });
    ring.classList.add("hidden"); T.recording = false; T.modelDirty = true;
    $("tr-status").textContent = `Added ${n} samples to “${lab.name}”. Record from another angle or time of day for more accuracy.`;
    renderSpots();
  }
  $("tr-eval").onclick = () => {
    const S = VIS.samples; if (S.length < 20) { toast("Record a few spots first"); return; }
    const idx = [...S.keys()].sort(() => Math.random() - 0.5).slice(0, 300);
    let ok = 0; const per = {}, conf = {};
    for (const i of idx) {
      const s = S[i]; const sims = [];
      for (let j = 0; j < S.length; j++) { if (j === i) continue; let d = 0; const a = S[j].v; for (let t = 0; t < a.length; t++) d += a[t] * s.v[t]; sims.push([d, S[j].l]); }
      sims.sort((a, b) => b[0] - a[0]);
      const votes = {}; sims.slice(0, 9).forEach(([d, l]) => (votes[l] = (votes[l] || 0) + Math.max(0, d) ** 4));
      const pred = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
      per[s.l] = per[s.l] || [0, 0]; per[s.l][1]++;
      if (pred === s.l) { ok++; per[s.l][0]++; } else { const k = s.l + ">" + pred; conf[k] = (conf[k] || 0) + 1; }
    }
    const name = (id) => (VIS.labels.find((l) => l.id === id) || {}).name || id;
    const worst = Object.entries(conf).sort((a, b) => b[1] - a[1]).slice(0, 4);
    $("tr-eval-out").innerHTML = `<div class="eval"><b>${Math.round((ok / idx.length) * 100)}% accurate</b> on ${idx.length} test samples.
      ${worst.length ? `<p>Most confused:</p><ul>${worst.map(([k, n]) => { const [a, b] = k.split(">"); return `<li>${esc(name(a))} → mistaken for ${esc(name(b))} (${n}×). Record more of both.</li>`; }).join("")}</ul>` : "<p>No confusions found.</p>"}</div>`;
  };
  $("tr-save").onclick = async () => {
    if (!VIS.samples.length) { toast("Nothing recorded yet"); return; }
    const body = JSON.stringify(VIS.serialize());
    if (!A.storage || !A.canWrite) {
      download("goe-model.json", body); toast(A.storage ? "Enter the admin PIN to save to the server. Downloaded a copy instead." : "Server storage not connected. Downloaded the model instead."); return;
    }
    const res = await fetch("/api/model", { method: "PUT", headers: { "content-type": "application/json", "x-admin-pin": A.pin }, body });
    const j = await res.json().catch(() => ({}));
    if (res.ok) { T.modelDirty = false; renderSpots(); toast(`Model saved (${Math.round(body.length / 1024)} KB). Phones use it from now on.`); }
    else toast("Save failed: " + (j.error || res.status));
  };

  // =====================================================================
  // LEARN (from recorded trips)
  // =====================================================================
  $("ln-run").onclick = async () => {
    let trips = [];
    try { trips = JSON.parse(localStorage.getItem("goe.trips.v1") || "[]"); } catch {}
    if (A.storage && A.canWrite) {
      try {
        const res = await fetch("/api/trips?list=1", { headers: { "x-admin-pin": A.pin } });
        const j = await res.json(); if (j.trips) trips = trips.concat(j.trips);
      } catch {}
    }
    const byId = {}; trips.forEach((t) => t && t.id && (byId[t.id] = t)); trips = Object.values(byId);
    analyse(trips);
  };
  function analyse(trips) {
    const arrived = trips.filter((t) => t.outcome === "arrived");
    const ev = (t, type) => (t.events || []).filter((e) => e.type === type);
    const vfix = trips.reduce((n, t) => n + ev(t, "vfix").length, 0);
    const offr = trips.reduce((n, t) => n + ev(t, "offroute").length + ev(t, "relocate").length, 0);
    $("ln-stats").innerHTML = `<div>${I.svg("route", 18)}<b>${trips.length}</b><span>trips</span></div><div>${I.svg("flag", 18)}<b>${arrived.length}</b><span>arrived</span></div>
      <div>${I.svg("scan-eye", 18)}<b>${vfix}</b><span>camera fixes</span></div><div>${I.svg("triangle-alert", 18)}<b>${offr}</b><span>off-route</span></div>`;
    if (!trips.length) { $("ln-out").innerHTML = `<div class="empty-state">${I.svg("sparkles", 28)}<p>No trips yet. Walk a few routes with the app, then come back.</p></div>`; return; }

    // 1) real walking distance per walkway: steps x stride vs planned length
    const ratios = {};
    for (const t of arrived) {
      if (ev(t, "relocate").length || !t.path || t.routeLength < 3) continue;
      const steps = ev(t, "step").length; if (steps < 4) continue;
      const r = (steps * (t.stride || 0.7)) / t.routeLength;
      if (r < 0.4 || r > 2.5) continue;
      for (let i = 0; i < t.path.length - 1; i++) { const k = V.edgeKey(t.path[i], t.path[i + 1]); (ratios[k] = ratios[k] || []).push(r); }
    }
    // 2) walkways people abandon
    const aband = {};
    for (const t of trips) for (const e of [...ev(t, "offroute"), ...ev(t, "relocate")]) if (e.from && e.to) { const k = V.edgeKey(e.from, e.to); aband[k] = (aband[k] || 0) + 1; }
    // 3) room-to-room moves with no door between them
    const trans = {};
    for (const t of trips) {
      const z = ev(t, "zone").map((e) => e.room).filter(Boolean);
      for (let i = 0; i < z.length - 1; i++) {
        const a = z[i], b = z[i + 1]; if (a === b) continue;
        const linked = Object.values(H.nodes).some((n) => n.isDoor && n.rooms.includes(a) && n.rooms.includes(b)) || sameStairs(a, b);
        if (!linked) { const k = [a, b].sort().join("|"); trans[k] = (trans[k] || 0) + 1; }
      }
    }
    // 4) stride per device
    const strides = {};
    for (const t of trips) for (const e of ev(t, "strideLearned")) strides[t.deviceId] = e.stride;

    const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    const edgeLabel = (k) => k.split("|").map((n) => (H.nodes[n] ? H.nodes[n].label : n)).join(" → ");
    const geo = (k) => { const [a, b] = k.split("|"), na = H.nodes[a], nb = H.nodes[b]; return na && nb ? Math.hypot(na.x - nb.x, na.y - nb.y) * A.v.metersPerPx : 0; };
    const learned = Object.entries(ratios).filter(([k, r]) => r.length >= 2 && geo(k) > 0).map(([k, r]) => ({ k, n: r.length, plan: geo(k), real: geo(k) * Math.max(0.6, Math.min(1.8, median(r))) }));
    const abandoned = Object.entries(aband).filter(([, n]) => n >= 2).map(([k, n]) => ({ k, n }));
    const missing = Object.entries(trans).filter(([, n]) => n >= 1).map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n);
    A.learned = { learned, abandoned };

    $("ln-out").innerHTML = `
      <div class="card"><h4>${I.svg("footprints", 16)} Real walking distances</h4>
        ${learned.length ? `<table class="tbl"><tr><th>Walkway</th><th>Map</th><th>Real</th><th>Trips</th></tr>${learned.slice(0, 40).map((x) => `<tr><td>${esc(edgeLabel(x.k))}</td><td>${x.plan.toFixed(1)} m</td><td><b>${x.real.toFixed(1)} m</b></td><td>${x.n}</td></tr>`).join("")}</table>` : `<p class="sub small">Needs at least 2 finished trips over the same walkway.</p>`}</div>
      <div class="card"><h4>${I.svg("triangle-alert", 16)} Walkways people abandon</h4>
        ${abandoned.length ? `<ul class="checks">${abandoned.map((x) => `<li class="warn">${I.svg("info", 15)}<span><b>${esc(edgeLabel(x.k))}</b>: ${x.n} people left the route here. Something may be in the way.</span><button class="btn tonal sm" data-block="${x.k}">Block it</button></li>`).join("")}</ul>` : `<p class="sub small">Nobody has abandoned a route yet.</p>`}</div>
      <div class="card"><h4>${I.svg("door-open", 16)} Possible missing doors</h4>
        ${missing.length ? `<ul class="checks">${missing.map((x) => { const [a, b] = x.k.split("|"); return `<li class="warn">${I.svg("info", 15)}<span>People went from <b>${esc(roomName(a))}</b> straight to <b>${esc(roomName(b))}</b> (${x.n}×), but there's no door between them.</span><button class="btn tonal sm" data-door="${x.k}">Add door</button></li>`; }).join("")}</ul>` : `<p class="sub small">Every room-to-room move matches a door on the map.</p>`}</div>
      <div class="card"><h4>${I.svg("footprints", 16)} Stride per phone</h4><p class="sub small">${Object.keys(strides).length ? Object.entries(strides).map(([d, s]) => `${d.slice(0, 6)}…: ${s} m`).join(" · ") : "Learned automatically on each phone when people confirm turns."}</p></div>
      <div class="row-btns"><button class="btn primary" id="ln-apply" ${learned.length || abandoned.length ? "" : "disabled"}>${I.svg("sparkles", 16)}<span>Apply what was learned</span></button>
        <button class="btn tonal" id="ln-reset">${I.svg("refresh-cw", 16)}<span>Forget learned distances</span></button></div>`;
    $("ln-out").querySelectorAll("[data-block]").forEach((b) => (b.onclick = () => { toggleEdge(b.dataset.block); b.disabled = true; }));
    $("ln-out").querySelectorAll("[data-door]").forEach((b) => (b.onclick = () => { addDoorBetween(...b.dataset.door.split("|")); b.disabled = true; }));
    const ap = $("ln-apply"); if (ap) ap.onclick = () => {
      commit(() => {
        for (const x of A.learned.learned) { const m = A.v.edgeMeta[x.k] = A.v.edgeMeta[x.k] || {}; m.learnedLen = +x.real.toFixed(2); m.samples = x.n; }
        for (const x of A.learned.abandoned) { const m = A.v.edgeMeta[x.k] = A.v.edgeMeta[x.k] || {}; m.penalty = +Math.min(3, 1 + 0.4 * x.n).toFixed(2); m.abandons = x.n; }
      });
      toast("Learning applied. Press Publish to send it to everyone.");
    };
    $("ln-reset").onclick = () => { commit(() => { for (const k in A.v.edgeMeta) { delete A.v.edgeMeta[k].learnedLen; delete A.v.edgeMeta[k].penalty; if (!A.v.edgeMeta[k].blocked) delete A.v.edgeMeta[k]; } }); toast("Learned distances cleared"); };
  }
  function sameStairs(a, b) { const fa = A.v.rooms.find((r) => r.id === a), fb = A.v.rooms.find((r) => r.id === b); return !fa || !fb || fa.floor !== fb.floor; }
  function addDoorBetween(a, b) {
    const ra = A.v.rooms.find((r) => r.id === a), rb = A.v.rooms.find((r) => r.id === b);
    if (!ra || !rb || ra.floor !== rb.floor) { toast("Those rooms are on different floors"); return; }
    const t = 14, [a1, a2, a3, a4] = ra.rect, [b1, b2, b3, b4] = rb.rect;
    let p = null;
    if (Math.abs(a3 - b1) < t || Math.abs(b3 - a1) < t) { const x = Math.abs(a3 - b1) < t ? (a3 + b1) / 2 : (b3 + a1) / 2; const y1 = Math.max(a2, b2), y2 = Math.min(a4, b4); if (y2 > y1) p = { x, y: (y1 + y2) / 2 }; }
    if (!p && (Math.abs(a4 - b2) < t || Math.abs(b4 - a2) < t)) { const y = Math.abs(a4 - b2) < t ? (a4 + b2) / 2 : (b4 + a2) / 2; const x1 = Math.max(a1, b1), x2 = Math.min(a3, b3); if (x2 > x1) p = { x: (x1 + x2) / 2, y }; }
    if (!p) { toast("These rooms don't share a wall. Add the door yourself on the Map tab."); return; }
    const id = uid("d");
    commit(() => A.v.doors.push({ id, floor: ra.floor, x: Math.round(p.x), y: Math.round(p.y) }));
    toast(`Door added between ${ra.name} and ${rb.name}. Drag it to the right spot on the Map tab.`);
  }

  // =====================================================================
  // SETTINGS
  // =====================================================================
  function renderSettings() {
    $("st-name").value = A.v.name; $("st-stairs").value = A.v.stairSteps; $("st-scale").value = A.v.metersPerPx; $("st-stride").value = A.v.defaultStride;
    const box = $("st-floors");
    box.innerHTML = floors().map(([id, f]) => `<div class="floor-row"><input data-fname="${id}" value="${esc(f.name)}" /><label>Level <input type="number" data-flevel="${id}" value="${f.level || 0}" /></label>
      <button class="icon-btn flat" data-fdel="${id}" title="Delete floor">${I.svg("trash-2", 16)}</button></div>`).join("");
    box.querySelectorAll("[data-fname]").forEach((i) => (i.onchange = () => commit(() => (A.v.floors[i.dataset.fname].name = i.value))));
    box.querySelectorAll("[data-flevel]").forEach((i) => (i.onchange = () => commit(() => (A.v.floors[i.dataset.flevel].level = +i.value))));
    box.querySelectorAll("[data-fdel]").forEach((b) => (b.onclick = () => {
      const id = b.dataset.fdel;
      if (Object.keys(A.v.floors).length < 2) { toast("You need at least one floor"); return; }
      if (A.v.rooms.some((r) => r.floor === id) && !confirm("This floor has rooms. Delete the floor and everything on it?")) return;
      commit(() => {
        delete A.v.floors[id];
        for (const k of ["rooms", "doors", "objects", "waypoints"]) A.v[k] = A.v[k].filter((x) => x.floor !== id);
        A.v.stairs = A.v.stairs.filter((s) => s.a.floor !== id && s.b.floor !== id);
      });
      A.floor = floors()[0][0]; renderSettings();
    }));
    const pl = A.v.plans[A.floor] || {};
    $("pl-x").value = pl.x ?? ""; $("pl-y").value = pl.y ?? ""; $("pl-w").value = pl.w ?? "";
  }
  $("st-name").onchange = (e) => { commit(() => (A.v.name = e.target.value.trim() || A.v.name)); $("a-venue-name").textContent = A.v.name; };
  $("st-stairs").onchange = (e) => commit(() => (A.v.stairSteps = +e.target.value || 15));
  $("st-scale").onchange = (e) => commit(() => (A.v.metersPerPx = +e.target.value || A.v.metersPerPx));
  $("st-stride").onchange = (e) => commit(() => (A.v.defaultStride = +e.target.value || 0.7));
  $("st-add-floor").onclick = () => {
    const lv = Math.max(...Object.values(A.v.floors).map((f) => f.level || 0)) + 1;
    const id = "F" + lv;
    commit(() => (A.v.floors[id] = { name: lv === 1 ? "Upstairs" : `Floor ${lv + 1}`, level: lv }));
    A.floor = id; renderSettings(); toast("Floor added. Draw its rooms on the Map tab.");
  };
  ["pl-x", "pl-y", "pl-w"].forEach((id) => ($(id).onchange = () => commit(() => {
    const p = A.v.plans[A.floor] = A.v.plans[A.floor] || {};
    p.x = +$("pl-x").value || 0; p.y = +$("pl-y").value || 0; p.w = +$("pl-w").value || 1000;
  })));
  $("st-plan").onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    const img = new Image();
    img.onload = () => {
      const max = 1600, s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = img.width * s; c.height = img.height * s;
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const b = H.bounds;
      commit(() => (A.v.plans[A.floor] = { src: c.toDataURL("image/jpeg", 0.72), x: b[0], y: b[1], w: b[2] - b[0], opacity: 0.5 }));
      A.showPlan = true; $("ed-plan").classList.add("on"); renderSettings();
      toast("Plan added. Adjust X / Y / width so it lines up, then trace the rooms.");
    };
    img.src = URL.createObjectURL(f);
  };
  $("st-plan-clear").onclick = () => commit(() => delete A.v.plans[A.floor]);
  $("st-measure").onclick = () => {
    document.querySelector('#atabs [data-tab="map"]').click();
    A.measure = {}; setTool("measure");
  };
  function finishMeasure() {
    const { p0, p1 } = A.measure, px = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const val = prompt(`That line is ${Math.round(px)} map units. How long is it in real life (metres)?`, (px * A.v.metersPerPx).toFixed(2));
    A.measure = null; setTool("select");
    if (val && +val > 0 && px > 5) { commit(() => (A.v.metersPerPx = +(+val / px).toFixed(5))); toast(`Scale set: 1 unit = ${A.v.metersPerPx} m`); }
    renderEditor();
  }
  $("st-export").onclick = () => download(`goe-map-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(A.v, null, 2));
  $("st-import").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const j = JSON.parse(await f.text()); if (!j.rooms) throw 0; commit(() => (A.v = V.normalize(j))); A.floor = floors()[0][0]; fitView(); renderAll(); toast("Map imported"); }
    catch { toast("That file is not a Goe map"); }
  };
  $("st-reload").onclick = async () => { const v = await fetchPublished(); if (v) { commit(() => (A.v = V.normalize(v))); A.dirty = false; updateSaveState(); toast("Reloaded the published map"); } else toast("No published map on the server yet"); };
  $("st-reset").onclick = () => { if (!confirm("Replace the map with the original default?")) return; commit(() => (A.v = V.normalize(window.DEFAULT_VENUE))); fitView(); renderAll(); };
  $("st-pin").onclick = () => openPin("change");
  $("st-logout").onclick = () => { sessionStorage.removeItem("goe.admin.pin"); A.pin = ""; A.canWrite = false; updateWrite(); openPin("enter"); };
  function download(name, text) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "application/json" })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }

  // =====================================================================
  // PIN, LOAD, PUBLISH
  // =====================================================================
  let pinMode = "enter";
  function openPin(mode) {
    pinMode = mode;
    $("pin-err").textContent = ""; $("pin-in").value = ""; $("pin-in2").value = ""; $("pin-old").value = "";
    $("pin-in2").classList.toggle("hidden", mode === "enter");
    $("pin-old").classList.toggle("hidden", mode !== "change");
    $("pin-skip").classList.toggle("hidden", mode === "change");
    $("pin-title").textContent = mode === "create" ? "Create an admin PIN" : mode === "change" ? "Change admin PIN" : "Admin PIN";
    $("pin-text").textContent = mode === "create" ? "This protects your map. Anyone with the PIN can edit and publish it. Keep it to yourself." : mode === "change" ? "Enter your current PIN and a new one." : "Enter your admin PIN to edit and publish the map.";
    $("pin-in").placeholder = mode === "enter" ? "PIN" : "New PIN";
    $("pin-gate").classList.remove("hidden");
    setTimeout(() => (mode === "change" ? $("pin-old") : $("pin-in")).focus(), 50);
  }
  $("pin-skip").onclick = () => { $("pin-gate").classList.add("hidden"); updateWrite(); };
  $("pin-ok").onclick = submitPin;
  ["pin-in", "pin-in2", "pin-old"].forEach((id) => $(id).addEventListener("keydown", (e) => e.key === "Enter" && submitPin()));
  async function submitPin() {
    const pin = $("pin-in").value;
    if (pinMode !== "enter" && pin !== $("pin-in2").value) { $("pin-err").textContent = "The two PINs don't match"; return; }
    if (pin.length < 4) { $("pin-err").textContent = "Use at least 4 characters"; return; }
    const body = pinMode === "enter" ? { action: "check", pin } : { action: "set-pin", pin, oldPin: $("pin-old").value };
    const res = await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = res ? await res.json().catch(() => ({})) : {};
    if (!res || !j.ok) { $("pin-err").textContent = j.error || (pinMode === "enter" ? "Wrong PIN" : "Couldn't save the PIN"); return; }
    A.pin = pin; A.canWrite = true; sessionStorage.setItem("goe.admin.pin", pin);
    $("pin-gate").classList.add("hidden"); updateWrite();
    toast(pinMode === "enter" ? "Unlocked" : "PIN saved");
  }
  function updateWrite() {
    $("btn-publish").disabled = !A.canWrite && A.storage;
    $("btn-publish").title = A.canWrite ? "Send this map to everyone" : A.storage ? "Enter the admin PIN first" : "Server storage not connected: exports a file";
  }
  async function fetchPublished() {
    try { const r = await fetch("/api/venue", { cache: "no-store" }); if (r.ok) return await r.json(); } catch {}
    return null;
  }
  $("btn-publish").onclick = async () => {
    if (!A.storage) { download("goe-map.json", JSON.stringify(A.v, null, 2)); toast("Server storage not connected. Downloaded the map file."); return; }
    if (!A.canWrite) { openPin("enter"); return; }
    const res = await fetch("/api/venue", { method: "PUT", headers: { "content-type": "application/json", "x-admin-pin": A.pin }, body: JSON.stringify(A.v) });
    const j = await res.json().catch(() => ({}));
    if (res.ok) { A.dirty = false; A.v.updatedAt = j.updatedAt; updateSaveState(); try { localStorage.removeItem("goe.venue.draft"); } catch {} toast("Published. Everyone now gets this map."); }
    else { toast("Publish failed: " + (j.error || res.status)); if (res.status === 401) openPin("enter"); }
  };

  function renderAll() {
    renderFloors(); renderEditor(); renderProps(); renderChecks(); renderRouteSelects();
    if (A.route) runRouteTest();
    if ($("pane-things").classList.contains("on")) renderThings();
    $("a-venue-name").textContent = A.v.name;
  }

  async function boot() {
    I.hydrate();
    // storage + pin status
    let st = { storage: false, pinSet: false };
    try { const r = await fetch("/api/admin", { cache: "no-store" }); if (r.ok) st = await r.json(); } catch {}
    A.storage = st.storage;
    if (!A.storage) { $("storage-warn").classList.remove("hidden"); $("storage-warn-text").textContent = "Server storage isn't connected, so changes are kept in this browser only. Use Export to save them."; }
    // map: published, else default; restore newer unpublished draft
    const pub = await fetchPublished();
    A.v = V.normalize(pub || window.DEFAULT_VENUE);
    try {
      const d = JSON.parse(localStorage.getItem("goe.venue.draft") || "null");
      if (d && d.rooms && (!pub || (d.draftSavedAt || "") > (pub.updatedAt || ""))) { A.v = V.normalize(d); A.dirty = true; toast("Restored your unpublished changes"); }
    } catch {}
    V.apply(A.v);
    A.floor = floors()[floors().length - 1][0];
    fitView(); setTool("select"); renderAll(); updateSaveState();
    // model
    if (await VIS.fetchModel()) renderSpots();
    // pin
    if (A.storage) {
      if (!st.pinSet) openPin("create");
      else if (A.pin) { const r = await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "check", pin: A.pin }) }).then((r) => r.json()).catch(() => ({})); A.canWrite = !!r.ok; if (!A.canWrite) openPin("enter"); }
      else openPin("enter");
    }
    updateWrite();
  }
  boot();
})();
