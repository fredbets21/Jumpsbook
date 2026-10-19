// GET: load your bets and tracked horses. PUT: save (merged record by record).
import { checkAuth, json } from "../lib/auth.mjs";
import { userStore, mergeState } from "../lib/store.mjs";

export default async (req) => {
  const denied = checkAuth(req); if (denied) return denied;
  const store = userStore();
  const current = (await store.get("state", { type: "json" })) || { bets: [], tracked: [], settings: {} };
  if (req.method === "GET") return json({ state: current });
  if (req.method === "PUT") {
    let incoming;
    try { incoming = await req.json(); } catch { return json({ error: "Bad JSON" }, 400); }
    const merged = mergeState(current, incoming.state || {});
    await store.setJSON("state", merged);
    // Daily backup copy, kept by date.
    await store.setJSON(`backup-${new Date().toISOString().slice(0, 10)}`, merged);
    return json({ state: merged });
  }
  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: "/api/data" };
