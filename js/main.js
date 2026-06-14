import { Game } from './game.js';
import { Net } from './net.js';
import { sfx } from './sfx.js';
import { loadSettings, saveSettings, COLOR_SWATCHES, DEFAULT_BINDS, BIND_LABELS, keyName,
  EMOTE_NAMES, saveEmoteAudio, clearEmoteAudio, getEmoteAudio } from './settings.js';
import { signUp, signIn, signOut, getProfile, onAuthChange } from './auth.js';

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
  applyCheats();              // carry over any admin toggles into the new game
  refreshAdminButton();       // show the in-game ADMIN button for admins

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
function assignBind(code) {
  // free the input from any other action, then assign
  for (const a of Object.keys(settings.binds)) if (settings.binds[a] === code) delete settings.binds[a];
  settings.binds[listening.action] = code;
  saveSettings(settings);
  listening.btn.classList.remove('listening');
  listening = null;
  renderSettings();
}
window.addEventListener('keydown', (e) => {
  if (!listening) return;
  e.preventDefault();
  if (e.code === 'Escape') { listening.btn.classList.remove('listening'); listening = null; renderSettings(); }
  else assignBind(e.code);
}, true);
// allow binding mouse buttons (for fire/aim etc.) while listening
window.addEventListener('mousedown', (e) => {
  if (!listening) return;
  e.preventDefault(); e.stopPropagation();
  assignBind('Mouse' + e.button);
}, true);

$('customColor').addEventListener('input', (e) => {
  settings.color = parseInt(e.target.value.slice(1), 16);
  saveSettings(settings);
  renderSettings();
});
$('btnResetBinds').addEventListener('click', () => { settings.binds = { ...DEFAULT_BINDS }; saveSettings(settings); renderSettings(); });
$('btnSettings').addEventListener('click', () => { renderSettings(); settingsEl.classList.remove('hidden'); });
$('btnCloseSettings').addEventListener('click', () => settingsEl.classList.add('hidden'));

// ===================== accounts (Supabase) + admin panel =====================
let profile = null;                 // { username, is_admin } when logged in
const cheatState = { fly: false, aimbot: false, wallhack: false };

function isAdmin() { return !!(profile && profile.is_admin); }

function applyCheats() {
  if (!game) return;
  for (const k of Object.keys(cheatState)) game.setCheat(k, isAdmin() && cheatState[k]);
}

function refreshAdminButton() {
  $('adminBtn').classList.toggle('hidden', !(game && isAdmin()));
}

async function refreshAccount() {
  profile = await getProfile();
  const info = $('accountInfo');
  if (profile) {
    info.textContent = `👤 ${profile.username}${profile.is_admin ? ' · ADMIN' : ''}`;
    $('btnAccount').classList.add('hidden');
    $('btnLogout').classList.remove('hidden');
    if (!nameInput.value.trim() && profile.username) nameInput.value = profile.username;
  } else {
    info.textContent = 'Playing as guest';
    $('btnAccount').classList.remove('hidden');
    $('btnLogout').classList.add('hidden');
    // a guest can't keep cheats on
    for (const k of Object.keys(cheatState)) cheatState[k] = false;
  }
  refreshAdminButton();
  applyCheats();
}

// ---- auth overlay ----
const authEl = $('authOverlay');
let authMode = 'login'; // 'login' | 'signup'

function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === 'signup';
  $('authTitle').textContent = signup ? 'Create account' : 'Log in';
  $('authSubmit').textContent = signup ? 'SIGN UP' : 'LOG IN';
  $('authUser').classList.toggle('hidden', !signup);
  $('authSwitchText').textContent = signup ? 'Have an account?' : 'No account?';
  $('authSwitch').textContent = signup ? 'Log in' : 'Create one';
  $('authStatus').textContent = '';
}

function openAuth() { setAuthMode('login'); authEl.classList.remove('hidden'); $('authEmail').focus(); }
function closeAuth() { authEl.classList.add('hidden'); }

$('btnAccount').addEventListener('click', openAuth);
$('authClose').addEventListener('click', closeAuth);
$('authSwitch').addEventListener('click', () => setAuthMode(authMode === 'login' ? 'signup' : 'login'));

$('authSubmit').addEventListener('click', async () => {
  const email = $('authEmail').value.trim();
  const pass = $('authPass').value;
  const user = $('authUser').value.trim();
  const st = $('authStatus');
  if (!email || !pass) { st.textContent = 'Enter your email and password.'; return; }
  st.textContent = 'Working…';
  const res = authMode === 'signup' ? await signUp(email, pass, user || email.split('@')[0])
                                    : await signIn(email, pass);
  if (!res.ok) { st.textContent = res.error; return; }
  if (res.needsConfirm) {
    st.textContent = 'Check your email to confirm, then log in.';
    setAuthMode('login');
    return;
  }
  await refreshAccount();
  closeAuth();
});

$('btnLogout').addEventListener('click', async () => { await signOut(); await refreshAccount(); });

// ---- admin panel ----
const adminEl = $('adminPanel');
const cheatBoxes = { fly: $('cheatFly'), aimbot: $('cheatAimbot'), wallhack: $('cheatWallhack') };

function openAdmin() {
  if (!isAdmin()) return;
  for (const k of Object.keys(cheatBoxes)) cheatBoxes[k].checked = cheatState[k];
  if (game && game.state === 'match') document.exitPointerLock();
  adminEl.classList.remove('hidden');
}
function closeAdmin() { adminEl.classList.add('hidden'); }

for (const k of Object.keys(cheatBoxes)) {
  cheatBoxes[k].addEventListener('change', () => {
    cheatState[k] = cheatBoxes[k].checked;
    if (game) game.setCheat(k, isAdmin() && cheatState[k]);
  });
}
$('adminClose').addEventListener('click', closeAdmin);
$('adminBtn').addEventListener('click', openAdmin);

// press P in game to toggle the admin panel
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP' && isAdmin() && game) {
    e.preventDefault();
    adminEl.classList.contains('hidden') ? openAdmin() : closeAdmin();
  }
});

onAuthChange(() => { refreshAccount(); });
refreshAccount();
