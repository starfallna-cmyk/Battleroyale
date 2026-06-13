import * as THREE from 'three';
import { SimplexNoise } from './noise.js';
import { buildBuildings } from './buildings.js';

// ===== Lush Island terrain (840m) adapted for KILLSHOT gameplay =====
export const HALF = 420;          // island half-size
export const ARENA = HALF;        // game.js clamps player to ±ARENA
export const WATER_LEVEL = 2.8;

const noise = new SimplexNoise(1337);
const noise2 = new SimplexNoise(9001);

// Analytic terrain height — sampled every frame by player physics (cheap).
export function heightAt(x, z) {
  const nx = x / HALF;
  const nz = z / HALF;
  const dist = Math.sqrt(nx * nx + nz * nz);

  const island = Math.pow(Math.max(0, 1 - Math.pow(dist, 1.65)), 1.4);

  const hills = noise.fbm(x * 0.0045, z * 0.0045, 6, 2.1, 0.52);
  const detail = noise2.fbm(x * 0.018, z * 0.018, 4, 2.3, 0.45) * 0.35;
  const ridge = Math.pow(Math.abs(noise.fbm(x * 0.007, z * 0.007, 4, 2, 0.5)), 1.6);

  const lakeCx = -80, lakeCz = 60;
  const lakeD = Math.hypot(x - lakeCx, z - lakeCz);
  const lakeBowl = Math.exp(-lakeD * lakeD / (180 * 180)) * 14;

  const peakCx = 180, peakCz = -140;
  const peakD = Math.hypot(x - peakCx, z - peakCz);
  const peak = Math.exp(-peakD * peakD / (220 * 220)) * 52;

  let h = (hills * 22 + detail * 8 + ridge * 18 + peak) * island - lakeBowl * island;
  h = Math.max(h, -6 * island);
  return h;
}
export const terrainHeightAt = heightAt;

export function slopeAt(x, z, eps = 1.5) {
  const h = heightAt(x, z);
  const hx = heightAt(x + eps, z) - h;
  const hz = heightAt(x, z + eps) - h;
  return Math.sqrt(hx * hx + hz * hz) / eps;
}

function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

// ===== uniform-grid spatial index so per-frame collision stays cheap =====
export class SolidGrid {
  constructor(cell = 14) {
    this.cell = cell;
    this.map = new Map();
  }
  _key(cx, cz) { return cx * 100000 + cz; }
  add(box) {
    const c = this.cell;
    const x0 = Math.floor(box.min.x / c), x1 = Math.floor(box.max.x / c);
    const z0 = Math.floor(box.min.z / c), z1 = Math.floor(box.max.z / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = this._key(cx, cz);
        let arr = this.map.get(k);
        if (!arr) { arr = []; this.map.set(k, arr); }
        arr.push(box);
      }
    }
  }
  query(x, z, out) {
    const c = this.cell;
    const cx = Math.floor(x / c), cz = Math.floor(z / c);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const arr = this.map.get(this._key(cx + dx, cz + dz));
        if (arr) for (const b of arr) if (!out.includes(b)) out.push(b);
      }
    }
    return out;
  }
}

function buildTerrain(scene) {
  const segs = 220;
  const geo = new THREE.PlaneGeometry(HALF * 2, HALF * 2, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const y = heightAt(x, z);
    pos.setY(i, y);

    const slope = slopeAt(x, z);
    const t = THREE.MathUtils.clamp((y - WATER_LEVEL) / 38, 0, 1);
    const sand = y < WATER_LEVEL + 1.2 ? 1 : 0;
    const rock = slope > 0.55 || y > 38 ? Math.min(1, (slope - 0.45) * 2 + (y - 30) * 0.03) : 0;
    const lush = (1 - rock) * (1 - sand) * (0.55 + t * 0.45);

    const r = THREE.MathUtils.lerp(0.72, 0.18, rock) * sand + (1 - sand) * THREE.MathUtils.lerp(0.22, 0.12, t) * lush + sand * 0.76;
    const g = THREE.MathUtils.lerp(0.68, 0.22, rock) * sand + (1 - sand) * THREE.MathUtils.lerp(0.48, 0.38, t) * lush + sand * 0.62;
    const b = THREE.MathUtils.lerp(0.55, 0.18, rock) * sand + (1 - sand) * THREE.MathUtils.lerp(0.18, 0.14, t) * lush + sand * 0.38;
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const grassTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#3d6b32';
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) {
      c.fillStyle = `rgba(${40 + Math.random() * 40},${90 + Math.random() * 50},${30 + Math.random() * 30},${0.15 + Math.random() * 0.2})`;
      c.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 2);
    }
  });
  grassTex.repeat.set(48, 48);

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ map: grassTex, vertexColors: true, roughness: 0.92, metalness: 0.02 }));
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function buildWater(scene) {
  const geo = new THREE.PlaneGeometry(HALF * 2.4, HALF * 2.4, 64, 64);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x2a8faa, transparent: true, opacity: 0.78,
    roughness: 0.15, metalness: 0.35, envMapIntensity: 1.2,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    mat.userData.shader = shader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>', `#include <common>\nuniform float uTime;`);
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float wave = sin(position.x * 0.08 + uTime * 1.2) * 0.12 + sin(position.z * 0.06 + uTime * 0.9) * 0.1;
       transformed.y += wave;`);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>', `#include <common>\nuniform float uTime;`);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.92, 0.85), 0.25 + 0.15 * sin(vViewPosition.x * 0.02 + uTime));`);
  };
  const water = new THREE.Mesh(geo, mat);
  water.position.y = WATER_LEVEL;
  water.userData.noHit = water.userData.noCam = true; // shoot/swim through the surface
  scene.add(water);
  return water;
}

function buildSky(scene) {
  const skyTex = canvasTex(16, 512, (c, w, h) => {
    const grad = c.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#1a4a7a');
    grad.addColorStop(0.35, '#4a8ec4');
    grad.addColorStop(0.55, '#8ec8e8');
    grad.addColorStop(0.72, '#f0c890');
    grad.addColorStop(0.85, '#f8a860');
    grad.addColorStop(1, '#ffd898');
    c.fillStyle = grad;
    c.fillRect(0, 0, w, h);
  });
  skyTex.wrapS = skyTex.wrapT = THREE.ClampToEdgeWrapping;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1800, 32, 24),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
  dome.userData.noHit = dome.userData.noCam = true;
  scene.add(dome);

  const sunTex = canvasTex(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 2, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,248,220,1)');
    g.addColorStop(0.2, 'rgba(255,210,130,0.9)');
    g.addColorStop(1, 'rgba(255,160,60,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  });
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunTex, blending: THREE.AdditiveBlending, fog: false, depthWrite: false }));
  sun.position.set(520, 280, -380);
  sun.scale.set(420, 420, 1);
  sun.raycast = () => {};
  scene.add(sun);

  const cloudTex = canvasTex(256, 128, (c, w, h) => {
    for (const [bx, by, br] of [[50, 55, 32], [100, 45, 38], [170, 58, 30], [130, 68, 28]]) {
      const g = c.createRadialGradient(bx, by, 2, bx, by, br);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.65, 'rgba(255,255,255,0.45)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }
  });
  for (let i = 0; i < 18; i++) {
    const a = i * 0.55 + 0.2;
    const cl = new THREE.Sprite(new THREE.SpriteMaterial({
      map: cloudTex, transparent: true, opacity: 0.55 + (i % 3) * 0.1,
      color: 0xffeedd, fog: false, depthWrite: false }));
    const r = 280 + (i * 97) % 520;
    cl.position.set(Math.cos(a) * r, 120 + (i * 41) % 100, Math.sin(a) * r);
    const s = 180 + (i * 53) % 160;
    cl.scale.set(s, s * 0.38, 1);
    cl.raycast = () => {};
    scene.add(cl);
  }
}

function buildLighting(scene) {
  scene.add(new THREE.HemisphereLight(0xb8e8ff, 0x3a5a28, 0.8));
  scene.add(new THREE.AmbientLight(0xb8c8dc, 0.26)); // lifts building interiors out of black
  const sun = new THREE.DirectionalLight(0xffe8c0, 2.0);
  sun.position.set(220, 200, -160);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 600;
  Object.assign(sun.shadow.camera, { left: -140, right: 140, top: 140, bottom: -140 });
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);
  scene.userData.sun = sun; // game.js keeps the shadow box following the player

  const fill = new THREE.DirectionalLight(0x88c8ff, 0.3);
  fill.position.set(-200, 120, 300);
  scene.add(fill);
}

function gatherPlacements(count, placeFn, maxTries) {
  const out = [];
  const tries = maxTries ?? count * 8;
  for (let i = 0; i < tries && out.length < count; i++) {
    const p = placeFn();
    if (p) out.push(p);
  }
  return out;
}

function scatterFromPlacements(scene, placements, geo, mat, opts = {}) {
  if (!placements.length) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, placements.length);
  mesh.castShadow = opts.shadow !== false;
  mesh.receiveShadow = false;
  if (opts.noCam) mesh.userData.noCam = true;
  if (opts.noHit) mesh.userData.noHit = true;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(p.rx || 0, p.ry || 0, p.rz || 0);
    dummy.scale.setScalar(p.s || 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  scene.add(mesh);
  return mesh;
}

function scatterInstances(scene, count, geo, mat, placeFn, opts) {
  return scatterFromPlacements(scene, gatherPlacements(count, placeFn), geo, mat, opts);
}

function buildVegetation(scene, staticMeshes, grid, footprints = []) {
  // (grass-tuft and flower cone scatter removed — they read as litter on the ground)
  const inBuilding = (x, z) => footprints.some((f) => Math.hypot(x - f.x, z - f.z) < f.r);

  // oak trees — trunks block movement & shots; canopies block shots only
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 5.5, 8);
  trunkGeo.translate(0, 2.75, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3d22, roughness: 0.9 });
  const canopyGeo = new THREE.SphereGeometry(2.8, 10, 8);
  canopyGeo.translate(0, 6.8, 0);
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x2d6b28, roughness: 0.95 });
  const canopy2Geo = new THREE.SphereGeometry(1.9, 8, 6);
  canopy2Geo.translate(0.6, 7.4, 0.4);
  const canopy2Mat = new THREE.MeshStandardMaterial({ color: 0x3a7a32, roughness: 0.95 });

  const treePlace = () => {
    const x = (Math.random() * 2 - 1) * HALF * 0.88;
    const z = (Math.random() * 2 - 1) * HALF * 0.88;
    const y = heightAt(x, z);
    if (y < WATER_LEVEL + 1.5 || y > 35 || slopeAt(x, z) > 0.35) return null;
    if (inBuilding(x, z)) return null; // keep trees out of settlements
    return { x, y, z, ry: Math.random() * Math.PI * 2, s: 0.85 + Math.random() * 0.7 };
  };
  const oaks = gatherPlacements(620, treePlace);
  const t1 = scatterFromPlacements(scene, oaks, trunkGeo, trunkMat);
  const c1 = scatterFromPlacements(scene, oaks, canopyGeo, canopyMat, { noCam: true });
  const c2 = scatterFromPlacements(scene, oaks, canopy2Geo, canopy2Mat, { noCam: true });
  staticMeshes.push(t1, c1, c2);
  for (const p of oaks) {
    const r = 0.5 * (p.s || 1);
    grid.add(new THREE.Box3(
      new THREE.Vector3(p.x - r, p.y, p.z - r), new THREE.Vector3(p.x + r, p.y + 6, p.z + r)));
  }

  // pines on hills
  const pineTrunk = new THREE.CylinderGeometry(0.22, 0.32, 3.2, 7);
  pineTrunk.translate(0, 1.6, 0);
  const pineMat = new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.92 });
  const pineCone = new THREE.ConeGeometry(1.6, 3.5, 8);
  pineCone.translate(0, 4.2, 0);
  const pineConeTop = new THREE.ConeGeometry(1.1, 2.8, 8);
  pineConeTop.translate(0, 6.5, 0);
  const pineLeaf = new THREE.MeshStandardMaterial({ color: 0x1f4a22, roughness: 0.95 });

  const pinePlace = () => {
    const x = (Math.random() * 2 - 1) * HALF * 0.85;
    const z = (Math.random() * 2 - 1) * HALF * 0.85;
    const y = heightAt(x, z);
    if (y < 12 || y > 48 || slopeAt(x, z) > 0.5) return null;
    if (inBuilding(x, z)) return null;
    return { x, y, z, ry: Math.random() * 6, s: 0.9 + Math.random() * 0.8 };
  };
  const pines = gatherPlacements(320, pinePlace);
  const pt = scatterFromPlacements(scene, pines, pineTrunk, pineMat);
  const pc = scatterFromPlacements(scene, pines, pineCone, pineLeaf, { noCam: true });
  const pc2 = scatterFromPlacements(scene, pines, pineConeTop, pineLeaf, { noCam: true });
  staticMeshes.push(pt, pc, pc2);
  for (const p of pines) {
    const r = 0.32 * (p.s || 1);
    grid.add(new THREE.Box3(
      new THREE.Vector3(p.x - r, p.y, p.z - r), new THREE.Vector3(p.x + r, p.y + 4, p.z + r)));
  }
}

function buildPOIs(scene, staticMeshes, grid) {
  const addBox = (w, h, d, x, y, z, color, opts = {}) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.85 }));
    m.position.set(x, y + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    staticMeshes.push(m);
    if (opts.solid !== false) grid.add(new THREE.Box3().setFromObject(m));
    return m;
  };

  // wooden bridge over a gully
  const bx = -20, bz = -30;
  const by = heightAt(bx, bz);
  for (let i = 0; i < 8; i++) {
    addBox(1.4, 0.18, 0.4, bx + i * 1.3 - 4, by + 3.5, bz, 0x7a5230);
  }

  // waterfall cliff
  const wx = 200, wz = -60;
  const wy = heightAt(wx, wz);
  addBox(14, 22, 8, wx, wy, wz, 0x6a7068, { rough: 0.98 });
  const fall = new THREE.Mesh(
    new THREE.PlaneGeometry(3, 18),
    new THREE.MeshStandardMaterial({ color: 0xa8e8ff, transparent: true, opacity: 0.65,
      roughness: 0.1, metalness: 0.2, side: THREE.DoubleSide }));
  fall.position.set(wx - 2, wy + 12, wz + 4.5);
  fall.userData.noHit = fall.userData.noCam = true;
  scene.add(fall);

  // scattered boulders (collision)
  let placed = 0;
  for (let i = 0; i < 200 && placed < 90; i++) {
    const x = (Math.random() * 2 - 1) * HALF * 0.9;
    const z = (Math.random() * 2 - 1) * HALF * 0.9;
    const y = heightAt(x, z);
    if (y < WATER_LEVEL + 0.3) continue;
    const r = 0.8 + Math.random() * 2.4;
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(r, 0),
      new THREE.MeshStandardMaterial({ color: 0x7a8288, roughness: 0.98 }));
    rock.position.set(x, y + r * 0.35, z);
    rock.rotation.set(Math.random(), Math.random(), Math.random());
    rock.scale.y = 0.6 + Math.random() * 0.3;
    rock.castShadow = rock.receiveShadow = true;
    scene.add(rock);
    staticMeshes.push(rock);
    grid.add(new THREE.Box3(
      new THREE.Vector3(x - r * 0.7, y, z - r * 0.7),
      new THREE.Vector3(x + r * 0.7, y + r, z + r * 0.7)));
    placed++;
  }
}

function buildDistantMountains(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x6a8a72, roughness: 1, flatShading: true });
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const h = 80 + (i * 37) % 120;
    const mtn = new THREE.Mesh(new THREE.ConeGeometry(h * 1.8, h, 6), mat);
    mtn.position.set(Math.cos(a) * (HALF + 180 + (i * 29) % 100), h / 2 - 15, Math.sin(a) * (HALF + 180 + (i * 23) % 100));
    mtn.rotation.y = i * 0.8;
    mtn.userData.noHit = mtn.userData.noCam = true;
    scene.add(mtn);
  }
}

// six spawn anchors on solid land above water, spread around the island
function pickSpawns() {
  const candidates = [
    [43, -40], [-22, -26], [118, 91], [152, -183], [206, 46], [260, 40],
    [233, 65], [75, 40], [200, 120], [10, 200], [-60, -90], [154, 81],
  ];
  const spawns = [];
  for (const [x, z] of candidates) {
    const y = heightAt(x, z);
    if (y > WATER_LEVEL + 2 && y < 40 && slopeAt(x, z) < 0.4) {
      spawns.push({ pos: [x, y, z], yaw: Math.atan2(-x, -z) });
      if (spawns.length >= 6) break;
    }
  }
  while (spawns.length < 6) spawns.push({ pos: [0, heightAt(0, 0), 0], yaw: 0 });
  return spawns;
}

export const SPAWNS = pickSpawns();

// Builds the whole world. Returns the contract game.js expects, plus terrain helpers.
export function buildMap(scene) {
  scene.background = new THREE.Color(0x7ec8e8);
  scene.fog = new THREE.FogExp2(0xbcd8e6, 0.0011);

  const staticMeshes = [];
  const grid = new SolidGrid(14);

  buildLighting(scene);
  buildSky(scene);
  buildDistantMountains(scene);

  const terrain = buildTerrain(scene);
  const water = buildWater(scene);
  // buildings first so they register footprints; vegetation then avoids them
  const footprints = [];
  buildBuildings(scene, staticMeshes, grid, { heightAt, slopeAt, WATER_LEVEL, HALF }, footprints);
  buildVegetation(scene, staticMeshes, grid, footprints);
  buildPOIs(scene, staticMeshes, grid);

  return {
    groundMesh: terrain,
    water,
    staticMeshes,
    grid,
    solids: [],          // legacy field; static collision now lives in the grid
    pads: [],
    spawns: SPAWNS,
    terrainHeightAt: heightAt,
    waterLevel: WATER_LEVEL,
  };
}

export function updateWater(water, t) {
  if (water?.material?.userData?.shader) {
    water.material.userData.shader.uniforms.uTime.value = t;
  }
}
