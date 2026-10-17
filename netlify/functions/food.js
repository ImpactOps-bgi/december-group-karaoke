import { store, FOOD_STATUS } from "./lib/store.js";
import { requireAdmin } from "./lib/auth.js";

// POST   /api/food       — admin; { item, qty? } adds a supply row
// PUT    /api/food       — admin; { id, item?, qty?, source?, prep?, serve?, status? }
// DELETE /api/food?id=   — admin; removes a supply row
export default async (req) => {
  const deny = requireAdmin(req);
  if (deny) return deny;

  if (req.method === "POST") {
    const b = await req.json().catch(() => null);
    const item = String(b?.item || "").trim();
    if (!item) return Response.json({ error: "item required" }, { status: 400 });
    return Response.json(await store.addFood(item.slice(0, 200), String(b?.qty || "").slice(0, 60)), { status: 201 });
  }

  if (req.method === "PUT") {
    const b = await req.json().catch(() => null);
    const id = Number(b?.id);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "invalid id" }, { status: 400 });
    const fields = {};
    for (const k of ["item", "qty", "source", "prep", "serve"]) {
      if (b[k] !== undefined) fields[k] = String(b[k]).slice(0, 200);
    }
    if (b.status !== undefined) {
      if (!FOOD_STATUS.includes(b.status)) return Response.json({ error: "invalid status" }, { status: 400 });
      fields.status = b.status;
    }
    const row = await store.updateFood(id, fields);
    return row ? Response.json(row) : Response.json({ error: "not found" }, { status: 404 });
  }

  if (req.method === "DELETE") {
    const id = Number(new URL(req.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "invalid id" }, { status: 400 });
    const ok = await store.deleteFood(id);
    return ok ? Response.json({ ok: true }) : Response.json({ error: "not found" }, { status: 404 });
  }

  return Response.json({ error: "method" }, { status: 405 });
};
