import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadManager } from './look.js';

const SPECS = [
  { url: './models/birds/Flamingo.glb', scale: 0.011, speed: 9.5 },
  { url: './models/birds/Parrot.glb', scale: 0.015, speed: 12 },
  { url: './models/birds/Stork.glb', scale: 0.013, speed: 8.5 },
];

export async function createBirds(scene, { rand, count = 8 }) {
  const loader = new GLTFLoader(loadManager);
  const gltfs = await Promise.all(SPECS.map((s) => loader.loadAsync(s.url)));
  const birds = [];
  const mixers = [];
  const tmp = new THREE.Vector3();
  const look = new THREE.Vector3();

  function pickTarget(b) {
    b.target.set(rand(-90, 260), rand(20, 54), rand(-90, 90));
  }

  for (let i = 0; i < count; i++) {
    const spec = SPECS[i % SPECS.length];
    const src = gltfs[i % gltfs.length];
    const mesh = src.scene.clone(true);
    mesh.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
      }
    });
    mesh.scale.setScalar(spec.scale);
    mesh.position.set(rand(-40, 180), rand(24, 48), rand(-60, 60));
    scene.add(mesh);
    const mixer = new THREE.AnimationMixer(mesh);
    if (src.animations[0]) {
      const act = mixer.clipAction(src.animations[0]);
      act.play();
      act.timeScale = 0.85 + (i % 5) * 0.08;
    }
    mixers.push(mixer);
    const b = {
      mesh,
      vel: new THREE.Vector3(rand(-1, 1), rand(-0.15, 0.15), rand(-1, 1)).normalize().multiplyScalar(spec.speed),
      target: new THREE.Vector3(),
      speed: spec.speed,
    };
    pickTarget(b);
    birds.push(b);
  }

  return {
    count: birds.length,
    update(dt) {
      for (const m of mixers) m.update(dt);
      for (const b of birds) {
        tmp.copy(b.target).sub(b.mesh.position);
        if (tmp.lengthSq() < 140) pickTarget(b);
        tmp.normalize();
        b.vel.x += (tmp.x * b.speed - b.vel.x) * Math.min(1, 1.7 * dt);
        b.vel.y += (tmp.y * b.speed * 0.35 - b.vel.y) * Math.min(1, 1.2 * dt);
        b.vel.z += (tmp.z * b.speed - b.vel.z) * Math.min(1, 1.7 * dt);
        b.mesh.position.addScaledVector(b.vel, dt);
        b.mesh.position.y = Math.min(62, Math.max(16, b.mesh.position.y));
        look.copy(b.mesh.position).add(b.vel);
        b.mesh.lookAt(look);
      }
    },
  };
}
