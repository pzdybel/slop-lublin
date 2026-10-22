// js/models.js — low-poly actors: pedestrian, taxi, city bike, helicopter, trolleybus
import * as THREE from 'three';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
function box(w, h, d, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; return m; }

export function makePerson(shirt = 0xe0583a, pants = 0x2f3a4a, skin = 0xe2b694) {
  const g = new THREE.Group();
  const sm = std(skin), shm = std(shirt), pm = std(pants);
  const legL = new THREE.Group(), legR = new THREE.Group(), armL = new THREE.Group(), armR = new THREE.Group();
  legL.add(box(0.16, 0.85, 0.18, pm, 0, -0.42, 0)); legR.add(box(0.16, 0.85, 0.18, pm, 0, -0.42, 0));
  legL.position.set(-0.11, 0.88, 0); legR.position.set(0.11, 0.88, 0);
  armL.add(box(0.12, 0.66, 0.13, shm, 0, -0.32, 0)); armR.add(box(0.12, 0.66, 0.13, shm, 0, -0.32, 0));
  armL.position.set(-0.3, 1.48, 0); armR.position.set(0.3, 1.48, 0);
  const torso = box(0.46, 0.64, 0.24, shm, 0, 1.2, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), sm); head.position.y = 1.7; head.castShadow = true;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0x3a2a20)); hair.position.y = 1.72;
  g.add(legL, legR, armL, armR, torso, head, hair);
  g.userData.limbs = { legL, legR, armL, armR };
  return g;
}
export function animatePerson(g, phase, amp) {
  const L = g.userData.limbs; if (!L) return;
  const s = Math.sin(phase) * amp;
  L.legL.rotation.x = s; L.legR.rotation.x = -s; L.armL.rotation.x = -s * 0.8; L.armR.rotation.x = s * 0.8;
}

export function makeTaxi() {
  const g = new THREE.Group();
  const body = std(0xf4f1ea, { metalness: 0.4, roughness: 0.35 });
  const dark = std(0x1e2228, { metalness: 0.2, roughness: 0.25 });
  g.add(box(1.8, 0.7, 4.4, body, 0, 0.62, 0));
  g.add(box(1.62, 0.6, 2.3, dark, 0, 1.25, -0.15));
  g.add(box(1.64, 0.08, 2.2, body, 0, 1.58, -0.15));
  const sign = box(0.7, 0.22, 0.28, std(0xf2b544, { emissive: 0xf2b544, emissiveIntensity: 0.6 }), 0, 1.74, -0.1);
  g.add(sign);
  // chequered stripe
  const stripe = box(1.82, 0.12, 2.6, std(0x222222), 0, 0.85, 0.2); g.add(stripe);
  const wheelG = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 14).rotateZ(Math.PI / 2);
  const wm = std(0x151515);
  g.userData.wheels = [];
  for (const [x, z] of [[-0.86, -1.4], [0.86, -1.4], [-0.86, 1.4], [0.86, 1.4]]) {
    const w = new THREE.Mesh(wheelG, wm); w.position.set(x, 0.34, z); w.castShadow = true; g.add(w); g.userData.wheels.push(w);
  }
  const hl = std(0xffffff, { emissive: 0xfff3d0, emissiveIntensity: 0.4 });
  g.add(box(0.36, 0.14, 0.05, hl, -0.6, 0.72, -2.21), box(0.36, 0.14, 0.05, hl, 0.6, 0.72, -2.21));
  const tl = std(0x550000, { emissive: 0xff2200, emissiveIntensity: 0.6 });
  g.add(box(0.36, 0.14, 0.05, tl, -0.6, 0.78, 2.21), box(0.36, 0.14, 0.05, tl, 0.6, 0.78, 2.21));
  g.userData.lights = [hl, tl];
  return g;
}

export function makeBike() {
  const g = new THREE.Group();
  const frame = std(0x2d8c6b, { metalness: 0.5, roughness: 0.4 });
  const tire = std(0x111111);
  const wg = new THREE.TorusGeometry(0.34, 0.035, 6, 20).rotateY(Math.PI / 2);
  const w1 = new THREE.Mesh(wg, tire), w2 = new THREE.Mesh(wg, tire); w1.position.set(0, 0.36, -0.55); w2.position.set(0, 0.36, 0.55);
  w1.castShadow = w2.castShadow = true;
  const tube = (x0, y0, z0, x1, y1, z1, r = 0.025) => {
    const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1); const l = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 6), frame); m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); m.castShadow = true; return m;
  };
  g.add(w1, w2, tube(0, 0.36, 0.55, 0, 0.8, 0.1), tube(0, 0.36, 0.55, 0, 0.42, 0), tube(0, 0.42, 0, 0, 0.8, 0.1),
    tube(0, 0.42, 0, 0, 0.92, -0.45), tube(0, 0.8, 0.1, 0, 0.92, -0.45), tube(0, 0.36, -0.55, 0, 1.0, -0.48),
    tube(-0.25, 1.02, -0.48, 0.25, 1.02, -0.48, 0.02));
  const seat = box(0.14, 0.05, 0.26, std(0x222222), 0, 0.86, 0.12); g.add(seat);
  const rider = makePerson(0xf2b544, 0x34404f);
  rider.position.set(0, -0.05, 0.1); rider.rotation.x = 0.25;
  const L = rider.userData.limbs; L.armL.rotation.x = L.armR.rotation.x = -1.1;
  g.add(rider); g.userData.rider = rider; g.userData.wheels = [w1, w2];
  return g;
}

export function makeHeli() {
  const g = new THREE.Group();
  const body = std(0xc8372d, { metalness: 0.3, roughness: 0.4 });
  const glass = std(0x1c2833, { metalness: 0.6, roughness: 0.15 });
  const cab = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 12), body); cab.scale.set(1, 0.95, 1.7); cab.position.y = 1.5; cab.castShadow = true;
  const win = new THREE.Mesh(new THREE.SphereGeometry(1.28, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2.4), glass);
  win.scale.set(1.02, 0.95, 1.72); win.rotation.x = -Math.PI / 2.2; win.position.set(0, 1.6, -0.25);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.38, 5, 8).rotateX(Math.PI / 2), body); tail.position.set(0, 1.8, 4); tail.castShadow = true;
  const fin = box(0.1, 1.2, 0.7, body, 0, 2.3, 6.3);
  const skidM = std(0x333333);
  g.add(cab, win, tail, fin, box(0.08, 0.08, 3.4, skidM, -0.8, 0.1, 0), box(0.08, 0.08, 3.4, skidM, 0.8, 0.1, 0),
    box(0.06, 0.6, 0.06, skidM, -0.7, 0.4, -0.8), box(0.06, 0.6, 0.06, skidM, 0.7, 0.4, -0.8), box(0.06, 0.6, 0.06, skidM, -0.7, 0.4, 0.8), box(0.06, 0.6, 0.06, skidM, 0.7, 0.4, 0.8));
  const rotor = new THREE.Group(); rotor.position.y = 2.9;
  const bladeM = std(0x222222);
  for (let i = 0; i < 4; i++) { const b = box(0.28, 0.04, 5.2, bladeM, 0, 0, 2.6); const p = new THREE.Group(); p.add(b); p.rotation.y = i * Math.PI / 2; rotor.add(p); }
  rotor.add(box(0.2, 0.4, 0.2, bladeM));
  const trotor = new THREE.Group(); trotor.position.set(0.12, 2.3, 6.5);
  trotor.add(box(0.03, 1.4, 0.12, bladeM), box(0.03, 0.12, 1.4, bladeM));
  g.add(rotor, trotor); g.userData.rotor = rotor; g.userData.trotor = trotor;
  return g;
}

// for instanced traffic: merged simple geometry
export function carGeometries() {
  const body = new THREE.BoxGeometry(1.8, 0.75, 4.3).translate(0, 0.65, 0);
  const cabin = new THREE.BoxGeometry(1.6, 0.6, 2.2).translate(0, 1.3, 0.1);
  return { body, cabin };
}
export function trolleyGeometries() {
  const body = new THREE.BoxGeometry(2.55, 2.6, 12).translate(0, 1.7, 0);
  const win = new THREE.BoxGeometry(2.58, 1.0, 11.2).translate(0, 2.2, 0);
  return { body, win };
}
