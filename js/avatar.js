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
    const team     = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const teamDark = new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.55), roughness: 0.7 });
    const pants    = new THREE.MeshStandardMaterial({ color: 0x2e3440, roughness: 0.75 });
    const dark     = new THREE.MeshStandardMaterial({ color: 0x1d2128, roughness: 0.6 });
    const skin     = new THREE.MeshStandardMaterial({ color: 0xd9a886, roughness: 0.65 });
    const hair     = new THREE.MeshStandardMaterial({ color: 0x3a2c20, roughness: 0.9 });
    const white    = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 });
    const sole     = new THREE.MeshStandardMaterial({ color: 0x4a4f58, roughness: 0.8 });
    const metal    = new THREE.MeshStandardMaterial({ color: 0x9aa3b0, roughness: 0.35, metalness: 0.6 });

    const add = (parent, geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 6, 14);

    // ----- legs: hip joint -> thigh -> knee joint -> shin, knee pad, boot -----
    this.hipL = new THREE.Group(); this.hipL.position.set(-0.12, 0.96, 0);
    this.hipR = new THREE.Group(); this.hipR.position.set(0.12, 0.96, 0);
    this.kneeL = new THREE.Group(); this.kneeR = new THREE.Group();
    for (const [hip, knee] of [[this.hipL, this.kneeL], [this.hipR, this.kneeR]]) {
      add(hip, capsule(0.105, 0.28), pants, 0, -0.24, 0);
      add(hip, new THREE.BoxGeometry(0.06, 0.3, 0.215), teamDark, -0.06 * Math.sign(hip.position.x), -0.22, 0); // side stripe
      knee.position.set(0, -0.48, 0);
      add(knee, new THREE.SphereGeometry(0.08, 10, 8), dark, 0, -0.02, -0.05); // knee pad
      add(knee, capsule(0.085, 0.28), pants, 0, -0.22, 0);
      const boot = add(knee, new THREE.BoxGeometry(0.18, 0.13, 0.32), dark, 0, -0.41, -0.05);
      add(knee, new THREE.BoxGeometry(0.19, 0.05, 0.34), sole, 0, -0.5, -0.05);
      boot.castShadow = true;
      hip.add(knee);
      this.group.add(hip);
    }

    // ----- torso: jacket, collar, zipper, chest rig, belt, backpack -----
    this.torso = new THREE.Group();
    this.torso.position.y = 0.98;
    add(this.torso, new THREE.CylinderGeometry(0.24, 0.19, 0.56, 16), team, 0, 0.32, 0);
    add(this.torso, new THREE.CylinderGeometry(0.105, 0.125, 0.07, 12), teamDark, 0, 0.585, 0); // collar
    add(this.torso, new THREE.BoxGeometry(0.025, 0.46, 0.012), dark, 0, 0.33, -0.218);          // zipper
    add(this.torso, new THREE.CylinderGeometry(0.17, 0.15, 0.16, 12), pants, 0, 0.02, 0);       // pelvis
    add(this.torso, new THREE.SphereGeometry(0.09, 12, 10), team, -0.235, 0.55, 0);             // shoulders
    add(this.torso, new THREE.SphereGeometry(0.09, 12, 10), team, 0.235, 0.55, 0);
    const strap = add(this.torso, new THREE.BoxGeometry(0.06, 0.5, 0.015), dark, -0.07, 0.36, -0.215);
    strap.rotation.z = 0.35; // sling strap
    add(this.torso, new THREE.BoxGeometry(0.1, 0.11, 0.05), dark, -0.1, 0.2, -0.215);  // pouches
    add(this.torso, new THREE.BoxGeometry(0.1, 0.09, 0.05), dark, 0.1, 0.21, -0.21);
    add(this.torso, new THREE.CylinderGeometry(0.178, 0.158, 0.07, 14), dark, 0, 0.045, 0); // belt
    add(this.torso, new THREE.BoxGeometry(0.07, 0.05, 0.02), metal, 0, 0.045, -0.175);      // buckle
    add(this.torso, new THREE.BoxGeometry(0.3, 0.36, 0.15), teamDark, 0, 0.32, 0.245);      // backpack
    add(this.torso, new THREE.BoxGeometry(0.31, 0.08, 0.16), dark, 0, 0.45, 0.245);         // pack flap
    this.group.add(this.torso);

    // ----- head: face with eyes/brows/mouth, hair, headphones -----
    this.head = new THREE.Group();
    this.head.position.y = 1.6;
    add(this.head, new THREE.CylinderGeometry(0.06, 0.07, 0.1, 10), skin, 0, 0.0, 0);
    const skull = add(this.head, new THREE.SphereGeometry(0.155, 18, 14), skin, 0, 0.16, 0);
    skull.scale.set(1, 1.08, 1.02);
    skull.name = 'head';
    const hairCap = add(this.head, new THREE.SphereGeometry(0.163, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), hair, 0, 0.165, 0.012);
    hairCap.rotation.x = -0.18; // fringe forward
    hairCap.name = 'head';
    const hairBack = add(this.head, new THREE.SphereGeometry(0.15, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, 0, 0.13, 0.045);
    hairBack.rotation.x = Math.PI * 0.55;
    hairBack.name = 'head';
    for (const s of [-1, 1]) {
      add(this.head, new THREE.SphereGeometry(0.031, 8, 8), white, s * 0.062, 0.175, -0.132);  // eye
      add(this.head, new THREE.SphereGeometry(0.0145, 6, 6), dark, s * 0.062, 0.175, -0.156);  // pupil
      const brow = add(this.head, new THREE.BoxGeometry(0.052, 0.013, 0.012), hair, s * 0.062, 0.222, -0.143);
      brow.rotation.z = s * -0.12;
      const cup = add(this.head, new THREE.CylinderGeometry(0.047, 0.047, 0.035, 10), teamDark, s * 0.158, 0.165, 0); // headphone cup
      cup.rotation.z = Math.PI / 2;
    }
    add(this.head, new THREE.TorusGeometry(0.158, 0.018, 6, 14, Math.PI), teamDark, 0, 0.17, 0); // headphone band (XY arc over the top)
    add(this.head, new THREE.BoxGeometry(0.055, 0.014, 0.012),
      new THREE.MeshStandardMaterial({ color: 0xb07a5e, roughness: 0.7 }), 0, 0.09, -0.148); // mouth
    add(this.head, new THREE.BoxGeometry(0.03, 0.045, 0.03), skin, 0, 0.145, -0.155); // nose
    this.group.add(this.head);

    // ----- arms: shoulder joint -> upper arm -> elbow joint -> forearm, glove -----
    this.shL = new THREE.Group(); this.shL.position.set(-0.24, 1.5, 0);
    this.shR = new THREE.Group(); this.shR.position.set(0.24, 1.5, 0);
    this.elbL = new THREE.Group(); this.elbR = new THREE.Group();
    for (const [sh, elb] of [[this.shL, this.elbL], [this.shR, this.elbR]]) {
      add(sh, capsule(0.075, 0.18), team, 0, -0.15, 0);
      elb.position.set(0, -0.29, 0);
      add(elb, capsule(0.063, 0.18), skin, 0, -0.14, 0);
      add(elb, new THREE.CylinderGeometry(0.066, 0.06, 0.05, 10), dark, 0, -0.235, 0); // wrist band
      add(elb, new THREE.SphereGeometry(0.07, 10, 8), dark, 0, -0.29, 0);              // glove
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
