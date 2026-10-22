// js/player.js — walk / drive / bike / fly controllers with building collision
import * as THREE from 'three';
import { makePerson, animatePerson, makeTaxi, makeBike, makeHeli } from './models.js';
import { collide } from './world.js';

export const MODES = {
  walk: { name: 'Spacer', r: 0.35, eye: 1.65 },
  drive: { name: 'Taksówka', r: 1.15, eye: 1.35 },
  bike: { name: 'Rower miejski', r: 0.6, eye: 1.7 },
  fly: { name: 'Helikopter', r: 3.0, eye: 2.0 },
};

export class Player {
  constructor(scene, world) {
    this.W = world; this.scene = scene;
    this.pos = new THREE.Vector3(); this.yaw = 0; this.speed = 0; this.vy = 0; this.side = 0;
    this.models = { walk: makePerson(), drive: makeTaxi(), bike: makeBike(), fly: makeHeli() };
    for (const k in this.models) { this.models[k].visible = false; scene.add(this.models[k]); }
    this.phase = 0; this.mode = 'walk'; this.tilt = 0; this.bank = 0; this.rotorSpin = 0;
    this.setMode('walk');
  }
  setMode(m) {
    const prev = this.mode;
    this.models[prev].visible = false; this.mode = m; this.models[m].visible = true;
    this.speed = 0; this.vy = 0;
    if (m === 'fly' && this.pos.y < 2) this.pos.y = 0;
    if (m !== 'fly') this.pos.y = 0;
    if (prev === 'fly' && m !== 'fly') this.pos.y = 0;
    const c = collide(this.W, this.pos.x, this.pos.z, MODES[m].r); this.pos.x = c.x; this.pos.z = c.z;
  }
  teleport(x, z, yaw) { this.pos.set(x, this.mode === 'fly' ? 60 : 0, z); if (yaw !== undefined) this.yaw = yaw; this.speed = 0; const c = collide(this.W, x, z, MODES[this.mode].r); this.pos.x = c.x; this.pos.z = c.z; }
  forward() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  update(dt, inp, camYaw) {
    const m = this.mode, M = MODES[m];
    const f = inp.fwd, s = inp.side; // -1..1
    let moveX = 0, moveZ = 0;
    if (m === 'walk') {
      // camera-relative movement
      const want = Math.hypot(f, s) > 0.1;
      const max = inp.boost ? 6.0 : 2.2;
      if (want) {
        const a = Math.atan2(-s, f) + camYaw;
        const target = a;
        let d = target - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        this.yaw += d * Math.min(1, dt * 10);
        this.speed = THREE.MathUtils.lerp(this.speed, max * Math.min(1, Math.hypot(f, s)), Math.min(1, dt * 6));
      } else this.speed = THREE.MathUtils.lerp(this.speed, 0, Math.min(1, dt * 8));
      const fw = this.forward(); moveX = fw.x * this.speed * dt; moveZ = fw.z * this.speed * dt;
      // jump
      if (inp.up && this.pos.y <= 0.001) this.vy = 4.6;
      this.vy -= 12 * dt; this.pos.y = Math.max(0, this.pos.y + this.vy * dt); if (this.pos.y === 0) this.vy = Math.max(0, this.vy);
      this.phase += this.speed * dt * 3.2;
      animatePerson(this.models.walk, this.phase, Math.min(0.9, this.speed * 0.28));
    } else if (m === 'drive' || m === 'bike') {
      const car = m === 'drive';
      const vmax = car ? (inp.boost ? 38 : 24) : (inp.boost ? 11 : 7);
      const acc = car ? 7.5 : 3.2, brake = car ? 14 : 6;
      if (f > 0.1) this.speed += (this.speed < 0 ? brake : acc) * f * dt;
      else if (f < -0.1) this.speed += (this.speed > 0.2 ? -brake : -acc * 0.6) * -f * dt * (this.speed > 0.2 ? 1 : 1);
      else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), (car ? 2.5 : 1.6) * dt);
      this.speed = THREE.MathUtils.clamp(this.speed, car ? -8 : -2, vmax);
      if (this.speed > vmax) this.speed = vmax;
      const steer = -s * (car ? 1.6 : 2.4) * Math.min(1, Math.abs(this.speed) / 5) / (1 + Math.abs(this.speed) * (car ? 0.035 : 0.05));
      this.yaw += steer * dt * Math.sign(this.speed || 1);
      this.bank = THREE.MathUtils.lerp(this.bank, car ? 0 : -steer * 0.35, Math.min(1, dt * 6));
      const fw = this.forward(); moveX = fw.x * this.speed * dt; moveZ = fw.z * this.speed * dt;
      for (const w of this.models[m].userData.wheels || []) w.rotation.x -= this.speed * dt / 0.34;
      if (!car) { this.phase += this.speed * dt * 2.2; const L = this.models.bike.userData.rider.userData.limbs; L.legL.rotation.x = Math.sin(this.phase) * 0.7 - 0.5; L.legR.rotation.x = -Math.sin(this.phase) * 0.7 - 0.5; }
    } else if (m === 'fly') {
      const vmax = inp.boost ? 75 : 40;
      this.yaw -= s * 1.4 * dt;
      this.speed = THREE.MathUtils.lerp(this.speed, f * vmax, Math.min(1, dt * (Math.abs(f) > 0.1 ? 0.8 : 0.6)));
      const vyT = (inp.up ? 1 : 0) * 14 - (inp.down ? 1 : 0) * 14;
      this.vy = THREE.MathUtils.lerp(this.vy, vyT, Math.min(1, dt * 3));
      this.pos.y = THREE.MathUtils.clamp(this.pos.y + this.vy * dt, 0, 1200);
      this.tilt = THREE.MathUtils.lerp(this.tilt, -this.speed / vmax * 0.28, Math.min(1, dt * 3));
      this.bank = THREE.MathUtils.lerp(this.bank, s * 0.25 * Math.min(1, Math.abs(this.speed) / 10 + 0.3), Math.min(1, dt * 3));
      const fw = this.forward(); moveX = fw.x * this.speed * dt; moveZ = fw.z * this.speed * dt;
      const airborne = this.pos.y > 0.3;
      this.rotorSpin = THREE.MathUtils.lerp(this.rotorSpin, airborne || inp.up ? 32 : 6, Math.min(1, dt * 1.5));
      this.models.fly.userData.rotor.rotation.y += this.rotorSpin * dt;
      this.models.fly.userData.trotor.rotation.x += this.rotorSpin * 1.6 * dt;
    }
    // collision with buildings (substepped for fast vehicles)
    const steps = Math.max(1, Math.ceil(Math.hypot(moveX, moveZ) / (M.r * 0.8)));
    let hit = false;
    for (let i = 0; i < steps; i++) {
      const c = collide(this.W, this.pos.x + moveX / steps, this.pos.z + moveZ / steps, M.r, this.pos.y);
      this.pos.x = c.x; this.pos.z = c.z; hit = hit || c.hit;
    }
    if (hit && (m === 'drive' || m === 'bike')) this.speed *= 0.86;
    if (hit && m === 'fly') this.speed *= 0.9;
    // keep inside the mapped city
    const B = window.LUBLIN.bounds;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, B[0] - 300, B[1] + 300);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, B[2] - 300, B[3] + 300);

    const g = this.models[m];
    g.position.copy(this.pos);
    g.rotation.set(0, 0, 0); g.rotation.order = 'YXZ';
    g.rotation.y = this.yaw;
    if (m === 'fly') { g.rotation.x = this.tilt; g.rotation.z = this.bank; }
    if (m === 'bike') g.rotation.z = this.bank;
  }
}
