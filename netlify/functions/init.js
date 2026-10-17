import { store } from "./lib/store.js";
import { requireAdmin } from "./lib/auth.js";

// POST /api/init — admin-only; creates tables and seeds defaults (idempotent)
export default async (req) => {
  const deny = requireAdmin(req);
  if (deny) return deny;
  if (req.method !== "POST") return Response.json({ error: "method" }, { status: 405 });
  return Response.json(await store.init());
};
