/* Goe — main app controller */
(function () {
  const H = window.HOUSE, R = window.Router, S = window.Sensors, L = window.Learn, MV = window.MapView, I = window.Icons;
  const $ = (id) => document.getElementById(id);
  const roomById = R.roomById;
  const WALK_SPEED = 1.1; // m/s

  const CATS = [
    { id: "all", label: "All", icon: "layers", match: () => true },
    { id: "things", label: "Things", icon: "package", match: () => false, things: true },
    { id: "food", label: "Food", icon: "chef-hat", match: (r) => /kitchen|store|pantry|dining/i.test(r.name) },
    { id: "relax", label: "Relax", icon: "sofa", match: (r) => r.kind === "living" || r.kind === "shared" },
    { id: "sleep", label: "Bedrooms", icon: "bed-double", match: (r) => r.kind === "room" },
    { id: "bath", label: "Toilet", icon: "toilet", match: (r) => /toilet|wc|bath/i.test(r.name) || r.icon === "toilet" },
    { id: "work", label: "Study", icon: "book-open", match: (r) => r.kind === "work" },
    { id: "exit", label: "Exits", icon: "door-open", match: (r) => r.kind === "exit" },
  ];

  const st = {
    whereFloor: "G", destFloor: "G", pvFloor: "G", pkFloor: "G",
    fromRoom: null, pendingFrom: null, dest: null, route: null, cat: "all",
    // navigation
    navigating: false, mode: "live", dist: 0, vDist: 0, vHead: 0, steps: 0, stepsInLeg: 0, legIdx: -1,
    zone: null, wrongWay: 0, offrouteShown: false, stairsWaiting: false, voice: true, demoTimer: null, raf: 0, lastMap: 0,
  };

  // ---------------- helpers ----------------
  function show(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === "screen-" + id));
    window.scrollTo(0, 0);
    document.body.classList.toggle("navving", id === "nav");
    document.querySelector('meta[name="theme-color"]').content = id === "nav" ? "#1A3BCB" : "#F4F6FA";
  }
  function toast(msg, ms = 2400) {
    const t = $("toast"); t.textContent = msg; t.classList.add("on");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), ms);
  }
  function speak(text) {
    if (!st.voice || !("speechSynthesis" in window)) return;
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 1.02; speechSynthesis.speak(u); } catch {}
  }
  const vibrate = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };
  const stepsFor = (m) => Math.max(0, Math.round(m / L.stride()));
  const secsFor = (m) => Math.max(1, Math.round(m / WALK_SPEED));
  const fmtTime = (s) => (s < 60 ? `${s} sec` : `${Math.round(s / 60)} min`);
  const floorName = (f) => H.floors[f].name;
  const floorShort = (f) => `${(H.floors[f].level || 0) + 1}F`;
  const floorIds = () => Object.keys(H.floors).sort((a, b) => (H.floors[b].level || 0) - (H.floors[a].level || 0));
  const lowestFloor = () => floorIds().slice(-1)[0];
  const tile = (r, size = 20) => {
    const k = MV.KIND[r.kind] || MV.KIND.circulation;
    return `<span class="tile" style="--tint:${k.fill};--ink:${k.ink}">${I.svg(r.icon, size)}</span>`;
  };
  const esc = (x) => String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const load = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  document.querySelectorAll("[data-back]").forEach((b) => b.addEventListener("click", () => show(b.dataset.back)));
  $("bldg-name").textContent = H.name;

  // floor switch (floating, like indoor maps)
  function floorSwitch(target, current, onChange) {
    const box = document.querySelector(`.floor-switch[data-target="${target}"]`);
    box.innerHTML = "";
    floorIds().forEach((f) => {
      const b = document.createElement("button");
      b.textContent = floorShort(f); b.title = floorName(f);
      b.className = f === current ? "on" : "";
      b.onclick = () => onChange(f);
      box.appendChild(b);
    });
    const lab = document.createElement("span"); lab.className = "fs-label"; lab.textContent = floorName(current);
    box.appendChild(lab);
  }

  // ================= 1. WHERE ARE YOU =================
  function renderWhere() {
    floorSwitch("where", st.whereFloor, (f) => { st.whereFloor = f; renderWhere(); });
    const sel = st.pendingFrom || st.fromRoom;
    MV.render($("where-map"), st.whereFloor, { selected: sel && sel.id, onPick: pickFrom });
    const q = $("where-search").value.trim().toLowerCase();
    const list = $("where-list"); list.innerHTML = "";
    const last = load("goe.lastRoom");
    if (last && roomById[last] && !q) {
      const r = roomById[last];
      list.insertAdjacentHTML("beforeend", `<div class="list-h">Recent</div>`);
      list.appendChild(row(r, `Last location · ${floorName(r.floor)}`, sel && sel.id === r.id, () => pickFrom(r)));
    }
    for (const f of floorIds().reverse()) {
      const rooms = H.rooms.filter((r) => r.floor === f && (!r.hidden || r.kind === "stairs") && (!q || r.name.toLowerCase().includes(q)));
      if (!rooms.length) continue;
      list.insertAdjacentHTML("beforeend", `<div class="list-h">${floorName(f)}</div>`);
      rooms.forEach((r) => list.appendChild(row(r, r.about, sel && sel.id === r.id, () => pickFrom(r))));
    }
    const btn = $("btn-where-next");
    btn.disabled = !sel;
    btn.querySelector("span").textContent = sel ? `I'm in the ${sel.name}` : "Choose your room";
  }
  function row(r, sub, on, onclick, end) {
    const b = document.createElement("button");
    b.className = "row-item" + (on ? " on" : "");
    b.innerHTML = `${tile(r)}<span class="ri-body"><b>${r.name}</b><small>${sub}</small></span><span class="ri-end">${end || (on ? I.svg("circle-check", 22) : "")}</span>`;
    b.onclick = onclick;
    return b;
  }
  function pickFrom(r) {
    st.pendingFrom = r; st.whereFloor = r.floor; vibrate(12); renderWhere();
  }
  $("where-search").addEventListener("input", renderWhere);
  $("btn-where-next").onclick = () => {
    const r = st.pendingFrom || st.fromRoom; if (!r) return;
    st.fromRoom = r; st.pendingFrom = null; save("goe.lastRoom", r.id);
    st.destFloor = r.floor; renderDest(); show("dest");
  };

  // ================= 2. WHERE TO =================
  function renderDest() {
    $("dest-from").textContent = `${st.fromRoom.name} · ${floorName(st.fromRoom.floor)}`;
    const onDestFloor = (f) => { st.destFloor = f; floorSwitch("dest", f, onDestFloor); renderDestMap(); };
    floorSwitch("dest", st.destFloor, onDestFloor);
    renderDestMap();
    const cats = $("dest-cats"); cats.innerHTML = "";
    CATS.forEach((c) => {
      const b = document.createElement("button");
      b.className = "cat" + (st.cat === c.id ? " on" : "");
      b.innerHTML = `${I.svg(c.icon, 16)}<span>${c.label}</span>`;
      b.onclick = () => { st.cat = c.id; renderDest(); };
      cats.appendChild(b);
    });
    const q = $("dest-search").value.trim().toLowerCase();
    const cat = CATS.find((c) => c.id === st.cat);
    const list = $("dest-list"); list.innerHTML = "";
    const things = (cat.things || q) ? thingTargets(q) : [];
    const items = H.rooms.filter((r) => !r.hidden && r.id !== st.fromRoom.id && cat.match(r)).filter((r) =>
      !q || (r.name + " " + r.about + " " + r.activities.join(" ") + " " + r.objects.join(" ")).toLowerCase().includes(q))
      .map((r) => ({ r, route: R.buildRoute(st.fromRoom.node, r.node) }))
      .filter((x) => x.route)
      .sort((a, b) => a.route.total - b.route.total);
    if (things.length) {
      list.insertAdjacentHTML("beforeend", `<div class="list-h">Things</div>`);
      things.forEach((d) => {
        const route = R.buildRoute(st.fromRoom.node, d.node); if (!route) return;
        const end = `<span class="ri-steps"><b>${stepsFor(route.total)}</b><small>steps</small></span>${I.svg("chevron-right", 18)}`;
        list.appendChild(row(d, d.sub, false, () => openPreview(d), end));
      });
      if (items.length) list.insertAdjacentHTML("beforeend", `<div class="list-h">Places</div>`);
    }
    if (!items.length && !things.length) { list.innerHTML = `<div class="empty">${I.svg("search", 28)}<p>Nothing matches “${q || cat.label}”.${cat.things ? " Add objects and items in the admin app." : ""}</p></div>`; return; }
    items.forEach(({ r, route }) => {
      const ch = route.legs.some((l) => l.type === "stairs");
      const sub = `${floorName(r.floor)}${ch ? " · via stairs" : ""} · ${r.activities.slice(0, 2).join(", ")}`;
      const end = `<span class="ri-steps"><b>${stepsFor(route.total)}</b><small>steps</small></span>${I.svg("chevron-right", 18)}`;
      list.appendChild(row(r, sub, false, () => openPreview(r), end));
    });
  }
  // objects (bed, fridge…) and the items kept at them, as destinations
  function thingDest(o, item) {
    const n = H.nodes["o_" + o.id]; const room = n && roomById[n.place];
    const roomName = room ? room.name : "";
    return {
      id: "obj:" + o.id + (item ? ":" + item.id : ""), isThing: true, objectId: o.id, item, kind: "object",
      name: item ? item.name : o.name, icon: item ? "search" : o.icon || "map-pin", floor: o.floor, node: "o_" + o.id, roomName,
      sub: item ? `At the ${o.name}${item.where ? " · " + item.where : ""}` : `${roomName ? "In " + roomName + " · " : ""}${floorName(o.floor)}`,
      about: item ? `Kept at the ${o.name}${roomName ? " in " + roomName : ""}` : `${roomName ? "In " + roomName : "Object"}`,
      activities: item ? [item.where ? `Look here: ${item.where}` : `Look at the ${o.name}`] : (o.items || []).length ? o.items.map((i) => `Find ${i.name}${i.where ? " (" + i.where + ")" : ""}`) : ["Find it here"],
      objects: [],
    };
  }
  function thingTargets(q) {
    const out = [];
    for (const o of H.objects || []) {
      if (!H.nodes["o_" + o.id]) continue;
      const room = roomById[H.nodes["o_" + o.id].place];
      const oText = (o.name + " " + (room ? room.name : "")).toLowerCase();
      if (!q || oText.includes(q)) out.push(thingDest(o));
      for (const it of o.items || []) if (!q || (it.name + " " + (it.where || "")).toLowerCase().includes(q)) out.push(thingDest(o, it));
    }
    return out.filter((d) => !st.fromRoom || d.node !== st.fromRoom.node).slice(0, 40);
  }
  function renderDestMap() {
    const n = H.nodes[st.fromRoom.node];
    MV.render($("dest-map"), st.destFloor, { you: { x: n.x, y: n.y, floor: n.floor }, onPick: (r) => { if (!r.hidden && r.id !== st.fromRoom.id) openPreview(r); } });
  }
  $("dest-search").addEventListener("input", renderDest);

  // ================= 3. PREVIEW =================
  function openPreview(room) {
    st.dest = room;
    st.route = R.buildRoute(st.fromRoom.node, room.node);
    if (!st.route) { toast("No route found"); return; }
    st.pvFloor = st.fromRoom.floor;
    const changes = st.route.legs.filter((l) => l.type === "stairs").length;
    $("pv-icon").outerHTML = `<div class="tile big" id="pv-icon" style="--tint:${(MV.KIND[room.kind] || MV.KIND.circulation).fill};--ink:${(MV.KIND[room.kind] || MV.KIND.circulation).ink}">${I.svg(room.icon, 28)}</div>`;
    $("pv-name").textContent = room.name;
    $("pv-floors").textContent = `From ${st.fromRoom.name}` + (changes ? ` · ${floorName(st.fromRoom.floor)} → ${floorName(room.floor)}` : ` · ${floorName(room.floor)}`);
    $("pv-stats").innerHTML = `
      <div>${I.svg("footprints", 18)}<b>${stepsFor(st.route.total)}</b><span>steps</span></div>
      <div>${I.svg("clock", 18)}<b>${fmtTime(secsFor(st.route.total))}</b><span>walk</span></div>
      <div>${I.svg("stairs", 18)}<b>${changes}</b><span>floor change${changes === 1 ? "" : "s"}</span></div>`;
    renderPreviewMap();
    const legs = $("pv-legs"); legs.innerHTML = "";
    st.route.legs.forEach((l) => {
      const n = l.type === "stairs" ? `${H.stairSteps} stairs` : `${stepsFor(l.end - l.start)} steps`;
      const pass = l.landmarks && l.landmarks.length ? ` · ${l.landmarks.map((m) => m.room.name + " on your " + m.side).join(", ")}` : "";
      legs.insertAdjacentHTML("beforeend", `<li><span class="st-ic">${I.svg(l.icon, 20)}</span><span class="st-tx">${l.text}<small>${n}${pass}</small></span></li>`);
    });
    legs.insertAdjacentHTML("beforeend", `<li class="final"><span class="st-ic">${I.svg("flag", 20)}</span><span class="st-tx">Arrive at ${R.phr(room.name)}<small>${floorName(room.floor)} · you'll be told when you enter</small></span></li>`);
    if (room.isThing && room.item) $("pv-info").innerHTML = `<div class="look-here">${I.svg("search", 20)}<div><b>${room.item.where ? "Look here: " + esc(room.item.where) : "Look around the " + esc(room.about)}</b><span>${esc(room.about)}</span></div></div>`;
    else $("pv-info").innerHTML = `<p>${room.about}</p>
      <ul class="acts">${room.activities.map((a) => `<li>${I.svg("check", 16)}${a}</li>`).join("")}</ul>
      ${room.objects.length ? `<div class="tags">${room.objects.map((o) => `<span>${I.svg("map-pin", 13)}${o}</span>`).join("")}</div>` : ""}`;
    show("preview");
  }
  function renderPreviewMap() {
    const floors = [...new Set([H.nodes[st.route.from].floor, H.nodes[st.route.to].floor])];
    const box = document.querySelector('.floor-switch[data-target="pv"]');
    box.style.display = "";
    floorSwitch("pv", st.pvFloor, (f) => { st.pvFloor = f; renderPreviewMap(); });
    box.classList.toggle("dual", floors.length > 1);
    MV.render($("pv-map"), st.pvFloor, { route: st.route, highlight: st.dest.isThing ? null : st.dest.id, highlightObject: st.dest.objectId, fences: true });
  }
  $("btn-start").onclick = () => startNav("live");
  $("btn-start-map").onclick = () => startNav("map");

  // ================= 4. NAVIGATION =================
  async function startNav(mode) {
    await S.requestPermissions();
    S.start();
    show("nav");
    Object.assign(st, { navigating: true, dist: 0, vDist: 0, steps: 0, stepsInLeg: 0, legIdx: -1, zone: null, wrongWay: 0, offrouteShown: false, stairsWaiting: false });
    st.vHead = st.route.segs.find((s) => s.bearing != null)?.bearing || 0;
    L.startTrip(st.route, { mode, fromRoom: st.fromRoom.id, dest: st.dest.id });
    AR.init($("ar-canvas"), $("ar-labels"));
    setMode(mode);
    if (mode === "live") await ensureCamera();
    S.onStep = onStep;
    startVisionFixes();
    updateNav(true);
    cancelAnimationFrame(st.raf);
    st.raf = requestAnimationFrame(tick);
    setTimeout(() => {
      updateSensorChip();
      if (S.hasCompass && L.compassOffset() == null) openCalib();
      if (!S.hasMotion) toast("No motion sensor here — tap “I'm here” at each turn, or use Demo walk", 4200);
    }, 1500);
  }
  async function ensureCamera() {
    if (S._stream) return;
    const ok = await S.startCamera($("cam"));
    $("cam-fallback").classList.toggle("on", !ok);
    if (!ok) toast("Camera not available — showing the line on a plain view");
  }
  function setMode(mode) {
    st.mode = mode;
    $("screen-nav").classList.toggle("mode-map", mode === "map");
    $("btn-mode").innerHTML = I.svg(mode === "map" ? "camera" : "map", 22);
    $("btn-mode").setAttribute("aria-label", mode === "map" ? "Live view" : "Map view");
    st.lastMap = 0;
  }
  $("btn-mode").onclick = async () => { setMode(st.mode === "live" ? "map" : "live"); if (st.mode === "live") await ensureCamera(); };

  function updateSensorChip() {
    const off = L.compassOffset();
    const [ic, tx] = S.hasCompass ? (off == null ? ["compass", "Calibrate"] : ["compass", "Compass"]) : S.hasMotion ? ["footprints", "Steps"] : ["info", "Manual"];
    $("chip-sensor").innerHTML = `${I.svg(ic, 14)}<span>${tx}</span>`;
  }

  const currentLeg = () => st.route.legs[st.legIdx];
  function planHeading() {
    const off = L.compassOffset();
    if (S.heading == null || off == null || st.demoTimer) return null;
    return (S.heading - off + 360) % 360;
  }

  function onStep(ev) {
    if (!st.navigating || st.stairsWaiting) return;
    st.steps++; st.stepsInLeg++;
    const leg = currentLeg();
    L.log("step", { d: +st.dist.toFixed(2), h: ev && ev.heading != null ? Math.round(ev.heading) : null });
    if (leg.type === "stairs") {
      st.dist = Math.min(leg.end - 0.01, st.dist + (leg.end - leg.start) / H.stairSteps);
      if (st.stepsInLeg >= Math.round(H.stairSteps * 0.8)) askStairsDone();
    } else {
      let factor = 1;
      const ph = planHeading();
      if (ph != null) {
        const seg = R.segAt(st.route, st.dist);
        const diff = Math.abs(R.norm180(seg.bearing - ph));
        factor = diff < 60 ? 1 : diff < 110 ? 0.4 : 0;
        // route corridor fence: walking away from the path for several steps
        st.wrongWay = diff > 115 ? st.wrongWay + 1 : 0;
        if (st.wrongWay >= 4 && !st.offrouteShown) { st.offrouteShown = true; $("offroute").classList.remove("hidden"); vibrate([60, 60, 60]); speak("You're leaving the route."); L.log("offroute", { from: seg.from, to: seg.to }); }
      }
      st.dist += L.stride() * factor;
    }
    updateNav();
  }

  function updateNav(force) {
    const route = st.route;
    const li = R.legIndexAt(route, st.dist);
    if (li !== st.legIdx || force) {
      const changed = li !== st.legIdx;
      st.legIdx = li; if (changed && !force) st.stepsInLeg = 0;
      const leg = currentLeg();
      $("ban-ic").innerHTML = I.svg(leg.icon, 40);
      $("ban-text").textContent = leg.text;
      const next = route.legs[li + 1];
      $("then").classList.toggle("hidden", !next);
      if (next) { $("then-ic").innerHTML = I.svg(next.icon, 16); $("then-text").textContent = next.text; }
      else { $("then").classList.remove("hidden"); $("then-ic").innerHTML = I.svg("flag", 16); $("then-text").textContent = `Arrive at ${R.phr(st.dest.name)}`; }
      $("here-text").textContent = leg.type === "stairs" ? (leg.dir === "up" ? "I'm upstairs" : "I'm downstairs") :
        li === route.legs.length - 1 ? "I've arrived" : "I'm at the turn";
      speak(leg.text + (leg.type === "stairs" ? "" : `. About ${stepsFor(leg.end - leg.start)} steps.`));
      if (!force) vibrate([30, 40, 30]);
      L.log("leg", { idx: li, text: leg.text });
      st.offrouteShown = false; st.wrongWay = 0;
    }
    const leg = currentLeg();
    const remainLeg = leg.type === "stairs" ? Math.max(0, H.stairSteps - st.stepsInLeg) : stepsFor(leg.end - st.dist);
    $("ban-steps").textContent = remainLeg;
    const left = Math.max(0, route.total - st.dist);
    $("eta-main").textContent = `${stepsFor(left)} steps · ${fmtTime(secsFor(left))}`;
    $("eta-sub").textContent = `to ${st.dest.name} · ${floorName(st.dest.floor)}`;
    $("progress-bar").style.width = Math.min(100, (st.dist / route.total) * 100) + "%";

    // ---- geofences ----
    const pos = R.pointAt(route, st.dist);
    $("floor-name").textContent = floorName(pos.floor);
    const zone = R.roomAt(pos.floor, pos.x, pos.y) || null;
    if ((zone && zone.id) !== (st.zone && st.zone.id)) {
      st.zone = zone;
      $("zone-name").textContent = !zone ? "Between rooms" : zone.kind === "stairs" ? "On the stairs" : `In ${zone.name}`;
      $("chip-zone").classList.remove("flash"); void $("chip-zone").offsetWidth; $("chip-zone").classList.add("flash");
      if (zone) L.log("zone", { room: zone.id });
    }
    const destN = H.nodes[st.dest.node];
    const toDest = Math.hypot(destN.x - pos.x, destN.y - pos.y) * H.metersPerPx;
    if ((zone && zone.id === st.dest.id && pos.floor === st.dest.floor) || (destN.floor === pos.floor && toDest < 0.9) || st.dist >= route.total - 0.3) {
      return arrive("geofence");
    }
  }

  // ---- render loop: smooth line + maps ----
  function tick(t) {
    if (!st.navigating) return;
    st.vDist += (st.dist - st.vDist) * 0.14;
    const seg = R.segAt(st.route, st.vDist);
    const ph = planHeading();
    const target = ph != null ? ph : seg.bearing != null ? seg.bearing : st.vHead;
    st.vHead = (st.vHead + R.norm180(target - st.vHead) * 0.12 + 360) % 360;
    const pos = R.pointAt(st.route, st.vDist);

    if (st.mode === "live") {
      const pitch = S.beta != null ? 90 - S.beta : 24;
      const out = AR.frame({ route: st.route, dist: st.vDist, heading: st.vHead, pitch, dest: st.dest, landmarks: nearbyDoors(pos), time: t });
      const a = out.aheadAngle || 0, hint = $("turn-hint");
      const leg = currentLeg();
      if (leg.type === "stairs") {
        hint.classList.remove("hidden");
        $("turn-hint-ic").innerHTML = I.svg("stairs", 26);
        $("turn-hint-text").textContent = `${leg.dir === "up" ? "Climb" : "Go down"} the stairs · ${Math.max(0, H.stairSteps - st.stepsInLeg)} left`;
      } else if (ph != null && Math.abs(a) > 55) {
        hint.classList.remove("hidden");
        const back = Math.abs(a) > 130;
        $("turn-hint-ic").innerHTML = I.svg(back ? "undo-2" : a > 0 ? "corner-up-right" : "corner-up-left", 26);
        $("turn-hint-text").textContent = back ? "Turn around" : a > 0 ? "Turn right" : "Turn left";
      } else hint.classList.add("hidden");
    }
    if (t - st.lastMap > 220) {
      st.lastMap = t;
      const opts = { route: st.route, progress: st.vDist, you: pos, heading: ph != null ? st.vHead : null, highlight: st.dest.isThing ? null : st.dest.id, highlightObject: st.dest.objectId, fences: true, follow: true };
      if (st.mode === "live") MV.render($("mini-map"), pos.floor, { ...opts, zoom: 230 });
      else MV.render($("nav-map"), pos.floor, { ...opts, zoom: 330, offsetY: 0.12 });
    }
    st.raf = requestAnimationFrame(tick);
  }
  function nearbyDoors(pos) {
    const best = {};
    for (const id in H.nodes) {
      const n = H.nodes[id];
      if (n.floor !== pos.floor || !n.door || n.door === st.dest.id) continue;
      const room = roomById[n.door]; if (!room || room.hidden) continue;
      if (st.zone && st.zone.id === room.id) continue;
      const d = Math.hypot(n.x - pos.x, n.y - pos.y);
      if (!best[room.id] || d < best[room.id].d) best[room.id] = { d, room, nodeId: id };
    }
    for (const o of H.objects || []) {
      if (o.floor !== pos.floor || o.id === st.dest.objectId) continue;
      if (Math.hypot(o.x - pos.x, o.y - pos.y) * H.metersPerPx > 6) continue;
      best["o_" + o.id] = { room: { id: "o_" + o.id, name: o.name, icon: o.icon || "map-pin", activities: (o.items || []).map((i) => i.name) }, nodeId: "o_" + o.id, obj: true };
    }
    return Object.values(best);
  }

  // ---- manual corrections (these also teach the stride model) ----
  $("btn-here").onclick = () => {
    const leg = currentLeg();
    st.dist = Math.min(st.route.total, leg.end + 0.01);
    L.fix(st.dist, st.steps);
    st.stairsWaiting = false; $("stairs-sheet").classList.add("hidden");
    st.stepsInLeg = 0;
    if (st.legIdx === st.route.legs.length - 1) return arrive("confirmed");
    updateNav();
  };
  function askStairsDone() {
    const leg = currentLeg();
    st.stairsWaiting = true;
    $("stairs-title").textContent = leg.dir === "up" ? "Are you upstairs now?" : "Are you downstairs now?";
    $("stairs-text").textContent = leg.dir === "up" ? "Confirm when you reach the top of the stairs and I'll switch to the upstairs map." : "Confirm when you reach the bottom and I'll switch to the downstairs map.";
    $("stairs-sheet").classList.remove("hidden");
    speak($("stairs-title").textContent);
  }
  $("btn-stairs-done").onclick = () => $("btn-here").click();

  // ---- off-route ----
  $("btn-off-dismiss").onclick = () => { $("offroute").classList.add("hidden"); st.wrongWay = 0; };
  $("btn-off-fix").onclick = () => { $("offroute").classList.add("hidden"); openPicker(); };

  // ---- calibration ----
  function openCalib() {
    const leg = st.route.legs.slice(st.legIdx).find((l) => l.type === "walk") || st.route.legs.find((l) => l.type === "walk");
    if (!leg) return;
    st._calibLeg = leg;
    $("calib-text").textContent = `Hold the phone upright and point it toward ${R.phr(H.nodes[leg.to].label)}, then tap the button. You only need to do this once.`;
    $("calib").classList.remove("hidden");
  }
  $("btn-calib").onclick = () => {
    if (S.heading == null) { toast("Compass not ready — move the phone in a figure-8"); return; }
    const leg = st._calibLeg || currentLeg();
    const seg = R.segAt(st.route, Math.max(st.dist, leg.start));
    const off = (S.heading - seg.bearing + 360) % 360;
    L.setCompassOffset(off);
    L.log("calibrate", { heading: Math.round(S.heading), offset: Math.round(off) });
    $("calib").classList.add("hidden");
    updateSensorChip();
    toast("Compass lined up with the house");
  };
  $("btn-calib-skip").onclick = () => $("calib").classList.add("hidden");

  // ---- menu ----
  $("btn-menu").onclick = () => $("menu").classList.toggle("hidden");
  $("m-close").onclick = () => $("menu").classList.add("hidden");
  $("m-calib").onclick = () => { $("menu").classList.add("hidden"); openCalib(); };
  $("m-step").onclick = () => onStep({ heading: S.heading });
  $("m-voice").onclick = () => {
    st.voice = !st.voice;
    $("m-voice").innerHTML = `${I.svg(st.voice ? "volume-2" : "volume-x", 20)}<span>Voice guidance: ${st.voice ? "on" : "off"}</span>`;
    if (!st.voice) try { speechSynthesis.cancel(); } catch {}
  };
  $("m-demo").onclick = () => {
    $("menu").classList.add("hidden");
    if (st.demoTimer) { clearInterval(st.demoTimer); st.demoTimer = null; toast("Demo stopped"); $("m-demo").querySelector("span").textContent = "Demo walk"; return; }
    toast("Demo walk — stepping automatically");
    $("m-demo").querySelector("span").textContent = "Stop demo walk";
    st.demoTimer = setInterval(() => {
      if (!st.navigating) { clearInterval(st.demoTimer); st.demoTimer = null; return; }
      if (st.stairsWaiting) { $("btn-here").click(); return; }
      onStep({ heading: null });
    }, 700);
  };
  $("btn-end").onclick = () => { stopNav("cancelled"); renderDest(); show("dest"); };

  // ---- lost: pick location, re-route ----
  $("btn-lost").onclick = () => openPicker();
  function openPicker() {
    const pos = R.pointAt(st.route, st.dist);
    st.pkFloor = pos.floor; renderPicker(); $("picker").classList.remove("hidden");
  }
  function renderPicker() {
    const seg = $("pk-floor"); seg.innerHTML = "";
    floorIds().reverse().forEach((f) => {
      const b = document.createElement("button"); b.textContent = floorName(f); b.className = f === st.pkFloor ? "on" : "";
      b.onclick = () => { st.pkFloor = f; renderPicker(); }; seg.appendChild(b);
    });
    MV.render($("pk-map"), st.pkFloor, {
      onPick: (r) => {
        $("picker").classList.add("hidden");
        { const sg = R.segAt(st.route, st.dist); L.log("relocate", { room: r.id, from: sg.from, to: sg.to }); }
        st.fromRoom = r;
        if (r.node === st.dest.node || r.id === st.dest.id) return arrive("relocated");
        const route = R.buildRoute(r.node, st.dest.node);
        if (!route) return toast("No route from there");
        Object.assign(st, { route, dist: 0, vDist: 0, stepsInLeg: 0, legIdx: -1, zone: null });
        L._stepsAtLastFix = st.steps; L._distAtLastFix = 0;
        toast(`New route from ${r.name}`);
        updateNav(true);
      },
    });
  }
  $("btn-pk-cancel").onclick = () => $("picker").classList.add("hidden");

  // ---- arrival ----
  function arrive(how) {
    if (!st.navigating) return;
    if (how === "confirmed") L.fix(st.route.total, st.steps);
    L.log("arrive", { how, steps: st.steps });
    stopNav("arrived");
    const r = st.dest;
    $("arr-name").textContent = r.name;
    $("arr-about").textContent = r.isThing && r.item ? (r.item.where ? `Look here: ${r.item.where}` : r.about) : `${r.about} · ${floorName(r.floor)}`;
    $("arr-acts").innerHTML = r.activities.map((a) => `<li>${I.svg("check", 16)}${a}</li>`).join("");
    $("arr-objs").innerHTML = r.objects.map((o) => `<span>${I.svg("map-pin", 13)}${o}</span>`).join("");
    $("arrived").classList.remove("hidden");
    speak(`You have arrived at the ${r.name}. Here you can ${r.activities.slice(0, 2).join(", or ").toLowerCase()}.`);
    vibrate([80, 60, 80, 60, 160]);
    const at = r.isThing ? roomById[H.nodes[r.node].place] : r;
    if (at) { st.fromRoom = at; st.whereFloor = at.floor; save("goe.lastRoom", at.id); }
  }
  $("btn-again").onclick = () => { $("arrived").classList.add("hidden"); $("dest-search").value = ""; st.cat = "all"; st.destFloor = st.fromRoom.floor; renderDest(); show("dest"); };
  $("btn-done").onclick = () => { $("arrived").classList.add("hidden"); st.pendingFrom = null; renderWhere(); show("where"); };

  function stopNav(outcome) {
    st.navigating = false;
    cancelAnimationFrame(st.raf);
    if (st.demoTimer) { clearInterval(st.demoTimer); st.demoTimer = null; $("m-demo").querySelector("span").textContent = "Demo walk"; }
    S.onStep = null; S.stopCamera(); AR.clear();
    clearInterval(st.visTimer); st.visTimer = null; st.detecting = false; clearDetCanvas($("det-canvas")); $("chip-cam").classList.add("hidden");
    ["calib", "stairs-sheet", "menu", "offroute"].forEach((id) => $(id).classList.add("hidden"));
    $("turn-hint").classList.add("hidden");
    L.endTrip(outcome);
  }

  // ---- learning data ----
  $("btn-data").onclick = () => {
    const trips = L.trips();
    const arrived = trips.filter((t) => t.outcome === "arrived").length;
    $("data-stats").innerHTML = `<div>${I.svg("route", 18)}<b>${trips.length}</b><span>trips</span></div><div>${I.svg("flag", 18)}<b>${arrived}</b><span>arrived</span></div><div>${I.svg("footprints", 18)}<b>${L.stride().toFixed(2)} m</b><span>your stride</span></div>`;
    $("data").classList.remove("hidden");
  };
  $("btn-export").onclick = () => L.exportTrips();
  $("btn-data-close").onclick = () => $("data").classList.add("hidden");
  document.querySelectorAll(".overlay").forEach((o) => o.addEventListener("click", (e) => { if (e.target === o && o.id !== "arrived") o.classList.add("hidden"); }));

  // =====================================================================
  // CAMERA: scan to find where you are (no QR code)
  // =====================================================================
  const VIS = window.Vision;
  const scan = { stream: null, on: false, scores: {}, dets: [], best: null };
  async function ensureModel() {
    if (!VIS.samples.length) await VIS.fetchModel();
    return VIS.hasModel();
  }
  $("btn-scan").onclick = openScan;
  async function openScan() {
    $("scan").classList.remove("hidden");
    $("scan-ok").disabled = true; $("scan-guess").textContent = "—"; $("scan-rank").innerHTML = ""; $("scan-objs").innerHTML = "";
    $("scan-state").textContent = "Starting camera…";
    try {
      scan.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 640 } }, audio: false });
      $("scan-video").srcObject = scan.stream; await $("scan-video").play().catch(() => {});
    } catch { $("scan-state").textContent = "Camera not available. Choose your room from the list instead."; return; }
    scan.on = true; scan.scores = {}; scan.dets = [];
    $("scan-state").textContent = "Loading the AI model…";
    try { await VIS.load(); } catch { $("scan-state").textContent = "Couldn't load the AI model. Check your connection."; return; }
    const trained = await ensureModel();
    $("scan-state").textContent = trained ? "Slowly look around the room…" : "The camera hasn't been trained here yet, so I'll guess from the objects I see.";
    VIS.loadDetector().then(detScanLoop).catch(() => {});
    scanLoop();
  }
  function scanLoop() {
    if (!scan.on) return;
    const hints = scan.dets.map((d) => d.class);
    if (VIS.hasModel()) {
      const p = VIS.predict(VIS.embed($("scan-video")), hints);
      if (p) for (const r of p.ranking) scan.scores[r.label.room] = (scan.scores[r.label.room] || 0) * 0.7 + r.conf * 0.3 * (p.sim > 0.5 ? 1 : 0.4);
      for (const k in scan.scores) if (!p || !p.ranking.some((r) => r.label.room === k)) scan.scores[k] *= 0.7;
    } else if (hints.length) {
      // untrained: rooms whose objects/name match what the detector sees
      for (const r of H.rooms) {
        if (!r.rect) continue;
        const text = (r.name + " " + (r.objects || []).join(" ")).toLowerCase();
        const hit = hints.some((h) => ({ bed: ["bed", "room"], couch: ["sofa", "parlour", "chill"], tv: ["tv", "parlour"], toilet: ["toilet", "wc"], refrigerator: ["fridge", "kitchen"], oven: ["cooker", "kitchen"], sink: ["sink", "kitchen", "wc"], "dining table": ["dining", "table"] }[h] || []).some((w) => text.includes(w)));
        scan.scores[r.id] = (scan.scores[r.id] || 0) * 0.8 + (hit ? 0.2 : 0);
      }
    }
    const ranked = Object.entries(scan.scores).filter(([id]) => roomById[id]).sort((a, b) => b[1] - a[1]);
    const total = ranked.reduce((t, [, v]) => t + v, 0) || 1;
    if (ranked.length && ranked[0][1] / total > 0.34 && ranked[0][1] > 0.12) {
      const room = roomById[ranked[0][0]];
      scan.best = room;
      $("scan-guess").textContent = room.name;
      $("scan-state").textContent = `You're probably in · ${floorName(room.floor)}`;
      $("scan-ok").disabled = false;
      $("scan-rank").innerHTML = ranked.slice(0, 3).map(([id, v]) => `<div class="pr"><span>${esc(roomById[id].name)}</span><i style="width:${Math.round((v / total) * 100)}%"></i><b>${Math.round((v / total) * 100)}%</b></div>`).join("");
    }
    scan.timer = setTimeout(scanLoop, 450);
  }
  async function detScanLoop() {
    if (!scan.on) return;
    scan.dets = await VIS.detect($("scan-video"));
    drawDet($("scan-det"), $("scan-video"), scan.dets);
    $("scan-objs").innerHTML = [...new Set(scan.dets.map((d) => d.class))].map((c) => `<span>${I.svg(VIS.COCO_ICONS[c] || "scan-eye", 13)}${esc(c)}</span>`).join("");
    setTimeout(detScanLoop, 800);
  }
  function closeScan() {
    scan.on = false; clearTimeout(scan.timer);
    if (scan.stream) scan.stream.getTracks().forEach((t) => t.stop());
    scan.stream = null; $("scan").classList.add("hidden");
  }
  $("scan-cancel").onclick = closeScan;
  $("scan-ok").onclick = () => { const r = scan.best; closeScan(); if (r) { pickFrom(r); toast(`Location set: ${r.name}`); } };

  // draw COCO boxes over a cover-fitted video
  function drawDet(canvas, vid, dets) {
    const W = canvas.clientWidth, Hh = canvas.clientHeight, dpr = devicePixelRatio || 1;
    canvas.width = W * dpr; canvas.height = Hh * dpr;
    const ctx = canvas.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, Hh);
    const vw = vid.videoWidth, vh = vid.videoHeight; if (!vw) return;
    const k = Math.max(W / vw, Hh / vh), ox = (W - vw * k) / 2, oy = (Hh - vh * k) / 2;
    ctx.lineWidth = 3; ctx.font = "700 13px Inter, sans-serif";
    for (const d of dets) {
      const [x, y, w, h] = d.bbox, X = ox + x * k, Y = oy + y * k;
      ctx.strokeStyle = "rgba(70,227,183,.95)"; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(X, Y, w * k, h * k, 10) : ctx.rect(X, Y, w * k, h * k); ctx.stroke();
      const label = d.class.replace(/^\w/, (c) => c.toUpperCase()), tw = ctx.measureText(label).width + 14;
      ctx.fillStyle = "rgba(70,227,183,.95)"; ctx.fillRect(X, Math.max(0, Y - 24), tw, 24);
      ctx.fillStyle = "#06261C"; ctx.fillText(label, X + 7, Math.max(0, Y - 24) + 17);
    }
  }
  function clearDetCanvas(c) { if (c) c.getContext("2d").clearRect(0, 0, c.width, c.height); }

  // =====================================================================
  // CAMERA DURING NAVIGATION: fix position from what the camera sees
  // =====================================================================
  function startVisionFixes() {
    st.vis = { last: null, streak: 0, cool: 0 };
    (async () => {
      try { if (!(await ensureModel())) return; await VIS.load(); } catch { return; }
      if (!st.navigating) return;
      clearInterval(st.visTimer);
      st.visTimer = setInterval(visionStep, 1300);
    })();
  }
  function visionStep() {
    if (!st.navigating || st.mode !== "live" || !S._stream || st.demoTimer) return;
    const cam = $("cam"); if (!cam.videoWidth) return;
    const p = VIS.predict(VIS.embed(cam), (st.dets || []).map((d) => d.class));
    if (!p || p.conf < 0.55 || p.sim < 0.55) { st.vis.streak = 0; return; }
    const lab = p.label;
    st.vis.streak = st.vis.last === lab.id ? st.vis.streak + 1 : 1; st.vis.last = lab.id;
    $("chip-cam").classList.remove("hidden"); $("cam-name").textContent = lab.name;
    if (st.vis.streak < 2 || Date.now() < st.vis.cool) return;
    const node = R.nearestInRoom(lab.room, lab.x, lab.y); if (!node) return;
    const d = R.distOfNode(st.route, node);
    if (d != null) {
      if (Math.abs(d - st.dist) > 2.2 && !st.stairsWaiting) {
        L.log("vfix", { label: lab.id, node, from: +st.dist.toFixed(2), to: +d.toFixed(2) });
        L.fix(d, st.steps);
        st.dist = d; st.vis.cool = Date.now() + 6000;
        toast(`Camera: you're at ${lab.name}`); updateNav();
      }
    } else if (st.vis.streak >= 3 && (!st.zone || st.zone.id !== lab.room) && !st.route.path.some((n) => (H.nodes[n].member || []).includes(lab.room))) {
      // somewhere off the route: re-plan from there
      const route = R.buildRoute(node, st.dest.node);
      if (!route) return;
      L.log("vfix", { label: lab.id, node, reroute: true });
      Object.assign(st, { route, dist: 0, vDist: 0, stepsInLeg: 0, legIdx: -1, zone: null });
      L._stepsAtLastFix = st.steps; L._distAtLastFix = 0;
      st.vis.cool = Date.now() + 10000;
      toast(`You're in ${roomById[lab.room] ? roomById[lab.room].name : lab.name}. New route.`); speak("New route.");
      updateNav(true);
    }
  }
  // object labels in live view (bed, sofa, TV…)
  $("m-detect").onclick = async () => {
    $("menu").classList.add("hidden");
    st.detecting = !st.detecting;
    $("m-detect").querySelector("span").textContent = st.detecting ? "Hide detected objects" : "Show detected objects";
    if (!st.detecting) { clearDetCanvas($("det-canvas")); st.dets = []; return; }
    toast("Loading object detector…");
    try { await VIS.loadDetector(); } catch { toast("Couldn't load the detector"); st.detecting = false; return; }
    const loop = async () => {
      if (!st.detecting || !st.navigating) return;
      if (st.mode === "live" && S._stream) { st.dets = await VIS.detect($("cam")); drawDet($("det-canvas"), $("cam"), st.dets); }
      setTimeout(loop, 900);
    };
    loop();
  };

  // ---------------- boot ----------------
  I.hydrate();
  function bootRender() {
    $("bldg-name").textContent = H.name;
    const params = new URLSearchParams(location.search);
    const at = params.get("at") && roomById[params.get("at")];
    const last = load("goe.lastRoom");
    st.whereFloor = st.destFloor = st.pvFloor = st.pkFloor = lowestFloor();
    st.pendingFrom = null;
    if (at) { st.fromRoom = at; st.whereFloor = at.floor; }
    else if (last && roomById[last]) { st.pendingFrom = roomById[last]; st.whereFloor = roomById[last].floor; }
    renderWhere();
    if (at) {
      st.destFloor = at.floor; renderDest(); show("dest");
      const to = params.get("to") && roomById[params.get("to")];
      if (to) openPreview(to);
    }
  }
  bootRender();
  // the published map (from the admin app) replaces the built-in one
  window.Venue.load().then((h) => {
    if (h.source !== "default" && !st.navigating && document.querySelector("#screen-where.active")) bootRender();
    if (h.source === "draft") toast("Previewing your unpublished admin changes");
  });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
