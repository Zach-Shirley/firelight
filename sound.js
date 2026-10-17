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
  master.gain.value = audible() ? 0.8 : 0;
  master.connect(ctx.destination);
  noiseBuf = makeNoise(2);

  fireGain = ctx.createGain(); fireGain.gain.value = 0; fireGain.connect(master);
  windGain = ctx.createGain(); windGain.gain.value = 0; windGain.connect(master);
  loop('bandpass', 700, 0.7, fireGain);   // soft roar of the fire
  loop('lowpass', 320, 1.5, windGain);    // wind outside
}

let hidden = false;
const audible = () => enabled && !hidden;

export function setEnabled(on) {
  enabled = on;
  if (master) master.gain.setTargetAtTime(audible() ? 0.8 : 0, ctx.currentTime, 0.1);
}

// Silence everything while the tab is in the background.
export function setHidden(h) {
  hidden = h;
  if (master) master.gain.setTargetAtTime(audible() ? 0.8 : 0, ctx.currentTime, 0.05);
}

export function isEnabled() { return enabled; }

const FIRE_VOL = [0, 0.03, 0.05, 0.075, 0.1];

export function setLevels(fire, time, doorOpen, windowOpen = 0) {
  if (!ctx) return;
  const t = ctx.currentTime;
  fireGain.gain.setTargetAtTime(FIRE_VOL[fire] || 0, t, 0.6);
  const gust = 0.5 + 0.5 * Math.sin(time * 0.37) * Math.sin(time * 0.11 + 1);
  const wind = (fire <= 1 ? 0.07 : 0.035) * (0.5 + gust) + doorOpen * 0.08 + windowOpen * 0.06 * (0.6 + gust);
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

// Glass shattering inward.
export function shatter() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  thud(t, 0.6);
  for (let i = 0; i < 9; i++) {
    const at = t + Math.random() * 0.35;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = 2200 + Math.random() * 3500;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.06, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.12 + Math.random() * 0.2);
    o.connect(g).connect(master);
    o.start(at);
    o.stop(at + 0.4);
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.3, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  src.connect(hp).connect(g).connect(master);
  src.start(t, 0, 0.7);
}

// One beat of the claw working at the boards: a dull thump with a scrape.
export function thump(strength = 1) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  thud(t, 0.32 * strength);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(700, t);
  bp.frequency.linearRampToValueAtTime(1300, t + 0.25);
  bp.Q.value = 3;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.07 * strength, t + 0.05);
  g.gain.linearRampToValueAtTime(0.0001, t + 0.3);
  src.connect(bp).connect(g).connect(master);
  src.start(t, Math.random(), 0.35);
}

// A scream outside, cut short.
export function scream() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(520, t);
  o.frequency.linearRampToValueAtTime(880, t + 0.25);
  o.frequency.linearRampToValueAtTime(700, t + 0.7);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1100;
  bp.Q.value = 2;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.06, t + 0.08);
  g.gain.setValueAtTime(0.06, t + 0.62);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
  o.connect(bp).connect(g).connect(master);
  o.start(t);
  o.stop(t + 0.75);
}

// A hollow, rumbling stomach.
export function growl(strength = 1) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  const g = ctx.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(70, t);
  o.frequency.linearRampToValueAtTime(95, t + 0.5);
  o.frequency.linearRampToValueAtTime(60, t + 1.3);
  lfo.frequency.value = 11;
  lfoGain.gain.value = 18;
  lfo.connect(lfoGain).connect(o.frequency);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 260;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.16 * strength, t + 0.2);
  g.gain.linearRampToValueAtTime(0.1 * strength, t + 0.8);
  g.gain.linearRampToValueAtTime(0.0001, t + 1.4);
  o.connect(lp).connect(g).connect(master);
  o.start(t); lfo.start(t);
  o.stop(t + 1.5); lfo.stop(t + 1.5);
}

// Retching: two wet heaves.
export function retch() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 2; i++) {
    const at = t + i * 0.45;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(380, at);
    bp.frequency.linearRampToValueAtTime(220, at + 0.3);
    bp.Q.value = 2.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.22, at + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
    src.connect(bp).connect(g).connect(master);
    src.start(at, Math.random(), 0.4);
  }
}

// Fat spitting on the fire.
export function sizzle() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 4500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.05, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25 + Math.random() * 0.2);
  src.connect(hp).connect(g).connect(master);
  src.start(t, Math.random() * 1.5, 0.5);
}

// Teeth chattering and a shaky breath.
export function shiver(strength = 1) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 9; i++) {
    const at = t + i * 0.06 + Math.random() * 0.015;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = 1800 + Math.random() * 600;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.025 * strength, at + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.025);
    o.connect(g).connect(master);
    o.start(at);
    o.stop(at + 0.03);
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1200;
  bp.Q.value = 0.8;
  const g = ctx.createGain();
  const at = t + 0.6;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(0.05 * strength, at + 0.25);
  g.gain.linearRampToValueAtTime(0.0001, at + 0.9);
  src.connect(bp).connect(g).connect(master);
  src.start(at, Math.random(), 1);
}

// Old floorboards taking weight from below.
export function creak() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const bp = ctx.createBiquadFilter();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(95, t);
  o.frequency.linearRampToValueAtTime(140, t + 0.45);
  o.frequency.linearRampToValueAtTime(80, t + 0.9);
  bp.type = 'bandpass';
  bp.frequency.value = 600;
  bp.Q.value = 6;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.12, t + 0.1);
  g.gain.linearRampToValueAtTime(0.06, t + 0.6);
  g.gain.linearRampToValueAtTime(0.0001, t + 0.95);
  o.connect(bp).connect(g).connect(master);
  o.start(t);
  o.stop(t + 1);
}

// A trap springing apart: a metal clank and a scrape.
export function trapSnap() {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime + 0.05;
  thud(t, 0.7);   // the jaws slamming shut on nothing
  [620, 930, 470, 1240].forEach((f, i) => {   // then iron ringing as it breaks apart
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = f * (0.97 + Math.random() * 0.06);
    const at = t + 0.02 + i * 0.07;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.09, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
    o.connect(g).connect(master);
    o.start(at);
    o.stop(at + 0.4);
  });
  const src = ctx.createBufferSource();   // and a rattle of chain
  src.buffer = noiseBuf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2400;
  bp.Q.value = 3;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  for (let i = 0; i < 6; i++) { g.gain.linearRampToValueAtTime(0.25, t + 0.1 + i * 0.07); g.gain.linearRampToValueAtTime(0.02, t + 0.13 + i * 0.07); }
  g.gain.linearRampToValueAtTime(0.0001, t + 0.6);
  src.connect(bp).connect(g).connect(master);
  src.start(t, 0, 0.7);
}

// Filtered noise with a gain envelope: shared by the death sounds below.
function noiseShape(type, freqs, gains, dur, q = 1) {
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  freqs.forEach(([at, v]) => f.frequency.linearRampToValueAtTime(v, t + at));
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  gains.forEach(([at, v]) => g.gain.linearRampToValueAtTime(v, t + at));
  src.connect(f).connect(g).connect(master);
  src.start(t, 0, dur);
}

// A long, slow breath out of the dark, very close.
export function breath() {
  if (!ctx || !enabled) return;
  noiseShape('bandpass', [[0, 260], [0.9, 420], [1.8, 200]], [[0.7, 0.22], [1.3, 0.16], [1.9, 0.0001]], 2, 2.5);
}

// The whole cabin catching: a rising roar.
export function roar() {
  if (!ctx || !enabled) return;
  noiseShape('lowpass', [[0, 200], [1.2, 1600], [3, 700]], [[0.8, 0.45], [2.4, 0.4], [3.4, 0.0001]], 3.5);
}

// Something heavy dragged away through the snow.
export function drag() {
  if (!ctx || !enabled) return;
  const pts = [];
  for (let i = 0; i < 9; i++) pts.push([0.08 + i * 0.16, i % 2 ? 0.05 : 0.2]);
  pts.push([1.6, 0.0001]);
  noiseShape('bandpass', [[0, 500], [1.6, 300]], pts, 1.7, 1.5);
}

/* ------------------------------------------------------------------ music */

// Background music, generated like everything else: a low, slowly breathing drone, and a warped music box
// picking out a lullaby in a minor key one note at a time, a little out of tune. As the night wears on
// (tension 0..1) a sour second note creeps into the drone and the music box plays faster and more wrong.
let musicGain = null, musicBus, droneSour, musicTimer = null;
let musicOn = true, musicLevel = 0, musicTension = 0, lastLevel = -1;
let melodyStep = 4;
const SCALE = [0, 2, 3, 5, 7, 8, 11, 12, 14, 15];   // natural minor with a raised seventh: a lullaby gone wrong

function makeReverb(seconds = 3.2) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  const conv = ctx.createConvolver();
  conv.buffer = buf;
  return conv;
}

function startMusic() {
  if (musicGain || !ctx) return;
  musicGain = ctx.createGain();
  musicGain.gain.value = 0;
  musicGain.connect(master);
  const verb = makeReverb();
  verb.connect(musicGain);
  musicBus = ctx.createGain();
  musicBus.gain.value = 1;
  musicBus.connect(verb);
  const dry = ctx.createGain();
  dry.gain.value = 0.35;
  musicBus.connect(dry).connect(musicGain);

  // the drone: two detuned low saws under a slowly moving filter, and a fifth above
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 170;
  lp.Q.value = 3;
  const lfo = ctx.createOscillator();
  const lfoAmt = ctx.createGain();
  lfo.frequency.value = 0.045;
  lfoAmt.gain.value = 70;
  lfo.connect(lfoAmt).connect(lp.frequency);
  lfo.start();
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.05;
  lp.connect(droneGain).connect(musicGain);
  droneGain.connect(verb);
  for (const [f, type, g] of [[55, 'sawtooth', 0.5], [55.35, 'sawtooth', 0.5], [82.4, 'triangle', 0.6]]) {
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = type;
    o.frequency.value = f;
    og.gain.value = g;
    o.connect(og).connect(lp);
    o.start();
  }
  // the sour note a semitone above, faded in by tension
  const sour = ctx.createOscillator();
  sour.type = 'sawtooth';
  sour.frequency.value = 58.27;
  droneSour = ctx.createGain();
  droneSour.gain.value = 0;
  sour.connect(droneSour).connect(lp);
  sour.start();

  scheduleNote();
}

// one music-box note: a soft sine with a faint, slightly sharp overtone that beats against it
function musicNote(freq, at, vol) {
  for (const [mult, v, det] of [[1, 1, 0], [2, 0.25, 9], [3, 0.08, -6]]) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq * mult;
    o.detune.value = det + (Math.random() - 0.5) * 18;   // never quite in tune
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol * v, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 2.8);
    o.connect(g).connect(musicBus);
    o.start(at);
    o.stop(at + 3);
  }
}

function scheduleNote() {
  const wait = (2.2 + Math.random() * 3.2) * (1 - 0.45 * musicTension);
  musicTimer = setTimeout(scheduleNote, wait * 1000);
  if (!ctx || !musicOn || musicLevel < 0.05 || !audible()) return;
  const t = ctx.currentTime + 0.05;
  // a slow random walk up and down the scale, now and then resting
  if (Math.random() < 0.18) return;
  melodyStep = Math.max(0, Math.min(SCALE.length - 1, melodyStep + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]));
  const freq = 220 * 2 ** (SCALE[melodyStep] / 12);
  musicNote(freq, t, 0.05);
  // later in the night: a second note right against it
  if (Math.random() < musicTension * 0.45) musicNote(freq * 2 ** (1 / 12), t + 0.02, 0.03);
  // and sometimes the same note again, a beat later, like the box catching
  if (Math.random() < 0.15 + musicTension * 0.2) musicNote(freq, t + 0.42, 0.03);
}

// level 0..1: how loud the music should be right now; tension 0..1: how far the night has gone wrong
export function setMusic(level, tension) {
  if (!ctx) return;
  startMusic();
  musicLevel = level;
  musicTension = Math.max(0, Math.min(1, tension));
  const target = musicOn ? level : 0;
  if (Math.abs(target - lastLevel) > 0.01) {
    lastLevel = target;
    musicGain.gain.setTargetAtTime(target * 0.9, ctx.currentTime, target > 0.1 ? 1.2 : 0.5);
  }
  droneSour.gain.setTargetAtTime(Math.max(0, musicTension - 0.3) * 0.5, ctx.currentTime, 2);
}

export function setMusicEnabled(on) {
  musicOn = on;
  lastLevel = -1;
}

// Wet wood on the fire: a long hiss and a few low, damp pops.
export function sputter() {
  if (!ctx || !enabled) return;
  noiseShape('highpass', [[0, 2600], [1.4, 1800]], [[0.05, 0.12], [0.8, 0.09], [1.5, 0.0001]], 1.6);
  const t = ctx.currentTime;
  for (let i = 0; i < 4; i++) thud(t + 0.15 + i * (0.18 + Math.random() * 0.2), 0.12);
}
