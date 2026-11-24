import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const html = fs.readFileSync(new URL('../phx-land-leads.html', import.meta.url), 'utf8');
const sunAt = new Function(html.match(/function sunAt[\s\S]*?\n}\n/)[0] + 'return sunAt;')();
const peak = (doy) => { let b = null; for(let h = 6; h <= 19; h += .01){ const r = sunAt(33.6, -112, doy, h); if(!b || r.alt > b.alt) b = r; } return b; };
test('solar noon altitude: Jun 21 ~79.9 deg, Dec 21 ~32.9 deg, due south, near 12:30 MST at 112W', () => {
  const j = peak(172), d = peak(355);
  assert.ok(Math.abs(j.alt - 79.9) < .4, j.alt); assert.ok(Math.abs(d.alt - 32.9) < .4, d.alt);
  assert.ok(Math.abs(j.az - 180) < 5 && Math.abs(d.az - 180) < 3);
  assert.ok(Math.abs(sunAt(33.6, -112, 355, 12.5).alt - d.alt) < .3);
});
test('sunrise in the east, sunset in the west; winter sun is south of east/west', () => {
  const am = sunAt(33.6, -112, 172, 6), pm = sunAt(33.6, -112, 172, 19), wam = sunAt(33.6, -112, 355, 8), wpm = sunAt(33.6, -112, 355, 16.5);
  assert.ok(am.alt > 0 && am.az > 50 && am.az < 100, am.az); assert.ok(pm.alt > 0 && pm.az > 260 && pm.az < 310, pm.az);
  assert.ok(wam.az > 90 && wam.az < 140 && wpm.az > 220 && wpm.az < 270);
  assert.ok(sunAt(33.6, -112, 355, 6).alt < 0 && sunAt(33.6, -112, 355, 19).alt < 0);
});
