// Fetching and parsing irishracing.com pages.
// Personal, low-volume use: every page is cached, and the app always links back to the source.
import * as cheerio from "cheerio";

export const BASE = "https://www.irishracing.com";
const UA = "Mozilla/5.0 (compatible; JumpsBook personal racing tracker; low-volume)";
const MONTHS = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };

// Bookmaker ids used in irishracing.com odds links (PassBetTo). Unknown ids fall back to "Bookmaker".
const BOOKIES = { 1: "Betfair", 2: "Betfair Exchange", 3: "BoyleSports", 5: "Coral", 6: "Ladbrokes", 11: "Bet365", 12: "William Hill",
  15: "Paddy Power", 16: "Betfred", 24: "Sky Bet", 25: "10bet", 29: "Unibet", 38: "QuinnBet", 57: "Novibet", 78: "Puntit" };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchHtml(pathOrUrl) {
  const u = new URL(pathOrUrl, BASE);
  if (!/(^|\.)irishracing\.com$/.test(u.hostname)) throw new Error("Only irishracing.com pages can be fetched.");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const r = await fetch(u, { headers: { "user-agent": UA, accept: "text/html" }, signal: ctrl.signal, redirect: "follow" });
    if (!r.ok) throw new Error(`irishracing.com returned ${r.status} for ${u.pathname}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

/* ---------- small helpers ---------- */
export function parseHorseUrl(s) {
  const m = String(s || "").match(/\/horse\/([^/?#\s]+)\/(\d+)/);
  return m ? { slug: m[1], id: m[2], path: `/horse/${m[1]}/${m[2]}` } : null;
}
const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
// Text of an element with a space between every text node, so cells don't run together.
function spaced($, el) {
  const parts = [];
  const walk = (n) => {
    if (n.type === "text") parts.push(n.data);
    else if (n.children) n.children.forEach(walk);
    if (n.type === "tag") parts.push(" ");
  };
  walk(el.get ? el.get(0) : el);
  return clean(parts.join(" "));
}
function tokenDate(s) { // "21Sep26" -> "2026-09-21"
  const m = String(s).match(/\b(\d{1,2})([A-Z][a-z]{2})(\d{2})\b/);
  return m && MONTHS[m[2]] ? `20${m[3]}-${MONTHS[m[2]]}-${m[1].padStart(2, "0")}` : null;
}
function hrefDate(h) { // ".../Mon-21st-Sep-2026/..." -> "2026-09-21"
  const m = String(h).match(/(\d{1,2})(?:st|nd|rd|th)-([A-Z][a-z]{2})-(\d{4})/);
  return m && MONTHS[m[2]] ? `${m[3]}-${MONTHS[m[2]]}-${m[1].padStart(2, "0")}` : null;
}
function hrefCourse(h) { // ".../Mon-21st-Sep-2026/Gowran-Park/1340" -> "Gowran Park"
  const m = String(h).match(/\d{4}\/([^/]+)/);
  return m ? decodeURIComponent(m[1]).replace(/-/g, " ") : null;
}
function hrefTime(h) { // ".../1340" -> "1:40"
  const m = String(h).match(/\/(\d{2})(\d{2})(?:[/?#]|$)/);
  if (!m) return null;
  let hh = +m[1]; const mm = m[2];
  if (hh > 12) hh -= 12;
  return `${hh}:${mm}`;
}
const toDec = (s) => {
  s = String(s || "").trim().toLowerCase();
  if (s === "evs" || s === "evens") return 2;
  if (s.includes("/")) { const [a, b] = s.split("/").map(Number); return b ? a / b + 1 : 0; }
  const d = parseFloat(s); return d > 1 ? d : 0;
};

/* ---------- horse links (used for the search index) ---------- */
export function collectHorseLinks($) {
  const out = [];
  $('a[href*="/horse/"]').each((_, a) => {
    const p = parseHorseUrl($(a).attr("href"));
    const name = clean($(a).text()).replace(/\*/g, "");
    if (p && name && name.length < 60 && /[A-Za-z]/.test(name)) out.push({ name, path: p.path, id: p.id });
  });
  return out;
}

/* ---------- horse page ---------- */
const LABELS = ["Sire", "Dam's Sire", "Dam", "Owner", "Trainer", "Breeder", "Last Run", "Next Run"];
function field(text, label) {
  const others = LABELS.filter((l) => l !== label).map((l) => l.replace(/'/g, "['’]")).join("|");
  const re = new RegExp(`(?:^|\\s)${label.replace(/'/g, "['’]")}\\s+(.+?)\\s+(?:${others}|Form Entries|Lifetime|Form\\s|$)`);
  const m = text.match(re);
  return m ? clean(m[1]) : null;
}
function parseOdds($, scope) {
  const prices = [];
  $(scope).find('a[href^="javascript:PassBetTo"]').each((_, a) => {
    const m = String($(a).attr("href")).match(/PassBetTo\((\d+)\s*,\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'([^']+)'/);
    if (m && toDec(m[2]) > 1) prices.push({ book: BOOKIES[m[1]] || "Bookmaker", odds: m[2], dec: toDec(m[2]) });
  });
  prices.sort((a, b) => b.dec - a.dec);
  return prices.length ? { best: prices[0], count: prices.length } : null;
}
const GOING = /^(heavy|soft|yielding|good|firm|standard|slow|fast|to|std|hvy|gd|sft|yld|frm|gf|gs|ys|sh|good\/soft|good\/firm)$/i;
function parseFormRow(text, href) {
  const t = clean(text);
  const tok = t.split(" ");
  const row = { date: tokenDate(t) || hrefDate(href), course: hrefCourse(href) || tok[1] || "", url: href };
  row.dist = tok[2] || "";
  let i = 3; const going = [];
  while (i < tok.length && GOING.test(tok[i])) going.push(tok[i++]);
  row.going = going.join(" ");
  const race = [];
  while (i < tok.length && !/^\d{1,2}-\d{1,2}/.test(tok[i]) && !/non-runner/i.test(tok[i]) && race.length < 8) race.push(tok[i++]);
  row.race = race.join(" ");
  if (/non-runner/i.test(t)) { row.pos = "NR"; row.nonRunner = true; return row; }
  const sp = t.match(/\[([^\]]+)\]/); row.sp = sp ? sp[1] : "";
  const pos = t.match(/\b(\d{1,2})(?:st|nd|rd|th)\s*\/\s*(\d{1,2})/) || t.match(/\b(PU|F|UR|BD|RO|SU|RR|CO|DSQ|P|U|R|B)\s*\/\s*(\d{1,2})\b/);
  if (pos) { row.pos = pos[1]; row.ran = +pos[2]; const after = t.slice(t.indexOf(pos[0]) + pos[0].length).replace(/^,\s*/, ""); row.note = after.replace(/(\s+\d+\/\d+\S*|\s+\d+\.\d+)+\s*$/, "").slice(0, 90); }
  return row;
}

export function parseHorse(html, path) {
  const $ = cheerio.load(html);
  const body = spaced($, $("body"));
  const name = clean($("h1").first().text()) || null;
  const out = { name, url: BASE + path, source: "irishracing.com", fetchedAt: new Date().toISOString() };

  const country = name && name.match(/\(([A-Z]{2,4})\)\s*$/); out.country = country ? country[1] : null;
  // Age, colour and sex sit on the line just after the horse's name ("2yo b c 2024").
  const at = name ? body.indexOf(name) : -1;
  const near = at >= 0 ? body.slice(at + name.length, at + name.length + 60) : "";
  const al = near.match(/^\s*(?:(\d{1,2})yo\s+)?([a-z]{1,3})\s+([a-z])\s+(\d{4})\b/);
  if (al) Object.assign(out, { colour: al[2], sex: al[3], foaled: +al[4], age: al[1] ? +al[1] : new Date().getFullYear() - +al[4] });

  for (const [k, l] of [["sire", "Sire"], ["dam", "Dam"], ["damSire", "Dam's Sire"], ["owner", "Owner"], ["trainer", "Trainer"], ["breeder", "Breeder"]]) out[k] = field(body, l);
  // Link-based values are cleaner when present.
  const linkText = (sel) => clean($(sel).first().text()) || null;
  out.trainer = linkText('a[href*="/trainer/"]') || out.trainer;
  out.owner = linkText('a[href*="/owner/"]') || out.owner;
  out.sire = linkText('a[href*="/sire/"]') || out.sire;

  // Silks: the owner's colours image next to the horse's name. Sites often lazy-load images, so check every attribute.
  let silk = null;
  $("img").each((_, im) => {
    if (silk) return;
    for (const at of ["src", "data-src", "data-original", "data-lazy-src", "srcset"]) {
      const v = $(im).attr(at);
      if (v && /\/colours\//i.test(v)) { silk = v.split(/[\s,]/)[0]; return; }
    }
  });
  if (!silk) { const m = html.match(/["'(]((?:https?:)?\/\/[^"'()\s]*\/colours\/[^"'()\s]+?\.(?:gif|png|jpe?g|webp))/i) || html.match(/["'(](\/colours\/[^"'()\s]+?\.(?:gif|png|jpe?g|webp))/i); if (m) silk = m[1]; }
  out.silks = silk ? new URL(silk, BASE).href : null;
  out.parser = 2;
  const ff = body.match(/Form Figures\s*-?\s*([0-9A-Za-z/\-]{1,30})/); out.formFigures = ff ? ff[1] : null;

  // Lifetime statistics rows.
  out.stats = [];
  $("tr").each((_, tr) => {
    const cells = $(tr).children("td,th").map((__, c) => clean($(c).text())).get();
    if (cells.length >= 4 && /^(Flat|Hurdle|Chase|NH ?Flat|Bumper|P2P|Point|AW|Under Rules Total)/i.test(cells[0]) && /^\d+$/.test(cells[1]))
      out.stats.push({ label: cells[0], runs: +cells[1], wins: +cells[2], places: +cells[3], earnings: cells.find((c) => /[€£]/.test(c)) || null });
  });
  if (!out.stats.length) {
    const re = /\b(Flat|Hurdle|Chase|Bumper|NH Flat|P2P|Under Rules Total)(?:\s+(IRE|GB|FR|UK))?\s+(\d+)\s+(\d+)\s+(\d+)\b/g; let m;
    while ((m = re.exec(body))) out.stats.push({ label: clean(`${m[1]} ${m[2] || ""}`), runs: +m[3], wins: +m[4], places: +m[5] });
  }

  // Form rows: links to results pages whose text starts with a date token.
  const seenF = new Set(); out.form = [];
  $('a[href*="/raceresults/"]').each((_, a) => {
    const href = new URL($(a).attr("href"), BASE).href; const text = spaced($, a);
    if (!/^\d{1,2}[A-Z][a-z]{2}\d{2}\s/.test(text) || seenF.has(href)) return;
    seenF.add(href); out.form.push(parseFormRow(text, href));
  });

  // Entries: links to racecards. Odds and rating come from the surrounding row.
  // The same race can be linked twice (header "Next Run" and the entries table), so keep the richest version.
  const entries = new Map();
  const today = new Date().toISOString().slice(0, 10);
  $('a[href*="/racecards/"]').each((_, a) => {
    const href = new URL($(a).attr("href"), BASE).href; const text = spaced($, a);
    const date = tokenDate(text) || hrefDate(href);
    if (!date || date < today) return;
    if (!/\/racecards\/(?:[A-Z][a-z]{2}-\d|race)/.test(href)) return;
    const title = clean($(a).attr("title"));
    const course = hrefCourse(href) || "";
    const fromTitle = title ? clean(title.replace(new RegExp("^" + course.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "")).replace(/`/g, "’") : "";
    const row = $(a).closest("tr");
    const rowText = row.length ? spaced($, row) : "";
    const or = rowText.match(/\b\d{1,2}-\d{1,2}\s+(\d{2,3})\b/);
    const e = { date, course, time: hrefTime(href), race: fromTitle || clean(text.replace(/^.*?\d{1,2}[.:]\d{2}\s*/, "")), url: href,
      rating: or ? +or[1] : null, odds: row.length ? parseOdds($, row) : null, rich: !!title };
    const prev = entries.get(href);
    if (!prev || (e.rich && !prev.rich)) entries.set(href, { ...prev, ...e, odds: e.odds || prev?.odds || null, rating: e.rating ?? prev?.rating ?? null });
  });
  out.entries = [...entries.values()].map(({ rich, ...e }) => e);
  out.entries.sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
  out.rating = out.entries.find((e) => e.rating)?.rating ?? null;
  return out;
}

/* ---------- index crawler ---------- */
const UKIRE = ["aintree","ascot","ayr","bangor","bath","beverley","brighton","carlisle","cartmel","catterick","chelmsford","cheltenham","chepstow","chester","doncaster","epsom","exeter","fakenham","ffoslas","fontwell","goodwood","hamilton","haydock","hereford","hexham","huntingdon","kelso","kempton","leicester","lingfield","ludlow","marketrasen","musselburgh","newbury","newcastle","newmarket","newtonabbot","nottingham","perth","plumpton","pontefract","redcar","ripon","salisbury","sandown","sedgefield","southwell","stratford","taunton","thirsk","uttoxeter","warwick","wetherby","wincanton","windsor","wolverhampton","worcester","yarmouth","greatyarmouth","york",
  "ballinrobe","bellewstown","clonmel","cork","curragh","downpatrick","downroyal","dundalk","fairyhouse","galway","gowran","kilbeggan","killarney","laytown","leopardstown","limerick","listowel","naas","navan","punchestown","roscommon","sligo","thurles","tipperary","tramore","wexford"];
const norm = (s) => String(s).toLowerCase().replace(/[^a-z]/g, "");

export async function crawlIndex({ deadlineMs = 22000, maxPages = 40 } = {}) {
  const start = Date.now();
  const queue = ["/racecards/today", "/racecards/tomorrow", "/racecards/raceadvance", "/racecards/raceentries"];
  const visited = new Set(); const horses = new Map(); let pages = 0;
  const worker = async () => {
    while (queue.length && pages < maxPages && Date.now() - start < deadlineMs) {
      const p = queue.shift(); if (visited.has(p)) continue; visited.add(p);
      let html; try { html = await fetchHtml(p); } catch { continue; }
      pages++;
      const $ = cheerio.load(html);
      for (const h of collectHorseLinks($)) horses.set(h.id, h);
      $("a[href]").each((_, a) => {
        let u; try { u = new URL($(a).attr("href"), BASE); } catch { return; }
        if (!/irishracing\.com$/.test(u.hostname)) return;
        const path = u.pathname.replace(/\/$/, "");
        const meeting = path.match(/^\/racecards\/[A-Z][a-z]{2}-\d{1,2}(?:st|nd|rd|th)-[A-Z][a-z]{2}-\d{4}\/([^/]+)$/);
        const big = /^\/racecards\/(raceadvance|raceentries)\/.+/.test(path);
        if ((meeting && UKIRE.some((c) => norm(meeting[1]).startsWith(c))) || big) if (!visited.has(path) && !queue.includes(path)) queue.push(path);
      });
      await sleep(150);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return { horses: [...horses.values()], pages };
}
