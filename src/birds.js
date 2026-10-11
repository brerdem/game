import * as THREE from 'three';

const white = () => new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.62, metalness: 0 });
const grey = () => new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.7, metalness: 0 });
const tip = () => new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.75, metalness: 0 });
const beak = () => new THREE.MeshStandardMaterial({ color: 0xf0b429, roughness: 0.45, metalness: 0 });
const dark = () => new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.8, metalness: 0 });

function makeSeagull() {
  const root = new THREE.Group();
  const bodyMat = white();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), bodyMat);
  body.scale.set(1.55, 0.72, 0.82);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.32, 5), bodyMat);
  tail.position.set(0, 0.02, 0.38);
  tail.rotation.x = Math.PI / 2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 6), bodyMat);
  head.position.set(0, 0.1, -0.34);
  const bill = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.16, 5), beak());
  bill.position.set(0, 0.08, -0.48);
  bill.rotation.x = -Math.PI / 2;
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.018, 5, 4), dark());
  eyeL.position.set(0.07, 0.14, -0.4);
  const eyeR = eyeL.clone();
  eyeR.position.x = -0.07;

  function wing(side) {
    const w = new THREE.Group();
    const inner = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.035, 0.22), grey());
    inner.position.set(0.36 * side, 0, 0);
    const outer = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.16), tip());
    outer.position.set(0.74 * side, 0, 0.01);
    w.add(inner, outer);
    w.position.set(0.12 * side, 0.04, -0.02);
    return w;
  }

  const wingL = wing(1);
  const wingR = wing(-1);
  root.add(body, tail, head, bill, eyeL, eyeR, wingL, wingR);
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
    }
  });
  return { root, wingL, wingR };
}

export function createBirds(scene, { rand, count = 8 }) {
  const birds = [];
  const tmp = new THREE.Vector3();
  const look = new THREE.Vector3();

  function pickTarget(b) {
    b.target.set(rand(-80, 230), rand(38, 66), rand(-90, 90));
    b.glide = rand(0, 1) < 0.35;
    b.glideT = rand(1.2, 3.4);
  }

  for (let i = 0; i < count; i++) {
    const { root, wingL, wingR } = makeSeagull();
    const s = rand(2.4, 3.4);
    root.scale.setScalar(s);
    root.position.set(rand(-30, 160), rand(40, 62), rand(-50, 50));
    scene.add(root);
    const speed = rand(8.5, 12.5);
    const b = {
      mesh: root,
      wingL,
      wingR,
      vel: new THREE.Vector3(rand(-1, 1), rand(-0.1, 0.1), rand(-1, 1)).normalize().multiplyScalar(speed),
      target: new THREE.Vector3(),
      speed,
      phase: rand(0, Math.PI * 2),
      flap: 2.6 + (i % 4) * 0.18,
      bank: 0,
      glide: false,
      glideT: 0,
    };
    pickTarget(b);
    birds.push(b);
  }

  return {
    count: birds.length,
    list: birds,
    update(dt) {
      for (const b of birds) {
        tmp.copy(b.target).sub(b.mesh.position);
        if (tmp.lengthSq() < 180) pickTarget(b);
        tmp.normalize();
        const prevYaw = Math.atan2(b.vel.x, b.vel.z);
        b.vel.x += (tmp.x * b.speed - b.vel.x) * Math.min(1, 1.4 * dt);
        b.vel.y += (tmp.y * b.speed * 0.28 - b.vel.y) * Math.min(1, 0.9 * dt);
        b.vel.z += (tmp.z * b.speed - b.vel.z) * Math.min(1, 1.4 * dt);
        b.mesh.position.addScaledVector(b.vel, dt);
        b.mesh.position.y = Math.min(70, Math.max(35, b.mesh.position.y));
        const yaw = Math.atan2(b.vel.x, b.vel.z);
        let dyaw = yaw - prevYaw;
        if (dyaw > Math.PI) dyaw -= Math.PI * 2;
        if (dyaw < -Math.PI) dyaw += Math.PI * 2;
        b.bank += (THREE.MathUtils.clamp(-dyaw * 18, -0.55, 0.55) - b.bank) * Math.min(1, 3 * dt);
        look.copy(b.mesh.position).add(b.vel);
        b.mesh.lookAt(look);
        b.mesh.rotateZ(b.bank);

        b.glideT -= dt;
        if (b.glideT <= 0) {
          b.glide = !b.glide;
          b.glideT = b.glide ? rand(1.4, 3.2) : rand(2.2, 4.5);
        }
        b.phase += dt * b.flap;
        const flap = b.glide ? 0.12 : Math.sin(b.phase) * 0.72;
        b.wingL.rotation.z = flap;
        b.wingR.rotation.z = -flap;
      }
    },
  };
}
