/**
 * The map ("venue"): rooms, doors, stairs, objects, items, learned edges.
 * GET /api/venue -> current map (404 = use the built-in default)
 * PUT /api/venue -> save (header x-admin-pin). Keeps 30 days of history.
 */
export async function onRequestGet({ env }) {
  if (!env.GOE) return json({ error: "storage not configured" }, 404);
  const v = await env.GOE.get("venue");
  if (!v) return json({ error: "no venue saved yet" }, 404);
  return new Response(v, { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
export async function onRequestPut({ request, env }) {
  if (!env.GOE) return json({ ok: false, error: "Storage is not set up (bind a KV namespace named GOE)." }, 503);
  if (!(await authed(request, env))) return json({ ok: false, error: "Wrong or missing admin PIN" }, 401);
  const text = await request.text();
  if (text.length > 20_000_000) return json({ ok: false, error: "Map too large" }, 413);
  let v; try { v = JSON.parse(text); } catch { return json({ ok: false, error: "bad json" }, 400); }
  if (!Array.isArray(v.rooms) || !v.floors) return json({ ok: false, error: "Not a valid map" }, 400);
  v.updatedAt = new Date().toISOString();
  const out = JSON.stringify(v);
  await env.GOE.put("venue", out);
  await env.GOE.put("venue:hist:" + v.updatedAt, out, { expirationTtl: 60 * 60 * 24 * 30 });
  return json({ ok: true, updatedAt: v.updatedAt });
}
async function authed(request, env) {
  const stored = await env.GOE.get("admin_pin");
  if (!stored) return false;
  const pin = request.headers.get("x-admin-pin") || "";
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("goe:" + pin));
  return stored === [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
