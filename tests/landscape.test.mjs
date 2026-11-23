import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const ctx = vm.createContext({ console });
vm.runInContext(fs.readFileSync(new URL('../phx-land-leads/landscape.js', import.meta.url), 'utf8') + '\nthis.plan = landscapePlan; this.inside = lsInside; this.slopeFn = lsSlopeFn; this.toH = LS_H;', ctx);
// synthetic 60 m square parcel, house facing the south road edge, a steep NE corner (30%) and a 18% band
const R = [[-30, -30], [30, -30], [30, 30], [-30, 30]], cells = [], sl = [];
for(let j = 0; j < 6; j++) for(let i = 0; i < 6; i++){ cells.push({ x: -25 + i * 10, y: -25 + j * 10, z: 0 }); sl.push(i >= 4 && j >= 4 ? 30 : j === 3 ? 18 : 2); }
const el = { cells, sl, dx: 10, dy: 10 }, house = { c: [0, -8], xa: [1, 0], za: [0, -1], w: 19, d: 14, top0: 0 };
const base = { apn: 'T-1', R, el, houses: [house], Fr: [[[-30, -30], [30, -30]]], frontKnown: true };
test('landscape placements respect boundary, house footprint and slope', () => {
  const p = ctx.plan(base), s = ctx.slopeFn(el); assert.ok(p.items.length > 20);
  for(const o of p.items){
    assert.ok(ctx.inside(R, o.x, o.y, 1), `${o.k} outside parcel`);
    const [u, v] = ctx.toH(house, o.x, o.y); assert.ok(!(Math.abs(u) < 9.5 && Math.abs(v) < 7), `${o.k} inside house`);
    if(o.k !== 'boulder') assert.ok(s(o.x, o.y) < 15, `${o.k} on steep cell`); assert.ok(o.k === 'boulder' || s(o.x, o.y) <= 25);
  }
  assert.ok(p.drive && p.pad && p.walks.length && p.pool);
  { const [x, y] = [house.c[0] + p.pool.u * house.xa[0] + p.pool.v * house.za[0], house.c[1] + p.pool.u * house.xa[1] + p.pool.v * house.za[1]]; assert.ok(ctx.inside(R, x, y, 3) && p.pool.v < -7); }
  assert.equal(JSON.stringify(ctx.plan(base)), JSON.stringify(p), 'deterministic per apn');
});
test('no road: no driveway; tiny lot: no pool spot note', () => {
  const p = ctx.plan({ ...base, Fr: [], frontKnown: false }); assert.equal(p.drive, null); assert.equal(p.pad, null);
  const t = ctx.plan({ ...base, R: [[-12, -12], [12, -12], [12, 12], [-12, 12]], houses: [{ ...house, c: [0, 0] }], el: null }); assert.equal(t.pool, null); assert.equal(t.poolNote, 'no pool spot found');
});
