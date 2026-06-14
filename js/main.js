import { Game } from './game.js';
import { Net } from './net.js';
import { sfx } from './sfx.js';
import { loadSettings, saveSettings, COLOR_SWATCHES, DEFAULT_BINDS, BIND_LABELS, keyName,
  EMOTE_NAMES, saveEmoteAudio, clearEmoteAudio, getEmoteAudio } from './settings.js';

const $ = (id) => document.getElementById(id);

let settings = loadSettings();

const menu = $('menu');
const hud = $('hud');
const status = $('menuStatus');
const nameInput = $('nameInput');
const codeInput = $('codeInput');
const lockOverlay = $('lockOverlay');

nameInput.value = localStorage.getItem('ovob_name') || '';
sfx.menuMusicStart(); // background music on the main menu

let game = null;
let net = null;
let busy = false;

function myName() {
  const n = nameInput.value.trim() || 'Player';
  localStorage.setItem('ovob_name', n);
  return n;
}

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 4; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

function startGame(roomCode) {
  if (game) return;
  sfx.menuMusicStop(); // stop menu music when entering a game
  menu.classList.add('hidden');
  hud.classList.remove('hidden');
  if (roomCode) {
    const badge = $('roomBadge');
    badge.textContent = `ROOM ${roomCode} — share to invite (6 max)`;
    badge.classList.remove('hidden');
  }
  game = new Game({ net, myName: myName(), container: document.body, roomCode,
    myColor: settings.color, binds: settings.binds });
  window.__game = game; // debug/test handle

  if (net && !net.isHost) {
    net.onClose = () => {
      document.exitPointerLock();
      $('disconnectOverlay').classList.remove('hidden');
    };
  }

  const canvas = game.renderer.domElement;
  const tryLock = () => {
    if (game.state !== 'match') return; // mouse stays free in the lobby
    sfx.unlock();
    canvas.requestPointerLock();
  };
  // when a round begins, grab the mouse automatically (host is inside the
  // ready-click gesture; for guests the browser may require one click)
  game.onMatchStart = () => { sfx.unlock(); try { canvas.requestPointerLock(); } catch (e) { /* needs a click */ } };
  canvas.addEventListener('click', tryLock);
  lockOverlay.addEventListener('click', tryLock);
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    lockOverlay.classList.toggle('hidden', locked || game.state !== 'match');
  });
  if (!net) tryLock(); // practice goes straight in; net games sit in the lobby first
}

$('btnPractice').addEventListener('click', () => {
  if (busy || game) return;
  net = null;
  startGame(null);
});

$('btnCreate').addEventListener('click', () => {
  if (busy || game) return;
  busy = true;
  const code = randomCode();
  status.textContent = 'Creating room…';
  net = new Net();
  net.host(code, {
    onWaiting: () => startGame(code), // host plays right away; friends drop in
    onError: (msg) => { status.textContent = msg; busy = false; },
  });
});

$('btnJoin').addEventListener('click', () => {
  $('joinRow').classList.toggle('hidden');
  codeInput.focus();
});

function doJoin() {
  if (busy || game) return;
  const code = codeInput.value.trim().toUpperCase();
  if (code.length !== 4) { status.textContent = 'Enter the 4-letter room code.'; return; }
  busy = true;
  status.textContent = 'Connecting…';
  net = new Net();
  net.join(code, {
    onConnected: () => startGame(code),
    onError: (msg) => { status.textContent = msg; busy = false; },
  });
}

$('btnJoinGo').addEventListener('click', doJoin);
codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });

$('btnBackMenu').addEventListener('click', () => location.reload());

// ===================== settings page =====================
const settingsEl = $('settings');
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

function renderSettings() {
  // color swatches
  const sw = $('colorSwatches');
  sw.innerHTML = '';
  for (const col of COLOR_SWATCHES) {
    const d = document.createElement('div');
    d.className = 'swatch' + (col === settings.color ? ' sel' : '');
    d.style.background = hex(col);
    d.addEventListener('click', () => { settings.color = col; $('customColor').value = hex(col); saveSettings(settings); renderSettings(); });
    sw.appendChild(d);
  }
  $('customColor').value = hex(settings.color);
  // emote music uploads
  const elist = $('emoteList');
  elist.innerHTML = '';
  EMOTE_NAMES.forEach((name, idx) => {
    const row = document.createElement('div');
    row.className = 'emote-up-row';
    const n = document.createElement('span'); n.className = 'ename'; n.textContent = name;
    const status = document.createElement('span'); status.className = 'estatus';
    getEmoteAudio(idx).then((b) => { status.textContent = b ? '♪ custom' : ''; });
    const up = document.createElement('label'); up.className = 'up-btn'; up.textContent = 'Upload';
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'audio/*'; input.style.display = 'none';
    input.addEventListener('change', async () => {
      const f = input.files[0];
      if (f) { await saveEmoteAudio(idx, f); status.textContent = '♪ custom'; }
    });
    up.appendChild(input);
    const clr = document.createElement('button'); clr.className = 'clr-btn'; clr.textContent = '✕';
    clr.addEventListener('click', async () => { await clearEmoteAudio(idx); status.textContent = ''; });
    row.append(n, status, up, clr);
    elist.appendChild(row);
  });
  // keybinds
  const list = $('bindList');
  list.innerHTML = '';
  for (const action of Object.keys(DEFAULT_BINDS)) {
    const row = document.createElement('div');
    row.className = 'bind-row';
    const label = document.createElement('span');
    label.className = 'blabel';
    label.textContent = BIND_LABELS[action];
    const key = document.createElement('button');
    key.className = 'bind-key';
    key.textContent = keyName(settings.binds[action]);
    key.addEventListener('click', () => startListening(action, key));
    row.append(label, key);
    list.appendChild(row);
  }
}

let listening = null;
function startListening(action, btn) {
  if (listening) listening.btn.classList.remove('listening');
  listening = { action, btn };
  btn.classList.add('listening');
  btn.textContent = 'press…';
}
window.addEventListener('keydown', (e) => {
  if (!listening) return;
  e.preventDefault();
  if (e.code !== 'Escape') {
    // free the key from any other action, then assign
    for (const a of Object.keys(settings.binds)) if (settings.binds[a] === e.code) delete settings.binds[a];
    settings.binds[listening.action] = e.code;
    saveSettings(settings);
  }
  listening.btn.classList.remove('listening');
  listening = null;
  renderSettings();
}, true);

$('customColor').addEventListener('input', (e) => {
  settings.color = parseInt(e.target.value.slice(1), 16);
  saveSettings(settings);
  renderSettings();
});
$('btnResetBinds').addEventListener('click', () => { settings.binds = { ...DEFAULT_BINDS }; saveSettings(settings); renderSettings(); });
$('btnSettings').addEventListener('click', () => { renderSettings(); settingsEl.classList.remove('hidden'); });
$('btnCloseSettings').addEventListener('click', () => settingsEl.classList.add('hidden'));
