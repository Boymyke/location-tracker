/**
 * The trained camera model (place fingerprints) made in the admin Train tab.
 * GET /api/model -> model (404 = not trained yet)
 * PUT /api/model -> save (header x-admin-pin)
 */
export async function onRequestGet({ env }) {
  if (!env.GOE) return json({ error: "storage not configured" }, 404);
  const v = await env.GOE.get("model");
  if (!v) return json({ error: "no model trained yet" }, 404);
  return new Response(v, { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
export async function onRequestPut({ request, env }) {
  if (!env.GOE) return json({ ok: false, error: "Storage is not set up (bind a KV namespace named GOE)." }, 503);
  if (!(await authed(request, env))) return json({ ok: false, error: "Wrong or missing admin PIN" }, 401);
  const text = await request.text();
  if (text.length > 20_000_000) return json({ ok: false, error: "Model too large" }, 413);
  let v; try { v = JSON.parse(text); } catch { return json({ ok: false, error: "bad json" }, 400); }
  if (v.format !== "goe-knn-1") return json({ ok: false, error: "Not a valid model" }, 400);
  v.updatedAt = new Date().toISOString();
  const out = JSON.stringify(v);
  await env.GOE.put("model", out);
  await env.GOE.put("model:hist:" + v.updatedAt, out, { expirationTtl: 60 * 60 * 24 * 30 });
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
