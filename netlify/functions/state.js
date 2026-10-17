import { store } from "./lib/store.js";

// GET /api/state — public read of claims, performances, settings, food
export default async (req) => {
  if (req.method !== "GET") return Response.json({ error: "method" }, { status: 405 });
  return Response.json(await store.getState());
};
