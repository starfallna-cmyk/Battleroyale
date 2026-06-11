import * as THREE from 'three';
import { CELL } from './builds.js';

export const ARENA = 70; // half-size of the playable square

// Six spawn points around the edge, each facing the center.
export const SPAWNS = [[-62, 0], [62, 0], [0, -62], [0, 62], [-52, 52], [52, -52]]
  .map(([x, z]) => ({ pos: [x, 0, z], yaw: Math.atan2(x, z) }));

function groundTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d');
  c.fillStyle = '#8da08b';
  c.fillRect(0, 0, 128, 128);
  c.strokeStyle = 'rgba(60,75,62,0.4)';
  c.lineWidth = 2;
  c.strokeRect(1, 1, 126, 126);
  for (let i = 0; i < 22; i++) {
    c.fillStyle = `rgba(${90 + Math.random() * 40},${110 + Math.random() * 30},${85 + Math.random() * 30},0.25)`;
    c.fillRect(Math.random() * 122, Math.random() * 122, 4 + Math.random() * 8, 4 + Math.random() * 8);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set((ARENA * 2) / CELL, (ARENA * 2) / CELL);
  tex.anisotropy = 4;
  return tex;
}

// Builds the whole static world. Returns { solids, staticMeshes, pads, groundMesh, spawns }.
export function buildMap(scene) {
  const solids = [];
  const staticMeshes = [];

  scene.add(new THREE.HemisphereLight(0xffffff, 0x55657a, 1.0));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.6);
  sun.position.set(60, 100, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, far: 300 });
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(ARENA * 2, 1, ARENA * 2),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 }));
  ground.position.y = -0.5;
  ground.receiveShadow = true;
  scene.add(ground);

  const outer = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 1200),
    new THREE.MeshStandardMaterial({ color: 0x6b7f6a, roughness: 1 }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.55;
  scene.add(outer);

  // translucent energy boundary
  const boundMat = new THREE.MeshBasicMaterial({
    color: 0x4fa8ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide,
  });
  for (let i = 0; i < 4; i++) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2, 26), boundMat);
    const a = i * Math.PI / 2;
    w.position.set(Math.sin(a) * ARENA, 13, Math.cos(a) * ARENA);
    w.rotation.y = a;
    scene.add(w);
  }

  // --- primitive helpers (all axis-aligned for cheap collision) ---
  const box = (w, h, d, x, z, color, baseY = 0, { solid = true, rough = 0.85 } = {}) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color, roughness: rough }));
    m.position.set(x, baseY + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    staticMeshes.push(m);
    if (solid) solids.push(new THREE.Box3().setFromObject(m));
    return m;
  };

  // wall running along X (fixed z) or Z (fixed x), with optional opening [from, to, yBottom, yTop]
  const wallRun = (axis, fixed, from, to, y0, h, color, opening = null) => {
    const th = 0.3;
    const segs = []; // [from, to, segY0, segH]
    if (!opening) {
      segs.push([from, to, y0, h]);
    } else {
      const [o0, o1, oy0, oy1] = opening;
      if (o0 > from) segs.push([from, o0, y0, h]);
      if (o1 < to) segs.push([o1, to, y0, h]);
      if (oy0 > y0) segs.push([o0, o1, y0, oy0 - y0]);
      if (oy1 < y0 + h) segs.push([o0, o1, oy1, y0 + h - oy1]);
    }
    for (const [a, b, sy, sh] of segs) {
      const len = b - a, mid = (a + b) / 2;
      if (axis === 'x') box(len, sh, th, mid, fixed, color, sy);
      else box(th, sh, len, fixed, mid, color, sy);
    }
  };

  const stairs = (x, z, alongZ, dirSign, color) => {
    // 6 steps x 0.5 up to 3.0 — climbable via step-up
    for (let i = 0; i < 6; i++) {
      const off = dirSign * (i * 0.55);
      if (alongZ) box(1.4, 0.5 * (i + 1), 0.55, x, z + off, color, 0);
      else box(0.55, 0.5 * (i + 1), 1.4, x + off, z, color, 0);
    }
  };

  // --- two-story house: 12x9 footprint, door, windows, interior stairs, flat roof ---
  const house = (cx, cz, wallColor, trimColor) => {
    const W = 12, D = 9, H = 3;
    const x0 = cx - W / 2, x1 = cx + W / 2, z0 = cz - D / 2, z1 = cz + D / 2;
    // ground floor walls
    wallRun('x', z1, x0, x1, 0, H, wallColor, [cx - 0.8, cx + 0.8, 0, 2.4]);        // front + door
    wallRun('x', z0, x0, x1, 0, H, wallColor, [cx - 1, cx + 1, 1.0, 2.2]);          // back + window
    wallRun('z', x0, z0, z1, 0, H, wallColor, [cz - 1, cz + 1, 1.0, 2.2]);          // left + window
    wallRun('z', x1, z0, z1, 0, H, wallColor);                                       // right (stairs inside)
    // second floor slab with a stairwell opening over the climb (z cz-2.5..cz+1.0 in the +x strip)
    box(W - 2.4, 0.25, D, cx - 1.2, cz, trimColor, H);
    box(2.4, 0.25, 3.5, x1 - 1.2, cz + 2.75, trimColor, H);
    box(2.4, 0.25, 2.0, x1 - 1.2, cz - 3.5, trimColor, H);
    // upper walls
    wallRun('x', z1, x0, x1, H, H, wallColor, [cx - 1, cx + 1, H + 1.0, H + 2.2]);  // front window
    wallRun('x', z0, x0, x1, H, H, wallColor, [cx - 1, cx + 1, H + 1.0, H + 2.2]);
    wallRun('z', x0, z0, z1, H, H, wallColor);
    wallRun('z', x1, z0, z1, H, H, wallColor, [cz - 1, cz + 1, H + 1.0, H + 2.2]);
    // roof + parapet
    box(W, 0.25, D, cx, cz, trimColor, H * 2);
    box(W, 0.45, 0.25, cx, z0 + 0.12, trimColor, H * 2 + 0.25);
    box(W, 0.45, 0.25, cx, z1 - 0.12, trimColor, H * 2 + 0.25);
    box(0.25, 0.45, D, x0 + 0.12, cz, trimColor, H * 2 + 0.25);
    box(0.25, 0.45, D, x1 - 0.12, cz, trimColor, H * 2 + 0.25);
    // interior stairs along the solid right wall, climbing toward -z
    stairs(x1 - 1.0, cz + 1.4, true, -1, trimColor);
    // door trim + porch
    box(2.2, 0.18, 1.6, cx, z1 + 0.9, trimColor, 0, { solid: false });
  };

  // --- small cabin: 7x6, door + window, flat roof ---
  const cabin = (cx, cz, doorSide = 1) => {
    const W = 7, D = 6, H = 2.8;
    const wood = 0x9c7a52, roof = 0x5f4a38;
    const x0 = cx - W / 2, x1 = cx + W / 2, z0 = cz - D / 2, z1 = cz + D / 2;
    const zd = doorSide > 0 ? z1 : z0, zw = doorSide > 0 ? z0 : z1;
    wallRun('x', zd, x0, x1, 0, H, wood, [cx - 0.75, cx + 0.75, 0, 2.3]);
    wallRun('x', zw, x0, x1, 0, H, wood, [cx - 0.9, cx + 0.9, 1.0, 2.1]);
    wallRun('z', x0, z0, z1, 0, H, wood, [cz - 0.9, cz + 0.9, 1.0, 2.1]);
    wallRun('z', x1, z0, z1, 0, H, wood);
    box(W + 0.6, 0.3, D + 0.6, cx, cz, roof, H);
  };

  // --- warehouse: big open shell with crate "stairs" to an interior shelf ---
  const warehouse = (cx, cz) => {
    const W = 16, D = 12, H = 5;
    const steel = 0x8f9aa8, accent = 0x4f7fa8;
    const x0 = cx - W / 2, x1 = cx + W / 2, z0 = cz - D / 2, z1 = cz + D / 2;
    wallRun('x', z1, x0, x1, 0, H, steel, [cx - 3, cx + 3, 0, 4]);    // wide front opening
    wallRun('x', z0, x0, x1, 0, H, steel, [cx - 1, cx + 1, 0, 2.6]);  // back door
    wallRun('z', x0, z0, z1, 0, H, steel, [cz - 1.2, cz + 1.2, 1.4, 3.2]);
    wallRun('z', x1, z0, z1, 0, H, steel, [cz - 1.2, cz + 1.2, 1.4, 3.2]);
    box(W, 0.3, D, cx, cz, accent, H); // roof
    // interior: crates stepping up to a shelf platform
    box(2.2, 1.7, 2.2, cx - 5, cz + 2.2, 0xc0824f);
    box(2.2, 2.2, 2.2, cx - 5, cz - 0.2, 0xb8743f);
    box(6, 0.3, 3.4, cx - 3, cz - 4, steel, 2.4); // shelf
    box(0.3, 2.4, 3.4, cx - 0.15, cz - 4, steel); // shelf leg wall
    box(2.4, 1.2, 2.4, cx + 4, cz + 1, 0xc0824f);
    box(2.4, 1.2, 2.4, cx + 4, cz - 2.5, 0x9c7a52);
  };

  const tree = (x, z) => {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.3, 2.8, 8),
      new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 }));
    trunk.position.set(x, 1.4, z);
    trunk.castShadow = true;
    scene.add(trunk);
    staticMeshes.push(trunk);
    solids.push(new THREE.Box3(
      new THREE.Vector3(x - 0.3, 0, z - 0.3), new THREE.Vector3(x + 0.3, 2.8, z + 0.3)));
    const g1 = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a7c45, roughness: 0.95 }));
    g1.position.set(x, 3.4, z);
    const g2 = new THREE.Mesh(new THREE.SphereGeometry(1.0, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x568f50, roughness: 0.95 }));
    g2.position.set(x + 0.3, 4.4, z - 0.2);
    g1.castShadow = g2.castShadow = true;
    scene.add(g1, g2);
    staticMeshes.push(g1, g2); // foliage blocks shots/camera but not movement
  };

  const rock = (x, z, r) => {
    const m = new THREE.Mesh(
      new THREE.DodecahedronGeometry(r, 0),
      new THREE.MeshStandardMaterial({ color: 0x7e848d, roughness: 0.95 }));
    m.position.set(x, r * 0.55, z);
    m.scale.y = 0.7;
    m.rotation.y = (x * 7 + z * 3) % 3;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    staticMeshes.push(m);
    solids.push(new THREE.Box3(
      new THREE.Vector3(x - r * 0.8, 0, z - r * 0.8), new THREE.Vector3(x + r * 0.8, r * 1.1, z + r * 0.8)));
  };

  const fence = (x, z, len, alongX) => {
    const wood = 0x8a6844;
    if (alongX) box(len, 1.1, 0.15, x, z, wood);
    else box(0.15, 1.1, len, x, z, wood);
  };

  // ================= layout =================
  // center platform + pillars
  box(18, 1.5, 18, 0, 0, 0x97a4b5, 0, { rough: 0.7 });
  box(2.2, 5, 2.2, -6, 6, 0x7e8da0, 1.5);
  box(2.2, 5, 2.2, 6, -6, 0x7e8da0, 1.5);

  house(-34, -26, 0xcfc5b4, 0x6b5848);
  house(34, 26, 0xc9cfd6, 0x4a5a6b);
  cabin(-30, 32, -1);
  cabin(30, -32, 1);
  warehouse(0, -46);

  // shipping containers
  box(2.6, 2.8, 8, 26, -16, 0x4f7fa8);
  box(2.6, 2.8, 8, 29.4, -13, 0xa85f4f);
  box(2.6, 2.8, 8, 27.7, -14.5, 0x6b8f5a, 2.8);
  box(2.6, 2.8, 8, -26, 16, 0x4f7fa8);
  box(2.6, 2.8, 8, -29.4, 13, 0xa85f4f);
  box(2.6, 2.8, 8, -27.7, 14.5, 0x6b8f5a, 2.8);

  // mid cover walls
  box(12, 3.2, 1.2, 0, 26, 0x8d9aac);
  box(12, 3.2, 1.2, 0, -26, 0x8d9aac);
  box(1.2, 3.2, 12, -22, 0, 0x8d9aac);
  box(1.2, 3.2, 12, 22, 0, 0x8d9aac);

  // crates
  box(2.5, 2.5, 2.5, -14, -8, 0xc0824f);
  box(2.5, 2.5, 2.5, 14, 8, 0xc0824f);
  box(2.5, 2.5, 2.5, 44, -10, 0xc0824f);
  box(2.5, 2.5, 2.5, 46.5, -10, 0xb8743f);
  box(2.5, 2.5, 2.5, 45.25, -10, 0xa8663f, 2.5);
  box(2.5, 2.5, 2.5, -44, 10, 0xc0824f);
  box(2.5, 2.5, 2.5, -46.5, 10, 0xb8743f);
  box(2.5, 2.5, 2.5, -45.25, 10, 0xa8663f, 2.5);

  // trees
  for (const [x, z] of [[-18, 12], [18, -12], [-12, -38], [12, 38], [-46, -22],
                        [46, 22], [-56, -40], [56, 40], [20, 48], [-20, -48], [52, -28], [-52, 28]]) {
    tree(x, z);
  }
  // rocks
  rock(-8, 18, 1.4); rock(8, -18, 1.4); rock(-38, 6, 1.8); rock(38, -6, 1.8); rock(24, 38, 1.2); rock(-24, -38, 1.2);

  // fences near the houses
  fence(-34, -18.5, 9, true);
  fence(34, 18.5, 9, true);
  fence(-25.5, 36, 6, false);
  fence(25.5, -36, 6, false);

  // jump pads
  const pads = [{ x: -26, z: 26 }, { x: 26, z: -26 }, { x: 14, z: -2 }, { x: -14, z: 2 }];
  for (const p of pads) {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.7, 1.9, 0.22, 20),
      new THREE.MeshStandardMaterial({ color: 0x2b3340, roughness: 0.6 }));
    base.position.set(p.x, 0.11, p.z);
    base.receiveShadow = true;
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.3, 0.1, 20),
      new THREE.MeshStandardMaterial({
        color: 0xffa030, emissive: 0xff7700, emissiveIntensity: 0.8, roughness: 0.4,
      }));
    top.position.set(p.x, 0.24, p.z);
    scene.add(base, top);
    staticMeshes.push(base, top);
  }

  // invisible boundary collision
  const t = 2;
  for (const [x, z, w, d] of [
    [0, -ARENA - t / 2, ARENA * 2 + 8, t], [0, ARENA + t / 2, ARENA * 2 + 8, t],
    [-ARENA - t / 2, 0, t, ARENA * 2 + 8], [ARENA + t / 2, 0, t, ARENA * 2 + 8],
  ]) {
    solids.push(new THREE.Box3(
      new THREE.Vector3(x - w / 2, -1, z - d / 2),
      new THREE.Vector3(x + w / 2, 60, z + d / 2)));
  }

  return { solids, staticMeshes, pads, groundMesh: ground, spawns: SPAWNS };
}
