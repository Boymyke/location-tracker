/* Route finding (Dijkstra = shortest path) + turn-by-turn instructions. */
(function () {
  const H = window.HOUSE;           // filled by venue.js (mutated in place)
  const roomById = {};
  let adj = {};

  function init() {
    for (const k of Object.keys(roomById)) delete roomById[k];
    H.rooms.forEach((r) => (roomById[r.id] = r));
    adj = {};
    for (const id in H.nodes) adj[id] = [];
    for (const [a, b, type, meta] of H.edges) {
      if (!adj[a] || !adj[b]) continue;
      const m = meta || {};
      const len = edgeLength(a, b, type, m);
      // cost = learned length x penalty (+ tiny per-hop cost so straight lines win ties)
      const cost = len * (m.penalty || 1) + 0.02;
      const t = type || "walk";
      adj[a].push({ to: b, len, cost, type: t, meta: m });
      adj[b].push({ to: a, len, cost, type: t, meta: m });
    }
  }

  function edgeLength(a, b, type, m) {
    if (type === "stairs") return (m.steps || H.stairSteps) * 0.3 + 1.5; // metres of effort
    if (m.learnedLen) return m.learnedLen;
    const A = H.nodes[a], B = H.nodes[b];
    return Math.hypot(B.x - A.x, B.y - A.y) * H.metersPerPx;
  }
  const level = (f) => (H.floors[f] && H.floors[f].level) || 0;

  function bearing(a, b) {
    const A = H.nodes[a], B = H.nodes[b];
    const deg = (Math.atan2(B.x - A.x, -(B.y - A.y)) * 180) / Math.PI;
    return (deg + 360) % 360;
  }

  function norm180(d) {
    d = ((d + 540) % 360) - 180;
    return d;
  }

  function dijkstra(src, dst) {
    const dist = { [src]: 0 }, prev = {}, done = new Set();
    const q = [[0, src]];
    while (q.length) {
      q.sort((x, y) => x[0] - y[0]);
      const [d, u] = q.shift();
      if (done.has(u)) continue;
      done.add(u);
      if (u === dst) break;
      for (const e of adj[u]) {
        const nd = d + e.cost;
        if (nd < (dist[e.to] ?? Infinity)) {
          dist[e.to] = nd; prev[e.to] = u; q.push([nd, e.to]);
        }
      }
    }
    if (!(dst in dist)) return null;
    const path = [dst];
    while (path[0] !== src) path.unshift(prev[path[0]]);
    return path;
  }

  function turnWord(delta) {
    const a = Math.abs(delta);
    if (a < 30) return "Go straight";
    if (a > 140) return "Turn around";
    const side = delta > 0 ? "right" : "left";
    return a < 60 ? `Bear ${side}` : `Turn ${side}`;
  }

  // "Room 3" -> "Room 3", "Dining entrance" -> "the dining entrance"
  function phr(name) {
    if (/^(Room \d|Outside|Main entrance)/.test(name)) return name.startsWith("Room") ? name : "the " + name.toLowerCase();
    return "the " + name.charAt(0).toLowerCase() + name.slice(1);
  }

  function edgeType(a, b) {
    const e = adj[a].find((x) => x.to === b);
    return e ? e.type : "walk";
  }

  // Build a route object: segments (raw edges) merged into legs (instructions)
  function buildRoute(fromNode, toNode) {
    const path = dijkstra(fromNode, toNode);
    if (!path) return null;
    const segs = [];
    let acc = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const type = edgeType(a, b);
      const len = adj[a].find((x) => x.to === b).len;
      segs.push({
        from: a, to: b, type, len, start: acc, end: acc + len,
        floor: H.nodes[a].floor, toFloor: H.nodes[b].floor,
        bearing: type === "stairs" ? null : bearing(a, b),
      });
      acc += len;
    }

    // merge into legs
    const legs = [];
    for (const s of segs) {
      const last = legs[legs.length - 1];
      const lastSeg = last && last.segs[last.segs.length - 1];
      const canMerge = last && s.type === "walk" && last.type === "walk" &&
        Math.abs(norm180(s.bearing - lastSeg.bearing)) < 25;
      if (canMerge) { last.segs.push(s); last.end = s.end; last.to = s.to; }
      else legs.push({ type: s.type, segs: [s], start: s.start, end: s.end, from: s.from, to: s.to, floor: s.floor });
    }

    const common = (a, b) => (H.nodes[a].member || []).filter((r) => (H.nodes[b].member || []).includes(r));
    // name a door by the room it leads into (relative to the route)
    function doorName(legIdx, legsArr) {
      const leg = legsArr[legIdx], next = legsArr[legIdx + 1];
      const toN = H.nodes[leg.to];
      if (!next) return toN.label;
      const nextSeg = next.segs[0];
      const into = common(nextSeg.from, nextSeg.to)[0];
      const r = into && roomById[into];
      if (!r) return toN.label;
      if (r.kind === "stairs") return "Door to the stairs";
      return /^Room \d/.test(r.name) ? `Door to ${r.name}` : `Door to the ${r.name.toLowerCase()}`;
    }
    const destRoom = H.rooms.find((r) => r.node === toNode) || (H.nodes[toNode].object ? { name: H.nodes[toNode].label } : null);
    legs.forEach((leg, i) => {
      const toN = H.nodes[leg.to];
      const first = leg.segs[0];
      leg.bearing = first.bearing;
      if (leg.type === "stairs") {
        const up = level(H.nodes[leg.to].floor) > level(H.nodes[leg.from].floor);
        const steps = (leg.segs[0] && adj[leg.from].find((x) => x.to === leg.to)?.meta?.steps) || H.stairSteps;
        leg.steps = steps;
        leg.dir = up ? "up" : "down";
        leg.icon = "stairs";
        leg.text = `Take the stairs ${leg.dir}`;
        leg.sub = `About ${steps} steps, arriving at ${H.floors[H.nodes[leg.to].floor].name}`;
        return;
      }
      const prev = legs[i - 1];
      const prevBearing = prev && prev.type === "walk" ? prev.segs[prev.segs.length - 1].bearing : null;
      const delta = prevBearing == null ? 0 : norm180(leg.bearing - prevBearing);
      leg.turn = delta;
      const isLast = i === legs.length - 1;
      const named = isLast || toN.isDoor || !/hall|passage|corridor/i.test(toN.label);
      const target = phr(isLast && destRoom ? destRoom.name : toN.isDoor && !toN.named ? doorName(i, legs) : toN.label);
      const tail = named ? `to ${target}` : `along ${target}`;
      if (i === 0 || prevBearing == null) {
        leg.text = named ? `Head towards ${target}` : `Walk ${tail}`;
        leg.icon = "arrow-up";
      } else {
        const w = turnWord(delta);
        leg.text = w === "Go straight" ? `Continue ${tail}` : `${w} ${tail}`;
        leg.icon = Math.abs(delta) < 30 ? "arrow-up" : Math.abs(delta) > 140 ? "undo-2" : delta > 0 ? "corner-up-right" : "corner-up-left";
      }
      leg.sub = toN.isDoor && !isLast ? `Go through ${phr(toN.label)}` : "";
      leg.landmarks = sideLandmarks(leg, new Set(path));
    });

    return { path, segs, legs, total: acc, from: fromNode, to: toNode, destRoom };
  }

  // Rooms you pass on your left/right along a leg: doors close to the walked line
  function sideLandmarks(leg, onPath) {
    const out = [], seen = new Set();
    for (const id of onPath) { const n = H.nodes[id]; (n.member || []).forEach((r) => seen.add(r)); }
    const near = 1.4 / H.metersPerPx; // within ~1.4 m of the line
    for (const s of leg.segs) {
      const A = H.nodes[s.from], B = H.nodes[s.to];
      const dx = B.x - A.x, dy = B.y - A.y, L2 = dx * dx + dy * dy || 1;
      for (const id in H.nodes) {
        const n = H.nodes[id];
        if (!n.isDoor || n.floor !== A.floor || onPath.has(id)) continue;
        const rid = (n.member || []).find((r) => !seen.has(r));
        const room = rid && roomById[rid];
        if (!room || room.hidden || room.kind === "stairs") continue;
        const vx = n.x - A.x, vy = n.y - A.y;
        const along = (vx * dx + vy * dy) / L2;
        if (along < 0 || along > 1.05) continue;
        const perp = Math.abs(dx * vy - dy * vx) / Math.sqrt(L2);
        if (perp > near) continue;
        seen.add(rid);
        out.push({ room, nodeId: id, side: dx * vy - dy * vx > 0 ? "right" : "left", at: s.start + along * s.len });
      }
    }
    return out.sort((a, b) => a.at - b.at);
  }

  // Point on route at distance d (metres)
  function pointAt(route, d) {
    d = Math.max(0, Math.min(route.total, d));
    for (const s of route.segs) {
      if (d <= s.end + 1e-6) {
        const A = H.nodes[s.from], B = H.nodes[s.to];
        const t = s.len ? (d - s.start) / s.len : 0;
        if (s.type === "stairs") {
          return t < 0.5 ? { x: A.x, y: A.y, floor: A.floor } : { x: B.x, y: B.y, floor: B.floor };
        }
        return { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t, floor: A.floor };
      }
    }
    const last = H.nodes[route.to];
    return { x: last.x, y: last.y, floor: last.floor };
  }

  function segAt(route, d) {
    return route.segs.find((s) => d < s.end - 1e-6) || route.segs[route.segs.length - 1];
  }
  function legIndexAt(route, d) {
    const i = route.legs.findIndex((l) => d < l.end - 1e-6);
    return i === -1 ? route.legs.length - 1 : i;
  }

  // Nearest node to a tap on the map
  function nearestNode(floor, x, y) {
    let best = null, bd = Infinity;
    for (const id in H.nodes) {
      const n = H.nodes[id];
      if (n.floor !== floor) continue;
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }
  function roomAt(floor, x, y) {
    return H.rooms.find((r) => r.floor === floor && r.rect &&
      x >= r.rect[0] && x <= r.rect[2] && y >= r.rect[1] && y <= r.rect[3]);
  }

  // Distance along a route at which it passes a node (for camera fixes)
  function distOfNode(route, nodeId) {
    for (const sg of route.segs) { if (sg.from === nodeId) return sg.start; if (sg.to === nodeId) return sg.end; }
    return null;
  }
  // nearest node of a room (or any node) to a point
  function nearestInRoom(roomId, x, y) {
    let best = null, bd = Infinity;
    for (const id in H.nodes) {
      const n = H.nodes[id];
      const inside = n.place === roomId || (n.rooms && n.rooms.includes(roomId));
      if (!inside) continue;
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }

  init();
  window.Router = { init, distOfNode, nearestInRoom, phr, buildRoute, pointAt, segAt, legIndexAt, nearestNode, roomAt, norm180, roomById };
})();
