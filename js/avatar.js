import * as THREE from 'three';
import { makeWeaponModel } from './weapons.js';

// Human-proportioned rig (~1.85 units tall, feet at group origin).
// Jointed limbs: hips/knees and shoulders/elbows bend naturally while
// running, jumping, aiming, building, and swinging the pickaxe.
export class Avatar {
  constructor(color) {
    this.group = new THREE.Group();
    this.walkT = 0;
    this.swingT = 0;

    const c = new THREE.Color(color);
    const team     = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1 });
    const teamDark = new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.5), roughness: 0.65 });
    const teamLite = new THREE.MeshStandardMaterial({ color: c.clone().lerp(new THREE.Color(0xffffff), 0.25), roughness: 0.5 });
    const armor    = new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.8), roughness: 0.35, metalness: 0.5 });
    const pants    = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.8 });
    const dark     = new THREE.MeshStandardMaterial({ color: 0x191c22, roughness: 0.6 });
    const rubber   = new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 0.9 });
    const skin     = new THREE.MeshStandardMaterial({ color: 0xd9a886, roughness: 0.7 });
    const hair     = new THREE.MeshStandardMaterial({ color: 0x39291d, roughness: 0.95 });
    const white    = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.35 });
    const iris     = new THREE.MeshStandardMaterial({ color: 0x4a6a8a, roughness: 0.4 });
    const sole     = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.85 });
    const metal    = new THREE.MeshStandardMaterial({ color: 0xaab2bd, roughness: 0.3, metalness: 0.7 });
    const visorM   = new THREE.MeshStandardMaterial({ color: 0x0e1218, roughness: 0.15, metalness: 0.5 });

    const add = (parent, geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    const capsule = (r, len, seg = 5) => new THREE.CapsuleGeometry(r, len, seg, 12);
    const rbox = (w, h, d, r = 0.02) => new THREE.BoxGeometry(w, h, d); // (rounded look comes from bevel meshes)

    // ----- legs: hip -> thigh + armor -> knee -> shin guard + detailed boot -----
    this.hipL = new THREE.Group(); this.hipL.position.set(-0.12, 0.96, 0);
    this.hipR = new THREE.Group(); this.hipR.position.set(0.12, 0.96, 0);
    this.kneeL = new THREE.Group(); this.kneeR = new THREE.Group();
    for (const [hip, knee] of [[this.hipL, this.kneeL], [this.hipR, this.kneeR]]) {
      const side = Math.sign(hip.position.x) || 1;
      add(hip, capsule(0.11, 0.3), pants, 0, -0.24, 0);                                  // thigh
      add(hip, rbox(0.13, 0.22, 0.1), armor, 0, -0.18, -0.07);                           // thigh plate
      add(hip, rbox(0.05, 0.16, 0.13), teamDark, side * 0.085, -0.2, 0);                 // side cargo pocket
      knee.position.set(0, -0.48, 0);
      add(knee, capsule(0.09, 0.3), pants, 0, -0.22, 0);                                  // shin
      const kp = add(knee, new THREE.SphereGeometry(0.085, 10, 8), armor, 0, -0.02, -0.06); // knee pad
      kp.scale.set(1, 1.1, 0.8);
      add(knee, rbox(0.11, 0.18, 0.04), dark, 0, -0.2, -0.085);                          // shin guard
      // boot: ankle cuff, foot, toe cap, heel, sole
      add(knee, new THREE.CylinderGeometry(0.085, 0.075, 0.1, 10), dark, 0, -0.37, 0);    // ankle
      add(knee, rbox(0.15, 0.12, 0.26), dark, 0, -0.45, -0.04);                           // foot
      add(knee, rbox(0.16, 0.08, 0.1), rubber, 0, -0.47, -0.18);                          // toe cap
      add(knee, rbox(0.16, 0.05, 0.32), sole, 0, -0.51, -0.04);                           // sole
      add(knee, rbox(0.15, 0.06, 0.06), sole, 0, -0.49, 0.11);                            // heel
      hip.add(knee);
      this.group.add(hip);
    }

    // ----- torso: layered jacket, chest armor, pauldrons, rig, belt, backpack -----
    this.torso = new THREE.Group();
    this.torso.position.y = 0.98;
    add(this.torso, new THREE.CylinderGeometry(0.245, 0.2, 0.56, 18), team, 0, 0.32, 0);  // jacket
    const chest = add(this.torso, rbox(0.4, 0.34, 0.14), armor, 0, 0.4, -0.14);            // chest armor plate
    chest.scale.set(1, 1, 1);
    add(this.torso, rbox(0.34, 0.12, 0.12), armor, 0, 0.18, -0.16);                        // ab plate
    add(this.torso, rbox(0.3, 0.1, 0.11), teamDark, 0, 0.06, -0.16);                       // lower plate
    add(this.torso, new THREE.CylinderGeometry(0.11, 0.135, 0.09, 14), teamDark, 0, 0.59, 0); // collar
    add(this.torso, new THREE.CylinderGeometry(0.175, 0.155, 0.18, 14), pants, 0, 0.02, 0);   // pelvis
    // pauldrons (rounded shoulder armor)
    for (const s of [-1, 1]) {
      const p = add(this.torso, new THREE.SphereGeometry(0.115, 12, 10), armor, s * 0.245, 0.55, 0);
      p.scale.set(1.1, 0.8, 1.1);
    }
    // chest rig straps (X) + pouches
    for (const s of [-1, 1]) {
      const st = add(this.torso, rbox(0.05, 0.55, 0.02), dark, s * 0.08, 0.36, -0.21);
      st.rotation.z = s * 0.32;
    }
    add(this.torso, rbox(0.11, 0.12, 0.06), dark, -0.11, 0.2, -0.215);                     // pouch L
    add(this.torso, rbox(0.11, 0.1, 0.06), dark, 0.11, 0.22, -0.21);                       // pouch R
    add(this.torso, rbox(0.08, 0.1, 0.05), teamDark, 0, 0.42, -0.225);                     // chest badge
    // belt + buckle + holster
    add(this.torso, new THREE.CylinderGeometry(0.18, 0.16, 0.08, 16), dark, 0, 0.04, 0);
    add(this.torso, rbox(0.08, 0.06, 0.03), metal, 0, 0.04, -0.18);                        // buckle
    add(this.torso, rbox(0.09, 0.16, 0.07), rubber, 0.17, -0.02, 0.02);                    // hip holster
    // backpack with pockets, straps, top handle
    add(this.torso, rbox(0.32, 0.4, 0.17), teamDark, 0, 0.34, 0.25);
    add(this.torso, rbox(0.34, 0.1, 0.18), dark, 0, 0.48, 0.25);                           // top lid
    add(this.torso, rbox(0.12, 0.14, 0.06), dark, 0, 0.28, 0.345);                         // front pocket
    add(this.torso, new THREE.TorusGeometry(0.04, 0.012, 6, 10), metal, 0, 0.55, 0.25);    // handle
    this.group.add(this.torso);

    // ----- head: skull, hair, ears, eyes, brows, nose, mouth, headset -----
    this.head = new THREE.Group();
    this.head.position.y = 1.6;
    add(this.head, new THREE.CylinderGeometry(0.062, 0.08, 0.11, 12), skin, 0, 0.01, 0);   // neck
    const skull = add(this.head, new THREE.SphereGeometry(0.155, 20, 16), skin, 0, 0.16, 0);
    skull.scale.set(0.97, 1.1, 1.02);
    skull.name = 'head';
    const jaw = add(this.head, rbox(0.2, 0.12, 0.2), skin, 0, 0.085, 0.01);                // jaw
    jaw.name = 'head';
    const hairCap = add(this.head, new THREE.SphereGeometry(0.165, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), hair, 0, 0.165, 0.008);
    hairCap.rotation.x = -0.16; hairCap.name = 'head';
    const hairBack = add(this.head, new THREE.SphereGeometry(0.152, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 0.14, 0.05);
    hairBack.rotation.x = Math.PI * 0.5; hairBack.name = 'head';
    for (const s of [-1, 1]) {
      add(this.head, new THREE.SphereGeometry(0.034, 10, 8), white, s * 0.06, 0.175, -0.13);  // eye white
      add(this.head, new THREE.SphereGeometry(0.018, 8, 8), iris, s * 0.066, 0.175, -0.152);  // iris
      add(this.head, new THREE.SphereGeometry(0.009, 6, 6), dark, s * 0.068, 0.175, -0.162);  // pupil
      const brow = add(this.head, rbox(0.056, 0.014, 0.014), hair, s * 0.062, 0.223, -0.142);
      brow.rotation.z = s * -0.1;
      add(this.head, new THREE.SphereGeometry(0.028, 8, 8), skin, s * 0.16, 0.15, 0.0);        // ear
      // headset: cup + pad
      const cup = add(this.head, new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12), teamDark, s * 0.165, 0.16, 0);
      cup.rotation.z = Math.PI / 2;
      add(this.head, new THREE.CylinderGeometry(0.03, 0.03, 0.045, 8), dark, s * 0.18, 0.16, 0).rotation.z = Math.PI / 2;
    }
    add(this.head, new THREE.TorusGeometry(0.162, 0.02, 6, 16, Math.PI), teamDark, 0, 0.18, 0); // headset band
    // mic boom from the left cup
    const mic = add(this.head, rbox(0.012, 0.012, 0.13), dark, -0.13, 0.13, -0.06);
    mic.rotation.x = 0.5;
    add(this.head, new THREE.SphereGeometry(0.016, 6, 6), dark, -0.115, 0.11, -0.13);
    add(this.head, rbox(0.07, 0.018, 0.016),
      new THREE.MeshStandardMaterial({ color: 0xb07a5e, roughness: 0.7 }), 0, 0.092, -0.146);  // mouth
    const nose = add(this.head, rbox(0.034, 0.05, 0.04), skin, 0, 0.142, -0.155); nose.name = 'head'; // nose
    this.group.add(this.head);

    // ----- arms: pauldron cap -> upper arm -> elbow pad -> forearm guard -> glove -----
    this.shL = new THREE.Group(); this.shL.position.set(-0.245, 1.5, 0);
    this.shR = new THREE.Group(); this.shR.position.set(0.245, 1.5, 0);
    this.elbL = new THREE.Group(); this.elbR = new THREE.Group();
    for (const [sh, elb] of [[this.shL, this.elbL], [this.shR, this.elbR]]) {
      add(sh, capsule(0.078, 0.2), team, 0, -0.15, 0);                                     // upper arm
      add(sh, rbox(0.1, 0.1, 0.13), armor, 0, -0.05, 0);                                   // shoulder cap
      elb.position.set(0, -0.3, 0);
      add(elb, capsule(0.066, 0.2), team, 0, -0.14, 0);                                    // forearm sleeve
      add(elb, new THREE.SphereGeometry(0.07, 10, 8), armor, 0, 0.0, 0).scale.set(1, 0.8, 1); // elbow pad
      add(elb, rbox(0.1, 0.16, 0.09), dark, 0, -0.13, 0);                                  // forearm guard
      add(elb, new THREE.CylinderGeometry(0.068, 0.062, 0.05, 10), rubber, 0, -0.245, 0);  // wrist cuff
      add(elb, new THREE.SphereGeometry(0.072, 10, 8), rubber, 0, -0.3, 0);                // glove
      add(elb, rbox(0.08, 0.04, 0.06), dark, 0, -0.3, -0.04);                              // knuckle plate
      sh.add(elb);
      this.group.add(sh);
    }

    // ----- held item mount -----
    this.mount = new THREE.Group();
    this.mount.position.set(0.26, 1.42, -0.12);
    this.muzzle = new THREE.Object3D(); // world-space gun tip for flash/tracers
    this.muzzle.position.set(0, 0.02, -1.1);
    this.mount.add(this.muzzle);
    this.weapons = [0, 1, 2, 3].map(i => {
      const w = makeWeaponModel(i);
      w.position.z = -0.25;
      w.visible = false;
      this.mount.add(w);
      return w;
    });
    this.group.add(this.mount);

    // ----- glider (shown while skydiving) -----
    this.glider = new THREE.Group();
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(1.05, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.42),
      new THREE.MeshStandardMaterial({ color, roughness: 0.7, side: THREE.DoubleSide }));
    canopy.scale.y = 0.55;
    canopy.position.y = 2.9;
    this.glider.add(canopy);
    for (const [sx, sz] of [[-0.7, 0], [0.7, 0], [0, -0.6], [0, 0.6]]) {
      const strut = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 1.1, 4),
        new THREE.MeshStandardMaterial({ color: 0x2a2e36 }));
      strut.position.set(sx * 0.8, 2.35, sz * 0.8);
      strut.rotation.z = -sx * 0.55;
      strut.rotation.x = sz * 0.55;
      this.glider.add(strut);
    }
    this.glider.visible = false;
    this.glider.traverse(o => { o.userData.noHit = true; });
    this.group.add(this.glider);

    this.item = 0;
    this.weapons[0].visible = true;
  }

  swing() { this.swingT = 0.35; }

  update(dt, { speed = 0, grounded = true, pitch = 0, item = 0, recoilZ = 0, gliding = false, reloading = false } = {}) {
    if (item !== this.item) {
      this.weapons.forEach((w, i) => { w.visible = i === item; });
      this.item = item;
    }
    this.glider.visible = gliding;
    this.reloadAnim = reloading ? (this.reloadAnim || 0) + dt : 0;

    const k = Math.min(1, dt * 12);
    const amp = Math.min(1, speed / 6.8) * 0.6;

    // legs
    if (gliding) {
      // legs trail behind while skydiving
      this.hipL.rotation.x += (0.35 - this.hipL.rotation.x) * k;
      this.hipR.rotation.x += (0.5 - this.hipR.rotation.x) * k;
      this.kneeL.rotation.x += (0.5 - this.kneeL.rotation.x) * k;
      this.kneeR.rotation.x += (0.4 - this.kneeR.rotation.x) * k;
    } else if (grounded && amp > 0.05) {
      this.walkT += dt * speed * 1.7;
      const s = Math.sin(this.walkT);
      this.hipL.rotation.x = s * amp;
      this.hipR.rotation.x = -s * amp;
      // knee bends as the leg swings back/recovers
      this.kneeL.rotation.x = Math.max(0, -Math.sin(this.walkT - 0.6)) * amp * 1.1;
      this.kneeR.rotation.x = Math.max(0, Math.sin(this.walkT - 0.6)) * amp * 1.1;
    } else if (!grounded) {
      this.hipL.rotation.x += (-0.25 - this.hipL.rotation.x) * k;
      this.hipR.rotation.x += (0.45 - this.hipR.rotation.x) * k;
      this.kneeL.rotation.x += (0.85 - this.kneeL.rotation.x) * k;
      this.kneeR.rotation.x += (0.6 - this.kneeR.rotation.x) * k;
    } else {
      for (const j of [this.hipL, this.hipR, this.kneeL, this.kneeR]) j.rotation.x *= 1 - k;
    }

    // subtle run lean
    this.torso.rotation.x = grounded ? amp * 0.12 : 0.08;

    // pickaxe swing arc
    if (this.swingT > 0) this.swingT = Math.max(0, this.swingT - dt);
    const chop = this.swingT > 0 ? Math.sin((1 - this.swingT / 0.35) * Math.PI) * 1.25 : 0;

    // arms
    if (gliding) {
      // arms up gripping the glider
      this.shL.rotation.x += (Math.PI * 0.82 - this.shL.rotation.x) * k;
      this.shR.rotation.x += (Math.PI * 0.82 - this.shR.rotation.x) * k;
      this.elbL.rotation.x = this.elbR.rotation.x = -0.3;
      this.shL.rotation.z = 0.35; this.shR.rotation.z = -0.35;
    } else if (item === 4) {
      // building pose
      this.shR.rotation.x += (Math.PI / 4 + pitch * 0.5 - this.shR.rotation.x) * k * 1.2;
      this.shL.rotation.x += (Math.PI / 4 + pitch * 0.5 - this.shL.rotation.x) * k * 1.2;
      this.elbL.rotation.x = this.elbR.rotation.x = -0.55;
      this.shL.rotation.z = 0.06; this.shR.rotation.z = -0.06;
    } else if (item === 3) {
      // pickaxe chop
      this.shR.rotation.x = Math.PI / 2 + pitch - chop;
      this.elbR.rotation.x = -0.35;
      this.shL.rotation.x = grounded ? Math.sin(this.walkT) * amp * 0.7 : 0.25;
      this.elbL.rotation.x = -0.2;
      this.shL.rotation.z = 0.06; this.shR.rotation.z = -0.06;
    } else {
      // two-handed gun grip: right arm forward, left reaches across
      this.shR.rotation.x = Math.PI / 2 * 0.88 + pitch;
      this.elbR.rotation.x = -0.35;
      this.shL.rotation.x = Math.PI / 2 * 0.8 + pitch;
      this.elbL.rotation.x = -0.55;
      this.shL.rotation.z = 0.7; this.shR.rotation.z = -0.1;
    }

    this.mount.rotation.x = pitch - chop;
    this.mount.rotation.z = 0;
    // subtle weapon bob while running
    this.mount.position.y = 1.42 + (grounded ? Math.sin(this.walkT * 2) * 0.014 * amp : 0);
    this.mount.position.z = -0.12 + recoilZ;
    this.head.rotation.x = pitch * 0.45;

    // reload: gun tilts while the left hand drops to swap the mag
    if (reloading && item <= 2 && !gliding) {
      const dip = Math.sin(((this.reloadAnim % 1.4) / 1.4) * Math.PI); // 0 -> 1 -> 0 loop
      this.mount.rotation.x = pitch - 0.35 * dip;
      this.mount.rotation.z = 0.45 * dip;
      this.mount.position.y = 1.42 - 0.08 * dip;
      this.shL.rotation.x = Math.PI / 2 * 0.8 + pitch - 1.15 * dip;
      this.elbL.rotation.x = -0.55 - 0.5 * dip;
      this.shL.rotation.z = 0.7 - 0.45 * dip;
    }
  }
}

// Floating name label sprite
export function makeNameLabel(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 48;
  const c = canvas.getContext('2d');
  c.font = '900 30px Segoe UI, Arial';
  c.textAlign = 'center';
  c.lineWidth = 6;
  c.strokeStyle = 'rgba(8,12,22,0.9)';
  c.strokeText(name, 128, 34);
  c.fillStyle = '#fff';
  c.fillText(name, 128, 34);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(2.2, 0.41, 1);
  sprite.position.y = 2.75;
  sprite.raycast = () => {};
  return sprite;
}
