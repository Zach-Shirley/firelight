// Procedural sound: fire crackle, wind, knocks and a scare sting.
// Everything is generated with the Web Audio API, so there are no sound files.

let ctx = null;
let master, fireGain, windGain, noiseBuf;
let enabled = true;

function makeNoise(seconds) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function loop(filterType, freq, q, gainNode) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filterType;
  f.frequency.value = freq;
  f.Q.value = q;
  src.connect(f).connect(gainNode);
  src.start();
}

// Browsers only allow audio after the player interacts, so this runs on the first click or key.
export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = enabled ? 0.8 : 0;
  master.connect(ctx.destination);
  noiseBuf = makeNoise(2);

  fireGain = ctx.createGain(); fireGain.gain.value = 0; fireGain.connect(master);
  windGain = ctx.createGain(); windGain.gain.value = 0; windGain.connect(master);
  loop('bandpass', 700, 0.7, fireGain);   // soft roar of the fire
  loop('lowpass', 320, 1.5, windGain);    // wind outside
}

export function setEnabled(on) {
  enabled = on;
  if (master) master.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.1);
}

export function isEnabled() { return enabled; }

const FIRE_VOL = [0, 0.03, 0.05, 0.075, 0.1];

export function setLevels(fire, time, doorOpen) {
  if (!ctx) return;
  const t = ctx.currentTime;
  fireGain.gain.setTargetAtTime(FIRE_VOL[fire] || 0, t, 0.6);
  const gust = 0.5 + 0.5 * Math.sin(time * 0.37) * Math.sin(time * 0.11 + 1);
  const wind = (fire <= 1 ? 0.07 : 0.035) * (0.5 + gust) + doorOpen * 0.08;
  windGain.gain.setTargetAtTime(wind, t, 0.8);
}

// One crackle or pop from the fire.
export function crackle(fire) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1500 + Math.random() * 2500;
  const g = ctx.createGain();
  const vol = (0.05 + Math.random() * 0.12) * (0.5 + fire * 0.2);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.02 + Math.random() * 0.04);
  src.connect(hp).connect(g).connect(master);
  src.start(t, Math.random() * 1.5, 0.08);
}

function thud(at, vol = 0.5) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(110, at);
  o.frequency.exponentialRampToValueAtTime(45, at + 0.12);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
  o.connect(g).connect(master);
  o.start(at);
  o.stop(at + 0.2);
}

export function knock(times = 3, slow = false) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime + 0.05;
  for (let i = 0; i < times; i++) thud(t + i * (slow ? 0.6 : 0.28));
}

export function tap() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime + 0.05;
  for (let i = 0; i < 3; i++) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = 2400;
    const at = t + i * 0.7;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.08, at + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    o.connect(g).connect(master);
    o.start(at);
    o.stop(at + 0.06);
  }
}

export function scratch() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime + 0.05;
  for (let i = 0; i < 3; i++) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 4;
    const at = t + i * 0.9;
    bp.frequency.setValueAtTime(900, at);
    bp.frequency.linearRampToValueAtTime(1600, at + 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.12, at + 0.1);
    g.gain.linearRampToValueAtTime(0.0001, at + 0.6);
    src.connect(bp).connect(g).connect(master);
    src.start(at, Math.random(), 0.7);
  }
}

export function sting() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  [103, 109, 155, 233].forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = i < 2 ? 'sawtooth' : 'square';
    o.frequency.setValueAtTime(f, t);
    o.frequency.linearRampToValueAtTime(f * 0.94, t + 1.4);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 1.6);
  });
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.25, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  src.connect(g).connect(master);
  src.start(t, 0, 0.5);
}

export function chime() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  [523, 659].forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = f;
    const at = t + i * 0.08;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.05, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
    o.connect(g).connect(master);
    o.start(at);
    o.stop(at + 0.55);
  });
}

// A heartbeat when the dark is close: two low thumps.
export function heartbeat(strength = 1) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime + 0.02;
  thud(t, 0.35 * strength);
  thud(t + 0.22, 0.22 * strength);
}

// A gust of wind forcing its way through the cracks.
export function gust() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(300, t);
  lp.frequency.linearRampToValueAtTime(1400, t + 0.6);
  lp.frequency.linearRampToValueAtTime(250, t + 1.8);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.3, t + 0.5);
  g.gain.linearRampToValueAtTime(0.0001, t + 1.9);
  src.connect(lp).connect(g).connect(master);
  src.start(t, 0, 2);
}

// The door crashing open at the end.
export function slam() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  thud(t, 0.9);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  src.connect(lp).connect(g).connect(master);
  src.start(t, 0, 0.8);
}

// Morning: a soft rising chord.
export function dawn() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  [262, 330, 392, 523].forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    const at = t + i * 0.35;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.05, at + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 4);
    o.connect(g).connect(master);
    o.start(at);
    o.stop(at + 4.1);
  });
}

// Footsteps crunching through snow toward the door.
export function footsteps(count = 5) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime + 0.05;
  for (let i = 0; i < count; i++) {
    const at = t + i * 0.42 + Math.random() * 0.06;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 500 + Math.random() * 300;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    const vol = 0.05 + i * 0.025;   // getting closer
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
    src.connect(bp).connect(g).connect(master);
    src.start(at, Math.random() * 1.5, 0.2);
  }
}

// A long, low howl from the trees.
export function howl() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  const g = ctx.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(140, t);
  o.frequency.linearRampToValueAtTime(260, t + 0.9);
  o.frequency.linearRampToValueAtTime(190, t + 2.6);
  lfo.frequency.value = 5;
  lfoGain.gain.value = 6;
  lfo.connect(lfoGain).connect(o.frequency);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.06, t + 0.6);
  g.gain.linearRampToValueAtTime(0.0001, t + 2.8);
  o.connect(lp).connect(g).connect(master);
  o.start(t); lfo.start(t);
  o.stop(t + 2.9); lfo.stop(t + 2.9);
}

// A board splintering.
export function crack() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  thud(t, 0.5);
  for (let i = 0; i < 4; i++) {
    const at = t + i * 0.035;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1200 + i * 400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.08);
    src.connect(hp).connect(g).connect(master);
    src.start(at, Math.random(), 0.1);
  }
}

// Burning branch on something that is not a hand.
export function hiss() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.18, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
  src.connect(hp).connect(g).connect(master);
  src.start(t, 0, 1);
}

// Death: a low, falling drone.
export function death() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  [55, 58, 82].forEach((f) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.5, t + 3);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.08, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    o.connect(lp).connect(g).connect(master);
    o.start(t);
    o.stop(t + 3.3);
  });
}
