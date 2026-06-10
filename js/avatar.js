import * as THREE from 'three';
import { makeWeaponModel } from './weapons.js';

// Blocky humanoid rig (~1.9 units tall, feet at group origin).
// Animates walking, jumping, aiming, building, and pickaxe swings.
export class Avatar {
  constructor(color) {
    this.group = new THREE.Group();
    this.walkT = 0;
    this.swingT = 0;

    const primary = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
    const dark = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.55), roughness: 0.65,
    });
    const joint = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.6 });

    const mesh = (w, h, d, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.castShadow = true;
      return m;
    };

    // legs — pivot at hip, geometry hangs down
    this.legL = new THREE.Group(); this.legL.position.set(-0.14, 0.95, 0);
    this.legR = new THREE.Group(); this.legR.position.set(0.14, 0.95, 0);
    for (const leg of [this.legL, this.legR]) {
      const thigh = mesh(0.2, 0.95, 0.24, dark);
      thigh.position.y = -0.475;
      const boot = mesh(0.22, 0.14, 0.32, joint);
      boot.position.set(0, -0.88, -0.04);
      leg.add(thigh, boot);
      this.group.add(leg);
    }

    // torso
    const torso = mesh(0.56, 0.62, 0.32, primary);
    torso.position.y = 1.26;
    const chest = mesh(0.44, 0.3, 0.1, joint);
    chest.position.set(0, 1.3, -0.17);
    const belt = mesh(0.5, 0.1, 0.3, joint);
    belt.position.y = 0.98;
    this.group.add(torso, chest, belt);

    // head — pivot at neck
    this.head = new THREE.Group();
    this.head.position.y = 1.6;
    const skull = mesh(0.34, 0.32, 0.34, primary);
    skull.position.y = 0.17;
    skull.name = 'head';
    const visor = mesh(0.26, 0.11, 0.06, new THREE.MeshStandardMaterial({
      color: 0x0e1118, roughness: 0.15, metalness: 0.4,
    }));
    visor.position.set(0, 0.2, -0.16);
    visor.name = 'head';
    this.head.add(skull, visor);
    this.group.add(this.head);

    // arms — pivot at shoulder
    this.armL = new THREE.Group(); this.armL.position.set(-0.36, 1.46, 0);
    this.armR = new THREE.Group(); this.armR.position.set(0.36, 1.46, 0);
    for (const arm of [this.armL, this.armR]) {
      const a = mesh(0.15, 0.62, 0.17, primary);
      a.position.y = -0.31;
      const hand = mesh(0.13, 0.12, 0.15, joint);
      hand.position.y = -0.6;
      arm.add(a, hand);
      this.group.add(arm);
    }

    // held item mount — pitches with aim
    this.mount = new THREE.Group();
    this.mount.position.set(0.3, 1.4, -0.1);
    this.weapons = [0, 1, 2, 3].map(i => {
      const w = makeWeaponModel(i);
      w.position.z = -0.25;
      w.visible = false;
      this.mount.add(w);
      return w;
    });
    this.group.add(this.mount);

    this.item = 0;
    this.weapons[0].visible = true;
  }

  swing() { this.swingT = 0.35; }

  update(dt, { speed = 0, grounded = true, pitch = 0, item = 0, recoilZ = 0 } = {}) {
    // held item visibility (0-3 weapons, 4 = building, nothing shown)
    if (item !== this.item) {
      this.weapons.forEach((w, i) => { w.visible = i === item; });
      this.item = item;
    }

    // walk cycle
    const amp = Math.min(1, speed / 6.8) * 0.65;
    if (grounded && amp > 0.05) {
      this.walkT += dt * speed * 1.7;
      this.legL.rotation.x = Math.sin(this.walkT) * amp;
      this.legR.rotation.x = -Math.sin(this.walkT) * amp;
    } else if (!grounded) {
      this.legL.rotation.x += (0.55 - this.legL.rotation.x) * dt * 10;
      this.legR.rotation.x += (-0.35 - this.legR.rotation.x) * dt * 10;
    } else {
      this.legL.rotation.x *= 1 - Math.min(1, dt * 12);
      this.legR.rotation.x *= 1 - Math.min(1, dt * 12);
    }

    // pickaxe swing offset (chop arc)
    if (this.swingT > 0) this.swingT = Math.max(0, this.swingT - dt);
    const chop = this.swingT > 0 ? Math.sin((1 - this.swingT / 0.35) * Math.PI) * 1.25 : 0;

    // arms + mount
    if (item === 4) {
      // building pose: both hands half-raised, nothing held
      this.armR.rotation.x += (Math.PI / 4 + pitch * 0.5 - this.armR.rotation.x) * dt * 14;
      this.armL.rotation.x += (Math.PI / 4 + pitch * 0.5 - this.armL.rotation.x) * dt * 14;
      this.armL.rotation.z = 0;
    } else if (item === 3) {
      // pickaxe: right arm chops, left swings with walk
      this.armR.rotation.x = Math.PI / 2 + pitch - chop;
      this.armL.rotation.x = grounded ? Math.sin(this.walkT) * amp * 0.8 : 0.3;
      this.armL.rotation.z = 0;
    } else {
      // two-handed gun aim
      this.armR.rotation.x = Math.PI / 2 + pitch;
      this.armL.rotation.x = Math.PI / 2 + pitch - 0.12;
      this.armL.rotation.z = -0.45;
    }

    this.mount.rotation.x = pitch - chop;
    this.mount.position.z = -0.1 + recoilZ;
    this.head.rotation.x = pitch * 0.45;
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
