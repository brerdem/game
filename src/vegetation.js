import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const dummy = new THREE.Object3D();
const windShaders = [];

export function tickWind(time) {
  for (const shader of windShaders) shader.uniforms.uTime.value = time;
}

function applyWind(material, strength) {
  material.side = THREE.DoubleSide;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    windShaders.push(shader);
    shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
      float hgt = max(transformed.y, 0.0);
      float phase = instanceMatrix[3].x * 0.23 + instanceMatrix[3].z * 0.19 + float(gl_InstanceID) * 0.171;
      float gust = sin(uTime * 1.42 + phase) * 0.62 + sin(uTime * 2.18 + phase * 1.55) * 0.38;
      float amp = hgt * hgt * ${Number(strength).toFixed(4)};
      transformed.x += gust * amp;
      transformed.z += cos(uTime * 1.16 + phase * 1.33) * amp * 0.82;
      #endif`
    );
  };
  material.customProgramCacheKey = () => `veg-wind-${strength}`;
}

function prepareMaterial(material, geometry) {
  if (geometry.attributes.color) {
    material.vertexColors = true;
    if (material.color) material.color.set(0xffffff);
  } else if (material.color) {
    const max = Math.max(material.color.r, material.color.g, material.color.b);
    if (max > 0 && max < 0.32) material.color.multiplyScalar(Math.min(0.58 / max, 4.2));
  }
  material.metalness = 0;
  material.roughness = 0.82;
  material.side = THREE.DoubleSide;
}

function isFoliage(mesh) {
  const label = `${mesh.name} ${mesh.parent?.name || ''} ${mesh.material?.name || ''}`.toLowerCase();
  if (/trunk|bark|wood|log|stump/.test(label)) return false;
  if (/leaf|leave|foliage|bush|grass|flower|plant|needle|canopy|twig|green/.test(label)) return true;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return mats.some((m) => m?.color && m.color.g > m.color.r * 1.08 && m.color.g >= m.color.b * 0.9);
}

export async function loadPrefab(url) {
  const gltf = await loader.loadAsync(url);
  gltf.scene.updateMatrixWorld(true);
  const parts = [];
  const box = new THREE.Box3();
  gltf.scene.traverse((obj) => {
    if (!obj.isMesh) return;
    const geometry = obj.geometry.clone();
    geometry.applyMatrix4(obj.matrixWorld);
    geometry.computeBoundingBox();
    box.union(geometry.boundingBox);
    const src = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    const material = src.clone();
    const foliage = isFoliage(obj);
    prepareMaterial(material, geometry);
    parts.push({
      geometry,
      material,
      foliage,
      name: obj.name,
    });
  });
  if (!parts.length) throw new Error(`No meshes in ${url}`);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const shift = new THREE.Matrix4().makeTranslation(-center.x, -box.min.y, -center.z);
  for (const part of parts) {
    part.geometry.applyMatrix4(shift);
    part.geometry.computeVertexNormals();
    part.geometry.computeBoundingBox();
    part.geometry.computeBoundingSphere();
  }
  return { url, parts, height: Math.max(size.y, 0.05), radius: Math.max(size.x, size.z) * 0.5 };
}

export function instancePrefab(scene, prefab, points, {
  targetHeight = 8,
  scaleJitter = 0.22,
  sink = 0.06,
  wind = 0,
  windFoliageOnly = true,
  shadow = true,
  rand,
  onEach = null,
}) {
  if (!points.length) return { meshes: [], count: 0 };
  const matrices = [];
  points.forEach((p, i) => {
    const scale = (targetHeight / prefab.height) * (1 + rand(-scaleJitter, scaleJitter));
    dummy.position.set(p.x, p.y - sink * scale, p.z);
    dummy.rotation.set(0, rand(0, Math.PI * 2), 0);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    matrices.push(dummy.matrix.clone());
    if (onEach) onEach(p, scale, i);
  });

  const meshes = prefab.parts.map((part) => {
    const material = part.material.clone();
    if (wind > 0 && (!windFoliageOnly || part.foliage)) applyWind(material, wind);
    const mesh = new THREE.InstancedMesh(part.geometry, material, points.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.name = part.name || prefab.url;
    scene.add(mesh);
    return mesh;
  });
  return { meshes, count: points.length };
}

export async function plantIsland(scene, {
  scatter, addTrunk, rand,
}) {
  const q = (name) => loadPrefab(`./models/quaternius/${name}.glb`);
  const k = (name) => loadPrefab(`./models/kenney/${name}.glb`);
  const [
    common1, common2, birch, pine1, pine2,
    bushQ1, bushQ2, bushK1, bushK2,
    grassQ, grassK, grassLeaf,
    flowersQ, flowerY, flowerP, flowerR,
  ] = await Promise.all([
    q('CommonTree_1'), q('CommonTree_2'), q('BirchTree_1'), q('PineTree_1'), q('PineTree_2'),
    q('Bush_1'), q('Bush_2'), k('plant_bushDetailed'), k('plant_bushLarge'),
    q('Grass'), k('grass_large'), k('grass_leafsLarge'),
    q('Flowers'), k('flower_yellowA'), k('flower_purpleB'), k('flower_redA'),
  ]);

  const treeTrunk = (p, scale) => addTrunk(p.x, p.z, Math.max(0.22, scale * 0.038));

  const commonPts = scatter(90, { minH: 2.8, maxH: 16, minNy: 0.88, spacing: 7.5, rampMargin: 5, clusterNoise: { s: 70, t: -0.2 } });
  const common2Pts = scatter(75, { minH: 2.6, maxH: 14, minNy: 0.88, spacing: 7.8, rampMargin: 5, clusterNoise: { s: 55, t: -0.15 } });
  const birchPts = scatter(55, { minH: 3.0, maxH: 18, minNy: 0.86, spacing: 8.2, rampMargin: 5 });
  const pinePts = scatter(110, { minH: 7, maxH: 34, minNy: 0.86, spacing: 6.4, rampMargin: 5, clusterNoise: { s: 60, t: -0.3 } });
  const pine2Pts = scatter(70, { minH: 8, maxH: 34, minNy: 0.85, spacing: 6.8, rampMargin: 5, clusterNoise: { s: 50, t: -0.2 } });

  instancePrefab(scene, common1, commonPts, { targetHeight: 11, wind: 0.016, rand, onEach: treeTrunk });
  instancePrefab(scene, common2, common2Pts, { targetHeight: 10, wind: 0.016, rand, onEach: treeTrunk });
  instancePrefab(scene, birch, birchPts, { targetHeight: 12, wind: 0.018, rand, onEach: treeTrunk });
  instancePrefab(scene, pine1, pinePts, { targetHeight: 14, wind: 0.012, rand, onEach: treeTrunk });
  instancePrefab(scene, pine2, pine2Pts, { targetHeight: 13, wind: 0.012, rand, onEach: treeTrunk });

  const bushA = scatter(140, { minH: 2.3, maxH: 22, minNy: 0.85, spacing: 3.2, rampMargin: 1.4 });
  const bushB = scatter(110, { minH: 2.3, maxH: 20, minNy: 0.85, spacing: 3.4, rampMargin: 1.4 });
  const bushC = scatter(90, { minH: 2.2, maxH: 18, minNy: 0.84, spacing: 2.8, rampMargin: 1.2 });
  const bushD = scatter(80, { minH: 2.2, maxH: 16, minNy: 0.84, spacing: 3.0, rampMargin: 1.2 });
  instancePrefab(scene, bushQ1, bushA, { targetHeight: 1.7, wind: 0.055, windFoliageOnly: false, rand });
  instancePrefab(scene, bushQ2, bushB, { targetHeight: 1.45, wind: 0.055, windFoliageOnly: false, rand });
  instancePrefab(scene, bushK1, bushC, { targetHeight: 1.35, wind: 0.06, windFoliageOnly: false, rand });
  instancePrefab(scene, bushK2, bushD, { targetHeight: 1.55, wind: 0.05, windFoliageOnly: false, rand });

  const grassA = scatter(1600, { minH: 2.0, maxH: 22, minNy: 0.84, rampMargin: 0.35 });
  const grassB = scatter(1200, { minH: 2.0, maxH: 20, minNy: 0.84, rampMargin: 0.35 });
  const grassC = scatter(900, { minH: 2.1, maxH: 18, minNy: 0.85, rampMargin: 0.35 });
  instancePrefab(scene, grassQ, grassA, { targetHeight: 0.55, scaleJitter: 0.35, wind: 0.14, windFoliageOnly: false, shadow: false, sink: 0.02, rand });
  instancePrefab(scene, grassK, grassB, { targetHeight: 0.45, scaleJitter: 0.3, wind: 0.13, windFoliageOnly: false, shadow: false, sink: 0.02, rand });
  instancePrefab(scene, grassLeaf, grassC, { targetHeight: 0.5, scaleJitter: 0.3, wind: 0.12, windFoliageOnly: false, shadow: false, sink: 0.02, rand });

  const flA = scatter(220, { minH: 2.5, maxH: 16, minNy: 0.88, rampMargin: 0.4, clusterNoise: { s: 28, t: 0.05 } });
  const flB = scatter(180, { minH: 2.5, maxH: 15, minNy: 0.88, rampMargin: 0.4, clusterNoise: { s: 26, t: 0.0 } });
  const flC = scatter(160, { minH: 2.5, maxH: 15, minNy: 0.88, rampMargin: 0.4, clusterNoise: { s: 24, t: 0.0 } });
  const flD = scatter(150, { minH: 2.5, maxH: 14, minNy: 0.88, rampMargin: 0.4, clusterNoise: { s: 22, t: -0.05 } });
  instancePrefab(scene, flowersQ, flA, { targetHeight: 0.42, wind: 0.11, windFoliageOnly: false, shadow: false, sink: 0.01, rand });
  instancePrefab(scene, flowerY, flB, { targetHeight: 0.38, wind: 0.12, windFoliageOnly: false, shadow: false, sink: 0.01, rand });
  instancePrefab(scene, flowerP, flC, { targetHeight: 0.36, wind: 0.12, windFoliageOnly: false, shadow: false, sink: 0.01, rand });
  instancePrefab(scene, flowerR, flD, { targetHeight: 0.36, wind: 0.12, windFoliageOnly: false, shadow: false, sink: 0.01, rand });

  return {
    loaded: 16,
    trees: commonPts.length + common2Pts.length + birchPts.length + pinePts.length + pine2Pts.length,
    bushes: bushA.length + bushB.length + bushC.length + bushD.length,
    grass: grassA.length + grassB.length + grassC.length,
    flowers: flA.length + flB.length + flC.length + flD.length,
    treePts: [...commonPts, ...common2Pts, ...birchPts, ...pinePts, ...pine2Pts],
  };
}
