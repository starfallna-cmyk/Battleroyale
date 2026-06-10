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
const EDGES = {
  wall:  new THREE.EdgesGeometry(GEO.wall),
  floor: new THREE.EdgesGeometry(GEO.floor),
  ramp:  new THREE.EdgesGeometry(GEO.ramp),
};

function buildMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.5, metalness: 0.2,
    transparent: true, opacity: 0.9,
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
    this.map = new Map(); // key -> { key, type, hp, mesh, color, box?, ramp? }
    this.spawning = [];   // pop-in animations
    this.dying = [];      // destruction animations
    this.ghostT = 0;

    this.ghosts = {};
    for (const t of BUILD_TYPES) {
      const g = new THREE.Mesh(GEO[t], ghostMaterial());
      g.rotation.order = 'YXZ';
      g.visible = false;
      g.add(new THREE.LineSegments(EDGES[t], new THREE.LineBasicMaterial({
        color: 0x9fe0ff, transparent: true, opacity: 0.9,
      })));
      scene.add(g);
      this.ghosts[t] = g;
    }
  }

  // Where would this piece go, given the player's feet position, view yaw and pitch?
  // Looking up steeply builds one level higher; aiming down with a wall drops a level.
  computePlacement(type, feetPos, yaw, pitch = 0) {
    const { a, dir } = quantizeDir(yaw);
    let level = type === 'floor'
      ? Math.floor((feetPos.y + 0.15) / CELL)
      : Math.floor(feetPos.y / CELL + 0.6);
    if (pitch > 0.5) level += 1;
    if (pitch < -0.75 && type === 'wall') level -= 1;
    level = Math.max(0, level);

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
    g.material.opacity = 0.28 + Math.sin(this.ghostT * 6) * 0.08;
    g.visible = true;
  }

  hideGhosts() {
    for (const t of BUILD_TYPES) this.ghosts[t].visible = false;
  }

  // Returns the new record, or null if that spot is taken.
  place(placement, color) {
    return this.placeRaw(placement.key, placement.type,
      [placement.pos.x, placement.pos.y, placement.pos.z], placement.rotY, color);
  }

  placeRaw(key, type, posArr, rotY, color = 0x6f86ff) {
    if (this.map.has(key)) return null;
    const mesh = new THREE.Mesh(GEO[type], buildMaterial(color));
    mesh.rotation.order = 'YXZ';
    mesh.position.set(posArr[0], posArr[1], posArr[2]);
    mesh.rotation.y = rotY;
    if (type === 'ramp') mesh.rotation.x = Math.PI / 4;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.key = key;
    mesh.add(new THREE.LineSegments(EDGES[type], new THREE.LineBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, opacity: 0.7,
    })));
    mesh.scale.setScalar(0.6);
    this.group.add(mesh);
    this.spawning.push({ mesh, t: 0 });

    const rec = { key, type, hp: BUILD_HP, mesh, color };
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
      this.map.delete(key);
      rec.mesh.userData.key = null;
      this.dying.push({ mesh: rec.mesh, t: 0.16 });
      return true;
    }
    const f = rec.hp / BUILD_HP;
    rec.mesh.material.color.setHex(rec.color).multiplyScalar(0.45 + 0.55 * f);
    rec.mesh.material.opacity = 0.55 + 0.35 * f;
    return false;
  }

  update(dt) {
    this.ghostT += dt;
    for (let i = this.spawning.length - 1; i >= 0; i--) {
      const a = this.spawning[i];
      a.t += dt;
      const s = Math.min(1, 0.6 + (a.t / 0.12) * 0.4);
      a.mesh.scale.setScalar(s);
      if (s >= 1) this.spawning.splice(i, 1);
    }
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const a = this.dying[i];
      a.t -= dt;
      a.mesh.scale.setScalar(Math.max(0.01, a.t / 0.16));
      a.mesh.material.opacity = (a.t / 0.16) * 0.9;
      if (a.t <= 0) {
        this.group.remove(a.mesh);
        a.mesh.material.dispose();
        this.dying.splice(i, 1);
      }
    }
  }

  // Surface height of a ramp at world (x, z), or -Infinity if outside its footprint.
  static rampHeightAt(ramp, x, z) {
    const dx = x - ramp.center.x, dz = z - ramp.center.z;
    if (Math.abs(dx) > CELL / 2 || Math.abs(dz) > CELL / 2) return -Infinity;
    const t = (dx * ramp.dir.x + dz * ramp.dir.z + CELL / 2) / CELL; // 0 near edge -> 1 far edge
    return ramp.baseY + Math.max(0, Math.min(1, t)) * CELL + 0.18;
  }
}
