/*
 * AR FLOOR LINE
 * ---------------------------------------------------------------
 * Draws the route as a ribbon painted on the floor in the camera view,
 * like a live-view walking line. The route ahead (from the floor plan)
 * is converted to metres around the user, rotated by the phone's compass
 * heading, and projected through a pinhole camera model that uses the
 * phone's tilt. Room names are pinned in 3D at their doors.
 */
(function () {
  const H = window.HOUSE, R = window.Router, M = H.metersPerPx;
  const CAM_H = 1.35;       // phone height above floor (m)
  const VFOV = 62;          // vertical field of view of a rear camera (deg)
  const RANGE = 14;         // how far ahead the line is drawn (m)
  const WIDTH = 0.42;       // line width on the floor (m)
  const rad = (d) => (d * Math.PI) / 180;

  let cv, ctx, layer, W = 0, Hh = 0, dpr = 1;
  const pool = new Map();

  function init(canvas, labels) {
    cv = canvas; ctx = cv.getContext("2d"); layer = labels;
    resize(); addEventListener("resize", resize);
  }
  function resize() {
    if (!cv) return;
    dpr = Math.min(2, devicePixelRatio || 1);
    W = cv.clientWidth; Hh = cv.clientHeight;
    cv.width = W * dpr; cv.height = Hh * dpr;
  }

  /**
   * s: { route, dist, heading (plan deg), pitch (deg down from horizontal),
   *      dest, landmarks:[{room, nodeId}], time }
   * returns { aheadAngle } — angle of the path 1.5 m ahead relative to view
   */
  function frame(s) {
    if (!ctx) return {};
    if (cv.clientWidth !== W || cv.clientHeight !== Hh) resize();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, Hh);

    const me = R.pointAt(s.route, s.dist);
    const th = rad(Math.max(2, Math.min(80, s.pitch)));
    const psi = rad(s.heading);
    const F = (Hh / 2) / Math.tan(rad(VFOV / 2));
    const cosT = Math.cos(th), sinT = Math.sin(th), cosP = Math.cos(psi), sinP = Math.sin(psi);

    // plan px -> user frame (x right, z forward) in metres
    function toLocal(px, py) {
      const e = (px - me.x) * M, n = -(py - me.y) * M;
      return { x: e * cosP - n * sinP, z: e * sinP + n * cosP };
    }
    function project(x, y, z) {
      const Y = y - CAM_H;
      const zc = -Y * sinT + z * cosT;
      const yc = Y * cosT + z * sinT;
      if (zc < 0.2) return null;
      return { x: W / 2 + (F * x) / zc, y: Hh / 2 - (F * yc) / zc, zc };
    }

    // ---- sample the route ahead on this floor (stop at stairs) ----
    let end = Math.min(s.route.total, s.dist + RANGE), stairsAt = null;
    for (const sg of s.route.segs) {
      if (sg.type === "stairs" && sg.end > s.dist) {
        if (sg.start < end) { end = Math.max(s.dist, sg.start); stairsAt = sg; }
        break;
      }
    }
    const samples = [];
    for (let d = s.dist + 0.6; d <= end + 1e-6; d += 0.2) samples.push(d);
    if (samples.length && samples[samples.length - 1] < end) samples.push(end);
    const pts = samples.map((d) => {
      const p = R.pointAt(s.route, d), l = toLocal(p.x, p.y);
      return { d, x: l.x, z: l.z };
    });
    // tangents / normals
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let tx = b.x - a.x, tz = b.z - a.z; const L = Math.hypot(tx, tz) || 1;
      tx /= L; tz /= L; pts[i].tx = tx; pts[i].tz = tz; pts[i].nx = tz; pts[i].nz = -tx;
    }

    // ---- glow + ribbon, drawn back to front ----
    function quad(p, q, w, color, alpha) {
      const a = project(p.x - p.nx * w, 0, p.z - p.nz * w), b = project(p.x + p.nx * w, 0, p.z + p.nz * w);
      const c = project(q.x + q.nx * w, 0, q.z + q.nz * w), d = project(q.x - q.nx * w, 0, q.z - q.nz * w);
      if (!a || !b || !c || !d) return;
      ctx.globalAlpha = alpha; ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill();
    }
    const fade = (d) => Math.max(0, 1 - (d - s.dist) / RANGE) ** 0.6;
    for (let i = pts.length - 2; i >= 0; i--) quad(pts[i], pts[i + 1], WIDTH * 0.95, "#7FA0FF", 0.28 * fade(pts[i].d));
    for (let i = pts.length - 2; i >= 0; i--) quad(pts[i], pts[i + 1], WIDTH / 2, "#2F5BFF", 0.92 * fade(pts[i].d));
    // edges
    ctx.lineWidth = 2; ctx.strokeStyle = "#FFFFFF";
    for (const side of [-1, 1]) {
      ctx.beginPath(); let open = false;
      for (const p of pts) {
        const q = project(p.x + side * p.nx * WIDTH / 2, 0, p.z + side * p.nz * WIDTH / 2);
        if (!q) { open = false; continue; }
        ctx.globalAlpha = 0.85 * fade(p.d);
        if (!open) { ctx.moveTo(q.x, q.y); open = true; } else ctx.lineTo(q.x, q.y);
      }
      ctx.stroke();
    }

    // ---- moving chevrons on the line ----
    const phase = ((s.time / 1000) * 1.1) % 1;
    for (let d = s.dist + 0.6 + phase; d < end - 0.2; d += 1) {
      const p = interp(pts, d); if (!p) continue;
      const tip = project(p.x + p.tx * 0.16, 0, p.z + p.tz * 0.16);
      const l = project(p.x - p.tx * 0.1 - p.nx * 0.17, 0, p.z - p.tz * 0.1 - p.nz * 0.17);
      const nt = project(p.x + p.tx * 0.0, 0, p.z + p.tz * 0.0);
      const r = project(p.x - p.tx * 0.1 + p.nx * 0.17, 0, p.z - p.tz * 0.1 + p.nz * 0.17);
      if (!tip || !l || !r || !nt) continue;
      ctx.globalAlpha = 0.95 * fade(d); ctx.fillStyle = "#FFFFFF";
      ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(r.x, r.y); ctx.lineTo(nt.x, nt.y); ctx.lineTo(l.x, l.y); ctx.closePath(); ctx.fill();
    }

    // ---- end-of-line marker (destination pin or stairs) ----
    const labels = [];
    const endP = pts[pts.length - 1];
    if (endP && endP.d >= s.route.total - 0.05 && s.dest) {
      const base = project(endP.x, 0, endP.z), top = project(endP.x, 1.1, endP.z);
      if (base && top) {
        ctx.globalAlpha = 1; ctx.strokeStyle = "#E5484D"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.lineTo(top.x, top.y); ctx.stroke();
        ctx.fillStyle = "rgba(229,72,77,.25)"; ctx.beginPath(); ctx.ellipse(base.x, base.y, 24 * (2 / base.zc + .3), 9 * (2 / base.zc + .3), 0, 0, Math.PI * 2); ctx.fill();
        labels.push({ key: "dest", x: top.x, y: Math.max(top.y, 300), z: top.zc, cls: "dest", icon: s.dest.icon, title: s.dest.name, sub: `${(s.route.total - s.dist).toFixed(0)} m · arrive here` });
      }
    } else if (stairsAt && endP) {
      const top = project(endP.x, 1.2, endP.z);
      if (top) labels.push({ key: "stairs", x: top.x, y: Math.max(top.y, 300), z: top.zc, cls: "stairs", icon: "stairs", title: H.nodes[stairsAt.from].floor === "G" ? "Stairs up" : "Stairs down", sub: "Follow the line here" });
    }

    // ---- rooms pinned in space at their doors ----
    for (const lm of s.landmarks || []) {
      const n = H.nodes[lm.nodeId]; if (!n || n.floor !== me.floor) continue;
      const l = toLocal(n.x, n.y);
      const dist = Math.hypot(l.x, l.z); if (dist > 9 || dist < 0.4) continue;
      const p = project(l.x, 1.25, l.z);
      if (p && p.x > -40 && p.x < W + 40 && p.y > 230 && p.y < Hh - 230) labels.push({ key: lm.room.id, x: p.x, y: p.y, z: p.zc, cls: "room", icon: lm.room.icon, title: lm.room.name, sub: lm.room.activities.slice(0, 2).join(" · ") });
    }
    renderLabels(labels);
    ctx.globalAlpha = 1;

    // where is the path relative to the view? (for "turn around" hints)
    const ahead = interp(pts, Math.min(end, s.dist + 1.6)) || pts[0];
    const aheadAngle = ahead ? (Math.atan2(ahead.x, ahead.z) * 180) / Math.PI : 0;
    return { aheadAngle, me };
  }

  function interp(pts, d) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (d >= a.d && d <= b.d) {
        const t = (d - a.d) / (b.d - a.d || 1);
        return { d, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, tx: a.tx, tz: a.tz, nx: a.nx, nz: a.nz };
      }
    }
    return null;
  }

  function renderLabels(list) {
    const seen = new Set();
    for (const L of list) {
      seen.add(L.key);
      let e = pool.get(L.key);
      if (!e) {
        e = document.createElement("div");
        e.className = "ar-pin " + L.cls;
        e.innerHTML = `<div class="ar-pin-card"><span class="ar-pin-ic">${window.Icons.svg(L.icon, 18)}</span><span class="ar-pin-tx"><b></b><small></small></span></div><i class="ar-pin-stem"></i>`;
        layer.appendChild(e); pool.set(L.key, e);
      }
      e.querySelector("b").textContent = L.title;
      e.querySelector("small").textContent = L.sub;
      const sc = Math.max(0.62, Math.min(1.05, 2.2 / L.z));
      e.style.transform = `translate(${L.x}px, ${L.y}px) translate(-50%, -100%) scale(${sc})`;
      e.style.zIndex = String(1000 - Math.round(L.z * 10));
      e.style.opacity = "1";
    }
    for (const [k, e] of pool) if (!seen.has(k)) e.style.opacity = "0";
  }
  function clear() {
    if (ctx) ctx.clearRect(0, 0, cv.width, cv.height);
    for (const [, e] of pool) e.remove();
    pool.clear();
  }

  window.AR = { init, frame, clear };
})();
