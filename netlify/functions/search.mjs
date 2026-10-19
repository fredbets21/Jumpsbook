// GET /api/search?q=name  -> matching horses from the index (horses seen on UK and Irish racecards and entries).
import { checkAuth, json } from "../lib/auth.mjs";
import { readIndex } from "../lib/store.mjs";
import { parseHorseUrl } from "../lib/irishracing.mjs";

const norm = (s) => String(s || "").toLowerCase().replace(/\([a-z]{2,4}\)\s*$/i, "").replace(/['’`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

export default async (req) => {
  const denied = checkAuth(req); if (denied) return denied;
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  const link = parseHorseUrl(q);
  if (link) return json({ results: [{ name: null, path: link.path, id: link.id, fromLink: true }] });
  const nq = norm(q);
  if (nq.length < 2) return json({ results: [] });
  const idx = await readIndex();
  const scored = [];
  for (const [id, h] of Object.entries(idx.horses)) {
    const n = norm(h.n); let s = -1;
    if (n === nq) s = 3; else if (n.startsWith(nq)) s = 2; else if (n.includes(nq)) s = 1;
    if (s >= 0) scored.push({ s, name: h.n, path: h.p, id, seen: h.s });
  }
  scored.sort((a, b) => b.s - a.s || b.seen.localeCompare(a.seen) || a.name.localeCompare(b.name));
  return json({ results: scored.slice(0, 15), indexSize: Object.keys(idx.horses).length, indexUpdatedAt: idx.updatedAt });
};

export const config = { path: "/api/search" };
