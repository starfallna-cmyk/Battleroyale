// Tiny WebAudio sound effects — no audio files needed.
let ctx = null;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noiseBuffer(c, dur) {
  const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function envGain(c, vol, dur) {
  const g = c.createGain();
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  g.connect(c.destination);
  return g;
}

function burst(vol, dur, filterFreq) {
  const c = ac();
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, dur);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = filterFreq;
  src.connect(f);
  f.connect(envGain(c, vol, dur));
  src.start();
}

function tone(freq, vol, dur, type = 'square') {
  const c = ac();
  const o = c.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.connect(envGain(c, vol, dur));
  o.start();
  o.stop(c.currentTime + dur);
}

export const sfx = {
  unlock() { ac(); }, // call on first user gesture
  shoot()    { burst(0.25, 0.12, 1800); tone(160, 0.1, 0.08, 'sawtooth'); },
  shotgun()  { burst(0.35, 0.22, 1200); tone(90, 0.15, 0.15, 'sawtooth'); },
  sniper()   { burst(0.35, 0.3, 2500); tone(70, 0.18, 0.25, 'sawtooth'); },
  hit()      { tone(880, 0.12, 0.07); },
  kill()     { tone(523, 0.14, 0.12); setTimeout(() => tone(784, 0.14, 0.18), 90); },
  hurt()     { tone(110, 0.2, 0.18, 'triangle'); },
  die()      { tone(220, 0.15, 0.4, 'sawtooth'); setTimeout(() => tone(110, 0.15, 0.5, 'sawtooth'), 150); },
  build()    { tone(240, 0.16, 0.07, 'square'); tone(480, 0.08, 0.05, 'square'); },
  breakWall(){ burst(0.25, 0.18, 900); },
  reload()   { tone(420, 0.1, 0.05); setTimeout(() => tone(620, 0.1, 0.05), 120); },
  win()      { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.15, 0.25), i * 130)); },
  lose()     { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.15, 0.3, 'triangle'), i * 160)); },
};
