import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createNoise2D } from 'simplex-noise';
import { applyTerrainSplat, bakeHeightTexture, createClouds, createEnvironment, createOcean, loadManager } from './look.js';
import { createGroundCover, plantBridgeLandings, plantTrees } from './nature.js';
import { createVineBridge } from './bridge.js';
import { createBirds } from './birds.js';

const loaderEl = document.getElementById('loader');
const loaderFill = document.getElementById('loader-fill');
const loaderPct = document.getElementById('loader-pct');
function setLoad(p) {
  const n = Math.max(0, Math.min(1, p));
  if (loaderFill) loaderFill.style.width = `${Math.round(n * 100)}%`;
  if (loaderPct) loaderPct.textContent = `${Math.round(n * 100)}%`;
}
setLoad(0.04);
loadManager.onProgress = (_url, loaded, total) => {
  setLoad(0.06 + 0.38 * (loaded / Math.max(total, 1)));
};

// ---------------------------------------------------------------- setup
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const SEED = parseInt(params.get('seed') || '1337', 10);
const LOW = params.has('low');

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

const WORLD = 800;          // terrain size (m)
const SEG = 320;            // terrain segments
const CELL = WORLD / SEG;
const HALF = WORLD / 2;
const ISLAND_R = 160;
const ISLAND2 = { x: 240, z: 14, r: 50 };
const gapLen = Math.hypot(ISLAND2.x, ISLAND2.z) || 1;
const gapU = { x: ISLAND2.x / gapLen, z: ISLAND2.z / gapLen };
const HILL_A = { x: gapU.x * 144, z: gapU.z * 144, h: 17, r: 20 };
const HILL_B = { x: ISLAND2.x - gapU.x * 26, z: ISLAND2.z - gapU.z * 26, h: 14, r: 16 };
const EYE = 1.7;

// ---------------------------------------------------------------- terrain function
function fbm(x, z, oct) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noiseA(x * f, z * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
const hills = [];
for (let i = 0; i < 6; i++) {
  const a = rand(0, Math.PI * 2), r = rand(35, 120);
  hills.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, h: rand(8, 18), r: rand(16, 30) });
}
for (let i = 0; i < 2; i++) {
  const a = rand(0, Math.PI * 2), r = rand(12, 34);
  hills.push({ x: ISLAND2.x + Math.cos(a) * r, z: ISLAND2.z + Math.sin(a) * r, h: rand(5, 10), r: rand(12, 20) });
}
function islandMask(x, z, cx, cz, rad) {
  const dist = Math.hypot(x - cx, z - cz);
  const d = dist / rad + 0.09 * noiseB((x + cx) / 130, (z + cz) / 130);
  return 1 - smooth(0.48, 1.04, d);
}
function hillFalloff(x, z, hl) {
  const dx = x - hl.x, dz = z - hl.z;
  return Math.exp(-(dx * dx + dz * dz) / (hl.r * hl.r));
}
function rawHeight(x, z) {
  const m1 = islandMask(x, z, 0, 0, ISLAND_R);
  const m2 = islandMask(x, z, ISLAND2.x, ISLAND2.z, ISLAND2.r);
  const ha = hillFalloff(x, z, HILL_A);
  const hb = hillFalloff(x, z, HILL_B);
  // Facing-shore hills keep their own land so the tops stay above water.
  const mask = Math.max(m1, m2, ha * 0.82, hb * 0.82);
  const e = fbm(x / 170, z / 170, 4);
  let h = m1 * (10 + 6 * e) + m2 * (7.5 + 4.5 * e) - 5;
  h += ha * HILL_A.h + hb * HILL_B.h;
  for (const hl of hills) {
    const dx = x - hl.x, dz = z - hl.z;
    const local = Math.hypot(hl.x - ISLAND2.x, hl.z - ISLAND2.z) < ISLAND2.r + 4 ? m2 : m1;
    h += local * hl.h * Math.exp(-(dx * dx + dz * dz) / (hl.r * hl.r));
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
let bridge = null;
function bridgeHeight(x, z) { return bridge ? bridge.surface(x, z) : -Infinity; }
function groundHeight(x, z) { return Math.max(terrainHeight(x, z), rampsHeight(x, z), bridgeHeight(x, z)); }
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
function addHillPath(hx, hz, inwardX, inwardZ) {
  const dx = inwardX - hx, dz = inwardZ - hz;
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len;
  // Stop short of the hilltop so no wooden platform/block sits at the bridge landing.
  const gap = 3.4;
  const L = 16;
  const endX = hx + ux * gap, endZ = hz + uz * gap;
  const sx = endX + ux * L, sz = endZ + uz * L;
  const base = terrainHeight(sx, sz) - 0.05;
  const top = terrainHeight(endX, endZ);
  const yaw = Math.atan2(endX - sx, endZ - sz);
  ramps.push({ sx, sz, yaw, L, W: 3.6, PL: 0, rise: top - base, base, kind: 'path' });
}
addHillPath(HILL_A.x, HILL_A.z, 0, 0);
addHillPath(HILL_B.x, HILL_B.z, ISLAND2.x, ISLAND2.z);
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
renderer.setPixelRatio(Math.min(window.devicePixelRatio, LOW ? 1 : 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.86;
renderer.domElement.id = 'game';
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 3000);
camera.layers.enable(1);

// sky + sun + haze
const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 48), THREE.MathUtils.degToRad(150));
const { env: gemEnv, software } = createEnvironment(renderer, scene, sunDir);
const clouds = createClouds(scene, sunDir);

const hemi = new THREE.HemisphereLight(0xd7e7f6, 0x6a7a48, 1.18);
hemi.layers.enable(1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4e0, 2.35);
sun.layers.enable(1);
sun.castShadow = true;
sun.shadow.mapSize.set(LOW ? 1024 : 2048, LOW ? 1024 : 2048);
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
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const ix = Math.round((x + HALF) / CELL), iz = Math.round((z + HALF) / CELL);
    pos.setY(i, heights[iz * N + ix]);
  }
  tGeo.computeVertexNormals();
}
const terrain = new THREE.Mesh(tGeo, new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 }));
terrain.receiveShadow = true;
terrain.castShadow = true;
scene.add(terrain);
applyTerrainSplat(terrain);

const heightTex = bakeHeightTexture(terrainHeight, WORLD);
const ocean = createOcean(scene, sunDir, { heightTex, WORLD, LOW, software });

{
  const aTop = { x: HILL_A.x, z: HILL_A.z, y: terrainHeight(HILL_A.x, HILL_A.z) };
  const bTop = { x: HILL_B.x, z: HILL_B.z, y: terrainHeight(HILL_B.x, HILL_B.z) };
  const span = Math.hypot(bTop.x - aTop.x, bTop.z - aTop.z);
  const sag = Math.min(Math.max(3.2, Math.min(aTop.y, bTop.y) * 0.34), span * 0.14);
  bridge = createVineBridge(scene, {
    a: { x: aTop.x, y: aTop.y + 0.02, z: aTop.z },
    b: { x: bTop.x, y: bTop.y + 0.02, z: bTop.z },
    sag,
  });
}

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
function rampMaterial(rx, ry, kind) {
  const t = plankTex.clone();
  t.needsUpdate = true;
  t.repeat.set(rx, ry);
  if (kind === 'path') {
    return new THREE.MeshStandardMaterial({ map: t, color: 0xc4a36a, roughness: 0.92 });
  }
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 });
}
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
  const wm = new THREE.Mesh(wedge, rampMaterial(rp.W / 2, rp.L / 2, rp.kind));
  grp.add(wm);
  if (rp.PL > 0) {
    const top = rp.base + rp.rise;
    const hgt = top - rp.bottom;
    const plat = new THREE.Mesh(new THREE.BoxGeometry(rp.PL, hgt, rp.PL), rampMaterial(rp.PL / 2, rp.PL / 2, rp.kind));
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
function scatter(count, { minH = 2.4, maxH = 30, minNy = 0.88, spacing = 0, rampMargin = 2, maxTries = count * 30, clusterNoise = null, shareOccupied = true, avoidSpawn = 4, around = null } = {}) {
  const bag = shareOccupied ? occupied : [];
  const out = [];
  let tries = 0;
  while (out.length < count && tries++ < maxTries) {
    let x, z;
    if (around) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * around.r;
      x = around.x + Math.cos(a) * r;
      z = around.z + Math.sin(a) * r;
    } else {
      const use2 = rng() < 0.24;
      const cx = use2 ? ISLAND2.x : 0;
      const cz = use2 ? ISLAND2.z : 0;
      const rad = use2 ? ISLAND2.r * 0.92 : ISLAND_R;
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * rad;
      x = cx + Math.cos(a) * r;
      z = cz + Math.sin(a) * r;
    }
    const h = terrainHeight(x, z);
    if (h < minH || h > maxH) continue;
    if (terrainNormalY(x, z) < minNy) continue;
    if (nearAnyRamp(x, z, rampMargin)) continue;
    if (avoidSpawn && Math.hypot(x - spawn.x, z - spawn.z) < avoidSpawn) continue;
    if (clusterNoise && noiseB(x / clusterNoise.s, z / clusterNoise.s) < clusterNoise.t) continue;
    if (spacing > 0) {
      let ok = true;
      for (const o of bag) { const dx = o.x - x, dz = o.z - z; if (dx * dx + dz * dz < spacing * spacing) { ok = false; break; } }
      if (!ok) continue;
      bag.push({ x, z });
    }
    out.push({ x, y: h, z });
  }
  return out;
}

// ---------------------------------------------------------------- player
const controls = new PointerLockControls(camera, document.body);
const player = { pos: new THREE.Vector3(spawn.x, groundHeight(spawn.x, spawn.z), spawn.z), vel: new THREE.Vector3(), onGround: true };
let lastSafe = { x: spawn.x, y: player.pos.y, z: spawn.z };
const PR = 0.35, WALK = 6, SPRINT = 11, GRAV = 24, JUMP = 8.2, STEP = 0.6;
const SUPER_JUMP = 36.7; // ~28 m peak vs ~1.4 m normal jump
const trampolines = [];
const diamonds = [];
const diamondDummy = new THREE.Object3D();
let diamondMesh = null;
let diamondGlow = null;
let groundCover = null;
let birds = null;
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
const playYaw = camera.rotation.y;
const playPitch = camera.rotation.x;
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
  lastSafe = { x: spawn.x, y: player.pos.y, z: spawn.z };
  camera.position.set(player.pos.x, player.pos.y + EYE, player.pos.z);
  refreshHud();
  controls.lock();
}
let menuOpen = !DEBUG;
function showMenu(mode) {
  menuOpen = true;
  overlay.classList.add('ready');
  overlay.classList.remove('hidden');
  document.getElementById('panel').classList.remove('hidden');
  document.getElementById('thanks').classList.remove('show');
  document.getElementById('sub').textContent = mode === 'pause' ? 'PAUSED' : 'COLLECT EVERY RUBY';
  document.getElementById('start').textContent = mode === 'pause' ? 'RESUME' : 'PLAY';
  document.body.classList.remove('playing');
}
function applyMenuCamera(time) {
  const mx = (HILL_A.x + HILL_B.x) * 0.5;
  const mz = (HILL_A.z + HILL_B.z) * 0.5;
  const ang = time * 0.06 + 0.85;
  camera.position.set(mx + Math.cos(ang) * 36, 15.5, mz + Math.sin(ang) * 26);
  camera.up.set(0, 1, 0);
  camera.lookAt(mx, 8.5, mz);
}
function exitGame(e) {
  e?.stopPropagation?.();
  e?.preventDefault?.();
  window.close();
  setTimeout(() => {
    document.getElementById('panel').classList.add('hidden');
    document.getElementById('thanks').classList.add('show');
    overlay.classList.add('ready');
    overlay.classList.remove('hidden');
  }, 300);
}
document.getElementById('start').addEventListener('click', (e) => {
  e.stopPropagation();
  if (!bootReady || won) return;
  controls.lock();
});
document.getElementById('exit').addEventListener('click', exitGame);
document.getElementById('again').addEventListener('click', (e) => { e.stopPropagation(); resetRun(); });
winEl.addEventListener('click', resetRun);
controls.addEventListener('lock', () => {
  menuOpen = false;
  overlay.classList.add('hidden');
  document.body.classList.add('playing');
  camera.up.set(0, 1, 0);
  camera.rotation.set(playPitch, playYaw, 0, 'YXZ');
  if (!playStarted) playStarted = true;
});
controls.addEventListener('unlock', () => {
  if (won) return;
  showMenu('pause');
});
if (DEBUG) {
  overlay.classList.add('hidden');
  document.body.classList.add('playing');
  menuOpen = false;
}

function hitTrampoline() {
  for (const pad of trampolines) {
    const dx = player.pos.x - pad.x, dz = player.pos.z - pad.z;
    if (dx * dx + dz * dz <= pad.r * pad.r) return pad;
  }
  return null;
}

function trampolineMatTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#2f6fff'; ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.arc(128, 128, 108, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(128, 128, 70, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(128, 18); ctx.lineTo(128, 238); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(18, 128); ctx.lineTo(238, 128); ctx.stroke();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeTrampolineMesh() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x2b2e34, roughness: 0.4, metalness: 0.78 });
  const spring = new THREE.MeshStandardMaterial({ color: 0xc5c8ce, roughness: 0.28, metalness: 0.85 });
  const matMat = new THREE.MeshStandardMaterial({ map: trampolineMatTexture(), roughness: 0.45, metalness: 0.05, emissive: 0x0a2060, emissiveIntensity: 0.22 });
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.62, 8), metal);
    leg.position.set(x * 1.12, 0.28, z * 1.12);
    leg.rotation.z = -x * 0.22;
    leg.rotation.x = z * 0.22;
    g.add(leg);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), metal);
    foot.position.set(x * 1.22, 0.08, z * 1.22);
    g.add(foot);
  }
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.2, 6), spring);
    coil.position.set(Math.cos(a) * 1.2, 0.7, Math.sin(a) * 1.2);
    coil.rotation.z = Math.cos(a) * 0.9;
    coil.rotation.x = -Math.sin(a) * 0.9;
    g.add(coil);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.28, 0.09, 8, 32), metal);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.72;
  g.add(ring);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.16, 1.16, 0.05, 32), matMat);
  pad.position.y = 0.7;
  pad.name = 'mat';
  g.add(pad);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

function diamondGeometry() {
  const crown = new THREE.ConeGeometry(0.48, 0.34, 8, 1);
  crown.translate(0, 0.28, 0);
  const pavilion = new THREE.ConeGeometry(0.48, 0.66, 8, 1);
  pavilion.rotateX(Math.PI);
  pavilion.translate(0, -0.2, 0);
  const girdle = new THREE.CylinderGeometry(0.5, 0.5, 0.07, 8, 1, true);
  girdle.translate(0, 0.09, 0);
  const table = new THREE.CircleGeometry(0.18, 8);
  table.rotateX(-Math.PI / 2);
  table.translate(0, 0.45, 0);
  const geo = mergeGeometries([crown, pavilion, girdle, table], false) || new THREE.OctahedronGeometry(0.46, 0);
  geo.computeVertexNormals();
  return geo;
}

function gemGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 28);
  g.addColorStop(0, 'rgba(90,0,12,0.55)');
  g.addColorStop(0.35, 'rgba(70,0,10,0.22)');
  g.addColorStop(1, 'rgba(30,0,4,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
    if (diamondGlow) {
      const glowS = gem.collected && gem.pop >= 1 ? 0.0001 : Math.max(0.55, diamondDummy.scale.x) * 1.05;
      diamondDummy.quaternion.copy(camera.quaternion);
      diamondDummy.scale.setScalar(glowS);
      diamondDummy.updateMatrix();
      diamondGlow.setMatrixAt(i, diamondDummy.matrix);
    }
  }
  diamondMesh.instanceMatrix.needsUpdate = true;
  if (diamondGlow) diamondGlow.instanceMatrix.needsUpdate = true;
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
      padY: spot.y + 0.7 * s,
      r: 1.15 * s,
      mesh, mat, squash: 0,
    });
  }
}

function buildDiamonds() {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.35;
    const x = spawn.x + Math.cos(a) * 11, z = spawn.z + Math.sin(a) * 11;
    const h = terrainHeight(x, z);
    if (h > 1.2) placeDiamond(x, h + 1.35, z, { points: 100 });
  }
  const ground = scatter(34, { minH: 2.2, maxH: 26, minNy: 0.78, spacing: 11, rampMargin: 2.2, maxTries: 34 * 50, shareOccupied: false, avoidSpawn: 8 });
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
  const extraHills = scatter(8, { minH: 12, maxH: 30, minNy: 0.8, spacing: 16, rampMargin: 4, shareOccupied: false, avoidSpawn: 8 });
  for (const p of extraHills) placeDiamond(p.x, p.y + 1.3, p.z, { points: 150 });
  const island2Gems = scatter(12, {
    around: { x: ISLAND2.x, z: ISLAND2.z, r: ISLAND2.r * 0.8 },
    minH: 2.0, maxH: 18, minNy: 0.76, spacing: 8, rampMargin: 1.5,
    maxTries: 12 * 60, shareOccupied: false, avoidSpawn: 0,
  });
  for (const p of island2Gems) placeDiamond(p.x, p.y + 1.25, p.z, { points: 100 });

  const gemMat = new THREE.MeshPhysicalMaterial({
    color: 0x6b0014,
    metalness: 0.05,
    roughness: 0.08,
    transmission: software ? 0.0 : 0.32,
    thickness: 0.85,
    ior: 2.42,
    reflectivity: 0.7,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    attenuationColor: new THREE.Color(0x6a0014),
    attenuationDistance: 0.14,
    emissive: new THREE.Color(0x3d000c),
    emissiveIntensity: 0.85,
    envMap: gemEnv,
    envMapIntensity: software ? 0.35 : 0.55,
    flatShading: true,
  });
  diamondMesh = new THREE.InstancedMesh(diamondGeometry(), gemMat, Math.max(diamonds.length, 1));
  diamondMesh.castShadow = true;
  diamondMesh.frustumCulled = false;
  scene.add(diamondMesh);

  diamondGlow = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.72, 0.72),
    new THREE.MeshBasicMaterial({
      map: gemGlowTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
    Math.max(diamonds.length, 1)
  );
  diamondGlow.frustumCulled = false;
  diamondGlow.renderOrder = 4;
  scene.add(diamondGlow);
  syncDiamondInstances(0);
  refreshHud();
}

function onBridge(x, z) {
  return bridgeHeight(x, z) > -1000;
}
function walkable(x, z) {
  if (onBridge(x, z)) return groundHeight(x, z) <= player.pos.y + STEP + 0.4;
  if (terrainHeight(x, z) < -0.7 && rampsHeight(x, z) === -Infinity) return false;
  return groundHeight(x, z) <= player.pos.y + STEP;
}
function respawnOnShore() {
  player.pos.set(lastSafe.x, lastSafe.y, lastSafe.z);
  player.vel.set(0, 0, 0);
  player.onGround = true;
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

  if (player.onGround && terrainHeight(player.pos.x, player.pos.z) > 1.35) {
    lastSafe = { x: player.pos.x, y: player.pos.y, z: player.pos.z };
  }
  const wet = terrainHeight(player.pos.x, player.pos.z) < 0.55
    && rampsHeight(player.pos.x, player.pos.z) === -Infinity
    && !onBridge(player.pos.x, player.pos.z);
  if (wet && player.pos.y < 0.22) respawnOnShore();

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
  if (bridge) {
    bctx.strokeStyle = '#6b4423';
    bctx.lineWidth = 3.2;
    bctx.beginPath();
    const [u0, v0] = toMap(bridge.a.x, bridge.a.z);
    const [u1, v1] = toMap(bridge.b.x, bridge.b.z);
    bctx.moveTo(u0, v0);
    bctx.lineTo(u1, v1);
    bctx.stroke();
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
    mctx.fillStyle = gem.sky ? '#ff8aa0' : '#ff3b55';
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
  if (menuOpen) {
    applyMenuCamera(clock.elapsedTime);
  } else {
    updatePlayer(dt / 2); updatePlayer(dt / 2);
  }
  updateDiamonds(dt, clock.elapsedTime);
  updateTrampolines(dt);
  clouds.update(clock.elapsedTime, camera);
  ocean.update(clock.elapsedTime, sunDir);
  if (bridge) bridge.update(clock.elapsedTime);
  if (groundCover) groundCover.update(clock.elapsedTime, camera.position, dt, terrainHeight);
  if (birds) birds.update(dt);
  if (diamondMesh?.material) {
    diamondMesh.material.emissiveIntensity = 0.72 + 0.16 * Math.sin(clock.elapsedTime * 4.4);
  }

  // sun/shadow camera follows the player, snapped to texels to avoid shimmering
  const cx = Math.round(player.pos.x / SNAP) * SNAP, cz = Math.round(player.pos.z / SNAP) * SNAP;
  sun.target.position.set(cx, player.pos.y, cz);
  sun.position.copy(sun.target.position).addScaledVector(sunDir, 200);
  sun.target.updateMatrixWorld();

  renderer.render(scene, camera);
  drawMinimap();
  refreshHud();

  frames++; fpsT += rawDt;
  if (fpsT > 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0;
    if (!LOW && fps > 1 && fps < 26) applyLowQuality();
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
  diamonds, trampolines, bridge, ISLAND2, ocean,
  get score() { return score; }, get collected() { return collected; }, get elapsed() { return elapsed; },
  counts: { ramps: ramps.length },
};
window.game.simulate = (seconds, k = {}) => {
  Object.assign(keys, k);
  let tAcc = 0;
  for (let t = 0; t < seconds; t += 1 / 120) {
    updatePlayer(1 / 120);
    tAcc += 1 / 120;
    updateDiamonds(1 / 120, tAcc);
  }
  for (const c in k) keys[c] = false;
  return player.pos.toArray();
};
window.game.setYaw = (y) => { camera.rotation.y = y; };
window.game.teleport = (x, y, z) => {
  player.pos.set(x, y, z); player.vel.set(0, 0, 0); player.onGround = true;
  camera.position.set(x, y + EYE, z);
};

function applyLowQuality() {
  renderer.setPixelRatio(1);
  if (sun.shadow.mapSize.x > 1024) sun.shadow.mapSize.set(1024, 1024);
}

async function boot() {
  setLoad(0.48);
  vegStats = await plantTrees(scene, {
    scatter, addTrunk, rand, renderer, LOW, island2: ISLAND2,
    onProgress: (p) => setLoad(0.48 + 0.38 * p),
  });
  setLoad(0.88);
  groundCover = createGroundCover(scene, {
    terrainHeight, terrainNormalY, rand, LOW, spawn, heightTex, WORLD,
  });
  vegStats.grass = groundCover.grass;
  vegStats.flowers = groundCover.flowers;
  if (bridge) {
    const dx = bridge.b.x - bridge.a.x, dz = bridge.b.z - bridge.a.z;
    const L = Math.hypot(dx, dz) || 1;
    const dirx = dx / L, dirz = dz / L;
    const sidex = -dirz, sidez = dirx;
    plantBridgeLandings(scene, {
      terrainHeight,
      rand,
      addTrunk,
      ends: [
        { x: bridge.a.x, z: bridge.a.z, dirx, dirz, sidex, sidez },
        { x: bridge.b.x, z: bridge.b.z, dirx: -dirx, dirz: -dirz, sidex, sidez },
      ],
    });
  }
  stampTrees(vegStats.treePts);
  setLoad(0.93);
  buildTrampolines();
  buildDiamonds();
  setLoad(0.96);
  try {
    birds = createBirds(scene, { rand, count: LOW ? 6 : 8 });
  } catch (err) {
    console.warn('birds failed', err);
    birds = { count: 0, update() {} };
  }
  setLoad(1);
  window.game.counts = {
    trees: vegStats.trees,
    bushes: vegStats.bushes,
    grass: vegStats.grass,
    flowers: vegStats.flowers,
    grassRadius: groundCover.radius,
    models: vegStats.trees,
    diamonds: diamonds.length,
    trampolines: trampolines.length,
    ramps: ramps.length,
    island2Gems: diamonds.filter((d) => Math.hypot(d.x - ISLAND2.x, d.z - ISLAND2.z) < ISLAND2.r + 4).length,
    birds: birds.count,
    quality: LOW ? 'low' : 'high',
  };
  window.game.treePts = vegStats.treePts;
  window.game.groundCover = groundCover;
  window.game.bridge = bridge;
  window.game.birds = birds;
  window.game.HILL_A = HILL_A;
  window.game.HILL_B = HILL_B;
  window.game.showMenu = showMenu;
  window.game.exitGame = exitGame;
  window.game.applyMenuCamera = applyMenuCamera;
  window.game.modelsLoaded = true;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  if (loaderEl) loaderEl.classList.add('hidden');
  document.body.classList.add('booted');
  if (!DEBUG) overlay.classList.add('ready');
  bootReady = true;
  if (DEBUG) playStarted = true;
  window.__ready = true;
}
boot().catch((err) => {
  console.error(err);
  window.__ready = true;
});
