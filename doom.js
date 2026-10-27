// Doom mode: an experimental easter egg, off unless "experimental features" is turned on under the achievements.
// Its own layer over the game, in the proportions of a 320x200 shooter shown at 4:3 (every pixel 1.2 times as tall
// as it is wide), so nothing of Firelight's own look changes except where this layer draws: a double-barrelled
// shotgun that rises in the bottom-right corner, muzzle flash, bullet puffs, and anything shot bursting into gibs.
// Everything is drawn smooth on a small canvas and then snapped to a fixed palette with ordered dithering, which
// is what gives it that chunky look. The gun, the gore and the music are all original, made here; no game's assets.

const DH = 200;
const DW = Math.round(DH * (320 / 180) * 1.2);   // 427: the stage is 16:9, the pixels are 1.2 tall

// the palette everything on this layer is snapped to
const PAL = [
  [0, 0, 0], [23, 23, 23], [39, 39, 39], [55, 55, 55], [75, 75, 75], [99, 99, 99], [123, 123, 123], [147, 147, 147],
  [175, 175, 175], [207, 207, 207], [239, 239, 239],
  [43, 27, 15], [67, 43, 23], [95, 63, 35], [123, 83, 47], [151, 107, 63],                  // wood
  [79, 51, 35], [111, 75, 51], [143, 99, 67], [179, 131, 91], [215, 167, 123],              // skin
  [47, 0, 0], [83, 0, 0], [119, 0, 0], [159, 11, 11], [199, 27, 27], [235, 63, 47],         // blood
  [107, 55, 51], [155, 91, 83], [203, 147, 131],                                            // flesh, bone
  [191, 91, 0], [239, 143, 23], [255, 199, 63], [255, 239, 143], [255, 255, 223],           // fire
  [163, 127, 47], [211, 175, 79],                                                           // brass
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
  const cv = document.createElement('canvas');
  cv.id = 'doom';
  cv.width = DW; cv.height = DH;
  const tint = document.createElement('div');
  tint.id = 'doomTint';
  stage.appendChild(tint);
  stage.appendChild(cv);
  const out = cv.getContext('2d');
  const work = document.createElement('canvas');
  work.width = DW; work.height = DH;
  const g = work.getContext('2d', { willReadFrequently: true });

  const st = {
    on: false,        // unlocked this session
    shown: false,     // gun up, music on, tint on
    rise: 0,          // 0 down .. 1 up
    fireT: -1,        // seconds since the last shot (while < 0.4)
    shots: 0,         // shells fired since the last reload
    reloadT: -1,      // seconds into a reload
    clock: 0,
  };
  const SHELLS = 2;          // two barrels, then you break it open
  const RELOAD = 1.35;
  let gibs = [], puffs = [], shells = [];
  let flash = 0;

  /* -------------------------------------------------------- coordinates */
  const toD = (gx, gy) => ({ x: (gx / 320) * DW, y: (gy / 180) * DH });

  /* --------------------------------------------------------------- the gun */
  // seen from behind your own hands: two barrels running away from you up toward the middle of the screen
  function drawGun(ox, oy, rot, open, handK, flashK) {
    g.save();
    g.translate(ox, oy);
    g.rotate(rot);
    const N = { x: 0, y: 0 }, F = { x: -17, y: -66 };
    const ax = F.x - N.x, ay = F.y - N.y, al = Math.hypot(ax, ay);
    const px = -ay / al, py = ax / al;           // across the barrels
    const at = (s, off) => { const k = lerp(1, 0.6, s); return { x: N.x + ax * s + px * off * k, y: N.y + ay * s + py * off * k, k }; };
    const quad = (pts, fill) => {
      g.beginPath(); g.moveTo(pts[0].x, pts[0].y); for (const p of pts.slice(1)) g.lineTo(p.x, p.y); g.closePath();
      g.fillStyle = fill; g.fill(); g.strokeStyle = '#111'; g.lineWidth = 1.3; g.stroke();
    };
    const blob = (x, y, rx, ry, a, fill) => { g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); g.strokeStyle = '#2b1709'; g.lineWidth = 1; g.stroke(); };
    const across = (s, off, w, stops) => {
      const a = at(s, off - w), b = at(s, off + w);
      const gr = g.createLinearGradient(a.x, a.y, b.x, b.y);
      stops.forEach(([o, c]) => gr.addColorStop(o, c));
      return gr;
    };
    const ang = Math.atan2(py, px);
    const B = 11, O = 11.5;                      // barrel radius, and how far each sits from the middle
    const len = open ? 0.8 : 1;                  // broken open, the barrels tip down toward you and look shorter
    // the receiver, running off the bottom of the screen
    quad([at(0.02, -25), at(-0.42, -27), at(-0.42, 27), at(0.02, 25)], across(-0.2, 0, 26, [[0, '#171717'], [0.3, '#4b4b4b'], [0.45, '#7b7b7b'], [0.7, '#373737'], [1, '#171717']]));
    // the forestock, under the barrels and wider than them
    quad([at(0, -29), at(0.55 * len, -26), at(0.55 * len, 26), at(0, 29)],
      across(0.25, 0, 29, [[0, '#2b1b0f'], [0.2, '#7b532f'], [0.45, '#a3733f'], [0.75, '#5f3f23'], [1, '#2b1b0f']]));
    g.strokeStyle = 'rgba(40, 24, 12, 0.9)'; g.lineWidth = 0.9;
    for (const off of [-24, -19, 19, 24]) { const a = at(0.03, off), b = at(0.52 * len, off); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
    // the barrels
    for (const side of [-1, 1]) {
      const c = side * O;
      quad([at(0, c - B), at(len, c - B), at(len, c + B), at(0, c + B)],
        across(0.5, c, B, [[0, '#171717'], [0.18, '#636363'], [0.36, '#bfbfbf'], [0.5, '#8f8f8f'], [0.75, '#3b3b3b'], [1, '#171717']]));
    }
    // the rib between them, and the bead at the end
    { const a = at(0, 0), b = at(len, 0); g.strokeStyle = '#cfcfcf'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
    // the muzzles
    for (const side of [-1, 1]) {
      const m = at(len, side * O);
      blob(m.x, m.y, B * m.k, B * 0.48 * m.k, ang, '#9b9b9b');
      g.fillStyle = '#000';
      g.beginPath(); g.ellipse(m.x, m.y + 0.4, B * 0.62 * m.k, B * 0.3 * m.k, ang, 0, Math.PI * 2); g.fill();
    }
    // the breech, when it's open: two empty chambers facing you
    if (open) {
      const b0 = at(0.02, 0);
      blob(b0.x, b0.y - 3, 27, 11, ang, '#4b4b4b');
      for (const side of [-1, 1]) { const c = at(0.02, side * O); g.fillStyle = '#000'; g.beginPath(); g.ellipse(c.x, c.y - 3, 8, 4, ang, 0, Math.PI * 2); g.fill(); }
    }
    // your right hand on the grip, its knuckles at the very bottom
    for (let i = 0; i < 4; i++) blob(N.x - 14 + i * 10, N.y + 22 + i * 1.5, 6.5, 5, -0.3, i % 2 ? '#a3734b' : '#b3835b');
    // your left hand under the forestock, fingers curled over its far side (it lets go to load)
    if (handK > 0.01) {
      const h = at(0.3 * len, -30);
      const hx = lerp(h.x - 60, h.x, handK), hy = lerp(h.y + 70, h.y, handK);
      blob(hx - 16, hy + 34, 15, 30, 0.45, '#7f5337');   // wrist and forearm
      blob(hx - 4, hy + 8, 13, 15, 0.3, '#a3734b');      // palm and thumb
      for (let i = 0; i < 4; i++) {
        const f = at(0.3 * len + 0.085 * (i - 1.5), -27);
        const fx0 = lerp(f.x - 60, f.x, handK), fy0 = lerp(f.y + 70, f.y, handK);
        blob(fx0 + 3, fy0, 8, 4.4, ang - 1.35, i % 2 ? '#b3835b' : '#c7956b');
        g.fillStyle = '#e3b78b';
        g.beginPath(); g.ellipse(fx0 + 7, fy0 - 0.8, 2.4, 1.6, -0.35, 0, Math.PI * 2); g.fill();   // the knuckle catching the light
      }
    }
    // muzzle flash
    if (flashK > 0) {
      for (const side of [-1, 1]) {
        const m = at(len + 0.06, side * O);
        const R = 26 * flashK * m.k * 1.8;
        const spikes = 11;
        g.beginPath();
        for (let i = 0; i <= spikes * 2; i++) {
          const a = (i / (spikes * 2)) * Math.PI * 2 + side;
          const r = i % 2 ? R * rand(0.35, 0.55) : R * rand(0.8, 1.15);
          g.lineTo(m.x + Math.cos(a) * r, m.y + Math.sin(a) * r * 0.8);
        }
        const gr = g.createRadialGradient(m.x, m.y, 0, m.x, m.y, R);
        gr.addColorStop(0, '#ffffdf'); gr.addColorStop(0.3, '#ffef8f'); gr.addColorStop(0.6, '#ffc73f'); gr.addColorStop(1, '#bf5b00');
        g.fillStyle = gr;
        g.fill();
      }
    }
    g.restore();
  }

  function drawLoadingHand(k, bx, by) {
    // the left hand coming up from below with two fresh shells, then pushing them home into the breech at (bx, by)
    const x = lerp(bx - 80, bx - 2, ease(k)), y = lerp(DH + 40, by + 12, ease(k));
    g.fillStyle = '#7f5337';
    g.beginPath(); g.ellipse(x - 18, y + 34, 14, 30, 0.6, 0, Math.PI * 2); g.fill();
    for (const dx of [-5, 5]) {
      g.fillStyle = '#a30b0b'; g.fillRect(x + dx - 3, y - 14, 6, 14);
      g.fillStyle = '#d3af4f'; g.fillRect(x + dx - 3.5, y - 1, 7, 4);
    }
    g.fillStyle = '#b3835b';
    g.beginPath(); g.ellipse(x, y + 6, 13, 9, 0.2, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c7956b';
    g.beginPath(); g.ellipse(x + 9, y, 4, 7, 0.4, 0, Math.PI * 2); g.fill();   // thumb
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
      // the burst: a red bloom with a dark heart, gone in a quarter second
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

  function drawShells(dt) {
    for (const s of shells) {
      s.vy += 420 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += 14 * dt;
      g.save(); g.translate(s.x, s.y); g.rotate(s.rot);
      g.fillStyle = '#a30b0b'; g.fillRect(-2.5, -6, 5, 9);
      g.fillStyle = '#d3af4f'; g.fillRect(-3, 3, 6, 3);
      g.restore();
    }
    shells = shells.filter((s) => s.y < DH + 20);
  }

  /* --------------------------------------------------------------- frame */
  function frame(dt, showGun) {
    st.clock += dt;
    st.rise = clamp(st.rise + dt * (st.shown ? 0.4 : -1.4), 0, 1);   // it comes up slowly; it drops fast
    if (st.fireT >= 0) st.fireT += dt;
    if (st.fireT > 0.45) st.fireT = -1;
    if (st.reloadT >= 0) {
      const before = st.reloadT;
      st.reloadT += dt;
      const at = (x) => before < x && st.reloadT >= x;
      if (at(0.28)) { sfxClick(0.9, 1400); for (const dx of [-6, 6]) shells.push({ x: DW - 56 + dx, y: DH - 40, vx: rand(40, 110), vy: rand(-190, -140), rot: 0 }); }
      if (at(0.78)) sfxClick(0.5, 2600);
      if (at(0.86)) sfxClick(0.5, 2400);
      if (at(1.0)) sfxClick(1, 900);
      if (st.reloadT >= RELOAD) { st.reloadT = -1; st.shots = 0; }
    }
    flash = Math.max(0, flash - dt * 9);

    g.clearRect(0, 0, DW, DH);
    if (flash > 0) { g.fillStyle = `rgba(255, 199, 63, ${0.1 * flash})`; g.fillRect(0, 0, DW, DH); }
    drawGibs(dt);
    drawPuffs(dt);
    if (showGun && st.rise > 0.001) {
      const up = ease(st.rise);
      const bob = Math.sin(st.clock * 1.7) * 1.5, sway = Math.cos(st.clock * 0.85) * 2;
      let ox = DW - 50 + sway, oy = DH + 2 + bob + (1 - up) * 140, rot = 0.04, open = false, hand = 1, fk = 0;
      if (st.fireT >= 0) {
        const k = st.fireT;
        const kick = k < 0.06 ? k / 0.06 : Math.max(0, 1 - (k - 0.06) / 0.34);
        ox += 5 * kick; oy += 16 * kick; rot += 0.1 * kick;
        fk = k < 0.05 ? 1 : k < 0.1 ? 0.6 : 0;
      }
      if (st.reloadT >= 0) {
        const r = st.reloadT;
        // it drops out of sight, comes back up broken open with the breech toward you, then snaps shut and drops
        // away again before rising to aim: hard cuts between poses, like sprite frames
        if (r < 0.25) { const k = ease(r / 0.25); oy += 44 * k; rot += 0.3 * k; }
        else if (r < 1.0) { oy -= 26; ox -= 6; rot += 0.5; open = true; }
        else { const k = 1 - ease((r - 1.0) / (RELOAD - 1.0)); oy += 44 * k; rot += 0.3 * k; }
        hand = r < 0.32 ? 1 - r / 0.32 : r > 1.0 ? (r - 1.0) / 0.25 : 0;
        hand = clamp(hand, 0, 1);
      }
      drawGun(ox, oy, rot, open, hand, fk);
      if (st.reloadT > 0.35 && st.reloadT < 1.0) {
        const r = st.reloadT;
        drawLoadingHand(r < 0.7 ? (r - 0.35) / 0.35 : r > 0.85 ? 1 - (r - 0.85) / 0.15 : 1, ox, oy);
      }
    }
    drawShells(dt);
    quantize();
    tint.classList.toggle('on', st.shown);
    stage.classList.toggle('doom', st.shown && showGun);
  }

  // snap the smooth drawing to the palette, with ordered dithering, and alpha to all or nothing
  function quantize() {
    const img = g.getImageData(0, 0, DW, DH);
    const d = img.data;
    for (let y = 0; y < DH; y++) {
      for (let x = 0; x < DW; x++) {
        const i = (y * DW + x) * 4;
        const a = d[i + 3];
        if (a === 0) continue;
        const th = BAYER[(y & 3) * 4 + (x & 3)];
        if (a / 255 < 0.5 + th) { d[i + 3] = 0; continue; }
        // un-premultiply what the browser blended against transparent, then dither
        const m = 255 / a;
        const off = th * 22;
        const r = clamp(d[i] * m + off, 0, 255), gg = clamp(d[i + 1] * m + off, 0, 255), b = clamp(d[i + 2] * m + off, 0, 255);
        const p = PAL[LUT[((r >> 3) << 10) | ((gg >> 3) << 5) | (b >> 3)]];
        d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2]; d[i + 3] = 255;
      }
    }
    out.putImageData(img, 0, 0);
  }

  /* ---------------------------------------------------------------- sound */
  let musicNodes = null, trackEl = null, trackUrl = null;
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
  function sfxShot() {
    const a = A(); if (!a || !soundOn()) return;
    const { ctx, out: o } = a, t = ctx.currentTime;
    const ws = ctx.createWaveShaper(); ws.curve = shapeCurve(6);
    const gn = ctx.createGain(); gn.gain.value = 0.5;
    ws.connect(gn).connect(o);
    burst(ctx, ws, t, 0.5, 'lowpass', 7000, 500, 1.0);
    burst(ctx, ws, t, 0.09, 'highpass', 2500, 2500, 0.6);
    tone(ctx, ws, t, 0.35, 'sine', 120, 38, 1.0);
    burst(ctx, o, t + 0.05, 1.1, 'bandpass', 900, 300, 0.12, 0.5);   // the room ringing after
  }
  function sfxClick(vol, f) {
    const a = A(); if (!a || !soundOn()) return;
    const { ctx, out: o } = a, t = ctx.currentTime;
    burst(ctx, o, t, 0.05, 'bandpass', f, f * 0.8, 0.5 * vol, 4);
    tone(ctx, o, t, 0.08, 'square', f / 3, f / 4, 0.05 * vol);
  }
  function sfxGib(size) {
    const a = A(); if (!a || !soundOn()) return;
    const { ctx, out: o } = a, t = ctx.currentTime;
    burst(ctx, o, t, 0.45, 'lowpass', 1800, 180, 0.9);
    burst(ctx, o, t + 0.03, 0.25, 'bandpass', 600, 1500, 0.4, 3);   // wet
    tone(ctx, o, t, 0.3, 'sine', 90, 35, 0.6 * Math.min(1, size / 8));
    for (let i = 0; i < 4; i++) burst(ctx, o, t + rand(0.25, 0.7), 0.08, 'lowpass', 700, 300, 0.25);   // pieces landing
    // a death bellow, pitched down
    const ws = ctx.createWaveShaper(); ws.curve = shapeCurve(4); ws.connect(o);
    tone(ctx, ws, t, 0.55, 'sawtooth', rand(170, 230), 55, 0.12);
  }

  // The music: an original drop-tuned metal loop, 8 bars at 132 bpm, made of distorted saws, a sub bass and a
  // synthesized kit. (Or, if you've given it your own track, that, looped.)
  const BPM = 132, STEP = 60 / BPM / 4;
  const C = 65.41;   // a low C
  const semi = (n) => C * 2 ** (n / 12);
  // per bar: 16 steps, each '' (rest), 'x' (palm-muted chug on the root), or a number (an open power chord, semitones)
  const RIFF = {
    A: ['0', 'x', '', 'x', 'x', 'x', '0', '', 'x', 'x', '', 'x', '3', '', 'x', 'x'],
    B: ['0', 'x', '', 'x', 'x', 'x', '0', '', 'x', 'x', '', 'x', '1', '2', '3', '5'],
    C: ['0', '', 'x', 'x', '6', '', 'x', 'x', '0', '', 'x', 'x', '1', '', '1', ''],
    D: ['0', 'x', 'x', 'x', 'x', 'x', 'x', 'x', '7', '', '6', '', '5', '', '3', '1'],
  };
  const SONG = ['A', 'A', 'B', 'C', 'A', 'A', 'B', 'D'];
  let schedTimer = null, nextStep = 0, stepNo = 0;
  function startMusic() {
    if (trackUrl) { startTrack(); return; }
    const a = A(); if (!a || musicNodes) return;
    const { ctx, out: o } = a;
    const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(o);
    bus.gain.setTargetAtTime(0.32, ctx.currentTime, 0.3);
    const gtr = ctx.createGain(); gtr.gain.value = 1;
    const ws = ctx.createWaveShaper(); ws.curve = shapeCurve(28); ws.oversample = '2x';
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
    const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 650; mid.gain.value = -5; mid.Q.value = 1;
    const gOut = ctx.createGain(); gOut.gain.value = 0.32;
    gtr.connect(ws).connect(hp).connect(mid).connect(lp).connect(gOut).connect(bus);
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
    const parts = mute ? [[1, 0], [1, 9]] : [[1, 0], [1, 11], [1.5, -6], [2, 5]];
    for (const [mul, det] of parts) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = freq * mul; o.detune.value = det;
      o.connect(f); o.start(at); o.stop(at + dur + 0.02);
    }
    // the sub under it
    const sub = ctx.createOscillator(); sub.type = 'square'; sub.frequency.value = freq / 2;
    const sl = ctx.createBiquadFilter(); sl.type = 'lowpass'; sl.frequency.value = 160;
    const sg = ctx.createGain(); sg.gain.setValueAtTime(0.22, at); sg.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    sub.connect(sl).connect(sg).connect(m.bus); sub.start(at); sub.stop(at + dur + 0.02);
  }
  function kick(m, at) { tone(m.ctx, m.drums, at, 0.22, 'sine', 160, 42, 0.9); burst(m.ctx, m.drums, at, 0.02, 'highpass', 3000, 3000, 0.25); }
  function snare(m, at) { burst(m.ctx, m.drums, at, 0.2, 'bandpass', 2000, 1500, 0.7, 0.7); tone(m.ctx, m.drums, at, 0.1, 'triangle', 210, 160, 0.35); }
  function hat(m, at, open) { burst(m.ctx, m.drums, at, open ? 0.22 : 0.04, 'highpass', 8000, 8000, 0.16); }
  function crash(m, at) { burst(m.ctx, m.drums, at, 1.4, 'highpass', 5000, 4000, 0.22); }
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
      // drums: kick on every chug and chord, snare on 2 and 4, eighth hats; double kick through bar D
      if (v !== '' || (SONG[bar] === 'D' && s < 8)) kick(m, nextStep);
      if (s === 4 || s === 12) snare(m, nextStep);
      if (SONG[bar] === 'D' && s >= 12) snare(m, nextStep);
      if (s % 2 === 0) hat(m, nextStep, s === 14);
      if (s === 0 && (bar === 0 || bar === 4)) crash(m, nextStep);
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
  function startTrack() {
    if (!trackEl) { trackEl = new Audio(); trackEl.loop = true; trackEl.volume = 0.55; }
    if (trackEl.src !== trackUrl) trackEl.src = trackUrl;
    if (soundOn()) trackEl.play().catch(() => {});
  }
  function syncSound() {
    // follows the sound button: off means off
    if (!st.shown || !soundOn()) { if (musicNodes || (trackEl && !trackEl.paused)) stopMusic(); return; }
    if (trackUrl ? (!trackEl || trackEl.paused) : !musicNodes) startMusic();
  }

  /* -------------------------------------------------------- your own track */
  const DB = 'firelight-exp', STORE = 'track';
  function idb() {
    return new Promise((res, rej) => {
      try {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(STORE);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      } catch (e) { rej(e); }
    });
  }
  async function setTrack(file) {
    stopMusic();
    if (trackUrl) URL.revokeObjectURL(trackUrl);
    trackUrl = file ? URL.createObjectURL(file) : null;
    try {
      const db = await idb();
      const tx = db.transaction(STORE, 'readwrite');
      if (file) tx.objectStore(STORE).put(file, 'track'); else tx.objectStore(STORE).delete('track');
    } catch (e) { /* not kept; it still plays this time */ }
    syncSound();
  }
  async function loadTrack() {
    try {
      const db = await idb();
      const blob = await new Promise((res) => { const r = db.transaction(STORE).objectStore(STORE).get('track'); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); });
      if (blob) trackUrl = URL.createObjectURL(blob);
      return blob ? (blob.name || 'your track') : null;
    } catch (e) { return null; }
  }

  /* ------------------------------------------------------------------ api */
  return {
    get on() { return st.on; },
    get shown() { return st.shown; },
    get ready() { return st.shown && st.rise > 0.85 && st.reloadT < 0 && st.shots < SHELLS && (st.fireT < 0 || st.fireT > 0.22); },
    unlock() { st.on = true; st.shown = true; syncSound(); },
    off() { st.on = false; st.shown = false; stopMusic(); gibs = []; puffs = []; shells = []; },
    toggle() { if (!st.on) return; st.shown = !st.shown; syncSound(); },
    // the corner the gun lives in, in game coordinates (320x180)
    inGun: (gx, gy) => gx > 252 && gy > 112,
    // pull the trigger; false if the gun can't fire right now
    fire() {
      if (!this.ready) return false;
      st.fireT = 0;
      st.shots += 1;
      flash = 1;
      sfxShot();
      if (st.shots >= SHELLS) setTimeout(() => { if (st.reloadT < 0) st.reloadT = 0; }, 330);
      return true;
    },
    gib, puff, frame, syncSound, setTrack, loadTrack,
    hasTrack: () => !!trackUrl,
  };
}
