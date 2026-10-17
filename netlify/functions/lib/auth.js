export function isAdmin(req) {
  const key = process.env.ADMIN_KEY;
  return !!key && req.headers.get("x-admin-key") === key;
}

export function requireAdmin(req) {
  if (!isAdmin(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
