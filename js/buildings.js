import * as THREE from 'three';

// ===== Enterable buildings for KILLSHOT on Lush Island =====
// Every building is a hollow shell: solid perimeter walls with a doorway gap,
// a flat collision floor, a roof, and decorative props. Each is placed and
// levelled to its OWN terrain height so nothing floats or sinks. Wall AABBs are
// registered into the shared spatial grid; the doorway is left open to walk in.

const TH = 0.32;          // wall thickness
const DOOR_W = 1.8;
const DOOR_H = 3.0;       // tall so the opening clears even on sloped ground

// Per-building builder bound to a world origin (wx, wy, wz).
function makeBuilder(scene, staticMeshes, grid, wx, wy, wz) {
  const mat = (color, rough, extra) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough ?? 0.85, ...extra });

  const b = {
    // solid collidable box; lx/lz = center, ly = bottom (local, building base = 0)
    box(w, h, d, lx, ly, lz, color, opts = {}) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts.rough, opts.mat));
      m.position.set(wx + lx, wy + ly + h / 2, wz + lz);
      m.castShadow = m.receiveShadow = true;
      if (opts.noHit) m.userData.noHit = true;
      if (opts.noCam) m.userData.noCam = true;
      scene.add(m);
      staticMeshes.push(m);
      if (opts.solid !== false) {
        grid.add(new THREE.Box3(
          new THREE.Vector3(wx + lx - w / 2, wy + ly, wz + lz - d / 2),
          new THREE.Vector3(wx + lx + w / 2, wy + ly + h, wz + lz + d / 2)));
      }
      return m;
    },
    // decorative box: drawn, blocks shots, but no movement collision
    prop(w, h, d, lx, ly, lz, color, opts = {}) {
      return b.box(w, h, d, lx, ly, lz, color, { ...opts, solid: false });
    },
    cyl(r, h, lx, ly, lz, color, opts = {}) {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(r * (opts.taper ?? 0.9), r, h, opts.seg ?? 12), mat(color, opts.rough, opts.mat));
      m.position.set(wx + lx, wy + ly + h / 2, wz + lz);
      m.castShadow = m.receiveShadow = true;
      if (opts.noCam) m.userData.noCam = true;
      scene.add(m);
      staticMeshes.push(m);
      if (opts.solid) {
        grid.add(new THREE.Box3(
          new THREE.Vector3(wx + lx - r * 0.8, wy + ly, wz + lz - r * 0.8),
          new THREE.Vector3(wx + lx + r * 0.8, wy + ly + h, wz + lz + r * 0.8)));
      }
      return m;
    },
    sphere(r, lx, ly, lz, color, opts = {}) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, opts.seg ?? 10, opts.seg2 ?? 8), mat(color, opts.rough));
      m.position.set(wx + lx, wy + ly, wz + lz);
      m.castShadow = true;
      if (opts.noCam) m.userData.noCam = true;
      scene.add(m);
      staticMeshes.push(m);
      return m;
    },
    // a gabled (4-slope) roof, visual only, camera passes through
    gable(w, d, color, peak, baseY) {
      const g = new THREE.Mesh(
        new THREE.ConeGeometry(Math.max(w, d) * 0.72, peak, 4),
        mat(color, 0.9));
      g.rotation.y = Math.PI / 4;
      g.position.set(wx, wy + baseY + peak / 2, wz);
      g.castShadow = true;
      g.userData.noCam = true;
      scene.add(g);
      staticMeshes.push(g);
      return g;
    },
    flatRoof(w, d, color, baseY) {
      return b.prop(w, 0.3, d, 0, baseY, 0, color, { noCam: true });
    },
    floor(w, d, color) {
      // solid flat foundation: top at local 0 (the build base, set to the highest
      // footprint corner) filled down past the lowest corner — gives a flat
      // interior that terrain can never poke through, and no floating on slopes.
      const padH = Math.max(0.5, b.padDepth || 0.5);
      b.box(w, padH, d, 0, -padH, 0, color, { rough: 0.92 });
    },
    glass(w, h, lx, ly, lz, axis) {
      const geo = axis === 'z' ? new THREE.BoxGeometry(0.05, h, w) : new THREE.BoxGeometry(w, h, 0.05);
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color: 0x9fd8ee, transparent: true, opacity: 0.4, roughness: 0.1, metalness: 0.4 }));
      m.position.set(wx + lx, wy + ly + h / 2, wz + lz);
      m.userData.noHit = m.userData.noCam = true;
      scene.add(m);
    },
    light(color, intensity, dist, lx, ly, lz) {
      const l = new THREE.PointLight(color, intensity, dist);
      l.position.set(wx + lx, wy + ly, wz + lz);
      scene.add(l);
    },
  };
  return b;
}

// One wall run along 'x' (fixed z) or 'z' (fixed x), spanning a0..a1, with an
// optional door gap {c, w, top}. Registers collision per segment.
function wallRun(b, axis, fixed, a0, a1, h, color, gap, opts = {}) {
  const segs = [];
  if (!gap) {
    segs.push([a0, a1, 0, h]);
  } else {
    const g0 = gap.c - gap.w / 2, g1 = gap.c + gap.w / 2;
    if (g0 > a0) segs.push([a0, g0, 0, h]);
    if (g1 < a1) segs.push([g1, a1, 0, h]);
    if (gap.top < h) segs.push([g0, g1, gap.top, h - gap.top]); // lintel above door
  }
  for (const [s0, s1, y0, sh] of segs) {
    const len = s1 - s0, mid = (s0 + s1) / 2;
    if (axis === 'x') b.box(len, sh, TH, mid, y0, fixed, color, opts);
    else b.box(TH, sh, len, fixed, y0, mid, color, opts);
  }
}

// short stoop of steps just outside a doorway so you can climb in from lower
// ground (each step ≤ player step-up height). Buried/flush on level ground.
function doorSteps(b, door, w, d) {
  const sh = 0.42, depth = 0.75, n = 3;
  for (let i = 1; i <= n; i++) {
    const top = -i * sh;                 // descending below the flat floor (local 0)
    const sw = DOOR_W + 0.7;
    if (door === 'south') b.box(sw, 3, depth, 0, top - 3, d / 2 + (i - 0.5) * depth, 0x8a7560, { rough: 0.9 });
    else if (door === 'north') b.box(sw, 3, depth, 0, top - 3, -d / 2 - (i - 0.5) * depth, 0x8a7560, { rough: 0.9 });
    else if (door === 'east') b.box(depth, 3, sw, w / 2 + (i - 0.5) * depth, top - 3, 0, 0x8a7560, { rough: 0.9 });
    else b.box(depth, 3, sw, -w / 2 - (i - 0.5) * depth, top - 3, 0, 0x8a7560, { rough: 0.9 });
  }
}

// Hollow rectangular room: solid flat foundation (terrain never pokes through),
// 4 walls with a doorway, a door stoop, and windows.
function room(b, o) {
  const { w, d, h, wall, floor = 0x6a5440, door = 'south', windows = true } = o;
  const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
  const wopt = { rough: 0.88 };

  // solid foundation pad: flat top at local 0 (= base height, above all interior
  // terrain), filled down past the lowest corner so nothing floats or shows through
  b.floor(w, d, floor);

  // doorway with a normal lintel — the flat floor guarantees head clearance
  const gap = { c: 0, w: DOOR_W, top: Math.min(DOOR_H, h - 0.4) };
  wallRun(b, 'x', z1, x0, x1, h, wall, door === 'south' ? gap : null, wopt); // +z front
  wallRun(b, 'x', z0, x0, x1, h, wall, door === 'north' ? gap : null, wopt); // -z back
  wallRun(b, 'z', x1, z0, z1, h, wall, door === 'east' ? gap : null, wopt);  // +x right
  wallRun(b, 'z', x0, z0, z1, h, wall, door === 'west' ? gap : null, wopt);  // -x left
  doorSteps(b, door, w, d);

  if (windows) {
    const wy = h * 0.55;
    if (door !== 'north') { b.glass(1.0, 1.0, -w * 0.26, wy, z0, 'x'); b.glass(1.0, 1.0, w * 0.26, wy, z0, 'x'); }
    if (door !== 'west') b.glass(1.0, 1.0, x0, wy, d * 0.2, 'z');
    if (door !== 'east') b.glass(1.0, 1.0, x1, wy, -d * 0.2, 'z');
  }
}

// ===================== building types =====================
function cottage(b, color = 0xd4b896, roofColor = 0x8b3a2a) {
  const w = 6, d = 5, h = 3.2;
  room(b, { w, d, h, wall: color });
  b.gable(w + 0.6, d + 0.6, roofColor, 2.6, h);
  b.cyl(0.35, 1.8, w * 0.3, h, -d * 0.2, 0x6a5040, { seg: 8 });
}

function barn(b) {
  const w = 10, d = 7, h = 5;
  room(b, { w, d, h, wall: 0x8b2020, door: 'south' });
  b.gable(w + 1, d + 1, 0x5a1818, 3.5, h);
  for (const ox of [-4.5, 4.5]) b.cyl(1.2, 6, ox, 0, -d * 0.35 - 1.5, 0xcccccc, { seg: 10, solid: true });
}

function tavern(b) {
  const w = 9, d = 6, h = 4;
  room(b, { w, d, h, wall: 0x7a5840 });
  b.gable(w + 1, d + 1, 0x4a2818, 3, h);
  b.prop(2.5, 0.8, 0.12, 0, 3.0, d / 2 + 0.1, 0xcc8800);
  for (const ox of [-3, 3]) b.cyl(0.45, 0.9, ox, 0, d / 2 + 1, 0x5a3818, { seg: 8 });
}

function inn(b) {
  tavern(b);
  const rb = b; // attached wing
  room(rb, { w: 6, d: 5, h: 3.5, wall: 0x8a7058, door: 'east' });
  // shift the wing visually by drawing it offset via a nested builder is complex;
  // keep the inn as a larger tavern footprint instead
}

function warehouse(b) {
  const w = 14, d = 8, h = 5.5;
  // front wall has a wide opening instead of a small door
  const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
  wallRun(b, 'x', z1, x0, x1, h, 0x8a8078, { c: 0, w: 4, top: 4 });
  wallRun(b, 'x', z0, x0, x1, h, 0x8a8078, null);
  wallRun(b, 'z', x1, z0, z1, h, 0x8a8078, null);
  wallRun(b, 'z', x0, z0, z1, h, 0x8a8078, null);
  b.floor(w, d, 0x6a6258);
  b.flatRoof(w + 0.6, d + 0.6, 0x5a5048, h);
  for (let i = -5; i <= 5; i += 2.5) b.prop(1.2, 1.2, 1.2, i, 0, d / 2 + 1.2, 0x7a5830);
  b.prop(1.4, 1.4, 1.4, -4, 0, -1, 0x7a5830);
  b.prop(1.4, 1.4, 1.4, 4, 0, 1.5, 0x6a4828);
}

function smithy(b) {
  const w = 7, d = 5, h = 3.5;
  room(b, { w, d, h, wall: 0x6a5850 });
  b.gable(w + 1, d + 1, 0x3a2820, 2.8, h);
  b.cyl(0.5, 2.5, 2.5, h, -1, 0x444444, { seg: 8 });
  b.prop(0.8, 0.5, 0.5, -1.5, 0, 1.6, 0x333333);              // anvil
  b.prop(1.5, 1.2, 1.2, 1, 0, 1.4, 0x222222, { mat: { emissive: 0x551500, emissiveIntensity: 0.6 } }); // forge
}

function schoolhouse(b) {
  const w = 8, d = 6, h = 3.8;
  room(b, { w, d, h, wall: 0xe8e0d8 });
  b.gable(w + 1, d + 1, 0x6a3020, 3, h);
  b.cyl(0.35, 0.6, 0, h + 1.2, 0, 0xccaa44, { seg: 8 });
}

function fishShack(b) {
  const w = 5, d = 4, h = 2.6;
  room(b, { w, d, h, wall: 0x9a8878 });
  b.gable(w + 0.6, d + 0.6, 0x4a5848, 1.8, h);
  b.prop(3, 0.05, 2, 0, 0.15, d / 2 + 1, 0xccccaa);           // drying net
}

function guardhouse(b) {
  const w = 5, d = 4, h = 3;
  room(b, { w, d, h, wall: 0x7a7068 });
  b.gable(w + 0.6, d + 0.6, 0x4a4038, 2, h);
  for (const ox of [-1.8, 1.8]) b.cyl(0.15, 3.5, ox, 0, d / 2 + 0.4, 0x5a4030, { seg: 6 });
}

function workshop(b) {
  const w = 6, d = 5, h = 3;
  room(b, { w, d, h, wall: 0x8a7868 });
  b.gable(w + 1, d + 1, 0x5a4030, 2.5, h);
  b.prop(4, 0.8, 1.2, 0, 0, d / 2 + 1, 0x6a5038);            // bench
}

function storehouse(b) {
  const w = 6, d = 5, h = 4;
  room(b, { w, d, h, wall: 0xa89888 });
  b.gable(w + 1, d + 1, 0x5a4038, 2.2, h);
  for (let i = 0; i < 4; i++) b.prop(0.8, 1, 0.8, -1.5 + i, 0, d / 2 + 0.9, 0xc8b888);
}

function mountainLodge(b) {
  const w = 8, d = 6, h = 3.5;
  room(b, { w, d, h, wall: 0x6a5040 });
  b.box(6, 2.5, 5, 0, h, 0, 0x7a6050, { solid: false }); // upper storey (visual)
  b.gable(w + 1, d + 1, 0x3a2820, 3, h);
  b.gable(6.5, 5.5, 0x4a3028, 2.5, h + 2.5);
  b.prop(4, 0.18, 2.2, 0, 0, d / 2 + 1.1, 0x5a4030);     // porch deck
}

function dockHouse(b) {
  const w = 4, d = 3.5, h = 2.8;
  room(b, { w, d, h, wall: 0xa89070 });
  b.gable(w + 0.6, d + 0.6, 0x5a3020, 1.8, h);
  for (let i = 0; i < 5; i++) b.prop(0.45, 0.12, 2.6, i * 0.5 - 1, 0, d / 2 + 1.4, 0x6a4828);
}

function beachBungalow(b) {
  const w = 5, d = 4, h = 2.5;
  b.prop(7, 0.25, 5, 0, 0, 0, 0x8a6840);                 // deck
  room(b, { w, d, h, wall: 0xf5e6c8 });
  b.gable(w + 1, d + 1, 0x3a8a5a, 2, h);
  b.cyl(0.18, 4, 3.5, 0, 2, 0x6a4828, { seg: 6, solid: true });
  b.sphere(1.2, 3.5, 4.5, 2, 0x2a7a30, { noCam: true });
}

function chapel(b) {
  const w = 5, d = 8, h = 4;
  room(b, { w, d, h, wall: 0xd8d0c0 });
  b.gable(w + 0.6, d + 0.6, 0x5a4030, 2.5, h);
  b.cyl(0.8, 6, 0, h, -d * 0.36, 0xe8e0d0, { seg: 8 });   // steeple
  b.gable(1.8, 1.8, 0x3a3028, 2, h + 6);
  b.prop(0.14, 1.2, 0.14, 0, h + 8, -d * 0.36, 0xccaa44);
  b.prop(0.7, 0.14, 0.14, 0, h + 8.5, -d * 0.36, 0xccaa44);
}

function chapelTower(b) { chapel(b); }

function observatory(b) {
  const w = 6, d = 6, h = 4;
  room(b, { w, d, h, wall: 0x888888, windows: false });
  b.sphere(3, 0, h + 1.6, 0, 0xf0f0f0, { seg: 14, seg2: 10, rough: 0.4, noCam: true });
  b.cyl(0.25, 3, 0, h + 1.5, 1.5, 0x222222, { seg: 8 });
}

function lighthouse(b) {
  const w = 5, d = 5, h = 3;
  room(b, { w, d, h, wall: 0xf5f0e8, windows: false });
  for (let i = 0; i < 7; i++) {
    b.cyl(2.0 - i * 0.07, 2.1, 0, h + i * 2.05, 0, i % 2 ? 0xf5f0e8 : 0xc41e3a, { seg: 12, solid: false });
  }
  b.cyl(1.3, 1.4, 0, h + 7 * 2.05, 0, 0x333333, { seg: 12 });
  b.sphere(1.0, 0, h + 7 * 2.05 + 1.4, 0, 0xffffaa, { rough: 0.2, noCam: true,
    mat: { emissive: 0xffdd66, emissiveIntensity: 0.8 } });
}

function windmill(b) {
  const w = 5, d = 5, h = 3.2;
  room(b, { w, d, h, wall: 0xf0e8d8, windows: false });
  b.cyl(2.0, 5, 0, h, 0, 0xf0e8d8, { seg: 8, solid: false });
  b.cyl(2.4, 1.2, 0, h + 5, 0, 0x5a4030, { seg: 8 });
  const hub = new THREE.Object3D();
  for (let i = 0; i < 4; i++) {
    b.prop(0.25, 5.0, 0.08, Math.sin(i * Math.PI / 2) * 0, h + 5.4, 1.9, 0xf5f5f0); // simple cross blades
  }
}

function temple(b) {
  // open colonnade: platform you walk on, columns with collision, peaked roof
  const baseH = Math.max(1.0, (b.padDepth || 0.5) + 0.5);
  b.box(12, baseH, 10, 0, -(baseH - 0.5), 0, 0xc8b898, { rough: 0.95 }); // raised base, fills to terrain
  for (const ox of [-4.5, 4.5]) for (const oz of [-3.5, 3.5]) {
    b.cyl(0.55, 5.5, ox, 0.5, oz, 0xe8e0d0, { seg: 10, solid: true });
  }
  b.prop(11, 0.8, 9, 0, 6, 0, 0xb8a888);
  b.gable(11, 9, 0x6a5040, 2.8, 6.8);
  b.box(14, 0.5, 4, 0, -0.5, 6, 0xaaa090);                    // entry steps
}

function well(b) {
  b.cyl(1.2, 0.9, 0, 0, 0, 0x888888, { seg: 10, solid: true });
  for (const ox of [-1, 1]) b.cyl(0.1, 2.8, ox, 0, 0, 0x5a4030, { seg: 6 });
  b.prop(2.4, 0.12, 0.12, 0, 2.8, 0, 0x5a4030);
}

function marketStall(b) {
  for (const [px, pz] of [[-1.5, -1], [1.5, -1], [-1.5, 1], [1.5, 1]]) {
    b.cyl(0.12, 2.8, px, 0, pz, 0x5a3818, { seg: 6 });
  }
  b.prop(3.8, 0.12, 2.8, 0, 2.8, 0, 0xe85d04);               // awning
  b.prop(3.2, 0.9, 1.2, 0, 0, 0.3, 0x7a5230);                // counter
}

function pier(b, length = 8) {
  for (let i = 0; i < length; i++) {
    b.prop(1.8, 0.15, 0.5, 0, 0.1, i * 0.55, 0x6a4828);
  }
}

// ===================== settlements =====================
const SETTLEMENTS = [
  { name: 'Harbor Village', x: -220, z: 120, items: [
    { fn: dockHouse }, { fn: cottage, ox: 9, oz: -6, args: [0xc8b090, 0x6a3020] },
    { fn: cottage, ox: -10, oz: -4, args: [0xd0c0a0, 0x7a4020] }, { fn: tavern, ox: 6, oz: 9 },
    { fn: fishShack, ox: -13, oz: 2 }, { fn: warehouse, ox: 16, oz: -2 },
    { fn: marketStall, ox: -6, oz: 7 }, { fn: well, ox: 3, oz: -5 } ] },
  { name: 'Meadow Hamlet', x: -60, z: -90, items: [
    { fn: windmill }, { fn: barn, ox: 15, oz: 2 }, { fn: cottage, ox: -11, oz: 6 },
    { fn: cottage, ox: -9, oz: -7 }, { fn: cottage, ox: 7, oz: -9, args: [0xe0d0b0, 0x5a2818] },
    { fn: chapel, ox: 13, oz: -11 }, { fn: schoolhouse, ox: -15, oz: -3 }, { fn: well, ox: -4, oz: 0 } ] },
  { name: 'Eastern Outpost', x: 260, z: 40, items: [
    { fn: guardhouse }, { fn: cottage, ox: -9, oz: 5 }, { fn: cottage, ox: 7, oz: -6 },
    { fn: barn, ox: 14, oz: 9 }, { fn: warehouse, ox: -14, oz: -9 }, { fn: smithy, ox: 9, oz: 6 },
    { fn: marketStall, ox: -6, oz: -7 }, { fn: workshop, ox: 5, oz: -11 } ] },
  { name: 'Mountain Refuge', x: 152, z: -183, items: [
    { fn: mountainLodge }, { fn: observatory, ox: 13, oz: -5 }, { fn: cottage, ox: -11, oz: 4, args: [0x8a7868, 0x3a2820] },
    { fn: cottage, ox: -7, oz: -11, args: [0x7a6860, 0x3a2820] }, { fn: storehouse, ox: -15, oz: -5 }, { fn: smithy, ox: 9, oz: 5 } ] },
  { name: 'Southern Beach', x: -80, z: -260, items: [
    { fn: beachBungalow }, { fn: beachBungalow, ox: 10, oz: 4 }, { fn: beachBungalow, ox: -9, oz: 6 },
    { fn: fishShack, ox: -13, oz: -3 }, { fn: tavern, ox: 13, oz: 7 }, { fn: lighthouse, ox: 20, oz: -13 } ] },
  { name: 'Northern Monastery', x: 10, z: 290, items: [
    { fn: temple }, { fn: chapel, ox: -15, oz: 7 }, { fn: cottage, ox: 15, oz: 6, args: [0xe8e0d0, 0x5a4030] },
    { fn: cottage, ox: 13, oz: -9 }, { fn: cottage, ox: -11, oz: -9 }, { fn: storehouse, ox: 17, oz: -3 }, { fn: well, ox: 6, oz: 9 } ] },
  { name: 'River Market', x: -22, z: -26, items: [
    { fn: marketStall }, { fn: marketStall, ox: 5, oz: 2 }, { fn: marketStall, ox: -4, oz: 4 },
    { fn: tavern, ox: -11, oz: -5 }, { fn: smithy, ox: 11, oz: 4 }, { fn: fishShack, ox: -9, oz: 7 } ] },
  { name: 'Western Lighthouse', x: -330, z: -30, items: [
    { fn: lighthouse }, { fn: cottage, ox: 9, oz: 5 }, { fn: cottage, ox: -7, oz: 6 },
    { fn: fishShack, ox: 11, oz: -4 }, { fn: dockHouse, ox: 7, oz: -6 }, { fn: warehouse, ox: -11, oz: -5 } ] },
  { name: 'Lakeside Camp', x: -160, z: 70, items: [
    { fn: dockHouse }, { fn: cottage, ox: 8, oz: -6 }, { fn: cottage, ox: -9, oz: -4 },
    { fn: fishShack, ox: 6, oz: 7 }, { fn: marketStall, ox: 7, oz: 5 }, { fn: well, ox: -5, oz: 3 } ] },
  { name: 'Highland Farms', x: 80, z: 150, items: [
    { fn: barn }, { fn: windmill, ox: -15, oz: 5 }, { fn: cottage, ox: 11, oz: -7 },
    { fn: cottage, ox: 9, oz: 7 }, { fn: cottage, ox: -9, oz: -6 }, { fn: storehouse, ox: 13, oz: 3 }, { fn: workshop, ox: -11, oz: 7 } ] },
  { name: 'Crossroads Post', x: 43, z: -40, items: [
    { fn: tavern }, { fn: warehouse, ox: 14, oz: -2 }, { fn: marketStall, ox: -7, oz: 5 },
    { fn: smithy, ox: 9, oz: 7 }, { fn: guardhouse, ox: -11, oz: -5 }, { fn: cottage, ox: 7, oz: -9 } ] },
  { name: 'Sunset Cove', x: -280, z: -180, items: [
    { fn: beachBungalow }, { fn: beachBungalow, ox: 9, oz: -2 }, { fn: fishShack, ox: -8, oz: 4 },
    { fn: dockHouse, ox: 6, oz: 6 }, { fn: tavern, ox: -11, oz: -5 } ] },
  { name: 'Ruin Quarter', x: 118, z: 91, items: [
    { fn: chapel }, { fn: cottage, ox: -9, oz: 6, args: [0xb8a898, 0x5a4030] }, { fn: cottage, ox: 8, oz: -5 },
    { fn: storehouse, ox: 11, oz: 6 }, { fn: marketStall, ox: -6, oz: -7 }, { fn: smithy, ox: 7, oz: 7 } ] },
  { name: 'East Ridge Farms', x: 200, z: 120, items: [
    { fn: barn }, { fn: windmill, ox: 13, oz: -4 }, { fn: cottage, ox: -10, oz: 5 },
    { fn: cottage, ox: -8, oz: -6 }, { fn: cottage, ox: 7, oz: 7 }, { fn: storehouse, ox: 9, oz: -7 } ] },
];

export function buildBuildings(scene, staticMeshes, grid, ctx) {
  const { heightAt, slopeAt, WATER_LEVEL, HALF } = ctx;

  const place = (worldX, worldZ, fn, args = []) => {
    // sample footprint corners: build floor at the HIGHEST so terrain never pokes
    // through it; the solid foundation pad fills down to below the LOWEST
    const sr = 5;
    const hs = [
      heightAt(worldX, worldZ),
      heightAt(worldX + sr, worldZ), heightAt(worldX - sr, worldZ),
      heightAt(worldX, worldZ + sr), heightAt(worldX, worldZ - sr),
      heightAt(worldX + sr, worldZ + sr), heightAt(worldX - sr, worldZ - sr),
    ];
    const cmin = Math.min(...hs), cmax = Math.max(...hs);
    const baseY = Math.max(cmax, WATER_LEVEL + 0.5);
    const b = makeBuilder(scene, staticMeshes, grid, worldX, baseY, worldZ);
    b.padDepth = (baseY - cmin) + 0.6; // foundation reaches below the seabed/low corner
    fn(b, ...args);
  };

  for (const s of SETTLEMENTS) {
    for (const item of s.items) {
      // each building is levelled to ITS OWN terrain height (fixes floating/sinking)
      place(s.x + (item.ox || 0), s.z + (item.oz || 0), item.fn, item.args);
    }
  }

  // scattered cottages across the island
  let seed = 4242;
  const rand = () => { seed = (seed * 16807 + 1) % 2147483647; return (seed - 1) / 2147483646; };
  const palette = [[0xd4b896, 0x8b3a2a], [0xc8b090, 0x6a3020], [0xe0d0b0, 0x5a2818], [0xb8a888, 0x7a4020]];
  let placed = 0;
  for (let tries = 0; tries < 600 && placed < 26; tries++) {
    const x = (rand() * 2 - 1) * HALF * 0.8;
    const z = (rand() * 2 - 1) * HALF * 0.8;
    const y = heightAt(x, z);
    if (y < WATER_LEVEL + 1.5 || y > 28 || slopeAt(x, z) > 0.28) continue;
    if (SETTLEMENTS.some((s) => Math.hypot(x - s.x, z - s.z) < 34)) continue;
    const [c, r] = palette[placed % palette.length];
    place(x, z, cottage, [c, r]);
    placed++;
  }
}
