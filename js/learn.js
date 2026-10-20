/*
 * LEARNING LAYER (foundation for the machine-learning model)
 * ---------------------------------------------------------------
 * Today it does two things:
 *  1. Records every trip as a structured log (start, destination, route,
 *     every step with compass heading, manual corrections, arrival).
 *  2. Learns each user's stride length from their corrections, so step
 *     counting gets more accurate the more the app is used.
 *
 * Trips are kept on the phone and also sent to /api/trips (a Cloudflare
 * Pages Function). That collected data is the training set for the future
 * ML model — see docs/ML.md.
 */
(function () {
  const KEY_TRIPS = "goe.trips.v1";
  const KEY_STRIDE = "goe.stride.v1";
  const KEY_CAL = "goe.compassOffset.v1";
  const KEY_DEVICE = "goe.deviceId.v1";

  function load(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

  let deviceId = load(KEY_DEVICE, null);
  if (!deviceId) { deviceId = "d_" + Math.random().toString(36).slice(2, 10); save(KEY_DEVICE, deviceId); }

  const L = {
    deviceId,
    stride() { return load(KEY_STRIDE, window.HOUSE.defaultStride); },
    compassOffset() { return load(KEY_CAL, null); },
    setCompassOffset(v) { save(KEY_CAL, v); },
    trip: null,

    startTrip(route, meta) {
      L.trip = {
        id: "t_" + Date.now().toString(36),
        deviceId,
        building: window.HOUSE.name,
        startedAt: new Date().toISOString(),
        from: route.from, to: route.to,
        path: route.path, routeLength: +route.total.toFixed(2),
        stride: L.stride(),
        ua: navigator.userAgent,
        meta: meta || {},
        events: [],
      };
      L._stepsAtLastFix = 0; L._distAtLastFix = 0;
    },

    log(type, data) {
      if (!L.trip) return;
      L.trip.events.push({ t: Date.now(), type, ...data });
    },

    // Called when the user tells us exactly where they are (tapping
    // "I'm at the turn", choosing their location on the map, arriving).
    // The real distance walked vs steps counted gives a stride sample.
    fix(trueDist, stepsSoFar) {
      L.log("fix", { trueDist: +trueDist.toFixed(2), steps: stepsSoFar });
      const steps = stepsSoFar - L._stepsAtLastFix;
      const dist = trueDist - L._distAtLastFix;
      L._stepsAtLastFix = stepsSoFar; L._distAtLastFix = trueDist;
      if (steps >= 5 && dist > 2) {
        const sample = dist / steps;
        if (sample > 0.35 && sample < 1.1) {
          const s = L.stride() * 0.7 + sample * 0.3; // exponential moving average
          save(KEY_STRIDE, +s.toFixed(3));
          L.log("strideLearned", { sample: +sample.toFixed(3), stride: +s.toFixed(3) });
        }
      }
    },

    endTrip(outcome) {
      if (!L.trip) return;
      L.trip.endedAt = new Date().toISOString();
      L.trip.outcome = outcome;
      const trips = load(KEY_TRIPS, []);
      trips.push(L.trip);
      save(KEY_TRIPS, trips.slice(-50));
      const body = JSON.stringify(L.trip);
      try {
        fetch("/api/trips", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
      } catch {}
      L.trip = null;
    },

    trips() { return load(KEY_TRIPS, []); },

    exportTrips() {
      const blob = new Blob([JSON.stringify({ deviceId, stride: L.stride(), trips: L.trips() }, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `goe-trips-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    },
  };

  window.Learn = L;
})();
