#!/usr/bin/env node
// Precompute per-lead site data -> phx-land-leads/site/<apn>.json = {par, site, zn, ringHash, fetchedAt}.
// Runs the PAGE'S OWN fetchParcel / fetchSite / fetchZone (sliced out of phx-land-leads.html), so the cache equals what
// the page would fetch live. Resumable (existing files are skipped unless older than --max-age days). Network trouble is
// never stored (no file -> the page falls back to live calls). Good leads first, then Maybe, then the rest.
// Usage: node site_cache.mjs [--workers 4] [--limit N] [--max-age 90]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HTML = fs.readFileSync(path.join(ROOT, 'phx-land-leads.html'), 'utf8');
const OUT = path.join(ROOT, 'phx-land-leads', 'site');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? +process.argv[i + 1] : d; };
const WORKERS = arg('workers', 4), LIMIT = arg('limit', 0), MAX_AGE = arg('max-age', 90) * 864e5;

const cut = (from, to) => { const a = HTML.indexOf(from), b = HTML.indexOf(to, a); if (a < 0 || b < 0) throw new Error('page markers not found: ' + from); return HTML.slice(a, b); };
const code = cut('const parcelCache = {}', '// ── Subdivision sketch') + cut('const GIS_STRUCT', 'const tracedAll') + HTML.match(/function ringHash[^\n]*/)[0];
const siteFile = () => Promise.resolve(null);   // the page's cache lookup, disabled: we are building the cache
const { fetchParcel, fetchSite, fetchZone, ringHash } = new Function('siteFile', code + '\nreturn { fetchParcel, fetchSite, fetchZone, ringHash };')(siteFile);

const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function retry(fn, tries = 3) { let e; for (let t = 0; t < tries; t++) { try { return await fn(); } catch (x) { e = x; await sleep(2000 * 2 ** t); } } throw e; }

// the page's functions cache by apn (and fetchSite swallows errors into the result), so call fresh each try via a distinct lead object
async function one(lead) {
  const par = await retry(() => fetchParcel(lead));   // throws if no boundary / network: nothing stored
  let site;
  for (let t = 0; t < 3; t++) {
    site = await fetchSite({ apn: lead.apn + '#' + t }, par.ring);
    if (!site.bldgErr && !site.roadErr) break;
    await sleep(2000 * 2 ** t);
  }
  if (site.bldgErr || site.roadErr) throw new Error('site lookup failed: ' + (site.bldgErr || site.roadErr));
  let zn = null;
  try { zn = await retry(() => fetchZone(lead)); } catch (e) { if (!/no zoning polygon/.test(e.message)) throw e; }   // no polygon = real answer; anything else = network, skip
  return { par, site, zn, ringHash: ringHash(par.ring), fetchedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z') };
}

const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'phx-land-leads', 'data.js'), 'utf8').replace(/^[^{]*/, '').replace(/;\s*$/, ''));
const rank = l => ({ Good: 0, Maybe: 1 })[(l.verdict || {}).label] ?? 2;
fs.mkdirSync(OUT, { recursive: true });
const fresh = f => { try { return Date.now() - Date.parse(JSON.parse(fs.readFileSync(f, 'utf8')).fetchedAt) < MAX_AGE; } catch (e) { return false; } };
let todo = d.leads.map((l, i) => [rank(l), i, l]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2]).filter(l => l.apn && !fresh(path.join(OUT, l.apn + '.json')));
if (LIMIT) todo = todo.slice(0, LIMIT);
log(`${todo.length} leads to do`);
let ok = 0, bad = 0, streak = 0, stop = false;
await Promise.all(Array.from({ length: WORKERS }, async () => {
  while (todo.length && !stop) {
    const lead = todo.shift();
    try {
      const rec = await one(lead);
      const f = path.join(OUT, lead.apn + '.json');
      fs.writeFileSync(f + '.tmp', JSON.stringify(rec)); fs.renameSync(f + '.tmp', f);
      ok++; streak = 0; log(lead.apn, 'ok');
    } catch (e) {
      bad++; streak++; log(lead.apn, 'not stored:', e.message);
      if (streak >= 20) { stop = true; log('20 failures in a row, GIS looks down; stopping'); }
    }
  }
}));
log(`done: ${ok} stored, ${bad} not stored this run`);
