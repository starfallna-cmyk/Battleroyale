import * as THREE from 'three';
import { BuildSystem, CELL, BUILD_TYPES } from './builds.js';
import { WEAPONS, damageAt } from './weapons.js';
import { Avatar, makeNameLabel } from './avatar.js';
import { sfx } from './sfx.js';

// ===== Tuning =====
const GRAVITY = 26;
const SPEED = 6.8;
const JUMP_V = 9.8;
const PAD_V = 16;
const P_HALF = 0.45;      // player half-width
const P_HEIGHT = 1.8;     // player height (pos = feet)
const EYE = 1.55;
const ARENA = 70;         // half-size of the playable square
const RESPAWN_TIME = 3;
const WIN_KILLS = 10;
const NET_RATE = 0.045;   // seconds between state packets
const TURBO_BUILD = 0.12; // seconds between held-button placements

const SPAWNS = [
  { pos: [-55, 0, 0], yaw: -Math.PI / 2 }, // host, faces +X (toward center)
  { pos: [55, 0, 0],  yaw: Math.PI / 2 },  // guest, faces -X
];

function el(id) { return document.getElementById(id); }

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

function groundTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d');
  c.fillStyle = '#929eae';
  c.fillRect(0, 0, 128, 128);
  c.strokeStyle = 'rgba(70,82,100,0.55)';
  c.lineWidth = 3;
  c.strokeRect(1, 1, 126, 126);
  c.fillStyle = 'rgba(255,255,255,0.05)';
  c.fillRect(6, 6, 116, 116);
  for (let i = 0; i < 14; i++) {
    c.fillStyle = `rgba(60,70,90,${0.04 + Math.random() * 0.05})`;
    c.fillRect(Math.random() * 120, Math.random() * 120, 5 + Math.random() * 9, 5 + Math.random() * 9);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set((ARENA * 2) / CELL, (ARENA * 2) / CELL);
  tex.anisotropy = 4;
  return tex;
}

export class Game {
  constructor({ net, isHost, myName, container }) {
    this.net = net;
    this.isHost = isHost;
    this.myName = myName || 'Player';
    this.foeName = 'Opponent';
    this.over = false;
    this.myColor = isHost ? 0x4fc3f7 : 0xff7043;
    this.foeColor = isHost ? 0xff7043 : 0x4fc3f7;

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

    this.meAvatar = new Avatar(this.myColor);
    this.scene.add(this.meAvatar.group);

    // --- remote player ---
    this.enemy = null;
    if (net) {
      const avatar = new Avatar(this.foeColor);
      avatar.group.position.set(...SPAWNS[isHost ? 1 : 0].pos);
      this.enemy = {
        avatar,
        targetPos: avatar.group.position.clone(),
        targetYaw: 0, curPitch: 0, targetPitch: 0,
        speed: 0, grounded: true, item: 0, alive: true,
        hpBar: makeHpBar(),
        label: makeNameLabel('Opponent'),
      };
      avatar.group.add(this.enemy.hpBar.sprite);
      avatar.group.add(this.enemy.label);
      this.scene.add(avatar.group);
      net.onMessage = (m) => this._handleMsg(m);
      net.send({ t: 'hello', name: this.myName });
    }

    // --- practice dummies ---
    this.dummies = [];
    if (!net) {
      for (const [x, z] of [[-10, -14], [0, -18], [12, -20]]) {
        const avatar = new Avatar(0xb39ddb);
        avatar.group.position.set(x, 0, z);
        avatar.update(0, { item: 4 }); // hands empty
        const d = { avatar, group: avatar.group, hp: 100, alive: true, respawnT: 0, hpBar: makeHpBar() };
        avatar.group.add(d.hpBar.sprite);
        this.scene.add(avatar.group);
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
    this.bloom = 0;
    this.gunKick = 0;
    this.camDist = 3.6;
    this.tracers = [];
    this.dmgTexts = [];
    this.netT = 0;

    this.flashLight = new THREE.PointLight(0xffc66e, 0, 10);
    this.scene.add(this.flashLight);
    this.flashT = 0;

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
      banner: el('banner'), crosshair: el('crosshair'),
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
      new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 }));
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    s.add(ground);
    this.groundMesh = ground;

    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(1200, 1200),
      new THREE.MeshStandardMaterial({ color: 0x55606e, roughness: 1 }));
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.55;
    s.add(outer);

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
    const addBox = (w, h, d, x, z, color, baseY = 0) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
      m.position.set(x, baseY + h / 2, z);
      m.castShadow = m.receiveShadow = true;
      s.add(m);
      this.solids.push(new THREE.Box3().setFromObject(m));
      this.staticMeshes.push(m);
    };

    // center platform with pillars
    addBox(18, 1.5, 18, 0, 0, 0x97a4b5);
    addBox(2.2, 5, 2.2, -6, 6, 0x7e8da0, 1.5);
    addBox(2.2, 5, 2.2, 6, -6, 0x7e8da0, 1.5);
    // shipping containers (NE / SW)
    addBox(2.6, 2.8, 8, 26, 16, 0x4f7fa8);
    addBox(2.6, 2.8, 8, 29.4, 13, 0xa85f4f);
    addBox(2.6, 2.8, 8, 27.7, 14.5, 0x6b8f5a, 2.8);
    addBox(2.6, 2.8, 8, -26, -16, 0x4f7fa8);
    addBox(2.6, 2.8, 8, -29.4, -13, 0xa85f4f);
    addBox(2.6, 2.8, 8, -27.7, -14.5, 0x6b8f5a, 2.8);
    // towers (NW / SE)
    addBox(7, 8, 7, -30, 24, 0x7e8da0);
    addBox(7, 8, 7, 30, -24, 0x7e8da0);
    // mid cover walls
    addBox(12, 3.2, 1.2, 0, 26, 0x8d9aac);
    addBox(12, 3.2, 1.2, 0, -26, 0x8d9aac);
    addBox(1.2, 3.2, 12, -22, 0, 0x8d9aac);
    addBox(1.2, 3.2, 12, 22, 0, 0x8d9aac);
    // crates
    addBox(2.5, 2.5, 2.5, -14, -8, 0xc0824f);
    addBox(2.5, 2.5, 2.5, 14, 8, 0xc0824f);
    addBox(2.5, 2.5, 2.5, 8, -32, 0xc0824f);
    addBox(2.5, 2.5, 2.5, -8, 32, 0xc0824f);
    // crate stacks near spawns
    addBox(2.5, 2.5, 2.5, 44, -10, 0xc0824f);
    addBox(2.5, 2.5, 2.5, 46.5, -10, 0xb8743f);
    addBox(2.5, 2.5, 2.5, 45.25, -10, 0xa8663f, 2.5);
    addBox(2.5, 2.5, 2.5, -44, 10, 0xc0824f);
    addBox(2.5, 2.5, 2.5, -46.5, 10, 0xb8743f);
    addBox(2.5, 2.5, 2.5, -45.25, 10, 0xa8663f, 2.5);
    // spawn cover
    addBox(1.2, 4, 10, -60, 0, 0x8d9aac);
    addBox(1.2, 4, 10, 60, 0, 0x8d9aac);

    // jump pads (launch you high — point-symmetric so both spawns are fair)
    this.pads = [{ x: -26, z: 26 }, { x: 26, z: -26 }, { x: 0, z: 44 }, { x: 0, z: -44 }];
    for (const p of this.pads) {
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(1.7, 1.9, 0.22, 20),
        new THREE.MeshStandardMaterial({ color: 0x2b3340, roughness: 0.6 }));
      base.position.set(p.x, 0.11, p.z);
      base.receiveShadow = true;
      const top = new THREE.Mesh(
        new THREE.CylinderGeometry(1.3, 1.3, 0.1, 20),
        new THREE.MeshStandardMaterial({
          color: 0xffa030, emissive: 0xff7700, emissiveIntensity: 0.8, roughness: 0.4,
        }));
      top.position.set(p.x, 0.24, p.z);
      s.add(base, top);
      this.staticMeshes.push(base, top);
    }

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
      if (k === 'Digit4') this._selectWeapon(3);
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
    this._onWheel = (e) => {
      if (!this._locked()) return;
      const d = e.deltaY > 0 ? 1 : -1;
      if (this.mode === 'weapon') this._selectWeapon((this.weaponIdx + d + WEAPONS.length) % WEAPONS.length);
      else this._selectBuild((this.buildIdx + d + BUILD_TYPES.length) % BUILD_TYPES.length);
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('wheel', this._onWheel);
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => { this.keys = {}; this.mouseDown = false; });
  }

  _locked() { return document.pointerLockElement === this.renderer.domElement; }

  _item() { return this.mode === 'build' ? 4 : this.weaponIdx; }

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
    if (w.melee || this.ammo[this.weaponIdx] >= w.mag) return;
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
    this._updateEffects(dt);
    this.builds.update(dt);
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

    // jump pads
    if (this.grounded && this.pos.y < 0.5) {
      for (const p of this.pads) {
        const dx = this.pos.x - p.x, dz = this.pos.z - p.z;
        if (dx * dx + dz * dz < 1.7 * 1.7) {
          this.vel.y = PAD_V;
          this.grounded = false;
          sfx.pad();
          break;
        }
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
    this.bloom = Math.max(0, this.bloom - dt * 0.045);
    this.gunKick *= 1 - Math.min(1, dt * 9);

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
      const placement = this.builds.computePlacement(type, this.pos, this.yaw, this.pitch);
      this.builds.showGhost(placement);
      if (this.mouseDown && this.buildCd <= 0 && this._locked()) this._placeBuild(placement);
    } else if (this.mouseDown && WEAPONS[this.weaponIdx].auto) {
      this._tryFire();
    }

    // crosshair bloom + scope overlay
    this.ui.crosshair.style.transform =
      `translate(-50%,-50%) scale(${(1 + this.bloom * 26).toFixed(2)})`;
    const scoped = this.ads && this.mode === 'weapon' && WEAPONS[this.weaponIdx].scope;
    this.ui.scope.classList.toggle('hidden', !scoped);
  }

  _placeBuild(placement) {
    const rec = this.builds.place(placement, this.myColor);
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

  // first intersection that isn't a no-hit helper (weapon models, sprites)
  _firstHit(targets) {
    const hits = this.raycaster.intersectObjects(targets, true);
    for (const h of hits) {
      if (!h.object.userData.noHit) return h;
    }
    return null;
  }

  _shotTargets() {
    const targets = [...this.builds.group.children, ...this.staticMeshes, this.groundMesh];
    if (this.enemy && this.enemy.alive) targets.push(this.enemy.avatar.group);
    for (const d of this.dummies) if (d.alive) targets.push(d.group);
    return targets;
  }

  // resolve what a ray hit and apply damage; returns {dmg, head, point} for player-type hits
  _applyHit(hit, w) {
    let obj = hit.object;
    const isHead = obj.name === 'head';
    while (obj.parent && obj.parent !== this.scene && !obj.userData.key) obj = obj.parent;

    if (obj.userData.key) {
      const destroyed = this.builds.damage(obj.userData.key, w.buildDmg);
      if (destroyed) sfx.breakWall();
      else if (w.melee) sfx.thunk();
      if (this.net) this.net.send({ t: 'bhit', k: obj.userData.key, d: w.buildDmg });
      return null;
    }
    if (this.enemy && obj === this.enemy.avatar.group) {
      return { dmg: damageAt(w, hit.distance, isHead), head: isHead, point: hit.point };
    }
    const dummy = this.dummies.find(d => d.group === obj);
    if (dummy && dummy.alive) {
      const dmg = damageAt(w, hit.distance, isHead);
      this._damageDummy(dummy, dmg);
      this._spawnDmgText(hit.point, dmg, isHead);
      return { dmg, head: isHead, point: hit.point, dummy: true };
    }
    return null;
  }

  _tryFire() {
    if (this.dead || this.mode !== 'weapon' || this.shootCd > 0 || this.reloadT > 0 || !this._locked()) return;
    const w = WEAPONS[this.weaponIdx];
    if (!w.melee && this.ammo[this.weaponIdx] <= 0) { this._startReload(); return; }

    this.shootCd = w.rate;
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);

    // ---- pickaxe (melee) ----
    if (w.melee) {
      this.meAvatar.swing();
      sfx.swing();
      if (this.net) this.net.send({ t: 'shoot', w: 3 });
      // aim along the crosshair (camera) ray; extend reach by the camera's
      // trailing distance so effective range stays ~w.range from the player
      const eye = this.pos.clone(); eye.y += EYE;
      this.raycaster.set(this.camera.position, camDir);
      this.raycaster.far = w.range + this.camera.position.distanceTo(eye);
      const hit = this._firstHit(this._shotTargets());
      if (hit) {
        const res = this._applyHit(hit, w);
        if (res) {
          this._showHitmarker(res.head);
          sfx.thunk();
          if (!res.dummy) {
            this._spawnDmgText(res.point, res.dmg, res.head);
            if (this.net) this.net.send({ t: 'hit', d: res.dmg });
          }
        }
      }
      return;
    }

    // ---- guns ----
    this.ammo[this.weaponIdx]--;
    sfx[w.sound]();
    this.pitch = Math.min(1.45, this.pitch + w.kick);
    this.bloom = Math.min(0.045, this.bloom + w.bloom);
    this.gunKick = Math.min(0.25, this.gunKick + (w.scope ? 0.22 : 0.12));

    const muzzle = this.camera.position.clone().addScaledVector(camDir, 1.2);
    this.flashT = 0.05;
    this.flashLight.position.copy(muzzle);

    const spreadBase = w.spread * (this.ads ? w.adsSpread : 1) + this.bloom;
    let totalDmg = 0, headAny = false, hitPoint = null, firstEnd = null;

    for (let i = 0; i < w.pellets; i++) {
      const dir = camDir.clone();
      dir.x += (Math.random() - 0.5) * 2 * spreadBase;
      dir.y += (Math.random() - 0.5) * 2 * spreadBase;
      dir.z += (Math.random() - 0.5) * 2 * spreadBase;
      dir.normalize();

      this.raycaster.set(this.camera.position, dir);
      this.raycaster.far = w.range;

      const hit = this._firstHit(this._shotTargets());
      const end = hit ? hit.point : this.camera.position.clone().addScaledVector(dir, w.range);
      if (!firstEnd) firstEnd = end;
      this._spawnTracer(muzzle, end, w.tracer);

      if (!hit) continue;
      const res = this._applyHit(hit, w);
      if (res && !res.dummy) {
        totalDmg += res.dmg;
        headAny = headAny || res.head;
        hitPoint = hitPoint || res.point;
      } else if (res && res.dummy) {
        headAny = headAny || res.head;
      }
    }

    if (totalDmg > 0) {
      this.net.send({ t: 'hit', d: totalDmg });
      this._spawnDmgText(hitPoint, totalDmg, headAny);
      this._showHitmarker(headAny);
      headAny ? sfx.headshot() : sfx.hit();
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
    this._showHitmarker(false);
    sfx.hit();
    if (dummy.hp <= 0) {
      dummy.alive = false;
      dummy.group.visible = false;
      dummy.respawnT = 2;
      this.kills++;
      sfx.kill();
      this._feed('You eliminated a dummy');
      this._refreshHud();
    }
  }

  // ===================== effects =====================
  _spawnTracer(from, to, color) {
    if (!color) return;
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color, transparent: true, opacity: 0.9,
    }));
    line.userData.noHit = true;
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  _spawnDmgText(point, dmg, head) {
    if (!point || this.dmgTexts.length > 24) return;
    const canvas = document.createElement('canvas');
    canvas.width = 96; canvas.height = 48;
    const c = canvas.getContext('2d');
    c.font = '900 34px Segoe UI, Arial';
    c.textAlign = 'center';
    c.lineWidth = 7;
    c.strokeStyle = 'rgba(10,14,24,0.9)';
    c.strokeText(dmg, 48, 36);
    c.fillStyle = head ? '#ffd54f' : '#ffffff';
    c.fillText(dmg, 48, 36);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true,
    }));
    sprite.scale.set(1.15, 0.58, 1);
    sprite.position.copy(point);
    sprite.position.x += (Math.random() - 0.5) * 0.5;
    sprite.position.y += 0.3;
    sprite.raycast = () => {};
    this.scene.add(sprite);
    this.dmgTexts.push({ sprite, life: 0.7 });
  }

  _updateEffects(dt) {
    // tracers
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
    // damage numbers
    for (let i = this.dmgTexts.length - 1; i >= 0; i--) {
      const d = this.dmgTexts[i];
      d.life -= dt;
      d.sprite.position.y += dt * 1.7;
      d.sprite.material.opacity = Math.min(1, d.life / 0.35);
      if (d.life <= 0) {
        this.scene.remove(d.sprite);
        d.sprite.material.map.dispose();
        d.sprite.material.dispose();
        this.dmgTexts.splice(i, 1);
      }
    }
    // muzzle flash
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flashLight.intensity = Math.max(0, this.flashT / 0.05) * 9;
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
    this.meAvatar.group.visible = false;
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
    this.meAvatar.group.visible = true;
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

    // ADS pulls the camera in over the shoulder
    const wantDist = (this.ads && this.mode === 'weapon' && !w.melee) ? 2.3 : 3.6;
    this.camDist += (wantDist - this.camDist) * Math.min(1, dt * 10);

    let dist = this.camDist;
    this.raycaster.set(pivot, look.clone().negate());
    this.raycaster.far = dist;
    const blockers = [...this.builds.group.children, ...this.staticMeshes, this.groundMesh];
    const hits = this.raycaster.intersectObjects(blockers, false);
    if (hits.length) dist = Math.max(0.4, hits[0].distance - 0.25);

    this.camera.position.copy(pivot).addScaledVector(look, -dist).add(new THREE.Vector3(0, 0.18, 0));
  }

  _updateAvatars(dt) {
    this.meAvatar.group.position.copy(this.pos);
    this.meAvatar.group.rotation.y = this.yaw;
    this.meAvatar.update(dt, {
      speed: Math.hypot(this.vel.x, this.vel.z),
      grounded: this.grounded,
      pitch: this.pitch,
      item: this._item(),
      recoilZ: this.gunKick,
    });

    if (this.enemy) {
      const e = this.enemy;
      const k = Math.min(1, dt * 14);
      e.avatar.group.position.lerp(e.targetPos, k);
      let dy = e.targetYaw - e.avatar.group.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      e.avatar.group.rotation.y += dy * k;
      e.curPitch += (e.targetPitch - e.curPitch) * k;
      e.avatar.update(dt, {
        speed: e.speed, grounded: e.grounded, pitch: e.curPitch, item: e.item,
      });
    }

    for (const d of this.dummies) {
      if (d.alive) d.avatar.update(dt, { speed: 0, grounded: true, pitch: 0, item: 4 });
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
        m: +Math.hypot(this.vel.x, this.vel.z).toFixed(1),
        g: this.grounded ? 1 : 0,
        i: this._item(),
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
        e.avatar.group.remove(e.label);
        e.label = makeNameLabel(this.foeName);
        e.avatar.group.add(e.label);
        break;
      case 's':
        e.targetPos.set(m.p[0], m.p[1], m.p[2]);
        e.targetYaw = m.y;
        e.targetPitch = m.x;
        e.speed = m.m || 0;
        e.grounded = !!m.g;
        e.item = m.i ?? 0;
        break;
      case 'shoot': {
        if (m.w === 3) { e.avatar.swing(); sfx.swing(); break; }
        const from = new THREE.Vector3(...m.f);
        const to = new THREE.Vector3(...m.e);
        const w = WEAPONS[m.w] || WEAPONS[0];
        this._spawnTracer(from, to, w.tracer);
        this.flashT = 0.05;
        this.flashLight.position.copy(from);
        sfx[w.sound]();
        break;
      }
      case 'hit':
        this._takeDamage(m.d);
        break;
      case 'hp':
        e.hpBar.draw(m.v);
        if (m.v >= 100) { e.alive = true; e.avatar.group.visible = true; }
        break;
      case 'die':
        e.alive = false;
        e.avatar.group.visible = false;
        this.kills++;
        sfx.kill();
        this._feed(`⚔ You eliminated ${this.foeName}`);
        this._refreshHud();
        this._checkWin();
        break;
      case 'build':
        if (this.builds.placeRaw(m.k, m.ty, m.p, m.ry, this.foeColor)) sfx.build();
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
      if (w.melee) {
        this.ui.ammoText.textContent = '—';
        this.ui.ammoText.classList.remove('reloading');
      } else if (this.reloadT > 0) {
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

  _showHitmarker(head) {
    this.ui.hitmarker.classList.toggle('head', !!head);
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
