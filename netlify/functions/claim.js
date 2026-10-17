import { store, MONTHS, SONG_COUNT } from "./lib/store.js";
import { requireAdmin } from "./lib/auth.js";

// POST /api/claim — admin-only; { index, month } — empty month unclaims
export default async (req) => {
  const deny = requireAdmin(req);
  if (deny) return deny;
  if (req.method !== "POST") return Response.json({ error: "method" }, { status: 405 });

  const body = await req.json().catch(() => null);
  const index = Number(body?.index);
  const month = body?.month || "";
  if (!Number.isInteger(index) || index < 0 || index >= SONG_COUNT) {
    return Response.json({ error: "invalid song index" }, { status: 400 });
  }
  if (month && !MONTHS.includes(month)) {
    return Response.json({ error: "invalid month" }, { status: 400 });
  }
  return Response.json(await store.setClaim(index, month));
};
