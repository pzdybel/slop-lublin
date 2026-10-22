// js/main.js — Slop Lublin: boot, input, cameras, HUD and the render loop.
// A remix of "Slop New York" by Mr.doob (https://github.com/mrdoob/slop-newyork, MIT) for the streets of Lublin.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld, streetAt, shared } from './world.js';
import { SkySystem } from './sky.js';
import { Player, MODES } from './player.js';
import { Traffic } from './traffic.js';
import { CityMap } from './map.js';

const $ = (s) => document.querySelector(s);
const wait = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const progress = (p, msg) => { $('#ld-fill').style.width = `${p * 100}%`; if (msg) $('#ld-msg').textContent = msg; };

// landmarks (positions in the world frame; x east, z south, metres from Brama Krakowska)
const LANDMARKS = [
  { name: 'Brama Krakowska', sub: 'Plac Łokietka · Stare Miasto', x: -2, z: 34, look: [0, 18, 34], yaw: Math.PI / 2 + 0.2 },
  { name: 'Rynek Starego Miasta', sub: 'Trybunał Koronny', x: 103, z: -5, look: [103, 10, -5], yaw: 0.6 },
  { name: 'Zamek Lubelski', sub: 'Donżon · Kaplica Trójcy Świętej', x: 408, z: -286, look: [420, 18, -274], yaw: -2.4 },
  { name: 'Wieża Trynitarska', sub: 'Archikatedra · Plac Katedralny', x: 121, z: 85, look: [121, 35, 85], yaw: 2.2 },
  { name: 'Brama Grodzka', sub: 'Brama Żydowska · ul. Grodzka', x: 242, z: -200, look: [242, 8, -200], yaw: -0.8 },
  { name: 'Plac Litewski', sub: 'Krakowskie Przedmieście', x: -442, z: -73, look: [-442, 4, -73], yaw: 1.4 },
  { name: 'Centrum Spotkania Kultur', sub: 'Plac Teatralny', x: -1262, z: 126, look: [-1262, 14, 126], yaw: 1.2 },
  { name: 'Ogród Saski', sub: 'Aleje Racławickie', x: -1199, z: -117, look: [-1199, 4, -117], yaw: 0 },
  { name: 'Kampus UMCS', sub: 'Plac Marii Curie-Skłodowskiej', x: -1714, z: 295, look: [-1786, 40, 234], yaw: 1.3 },
  { name: 'Dworzec Lublin', sub: 'Dworcowa · Podzamcze', x: 55, z: 1760, look: [55, 8, 1760], yaw: 0 },
  { name: 'Arena Lublin', sub: 'Stadion · Kresowa', x: -641, z: 1719, look: [-641, 10, 1719], yaw: 0 },
  { name: 'Plac Singera', sub: 'Podzamcze', x: 655, z: -647, look: [655, 4, -647], yaw: 0 },
];
const SCENIC = {
  's-castle': { pos: [292, 52, -118], look: [418, 10, -282] },
  's-gate': { pos: [-62, 4.5, 40], look: [0, 15, 34], amp: 0.03 },
  's-trynit': { pos: [30, 70, 190], look: [121, 30, 85] },
  's-litewski': { pos: [-300, 40, 20], look: [-460, 5, -80] },
  's-csk': { pos: [-1150, 45, 230], look: [-1262, 10, 126] },
};

async function boot() {
  const canvas = $('#c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: !location.search.includes('nolog') });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 12000);

  progress(0.1, 'Rozkładam mapę Lublina…'); await wait();
  const W = buildWorld(scene, (p, m) => progress(p, m));
  await wait();
  const sky = new SkySystem(scene, renderer);
  const player = new Player(scene, W);
  progress(0.9, 'Uruchamiam trolejbusy…'); await wait();
  const traffic = new Traffic(scene, W);

  // GPS route ribbon in 3D
  const gpsMat = new THREE.MeshBasicMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.75, depthWrite: false });
  let gpsMesh = null;
  const setRoute = (flat) => {
    if (gpsMesh) { scene.remove(gpsMesh); gpsMesh.geometry.dispose(); gpsMesh = null; }
    map.route = flat; if (!flat || flat.length < 4) return;
    const pos = [];
    for (let i = 0; i < flat.length - 2; i += 2) {
      const x0 = flat[i], z0 = flat[i + 1], x1 = flat[i + 2], z1 = flat[i + 3]; const l = Math.hypot(x1 - x0, z1 - z0) || 1;
      const nx = -(z1 - z0) / l * 0.9, nz = (x1 - x0) / l * 0.9, y = 0.25;
      pos.push(x0 - nx, y, z0 - nz, x1 + nx, y, z1 + nz, x1 - nx, y, z1 - nz, x0 - nx, y, z0 - nz, x0 + nx, y, z0 + nz, x1 + nx, y, z1 + nz);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    gpsMesh = new THREE.Mesh(g, gpsMat); gpsMat.side = THREE.DoubleSide; gpsMesh.renderOrder = 20; scene.add(gpsMesh);
  };

  // post-processing (bloom for windows, lamps and headlights)
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.2, 0.5, 0.85);
  composer.addPass(bloom); composer.addPass(new OutputPass());

  const ctx = { lampHeads: W.lampHeads, bloom, onNight: (n) => traffic.setNight(n) };
  sky.set('golden', ctx);

  // ---------------- state
  player.teleport(-90, 40, Math.PI / 2 * -1 + Math.PI); // Krakowskie Przedmieście, facing Brama Krakowska (east)
  player.yaw = -Math.PI / 2;
  traffic.spawnAll(player.pos.x, player.pos.z);
  const cam = { mode: 'chase', yaw: player.yaw, pitch: 0.28, dist: 7, user: 0, scenicT: 0, auto: 0, autoIdx: 0 };
  const DIST = { walk: 6, drive: 11, bike: 6.5, fly: 26 };
  cam.dist = DIST.walk;

  // ---------------- HUD wiring
  const tp = $('#tp-list');
  for (const l of LANDMARKS) {
    const b = document.createElement('button');
    b.innerHTML = `${l.name}<small>${l.sub}</small>`;
    b.onclick = () => doTeleport(l.x, l.z, l.yaw);
    tp.appendChild(b);
  }
  const doTeleport = (x, z, yaw) => {
    // land on the nearest road so you don't spawn on a roof
    const s = nearestRoadPoint(x, z);
    player.teleport(s.x, s.z, yaw ?? player.yaw);
    cam.yaw = player.yaw; if (cam.mode.startsWith('s-') || cam.mode === 'auto') setCam('chase');
    traffic.spawnAll(player.pos.x, player.pos.z);
  };
  function nearestRoadPoint(x, z, maxK = player.mode === 'drive' ? 3 : 8) {
    let best = { x, z }, bd = Infinity;
    const RR = maxK <= 3 ? 6 : 2;
    for (let gx = Math.floor(x / W.RCELL) - RR; gx <= Math.floor(x / W.RCELL) + RR; gx++) for (let gz = Math.floor(z / W.RCELL) - RR; gz <= Math.floor(z / W.RCELL) + RR; gz++) {
      for (const [r, i] of W.roadIndex.get(`${gx},${gz}`) || []) {
        if (r.k > maxK || r.tu) continue;
        const ax = r.p[i], az = r.p[i + 1], dx = r.p[i + 2] - ax, dz = r.p[i + 3] - az, L = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)); const px = ax + dx * t, pz = az + dz * t;
        const d = Math.hypot(x - px, z - pz); if (d < bd) { bd = d; best = { x: px, z: pz, yaw: Math.atan2(-dx, -dz) }; }
      }
    }
    return best;
  }
  const setMode = (m) => {
    player.setMode(m); cam.dist = DIST[m]; cam.yaw = player.yaw;
    if (m === 'fly') { player.pos.y = 0; }
    if (m === 'drive') { const s = nearestRoadPoint(player.pos.x, player.pos.z, 3); player.teleport(s.x, s.z, s.yaw); cam.yaw = player.yaw; }
    document.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    $('#veh').textContent = MODES[m].name;
  };
  document.querySelectorAll('#modes button').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
  document.querySelectorAll('#tod button').forEach((b) => (b.onclick = () => {
    sky.set(b.dataset.tod, ctx); document.querySelectorAll('#tod button').forEach((x) => x.classList.toggle('on', x === b));
  }));
  const CAM_NAMES = { chase: 'Pościg', low: 'Nisko, akcja', fp: 'Z oczu / kokpit', auto: 'Auto-reżyser', 's-castle': 'Zamek', 's-gate': 'Brama Krakowska', 's-trynit': 'Wieża Trynitarska', 's-litewski': 'Plac Litewski', 's-csk': 'CSK' };
  const setCam = (m) => {
    cam.mode = m; cam.scenicT = 0; cam.auto = 0;
    document.querySelectorAll('.cams [data-cam]').forEach((b) => b.classList.toggle('on', b.dataset.cam === m));
    $('#cam-cur').firstChild.textContent = CAM_NAMES[m] + ' ';
    player.models[player.mode].visible = m !== 'fp' || player.mode === 'drive' || player.mode === 'fly' ? true : false;
  };
  document.querySelectorAll('.cams [data-cam]').forEach((b) => (b.onclick = () => setCam(b.dataset.cam)));
  const FOLLOW = ['chase', 'low', 'fp'];
  $('#cam-cur').onclick = () => setCam(FOLLOW[(FOLLOW.indexOf(cam.mode) + 1) % 3]);
  setCam('chase');

  const map = new CityMap($('#map'), $('#map-c'), {
    landmarks: LANDMARKS,
    onTeleport: (x, z) => { doTeleport(x, z); setTimeout(() => toggleMap(false), 200); },
    onRoute: (x, z) => {
      const r = traffic.route(player.pos.x, player.pos.z, x, z);
      setRoute(r); map.draw();
    },
  });
  const toggleMap = (on = $('#map').hidden) => {
    if (on) { map.open({ x: player.pos.x, z: player.pos.z, yaw: player.yaw }); const s = streetAt(W, player.pos.x, player.pos.z); $('#map-where').textContent = `Jesteś przy: ${s ? s.n : 'gdzieś w Lublinie'}`; }
    else map.close();
  };
  $('#btn-map').onclick = () => toggleMap(true);
  $('#map-close').onclick = () => toggleMap(false);

  // ---------------- input
  const keys = new Set();
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase(); keys.add(e.code);
    if (k === 'm') toggleMap(); if (k === 'escape') toggleMap(false);
    if (!$('#map').hidden) return;
    if (k === '1') setMode('walk'); if (k === '2') setMode('drive'); if (k === '3') setMode('bike'); if (k === '4') setMode('fly');
    if (k === '5') setCam('chase'); if (k === '6') setCam('low'); if (k === '7') setCam('fp');
    if (k === '8') setCam('s-castle'); if (k === '9') setCam('s-gate'); if (k === '0') setCam('s-trynit');
    if (k === 'v') $('#cam-cur').onclick();
    if (k === 'h') document.body.classList.toggle('hide-ui');
    if (k === 'n') { const order = ['golden', 'noon', 'blue', 'night']; const i = (order.indexOf(sky.name) + 1) % 4; document.querySelector(`#tod [data-tod=${order[i]}]`).onclick(); }
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' && touchStickActive) return; drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    cam.yaw -= (e.clientX - drag.x) * 0.005; cam.pitch = THREE.MathUtils.clamp(cam.pitch + (e.clientY - drag.y) * 0.004, -0.35, 1.45);
    drag = { x: e.clientX, y: e.clientY }; cam.user = 2.5;
  });
  canvas.addEventListener('pointerup', () => (drag = null));
  canvas.addEventListener('wheel', (e) => { cam.dist = THREE.MathUtils.clamp(cam.dist * Math.exp(e.deltaY * 0.001), 2.5, 400); }, { passive: true });

  // touch joystick
  let touchStickActive = false; const stick = { x: 0, y: 0 }; const touchBtn = { up: false, down: false };
  if (matchMedia('(pointer: coarse)').matches) {
    $('#touch').hidden = false; $('.help').hidden = true;
    const st = $('#stick'), knob = st.querySelector('i');
    const move = (e) => {
      const r = st.getBoundingClientRect(); let dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2;
      const l = Math.hypot(dx, dy), m = 45; if (l > m) { dx *= m / l; dy *= m / l; }
      stick.x = dx / m; stick.y = dy / m; knob.style.transform = `translate(${dx}px,${dy}px)`;
    };
    st.addEventListener('pointerdown', (e) => { touchStickActive = true; st.setPointerCapture(e.pointerId); move(e); e.stopPropagation(); });
    st.addEventListener('pointermove', (e) => touchStickActive && move(e));
    st.addEventListener('pointerup', () => { touchStickActive = false; stick.x = stick.y = 0; knob.style.transform = ''; });
    for (const [id, k] of [['#t-up', 'up'], ['#t-down', 'down']]) {
      $(id).addEventListener('pointerdown', () => (touchBtn[k] = true)); $(id).addEventListener('pointerup', () => (touchBtn[k] = false)); $(id).addEventListener('pointerleave', () => (touchBtn[k] = false));
    }
  }
  const input = () => {
    const k = (c) => keys.has(c);
    return {
      fwd: (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0) - stick.y,
      side: (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0) + stick.x,
      boost: k('ShiftLeft') || k('ShiftRight'),
      up: k('Space') || k('KeyE') || touchBtn.up,
      down: k('KeyC') || k('KeyQ') || k('ControlLeft') || touchBtn.down,
    };
  };

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  });

  // ---------------- camera
  const tmp = new THREE.Vector3(), look = new THREE.Vector3(), camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  camPos.set(player.pos.x + 6, 3, player.pos.z); camLook.copy(player.pos);
  const AUTO = ['orbit', 'side', 'aerial', 'front'];
  function updateCamera(dt, t) {
    const p = player.pos, m = player.mode;
    // follow cams auto-align behind the player when moving and the user isn't steering the view
    cam.user = Math.max(0, cam.user - dt);
    const moving = Math.abs(player.speed) > 0.5;
    if (cam.user <= 0 && moving && m !== 'walk') {
      const target = player.yaw + (player.speed < -0.5 ? Math.PI : 0);
      cam.yaw += Math.atan2(Math.sin(target - cam.yaw), Math.cos(target - cam.yaw)) * Math.min(1, dt * 2.5);
    }
    let desiredPos = tmp, desiredLook = look, snap = false, lerpK = 8;
    const fw = new THREE.Vector3(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
    const eyeH = m === 'fly' ? 2 : MODES[m].eye;
    if (cam.mode === 'chase' || cam.mode === 'low') {
      const pitch = cam.mode === 'low' ? Math.max(-0.1, cam.pitch * 0.25 - 0.05) : cam.pitch;
      const dist = cam.mode === 'low' ? cam.dist * 0.75 : cam.dist;
      desiredPos.set(p.x - fw.x * dist * Math.cos(pitch), p.y + eyeH + dist * Math.sin(pitch) + (cam.mode === 'low' ? -0.6 : 0), p.z - fw.z * dist * Math.cos(pitch));
      desiredPos.y = Math.max(0.35, desiredPos.y);
      desiredLook.set(p.x + fw.x * 2, p.y + eyeH * (cam.mode === 'low' ? 1.2 : 0.85), p.z + fw.z * 2);
      lerpK = 10;
    } else if (cam.mode === 'fp') {
      const pf = player.forward();
      const yaw = cam.user > 0 ? cam.yaw : player.yaw; if (cam.user <= 0) cam.yaw = player.yaw;
      const lf = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const off = m === 'drive' ? new THREE.Vector3(-0.38, 0, 0) : m === 'fly' ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3();
      const right = new THREE.Vector3(-pf.z, 0, pf.x);
      desiredPos.set(p.x + pf.x * (m === 'fly' ? -1.0 : m === 'drive' ? -0.2 : 0.15) + right.x * off.x, p.y + eyeH, p.z + pf.z * (m === 'fly' ? -1.0 : m === 'drive' ? -0.2 : 0.15) + right.z * off.x);
      desiredLook.set(desiredPos.x + lf.x * 10, desiredPos.y - Math.tan(cam.pitch - 0.28) * 10 + (m === 'fly' ? -2 : 0), desiredPos.z + lf.z * 10);
      snap = true;
    } else if (cam.mode.startsWith('s-')) {
      const s = SCENIC[cam.mode]; cam.scenicT += dt;
      const a = Math.sin(cam.scenicT * 0.05) * (s.amp ?? 0.25);
      const dx = s.pos[0] - s.look[0], dz = s.pos[2] - s.look[2];
      desiredPos.set(s.look[0] + dx * Math.cos(a) - dz * Math.sin(a), s.pos[1], s.look[2] + dx * Math.sin(a) + dz * Math.cos(a));
      desiredLook.set(...s.look); lerpK = 2; if (cam.scenicT <= dt * 1.01) snap = true;
    } else if (cam.mode === 'auto') {
      cam.auto += dt; if (cam.auto > 9) { cam.auto = 0; cam.autoIdx = (cam.autoIdx + 1) % AUTO.length; snap = true; }
      const sh = AUTO[cam.autoIdx], pf = player.forward(), right = new THREE.Vector3(-pf.z, 0, pf.x);
      if (sh === 'orbit') { const a = t * 0.15; desiredPos.set(p.x + Math.cos(a) * 18, p.y + 7, p.z + Math.sin(a) * 18); }
      if (sh === 'side') desiredPos.copy(p).addScaledVector(right, 7).add(new THREE.Vector3(0, 1.5, 0)).addScaledVector(pf, 3);
      if (sh === 'aerial') desiredPos.set(p.x - 40, p.y + 90, p.z + 60);
      if (sh === 'front') desiredPos.copy(p).addScaledVector(pf, 9 + Math.abs(player.speed) * 0.4).add(new THREE.Vector3(0, 1.2, 0));
      desiredLook.set(p.x, p.y + 1.2, p.z); lerpK = 3;
    }
    const k = 1 - Math.exp(-lerpK * dt);
    if (snap) { camPos.copy(desiredPos); camLook.copy(desiredLook); }
    else { camPos.lerp(desiredPos, k); camLook.lerp(desiredLook, Math.min(1, k * 1.5)); }
    camera.position.copy(camPos); camera.lookAt(camLook);
    camera.fov = THREE.MathUtils.lerp(camera.fov, (cam.mode === 'fp' ? 72 : 60) + Math.min(14, Math.abs(player.speed) * 0.35), 0.08);
    camera.updateProjectionMatrix();
  }

  // ---------------- HUD updates
  let hudT = 0, frames = 0, fpsT = 0;
  const near = (x, z) => { let best = null, bd = 140; for (const l of LANDMARKS) { const d = Math.hypot(l.x - x, l.z - z); if (d < bd) { bd = d; best = l; } } return best; };
  function hud(dt) {
    hudT += dt; frames++; fpsT += dt;
    if (fpsT > 0.5) { $('#fps').textContent = Math.round(frames / fpsT); frames = 0; fpsT = 0; }
    $('#spd').textContent = Math.round(Math.abs(player.speed) * 3.6);
    $('#alt').textContent = Math.round(player.pos.y);
    $('#compass').style.transform = `rotate(${-camera.rotation.y}rad)`;
    const cy = Math.atan2(camLook.x - camPos.x, camLook.z - camPos.z);
    $('#compass').style.transform = `rotate(${cy - Math.PI}rad)`;
    if (hudT > 0.25) {
      hudT = 0;
      const s = streetAt(W, player.pos.x, player.pos.z);
      $('#street').textContent = s ? s.n : (player.pos.y > 30 ? 'Nad Lublinem' : 'Lublin');
      const l = near(player.pos.x, player.pos.z);
      $('#near').textContent = l ? `w pobliżu: ${l.name}` : 'Lublin · Lubelskie';
    }
  }

  // ---------------- loop
  progress(1, 'Gotowe — Lublin, miasto inspiracji.');
  await wait();
  $('#hud').hidden = false;
  $('#loader').classList.add('out'); setTimeout(() => $('#loader').remove(), 700);
  const clock = new THREE.Clock(); let t = 0;
  const focus = new THREE.Vector3();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.05, clock.getDelta()); t += dt; shared.uTime.value = t;
    if ($('#map').hidden) {
      const camYaw = Math.atan2(-(camLook.x - camPos.x), -(camLook.z - camPos.z));
      player.update(dt, input(), camYaw);
      if (player.mode === 'walk' && cam.user <= 0 && Math.abs(player.speed) > 0.3) {
        // gentle auto-follow for walking too
        cam.yaw += Math.atan2(Math.sin(player.yaw - cam.yaw), Math.cos(player.yaw - cam.yaw)) * Math.min(1, dt * 0.8);
      }
      updateCamera(dt, t);
      focus.copy(cam.mode.startsWith('s-') ? camLook : player.pos);
      traffic.update(dt, focus, player.mode === 'drive' || player.mode === 'bike' ? player.pos : null);
      sky.update(focus);
      hud(dt);
    }
    composer.render();
  });
  window.__slop = { player, cam, setCam, setMode, sky, ctx, renderer, scene, camera, W, traffic, doTeleport };
}

boot().catch((e) => { console.error(e); $('#ld-msg').textContent = 'Błąd: ' + e.message; });
