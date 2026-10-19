// POST /api/reindex -> rebuild the horse name index now (also runs automatically twice a day).
import { checkAuth, json } from "../lib/auth.mjs";
import { refreshIndex } from "../lib/store.mjs";

export default async (req) => {
  const denied = checkAuth(req); if (denied) return denied;
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  try { return json(await refreshIndex()); } catch (e) { return json({ error: e.message }, 502); }
};

export const config = { path: "/api/reindex" };
