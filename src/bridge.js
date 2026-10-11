import * as THREE from 'three';

function woodMat() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = `hsl(28, 38%, ${28 + (i % 3) * 6}%)`;
    ctx.fillRect(0, i * 8, 64, 8);
    ctx.fillStyle = 'rgba(40,20,8,0.35)';
    ctx.fillRect(0, i * 8, 64, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.88, metalness: 0 });
}

function vineMat() {
  return new THREE.MeshStandardMaterial({ color: 0x3a5a22, roughness: 0.85, metalness: 0 });
}

function ropeMat() {
  return new THREE.MeshStandardMaterial({ color: 0x6b4a28, roughness: 0.7, metalness: 0 });
}

function catenaryY(t, y0, y1, sag) {
  return y0 + (y1 - y0) * t - sag * 4 * t * (1 - t);
}

export function createVineBridge(scene, { a, b, sag = 5.2 }) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const L = Math.hypot(dx, dz);
  const dirx = dx / L, dirz = dz / L;
  const sideX = -dirz, sideZ = dirx;
  const y0 = a.y, y1 = b.y;
  const W = 1.9;
  const plankN = Math.max(22, Math.round(L / 0.95));
  const wood = woodMat();
  const vine = vineMat();
  const rope = ropeMat();

  const group = new THREE.Group();
  group.name = 'vine-bridge';
  const hanging = new THREE.Group();
  hanging.name = 'bridge-hang';
  group.add(hanging);

  const plankGeo = new THREE.BoxGeometry(W, 0.09, 0.52);
  for (let i = 0; i < plankN; i++) {
    const t = (i + 0.5) / plankN;
    const plank = new THREE.Mesh(plankGeo, wood);
    plank.position.set(a.x + dirx * t * L, catenaryY(t, y0, y1, sag) + 0.05, a.z + dirz * t * L);
    plank.rotation.y = Math.atan2(dirx, dirz);
    plank.rotation.x = Math.atan2(
      (catenaryY(Math.min(1, t + 0.02), y0, y1, sag) - catenaryY(Math.max(0, t - 0.02), y0, y1, sag)),
      0.04 * L
    ) * 0.55;
    plank.castShadow = true;
    plank.receiveShadow = true;
    hanging.add(plank);

    if (i % 2 === 0) {
      for (const s of [-1, 1]) {
        const railY = catenaryY(t, y0, y1, sag) + 1.05;
        const px = a.x + dirx * t * L + sideX * (W * 0.52) * s;
        const pz = a.z + dirz * t * L + sideZ * (W * 0.52) * s;
        const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 1.05, 5), vine);
        drop.position.set(px, railY - 0.48, pz);
        hanging.add(drop);
      }
    }
  }

  function cable(side, yOff, radius, mat, segs = 28) {
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      pts.push(new THREE.Vector3(
        a.x + dirx * t * L + sideX * side,
        catenaryY(t, y0, y1, sag) + yOff,
        a.z + dirz * t * L + sideZ * side
      ));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, radius, 5, false), mat);
    mesh.castShadow = true;
    hanging.add(mesh);
  }
  cable(-W * 0.52, 0.98, 0.04, rope);
  cable(W * 0.52, 0.98, 0.04, rope);
  cable(-W * 0.52, 0.08, 0.035, vine);
  cable(W * 0.52, 0.08, 0.035, vine);

  function post(x, y, z) {
    const p = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 2.4, 8), wood);
    pole.position.y = 1.15;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), wood);
    cap.position.y = 2.38;
    p.add(pole, cap);
    p.position.set(x, y, z);
    p.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    group.add(p);
  }
  for (const s of [-1, 1]) {
    post(a.x + sideX * 0.95 * s, y0 - 0.05, a.z + sideZ * 0.95 * s);
    post(b.x + sideX * 0.95 * s, y1 - 0.05, b.z + sideZ * 0.95 * s);
  }

  scene.add(group);

  const hw = W * 0.48;
  function surface(x, z) {
    const vx = x - a.x, vz = z - a.z;
    const along = vx * dirx + vz * dirz;
    const lat = vx * sideX + vz * sideZ;
    if (along < -0.25 || along > L + 0.25 || Math.abs(lat) > hw) return -Infinity;
    const t = Math.min(1, Math.max(0, along / L));
    return catenaryY(t, y0, y1, sag);
  }

  return {
    a, b, L,
    surface,
    update(time) {
      hanging.position.y = Math.sin(time * 1.15) * 0.045;
      hanging.rotation.z = Math.sin(time * 0.85) * 0.006;
    },
  };
}
