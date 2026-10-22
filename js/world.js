// js/world.js — turns the OSM-derived LUBLIN data into three.js geometry: ground, areas, roads, buildings,
// trees, lamps, trolleybus wires, street furniture. Also builds the collision index and street-name lookup.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const D = window.LUBLIN;
export const OLD_TOWN = new THREE.Vector2(110, 20); // Rynek

// ------------------------------------------------------------------ small helpers
export function rand(seed) { // deterministic PRNG
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const rnd = rand(1569); // Lublin city rights year

function toPts(f) { const p = []; for (let i = 0; i < f.length; i += 2) p.push([f[i], f[i + 1]]); return p; }
function polyArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const [x0, z0] = p[i], [x1, z1] = p[(i + 1) % p.length]; a += x0 * z1 - x1 * z0; } return a / 2; }
function centroid(p) { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; }
export function pointInPoly(x, z, f) {
  let inside = false;
  for (let i = 0, j = f.length - 2; i < f.length; j = i, i += 2) {
    const xi = f[i], zi = f[i + 1], xj = f[j], zj = f[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

const NAMED = {
  beige: '#e8d9b5', lightgrey: '#cfcfcf', grey: '#9a9a9a', gray: '#9a9a9a', white: '#f2efe8', yellow: '#e9cf6a', green: '#8fb38a',
  red: '#b5543f', brown: '#8a5a3c', orange: '#e0904a', pink: '#e3a9a5', blue: '#7f9fc3', cream: '#efe4c4', black: '#333333',
  darkgrey: '#666666', darkgray: '#666666', silver: '#c0c0c0', maroon: '#7a2e2a', tan: '#cdb48c',
};
function parseCol(c, fallback) {
  if (!c) return fallback;
  const k = c.toLowerCase().trim();
  if (NAMED[k]) return new THREE.Color(NAMED[k]);
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(k) || k in THREE.Color.NAMES) return new THREE.Color(k);
  return fallback;
}

// Lublin palette — pastel kamienice in Stare Miasto, beige/cream Śródmieście, grey prefab blocks elsewhere
const OLD_TOWN_PAL = ['#e8c77e', '#d98f6b', '#c9a3c4', '#9fc0a2', '#e3b9a0', '#f0dca0', '#b8cfe0', '#e6a77f', '#d5c3a1', '#cf7f6a', '#efe0c2', '#a7b98a'];
const CITY_PAL = ['#e8dcc3', '#d8cbb0', '#efe6d2', '#cbbfa8', '#e2d3b8', '#d4c7b5', '#c9b9a0', '#ece2cf', '#bfb3a3'];
const BLOCK_PAL = ['#cfccc4', '#bdbab3', '#d9d4c9', '#c4c9cc', '#e1ddd2', '#b7b3aa', '#cdd3c6', '#d8cfb7'];

// ------------------------------------------------------------------ textures (canvas, procedural)
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 8;
  return t;
}
function noise(g, w, h, a, base, amp, n = 9000) {
  for (let i = 0; i < n; i++) {
    const v = base + (Math.random() - 0.5) * amp;
    g.fillStyle = `rgba(${v},${v},${v},${a})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}
// road texture: u runs along the road (1 repeat = 12 m), v across (0..1 over full width)
function roadTex(kind) {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = kind === 'minor' ? '#4a4a4c' : '#3f3f42'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 0.35, 70, 50);
    if (kind === 'major' || kind === 'two') {
      g.fillStyle = 'rgba(235,235,225,.85)';
      g.fillRect(0, 6, w, 5); g.fillRect(0, h - 11, w, 5); // edge lines
      if (kind === 'two') { g.fillRect(0, h / 2 - 3, w * 0.5, 6); } // dashed centre
      else { g.fillRect(0, h / 2 - 6, w, 4); g.fillRect(0, h / 2 + 2, w, 4); } // double solid
    }
  });
}
function cobbleTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5b544c'; g.fillRect(0, 0, w, h);
    const s = 16;
    for (let y = 0; y < h; y += s) for (let x = -s; x < w; x += s) {
      const off = (y / s) % 2 ? s / 2 : 0; const v = 95 + Math.random() * 45;
      g.fillStyle = `rgb(${v},${v * 0.94},${v * 0.86})`;
      g.beginPath(); g.roundRect(x + off + 1.5, y + 1.5, s - 3, s - 3, 4); g.fill();
    }
  });
}
function paveTex(tint = '#a9a39a') {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = tint; g.fillRect(0, 0, w, h);
    noise(g, w, h, 0.25, 160, 60, 5000);
    g.strokeStyle = 'rgba(60,55,50,.35)'; g.lineWidth = 2;
    for (let i = 0; i <= w; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
  });
}
function grassTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5f7a3e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 14000; i++) {
      const v = Math.random();
      g.fillStyle = `rgba(${60 + v * 70},${95 + v * 70},${40 + v * 30},.5)`;
      g.fillRect(Math.random() * w, Math.random() * h, 1, 2 + Math.random() * 2);
    }
  });
}

// ------------------------------------------------------------------ geometry builders
class Builder { // accumulates position/normal/uv/colour arrays for one merged mesh
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.ex = []; }
  tri(a, b, c, na, nb, nc, ua, ub, uc, col, ex) {
    this.p.push(...a, ...b, ...c); this.n.push(...na, ...nb, ...nc); this.uv.push(...ua, ...ub, ...uc);
    if (col) for (let i = 0; i < 3; i++) this.c.push(col.r, col.g, col.b);
    if (ex) for (let i = 0; i < 3; i++) this.ex.push(...ex);
  }
  geometry(exSize = 0) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.c.length) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (exSize && this.ex.length) g.setAttribute('aInfo', new THREE.Float32BufferAttribute(this.ex, exSize));
    g.computeBoundingSphere();
    return g;
  }
}

// flat polygon (x/z) at height y, normal up; uv in metres / uvScale
function flatPoly(B, pts, y, uvScale, col, holes = [], down = false) {
  const contour = pts.map(([x, z]) => new THREE.Vector2(x, z));
  const hs = holes.map((h) => h.map(([x, z]) => new THREE.Vector2(x, z)));
  let tris;
  try { tris = THREE.ShapeUtils.triangulateShape(contour, hs); } catch { return; }
  const all = contour.concat(...hs);
  const ny = down ? -1 : 1;
  for (const [a, b, c] of tris) {
    let A = all[a], Bv = all[b], C = all[c];
    // ensure the face points up (counter-clockwise seen from +y means (B-A)x(C-A) has negative z-component in x/z)
    const cr = (Bv.x - A.x) * (C.y - A.y) - (Bv.y - A.y) * (C.x - A.x);
    if ((cr > 0) !== down) { const t = Bv; Bv = C; C = t; }
    B.tri([A.x, y, A.y], [Bv.x, y, Bv.y], [C.x, y, C.y], [0, ny, 0], [0, ny, 0], [0, ny, 0],
      [A.x / uvScale, A.y / uvScale], [Bv.x / uvScale, Bv.y / uvScale], [C.x / uvScale, C.y / uvScale], col);
  }
}

// ribbon along a polyline: width w, height y, u = metres/uLen, v = 0..1 across
function ribbon(B, f, w, y, uLen = 12, offset = 0, col = null) {
  const n = f.length / 2;
  if (n < 2) return;
  const L = [], R = [], U = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const x = f[i * 2], z = f[i * 2 + 1];
    let dx0 = 0, dz0 = 0, dx1 = 0, dz1 = 0;
    if (i > 0) { dx0 = x - f[i * 2 - 2]; dz0 = z - f[i * 2 - 1]; const l = Math.hypot(dx0, dz0) || 1; dx0 /= l; dz0 /= l; }
    if (i < n - 1) { dx1 = f[i * 2 + 2] - x; dz1 = f[i * 2 + 3] - z; const l = Math.hypot(dx1, dz1) || 1; dx1 /= l; dz1 /= l; }
    if (i === 0) { dx0 = dx1; dz0 = dz1; }
    if (i === n - 1) { dx1 = dx0; dz1 = dz0; }
    let tx = dx0 + dx1, tz = dz0 + dz1; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    // right-hand normal (x/z): (-tz, tx)
    let nx = -tz, nz = tx;
    const dot = nx * -dz1 + nz * dx1; // cos of half angle
    const m = Math.min(2.5, 1 / Math.max(0.4, Math.abs(dot) || 1));
    const hw = w / 2 * m;
    if (i > 0) acc += Math.hypot(x - f[i * 2 - 2], z - f[i * 2 - 1]);
    const ox = x + nx * offset, oz = z + nz * offset;
    L.push([ox - nx * hw, y, oz - nz * hw]); R.push([ox + nx * hw, y, oz + nz * hw]); U.push(acc / uLen);
  }
  const up = [0, 1, 0];
  for (let i = 0; i < n - 1; i++) {
    const a = L[i], b = R[i], c = R[i + 1], d = L[i + 1];
    const ua = [U[i], 0], ub = [U[i], 1], uc = [U[i + 1], 1], ud = [U[i + 1], 0];
    // orientation check so the face points up
    const cr = (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]);
    if (cr < 0) { B.tri(a, b, c, up, up, up, ua, ub, uc, col); B.tri(a, c, d, up, up, up, ua, uc, ud, col); }
    else { B.tri(a, c, b, up, up, up, ua, uc, ub, col); B.tri(a, d, c, up, up, up, ua, ud, uc, col); }
  }
}

// ------------------------------------------------------------------ building material (procedural windows)
export const shared = { uNight: { value: 0 }, uTime: { value: 0 } };
function buildingMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = shared.uNight;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aInfo;\nvarying vec4 vInfo;\nvarying vec2 vWuv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvInfo = aInfo;\nvWuv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uNight; varying vec4 vInfo; varying vec2 vWuv; float winMask; float winLit;
float h21(vec2 p){ p = fract(p*vec2(0.1031,0.1030)); p += dot(p,p.yx+33.33); return fract((p.x+p.y)*p.x); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
winMask = 0.0; winLit = 0.0;
float viewDist = length(vViewPosition);
// vInfo: x = seed, y = window style (0 none, 1 residential, 2 office glass, 3 church tall, 4 old-town), z = floor h, w = column w
if (vInfo.y > 0.5) {
  float fh = vInfo.z, cw = vInfo.w;
  vec2 cell = vec2(floor(vWuv.x / cw), floor(vWuv.y / fh));
  vec2 f = vec2(fract(vWuv.x / cw), fract(vWuv.y / fh));
  float m;
  if (vInfo.y > 3.5) { m = step(0.3, f.x) * step(f.x, 0.7) * step(0.25, f.y) * step(f.y, 0.82); }
  else if (vInfo.y > 2.5) { m = step(0.38, f.x) * step(f.x, 0.62) * step(0.1, f.y) * step(f.y, 0.9); }
  else if (vInfo.y > 1.5) { m = step(0.06, f.x) * step(f.x, 0.94) * step(0.12, f.y) * step(f.y, 0.92); }
  else { m = step(0.22, f.x) * step(f.x, 0.78) * step(0.3, f.y) * step(f.y, 0.8); }
  float far = smoothstep(90.0, 320.0, viewDist * 3.0 / (cw + fh));
  m = mix(m, 0.28, far);
  if (vWuv.y < 0.6) m = 0.0;
  // shop fronts on the ground floor of tall city buildings
  if (vInfo.y > 0.5 && vInfo.y < 1.5 && vWuv.y < fh && vInfo.x > 0.45) m = step(0.08, f.x) * step(f.x, 0.92) * step(0.08, f.y) * step(f.y, 0.78);
  winMask = m;
  float sd = floor(vInfo.x * 997.0 + 0.5);
  float r = h21(cell * vec2(0.731, 0.917) + vec2(sd * 0.0131, sd * 0.0279));
  winLit = step(0.62, r) * m;
  vec3 glass = mix(vec3(0.16, 0.2, 0.25), vec3(0.42, 0.5, 0.58), step(1.5, vInfo.y) * step(vInfo.y, 2.5) * 0.7);
  diffuseColor.rgb = mix(diffuseColor.rgb, glass, m * 0.88);
  // subtle facade grime towards the ground and floor bands
  diffuseColor.rgb *= 0.9 + 0.1 * smoothstep(0.0, 4.0, vWuv.y);
  diffuseColor.rgb *= 1.0 - 0.06 * step(0.94, f.y) * step(vInfo.y, 1.5);
}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.45, winMask);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
vec3 warm = mix(vec3(1.0, 0.72, 0.38), vec3(0.85, 0.9, 1.0), step(0.8, fract(floor(vInfo.x * 997.0 + 0.5) * 0.618)));
totalEmissiveRadiance += warm * winLit * uNight * (vInfo.y > 2.5 && vInfo.y < 3.5 ? 0.35 : 0.95);`);
  };
  return m;
}

// ------------------------------------------------------------------ the world
export function buildWorld(scene, progress) {
  const out = { colliders: [], grid: new Map(), CELL: 30, roadIndex: new Map(), RCELL: 40, landmarks: [] };
  const B = D.bounds; // [xmin,xmax,zmin,zmax]

  // ---- ground
  const groundTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#7d8064'; g.fillRect(0, 0, w, h); noise(g, w, h, 0.25, 120, 60, 6000); });
  groundTex.repeat.set(400, 400);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, color: 0xc4d0a4 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; ground.position.set((B[0] + B[1]) / 2, 0, (B[2] + B[3]) / 2);
  scene.add(ground);

  // ---- land-use areas
  const AY = { cemetery: 0.02, wood: 0.025, park: 0.03, grass: 0.035, pitch: 0.04, rail: 0.03, parking: 0.045, plaza: 0.05, water: 0.055 };
  const areaB = {}; for (const k in AY) areaB[k] = new Builder();
  for (const a of D.a) {
    const p = toPts(a.p);
    flatPoly(areaB[a.k], p, AY[a.k], a.k === 'plaza' ? 2.5 : a.k === 'parking' ? 4 : 6);
  }
  const grassT = grassTex(); const woodT = grassTex(); woodT.rotation = 1;
  const areaMat = {
    grass: new THREE.MeshStandardMaterial({ map: grassT, roughness: 1, color: 0xb9d2a0 }),
    park: new THREE.MeshStandardMaterial({ map: grassT, roughness: 1, color: 0xa5c58e }),
    wood: new THREE.MeshStandardMaterial({ map: woodT, roughness: 1, color: 0x7a9a64 }),
    cemetery: new THREE.MeshStandardMaterial({ map: grassT, roughness: 1, color: 0x8faa80 }),
    pitch: new THREE.MeshStandardMaterial({ color: 0x5f8f4f, roughness: 0.95 }),
    parking: new THREE.MeshStandardMaterial({ map: roadTex('minor'), color: 0xbbbbbb, roughness: 0.95 }),
    plaza: new THREE.MeshStandardMaterial({ map: paveTex('#b8ae9e'), roughness: 0.9 }),
    rail: new THREE.MeshStandardMaterial({ color: 0x77706a, roughness: 1 }),
    water: new THREE.MeshStandardMaterial({ color: 0x3e6b78, roughness: 0.12, metalness: 0.2 }),
  };
  for (const k in areaB) {
    if (!areaB[k].p.length) continue;
    const m = new THREE.Mesh(areaB[k].geometry(), areaMat[k]);
    m.receiveShadow = true; m.renderOrder = 1; scene.add(m);
  }
  out.waterMat = areaMat.water;
  progress(0.3, 'Kładę asfalt i kocie łby…');

  // ---- roads
  const RB = { side: new Builder(), path: new Builder(), cob: new Builder(), minor: new Builder(), two: new Builder(), major: new Builder(), river: new Builder(), rail: new Builder(), rails: new Builder() };
  const wires = []; // trolleybus overhead wire polylines
  for (const r of D.r) {
    if (r.tu) continue;
    const k = r.k;
    if (k <= 4) {
      ribbon(RB.side, r.p, r.w + (k <= 2 ? 7 : 4.5), 0.07, 4);
      const kind = r.s === 'c' ? 'cob' : k <= 1 && !r.o ? 'major' : k <= 3 ? (r.o ? 'minor' : 'two') : 'minor';
      ribbon(RB[kind], r.p, r.w, 0.1 + (4 - k) * 0.004, kind === 'cob' ? 4 : 12);
      if (r.tw) wires.push(r);
    } else {
      ribbon(r.s === 'c' ? RB.cob : RB.path, r.p, r.w, k === 5 ? 0.085 : 0.08, 4);
    }
    // street-name / road lookup index (segments)
    for (let i = 0; i < r.p.length - 2; i += 2) {
      const mx = (r.p[i] + r.p[i + 2]) / 2, mz = (r.p[i + 1] + r.p[i + 3]) / 2;
      const key = `${Math.floor(mx / out.RCELL)},${Math.floor(mz / out.RCELL)}`;
      if (!out.roadIndex.has(key)) out.roadIndex.set(key, []);
      out.roadIndex.get(key).push([r, i]);
    }
  }
  for (const l of D.l) {
    if (l.k === 'river') ribbon(RB.river, l.p, l.w, 0.06, 20);
    if (l.k === 'rail') { ribbon(RB.rail, l.p, 4.2, 0.075, 4); ribbon(RB.rails, l.p, 0.12, 0.2, 4, -0.72); ribbon(RB.rails, l.p, 0.12, 0.2, 4, 0.72); }
  }
  const roadMat = (map, color = 0xffffff, rough = 0.92) => new THREE.MeshStandardMaterial({ map, color, roughness: rough, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const rmats = {
    side: roadMat(paveTex(), 0xd6d0c6), path: roadMat(paveTex('#b5a58a'), 0xe6dccb), cob: roadMat(cobbleTex()),
    minor: roadMat(roadTex('minor')), two: roadMat(roadTex('two')), major: roadMat(roadTex('major')),
    river: areaMat.water, rail: roadMat(null, 0x6e655c), rails: new THREE.MeshStandardMaterial({ color: 0x9a9aa0, metalness: 0.8, roughness: 0.3 }),
  };
  const order = { side: 2, path: 3, cob: 4, minor: 5, two: 6, major: 7, river: 1, rail: 2, rails: 8 };
  for (const k in RB) {
    if (!RB[k].p.length) continue;
    const m = new THREE.Mesh(RB[k].geometry(), rmats[k]);
    m.receiveShadow = true; m.renderOrder = order[k]; scene.add(m);
  }
  progress(0.5, 'Stawiam kamienice…');

  // ---- buildings
  const BW = new Builder();
  const roofCol = (b, base) => b.rc ? parseCol(b.rc, base) : base;
  let bid = 0;
  for (const b of D.b) {
    bid++;
    const pts = toPts(b.p);
    if (pts.length < 3) continue;
    const [cx, cz] = centroid(pts);
    const dOld = Math.hypot(cx - OLD_TOWN.x, cz - OLD_TOWN.y);
    const old = dOld < 330;
    const tall = b.h > 13;
    const t = b.t;
    const R = rnd();
    let col;
    if (b.c) col = parseCol(b.c, null);
    if (!col) {
      if (t === 'church') col = new THREE.Color(R < 0.5 ? '#efe6d3' : '#e8d8b8');
      else if (t === 'hist') col = new THREE.Color(R < 0.5 ? '#a5523e' : '#b8624a'); // brick gates & towers
      else if (t === 'garage' || t === 'garages' || t === 'shed' || t === 'roof') col = new THREE.Color('#9d978d');
      else if (t === 'industrial') col = new THREE.Color('#a9a49a');
      else if (old) col = new THREE.Color(OLD_TOWN_PAL[(R * OLD_TOWN_PAL.length) | 0]);
      else if (t === 'apartments' || (tall && dOld > 900)) col = new THREE.Color(BLOCK_PAL[(R * BLOCK_PAL.length) | 0]);
      else col = new THREE.Color(CITY_PAL[(R * CITY_PAL.length) | 0]);
    }
    if (b.mat === 'brick') col = new THREE.Color('#a8583f');
    col.offsetHSL(0, 0, (rnd() - 0.5) * 0.05);
    // window style
    let ws = 1, fh = 3.2, cw = 3.0;
    if (t === 'garage' || t === 'garages' || t === 'shed' || t === 'roof' || t === 'industrial' || b.h < 3) ws = 0;
    else if (t === 'church') { ws = 3; fh = Math.max(6, b.h * 0.55); cw = 5; }
    else if (t === 'hist') { ws = 4; fh = 4.5; cw = 3.2; }
    else if (t === 'office' || t === 'commercial' || t === 'retail' || (tall && R < 0.12 && !old)) { ws = 2; fh = 3.6; cw = 2.2; }
    else if (old) { ws = 4; fh = 3.6; cw = 2.6; }
    const seed = (bid * 0.6180339) % 1;
    const info = [seed, ws, fh, cw];
    const roofInfo = [seed, 0, 1, 1];
    const y0 = b.m || 0, y1 = b.h;
    // walls
    let u = 0;
    const ring = (rp) => {
      for (let i = 0; i < rp.length; i++) {
        const [x0, z0] = rp[i], [x1, z1] = rp[(i + 1) % rp.length];
        const len = Math.hypot(x1 - x0, z1 - z0); if (len < 0.05) continue;
        let nx = (z1 - z0) / len, nz = -(x1 - x0) / len;
        const a = [x0, y0, z0], bb = [x1, y0, z1], c = [x1, y1, z1], d = [x0, y1, z0];
        const nn = [nx, 0, nz];
        const ua = [u, y0], ub = [u + len, y0], uc = [u + len, y1], ud = [u, y1];
        BW.tri(a, c, bb, nn, nn, nn, ua, uc, ub, col, info); BW.tri(a, d, c, nn, nn, nn, ua, ud, uc, col, info);
        u += len;
      }
    };
    ring(pts);
    const holes = (b.holes || []).map(toPts);
    for (const h of holes) { const hh = h.slice(); if (polyArea(hh) > 0) hh.reverse(); ring(hh); }
    // roof
    const rcBase = t === 'church' || t === 'hist' ? new THREE.Color(R < 0.5 ? '#3f6e60' : '#7c3b2d')
      : old ? new THREE.Color(R < 0.6 ? '#9b4a35' : '#7a3b2c') : col.clone().multiplyScalar(0.72);
    const rc = roofCol(b, rcBase);
    if (b.r && b.r !== 'ski' && holes.length === 0) {
      const rh = b.rh || 2;
      const shrink = b.r === 'pyr' || b.r === 'dom' || b.r === 'oni' ? 0.0 : b.r === 'gab' ? 0.18 : 0.3;
      const steps = b.r === 'dom' || b.r === 'oni' ? 5 : 1;
      let prev = pts.map((p) => [p[0], y1, p[1]]);
      for (let s = 1; s <= steps; s++) {
        const t01 = s / steps;
        let k, yy;
        if (b.r === 'dom') { k = Math.cos(t01 * Math.PI / 2); yy = y1 + Math.sin(t01 * Math.PI / 2) * rh; }
        else if (b.r === 'oni') { k = (1 + 0.45 * Math.sin(t01 * Math.PI)) * (1 - t01); yy = y1 + t01 * rh * 1.6; }
        else { k = shrink; yy = y1 + rh; }
        const cur = pts.map((p) => [cx + (p[0] - cx) * k, yy, cz + (p[1] - cz) * k]);
        for (let i = 0; i < pts.length; i++) {
          const j = (i + 1) % pts.length;
          const a = prev[i], bq = prev[j], c = cur[j], d = cur[i];
          const e1 = [bq[0] - a[0], bq[1] - a[1], bq[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
          let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
          if (Math.hypot(...n) < 1e-6) n = [c[0] - a[0], 0, c[2] - a[2]];
          const nl = Math.hypot(...n) || 1; n = n.map((v) => v / nl);
          if (n[1] < 0) n = n.map((v) => -v);
          const g1 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], g2 = [bq[0] - a[0], bq[1] - a[1], bq[2] - a[2]];
          const gy = [g1[1] * g2[2] - g1[2] * g2[1], g1[2] * g2[0] - g1[0] * g2[2], g1[0] * g2[1] - g1[1] * g2[0]];
          if (gy[0] * n[0] + gy[1] * n[1] + gy[2] * n[2] >= 0) {
            BW.tri(a, c, bq, n, n, n, [0, 0], [1, 1], [1, 0], rc, roofInfo);
            BW.tri(a, d, c, n, n, n, [0, 0], [0, 1], [1, 1], rc, roofInfo);
          } else {
            BW.tri(a, bq, c, n, n, n, [0, 0], [1, 0], [1, 1], rc, roofInfo);
            BW.tri(a, c, d, n, n, n, [0, 0], [1, 1], [0, 1], rc, roofInfo);
          }
        }
        prev = cur;
      }
      if (shrink > 0) flatPoly({ tri: (...args) => BW.tri(...args.slice(0, 9), rc, roofInfo) }, prev.map((p) => [p[0], p[2]]), y1 + rh, 1, rc);
    } else {
      flatPoly({ tri: (...args) => BW.tri(...args.slice(0, 9), rc, roofInfo) }, pts, y1, 1, rc, holes);
      if (y0 > 0.5) flatPoly({ tri: (...args) => BW.tri(...args.slice(0, 9), col, roofInfo) }, pts, y0, 1, col, holes, true);
    }
    // collision
    if (y0 < 2.5 && b.h > 1.5) {
      const xs = b.p.filter((_, i) => i % 2 === 0), zs = b.p.filter((_, i) => i % 2 === 1);
      const c = { f: b.p, h: b.h + (b.rh || 0), x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
      out.colliders.push(c);
      for (let gx = Math.floor(c.x0 / out.CELL); gx <= Math.floor(c.x1 / out.CELL); gx++)
        for (let gz = Math.floor(c.z0 / out.CELL); gz <= Math.floor(c.z1 / out.CELL); gz++) {
          const key = `${gx},${gz}`; if (!out.grid.has(key)) out.grid.set(key, []); out.grid.get(key).push(c);
        }
    }
  }
  // city walls
  for (const l of D.l) if (l.k === 'wall') {
    const p = toPts(l.p), h = l.h || 7, col = new THREE.Color('#9c5a44');
    for (let i = 0; i < p.length - 1; i++) {
      const [x0, z0] = p[i], [x1, z1] = p[i + 1]; const len = Math.hypot(x1 - x0, z1 - z0) || 1;
      const nx = (z1 - z0) / len * 0.8, nz = -(x1 - x0) / len * 0.8;
      const box = [[x0 + nx, z0 + nz], [x1 + nx, z1 + nz], [x1 - nx, z1 - nz], [x0 - nx, z0 - nz]];
      for (let s = 0; s < 4; s++) {
        const [ax, az] = box[s], [bx, bz] = box[(s + 1) % 4]; const ll = Math.hypot(bx - ax, bz - az) || 1;
        const n = [(bz - az) / ll, 0, -(bx - ax) / ll];
        BW.tri([ax, 0, az], [bx, h, bz], [bx, 0, bz], n, n, n, [0, 0], [1, 1], [1, 0], col, [0, 0, 1, 1]);
        BW.tri([ax, 0, az], [ax, h, az], [bx, h, bz], n, n, n, [0, 0], [0, 1], [1, 1], col, [0, 0, 1, 1]);
      }
      flatPoly({ tri: (...a) => BW.tri(...a.slice(0, 9), col, [0, 0, 1, 1]) }, box, h, 1, col);
    }
  }
  const bgeo = BW.geometry(4);
  const bmesh = new THREE.Mesh(bgeo, buildingMaterial());
  bmesh.castShadow = true; bmesh.receiveShadow = true; scene.add(bmesh);
  out.buildings = bmesh;
  progress(0.7, 'Sadzę drzewa w Ogrodzie Saskim…');

  // ---- trees: OSM trees + fill for parks & woods
  const tp = D.t.slice();
  for (const a of D.a) {
    if (!['park', 'wood', 'cemetery', 'grass'].includes(a.k)) continue;
    const p = toPts(a.p); const ar = Math.abs(polyArea(p));
    const dens = a.k === 'wood' ? 1 / 55 : a.k === 'park' ? 1 / 170 : a.k === 'cemetery' ? 1 / 120 : 1 / 900;
    let n = Math.min(1500, Math.floor(ar * dens));
    const xs = a.p.filter((_, i) => i % 2 === 0), zs = a.p.filter((_, i) => i % 2 === 1);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    let tries = n * 4;
    while (n > 0 && tries-- > 0) {
      const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
      if (pointInPoly(x, z, a.p) && !hitsBuilding(out, x, z, 2)) { tp.push(x, z); n--; }
    }
  }
  const nT = tp.length / 2;
  const trunkG = new THREE.CylinderGeometry(0.18, 0.28, 3, 5); trunkG.translate(0, 1.5, 0);
  const crownA = new THREE.IcosahedronGeometry(2.6, 0); crownA.translate(0, 5, 0);
  const crownB = new THREE.ConeGeometry(2.2, 6, 7); crownB.translate(0, 5.5, 0);
  const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 1 }), nT);
  const crowns = new THREE.InstancedMesh(crownA, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), nT);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), E = new THREE.Euler();
  const greens = ['#4f7a35', '#5d8a3c', '#3f6b2e', '#6a8f3f', '#557f3a', '#7a9a45'].map((c) => new THREE.Color(c));
  for (let i = 0; i < nT; i++) {
    const s = 0.75 + rnd() * 0.65;
    P.set(tp[i * 2], 0, tp[i * 2 + 1]); E.set(0, rnd() * 6.28, 0); Q.setFromEuler(E);
    S.set(s, s * (0.9 + rnd() * 0.3), s); M.compose(P, Q, S);
    trunks.setMatrixAt(i, M); crowns.setMatrixAt(i, M);
    crowns.setColorAt(i, greens[(rnd() * greens.length) | 0].clone().offsetHSL(0, 0, (rnd() - 0.5) * 0.08));
  }
  trunks.castShadow = crowns.castShadow = true; crowns.receiveShadow = true;
  scene.add(trunks, crowns);
  out.trees = { trunks, crowns, crownB };

  // ---- street lamps along main roads (Lublin has lots of old-style lanterns in the old town)
  const lampP = [];
  for (const r of D.r) {
    if (r.k > 3 && !(r.k === 5 || (r.s === 'c'))) continue;
    if (r.tu) continue;
    const step = r.k <= 1 ? 32 : 38; const off = r.w / 2 + 1.2;
    let acc = step / 2, side = 1;
    for (let i = 0; i < r.p.length - 2; i += 2) {
      const x0 = r.p[i], z0 = r.p[i + 1], x1 = r.p[i + 2], z1 = r.p[i + 3];
      const len = Math.hypot(x1 - x0, z1 - z0); if (!len) continue;
      const nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
      while (acc < len) {
        const t = acc / len; const x = x0 + (x1 - x0) * t + nx * off * side, z = z0 + (z1 - z0) * t + nz * off * side;
        if (!hitsBuilding(out, x, z, 0.6)) lampP.push(x, z, Math.atan2(-nx * side, -nz * side), r.s === 'c' || r.k === 5 ? 1 : 0);
        acc += step; side = r.k <= 2 ? -side : side;
      }
      acc -= len;
    }
  }
  for (let i = 0; i < D.lp.length; i += 2) lampP.push(D.lp[i], D.lp[i + 1], 0, 1);
  const nL = lampP.length / 4;
  const poleG = mergeGeometries([
    new THREE.CylinderGeometry(0.07, 0.1, 6, 6).translate(0, 3, 0),
    new THREE.BoxGeometry(0.06, 0.06, 1.4).translate(0, 5.9, 0.7),
  ]);
  const headG = new THREE.BoxGeometry(0.35, 0.14, 0.6).translate(0, 5.8, 1.35);
  const poles = new THREE.InstancedMesh(poleG, new THREE.MeshStandardMaterial({ color: 0x2c2f33, metalness: 0.6, roughness: 0.5 }), nL);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xffc777, emissiveIntensity: 0 });
  const heads = new THREE.InstancedMesh(headG, headMat, nL);
  for (let i = 0; i < nL; i++) {
    P.set(lampP[i * 4], 0, lampP[i * 4 + 1]); E.set(0, lampP[i * 4 + 2], 0); Q.setFromEuler(E); S.set(1, 1, 1); M.compose(P, Q, S);
    poles.setMatrixAt(i, M); heads.setMatrixAt(i, M);
  }
  poles.castShadow = true; scene.add(poles, heads);
  out.lampHeads = headMat;
  out.lampPos = lampP;

  // ---- trolleybus overhead wires (Lublin is one of three Polish cities with trolleybuses)
  const wireB = [];
  for (const r of wires) {
    for (const side of [-1, 1]) for (const dd of [-0.3, 0.3]) {
      const off = side * Math.max(1.8, r.w / 4) + dd;
      for (let i = 0; i < r.p.length - 2; i += 2) {
        const x0 = r.p[i], z0 = r.p[i + 1], x1 = r.p[i + 2], z1 = r.p[i + 3];
        const len = Math.hypot(x1 - x0, z1 - z0) || 1; const nx = -(z1 - z0) / len, nz = (x1 - x0) / len;
        wireB.push(x0 + nx * off, 5.9, z0 + nz * off, x1 + nx * off, 5.9, z1 + nz * off);
      }
      if (r.o) break;
    }
  }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wireB, 3));
  const wireLines = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.75 }));
  scene.add(wireLines);
  out.trolleyRoads = wires;

  // ---- street furniture: bus shelters, benches, fountains, monuments, traffic lights
  const furn = { bus: [], bench: [], fount: [], mon: [], sig: [] };
  for (const p of D.poi) furn[p.k] && furn[p.k].push(p);
  const inst = (geo, mat, list, yaw = () => rnd() * 6.28, cast = true) => {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((p, i) => { P.set(p.x, 0, p.z); E.set(0, yaw(p), 0); Q.setFromEuler(E); S.set(1, 1, 1); M.compose(P, Q, S); im.setMatrixAt(i, M); });
    im.castShadow = cast; im.receiveShadow = true; scene.add(im); return im;
  };
  const shelter = mergeGeometries([
    new THREE.BoxGeometry(3.6, 0.1, 1.6).translate(0, 2.5, 0), new THREE.BoxGeometry(3.6, 2.3, 0.05).translate(0, 1.25, -0.75),
    new THREE.BoxGeometry(0.05, 2.3, 1.5).translate(-1.78, 1.25, 0), new THREE.BoxGeometry(0.05, 2.3, 1.5).translate(1.78, 1.25, 0),
  ]);
  inst(shelter, new THREE.MeshStandardMaterial({ color: 0x8fb0c4, transparent: true, opacity: 0.6, roughness: 0.2 }), furn.bus);
  inst(new THREE.BoxGeometry(1.6, 0.42, 0.45).translate(0, 0.42, 0), new THREE.MeshStandardMaterial({ color: 0x6a4a32 }), furn.bench);
  const fount = mergeGeometries([new THREE.CylinderGeometry(3, 3.2, 0.6, 20).translate(0, 0.3, 0), new THREE.CylinderGeometry(0.4, 0.6, 2, 10).translate(0, 1, 0)]);
  inst(fount, new THREE.MeshStandardMaterial({ color: 0xcfc6b5 }), furn.fount);
  const mon = mergeGeometries([new THREE.BoxGeometry(2, 2.4, 2).translate(0, 1.2, 0), new THREE.CylinderGeometry(0.35, 0.5, 2.2, 8).translate(0, 3.5, 0), new THREE.SphereGeometry(0.4, 8, 6).translate(0, 4.8, 0)]);
  inst(mon, new THREE.MeshStandardMaterial({ color: 0x6f7470, metalness: 0.3, roughness: 0.6 }), furn.mon);
  const sig = mergeGeometries([new THREE.CylinderGeometry(0.08, 0.08, 3.4, 6).translate(0, 1.7, 0), new THREE.BoxGeometry(0.35, 1, 0.3).translate(0, 3.6, 0)]);
  inst(sig, new THREE.MeshStandardMaterial({ color: 0x222222 }), furn.sig);

  progress(0.85, 'Łączę skrzyżowania…');
  return out;
}

// ------------------------------------------------------------------ spatial queries
export function hitsBuilding(W, x, z, r, y = 0) {
  const list = W.grid.get(`${Math.floor(x / W.CELL)},${Math.floor(z / W.CELL)}`);
  if (!list) return false;
  for (const c of list) {
    if (y > c.h) continue;
    if (x < c.x0 - r || x > c.x1 + r || z < c.z0 - r || z > c.z1 + r) continue;
    if (pointInPoly(x, z, c.f)) return true;
    if (r > 0 && edgeDist(x, z, c.f).d < r) return true;
  }
  return false;
}
function edgeDist(x, z, f) {
  let best = { d: Infinity, nx: 0, nz: 0 };
  for (let i = 0, j = f.length - 2; i < f.length; j = i, i += 2) {
    const ax = f[j], az = f[j + 1], bx = f[i], bz = f[i + 1];
    const dx = bx - ax, dz = bz - az; const L = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
    const px = ax + dx * t, pz = az + dz * t; const d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, px, pz };
  }
  return best;
}
// push a circle (x,z,r) out of buildings; returns {x, z, hit}
export function collide(W, x, z, r, y = 0) {
  let hit = false;
  for (let it = 0; it < 3; it++) {
    let moved = false;
    for (let gx = Math.floor((x - r) / W.CELL); gx <= Math.floor((x + r) / W.CELL); gx++)
      for (let gz = Math.floor((z - r) / W.CELL); gz <= Math.floor((z + r) / W.CELL); gz++) {
        const list = W.grid.get(`${gx},${gz}`); if (!list) continue;
        for (const c of list) {
          if (y > c.h - 0.2) continue;
          if (x < c.x0 - r || x > c.x1 + r || z < c.z0 - r || z > c.z1 + r) continue;
          const inside = pointInPoly(x, z, c.f);
          const e = edgeDist(x, z, c.f);
          if (inside || e.d < r) {
            let dx = x - e.px, dz = z - e.pz; const l = Math.hypot(dx, dz) || 1e-6; dx /= l; dz /= l;
            if (inside) { dx = -dx; dz = -dz; }
            x = e.px + dx * (r + 0.01); z = e.pz + dz * (r + 0.01);
            hit = moved = true;
          }
        }
      }
    if (!moved) break;
  }
  return { x, z, hit };
}
// nearest named road to a point
export function streetAt(W, x, z) {
  let best = null, bd = 30;
  const cx = Math.floor(x / W.RCELL), cz = Math.floor(z / W.RCELL);
  for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gz = cz - 1; gz <= cz + 1; gz++) {
    const list = W.roadIndex.get(`${gx},${gz}`); if (!list) continue;
    for (const [r, i] of list) {
      if (!r.n) continue;
      const ax = r.p[i], az = r.p[i + 1], dx = r.p[i + 2] - ax, dz = r.p[i + 3] - az; const L = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
      const d = Math.hypot(x - ax - dx * t, z - az - dz * t) - r.w / 2 - (r.k > 4 ? 6 : 0);
      if (d < bd) { bd = d; best = r; }
    }
  }
  return best;
}
