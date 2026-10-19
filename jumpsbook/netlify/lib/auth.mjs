// Single-user passcode check. Set APP_PASSCODE in Netlify: Site configuration > Environment variables.
import { timingSafeEqual } from "node:crypto";

export function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });
}

export function checkAuth(req) {
  const expected = process.env.APP_PASSCODE;
  if (!expected) return json({ error: "APP_PASSCODE is not set on Netlify yet." }, 500);
  const given = req.headers.get("x-passcode") || "";
  const a = Buffer.from(given), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return json({ error: "Wrong passcode." }, 401);
  return null;
}
