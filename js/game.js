import * as THREE from 'three';
import { BuildSystem, CELL, BUILD_TYPES } from './builds.js';
import { sfx } from './sfx.js';

// ===== Tuning =====
const GRAVITY = 26;
const SPEED = 6.8;
const JUMP_V = 9.8;
const P_HALF = 0.45;      // player half-width
const P_HEIGHT = 1.8;     // player height (pos = feet)
const EYE = 1.55;
const ARENA = 70;         // half-size of the playable square
const RESPAWN_TIME = 3;
const WIN_KILLS = 10;
const NET_RATE = 0.045;   // seconds between state packets
const TURBO_BUILD = 0.16; // seconds between held-button placements

const WEAPONS = [
  { name: 'Assault Rifle', dmg: 18,  rate: 0.125, mag: 30, reload: 1.6, auto: true,  spread: 0.014, pellets: 1, range: 250, zoom: 60,  sound: 'shoot' },
  { name: 'Shotgun',       dmg: 9,   rate: 0.85,  mag: 6,  reload: 2.2, auto: false, spread: 0.05,  pellets: 8, range: 45,  zoom: 68,  sound: 'shotgun' },
  { name: 'Sniper',        dmg: 100, rate: 1.5,   mag: 1,  reload: 1.9, auto: false, spread: 0.001, pellets: 1, range: 500, zoom: 20, scope: true, sound: 'sniper' },
];

const SPAWNS = [
  { pos: [-55, 0, 0], yaw: -Math.PI / 2 }, // host, faces +X (toward center)
  { pos: [55, 0, 0],  yaw: Math.PI / 2 },  // guest, faces -X
];

function el(id) { return document.getElementById(id); }

function makeAvatar(color) {
  const group = new THREE.Group(); // position = feet
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(P_HALF, P_HEIGHT - 2 * P_HALF, 6, 14), mat);
  body.position.y = P_HEIGHT / 2;
  body.castShadow = true;
  group.add(body);

  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.16, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x10131c, roughness: 0.2 }));
  visor.position.set(0, 1.45, -0.4);
  group.add(visor);

  const gunPivot = new THREE.Group();
  gunPivot.position.set(0.32, 1.25, 0);
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.13, 0.2, 1.0),
    new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.4 }));
  gun.position.z = -0.55;
  gun.castShadow = true;
  gunPivot.add(gun);
  group.add(gunPivot);

  return { group, gunPivot, mat };
}

function makeHpBar() {
  const canvas = document.createElement('canvas');
  canvas.width = 96; canvas.height = 14;
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(1.5, 0.22, 1);
  sprite.position.y = 2.35;
  sprite.raycast = () => {}; // never block shots
  const draw = (hp) => {
    const c = canvas.getContext('2d');
    c.fillStyle = 'rgba(10,14,26,0.85)';
    c.fillRect(0, 0, 96, 14);
    c.fillStyle = hp > 50 ? '#43d94f' : hp > 25 ? '#ffb300' : '#ff5252';
    c.fillRect(2, 2, 92 * Math.max(0, hp) / 100, 10);
    tex.needsUpdate = true;
  };
  draw(100);
  return { sprite, draw };
}

export class Game {
  constructor({ net, isHost, myName, container }) {
    this.net = net;
    this.isHost = isHost;
    this.myName = myName || 'Player';
    this.foeName = 'Opponent';
    this.over = false;

    // --- renderer / scene ---
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9cc2e3);
    this.scene.fog = new THREE.Fog(0x9cc2e3, 130, 420);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 600);
    this.camera.rotation.order = 'YXZ';

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    this._buildWorld();
    this.builds = new BuildSystem(this.scene);

    // --- my player state ---
    const spawn = SPAWNS[isHost ? 0 : 1];
    this.pos = new THREE.Vector3(...spawn.pos);
    this.vel = new THREE.Vector3();
    this.yaw = spawn.yaw;
    this.pitch = 0;
    this.grounded = false;
    this.hp = 100;
    this.dead = false;
    this.respawnT = 0;
    this.kills = 0;
    this.foeKills = 0;

    this.me = makeAvatar(isHost ? 0x4fc3f7 : 0xff7043);
    this.scene.add(this.me.group);

    // --- remote player ---
    this.enemy = null;
    if (net) {
      this.enemy = makeAvatar(isHost ? 0xff7043 : 0x4fc3f7);
      this.enemy.targetPos = new THREE.Vector3(...SPAWNS[isHost ? 1 : 0].pos);
      this.enemy.group.position.copy(this.enemy.targetPos);
      this.enemy.targetYaw = 0;
      this.enemy.targetPitch = 0;
      this.enemy.alive = true;
      this.enemy.hpBar = makeHpBar();
      this.enemy.group.add(this.enemy.hpBar.sprite);
      this.scene.add(this.enemy.group);
      net.onMessage = (m) => this._handleMsg(m);
      net.send({ t: 'hello', name: this.myName });
    }

    // --- practice dummies ---
    this.dummies = [];
    if (!net) {
      for (const [x, z] of [[-12, -18], [0, -26], [14, -16]]) {
        const d = makeAvatar(0xb39ddb);
        d.group.position.set(x, 0, z);
        d.hp = 100;
        d.alive = true;
        d.respawnT = 0;
        d.hpBar = makeHpBar();
        d.group.add(d.hpBar.sprite);
        this.scene.add(d.group);
        this.dummies.push(d);
      }
    }

    // --- combat / build state ---
    this.mode = 'weapon';          // 'weapon' | 'build'
    this.weaponIdx = 0;
    this.buildIdx = 0;
    this.ammo = WEAPONS.map(w => w.mag);
    this.shootCd = 0;
    this.reloadT = 0;
    this.buildCd = 0;
    this.ads = false;
    this.mouseDown = false;
    this.tracers = [];
    this.netT = 0;

    // --- input ---
    this.keys = {};
    this._bindInput();

    // --- HUD ---
    this.ui = {
      hpFill: el('hpFill'), hpText: el('hpText'),
      ammoText: el('ammoText'), weaponName: el('weaponName'),
      scoreMe: el('scoreMe'), scoreFoe: el('scoreFoe'),
      nameMe: el('nameMe'), nameFoe: el('nameFoe'),
      killfeed: el('killfeed'), hitmarker: el('hitmarker'),
      damageFlash: el('damageFlash'), scope: el('scopeOverlay'),
      deathOverlay: el('deathOverlay'), respawnTimer: el('respawnTimer'),
      banner: el('banner'),
    };
    this.ui.nameMe.textContent = this.myName;
    this.ui.nameFoe.textContent = net ? this.foeName : 'Dummies';
    this._refreshHud();
    this._refreshSlots();

    this.raycaster = new THREE.Raycaster();
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this._frame());
  }

  // ===================== world =====================
  _buildWorld() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xffffff, 0x55657a, 1.0));
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.6);
    sun.position.set(60, 100, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, far: 300 });
    s.add(sun);

    const ground = new THREE.Mesh(
      new THREE.BoxGeometry(ARENA * 2, 1, ARENA * 2),
      new THREE.MeshStandardMaterial({ color: 0x8a96a5, roughness: 0.95 }));
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    s.add(ground);
    this.groundMesh = ground;

    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(1200, 1200),
      new THREE.MeshStandardMaterial({ color: 0x5d6a7a, roughness: 1 }));
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.55;
    s.add(outer);

    const grid = new THREE.GridHelper(ARENA * 2, (ARENA * 2) / CELL, 0x6b7685, 0x77849a);
    grid.position.y = 0.02;
    s.add(grid);

    // translucent energy-style boundary walls
    const wallMat = new THREE.MeshBasicMaterial({
      color: 0x4fa8ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide,
    });
    for (let i = 0; i < 4; i++) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2, 26), wallMat);
      const a = i * Math.PI / 2;
      w.position.set(Math.sin(a) * ARENA, 13, Math.cos(a) * ARENA);
      w.rotation.y = a;
      s.add(w);
    }

    // fixed obstacles — identical on both peers
    this.solids = [];        // THREE.Box3 list for collision
    this.staticMeshes = [];  // for shot/camera raycasts
    const addBox = (w, h, d, x, z, color) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
      m.position.set(x, h / 2, z);
      m.castShadow = m.receiveShadow = true;
      s.add(m);
      this.solids.push(new THREE.Box3().setFromObject(m));
      this.staticMeshes.push(m);
    };
    addBox(18, 1.5, 18, 0, 0, 0x9aa7b8);     // center platform
    addBox(3, 3, 3, -14, 14, 0xc0824f);
    addBox(3, 3, 3, 14, -14, 0xc0824f);
    addBox(3, 3, 3, -26, -22, 0xc0824f);
    addBox(3, 3, 3, 26, 22, 0xc0824f);
    addBox(6, 7, 6, -38, 28, 0x7e8da0);      // towers
    addBox(6, 7, 6, 38, -28, 0x7e8da0);
    addBox(10, 3.2, 1.2, 0, 34, 0x8d9aac);   // cover walls
    addBox(10, 3.2, 1.2, 0, -34, 0x8d9aac);
    addBox(1.2, 3.2, 10, -34, 0, 0x8d9aac);
    addBox(1.2, 3.2, 10, 34, 0, 0x8d9aac);

    // invisible boundary collision
    const t = 2;
    for (const [x, z, w, d] of [
      [0, -ARENA - t / 2, ARENA * 2 + 8, t], [0, ARENA + t / 2, ARENA * 2 + 8, t],
      [-ARENA - t / 2, 0, t, ARENA * 2 + 8], [ARENA + t / 2, 0, t, ARENA * 2 + 8],
    ]) {
      this.solids.push(new THREE.Box3(
        new THREE.Vector3(x - w / 2, -1, z - d / 2),
        new THREE.Vector3(x + w / 2, 40, z + d / 2)));
    }
  }

  // ===================== input =====================
  _bindInput() {
    this._onKeyDown = (e) => {
      if (!this._locked()) return;
      const k = e.code;
      this.keys[k] = true;
      if (k === 'Digit1') this._selectWeapon(0);
      if (k === 'Digit2') this._selectWeapon(1);
      if (k === 'Digit3') this._selectWeapon(2);
      if (k === 'KeyZ' || k === 'KeyQ') this._selectBuild(0);
      if (k === 'KeyX') this._selectBuild(1);
      if (k === 'KeyC') this._selectBuild(2);
      if (k === 'KeyR') this._startReload();
      if (k === 'Space') e.preventDefault();
    };
    this._onKeyUp = (e) => { this.keys[e.code] = false; };
    this._onMouseMove = (e) => {
      if (!this._locked()) return;
      const sens = 0.0023 * (this.ads && WEAPONS[this.weaponIdx].scope && this.mode === 'weapon' ? 0.4 : 1);
      this.yaw -= e.movementX * sens;
      this.pitch -= e.movementY * sens;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    };
    this._onMouseDown = (e) => {
      sfx.unlock();
      if (!this._locked()) return;
      if (e.button === 0) { this.mouseDown = true; this._tryFire(); }
      if (e.button === 2) this.ads = true;
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.ads = false;
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => { this.keys = {}; this.mouseDown = false; });
  }

  _locked() { return document.pointerLockElement === this.renderer.domElement; }

  _selectWeapon(i) {
    this.mode = 'weapon';
    this.weaponIdx = i;
    this.reloadT = 0;
    this.builds.hideGhosts();
    this._refreshSlots();
    this._refreshHud();
  }

  _selectBuild(i) {
    this.mode = 'build';
    this.buildIdx = i;
    this.reloadT = 0;
    this._refreshSlots();
    this._refreshHud();
  }

  _startReload() {
    if (this.mode !== 'weapon' || this.reloadT > 0) return;
    const w = WEAPONS[this.weaponIdx];
    if (this.ammo[this.weaponIdx] >= w.mag) return;
    this.reloadT = w.reload;
    sfx.reload();
    this._refreshHud();
  }

  // ===================== frame =====================
  _frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (!this.dead) {
      this._movement(dt);
      this._combat(dt);
    } else {
      this._deathTick(dt);
    }
    this._updateCamera(dt);
    this._updateAvatars(dt);
    this._updateTracers(dt);
    this._netTick(dt);
    this.renderer.render(this.scene, this.camera);
  }

  // ===================== movement & physics =====================
  _movement(dt) {
    let ix = 0, iz = 0;
    if (this._locked()) {
      if (this.keys['KeyW']) iz += 1;
      if (this.keys['KeyS']) iz -= 1;
      if (this.keys['KeyD']) ix += 1;
      if (this.keys['KeyA']) ix -= 1;
    }
    const len = Math.hypot(ix, iz) || 1;
    ix /= len; iz /= len;

    const fw = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const rt = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.vel.x = (fw.x * iz + rt.x * ix) * SPEED;
    this.vel.z = (fw.z * iz + rt.z * ix) * SPEED;

    if (this.keys['Space'] && this.grounded) {
      this.vel.y = JUMP_V;
      this.grounded = false;
    }
    this.vel.y -= GRAVITY * dt;

    const boxes = this._nearbyBoxes();

    // X axis
    this.pos.x += this.vel.x * dt;
    this._resolveAxis(boxes, 'x');
    // Z axis
    this.pos.z += this.vel.z * dt;
    this._resolveAxis(boxes, 'z');

    // Y axis (with landing / head-bump checks)
    const prevY = this.pos.y;
    this.pos.y += this.vel.y * dt;
    this.grounded = false;
    if (this.pos.y <= 0) { this.pos.y = 0; this.vel.y = 0; this.grounded = true; }
    for (const b of boxes) {
      if (!this._overlapsXZ(b)) continue;
      const top = b.max.y, bottom = b.min.y;
      if (this.vel.y <= 0 && prevY >= top - 0.01 && this.pos.y < top) {
        this.pos.y = top; this.vel.y = 0; this.grounded = true;
      } else if (this.vel.y > 0 && prevY + P_HEIGHT <= bottom + 0.01 && this.pos.y + P_HEIGHT > bottom) {
        this.pos.y = bottom - P_HEIGHT; this.vel.y = 0;
      }
    }

    // ramps: snap feet to surface when walking on them
    for (const rec of this.builds.map.values()) {
      if (rec.type !== 'ramp') continue;
      const h = BuildSystem.rampHeightAt(rec.ramp, this.pos.x, this.pos.z);
      if (h === -Infinity) continue;
      if (this.pos.y < h && h - this.pos.y < 1.1 && this.vel.y <= 0.01) {
        this.pos.y = h; this.vel.y = 0; this.grounded = true;
      }
    }

    // hard clamp inside arena
    this.pos.x = Math.max(-ARENA + P_HALF, Math.min(ARENA - P_HALF, this.pos.x));
    this.pos.z = Math.max(-ARENA + P_HALF, Math.min(ARENA - P_HALF, this.pos.z));
  }

  _nearbyBoxes() {
    const out = [];
    for (const b of this.solids) out.push(b);
    for (const rec of this.builds.map.values()) {
      if (rec.box && rec.box.distanceToPoint(this.pos) < 6) out.push(rec.box);
    }
    return out;
  }

  _overlapsXZ(b) {
    return this.pos.x + P_HALF > b.min.x && this.pos.x - P_HALF < b.max.x &&
           this.pos.z + P_HALF > b.min.z && this.pos.z - P_HALF < b.max.z;
  }

  _overlapsY(b) {
    return this.pos.y + P_HEIGHT > b.min.y + 0.05 && this.pos.y < b.max.y - 0.05;
  }

  _resolveAxis(boxes, axis) {
    for (const b of boxes) {
      if (!this._overlapsXZ(b) || !this._overlapsY(b)) continue;
      // low ledges (floor edges, platform lips) are stepped onto, not collided with
      const stepUp = b.max.y - this.pos.y;
      if (stepUp > 0 && stepUp <= 0.55 && this.vel.y <= 0.01) {
        this.pos.y = b.max.y;
        this.grounded = true;
        continue;
      }
      const center = (b.min[axis] + b.max[axis]) / 2;
      if (this.pos[axis] < center) this.pos[axis] = b.min[axis] - P_HALF;
      else this.pos[axis] = b.max[axis] + P_HALF;
    }
  }

  // ===================== combat & building =====================
  _combat(dt) {
    this.shootCd = Math.max(0, this.shootCd - dt);
    this.buildCd = Math.max(0, this.buildCd - dt);

    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        this.reloadT = 0;
        this.ammo[this.weaponIdx] = WEAPONS[this.weaponIdx].mag;
      }
      this._refreshHud();
    }

    if (this.mode === 'build') {
      const type = BUILD_TYPES[this.buildIdx];
      const placement = this.builds.computePlacement(type, this.pos, this.yaw);
      this.builds.showGhost(placement);
      if (this.mouseDown && this.buildCd <= 0 && this._locked()) this._placeBuild(placement);
    } else if (this.mouseDown && WEAPONS[this.weaponIdx].auto) {
      this._tryFire();
    }

    // scope overlay
    const scoped = this.ads && this.mode === 'weapon' && WEAPONS[this.weaponIdx].scope;
    this.ui.scope.classList.toggle('hidden', !scoped);
  }

  _placeBuild(placement) {
    const rec = this.builds.place(placement);
    if (!rec) return;
    this.buildCd = TURBO_BUILD;
    sfx.build();
    if (this.net) {
      this.net.send({
        t: 'build', k: placement.key, ty: placement.type,
        p: [placement.pos.x, placement.pos.y, placement.pos.z], ry: placement.rotY,
      });
    }
  }

  _tryFire() {
    if (this.dead || this.mode !== 'weapon' || this.shootCd > 0 || this.reloadT > 0 || !this._locked()) return;
    const w = WEAPONS[this.weaponIdx];
    if (this.ammo[this.weaponIdx] <= 0) { this._startReload(); return; }

    this.ammo[this.weaponIdx]--;
    this.shootCd = w.rate;
    sfx[w.sound]();

    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    const muzzle = this.camera.position.clone().addScaledVector(camDir, 1.2);

    let totalDmg = 0;
    let firstEnd = null;

    for (let i = 0; i < w.pellets; i++) {
      const dir = camDir.clone();
      dir.x += (Math.random() - 0.5) * 2 * w.spread;
      dir.y += (Math.random() - 0.5) * 2 * w.spread;
      dir.z += (Math.random() - 0.5) * 2 * w.spread;
      dir.normalize();

      this.raycaster.set(this.camera.position, dir);
      this.raycaster.far = w.range;

      const targets = [...this.builds.group.children, ...this.staticMeshes, this.groundMesh];
      if (this.enemy && this.enemy.alive) targets.push(this.enemy.group);
      for (const d of this.dummies) if (d.alive) targets.push(d.group);

      const hits = this.raycaster.intersectObjects(targets, true);
      const hit = hits[0];
      const end = hit ? hit.point : this.camera.position.clone().addScaledVector(dir, w.range);
      if (!firstEnd) firstEnd = end;
      this._spawnTracer(muzzle, end);

      if (!hit) continue;

      // climb to the top-level object we targeted
      let obj = hit.object;
      while (obj.parent && obj.parent !== this.scene && !obj.userData.key) obj = obj.parent;

      if (obj.userData.key) {
        const destroyed = this.builds.damage(obj.userData.key, w.dmg);
        if (destroyed) sfx.breakWall();
        if (this.net) this.net.send({ t: 'bhit', k: obj.userData.key, d: w.dmg });
      } else if (this.enemy && obj === this.enemy.group) {
        totalDmg += w.dmg;
      } else {
        const dummy = this.dummies.find(d => d.group === obj);
        if (dummy && dummy.alive) this._damageDummy(dummy, w.dmg);
      }
    }

    if (totalDmg > 0) {
      this.net.send({ t: 'hit', d: totalDmg });
      this._showHitmarker();
      sfx.hit();
    }

    if (this.net) {
      this.net.send({
        t: 'shoot',
        f: [muzzle.x, muzzle.y, muzzle.z],
        e: [firstEnd.x, firstEnd.y, firstEnd.z],
        w: this.weaponIdx,
      });
    }

    if (this.ammo[this.weaponIdx] <= 0) this._startReload();
    this._refreshHud();
  }

  _damageDummy(dummy, dmg) {
    dummy.hp -= dmg;
    dummy.hpBar.draw(dummy.hp);
    this._showHitmarker();
    sfx.hit();
    if (dummy.hp <= 0) {
      dummy.alive = false;
      dummy.group.visible = false;
      dummy.respawnT = 2;
      this.kills++;
      sfx.kill();
      this._feed(`You eliminated a dummy`);
      this._refreshHud();
    }
  }

  _spawnTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0xffe082, transparent: true, opacity: 0.9,
    }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  _updateTracers(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.09) * 0.9;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        this.tracers.splice(i, 1);
      }
    }
    // dummy respawns
    for (const d of this.dummies) {
      if (!d.alive) {
        d.respawnT -= dt;
        if (d.respawnT <= 0) {
          d.alive = true;
          d.hp = 100;
          d.hpBar.draw(100);
          d.group.visible = true;
        }
      }
    }
  }

  // ===================== damage / death =====================
  _takeDamage(dmg) {
    if (this.dead || this.over) return;
    this.hp -= dmg;
    sfx.hurt();
    this.ui.damageFlash.classList.add('show');
    setTimeout(() => this.ui.damageFlash.classList.remove('show'), 60);
    if (this.hp <= 0) {
      this.hp = 0;
      this._die();
    }
    if (this.net) this.net.send({ t: 'hp', v: this.hp });
    this._refreshHud();
  }

  _die() {
    this.dead = true;
    this.respawnT = RESPAWN_TIME;
    this.me.group.visible = false;
    this.foeKills++;
    sfx.die();
    this._feed(`☠ ${this.foeName} eliminated you`);
    if (this.net) this.net.send({ t: 'die' });
    this.ui.deathOverlay.classList.remove('hidden');
    this._refreshHud();
    this._checkWin();
  }

  _deathTick(dt) {
    this.respawnT -= dt;
    this.ui.respawnTimer.textContent = Math.max(1, Math.ceil(this.respawnT));
    if (this.respawnT <= 0) this._respawn();
  }

  _respawn() {
    const spawn = SPAWNS[this.isHost ? 0 : 1];
    this.pos.set(...spawn.pos);
    this.vel.set(0, 0, 0);
    this.yaw = spawn.yaw;
    this.pitch = 0;
    this.hp = 100;
    this.dead = false;
    this.me.group.visible = true;
    this.ammo = WEAPONS.map(w => w.mag);
    this.reloadT = 0;
    this.ui.deathOverlay.classList.add('hidden');
    if (this.net) this.net.send({ t: 'hp', v: 100 });
    this._refreshHud();
  }

  _checkWin() {
    if (this.over) return;
    if (this.kills >= WIN_KILLS || this.foeKills >= WIN_KILLS) {
      this.over = true;
      const won = this.kills >= WIN_KILLS;
      this.ui.banner.textContent = won ? '🏆 VICTORY!' : '💀 DEFEAT';
      this.ui.banner.classList.remove('hidden');
      won ? sfx.win() : sfx.lose();
      setTimeout(() => {
        this.kills = 0;
        this.foeKills = 0;
        this.over = false;
        this.ui.banner.classList.add('hidden');
        this._refreshHud();
      }, 4000);
    }
  }

  // ===================== camera & avatars =====================
  _updateCamera(dt) {
    const w = WEAPONS[this.weaponIdx];
    const targetFov = (this.ads && this.mode === 'weapon') ? w.zoom : 75;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 12);
    this.camera.updateProjectionMatrix();

    this.camera.rotation.set(this.pitch, this.yaw, 0);

    const look = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const pivot = this.pos.clone();
    pivot.y += EYE;
    pivot.addScaledVector(right, 0.7);

    let dist = 3.6;
    // keep the camera out of walls
    this.raycaster.set(pivot, look.clone().negate());
    this.raycaster.far = dist;
    const blockers = [...this.builds.group.children, ...this.staticMeshes, this.groundMesh];
    const hits = this.raycaster.intersectObjects(blockers, false);
    if (hits.length) dist = Math.max(0.4, hits[0].distance - 0.25);

    this.camera.position.copy(pivot).addScaledVector(look, -dist).add(new THREE.Vector3(0, 0.18, 0));
  }

  _updateAvatars(dt) {
    this.me.group.position.copy(this.pos);
    this.me.group.rotation.y = this.yaw;
    this.me.gunPivot.rotation.x = this.pitch;

    if (this.enemy) {
      const e = this.enemy;
      const k = Math.min(1, dt * 14);
      e.group.position.lerp(e.targetPos, k);
      let dy = e.targetYaw - e.group.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      e.group.rotation.y += dy * k;
      e.gunPivot.rotation.x += (e.targetPitch - e.gunPivot.rotation.x) * k;
    }
  }

  // ===================== networking =====================
  _netTick(dt) {
    if (!this.net) return;
    this.netT -= dt;
    if (this.netT <= 0) {
      this.netT = NET_RATE;
      this.net.send({
        t: 's',
        p: [+this.pos.x.toFixed(2), +this.pos.y.toFixed(2), +this.pos.z.toFixed(2)],
        y: +this.yaw.toFixed(3),
        x: +this.pitch.toFixed(3),
      });
    }
  }

  _handleMsg(m) {
    if (!m || typeof m !== 'object') return;
    const e = this.enemy;
    switch (m.t) {
      case 'hello':
        this.foeName = (m.name || 'Opponent').slice(0, 12);
        this.ui.nameFoe.textContent = this.foeName;
        break;
      case 's':
        e.targetPos.set(m.p[0], m.p[1], m.p[2]);
        e.targetYaw = m.y;
        e.targetPitch = m.x;
        break;
      case 'shoot': {
        const from = new THREE.Vector3(...m.f);
        const to = new THREE.Vector3(...m.e);
        this._spawnTracer(from, to);
        const w = WEAPONS[m.w] || WEAPONS[0];
        sfx[w.sound]();
        break;
      }
      case 'hit':
        this._takeDamage(m.d);
        break;
      case 'hp':
        e.hpBar.draw(m.v);
        if (m.v >= 100) { e.alive = true; e.group.visible = true; }
        break;
      case 'die':
        e.alive = false;
        e.group.visible = false;
        this.kills++;
        sfx.kill();
        this._feed(`⚔ You eliminated ${this.foeName}`);
        this._refreshHud();
        this._checkWin();
        break;
      case 'build':
        if (this.builds.placeRaw(m.k, m.ty, m.p, m.ry)) sfx.build();
        break;
      case 'bhit':
        if (this.builds.damage(m.k, m.d)) sfx.breakWall();
        break;
    }
  }

  // ===================== HUD =====================
  _refreshHud() {
    this.ui.hpFill.style.width = `${Math.max(0, this.hp)}%`;
    this.ui.hpFill.style.background = this.hp > 50
      ? 'linear-gradient(90deg,#43d94f,#8bea5a)'
      : this.hp > 25
        ? 'linear-gradient(90deg,#ffb300,#ffd54f)'
        : 'linear-gradient(90deg,#ff5252,#ff8a80)';
    this.ui.hpText.textContent = Math.max(0, Math.round(this.hp));
    this.ui.scoreMe.textContent = this.kills;
    this.ui.scoreFoe.textContent = this.foeKills;

    if (this.mode === 'weapon') {
      const w = WEAPONS[this.weaponIdx];
      this.ui.weaponName.textContent = w.name;
      if (this.reloadT > 0) {
        this.ui.ammoText.textContent = 'RELOADING…';
        this.ui.ammoText.classList.add('reloading');
      } else {
        this.ui.ammoText.textContent = `${this.ammo[this.weaponIdx]} / ∞`;
        this.ui.ammoText.classList.remove('reloading');
      }
    } else {
      this.ui.weaponName.textContent = ['Wall', 'Floor', 'Ramp'][this.buildIdx];
      this.ui.ammoText.textContent = 'BUILD';
      this.ui.ammoText.classList.remove('reloading');
    }
  }

  _refreshSlots() {
    document.querySelectorAll('.slot').forEach(s => s.classList.remove('active'));
    const slot = this.mode === 'weapon' ? `w${this.weaponIdx}` : `b${this.buildIdx}`;
    const elSlot = document.querySelector(`.slot[data-slot="${slot}"]`);
    if (elSlot) elSlot.classList.add('active');
  }

  _showHitmarker() {
    this.ui.hitmarker.classList.add('show');
    clearTimeout(this._hmT);
    this._hmT = setTimeout(() => this.ui.hitmarker.classList.remove('show'), 110);
  }

  _feed(text) {
    const div = document.createElement('div');
    div.className = 'feed-item';
    div.textContent = text;
    this.ui.killfeed.prepend(div);
    while (this.ui.killfeed.children.length > 5) this.ui.killfeed.lastChild.remove();
    setTimeout(() => div.remove(), 4500);
  }
}
