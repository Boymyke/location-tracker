/* Route finding + turn-by-turn instructions over HOUSE graph. */
(function () {
  const H = window.HOUSE;
  const M = H.metersPerPx;
  const roomById = Object.fromEntries(H.rooms.map((r) => [r.id, r]));

  // adjacency
  const adj = {};
  for (const id in H.nodes) adj[id] = [];
  for (const [a, b, type] of H.edges) {
    const len = edgeLength(a, b, type);
    adj[a].push({ to: b, len, type: type || "walk" });
    adj[b].push({ to: a, len, type: type || "walk" });
  }

  function edgeLength(a, b, type) {
    if (type === "stairs") return H.stairSteps * 0.3 + 1.5; // metres of effort
    const A = H.nodes[a], B = H.nodes[b];
    return Math.hypot(B.x - A.x, B.y - A.y) * M;
  }

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
        const nd = d + e.len;
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

    const destRoom = H.rooms.find((r) => r.node === toNode);
    legs.forEach((leg, i) => {
      const toN = H.nodes[leg.to];
      const first = leg.segs[0];
      leg.bearing = first.bearing;
      if (leg.type === "stairs") {
        const up = H.nodes[leg.from].floor === "G";
        leg.dir = up ? "up" : "down";
        leg.icon = up ? "⬆️" : "⬇️";
        leg.text = `Take the stairs ${leg.dir}`;
        leg.sub = `About ${H.stairSteps} steps — you'll arrive ${up ? "upstairs" : "downstairs"}`;
        return;
      }
      const prev = legs[i - 1];
      const prevBearing = prev && prev.type === "walk" ? prev.segs[prev.segs.length - 1].bearing : null;
      const delta = prevBearing == null ? 0 : norm180(leg.bearing - prevBearing);
      leg.turn = delta;
      const isLast = i === legs.length - 1;
      const named = isLast || toN.door || !/hall|passage|corridor/i.test(toN.label);
      const target = phr(isLast && destRoom ? destRoom.name : toN.label);
      const tail = named ? `to ${target}` : `along ${target}`;
      if (i === 0 || prevBearing == null) {
        leg.text = named ? `Head towards ${target}` : `Walk ${tail}`;
        leg.icon = "⬆️";
      } else {
        const w = turnWord(delta);
        leg.text = w === "Go straight" ? `Continue ${tail}` : `${w} ${tail}`;
        leg.icon = Math.abs(delta) < 30 ? "⬆️" : Math.abs(delta) > 140 ? "↩️" : delta > 0 ? "➡️" : "⬅️";
      }
      leg.sub = toN.door ? `Go through the ${toN.label.toLowerCase()}` : "";
      leg.landmarks = sideLandmarks(leg, new Set(path));
    });

    return { path, segs, legs, total: acc, from: fromNode, to: toNode, destRoom };
  }

  // Rooms you pass on your left/right along a leg
  function sideLandmarks(leg, onPath) {
    const out = [], seen = new Set();
    for (const s of leg.segs) {
      for (const nid of [s.from, s.to]) {
        for (const e of adj[nid]) {
          const n = H.nodes[e.to];
          if (onPath.has(e.to) || !n.door || seen.has(n.door)) continue;
          const room = roomById[n.door];
          if (!room || room.hidden) continue;
          const A = H.nodes[s.from], B = H.nodes[s.to];
          const dx = B.x - A.x, dy = B.y - A.y, vx = n.x - A.x, vy = n.y - A.y;
          const cross = dx * vy - dy * vx;
          const along = ((vx * dx + vy * dy) / (dx * dx + dy * dy || 1));
          if (along < -0.05) continue; // behind you
          seen.add(n.door);
          out.push({ room, side: cross > 0 ? "right" : "left", at: s.start + Math.max(0, Math.min(1, along)) * s.len });
        }
      }
    }
    return out;
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

  window.Router = { phr, buildRoute, pointAt, segAt, legIndexAt, nearestNode, roomAt, norm180, roomById };
})();
