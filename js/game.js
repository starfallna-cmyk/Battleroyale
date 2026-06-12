import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BuildSystem, BUILD_TYPES } from './builds.js';
import { WEAPONS, damageAt } from './weapons.js';
import { Avatar, makeNameLabel } from './avatar.js';
import { buildMap, ARENA, SPAWNS } from './map.js';
import { PROTO } from './net.js';
import { sfx } from './sfx.js';

// ===== Tuning =====
const GRAVITY = 26;
const SPEED = 6.8;
const JUMP_V = 9.8;
const PAD_V = 16;
const GLIDE_FALL = 5.5;   // capped fall speed under the glider
const DIVE_FALL = 20;     // holding Shift
const GLIDE_SPEED = 9.5;  // horizontal speed while skydiving
const P_HALF = 0.45;
const P_HEIGHT = 1.8;
const EYE = 1.55;
const RESPAWN_TIME = 3;
const WIN_KILLS = 10;
const NET_RATE = 0.045;
const TURBO_BUILD = 0.12;
const BUS_TIME = 11;      // seconds for the bus to cross the map

const COLORS = [0x4fc3f7, 0xff7043, 0x9ccc65, 0xffd54f, 0xba68c8, 0x4dd0e1];
const BUS_FROM = new THREE.Vector3(-95, 42, -55);
const BUS_TO = new THREE.Vector3(95, 42, 55);

function el(id) { return document.getElementById(id); }

function esc(t) {
  return String(t).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function makeHpBar() {
  const canvas = document.createElement('canvas');
  canvas.width = 96; canvas.height = 14;
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(1.5, 0.22, 1);
  sprite.position.y = 2.35;
  sprite.raycast = () => {};
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

function busBannerTexture() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 80;
  const c = cv.getContext('2d');
  c.fillStyle = '#f4f1ea';
  c.fillRect(0, 0, 512, 80);
  c.fillStyle = '#d8434e';
  c.fillRect(0, 0, 512, 10);
  c.fillRect(0, 70, 512, 10);
  c.font = '900 44px Segoe UI, Arial';
  c.textAlign = 'center';
  c.fillStyle = '#1d3f8f';
  c.fillText('⚔ BATTLE BUS ⚔', 256, 56);
  return new THREE.CanvasTexture(cv);
}

function balloonTexture() {
  const cv = document.createElement('canvas');
  cv.width = 160; cv.height = 32;
  const c = cv.getContext('2d');
  for (let i = 0; i < 10; i++) {
    c.fillStyle = i % 2 ? '#e8e6e1' : '#d8434e';
    c.fillRect(i * 16, 0, 16, 32);
  }
  return new THREE.CanvasTexture(cv);
}

// Detailed battle bus: striped balloon, glowing windows, banner, burner flame.
// Local -Z is the direction of travel. Returns { group, flame }.
function makeBus() {
  const g = new THREE.Group();
  const blue  = new THREE.MeshStandardMaterial({ color: 0x3d6cf5, roughness: 0.45, metalness: 0.15 });
  const dark  = new THREE.MeshStandardMaterial({ color: 0x222630, roughness: 0.7 });
  const glow  = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, emissive: 0x9fd4f5, emissiveIntensity: 0.7 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xaed4ea, roughness: 0.15, metalness: 0.3 });

  const part = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };

  part(new THREE.BoxGeometry(2.8, 2.2, 6.5), blue, 0, 0.1, 0);                      // body
  part(new THREE.BoxGeometry(2.9, 0.5, 6.6), dark, 0, -1.0, 0);                     // skirt
  part(new THREE.BoxGeometry(2.5, 0.25, 5.9), new THREE.MeshStandardMaterial({ color: 0xe8e6e1, roughness: 0.5 }), 0, 1.3, 0); // roof
  part(new THREE.BoxGeometry(2.2, 0.85, 0.08), glass, 0, 0.45, -3.27);              // windshield
  part(new THREE.BoxGeometry(2.0, 0.5, 0.06), dark, 0, -0.5, -3.28);                // grille
  part(new THREE.BoxGeometry(0.5, 0.22, 0.08), glow, -0.95, -0.15, -3.28);          // headlights
  part(new THREE.BoxGeometry(0.5, 0.22, 0.08), glow, 0.95, -0.15, -3.28);
  part(new THREE.BoxGeometry(0.08, 0.6, 5.0), glow, -1.43, 0.62, 0.3);              // window strips
  part(new THREE.BoxGeometry(0.08, 0.6, 5.0), glow, 1.43, 0.62, 0.3);
  part(new THREE.BoxGeometry(0.08, 1.5, 0.95), dark, 1.44, -0.3, -2.3);             // door

  const bannerTex = busBannerTexture();
  for (const s of [-1, 1]) {
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 0.85),
      new THREE.MeshBasicMaterial({ map: bannerTex }));
    banner.position.set(s * 1.46, -0.35, 0.2);
    banner.rotation.y = s * Math.PI / 2;
    g.add(banner);
  }
  for (const [x, z] of [[-1.05, -2.3], [1.05, -2.3], [-1.05, 2.3], [1.05, 2.3]]) {
    const wheel = part(new THREE.CylinderGeometry(0.46, 0.46, 0.3, 12), dark, x, -1.35, z);
    wheel.rotation.z = Math.PI / 2;
  }

  // balloon rig
  const balloon = part(new THREE.SphereGeometry(2.7, 20, 14),
    new THREE.MeshStandardMaterial({ map: balloonTexture(), roughness: 0.65 }), 0, 5.0, 0);
  balloon.scale.set(1, 0.94, 1.18);
  part(new THREE.BoxGeometry(0.55, 0.45, 0.55), dark, 0, 2.85, 0);                  // burner box
  const flame = part(new THREE.ConeGeometry(0.24, 0.75, 8),
    new THREE.MeshStandardMaterial({ color: 0xffc14d, emissive: 0xff8a00, emissiveIntensity: 1.6 }), 0, 3.5, 0);
  for (const [x, z] of [[-1.1, -1.6], [1.1, -1.6], [-1.1, 1.6], [1.1, 1.6]]) {
    const rope = part(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 4), dark, x * 0.85, 2.3, z * 0.85);
    rope.rotation.z = -x * 0.3;
    rope.rotation.x = z * 0.28;
  }

  g.traverse(o => { o.userData.noHit = true; });
  return { group: g, flame };
}

export class Game {
  constructor({ net, myName, container, roomCode }) {
    this.net = net;
    this.myId = net ? net.myId : 0;
    this.myName = (myName || 'Player').slice(0, 12);
    this.over = false;
    this.myColor = COLORS[this.myId % COLORS.length];
    this.state = 'match'; // 'lobby' | 'match' | 'roundover' (net games start in lobby)
    this.myReady = false;
    this.lobbyAngle = 0;
    this.roomCode = roomCode || null;

    // --- renderer / scene ---
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9cc2e3);
    this.scene.fog = new THREE.Fog(0xa9c6de, 170, 850);
    // subtle image-based ambience makes metals/plastics read as real materials
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 600);
    this.camera.rotation.order = 'YXZ';

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    const world = buildMap(this.scene);
    this.solids = world.solids;
    this.staticMeshes = world.staticMeshes;
    this.pads = world.pads;
    this.groundMesh = world.groundMesh;

    this.builds = new BuildSystem(this.scene);

    // --- my player state ---
    const spawn = SPAWNS[this.myId % SPAWNS.length];
    this.pos = new THREE.Vector3(...spawn.pos);
    this.vel = new THREE.Vector3();
    this.yaw = spawn.yaw;
    this.pitch = 0;
    this.grounded = false;
    this.hp = 100;
    this.dead = false;
    this.respawnT = 0;
    this.lastHitBy = null;

    this.meAvatar = new Avatar(this.myColor);
    this.scene.add(this.meAvatar.group);

    // --- battle bus ---
    const bus = makeBus();
    this.bus = bus.group;
    this.busFlame = bus.flame;
    this.scene.add(this.bus);
    this.phase = 'bus'; // 'bus' -> 'sky' -> 'normal'
    this.busT = 0;
    this.busBob = 0;
    const busDir = BUS_TO.clone().sub(BUS_FROM).normalize();
    this.busDir = busDir;
    this.bus.rotation.y = Math.atan2(-busDir.x, -busDir.z);
    this.yaw = Math.atan2(-busDir.x, -busDir.z);

    // --- other players & scores ---
    this.players = new Map(); // id -> remote player
    this.scores = new Map([[this.myId, { name: this.myName, kills: 0, wins: 0, ready: false, alive: false }]]);

    if (net) {
      net.onMessage = (from, m) => this._handleMsg(from, m);
      net.onPeerLeave = (id) => {
        this._removePlayer(id);
        this._refreshLobby();
        this._maybeStart();
        this._checkRound();
      };
      if (net.isHost) {
        net.onPeerJoin = (id) => {
          net.sendTo(id, {
            t: 'welcome',
            roster: [...this.scores.entries()].map(([pid, s]) =>
              [pid, s.name, s.wins, s.ready ? 1 : 0, s.alive ? 1 : 0]),
            state: this.state === 'match' ? 'match' : 'lobby',
            builds: this.state === 'match' ? this.builds.serialize() : [],
          });
        };
      }
      net.send({ t: 'hello', name: this.myName, pv: PROTO });
    }

    // --- practice dummies ---
    this.dummies = [];
    if (!net) {
      for (const [x, z] of [[-10, -14], [0, -18], [12, -20]]) {
        const avatar = new Avatar(0xb39ddb);
        avatar.group.position.set(x, 0, z);
        avatar.update(0, { item: 4 });
        const d = { avatar, group: avatar.group, hp: 100, alive: true, respawnT: 0, hpBar: makeHpBar() };
        avatar.group.add(d.hpBar.sprite);
        this.scene.add(avatar.group);
        this.dummies.push(d);
      }
    }

    // --- combat / build state ---
    this.mode = 'weapon';
    this.weaponIdx = 0;
    this.buildIdx = 0;
    this.ammo = WEAPONS.map(w => w.mag);
    this.shootCd = 0;
    this.reloadT = 0;
    this.buildCd = 0;
    this.editCd = 0;
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
    // visible muzzle flash star
    const flashCv = document.createElement('canvas');
    flashCv.width = flashCv.height = 64;
    const fc = flashCv.getContext('2d');
    const fg = fc.createRadialGradient(32, 32, 2, 32, 32, 30);
    fg.addColorStop(0, 'rgba(255,250,220,1)');
    fg.addColorStop(0.35, 'rgba(255,200,90,0.9)');
    fg.addColorStop(1, 'rgba(255,150,40,0)');
    fc.fillStyle = fg;
    fc.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = i % 2 ? 13 : 31;
      fc[i ? 'lineTo' : 'moveTo'](32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
    }
    fc.closePath();
    fc.fill();
    this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(flashCv), blending: THREE.AdditiveBlending,
      depthWrite: false, transparent: true,
    }));
    this.flashSprite.visible = false;
    this.flashSprite.raycast = () => {};
    this.scene.add(this.flashSprite);

    this.shells = [];
    this.camRoll = 0;
    this.stepD = 0;

    this.keys = {};
    this._bindInput();

    this.ui = {
      hpFill: el('hpFill'), hpText: el('hpText'),
      ammoText: el('ammoText'), weaponName: el('weaponName'),
      reloadBar: el('reloadBar'), reloadFill: el('reloadFill'),
      scoreList: el('scoreList'), aliveBadge: el('aliveBadge'),
      killfeed: el('killfeed'), hitmarker: el('hitmarker'),
      damageFlash: el('damageFlash'), scope: el('scopeOverlay'),
      deathOverlay: el('deathOverlay'), respawnTimer: el('respawnTimer'),
      deathSub: el('deathSub'), lockOverlay: el('lockOverlay'),
      banner: el('banner'), crosshair: el('crosshair'), prompt: el('prompt'),
      lobby: el('lobby'), lobbyList: el('lobbyList'), lobbyCode: el('lobbyCode'),
      btnReady: el('btnReady'), lobbyStatus: el('lobbyStatus'),
    };
    this.ui.btnReady.addEventListener('click', () => this._toggleReady());
    this.ui.lobbyCode.textContent = this.roomCode ? `ROOM ${this.roomCode}` : '';
    this._refreshHud();
    this._refreshScores();
    this._refreshSlots();

    this.raycaster = new THREE.Raycaster();
    this.clock = new THREE.Clock();
    if (net) this._enterLobby();
    this.renderer.setAnimationLoop(() => this._frame());
  }

  // ===================== players =====================
  _getPlayer(id) {
    let p = this.players.get(id);
    if (p) return p;
    const color = COLORS[id % COLORS.length];
    const avatar = new Avatar(color);
    avatar.group.position.set(...SPAWNS[id % SPAWNS.length].pos);
    p = {
      id, color, avatar,
      name: `Player ${id + 1}`,
      targetPos: avatar.group.position.clone(),
      targetYaw: 0, curPitch: 0, targetPitch: 0,
      speed: 0, grounded: true, item: 0, gliding: false, alive: true,
      hpBar: makeHpBar(),
      label: makeNameLabel(`Player ${id + 1}`),
    };
    avatar.group.add(p.hpBar.sprite, p.label);
    this.scene.add(avatar.group);
    this.players.set(id, p);
    if (!this.scores.has(id)) this.scores.set(id, { name: p.name, kills: 0, wins: 0, ready: false, alive: false });
    this._refreshScores();
    return p;
  }

  _setPlayerName(id, name) {
    const p = this._getPlayer(id);
    p.name = name;
    p.avatar.group.remove(p.label);
    p.label = makeNameLabel(name);
    p.avatar.group.add(p.label);
    const s = this.scores.get(id);
    if (s) s.name = name;
    this._refreshScores();
  }

  _removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.scene.remove(p.avatar.group);
    this.players.delete(id);
    this.scores.delete(id);
    this._feed(`${p.name} left the game`);
    this._refreshScores();
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
      if (k === 'KeyF') this._tryEdit();
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

  // Edit the build piece you're aiming at (F): walls cycle door/window, ramps flip.
  _tryEdit() {
    if (this.dead || this.state !== 'match' || this.phase !== 'normal' || this.editCd > 0) return;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.raycaster.set(this.camera.position, dir);
    this.raycaster.far = 7 + this.camDist;
    const hit = this._firstHit(this.builds.group.children);
    if (!hit) return;
    let obj = hit.object;
    while (obj && !obj.userData.key) obj = obj.parent;
    if (!obj || !obj.userData.key) return;
    const e = this.builds.cycleEdit(obj.userData.key);
    if (e === null) return;
    this.editCd = 0.25;
    sfx.build();
    if (this.net) this.net.send({ t: 'edit', k: obj.userData.key, e });
  }

  // ===================== frame =====================
  _frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.state === 'lobby' || this.state === 'roundover') {
      // gameplay frozen; lobby orbit camera / results banner
    } else if (this.phase === 'bus') {
      this._busTick(dt);
    } else if (!this.dead) {
      this._movement(dt);
      this._combat(dt);
    } else if (this.net) {
      this._spectate(dt);
    } else {
      this._deathTick(dt);
    }
    this._updateCamera(dt);
    this._updateAvatars(dt);
    this._updateEffects(dt);
    this.builds.update(dt);
    this._netTick(dt);
    this._updatePrompt();
    this.renderer.render(this.scene, this.camera);
  }

  // free-fly spectator after elimination (battle royale)
  _spectate(dt) {
    if (!this._locked()) return;
    let ix = 0, iz = 0;
    if (this.keys['KeyW']) iz += 1;
    if (this.keys['KeyS']) iz -= 1;
    if (this.keys['KeyD']) ix += 1;
    if (this.keys['KeyA']) ix -= 1;
    const sp = 18;
    const look = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.pos.addScaledVector(look, iz * sp * dt).addScaledVector(right, ix * sp * dt);
    if (this.keys['Space']) this.pos.y += sp * dt;
    if (this.keys['ShiftLeft'] || this.keys['ShiftRight']) this.pos.y -= sp * dt;
    this.pos.x = Math.max(-ARENA, Math.min(ARENA, this.pos.x));
    this.pos.z = Math.max(-ARENA, Math.min(ARENA, this.pos.z));
    this.pos.y = Math.max(1, Math.min(70, this.pos.y));
  }

  _updatePrompt() {
    const p = this.ui.prompt;
    if (this.state === 'match' && this.phase === 'bus') {
      const left = Math.max(0, Math.ceil((1 - this.busT) * BUS_TIME));
      p.textContent = `🚌 SPACE to drop — auto in ${left}s`;
      p.classList.remove('hidden');
    } else if (this.state === 'match' && this.phase === 'sky') {
      p.textContent = '🪂 Hold SHIFT to dive';
      p.classList.remove('hidden');
    } else if (this.state === 'match' && this.dead && this.net) {
      const aliveN = [...this.scores.values()].filter(s => s.alive).length;
      p.textContent = `👻 Spectating — ${aliveN} alive`;
      p.classList.remove('hidden');
    } else {
      p.classList.add('hidden');
    }
  }

  // ===================== battle bus & gliding =====================
  _busAnim(dt) {
    if (!this.bus.visible) return;
    this.busBob += dt;
    this.bus.position.y = BUS_FROM.y + Math.sin(this.busBob * 1.2) * 0.6;
    this.bus.rotation.z = Math.sin(this.busBob * 0.8) * 0.025;
    const f = 1 + 0.3 * Math.sin(this.busBob * 24) + 0.15 * Math.sin(this.busBob * 7.3);
    this.busFlame.scale.set(1, Math.max(0.4, f), 1);
  }

  _busTick(dt) {
    sfx.busStart();
    this.busT += dt / BUS_TIME;
    const t = Math.min(1, this.busT);
    this.bus.position.lerpVectors(BUS_FROM, BUS_TO, t);
    this._busAnim(dt);
    this.pos.copy(this.bus.position);
    this.pos.y -= 1.0;
    if ((this.keys['Space'] && this._locked()) || t >= 1) this._dropFromBus();
  }

  _dropFromBus() {
    this.phase = 'sky';
    sfx.busStop();
    this.bus.visible = this.busT < 1.2; // keep flying visually a moment
    this.vel.set(this.busDir.x * 4, -2, this.busDir.z * 4);
    // clamp drop point into the arena
    this.pos.x = Math.max(-ARENA + 2, Math.min(ARENA - 2, this.pos.x));
    this.pos.z = Math.max(-ARENA + 2, Math.min(ARENA - 2, this.pos.z));
  }

  get gliding() { return this.phase === 'sky' && !this.grounded; }

  // ===================== movement & physics =====================
  _movement(dt) {
    // bus keeps flying off-screen after we drop
    if (this.bus.visible && this.phase !== 'bus') {
      this.busT += dt / BUS_TIME;
      this.bus.position.lerpVectors(BUS_FROM, BUS_TO, Math.min(1.35, this.busT));
      this._busAnim(dt);
      if (this.busT >= 1.35) this.bus.visible = false;
    }

    let ix = 0, iz = 0;
    if (this._locked()) {
      if (this.keys['KeyW']) iz += 1;
      if (this.keys['KeyS']) iz -= 1;
      if (this.keys['KeyD']) ix += 1;
      if (this.keys['KeyA']) ix -= 1;
    }
    const len = Math.hypot(ix, iz) || 1;
    ix /= len; iz /= len;

    const speed = this.gliding ? GLIDE_SPEED : SPEED;
    const fw = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const rt = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.vel.x = (fw.x * iz + rt.x * ix) * speed;
    this.vel.z = (fw.z * iz + rt.z * ix) * speed;

    if (this.keys['Space'] && this.grounded) {
      this.vel.y = JUMP_V;
      this.grounded = false;
    }
    this.vel.y -= GRAVITY * dt;
    if (this.gliding) {
      const cap = (this.keys['ShiftLeft'] || this.keys['ShiftRight']) ? DIVE_FALL : GLIDE_FALL;
      if (this.vel.y < -cap) this.vel.y = -cap;
    }

    const boxes = this._nearbyBoxes();
    const wasGrounded = this.grounded;
    const fallV = this.vel.y;

    this.pos.x += this.vel.x * dt;
    this._resolveAxis(boxes, 'x');
    this.pos.z += this.vel.z * dt;
    this._resolveAxis(boxes, 'z');

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

    for (const rec of this.builds.map.values()) {
      if (rec.type !== 'ramp') continue;
      const h = BuildSystem.rampHeightAt(rec.ramp, this.pos.x, this.pos.z);
      if (h === -Infinity) continue;
      if (this.pos.y < h && h - this.pos.y < 1.1 && this.vel.y <= 0.01) {
        this.pos.y = h; this.vel.y = 0; this.grounded = true;
      }
    }

    if (this.grounded && this.phase === 'sky') this.phase = 'normal';

    // landing thud + footsteps
    if (!wasGrounded && this.grounded && fallV < -10) {
      sfx.land();
      this.gunKick = Math.min(0.25, this.gunKick + 0.12);
    }
    if (this.grounded && this.phase === 'normal') {
      const sp = Math.hypot(this.vel.x, this.vel.z);
      if (sp > 1) {
        this.stepD += sp * dt;
        if (this.stepD > 2.6) { this.stepD = 0; sfx.step(); }
      }
    }

    if (this.grounded) {
      for (const p of this.pads) {
        if (Math.abs(this.pos.y - (p.y || 0)) > 0.5) continue;
        const dx = this.pos.x - p.x, dz = this.pos.z - p.z;
        if (dx * dx + dz * dz < 1.7 * 1.7) {
          this.vel.y = PAD_V;
          this.grounded = false;
          sfx.pad();
          break;
        }
      }
    }

    this.pos.x = Math.max(-ARENA + P_HALF, Math.min(ARENA - P_HALF, this.pos.x));
    this.pos.z = Math.max(-ARENA + P_HALF, Math.min(ARENA - P_HALF, this.pos.z));
  }

  _nearbyBoxes() {
    const out = [];
    for (const b of this.solids) out.push(b);
    for (const rec of this.builds.map.values()) {
      for (const b of rec.boxes) {
        if (b.distanceToPoint(this.pos) < 6) out.push(b);
      }
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
      const stepUp = b.max.y - this.pos.y;
      if (stepUp > 0 && stepUp <= 0.55 && this.vel.y <= 0.01) {
        this.pos.y = b.max.y;
        this.grounded = true;
        continue;
      }
      // push out along the axis of least penetration — resolving on the wrong
      // axis would slingshot the player along thin walls/fences
      const penX = Math.min(this.pos.x + P_HALF - b.min.x, b.max.x - this.pos.x + P_HALF);
      const penZ = Math.min(this.pos.z + P_HALF - b.min.z, b.max.z - this.pos.z + P_HALF);
      if ((axis === 'x' ? penX : penZ) > (axis === 'x' ? penZ : penX) + 1e-6) continue;
      const center = (b.min[axis] + b.max[axis]) / 2;
      if (this.pos[axis] < center) this.pos[axis] = b.min[axis] - P_HALF;
      else this.pos[axis] = b.max[axis] + P_HALF;
    }
  }

  // ===================== combat & building =====================
  _combat(dt) {
    this.shootCd = Math.max(0, this.shootCd - dt);
    this.buildCd = Math.max(0, this.buildCd - dt);
    this.editCd = Math.max(0, this.editCd - dt);
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

    if (this.phase !== 'normal') {
      this.builds.hideGhosts();
      return;
    }

    if (this.mode === 'build') {
      const type = BUILD_TYPES[this.buildIdx];
      const placement = this.builds.computePlacement(type, this.pos, this.yaw, this.pitch);
      this.builds.showGhost(placement);
      if (this.mouseDown && this.buildCd <= 0 && this._locked()) this._placeBuild(placement);
    } else if (this.mouseDown && WEAPONS[this.weaponIdx].auto) {
      this._tryFire();
    }

    this.ui.crosshair.style.setProperty('--sp', `${(5 + this.bloom * 240).toFixed(1)}px`);
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
        c: this.myColor,
      });
    }
  }

  _firstHit(targets) {
    const hits = this.raycaster.intersectObjects(targets, true);
    for (const h of hits) {
      if (!h.object.userData.noHit) return h;
    }
    return null;
  }

  _shotTargets() {
    const targets = [...this.builds.group.children, ...this.staticMeshes, this.groundMesh];
    for (const p of this.players.values()) if (p.alive) targets.push(p.avatar.group);
    for (const d of this.dummies) if (d.alive) targets.push(d.group);
    return targets;
  }

  // resolve a ray hit; returns {dmg, head, point, playerId?|dummy?} for flesh hits
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
    for (const p of this.players.values()) {
      if (obj === p.avatar.group) {
        return { dmg: damageAt(w, hit.distance, isHead), head: isHead, point: hit.point, playerId: p.id };
      }
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
    if (this.dead || this.state !== 'match' || this.phase !== 'normal' || this.mode !== 'weapon' ||
        this.shootCd > 0 || this.reloadT > 0 || !this._locked()) return;
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
      const eye = this.pos.clone(); eye.y += EYE;
      this.raycaster.set(this.camera.position, camDir);
      this.raycaster.far = w.range + this.camera.position.distanceTo(eye);
      const hit = this._firstHit(this._shotTargets());
      if (hit) {
        const res = this._applyHit(hit, w);
        if (res) {
          this._showHitmarker(res.head);
          sfx.thunk();
          if (res.playerId !== undefined) {
            this._spawnDmgText(res.point, res.dmg, res.head);
            this.net.send({ t: 'hit', to: res.playerId, d: res.dmg });
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
    this.flashSprite.position.copy(muzzle);
    this.flashSprite.material.rotation = Math.random() * Math.PI;
    this.camRoll += (Math.random() - 0.5) * w.kick * 5;
    this._spawnShell(muzzle, camDir);

    const spreadBase = w.spread * (this.ads ? w.adsSpread : 1) + this.bloom;
    const dmgByPlayer = new Map();
    let headAny = false, hitPoint = null, firstEnd = null;

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
      if (res) {
        headAny = headAny || res.head;
        if (res.playerId !== undefined) {
          dmgByPlayer.set(res.playerId, (dmgByPlayer.get(res.playerId) || 0) + res.dmg);
          hitPoint = hitPoint || res.point;
        }
      }
    }

    let totalDmg = 0;
    for (const [pid, dmg] of dmgByPlayer) {
      totalDmg += dmg;
      this.net.send({ t: 'hit', to: pid, d: dmg });
    }
    if (totalDmg > 0) {
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
      const s = this.scores.get(this.myId);
      s.kills++;
      sfx.kill();
      this._feed('You eliminated a dummy');
      this._refreshScores();
    }
  }

  // ===================== effects =====================
  _spawnShell(muzzle, camDir) {
    if (this.shells.length > 24) return;
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.025, 0.025, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xc9a14e, roughness: 0.3, metalness: 0.9 }));
    mesh.position.copy(muzzle).addScaledVector(camDir, -0.5).addScaledVector(right, 0.12);
    mesh.userData.noHit = true;
    this.scene.add(mesh);
    this.shells.push({
      mesh,
      vel: right.clone().multiplyScalar(1.6 + Math.random())
        .add(new THREE.Vector3(0, 2.2 + Math.random(), 0)),
      rot: new THREE.Vector3(Math.random() * 14, Math.random() * 14, Math.random() * 14),
      life: 0.9,
    });
  }

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
    if (this.flashT > 0) {
      this.flashT -= dt;
      const f = Math.max(0, this.flashT / 0.05);
      this.flashLight.intensity = f * 9;
      this.flashSprite.visible = f > 0;
      const fs = 0.45 + f * 0.5;
      this.flashSprite.scale.set(fs, fs, 1);
      this.flashSprite.material.opacity = f;
    } else {
      this.flashSprite.visible = false;
    }
    // shell casings
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      s.life -= dt;
      s.vel.y -= 11 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.mesh.rotation.x += s.rot.x * dt;
      s.mesh.rotation.y += s.rot.y * dt;
      s.mesh.rotation.z += s.rot.z * dt;
      if (s.life < 0.2) s.mesh.scale.setScalar(Math.max(0.01, s.life / 0.2));
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        s.mesh.material.dispose();
        this.shells.splice(i, 1);
      }
    }
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
  _takeDamage(dmg, fromId) {
    if (this.dead || this.over || this.phase === 'bus' || this.state !== 'match') return;
    this.hp -= dmg;
    this.lastHitBy = fromId;
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
    this.meAvatar.group.visible = false;
    const killer = this.lastHitBy !== null ? this.scores.get(this.lastHitBy) : null;
    if (killer) killer.kills++;
    sfx.die();
    this._feed(`☠ ${killer ? killer.name : 'Someone'} eliminated you`);
    if (!this.net) {
      // practice: respawn as before
      this.respawnT = RESPAWN_TIME;
      this.ui.deathSub.innerHTML = 'Respawning in <span id="respawnTimer">3</span>…';
      this.ui.respawnTimer = el('respawnTimer');
      this.ui.deathOverlay.classList.remove('hidden');
      this._refreshScores();
      return;
    }
    // battle royale: one life — spectate until the round ends
    this.net.send({ t: 'die', by: this.lastHitBy });
    this.scores.get(this.myId).alive = false;
    this.ui.deathSub.textContent = 'Spectating until the round ends — WASD to fly';
    this.ui.deathOverlay.classList.remove('hidden');
    setTimeout(() => {
      if (this.dead && this.state === 'match') this.ui.deathOverlay.classList.add('hidden');
    }, 2600);
    this.pitch = -0.3;
    this.pos.y = Math.max(this.pos.y, 6);
    this._refreshScores();
    this._checkRound();
  }

  _deathTick(dt) {
    this.respawnT -= dt;
    this.ui.respawnTimer.textContent = Math.max(1, Math.ceil(this.respawnT));
    if (this.respawnT <= 0) this._respawn();
  }

  _respawn() {
    const spawn = SPAWNS[this.myId % SPAWNS.length];
    this.pos.set(spawn.pos[0], 45, spawn.pos[2]);
    this.vel.set(0, -2, 0);
    this.yaw = spawn.yaw;
    this.pitch = 0;
    this.hp = 100;
    this.dead = false;
    this.phase = 'sky'; // glide back in
    this.grounded = false;
    this.lastHitBy = null;
    this.meAvatar.group.visible = true;
    this.ammo = WEAPONS.map(w => w.mag);
    this.reloadT = 0;
    this.ui.deathOverlay.classList.add('hidden');
    if (this.net) this.net.send({ t: 'hp', v: 100 });
    this._refreshHud();
  }

  // ===================== battle royale rounds & lobby =====================
  _toggleReady() {
    if (this.state !== 'lobby' || !this.net) return;
    this.myReady = !this.myReady;
    this.scores.get(this.myId).ready = this.myReady;
    sfx.unlock();
    sfx.reload();
    this.net.send({ t: 'ready', v: this.myReady ? 1 : 0 });
    this._refreshLobby();
    this._maybeStart();
  }

  // host: start the round once 2+ players are all ready
  _maybeStart() {
    if (!this.net || !this.net.isHost || this.state !== 'lobby') return;
    if (this.scores.size < 2) return;
    for (const s of this.scores.values()) if (!s.ready) return;
    this.net.send({ t: 'start' });
    this._startMatch();
  }

  _startMatch() {
    this.state = 'match';
    this.builds.clearAll();
    for (const s of this.scores.values()) { s.kills = 0; s.alive = true; }
    for (const p of this.players.values()) {
      p.alive = true;
      p.avatar.group.visible = true;
      p.hpBar.draw(100);
      p.targetPos.copy(BUS_FROM);
      p.avatar.group.position.copy(BUS_FROM);
      p.gliding = true;
    }
    this.hp = 100;
    this.dead = false;
    this.lastHitBy = null;
    this.ammo = WEAPONS.map(w => w.mag);
    this.reloadT = 0;
    this.mode = 'weapon';
    this.weaponIdx = 0;
    this.meAvatar.group.visible = true;
    this.vel.set(0, 0, 0);
    this.phase = 'bus';
    this.busT = 0;
    this.busBob = 0;
    this.bus.visible = true;
    this.yaw = Math.atan2(-this.busDir.x, -this.busDir.z);
    this.pitch = 0;
    this.ui.lobby.classList.add('hidden');
    this.ui.deathOverlay.classList.add('hidden');
    this.ui.banner.classList.add('hidden');
    if (!this._locked()) this.ui.lockOverlay.classList.remove('hidden');
    this._refreshHud();
    this._refreshScores();
    this._refreshSlots();
  }

  // host: end the round when at most one player is left standing
  _checkRound() {
    if (!this.net || !this.net.isHost || this.state !== 'match') return;
    const alive = [...this.scores.entries()].filter(([, s]) => s.alive);
    if (this.scores.size >= 2 && alive.length <= 1) {
      const w = alive.length ? alive[0][0] : null;
      this.net.send({ t: 'roundover', w });
      this._endRound(w);
    }
  }

  _endRound(w) {
    if (this.state !== 'match') return;
    this.state = 'roundover';
    sfx.busStop();
    // reset ready states here (synchronized across peers) so a fast guest's
    // ready click in the next lobby can't be clobbered by a slower peer's reset
    this.myReady = false;
    for (const s of this.scores.values()) s.ready = false;
    const winScore = (w !== null && w !== undefined) ? this.scores.get(w) : null;
    if (winScore) winScore.wins++;
    this.ui.banner.textContent = w === this.myId ? '🏆 VICTORY ROYALE!'
      : winScore ? `👑 ${winScore.name} WINS THE ROUND` : 'ROUND OVER';
    this.ui.banner.classList.remove('hidden');
    (w === this.myId) ? sfx.win() : sfx.lose();
    this.ui.deathOverlay.classList.add('hidden');
    this.mouseDown = false;
    this._refreshScores();
    setTimeout(() => this._enterLobby(), 5000);
  }

  _enterLobby() {
    this.state = 'lobby';
    this.phase = 'normal';
    this.dead = false;
    this.hp = 100;
    this.busT = 0;
    this.bus.visible = false;
    sfx.busStop();
    this.builds.clearAll();
    for (const s of this.scores.values()) { s.alive = false; s.kills = 0; }
    for (const p of this.players.values()) {
      p.alive = true;
      p.avatar.group.visible = true;
      p.hpBar.draw(100);
      p.gliding = false;
      p.speed = 0;
      p.grounded = true;
    }
    this.meAvatar.group.visible = true;
    this.mouseDown = false;
    this.ads = false;
    if (document.exitPointerLock) document.exitPointerLock();
    this.builds.hideGhosts();
    this.ui.lockOverlay.classList.add('hidden');
    this.ui.banner.classList.add('hidden');
    this.ui.deathOverlay.classList.add('hidden');
    this.ui.scope.classList.add('hidden');
    this.ui.lobby.classList.remove('hidden');
    this._refreshLobby();
    this._refreshScores();
    this._refreshHud();
    this._maybeStart(); // guests may have readied during the results banner
  }

  _refreshLobby() {
    if (!this.net || !this.ui) return;
    const rows = [...this.scores.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([id, s]) => {
        const color = '#' + COLORS[id % COLORS.length].toString(16).padStart(6, '0');
        const me = id === this.myId;
        return `<div class="lobby-row${s.ready ? ' ready' : ''}">` +
          `<span class="dot" style="background:${color}"></span>` +
          `<span class="lname">${esc(s.name)}${me ? ' (you)' : ''}</span>` +
          `<span class="lwins">👑 ${s.wins}</span>` +
          `<span class="lready">${s.ready ? 'READY ✔' : 'waiting…'}</span></div>`;
      });
    this.ui.lobbyList.innerHTML = rows.join('');
    this.ui.btnReady.textContent = this.myReady ? '✖ UNREADY' : '✔ READY UP';
    this.ui.btnReady.classList.toggle('is-ready', this.myReady);
    const allReady = [...this.scores.values()].every(s => s.ready);
    this.ui.lobbyStatus.textContent = this.scores.size < 2
      ? 'Waiting for players — share the room code!'
      : allReady ? 'Starting…' : 'Round starts when everyone is ready';
  }

  // ===================== camera & avatars =====================
  _updateCamera(dt) {
    if (this.state === 'lobby') {
      // slow cinematic orbit around the podium
      this.lobbyAngle += dt * 0.12;
      const a = this.lobbyAngle;
      this.camera.position.set(Math.sin(a) * 13, 5.5, 13 * Math.cos(a));
      this.camera.lookAt(0, 3, 1);
      this.camera.fov += (60 - this.camera.fov) * Math.min(1, dt * 5);
      this.camera.updateProjectionMatrix();
      return;
    }
    const w = WEAPONS[this.weaponIdx];
    const targetFov = (this.ads && this.mode === 'weapon' && this.phase === 'normal') ? w.zoom : 75;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 12);
    this.camera.updateProjectionMatrix();

    this.camRoll *= 1 - Math.min(1, dt * 9);
    this.camera.rotation.set(this.pitch, this.yaw, this.camRoll);

    const look = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const pivot = this.pos.clone();
    pivot.y += EYE;
    pivot.addScaledVector(right, 0.7);

    const wantDist = this.phase === 'bus' ? 9
      : (this.ads && this.mode === 'weapon' && !w.melee) ? 2.3 : 3.6;
    this.camDist += (wantDist - this.camDist) * Math.min(1, dt * 10);

    let dist = this.camDist;
    this.raycaster.set(pivot, look.clone().negate());
    this.raycaster.far = dist;
    const blockers = [...this.builds.group.children, ...this.staticMeshes, this.groundMesh];
    const hits = this.raycaster.intersectObjects(blockers, true);
    for (const h of hits) {
      if (h.object.userData.noHit || h.object.userData.noCam) continue;
      dist = Math.max(0.4, h.distance - 0.25);
      break;
    }

    this.camera.position.copy(pivot).addScaledVector(look, -dist).add(new THREE.Vector3(0, 0.18, 0));
  }

  _updateAvatars(dt) {
    if (this.state === 'lobby') {
      // line everyone up on the center platform
      const ids = [this.myId, ...this.players.keys()].sort((a, b) => a - b);
      ids.forEach((id, i) => {
        const av = id === this.myId ? this.meAvatar : this.players.get(id).avatar;
        av.group.visible = true;
        av.group.position.set((i - (ids.length - 1) / 2) * 1.7, 1.5, 2);
        av.group.rotation.y = 0;
        av.update(dt, { speed: 0, grounded: true, pitch: 0, item: 0 });
      });
      return;
    }
    this.meAvatar.group.visible = this.phase !== 'bus' && !this.dead;
    this.meAvatar.group.position.copy(this.pos);
    this.meAvatar.group.rotation.y = this.yaw;
    this.meAvatar.update(dt, {
      speed: Math.hypot(this.vel.x, this.vel.z),
      grounded: this.grounded,
      pitch: this.pitch,
      item: this._item(),
      recoilZ: this.gunKick,
      gliding: this.gliding,
      reloading: this.reloadT > 0,
    });

    const k = Math.min(1, dt * 14);
    for (const p of this.players.values()) {
      p.avatar.group.position.lerp(p.targetPos, k);
      let dy = p.targetYaw - p.avatar.group.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      p.avatar.group.rotation.y += dy * k;
      p.curPitch += (p.targetPitch - p.curPitch) * k;
      p.avatar.update(dt, {
        speed: p.speed, grounded: p.grounded, pitch: p.curPitch,
        item: p.item, gliding: p.gliding, reloading: p.reloading,
      });
    }

    for (const d of this.dummies) {
      if (d.alive) d.avatar.update(dt, { speed: 0, grounded: true, pitch: 0, item: 4 });
    }
  }

  // ===================== networking =====================
  _netTick(dt) {
    if (!this.net || this.state !== 'match' || this.dead) return;
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
        gl: (this.gliding || this.phase === 'bus') ? 1 : 0,
        r: this.reloadT > 0 ? 1 : 0,
      });
    }
  }

  _handleMsg(from, m) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'hello':
        this._setPlayerName(from, (m.name || 'Player').slice(0, 12));
        if (m.pv !== PROTO) {
          this._feed(`⚠ ${(m.name || 'A player')} has an old game version — ask them to hard-refresh (Ctrl+F5)`);
        }
        this._refreshLobby();
        this._maybeStart();
        break;
      case 'welcome': {
        for (const [pid, name, wins, ready, alive] of m.roster || []) {
          if (pid === this.myId) continue;
          this._setPlayerName(pid, name);
          const s = this.scores.get(pid);
          if (s) { s.wins = wins || 0; s.ready = !!ready; s.alive = !!alive; }
        }
        if (m.state === 'match') {
          // a round is already running — spectate it until it ends
          this.state = 'match';
          this.phase = 'normal';
          this.dead = true;
          this.scores.get(this.myId).alive = false;
          for (const [pid, s] of this.scores) {
            const p = this.players.get(pid);
            if (p && !s.alive) { p.alive = false; p.avatar.group.visible = false; }
          }
          this.meAvatar.group.visible = false;
          this.bus.visible = false;
          this.pos.set(0, 28, 42);
          this.yaw = 0;
          this.pitch = -0.45;
          this.builds.loadSnapshot(m.builds);
          this.ui.lobby.classList.add('hidden');
          this.ui.lockOverlay.classList.remove('hidden');
          this._feed('Round in progress — you join the next one');
        }
        this._refreshLobby();
        this._refreshScores();
        break;
      }
      case 'ready': {
        this._getPlayer(from);
        const s = this.scores.get(from);
        if (s) s.ready = !!m.v;
        this._refreshLobby();
        this._maybeStart();
        break;
      }
      case 'start':
        this._startMatch();
        break;
      case 'roundover':
        this._endRound(m.w);
        break;
      case 's': {
        const p = this._getPlayer(from);
        p.targetPos.set(m.p[0], m.p[1], m.p[2]);
        p.targetYaw = m.y;
        p.targetPitch = m.x;
        p.speed = m.m || 0;
        p.grounded = !!m.g;
        p.item = m.i ?? 0;
        p.gliding = !!m.gl;
        p.reloading = !!m.r;
        break;
      }
      case 'shoot': {
        const p = this._getPlayer(from);
        if (m.w === 3) { p.avatar.swing(); sfx.swing(); break; }
        const fromV = new THREE.Vector3(...m.f);
        const toV = new THREE.Vector3(...m.e);
        const w = WEAPONS[m.w] || WEAPONS[0];
        this._spawnTracer(fromV, toV, w.tracer);
        this.flashT = 0.05;
        this.flashLight.position.copy(fromV);
        sfx[w.sound]();
        break;
      }
      case 'hit':
        if (m.to === this.myId) this._takeDamage(m.d, from);
        break;
      case 'hp': {
        const p = this._getPlayer(from);
        p.hpBar.draw(m.v);
        break;
      }
      case 'die': {
        const p = this._getPlayer(from);
        p.alive = false;
        p.avatar.group.visible = false;
        const s = this.scores.get(from);
        if (s) s.alive = false;
        const killer = m.by !== null && m.by !== undefined ? this.scores.get(m.by) : null;
        if (killer) killer.kills++;
        if (m.by === this.myId) { sfx.kill(); }
        this._feed(`⚔ ${killer ? killer.name : 'Someone'} eliminated ${p.name}`);
        this._refreshScores();
        this._checkRound();
        break;
      }
      case 'build':
        if (this.builds.placeRaw(m.k, m.ty, m.p, m.ry, m.c ?? COLORS[from % COLORS.length])) sfx.build();
        break;
      case 'bhit':
        if (this.builds.damage(m.k, m.d)) sfx.breakWall();
        break;
      case 'edit':
        if (this.builds.applyEdit(m.k, m.e)) sfx.build();
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

    if (this.mode === 'weapon') {
      const w = WEAPONS[this.weaponIdx];
      this.ui.weaponName.textContent = w.name;
      if (w.melee) {
        this.ui.ammoText.textContent = '—';
        this.ui.ammoText.classList.remove('reloading');
        this.ui.reloadBar.classList.add('hidden');
      } else if (this.reloadT > 0) {
        this.ui.ammoText.textContent = 'RELOADING…';
        this.ui.ammoText.classList.add('reloading');
        this.ui.reloadBar.classList.remove('hidden');
        this.ui.reloadFill.style.width = `${Math.min(100, (1 - this.reloadT / w.reload) * 100)}%`;
      } else {
        this.ui.ammoText.textContent = `${this.ammo[this.weaponIdx]} / ∞`;
        this.ui.ammoText.classList.remove('reloading');
        this.ui.reloadBar.classList.add('hidden');
      }
    } else {
      this.ui.weaponName.textContent = ['Wall', 'Floor', 'Ramp'][this.buildIdx] + '  (F edits)';
      this.ui.ammoText.textContent = 'BUILD';
      this.ui.ammoText.classList.remove('reloading');
      this.ui.reloadBar.classList.add('hidden');
    }
  }

  _refreshScores() {
    const inMatch = this.net && this.state === 'match';
    const rows = [...this.scores.entries()]
      .sort((a, b) => (b[1].wins - a[1].wins) || (b[1].kills - a[1].kills))
      .map(([id, s]) => {
        const me = id === this.myId;
        const color = '#' + COLORS[id % COLORS.length].toString(16).padStart(6, '0');
        const dead = inMatch && !s.alive ? ' 💀' : '';
        return `<div class="score-row${me ? ' me' : ''}">` +
          `<span class="dot" style="background:${color}"></span>` +
          `<span class="sname">${esc(s.name)}${dead}</span>` +
          `<span class="skills">${s.kills}${this.net ? ` · 👑${s.wins}` : ''}</span></div>`;
      });
    this.ui.scoreList.innerHTML = rows.join('');

    if (inMatch) {
      const aliveN = [...this.scores.values()].filter(s => s.alive).length;
      this.ui.aliveBadge.textContent = `👥 ${aliveN} ALIVE`;
      this.ui.aliveBadge.classList.remove('hidden');
    } else {
      this.ui.aliveBadge.classList.add('hidden');
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
