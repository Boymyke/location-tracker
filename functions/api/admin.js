/**
 * Admin PIN. The first person to open /admin.html sets the PIN (stored only
 * as a SHA-256 hash in KV). After that, saving the map or the model needs it.
 * GET  /api/admin            -> { storage, pinSet }
 * POST /api/admin {action:"set-pin", pin, oldPin?}
 * POST /api/admin {action:"check", pin}
 * Requires a KV namespace bound as GOE.
 */
export async function onRequestGet({ env }) {
  if (!env.GOE) return json({ storage: false, pinSet: false });
  return json({ storage: true, pinSet: !!(await env.GOE.get("admin_pin")) });
}
export async function onRequestPost({ request, env }) {
  if (!env.GOE) return json({ ok: false, error: "Storage is not set up (bind a KV namespace named GOE)." }, 503);
  let body; try { body = await request.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
  const stored = await env.GOE.get("admin_pin");
  if (body.action === "check") return json({ ok: !!stored && stored === (await hash(body.pin)) });
  if (body.action === "set-pin") {
    const pin = String(body.pin || "");
    if (pin.length < 4) return json({ ok: false, error: "PIN must be at least 4 characters" }, 400);
    if (stored && stored !== (await hash(body.oldPin))) return json({ ok: false, error: "Current PIN is wrong" }, 403);
    await env.GOE.put("admin_pin", await hash(pin));
    return json({ ok: true });
  }
  return json({ ok: false, error: "unknown action" }, 400);
}
async function hash(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("goe:" + String(s || "")));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
