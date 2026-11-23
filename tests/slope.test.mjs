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
