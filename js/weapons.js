import * as THREE from 'three';

// falloff: [fullDmgRange, maxRange, minMultiplier]
export const WEAPONS = [
  { name: 'Assault Rifle', dmg: 17, head: 1.6, rate: 0.115, mag: 30, reload: 1.6,
    auto: true, spread: 0.011, bloom: 0.009, kick: 0.007, pellets: 1, range: 250,
    zoom: 60, adsSpread: 0.45, falloff: [35, 120, 0.55], buildDmg: 17, sound: 'shoot', tracer: 0xffe082 },
  { name: 'Shotgun', dmg: 9, head: 1.4, rate: 0.8, mag: 6, reload: 2.1,
    auto: false, spread: 0.042, bloom: 0, kick: 0.035, pellets: 8, range: 45,
    zoom: 66, adsSpread: 0.7, falloff: [9, 30, 0.3], buildDmg: 9, sound: 'shotgun', tracer: 0xffab66 },
  { name: 'Sniper', dmg: 105, head: 1.9, rate: 1.4, mag: 1, reload: 1.8,
    auto: false, spread: 0.0008, bloom: 0, kick: 0.06, pellets: 1, range: 500,
    zoom: 20, adsSpread: 0.05, falloff: null, buildDmg: 80, sound: 'sniper', tracer: 0x9be8ff, scope: true },
  { name: 'Pickaxe', dmg: 20, head: 1, rate: 0.45, mag: Infinity, reload: 0,
    auto: true, spread: 0, bloom: 0, kick: 0, pellets: 1, range: 3.2,
    zoom: 70, adsSpread: 1, falloff: null, buildDmg: 35, sound: 'swing', tracer: null, melee: true },
];

export function damageAt(w, dist, isHead) {
  let d = w.dmg;
  if (w.falloff) {
    const [full, max, min] = w.falloff;
    if (dist > full) d *= Math.max(min, 1 - ((dist - full) / (max - full)) * (1 - min));
  }
  if (isHead) d *= w.head;
  return Math.round(d);
}

// ===== low-poly weapon models (origin at grip, barrel points -Z) =====
const METAL = new THREE.MeshStandardMaterial({ color: 0x2b2f38, roughness: 0.45, metalness: 0.6 });
const DARK  = new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.5, metalness: 0.4 });
const WOOD  = new THREE.MeshStandardMaterial({ color: 0x6e4a2f, roughness: 0.8 });
const ACCENT_AR  = new THREE.MeshStandardMaterial({ color: 0xff9d00, roughness: 0.4, emissive: 0x331f00 });
const ACCENT_SNP = new THREE.MeshStandardMaterial({ color: 0x49b8ff, roughness: 0.4, emissive: 0x0a2233 });

function box(w, h, d, mat, x, y, z, rx = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.x = rx; m.rotation.z = rz;
  m.castShadow = true;
  return m;
}

function cyl(r, len, mat, x, y, z, alongZ = true) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat);
  if (alongZ) m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function markNoHit(group) {
  group.traverse(o => { o.userData.noHit = true; });
  return group;
}

function makeAR() {
  const g = new THREE.Group();
  g.add(box(0.09, 0.13, 0.62, METAL, 0, 0, -0.18));       // receiver
  g.add(cyl(0.026, 0.4, DARK, 0, 0.01, -0.66));            // barrel
  g.add(cyl(0.034, 0.06, ACCENT_AR, 0, 0.01, -0.85));      // muzzle tip
  g.add(box(0.07, 0.16, 0.22, DARK, 0, -0.1, 0.22, 0.15)); // stock
  g.add(box(0.06, 0.2, 0.09, DARK, 0, -0.15, -0.18, -0.25)); // mag
  g.add(box(0.05, 0.12, 0.07, DARK, 0, -0.12, 0.02, 0.1)); // grip
  g.add(box(0.04, 0.05, 0.16, ACCENT_AR, 0, 0.1, -0.2));   // sight rail
  g.add(box(0.08, 0.05, 0.3, METAL, 0, -0.04, -0.45));     // handguard
  return markNoHit(g);
}

function makeShotgun() {
  const g = new THREE.Group();
  g.add(box(0.1, 0.14, 0.5, METAL, 0, 0, -0.1));           // receiver
  g.add(cyl(0.04, 0.55, DARK, 0, 0.02, -0.6));             // barrel
  g.add(cyl(0.034, 0.45, METAL, 0, -0.06, -0.55));         // tube mag
  g.add(box(0.09, 0.09, 0.18, WOOD, 0, -0.06, -0.5));      // pump
  g.add(box(0.08, 0.17, 0.26, WOOD, 0, -0.08, 0.22, 0.18)); // stock
  g.add(box(0.05, 0.11, 0.07, WOOD, 0, -0.12, 0.0, 0.12)); // grip
  return markNoHit(g);
}

function makeSniper() {
  const g = new THREE.Group();
  g.add(box(0.09, 0.13, 0.6, METAL, 0, 0, -0.15));         // receiver
  g.add(cyl(0.026, 0.75, DARK, 0, 0.01, -0.78));           // long barrel
  g.add(box(0.05, 0.07, 0.12, DARK, 0, 0.0, -1.18));       // muzzle brake
  g.add(cyl(0.05, 0.26, ACCENT_SNP, 0, 0.13, -0.12));      // scope
  g.add(cyl(0.055, 0.03, DARK, 0, 0.13, -0.26));           // scope front
  g.add(box(0.07, 0.18, 0.26, METAL, 0, -0.09, 0.25, 0.15)); // stock
  g.add(box(0.06, 0.2, 0.09, DARK, 0, -0.15, -0.2, -0.2)); // mag
  g.add(box(0.05, 0.12, 0.07, DARK, 0, -0.12, 0.04, 0.1)); // grip
  return markNoHit(g);
}

function makePickaxe() {
  const g = new THREE.Group();
  g.add(cyl(0.035, 0.85, WOOD, 0, 0.1, -0.25, false));     // handle (vertical-ish)
  const headMat = new THREE.MeshStandardMaterial({ color: 0x8d99ab, roughness: 0.35, metalness: 0.7 });
  g.add(box(0.06, 0.1, 0.55, headMat, 0, 0.5, -0.25));     // head bar
  g.add(box(0.05, 0.16, 0.14, headMat, 0, 0.48, -0.56, 0.5));  // pick tip front
  g.add(box(0.05, 0.16, 0.14, headMat, 0, 0.48, 0.06, -0.5)); // pick tip back
  g.rotation.z = 0.0;
  return markNoHit(g);
}

export function makeWeaponModel(i) {
  return [makeAR, makeShotgun, makeSniper, makePickaxe][i]();
}
