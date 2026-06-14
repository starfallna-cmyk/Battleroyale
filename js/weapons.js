import * as THREE from 'three';

// falloff: [fullDmgRange, maxRange, minMultiplier]
// Balance: AR is the workhorse (22 dmg, gentle falloff); sniper no longer
// one-shots the body (80) — only headshots (152) — and cycles slowly.
export const WEAPONS = [
  { name: 'Assault Rifle', dmg: 22, head: 1.6, rate: 0.115, mag: 30, reload: 1.6,
    auto: true, spread: 0.009, bloom: 0.008, kick: 0.006, pellets: 1, range: 250,
    zoom: 50, adsSpread: 0.28, reddot: true, falloff: [35, 120, 0.65], buildDmg: 22, sound: 'shoot', tracer: 0xffe082 },
  { name: 'Shotgun', dmg: 10, head: 1.4, rate: 0.8, mag: 6, reload: 2.1,
    auto: false, spread: 0.042, bloom: 0, kick: 0.035, pellets: 8, range: 45,
    zoom: 66, adsSpread: 0.7, falloff: [9, 30, 0.3], buildDmg: 10, sound: 'shotgun', tracer: 0xffab66 },
  { name: 'Sniper', dmg: 80, head: 1.9, rate: 1.8, mag: 1, reload: 2.4,
    auto: false, spread: 0.0008, bloom: 0, kick: 0.06, pellets: 1, range: 500,
    zoom: 20, adsSpread: 0.05, falloff: null, buildDmg: 60, sound: 'sniper', tracer: 0x9be8ff, scope: true },
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

// ===== detailed low-poly weapon models (origin at grip, barrel points -Z) =====
const GUNMETAL = new THREE.MeshStandardMaterial({ color: 0x3a4049, roughness: 0.32, metalness: 0.85 });
const POLYMER  = new THREE.MeshStandardMaterial({ color: 0x1c1f25, roughness: 0.6, metalness: 0.2 });
const DARK     = new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 0.5, metalness: 0.4 });
const WOOD     = new THREE.MeshStandardMaterial({ color: 0x6e4a2f, roughness: 0.75 });
const BRASS    = new THREE.MeshStandardMaterial({ color: 0xc9a14e, roughness: 0.3, metalness: 0.9 });
const SHELLRED = new THREE.MeshStandardMaterial({ color: 0xb33a3a, roughness: 0.5 });
const ACCENT_AR  = new THREE.MeshStandardMaterial({ color: 0xff9d00, roughness: 0.4, emissive: 0x331f00 });
const LENS = new THREE.MeshStandardMaterial({ color: 0x9fdcff, roughness: 0.05, metalness: 0.6, emissive: 0x14313f });

function box(w, h, d, mat, x, y, z, rx = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.x = rx; m.rotation.z = rz;
  m.castShadow = true;
  return m;
}

function cyl(r, len, mat, x, y, z, alongZ = true, r2 = null) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r2 ?? r, r, len, 12), mat);
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
  g.add(box(0.085, 0.12, 0.6, GUNMETAL, 0, 0, -0.18));        // receiver
  g.add(box(0.05, 0.022, 0.55, DARK, 0, 0.075, -0.22));        // top rail
  g.add(box(0.012, 0.05, 0.012, DARK, 0, 0.11, -0.72));        // front sight post
  // red-dot optic mounted on the rail
  g.add(box(0.07, 0.05, 0.09, DARK, 0, 0.115, -0.12));         // sight housing base
  g.add(box(0.075, 0.02, 0.095, GUNMETAL, 0, 0.15, -0.12));    // hood top
  g.add(cyl(0.032, 0.012, LENS, 0, 0.125, -0.08));             // glass lens (faces shooter)
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff1a1a, emissiveIntensity: 2.2 }))).position.set(0, 0.125, -0.082); // red dot
  g.add(cyl(0.024, 0.42, GUNMETAL, 0, 0.01, -0.68));           // barrel
  g.add(box(0.05, 0.05, 0.1, DARK, 0, 0.01, -0.9));            // muzzle brake
  g.add(cyl(0.03, 0.025, ACCENT_AR, 0, 0.01, -0.955));         // tip accent
  g.add(box(0.075, 0.085, 0.34, POLYMER, 0, -0.012, -0.5));    // handguard
  g.add(box(0.042, 0.11, 0.05, POLYMER, 0, -0.095, -0.56, 0.35)); // angled foregrip
  g.add(box(0.07, 0.12, 0.26, POLYMER, 0, -0.015, 0.23));      // stock
  g.add(box(0.075, 0.15, 0.035, DARK, 0, -0.02, 0.37));        // butt pad
  g.add(box(0.05, 0.03, 0.13, DARK, 0, 0.07, 0.24));           // cheek riser
  g.add(box(0.055, 0.1, 0.045, POLYMER, 0, -0.115, 0.0, 0.25)); // pistol grip
  g.add(box(0.05, 0.018, 0.085, DARK, 0, -0.068, -0.075));     // trigger guard
  g.add(box(0.05, 0.095, 0.075, GUNMETAL, 0, -0.135, -0.165, -0.18)); // mag upper
  g.add(box(0.05, 0.085, 0.07, GUNMETAL, 0, -0.2, -0.135, -0.42));   // mag lower (curve)
  g.add(box(0.01, 0.035, 0.1, BRASS, 0.048, 0.015, -0.1));     // ejection port
  return markNoHit(g);
}

function makeShotgun() {
  const g = new THREE.Group();
  g.add(box(0.095, 0.13, 0.44, GUNMETAL, 0, 0, -0.08));        // receiver
  g.add(cyl(0.034, 0.52, GUNMETAL, 0, 0.025, -0.56));          // barrel
  for (const dz of [-0.42, -0.56, -0.7]) {
    g.add(box(0.075, 0.02, 0.05, DARK, 0, 0.065, dz));         // heat shield ribs
  }
  g.add(cyl(0.028, 0.48, DARK, 0, -0.045, -0.52));             // tube mag
  g.add(box(0.085, 0.08, 0.17, WOOD, 0, -0.05, -0.48));        // pump
  g.add(box(0.09, 0.012, 0.17, DARK, 0, -0.092, -0.48));       // pump rail
  g.add(cyl(0.012, 0.012, BRASS, 0, 0.062, -0.815));           // bead sight
  g.add(box(0.08, 0.16, 0.27, WOOD, 0, -0.075, 0.22, 0.18));   // stock
  g.add(box(0.085, 0.17, 0.03, DARK, 0, -0.09, 0.36, 0.18));   // recoil pad
  g.add(box(0.05, 0.1, 0.06, WOOD, 0, -0.11, 0.0, 0.12));      // grip
  for (let i = 0; i < 3; i++) {
    const sh = cyl(0.02, 0.055, SHELLRED, -0.058, 0.045 - i * 0.0, -0.02 - i * 0.07);
    g.add(sh);
    g.add(cyl(0.021, 0.012, BRASS, -0.058, 0.045, 0.012 - i * 0.07)); // shell brass base
  }
  return markNoHit(g);
}

function makeSniper() {
  const g = new THREE.Group();
  g.add(box(0.08, 0.115, 0.55, GUNMETAL, 0, 0, -0.14));        // receiver
  g.add(cyl(0.023, 0.82, GUNMETAL, 0, 0.012, -0.8, true, 0.019)); // tapered barrel
  g.add(box(0.05, 0.06, 0.11, DARK, 0, 0.01, -1.22));          // muzzle brake
  g.add(box(0.012, 0.05, 0.06, DARK, -0.04, 0.01, -1.2));      // brake fins
  g.add(box(0.012, 0.05, 0.06, DARK, 0.04, 0.01, -1.2));
  g.add(cyl(0.042, 0.3, POLYMER, 0, 0.135, -0.1));             // scope tube
  g.add(cyl(0.055, 0.07, POLYMER, 0, 0.135, -0.27));           // objective bell
  g.add(cyl(0.05, 0.012, LENS, 0, 0.135, -0.305));             // front lens
  g.add(cyl(0.046, 0.05, POLYMER, 0, 0.135, 0.06));            // ocular
  g.add(cyl(0.018, 0.03, DARK, 0, 0.19, -0.1, false));         // elevation turret
  g.add(cyl(0.018, 0.03, DARK, 0.055, 0.135, -0.1));           // windage turret
  g.add(box(0.03, 0.04, 0.03, DARK, 0, 0.085, -0.02));         // scope mounts
  g.add(box(0.03, 0.04, 0.03, DARK, 0, 0.085, -0.2));
  const bolt = cyl(0.011, 0.085, GUNMETAL, 0.075, 0.04, 0.02, false);
  bolt.rotation.z = -0.9;
  g.add(bolt);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), GUNMETAL);
  knob.position.set(0.105, 0.012, 0.02);
  g.add(knob);
  g.add(box(0.07, 0.16, 0.3, POLYMER, 0, -0.085, 0.26, 0.14)); // stock
  g.add(box(0.05, 0.035, 0.14, DARK, 0, 0.005, 0.27));         // cheek pad
  g.add(box(0.075, 0.16, 0.03, DARK, 0, -0.1, 0.41, 0.14));    // butt pad
  g.add(box(0.05, 0.1, 0.05, POLYMER, 0, -0.11, 0.05, 0.2));   // grip
  g.add(box(0.055, 0.14, 0.085, GUNMETAL, 0, -0.13, -0.18, -0.15)); // mag
  // folded bipod
  g.add(box(0.014, 0.014, 0.22, DARK, -0.025, -0.045, -0.62));
  g.add(box(0.014, 0.014, 0.22, DARK, 0.025, -0.045, -0.62));
  return markNoHit(g);
}

function makePickaxe() {
  const g = new THREE.Group();
  g.add(cyl(0.035, 0.85, WOOD, 0, 0.1, -0.25, false));         // handle
  for (const dy of [-0.18, -0.24, -0.3]) {
    g.add(cyl(0.038, 0.025, DARK, 0, 0.1 + dy, -0.25, false)); // grip wraps
  }
  const headMat = new THREE.MeshStandardMaterial({ color: 0x8d99ab, roughness: 0.3, metalness: 0.8 });
  g.add(box(0.055, 0.09, 0.55, headMat, 0, 0.5, -0.25));       // head bar
  g.add(box(0.045, 0.16, 0.14, headMat, 0, 0.48, -0.56, 0.5)); // pick tip front
  g.add(box(0.045, 0.16, 0.14, headMat, 0, 0.48, 0.06, -0.5)); // pick tip back
  g.add(cyl(0.042, 0.06, DARK, 0, 0.545, -0.25, false));       // head collar
  return markNoHit(g);
}

export function makeWeaponModel(i) {
  return [makeAR, makeShotgun, makeSniper, makePickaxe][i]();
}
