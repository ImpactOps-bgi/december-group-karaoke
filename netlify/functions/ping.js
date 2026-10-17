import { isAdmin } from "./lib/auth.js";

// GET /api/ping — admin check, returns 200 only with a valid key
export default async (req) => {
  if (!isAdmin(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ ok: true });
};
