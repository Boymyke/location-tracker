/**
 * Cloudflare Pages Function: collects trip logs for training the ML model.
 * POST /api/trips  -> stores the trip (if a KV namespace is bound as TRIPS)
 * GET  /api/trips  -> returns how many trips are stored
 *
 * To start collecting: Cloudflare dashboard > your Pages project > Settings >
 * Bindings > add KV namespace, variable name "TRIPS". Without it, trips are
 * still accepted (and kept on the phone) but not stored on the server.
 */
export async function onRequestPost({ request, env }) {
  let trip;
  try { trip = await request.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
  if (!trip || !trip.id || !Array.isArray(trip.events)) return json({ ok: false, error: "not a trip" }, 400);
  if (JSON.stringify(trip).length > 500_000) return json({ ok: false, error: "too large" }, 413);
  if (env.TRIPS) {
    await env.TRIPS.put(`trip:${trip.endedAt || new Date().toISOString()}:${trip.id}`, JSON.stringify(trip));
    return json({ ok: true, stored: true });
  }
  return json({ ok: true, stored: false });
}

export async function onRequestGet({ env }) {
  if (!env.TRIPS) return json({ ok: true, storage: "not configured", count: 0 });
  const list = await env.TRIPS.list({ prefix: "trip:" });
  return json({ ok: true, count: list.keys.length, complete: list.list_complete });
}

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
