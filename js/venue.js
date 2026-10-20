/*
 * VENUE: loads the map (from the server, or the built-in default) and turns
 * it into the walkable graph the router uses.
 *
 * Auto-walkways: every room is a rectangle, so it is convex. Inside a room
 * you can walk straight between any two of its "members" (centre, doors,
 * stairs ends, objects, extra waypoints). We connect all of them pairwise,
 * then Dijkstra picks the shortest route. Doors join two rooms because a
 * door point sits on the shared wall and belongs to both.
 */
(function () {
  const TOL = 14; // px: how close a point must be to a room to belong to it
  window.HOUSE = window.HOUSE || {};

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const inRect = (r, x, y, t = 0) => x >= r[0] - t && x <= r[2] + t && y >= r[1] - t && y <= r[3] + t;
  const edgeKey = (a, b) => (a < b ? a + "|" + b : b + "|" + a);

  function normalize(v) {
    v = clone(v);
    v.schema = 2;
    v.floors = v.floors || { G: { name: "Ground floor", level: 0 } };
    for (const k of ["rooms", "doors", "stairs", "objects", "waypoints", "anchors"]) v[k] = v[k] || [];
    v.edgeMeta = v.edgeMeta || {};
    v.plans = v.plans || {};
    v.metersPerPx = v.metersPerPx || 0.0222;
    v.defaultStride = v.defaultStride || 0.7;
    v.stairSteps = v.stairSteps || 15;
    v.objects.forEach((o) => (o.items = o.items || []));
    return v;
  }

  function roomsAt(v, floor, x, y, t = TOL) {
    return v.rooms.filter((r) => r.floor === floor && r.rect && inRect(r.rect, x, y, t));
  }
  function bestRoomAt(v, floor, x, y) {
    // strictly inside first, then nearest with tolerance
    return roomsAt(v, floor, x, y, 0)[0] || roomsAt(v, floor, x, y)[0] || null;
  }

  function buildGraph(v) {
    const nodes = {}, members = {}; // roomId -> [nodeIds]
      const add = (roomId, id) => { (members[roomId] = members[roomId] || []).push(id); const n = nodes[id]; if (n) { n.member = n.member || []; if (!n.member.includes(roomId)) n.member.push(roomId); } };
    const level = (f) => (v.floors[f] ? v.floors[f].level || 0 : 0);
    const placeRooms = [];

    for (const r of v.rooms) {
      const id = "c_" + r.id;
      nodes[id] = { floor: r.floor, x: (r.rect[0] + r.rect[2]) / 2, y: (r.rect[1] + r.rect[3]) / 2, label: r.name, place: r.id };
      add(r.id, id);
      placeRooms.push(Object.assign({}, r, { node: id, activities: r.activities || [], objects: [] }));
    }
    for (const d of v.doors) {
      const id = "d_" + d.id.replace(/^d_/, "");
      const rs = roomsAt(v, d.floor, d.x, d.y);
      const named = rs.filter((r) => r.kind !== "circulation" && r.kind !== "stairs");
      const main = named.sort((a, b) => area(a) - area(b))[0] || rs[0];
      nodes[id] = { floor: d.floor, x: d.x, y: d.y, label: d.name || (main ? `${main.name} door` : "Door"), door: main ? main.id : null, rooms: rs.map((r) => r.id), isDoor: true, named: !!d.name };
      rs.forEach((r) => add(r.id, id));
      if (d.exit) {
        placeRooms.push({ id: d.id, floor: d.floor, name: d.name || "Exit", rect: null, node: id, kind: "exit", icon: d.icon || "door-open",
          about: d.about || "Way out", activities: d.activities || ["Leave"], objects: [] });
      }
    }
    const edges = [];
    for (const s of v.stairs) {
      const up = level(s.b.floor) > level(s.a.floor);
      const ida = `s_${s.id}_a`, idb = `s_${s.id}_b`;
      nodes[ida] = { floor: s.a.floor, x: s.a.x, y: s.a.y, label: up ? "Bottom of the stairs" : "Top of the stairs", stairs: s.id };
      nodes[idb] = { floor: s.b.floor, x: s.b.x, y: s.b.y, label: up ? "Top of the stairs" : "Bottom of the stairs", stairs: s.id };
      const ra = bestRoomAt(v, s.a.floor, s.a.x, s.a.y), rb = bestRoomAt(v, s.b.floor, s.b.x, s.b.y);
      if (ra) add(ra.id, ida); if (rb) add(rb.id, idb);
      edges.push([ida, idb, "stairs", { steps: s.steps || v.stairSteps }]);
    }
    for (const o of v.objects) {
      const id = "o_" + o.id;
      const r = bestRoomAt(v, o.floor, o.x, o.y);
      nodes[id] = { floor: o.floor, x: o.x, y: o.y, label: o.name, object: o.id, place: r ? r.id : null };
      if (r) { add(r.id, id); const pr = placeRooms.find((p) => p.id === r.id); if (pr) pr.objects.push(o.name); }
    }
    for (const w of v.waypoints) {
      const id = "w_" + w.id;
      const r = bestRoomAt(v, w.floor, w.x, w.y);
      nodes[id] = { floor: w.floor, x: w.x, y: w.y, label: w.name || (r ? r.name : "Walkway") };
      if (r) add(r.id, id);
    }
    // connect every pair of members inside each (convex) room
    const seen = new Set();
    for (const rid in members) {
      const m = members[rid];
      for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) {
        const k = edgeKey(m[i], m[j]);
        if (seen.has(k)) continue; seen.add(k);
        const meta = v.edgeMeta[k] || {};
        if (meta.blocked) continue;
        edges.push([m[i], m[j], "walk", meta]);
      }
    }
    for (const e of edges) if (e[2] === "stairs") { const meta = v.edgeMeta[edgeKey(e[0], e[1])]; if (meta) Object.assign(e[3], meta); }
    return { nodes, edges, places: placeRooms };
  }
  const area = (r) => (r.rect[2] - r.rect[0]) * (r.rect[3] - r.rect[1]);

  function bounds(v) {
    const rs = v.rooms.filter((r) => r.rect);
    if (!rs.length) return [0, 0, 600, 800];
    return [Math.min(...rs.map((r) => r.rect[0])), Math.min(...rs.map((r) => r.rect[1])), Math.max(...rs.map((r) => r.rect[2])), Math.max(...rs.map((r) => r.rect[3]))];
  }

  // Turn a venue into window.HOUSE (mutated in place so every module sees it)
  function apply(raw) {
    const v = normalize(raw);
    const g = buildGraph(v);
    const H = window.HOUSE;
    for (const k of Object.keys(H)) delete H[k];
    Object.assign(H, {
      name: v.name, metersPerPx: v.metersPerPx, defaultStride: v.defaultStride, stairSteps: v.stairSteps,
      floors: v.floors, rooms: g.places, nodes: g.nodes, edges: g.edges,
      objects: v.objects, anchors: v.anchors, bounds: bounds(v), venue: v,
    });
    if (window.Router && window.Router.init) window.Router.init();
    return H;
  }

  async function load() {
    // 1) admin preview draft (same browser), 2) server, 3) built-in default
    let v = null, source = "default";
    try {
      if (new URLSearchParams(location.search).has("draft")) {
        const d = localStorage.getItem("goe.venue.draft");
        if (d) { v = JSON.parse(d); source = "draft"; }
      }
    } catch {}
    if (!v) {
      try {
        const res = await fetch("/api/venue", { cache: "no-store" });
        if (res.ok) { const j = await res.json(); if (j && j.rooms && j.rooms.length) { v = j; source = "server"; } }
      } catch {}
    }
    if (!v) v = window.DEFAULT_VENUE;
    apply(v);
    window.HOUSE.source = source;
    return window.HOUSE;
  }

  window.Venue = { load, apply, normalize, buildGraph, roomsAt, bestRoomAt, edgeKey, inRect, clone };
  // apply the default right away so the page can render before the network answers
  apply(window.DEFAULT_VENUE);
})();
