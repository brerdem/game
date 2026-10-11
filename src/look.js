import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const loader = new THREE.TextureLoader();

function loadMap(url, { color = false, wrap = true, repeat = 1 } = {}) {
  const tex = loader.load(url);
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
    map: loadMap(`./textures/${folder}/color.webp`, { color: true, repeat }),
    normalMap: loadMap(`./textures/${folder}/normal.webp`, { repeat }),
    roughnessMap: loadMap(`./textures/${folder}/rough.webp`, { repeat }),
  };
}

export function bakeHeightTexture(terrainHeight, WORLD, size = 256) {
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = (i / (size - 1) - 0.5) * WORLD;
      const z = (j / (size - 1) - 0.5) * WORLD;
      const h = terrainHeight(x, z);
      const enc = Math.max(0, Math.min(255, Math.round((h + 8) * (255 / 40))));
      const o = (j * size + i) * 4;
      data[o] = data[o + 1] = data[o + 2] = enc;
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

export function createEnvironment(renderer, scene, sunDir) {
  const sky = new Sky();
  sky.scale.setScalar(4500);
  sky.name = 'sky';
  const su = sky.material.uniforms;
  su.turbidity.value = 2.6;
  su.rayleigh.value = 1.15;
  su.mieCoefficient.value = 0.0035;
  su.mieDirectionalG.value = 0.82;
  su.sunPosition.value.copy(sunDir.clone().multiplyScalar(400));
  scene.add(sky);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  const env = pmrem.fromScene(envScene, 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.62;
  envScene.dispose?.();
  pmrem.dispose();

  const haze = new THREE.Color(0xc5d8ea);
  scene.fog = new THREE.FogExp2(haze, 0.0054);
  scene.background = haze;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return { sky, env, haze };
}

export function createClouds(scene, sunDir) {
  const uniforms = {
    uTime: { value: 0 },
    uSun: { value: sunDir.clone() },
    uColor: { value: new THREE.Color(0xf8fbff) },
    uShadow: { value: new THREE.Color(0xa8b8c9) },
  };
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
    uniforms,
    vertexShader: `
      varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uSun, uColor, uShadow;
      varying vec3 vW;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        float a = hash(i), b = hash(i+vec2(1,0)), c = hash(i+vec2(0,1)), d = hash(i+vec2(1,1));
        vec2 u = f*f*(3.0-2.0*f);
        return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
      }
      float fbm(vec2 p){
        float s = 0.0, a = 0.5;
        for (int i = 0; i < 6; i++) { s += a * noise(p); p = p * 2.07 + vec2(11.3, 4.1); a *= 0.51; }
        return s;
      }
      void main() {
        vec2 uv = vW.xz * 0.00095;
        float n = fbm(uv + vec2(uTime * 0.006, uTime * 0.003));
        n += 0.32 * fbm(uv * 2.35 - vec2(uTime * 0.009, uTime * 0.002));
        float rim = 1.0 - smoothstep(0.35, 1.05, length(uv) * 0.55);
        float dens = smoothstep(0.50, 0.76, n) * rim;
        dens *= 0.88;
        if (dens < 0.025) discard;
        float lit = 0.5 + 0.5 * clamp(dot(normalize(uSun), vec3(0.12, 1.0, 0.18)), 0.0, 1.0);
        vec3 col = mix(uShadow, uColor, lit + 0.12 * n);
        gl_FragColor = vec4(col, dens);
      }
    `,
  });
  const layers = [];
  for (const [y, s] of [[180, 2600], [260, 3200], [360, 4000], [470, 4600]]) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s, s, 1, 1), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.renderOrder = -2;
    mesh.frustumCulled = false;
    mesh.layers.set(1);
    scene.add(mesh);
    layers.push(mesh);
  }
  return {
    update(time, cam) {
      uniforms.uTime.value = time;
      for (const m of layers) {
        m.position.x = cam.position.x;
        m.position.z = cam.position.z;
      }
    },
  };
}

export function applyTerrainSplat(terrain) {
  const grass = loadPBR('grass', 1);
  const dirt = loadPBR('dirt', 1);
  const sand = loadPBR('sand', 1);
  const rock = loadPBR('rock', 1);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tGrass = { value: grass.map };
    shader.uniforms.tDirt = { value: dirt.map };
    shader.uniforms.tSand = { value: sand.map };
    shader.uniforms.tRock = { value: rock.map };
    shader.uniforms.tGrassN = { value: grass.normalMap };
    shader.uniforms.tDirtN = { value: dirt.normalMap };
    shader.uniforms.tRockN = { value: rock.normalMap };
    shader.vertexShader = `
      varying vec3 vWPos;
      varying float vNy;
      ${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vNy = normalize(mat3(modelMatrix) * objectNormal).y;`
    );
    shader.fragmentShader = `
      uniform sampler2D tGrass, tDirt, tSand, tRock, tGrassN, tDirtN, tRockN;
      varying vec3 vWPos;
      varying float vNy;
      ${shader.fragmentShader}`.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      vec2 uv1 = vWPos.xz * 0.19;
      vec2 uv2 = vWPos.xz * 0.047 + vec2(17.3, 9.1);
      vec3 grassC = mix(texture2D(tGrass, uv1).rgb, texture2D(tGrass, uv2).rgb, 0.38);
      vec3 dirtC = texture2D(tDirt, uv1 * 0.82).rgb;
      vec3 sandC = texture2D(tSand, uv1 * 0.68).rgb;
      vec3 rockC = texture2D(tRock, uv1 * 0.48).rgb;
      float h = vWPos.y;
      float sandW = 1.0 - smoothstep(0.25, 2.05, h);
      float rockW = smoothstep(0.88, 0.58, vNy);
      float dirtN = fract(sin(dot(floor(vWPos.xz * 0.35), vec2(12.9898, 78.233))) * 43758.5453);
      float dirtW = smoothstep(0.58, 0.86, dirtN) * (1.0 - sandW) * 0.5;
      vec3 col = grassC;
      col = mix(col, dirtC, dirtW);
      col = mix(col, sandC, clamp(sandW, 0.0, 1.0));
      col = mix(col, rockC, clamp(rockW * (1.0 - sandW * 0.85), 0.0, 1.0));
      diffuseColor.rgb = col;`
    );
  };
  mat.customProgramCacheKey = () => 'terrain-splat-v3';
  terrain.material.dispose();
  terrain.material = mat;
  terrain.material.needsUpdate = true;
}

export function createOcean(scene, sunDir, { heightTex, WORLD, LOW = false }) {
  const normals = loadMap('./textures/waternormals.jpg', { wrap: true, repeat: 8 });
  const water = new Water(new THREE.PlaneGeometry(6000, 6000), {
    textureWidth: LOW ? 256 : 512,
    textureHeight: LOW ? 256 : 512,
    waterNormals: normals,
    sunDirection: sunDir.clone().normalize(),
    sunColor: 0xfff1c8,
    waterColor: 0x0c4554,
    distortionScale: 3.1,
    fog: true,
    alpha: 0.94,
  });
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.02;
  water.material.transparent = true;
  const mat = water.material;
  mat.uniforms.tHeight = { value: heightTex };
  mat.uniforms.uWorld = { value: WORLD };
  mat.uniforms.uShallow = { value: new THREE.Color(0x5ec8d6) };
  mat.uniforms.uDeep = { value: new THREE.Color(0x083540) };
  mat.fragmentShader = mat.fragmentShader
    .replace(
      'uniform vec3 waterColor;',
      `uniform vec3 waterColor;
       uniform sampler2D tHeight;
       uniform float uWorld;
       uniform vec3 uShallow;
       uniform vec3 uDeep;`
    )
    .replace(
      'vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * waterColor;',
      `float terrainH = texture2D(tHeight, worldPosition.xz / uWorld + 0.5).r * 40.0 - 8.0;
       float depth = max(0.02, 0.12 - terrainH);
       vec3 depthColor = mix(uShallow, uDeep, smoothstep(0.15, 7.5, depth));
       float foamBand = smoothstep(1.15, 0.02, abs(terrainH - 0.04));
       float foamN = 0.5 + 0.5 * getNoise(worldPosition.xz * 0.42).x;
       float foam = clamp(foamBand * (0.4 + 0.6 * foamN), 0.0, 1.0);
       vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * depthColor;`
    )
    .replace(
      'gl_FragColor = vec4( outgoingLight, alpha );',
      `outgoingLight = mix(outgoingLight, vec3(0.93, 0.97, 0.99), foam * 0.82);
       float shoreAlpha = mix(0.42, alpha, smoothstep(0.12, 3.2, depth));
       gl_FragColor = vec4( outgoingLight, shoreAlpha );`
    );
  mat.needsUpdate = true;
  scene.add(water);

  return {
    water,
    update(time, sunDirection) {
      water.material.uniforms.time.value = time * 0.32;
      if (water.material.uniforms.sunDirection) {
        water.material.uniforms.sunDirection.value.copy(sunDirection);
      }
    },
  };
}
