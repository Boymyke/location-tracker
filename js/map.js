/* SVG floor-plan renderer (light, app-style) */
(function () {
  const H = window.HOUSE, M = H.metersPerPx;
  const NS = "http://www.w3.org/2000/svg";

  const KIND = {
    living:      { fill: "#E6EEFF", ink: "#3563E9" },
    room:        { fill: "#F0E9FF", ink: "#7A4FE0" },
    service:     { fill: "#FFF1E3", ink: "#D9730D" },
    shared:      { fill: "#E2F6EE", ink: "#0E9F6E" },
    circulation: { fill: "#F3F5F9", ink: "#8590A6" },
    stairs:      { fill: "#FCEBDD", ink: "#C2621C" },
    work:        { fill: "#E5F1FB", ink: "#2B7BBF" },
    exit:        { fill: "#FFFFFF", ink: "#E5484D" },
  };
  const PRIMARY = "#2F5BFF";

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== "") e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function icon(parent, name, x, y, size, color, sw = 2) {
    const s = size / 24;
    const g = el("g", {
      transform: `translate(${x - size / 2} ${y - size / 2}) scale(${s})`,
      fill: "none", stroke: color, "stroke-width": sw, "stroke-linecap": "round", "stroke-linejoin": "round",
      "pointer-events": "none",
    }, parent);
    g.innerHTML = window.Icons.inner(name);
    return g;
  }

  /**
   * opts: route, progress (m walked), you {x,y,floor}, heading (plan deg),
   *       selected roomId, highlight roomId (destination fence), onPick(room),
   *       follow (bool) + zoom (px window), fences (bool)
   */
  function render(svg, floor, opts = {}) {
    svg.innerHTML = "";
    let vb = [256, 346, 568, 728];
    if (opts.follow && opts.you) {
      const w = opts.zoom || 280;
      const r = svg.clientHeight && svg.clientWidth ? svg.clientHeight / svg.clientWidth : 1;
      vb = [opts.you.x - w / 2, opts.you.y - (w * r) / 2 - (opts.offsetY || 0) * w * r, w, w * r];
    }
    svg.setAttribute("viewBox", vb.join(" "));
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    // house slab + shadow
    el("rect", { x: 266, y: 360, width: 546, height: 708, rx: 10, fill: "#0F1729", opacity: 0.06 }, svg);
    el("rect", { x: 268, y: 358, width: 542, height: 704, rx: 8, fill: "#FFFFFF" }, svg);

    const rooms = H.rooms.filter((r) => r.floor === floor && r.rect);
    for (const r of rooms) {
      const [x1, y1, x2, y2] = r.rect;
      const k = KIND[r.kind] || KIND.circulation;
      const sel = opts.selected === r.id, dest = opts.highlight === r.id;
      const g = el("g", { class: opts.onPick ? "pickable" : "" }, svg);
      el("rect", {
        x: x1 + 3, y: y1 + 3, width: x2 - x1 - 6, height: y2 - y1 - 6, rx: 6,
        fill: sel ? "#DCE5FF" : k.fill, stroke: sel ? PRIMARY : "transparent", "stroke-width": sel ? 4 : 0,
      }, g);
      if (r.kind === "stairs") {
        for (let x = x1 + 16; x < x2 - 10; x += 15) el("line", { x1: x, y1: y1 + 12, x2: x, y2: y2 - 12, stroke: "#E9B48A", "stroke-width": 2 }, g);
      }
      if (dest && opts.fences) {
        el("rect", { x: x1 + 3, y: y1 + 3, width: x2 - x1 - 6, height: y2 - y1 - 6, rx: 6, fill: "#12B886", opacity: 0.12 }, g);
        el("rect", { x: x1 + 5, y: y1 + 5, width: x2 - x1 - 10, height: y2 - y1 - 10, rx: 5, fill: "none", stroke: "#12B886", "stroke-width": 3, "stroke-dasharray": "10 7", class: "fence" }, g);
      }
      // label
      const w = x2 - x1, h = y2 - y1, vertical = h > w * 2.2;
      const span = vertical ? h : w;
      const fs = Math.max(11, Math.min(17, span / 9));
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
      const showIcon = !vertical && h > 70 && r.kind !== "circulation" && r.kind !== "stairs";
      if (showIcon) icon(g, r.icon, cx, cy - fs * 0.9, fs * 1.7, sel ? PRIMARY : k.ink);
      const t = el("text", {
        x: cx, y: showIcon ? cy + fs * 1.15 : cy + fs / 3, "text-anchor": "middle", "font-size": fs,
        "font-weight": 650, fill: sel ? PRIMARY : "#3A4660", "pointer-events": "none",
        transform: vertical ? `rotate(-90 ${cx} ${cy})` : undefined, "letter-spacing": ".02em",
      }, g);
      t.textContent = r.name.replace(/^(Upstairs|Downstairs) /, "");
      if (opts.onPick) g.addEventListener("click", () => opts.onPick(r));
    }

    // inner walls (room outlines)
    for (const r of rooms) {
      const [x1, y1, x2, y2] = r.rect;
      el("rect", { x: x1, y: y1, width: x2 - x1, height: y2 - y1, fill: "none", stroke: "#C9D1DF", "stroke-width": 2, "pointer-events": "none" }, svg);
    }
    // door gaps
    for (const id in H.nodes) {
      const n = H.nodes[id];
      if (n.floor !== floor || !n.door) continue;
      el("circle", { cx: n.x, cy: n.y, r: 5, fill: "#FFFFFF", stroke: "#C9D1DF", "stroke-width": 1.5, "pointer-events": "none" }, svg);
    }
    // outer walls
    el("rect", { x: 268, y: 358, width: 542, height: 704, rx: 8, fill: "none", stroke: "#2A3448", "stroke-width": 5, "pointer-events": "none" }, svg);

    // exits
    H.rooms.filter((r) => r.floor === floor && !r.rect).forEach((r) => {
      const n = H.nodes[r.node];
      const g = el("g", { class: opts.onPick ? "pickable" : "" }, svg);
      const sel = opts.selected === r.id;
      el("circle", { cx: n.x, cy: n.y, r: 15, fill: sel ? PRIMARY : "#FFFFFF", stroke: sel ? PRIMARY : "#E5484D", "stroke-width": 3 }, g);
      icon(g, r.icon, n.x, n.y, 16, sel ? "#fff" : "#E5484D", 2.4);
      if (opts.onPick) g.addEventListener("click", (e) => { e.stopPropagation(); opts.onPick(r); });
      if (opts.fences && opts.highlight === r.id) {
        el("circle", { cx: n.x, cy: n.y, r: 1.0 / M, fill: "#12B886", opacity: 0.12, "pointer-events": "none" }, svg);
        el("circle", { cx: n.x, cy: n.y, r: 1.0 / M, fill: "none", stroke: "#12B886", "stroke-width": 3, "stroke-dasharray": "8 6", class: "fence", "pointer-events": "none" }, svg);
      }
    });

    // route
    if (opts.route) drawRoute(svg, floor, opts);

    // you
    if (opts.you && opts.you.floor === floor) {
      const { x, y } = opts.you;
      if (opts.heading != null) {
        const g = el("g", { transform: `translate(${x} ${y}) rotate(${opts.heading})` }, svg);
        el("path", { d: "M0 0 L-26 -58 A64 64 0 0 1 26 -58 Z", fill: "url(#cone)", opacity: 0.9 }, g);
        const defs = el("defs", {}, svg);
        const lg = el("radialGradient", { id: "cone", cx: 0.5, cy: 1, r: 1 }, defs);
        el("stop", { offset: 0, "stop-color": PRIMARY, "stop-opacity": 0.45 }, lg);
        el("stop", { offset: 1, "stop-color": PRIMARY, "stop-opacity": 0 }, lg);
      }
      el("circle", { cx: x, cy: y, r: 24, fill: PRIMARY, opacity: 0.18, class: "pulse" }, svg);
      el("circle", { cx: x, cy: y, r: 11, fill: PRIMARY, stroke: "#fff", "stroke-width": 4.5, filter: "drop-shadow(0 2px 3px rgba(0,0,0,.3))" }, svg);
    }
  }

  function drawRoute(svg, floor, opts) {
    const route = opts.route;
    const runs = []; let cur = [];
    const markers = [];
    for (const s of route.segs) {
      const A = H.nodes[s.from], B = H.nodes[s.to];
      if (s.type === "stairs") {
        if (cur.length) { runs.push(cur); cur = []; }
        if (A.floor === floor) markers.push({ x: A.x, y: A.y, up: B.floor === "U" });
        if (B.floor === floor) markers.push({ x: B.x, y: B.y, up: B.floor === "U", arrive: true });
        continue;
      }
      if (A.floor !== floor) { if (cur.length) { runs.push(cur); cur = []; } continue; }
      if (!cur.length) cur.push([A.x, A.y, s.start]);
      cur.push([B.x, B.y, s.end]);
    }
    if (cur.length) runs.push(cur);
    for (const run of runs) {
      const pts = run.map((p) => p[0] + "," + p[1]).join(" ");
      el("polyline", { points: pts, fill: "none", stroke: "#FFFFFF", "stroke-width": 15, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg);
      el("polyline", { points: pts, fill: "none", stroke: PRIMARY, "stroke-width": 9, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg);
      el("polyline", { points: pts, fill: "none", stroke: "#FFFFFF", "stroke-width": 2.6, "stroke-dasharray": "1 13", "stroke-linecap": "round", opacity: 0.9, class: "flow" }, svg);
    }
    // walked part in grey
    if (opts.progress > 0) {
      const walked = [];
      for (const run of runs) {
        const pts = [];
        for (let i = 0; i < run.length; i++) {
          const [x, y, d] = run[i];
          if (d <= opts.progress) pts.push([x, y]);
          else {
            if (i > 0 && run[i - 1][2] < opts.progress) {
              const [px, py, pd] = run[i - 1], t = (opts.progress - pd) / (d - pd);
              pts.push([px + (x - px) * t, py + (y - py) * t]);
            }
            break;
          }
        }
        if (pts.length > 1) walked.push(pts);
      }
      walked.forEach((pts) => el("polyline", { points: pts.map((p) => p.join(",")).join(" "), fill: "none", stroke: "#A9B4C8", "stroke-width": 9, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg));
    }
    for (const m of markers) {
      el("circle", { cx: m.x, cy: m.y, r: 16, fill: "#fff", stroke: "#C2621C", "stroke-width": 3 }, svg);
      icon(svg, "stairs", m.x, m.y, 18, "#C2621C", 2.4);
    }
    const start = H.nodes[route.from];
    if (start.floor === floor && !opts.you) {
      el("circle", { cx: start.x, cy: start.y, r: 11, fill: "#fff", stroke: PRIMARY, "stroke-width": 5 }, svg);
    }
    const dest = H.nodes[route.to];
    if (dest.floor === floor) pin(svg, dest.x, dest.y);
  }

  function pin(svg, x, y) {
    const g = el("g", { transform: `translate(${x} ${y})`, filter: "drop-shadow(0 3px 3px rgba(0,0,0,.25))" }, svg);
    el("path", { d: "M0 0 C-4 -10 -16 -18 -16 -30 A16 16 0 1 1 16 -30 C16 -18 4 -10 0 0 Z", fill: "#E5484D", stroke: "#fff", "stroke-width": 2.5 }, g);
    el("circle", { cx: 0, cy: -30, r: 6, fill: "#fff" }, g);
  }

  window.MapView = { render, KIND };
})();
