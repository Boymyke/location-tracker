/* Camera, compass and step detection (pedestrian dead reckoning). */
(function () {
  const S = {
    heading: null,       // degrees, 0 = magnetic north (device top direction)
    beta: null,          // device pitch in degrees
    hasCompass: false,
    hasMotion: false,
    onStep: null,
    onHeading: null,
    steps: 0,
  };

  // ---------- permissions (must run inside a tap) ----------
  S.requestPermissions = async function () {
    try {
      if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
        await DeviceMotionEvent.requestPermission();
      }
      if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
        await DeviceOrientationEvent.requestPermission();
      }
    } catch (e) { console.warn("sensor permission", e); }
  };

  // ---------- camera ----------
  S.startCamera = async function (video) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      video.srcObject = stream;
      await video.play().catch(() => {});
      S._stream = stream;
      return true;
    } catch (e) { console.warn("camera", e); return false; }
  };
  S.stopCamera = function () {
    if (S._stream) S._stream.getTracks().forEach((t) => t.stop());
    S._stream = null;
  };

  // ---------- compass ----------
  let smoothed = null;
  function setHeading(h) {
    if (h == null || isNaN(h)) return;
    // account for screen rotation
    const so = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    h = (h + so + 360) % 360;
    if (smoothed == null) smoothed = h;
    else {
      const d = ((h - smoothed + 540) % 360) - 180;
      smoothed = (smoothed + d * 0.25 + 360) % 360;
    }
    S.heading = smoothed;
    S.hasCompass = true;
    S.onHeading && S.onHeading(smoothed);
  }
  function onOrientAbs(e) {
    if (e.alpha == null) return;
    setHeading(360 - e.alpha);
  }
  function onOrient(e) {
    if (typeof e.webkitCompassHeading === "number") setHeading(e.webkitCompassHeading); // iOS
    else if (e.absolute && e.alpha != null) setHeading(360 - e.alpha);
  }

  // ---------- step detector ----------
  // Low-pass filtered acceleration magnitude; a step = peak above threshold
  // with a minimum gap. Simple but works well for phones held in front.
  let lp = 9.81, above = false, lastStep = 0, peak = 0;
  const HIGH = 10.9, LOW = 9.6, MIN_GAP = 280;
  function onMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null) return;
    S.hasMotion = true;
    const mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
    lp = lp * 0.75 + mag * 0.25;
    const now = performance.now();
    if (!above && lp > HIGH) { above = true; peak = lp; }
    else if (above) {
      peak = Math.max(peak, lp);
      if (lp < LOW) {
        above = false;
        if (now - lastStep > MIN_GAP && peak < 25) {
          lastStep = now;
          S.steps++;
          S.onStep && S.onStep({ t: Date.now(), peak, heading: S.heading });
        }
      }
    }
  }

  S.start = function () {
    if (S._started) return;
    S._started = true;
    if ("ondeviceorientationabsolute" in window) window.addEventListener("deviceorientationabsolute", onOrientAbs, true);
    else window.addEventListener("deviceorientation", onOrient, true);
    window.addEventListener("devicemotion", onMotion, true);
    // phone tilt (beta: 90 = upright, 0 = flat) for projecting the floor line
    window.addEventListener("deviceorientation", (e) => {
      if (e.beta == null) return;
      S.beta = S.beta == null ? e.beta : S.beta * 0.8 + e.beta * 0.2;
    }, true);
  };

  window.Sensors = S;
})();
