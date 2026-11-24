// Premium procedural Spanish houses for the 3D site viewer (phx-land-leads.html). Classic script, no assets: every texture is drawn on a small canvas.
// Globals: buildHouseV2(T, style 'A'|'B'|'C', hd{st,w,d,h,area}) -> Group, houseMaterials(T), applyStudioLook(T, renderer, scene), tuneStudioLights(sun, hemi, sr).
// House local frame (same contract as the old buildHouse / landscape.js): origin = footprint centre on the ground, +x along the front edge, garage wing on the +x side, +z toward the road.
// Geometry is merged per material (about 14 draw calls per house). Wall openings are real holes in extruded wall slabs, so windows and doors have true reveals.
const HV2 = { tex: new WeakMap(), mats: null, env: null };
const hvRng = s => { let a = s >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const hvCv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const hvT = (T, c, srgb) => { const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; if(srgb !== false) t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t; };

function hvTextures(T){
  let k = HV2.tex.get(T); if(k) return k;
  const wrap = f => { for(const dx of [-256, 0, 256]) for(const dy of [-256, 0, 256]) f(dx, dy); };
  // stucco (2.4 m repeat): warm cream, soft blotches, vertical weathering streaks, sand speckle; the bump map is fine grain
  let r = hvRng(7), c = hvCv(256, 256), x = c.getContext('2d'); x.fillStyle = '#f5e9d0'; x.fillRect(0, 0, 256, 256);
  for(let i = 0; i < 30; i++){ const px = r() * 256, py = r() * 256, rad = 24 + r() * 56, col = r() < .5 ? 'rgba(214,180,130,.035)' : 'rgba(255,253,244,.08)'; wrap((dx, dy) => { const g = x.createRadialGradient(px + dx, py + dy, 0, px + dx, py + dy, rad); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(px + dx - rad, py + dy - rad, rad * 2, rad * 2); }); }
  for(let i = 0; i < 70; i++){ x.fillStyle = `rgba(120,92,62,${.02 + r() * .03})`; const px = r() * 256, h = 50 + r() * 150; x.fillRect(px, 0, 1 + r() * 2.5, h); }
  for(let i = 0; i < 3500; i++){ x.fillStyle = r() < .5 ? 'rgba(120,95,65,.07)' : 'rgba(255,255,255,.12)'; x.fillRect(r() * 256, r() * 256, 1, 1); }
  const sMap = hvT(T, c); c = hvCv(256, 256); x = c.getContext('2d'); x.fillStyle = '#808080'; x.fillRect(0, 0, 256, 256);
  for(let i = 0; i < 11000; i++){ const v = 80 + r() * 100 | 0; x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2); }
  const sBump = hvT(T, c, false);
  // clay barrel tile (1 m repeat): 4 pan/cover pairs wide, 3 rows, per-tile colour, shaded barrels, overlap shadow at each row
  r = hvRng(11); c = hvCv(256, 256); x = c.getContext('2d'); const pal = ['#b4583a', '#c46a46', '#a64c32', '#bd6444', '#9c4733', '#cf7b53', '#b9603f'];
  for(let j = 0; j < 3; j++) for(let i = 0; i < 4; i++){
    const x0 = i * 64, y0 = j * 85.34; x.fillStyle = pal[r() * pal.length | 0]; x.fillRect(x0, y0, 64, 85.34);
    if(r() < .07){ x.fillStyle = 'rgba(40,20,15,.35)'; x.fillRect(x0, y0, 64, 85.34); } else if(r() < .1){ x.fillStyle = 'rgba(235,150,100,.25)'; x.fillRect(x0, y0, 64, 85.34); }
    const g = x.createLinearGradient(x0, 0, x0 + 64, 0); [[0, .32], [.16, 0], [.28, -.2], [.46, .42], [.52, .5], [.7, .05], [.85, -.15], [1, .32]].forEach(([p, v]) => g.addColorStop(p, v >= 0 ? `rgba(30,12,8,${v})` : `rgba(255,214,170,${-v})`)); x.fillStyle = g; x.fillRect(x0, y0, 64, 85.34);
    const v = x.createLinearGradient(0, y0, 0, y0 + 85.34); v.addColorStop(0, 'rgba(25,8,5,.5)'); v.addColorStop(.3, 'rgba(25,8,5,0)'); v.addColorStop(.86, 'rgba(255,215,170,.18)'); v.addColorStop(1, 'rgba(20,6,4,.55)'); x.fillStyle = v; x.fillRect(x0, y0, 64, 85.34);
  }
  for(let i = 0; i < 1400; i++){ x.fillStyle = r() < .5 ? 'rgba(255,230,200,.10)' : 'rgba(40,20,10,.10)'; x.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1); }
  const tile = hvT(T, c);
  // wood grain (1 m repeat), grey so the material colour tints it
  r = hvRng(3); c = hvCv(128, 128); x = c.getContext('2d'); x.fillStyle = '#d9d2c8'; x.fillRect(0, 0, 128, 128);
  for(let i = 0; i < 160; i++){ x.strokeStyle = `rgba(70,45,25,${.05 + r() * .13})`; x.lineWidth = .6 + r() * 1.6; const px = r() * 128; x.beginPath(); x.moveTo(px, 0); x.bezierCurveTo(px + r() * 8 - 4, 40, px + r() * 8 - 4, 90, px + r() * 6 - 3, 128); x.stroke(); }
  for(let i = 0; i < 3; i++){ x.fillStyle = 'rgba(60,35,18,.22)'; x.beginPath(); x.ellipse(r() * 128, r() * 128, 2 + r() * 2, 5 + r() * 4, 0, 0, 7); x.fill(); }
  const wood = hvT(T, c);
  // irregular flagstone / paver (2 m repeat) in running-bond courses
  r = hvRng(19); c = hvCv(256, 256); x = c.getContext('2d'); x.fillStyle = '#8c7e66'; x.fillRect(0, 0, 256, 256); const sp = ['#d8c8a8', '#cbb894', '#dccfb4', '#c2ae8c', '#d2c19f'];
  for(let yy = 0, j = 0; yy < 256; j++){ const hh = j % 2 ? 52 : 44; for(let xx = -(r() * 40); xx < 256; ){ const ww = 40 + r() * 38; x.fillStyle = sp[r() * sp.length | 0]; x.fillRect(xx + 2, yy + 2, ww - 4, hh - 4); xx += ww; } yy += hh; if(yy > 250) break; }
  for(let i = 0; i < 2200; i++){ x.fillStyle = r() < .5 ? 'rgba(90,70,45,.08)' : 'rgba(255,255,255,.1)'; x.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1); }
  const stone = hvT(T, c); k = { sMap, sBump, tile, wood, stone }; HV2.tex.set(T, k); return k;
}

function houseMaterials(T){
  if(HV2.mats && HV2.mats.T === T) return HV2.mats;
  const t = hvTextures(T), env = HV2.env, S = (o, box, ei) => { const m = new T.MeshStandardMaterial(o); if(box) m.userData.box = box; if(env){ m.envMap = env; m.envMapIntensity = ei == null ? .35 : ei; } return m; };
  const st = { map: t.sMap, bumpMap: t.sBump, bumpScale: .7, roughness: .95, metalness: 0 };
  const m = { T,
    stucco: S({ ...st, color: '#f7efdf' }, 2.4), trim: S({ ...st, color: '#fffaf0' }, 2.4), plinth: S({ ...st, color: '#d9c7a4' }, 2.4),
    roof: S({ map: t.tile, bumpMap: t.tile, bumpScale: 2.2, roughness: .8, side: T.DoubleSide }), clay: S({ color: '#b25a3a', roughness: .75 }),
    wood: S({ map: t.wood, color: '#b27a44', roughness: .6 }, 1), beam: S({ map: t.wood, color: '#5b3b27', roughness: .7 }, 1),
    glass: S({ color: '#1f3852', roughness: .05, metalness: .25 }, 0, 2.2), iron: S({ color: '#202327', roughness: .5, metalness: .7 }, 0, .6),
    stone: S({ map: t.stone, bumpMap: t.stone, bumpScale: 1.5, color: '#ffffff', roughness: .92 }, 2), paver: S({ map: t.stone, bumpMap: t.stone, bumpScale: 1.5, color: '#efe6d6', roughness: .95 }, 2),
    leaf: S({ color: '#69875a', roughness: .8 }), lamp: new T.MeshStandardMaterial({ color: '#ffe2a0', emissive: '#ffb347', emissiveIntensity: 1.8 }) };
  return HV2.mats = m;
}

// ---- geometry collector: boxes / extrusions / bars with a transform stack, merged into one mesh per material ----
function hvBuilder(T, mats){
  const buckets = {}, st = [new T.Matrix4()], m = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), p = new T.Vector3(), one = new T.Vector3(1, 1, 1), up = new T.Vector3(0, 1, 0);
  const B = {
    push(x, y, z, ry){ m.compose(p.set(x, y, z), q.setFromEuler(e.set(0, ry || 0, 0)), one); st.push(st[st.length - 1].clone().multiply(m)); }, pop(){ st.pop(); },
    add(key, geo, x, y, z, ry, rx){
      const g = geo.index ? geo.toNonIndexed() : geo; if(g !== geo) geo.dispose();
      m.compose(p.set(x || 0, y || 0, z || 0), q.setFromEuler(e.set(rx || 0, ry || 0, 0, 'YXZ')), one); g.applyMatrix4(st[st.length - 1].clone().multiply(m));
      (buckets[key] || (buckets[key] = [])).push(g);
    },
    box(key, w, h, d, x, y, z, ry){ const g = new T.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); B.add(key, g, x, y, z, ry); },
    cyl(key, rt, rb, h, seg, x, y, z, rx, ry){ const g = new T.CylinderGeometry(rt, rb, h, seg); g.translate(0, h / 2, 0); B.add(key, g, x, y, z, ry, rx); },
    shape(key, s, depth, x, y, z, ry){ B.add(key, new T.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 8 }), x, y, z, ry); },
    bar(key, a, b, r, seg){ const dv = new T.Vector3().subVectors(b, a), len = dv.length(); if(len < 1e-5) return; const g = new T.CylinderGeometry(r, r, len, seg || 6); g.applyMatrix4(new T.Matrix4().compose(a.clone().add(b).multiplyScalar(.5), new T.Quaternion().setFromUnitVectors(up, dv.normalize()), one)); B.add(key, g); },
    finish(){
      const grp = new T.Group();
      for(const key in buckets){
        const gs = buckets[key], n = gs.reduce((t, g) => t + g.attributes.position.count, 0), pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
        gs.forEach(g => { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); if(g.attributes.uv) uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; g.dispose(); });
        const sz = mats[key].userData.box; if(sz) for(let i = 0; i < n; i++){ const ax = Math.abs(nor[i * 3]), ay = Math.abs(nor[i * 3 + 1]), az = Math.abs(nor[i * 3 + 2]), X = pos[i * 3] / sz, Y = pos[i * 3 + 1] / sz, Z = pos[i * 3 + 2] / sz; if(ay >= ax && ay >= az){ uv[i * 2] = X; uv[i * 2 + 1] = Z; } else if(ax >= az){ uv[i * 2] = Z; uv[i * 2 + 1] = Y; } else { uv[i * 2] = X; uv[i * 2 + 1] = Y; } }
        const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.BufferAttribute(nor, 3)); geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
        const mesh = new T.Mesh(geo, mats[key]); mesh.name = 'hv-' + key; grp.add(mesh);
      }
      return grp;
    } };
  return B;
}

// ---- parts (all take the builder B; wall-local frame: x along the wall, y up, z out of the wall, front face at z = 0) ----
const hvPts = (T, cx, y0, w, h, arch, n = 10) => { const r = w / 2, P = [new T.Vector2(cx - r, y0), new T.Vector2(cx + r, y0)]; if(arch && h > r + .05){ P.push(new T.Vector2(cx + r, y0 + h - r)); for(let i = 1; i < n; i++){ const a = Math.PI * i / n; P.push(new T.Vector2(cx + r * Math.cos(a), y0 + h - r + r * Math.sin(a))); } P.push(new T.Vector2(cx - r, y0 + h - r)); } else P.push(new T.Vector2(cx + r, y0 + h), new T.Vector2(cx - r, y0 + h)); return P; };
function hvOpening(T, B, o){   // window / door / garage door assembled inside its hole
  const { x, y, w, h } = o, arch = !o.flat, f = .07, s = o.sur == null ? .13 : o.sur, P = (ww, hh, cx, yy) => hvPts(T, cx == null ? x : cx, yy == null ? y : yy, ww, hh, arch);
  if(s > 0){ const ring = new T.Shape(hvPts(T, x, y - .02, w + 2 * s, h + s + .02, arch)); ring.holes.push(new T.Path(P(w, h))); B.shape('trim', ring, .05, 0, 0, 0); }
  if(o.garage){   // timber panel door under a beam header
    B.box('wood', w - .1, h - .08, .06, x, y + .04, -.2); for(let i = 1; i < 4; i++) B.box('beam', w - .1, .035, .08, x, y + .04 + (h - .08) * i / 4, -.17); B.box('beam', .05, h - .08, .08, x, y + .04, -.17); B.box('beam', w + .5, .22, .22, x, y + h, -.03);
    for(let i = 0; i < 2; i++) B.box('iron', .1, .02, .02, x + (i ? .3 : -.3), y + h * .55, -.14); return;
  }
  const ring2 = new T.Shape(P(w, h)); ring2.holes.push(new T.Path(P(w - 2 * f, h - 2 * f, x, y + f))); B.shape('wood', ring2, .06, 0, 0, -.2);
  if(o.door){
    B.shape('wood', new T.Shape(P(w - 2 * f, h - 2 * f, x, y + f)), .05, 0, 0, -.2);
    if(o.lites){ const g = new T.Shape(hvPts(T, x, y + h * .36, w - .5, h * .6, arch, 8)); B.shape('glass', g, .01, 0, 0, -.13); B.box('wood', .07, h - 2 * f, .09, x, y + f, -.15); for(let i = 0; i < 3; i++) B.box('wood', w - .45, .045, .08, x, y + h * (.4 + i * .17), -.15);
      for(let sx = -1; sx <= 1; sx += 2) B.box('wood', (w - .5) / 2 - .12, h * .26, .035, x + sx * (w - .5) / 4, y + .14, -.15); }
    else { B.box('beam', .06, h - .4, .09, x, y + f, -.15); for(let i = 0; i < 4; i++) for(let sx = -1; sx <= 1; sx += 2) B.box('iron', .06, .06, .03, x + sx * (w * .22), y + .5 + i * .45, -.13); B.box('iron', .5, .05, .03, x - w * .25, y + h * .45, -.13); B.box('iron', .5, .05, .03, x + w * .25, y + h * .45, -.13); }
    return;
  }
  B.shape('glass', new T.Shape(P(w - 2 * f + .02, h - 2 * f + .02, x, y + f - .01)), .01, 0, 0, -.17);
  B.box('wood', .04, h - 2 * f, .08, x, y + f, -.17); B.box('wood', w - 2 * f, .04, .08, x, y + h * .52, -.17); if(arch && h > 1.8) B.box('wood', w - 2 * f, .035, .08, x, y + h * .3, -.17);
  B.box('stone', w + .3, .08, .26, x, y - .07, .13);
  if(o.grille){ const gh = Math.min(h * .72, h - w / 2 + .2); B.box('iron', w - .1, .03, .035, x, y + .12, -.04); B.box('iron', w - .1, .03, .035, x, y + gh * .55, -.04); B.box('iron', w - .1, .03, .035, x, y + gh, -.04); for(let i = 0; i <= 6; i++) B.box('iron', .022, gh - .1, .022, x - (w - .2) / 2 + i * (w - .2) / 6, y + .12, -.04); }
}
function hvWall(T, B, key, W, H, holes, t){   // wall slab with real openings, front face z = 0, extends back t
  const s = new T.Shape([[-W / 2, 0], [W / 2, 0], [W / 2, H], [-W / 2, H]].map(v => new T.Vector2(v[0], v[1])));
  holes.forEach(o => { if(!o.noHole) s.holes.push(new T.Path(hvPts(T, o.x, o.y, o.w, o.h, !o.flat))); });
  B.shape(key, s, t, 0, 0, -t); holes.forEach(o => { if(!o.open) hvOpening(T, B, o); });
}
function hvBlock(T, B, x0, x1, z0, z1, y0, y1, F, key){   // solid stucco core + a wall slab (with openings) on every face present in F
  const t = .3, H = y1 - y0; let a0 = x0, a1 = x1, b0 = z0, b1 = z1; key = key || 'stucco';
  if(F.l) a0 += t; if(F.r) a1 -= t; if(F.f) b1 -= t; if(F.b) b0 += t;
  B.box(key, a1 - a0, H, b1 - b0, (a0 + a1) / 2, y0, (b0 + b1) / 2);
  if(F.f){ B.push((x0 + x1) / 2, y0, z1, 0); hvWall(T, B, key, x1 - x0, H, F.f, t); B.pop(); }
  if(F.b){ B.push((x0 + x1) / 2, y0, z0, Math.PI); hvWall(T, B, key, x1 - x0, H, F.b, t); B.pop(); }
  if(F.l){ B.push(x0, y0, (b0 + b1) / 2, -Math.PI / 2); hvWall(T, B, key, b1 - b0, H, F.l, t); B.pop(); }
  if(F.r){ B.push(x1, y0, (b0 + b1) / 2, Math.PI / 2); hvWall(T, B, key, b1 - b0, H, F.r, t); B.pop(); }
}
function hvPlinth(B, x0, x1, z0, z1, noFront){ const h = .45, o = .05; B.box('plinth', x1 - x0 + 2 * o, h, .3, (x0 + x1) / 2, 0, z0 - o + .05); if(!noFront) B.box('plinth', x1 - x0 + 2 * o, h, .3, (x0 + x1) / 2, 0, z1 + o - .05); B.box('plinth', .3, h, z1 - z0, x0 - o + .05, 0, (z0 + z1) / 2); B.box('plinth', .3, h, z1 - z0, x1 + o - .05, 0, (z0 + z1) / 2); }
function hvCornice(B, x0, x1, z0, z1, y){   // stepped plaster cornice ring, top face at y
  [[.12, .22, .16], [.24, .1, .06]].forEach(([o, h, dy]) => { const W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, yy = y - h - dy;
    B.box('trim', W + 2 * o, h, .2 + o, cx, yy, z1 + o / 2 - .05); B.box('trim', W + 2 * o, h, .2 + o, cx, yy, z0 - o / 2 + .05); B.box('trim', .2 + o, h, D, x0 - o / 2 + .05, yy, cz); B.box('trim', .2 + o, h, D, x1 + o / 2 - .05, yy, cz); });
}
function hvRail(B, len, x, y, z, ry, h){   // wrought-iron rail along local +x from the origin, balusters every 13 cm, newel posts
  h = h || .95; B.push(x, y, z, ry); B.box('iron', len, .05, .07, len / 2, h - .05, 0); B.box('iron', len, .04, .05, len / 2, .08, 0);
  const n = Math.max(1, Math.ceil(len / .13)); for(let i = 0; i <= n; i++) B.box('iron', .02, h - .14, .02, len * i / n, .1, 0);
  const k = Math.max(1, Math.ceil(len / 2.4)); for(let i = 0; i <= k; i++){ B.box('iron', .07, h + .05, .07, len * i / k, 0, 0); B.box('iron', .1, .04, .1, len * i / k, h + .05, 0); }
  B.pop();
}
function hvHip(T, B, rw, rd, rh, x, y, z, ov){   // low-pitch tile hip roof over a wall footprint rw x rd, eaves at y, with fascia, soffit, rafter tails, ridge + hip caps
  if(rd > rw){ B.push(x, y, z, Math.PI / 2); hvHip(T, B, rd, rw, rh, 0, 0, 0, ov); B.pop(); return; }
  ov = ov == null ? .55 : ov; const a = rw / 2 + ov, b = rd / 2 + ov, rl = Math.max(0, a - b), ps = [], us = [], sl = Math.hypot(b, rh) / b;
  [[[-a, 0, b], [a, 0, b], [rl, rh, 0], [-rl, rh, 0]], [[a, 0, -b], [-a, 0, -b], [-rl, rh, 0], [rl, rh, 0]], [[a, 0, b], [a, 0, -b], [rl, rh, 0]], [[-a, 0, -b], [-a, 0, b], [-rl, rh, 0]]].forEach((f, k) => {
    const uvf = pt => k < 2 ? [pt[0], Math.hypot((k ? -b : b) - pt[2], pt[1])] : [pt[2] * (k === 2 ? -1 : 1), Math.hypot((k === 2 ? a : -a) - pt[0], pt[1])];
    (f.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2]).forEach(i => { ps.push(...f[i]); us.push(...uvf(f[i])); }); });
  const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(ps, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(us, 2)); geo.computeVertexNormals(); B.add('roof', geo, x, y, z);
  B.push(x, y, z, 0);
  B.box('beam', 2 * a + .06, .2, .07, 0, -.12, b + .01); B.box('beam', 2 * a + .06, .2, .07, 0, -.12, -b - .01); B.box('beam', .07, .2, 2 * b, a + .01, -.12, 0); B.box('beam', .07, .2, 2 * b, -a - .01, -.12, 0); B.box('beam', 2 * a, .03, 2 * b, 0, -.1, 0);
  for(let i = -Math.floor(a / .6); i <= Math.floor(a / .6); i++){ B.box('beam', .09, .11, ov - .02, i * .6, -.23, b - ov / 2); B.box('beam', .09, .11, ov - .02, i * .6, -.23, -b + ov / 2); }
  for(let i = -Math.floor(b / .6); i <= Math.floor(b / .6); i++){ B.box('beam', ov - .02, .11, .09, a - ov / 2, -.23, i * .6); B.box('beam', ov - .02, .11, .09, -a + ov / 2, -.23, i * .6); }
  const V = (p, q, r2) => B.bar('clay', new T.Vector3(...p), new T.Vector3(...q), r2, 6); V([-rl - .1, rh + .03, 0], [rl + .1, rh + .03, 0], .11);
  [[-a, -b], [a, -b], [-a, b], [a, b]].forEach(([cx, cz]) => V([cx, .03, cz], [Math.sign(cx) * rl, rh + .03, 0], .09)); B.pop();
}
function hvShed(T, B, xa, xb, za, ya, zb, yb){   // lean-to tile roof sloping from (za, ya) down to (zb, yb), with fascia
  const L = Math.hypot(zb - za, ya - yb), g = new T.BufferGeometry(), P = [[xa, ya, za], [xb, ya, za], [xb, yb, zb], [xa, yb, zb]], U = [[xa, 0], [xb, 0], [xb, L], [xa, L]];
  g.setAttribute('position', new T.Float32BufferAttribute([0, 1, 2, 0, 2, 3].flatMap(i => P[i]), 3)); g.setAttribute('uv', new T.Float32BufferAttribute([0, 1, 2, 0, 2, 3].flatMap(i => U[i]), 2)); g.computeVertexNormals(); B.add('roof', g);
  B.box('beam', xb - xa + .1, .2, .08, (xa + xb) / 2, yb - .17, zb); B.box('beam', .08, .2, Math.abs(zb - za), xa, Math.min(ya, yb) - .1, (za + zb) / 2); B.box('beam', .08, .2, Math.abs(zb - za), xb, Math.min(ya, yb) - .1, (za + zb) / 2);
  B.bar('clay', new T.Vector3(xa - .05, ya + .02, za + .02), new T.Vector3(xb + .05, ya + .02, za + .02), .08, 6);
}
const hvPot = (T, B, x, z, y) => {
  y = y || 0; const pts = [[0, 0], [.17, 0], [.22, .05], [.3, .22], [.31, .42], [.27, .5], [.3, .53], [.3, .58], [.25, .58], [.23, .52], [0, .52]].map(v => new T.Vector2(v[0], v[1])); B.add('clay', new T.LatheGeometry(pts, 12), x, y, z);
  for(let k = 0; k < 9; k++){ const an = k * 2.4, a = new T.Vector3(x, y + .5, z), tp = a.clone().add(new T.Vector3(Math.cos(an) * .42, .5 + (k % 3) * .08, Math.sin(an) * .42)); B.bar('leaf', a, tp, .055, 4); }
};
const hvLantern = (T, B, x, y, z) => { B.box('iron', .1, .5, .05, x, y, z); B.box('iron', .2, .04, .22, x, y + .04, z + .12); B.box('lamp', .16, .28, .16, x, y + .08, z + .12); B.box('iron', .22, .04, .24, x, y + .36, z + .12); B.cyl('iron', 0, .13, .12, 4, x, y + .4, z + .12); };
function hvChimney(T, B, x, y, z, hgt){
  B.box('stucco', .95, hgt, .95, x, y, z); B.box('trim', 1.15, .12, 1.15, x, y + hgt - .5, z); B.box('trim', 1.25, .16, 1.25, x, y + hgt, z); B.box('iron', .7, .02, .7, x, y + hgt + .16, z);
  [-.2, .2].forEach(dx => B.cyl('clay', .13, .15, .5, 8, x + dx, y + hgt + .16, z));
}
const hvSteps = (B, x, z, w, top) => { for(let i = 0; i < 3; i++){ const hh = top * (3 - i) / 3; B.box('stone', w + i * .1, hh, .34, x, 0, z + .17 + i * .34); } };

// ---- Style A: cream stucco 2-story, wavy parapet over a curved barrel-tile roof, arched windows, balcony, curved stair, lantern ----
function hvA(T, B, hd){
  const { st, w, d } = hd, FH = 3.2, H = st * FH, gw = Math.min(w * .35, 65.03 / d), mw = w - gw, mx = -gw / 2, gx = w / 2 - gw / 2, fz = d / 2, gdw = Math.min(3.4, gw - .8);
  const n = 2 * Math.floor((mw - 3) / 6.5) + 1, mid = (n - 1) / 2, cols = Array.from({ length: n }, (_, i) => (i - mid) * (n > 1 ? (mw - 3.6) / (n - 1) : 0)), fr = [], bk = [], lf = [], rt = [];
  cols.forEach((lx, i) => { if(i === mid){ fr.push({ x: lx, y: .5, w: 2, h: 2.35, door: 1, lites: 1, sur: .16 }); if(st > 1) fr.push({ x: lx, y: FH + .05, w: 1.9, h: 2.8, door: 1, lites: 1, sur: .2 }); bk.push({ x: lx, y: .5, w: 2.2, h: 2.6, door: 1, lites: 1, sur: .15 }); if(st > 1) bk.push({ x: lx, y: FH + .5, w: 1.3, h: 2.3 }); }
    else { fr.push({ x: lx, y: .62, w: 1.3, h: 2.3 }); bk.push({ x: lx, y: .62, w: 1.3, h: 2.3 }); if(st > 1){ fr.push({ x: lx, y: FH + .6, w: 1.3, h: 2.2 }); bk.push({ x: lx, y: FH + .6, w: 1.3, h: 2.2 }); } } });
  [-1, 1].forEach(s => { lf.push({ x: s * d * .22, y: .62, w: 1.3, h: 2.3 }); if(st > 1) lf.push({ x: s * d * .22, y: FH + .6, w: 1.3, h: 2.2 }); }); if(st > 1) rt.push({ x: 0, y: FH + .6, w: 1.3, h: 2.2 });
  hvBlock(T, B, -w / 2, w / 2 - gw, -fz, fz, 0, H, { f: fr, b: bk, l: lf, r: st > 1 ? rt : null }); hvBlock(T, B, w / 2 - gw, w / 2, -fz, fz, 0, FH, { f: [{ x: 0, y: .04, w: gdw, h: 2.3, flat: 1, garage: 1, sur: .1 }], b: [{ x: 0, y: 1.2, w: 1, h: 1.2, flat: 1 }], r: [{ x: 0, y: 1.2, w: 1, h: 1.2, flat: 1 }] });
  hvPlinth(B, -w / 2, w / 2 - gw, -fz, fz); hvPlinth(B, w / 2 - gw, w / 2, -fz, fz, true);
  hvCornice(B, -w / 2, w / 2 - gw, -fz, fz, H); if(st > 1) B.box('trim', mw + .16, .16, d + .16, mx, FH - .1, 0);
  // barrel-tile vault between wavy stucco parapets
  const sag = 1, ch = mw + .5, Rv = (ch * ch / 4 + sag * sag) / (2 * sag), th = 2 * Math.asin(ch / 2 / Rv), vg = new T.CylinderGeometry(Rv, Rv, d + .6, 28, 1, true, -th / 2, th), uv = vg.attributes.uv;
  for(let i = 0; i < uv.count; i++){ const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v * (d + .6), u * Rv * th); }
  B.add('roof', vg, mx, H + sag - Rv, 0, 0, -Math.PI / 2);
  [fz - .3, -fz].forEach(zz => { const s = new T.Shape(); s.moveTo(-ch / 2, 0); for(let i = 0; i <= 40; i++){ const x = -ch / 2 + ch * i / 40, u = x / (ch / 2); s.lineTo(x, sag * (1 - u * u) + .45 + .22 * Math.cos(x * 2.2)); } s.lineTo(ch / 2, 0); B.shape('stucco', s, .3, mx, H, zz); });
  [-1, 1].forEach(sg => { B.box('stucco', .3, .5, d, mx + sg * (mw / 2 - .15), H, 0); B.box('trim', .38, .05, d + .04, mx + sg * (mw / 2 - .15), H + .5, 0); });
  B.box('stucco', gw + .1, .2, d + .1, gx, FH, 0); [[gw + .1, .4, .2, 0, fz], [gw + .1, .4, .2, 0, -fz], [.2, .4, d, gw / 2, 0], [.2, .4, d, -gw / 2, 0]].forEach(([bw, bh, bd, dx, z]) => { B.box('stucco', bw, bh, bd, gx + dx, FH + .2, z); B.box('trim', bw + .06, .05, bd + .06, gx + dx, FH + .6, z); });
  hvCornice(B, w / 2 - gw, w / 2, -fz, fz, FH);
  hvSteps(B, mx, fz, 2.9, .5);
  if(st > 1){   // balcony on corbels, iron rail, curved stair wrapping the corner
    B.box('stucco', mw, .22, 1.3, mx, FH - .22, fz + .65); B.box('trim', mw + .1, .06, 1.4, mx, FH, fz + .65); for(let i = 0; i < Math.ceil(mw / 2.4); i++) B.box('stucco', .24, .4, .9, mx - mw / 2 + .6 + i * (mw - 1.2) / Math.max(1, Math.ceil(mw / 2.4) - 1), FH - .62, fz + .45);
    hvRail(B, mw, mx - mw / 2, FH + .06, fz + 1.25, 0); hvRail(B, 1.2, mx + mw / 2, FH + .06, fz + 1.25, Math.PI / 2); hvRail(B, 1.2, mx - mw / 2, FH + .06, fz + 1.25, Math.PI / 2);
    const N = 18, r = 1.4, sw = Math.PI * .9, C = [mx - mw / 2 - r, fz + .65];
    for(let i = 0; i < N; i++){ const an = i / N * sw, hh = FH * (1 - i / N), X = C[0] + r * Math.cos(an), Z = C[1] - r * Math.sin(an); B.box('stucco', 1.1, Math.max(.05, hh - .06), r * sw / N * 1.25, X, 0, Z, an); B.box('wood', 1.14, .06, r * sw / N * 1.3, X, hh - .06, Z, an); }
  }
  hvLantern(T, B, mx + 1.9, 1.95 + .6, fz + .04); hvLantern(T, B, mx - 1.9, 1.95 + .6, fz + .04);
  hvPot(T, B, mx - 2.2, fz + .9, 0); hvPot(T, B, mx + 2.2, fz + .9, 0); hvPot(T, B, mx - mw / 2 + .8, fz + .5, 0);
  B.box('paver', gdw + .4, .05, 9, gx, 0, fz + 4.5);
  return H + 3;
}

// ---- Style B: villa, hip tile roofs at two levels, chimney, arched French doors, roof terrace with iron rail, timber pergola porch ----
function hvB(T, B, hd){
  const { st, w, d } = hd, FH = 3.2, gw = Math.min(w * .35, 65.03 / d), mw = w - gw, mx = -gw / 2, gx = w / 2 - gw / 2, fz = d / 2, gdw = Math.min(3.4, gw - .8);
  const n = 2 * Math.floor((mw - 3) / 6.5) + 1, mid = (n - 1) / 2, cols = Array.from({ length: n }, (_, i) => (i - mid) * (n > 1 ? (mw - 3.6) / (n - 1) : 0)), fr = [], bk = [], lf = [], up = [], ub = [], ul = [];
  const ud = d * .55, tz = fz - d * .45, pw = 4.6, pd = 2.8;
  cols.forEach((lx, i) => { if(i === mid){ fr.push({ x: lx, y: .5, w: 2, h: 2.35, door: 1, lites: 1, sur: .16 }); bk.push({ x: lx, y: .5, w: 2.2, h: 2.4, door: 1, lites: 1, sur: .15 }); up.push({ x: lx, y: .14, w: 2, h: 2.7, door: 1, lites: 1, sur: .16 }); }
    else { const big = i % 2 === 0; fr.push({ x: lx, y: .5, w: big ? 1.9 : 1.3, h: big ? 2.5 : 2.3, door: big, lites: big, sur: .13 }); bk.push({ x: lx, y: .62, w: 1.3, h: 2.3 }); up.push({ x: lx, y: .6, w: 1.3, h: 2.2 }); } ub.push({ x: lx, y: .6, w: 1.3, h: 2.2 }); });
  [-1, 1].forEach(s => { lf.push({ x: s * d * .22, y: .62, w: 1.3, h: 2.3 }); ul.push({ x: s * ud * .22, y: .6, w: 1.2, h: 2.2 }); });
  hvBlock(T, B, -w / 2, w / 2 - gw, -fz, fz, 0, FH, { f: fr, b: bk, l: lf, r: null });
  hvBlock(T, B, w / 2 - gw, w / 2, -fz, fz, 0, FH - .6, { f: [{ x: 0, y: .04, w: gdw, h: 2.2, flat: 1, garage: 1, sur: .1 }], b: [{ x: 0, y: 1.2, w: 1, h: 1.2, flat: 1 }], r: [{ x: 0, y: 1.2, w: 1, h: 1.2, flat: 1 }] });
  hvPlinth(B, -w / 2, w / 2 - gw, -fz, fz); hvPlinth(B, w / 2 - gw, w / 2, -fz, fz, true); hvCornice(B, -w / 2, w / 2 - gw, -fz, fz, FH); hvCornice(B, w / 2 - gw, w / 2, -fz, fz, FH - .6);
    let top;
  if(st > 1){
    hvBlock(T, B, -w / 2, w / 2 - gw, -fz, -fz + ud, FH, 2 * FH, { f: up, b: ub, l: ul, r: ul }); hvCornice(B, -w / 2, w / 2 - gw, -fz, -fz + ud, 2 * FH); B.box('trim', mw + .16, .16, ud + .16, mx, FH + .02, -fz + ud / 2);
    const tdz = d - ud; B.box('paver', mw, .14, tdz, mx, FH, fz - tdz / 2); B.box('trim', mw + .3, .3, .26, mx, FH, fz + .05); [-1, 1].forEach(sg => B.box('trim', .26, .3, tdz, mx + sg * (mw / 2 + .02), FH, fz - tdz / 2));
    hvRail(B, mw, mx - mw / 2, FH + .3, fz, 0, .8); [-1, 1].forEach(sg => hvRail(B, tdz, mx + sg * (mw / 2 - .1), FH + .3, fz, sg > 0 ? Math.PI / 2 : Math.PI / 2, .8));
    hvHip(T, B, mw, ud, 1.3, mx, 2 * FH, -fz + ud / 2, .55); hvChimney(T, B, mx - mw / 2 + 1.8, 2 * FH, -fz + ud / 2, 2.4); top = 2 * FH + 4;
    [-1, 1].forEach(sg => hvLantern(T, B, mx + sg * 2.4, FH + 1.9, tz + .04));
  } else { hvHip(T, B, mw, d, 1.5, mx, FH, 0, .55); hvChimney(T, B, mx - mw / 2 + 1.8, FH + .3, 0, 2.2); top = FH + 4; hvLantern(T, B, mx + 2.4, 1.9, fz + .04); hvLantern(T, B, mx - 2.4, 1.9, fz + .04); }
  hvHip(T, B, gw, d, .8, gx, FH - .6, 0, .55);
  // raised porch under a timber pergola with a lean-to tile roof
  B.box('stone', pw + .4, .5, pd, mx, 0, fz + pd / 2); hvSteps(B, mx, fz + pd, 2.8, .5);
  [-1, 1].forEach(sx => [.25, pd - .2].forEach(pz => { const px = mx + sx * (pw / 2 - .15); B.box('beam', .22, 2.2, .22, px, .5, fz + pz); B.box('beam', .36, .14, .36, px, 2.55, fz + pz); B.box('stone', .34, .12, .34, px, .5, fz + pz); }));
  B.box('beam', pw, .22, .22, mx, 2.45, fz + pd - .2); for(let x = -pw / 2 + .2; x <= pw / 2; x += .6) B.box('beam', .12, .13, pd + .2, mx + x, 2.62, fz + pd / 2 + .05);
  hvShed(T, B, mx - pw / 2 - .2, mx + pw / 2 + .2, fz, 2.95, fz + pd + .25, 2.72);
  B.box('paver', w + 2, .06, 6, 0, 0, fz + 3); B.box('paver', gdw + .4, .06, 13, gx, 0, fz + 6.5);
  hvPot(T, B, mx - 3.2, fz + .9, 0); hvPot(T, B, mx + 3.2, fz + .9, 0);
  return top;
}

// ---- Style C: single-story Spanish ranch, U-plan around a front courtyard, deep arched loggia with vigas, 3-car garage wing, tall chimney ----
function hvC(T, B, hd){
  const { w, d } = hd, fz = d / 2, EY = 3.2, lw = Math.max(4.4, Math.min(7, w * .22)), cgw = Math.min(w * .4, 9.4), cd = Math.max(3.9, Math.min(5.3, d * .3)), ld = 2.5, x0 = -w / 2 + lw, x1 = w / 2 - cgw, cw = x1 - x0, cx = (x0 + x1) / 2, HM = 3.9, zm = fz - cd, zl = zm + ld;
  // left bedroom wing (arched grilled windows): front, court side, rear, outer side
  const arch = (x, y, w2, h) => ({ x, y, w: w2, h, grille: 1 }), cl = fz - cd / 2;
  hvBlock(T, B, -w / 2, x0, -fz, fz, 0, EY, { f: lw > 5.6 ? [arch(-lw / 2 + 1.4, .7, 1.2, 2.3), arch(lw / 2 - 1.4, .7, 1.2, 2.3)] : [arch(0, .7, 1.2, 2.3)], b: [arch(0, .8, 1.2, 2.2)], l: [arch(-d * .22, .8, 1.2, 2.2), arch(d * .22, .8, 1.2, 2.2)], r: [arch(-cl, .7, 1.2, 2.3)] });
  // garage wing: three timber doors under beam headers
  const gn = 3, dw = Math.min(2.6, (cgw - 1.5) / gn), pier = (cgw - gn * dw) / (gn + 1), gh = [];
  for(let i = 0; i < gn; i++) gh.push({ x: -cgw / 2 + pier * (i + 1) + dw * (i + .5), y: .04, w: dw, h: 2.3, flat: 1, garage: 1, sur: .1 });
  hvBlock(T, B, x1, w / 2, -fz, fz, 0, 3.0, { f: gh, b: [{ x: 0, y: 1.2, w: 1.2, h: 1.2, flat: 1 }], l: [arch(cl, .8, 1.1, 2)], r: [{ x: -2, y: 1.2, w: 1, h: 1.2, flat: 1 }, { x: 2, y: 1.2, w: 1, h: 1.2, flat: 1 }] });
  // centre block behind the court: heavy arched door, grilled windows, rear French doors
  const nb = Math.max(1, Math.round(cw / 3)), bay = cw / nb, mf = [{ x: 0, y: .5, w: 2, h: 2.6, door: 1, sur: .3 }], mb = [];
  for(let i = 0; i < nb; i++){ const bx = -cw / 2 + bay * (i + .5); if(Math.abs(bx) > .6) mf.push(arch(bx, .8, 1.3, 2.4)); mb.push({ x: bx, y: .12, w: 1.5, h: 2.7, door: 1, lites: 1, sur: .16 }); }
  hvBlock(T, B, x0, x1, -fz, zm, 0, HM, { f: mf, b: mb });
  hvPlinth(B, -w / 2, x0, -fz, fz); hvPlinth(B, x1, w / 2, -fz, fz, true); hvPlinth(B, x0, x1, -fz, zm, true);
  // loggia: stone floor, arcade wall with arched bays, viga ceiling, lean-to tile roof; entry steps
  const arc = []; for(let i = 0; i < nb; i++) arc.push({ x: -cw / 2 + bay * (i + .5), y: .12, w: bay - .75, h: 2.65, open: 1 });
  B.push(cx, 0, zl, 0); hvWall(T, B, 'stucco', cw, 2.95, arc, .4); B.pop(); B.box('trim', cw + .2, .22, .6, cx, 2.95, zl - .15); B.box('stone', cw, .12, ld, cx, 0, zm + ld / 2);
  for(let vx = x0 + .3; vx < x1 - .1; vx += .6) B.cyl('beam', .085, .085, ld + .25, 8, vx, 3.0, zm, Math.PI / 2);
  B.box('wood', cw, .04, ld, cx, 3.12, zm + ld / 2); hvShed(T, B, x0 - .2, x1 + .2, zm, 3.55, zl + .45, 3.2);
  for(let z = zm + .5; z < fz - .3; z += .65){ B.bar('beam', new T.Vector3(x0 - .05, 2.85, z), new T.Vector3(x0 + .3, 2.85, z), .08, 8); B.bar('beam', new T.Vector3(x1 + .05, 2.7, z), new T.Vector3(x1 - .3, 2.7, z), .08, 8); }
  // court: pavers + apron, clay pots, wall lantern at the door
  const cz = fz - zl + 1.2; B.box('paver', cw, .07, cz, cx, 0, zl + cz / 2); B.box('paver', 5.6, .05, 9, cx, 0, fz + 4.5);
  hvPot(T, B, cx - 1.9, zm + 1.2, .12); hvPot(T, B, cx + 1.9, zm + 1.2, .12); hvPot(T, B, x0 + .8, fz - .7, .07); hvPot(T, B, x1 - .8, fz - .7, .07); hvLantern(T, B, cx + 1.45, 2.1, zm + .02);
  // roofs: centre block tall hip, wings lower hips; chimney
  hvHip(T, B, cw, zm + fz, 1.15, cx, HM, (zm - fz) / 2, .55); hvHip(T, B, lw, d, .9, -w / 2 + lw / 2, EY, 0, .5); hvHip(T, B, cgw, d, .8, w / 2 - cgw / 2, 3.0, 0, .5);
  hvChimney(T, B, x0 + 1.4, HM - .1, -fz + 2.6, 3.0); hvCornice(B, x0, x1, -fz, zm, HM);
  return HM + 3.6;
}

// contact-shadow decal (blurred dark rect, drawn once, shared), placed on the pad
function hvDecal(T, w, d){
  let t = HV2.tex.get(HV2); if(!t){ const c = hvCv(128, 128), x = c.getContext('2d'); x.shadowColor = 'rgba(0,0,0,.85)'; x.shadowBlur = 16; x.shadowOffsetX = 1000; x.fillStyle = '#000'; x.fillRect(24 - 1000, 24, 80, 80); t = new T.CanvasTexture(c); HV2.tex.set(HV2, t); }
  const m = new T.Mesh(new T.PlaneGeometry(w + 4, d + 4), new T.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: .55, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  m.rotation.x = -Math.PI / 2; m.position.y = .03; m.renderOrder = 1; Object.defineProperty(m, 'castShadow', { get: () => false, set(){} }); Object.defineProperty(m, 'receiveShadow', { get: () => false, set(){} }); return m;
}
function buildHouseV2(T, style, hd){
  const B = hvBuilder(T, houseMaterials(T)), top = (style === 'C' ? hvC : style === 'B' ? hvB : hvA)(T, B, hd), g = B.finish();
  g.add(hvDecal(T, hd.w, hd.d)); g.userData.top = top; return g;
}

// ---- studio look: ACES tone mapping, sky dome + generated environment map (house materials only), distance fog ----
function applyStudioLook(T, renderer, scene){
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.4; renderer.shadowMap.type = T.PCFSoftShadowMap; HV2.mats = null; HV2.env = null;
  try{ // generated sky/ground gradient with a warm sun spot, prefiltered once per renderer; assigned per house material (not scene.environment, so the ground and landscape keep their own lighting)
    const es = new T.Scene(), sg = new T.SphereGeometry(10, 32, 16), p = sg.attributes.position, col = [], c = new T.Color(), sunD = new T.Vector3(.5, .7, .45).normalize(), v = new T.Vector3();
    for(let i = 0; i < p.count; i++){ v.fromBufferAttribute(p, i).normalize(); const y = v.y; if(y > 0) c.set('#e8eef4').lerp(new T.Color('#5f93d3'), Math.pow(y, .55)); else c.set('#e8eef4').lerp(new T.Color('#a8977c'), Math.min(1, -y * 2.2)); const s = Math.pow(Math.max(0, v.dot(sunD)), 24) * 6; c.r += s; c.g += s * .85; c.b += s * .6; col.push(c.r, c.g, c.b); }
    sg.setAttribute('color', new T.Float32BufferAttribute(col, 3)); es.add(new T.Mesh(sg, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
    const pm = new T.PMREMGenerator(renderer); HV2.env = pm.fromScene(es, .03).texture; pm.dispose(); sg.dispose();
  }catch(e){ console.warn('env map', e); }
  // sky dome: tints follow scene.background (the sun slider recolours it), so dusk stays consistent
  const dg = new T.SphereGeometry(4000, 24, 12), dp = dg.attributes.position, dc = []; for(let i = 0; i < dp.count; i++){ const y = dp.getY(i) / 4000, k = y > 0 ? 1 - y * .16 : 1 + y * .08; dc.push(k * (y > 0 ? 1 - y * .08 : 1), k, k * (y > 0 ? 1 + y * .02 : 1) * (y > 0 ? 1 : .98)); }
  dg.setAttribute('color', new T.Float32BufferAttribute(dc, 3)); const dm = new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: false }), dome = new T.Mesh(dg, dm);
  dome.renderOrder = -1000; dome.frustumCulled = false; scene.fog = new T.Fog(scene.background && scene.background.isColor ? scene.background.clone() : new T.Color('#eef2f6'), 1e9, 2e9);
  dome.onBeforeRender = (r, s, cam) => { dome.position.copy(cam.position); if(s.background && s.background.isColor){ dm.color.copy(s.background); s.fog.color.copy(s.background); } };
  scene.add(dome); scene.userData.studio = { dome };
}
function tuneStudioLights(sun, hemi, sr){   // shadow quality for the house region; hemisphere gets a cool sky / warm bounce split
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches; sun.shadow.mapSize.set(coarse ? 2048 : 4096, coarse ? 2048 : 4096); sun.shadow.normalBias = .04; sun.shadow.bias = -.0003; sun.shadow.radius = 3;
  hemi.color.set('#e4ecff'); hemi.groundColor.set('#c9b594');
  const sc = hemi.parent; if(sc && sc.fog){ sc.fog.near = sr * 1.2; sc.fog.far = sr * 9; }
}
