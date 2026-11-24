import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const html = fs.readFileSync(new URL('../phx-land-leads.html', import.meta.url), 'utf8');
const get = n => html.match(new RegExp('function ' + n + '[\\s\\S]*?\\n}\\n'))[0];
const { buildableGrid } = new Function([get('pip'), get('ptSeg'), get('polyArea'), get('buildableGrid')].join('\n') + '\nreturn { buildableGrid };')();
const sq = [[0, 0], [60, 0], [60, 60], [0, 60]], sb = 10 / 3.28084;
test('buildable area: square lot inset by the setback, within 3% of the exact inset', () => {
  const g = buildableGrid(sq, sb, null), exact = (60 - 2 * sb) ** 2;
  assert.equal(g.total, 3600); assert.ok(Math.abs(g.envelope / exact - 1) < .03, g.envelope); assert.equal(g.steep, 0); assert.equal(g.buildable, g.envelope);
  for(const c of g.cells) assert.ok(c.x >= sb - 1e-9 && c.x <= 60 - sb + 1e-9 && c.y >= sb - 1e-9 && c.y <= 60 - sb + 1e-9);
});
test('buildable area: steep cells (>=15%) are carved out; a lot smaller than 2x setback has none', () => {
  const g = buildableGrid(sq, sb, x => x > 30 ? 20 : 5);
  assert.ok(Math.abs(g.steep / g.envelope - (60 - sb - 30) / (60 - 2 * sb)) < .03); assert.ok(Math.abs(g.buildable + g.steep - g.envelope) < 1e-6);
  assert.equal(buildableGrid([[0, 0], [5, 0], [5, 5], [0, 5]], sb, null).cells.length, 0);
});
