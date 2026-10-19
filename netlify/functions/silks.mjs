// GET /api/silks?u=<irishracing.com silks image url>
// Serves a horse's racing silks image, cached in Netlify Blobs so each one is only fetched from irishracing.com once.
// No passcode needed (images can't send one), but it only ever fetches irishracing.com /colours/ images.
import { getStore } from "@netlify/blobs";

export default async (req) => {
  const raw = new URL(req.url).searchParams.get("u") || "";
  let u;
  try { u = new URL(raw, "https://www.irishracing.com"); } catch { return new Response("Bad link", { status: 400 }); }
  if (!/(^|\.)irishracing\.com$/.test(u.hostname) || !u.pathname.startsWith("/colours/") || !/\.(gif|png|jpe?g|webp)$/i.test(u.pathname))
    return new Response("Not a silks image", { status: 400 });
  const store = getStore("jumpsbook-silks");
  const key = u.pathname.replace(/[^A-Za-z0-9._/-]/g, "_");
  const headers = (ct) => ({ "content-type": ct, "cache-control": "public, max-age=2592000, immutable" });
  const hit = await store.getWithMetadata(key, { type: "arrayBuffer" });
  if (hit?.data) return new Response(hit.data, { headers: headers(hit.metadata?.ct || "image/gif") });
  try {
    const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0 (compatible; JumpsBook personal racing tracker; low-volume)", referer: "https://www.irishracing.com/" } });
    if (!r.ok) return new Response("Not found", { status: 404 });
    const ct = r.headers.get("content-type") || "image/gif";
    if (!ct.startsWith("image/")) return new Response("Not an image", { status: 502 });
    const buf = await r.arrayBuffer();
    if (buf.byteLength > 300000) return new Response("Too large", { status: 502 });
    await store.set(key, buf, { metadata: { ct } });
    return new Response(buf, { headers: headers(ct) });
  } catch {
    return new Response("Couldn’t reach irishracing.com", { status: 502 });
  }
};

export const config = { path: "/api/silks" };
