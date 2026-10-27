// Doom mode: an experimental easter egg, off unless "experimental features" is turned on at the very bottom of the
// achievements. It lasts only for the night it's found in: the menu or a new game puts it away again.
// Two layers over the game. The gun is a full-resolution cut-out of DOOM Eternal's super shotgun (id Software),
// recoiling and reloading in the bottom-right corner. The gore and bullet puffs are on a low-res layer in the
// proportions of a 320x200 shooter shown at 4:3 (each pixel 1.2 times as tall as it is wide), snapped to a fixed
// palette with ordered dithering. The music is "Rip & Tear" from DOOM's soundtrack (Mick Gordon), looped.
// Neither is ours: see the README. If the file is missing, a synthesized metal loop plays instead.

const DH = 200;
const DW = Math.round(DH * (320 / 180) * 1.2);   // 427: the stage is 16:9, the pixels are 1.2 tall
const TRACK = 'music/rip-and-tear.mp3';
const GUN = 'assets/doom-shotgun.webp';
// where the gun sits on the stage, as fractions of the stage: its height, its top, and its right edge
const GUN_H = 0.5, GUN_TOP = 0.7, GUN_RIGHT = 1.02;
// the two muzzles, in the cut-out's own pixels (624x455)
const MUZZLES = [{ x: 40, y: 30 }, { x: 120, y: 12 }];

// the palette the gore layer is snapped to
const PAL = [
  [0, 0, 0], [23, 23, 23], [39, 39, 39], [55, 55, 55], [75, 75, 75], [99, 99, 99], [123, 123, 123], [147, 147, 147],
  [175, 175, 175], [207, 207, 207], [239, 239, 239],
  [47, 0, 0], [83, 0, 0], [119, 0, 0], [159, 11, 11], [199, 27, 27], [235, 63, 47],         // blood
  [107, 55, 51], [155, 91, 83], [203, 147, 131],                                            // flesh, bone
  [191, 91, 0], [239, 143, 23], [255, 199, 63], [255, 239, 143], [255, 255, 223],           // fire
];
// a 32x32x32 lookup from colour to nearest palette entry
const LUT = new Uint8Array(32768);
for (let r = 0; r < 32; r++) for (let g = 0; g < 32; g++) for (let b = 0; b < 32; b++) {
  let best = 0, bd = 1e9;
  const R = r * 8 + 4, G = g * 8 + 4, B = b * 8 + 4;
  for (let i = 0; i < PAL.length; i++) {
    const p = PAL[i], d = (p[0] - R) ** 2 * 0.3 + (p[1] - G) ** 2 * 0.59 + (p[2] - B) ** 2 * 0.11;
    if (d < bd) { bd = d; best = i; }
  }
  LUT[(r << 10) | (g << 5) | b] = best;
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v / 16 - 0.47));

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);
const rand = (a, b) => a + Math.random() * (b - a);

export function createDoom({ stage, audioOut, soundOn }) {
  const tint = document.createElement('div');
  tint.id = 'doomTint';
  const cv = document.createElement('canvas');      // gore, low-res
  cv.id = 'doom';
  cv.width = DW; cv.height = DH;
  const hi = document.createElement('canvas');      // the gun, full resolution
  hi.id = 'doomGun';
  stage.appendChild(tint);
  stage.appendChild(cv);
  stage.appendChild(hi);
  const out = cv.getContext('2d');
  const hx = hi.getContext('2d');
  const work = document.createElement('canvas');
  work.width = DW; work.height = DH;
  const g = work.getContext('2d', { willReadFrequently: true });

  // the gun, and its alpha so a click on it can be told from a click past it
  const img = new Image();
  let alphaMap = null;
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    alphaMap = x.getImageData(0, 0, c.width, c.height).data;
  };
  img.src = GUN;

  const st = {
    on: false,        // found this night
    shown: false,     // gun up, music on, tint on
    rise: 0,          // 0 down .. 1 up
    fireT: -1,        // seconds since the last shot (while < 0.45)
    shots: 0,         // shells fired since the last reload
    reloadT: -1,      // seconds into a reload
    clock: 0,
  };
  const SHELLS = 2;          // two barrels, then you break it open
  const RELOAD = 1.3;
  let gibs = [], puffs = [], shells = [];
  let flash = 0;

  const toD = (gx, gy) => ({ x: (gx / 320) * DW, y: (gy / 180) * DH });

  /* --------------------------------------------------------------- the gun */
  function gunBox(W, H) {
    const h = H * GUN_H, w = h * (img.width / img.height || 1.37);
    return { x: W * GUN_RIGHT - w, y: H * GUN_TOP, w, h };
  }

  function drawGun(dt, showGun) {
    const W = Math.round(stage.clientWidth * (window.devicePixelRatio || 1));
    const H = Math.round(stage.clientHeight * (window.devicePixelRatio || 1));
    if (hi.width !== W || hi.height !== H) { hi.width = W; hi.height = H; }
    hx.clearRect(0, 0, W, H);
    if (!showGun || st.rise <= 0.001 || !img.complete || !img.width) { drawShells(dt, W, H); return; }
    const b = gunBox(W, H);
    const up = ease(st.rise);
    let dx = Math.cos(st.clock * 0.85) * H * 0.004, dy = Math.sin(st.clock * 1.7) * H * 0.004 + (1 - up) * H * 0.55, rot = 0;
    let fk = 0;
    if (st.fireT >= 0) {
      // a hard kick up and back, then it settles
      const k = st.fireT;
      const kick = k < 0.04 ? k / 0.04 : Math.max(0, 1 - (k - 0.04) / 0.36) ** 2;
      dx += H * 0.03 * kick; dy += H * 0.05 * kick; rot += 0.09 * kick;
      fk = k < 0.035 ? 1 : k < 0.075 ? 0.55 : 0;
    }
    if (st.reloadT >= 0) {
      // breaks it open below the screen edge, tipping the barrels down, and snaps it shut on the way back up
      const r = st.reloadT;
      const down = r < 0.3 ? ease(r / 0.3) : r < 0.95 ? 1 : 1 - ease((r - 0.95) / (RELOAD - 0.95));
      dy += H * 0.3 * down; dx += H * 0.04 * down; rot -= 0.32 * down;
      if (r > 0.95 && r < 1.03) dy -= H * 0.012;   // the snap
    }
    // pivot about the grip, low on the right
    const px = b.x + b.w * 0.75, py = b.y + b.h * 0.9;
    hx.save();
    hx.translate(px + dx, py + dy);
    hx.rotate(rot);
    hx.translate(-px, -py);
    hx.drawImage(img, b.x, b.y, b.w, b.h);
    if (fk > 0) {
      // the flash lights the gun up for a frame
      hx.globalCompositeOperation = 'source-atop';
      hx.fillStyle = `rgba(255, 170, 60, ${0.35 * fk})`;
      hx.fillRect(b.x, b.y, b.w, b.h);
      hx.globalCompositeOperation = 'lighter';
      const sx = b.w / img.width;
      for (const m of MUZZLES) {
        const mx = b.x + m.x * sx, my = b.y + m.y * sx;
        const R = H * 0.11 * fk * rand(0.85, 1.15);
        const spikes = 9;
        hx.beginPath();
        for (let i = 0; i <= spikes * 2; i++) {
          const a = (i / (spikes * 2)) * Math.PI * 2 + rand(-0.15, 0.15);
          const rr = i % 2 ? R * rand(0.25, 0.4) : R * rand(0.7, 1.2);
          hx.lineTo(mx + Math.cos(a) * rr - R * 0.25, my + Math.sin(a) * rr * 0.75 - R * 0.35);
        }
        const gr = hx.createRadialGradient(mx - R * 0.25, my - R * 0.35, 0, mx - R * 0.25, my - R * 0.35, R);
        gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.3, 'rgba(255,220,120,0.95)');
        gr.addColorStop(0.65, 'rgba(255,140,30,0.7)'); gr.addColorStop(1, 'rgba(200,60,0,0)');
        hx.fillStyle = gr;
        hx.fill();
      }
    }
    hx.restore();
    drawShells(dt, W, H);
  }

  // empty shells kicked out of the breech while it's open
  function drawShells(dt, W, H) {
    for (const s of shells) {
      s.vy += H * 2.6 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += 13 * dt;
      const u = H * 0.012;
      hx.save(); hx.translate(s.x, s.y); hx.rotate(s.rot);
      const gr = hx.createLinearGradient(-u, 0, u, 0);
      gr.addColorStop(0, '#5a0808'); gr.addColorStop(0.45, '#c42a1e'); gr.addColorStop(1, '#4a0606');
      hx.fillStyle = gr; hx.fillRect(-u, -u * 2.4, u * 2, u * 3.2);
      const br = hx.createLinearGradient(-u, 0, u, 0);
      br.addColorStop(0, '#6b5320'); br.addColorStop(0.45, '#e8c66a'); br.addColorStop(1, '#5a4418');
      hx.fillStyle = br; hx.fillRect(-u * 1.1, u * 0.8, u * 2.2, u * 1.2);
      hx.restore();
    }
    shells = shells.filter((s) => s.y < H * 1.2);
  }

  /* ------------------------------------------------------------- the gore */
  const GORE = ['#9f0b0b', '#770000', '#c71b1b', '#530000', '#9b5b53', '#6b3733'];
  function gib(gx, gy, size = 8) {
    const { x, y } = toD(gx, gy);
    const sz = size * 1.25;
    const floor = y + sz * 0.9;
    const bits = [];
    const n = Math.round(10 + size * 1.3);
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI * 0.95, -Math.PI * 0.05);
      const v = rand(40, 140) * (0.6 + size / 14);
      bits.push({
        x: x + rand(-sz, sz) * 0.4, y: y + rand(-sz, sz) * 0.4, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        r: rand(1.2, 3.6) * (0.7 + size / 16), rot: rand(0, 6), vr: rand(-12, 12),
        col: Math.random() < 0.12 ? '#cf9383' : GORE[Math.floor(Math.random() * GORE.length)], landed: false, drop: false,
      });
    }
    for (let i = 0; i < 26; i++) {
      const a = rand(0, Math.PI * 2), v = rand(30, 170);
      bits.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 50, r: rand(0.6, 1.1), rot: 0, vr: 0, col: '#c71b1b', landed: false, drop: true });
    }
    gibs.push({ x, y, sz, floor, t: 0, bits, pile: Array.from({ length: 6 + Math.round(size / 3) }, () => ({ dx: rand(-1, 1) * sz * 0.9, w: rand(0.35, 0.8) * sz, h: rand(0.2, 0.45) * sz, col: GORE[Math.floor(Math.random() * 4)] })) });
    sfxGib(size);
  }

  function drawGibs(dt) {
    for (const p of gibs) {
      p.t += dt;
      const fade = p.t > 7 ? clamp(1 - (p.t - 7) / 1.5, 0, 1) : 1;
      g.globalAlpha = fade;
      // the burst: a red bloom with a dark heart, gone in a third of a second
      if (p.t < 0.32) {
        const k = p.t / 0.32;
        const R = p.sz * (0.6 + 1.1 * Math.sqrt(k));
        const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, R);
        gr.addColorStop(0, k < 0.3 ? '#ffef8f' : '#530000');
        gr.addColorStop(0.45, '#c71b1b');
        gr.addColorStop(1, 'rgba(119,0,0,0)');
        g.globalAlpha = fade * (1 - k * 0.7);
        g.fillStyle = gr;
        g.beginPath(); g.arc(p.x, p.y, R, 0, Math.PI * 2); g.fill();
        g.globalAlpha = fade;
      }
      // the heap it leaves on the floor
      if (p.t > 0.18) {
        const k = ease(clamp((p.t - 0.18) / 0.4, 0, 1));
        for (const h of p.pile) { g.fillStyle = h.col; g.beginPath(); g.ellipse(p.x + h.dx, p.floor - h.h * k * 0.5, h.w, h.h * k, 0, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#cfcfbf'; g.fillRect(p.x - p.sz * 0.3, p.floor - p.sz * 0.25 * k, p.sz * 0.6, 1.5);   // a bone
      }
      for (const b of p.bits) {
        if (!b.landed) {
          b.vy += 300 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.vr * dt;
          if (b.y >= p.floor + rand(-2, 3) && b.vy > 0) { b.landed = true; b.y = Math.min(b.y, p.floor + 3); }
        }
        g.fillStyle = b.col;
        if (b.landed) { g.beginPath(); g.ellipse(b.x, b.y, b.r * (b.drop ? 1.6 : 1.4), b.r * 0.55, 0, 0, Math.PI * 2); g.fill(); }
        else if (b.drop) g.fillRect(b.x, b.y, 1, 1.4);
        else { g.save(); g.translate(b.x, b.y); g.rotate(b.rot); g.fillRect(-b.r, -b.r * 0.7, b.r * 2, b.r * 1.4); g.restore(); }
      }
    }
    g.globalAlpha = 1;
    gibs = gibs.filter((p) => p.t < 8.5);
  }

  function puff(gx, gy, n = 5) {
    const { x, y } = toD(gx, gy);
    for (let i = 0; i < n; i++) puffs.push({ x: x + rand(-9, 9), y: y + rand(-7, 7), t: -i * 0.012 });
  }
  function drawPuffs(dt) {
    for (const p of puffs) {
      p.t += dt;
      if (p.t < 0) continue;
      const k = p.t / 0.42;
      g.fillStyle = k < 0.15 ? '#ffef8f' : '#7b7b7b';
      g.globalAlpha = 1 - k;
      g.beginPath(); g.arc(p.x, p.y - k * 9, 1.6 + k * 3.2, 0, Math.PI * 2); g.fill();
      if (k < 0.2) { g.fillStyle = '#c71b1b'; g.fillRect(p.x - 0.5, p.y - 0.5, 1, 1); }
    }
    g.globalAlpha = 1;
    puffs = puffs.filter((p) => p.t < 0.42);
  }

  /* --------------------------------------------------------------- frame */
  function frame(dt, showGun) {
    st.clock += dt;
    st.rise = clamp(st.rise + dt * (st.shown ? 0.4 : -1.4), 0, 1);   // it comes up slowly; it drops fast
    if (st.fireT >= 0) st.fireT += dt;
    if (st.fireT > 0.45) st.fireT = -1;
    if (st.shown && st.shots >= SHELLS && st.reloadT < 0 && (st.fireT < 0 || st.fireT > 0.38)) st.reloadT = 0;   // both barrels spent
    if (st.reloadT >= 0) {
      const before = st.reloadT;
      st.reloadT += dt;
      const at = (x) => before < x && st.reloadT >= x;
      if (at(0.3)) {
        sfxClick(1, 1300);   // it breaks open
        const W = hi.width, H = hi.height;
        for (const k of [0, 1]) shells.push({ x: W * (0.86 + k * 0.03), y: H * 0.95, vx: W * rand(0.05, 0.14), vy: -H * rand(0.9, 1.2), rot: rand(0, 3) });
      }
      if (at(0.62)) sfxClick(0.55, 2600);   // a shell in
      if (at(0.74)) sfxClick(0.55, 2400);   // and the other
      if (at(0.97)) sfxClick(1.2, 900);     // snapped shut
      if (st.reloadT >= RELOAD) { st.reloadT = -1; st.shots = 0; }
    }
    flash = Math.max(0, flash - dt * 9);

    g.clearRect(0, 0, DW, DH);
    if (flash > 0) { g.fillStyle = `rgba(255, 199, 63, ${0.1 * flash})`; g.fillRect(0, 0, DW, DH); }
    drawGibs(dt);
    drawPuffs(dt);
    quantize();
    drawGun(dt, showGun);
    tint.classList.toggle('on', st.shown);
    stage.classList.toggle('doom', st.shown && showGun);
  }

  // snap the smooth drawing to the palette, with ordered dithering, and alpha to all or nothing
  function quantize() {
    const im = g.getImageData(0, 0, DW, DH);
    const d = im.data;
    for (let y = 0; y < DH; y++) {
      for (let x = 0; x < DW; x++) {
        const i = (y * DW + x) * 4;
        const a = d[i + 3];
        if (a === 0) continue;
        const th = BAYER[(y & 3) * 4 + (x & 3)];
        if (a / 255 < 0.5 + th) { d[i + 3] = 0; continue; }
        const m = 255 / a;
        const off = th * 22;
        const r = clamp(d[i] * m + off, 0, 255), gg = clamp(d[i + 1] * m + off, 0, 255), b = clamp(d[i + 2] * m + off, 0, 255);
        const p = PAL[LUT[((r >> 3) << 10) | ((gg >> 3) << 5) | (b >> 3)]];
        d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2]; d[i + 3] = 255;
      }
    }
    out.putImageData(im, 0, 0);
  }

  /* ---------------------------------------------------------------- sound */
  const A = () => audioOut();
  function shapeCurve(drive) {
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * drive) / Math.tanh(drive); }
    return c;
  }
  let noise = null;
  function noiseBuf(ctx) {
    if (noise) return noise;
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const ch = noise.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    return noise;
  }
  function burst(ctx, dest, at, dur, type, f0, f1, vol, q = 0.8) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf(ctx);
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, at); f.frequency.exponentialRampToValueAtTime(f1, at + dur);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(vol, at); gn.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(gn).connect(dest);
    src.start(at, Math.random()); src.stop(at + dur + 0.05);
  }
  function tone(ctx, dest, at, dur, type, f0, f1, vol) {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + dur);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(vol, at); gn.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(gn).connect(dest); o.start(at); o.stop(at + dur + 0.05);
  }
  // A shotgun is mostly noise, not a tone: a hard crack, a wide-open blast that darkens as it dies, a short low
  // thump under it, and the room throwing it back.
  function sfxShot() {
    const a = A(); if (!a || !soundOn()) return;
    const { ctx, out: o } = a, t = ctx.currentTime;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 6; comp.attack.value = 0.001; comp.release.value = 0.15;
    const ws = ctx.createWaveShaper(); ws.curve = shapeCurve(9);
    const bus = ctx.createGain(); bus.gain.value = 0.7;
    ws.connect(comp).connect(bus).connect(o);
    // the room: a couple of short slapback echoes, darker each time
    const dl = ctx.createDelay(0.5); dl.delayTime.value = 0.075;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const dark = ctx.createBiquadFilter(); dark.type = 'lowpass'; dark.frequency.value = 2200;
    bus.connect(dl); dl.connect(dark).connect(fb).connect(dl);
    dark.connect(o);
    burst(ctx, ws, t, 0.018, 'highpass', 1200, 1200, 1.6);           // the crack
    burst(ctx, ws, t, 0.32, 'lowpass', 12000, 1400, 1.1);           // the blast
    burst(ctx, ws, t + 0.004, 0.2, 'bandpass', 2600, 900, 0.7, 0.6); // the bark in the middle of it
    burst(ctx, ws, t, 0.22, 'lowpass', 260, 90, 1.2, 0.7);          // the low thump, still noise
    tone(ctx, ws, t, 0.09, 'sine', 95, 50, 0.3);
    burst(ctx, o, t + 0.03, 0.9, 'bandpass', 700, 250, 0.08, 0.5);  // the tail ringing off the walls
  }
  function sfxClick(vol, f) {
    const a = A(); if (!a || !soundOn()) return;
    const { ctx, out: o } = a, t = ctx.currentTime;
    burst(ctx, o, t, 0.05, 'bandpass', f, f * 0.8, 0.5 * vol, 4);
    burst(ctx, o, t + 0.012, 0.03, 'highpass', 4000, 4000, 0.25 * vol);
    tone(ctx, o, t, 0.08, 'square', f / 3, f / 4, 0.05 * vol);
  }
  function sfxGib(size) {
    const a = A(); if (!a || !soundOn()) return;
    const { ctx, out: o } = a, t = ctx.currentTime;
    burst(ctx, o, t, 0.45, 'lowpass', 1800, 180, 0.9);
    burst(ctx, o, t + 0.03, 0.25, 'bandpass', 600, 1500, 0.4, 3);   // wet
    tone(ctx, o, t, 0.3, 'sine', 90, 35, 0.6 * Math.min(1, size / 8));
    for (let i = 0; i < 4; i++) burst(ctx, o, t + rand(0.25, 0.7), 0.08, 'lowpass', 700, 300, 0.25);   // pieces landing
    const ws = ctx.createWaveShaper(); ws.curve = shapeCurve(4); ws.connect(o);
    tone(ctx, ws, t, 0.55, 'sawtooth', rand(170, 230), 55, 0.12);   // a death bellow, pitched down
  }

  /* ---------------------------------------------------------------- music */
  // the soundtrack file if it's there; otherwise a stand-in loop: drop-tuned saws, a sub, a synthesized kit
  let trackEl = null, hasTrack = false;
  fetch(TRACK, { method: 'HEAD' }).then((r) => { hasTrack = r.ok; }).catch(() => {});
  let musicNodes = null;
  const BPM = 132, STEP = 60 / BPM / 4;
  const C = 65.41;
  const semi = (n) => C * 2 ** (n / 12);
  const RIFF = {
    A: ['0', 'x', '', 'x', 'x', 'x', '0', '', 'x', 'x', '', 'x', '3', '', 'x', 'x'],
    B: ['0', 'x', '', 'x', 'x', 'x', '0', '', 'x', 'x', '', 'x', '1', '2', '3', '5'],
    C: ['0', '', 'x', 'x', '6', '', 'x', 'x', '0', '', 'x', 'x', '1', '', '1', ''],
    D: ['0', 'x', 'x', 'x', 'x', 'x', 'x', 'x', '7', '', '6', '', '5', '', '3', '1'],
  };
  const SONG = ['A', 'A', 'B', 'C', 'A', 'A', 'B', 'D'];
  let schedTimer = null, nextStep = 0, stepNo = 0;
  function startMusic() {
    if (hasTrack) {
      if (!trackEl) { trackEl = new Audio(TRACK); trackEl.loop = true; trackEl.volume = 0.6; }
      trackEl.play().catch(() => {});
      return;
    }
    const a = A(); if (!a || musicNodes) return;
    const { ctx, out: o } = a;
    const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(o);
    bus.gain.setTargetAtTime(0.32, ctx.currentTime, 0.3);
    const gtr = ctx.createGain();
    const ws = ctx.createWaveShaper(); ws.curve = shapeCurve(28); ws.oversample = '2x';
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
    const gOut = ctx.createGain(); gOut.gain.value = 0.32;
    gtr.connect(ws).connect(hp).connect(lp).connect(gOut).connect(bus);
    const drums = ctx.createGain(); drums.gain.value = 0.9; drums.connect(bus);
    musicNodes = { ctx, bus, gtr, drums };
    nextStep = ctx.currentTime + 0.1; stepNo = 0;
    schedTimer = setInterval(schedule, 25);
  }
  function note(m, at, freq, dur, mute) {
    const { ctx, gtr } = m;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(mute ? 900 : 5000, at);
    f.frequency.exponentialRampToValueAtTime(mute ? 300 : 2000, at + dur);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, at); gn.gain.exponentialRampToValueAtTime(0.5, at + 0.004);
    gn.gain.setValueAtTime(0.5, at + dur * 0.8); gn.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    f.connect(gn).connect(gtr);
    for (const [mul, det] of mute ? [[1, 0], [1, 9]] : [[1, 0], [1, 11], [1.5, -6], [2, 5]]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = freq * mul; o.detune.value = det;
      o.connect(f); o.start(at); o.stop(at + dur + 0.02);
    }
    const sub = ctx.createOscillator(); sub.type = 'square'; sub.frequency.value = freq / 2;
    const sl = ctx.createBiquadFilter(); sl.type = 'lowpass'; sl.frequency.value = 160;
    const sg = ctx.createGain(); sg.gain.setValueAtTime(0.22, at); sg.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    sub.connect(sl).connect(sg).connect(m.bus); sub.start(at); sub.stop(at + dur + 0.02);
  }
  function schedule() {
    const m = musicNodes; if (!m) return;
    while (nextStep < m.ctx.currentTime + 0.15) {
      const bar = Math.floor(stepNo / 16) % SONG.length, s = stepNo % 16;
      const riff = RIFF[SONG[bar]], v = riff[s];
      if (v === 'x') note(m, nextStep, C, STEP * 0.85, true);
      else if (v !== '') {
        let len = 1; while (s + len < 16 && riff[s + len] === '' && len < 4) len++;
        note(m, nextStep, semi(+v), STEP * len * 0.95, false);
      }
      if (v !== '' || (SONG[bar] === 'D' && s < 8)) { tone(m.ctx, m.drums, nextStep, 0.22, 'sine', 160, 42, 0.9); burst(m.ctx, m.drums, nextStep, 0.02, 'highpass', 3000, 3000, 0.25); }
      if (s === 4 || s === 12 || (SONG[bar] === 'D' && s >= 12)) { burst(m.ctx, m.drums, nextStep, 0.2, 'bandpass', 2000, 1500, 0.7, 0.7); tone(m.ctx, m.drums, nextStep, 0.1, 'triangle', 210, 160, 0.35); }
      if (s % 2 === 0) burst(m.ctx, m.drums, nextStep, s === 14 ? 0.22 : 0.04, 'highpass', 8000, 8000, 0.16);
      if (s === 0 && (bar === 0 || bar === 4)) burst(m.ctx, m.drums, nextStep, 1.4, 'highpass', 5000, 4000, 0.22);
      nextStep += STEP;
      stepNo++;
    }
  }
  function stopMusic() {
    if (schedTimer) { clearInterval(schedTimer); schedTimer = null; }
    if (musicNodes) {
      const m = musicNodes; musicNodes = null;
      m.bus.gain.setTargetAtTime(0, m.ctx.currentTime, 0.15);
      setTimeout(() => m.bus.disconnect(), 800);
    }
    if (trackEl) trackEl.pause();
  }
  function syncSound() {
    // follows the sound button: off means off
    const playing = musicNodes || (trackEl && !trackEl.paused);
    if (!st.shown || !soundOn()) { if (playing) stopMusic(); return; }
    if (!playing) startMusic();
  }

  /* ------------------------------------------------------------------ api */
  return {
    get on() { return st.on; },
    get shown() { return st.shown; },
    get ready() { return st.shown && st.rise > 0.85 && st.reloadT < 0 && st.shots < SHELLS && (st.fireT < 0 || st.fireT > 0.22); },
    unlock() { st.on = true; st.shown = true; syncSound(); },
    // put it all away: the menu and every new game do this, so it has to be found again
    off() {
      st.on = false; st.shown = false; st.rise = 0; st.reloadT = -1; st.shots = 0; st.fireT = -1;
      stopMusic(); if (trackEl) trackEl.currentTime = 0;
      gibs = []; puffs = []; shells = [];
    },
    toggle() { if (!st.on) return; st.shown = !st.shown; syncSound(); },
    // is this point (game coordinates, 320x180) on the gun itself, where it sits when it's up?
    inGun(gx, gy) {
      if (!alphaMap || st.rise < 0.5) return false;
      const b = gunBox(320, 180);
      const ix = Math.floor(((gx - b.x) / b.w) * img.width), iy = Math.floor(((gy - b.y) / b.h) * img.height);
      if (ix < 0 || iy < 0 || ix >= img.width || iy >= img.height) return gx > b.x + b.w * 0.3 && gy > b.y;   // below the edge
      return alphaMap[(iy * img.width + ix) * 4 + 3] > 60;
    },
    // pull the trigger; false if the gun can't fire right now
    fire() {
      if (!this.ready) return false;
      st.fireT = 0;
      st.shots += 1;
      flash = 1;
      sfxShot();
      return true;
    },
    gib, puff, frame, syncSound,
  };
}
