// GET /api/horse?url=<irishracing.com horse link>  (or ?path=/horse/Name-IRE/123)
// Returns a parsed profile: details, lifetime stats, form and upcoming entries with best odds. Cached for 3 hours.
import { checkAuth, json } from "../lib/auth.mjs";
import { cacheStore, addToIndex } from "../lib/store.mjs";
import { fetchHtml, parseHorse, parseHorseUrl } from "../lib/irishracing.mjs";

const TTL = 3 * 60 * 60 * 1000;

export default async (req) => {
  const denied = checkAuth(req); if (denied) return denied;
  const q = new URL(req.url).searchParams;
  const h = parseHorseUrl(q.get("url") || q.get("path"));
  if (!h) return json({ error: "That isn’t an irishracing.com horse link." }, 400);
  const fresh = q.get("fresh") === "1";
  const cache = cacheStore(); const key = `horse-${h.id}`;
  if (!fresh) {
    const hit = await cache.get(key, { type: "json" });
    if (hit && Date.now() - new Date(hit.fetchedAt).getTime() < TTL) return json({ horse: hit, cached: true });
  }
  try {
    const html = await fetchHtml(h.path);
    const horse = parseHorse(html, h.path);
    horse.id = h.id;
    if (!horse.name) return json({ error: "Couldn’t read that horse’s page. The site layout may have changed." }, 502);
    await cache.setJSON(key, horse);
    await addToIndex([{ id: h.id, name: horse.name, path: h.path }]);
    if (q.get("debug") === "1") return json({ horse, debugTextSample: html.length });
    return json({ horse, cached: false });
  } catch (e) {
    const stale = await cache.get(key, { type: "json" });
    if (stale) return json({ horse: stale, cached: true, stale: true, warning: e.message });
    return json({ error: e.message || "Couldn’t reach irishracing.com." }, 502);
  }
};

export const config = { path: "/api/horse" };
