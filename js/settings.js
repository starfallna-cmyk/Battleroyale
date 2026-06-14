// Player settings (character color + keybinds), persisted to localStorage.
const KEY = 'killshot_settings_v1';

export const COLOR_SWATCHES = [
  0x4fc3f7, 0xff7043, 0x9ccc65, 0xffd54f, 0xba68c8, 0x4dd0e1,
  0xef5350, 0x26a69a, 0xffa726, 0xec407a, 0x7e57c2, 0xffffff,
];

// action -> default KeyboardEvent.code
export const DEFAULT_BINDS = {
  fire: 'Mouse0', aim: 'Mouse2',
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', sprint: 'ShiftLeft', reload: 'KeyR', edit: 'KeyF', emote: 'KeyB',
  w1: 'Digit1', w2: 'Digit2', w3: 'Digit3', w4: 'Digit4',
  wall: 'KeyZ', floor: 'KeyX', ramp: 'KeyC',
};

export const BIND_LABELS = {
  fire: 'Shoot / place', aim: 'Aim (scope)',
  forward: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right',
  jump: 'Jump / drop / swim up', sprint: 'Sprint / dive', reload: 'Reload', edit: 'Edit build',
  emote: 'Emote wheel (hold)',
  w1: 'Assault rifle', w2: 'Shotgun', w3: 'Sniper', w4: 'Pickaxe',
  wall: 'Build wall', floor: 'Build floor', ramp: 'Build ramp',
};

export const EMOTE_NAMES = ['Wave', 'Cheer', 'Floss', 'Robot'];

// uploaded per-emote music is stored as Blobs in IndexedDB (too big for localStorage)
let _db = null;
function db() {
  if (_db) return _db;
  _db = new Promise((resolve, reject) => {
    const req = indexedDB.open('killshot_emotes', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('audio');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _db;
}
export async function saveEmoteAudio(idx, blob) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction('audio', 'readwrite');
    tx.objectStore('audio').put(blob, idx);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}
export async function clearEmoteAudio(idx) {
  const d = await db();
  return new Promise((res) => {
    const tx = d.transaction('audio', 'readwrite');
    tx.objectStore('audio').delete(idx);
    tx.oncomplete = res; tx.onerror = res;
  });
}
export async function getEmoteAudio(idx) {
  const d = await db();
  return new Promise((res) => {
    const tx = d.transaction('audio', 'readonly');
    const r = tx.objectStore('audio').get(idx);
    r.onsuccess = () => res(r.result || null);
    r.onerror = () => res(null);
  });
}

export function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { s = {}; }
  return {
    color: typeof s.color === 'number' ? s.color : COLOR_SWATCHES[0],
    binds: { ...DEFAULT_BINDS, ...(s.binds || {}) },
  };
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify({ color: s.color, binds: s.binds })); } catch (e) { /* ignore */ }
}

// pretty label for a KeyboardEvent.code or a mouse token (Mouse0/1/2)
export function keyName(code) {
  if (!code) return '—';
  if (code === 'Mouse0') return 'L-MOUSE';
  if (code === 'Mouse1') return 'M-MOUSE';
  if (code === 'Mouse2') return 'R-MOUSE';
  if (code.startsWith('Mouse')) return 'MOUSE' + code.slice(5);
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return code.slice(5);
  return { Space: 'SPACE', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL',
    ControlRight: 'R-CTRL', AltLeft: 'L-ALT', Tab: 'TAB', Backquote: '`' }[code] || code;
}
