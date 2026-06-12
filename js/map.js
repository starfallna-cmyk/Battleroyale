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

  // --- primitive helpers (axis-aligned collision) ---
  const box = (w, h, d, x, z, color, baseY = 0, { solid = true, rough = 0.85, emissive = 0 } = {}) => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color, roughness: rough, emissive, emissiveIntensity: emissive ? 1 : 0 }));
    m.position.set(x, baseY + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    staticMeshes.push(m);
    if (solid) solids.push(new THREE.Box3().setFromObject(m));
    return m;
  };

  const cyl = (r, h, x, z, color, baseY = 0, { solid = true, rough = 0.8, opacity = 1, rTop = null } = {}) => {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(rTop ?? r, r, h, 14),
      new THREE.MeshStandardMaterial({ color, roughness: rough, transparent: opacity < 1, opacity }));
    m.position.set(x, baseY + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    staticMeshes.push(m);
    if (solid) solids.push(new THREE.Box3(
      new THREE.Vector3(x - r * 0.8, baseY, z - r * 0.8),
      new THREE.Vector3(x + r * 0.8, baseY + h, z + r * 0.8)));
    return m;
  };

  // wall running along X (fixed z) or Z (fixed x), with optional opening [from, to, yBottom, yTop]
  const wallRun = (axis, fixed, from, to, y0, h, color, opening = null) => {
    const th = 0.3;
    const segs = [];
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

  // decorative trim frame around a wall opening (pokes through both faces)
  const frame = (axis, fixed, center, y0, w, h, color, lintelOnly = false) => {
    const t = 0.1, d = 0.42, o = { solid: false, rough: 0.7 };
    if (axis === 'x') {
      if (!lintelOnly) box(w + 0.2, t, d, center, fixed, color, y0 - t, o);
      box(w + 0.2, t, d, center, fixed, color, y0 + h, o);
      box(t, h + 0.2, d, center - w / 2 - 0.05, fixed, color, y0 - t, o);
      box(t, h + 0.2, d, center + w / 2 + 0.05, fixed, color, y0 - t, o);
    } else {
      if (!lintelOnly) box(d, t, w + 0.2, fixed, center, color, y0 - t, o);
      box(d, t, w + 0.2, fixed, center, color, y0 + h, o);
      box(d, h + 0.2, t, fixed, center - w / 2 - 0.05, color, y0 - t, o);
      box(d, h + 0.2, t, fixed, center + w / 2 + 0.05, color, y0 - t, o);
    }
  };

  const stairs = (x, z, alongZ, dirSign, color) => {
    for (let i = 0; i < 6; i++) {
      const off = dirSign * (i * 0.55);
      if (alongZ) box(1.4, 0.5 * (i + 1), 0.55, x, z + off, color, 0);
      else box(0.55, 0.5 * (i + 1), 1.4, x + off, z, color, 0);
    }
  };

  const barrel = (x, z, color = 0x8f5a3a) => {
    cyl(0.45, 1.15, x, z, color, 0, { rough: 0.6 });
    cyl(0.46, 0.06, x, z, 0x2b2f38, 1.12, { solid: false });
  };

  const car = (x, z, rotated, color) => {
    const y = 0.34;
    const grp = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.25 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x9fc6dd, roughness: 0.2, metalness: 0.4 });
    const tire = new THREE.MeshStandardMaterial({ color: 0x1d2128, roughness: 0.9 });
    const bodyM = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.8, 1.8), mat);
    bodyM.position.y = y + 0.4;
    const cabinM = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.7, 1.65), glass);
    cabinM.position.set(-0.2, y + 1.1, 0);
    const lightF = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 1.5),
      new THREE.MeshStandardMaterial({ color: 0xfff2b3, emissive: 0xbba75e }));
    lightF.position.set(1.95, y + 0.45, 0);
    grp.add(bodyM, cabinM, lightF);
    for (const [wx, wz] of [[-1.35, -0.95], [1.35, -0.95], [-1.35, 0.95], [1.35, 0.95]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.28, 12), tire);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 0.38, wz);
      grp.add(wheel);
    }
    if (rotated) grp.rotation.y = Math.PI / 2;
    grp.position.set(x, 0, z);
    grp.traverse(o => { o.castShadow = true; });
    scene.add(grp);
    staticMeshes.push(grp);
    const hw = rotated ? 1.0 : 2.1, hd = rotated ? 2.1 : 1.0;
    solids.push(new THREE.Box3(
      new THREE.Vector3(x - hw, 0, z - hd), new THREE.Vector3(x + hw, y + 1.45, z + hd)));
  };

  const streetlamp = (x, z, armDir) => {
    box(0.14, 4.5, 0.14, x, z, 0x3a4250);
    box(0.9, 0.1, 0.12, x + armDir[0] * 0.45, z + armDir[1] * 0.45, 0x3a4250, 4.4, { solid: false });
    box(0.34, 0.14, 0.26, x + armDir[0] * 0.85, z + armDir[1] * 0.85, 0xfff3c4, 4.3, { solid: false, emissive: 0xddc77a });
  };

  const tree = (x, z) => {
    // tall visible trunk — low foliage reads as "buried" from the air
    const trunk = cyl(0.28, 4.4, x, z, 0x6b4a2f, 0, { solid: false, rough: 0.9 });
    trunk.castShadow = true;
    solids.push(new THREE.Box3(
      new THREE.Vector3(x - 0.32, 0, z - 0.32), new THREE.Vector3(x + 0.32, 4.4, z + 0.32)));
    const g1 = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a7c45, roughness: 0.95 }));
    g1.position.set(x, 5.0, z);
    const g2 = new THREE.Mesh(new THREE.SphereGeometry(1.05, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x568f50, roughness: 0.95 }));
    g2.position.set(x + 0.3, 6.1, z - 0.2);
    g1.castShadow = g2.castShadow = true;
    g1.userData.noCam = g2.userData.noCam = true; // camera passes through leaves
    scene.add(g1, g2);
    staticMeshes.push(g1, g2);
  };

  const pine = (x, z) => {
    cyl(0.24, 2.6, x, z, 0x5d4027, 0, { solid: false });
    solids.push(new THREE.Box3(
      new THREE.Vector3(x - 0.28, 0, z - 0.28), new THREE.Vector3(x + 0.28, 2.6, z + 0.28)));
    const mat = new THREE.MeshStandardMaterial({ color: 0x3d6b3a, roughness: 0.95 });
    for (const [r, h, y] of [[1.7, 2.3, 2.2], [1.3, 2.0, 3.8], [0.85, 1.8, 5.2]]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 10), mat);
      cone.position.set(x, y + h / 2, z);
      cone.castShadow = true;
      cone.userData.noCam = true;
      scene.add(cone);
      staticMeshes.push(cone);
    }
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

  // --- two-story house: furnished, framed windows, porch, chimney ---
  const house = (cx, cz, wallColor, trimColor) => {
    const W = 12, D = 9, H = 3;
    const x0 = cx - W / 2, x1 = cx + W / 2, z0 = cz - D / 2, z1 = cz + D / 2;
    const wood = 0x9c7a52;
    // ground floor walls
    wallRun('x', z1, x0, x1, 0, H, wallColor, [cx - 0.8, cx + 0.8, 0, 2.4]);
    wallRun('x', z0, x0, x1, 0, H, wallColor, [cx - 1, cx + 1, 1.0, 2.2]);
    wallRun('z', x0, z0, z1, 0, H, wallColor, [cz - 1, cz + 1, 1.0, 2.2]);
    wallRun('z', x1, z0, z1, 0, H, wallColor);
    // trim
    frame('x', z1, cx, 0, 1.6, 2.4, trimColor, true);          // door frame
    frame('x', z0, cx, 1.0, 2, 1.2, trimColor);                // back window
    frame('z', x0, cz, 1.0, 2, 1.2, trimColor);                // left window
    box(W + 0.3, 0.25, D + 0.3, cx, cz, trimColor, -0.02, { solid: false }); // foundation skirt
    // porch
    box(2.6, 0.15, 1.5, cx, z1 + 0.85, trimColor, 2.5);
    box(0.12, 2.5, 0.12, cx - 1.15, z1 + 1.45, trimColor);
    box(0.12, 2.5, 0.12, cx + 1.15, z1 + 1.45, trimColor);
    box(2.2, 0.18, 1.6, cx, z1 + 0.9, trimColor, 0, { solid: false });
    // second floor slab; the whole +x strip from the stairs forward stays open
    // (a partial ceiling over the steps head-blocks players walking back down)
    box(W - 2.4, 0.25, D, cx - 1.2, cz, trimColor, H);
    box(2.4, 0.25, 2.8, x1 - 1.2, cz - 3.1, trimColor, H); // landing behind the top step
    // upper walls + framed windows
    wallRun('x', z1, x0, x1, H, H, wallColor, [cx - 1, cx + 1, H + 1.0, H + 2.2]);
    wallRun('x', z0, x0, x1, H, H, wallColor, [cx - 1, cx + 1, H + 1.0, H + 2.2]);
    wallRun('z', x0, z0, z1, H, H, wallColor);
    wallRun('z', x1, z0, z1, H, H, wallColor, [cz - 1, cz + 1, H + 1.0, H + 2.2]);
    frame('x', z1, cx, H + 1.0, 2, 1.2, trimColor);
    frame('x', z0, cx, H + 1.0, 2, 1.2, trimColor);
    frame('z', x1, cz, H + 1.0, 2, 1.2, trimColor);
    // roof, parapet, chimney, AC unit
    box(W, 0.25, D, cx, cz, trimColor, H * 2);
    box(W, 0.45, 0.25, cx, z0 + 0.12, trimColor, H * 2 + 0.25);
    box(W, 0.45, 0.25, cx, z1 - 0.12, trimColor, H * 2 + 0.25);
    box(0.25, 0.45, D, x0 + 0.12, cz, trimColor, H * 2 + 0.25);
    box(0.25, 0.45, D, x1 - 0.12, cz, trimColor, H * 2 + 0.25);
    box(0.9, 1.6, 0.9, x0 + 1.4, z0 + 1.3, 0x8a4f43, H * 2);
    box(1.05, 0.15, 1.05, x0 + 1.4, z0 + 1.3, 0x2b2f38, H * 2 + 1.6, { solid: false });
    box(0.9, 0.55, 0.9, cx + 2, cz + 1, 0xb9c0c9, H * 2 + 0.25);
    // interior stairs
    stairs(x1 - 1.0, cz + 1.4, true, -1, trimColor);
    // ground-floor furniture
    box(2.6, 0.03, 1.8, cx - 1.5, cz + 0.6, 0x9a4040, 0, { solid: false, rough: 1 }); // rug
    box(1.3, 0.07, 0.85, cx - 1.5, cz + 0.6, wood, 0.7);                               // table top
    box(0.16, 0.7, 0.16, cx - 1.5, cz + 0.6, wood, 0, { solid: false });               // pedestal
    box(0.45, 0.45, 0.45, cx - 2.5, cz + 0.6, wood);                                   // stools
    box(0.45, 0.45, 0.45, cx - 0.5, cz + 1.5, wood);
    box(1.6, 2.2, 0.35, cx - 3.2, z0 + 0.45, wood);                                    // bookshelf
    box(1.7, 0.45, 0.7, cx + 2.6, z1 - 0.75, 0x55657a);                                // sofa seat (clear of the door)
    box(1.7, 0.55, 0.2, cx + 2.6, z1 - 0.45, 0x4a5a70, 0.45);                          // sofa back
    // upstairs furniture
    box(1.0, 0.35, 2.0, x0 + 1.0, cz - 2.4, 0x7a8aa8, H + 0.25);                       // bed
    box(0.7, 0.14, 0.45, x0 + 1.0, cz - 3.15, 0xf2f2f2, H + 0.6, { solid: false });    // pillow
    box(1.2, 0.9, 0.5, x0 + 0.9, z1 - 0.6, wood, H + 0.25);                            // dresser
  };

  // --- small cabin: framed openings, chimney, cot, props ---
  const cabin = (cx, cz, doorSide = 1) => {
    const W = 7, D = 6, H = 2.8;
    const wood = 0x9c7a52, roof = 0x5f4a38, trim = 0x6e5238;
    const x0 = cx - W / 2, x1 = cx + W / 2, z0 = cz - D / 2, z1 = cz + D / 2;
    const zd = doorSide > 0 ? z1 : z0, zw = doorSide > 0 ? z0 : z1;
    wallRun('x', zd, x0, x1, 0, H, wood, [cx - 0.75, cx + 0.75, 0, 2.3]);
    wallRun('x', zw, x0, x1, 0, H, wood, [cx - 0.9, cx + 0.9, 1.0, 2.1]);
    wallRun('z', x0, z0, z1, 0, H, wood, [cz - 0.9, cz + 0.9, 1.0, 2.1]);
    wallRun('z', x1, z0, z1, 0, H, wood);
    frame('x', zd, cx, 0, 1.5, 2.3, trim, true);
    frame('x', zw, cx, 1.0, 1.8, 1.1, trim);
    frame('z', x0, cz, 1.0, 1.8, 1.1, trim);
    box(W + 0.6, 0.3, D + 0.6, cx, cz, roof, H);
    box(0.7, 1.3, 0.7, x1 - 1.0, z0 + 0.9, 0x8a4f43, H + 0.3);
    // inside: cot, crate; outside: barrel
    box(0.85, 0.3, 1.9, x0 + 0.85, cz - 0.8, 0x7a8aa8, 0);
    box(0.55, 0.12, 0.5, x0 + 0.85, cz - 1.5, 0xf2f2f2, 0.3, { solid: false });
    box(0.8, 0.8, 0.8, x1 - 0.85, cz + 1.2, 0xc0824f);
    barrel(cx + (doorSide > 0 ? 1.6 : -1.6), zd + doorSide * 0.9);
  };

  // --- warehouse: vents, pallets, barrels, hanging lights ---
  const warehouse = (cx, cz) => {
    const W = 16, D = 12, H = 5;
    const steel = 0x8f9aa8, accent = 0x4f7fa8;
    const x0 = cx - W / 2, x1 = cx + W / 2, z0 = cz - D / 2, z1 = cz + D / 2;
    wallRun('x', z1, x0, x1, 0, H, steel, [cx - 3, cx + 3, 0, 4]);
    wallRun('x', z0, x0, x1, 0, H, steel, [cx - 1, cx + 1, 0, 2.6]);
    wallRun('z', x0, z0, z1, 0, H, steel, [cz - 1.2, cz + 1.2, 1.4, 3.2]);
    wallRun('z', x1, z0, z1, 0, H, steel, [cz - 1.2, cz + 1.2, 1.4, 3.2]);
    frame('x', z1, cx, 0, 6, 4, accent, true);
    box(W, 0.3, D, cx, cz, accent, H);
    for (const vx of [-4.5, 0, 4.5]) box(0.8, 0.5, 0.8, cx + vx, cz, steel, H + 0.3);
    box(2.2, 1.7, 2.2, cx - 5, cz + 2.2, 0xc0824f);
    box(2.2, 2.2, 2.2, cx - 5, cz - 0.2, 0xb8743f);
    box(6, 0.3, 3.4, cx - 3, cz - 4, steel, 2.4);
    box(0.3, 2.4, 3.4, cx - 0.15, cz - 4, steel);
    box(2.4, 1.2, 2.4, cx + 4, cz + 1, 0xc0824f);
    box(2.4, 1.2, 2.4, cx + 4, cz - 2.5, 0x9c7a52);
    box(1.6, 0.14, 1.6, cx + 6.2, cz + 4, 0x9c7a52);   // pallets
    box(1.6, 0.14, 1.6, cx + 6.2, cz + 4, 0x8a6844, 0.18);
    barrel(cx + 6.4, cz - 4.4, 0x4f7fa8);
    barrel(cx + 5.4, cz - 4.0, 0xa85f4f);
    barrel(cx + 6.2, cz - 3.2);
    for (const lx of [-3.5, 3.5]) box(0.9, 0.08, 0.3, cx + lx, cz, 0xfff3c4, 4.55, { solid: false, emissive: 0xc9b46e });
  };

  // ================= layout =================
  // crossroads (visual asphalt strips)
  box(3.6, 0.05, ARENA * 2, 0, 0, 0x70767e, 0, { solid: false, rough: 1 });
  box(ARENA * 2, 0.05, 3.6, 0, 0, 0x70767e, 0, { solid: false, rough: 1 });

  // center platform + pillars + flags
  box(18, 1.5, 18, 0, 0, 0x97a4b5, 0, { rough: 0.7 });
  box(2.2, 5, 2.2, -6, 6, 0x7e8da0, 1.5);
  box(2.2, 5, 2.2, 6, -6, 0x7e8da0, 1.5);
  box(0.12, 4.5, 0.12, 8, 8, 0x3a4250, 1.5);
  box(1.3, 0.75, 0.06, 8.8, 8, 0x4fc3f7, 5.0, { solid: false });
  box(0.12, 4.5, 0.12, -8, -8, 0x3a4250, 1.5);
  box(1.3, 0.75, 0.06, -8.8, -8, 0xff7043, 5.0, { solid: false });

  house(-34, -26, 0xcfc5b4, 0x6b5848);
  house(34, 26, 0xc9cfd6, 0x4a5a6b);
  cabin(-30, 32, -1);
  cabin(30, -32, 1);
  warehouse(0, -46);

  // shipping containers + barrels
  box(2.6, 2.8, 8, 26, -16, 0x4f7fa8);
  box(2.6, 2.8, 8, 29.4, -13, 0xa85f4f);
  box(2.6, 2.8, 8, 27.7, -14.5, 0x6b8f5a, 2.8);
  box(2.6, 2.8, 8, -26, 16, 0x4f7fa8);
  box(2.6, 2.8, 8, -29.4, 13, 0xa85f4f);
  box(2.6, 2.8, 8, -27.7, 14.5, 0x6b8f5a, 2.8);
  barrel(23.8, -18.5); barrel(24.6, -17.2, 0x4f7fa8);
  barrel(-23.8, 18.5); barrel(-24.6, 17.2, 0x4f7fa8);

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

  // cars on the roads + streetlamps
  car(-0.9, 30, true, 0xa83b3b);   // N-S road: length along Z
  car(0.9, -31, true, 0x3963b3);
  car(28, -0.9, false, 0x5e8f54);  // E-W road: length along X
  streetlamp(2.7, 16, [1, 0]);
  streetlamp(-2.7, -16, [-1, 0]);
  streetlamp(16, 2.7, [0, 1]);
  streetlamp(-16, -2.7, [0, -1]);

  // trees, pines, rocks
  for (const [x, z] of [[-18, 12], [18, -12], [-12, -38], [12, 38], [-46, -22],
                        [46, 22], [-56, -40], [56, 40], [20, 48], [-20, -48], [52, -28], [-52, 28]]) {
    tree(x, z);
  }
  for (const [x, z] of [[-58, -12], [58, 12], [12, 56], [-12, -56], [40, 36], [-40, -36]]) {
    pine(x, z);
  }
  rock(-8, 18, 1.4); rock(8, -18, 1.4); rock(-38, 6, 1.8); rock(38, -6, 1.8); rock(24, 38, 1.2); rock(-24, -38, 1.2);

  // pond with rock rim
  const pond = cyl(4.5, 0.06, -42, 42, 0x4f93c4, 0, { solid: false, rough: 0.25, opacity: 0.85 });
  pond.receiveShadow = true;
  rock(-46.5, 40.5, 0.8); rock(-38, 44.5, 0.7); rock(-44, 46.2, 0.6); rock(-39, 39, 0.65);

  // fences near the houses
  fence(-34, -18.5, 9, true);
  fence(34, 18.5, 9, true);
  fence(-25.5, 36, 6, false);
  fence(25.5, -36, 6, false);

  // grass tufts (visual only, deterministic spiral placement)
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x5d8f57, roughness: 1 });
  for (let i = 0; i < 26; i++) {
    const a = i * 2.39996;
    const r = 14 + ((i * 73) % 46);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    // keep out of buildings
    if ((Math.abs(x) < 10 && Math.abs(z) < 10) ||
        (x > 26 && x < 42 && z > 20 && z < 32) || (x < -26 && x > -42 && z < -20 && z > -32) ||
        (Math.abs(x) < 9 && z < -39) || (Math.abs(x - (-30)) < 5 && Math.abs(z - 32) < 4) ||
        (Math.abs(x - 30) < 5 && Math.abs(z + 32) < 4)) continue;
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.38, 5), grassMat);
    tuft.position.set(x, 0.19, z);
    tuft.rotation.y = i;
    scene.add(tuft);
  }

  // jump pads (one up on the platform)
  const pads = [{ x: -26, z: 26 }, { x: 26, z: -26 }, { x: 14, z: -2 }, { x: -14, z: 2 }, { x: 0, z: 0, y: 1.5 }];
  for (const p of pads) {
    const py = p.y || 0;
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.7, 1.9, 0.22, 20),
      new THREE.MeshStandardMaterial({ color: 0x2b3340, roughness: 0.6 }));
    base.position.set(p.x, py + 0.11, p.z);
    base.receiveShadow = true;
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.3, 0.1, 20),
      new THREE.MeshStandardMaterial({
        color: 0xffa030, emissive: 0xff7700, emissiveIntensity: 0.8, roughness: 0.4,
      }));
    top.position.set(p.x, py + 0.24, p.z);
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
