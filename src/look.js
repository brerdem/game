import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const loadManager = new THREE.LoadingManager();
const loader = new THREE.TextureLoader(loadManager);

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
      // Hard land mask: grass-ready ground only. Neighbours must also be
      // above the beach so linear filtering cannot smear land onto the sea.
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

function gpuName(renderer) {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
}

export function isSoftwareGL(renderer) {
  return /swiftshader|llvmpipe|softpipe|microsoft basic/i.test(gpuName(renderer));
}

function addGradientSky(scene, sunDir) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    uniforms: {
      top: { value: new THREE.Color(0x4d8fd4) },
      mid: { value: new THREE.Color(0x8ebce6) },
      horizon: { value: new THREE.Color(0xc5d8ea) },
      sunDir: { value: sunDir.clone() },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 top, mid, horizon, sunDir; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.22, h));
        c = mix(c, top, smoothstep(0.18, 0.85, h));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        c += vec3(1.0, 0.93, 0.75) * (pow(s, 700.0) * 2.2 + pow(s, 28.0) * 0.22);
        if (d.y < 0.0) c = horizon;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1600, 32, 16), mat);
  mesh.renderOrder = -3;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

export function createEnvironment(renderer, scene, sunDir) {
  const software = isSoftwareGL(renderer);
  let sky = null;
  if (!software) {
    sky = new Sky();
    sky.scale.setScalar(4500);
    sky.name = 'sky';
    const su = sky.material.uniforms;
    su.turbidity.value = 5.5;
    su.rayleigh.value = 2.6;
    su.mieCoefficient.value = 0.005;
    su.mieDirectionalG.value = 0.75;
    su.sunPosition.value.copy(sunDir.clone().multiplyScalar(400));
    scene.add(sky);
  }
  addGradientSky(scene, sunDir);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  const env = pmrem.fromScene(envScene, 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.7;
  envScene.dispose?.();
  pmrem.dispose();

  const haze = new THREE.Color(0x9dbdd4);
  scene.fog = new THREE.FogExp2(haze, software ? 0.0028 : 0.0038);
  scene.background = haze;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = software ? 0.95 : 0.62;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return { sky, env, haze, software };
}

export function createClouds(scene, sunDir) {
  const uniforms = {
    uTime: { value: 0 },
    uSun: { value: sunDir.clone().normalize() },
    uTop: { value: new THREE.Color(0xffffff) },
    uBot: { value: new THREE.Color(0xc5d2e0) },
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
      uniform vec3 uSun, uTop, uBot;
      varying vec3 vW;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        float a = hash(i), b = hash(i+vec2(1,0)), c = hash(i+vec2(0,1)), d = hash(i+vec2(1,1));
        vec2 u = f*f*(3.0-2.0*f);
        return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
      }
      float fbm(vec2 p){
        float s = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.12 + vec2(17.1, 9.4); a *= 0.5; }
        return s;
      }
      float billow(vec2 p){
        float n = fbm(p);
        return 1.0 - abs(2.0 * n - 1.0);
      }
      float cumulus(vec2 p){
        float macro = billow(p * 0.55);
        float lobes = billow(p * 1.35 + vec2(4.2, 1.7));
        float detail = fbm(p * 3.4);
        float holes = fbm(p * 0.9 + 11.0);
        float c = macro * 0.55 + lobes * 0.38 + detail * 0.12;
        c *= smoothstep(0.28, 0.58, holes);
        return c;
      }
      void main() {
        vec2 uv = vW.xz * 0.00105 + vec2(uTime * 0.0065, uTime * 0.0028);
        float n = cumulus(uv);
        float n2 = cumulus(uv * 1.15 + vec2(8.1, -3.4));
        n = max(n, n2 * 0.72);
        float rim = 1.0 - smoothstep(0.38, 1.08, length(vW.xz) * 0.00042);
        float dens = smoothstep(0.52, 0.74, n) * rim;
        dens = pow(dens, 0.85);
        if (dens < 0.04) discard;
        float gx = cumulus(uv + vec2(0.035, 0.0)) - cumulus(uv - vec2(0.035, 0.0));
        float gz = cumulus(uv + vec2(0.0, 0.035)) - cumulus(uv - vec2(0.0, 0.035));
        vec3 nor = normalize(vec3(-gx, 0.55, -gz));
        float ndl = clamp(dot(nor, normalize(uSun)), 0.0, 1.0);
        float wrap = ndl * 0.75 + 0.25;
        vec3 col = mix(uBot, uTop, wrap);
        col += vec3(0.08, 0.07, 0.05) * pow(ndl, 3.0);
        gl_FragColor = vec4(col, dens);
      }
    `,
  });
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
  const puffMat = new THREE.MeshBasicMaterial({
    map: puffTex,
    transparent: true,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  puffMat.onBeforeCompile = (shader) => {
    shader.uniforms.uSun = uniforms.uSun;
    shader.vertexShader = `
      varying vec2 vUv2;
      ${shader.vertexShader}`.replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
      vUv2 = uv;`
    );
    shader.fragmentShader = `
      uniform vec3 uSun;
      varying vec2 vUv2;
      ${shader.fragmentShader}`.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      float lit = 0.42 + 0.58 * vUv2.y;
      float sun = 0.16 * max(uSun.y, 0.0);
      diffuseColor.rgb = mix(vec3(0.86, 0.90, 0.96), vec3(1.0, 1.0, 1.0), clamp(lit + sun, 0.0, 1.0));
      diffuseColor.rgb *= sampledDiffuseColor.rgb;`
    );
  };
  const dummy = new THREE.Object3D();
  const PUFFS = 36;
  const puffs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.68), puffMat, PUFFS);
  const puffMeta = [];
  for (let i = 0; i < PUFFS; i++) {
    const a = (i / PUFFS) * Math.PI * 2 + i * 0.21;
    const r = 55 + (i % 9) * 34;
    puffMeta.push({
      a, r,
      y: 78 + (i % 6) * 20,
      s: 48 + (i % 7) * 16,
    });
  }
  puffs.frustumCulled = false;
  puffs.layers.set(1);
  puffs.renderOrder = -1;
  scene.add(puffs);

  return {
    update(time, cam) {
      uniforms.uTime.value = time;
      for (const m of layers) {
        m.position.x = cam.position.x;
        m.position.z = cam.position.z;
      }
      for (let i = 0; i < PUFFS; i++) {
        const p = puffMeta[i];
        const ang = p.a + time * 0.008;
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
      vec3 sandC = texture2D(tSand, uv1 * 0.52).rgb * vec3(1.14, 1.04, 0.82);
      vec3 rockC = texture2D(tRock, uv1 * 0.48).rgb;
      float h = vWPos.y;
      float sandW = 1.0 - smoothstep(0.0, 4.1, h);
      float rockW = smoothstep(0.88, 0.58, vNy);
      float dirtN = fract(sin(dot(vWPos.xz * 0.07, vec2(12.9898, 78.233))) * 43758.5453);
      dirtN = mix(dirtN, fract(sin(dot(vWPos.xz * 0.021, vec2(91.13, 47.7))) * 23421.6), 0.5);
      float dirtW = smoothstep(0.78, 0.96, dirtN) * (1.0 - sandW) * 0.32;
      vec3 col = grassC;
      col = mix(col, dirtC, dirtW);
      col = mix(col, sandC, clamp(sandW, 0.0, 1.0));
      col = mix(col, rockC, clamp(rockW * (1.0 - sandW * 0.85), 0.0, 1.0));
      diffuseColor.rgb = col;`
    );
  };
  mat.customProgramCacheKey = () => 'terrain-splat-v5';
  terrain.material.dispose();
  terrain.material = mat;
  terrain.material.needsUpdate = true;
}

export function createOcean(scene, sunDir, { heightTex, WORLD, LOW = false, software = false }) {
  const normals = loadMap('./textures/waternormals.jpg', { wrap: true, repeat: 8 });
  if (software) {
    const mat = new THREE.MeshStandardMaterial({
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
      update(time) {
        normals.offset.x = time * 0.012;
        normals.offset.y = time * 0.007;
        water.position.y = 0.02 + Math.sin(time * 0.6) * 0.03;
      },
    };
  }
  const water = new Water(new THREE.PlaneGeometry(6000, 6000), {
    textureWidth: LOW ? 256 : 512,
    textureHeight: LOW ? 256 : 512,
    waterNormals: normals,
    sunDirection: sunDir.clone().normalize(),
    sunColor: 0xffe8b0,
    waterColor: 0x0a3d4c,
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
      'vec3 albedo = mix( ( sunColor * diffuseLight * 0.3 + scatter ) * getShadowMask(), ( vec3( 0.1 ) + reflectionSample * 0.9 + reflectionSample * specularLight ), reflectance);',
      'vec3 albedo = mix( ( sunColor * diffuseLight * 0.22 + scatter ) * getShadowMask(), ( depthColor * 0.4 + reflectionSample * 0.4 + specularLight * 0.55 ), reflectance * 0.55);'
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
