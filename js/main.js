import { Game } from './game.js';
import { Net } from './net.js';
import { sfx } from './sfx.js';

const $ = (id) => document.getElementById(id);

const menu = $('menu');
const hud = $('hud');
const status = $('menuStatus');
const nameInput = $('nameInput');
const codeInput = $('codeInput');
const lockOverlay = $('lockOverlay');

nameInput.value = localStorage.getItem('ovob_name') || '';

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

function startGame(isHost, roomCode) {
  menu.classList.add('hidden');
  hud.classList.remove('hidden');
  if (roomCode) {
    const badge = $('roomBadge');
    badge.textContent = `ROOM ${roomCode}`;
    badge.classList.remove('hidden');
  }
  game = new Game({ net, isHost, myName: myName(), container: document.body });
  window.__game = game; // debug/test handle

  if (net) {
    net.onClose = () => {
      document.exitPointerLock();
      $('disconnectOverlay').classList.remove('hidden');
    };
  }

  // pointer lock flow
  const canvas = game.renderer.domElement;
  const tryLock = () => { sfx.unlock(); canvas.requestPointerLock(); };
  canvas.addEventListener('click', tryLock);
  lockOverlay.addEventListener('click', tryLock);
  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    lockOverlay.classList.toggle('hidden', locked);
  });
  tryLock();
}

$('btnPractice').addEventListener('click', () => {
  if (busy || game) return;
  net = null;
  startGame(true, null);
});

$('btnCreate').addEventListener('click', () => {
  if (busy || game) return;
  busy = true;
  const code = randomCode();
  status.textContent = 'Creating room…';
  net = new Net();
  net.host(code, {
    onWaiting: () => {
      status.innerHTML = `Room code: <b style="font-size:26px;letter-spacing:6px">${code}</b><br>Send it to a friend — waiting for them to join…`;
    },
    onConnected: () => startGame(true, code),
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
    onConnected: () => startGame(false, code),
    onError: (msg) => { status.textContent = msg; busy = false; },
  });
}

$('btnJoinGo').addEventListener('click', doJoin);
codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });

$('btnBackMenu').addEventListener('click', () => location.reload());
