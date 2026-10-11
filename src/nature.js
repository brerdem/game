import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Tree } from '@dgreenheck/ez-tree';

const dummy = new THREE.Object3D();
const leafWind = [];

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function bladeTexture() {
  return canvasTex(32, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, h, 0, 0);
    g.addColorStop(0, '#3a4a28');
    g.addColorStop(0.4, '#5a6e38');
    g.addColorStop(1, '#8a9a55');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h);
    ctx.bezierCurveTo(w * 0.18, h * 0.62, w * 0.28, h * 0.18, w * 0.46, 3);
    ctx.quadraticCurveTo(w * 0.5, 0, w * 0.54, 4);
    ctx.bezierCurveTo(w * 0.72, h * 0.22, w * 0.82, h * 0.62, w * 0.5, h);
    ctx.fill();
  });
}

function flowerTexture() {
  return canvasTex(64, 64, (ctx, w, h) => {
    ctx.translate(w / 2, h / 2);
    ctx.fillStyle = '#fff8e8';
    for (let i = 0; i < 5; i++) {
      ctx.rotate((Math.PI * 2) / 5);
      ctx.beginPath();
      ctx.ellipse(0, -12, 7, 13, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#f2c43a';
    ctx.beginPath();
    ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
    ctx.fill();
  });
}

function keepLeafWind(mat, extra = 0.12) {
  mat.alphaTest = Math.max(mat.alphaTest || 0, 0.42);
  mat.transparent = false;
  mat.side = THREE.DoubleSide;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    if (!shader.uniforms.uTime) shader.uniforms.uTime = { value: 0 };
    if (!shader.vertexShader.includes('uniform float uTime')) {
      shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`;
    }
    leafWind.push(shader);
    if (extra && !shader.vertexShader.includes('ezExtraSway')) {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // ezExtraSway
        #ifdef USE_INSTANCING
        float phase = instanceMatrix[3].x * 0.19 + instanceMatrix[3].z * 0.15;
        transformed.x += sin(uTime * 1.15 + phase) * ${extra.toFixed(3)} * uv.y;
        transformed.z += cos(uTime * 0.95 + phase * 1.2) * ${(extra * 0.7).toFixed(3)} * uv.y;
        #endif`
      );
    }
  };
}

function toStandardBark(src) {
  const old = src.material;
  return new THREE.MeshStandardMaterial({
    map: old.map || null,
    normalMap: old.normalMap || null,
    aoMap: old.aoMap || null,
    roughnessMap: old.roughnessMap || null,
    color: old.color ? old.color.clone() : new THREE.Color(0x8a6a44),
    roughness: 0.94,
    metalness: 0,
  });
}

function toStandardLeaf(src) {
  const old = src.material;
  const mat = new THREE.MeshStandardMaterial({
    map: old.map || null,
    color: old.color ? old.color.clone() : new THREE.Color(0xffffff),
    roughness: 0.82,
    metalness: 0,
    side: THREE.DoubleSide,
    alphaTest: Math.max(old.alphaTest || 0, 0.42),
  });
  keepLeafWind(mat, 0.2);
  mat.customProgramCacheKey = () => 'ez-leaf-wind-std';
  return mat;
}

function instanceFromTree(scene, tree, points, { sink = 0.14, targetH = 12, scaleJitter = 0.16, rand, onEach = null }) {
  tree.updateMatrixWorld(true);
  const bark = tree.branchesMesh;
  const leaves = tree.leavesMesh;
  if (!bark || !points.length) return { count: 0, meshes: [] };
  const box = new THREE.Box3().setFromObject(tree);
  const size = box.getSize(new THREE.Vector3());
  const height = Math.max(size.y, 1);
  const matrices = points.map((p) => {
    const s = (targetH / height) * (1 + rand(-scaleJitter, scaleJitter));
    dummy.position.set(p.x, p.y - sink, p.z);
    dummy.rotation.set(0, rand(0, Math.PI * 2), 0);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    if (onEach) onEach(p, Math.max(0.22, size.x * 0.07 * s));
    return dummy.matrix.clone();
  });
  const meshes = [];
  const add = (src, isLeaf) => {
    if (!src?.geometry) return;
    const geo = src.geometry.clone();
    const mat = isLeaf ? toStandardLeaf(src) : toStandardBark(src);
    const mesh = new THREE.InstancedMesh(geo, mat, points.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
    meshes.push(mesh);
  };
  add(bark, false);
  add(leaves, true);
  return { count: points.length, meshes, height };
}

function makeImpostorTexture(renderer, tree, targetH) {
  const size = 256;
  const rt = new THREE.WebGLRenderTarget(size, size, {
    colorSpace: THREE.SRGBColorSpace,
  });
  const sc = new THREE.Scene();
  sc.background = null;
  const proto = tree;
  sc.add(proto);
  sc.add(new THREE.HemisphereLight(0xe8f2ff, 0x5a6b3a, 1.15));
  const d = new THREE.DirectionalLight(0xfff3d6, 2.1);
  d.position.set(6, 10, 8);
  sc.add(d);
  proto.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(proto);
  const ctr = box.getCenter(new THREE.Vector3());
  const dim = box.getSize(new THREE.Vector3());
  const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 800);
  const dist = Math.max(dim.x, dim.y, dim.z) * 1.55;
  cam.position.set(ctr.x + dist * 0.28, ctr.y + dim.y * 0.02, ctr.z + dist);
  cam.lookAt(ctr);
  const prevRT = renderer.getRenderTarget();
  const prevColor = new THREE.Color();
  renderer.getClearColor(prevColor);
  const prevAlpha = renderer.getClearAlpha();
  renderer.setClearColor(0x000000, 0);
  renderer.setRenderTarget(rt);
  renderer.render(sc, cam);
  renderer.setRenderTarget(prevRT);
  renderer.setClearColor(prevColor, prevAlpha);
  proto.removeFromParent();
  const scale = targetH / Math.max(dim.y, 1);
  return { texture: rt.texture, aspect: dim.x / Math.max(dim.y, 1), scale };
}

function instanceImpostors(scene, texInfo, points, { rand, targetH }) {
  if (!points.length) return 0;
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshBasicMaterial({
    map: texInfo.texture,
    transparent: true,
    alphaTest: 0.28,
    depthWrite: false,
    fog: true,
  });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `
      vec3 inst = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      vec3 toCam = cameraPosition - inst; toCam.y = 0.0;
      float ang = atan(toCam.x, toCam.z);
      float c = cos(ang), s = sin(ang);
      vec3 loc = transformed;
      transformed = vec3(loc.x * c + loc.z * s, loc.y, -loc.x * s + loc.z * c);
      vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      `
    );
  };
  const mesh = new THREE.InstancedMesh(geo, mat, points.length);
  const w = Math.max(2.4, targetH * texInfo.aspect * 0.95);
  points.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(w * (0.9 + rand(0, 0.2)), targetH * (0.92 + rand(0, 0.16)), 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  scene.add(mesh);
  return points.length;
}

function makeTree(preset, seed, { LOW = false, leaves } = {}) {
  const tree = new Tree();
  tree.loadPreset(preset);
  tree.options.seed = seed;
  tree.options.bark.flatShading = false;
  tree.options.bark.textured = true;
  if (LOW && tree.options.branch?.levels > 2) tree.options.branch.levels = 2;
  if (LOW && tree.options.branch?.sections) {
    for (const k of Object.keys(tree.options.branch.sections)) {
      tree.options.branch.sections[k] = Math.max(3, Math.round(tree.options.branch.sections[k] * 0.65));
    }
  }
  if (tree.options.leaves) {
    tree.options.leaves.size = (tree.options.leaves.size || 2.4) * 1.35;
    tree.options.leaves.count = Math.min(28, Math.round((tree.options.leaves.count || 12) * 1.25));
  }
  if (leaves) Object.assign(tree.options.leaves, leaves);
  tree.generate();
  return tree;
}

export async function plantTrees(scene, { scatter, addTrunk, rand, renderer, LOW, onProgress, island2 }) {
  const specs = [
    { preset: 'Oak Medium', count: LOW ? 12 : 24, minH: 3.0, maxH: 18, spacing: 13, h: 16.5 },
    { preset: 'Oak Small', count: LOW ? 10 : 18, minH: 2.6, maxH: 16, spacing: 10, h: 10.5 },
    { preset: 'Ash Medium', count: LOW ? 10 : 20, minH: 3.0, maxH: 17, spacing: 12, h: 14.5 },
    { preset: 'Aspen Medium', count: LOW ? 8 : 16, minH: 3.4, maxH: 20, spacing: 13, h: 16.0 },
    { preset: 'Pine Medium', count: LOW ? 12 : 22, minH: 6.5, maxH: 32, spacing: 11, h: 20.0 },
  ];
  const yieldFrame = () => new Promise((r) => setTimeout(r, 0));
  const totalSteps = specs.length + 2;
  let trees = 0;
  const treePts = [];
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const pts = scatter(spec.count, {
      minH: spec.minH, maxH: spec.maxH, minNy: 0.86, spacing: spec.spacing, rampMargin: 6, avoidSpawn: 10,
    });
    const proto = makeTree(spec.preset, 40 + i * 19, { LOW });
    instanceFromTree(scene, proto, pts, {
      rand,
      targetH: spec.h,
      onEach: (p, r) => { addTrunk(p.x, p.z, Math.max(0.24, r)); treePts.push(p); },
    });
    trees += pts.length;

    const far = scatter(LOW ? 8 : 16, {
      minH: spec.minH, maxH: spec.maxH, minNy: 0.82, spacing: spec.spacing + 6, rampMargin: 8, avoidSpawn: 30,
    });
    if (far.length && renderer) {
      const info = makeImpostorTexture(renderer, proto, spec.h);
      instanceImpostors(scene, info, far, { rand, targetH: spec.h * 0.95 });
      trees += far.length;
    }
    onProgress?.((i + 1) / totalSteps);
    await yieldFrame();
  }

  if (island2) {
    const extra = scatter(LOW ? 7 : 12, {
      around: { x: island2.x, z: island2.z, r: island2.r * 0.78 },
      minH: 2.5, maxH: 15, minNy: 0.84, spacing: 8, rampMargin: 3, avoidSpawn: 0,
    });
    const proto = makeTree('Oak Small', 77, { LOW });
    instanceFromTree(scene, proto, extra, {
      rand,
      targetH: 11,
      onEach: (p, r) => { addTrunk(p.x, p.z, Math.max(0.24, r)); treePts.push(p); },
    });
    trees += extra.length;
  }
  onProgress?.((specs.length + 1) / totalSteps);
  await yieldFrame();

  let bushes = 0;
  ['Bush 1', 'Bush 2', 'Bush 3'].forEach((preset, i) => {
    const pts = scatter(LOW ? 14 : 22, { minH: 2.3, maxH: 16, minNy: 0.84, spacing: 5.2, rampMargin: 2, avoidSpawn: 6 });
    const proto = makeTree(preset, 200 + i * 11, { LOW, leaves: { size: 1.15 } });
    instanceFromTree(scene, proto, pts, { sink: 0.06, targetH: 1.55 + i * 0.2, scaleJitter: 0.28, rand });
    bushes += pts.length;
  });
  onProgress?.(1);

  return { trees, bushes, treePts };
}

function bladeGeometry() {
  const H = 0.32;
  const a = new THREE.PlaneGeometry(0.038, H, 1, 3);
  a.translate(0, H * 0.5, 0);
  const b = a.clone();
  b.rotateY(Math.PI / 2);
  const geo = mergeGeometries([a, b]);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const taper = 1 - y / H;
    pos.setX(i, pos.getX(i) * (0.18 + 0.82 * taper));
    pos.setZ(i, pos.getZ(i) * (0.18 + 0.82 * taper));
  }
  return geo;
}

function flowerGeometry() {
  const a = new THREE.PlaneGeometry(0.2, 0.2);
  a.translate(0, 0.28, 0);
  const b = a.clone();
  b.rotateY(Math.PI / 2);
  return mergeGeometries([a, b]);
}

function applyTerrainWrap(mat, { R, heightTex, WORLD, minH = 2.05, wind = 0.12 }) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uCam = { value: new THREE.Vector3() };
    shader.uniforms.uR = { value: R };
    shader.uniforms.tHeight = { value: heightTex };
    shader.uniforms.uWorld = { value: WORLD };
    shader.uniforms.uMinH = { value: minH };
    leafWind.push(shader);
    mat.userData.uCam = shader.uniforms.uCam;
    if (mat.userData._camSeed) shader.uniforms.uCam.value.copy(mat.userData._camSeed);

    // Wrap must run AFTER instanceMatrix. Adding a world offset in
    // object space (begin_vertex) lets each blade's rotation/scale
    // scramble Y, which is what put blades in the sky over the sea.
    // tHeight is also sampled in the fragment shader so Three.js
    // actually binds the unit (vertex-only samplers are often skipped).
    const wrapFn = `
      vec3 wrapGrassWorld(vec3 local) {
        vec3 inst = instanceMatrix[3].xyz;
        vec2 rel = inst.xz - uCam.xz;
        rel -= uR * 2.0 * floor((rel + uR) / (uR * 2.0));
        vec2 wxz = uCam.xz + rel;
        vec2 huv = wxz / uWorld + 0.5;
        vHuv = huv;
        vec4 tS = texture2D(tHeight, huv);
        float terrainH = tS.r * 40.0 - 8.0;
        float land = tS.g * step(uMinH, terrainH);
        land *= step(0.0, huv.x) * step(huv.x, 1.0) * step(0.0, huv.y) * step(huv.y, 1.0);
        float dist = length(rel);
        vFade = (1.0 - smoothstep(uR * 0.55, uR * 0.92, dist)) * land;
        float phase = inst.x * 0.4 + inst.z * 0.33;
        local.x += sin(uTime * 2.05 + phase) * ${wind.toFixed(3)} * local.y;
        local.z += cos(uTime * 1.65 + phase) * ${(wind * 0.75).toFixed(3)} * local.y;
        vec3 pos = mat3(instanceMatrix) * local + vec3(wxz.x, terrainH, wxz.y);
        if (vFade < 0.08) pos.y = -80.0;
        return pos;
      }
    `;

    shader.vertexShader = `
      uniform float uTime;
      uniform vec3 uCam;
      uniform float uR;
      uniform sampler2D tHeight;
      uniform float uWorld;
      uniform float uMinH;
      varying float vFade;
      varying vec2 vHuv;
      ${wrapFn}
      ${shader.vertexShader}`
      .replace(
        '#include <project_vertex>',
        `{
          vec4 mvPosition = modelViewMatrix * vec4(wrapGrassWorld(transformed), 1.0);
          gl_Position = projectionMatrix * mvPosition;
        }`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
          vec4 worldPosition = modelMatrix * vec4(wrapGrassWorld(transformed), 1.0);
        #endif`
      );

    shader.fragmentShader = `
      uniform sampler2D tHeight;
      varying float vFade;
      varying vec2 vHuv;
      ${shader.fragmentShader}`.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
      float landMask = texture2D(tHeight, vHuv).g;
      float vis = vFade * landMask;
      gl_FragColor.a *= vis;
      if (vis < 0.08) discard;`
    );
  };
}

export function createGroundCover(scene, { terrainHeight, terrainNormalY, rand, LOW, spawn, heightTex, WORLD }) {
  const grassCount = LOW ? 28000 : 72000;
  const flowerCount = LOW ? 380 : 820;
  const R = LOW ? 24 : 32;
  const origin = spawn || { x: 0, z: 0 };
  const grassGeo = bladeGeometry();
  const grassMat = new THREE.MeshStandardMaterial({
    map: bladeTexture(),
    color: 0xffffff,
    roughness: 0.92,
    metalness: 0,
    side: THREE.DoubleSide,
    alphaTest: 0.35,
  });
  applyTerrainWrap(grassMat, { R, heightTex, WORLD, minH: 2.05, wind: 0.08 });
  grassMat.userData._camSeed = new THREE.Vector3(origin.x, 0, origin.z);
  grassMat.transparent = true;
  grassMat.customProgramCacheKey = () => 'wrap-grass-v6';

  const grass = new THREE.InstancedMesh(grassGeo, grassMat, grassCount);
  const col = new THREE.Color();
  for (let i = 0; i < grassCount; i++) {
    const a = rand(0, Math.PI * 2);
    const r = Math.sqrt(rand(0, 1)) * R;
    dummy.position.set(origin.x + Math.cos(a) * r, 0, origin.z + Math.sin(a) * r);
    dummy.rotation.set(0, rand(0, Math.PI * 2), 0);
    // 0.32 m proto * 0.48–1.55 ≈ 0.15–0.50 m at the eye
    dummy.scale.set(rand(0.7, 1.15), rand(0.48, 1.55), 1);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
    if (rand(0, 1) < 0.18) col.setHSL(0.12 + rand(-0.02, 0.04), 0.28 + rand(-0.06, 0.08), 0.34 + rand(-0.05, 0.06));
    else col.setHSL(0.22 + rand(-0.04, 0.06), 0.32 + rand(-0.08, 0.1), 0.30 + rand(-0.06, 0.08));
    grass.setColorAt(i, col);
  }
  grass.instanceMatrix.needsUpdate = true;
  if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
  grass.castShadow = false;
  grass.receiveShadow = true;
  grass.frustumCulled = false;
  grass.layers.set(1);
  scene.add(grass);

  const flMat = new THREE.MeshStandardMaterial({
    map: flowerTexture(),
    color: 0xffffff,
    roughness: 0.65,
    side: THREE.DoubleSide,
    alphaTest: 0.3,
  });
  applyTerrainWrap(flMat, { R, heightTex, WORLD, minH: 2.05, wind: 0.03 });
  flMat.userData._camSeed = new THREE.Vector3(origin.x, 0, origin.z);
  flMat.transparent = true;
  flMat.customProgramCacheKey = () => 'wrap-flower-v6';
  const flowers = new THREE.InstancedMesh(flowerGeometry(), flMat, flowerCount);
  const fcol = new THREE.Color();
  const FCOLS = [0xfff4a3, 0xffe9f2, 0xc5b7ff, 0xffffff, 0xffd27a];
  for (let i = 0; i < flowerCount; i++) {
    const a = rand(0, Math.PI * 2);
    const r = Math.sqrt(rand(0, 1)) * R * 0.88;
    dummy.position.set(origin.x + Math.cos(a) * r, 0, origin.z + Math.sin(a) * r);
    dummy.rotation.y = rand(0, Math.PI * 2);
    dummy.scale.setScalar(rand(0.55, 1.15));
    dummy.updateMatrix();
    flowers.setMatrixAt(i, dummy.matrix);
    fcol.set(FCOLS[i % FCOLS.length]);
    flowers.setColorAt(i, fcol);
  }
  flowers.instanceMatrix.needsUpdate = true;
  if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
  flowers.frustumCulled = false;
  flowers.layers.set(1);
  scene.add(flowers);

  return {
    grass: grassCount,
    flowers: flowerCount,
    update(time, cam) {
      if (grassMat.userData.uCam) grassMat.userData.uCam.value.copy(cam);
      if (flMat.userData.uCam) flMat.userData.uCam.value.copy(cam);
    },
  };
}

export function tickNature(time) {
  for (const s of leafWind) if (s.uniforms.uTime) s.uniforms.uTime.value = time;
}
