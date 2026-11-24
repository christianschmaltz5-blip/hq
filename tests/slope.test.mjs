import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const html = fs.readFileSync(new URL('../phx-land-leads.html', import.meta.url), 'utf8');
const slopeCells = new Function(html.match(/function slopeCells[\s\S]*?\n}\n/)[0] + 'return slopeCells;')();
test('slope math: flat = 0%, 10% plane = 10%', () => {
  const z = (f) => Array.from({ length: 16 }, (_, k) => f(k % 4 * 5, Math.floor(k / 4) * 5));
  assert.ok(slopeCells(z(() => 7), 4, 4, 5, 5).every(s => s === 0));
  assert.ok(slopeCells(z(x => .1 * x), 4, 4, 5, 5).every(s => Math.abs(s - 10) < 1e-9));
  assert.ok(slopeCells(z((x, y) => .3 * x + .4 * y), 4, 4, 5, 5).every(s => Math.abs(s - 50) < 1e-9));
});
const SF2M = 0.092903, houseDims = new Function('SF2M', html.match(/function houseDims[\s\S]*?\n}\n/)[0] + 'return houseDims;')(SF2M);
const compSfs = new Function(html.match(/function compSfs[\s\S]*?\n}\n/)[0] + 'return compSfs;')();
test('house size: 4,000 sf is 2-story and footprint = sf/2 + 700 sf; comps median rounds to 50', () => {
  const d = houseDims(4000); assert.equal(d.st, 2); assert.ok(Math.abs(d.w * d.d / SF2M - 2700) < 1e-6); assert.equal(houseDims(2500).st, 1);
  const c = compSfs({ newBuild: { examples: [{ sf: 2898 }, { sf: 3765 }, { sf: 3697 }, { sf: 50 }] } }); assert.deepEqual([c.n, c.lo, c.hi, c.med], [3, 2898, 3765, 3700]);
  assert.equal(compSfs({}).n, 0);
});
const slopeAdder = new Function(html.match(/function slopeAdder[\s\S]*?\n}\n/)[0] + 'return slopeAdder;')();
test('slope cost adder: flat = 0, monotonic in band, capped at $60/sf, worked example ~$131.5k', () => {
  assert.equal(slopeAdder({ avg: 3, max: 4, reliefFt: 5 }, 3750, 2, 1).base, 0);
  const b = [[4.9, 9, 10], [7, 9, 10], [12, 18, 30], [20, 30, 60]].map(([avg, max, reliefFt]) => slopeAdder({ avg, max, reliefFt }, 3750, 2, 1).base);
  assert.deepEqual(b, [...b].sort((x, y) => x - y)); assert.ok(b[1] > 0);
  const c = slopeAdder({ avg: 40, max: 60, reliefFt: 200 }, 3750, 2, 1); assert.equal(c.high, 60 * 3750); assert.ok(c.capped && c.flag);
  const w = slopeAdder({ avg: 12.6, max: 19, reliefFt: 36 }, 3750, 2, 0.97); assert.ok(Math.abs(w.base / 131486 - 1) < .02, w.base); assert.ok(w.low < w.base && w.base < w.high && !w.flag);
});
