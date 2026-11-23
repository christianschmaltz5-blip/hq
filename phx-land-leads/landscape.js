// Conceptual landscaping for the 3D site viewer (phx-land-leads.html). Classic script. Everything is placed by rules
// (parcel boundary, USGS slope cells, road side), seeded from the APN so a redraw never changes it. Not a landscape design.
// Frame: local meters (x east, y north); three.js world = (x, height, -y). House frame: u = house x (garage wing at +u), v = house +z (front door side at +v).
const LAND = {};   // apn -> UI state (remembered per lot like houseStyle)
function landSt(apn){ return LAND[apn] || (LAND[apn] = { on: false, pool: true, palms: true, lawn: false, slope: false, furn: true, obj: null }); }
function pickLandscape(apn, b){ const s = landSt(apn); s.on = !s.on; if(b && b.closest('#reel-hero') && window.heroDraw) window.heroDraw(); else if(typeof p3dRedraw !== 'undefined' && p3dRedraw[apn]) p3dRedraw[apn](); }   // hero panel and lead card can share an apn: redraw the panel that was clicked
function landSub(apn, k, b){ const s = landSt(apn); s[k] = !s[k]; if(b) b.classList.toggle('on', s[k]); if(s.obj) s.obj.set(k, s[k]); const v = typeof p3dViews !== 'undefined' && Object.values(p3dViews).find(x => x.apn === apn); if(v) v.req(); }
function landBtn(apn){ return `<button type="button" class="${landSt(apn).on ? 'on' : ''}" onclick="pickLandscape('${apn}',this)">Landscaping</button>`; }
function landUI(apn){
  const s = landSt(apn); if(!s.on) return '';
  const b = (k, t) => `<button type="button" class="${s[k] ? 'on' : ''}" onclick="landSub('${apn}','${k}',this)">${t}</button>`;
  return `<div class="p3d-sizes">Landscaping: ${b('pool', 'Pool')}${b('palms', 'Palms')}${b('lawn', 'Lawn')}${b('slope', 'Show slope')}${b('furn', 'Furniture')} <span class="pm-why" data-landpn="${apn}"></span></div><div class="pm-why">Conceptual landscaping sketch placed by rules (slope, boundary, road side), not a landscape design, irrigation plan or survey; no cost is included.</div>`;
}

// ---------- pure placement (no three.js; unit tested) ----------
function lsRng(seed){ let h = 2166136261; for(const ch of String(seed)){ h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } let a = h >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function lsInPoly(R, x, y){ let c = false; for(let i = 0, j = R.length - 1; i < R.length; j = i++){ const a = R[i], b = R[j]; if((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
function lsSeg(px, py, ax, ay, bx, by){ const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy; let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t)); return [Math.hypot(px - ax - t * dx, py - ay - t * dy), ax + t * dx, ay + t * dy]; }
function lsInside(R, x, y, m){ if(!lsInPoly(R, x, y)) return false; for(let i = 0; i < R.length; i++){ const a = R[i], b = R[(i + 1) % R.length]; if(lsSeg(x, y, a[0], a[1], b[0], b[1])[0] < m) return false; } return true; }
function lsArea(R){ let s = 0; R.forEach((p, i) => { const q = R[(i + 1) % R.length]; s += p[0] * q[1] - q[0] * p[1]; }); return Math.abs(s) / 2; }
function lsSlopeFn(el){
  if(!el || !el.sl || !el.cells) return () => 0;
  const c = el.cells; let nx = c.findIndex(k => k.y !== c[0].y); nx = nx < 0 ? c.length : Math.max(1, nx); const ny = c.length / nx, x0 = c[0].x - el.dx / 2, y0 = c[0].y - el.dy / 2;
  return (x, y) => { const i = Math.min(nx - 1, Math.max(0, Math.floor((x - x0) / el.dx))), j = Math.min(ny - 1, Math.max(0, Math.floor((y - y0) / el.dy))), s = el.sl[j * nx + i]; return s == null ? 0 : s; };
}
const LS_W = (h, u, v) => [h.c[0] + u * h.xa[0] + v * h.za[0], h.c[1] + u * h.xa[1] + v * h.za[1]];   // house frame -> local meters
const LS_H = (h, x, y) => [(x - h.c[0]) * h.xa[0] + (y - h.c[1]) * h.xa[1], (x - h.c[0]) * h.za[0] + (y - h.c[1]) * h.za[1]];
const LS_GW = h => Math.min(h.w * .35, 65.03 / h.d);   // garage wing width, same formula as buildHouse

function landscapePlan(info){
  const R = info.R, Fr = info.Fr || [], houses = info.houses || [], slope = lsSlopeFn(info.el), rng = lsRng(info.apn), P = { items: [], drive: null, pad: null, walks: [], patios: [], pool: null, poolNote: '', lawn: null, lights: [], drip: [], frontKnown: Fr.length > 0 && info.frontKnown !== false };
  const xs = R.map(p => p[0]), ys = R.map(p => p[1]), X0 = Math.min(...xs), X1 = Math.max(...xs), Y0 = Math.min(...ys), Y1 = Math.max(...ys), area = lsArea(R), span = Math.max(X1 - X0, Y1 - Y0);
  const occ = [];   // blockers: { h, u0, u1, v0, v1, pad } rects in a house frame, or { seg:[ax,ay,bx,by], pad }
  houses.forEach(h => occ.push({ h, u0: -h.w / 2, u1: h.w / 2, v0: -h.d / 2, v1: h.d / 2, pad: 1.5 }));
  const blocked = (x, y, r, skip) => occ.some(o => { if(o.seg) return lsSeg(x, y, ...o.seg)[0] < o.pad + r * .6; if(o.h === skip && o.pad === 1.5) return false; const [u, v] = LS_H(o.h, x, y), p = o.pad + r * .6; return u > o.u0 - p && u < o.u1 + p && v > o.v0 - p && v < o.v1 + p; });
  const rectOK = (h, u0, u1, v0, v1, m, smax, skipOwn) => { for(let u = u0; u <= u1 + 1e-6; u += Math.max(.6, (u1 - u0) / Math.ceil((u1 - u0) / 1.2))) for(let v = v0; v <= v1 + 1e-6; v += Math.max(.6, (v1 - v0) / Math.ceil((v1 - v0) / 1.2))){ const [x, y] = LS_W(h, u, v); if(!lsInside(R, x, y, m) || slope(x, y) > smax || blocked(x, y, 0, skipOwn ? h : null)) return false; } return true; };
  const frontPt = (x, y) => { let b = null; Fr.forEach(e => { const q = lsSeg(x, y, e[0][0], e[0][1], e[1][0], e[1][1]); if(!b || q[0] < b[0]) b = q; }); return b; };
  houses.forEach((h, hi) => {
    const gw = LS_GW(h), gx = h.w / 2 - gw / 2, cx = -gw / 2, gdw = Math.min(3.4, gw - .8), fz = h.d / 2;
    // arrival: parking pad + driveway to the road frontage, walkway to the front door
    let padOK = false;
    if(P.frontKnown){
      const pw = Math.min(gw - .4, 6), pl = 6, ok = rectOK(h, gx - pw / 2, gx + pw / 2, fz + .3, fz + pl, 1.2, 14.9, true);
      if(ok){
        const A = LS_W(h, gx, fz + pl), q = frontPt(A[0], A[1]); let dr = null;
        if(q && q[0] > .5 && q[0] < span * 1.5){ dr = { A, B: [q[1], q[2]], w: gdw }; for(let t = 0; t <= 1.001; t += .05) if(blocked(A[0] + (dr.B[0] - A[0]) * t, A[1] + (dr.B[1] - A[1]) * t, 0, h)){ dr = null; break; } }   // never run the drive through a house
        if(dr || q){ padOK = true; const [x, y] = LS_W(h, gx, fz + pl / 2); P.pad = P.pad || { A: LS_W(h, gx, fz + .1), B: A, w: pw }; occ.push({ h, u0: gx - pw / 2, u1: gx + pw / 2, v0: fz, v1: fz + pl, pad: 1 }); if(dr){ P.drive = dr; occ.push({ seg: [...dr.A, ...dr.B], pad: gdw / 2 + 1.2 }); } }
      }
    }
    const wv = fz + 4.5, wA = LS_W(h, cx, fz), wB = LS_W(h, cx, wv), wC = LS_W(h, padOK ? gx - Math.min(gw - .4, 6) / 2 : cx, wv);
    if(lsInside(R, wB[0], wB[1], 1)){ P.walks.push([wA, wB]); occ.push({ seg: [...wA, ...wB], pad: 1.6 }); if(padOK && lsInside(R, wC[0], wC[1], 1)){ P.walks.push([wB, wC]); occ.push({ seg: [...wB, ...wC], pad: 1.6 }); } }
    // patio behind the house (v < -d/2)
    const mw = h.w - gw, pw2 = Math.min(mw - 1, 13);
    for(const pd of [6.4, 5.8]){ if(rectOK(h, cx - pw2 / 2, cx + pw2 / 2, -fz - pd, -fz, 2, 14.9, true)){ const p = { h, u0: cx - pw2 / 2, u1: cx + pw2 / 2, v0: -fz - pd, v1: -fz, cx }; P.patios.push(p); occ.push({ h, u0: p.u0, u1: p.u1, v0: p.v0, v1: p.v1, pad: 1 }); break; } }
    // small optional lawn in the front yard, clear of the walk
    if(hi === 0){ const u0 = -h.w / 2 - 1, u1 = cx - 1.8, v0 = fz + 2, v1 = fz + 9; if(u1 - u0 > 3 && rectOK(h, u0, u1, v0, v1, 3, 12, true)){ P.lawn = { h, u0, u1, v0, v1 }; occ.push({ h, u0, u1, v0, v1, pad: .5 }); } }
  });
  // pool: flattest buildable rear ground. Rear = behind the house's back wall; deck fit-tested against boundary (3 m), house, patio, drive.
  const h0 = houses[0];
  if(h0){
    const fz = h0.d / 2, step = Math.max(1.5, span / 60);
    for(const [PL, PW] of [[9, 4.5], [7, 3.6]]){
      const hu = PL / 2 + 2.4, hv = PW / 2 + 2.4; let best = null;
      for(let x = X0; x <= X1; x += step) for(let y = Y0; y <= Y1; y += step){
        const [u, v] = LS_H(h0, x, y); if(v + hv > -fz + .5 || Math.abs(u) > h0.w / 2 + 25 || v < -fz - 60) continue;
        let sum = 0, mx = 0, n = 0, ok = true;
        for(let a = -hu; a <= hu + 1e-6 && ok; a += hu / 4) for(let b = -hv; b <= hv + 1e-6; b += hv / 3){ const [px, py] = LS_W(h0, u + a, v + b), s = slope(px, py); if(!lsInside(R, px, py, 3) || s >= 15 || blocked(px, py, 0)){ ok = false; break; } sum += s; mx = Math.max(mx, s); n++; }
        if(!ok) continue; const sc = sum / n + mx * .5 + Math.hypot(u, v) * .02; if(!best || sc < best.sc) best = { sc, u, v };
      }
      if(best){ P.pool = { h: h0, u: best.u, v: best.v, L: PL, W: PW, hu, hv }; occ.push({ h: h0, u0: best.u - hu, u1: best.u + hu, v0: best.v - hv, v1: best.v + hv, pad: 1.5 }); break; }
    }
    if(!P.pool) P.poolNote = 'no pool spot found';
  }
  // planting: scaled to lot size, denser near the house / frontage, sparse on 10-15% ground, boulders only on >=15% ground
  const N = Math.max(14, Math.min(220, Math.round(area / 110))), L = 12 + span * .2;
  const KINDS = [['palm', .09, 1.3, 3, 14], ['paloverde', .10, 2.2, 2], ['mesquite', .06, 2.8, 1], ['saguaro', .08, 1.1, 1], ['agave', .17, .9, 3], ['barrel', .10, .5, 2], ['ocotillo', .06, .8, 1], ['shrub', .22, .9, 4], ['boulder', .12, 1.2, 3]];
  const dHouse = (x, y) => Math.min(1e9, ...houses.map(h => Math.hypot(x - h.c[0], y - h.c[1]))), dFront = (x, y) => { const q = frontPt(x, y); return q ? q[0] : 1e9; };
  KINDS.forEach(([k, share, r0, mn, cap]) => {
    const n = Math.min(cap || 999, Math.max(mn, Math.round(N * share))); let got = 0, tries = n * 80;
    while(got < n && tries-- > 0){
      const x = X0 + rng() * (X1 - X0), y = Y0 + rng() * (Y1 - Y0), s = k === 'boulder' ? .5 + rng() * 1.1 : (k === 'palm' ? .75 + rng() * .5 : .6 + rng() * .7), r = r0 * s, sl = slope(x, y);
      if(!lsInside(R, x, y, 1.2 + r * .8)) continue;
      if(k === 'boulder'){ if(sl < 15 && rng() > .12) continue; } else if(sl >= 15) continue;
      let w = .18 + .82 * Math.max(Math.exp(-dHouse(x, y) / L), Math.exp(-dFront(x, y) / L)); if(k === 'palm') w = w * w + .04; if(sl >= 10 && k !== 'boulder') w *= .4;
      if(rng() > w || blocked(x, y, r) || (['palm', 'paloverde', 'mesquite', 'saguaro'].includes(k) && houses.some(h => { const [u, v] = LS_H(h, x, y); return Math.abs(u + LS_GW(h) / 2) < 4.5 + r && v > h.d / 2 && v < h.d / 2 + 32; })) || P.items.some(o => Math.hypot(o.x - x, o.y - y) < (o.r + r) * .85)) continue;
      P.items.push({ k, x, y, s, r, ry: rng() * 6.283, sy: k === 'boulder' ? s * (.5 + rng() * .4) : s }); got++;
    }
  });
  // path lights along the walkway and drive; thin drip lines chaining nearby small plantings
  const lightAlong = (A, B, off, every) => { const len = Math.hypot(B[0] - A[0], B[1] - A[1]), dx = (B[0] - A[0]) / len, dy = (B[1] - A[1]) / len; for(let t = every / 2; t < len; t += every) [-1, 1].forEach(sg => { const x = A[0] + dx * t - dy * off * sg, y = A[1] + dy * t + dx * off * sg; if(lsInside(R, x, y, 1.5) && P.lights.length < 40) P.lights.push([x, y]); }); };
  P.walks.forEach(w => lightAlong(w[0], w[1], 1.1, 3.5)); if(P.drive) lightAlong(P.drive.A, P.drive.B, P.drive.w / 2 + .6, 6);
  const sm = P.items.filter(o => ['agave', 'barrel', 'shrub', 'ocotillo'].includes(o.k)).slice(0, 36);
  sm.forEach(o => { let b = null; sm.forEach(q => { const d = Math.hypot(q.x - o.x, q.y - o.y); if(q !== o && d < 9 && (!b || d < b[0])) b = [d, q]; }); if(b && P.drip.length < 40) P.drip.push([[o.x, o.y], [b[1].x, b[1].y]]); });
  return P;
}

// ---------- three.js meshes ----------
function lsMerge(T, list){
  const Pp = [], Nn = [], Cc = [], col = new T.Color();
  list.forEach(({ g, m, c }) => { const q = g.index ? g.toNonIndexed() : g.clone(); q.applyMatrix4(m); const p = q.attributes.position, n = q.attributes.normal; col.set(c); for(let i = 0; i < p.count; i++){ Pp.push(p.getX(i), p.getY(i), p.getZ(i)); Nn.push(n.getX(i), n.getY(i), n.getZ(i)); Cc.push(col.r, col.g, col.b); } q.dispose(); });
  const o = new T.BufferGeometry(); o.setAttribute('position', new T.Float32BufferAttribute(Pp, 3)); o.setAttribute('normal', new T.Float32BufferAttribute(Nn, 3)); o.setAttribute('color', new T.Float32BufferAttribute(Cc, 3)); return o;
}
function lsParts(T, Mh){
  const list = [], V = T.Vector3, G = { box: new T.BoxGeometry(1, 1, 1), cyl: new T.CylinderGeometry(1, 1, 1, 10), taper: new T.CylinderGeometry(.6, 1, 1, 7), cone: new T.ConeGeometry(1, 1, 6), sph: new T.SphereGeometry(1, 8, 6), ico: new T.IcosahedronGeometry(1, 1) };
  const add = (g, c, x, y, z, sx, sy, sz, ry, rx, rz) => { const m = new T.Matrix4().compose(new V(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx || 0, ry || 0, rz || 0, 'YXZ')), new V(sx, sy, sz)); if(Mh) m.premultiply(Mh); list.push({ g: typeof g === 'string' ? G[g] : g, m, c }); };
  return { list, add, box: (w, h, d, c, x, y, z, ry) => add('box', c, x, y + h / 2, z, w, h, d, ry), cyl: (r, h, c, x, y, z) => add('cyl', c, x, y + h / 2, z, r, h, r), cone: (r, h, c, x, y, z, rx, rz) => add('cone', c, x, y + h / 2, z, r, h, r, 0, rx, rz), sph: (r, c, x, y, z, sx, sy, sz) => add('sph', c, x, y, z, r * (sx || 1), r * (sy || 1), r * (sz || 1)), ico: (r, c, x, y, z, sx, sy, sz) => add('ico', c, x, y, z, r * (sx || 1), r * (sy || 1), r * (sz || 1)) };
}
function lsProto(T, k){
  const p = lsParts(T), M4 = T.Matrix4;
  if(k === 'palm'){
    p.add('taper', '#8b7355', 0, 4, 0, .28, 8, .28); p.sph(.45, '#7a5a2a', 0, 7.9, 0);
    [[8, 1.3, 3.4], [6, .55, 2.8]].forEach(([n, tilt, len], ring) => { for(let i = 0; i < n; i++){ const m = new M4().makeTranslation(0, 8, 0).multiply(new M4().makeRotationY(i * 6.283 / n + ring * .4)).multiply(new M4().makeRotationZ(-tilt)).multiply(new M4().makeScale(.55, 1, .14)).multiply(new M4().makeTranslation(0, len / 2, 0)); p.list.push({ g: new T.ConeGeometry(1, len, 3), m, c: ring ? '#5e8f3f' : '#4a7a35' }); } });
  } else if(k === 'paloverde'){ p.add('taper', '#a3a25a', 0, 1.3, 0, .16, 2.6, .16); [[0, 3.6, 0, 1.7], [1.1, 3.3, .5, 1.2], [-1, 3.4, -.4, 1.3]].forEach(([x, y, z, r]) => p.ico(r, '#b8c46c', x, y, z, 1, .75, 1)); }
  else if(k === 'mesquite'){ p.add('taper', '#5b4636', 0, 1.4, 0, .22, 2.8, .22); [[0, 3.8, 0, 2.3], [1.6, 3.4, .6, 1.6], [-1.5, 3.5, -.5, 1.7]].forEach(([x, y, z, r]) => p.ico(r, '#6d8a4d', x, y, z, 1, .65, 1)); }
  else if(k === 'saguaro'){ p.cyl(.36, 5.6, '#5f7f55', 0, 0, 0); p.sph(.36, '#5f7f55', 0, 5.6, 0); [[.95, 2.2, 1.9], [-.9, 2.9, 1.4]].forEach(([x, y, h]) => { p.add('cyl', '#5f7f55', x / 2, y + .1, 0, Math.abs(x) / 2 + .1, .3, .3, 0, 0, 1.5708); p.cyl(.26, h, '#5f7f55', x, y - .1, 0); p.sph(.26, '#5f7f55', x, y - .1 + h, 0); }); }
  else if(k === 'agave'){ for(let i = 0; i < 9; i++){ const m = new M4().makeRotationY(i * 6.283 / 9).multiply(new M4().makeRotationZ(-.7)).multiply(new M4().makeScale(.14, 1, .06)).multiply(new M4().makeTranslation(0, .55, 0)); p.list.push({ g: new T.ConeGeometry(1, 1.1, 4), m, c: '#7fa59a' }); } }
  else if(k === 'barrel'){ p.sph(.42, '#6f9a52', 0, .4, 0, 1, 1.1, 1); p.sph(.15, '#e0c24a', 0, .85, 0, 1, .5, 1); }
  else if(k === 'ocotillo'){ for(let i = 0; i < 8; i++){ const m = new M4().makeRotationY(i * 2.4).multiply(new M4().makeRotationZ(-.16 - (i % 3) * .1)).multiply(new M4().makeScale(.07, 1, .07)).multiply(new M4().makeTranslation(0, 1.7, 0)); p.list.push({ g: new T.ConeGeometry(1, 3.4, 4), m, c: i % 2 ? '#8a7a4a' : '#7d8b55' }); } }
  else if(k === 'shrub'){ p.ico(.6, '#8aa06a', 0, .45, 0, 1, .8, 1); p.ico(.4, '#9bb07a', .45, .35, .2, 1, .8, 1); }
  else { const g = new T.IcosahedronGeometry(1, 1), a = g.attributes.position; for(let i = 0; i < a.count; i++){ const f = 1 + .18 * Math.sin(a.getX(i) * 7.1 + a.getY(i) * 3.3 + a.getZ(i) * 5.7); a.setXYZ(i, a.getX(i) * f, a.getY(i) * f, a.getZ(i) * f); } g.computeVertexNormals(); p.list.push({ g, m: new M4().makeTranslation(0, .35, 0), c: '#a49680' }); }
  return lsMerge(T, p.list);
}
function buildLandscape(T, scene, info){
  const st = landSt(info.apn); if(!st.on) return null;
  const plan = landscapePlan(info), gh = info.gh, R = info.R, V = T.Vector3, P3 = (x, y, h) => new V(x, h, -y), grp = {};
  const G = n => { const g = new T.Group(); g.name = n; scene.add(g); return g; }, base = G('base'), dg = G('dg'), poolG = G('pool'), palmG = G('palms'), lawnG = G('lawn'), furnG = G('furn');
  const vmat = () => new T.MeshStandardMaterial({ vertexColors: true, roughness: .95 }), put = (parent, geo, mat) => { const m = new T.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  // decomposed-granite layer over the whole slab; slope colors stay visible beneath it unless "Show slope" is on
  if(info.top){ const g = info.top.geometry.clone(); g.deleteAttribute('color'); g.translate(0, .04, 0); const m = new T.Mesh(g, new T.MeshStandardMaterial({ color: '#c9b48a', roughness: 1, transparent: true, opacity: .84 })); m.receiveShadow = true; dg.add(m); }
  // draped strip (driveway, pad, walkway, lawn): follows the terrain
  const strip = (A, B, w, color, lift, parent) => {
    const len = Math.hypot(B[0] - A[0], B[1] - A[1]); if(len < .1) return; const nu = Math.max(1, Math.ceil(len / 1.2)), nv = Math.max(1, Math.ceil(w / 1.2)), dx = (B[0] - A[0]) / len, dy = (B[1] - A[1]) / len, pos = [], idx = [];
    for(let i = 0; i <= nu; i++) for(let j = 0; j <= nv; j++){ const t = i / nu, s = (j / nv - .5) * w, x = A[0] + (B[0] - A[0]) * t - dy * s, y = A[1] + (B[1] - A[1]) * t + dx * s; pos.push(x, gh(x, y) + lift, -y); }
    for(let i = 0; i < nu; i++) for(let j = 0; j < nv; j++){ const a = i * (nv + 1) + j, b = a + 1, c = a + nv + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    if(g.attributes.normal.getY(0) < 0){ g.setIndex(idx.map((v, i) => idx[i % 3 ? (i % 3 === 1 ? i + 1 : i - 1) : i])); g.computeVertexNormals(); }
    const m = new T.Mesh(g, new T.MeshStandardMaterial({ color, roughness: .9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); m.receiveShadow = true; parent.add(m);
  };
  const stripIn = (A, B, w, c, lift, parent) => { const len = Math.hypot(B[0] - A[0], B[1] - A[1]), n = Math.max(1, Math.ceil(len / 2.4)); for(let i = 0; i < n; i++){ const a = [A[0] + (B[0] - A[0]) * i / n, A[1] + (B[1] - A[1]) * i / n], b = [A[0] + (B[0] - A[0]) * (i + 1) / n, A[1] + (B[1] - A[1]) * (i + 1) / n]; if(lsInPoly(R, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) strip(a, b, w, c, lift, parent); } };
  if(plan.pad) stripIn(plan.pad.A, plan.pad.B, plan.pad.w, '#c2b196', .1, base);
  if(plan.drive) stripIn(plan.drive.A, plan.drive.B, plan.drive.w, '#b3a387', .1, base);
  plan.walks.forEach(w => stripIn(w[0], w[1], 1.3, '#cdbd9f', .11, base));
  if(plan.lawn){ const l = plan.lawn, A = LS_W(l.h, l.u0, (l.v0 + l.v1) / 2), B = LS_W(l.h, l.u1, (l.v0 + l.v1) / 2); strip(A, B, l.v1 - l.v0, '#7fa35b', .1, lawnG); }
  // house-frame builders: hard surfaces sit on a level slab with a skirt so nothing floats on a slope
  const Mh = h => { const m = new T.Matrix4(); m.makeBasis(new V(h.xa[0], 0, -h.xa[1]), new V(0, 1, 0), new V(h.za[0], 0, -h.za[1])); m.setPosition(h.c[0], 0, -h.c[1]); return m; };
  const gRange = (h, u0, u1, v0, v1) => { let lo = 1e9, hi = -1e9; for(const u of [u0, (u0 + u1) / 2, u1]) for(const v of [v0, (v0 + v1) / 2, v1]){ const q = LS_W(h, u, v), z = gh(q[0], q[1]); lo = Math.min(lo, z); hi = Math.max(hi, z); } return [lo, hi]; };
  const slab = (p, h, u0, u1, v0, v1, level, lo, c) => p.box(u1 - u0, level - lo + .3, v1 - v0, c, (u0 + u1) / 2, lo - .3, (v0 + v1) / 2);
  const keep = (parts, parent) => { if(parts.list.length) put(parent, lsMerge(T, parts.list), vmat()); };
  plan.patios.forEach(pt => {
    const h = pt.h, M = Mh(h), B = lsParts(T, M), F = lsParts(T, M), [lo, hi] = gRange(h, pt.u0, pt.u1, pt.v0, pt.v1), Lv = Math.max(hi, info.houses.find(q => q === h).top0) + .04, uc = pt.cx, pw = pt.u1 - pt.u0;
    slab(B, h, pt.u0, pt.u1, pt.v0, pt.v1, Lv, Math.min(lo, Lv - .4), '#d8cdb8');
    const uL = uc - pw / 4, uR = uc + pw / 4, vP1 = pt.v1 - .5, vP0 = vP1 - 4.6;   // pergola over the dining half
    [[-2.6, vP0], [2.6, vP0], [-2.6, vP1], [2.6, vP1]].forEach(([du, v]) => B.box(.22, 2.7, .22, '#5b3a29', uL + du, Lv, v)); B.box(6, .16, 4.9, '#b57555', uL, Lv + 2.7, (vP0 + vP1) / 2); for(let i = -2; i <= 2; i++) B.box(.14, .2, 5.1, '#5b3a29', uL + i * 1.2, Lv + 2.62, (vP0 + vP1) / 2 - .0);
    const wv = pt.v0 + .15; [[pt.u0, uc - 1.4], [uc + 1.4, pt.u1]].forEach(([a, b]) => B.box(b - a, .55, .3, '#efe6d3', (a + b) / 2, Lv, wv)); [pt.u0 + .15, pt.u1 - .15].forEach(u => B.box(.3, .55, 2.4, '#efe6d3', u, Lv, pt.v0 + 1.35));
    [[pt.u0 + .8, pt.v1 - .8], [pt.u1 - .8, pt.v1 - .8], [uc + 2.2, pt.v0 + 1.2]].forEach(([u, v]) => { B.cyl(.42, .55, '#b57555', u, Lv, v); B.ico(.5, '#7b9a5a', u, Lv + .95, v, 1, .8, 1); });
    const vm = (vP0 + vP1) / 2; F.box(1, .06, 2.2, '#7a5a40', uL, Lv + .72, vm); F.box(.1, .72, .1, '#5b3a29', uL, Lv, vm);   // dining table + 6 chairs
    [[-.9, -.6], [-.9, .6], [.9, -.6], [.9, .6], [0, 1.45], [0, -1.45]].forEach(([dv, du], i) => { const cu = i < 4 ? uL + (du < 0 ? -.85 : .85) : uL, cv = i < 4 ? vm + dv * .55 : vm + (dv > 0 ? 1.45 : -1.45); F.box(.45, .06, .45, '#e8dfcc', cu, Lv + .45, cv); F.box(.06, .4, .06, '#5b3a29', cu, Lv, cv); });
    F.cyl(.55, .4, '#58544c', uR, Lv, vm); F.cone(.3, .35, '#e8873a', uR, Lv + .4, vm);   // fire pit + two sofas
    [[-1.9, 0, 0], [1.9, 0, 0]].forEach(([du]) => { F.box(.8, .45, 1.9, '#d9d0bd', uR + du, Lv, vm); F.box(.2, .45, 1.9, '#cfc5b0', uR + du + (du < 0 ? -.4 : .4), Lv + .45, vm); });
    keep(B, base); keep(F, furnG);
  });
  if(plan.pool){
    const pl = plan.pool, h = pl.h, M = Mh(h), B = lsParts(T, M), F = lsParts(T, M), [lo, hi] = gRange(h, pl.u - pl.hu, pl.u + pl.hu, pl.v - pl.hv, pl.v + pl.hv), Lv = hi + .04, u = pl.u, v = pl.v;
    slab(B, h, u - pl.hu, u + pl.hu, v - pl.hv, v + pl.hv, Lv, Math.min(lo, Lv - .3), '#dcd2bd');
    B.box(pl.L + .7, .02, pl.W + .7, '#8fd0dc', u, Lv, v);   // tile floor under the water
    [[pl.L + .7, .35, 0, pl.W / 2 + .175], [pl.L + .7, .35, 0, -pl.W / 2 - .175]].forEach(([a, b, du, dv]) => B.box(a, .3, .35, '#f1ebdc', u + du, Lv, v + dv)); [-1, 1].forEach(sg => B.box(.35, .3, pl.W, '#f1ebdc', u + sg * (pl.L / 2 + .175), Lv, v));
    for(let i = -1; i <= 1; i++){ const cv = v + (pl.W / 2 + 1.3), cu = u + i * 2.4; F.box(.7, .12, 1.9, '#f3efe4', cu, Lv + .3, cv); F.box(.7, .5, .12, '#f3efe4', cu, Lv + .3, cv + .95, 0); }   // loungers
    const tu = u - pl.L / 2 - 1.6; F.cyl(.45, .7, '#e8dcc6', tu, Lv, v + .6); F.cyl(.04, 2.4, '#8a8a8a', tu, Lv, v + .6); F.cone(1.5, .5, '#1f3a5f', tu, Lv + 2.15, v + .6);   // table + umbrella
    keep(B, poolG); keep(F, poolG);
    const wm = new T.Mesh(new T.BoxGeometry(pl.L, .02, pl.W), new T.MeshStandardMaterial({ color: '#2f9bc4', transparent: true, opacity: .6, roughness: .15 })); wm.position.set(u, Lv + .22, v);
    const wg = new T.Group(); wg.matrixAutoUpdate = false; wg.matrix.copy(Mh(h)); wg.add(wm); poolG.add(wg);
  }
  // instanced planting (one InstancedMesh per kind)
  const mat = vmat(), dm = new T.Object3D(), by = {}; plan.items.forEach(o => (by[o.k] = by[o.k] || []).push(o));
  Object.keys(by).forEach(k => { const a = by[k], im = new T.InstancedMesh(lsProto(T, k), mat, a.length); a.forEach((o, i) => { dm.position.set(o.x, gh(o.x, o.y) - .06, -o.y); dm.rotation.set(0, o.ry, 0); dm.scale.set(o.s, o.sy, o.s); dm.updateMatrix(); im.setMatrixAt(i, dm.matrix); }); im.castShadow = im.receiveShadow = true; im.frustumCulled = false; (k === 'palm' ? palmG : base).add(im); });
  // path lights + drip lines
  if(plan.lights.length){ const pm = new T.InstancedMesh(new T.CylinderGeometry(.04, .04, .6, 5), new T.MeshStandardMaterial({ color: '#2a2d32' }), plan.lights.length), bm = new T.InstancedMesh(new T.SphereGeometry(.11, 8, 6), new T.MeshBasicMaterial({ color: '#ffd88a' }), plan.lights.length);
    plan.lights.forEach(([x, y], i) => { const z = gh(x, y); dm.rotation.set(0, 0, 0); dm.scale.set(1, 1, 1); dm.position.set(x, z + .3, -y); dm.updateMatrix(); pm.setMatrixAt(i, dm.matrix); dm.position.set(x, z + .66, -y); dm.updateMatrix(); bm.setMatrixAt(i, dm.matrix); }); pm.frustumCulled = bm.frustumCulled = false; base.add(pm, bm); }
  if(plan.drip.length){ const pp = []; plan.drip.forEach(([a, b]) => { const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2.5)); for(let i = 0; i < n; i++){ [i, i + 1].forEach(j => { const x = a[0] + (b[0] - a[0]) * j / n, y = a[1] + (b[1] - a[1]) * j / n; pp.push(x, gh(x, y) + .1, -y); }); } }); const lg = new T.BufferGeometry(); lg.setAttribute('position', new T.Float32BufferAttribute(pp, 3)); base.add(new T.LineSegments(lg, new T.LineBasicMaterial({ color: '#2b2b2b' }))); }
  const groups = { pool: poolG, palms: palmG, lawn: lawnG, furn: furnG }, apply = () => { Object.keys(groups).forEach(k => { groups[k].visible = !!st[k]; }); dg.visible = !st.slope; };
  apply();
  const note = plan.poolNote || '';
  if(typeof document !== 'undefined') document.querySelectorAll('[data-landpn]').forEach(e => { if(e.dataset.landpn === String(info.apn)) e.textContent = note; });
  st.obj = { plan, set: apply };
  return st.obj;
}
