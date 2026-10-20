/* SVG floor plan renderer */
(function () {
  const H = window.HOUSE;
  const NS = "http://www.w3.org/2000/svg";
  const FILL = {
    living: "#1E3A5F", room: "#3A2E5C", service: "#4A3426", shared: "#1D4A45",
    circulation: "#1A2433", stairs: "#4A3020", work: "#2C3B52", exit: "#1A2433",
  };

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  /**
   * opts: { route, you:{x,y,floor}, selected: roomId, highlight: roomId,
   *         onPick(room, x, y), compact, follow }
   */
  function render(svg, floor, opts = {}) {
    svg.innerHTML = "";
    let vb = [252, 342, 576, 736];
    if (opts.follow && opts.you) {
      const w = 300, h = 300;
      vb = [opts.you.x - w / 2, opts.you.y - h / 2, w, h];
    }
    svg.setAttribute("viewBox", vb.join(" "));
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    el("rect", { x: 262, y: 352, width: 556, height: 716, rx: 6, fill: "#0B111B" }, svg);

    const rooms = H.rooms.filter((r) => r.floor === floor && r.rect);
    for (const r of rooms) {
      const [x1, y1, x2, y2] = r.rect;
      const g = el("g", { class: "room" + (opts.onPick ? " pickable" : "") }, svg);
      const sel = opts.selected === r.id, hi = opts.highlight === r.id;
      el("rect", {
        x: x1 + 2, y: y1 + 2, width: x2 - x1 - 4, height: y2 - y1 - 4, rx: 4,
        fill: FILL[r.kind] || "#1A2433",
        stroke: sel ? "#FF7A45" : hi ? "#46E3B7" : "#2B3A52",
        "stroke-width": sel || hi ? 5 : 2,
      }, g);
      if (r.kind === "stairs") {
        for (let x = x1 + 14; x < x2 - 8; x += 16) el("line", { x1: x, y1: y1 + 10, x2: x, y2: y2 - 10, stroke: "#7A5638", "stroke-width": 2 }, g);
      }
      const w = x2 - x1, hgt = y2 - y1, vertical = hgt > w * 2.2;
      const span = vertical ? hgt : w;
      const fs = Math.max(12, Math.min(22, span / 7));
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
      const t = el("text", { x: cx, y: cy + fs / 3, "text-anchor": "middle", "font-size": fs, transform: vertical ? `rotate(-90 ${cx} ${cy})` : "", fill: sel ? "#FFB08F" : "#C9D4E5", "font-weight": 600, "pointer-events": "none" }, g);
      t.textContent = r.name.replace("Upstairs ", "").replace("Downstairs ", "").toUpperCase();
      if (opts.onPick) g.addEventListener("click", () => opts.onPick(r));
    }

    // exits
    const exits = H.rooms.filter((r) => r.floor === floor && !r.rect);
    for (const r of exits) {
      const n = H.nodes[r.node];
      const g = el("g", { class: opts.onPick ? "pickable" : "" }, svg);
      el("circle", { cx: n.x, cy: n.y, r: 13, fill: opts.selected === r.id ? "#FF7A45" : "#0B111B", stroke: "#FF7A45", "stroke-width": 3 }, g);
      el("text", { x: n.x, y: n.y + 5, "text-anchor": "middle", "font-size": 14, "pointer-events": "none" }, g).textContent = "🚪";
      if (opts.onPick) g.addEventListener("click", (e) => { e.stopPropagation(); opts.onPick(r); });
    }

    // outer walls
    el("rect", { x: 268, y: 358, width: 542, height: 704, fill: "none", stroke: "#56688A", "stroke-width": 6, rx: 3, "pointer-events": "none" }, svg);

    // route
    if (opts.route) {
      const pts = [];
      const flush = () => {
        if (pts.length > 1) {
          el("polyline", { points: pts.join(" "), fill: "none", stroke: "#FF7A45", "stroke-width": opts.compact ? 10 : 8, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0.95 }, svg);
          el("polyline", { points: pts.join(" "), fill: "none", stroke: "#FFE1D3", "stroke-width": 2.5, "stroke-dasharray": "2 14", "stroke-linecap": "round", class: "flow" }, svg);
        }
        pts.length = 0;
      };
      for (const s of opts.route.segs) {
        const A = H.nodes[s.from], B = H.nodes[s.to];
        if (s.type === "stairs") {
          flush();
          const here = A.floor === floor ? A : B.floor === floor ? B : null;
          if (here) {
            el("circle", { cx: here.x, cy: here.y, r: 16, fill: "#FF7A45" }, svg);
            el("text", { x: here.x, y: here.y + 6, "text-anchor": "middle", "font-size": 16, fill: "#fff", "font-weight": 700 }, svg).textContent = A.floor === floor ? (A.floor === "G" ? "↑" : "↓") : "•";
          }
          continue;
        }
        if (A.floor !== floor) { flush(); continue; }
        if (!pts.length) pts.push(`${A.x},${A.y}`);
        pts.push(`${B.x},${B.y}`);
      }
      flush();
      const dest = H.nodes[opts.route.to];
      if (dest.floor === floor) {
        el("circle", { cx: dest.x, cy: dest.y, r: 15, fill: "#46E3B7", stroke: "#0B111B", "stroke-width": 4 }, svg);
      }
      const start = H.nodes[opts.route.from];
      if (start.floor === floor && !opts.you) {
        el("circle", { cx: start.x, cy: start.y, r: 12, fill: "#fff", stroke: "#FF7A45", "stroke-width": 4 }, svg);
      }
    }

    // you
    if (opts.you && opts.you.floor === floor) {
      el("circle", { cx: opts.you.x, cy: opts.you.y, r: 26, fill: "#4DA3FF", opacity: 0.25, class: "pulse" }, svg);
      if (opts.heading != null) {
        const g = el("g", { transform: `translate(${opts.you.x} ${opts.you.y}) rotate(${opts.heading})` }, svg);
        el("path", { d: "M0,-34 L12,-12 L-12,-12 Z", fill: "#4DA3FF", opacity: 0.9 }, g);
      }
      el("circle", { cx: opts.you.x, cy: opts.you.y, r: 11, fill: "#4DA3FF", stroke: "#fff", "stroke-width": 4 }, svg);
    }
  }

  window.MapView = { render };
})();
