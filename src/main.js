import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { createNoise2D } from 'simplex-noise';
import { plantIsland, tickWind } from './vegetation.js';

// ---------------------------------------------------------------- setup
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const SEED = parseInt(params.get('seed') || '1337', 10);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);
const rand = (a, b) => a + (b - a) * rng();
const noiseA = createNoise2D(mulberry32(SEED + 101));
const noiseB = createNoise2D(mulberry32(SEED + 202));
const noiseC = createNoise2D(mulberry32(SEED + 303));
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

const WORLD = 640;          // terrain size (m)
const SEG = 320;            // terrain segments -> 2 m cells
const CELL = WORLD / SEG;
const HALF = WORLD / 2;
const ISLAND_R = 260;
const EYE = 1.7;

// ---------------------------------------------------------------- terrain function
function fbm(x, z, oct) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noiseA(x * f, z * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
const hills = [];
for (let i = 0; i < 6; i++) {
  const a = rand(0, Math.PI * 2), r = rand(45, 150);
  hills.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, h: rand(10, 24), r: rand(20, 38) });
}
function rawHeight(x, z) {
  const dist = Math.hypot(x, z);
  const d = dist / ISLAND_R + 0.17 * noiseB(x / 130, z / 130);
  const mask = 1 - smooth(0.5, 1.05, d);
  const e = fbm(x / 170, z / 170, 4);
  let h = mask * (10 + 6 * e) - 5;
  for (const hl of hills) {
    const dx = x - hl.x, dz = z - hl.z;
    h += mask * hl.h * Math.exp(-(dx * dx + dz * dz) / (hl.r * hl.r));
  }
  h += 0.5 * noiseC(x / 16, z / 16) * mask;
  return h;
}

// height grid (exactly the mesh vertices)
const N = SEG + 1;
const heights = new Float32Array(N * N);
for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) heights[iz * N + ix] = rawHeight(ix * CELL - HALF, iz * CELL - HALF);

// interpolates exactly like PlaneGeometry triangles (diagonal from (0,1) to (1,0))
function terrainHeight(x, z) {
  let fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
  if (fx < 0 || fz < 0 || fx >= SEG || fz >= SEG) return -5;
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const u = fx - ix, v = fz - iz;
  const ha = heights[iz * N + ix], hd = heights[iz * N + ix + 1];
  const hb = heights[(iz + 1) * N + ix], hc = heights[(iz + 1) * N + ix + 1];
  if (u + v <= 1) return ha + (hd - ha) * u + (hb - ha) * v;
  return hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
}
function terrainNormalY(x, z) {
  const e = 1.0;
  const dx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
  const dz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  return 2 * e / Math.hypot(dx, 2 * e, dz);
}

// ---------------------------------------------------------------- ramps (sloped walkable boxes + platforms)
const ramps = [];
function roughness(x, z, r) {
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    for (const rr of [r * 0.5, r]) {
      const h = terrainHeight(x + Math.cos(a) * rr, z + Math.sin(a) * rr);
      mn = Math.min(mn, h); mx = Math.max(mx, h);
    }
  }
  return { range: mx - mn, min: mn };
}
function findFlat(cx, cz, searchR, tries, minH = 3, maxH = 16) {
  let best = null;
  for (let i = 0; i < tries; i++) {
    const a = rand(0, Math.PI * 2), r = Math.sqrt(rng()) * searchR;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    const h = terrainHeight(x, z);
    if (h < minH || h > maxH) continue;
    const rg = roughness(x, z, 12).range;
    if (!best || rg < best.rg) best = { x, z, rg };
  }
  return best;
}
function rampSurface(rp, x, z) {
  const dx = x - rp.sx, dz = z - rp.sz;
  const c = Math.cos(rp.yaw), s = Math.sin(rp.yaw);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  if (Math.abs(lx) <= rp.W / 2 && lz >= 0 && lz <= rp.L) return rp.base + rp.rise * (lz / rp.L);
  if (rp.PL > 0 && Math.abs(lx) <= rp.PL / 2 && lz > rp.L && lz <= rp.L + rp.PL) return rp.base + rp.rise;
  return -Infinity;
}
function insideRamp(rp, x, z, m) {
  const dx = x - rp.sx, dz = z - rp.sz;
  const c = Math.cos(rp.yaw), s = Math.sin(rp.yaw);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const hw = Math.max(rp.W, rp.PL) / 2 + m;
  return Math.abs(lx) <= hw && lz >= -m && lz <= rp.L + rp.PL + m;
}
function nearAnyRamp(x, z, m) { for (const rp of ramps) if (insideRamp(rp, x, z, m)) return true; return false; }
function rampsHeight(x, z) { let h = -Infinity; for (const rp of ramps) h = Math.max(h, rampSurface(rp, x, z)); return h; }
function groundHeight(x, z) { return Math.max(terrainHeight(x, z), rampsHeight(x, z)); }
const localToWorld = (rp, lx, lz) => {
  const c = Math.cos(rp.yaw), s = Math.sin(rp.yaw);
  return { x: rp.sx + lx * c + lz * s, z: rp.sz - lx * s + lz * c };
};

// spawn on a flat area near the middle
const spawnSpot = findFlat(0, 0, 110, 600) || { x: 0, z: 0 };
const spawn = { x: spawnSpot.x, z: spawnSpot.z };

// ramp 1 + ramp 2 form a two-stage lookout tower
{
  const yaw = rand(0, Math.PI * 2);
  const start = { x: spawn.x + Math.sin(yaw) * 10, z: spawn.z + Math.cos(yaw) * 10 };
  const r1 = { sx: start.x, sz: start.z, yaw, L: 16, W: 3.6, PL: 6, rise: 4.5, base: terrainHeight(start.x, start.z) - 0.05 };
  ramps.push(r1);
  const pc = localToWorld(r1, 0, r1.L + r1.PL / 2);
  const yaw2 = yaw + Math.PI / 2;
  const s2 = { x: pc.x + Math.sin(yaw2) * (r1.PL / 2), z: pc.z + Math.cos(yaw2) * (r1.PL / 2) };
  ramps.push({ sx: s2.x, sz: s2.z, yaw: yaw2, L: 14, W: 3.6, PL: 6, rise: 4.5, base: r1.base + r1.rise });
}
// a few standalone ramps scattered over the island
for (let i = 0; i < 5; i++) {
  const a = (i / 5) * Math.PI * 2 + rand(-0.3, 0.3);
  const spot = findFlat(spawn.x + Math.cos(a) * 60, spawn.z + Math.sin(a) * 60, 40, 200);
  if (!spot) continue;
  const yaw = rand(0, Math.PI * 2);
  const L = rand(10, 18), rise = rand(2.5, 5);
  const rp = { sx: spot.x, sz: spot.z, yaw, L, W: rand(3, 4.5), PL: rand(4, 7), rise, base: terrainHeight(spot.x, spot.z) - 0.05 };
  let clash = false;
  for (const o of ramps) if (Math.hypot(o.sx - rp.sx, o.sz - rp.sz) < 30) clash = true;
  if (!clash) ramps.push(rp);
}
// footprint minimum terrain for each ramp (so the boxes reach into the ground)
for (const rp of ramps) {
  let mn = Infinity;
  for (let lz = 0; lz <= rp.L + rp.PL; lz += 1) for (let lx = -3; lx <= 3; lx += 1) {
    const p = localToWorld(rp, lx, lz); mn = Math.min(mn, terrainHeight(p.x, p.z));
  }
  rp.bottom = mn - 1.5;
}

// ---------------------------------------------------------------- renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: DEBUG });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.75;
renderer.domElement.id = 'game';
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const FOG_COLOR = new THREE.Color(0xb9d3e6);
scene.fog = new THREE.Fog(FOG_COLOR, 140, 750);
scene.background = FOG_COLOR;

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 3000);

// sky + sun
const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 42), THREE.MathUtils.degToRad(150));
// gradient sky dome with a sun disc + glow (not tone mapped, not fogged; follows the camera)
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(1500, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: { top: { value: new THREE.Color(0x2f6fc4) }, mid: { value: new THREE.Color(0x7fb2e6) }, horizon: { value: FOG_COLOR.clone() }, sunDir: { value: sunDir } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 top, mid, horizon, sunDir; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float h = max(d.y, 0.0);
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.18, h)); c = mix(c, top, smoothstep(0.18, 0.9, h));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        c += vec3(1.0, 0.92, 0.75) * (pow(s, 900.0) * 3.0 + pow(s, 40.0) * 0.25);
        if (d.y < 0.0) c = horizon;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  })
);
sky.renderOrder = -1;
sky.frustumCulled = false;
scene.add(sky);

const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5a6b3a, 1.3);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const SH = 70;
Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 500 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

// ---------------------------------------------------------------- terrain mesh
const tGeo = new THREE.PlaneGeometry(WORLD, WORLD, SEG, SEG);
tGeo.rotateX(-Math.PI / 2);
{
  const pos = tGeo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const sand = new THREE.Color(0xdcc89a), wetSand = new THREE.Color(0xa8946a);
  const grassA = new THREE.Color(0x4d8a2e), grassB = new THREE.Color(0x7a9a3a), grassDark = new THREE.Color(0x3a6b25);
  const rock = new THREE.Color(0x7c7670), rockDark = new THREE.Color(0x5e5a55);
  const c = new THREE.Color(), g = new THREE.Color(), r = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const ix = Math.round((x + HALF) / CELL), iz = Math.round((z + HALF) / CELL);
    const h = heights[iz * N + ix];
    pos.setY(i, h);
    const ny = terrainNormalY(x, z);
    // grass with variation
    const gv = 0.5 + 0.5 * noiseB(x / 25, z / 25);
    g.copy(grassA).lerp(grassB, gv).lerp(grassDark, 0.7 * (0.5 + 0.5 * noiseC(x / 7, z / 7)));
    r.copy(rock).lerp(rockDark, 0.5 + 0.5 * noiseC(x / 5, z / 5));
    c.copy(h < 0.2 ? wetSand : sand);
    if (h < 0.2) c.lerp(sand, smooth(-1.5, 0.2, h));
    c.lerp(g, smooth(1.3, 2.4, h + 0.4 * noiseC(x / 9, z / 9)));
    const rockT = Math.max(smooth(0.86, 0.72, ny), smooth(24, 32, h) * 0.8);
    if (h > 1.0) c.lerp(r, rockT);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  tGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  tGeo.computeVertexNormals();
}
const terrain = new THREE.Mesh(tGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
terrain.receiveShadow = true;
terrain.castShadow = true;
scene.add(terrain);

// ---------------------------------------------------------------- water (procedural tiling normal map)
function makeWaterNormals(size = 256) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const waves = [];
  const wr = mulberry32(SEED + 7);
  for (let k = 0; k < 10; k++) waves.push({ kx: Math.floor(wr() * 9) - 4, ky: Math.floor(wr() * 9) - 4, p: wr() * 6.28, a: 0.5 + wr() });
  const H = (i, j) => { let s = 0; for (const w of waves) s += w.a * Math.sin(2 * Math.PI * (w.kx * i + w.ky * j) / size + w.p); return s; };
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const dx = H(i + 1, j) - H(i - 1, j), dy = H(i, j + 1) - H(i, j - 1);
    const n = new THREE.Vector3(-dx * 2, -dy * 2, 1).normalize();
    const o = (j * size + i) * 4;
    img.data[o] = (n.x * 0.5 + 0.5) * 255; img.data[o + 1] = (n.y * 0.5 + 0.5) * 255; img.data[o + 2] = (n.z * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(400, 400);
  return t;
}
const waterNormals = makeWaterNormals();
const water = new THREE.Mesh(
  new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0x2a7f9e, roughness: 0.18, metalness: 0.15, transparent: true, opacity: 0.82, normalMap: waterNormals, normalScale: new THREE.Vector2(0.35, 0.35) })
);
water.receiveShadow = true;
scene.add(water);

// ---------------------------------------------------------------- ramp meshes
function plankTexture() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
  const ctx = cv.getContext('2d');
  const pr = mulberry32(SEED + 9);
  for (let i = 0; i < 8; i++) {
    const l = 38 + pr() * 14;
    ctx.fillStyle = `hsl(28, 42%, ${l}%)`;
    ctx.fillRect(0, i * 16, 128, 16);
    ctx.fillStyle = 'rgba(40,20,5,0.55)'; ctx.fillRect(0, i * 16, 128, 2);
    for (let k = 0; k < 14; k++) { ctx.fillStyle = `rgba(60,30,10,${0.1 + pr() * 0.15})`; ctx.fillRect(pr() * 128, i * 16 + 3 + pr() * 11, 10 + pr() * 40, 1); }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const plankTex = plankTexture();
function rampMaterial(rx, ry) { const t = plankTex.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }); }
for (const rp of ramps) {
  const grp = new THREE.Group();
  // wedge: a box whose top face slopes from base to base+rise
  const wedge = new THREE.BoxGeometry(rp.W, 1, rp.L);
  const p = wedge.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const lz = p.getZ(i) + rp.L / 2;
    p.setZ(i, lz);
    p.setY(i, p.getY(i) > 0 ? rp.base + rp.rise * (lz / rp.L) : rp.bottom);
  }
  wedge.computeVertexNormals();
  const wm = new THREE.Mesh(wedge, rampMaterial(rp.W / 2, rp.L / 2));
  grp.add(wm);
  if (rp.PL > 0) {
    const top = rp.base + rp.rise;
    const hgt = top - rp.bottom;
    const plat = new THREE.Mesh(new THREE.BoxGeometry(rp.PL, hgt, rp.PL), rampMaterial(rp.PL / 2, rp.PL / 2));
    plat.position.set(0, rp.bottom + hgt / 2, rp.L + rp.PL / 2);
    grp.add(plat);
  }
  grp.position.set(rp.sx, 0, rp.sz);
  grp.rotation.y = rp.yaw;
  grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(grp);
}

// ---------------------------------------------------------------- scattering / collision
const trunks = [];
const TGRID = 8, trunkGrid = new Map();
function addTrunk(x, z, r) {
  const t = { x, z, r }; trunks.push(t);
  const k = `${Math.floor(x / TGRID)},${Math.floor(z / TGRID)}`;
  if (!trunkGrid.has(k)) trunkGrid.set(k, []);
  trunkGrid.get(k).push(t);
}
const occupied = [];
function scatter(count, { minH = 2.4, maxH = 30, minNy = 0.88, spacing = 0, rampMargin = 2, maxTries = count * 30, clusterNoise = null }) {
  const out = [];
  let tries = 0;
  while (out.length < count && tries++ < maxTries) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * ISLAND_R;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = terrainHeight(x, z);
    if (h < minH || h > maxH) continue;
    if (terrainNormalY(x, z) < minNy) continue;
    if (nearAnyRamp(x, z, rampMargin)) continue;
    if (Math.hypot(x - spawn.x, z - spawn.z) < (spacing > 0 ? 16 : 4)) continue;
    if (clusterNoise && noiseB(x / clusterNoise.s, z / clusterNoise.s) < clusterNoise.t) continue;
    if (spacing > 0) {
      let ok = true;
      for (const o of occupied) { const dx = o.x - x, dz = o.z - z; if (dx * dx + dz * dz < spacing * spacing) { ok = false; break; } }
      if (!ok) continue;
      occupied.push({ x, z });
    }
    out.push({ x, y: h, z });
  }
  return out;
}

// ---------------------------------------------------------------- player
const controls = new PointerLockControls(camera, document.body);
const player = { pos: new THREE.Vector3(spawn.x, groundHeight(spawn.x, spawn.z), spawn.z), vel: new THREE.Vector3(), onGround: true };
const PR = 0.35, WALK = 6, SPRINT = 11, GRAV = 24, JUMP = 8.2, STEP = 0.6;
const SUPER_JUMP = 36.7; // ~28 m peak vs ~1.4 m normal jump
const trampolines = [];
const diamonds = [];
const diamondDummy = new THREE.Object3D();
let diamondMesh = null;
let vegStats = { loaded: 0, trees: 0, bushes: 0, grass: 0, flowers: 0, treePts: [] };
let score = 0, collected = 0, playStarted = false, elapsed = 0, won = false, bootReady = false;
// look towards the first ramp
{
  const rp = ramps[0];
  const yaw = Math.atan2(-(rp.sx - spawn.x), -(rp.sz - spawn.z));
  camera.rotation.set(-0.02, yaw + 0.35, 0, 'YXZ');
  if (params.has('yaw')) camera.rotation.y = parseFloat(params.get('yaw'));
  if (params.has('pitch')) camera.rotation.x = parseFloat(params.get('pitch'));
}
const keys = {};
addEventListener('keydown', (e) => { keys[e.code] = true; if (e.code === 'Space') e.preventDefault(); });
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

const overlay = document.getElementById('overlay');
const winEl = document.getElementById('win');
const diamondHud = document.getElementById('diamond-count');
const scoreHud = document.getElementById('score-count');
const timerHud = document.getElementById('timer');
function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function refreshHud() {
  diamondHud.textContent = `${collected} / ${diamonds.length || 0}`;
  scoreHud.textContent = String(score);
  timerHud.textContent = fmtTime(elapsed);
}
function showWin() {
  won = true;
  document.getElementById('win-stats').textContent = `Time ${fmtTime(elapsed)}  ·  Score ${score}`;
  winEl.classList.add('show');
  overlay.classList.add('hidden');
  if (controls.isLocked) controls.unlock();
}
function resetRun() {
  won = false;
  score = 0;
  collected = 0;
  elapsed = 0;
  playStarted = true;
  winEl.classList.remove('show');
  for (const gem of diamonds) {
    gem.collected = false;
    gem.pop = 0;
  }
  syncDiamondInstances(0);
  player.pos.set(spawn.x, groundHeight(spawn.x, spawn.z), spawn.z);
  player.vel.set(0, 0, 0);
  player.onGround = true;
  camera.position.set(player.pos.x, player.pos.y + EYE, player.pos.z);
  refreshHud();
  controls.lock();
}
overlay.addEventListener('click', () => {
  if (!bootReady || won) return;
  controls.lock();
});
document.getElementById('again').addEventListener('click', (e) => { e.stopPropagation(); resetRun(); });
winEl.addEventListener('click', resetRun);
controls.addEventListener('lock', () => {
  overlay.classList.add('hidden');
  if (!playStarted) playStarted = true;
});
controls.addEventListener('unlock', () => {
  if (won) return;
  overlay.classList.remove('hidden');
  document.getElementById('sub').textContent = 'Paused';
  document.getElementById('start').textContent = 'Click to resume';
});
if (DEBUG) overlay.classList.add('hidden');

function hitTrampoline() {
  for (const pad of trampolines) {
    const dx = player.pos.x - pad.x, dz = player.pos.z - pad.z;
    if (dx * dx + dz * dz <= pad.r * pad.r) return pad;
  }
  return null;
}

function makeTrampolineMesh() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a3d45, roughness: 0.42, metalness: 0.72 });
  const spring = new THREE.MeshStandardMaterial({ color: 0x8a8f98, roughness: 0.35, metalness: 0.8 });
  const matMat = new THREE.MeshStandardMaterial({ color: 0x3d8bff, roughness: 0.38, metalness: 0.08, emissive: 0x12306a, emissiveIntensity: 0.28 });
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.82, 8), metal);
    leg.position.set(x * 0.98, 0.41, z * 0.98);
    g.add(leg);
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 6, 10), spring);
    coil.position.set(x * 0.92, 0.78, z * 0.92);
    coil.rotation.x = Math.PI / 2;
    g.add(coil);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.075, 8, 28), metal);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.84;
  g.add(ring);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.07, 28), matMat);
  pad.position.y = 0.84;
  pad.name = 'mat';
  g.add(pad);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function diamondGeometry() {
  const geo = new THREE.OctahedronGeometry(0.38, 0);
  geo.scale(0.72, 1.18, 0.72);
  return geo;
}

function placeDiamond(x, y, z, { sky = false, points = 100 } = {}) {
  diamonds.push({
    x, y, z, sky, points,
    collected: false, pop: 0,
    baseY: y, phase: rand(0, Math.PI * 2),
  });
}

function syncDiamondInstances(time) {
  if (!diamondMesh) return;
  for (let i = 0; i < diamonds.length; i++) {
    const gem = diamonds[i];
    if (gem.collected && gem.pop >= 1) {
      diamondDummy.scale.setScalar(0.0001);
      diamondDummy.position.set(gem.x, gem.y, gem.z);
    } else {
      const bob = Math.sin(time * 2.2 + gem.phase) * 0.22;
      let s = 1;
      let lift = 0;
      if (gem.pop > 0) {
        const t = gem.pop;
        s = Math.max(0.001, 1 + t * 0.85 - t * t * 1.7);
        lift = t * 1.35;
      }
      diamondDummy.position.set(gem.x, gem.baseY + bob + lift, gem.z);
      diamondDummy.rotation.set(0.35, time * 1.8 + gem.phase, 0.15);
      diamondDummy.scale.setScalar(s);
    }
    diamondDummy.updateMatrix();
    diamondMesh.setMatrixAt(i, diamondDummy.matrix);
  }
  diamondMesh.instanceMatrix.needsUpdate = true;
}

function updateDiamonds(dt, time) {
  if (won) return;
  const px = player.pos.x, py = player.pos.y + 1.05, pz = player.pos.z;
  for (const gem of diamonds) {
    if (gem.collected) {
      if (gem.pop < 1) gem.pop = Math.min(1, gem.pop + dt * 3.6);
      continue;
    }
    const dx = px - gem.x, dy = py - gem.baseY, dz = pz - gem.z;
    if (dx * dx + dz * dz < 1.45 * 1.45 && Math.abs(dy) < 1.9) {
      gem.collected = true;
      gem.pop = 0.001;
      collected += 1;
      score += gem.points;
      refreshHud();
      if (collected >= diamonds.length) showWin();
    }
  }
  syncDiamondInstances(time);
}

function updateTrampolines(dt) {
  for (const pad of trampolines) {
    pad.squash = Math.max(0, pad.squash - dt * 2.8);
    if (pad.mat) pad.mat.scale.y = 1 - 0.48 * Math.sin(pad.squash * Math.PI);
  }
}

function toMap(x, z) {
  return [(x / MM_RANGE * 0.5 + 0.5) * MM, (z / MM_RANGE * 0.5 + 0.5) * MM];
}

function stampTrees(pts) {
  const bctx = mmBase.getContext('2d');
  bctx.fillStyle = 'rgba(20,60,25,0.55)';
  for (const p of pts) {
    const [u, v] = toMap(p.x, p.z);
    bctx.fillRect(u - 0.8, v - 0.8, 1.6, 1.6);
  }
}

function buildTrampolines() {
  const spots = [];
  for (let i = 0; i < 18 && spots.length < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rand(-0.25, 0.25);
    const found = findFlat(Math.cos(a) * 70, Math.sin(a) * 70, 55, 220, 2.6, 16);
    if (!found) continue;
    if (Math.hypot(found.x - spawn.x, found.z - spawn.z) < 22) continue;
    if (nearAnyRamp(found.x, found.z, 8)) continue;
    if (spots.some((s) => Math.hypot(s.x - found.x, s.z - found.z) < 36)) continue;
    spots.push({ x: found.x, z: found.z, y: terrainHeight(found.x, found.z) });
  }
  for (const spot of spots) {
    const mesh = makeTrampolineMesh();
    const s = rand(1.05, 1.25);
    mesh.position.set(spot.x, spot.y, spot.z);
    mesh.rotation.y = rand(0, Math.PI * 2);
    mesh.scale.setScalar(s);
    scene.add(mesh);
    const mat = mesh.getObjectByName('mat');
    trampolines.push({
      x: spot.x, z: spot.z, y: spot.y,
      padY: spot.y + 0.84 * s,
      r: 1.15 * s,
      mesh, mat, squash: 0,
    });
  }
}

function buildDiamonds() {
  const ground = scatter(40, { minH: 2.4, maxH: 26, minNy: 0.8, spacing: 14, rampMargin: 2.5, maxTries: 40 * 40 });
  for (const p of ground) placeDiamond(p.x, p.y + 1.25, p.z, { points: 100 });
  for (const rp of ramps) {
    if (rp.PL <= 0) continue;
    const top = localToWorld(rp, 0, rp.L + rp.PL * 0.5);
    placeDiamond(top.x, rp.base + rp.rise + 1.35, top.z, { points: 150 });
  }
  for (const pad of trampolines) {
    placeDiamond(pad.x, pad.padY + 19.5, pad.z, { sky: true, points: 250 });
    const a = rand(0, Math.PI * 2);
    placeDiamond(pad.x + Math.cos(a) * 3.2, pad.padY + 23.5, pad.z + Math.sin(a) * 3.2, { sky: true, points: 250 });
  }
  const extraHills = scatter(6, { minH: 14, maxH: 30, minNy: 0.82, spacing: 18, rampMargin: 4 });
  for (const p of extraHills) placeDiamond(p.x, p.y + 1.3, p.z, { points: 150 });

  diamondMesh = new THREE.InstancedMesh(
    diamondGeometry(),
    new THREE.MeshPhysicalMaterial({
      color: 0x7af2ff,
      emissive: 0x2aa8ff,
      emissiveIntensity: 0.85,
      metalness: 0.15,
      roughness: 0.08,
      transparent: true,
      opacity: 0.92,
      transmission: 0.35,
      ior: 2.3,
      reflectivity: 1,
    }),
    Math.max(diamonds.length, 1)
  );
  diamondMesh.castShadow = true;
  diamondMesh.frustumCulled = false;
  scene.add(diamondMesh);
  syncDiamondInstances(0);
  refreshHud();
}

function walkable(x, z) {
  if (terrainHeight(x, z) < -0.7 && rampsHeight(x, z) === -Infinity) return false; // deep water
  return groundHeight(x, z) <= player.pos.y + STEP;
}
function pushOutOfTrunks() {
  const cx = Math.floor(player.pos.x / TGRID), cz = Math.floor(player.pos.z / TGRID);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const list = trunkGrid.get(`${cx + i},${cz + j}`);
    if (!list) continue;
    for (const t of list) {
      const dx = player.pos.x - t.x, dz = player.pos.z - t.z;
      const d = Math.hypot(dx, dz), md = t.r + PR;
      if (d < md && d > 1e-5) { player.pos.x = t.x + (dx / d) * md; player.pos.z = t.z + (dz / d) * md; }
    }
  }
}
const fwd = new THREE.Vector3(), right = new THREE.Vector3(), wish = new THREE.Vector3();
function updatePlayer(dt) {
  const active = controls.isLocked || DEBUG;
  wish.set(0, 0, 0);
  if (active) {
    camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    right.crossVectors(fwd, camera.up).normalize();
    const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    const s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    wish.addScaledVector(fwd, f).addScaledVector(right, s);
    if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(keys.ShiftLeft || keys.ShiftRight ? SPRINT : WALK);
    if (keys.Space && player.onGround) { player.vel.y = JUMP; player.onGround = false; }
  }
  const airborne = !player.onGround;
  const k = player.onGround ? 12 : (player.vel.y > 10 ? 5.2 : 4.2);
  const blend = 1 - Math.exp(-k * dt);
  player.vel.x += (wish.x - player.vel.x) * blend;
  player.vel.z += (wish.z - player.vel.z) * blend;
  player.vel.y -= GRAV * dt;

  // horizontal move, axis separated so you slide along walls / shoreline
  const nx = player.pos.x + player.vel.x * dt;
  if (walkable(nx, player.pos.z) || airborne) player.pos.x = nx;
  else player.vel.x = 0;
  const nz = player.pos.z + player.vel.z * dt;
  if (walkable(player.pos.x, nz) || airborne) player.pos.z = nz;
  else player.vel.z = 0;
  pushOutOfTrunks();

  // vertical
  player.pos.y += player.vel.y * dt;
  const pad = hitTrampoline();
  if (pad && player.pos.y <= pad.padY + 0.28 && player.vel.y <= 8) {
    player.pos.y = pad.padY;
    player.vel.y = SUPER_JUMP;
    player.onGround = false;
    pad.squash = 1;
  } else {
    const g = groundHeight(player.pos.x, player.pos.z);
    if (player.pos.y <= g) { player.pos.y = g; player.vel.y = 0; player.onGround = true; }
    else if (player.onGround && player.vel.y <= 0 && player.pos.y - g < 0.7) { player.pos.y = g; player.vel.y = 0; }
    else player.onGround = false;
  }

  camera.position.set(player.pos.x, player.pos.y + EYE, player.pos.z);
}

// ---------------------------------------------------------------- minimap (canvas drawn from the heightmap)
const mm = document.getElementById('minimap');
const mctx = mm.getContext('2d');
let landR = 0;
for (let a = 0; a < 360; a += 2) for (let r = 0; r < HALF; r += 2) {
  if (terrainHeight(Math.cos(a * Math.PI / 180) * r, Math.sin(a * Math.PI / 180) * r) > 0) landR = Math.max(landR, r);
}
const MM = mm.width, MM_RANGE = Math.min(HALF, landR * 1.12 + 10); // world half-extent shown
const mmBase = document.createElement('canvas'); mmBase.width = mmBase.height = MM;
{
  const bctx = mmBase.getContext('2d');
  const img = bctx.createImageData(MM, MM);
  const L = new THREE.Vector3(-0.6, 1, -0.4).normalize();
  for (let j = 0; j < MM; j++) for (let i = 0; i < MM; i++) {
    const x = (i / MM * 2 - 1) * MM_RANGE, z = (j / MM * 2 - 1) * MM_RANGE;
    const h = terrainHeight(x, z);
    let r, g, b;
    if (h < 0) { const t = smooth(-5, 0, h); r = 30 + 60 * t; g = 100 + 80 * t; b = 150 + 50 * t; }
    else {
      const dx = terrainHeight(x + 2, z) - terrainHeight(x - 2, z), dz = terrainHeight(x, z + 2) - terrainHeight(x, z - 2);
      const n = new THREE.Vector3(-dx, 4, -dz).normalize();
      const sh = 0.65 + 0.5 * Math.max(0, n.dot(L));
      if (h < 1.8) { r = 225; g = 205; b = 150; }
      else if (h < 22) { const t = h / 22; r = 80 + 40 * t; g = 145 - 15 * t; b = 60 + 20 * t; }
      else { r = 140; g = 135; b = 128; }
      r *= sh; g *= sh; b *= sh;
    }
    const o = (j * MM + i) * 4;
    img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
  }
  bctx.putImageData(img, 0, 0);
  bctx.fillStyle = '#8a5a2b'; bctx.strokeStyle = '#3d2610'; bctx.lineWidth = 1;
  for (const rp of ramps) {
    const corners = [[-rp.W / 2, 0], [rp.W / 2, 0], [rp.W / 2, rp.L], [rp.PL / 2, rp.L], [rp.PL / 2, rp.L + rp.PL], [-rp.PL / 2, rp.L + rp.PL], [-rp.PL / 2, rp.L], [-rp.W / 2, rp.L]];
    bctx.beginPath();
    corners.forEach(([lx, lz], i) => { const w = localToWorld(rp, lx, lz); const [u, v] = toMap(w.x, w.z); i ? bctx.lineTo(u, v) : bctx.moveTo(u, v); });
    bctx.closePath(); bctx.fill(); bctx.stroke();
  }
}
const mmDir = new THREE.Vector3();
function drawMinimap() {
  mctx.clearRect(0, 0, MM, MM);
  mctx.save();
  mctx.beginPath(); mctx.arc(MM / 2, MM / 2, MM / 2, 0, Math.PI * 2); mctx.clip();
  mctx.drawImage(mmBase, 0, 0);
  const u = (player.pos.x / MM_RANGE * 0.5 + 0.5) * MM, v = (player.pos.z / MM_RANGE * 0.5 + 0.5) * MM;
  camera.getWorldDirection(mmDir);
  const ang = Math.atan2(mmDir.z, mmDir.x); // canvas: +x right, +z down
  mctx.translate(u, v); mctx.rotate(ang);
  // view cone
  const cone = mctx.createRadialGradient(0, 0, 0, 0, 0, 60);
  cone.addColorStop(0, 'rgba(255,255,255,0.45)'); cone.addColorStop(1, 'rgba(255,255,255,0)');
  mctx.fillStyle = cone;
  mctx.beginPath(); mctx.moveTo(0, 0); mctx.arc(0, 0, 60, -0.55, 0.55); mctx.closePath(); mctx.fill();
  // arrow
  mctx.fillStyle = '#ff3b30'; mctx.strokeStyle = '#fff'; mctx.lineWidth = 2.5;
  mctx.beginPath(); mctx.moveTo(14, 0); mctx.lineTo(-9, -9); mctx.lineTo(-4, 0); mctx.lineTo(-9, 9); mctx.closePath();
  mctx.stroke(); mctx.fill();
  mctx.restore();
  for (const gem of diamonds) {
    if (gem.collected) continue;
    const [du, dv] = toMap(gem.x, gem.z);
    mctx.fillStyle = gem.sky ? '#7af2ff' : '#39d6ff';
    mctx.beginPath(); mctx.arc(du, dv, gem.sky ? 3.4 : 2.6, 0, Math.PI * 2); mctx.fill();
    mctx.strokeStyle = 'rgba(255,255,255,0.8)'; mctx.lineWidth = 1; mctx.stroke();
  }
  for (const pad of trampolines) {
    const [tu, tv] = toMap(pad.x, pad.z);
    mctx.fillStyle = '#3d8bff';
    mctx.beginPath(); mctx.arc(tu, tv, 5.5, 0, Math.PI * 2); mctx.fill();
    mctx.strokeStyle = '#fff'; mctx.lineWidth = 1.6; mctx.stroke();
  }
  // north marker
  mctx.fillStyle = 'rgba(0,0,0,0.5)'; mctx.font = 'bold 22px system-ui'; mctx.textAlign = 'center';
  mctx.fillText('N', MM / 2, 26);
}

// ---------------------------------------------------------------- loop
const hud = document.getElementById('hud');
const clock = new THREE.Clock();
let frames = 0, fpsT = 0, fps = 0;
const SNAP = (2 * SH) / 2048;
function frame() {
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.05);
  if (playStarted && !won && (controls.isLocked || DEBUG)) elapsed += dt;
  // two substeps for stable collisions at sprint speed
  updatePlayer(dt / 2); updatePlayer(dt / 2);
  updateDiamonds(dt, clock.elapsedTime);
  updateTrampolines(dt);
  tickWind(clock.elapsedTime);
  if (diamondMesh?.material) {
    diamondMesh.material.emissiveIntensity = 0.7 + 0.35 * Math.sin(clock.elapsedTime * 6);
  }

  // sun/shadow camera follows the player, snapped to texels to avoid shimmering
  const cx = Math.round(player.pos.x / SNAP) * SNAP, cz = Math.round(player.pos.z / SNAP) * SNAP;
  sun.target.position.set(cx, player.pos.y, cz);
  sun.position.copy(sun.target.position).addScaledVector(sunDir, 200);
  sun.target.updateMatrixWorld();

  waterNormals.offset.x += dt * 0.004; waterNormals.offset.y += dt * 0.0025;
  water.position.y = Math.sin(clock.elapsedTime * 0.6) * 0.04;

  sky.position.copy(camera.position);
  renderer.render(scene, camera);
  drawMinimap();
  refreshHud();

  frames++; fpsT += rawDt;
  if (fpsT > 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0;
    if (DEBUG) hud.textContent = `${fps.toFixed(0)} fps   x ${player.pos.x.toFixed(0)}  z ${player.pos.z.toFixed(0)}  alt ${player.pos.y.toFixed(1)} m`; }
}
renderer.setAnimationLoop(frame);

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// small hook for automated tests / debugging
window.game = {
  keys, get fps() { return fps; }, player, camera, ramps, spawn, groundHeight, terrainHeight, renderer, scene,
  diamonds, trampolines, get score() { return score; }, get collected() { return collected; }, get elapsed() { return elapsed; },
  counts: { ramps: ramps.length },
};
window.game.simulate = (seconds, k = {}) => {
  Object.assign(keys, k);
  for (let t = 0; t < seconds; t += 1 / 120) updatePlayer(1 / 120);
  for (const c in k) keys[c] = false;
  return player.pos.toArray();
};
window.game.setYaw = (y) => { camera.rotation.y = y; };
window.game.teleport = (x, y, z) => {
  player.pos.set(x, y, z); player.vel.set(0, 0, 0); player.onGround = true;
  camera.position.set(x, y + EYE, z);
};

async function boot() {
  vegStats = await plantIsland(scene, { scatter, addTrunk, rand });
  stampTrees(vegStats.treePts);
  buildTrampolines();
  buildDiamonds();
  window.game.counts = {
    trees: vegStats.trees,
    bushes: vegStats.bushes,
    grass: vegStats.grass,
    flowers: vegStats.flowers,
    models: vegStats.loaded,
    diamonds: diamonds.length,
    trampolines: trampolines.length,
    ramps: ramps.length,
  };
  window.game.modelsLoaded = true;
  bootReady = true;
  if (DEBUG) playStarted = true;
  window.__ready = true;
}
boot().catch((err) => {
  console.error(err);
  window.__ready = true;
});
