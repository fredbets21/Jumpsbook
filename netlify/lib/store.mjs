import { getStore } from "@netlify/blobs";
import { crawlIndex } from "./irishracing.mjs";

export const userStore = () => getStore({ name: "jumpsbook-user", consistency: "strong" });
export const cacheStore = () => getStore("jumpsbook-cache");

/* ----- Record-level merge so two devices never overwrite each other's bets or notes ----- */
// Every bet and tracked horse carries u (last-updated ms). Deleted items stay as { id, del: true, u } tombstones.
function mergeList(a = [], b = [], key) {
  const m = new Map();
  for (const it of [...a, ...b]) {
    const k = it[key]; if (k == null) continue;
    const cur = m.get(k);
    if (!cur || (it.u || 0) >= (cur.u || 0)) m.set(k, it);
  }
  return [...m.values()];
}
export function mergeState(server = {}, client = {}) {
  return {
    bets: mergeList(server.bets, client.bets, "id"),
    tracked: mergeList(server.tracked, client.tracked, "id"),
    settings: { ...(server.settings || {}), ...(client.settings || {}) },
  };
}

/* ----- Horse name index (name -> irishracing.com path), built from racecards and entries ----- */
export async function readIndex() {
  return (await cacheStore().get("horse-index", { type: "json" })) || { horses: {}, updatedAt: null };
}
export async function addToIndex(list) {
  if (!list?.length) return;
  const idx = await readIndex(); const today = new Date().toISOString().slice(0, 10);
  for (const h of list) idx.horses[h.id] = { n: h.name, p: h.path, s: today };
  const ids = Object.keys(idx.horses);
  if (ids.length > 40000) ids.sort((a, b) => idx.horses[a].s.localeCompare(idx.horses[b].s)).slice(0, ids.length - 40000).forEach((id) => delete idx.horses[id]);
  idx.updatedAt = new Date().toISOString();
  await cacheStore().setJSON("horse-index", idx);
}
export async function refreshIndex() {
  const { horses, pages } = await crawlIndex();
  await addToIndex(horses);
  return { added: horses.length, pages };
}
