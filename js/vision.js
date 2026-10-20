/*
 * VISION (machine learning in the browser, TensorFlow.js)
 * ---------------------------------------------------------------
 * 1. PLACE RECOGNITION: "where am I?" from the camera.
 *    A MobileNet network turns each camera frame into a 512-number
 *    "fingerprint" (embedding). In the admin app you record fingerprints
 *    at labelled spots (Kitchen, Room 2 door, ...). At run time a k-nearest-
 *    neighbour vote over those samples tells us the most likely spot.
 *    More recordings, from more angles and lighting, give a better model.
 *    Re-record a spot when furniture changes and the model adapts.
 *
 * 2. OBJECT DETECTION: COCO-SSD finds everyday things (bed, sofa, TV,
 *    toilet, fridge, sink, dining table, chair, laptop...). It labels them
 *    in the live view and helps place recognition (a bed means a bedroom).
 *    Doors are not in COCO. Train them as spots in the admin app instead.
 */
(function () {
  const TF_URL = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js";
  const COCO_URL = "https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js";
  const MOBILENET_URL = "https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.50_224/model.json";
  const DIM = 512;

  const COCO_ICONS = {
    bed: "bed-double", couch: "sofa", tv: "tv", toilet: "toilet", refrigerator: "package", oven: "chef-hat",
    microwave: "chef-hat", sink: "bath", "dining table": "utensils", chair: "armchair", laptop: "lamp-desk",
    book: "book-open", "potted plant": "house", clock: "clock", bottle: "package", cup: "utensils",
  };
  // words that link a COCO class to object/room names in the map
  const COCO_WORDS = {
    bed: ["bed", "bedroom", "room"], couch: ["sofa", "couch", "parlour", "lounge", "chill"], tv: ["tv", "parlour", "television"],
    toilet: ["toilet", "wc", "bath"], refrigerator: ["fridge", "kitchen"], oven: ["cooker", "oven", "kitchen"],
    microwave: ["kitchen", "microwave"], sink: ["sink", "kitchen", "basin", "wc"], "dining table": ["dining", "table"],
    chair: ["chair", "dining", "study", "desk"], laptop: ["desk", "study"], book: ["study", "book"],
  };

  const V = {
    ready: false, detectorReady: false, model: null, detector: null,
    labels: [],   // [{id, name, room, floor, x, y, kind}]
    samples: [],  // [{l: labelId, v: Float32Array}]
    COCO_ICONS,
  };

  function loadScript(src) {
    return new Promise((res, rej) => {
      if ([...document.scripts].some((s) => s.src === src)) return res();
      const s = document.createElement("script");
      s.src = src; s.async = true; s.onload = res; s.onerror = () => rej(new Error("Could not load " + src));
      document.head.appendChild(s);
    });
  }

  V.load = async function (onProgress = () => {}) {
    if (V.ready) return;
    onProgress("Loading TensorFlow…");
    await loadScript(TF_URL);
    onProgress("Loading vision model…");
    const base = await tf.loadLayersModel(MOBILENET_URL);
    const layer = base.getLayer("conv_pw_13_relu");
    V.model = tf.model({ inputs: base.inputs, outputs: layer.output });
    tf.tidy(() => V.model.predict(tf.zeros([1, 224, 224, 3])));
    V.ready = true;
    onProgress("Ready");
  };

  V.loadDetector = async function () {
    if (V.detectorReady) return;
    await loadScript(TF_URL);
    await loadScript(COCO_URL);
    V.detector = await cocoSsd.load({ base: "lite_mobilenet_v2" });
    V.detectorReady = true;
  };

  // camera frame -> L2-normalised 512-d fingerprint
  V.embed = function (source) {
    if (!V.ready) return null;
    return tf.tidy(() => {
      let img = tf.browser.fromPixels(source);
      const [h, w] = img.shape;
      const s = Math.min(h, w);
      img = img.slice([Math.floor((h - s) / 2), Math.floor((w - s) / 2), 0], [s, s, 3]);
      img = tf.image.resizeBilinear(img, [224, 224]).toFloat().div(127.5).sub(1).expandDims(0);
      let f = V.model.predict(img).mean([1, 2]).squeeze();
      f = f.div(f.norm().add(1e-8));
      return f.dataSync().slice();
    });
  };

  V.addSample = (labelId, vec) => { if (vec) V.samples.push({ l: labelId, v: vec }); };
  V.countFor = (labelId) => V.samples.filter((s) => s.l === labelId).length;
  V.removeLabel = (labelId) => { V.labels = V.labels.filter((l) => l.id !== labelId); V.samples = V.samples.filter((s) => s.l !== labelId); };
  V.clearSamples = (labelId) => { V.samples = V.samples.filter((s) => s.l !== labelId); };
  V.hasModel = () => V.samples.length >= 10 && new Set(V.samples.map((s) => s.l)).size >= 2;

  /**
   * k-NN vote. hints = detected COCO classes (optional) to nudge towards
   * rooms that contain matching objects. Returns {label, conf, sim, ranking}
   */
  V.predict = function (vec, hints = [], k = 9) {
    if (!vec || !V.samples.length) return null;
    const sims = V.samples.map((s) => {
      let d = 0; const a = s.v; for (let i = 0; i < a.length; i++) d += a[i] * vec[i];
      return { l: s.l, d };
    }).sort((a, b) => b.d - a.d).slice(0, k);
    const score = {};
    for (const s of sims) score[s.l] = (score[s.l] || 0) + Math.max(0, s.d) ** 4;
    if (hints.length) {
      for (const lab of V.labels) {
        const text = ((lab.name || "") + " " + (lab.roomName || "") + " " + (lab.objects || []).join(" ")).toLowerCase();
        for (const h of hints) if ((COCO_WORDS[h] || [h]).some((w) => text.includes(w))) score[lab.id] = (score[lab.id] || 0) + 0.12;
      }
    }
    const total = Object.values(score).reduce((a, b) => a + b, 0) || 1;
    const ranking = Object.entries(score).map(([l, v]) => ({ label: V.labels.find((x) => x.id === l), conf: v / total })).filter((x) => x.label).sort((a, b) => b.conf - a.conf);
    if (!ranking.length) return null;
    return { ...ranking[0], sim: sims[0].d, ranking };
  };

  V.detect = async function (video) {
    if (!V.detectorReady) return [];
    try { return (await V.detector.detect(video, 8, 0.5)) || []; } catch { return []; }
  };

  // ---- storage: quantise each fingerprint to bytes (4x smaller) ----
  function toB64(u8) { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
  function fromB64(b) { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }

  V.serialize = function () {
    return {
      format: "goe-knn-1", dim: DIM, updatedAt: new Date().toISOString(), labels: V.labels,
      samples: V.samples.map((s) => {
        let mn = Infinity, mx = -Infinity; for (const x of s.v) { if (x < mn) mn = x; if (x > mx) mx = x; }
        const q = new Uint8Array(s.v.length), r = mx - mn || 1;
        for (let i = 0; i < s.v.length; i++) q[i] = Math.round(((s.v[i] - mn) / r) * 255);
        return { l: s.l, mn: +mn.toFixed(6), mx: +mx.toFixed(6), q: toB64(q) };
      }),
    };
  };
  V.deserialize = function (j) {
    if (!j || j.format !== "goe-knn-1") return false;
    V.labels = j.labels || [];
    V.samples = (j.samples || []).map((s) => {
      const q = fromB64(s.q), v = new Float32Array(q.length), r = s.mx - s.mn;
      let n = 0;
      for (let i = 0; i < q.length; i++) { v[i] = s.mn + (q[i] / 255) * r; n += v[i] * v[i]; }
      n = Math.sqrt(n) || 1; for (let i = 0; i < v.length; i++) v[i] /= n;
      return { l: s.l, v };
    });
    return true;
  };
  V.fetchModel = async function () {
    try {
      const res = await fetch("/api/model", { cache: "no-store" });
      if (!res.ok) return false;
      return V.deserialize(await res.json());
    } catch { return false; }
  };

  window.Vision = V;
})();
