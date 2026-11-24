import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
// houses.js builds the 3D house models. Needs real three.js r160: use an installed `three`, a cached copy, or fetch it once (skips if offline).
async function loadThree(){
  try{ return await import('three'); }catch(e){}
  const f = path.join(os.tmpdir(), 'three-r160.module.mjs');
  if(!fs.existsSync(f)){ try{ const r = await fetch('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js'); if(!r.ok) throw new Error(r.status); fs.writeFileSync(f, await r.text()); }catch(e){ return null; } }
  return import(f);
}
const T = await loadThree();
const noop = new Proxy(function(){}, { get: () => noop, set: () => true, apply: () => noop });   // canvas 2D context stub
const ctx = vm.createContext({ console, document: { createElement: () => ({ getContext: () => noop }) }, matchMedia: () => ({ matches: false }) });
vm.runInContext(fs.readFileSync(new URL('../phx-land-leads/houses.js', import.meta.url), 'utf8') + '\nthis.build = buildHouseV2;', ctx);
const dims = sf => { const st = sf > 3000 ? 2 : 1, a = (sf / st + 700) * 0.09290304, w = Math.sqrt(a * 1.5); return { st, w, d: w / 1.5, h: st * 3.2, area: a }; };
const TRI_BUDGET = 60000, DRAW_BUDGET = 16;
test('houses.js builds A/B/C within footprint, triangle and draw-call budgets', { skip: !T && 'three.js unavailable offline' }, () => {
  for(const sf of [2500, 3750]) for(const style of ['A', 'B', 'C']){
    const hd = dims(sf), g = ctx.build(T, style, hd), box = new T.Box3(); let tri = 0, calls = 0;
    g.traverse(o => { if(o.isMesh && o.name.startsWith('hv-')){ calls++; tri += o.geometry.attributes.position.count / 3; if(o.name !== 'hv-paver') box.expandByObject(o); } });
    const tag = `${style} ${sf}sf`;
    assert.ok(g.isGroup, tag); assert.ok(tri > 2000 && tri < TRI_BUDGET, `${tag}: ${tri} triangles`); assert.ok(calls <= DRAW_BUDGET, `${tag}: ${calls} draw calls`);
    assert.ok(box.min.x <= -hd.w / 2 + .05 && box.max.x >= hd.w / 2 - .05 && box.min.z <= -hd.d / 2 + .05 && box.max.z >= hd.d / 2 - .05, `${tag}: covers the w x d footprint`);
    assert.ok(box.min.x >= -hd.w / 2 - 3.5 && box.max.x <= hd.w / 2 + 1.5 && box.min.z >= -hd.d / 2 - 1.5 && box.max.z <= hd.d / 2 + 4.2, `${tag}: stays near the footprint (eaves, balcony, porch)`);
    assert.ok(box.min.y >= -.01 && box.max.y <= g.userData.top + .5 && g.userData.top > hd.h, `${tag}: vertical extent`);
    g.traverse(o => { if(o.geometry) o.geometry.dispose(); });
  }
});
