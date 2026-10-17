import { store, MONTHS, ROUNDS, CATS } from "./lib/store.js";
import { requireAdmin } from "./lib/auth.js";

// POST   /api/performance     — admin; { round, month, cat, song?, judges, votes }
// DELETE /api/performance?id= — admin; removes a logged performance
export default async (req) => {
  const deny = requireAdmin(req);
  if (deny) return deny;

  if (req.method === "POST") {
    const b = await req.json().catch(() => null);
    const p = {
      round: b?.round,
      month: b?.month,
      cat: b?.cat,
      song: String(b?.song || "").slice(0, 120),
      judges: Number(b?.judges) || 0,
      votes: Number(b?.votes) || 0
    };
    if (!ROUNDS.includes(p.round)) return Response.json({ error: "invalid round" }, { status: 400 });
    if (!MONTHS.includes(p.month)) return Response.json({ error: "invalid month" }, { status: 400 });
    if (!CATS.includes(p.cat)) return Response.json({ error: "invalid category" }, { status: 400 });
    if (p.judges < 0 || p.judges > 100 || p.votes < 0) {
      return Response.json({ error: "invalid scores" }, { status: 400 });
    }
    return Response.json(await store.addPerformance(p), { status: 201 });
  }

  if (req.method === "DELETE") {
    const id = Number(new URL(req.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "invalid id" }, { status: 400 });
    const ok = await store.deletePerformance(id);
    return ok ? Response.json({ ok: true }) : Response.json({ error: "not found" }, { status: 404 });
  }

  return Response.json({ error: "method" }, { status: 405 });
};
