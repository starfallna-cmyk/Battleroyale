import * as THREE from 'three';

export const CELL = 4;
export const BUILD_HP = 60;
export const BUILD_TYPES = ['wall', 'floor', 'ramp'];

const RAMP_LEN = Math.sqrt(CELL * CELL * 2); // hypotenuse of a 4x4 ramp

const GEO = {
  wall:  new THREE.BoxGeometry(CELL, CELL, 0.3),
  floor: new THREE.BoxGeometry(CELL, 0.3, CELL),
  ramp:  new THREE.BoxGeometry(CELL, 0.35, RAMP_LEN),
};

const BUILD_COLOR = 0x6f86ff;

function buildMaterial() {
  return new THREE.MeshStandardMaterial({
    color: BUILD_COLOR, roughness: 0.55, metalness: 0.15,
    transparent: true, opacity: 0.92,
  });
}

function ghostMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x4fc3f7, transparent: true, opacity: 0.35, depthWrite: false,
  });
}

// Cardinal direction from yaw. Forward at yaw=0 is -Z (three.js convention).
function quantizeDir(yaw) {
  const d = ((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4;
  const a = d * (Math.PI / 2);
  return { a, dir: new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a)) };
}

function cellCenter(v) {
  return new THREE.Vector3(
    Math.floor(v.x / CELL) * CELL + CELL / 2, 0,
    Math.floor(v.z / CELL) * CELL + CELL / 2,
  );
}

export class BuildSystem {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.map = new Map(); // key -> { key, type, hp, mesh, box, ramp? }

    this.ghosts = {};
    for (const t of BUILD_TYPES) {
      const g = new THREE.Mesh(GEO[t], ghostMaterial());
      g.rotation.order = 'YXZ';
      g.visible = false;
      scene.add(g);
      this.ghosts[t] = g;
    }
  }

  // Where would this piece go, given the player's feet position and view yaw?
  computePlacement(type, feetPos, yaw) {
    const { a, dir } = quantizeDir(yaw);
    const level = Math.floor(feetPos.y / CELL + 0.6);
    const pos = new THREE.Vector3();
    let rotX = 0;

    if (type === 'wall') {
      // On the edge between the player's cell and the next cell in the facing direction.
      const c = cellCenter(feetPos);
      pos.set(c.x + dir.x * (CELL / 2), level * CELL + CELL / 2, c.z + dir.z * (CELL / 2));
    } else {
      // Floor / ramp occupy the cell in front of the player.
      const target = feetPos.clone().addScaledVector(dir, CELL * 0.65 + 1);
      const c = cellCenter(target);
      if (type === 'floor') {
        pos.set(c.x, level * CELL + 0.15, c.z);
      } else {
        pos.set(c.x, level * CELL + CELL / 2, c.z);
        rotX = Math.PI / 4; // rises toward the facing direction
      }
    }

    const key = `${type}|${Math.round(pos.x * 10)}|${Math.round(pos.y * 10)}|${Math.round(pos.z * 10)}|${Math.round(a * 100)}`;
    return { key, type, pos, rotY: a, rotX };
  }

  showGhost(placement) {
    for (const t of BUILD_TYPES) this.ghosts[t].visible = false;
    const g = this.ghosts[placement.type];
    g.position.copy(placement.pos);
    g.rotation.set(placement.rotX, placement.rotY, 0);
    const occupied = this.map.has(placement.key);
    g.material.color.set(occupied ? 0xff5252 : 0x4fc3f7);
    g.visible = true;
  }

  hideGhosts() {
    for (const t of BUILD_TYPES) this.ghosts[t].visible = false;
  }

  // Returns the new record, or null if that spot is taken.
  place(placement) {
    return this.placeRaw(placement.key, placement.type,
      [placement.pos.x, placement.pos.y, placement.pos.z], placement.rotY);
  }

  placeRaw(key, type, posArr, rotY) {
    if (this.map.has(key)) return null;
    const mesh = new THREE.Mesh(GEO[type], buildMaterial());
    mesh.rotation.order = 'YXZ';
    mesh.position.set(posArr[0], posArr[1], posArr[2]);
    mesh.rotation.y = rotY;
    if (type === 'ramp') mesh.rotation.x = Math.PI / 4;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.key = key;
    this.group.add(mesh);

    const rec = { key, type, hp: BUILD_HP, mesh };
    if (type === 'ramp') {
      rec.ramp = {
        center: mesh.position.clone(),
        dir: new THREE.Vector3(-Math.sin(rotY), 0, -Math.cos(rotY)),
        baseY: posArr[1] - CELL / 2,
      };
    } else {
      rec.box = new THREE.Box3().setFromObject(mesh);
    }
    this.map.set(key, rec);
    return rec;
  }

  // Apply damage; returns true if the piece was destroyed.
  damage(key, dmg) {
    const rec = this.map.get(key);
    if (!rec) return false;
    rec.hp -= dmg;
    if (rec.hp <= 0) {
      this.group.remove(rec.mesh);
      rec.mesh.material.dispose();
      this.map.delete(key);
      return true;
    }
    const f = rec.hp / BUILD_HP;
    rec.mesh.material.color.setHex(BUILD_COLOR).multiplyScalar(0.45 + 0.55 * f);
    rec.mesh.material.opacity = 0.55 + 0.37 * f;
    return false;
  }

  // Surface height of a ramp at world (x, z), or -Infinity if outside its footprint.
  static rampHeightAt(ramp, x, z) {
    const dx = x - ramp.center.x, dz = z - ramp.center.z;
    if (Math.abs(dx) > CELL / 2 || Math.abs(dz) > CELL / 2) return -Infinity;
    const t = (dx * ramp.dir.x + dz * ramp.dir.z + CELL / 2) / CELL; // 0 near edge -> 1 far edge
    return ramp.baseY + Math.max(0, Math.min(1, t)) * CELL + 0.18;
  }
}
