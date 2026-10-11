import * as THREE from 'three/webgpu';
import {
  Fn, NodeMaterial, texture, uniform, time, positionWorld, normalWorld,
  uv, vec2, vec3, vec4, float, mix, max, dot, normalize, pow,
  length, sin, fract, smoothstep, clamp, If, Discard,
} from 'three/tsl';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { WaterMesh } from 'three/addons/objects/WaterMesh.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const loadManager = new THREE.LoadingManager();
const loader = new THREE.TextureLoader(loadManager);

export function assetUrl(rel) {
  return new URL(`./${rel}`, location.href).href;
}

function loadMap(url, { color = false, wrap = true, repeat = 1 } = {}) {
  const tex = loader.load(url.startsWith('http') || url.startsWith('/') || url.startsWith('.') ? url : assetUrl(url));
  if (color) tex.colorSpace = THREE.SRGBColorSpace;
  if (wrap) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
  }
  tex.anisotropy = 8;
  return tex;
}

function loadPBR(folder, repeat = 18) {
  return {
    map: loadMap(assetUrl(`textures/${folder}/color.webp`), { color: true, repeat }),
    normalMap: loadMap(assetUrl(`textures/${folder}/normal.webp`), { repeat }),
    roughnessMap: loadMap(assetUrl(`textures/${folder}/rough.webp`), { repeat }),
  };
}

export function bakeHeightTexture(terrainHeight, WORLD, size = 512) {
  const H = new Float32Array(size * size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = (i / (size - 1) - 0.5) * WORLD;
      const z = (j / (size - 1) - 0.5) * WORLD;
      H[j * size + i] = terrainHeight(x, z);
    }
  }
  const data = new Uint8Array(size * size * 4);
  const at = (i, j) => H[Math.min(size - 1, Math.max(0, j)) * size + Math.min(size - 1, Math.max(0, i))];
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const h = at(i, j);
      const enc = Math.max(0, Math.min(255, Math.round((h + 8) * (255 / 40))));
      const dx = at(i + 1, j) - at(i - 1, j);
      const dz = at(i, j + 1) - at(i, j - 1);
      const ny = 4 / Math.hypot(dx, 4, dz);
      const land = h >= 2.05 && ny >= 0.80
        && at(i - 1, j) >= 1.6 && at(i + 1, j) >= 1.6
        && at(i, j - 1) >= 1.6 && at(i, j + 1) >= 1.6;
      const o = (j * size + i) * 4;
      data[o] = enc;
      data[o + 1] = land ? 255 : 0;
      data[o + 2] = enc;
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.flipY = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

export function detectBackend(renderer) {
  const webgpu = renderer.backend?.isWebGPUBackend === true;
  let software = false;
  let gpu = '';
  try {
    const gl = renderer.getContext?.();
    if (gl && typeof gl.getExtension === 'function') {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
      software = /swiftshader|llvmpipe|softpipe|microsoft basic/i.test(gpu);
    }
  } catch {
    software = false;
  }
  return {
    label: webgpu ? 'WebGPU' : 'WebGL2 fallback',
    webgpu,
    software,
    gpu,
  };
}

function addGradientSky(scene, sunDir) {
  const uTop = uniform(new THREE.Color(0x4d8fd4));
  const uMid = uniform(new THREE.Color(0x8ebce6));
  const uHorizon = uniform(new THREE.Color(0xc5d8ea));
  const uSun = uniform(sunDir.clone());
  const mat = new NodeMaterial();
  mat.side = THREE.BackSide;
  mat.depthWrite = false;
  mat.fog = false;
  mat.toneMapped = false;
  mat.fragmentNode = Fn(() => {
    const d = normalize(positionWorld);
    const h = max(d.y, float(0));
    const c = mix(uHorizon, uMid, smoothstep(float(0), float(0.22), h)).toVar();
    c.assign(mix(c, uTop, smoothstep(float(0.18), float(0.85), h)));
    const s = max(dot(d, normalize(uSun)), float(0));
    c.addAssign(vec3(1.0, 0.93, 0.75).mul(pow(s, 700.0).mul(2.2).add(pow(s, 28.0).mul(0.22))));
    If(d.y.lessThan(0.0), () => { c.assign(uHorizon); });
    return vec4(c, 1.0);
  })();
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1600, 32, 16), mat);
  mesh.renderOrder = -3;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

export function createEnvironment(renderer, scene, sunDir) {
  const info = detectBackend(renderer);
  let sky = null;
  if (!info.software) {
    sky = new SkyMesh();
    sky.scale.setScalar(4500);
    sky.name = 'sky';
    sky.turbidity.value = 5.5;
    sky.rayleigh.value = 2.6;
    sky.mieCoefficient.value = 0.005;
    sky.mieDirectionalG.value = 0.75;
    sky.sunPosition.value.copy(sunDir.clone().multiplyScalar(400));
    scene.add(sky);
  }
  addGradientSky(scene, sunDir);

  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new RoomEnvironment();
    const env = pmrem.fromScene(envScene, 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.7;
    envScene.dispose?.();
    pmrem.dispose();
  } catch (err) {
    console.warn('PMREM environment skipped', err);
  }

  const haze = new THREE.Color(0x9dbdd4);
  scene.fog = new THREE.FogExp2(haze, info.software ? 0.0028 : 0.0038);
  scene.background = haze;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = info.software ? 0.95 : 0.62;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return { sky, haze, software: info.software, backend: info };
}

function hash2(p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));
}

function noise2(p) {
  const i = p.floor();
  const f = p.fract();
  const a = hash2(i);
  const b = hash2(i.add(vec2(1, 0)));
  const c = hash2(i.add(vec2(0, 1)));
  const d = hash2(i.add(vec2(1, 1)));
  const u = f.mul(f).mul(float(3).sub(f.mul(2)));
  return mix(a, b, u.x).add(c.sub(a).mul(u.y).mul(float(1).sub(u.x))).add(d.sub(b).mul(u.x).mul(u.y));
}

function fbm2(p0) {
  const p = p0.toVar();
  const s = float(0).toVar();
  const a = float(0.5).toVar();
  for (let i = 0; i < 5; i++) {
    s.addAssign(a.mul(noise2(p)));
    p.assign(p.mul(2.12).add(vec2(17.1, 9.4)));
    a.mulAssign(0.5);
  }
  return s;
}

function billow2(p) {
  const n = fbm2(p);
  return float(1).sub(n.mul(2).sub(1).abs());
}

function cumulus(p) {
  const macro = billow2(p.mul(0.55));
  const lobes = billow2(p.mul(1.35).add(vec2(4.2, 1.7)));
  const detail = fbm2(p.mul(3.4));
  const holes = fbm2(p.mul(0.9).add(11.0));
  const c = macro.mul(0.55).add(lobes.mul(0.38)).add(detail.mul(0.12));
  return c.mul(smoothstep(float(0.28), float(0.58), holes));
}

export function createClouds(scene, sunDir) {
  const uSun = uniform(sunDir.clone().normalize());
  const uTop = uniform(new THREE.Color(0xffffff));
  const uBot = uniform(new THREE.Color(0xc5d2e0));
  const mat = new NodeMaterial();
  mat.transparent = true;
  mat.depthWrite = false;
  mat.fog = false;
  mat.side = THREE.DoubleSide;
  mat.fragmentNode = Fn(() => {
    const drift = vec2(time.mul(0.0065), time.mul(0.0028));
    const uvw = positionWorld.xz.mul(0.00105).add(drift);
    const n = max(cumulus(uvw), cumulus(uvw.mul(1.15).add(vec2(8.1, -3.4))).mul(0.72));
    const rim = float(1).sub(smoothstep(float(0.38), float(1.08), length(positionWorld.xz).mul(0.00042)));
    const dens = pow(smoothstep(float(0.52), float(0.74), n).mul(rim), 0.85);
    If(dens.lessThan(0.04), () => { Discard(); });
    const gx = cumulus(uvw.add(vec2(0.035, 0.0))).sub(cumulus(uvw.sub(vec2(0.035, 0.0))));
    const gz = cumulus(uvw.add(vec2(0.0, 0.035))).sub(cumulus(uvw.sub(vec2(0.0, 0.035))));
    const nor = normalize(vec3(gx.negate(), 0.55, gz.negate()));
    const ndl = clamp(dot(nor, normalize(uSun)), 0.0, 1.0);
    const wrap = ndl.mul(0.75).add(0.25);
    const col = mix(uBot, uTop, wrap).add(vec3(0.08, 0.07, 0.05).mul(pow(ndl, 3.0)));
    return vec4(col, dens);
  })();

  const layers = [];
  for (const [y, s] of [[110, 2400], [165, 3000], [230, 3800]]) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s, s, 1, 1), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.renderOrder = -2;
    mesh.frustumCulled = false;
    mesh.layers.set(1);
    scene.add(mesh);
    layers.push(mesh);
  }

  const puffC = document.createElement('canvas');
  puffC.width = puffC.height = 256;
  const pctx = puffC.getContext('2d');
  const blob = (x, y, r, a) => {
    const g = pctx.createRadialGradient(x, y, r * 0.08, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.45, `rgba(252,253,255,${a * 0.72})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    pctx.fillStyle = g;
    pctx.beginPath();
    pctx.arc(x, y, r, 0, Math.PI * 2);
    pctx.fill();
  };
  blob(128, 176, 82, 0.98);
  blob(72, 158, 70, 0.92);
  blob(186, 154, 74, 0.94);
  blob(104, 118, 64, 0.88);
  blob(158, 112, 62, 0.86);
  blob(128, 86, 54, 0.78);
  blob(54, 132, 48, 0.7);
  blob(204, 128, 50, 0.72);
  const puffTex = new THREE.CanvasTexture(puffC);
  puffTex.colorSpace = THREE.SRGBColorSpace;
  const puffMat = new THREE.MeshBasicNodeMaterial({
    map: puffTex,
    transparent: true,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  puffMat.colorNode = Fn(() => {
    const sampled = texture(puffTex, uv());
    const lit = float(0.42).add(uv().y.mul(0.58));
    const sun = float(0.16).mul(max(uSun.y, 0.0));
    const tint = mix(vec3(0.86, 0.90, 0.96), vec3(1.0, 1.0, 1.0), clamp(lit.add(sun), 0.0, 1.0));
    return vec4(tint.mul(sampled.rgb), sampled.a);
  })();
  const dummy = new THREE.Object3D();
  const PUFFS = 36;
  const puffs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.68), puffMat, PUFFS);
  const puffMeta = [];
  for (let i = 0; i < PUFFS; i++) {
    const a = (i / PUFFS) * Math.PI * 2 + i * 0.21;
    const r = 55 + (i % 9) * 34;
    puffMeta.push({ a, r, y: 78 + (i % 6) * 20, s: 48 + (i % 7) * 16 });
  }
  puffs.frustumCulled = false;
  puffs.layers.set(1);
  puffs.renderOrder = -1;
  scene.add(puffs);

  return {
    update(t, cam) {
      for (const m of layers) {
        m.position.x = cam.position.x;
        m.position.z = cam.position.z;
      }
      for (let i = 0; i < PUFFS; i++) {
        const p = puffMeta[i];
        const ang = p.a + t * 0.008;
        dummy.position.set(cam.position.x + Math.cos(ang) * p.r, p.y, cam.position.z + Math.sin(ang) * p.r);
        dummy.lookAt(cam.position.x, p.y, cam.position.z);
        dummy.scale.setScalar(p.s);
        dummy.updateMatrix();
        puffs.setMatrixAt(i, dummy.matrix);
      }
      puffs.instanceMatrix.needsUpdate = true;
    },
  };
}

export function applyTerrainSplat(terrain) {
  const grass = loadPBR('grass', 1);
  const dirt = loadPBR('dirt', 1);
  const sand = loadPBR('sand', 1);
  const rock = loadPBR('rock', 1);
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0 });
  mat.colorNode = Fn(() => {
    const wpos = positionWorld;
    const uv1 = wpos.xz.mul(0.19);
    const uv2 = wpos.xz.mul(0.047).add(vec2(17.3, 9.1));
    const grassC = mix(texture(grass.map, uv1).rgb, texture(grass.map, uv2).rgb, 0.38);
    const dirtC = texture(dirt.map, uv1.mul(0.82)).rgb;
    const sandC = texture(sand.map, uv1.mul(0.52)).rgb.mul(vec3(1.14, 1.04, 0.82));
    const rockC = texture(rock.map, uv1.mul(0.48)).rgb;
    const h = wpos.y;
    const sandW = float(1).sub(smoothstep(float(0.0), float(4.1), h));
    const rockW = smoothstep(float(0.88), float(0.58), normalWorld.y);
    const dirtN = mix(
      hash2(wpos.xz.mul(0.07)),
      hash2(wpos.xz.mul(0.021).add(vec2(3.1, 1.7))),
      0.5,
    );
    const dirtW = smoothstep(float(0.78), float(0.96), dirtN).mul(float(1).sub(sandW)).mul(0.32);
    const col = mix(grassC, dirtC, dirtW).toVar();
    col.assign(mix(col, sandC, clamp(sandW, 0.0, 1.0)));
    col.assign(mix(col, rockC, clamp(rockW.mul(float(1).sub(sandW.mul(0.85))), 0.0, 1.0)));
    return col;
  })();
  terrain.material.dispose();
  terrain.material = mat;
  terrain.material.needsUpdate = true;
}

export function createOcean(scene, sunDir, { heightTex, WORLD, LOW = false, software = false }) {
  const normals = loadMap(assetUrl('textures/waternormals.jpg'), { wrap: true, repeat: 8 });
  if (software) {
    const mat = new THREE.MeshStandardNodeMaterial({
      color: 0x1a6a7a,
      roughness: 0.22,
      metalness: 0.12,
      transparent: true,
      opacity: 0.9,
      normalMap: normals,
      normalScale: new THREE.Vector2(0.55, 0.55),
      envMapIntensity: 0.8,
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), mat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.02;
    scene.add(water);
    return {
      water,
      update(t) {
        normals.offset.x = t * 0.012;
        normals.offset.y = t * 0.007;
        water.position.y = 0.02 + Math.sin(t * 0.6) * 0.03;
      },
    };
  }

  const water = new WaterMesh(new THREE.PlaneGeometry(6000, 6000), {
    resolution: LOW ? 0.25 : 0.5,
    waterNormals: normals,
    sunDirection: sunDir.clone().normalize(),
    sunColor: 0xffe8b0,
    waterColor: 0x0a3d4c,
    distortionScale: 3.1,
    alpha: 0.94,
  });
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.02;
  water.material.transparent = true;

  // Shore foam / depth tint layered on top of WaterMesh's TSL fragment.
  const baseFrag = water.material.fragmentNode;
  const tHeight = texture(heightTex);
  const uWorld = uniform(WORLD);
  const uShallow = uniform(new THREE.Color(0x5ec8d6));
  const uDeep = uniform(new THREE.Color(0x083540));
  water.material.fragmentNode = Fn(() => {
    const base = vec4(baseFrag).toVar();
    const hUv = positionWorld.xz.div(uWorld).add(0.5);
    const terrainH = tHeight.uv(hUv).r.mul(40.0).sub(8.0);
    const depth = max(0.02, float(0.12).sub(terrainH));
    const depthColor = mix(uShallow, uDeep, smoothstep(float(0.15), float(7.5), depth));
    const foamBand = smoothstep(float(1.15), float(0.02), terrainH.sub(0.04).abs());
    const foamN = float(0.5).add(sin(positionWorld.x.mul(0.42).add(time)).mul(0.5));
    const foam = clamp(foamBand.mul(float(0.4).add(foamN.mul(0.6))), 0.0, 1.0);
    const rgb = mix(mix(base.rgb, depthColor, 0.28), vec3(0.93, 0.97, 0.99), foam.mul(0.82));
    const shoreAlpha = mix(float(0.42), base.a, smoothstep(float(0.12), float(3.2), depth));
    return vec4(rgb, shoreAlpha);
  })();

  scene.add(water);
  return {
    water,
    update(_time, sunDirection) {
      if (water.sunDirection?.value) water.sunDirection.value.copy(sunDirection);
    },
  };
}
