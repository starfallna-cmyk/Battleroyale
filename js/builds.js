import * as THREE from 'three';

export const CELL = 4;
export const BUILD_HP = 60;
export const BUILD_TYPES = ['wall', 'floor', 'ramp'];

const RAMP_LEN = Math.sqrt(CELL * CELL * 2); // hypotenuse of a 4x4 ramp
const T = 0.3; // panel thickness

// Sub-panel layouts (local coords) per type+edit state: [w, h, x, y]
// Walls span x -2..2, y -2..2, thickness z.
const WALL_EDITS = [
  // 0: full
  [[4, 4, 0, 0]],
  // 1: window (1.7 x 1.5, mid height)
  [[1.15, 4, -1.425, 0], [1.15, 4, 1.425, 0], [1.7, 1.45, 0, -1.275], [1.7, 1.05, 0, 1.475]],
];
export const EDIT_COUNT = { wall: 2, floor: 1, ramp: 2 }; // wall: window toggle, ramp: flip

const GHOST_GEO = {
  wall:  new THREE.BoxGeometry(CELL, CELL, T),
  floor: new THREE.BoxGeometry(CELL, T, CELL),
  ramp:  new THREE.BoxGeometry(CELL, 0.35, RAMP_LEN),
};

function buildMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color, roughness: 0.5, metalness: 0.2,
    transparent: true, opacity: 0.9,
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
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.map = new Map(); // key -> { key, type, hp, mesh(Group), color, edit, ry0, mat, edgeMat, boxes[], ramp? }
    this.spawning = [];
    this.dying = [];
    this.ghostT = 0;

    this.ghosts = {};
    for (const t of BUILD_TYPES) {
      const g = new THREE.Mesh(GHOST_GEO[t], new THREE.MeshStandardMaterial({
        color: 0x4fc3f7, transparent: true, opacity: 0.35, depthWrite: false,
      }));
      g.rotation.order = 'YXZ';
      g.visible = false;
      g.add(new THREE.LineSegments(new THREE.EdgesGeometry(GHOST_GEO[t]),
        new THREE.LineBasicMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0.9 })));
      scene.add(g);
      this.ghosts[t] = g;
    }
  }

  computePlacement(type, feetPos, yaw, pitch = 0) {
    const { a, dir } = quantizeDir(yaw);
    // the piece's grid cell (wall on the cell edge ahead; floor/ramp the cell ahead)
    const c = type === 'wall' ? cellCenter(feetPos)
      : cellCenter(feetPos.clone().addScaledVector(dir, CELL * 0.65 + 1));

    // vertical grid ANCHORED to the terrain under that cell: clean CELL tiers that
    // start at the ground (no floating) and snap consistently so re-placing the
    // same spot de-dupes instead of growing a tower
    const groundRef = this.groundAt ? this.groundAt(c.x, c.z) : 0;
    let level = Math.round((feetPos.y - groundRef) / CELL);
    if (pitch > 0.5) level += 1;                       // look up to place a tier higher
    if (pitch < -0.75 && type === 'wall') level -= 1;  // look down to drop a wall below
    level = Math.max(0, level);
    const base = groundRef + level * CELL;

    const pos = new THREE.Vector3();
    let rotX = 0;
    if (type === 'wall') {
      pos.set(c.x + dir.x * (CELL / 2), base + CELL / 2, c.z + dir.z * (CELL / 2));
    } else if (type === 'floor') {
      pos.set(c.x, base + T / 2, c.z);
    } else {
      pos.set(c.x, base + CELL / 2, c.z);
      rotX = Math.PI / 4;
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

  place(placement, color) {
    return this.placeRaw(placement.key, placement.type,
      [placement.pos.x, placement.pos.y, placement.pos.z], placement.rotY, color);
  }

  placeRaw(key, type, posArr, rotY, color = 0x6f86ff, edit = 0, hp = BUILD_HP) {
    if (this.map.has(key)) return null;
    const group = new THREE.Group();
    group.rotation.order = 'YXZ';
    group.position.set(posArr[0], posArr[1], posArr[2]);
    group.userData.key = key;
    this.group.add(group);

    const rec = {
      key, type, hp, color, edit: 0, ry0: rotY,
      mesh: group,
      mat: buildMaterial(color),
      edgeMat: new THREE.LineBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, opacity: 0.7,
      }),
      boxes: [],
    };
    if (type === 'ramp') {
      rec.ramp = {
        center: group.position.clone(),
        dir: new THREE.Vector3(-Math.sin(rotY), 0, -Math.cos(rotY)),
        baseY: posArr[1] - CELL / 2,
      };
    }
    this.map.set(key, rec);
    this._buildGeometry(rec, edit);
    if (hp < BUILD_HP) this._tint(rec);

    group.scale.setScalar(0.6);
    this.spawning.push({ mesh: group, t: 0 });
    return rec;
  }

  // (Re)builds the panel meshes + collision boxes for a record's edit state.
  _buildGeometry(rec, edit) {
    const group = rec.mesh;
    for (let i = group.children.length - 1; i >= 0; i--) {
      const ch = group.children[i];
      ch.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      group.remove(ch);
    }
    rec.edit = edit;
    rec.boxes = [];

    const addPanel = (geo, x = 0, y = 0, z = 0, rx = 0) => {
      const m = new THREE.Mesh(geo, rec.mat);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      m.castShadow = m.receiveShadow = true;
      m.userData.key = rec.key;
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), rec.edgeMat));
      group.add(m);
      return m;
    };

    if (rec.type === 'wall') {
      group.rotation.set(0, rec.ry0, 0);
      for (const [w, h, x, y] of WALL_EDITS[edit]) addPanel(new THREE.BoxGeometry(w, h, T), x, y, 0);
    } else if (rec.type === 'floor') {
      group.rotation.set(0, rec.ry0, 0);
      addPanel(new THREE.BoxGeometry(CELL, T, CELL));
    } else { // ramp — edit 1 flips the slope direction
      const ry = rec.ry0 + (edit ? Math.PI : 0);
      group.rotation.set(0, ry, 0);
      const slab = addPanel(new THREE.BoxGeometry(CELL, 0.35, RAMP_LEN), 0, 0, 0, Math.PI / 4);
      slab.rotation.order = 'YXZ';
      rec.ramp.dir.set(-Math.sin(ry), 0, -Math.cos(ry));
    }

    // collision boxes from world transforms (ramps use the surface fn instead);
    // measure at scale 1 so a mid-pop-in edit doesn't bake the spawn scale in
    if (rec.type !== 'ramp') {
      const s = group.scale.x;
      group.scale.setScalar(1);
      group.updateMatrixWorld(true);
      for (const ch of group.children) rec.boxes.push(new THREE.Box3().setFromObject(ch));
      group.scale.setScalar(s);
    }
  }

  // Cycle a piece's edit state (wall: full -> door -> window, ramp: flip).
  // Returns the new edit value, or null if the piece can't be edited.
  cycleEdit(key) {
    const rec = this.map.get(key);
    if (!rec) return null;
    const count = EDIT_COUNT[rec.type];
    if (count < 2) return null;
    const e = (rec.edit + 1) % count;
    this._buildGeometry(rec, e);
    return e;
  }

  applyEdit(key, e) {
    const rec = this.map.get(key);
    if (!rec || rec.edit === e) return false;
    this._buildGeometry(rec, e);
    return true;
  }

  damage(key, dmg) {
    const rec = this.map.get(key);
    if (!rec) return false;
    rec.hp -= dmg;
    if (rec.hp <= 0) {
      this.map.delete(key);
      rec.mesh.userData.key = null;
      rec.mesh.traverse(o => { o.userData.key = null; });
      this.dying.push({ mesh: rec.mesh, mat: rec.mat, t: 0.16 });
      return true;
    }
    this._tint(rec);
    return false;
  }

  _tint(rec) {
    const f = rec.hp / BUILD_HP;
    rec.mat.color.setHex(rec.color).multiplyScalar(0.45 + 0.55 * f);
    rec.mat.opacity = 0.55 + 0.35 * f;
  }

  // Full state for late joiners.
  serialize() {
    const out = [];
    for (const rec of this.map.values()) {
      out.push({
        k: rec.key, ty: rec.type,
        p: [rec.mesh.position.x, rec.mesh.position.y, rec.mesh.position.z],
        ry: rec.ry0, c: rec.color, e: rec.edit, hp: rec.hp,
      });
    }
    return out;
  }

  loadSnapshot(arr) {
    for (const b of arr || []) {
      const rec = this.placeRaw(b.k, b.ty, b.p, b.ry, b.c, b.e || 0, b.hp);
      if (rec) rec.mesh.scale.setScalar(1);
    }
    this.spawning.length = 0;
  }

  // Remove every placed piece (between battle-royale rounds).
  clearAll() {
    for (const rec of this.map.values()) {
      this.group.remove(rec.mesh);
      rec.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      rec.mat.dispose();
      rec.edgeMat.dispose();
    }
    this.map.clear();
    this.spawning.length = 0;
    for (const a of this.dying) this.group.remove(a.mesh);
    this.dying.length = 0;
    this.hideGhosts();
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
      a.mat.opacity = (a.t / 0.16) * 0.9;
      if (a.t <= 0) {
        this.group.remove(a.mesh);
        a.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); });
        a.mat.dispose();
        this.dying.splice(i, 1);
      }
    }
  }

  // Surface height of a ramp at world (x, z), or -Infinity if outside its footprint.
  static rampHeightAt(ramp, x, z) {
    const dx = x - ramp.center.x, dz = z - ramp.center.z;
    if (Math.abs(dx) > CELL / 2 || Math.abs(dz) > CELL / 2) return -Infinity;
    const t = (dx * ramp.dir.x + dz * ramp.dir.z + CELL / 2) / CELL;
    return ramp.baseY + Math.max(0, Math.min(1, t)) * CELL + 0.18;
  }
}
