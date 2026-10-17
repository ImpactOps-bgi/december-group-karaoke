import { store } from "./lib/store.js";
import { requireAdmin } from "./lib/auth.js";

const ALLOWED_KEYS = { advSemi: [1, 12], advFinal: [1, 12] };

// POST /api/settings — admin-only; { key: advSemi|advFinal, value: 1..12 }
export default async (req) => {
  const deny = requireAdmin(req);
  if (deny) return deny;
  if (req.method !== "POST") return Response.json({ error: "method" }, { status: 405 });

  const b = await req.json().catch(() => null);
  const key = b?.key;
  const value = Number(b?.value);
  if (!(key in ALLOWED_KEYS)) return Response.json({ error: "invalid key" }, { status: 400 });
  const [lo, hi] = ALLOWED_KEYS[key];
  if (!Number.isInteger(value) || value < lo || value > hi) {
    return Response.json({ error: "invalid value" }, { status: 400 });
  }
  return Response.json(await store.setSetting(key, value));
};
