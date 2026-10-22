// js/sky.js — sky, sun, fog and the four times of day
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { shared } from './world.js';

export const TOD = {
  golden: { elev: 7, azim: 245, turb: 6, ray: 2.2, mie: 0.006, sun: 0xffc48a, sunI: 2.6, hemiSky: 0xffd2a6, hemiGnd: 0x5a4a3a, hemiI: 0.9, fog: 0xd9b48f, fogD: 0.00042, exp: 0.62, night: 0.15, lamps: 0.2, bloom: 0.18 },
  noon: { elev: 55, azim: 190, turb: 3, ray: 1.2, mie: 0.004, sun: 0xfff6e8, sunI: 3.0, hemiSky: 0xbfd8ff, hemiGnd: 0x6a6450, hemiI: 1.05, fog: 0xc6d6e6, fogD: 0.00030, exp: 0.5, night: 0, lamps: 0, bloom: 0.08 },
  blue: { elev: -3, azim: 260, turb: 4, ray: 3.5, mie: 0.004, sun: 0x8fa8ff, sunI: 0.55, hemiSky: 0x5f7ccf, hemiGnd: 0x2a2a38, hemiI: 0.75, fog: 0x4a5a85, fogD: 0.00055, exp: 0.9, night: 0.75, lamps: 1, bloom: 0.45 },
  night: { elev: -14, azim: 150, turb: 2, ray: 0.4, mie: 0.002, sun: 0x9db4ff, sunI: 0.28, hemiSky: 0x2a3a66, hemiGnd: 0x16151c, hemiI: 0.75, fog: 0x0d1324, fogD: 0.0006, exp: 1.0, night: 1, lamps: 1.3, bloom: 0.6 },
};

export class SkySystem {
  constructor(scene, renderer) {
    this.scene = scene; this.renderer = renderer;
    this.sky = new Sky(); this.sky.scale.setScalar(20000); scene.add(this.sky);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const s = this.sun.shadow; s.mapSize.set(2048, 2048);
    const S = 140; Object.assign(s.camera, { left: -S, right: S, top: S, bottom: -S, near: 10, far: 900 });
    s.bias = -0.0006; s.normalBias = 1.2;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1); scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xffffff, 0.0004);
    this.dir = new THREE.Vector3();
    this.stars = this.makeStars(); scene.add(this.stars);
    // warm 'street light' pool that follows the player at night (the city's lamps are emissive only)
    this.pool = new THREE.PointLight(0xffc27a, 0, 70, 1.4); scene.add(this.pool);
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(60, 16, 12), new THREE.MeshBasicMaterial({ color: 0xf4f1e6, fog: false }));
    scene.add(this.moon);
  }
  makeStars() {
    const n = 2500, p = [];
    for (let i = 0; i < n; i++) {
      const u = Math.random(), v = Math.random() * 0.9 + 0.1;
      const th = u * Math.PI * 2, ph = Math.acos(v);
      p.push(Math.sin(ph) * Math.cos(th) * 9000, Math.cos(ph) * 9000, Math.sin(ph) * Math.sin(th) * 9000);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0 }));
  }
  set(name, ctx) {
    const t = TOD[name]; this.cur = t; this.name = name;
    const u = this.sky.material.uniforms;
    u.turbidity.value = t.turb; u.rayleigh.value = t.ray; u.mieCoefficient.value = t.mie; u.mieDirectionalG.value = 0.8;
    const phi = THREE.MathUtils.degToRad(90 - t.elev), th = THREE.MathUtils.degToRad(t.azim);
    this.dir.setFromSphericalCoords(1, phi, th);
    u.sunPosition.value.copy(this.dir);
    this.sun.color.set(t.sun); this.sun.intensity = t.sunI;
    this.hemi.color.set(t.hemiSky); this.hemi.groundColor.set(t.hemiGnd); this.hemi.intensity = t.hemiI;
    this.scene.fog.color.set(t.fog); this.scene.fog.density = t.fogD;
    this.renderer.toneMappingExposure = t.exp;
    shared.uNight.value = t.night;
    this.stars.material.opacity = t.night > 0.9 ? 0.9 : t.night > 0.5 ? 0.35 : 0;
    this.moon.visible = t.night > 0.5;
    this.pool.intensity = t.lamps * 900;
    this.sky.visible = true;
    if (ctx) {
      ctx.lampHeads.emissiveIntensity = t.lamps * 2.2;
      if (ctx.bloom) ctx.bloom.strength = t.bloom;
      if (ctx.onNight) ctx.onNight(t.night);
    }
  }
  update(focus) {
    // light direction: the sun, or the moon at night (keeps shadows readable)
    const d = this.dir.clone(); if (d.y < 0.15) { d.set(-0.4, 0.6, -0.5).normalize(); }
    this.sun.position.copy(focus).addScaledVector(d, 400);
    this.sun.target.position.copy(focus);
    // snap shadow camera to texel grid to avoid shimmering
    this.moon.position.copy(focus).add(new THREE.Vector3(-3500, 2600, -4200));
    this.stars.position.copy(focus);
    this.pool.position.set(focus.x + 4, focus.y + 9, focus.z + 3);
  }
}
