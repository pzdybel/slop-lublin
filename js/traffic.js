// js/traffic.js — cars, trolleybuses and pedestrians moving along the real Lublin road graph
import * as THREE from 'three';
import { carGeometries, trolleyGeometries } from './models.js';
import { rand } from './world.js';

const rnd = rand(1317); // Lublin city charter

class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v; const top = v[0]; const lk = k.pop(), lv = v.pop();
    if (k.length) {
      let i = 0; const n = k.length;
      for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[i] = k[c]; v[i] = v[c]; i = c; }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}
const SPEED = [15, 13, 11, 8.5, 5.5];

function buildGraph(roads, filter, oneway = true) {
  const nodes = new Map(); const N = [];
  const key = (x, z) => `${Math.round(x * 10)},${Math.round(z * 10)}`;
  const node = (x, z) => { const k = key(x, z); let n = nodes.get(k); if (!n) { n = { x, z, out: [] }; nodes.set(k, n); N.push(n); } return n; };
  const edges = [];
  for (const r of roads) {
    if (!filter(r)) continue;
    const p = r.p;
    for (let i = 0; i < p.length - 2; i += 2) {
      const a = node(p[i], p[i + 1]), b = node(p[i + 2], p[i + 3]);
      if (a === b) continue;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const mk = (u, v) => { const e = { a: u, b: v, len, r, dx: (v.x - u.x) / len, dz: (v.z - u.z) / len, occ: [] }; u.out.push(e); edges.push(e); return e; };
      if (!oneway || !r.o || r.o === 1) mk(a, b);
      if (!oneway || !r.o || r.o === -1) mk(b, a);
    }
  }
  return { N, edges };
}

export class Traffic {
  constructor(scene, world) {
    const R = window.LUBLIN.r;
    this.cars = buildGraph(R, (r) => r.k <= 4 && !r.tu && r.k !== 4 || (r.k === 4 && r.w >= 5 && !r.tu));
    this.trolley = buildGraph(R, (r) => r.tw && !r.tu);
    this.walk = buildGraph(R, (r) => !r.tu && r.k !== 0, false);
    // spatial buckets of edges for respawning near the player
    const bucket = (g) => { const m = new Map(); for (const e of g.edges) { const k = `${Math.floor(e.a.x / 150)},${Math.floor(e.a.z / 150)}`; if (!m.has(k)) m.set(k, []); m.get(k).push(e); } g.buckets = m; };
    bucket(this.cars); bucket(this.trolley); bucket(this.walk);

    const { body, cabin } = carGeometries();
    this.NC = 260;
    const bm = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.45 });
    const cm = new THREE.MeshStandardMaterial({ color: 0x1b2026, roughness: 0.2, metalness: 0.5 });
    this.carBody = new THREE.InstancedMesh(body, bm, this.NC);
    this.carCab = new THREE.InstancedMesh(cabin, cm, this.NC);
    this.carBody.castShadow = this.carCab.castShadow = true;
    const lightG = new THREE.BufferGeometry();
    lightG.setAttribute('position', new THREE.Float32BufferAttribute([-0.6, 0.7, -2.18, 0.6, 0.7, -2.18], 3));
    this.headMat = new THREE.MeshBasicMaterial({ color: 0xfff1c4 });
    this.tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a10 });
    const hl = new THREE.BoxGeometry(1.5, 0.14, 0.06).translate(0, 0.72, -2.17);
    const tl = new THREE.BoxGeometry(1.5, 0.14, 0.06).translate(0, 0.8, 2.17);
    this.carHead = new THREE.InstancedMesh(hl, this.headMat, this.NC);
    this.carTail = new THREE.InstancedMesh(tl, this.tailMat, this.NC);
    const palette = ['#f4f4f2', '#1d1f22', '#8a8f96', '#b3b7bb', '#2f4a6b', '#7a1f1f', '#3d5a40', '#c9c2b0', '#e0e0dc', '#262a30', '#5a6470', '#9b2c24', '#f2b544'];
    for (let i = 0; i < this.NC; i++) this.carBody.setColorAt(i, new THREE.Color(palette[(rnd() * palette.length) | 0]));
    scene.add(this.carBody, this.carCab, this.carHead, this.carTail);

    const tg = trolleyGeometries();
    this.NT = Math.min(18, this.trolley.edges.length ? 18 : 0);
    this.tBody = new THREE.InstancedMesh(tg.body, new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.5 }), Math.max(1, this.NT));
    this.tWin = new THREE.InstancedMesh(tg.win, new THREE.MeshStandardMaterial({ color: 0x1f2a33, roughness: 0.15, metalness: 0.4 }), Math.max(1, this.NT));
    const poleG = new THREE.BoxGeometry(0.06, 0.06, 5.5).rotateX(-0.42).translate(0, 4.2, 1.8);
    const pg2 = poleG.clone().translate(0.5, 0, 0); poleG.translate(-0.5, 0, 0);
    this.tPole = new THREE.InstancedMesh(poleG, new THREE.MeshStandardMaterial({ color: 0x222222 }), Math.max(1, this.NT));
    this.tPole2 = new THREE.InstancedMesh(pg2, new THREE.MeshStandardMaterial({ color: 0x222222 }), Math.max(1, this.NT));
    this.tStripe = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, 0.35, 12.02).translate(0, 0.75, 0), new THREE.MeshStandardMaterial({ color: 0xd4a017 }), Math.max(1, this.NT));
    this.tBody.castShadow = true;
    scene.add(this.tBody, this.tWin, this.tPole, this.tPole2, this.tStripe);

    // pedestrians: merged low-poly figure, instanced
    this.NP = 420;
    const fig = new THREE.CylinderGeometry(0.2, 0.17, 1.15, 6).translate(0, 1.0, 0);
    const legs = new THREE.CylinderGeometry(0.16, 0.12, 0.5, 6).translate(0, 0.25, 0);
    const head = new THREE.SphereGeometry(0.14, 8, 6).translate(0, 1.72, 0);
    this.pBody = new THREE.InstancedMesh(fig, new THREE.MeshStandardMaterial({ roughness: 0.9 }), this.NP);
    this.pLegs = new THREE.InstancedMesh(legs, new THREE.MeshStandardMaterial({ color: 0x2c3340, roughness: 0.9 }), this.NP);
    this.pHead = new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ color: 0xe0b493, roughness: 0.8 }), this.NP);
    const shirts = ['#e0583a', '#f2b544', '#3b6ea5', '#2d8c6b', '#ece6da', '#262626', '#8a4f9e', '#c94f6d', '#6b7d8f', '#b9784a'];
    for (let i = 0; i < this.NP; i++) this.pBody.setColorAt(i, new THREE.Color(shirts[(rnd() * shirts.length) | 0]));
    this.pBody.castShadow = true;
    scene.add(this.pBody, this.pLegs, this.pHead);

    this.agents = []; this.trolleys = []; this.peds = [];
    this.M = new THREE.Matrix4(); this.Q = new THREE.Quaternion(); this.S = new THREE.Vector3(1, 1, 1); this.P = new THREE.Vector3(); this.E = new THREE.Euler();
    this.lightsOn = 0;
  }
  pickEdge(g, x, z, rMin, rMax) {
    for (let t = 0; t < 40; t++) {
      const a = rnd() * Math.PI * 2, d = rMin + rnd() * (rMax - rMin);
      const list = g.buckets.get(`${Math.floor((x + Math.cos(a) * d) / 150)},${Math.floor((z + Math.sin(a) * d) / 150)}`);
      if (list && list.length) return list[(rnd() * list.length) | 0];
    }
    return g.edges[(rnd() * g.edges.length) | 0];
  }
  spawnAll(x, z) {
    this.agents = []; this.trolleys = []; this.peds = [];
    for (const e of this.cars.edges) e.occ.length = 0;
    for (let i = 0; i < this.NC; i++) this.agents.push(this.place({}, this.cars, x, z, 0, 700, i));
    for (let i = 0; i < this.NT; i++) this.trolleys.push(this.place({}, this.trolley, x, z, 0, 1600, i));
    for (let i = 0; i < this.NP; i++) this.peds.push(this.place({ side: rnd() < 0.5 ? -1 : 1, sp: 1.1 + rnd() * 0.6, ph: rnd() * 6 }, this.walk, x, z, 0, 260, i));
  }
  place(ag, g, x, z, rMin, rMax) {
    if (!g.edges.length) return ag;
    ag.e = this.pickEdge(g, x, z, rMin, rMax); ag.t = rnd() * ag.e.len; ag.v = 0; ag.vmax = (SPEED[Math.min(4, ag.e.r.k)] || 6) * (0.8 + rnd() * 0.35);
    return ag;
  }
  next(g, e) {
    const outs = e.b.out.filter((o) => o.b !== e.a);
    if (!outs.length) return e.b.out[0] || e;
    // prefer to stay on the same street, otherwise random
    const same = outs.filter((o) => o.r === e.r);
    if (same.length && rnd() < 0.62) return same[0];
    return outs[(rnd() * outs.length) | 0];
  }
  setNight(n) { this.lightsOn = n; this.headMat.color.setScalar(0.4 + n * 1.6).multiply(new THREE.Color(0xfff1c4)); this.tailMat.color.setRGB(0.5 + n * 1.5, 0.08 + n * 0.1, 0.03); }
  update(dt, focus, playerCar) {
    const { M, Q, S, P, E } = this;
    // ---- cars
    for (const e of this.cars.edges) e.occ.length = 0;
    for (const a of this.agents) if (a.e) a.e.occ.push(a);
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i]; if (!a.e) continue;
      // car-following: nearest car ahead on the same edge or within 12 m into the next
      let gap = Infinity;
      for (const o of a.e.occ) if (o !== a && o.t > a.t) gap = Math.min(gap, o.t - a.t);
      if (playerCar) {
        const px = a.e.a.x + a.e.dx * a.t, pz = a.e.a.z + a.e.dz * a.t;
        const rx = playerCar.x - px, rz = playerCar.z - pz; const along = rx * a.e.dx + rz * a.e.dz, across = Math.abs(-rx * a.e.dz + rz * a.e.dx);
        if (along > 0 && along < 18 && across < 3) gap = Math.min(gap, along);
      }
      const target = gap < 7 ? 0 : gap < 18 ? a.vmax * (gap - 7) / 11 : a.vmax;
      a.v += THREE.MathUtils.clamp(target - a.v, -9 * dt, 3.5 * dt);
      a.t += a.v * dt;
      while (a.t > a.e.len) { a.t -= a.e.len; a.e = this.next(this.cars, a.e); a.vmax = (SPEED[Math.min(4, a.e.r.k)] || 6) * (0.8 + rnd() * 0.35); }
      const off = a.e.r.o ? 0 : Math.min(a.e.r.w / 4, 2.4);
      const x = a.e.a.x + a.e.dx * a.t - a.e.dz * off, z = a.e.a.z + a.e.dz * a.t + a.e.dx * off;
      if (Math.hypot(x - focus.x, z - focus.z) > 900) { this.place(a, this.cars, focus.x, focus.z, 350, 750); continue; }
      a.yawT = Math.atan2(-a.e.dx, -a.e.dz);
      a.yaw = a.yaw === undefined ? a.yawT : a.yaw + Math.atan2(Math.sin(a.yawT - a.yaw), Math.cos(a.yawT - a.yaw)) * Math.min(1, dt * 6);
      a.x = x; a.z = z;
      P.set(x, 0, z); E.set(0, a.yaw, 0); Q.setFromEuler(E); M.compose(P, Q, S);
      this.carBody.setMatrixAt(i, M); this.carCab.setMatrixAt(i, M); this.carHead.setMatrixAt(i, M); this.carTail.setMatrixAt(i, M);
    }
    for (const im of [this.carBody, this.carCab, this.carHead, this.carTail]) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
    // ---- trolleybuses
    for (let i = 0; i < this.trolleys.length; i++) {
      const a = this.trolleys[i]; if (!a.e) continue;
      a.v = Math.min(9, (a.v || 0) + dt * 2); a.t += a.v * dt;
      while (a.t > a.e.len) { a.t -= a.e.len; a.e = this.next(this.trolley, a.e); }
      const off = a.e.r.o ? 0 : Math.min(a.e.r.w / 4, 2.6);
      const x = a.e.a.x + a.e.dx * a.t - a.e.dz * off, z = a.e.a.z + a.e.dz * a.t + a.e.dx * off;
      const yT = Math.atan2(-a.e.dx, -a.e.dz);
      a.yaw = a.yaw === undefined ? yT : a.yaw + Math.atan2(Math.sin(yT - a.yaw), Math.cos(yT - a.yaw)) * Math.min(1, dt * 3);
      a.x = x; a.z = z;
      P.set(x, 0, z); E.set(0, a.yaw, 0); Q.setFromEuler(E); M.compose(P, Q, S);
      for (const im of [this.tBody, this.tWin, this.tPole, this.tPole2, this.tStripe]) im.setMatrixAt(i, M);
    }
    for (const im of [this.tBody, this.tWin, this.tPole, this.tPole2, this.tStripe]) { im.count = this.trolleys.length; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
    // ---- pedestrians
    for (let i = 0; i < this.peds.length; i++) {
      const a = this.peds[i]; if (!a.e) continue;
      a.t += a.sp * dt; a.ph += a.sp * dt * 5.5;
      while (a.t > a.e.len) { a.t -= a.e.len; a.e = this.next(this.walk, a.e); }
      const k = a.e.r.k;
      const off = k <= 4 ? a.side * (a.e.r.w / 2 + 1.6) : a.side * Math.min(a.e.r.w / 2 - 0.4, 0.8 + (i % 3) * 0.5);
      const x = a.e.a.x + a.e.dx * a.t - a.e.dz * off, z = a.e.a.z + a.e.dz * a.t + a.e.dx * off;
      if (Math.hypot(x - focus.x, z - focus.z) > 320) { this.place(a, this.walk, focus.x, focus.z, 150, 300); continue; }
      const bob = Math.abs(Math.sin(a.ph)) * 0.05;
      P.set(x, bob, z); E.set(0, Math.atan2(-a.e.dx, -a.e.dz), Math.sin(a.ph) * 0.04); Q.setFromEuler(E); M.compose(P, Q, S);
      this.pBody.setMatrixAt(i, M); this.pHead.setMatrixAt(i, M);
      S.set(1, 1 - Math.abs(Math.sin(a.ph)) * 0.08, 1); M.compose(P.set(x, 0, z), Q, S); this.pLegs.setMatrixAt(i, M); S.set(1, 1, 1);
    }
    for (const im of [this.pBody, this.pLegs, this.pHead]) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
  }
  // shortest path on the car graph (A*) for the GPS route
  route(x0, z0, x1, z1) {
    const g = this.walk; // allow any non-motorway way
    const near = (x, z) => { let best = null, bd = Infinity; for (const n of g.N) { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd && n.out.length) { bd = d; best = n; } } return best; };
    const s = near(x0, z0), t = near(x1, z1); if (!s || !t) return null;
    const open = new Heap(); open.push(0, s); const gs = new Map([[s, 0]]); const prev = new Map(); const closed = new Set();
    const h = (n) => Math.hypot(n.x - t.x, n.z - t.z);
    while (open.size) {
      const n = open.pop();
      if (n === t) break; if (closed.has(n)) continue; closed.add(n);
      for (const e of n.out) {
        const w = e.len * (e.r.k >= 5 ? 0.9 : 1);
        const ng = gs.get(n) + w;
        if (ng < (gs.get(e.b) ?? Infinity)) { gs.set(e.b, ng); prev.set(e.b, n); open.push(ng + h(e.b), e.b); }
      }
      if (closed.size > 60000) break;
    }
    if (!prev.has(t)) return null;
    const nodes = []; let n = t; while (n) { nodes.push(n); n = prev.get(n); }
    nodes.reverse();
    return nodes.flatMap((q) => [q.x, q.z]);
  }
}
