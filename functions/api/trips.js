/**
 * Cloudflare Pages Function: collects trip logs (used by the admin Learn tab).
 * POST /api/trips  -> stores the trip (if a KV namespace is bound as TRIPS)
 * GET  /api/trips  -> returns how many trips are stored
 *
 * To start collecting: Cloudflare dashboard > your Pages project > Settings >
 * Bindings > add KV namespace, variable name "GOE". Without it, trips are
 * still accepted (and kept on the phone) but not stored on the server.
 */
export async function onRequestPost({ request, env }) {
  let trip;
  try { trip = await request.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
  if (!trip || !trip.id || !Array.isArray(trip.events)) return json({ ok: false, error: "not a trip" }, 400);
  if (JSON.stringify(trip).length > 500_000) return json({ ok: false, error: "too large" }, 413);
  const kv = env.GOE || env.TRIPS;
  if (kv) {
    await kv.put(`trip:${trip.endedAt || new Date().toISOString()}:${trip.id}`, JSON.stringify(trip), { expirationTtl: 60 * 60 * 24 * 180 });
    return json({ ok: true, stored: true });
  }
  return json({ ok: true, stored: false });
}

export async function onRequestGet({ request, env }) {
  const kv = env.GOE || env.TRIPS;
  if (!kv) return json({ ok: true, storage: "not configured", count: 0 });
  const list = await kv.list({ prefix: "trip:" });
  const url = new URL(request.url);
  if (url.searchParams.get("list") && (await authed(request, kv))) {
    // newest 300 trips for the admin Learn tab
    const keys = list.keys.slice(-300);
    const trips = (await Promise.all(keys.map((k) => kv.get(k.name, "json")))).filter(Boolean);
    return json({ ok: true, count: list.keys.length, trips });
  }
  return json({ ok: true, count: list.keys.length, complete: list.list_complete });
}
async function authed(request, kv) {
  const stored = await kv.get("admin_pin");
  if (!stored) return false;
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("goe:" + (request.headers.get("x-admin-pin") || "")));
  return stored === [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
