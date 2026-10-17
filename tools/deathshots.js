// Dev helper for checking the death scenes frame by frame in the browser console:
//   await import('/tools/deathshots.js'); sheet([...await shot('burn', [1, 2, 3, 4])])
// Camera moves (starving, the cellar) are CSS transforms, so they don't show in these frames.
const F = window.__firelight;

window.shot = async (cause, times, setup) => {
  F.newNight();
  F.step(1, false);
  if (setup) setup(F.state, F);
  F.die(cause);
  const out = [];
  let t = 0;
  for (const tt of times) {
    F.step(tt - t, true);
    t = tt;
    const c = document.createElement('canvas');
    c.width = 640; c.height = 360;
    const g = c.getContext('2d');
    g.drawImage(document.getElementById('pix'), 0, 0, 640, 360);
    g.drawImage(document.getElementById('light'), 0, 0, 640, 360);
    g.fillStyle = '#fff'; g.font = '14px monospace'; g.fillText(`${cause} ${tt}`, 6, 16);
    out.push(c);
  }
  return out;
};

window.sheet = (cs) => {
  document.getElementById('sheet')?.remove();
  const d = document.createElement('div');
  d.id = 'sheet';
  d.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#222;display:flex;flex-wrap:wrap;gap:2px;align-content:flex-start';
  for (const c of cs) { c.style.width = '49.5%'; d.appendChild(c); }
  document.body.appendChild(d);
};
