/* Goe — main app controller */
(function () {
  const H = window.HOUSE, R = window.Router, S = window.Sensors, L = window.Learn, MV = window.MapView;
  const $ = (id) => document.getElementById(id);
  const roomById = R.roomById;

  const st = {
    whereFloor: "G",
    fromRoom: null,
    dest: null,
    route: null,
    pvFloor: "G",
    // navigation
    dist: 0,
    steps: 0,
    stepsInLeg: 0,
    legIdx: -1,
    navigating: false,
    voice: true,
    demoTimer: null,
    stairsWaiting: false,
    pkFloor: "G",
  };

  // ---------------- helpers ----------------
  function show(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === "screen-" + id));
    window.scrollTo(0, 0);
  }
  function toast(msg, ms = 2200) {
    const t = $("toast"); t.textContent = msg; t.classList.add("on");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), ms);
  }
  function speak(text) {
    if (!st.voice || !("speechSynthesis" in window)) return;
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 1.02; speechSynthesis.speak(u); } catch {}
  }
  function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch {} }
  const stepsFor = (m) => Math.max(0, Math.round(m / L.stride()));
  const floorName = (f) => H.floors[f].name;
  const visibleRooms = () => H.rooms.filter((r) => !r.hidden);
  document.querySelectorAll("[data-back]").forEach((b) => b.addEventListener("click", () => show(b.dataset.back)));

  // ================= 1. WHERE ARE YOU =================
  function renderWhere() {
    document.querySelectorAll("#where-floor button").forEach((b) => b.classList.toggle("on", b.dataset.floor === st.whereFloor));
    MV.render($("where-map"), st.whereFloor, {
      selected: st.fromRoom && st.fromRoom.id,
      onPick: (r) => pickFrom(r),
    });
    const list = $("where-list"); list.innerHTML = "";
    H.rooms.filter((r) => r.floor === st.whereFloor && (!r.hidden || r.kind === "stairs")).forEach((r) => {
      const b = document.createElement("button");
      b.className = "chip" + (st.fromRoom && st.fromRoom.id === r.id ? " on" : "");
      b.textContent = `${r.icon} ${r.name}`;
      b.onclick = () => pickFrom(r);
      list.appendChild(b);
    });
    const btn = $("btn-where-next");
    btn.disabled = !st.fromRoom;
    btn.textContent = st.fromRoom ? `I'm in the ${st.fromRoom.name} →` : "Choose a room";
  }
  function pickFrom(r) { st.fromRoom = r; vibrate(15); renderWhere(); }
  document.querySelectorAll("#where-floor button").forEach((b) => b.addEventListener("click", () => { st.whereFloor = b.dataset.floor; renderWhere(); }));
  $("btn-where-next").onclick = () => { if (st.fromRoom) { renderDest(); show("dest"); } };

  // ================= 2. WHERE TO =================
  function renderDest() {
    $("dest-from").innerHTML = `<span class="dot"></span> You're in: <b>${st.fromRoom.name}</b> · ${floorName(st.fromRoom.floor)}`;
    const q = $("dest-search").value.trim().toLowerCase();
    const list = $("dest-list"); list.innerHTML = "";
    for (const f of Object.keys(H.floors)) {
      const rooms = visibleRooms().filter((r) => r.floor === f && r.id !== st.fromRoom.id).filter((r) => {
        if (!q) return true;
        return (r.name + " " + r.about + " " + r.activities.join(" ") + " " + r.objects.join(" ")).toLowerCase().includes(q);
      });
      if (!rooms.length) continue;
      const h = document.createElement("h3"); h.className = "group"; h.textContent = floorName(f);
      list.appendChild(h);
      rooms.forEach((r) => {
        const route = R.buildRoute(st.fromRoom.node, r.node);
        const c = document.createElement("button");
        c.className = "dest-card";
        c.innerHTML = `<div class="dc-icon">${r.icon}</div>
          <div class="dc-body"><div class="dc-name">${r.name}</div><div class="dc-about">${r.about}</div>
          <div class="dc-acts">${r.activities.slice(0, 3).map((a) => `<span>${a}</span>`).join("")}</div></div>
          <div class="dc-steps">${route ? stepsFor(route.total) : "–"}<small>steps</small></div>`;
        c.onclick = () => openPreview(r);
        list.appendChild(c);
      });
    }
    if (!list.children.length) list.innerHTML = `<p class="muted center">No room matches “${q}”.</p>`;
  }
  $("dest-search").addEventListener("input", renderDest);

  // ================= 3. PREVIEW =================
  function openPreview(room) {
    st.dest = room;
    st.route = R.buildRoute(st.fromRoom.node, room.node);
    if (!st.route) { toast("No route found"); return; }
    st.pvFloor = st.fromRoom.floor;
    $("pv-title").textContent = `${st.fromRoom.name} → ${room.name}`;
    const floorsUsed = [...new Set(st.route.segs.map((s) => s.floor).concat(H.nodes[room.node].floor))];
    const changes = st.route.legs.filter((l) => l.type === "stairs").length;
    $("pv-stats").innerHTML = `
      <div><b>${stepsFor(st.route.total)}</b><span>steps</span></div>
      <div><b>${Math.max(1, Math.round((st.route.total / 1.0) / 60 * 60))}s</b><span>walk</span></div>
      <div><b>${changes}</b><span>floor change${changes === 1 ? "" : "s"}</span></div>`;
    const seg = $("pv-floor"); seg.innerHTML = "";
    seg.style.display = floorsUsed.length > 1 ? "" : "none";
    floorsUsed.forEach((f) => {
      const b = document.createElement("button"); b.textContent = floorName(f); b.dataset.floor = f;
      b.onclick = () => { st.pvFloor = f; renderPreviewMap(); };
      seg.appendChild(b);
    });
    renderPreviewMap();
    const legs = $("pv-legs"); legs.innerHTML = "";
    st.route.legs.forEach((l) => {
      const li = document.createElement("li");
      const n = l.type === "stairs" ? `${H.stairSteps} stairs` : `${stepsFor(l.end - l.start)} steps`;
      li.innerHTML = `<span class="li-ic">${l.icon}</span><span class="li-tx">${l.text}<small>${n}${l.landmarks && l.landmarks.length ? " · passing " + l.landmarks.map((m) => m.room.name + " on your " + m.side).join(", ") : ""}</small></span>`;
      legs.appendChild(li);
    });
    const li = document.createElement("li");
    li.innerHTML = `<span class="li-ic">📍</span><span class="li-tx">Arrive at ${R.phr(room.name)}<small>${floorName(room.floor)}</small></span>`;
    legs.appendChild(li);
    $("pv-info").innerHTML = `<h4>${room.icon} ${room.name}</h4><p class="muted">${room.about}</p>
      <div class="chips">${room.activities.map((a) => `<span class="chip static">${a}</span>`).join("")}</div>`;
    show("preview");
  }
  function renderPreviewMap() {
    document.querySelectorAll("#pv-floor button").forEach((b) => b.classList.toggle("on", b.dataset.floor === st.pvFloor));
    MV.render($("pv-map"), st.pvFloor, { route: st.route, highlight: st.dest.id });
  }

  $("btn-start").onclick = () => startNav(true);
  $("btn-start-nocam").onclick = () => startNav(false);

  // ================= 4. NAVIGATION =================
  async function startNav(withCamera) {
    await S.requestPermissions();
    S.start();
    show("nav");
    st.navigating = true;
    st.dist = 0; st.steps = 0; st.stepsInLeg = 0; st.legIdx = -1; st.stairsWaiting = false;
    L.startTrip(st.route, { camera: withCamera, fromRoom: st.fromRoom.id, dest: st.dest.id });

    const fb = $("cam-fallback");
    if (withCamera) {
      const ok = await S.startCamera($("cam"));
      fb.classList.toggle("on", !ok);
      if (!ok) toast("Camera unavailable — showing directions only");
    } else fb.classList.add("on");

    S.onStep = onStep;
    S.onHeading = () => { if (st.navigating) renderAR(); };
    updateNav(true);

    // compass detection + calibration prompt
    setTimeout(() => {
      $("badge-sensor").textContent = S.hasCompass ? (L.compassOffset() == null ? "🧭 Needs calibration" : "🧭 Compass on") : S.hasMotion ? "👣 Steps only" : "✋ Manual mode";
      if (S.hasCompass && L.compassOffset() == null) openCalib();
      if (!S.hasMotion) toast("No motion sensor — tap “I'm at the turn” as you go, or use Demo walk", 4000);
    }, 1500);
  }

  function currentLeg() { return st.route.legs[st.legIdx]; }

  function onStep(ev) {
    if (!st.navigating || st.stairsWaiting) return;
    st.steps++; st.stepsInLeg++;
    const leg = currentLeg();
    L.log("step", { d: +st.dist.toFixed(2), h: ev && ev.heading != null ? Math.round(ev.heading) : null });
    if (leg.type === "stairs") {
      const per = (leg.end - leg.start) / H.stairSteps;
      st.dist = Math.min(leg.end - 0.01, st.dist + per);
      if (st.stepsInLeg >= Math.round(H.stairSteps * 0.8)) askStairsDone();
    } else {
      let factor = 1;
      const ph = planHeading();
      if (ph != null) {
        const seg = R.segAt(st.route, st.dist);
        const diff = Math.abs(R.norm180(seg.bearing - ph));
        factor = diff < 60 ? 1 : diff < 110 ? 0.4 : 0; // walking the wrong way doesn't count
      }
      let next = st.dist + L.stride() * factor;
      // don't auto-skip past a staircase
      const nl = st.route.legs[st.legIdx + 1];
      if (nl && nl.type === "stairs") next = Math.min(next, leg.end + 0.01);
      st.dist = next;
    }
    updateNav();
  }

  function planHeading() {
    const off = L.compassOffset();
    if (S.heading == null || off == null) return null;
    return (S.heading - off + 360) % 360;
  }

  function updateNav(force) {
    const route = st.route;
    if (st.dist >= route.total - 0.5) return arrive("auto");
    const li = R.legIndexAt(route, st.dist);
    if (li !== st.legIdx || force) {
      const changed = li !== st.legIdx;
      st.legIdx = li; if (changed && !force) st.stepsInLeg = 0;
      const leg = currentLeg();
      $("instr-icon").textContent = leg.icon;
      $("instr-text").textContent = leg.text;
      $("instr-sub").textContent = leg.sub || "";
      $("btn-here").textContent = leg.type === "stairs" ? `✓ I'm ${leg.dir === "up" ? "upstairs" : "downstairs"}` :
        li === route.legs.length - 1 ? `✓ I've arrived` : `✓ I'm at the ${H.nodes[leg.to].label.toLowerCase()}`;
      if (changed || force) {
        speak(leg.text + (leg.type === "stairs" ? "" : `. About ${stepsFor(leg.end - leg.start)} steps.`));
        vibrate([30, 40, 30]);
        L.log("leg", { idx: li, text: leg.text });
      }
      if (leg.type === "stairs") {
        $("stairs-title").textContent = leg.dir === "up" ? "Climbing the stairs ⬆️" : "Going down the stairs ⬇️";
      }
    }
    const leg = currentLeg();
    const remain = leg.type === "stairs" ? Math.max(0, H.stairSteps - st.stepsInLeg) : stepsFor(leg.end - st.dist);
    $("instr-steps").textContent = remain;
    $("progress-bar").style.width = Math.min(100, (st.dist / route.total) * 100) + "%";
    const pos = R.pointAt(route, st.dist);
    $("badge-floor").textContent = floorName(pos.floor);
    st.pos = pos;
    renderAR();
  }

  function renderAR() {
    if (!st.route || st.legIdx < 0) return;
    const leg = currentLeg();
    const route = st.route;
    const ph = planHeading();
    const arrow = $("ar-arrow");
    let rel;
    if (leg.type === "stairs") rel = 0;
    else {
      const seg = R.segAt(route, st.dist);
      if (ph != null) rel = R.norm180(seg.bearing - ph);
      else rel = st.stepsInLeg < 3 ? (leg.turn || 0) : 0;
    }
    arrow.style.transform = `rotateX(58deg) rotateZ(${rel}deg)`;
    arrow.classList.toggle("ok", Math.abs(rel) < 20);
    arrow.classList.toggle("stairs", leg.type === "stairs");

    const last = st.legIdx === route.legs.length - 1;
    const tgt = last ? st.dest.name : H.nodes[leg.to].label;
    $("ar-target-name").textContent = tgt;
    $("ar-target-dist").textContent = ph != null && Math.abs(rel) > 45 ? (rel > 0 ? "turn right ↻" : "turn left ↺") :
      `${stepsFor(route.total - st.dist)} steps to ${st.dest.name}`;

    // rooms you're passing
    const left = $("ar-left"), right = $("ar-right");
    left.innerHTML = ""; right.innerHTML = "";
    (leg.landmarks || []).filter((m) => m.at >= st.dist - 1 && m.at - st.dist < 5).forEach((m) => {
      const d = document.createElement("div");
      d.className = "ar-label";
      d.innerHTML = `<b>${m.room.icon} ${m.room.name}</b><span>${m.room.activities.slice(0, 2).join(" · ")}</span>`;
      (m.side === "left" ? left : right).appendChild(d);
    });

    MV.render($("mini-map"), st.pos ? st.pos.floor : H.nodes[route.from].floor, {
      route, you: st.pos, heading: ph, compact: true, follow: true,
    });
  }

  // ---- manual corrections (also teach the stride model) ----
  $("btn-here").onclick = () => {
    const leg = currentLeg();
    st.dist = leg.end + 0.01;
    L.fix(Math.min(st.dist, st.route.total), st.steps);
    st.stairsWaiting = false; $("stairs-sheet").classList.add("hidden");
    st.stepsInLeg = 0;
    if (st.legIdx === st.route.legs.length - 1) return arrive("confirmed");
    updateNav();
  };

  function askStairsDone() {
    const leg = currentLeg();
    st.stairsWaiting = true;
    $("stairs-text").textContent = leg.dir === "up" ? "Have you reached the top of the stairs (upstairs)?" : "Have you reached the bottom of the stairs (downstairs)?";
    $("stairs-sheet").classList.remove("hidden");
    speak(leg.dir === "up" ? "Are you upstairs now?" : "Are you downstairs now?");
  }
  $("btn-stairs-done").onclick = () => $("btn-here").click();

  // ---- calibration ----
  function openCalib() {
    const leg = st.route.legs.find((l) => l.type === "walk");
    if (!leg) return;
    $("calib-text").textContent = `Stand still, hold the phone upright and point it toward the ${H.nodes[leg.to].label.toLowerCase()}. Then tap the button.`;
    $("calib").classList.remove("hidden");
    st._calibLeg = leg;
  }
  $("btn-calib").onclick = () => {
    if (S.heading == null) { toast("Compass not ready yet — move the phone in a figure 8"); return; }
    const leg = st._calibLeg || currentLeg();
    const seg = R.segAt(st.route, Math.max(st.dist, leg.start));
    const off = (S.heading - seg.bearing + 360) % 360;
    L.setCompassOffset(off);
    L.log("calibrate", { heading: Math.round(S.heading), offset: Math.round(off) });
    $("calib").classList.add("hidden");
    $("badge-sensor").textContent = "🧭 Compass on";
    toast("Compass calibrated for this house ✓");
    renderAR();
  };
  $("btn-calib-skip").onclick = () => $("calib").classList.add("hidden");

  // ---- menu ----
  $("btn-menu").onclick = () => $("menu").classList.toggle("hidden");
  $("m-close").onclick = () => $("menu").classList.add("hidden");
  $("m-calib").onclick = () => { $("menu").classList.add("hidden"); openCalib(); };
  $("m-step").onclick = () => onStep({ heading: S.heading });
  $("m-demo").onclick = () => {
    $("menu").classList.add("hidden");
    if (st.demoTimer) { clearInterval(st.demoTimer); st.demoTimer = null; toast("Demo walk stopped"); return; }
    toast("Demo walk: auto-stepping");
    st.demoTimer = setInterval(() => {
      if (!st.navigating) { clearInterval(st.demoTimer); st.demoTimer = null; return; }
      if (st.stairsWaiting) { $("btn-here").click(); return; }
      const saved = L.compassOffset; L.compassOffset = () => null; // ignore heading in demo
      onStep({ heading: null });
      L.compassOffset = saved;
    }, 650);
  };
  $("btn-voice").onclick = () => { st.voice = !st.voice; $("btn-voice").textContent = st.voice ? "🔊" : "🔇"; if (!st.voice) speechSynthesis.cancel(); };
  $("btn-end").onclick = () => { stopNav("cancelled"); show("dest"); };

  // ---- lost: pick location, re-route ----
  $("btn-lost").onclick = () => {
    st.pkFloor = st.pos ? st.pos.floor : "G";
    renderPicker(); $("picker").classList.remove("hidden");
  };
  function renderPicker() {
    document.querySelectorAll("#pk-floor button").forEach((b) => b.classList.toggle("on", b.dataset.floor === st.pkFloor));
    MV.render($("pk-map"), st.pkFloor, {
      onPick: (r) => {
        $("picker").classList.add("hidden");
        L.log("relocate", { room: r.id });
        st.fromRoom = r;
        const route = R.buildRoute(r.node, st.dest.node);
        if (!route || r.node === st.dest.node) return arrive("relocated");
        st.route = route; st.dist = 0; st.stepsInLeg = 0; st.legIdx = -1;
        L._stepsAtLastFix = st.steps; L._distAtLastFix = 0;
        toast(`Re-routing from ${r.name}`);
        updateNav(true);
      },
    });
  }
  document.querySelectorAll("#pk-floor button").forEach((b) => b.addEventListener("click", () => { st.pkFloor = b.dataset.floor; renderPicker(); }));
  $("btn-pk-cancel").onclick = () => $("picker").classList.add("hidden");

  // ---- arrival ----
  function arrive(how) {
    if (!st.navigating) return;
    if (how === "confirmed") L.fix(st.route.total, st.steps);
    L.log("arrive", { how, steps: st.steps });
    stopNav("arrived");
    const r = st.dest;
    $("arr-name").textContent = r.name;
    $("arr-about").textContent = `${r.about} · ${floorName(r.floor)}`;
    $("arr-acts").innerHTML = r.activities.map((a) => `<li>${a}</li>`).join("");
    $("arr-objs").innerHTML = r.objects.map((o) => `<span class="chip static">📍 ${o}</span>`).join("");
    $("arrived").classList.remove("hidden");
    speak(`You have arrived at the ${r.name}. Here you can ${r.activities.slice(0, 2).join(", or ").toLowerCase()}.`);
    vibrate([80, 60, 80, 60, 160]);
    st.fromRoom = r; st.whereFloor = r.floor;
  }
  $("btn-again").onclick = () => { $("arrived").classList.add("hidden"); $("dest-search").value = ""; renderDest(); show("dest"); };

  function stopNav(outcome) {
    st.navigating = false;
    if (st.demoTimer) { clearInterval(st.demoTimer); st.demoTimer = null; }
    S.onStep = null; S.stopCamera();
    $("calib").classList.add("hidden"); $("stairs-sheet").classList.add("hidden"); $("menu").classList.add("hidden");
    L.endTrip(outcome);
  }

  // ---- trip data ----
  $("btn-data").onclick = () => {
    const trips = L.trips();
    const arrived = trips.filter((t) => t.outcome === "arrived").length;
    $("data-stats").innerHTML = `<div><b>${trips.length}</b><span>trips</span></div><div><b>${arrived}</b><span>arrived</span></div><div><b>${L.stride().toFixed(2)}m</b><span>your stride</span></div>`;
    $("data").classList.remove("hidden");
  };
  $("btn-export").onclick = () => L.exportTrips();
  $("btn-data-close").onclick = () => $("data").classList.add("hidden");

  // ---------------- boot ----------------
  // Optional deep link / QR: ?at=kitchen  (&to=room2)
  const params = new URLSearchParams(location.search);
  const at = params.get("at") && roomById[params.get("at")];
  if (at) { st.fromRoom = at; st.whereFloor = at.floor; }
  renderWhere();
  if (at) {
    renderDest(); show("dest");
    const to = params.get("to") && roomById[params.get("to")];
    if (to) openPreview(to);
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
