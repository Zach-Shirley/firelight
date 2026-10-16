// Difficulty simulation: automated players run full nights at high speed through the game's test hook.
// Usage, in the browser console on the running game:
//   const sim = await import('/tools/sim.js');
//   sim.report(300);
// Not shipped with the game.

const F = () => window.__firelight;

// Plays the obvious moves and nothing else: opens most doors, ignores the howling,
// reacts to the hand half the time, rarely builds.
function beginner(f, S, mem) {
  const d = f.dialog;
  if (d) {
    if (d.id === 'knock') return f.choose(Math.random() < 0.7 ? 0 : 1);
    if (d.id === 'kidAsk') return f.choose(Math.random() < 0.5 && S.meat >= 1 ? 0 : 1);
    if (d.id === 'cutter') return f.choose(2);
    return f.choose(0);
  }
  if (S.away) return;
  if (S.hand.phase === 'warn') mem.handId = S.night.toFixed(0);
  if (S.hand.phase === 'reach') {
    if (!mem.reacted.has(mem.handId)) { mem.reacted.add(mem.handId); mem.willStrike = Math.random() < 0.5; }
    if (mem.willStrike) f.act.strike();
  }
  if (!S.lit || S.fire <= 2) f.act.stoke();
  if (S.hunger >= 75 && S.meat > 0) f.act.eat();
  if (!S.boardsBuilt && S.wood >= 14) f.act.build('boards');
  if (S.meat === 0 && S.hunger > 50) return f.act.hunt();
  if (S.wood < 4) return f.act.wood();
}

// A first-time player who reads: plays like a beginner, but follows each of the stranger's hints once heard.
function learner(f, S, mem) {
  const d = f.dialog;
  if (d && d.id === 'knock' && S.hint >= 1) return f.choose(d.visit.who === 'mimic' ? 1 : 0);
  if (!d && !S.away && S.hint >= 3) {
    if (S.hand.phase === 'reach') f.act.strike();
    if (!S.boardsBuilt && S.wood >= 10) f.act.build('boards');
  }
  if (!d && S.away && S.hint >= 2 && S.hunter.near) return f.act.runBack();
  if (!d && !S.away && S.hint >= 2 && S.hunter.near) {
    if (!S.lit || S.fire <= 2) f.act.stoke();
    if (S.hunger >= 75 && S.meat > 0) f.act.eat();
    return;
  }
  return beginner(f, S, mem);
}

// Knows every tell: listens for footsteps, waits out the howling, always burns the hand, keeps boards up.
function skilled(f, S) {
  const d = f.dialog;
  if (d) {
    if (d.id === 'knock') return f.choose(d.visit.who === 'mimic' ? 1 : 0);
    if (d.id === 'kidAsk') return f.choose(S.meat >= 2 ? 0 : 1);
    if (d.id === 'cutter') return f.choose(S.meat >= 2 && S.wood < 10 ? 0 : 2);
    return f.choose(0);
  }
  if (S.away) { if (S.hunter.near) f.act.runBack(); return; }
  if (S.hand.phase === 'reach') f.act.strike();
  if (!S.lit || S.fire <= 2 || (S.fire === 3 && S.wood > 12)) f.act.stoke();
  if (S.hunger >= 65 && S.meat > 0) f.act.eat();
  if (!S.boardsBuilt && S.wood >= 11 && S.night > 60) f.act.build('boards');
  if (S.boardsBuilt && S.boards < 2 && S.wood >= 9) f.act.build('repair');
  if (S.hunter.near) return;
  if (S.meat < 2 && S.hunger > 30) return f.act.hunt();
  if (S.wood < 12) return f.act.wood();
}

export const players = { beginner, learner, skilled };

export function run(name, n) {
  const f = F();
  const out = { deaths: {}, wins: 0, scores: [], times: [] };
  for (let i = 0; i < n; i++) {
    f.newNight();
    const mem = { reacted: new Set(), handId: '0', willStrike: false };
    let guard = 0;
    while (f.mode === 'playing' && guard++ < 2000) {
      players[name](f, f.state, mem);
      f.step(0.5, false);
    }
    const S = f.state;
    if (S.won) {
      out.wins += 1;
      f.step(5, false);
      if (f.dialog) f.choose(0);
      out.scores.push(S.final);
    } else {
      out.deaths[S.cause] = (out.deaths[S.cause] || 0) + 1;
      out.times.push(Math.round(S.night));
      f.step(4, false);
    }
  }
  out.scores.sort((a, b) => a - b);
  out.times.sort((a, b) => a - b);
  return out;
}

const pct = (a, n) => `${Math.round((a / n) * 100)}%`;

export function summarize(r, n) {
  const mid = (arr) => arr[Math.floor(arr.length / 2)];
  return {
    survived: pct(r.wins, n),
    deaths: Object.fromEntries(Object.entries(r.deaths).map(([k, v]) => [k, pct(v, n)])),
    medianDeathAt: r.times.length ? `${Math.floor(mid(r.times) / 60)}m${String(mid(r.times) % 60).padStart(2, '0')}s` : null,
    score: r.scores.length ? { min: r.scores[0], median: mid(r.scores), max: r.scores[r.scores.length - 1] } : null,
  };
}

export function report(n = 300) {
  const out = {};
  for (const name of Object.keys(players)) out[name] = summarize(run(name, n), n);
  F().backToTitle();
  return out;
}

