import * as THREE from 'three';
import { CELL } from './builds.js';

export const ARENA = 70; // half-size of the playable square

// Six spawn points around the edge, each facing the center.
export const SPAWNS = [[-62, 0], [62, 0], [0, -62], [0, 62], [-52, 52], [52, -52]]
  .map(([x, z]) => ({ pos: [x, 0, z], yaw: Math.atan2(x, z) }));

function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// fine grain speckle — the difference between "toy" and "real" surfaces
function grain(c, w, h, n, darkAlpha = 0.1, lightAlpha = 0.07) {
  for (let i = 0; i < n; i++) {
    c.fillStyle = `rgba(0,0,0,${Math.random() * darkAlpha})`;
    c.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    c.fillStyle = `rgba(255,255,255,${Math.random() * lightAlpha})`;
    c.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}
function baseGrime(c, w, h) { // darkened wall base, like dirt splash-back
  const g = c.createLinearGradient(0, h * 0.72, 0, h);
  g.addColorStop(0, 'rgba(60,45,30,0)');
  g.addColorStop(1, 'rgba(60,45,30,0.38)');
  c.fillStyle = g;
  c.fillRect(0, h * 0.7, w, h * 0.3);
}

// grayscale-ish patterns tinted by each mesh's color
const T = {
  // sandstone brick (deadshot-style walls) — per-brick tint + mortar + grain
  brick: canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#9a8c74'; c.fillRect(0, 0, w, h);
    const bh = 24, bw = 62;
    for (let y = 0; y < h; y += bh) {
      const off = (y / bh) % 2 ? bw / 2 : 0;
      for (let x = -bw; x < w + bw; x += bw) {
        const v = 200 + Math.floor(Math.random() * 42);
        c.fillStyle = `rgb(${v},${v - 12},${v - 38})`;
        c.fillRect(x + off + 2, y + 2, bw - 4, bh - 4);
      }
    }
    grain(c, w, h, 2600, 0.12, 0.08);
    baseGrime(c, w, h);
  }),
  // painted wood planks with grain streaks and nails
  wood: canvasTex(256, 256, (c, w, h) => {
    const ph = 25;
    for (let y = 0; y < h; y += ph) {
      const v = 195 + Math.floor(Math.random() * 45);
      c.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
      c.fillRect(0, y, w, ph - 3);
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(0, y + ph - 3, w, 3);
      for (let i = 0; i < 7; i++) { // grain streaks
        c.fillStyle = `rgba(70,50,30,${0.08 + Math.random() * 0.1})`;
        c.fillRect(Math.random() * w, y + 3 + Math.random() * (ph - 8), 18 + Math.random() * 46, 1.6);
      }
      c.fillStyle = 'rgba(40,30,20,0.5)'; // nails
      c.fillRect(6, y + ph / 2 - 1, 2.5, 2.5);
      c.fillRect(w - 9, y + ph / 2 - 1, 2.5, 2.5);
    }
    grain(c, w, h, 1600, 0.1, 0.05);
    baseGrime(c, w, h);
  }),
  // corrugated metal with rust flecks
  metal: canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#b9b9b9'; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      c.fillStyle = '#8f8f8f'; c.fillRect(x + 10, 0, 6, h);
      c.fillStyle = '#d9d9d9'; c.fillRect(x, 0, 2, h);
    }
    for (let i = 0; i < 26; i++) {
      c.fillStyle = `rgba(140,80,40,${0.12 + Math.random() * 0.18})`;
      c.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 5, 2 + Math.random() * 4);
    }
    grain(c, w, h, 900, 0.1, 0.07);
    baseGrime(c, w, h);
  }),
  // weathered raw planks (crates)
  planks: canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#c2c2c2'; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 42) {
      c.fillStyle = 'rgba(70,55,35,0.5)'; c.fillRect(x, 0, 3, h);
    }
    for (let i = 0; i < 30; i++) {
      c.fillStyle = `rgba(90,70,45,${0.1 + Math.random() * 0.16})`;
      c.fillRect(Math.random() * w, Math.random() * h, 10 + Math.random() * 26, 1.6);
    }
    grain(c, w, h, 1100, 0.12, 0.06);
  }),
  // stained concrete
  concrete: canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#b4b4b0'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 22; i++) { // blotchy stains
      const grad = c.createRadialGradient(0, 0, 1, 0, 0, 18 + Math.random() * 36);
      grad.addColorStop(0, `rgba(80,78,70,${0.1 + Math.random() * 0.12})`);
      grad.addColorStop(1, 'rgba(80,78,70,0)');
      c.save();
      c.translate(Math.random() * w, Math.random() * h);
      c.fillStyle = grad;
      c.fillRect(-60, -60, 120, 120);
      c.restore();
    }
    grain(c, w, h, 2400, 0.1, 0.06);
    baseGrime(c, w, h);
  }),
};

function groundTexture() {
  // mottled packed dirt — large soft blotches + heavy fine grain
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const c = cv.getContext('2d');
  c.fillStyle = '#a98a5f';
  c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i++) {
    const grad = c.createRadialGradient(0, 0, 1, 0, 0, 10 + Math.random() * 30);
    const dark = Math.random() > 0.45;
    grad.addColorStop(0, dark
      ? `rgba(120,90,55,${0.12 + Math.random() * 0.16})`
      : `rgba(220,190,140,${0.1 + Math.random() * 0.14})`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    c.save();
    c.translate(Math.random() * 256, Math.random() * 256);
    c.fillStyle = grad;
    c.fillRect(-45, -45, 90, 90);
    c.restore();
  }
  grain(c, 256, 256, 3200, 0.13, 0.08);
  // sparse pebbles and dry twigs
  for (let i = 0; i < 26; i++) {
    c.fillStyle = `rgba(${100 + Math.random() * 50},${85 + Math.random() * 40},${60 + Math.random() * 25},0.65)`;
    c.fillRect(Math.random() * 252, Math.random() * 252, 2 + Math.random() * 3, 2 + Math.random() * 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set((ARENA * 2) / 8, (ARENA * 2) / 8);
  tex.anisotropy = 4;
  return tex;
}

// Builds the whole static world. Returns { solids, staticMeshes, pads, groundMesh, spawns }.
export function buildMap(scene) {
  const solids = [];
  const staticMeshes = [];

  // warm late-afternoon light, env map supplies ambient bounce
  scene.add(new THREE.HemisphereLight(0xffe2c4, 0x6b5a48, 0.42));
  const sun = new THREE.DirectionalLight(0xffd9a8, 1.75);
  sun.position.set(90, 70, 55);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, far: 300 });
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(ARENA * 2, 1, ARENA * 2),
    new THREE.MeshStandardMaterial({ map: groundTexture(), color: 0x9a7e57, roughness: 0.96 }));
  ground.position.y = -0.5;
  ground.receiveShadow = true;
  scene.add(ground);

  const outer = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 2400),
    new THREE.MeshStandardMaterial({ color: 0x96794e, roughness: 1 }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.55;
  scene.add(outer);

  // ----- sky dome, sun, clouds, distant mountains -----
  const skyTex = canvasTex(16, 256, (c) => {
    // sunset: deep blue overhead burning to orange at the horizon
    const grad = c.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#41608f');
    grad.addColorStop(0.42, '#7d83a6');
    grad.addColorStop(0.58, '#bd8e76');
    grad.addColorStop(0.7, '#dfa069');
    grad.addColorStop(0.8, '#edb377');
    grad.addColorStop(1, '#f4cf95');
    c.fillStyle = grad;
    c.fillRect(0, 0, 16, 256);
  });
  skyTex.wrapS = skyTex.wrapT = THREE.ClampToEdgeWrapping;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(950, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
  scene.add(dome);

  const sunTex = canvasTex(128, 128, (c) => {
    const grad = c.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,246,220,1)');
    grad.addColorStop(0.22, 'rgba(255,214,150,0.95)');
    grad.addColorStop(1, 'rgba(255,170,90,0)');
    c.fillStyle = grad;
    c.fillRect(0, 0, 128, 128);
  });
  const sunSpr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunTex, blending: THREE.AdditiveBlending, fog: false, depthWrite: false,
  }));
  sunSpr.position.set(620, 290, 380); // low warm sun
  sunSpr.scale.set(300, 300, 1);
  scene.add(sunSpr);

  const cloudTex = canvasTex(128, 64, (c) => {
    for (const [bx, by, br] of [[36, 38, 22], [64, 30, 27], [92, 38, 21], [54, 42, 22], [80, 44, 18]]) {
      const grad = c.createRadialGradient(bx, by, 2, bx, by, br);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.7, 'rgba(255,255,255,0.5)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = grad;
      c.fillRect(0, 0, 128, 64);
    }
  });
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9 + 0.4;
    const cl = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTex, transparent: true, opacity: 0.7, color: 0xffd9b8, fog: false, depthWrite: false,
    }));
    cl.position.set(Math.cos(a) * (320 + (i * 67) % 280), 150 + (i * 31) % 90, Math.sin(a) * (320 + (i * 53) % 260));
    const s = 130 + (i * 41) % 110;
    cl.scale.set(s, s * 0.42, 1);
    scene.add(cl);
  }

  const mtnMat = new THREE.MeshStandardMaterial({ color: 0xa08a72, roughness: 1, flatShading: true });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.22;
    const h = 100 + (i * 47) % 130;
    const mtn = new THREE.Mesh(new THREE.ConeGeometry(h * 1.5, h, 5), mtnMat);
    mtn.position.set(Math.cos(a) * (560 + (i * 61) % 180), h / 2 - 10, Math.sin(a) * (560 + (i * 43) % 180));
    mtn.rotation.y = i * 1.3;
    scene.add(mtn);
  }

  // (the sandstone perimeter wall is built in the layout section below)

  // --- primitive helpers (axis-aligned collision) ---
  const box = (w, h, d, x, z, color, baseY = 0, { solid = true, rough = 0.85, emissive = 0, tex = null, texScale = 2, texY = null } = {}) => {
    let map = null;
    if (tex) {
      map = tex.clone();
      map.needsUpdate = true;
      // texY=1 stretches one tile over the full height so baked base-grime sits at the bottom
      map.repeat.set(Math.max(0.5, Math.max(w, d) / texScale), texY ?? Math.max(0.5, h / texScale));
    }
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color, map, roughness: rough, emissive, emissiveIntensity: emissive ? 1 : 0 }));
    m.position.set(x, baseY + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    staticMeshes.push(m);
    if (solid) solids.push(new THREE.Box3().setFromObject(m));
    return m;
  };

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xbfe0ee, transparent: true, opacity: 0.32, roughness: 0.08, metalness: 0.5,
  });
  // window pane — purely visual, bullets and camera pass through
  const glass = (axis, fixed, center, y0, gw, gh) => {
    const geo = axis === 'x' ? new THREE.BoxGeometry(gw, gh, 0.05) : new THREE.BoxGeometry(0.05, gh, gw);
    const m = new THREE.Mesh(geo, glassMat);
    if (axis === 'x') m.position.set(center, y0 + gh / 2, fixed);
    else m.position.set(fixed, y0 + gh / 2, center);
    m.userData.noHit = m.userData.noCam = true;
    scene.add(m);
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
  const wallRun = (axis, fixed, from, to, y0, h, color, opening = null, opts = {}) => {
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
      if (axis === 'x') box(len, sh, th, mid, fixed, color, sy, opts);
      else box(th, sh, len, fixed, mid, color, sy, opts);
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
    const sid = { tex: T.wood, texScale: 2.2, texY: 1 };
    // ground floor walls
    wallRun('x', z1, x0, x1, 0, H, wallColor, [cx - 0.8, cx + 0.8, 0, 2.4], sid);
    wallRun('x', z0, x0, x1, 0, H, wallColor, [cx - 1, cx + 1, 1.0, 2.2], sid);
    wallRun('z', x0, z0, z1, 0, H, wallColor, [cz - 1, cz + 1, 1.0, 2.2], sid);
    wallRun('z', x1, z0, z1, 0, H, wallColor, null, sid);
    // trim + glass
    frame('x', z1, cx, 0, 1.6, 2.4, trimColor, true);          // door frame
    frame('x', z0, cx, 1.0, 2, 1.2, trimColor);                // back window
    frame('z', x0, cz, 1.0, 2, 1.2, trimColor);                // left window
    glass('x', z0, cx, 1.0, 1.9, 1.15);
    glass('z', x0, cz, 1.0, 1.9, 1.15);
    // stone foundation strips (skip the doorway)
    const found = { solid: false, tex: T.concrete, texScale: 2.5, texY: 1 };
    box(cx - 0.9 - x0, 0.55, 0.42, (x0 + cx - 0.9) / 2, z1, 0xa9a49a, -0.02, found);
    box(x1 - cx - 0.9, 0.55, 0.42, (cx + 0.9 + x1) / 2, z1, 0xa9a49a, -0.02, found);
    box(W, 0.55, 0.42, cx, z0, 0xa9a49a, -0.02, found);
    box(0.42, 0.55, D, x0, cz, 0xa9a49a, -0.02, found);
    box(0.42, 0.55, D, x1, cz, 0xa9a49a, -0.02, found);
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
    wallRun('x', z1, x0, x1, H, H, wallColor, [cx - 1, cx + 1, H + 1.0, H + 2.2], sid);
    wallRun('x', z0, x0, x1, H, H, wallColor, [cx - 1, cx + 1, H + 1.0, H + 2.2], sid);
    wallRun('z', x0, z0, z1, H, H, wallColor, null, sid);
    wallRun('z', x1, z0, z1, H, H, wallColor, [cz - 1, cz + 1, H + 1.0, H + 2.2], sid);
    frame('x', z1, cx, H + 1.0, 2, 1.2, trimColor);
    frame('x', z0, cx, H + 1.0, 2, 1.2, trimColor);
    frame('z', x1, cz, H + 1.0, 2, 1.2, trimColor);
    glass('x', z1, cx, H + 1.0, 1.9, 1.15);
    glass('x', z0, cx, H + 1.0, 1.9, 1.15);
    glass('z', x1, cz, H + 1.0, 1.9, 1.15);
    // roof, parapet, chimney, AC unit
    box(W, 0.25, D, cx, cz, trimColor, H * 2);
    box(W, 0.45, 0.25, cx, z0 + 0.12, trimColor, H * 2 + 0.25);
    box(W, 0.45, 0.25, cx, z1 - 0.12, trimColor, H * 2 + 0.25);
    box(0.25, 0.45, D, x0 + 0.12, cz, trimColor, H * 2 + 0.25);
    box(0.25, 0.45, D, x1 - 0.12, cz, trimColor, H * 2 + 0.25);
    box(0.9, 1.6, 0.9, x0 + 1.4, z0 + 1.3, 0x8a4f43, H * 2, { tex: T.brick, texScale: 0.8 });
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
    const pl = { tex: T.planks, texScale: 1.3 };
    wallRun('x', zd, x0, x1, 0, H, wood, [cx - 0.75, cx + 0.75, 0, 2.3], pl);
    wallRun('x', zw, x0, x1, 0, H, wood, [cx - 0.9, cx + 0.9, 1.0, 2.1], pl);
    wallRun('z', x0, z0, z1, 0, H, wood, [cz - 0.9, cz + 0.9, 1.0, 2.1], pl);
    wallRun('z', x1, z0, z1, 0, H, wood, null, pl);
    frame('x', zd, cx, 0, 1.5, 2.3, trim, true);
    frame('x', zw, cx, 1.0, 1.8, 1.1, trim);
    frame('z', x0, cz, 1.0, 1.8, 1.1, trim);
    glass('x', zw, cx, 1.0, 1.7, 1.05);
    glass('z', x0, cz, 1.0, 1.7, 1.05);
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
    const mt = { tex: T.concrete, texScale: 3, texY: 1, rough: 0.85 };
    wallRun('x', z1, x0, x1, 0, H, steel, [cx - 3, cx + 3, 0, 4], mt);
    wallRun('x', z0, x0, x1, 0, H, steel, [cx - 1, cx + 1, 0, 2.6], mt);
    wallRun('z', x0, z0, z1, 0, H, steel, [cz - 1.2, cz + 1.2, 1.4, 3.2], mt);
    wallRun('z', x1, z0, z1, 0, H, steel, [cz - 1.2, cz + 1.2, 1.4, 3.2], mt);
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
  // packed-dirt paths worn through the map
  box(4.2, 0.05, ARENA * 2, 0, 0, 0xb59a6b, 0, { solid: false, rough: 1, tex: T.concrete, texScale: 6 });
  box(ARENA * 2, 0.05, 4.2, 0, 0, 0xb59a6b, 0, { solid: false, rough: 1, tex: T.concrete, texScale: 6 });

  // sandstone perimeter wall with concrete cap (replaces the energy barrier)
  const brickOpts = { tex: T.brick, texScale: 2.4, texY: 1 };
  const capColor = 0xb0a896;
  for (const [bx, bz, bw, bd] of [
    [0, -ARENA + 0.4, ARENA * 2, 0.8], [0, ARENA - 0.4, ARENA * 2, 0.8],
    [-ARENA + 0.4, 0, 0.8, ARENA * 2], [ARENA - 0.4, 0, 0.8, ARENA * 2],
  ]) {
    box(bw, 4.2, bd, bx, bz, 0xc7b394, 0, brickOpts);
    box(bw === 0.8 ? 1.1 : bw + 0.3, 0.3, bd === 0.8 ? 1.1 : bd + 0.3, bx, bz, capColor, 4.2, { tex: T.concrete, texScale: 3 });
  }

  // alley walls near the spawn lanes (deadshot-style corridors)
  const alley = (w, d, x, z) => {
    box(w, 3.2, d, x, z, 0xc7b394, 0, brickOpts);
    box(w === 0.6 ? 0.95 : w + 0.25, 0.28, d === 0.6 ? 0.95 : d + 0.25, x, z, capColor, 3.2, { tex: T.concrete, texScale: 3 });
  };
  alley(15, 0.6, -13.5, 47);
  alley(0.6, 12, -6.5, 52);
  alley(15, 0.6, 13.5, -47);
  alley(0.6, 12, 6.5, -52);
  alley(0.6, 14, 47, 13);
  alley(0.6, 14, -47, -13);

  // center platform + pillars + flags
  box(18, 1.5, 18, 0, 0, 0xb3ada1, 0, { rough: 0.8, tex: T.concrete, texScale: 4 });
  box(2.2, 5, 2.2, -6, 6, 0xa8a094, 1.5, { tex: T.concrete, texScale: 2, texY: 1 });
  box(2.2, 5, 2.2, 6, -6, 0xa8a094, 1.5, { tex: T.concrete, texScale: 2, texY: 1 });
  box(0.12, 4.5, 0.12, 8, 8, 0x3a4250, 1.5);
  box(1.3, 0.75, 0.06, 8.8, 8, 0x4fc3f7, 5.0, { solid: false });
  box(0.12, 4.5, 0.12, -8, -8, 0x3a4250, 1.5);
  box(1.3, 0.75, 0.06, -8.8, -8, 0xff7043, 5.0, { solid: false });

  house(-34, -26, 0xd0793a, 0x6b5848); // painted orange barn-wood
  house(34, 26, 0x7d8ca3, 0x4a5a6b);  // weathered slate-blue wood
  cabin(-30, 32, -1);
  cabin(30, -32, 1);
  warehouse(0, -46);

  // shipping containers (corrugated) + barrels
  const corr = { tex: T.metal, texScale: 1.1, rough: 0.5 };
  box(2.6, 2.8, 8, 26, -16, 0x4f7fa8, 0, corr);
  box(2.6, 2.8, 8, 29.4, -13, 0xa85f4f, 0, corr);
  box(2.6, 2.8, 8, 27.7, -14.5, 0x6b8f5a, 2.8, corr);
  box(2.6, 2.8, 8, -26, 16, 0x4f7fa8, 0, corr);
  box(2.6, 2.8, 8, -29.4, 13, 0xa85f4f, 0, corr);
  box(2.6, 2.8, 8, -27.7, 14.5, 0x6b8f5a, 2.8, corr);
  barrel(23.8, -18.5); barrel(24.6, -17.2, 0x4f7fa8);
  barrel(-23.8, 18.5); barrel(-24.6, 17.2, 0x4f7fa8);

  // mid cover walls — sandstone with concrete caps
  const cover = (w, d, x, z) => {
    box(w, 3.2, d, x, z, 0xc7b394, 0, brickOpts);
    box(w + 0.25, 0.28, d + 0.25, x, z, capColor, 3.2, { tex: T.concrete, texScale: 3 });
  };
  cover(12, 1.2, 0, 26);
  cover(12, 1.2, 0, -26);
  cover(1.2, 12, -22, 0);
  cover(1.2, 12, 22, 0);

  // crates (plank texture)
  const crate = { tex: T.planks, texScale: 1.25 };
  box(2.5, 2.5, 2.5, -14, -8, 0xc0824f, 0, crate);
  box(2.5, 2.5, 2.5, 14, 8, 0xc0824f, 0, crate);
  box(2.5, 2.5, 2.5, 44, -10, 0xc0824f, 0, crate);
  box(2.5, 2.5, 2.5, 46.5, -10, 0xb8743f, 0, crate);
  box(2.5, 2.5, 2.5, 45.25, -10, 0xa8663f, 2.5, crate);
  box(2.5, 2.5, 2.5, -44, 10, 0xc0824f, 0, crate);
  box(2.5, 2.5, 2.5, -46.5, 10, 0xb8743f, 0, crate);
  box(2.5, 2.5, 2.5, -45.25, 10, 0xa8663f, 2.5, crate);

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

  // dry grass tufts (visual only, deterministic spiral placement)
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x9a8d52, roughness: 1 });
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
