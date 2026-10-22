// js/map.js — "Atlas ulic Lublina": pan/zoom 2D map, click to teleport and set a GPS route
const D = window.LUBLIN;

function path(f, close) {
  const p = new Path2D(); p.moveTo(f[0], f[1]);
  for (let i = 2; i < f.length; i += 2) p.lineTo(f[i], f[i + 1]);
  if (close) p.closePath();
  return p;
}

export class CityMap {
  constructor(el, canvas, { onTeleport, onRoute, landmarks }) {
    this.el = el; this.c = canvas; this.g = canvas.getContext('2d');
    this.onTeleport = onTeleport; this.onRoute = onRoute; this.landmarks = landmarks;
    this.scale = 0.35; this.cx = 0; this.cz = 300; this.route = null; this.me = { x: 0, z: 0, yaw: 0 };
    // cached layers
    const L = { water: new Path2D(), green: new Path2D(), plaza: new Path2D(), bld: new Path2D(), hist: new Path2D(), river: [], roads: [[], [], [], [], [], [], [], [], []], rail: new Path2D(), tw: new Path2D() };
    for (const a of D.a) {
      const p = path(a.p, true);
      if (a.k === 'water') L.water.addPath(p);
      else if (a.k === 'park' || a.k === 'grass' || a.k === 'wood' || a.k === 'cemetery' || a.k === 'pitch') L.green.addPath(p);
      else if (a.k === 'plaza') L.plaza.addPath(p);
    }
    for (const b of D.b) (b.t === 'church' || b.t === 'hist' ? L.hist : L.bld).addPath(path(b.p, true));
    for (const r of D.r) { if (r.tu) continue; L.roads[r.k].push([path(r.p), r.w]); if (r.tw) L.tw.addPath(path(r.p)); }
    for (const l of D.l) { if (l.k === 'river') L.river.push([path(l.p), l.w]); if (l.k === 'rail') L.rail.addPath(path(l.p)); }
    this.L = L;
    this.bindEvents();
  }
  open(me) { this.me = me; this.cx = me.x; this.cz = me.z; this.el.hidden = false; this.resize(); this.draw(); }
  close() { this.el.hidden = true; }
  resize() { const r = this.c.getBoundingClientRect(); const d = Math.min(2, devicePixelRatio); this.c.width = r.width * d; this.c.height = r.height * d; this.dpr = d; }
  toWorld(px, py) { const r = this.c.getBoundingClientRect(); return { x: this.cx + (px - r.left - r.width / 2) / this.scale, z: this.cz + (py - r.top - r.height / 2) / this.scale }; }
  bindEvents() {
    let drag = null, moved = false;
    this.c.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, cx: this.cx, cz: this.cz }; moved = false; this.c.setPointerCapture(e.pointerId); });
    this.c.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.hypot(dx, dy) > 4) moved = true;
      this.cx = drag.cx - dx / this.scale; this.cz = drag.cz - dy / this.scale; this.draw();
    });
    this.c.addEventListener('pointerup', (e) => {
      if (drag && !moved) { const w = this.toWorld(e.clientX, e.clientY); (e.shiftKey || e.altKey ? this.onRoute : this.onTeleport)(w.x, w.z); }
      drag = null;
    });
    this.c.addEventListener('wheel', (e) => {
      e.preventDefault(); const before = this.toWorld(e.clientX, e.clientY);
      this.scale = Math.min(6, Math.max(0.12, this.scale * Math.exp(-e.deltaY * 0.0015)));
      const after = this.toWorld(e.clientX, e.clientY); this.cx += before.x - after.x; this.cz += before.z - after.z; this.draw();
    }, { passive: false });
    addEventListener('resize', () => { if (!this.el.hidden) { this.resize(); this.draw(); } });
  }
  draw() {
    const g = this.g, L = this.L, s = this.scale * this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#16161a'; g.fillRect(0, 0, this.c.width, this.c.height);
    g.setTransform(s, 0, 0, s, this.c.width / 2 - this.cx * s, this.c.height / 2 - this.cz * s);
    g.fillStyle = '#1f2a1e'; g.fill(L.green);
    g.fillStyle = '#2a2a2f'; g.fill(L.plaza);
    g.fillStyle = '#1d3440'; g.fill(L.water);
    g.strokeStyle = '#1d3440'; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [p, w] of L.river) { g.lineWidth = w; g.stroke(p); }
    g.fillStyle = '#34343b'; g.fill(L.bld);
    g.fillStyle = '#6b4a3a'; g.fill(L.hist);
    const roadCol = ['#e9c27a', '#d9b26a', '#b9b3a8', '#8d8a85', '#6b6966', '#55534f', '#46443f', '#3e5a52', '#46443f'];
    for (let k = 8; k >= 0; k--) {
      g.strokeStyle = roadCol[k];
      for (const [p, w] of L.roads[k]) { g.lineWidth = Math.max(w, 1.4 / s * this.dpr); g.stroke(p); }
    }
    g.setLineDash([6, 6]); g.strokeStyle = '#7c7a76'; g.lineWidth = 2; g.stroke(L.rail); g.setLineDash([]);
    g.strokeStyle = 'rgba(197,140,255,.85)'; g.lineWidth = Math.max(1.2, 1.6 / s * this.dpr); g.stroke(L.tw);
    if (this.route) { g.strokeStyle = '#4fc3f7'; g.lineWidth = Math.max(5, 5 / s * this.dpr); g.stroke(path(this.route)); }
    // landmarks
    g.font = `${13 / s * this.dpr}px "Space Grotesk", sans-serif`; g.textBaseline = 'middle';
    for (const l of this.landmarks) {
      g.fillStyle = '#fff'; g.beginPath(); g.arc(l.x, l.z, 5 / s * this.dpr, 0, 7); g.fill();
      if (this.scale > 0.22) { g.fillStyle = 'rgba(255,255,255,.85)'; g.fillText(l.name, l.x + 9 / s * this.dpr, l.z); }
    }
    // me
    const m = this.me; const r = 9 / s * this.dpr;
    g.save(); g.translate(m.x, m.z); g.rotate(-m.yaw);
    g.fillStyle = '#f2b544'; g.strokeStyle = '#000'; g.lineWidth = 2 / s * this.dpr;
    g.beginPath(); g.moveTo(0, -r * 1.4); g.lineTo(r, r); g.lineTo(0, r * 0.4); g.lineTo(-r, r); g.closePath(); g.fill(); g.stroke();
    g.restore();
    // north arrow
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#e0583a'; g.font = `600 ${14 * this.dpr}px "JetBrains Mono"`; g.fillText('N ↑', 18 * this.dpr, 22 * this.dpr);
  }
}
