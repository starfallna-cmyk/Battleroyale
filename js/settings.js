// Player settings (character color + keybinds), persisted to localStorage.
const KEY = 'killshot_settings_v1';

export const COLOR_SWATCHES = [
  0x4fc3f7, 0xff7043, 0x9ccc65, 0xffd54f, 0xba68c8, 0x4dd0e1,
  0xef5350, 0x26a69a, 0xffa726, 0xec407a, 0x7e57c2, 0xffffff,
];

// action -> default KeyboardEvent.code
export const DEFAULT_BINDS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
  jump: 'Space', sprint: 'ShiftLeft', reload: 'KeyR', edit: 'KeyF',
  w1: 'Digit1', w2: 'Digit2', w3: 'Digit3', w4: 'Digit4',
  wall: 'KeyZ', floor: 'KeyX', ramp: 'KeyC',
};

export const BIND_LABELS = {
  forward: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right',
  jump: 'Jump / drop / swim up', sprint: 'Sprint / dive', reload: 'Reload', edit: 'Edit build',
  w1: 'Assault rifle', w2: 'Shotgun', w3: 'Sniper', w4: 'Pickaxe',
  wall: 'Build wall', floor: 'Build floor', ramp: 'Build ramp',
};

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

// pretty label for a KeyboardEvent.code
export function keyName(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return code.slice(5);
  return { Space: 'SPACE', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL',
    ControlRight: 'R-CTRL', AltLeft: 'L-ALT', Tab: 'TAB', Backquote: '`' }[code] || code;
}
