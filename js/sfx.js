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

let busNodes = null;
let music = null;

export const sfx = {
  unlock() { ac(); }, // call on first user gesture
  // gentle ambient lobby loop — slow chord pad + soft arpeggio, fully synthesized
  musicStart() {
    if (music) return;
    let c;
    try { c = ac(); } catch (e) { return; }
    const master = c.createGain();
    master.gain.value = 0;
    master.gain.linearRampToValueAtTime(0.16, c.currentTime + 2);
    master.connect(c.destination);
    // chords (root-relative semitone sets), cycled slowly
    const chords = [[0, 4, 7, 11], [-3, 0, 4, 9], [-5, -1, 2, 7], [2, 5, 9, 12]];
    const midi = (n) => 220 * Math.pow(2, n / 12);
    let i = 0;
    const playChord = () => {
      if (!music) return;
      const set = chords[i % chords.length]; i++;
      const dur = 4.2;
      set.forEach((n, k) => {
        const o = c.createOscillator(); o.type = k === 0 ? 'sine' : 'triangle';
        o.frequency.value = midi(n) / (k === 0 ? 2 : 1);
        o.detune.value = (Math.random() - 0.5) * 6;
        const g = c.createGain(); g.gain.value = 0;
        g.gain.linearRampToValueAtTime(0.09, c.currentTime + 1.2);
        g.gain.linearRampToValueAtTime(0.0001, c.currentTime + dur);
        o.connect(g); g.connect(master); o.start(); o.stop(c.currentTime + dur + 0.1);
      });
      // soft arpeggio sparkle
      set.forEach((n, k) => {
        const o = c.createOscillator(); o.type = 'sine';
        o.frequency.value = midi(n + 12);
        const g = c.createGain(); g.gain.value = 0;
        const t0 = c.currentTime + 0.4 + k * 0.45;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(0.05, t0 + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.9);
        o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 1);
      });
    };
    playChord();
    const timer = setInterval(playChord, 4000);
    music = { master, timer, c };
  },
  musicStop() {
    if (!music) return;
    const { master, timer, c } = music;
    music = null;
    clearInterval(timer);
    try {
      master.gain.cancelScheduledValues(c.currentTime);
      master.gain.setValueAtTime(master.gain.value, c.currentTime);
      master.gain.linearRampToValueAtTime(0, c.currentTime + 1);
      setTimeout(() => master.disconnect(), 1200);
    } catch (e) { /* already gone */ }
  },
  busStart() {
    if (busNodes) return;
    try {
      const c = ac();
      const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 52;
      const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 104;
      const g = c.createGain(); g.gain.value = 0.035;
      const lfo = c.createOscillator(); lfo.frequency.value = 8.5;
      const lg = c.createGain(); lg.gain.value = 0.012;
      lfo.connect(lg); lg.connect(g.gain);
      o1.connect(g); o2.connect(g); g.connect(c.destination);
      o1.start(); o2.start(); lfo.start();
      busNodes = { o1, o2, lfo, g, c };
    } catch (e) { /* audio not available yet */ }
  },
  busStop() {
    if (!busNodes) return;
    const { o1, o2, lfo, g, c } = busNodes;
    busNodes = null;
    try {
      g.gain.setValueAtTime(g.gain.value, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.5);
      setTimeout(() => { o1.stop(); o2.stop(); lfo.stop(); }, 550);
    } catch (e) { /* already torn down */ }
  },
  swing()    { burst(0.12, 0.12, 600); },
  step()     { burst(0.04, 0.045, 480); },
  land()     { tone(85, 0.18, 0.13, 'triangle'); burst(0.1, 0.08, 380); },
  thunk()    { tone(140, 0.22, 0.1, 'triangle'); burst(0.15, 0.08, 500); },
  pad()      { tone(330, 0.18, 0.12); setTimeout(() => tone(520, 0.16, 0.18), 60); },
  headshot() { tone(1320, 0.14, 0.09); },
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
