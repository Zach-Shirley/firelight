// Difficulty simulation: automated players run full nights at high speed through the game's test hook.
// Usage, in the browser console on the running game:
//   const sim = await import('/tools/sim.js');
//   sim.report(300);
// Not shipped with the game.

const F = () => window.__firelight;

// What a player can actually perceive at a knock: footsteps (real visitors, and mimics that fake them
// from 3 am) and, with a lit blood lantern, the truth.
const heardFootsteps = (v) => v.who !== 'mimic' || v.fake;
const lanternTruth = (S, v) => (S.lantern && S.lanternLit ? v.who !== 'mimic' : null);
const food = (S) => S.meat + S.cooked;
// In the blizzard, how cold each player lets themselves get before going out again (a beginner doesn't notice).
const COLD_LIMIT = { beginner: 85, learner: 35, strong: 15, skilled: 15, hoarder: 15 };
function goOut(f, S, mem) {
  if (S.nightNo >= 3 && S.cold > (COLD_LIMIT[mem.name] ?? 40)) { if (S.fire <= 3) f.act.stoke(); return undefined; }
  return f.act.wood();
}
// pick a dialogue choice by its key, if it is available
const keyed = (d, key) => d.choices.findIndex((c) => c.key === key && (!c.can || c.can()));
const feedAny = (d) => { const i = keyed(d, 'cooked'); return i >= 0 ? i : keyed(d, 'raw'); };

// Plays the obvious moves and nothing else: opens most doors, ignores the howling,
// reacts to the hand half the time, rarely builds, feeds the stranger whenever she asks (if it can).
function beginner(f, S, mem, picky = false) {
  const d = f.dialog;
  if (!d && !S.away && S.hatch.phase === 'lift') { if (mem.hatchAt !== S.hatchFed + ':' + Math.round(S.night / 5)) { mem.hatchAt = S.hatchFed + ':' + Math.round(S.night / 5); mem.willSlam = Math.random() < (picky ? 0.75 : 0.5); } if (mem.willSlam) f.act.slam(); }
  if (d) {
    if (d.id === 'knock') return f.choose(Math.random() < 0.7 ? 0 : 1);
    if (d.id === 'cutter') return f.choose(keyed(d, 'no'));
    if (d.id === 'shop') return f.choose(keyed(d, 'leave'));
    if (d.id === 'plea') { const i = feedAny(d); return f.choose(i >= 0 && Math.random() < 0.6 ? i : keyed(d, 'no')); }
    if (d.id === 'demand') { const i = feedAny(d); return f.choose(i >= 0 ? i : keyed(d, 'no')); }
    if (d.id === 'strangerDead') return f.choose(Math.random() < 0.5 ? 0 : 1);
    return f.choose(0);
  }
  // a big, widening grin is hard to ignore: sometimes they run
  if (S.away) {
    if (!S.away.kind || S.away.kind === 'drag') return;
    if (mem.tripAt !== S.away.total) { mem.tripAt = S.away.total; mem.willRun = Math.random() < 0.5; }
    if (mem.willRun && S.stalk > 60) f.act.runBack();
    return;
  }
  if (S.hand.phase === 'warn') mem.handId = S.night.toFixed(0);
  if (S.hand.phase === 'reach') {
    if (!mem.reacted.has(mem.handId)) { mem.reacted.add(mem.handId); mem.willStrike = Math.random() < 0.5; }
    if (mem.willStrike) f.act.strike();
  }
  if (!S.lit || S.fire <= 2) f.act.stoke();
  if (S.meat >= 2) f.act.cook();
  if (S.hunger >= 75 && (picky ? S.cooked > 0 : food(S) > 0)) f.act.eat();
  if (!S.boardsBuilt && S.wood >= 14) f.act.build('boards');
  if (food(S) === 0 && S.hunger > 50 && S.traps < 1 && S.wood >= 6) f.act.build('trap');   // the build menu says traps are the only meat
  if (food(S) === 0 && S.hunger > 50) return goOut(f, S, mem);
  if (S.wood < 4) return goOut(f, S, mem);
}

// A first-time player who reads: plays like a beginner, but follows each of the stranger's hints once heard.
// Hints, in order: footsteps, board the window, the hunter, the walkers and the lantern.
function learner(f, S, mem) {
  const d = f.dialog;
  if (!d && !S.away && S.hatch.phase === 'lift' && S.hatch.p > 0.3) f.act.slam();   // a reader slams it, a beat late
  if (!d && !S.away && S.salt >= 2 && !S.saltDoor) f.act.build('saltDoor');   // she said salt stops one of them
  if (d && d.id === 'knock' && S.hint >= 1) {
    const truth = S.hint >= 4 ? lanternTruth(S, d.visit) : null;
    return f.choose((truth ?? heardFootsteps(d.visit)) ? 0 : 1);
  }
  if (d && d.id === 'plea') { const i = feedAny(d); return f.choose(i >= 0 ? i : keyed(d, 'no')); }
  if (d && d.id === 'strangerDead') return f.choose(0);
  if (!d && !S.away) {
    // a reader learns from the first bout of sickness: cook first, eat raw only when desperate
    if (S.meat >= 1 && S.fire >= 1) f.act.cook();
    if (S.hunger >= 70 && S.cooked > 0) f.act.eat();
    if (S.hunger >= 88 && S.cooked === 0) f.act.eat();
    if (S.wood >= 23) { if (S.fire <= 3) f.act.stoke(); }   // the pile is nearly full: burn some, don't fetch more
    if (S.hint >= 2) {
      if (S.hand.phase === 'reach') f.act.strike();
      if (!S.boardsBuilt && S.wood >= 8) f.act.build('boards');
      if (!S.boardsBuilt && S.wood < 8 && !S.hunter.near) return goOut(f, S, mem);
    }
    if (S.hint >= 4 && !S.lantern && S.blood >= 4 && S.wood >= 10) f.act.build('lantern');
    // told the lantern matters: save wood, and blood from the traps
    if (S.hint >= 4 && !S.lantern && !S.hunter.near && S.stalk < 10) {
      if (S.wood < 12) return goOut(f, S, mem);
      if (S.blood < 4) { if (S.traps < 2 && S.wood >= 6) f.act.build('trap'); return goOut(f, S, mem); }
    }
  }
  if (!d && S.away && ((S.hint >= 3 && S.hunter.near) || S.stalk > 45)) return f.act.runBack();
  if (!d && !S.away && S.hint >= 3 && S.hunter.near) {
    if (!S.lit || S.fire <= 2) f.act.stoke();
    if (S.meat >= 1) f.act.cook();
    if (S.hunger >= 75 && food(S) > 0) f.act.eat();
    return;
  }
  return beginner(f, S, mem, true);
}

// Knows every tell: footsteps, the walkers after 3 am (gets the lantern first), waits out the howling,
// boards the window before 1 am, burns the claw, feeds the stranger only on her last plea.
// With human = true it reacts like a strong player rather than a machine: a beat late to the claw and the
// howl, and it misreads the footsteps now and then.
function skilled(f, S, mem, human = false, hoard = false) {
  const d = f.dialog;
  if (d) {
    if (d.id === 'knock') {
      const truth = lanternTruth(S, d.visit);
      const misread = human && truth === null && Math.random() < 0.05;
      const open = truth ?? heardFootsteps(d.visit);
      return f.choose(open !== misread ? 0 : 1);
    }
    if (d.id === 'cutter') { const i = food(S) >= 3 && S.wood < 10 ? keyed(d, 'meatForWood') : S.wood >= 18 && food(S) < 2 ? keyed(d, 'woodForMeat') : -1; return f.choose(i >= 0 ? i : keyed(d, 'no')); }
    if (d.id === 'shop') { for (const k of ['grate', 'spear', 'shoes']) { const i = keyed(d, k); if (i >= 0) return f.choose(i); } return f.choose(keyed(d, 'leave')); }
    if (d.id === 'plea') { const i = keyed(d, 'cooked'); return f.choose(d.last && i >= 0 ? i : keyed(d, 'no')); }
    if (d.id === 'demand') return f.choose(keyed(d, 'leave'));
    if (d.id === 'strangerDead') return f.choose(0);
    return f.choose(0);
  }
  const noticeHowl = !human || S.hunter.since > mem.howlDelay;
  if (S.away) { if (S.hunter.near && noticeHowl && S.away.kind !== 'drag') f.act.runBack(); return; }
  if (!S.hunter.near) mem.howlDelay = 0.5 + Math.random() * 1.5;
  if (S.hand.phase === 'reach' && (!human || S.hand.p > mem.clawDelay)) f.act.strike();
  if (S.hatch.phase === 'lift' && (!human || S.hatch.p > mem.clawDelay)) f.act.slam();
  if (S.salt >= 2 && !S.saltDoor) f.act.build('saltDoor');
  if (S.salt >= 2 && !S.saltWin) f.act.build('saltWin');
  if (S.nightNo >= 2 && !S.hatchBar && S.wood >= 10) f.act.build('bar');
  if (S.hand.phase !== 'reach') mem.clawDelay = 0.1 + Math.random() * 0.35;
  if (S.hand.phase === 'crawl' && S.wood >= 8) f.act.build('boards');
  if (!S.lit || S.fire <= 2 || (S.fire === 3 && S.wood > 12)) f.act.stoke();
  if (S.meat >= 1 && S.fire >= 1) f.act.cook();
  if (S.hunger >= 60 && S.cooked > 0) f.act.eat();
  if (S.hunger >= 88 && S.cooked === 0 && S.meat > 0) f.act.eat();
  if (S.blaze > 0) f.act.douse();
  if (S.fur >= 4 && !S.coat) f.act.build('coat');
  if (S.nightNo >= 3 && !S.rack && S.wood >= 20) f.act.build('rack');
  if (S.nightNo >= 3 && S.cold > 25 && S.fire <= 3) f.act.stoke();
  if (S.salt >= 1 && S.cooked >= 2) f.act.build('cure');
  if (!S.shed && S.wood >= 25 && !S.hunter.near && S.hand.phase === 'idle' && S.hour !== 0) f.act.build('shed');
  if (!S.boardsBuilt && S.wood >= 9 && S.night > 50) f.act.build('boards');
  if (!S.boardsBuilt && S.glassBroken && S.wood >= 12) f.act.build('boards');   // re-board after she tears them off
  if (S.traps < 2 && S.wood >= 6) f.act.build('trap');
  if (S.traps < 3 && S.wood >= 12 && S.boardsBuilt) f.act.build('trap');
  if (!S.lantern && S.blood >= 4 && S.wood >= 10) f.act.build('lantern');
  if (S.hunter.near) return;
  if (hoard) {
    // the hoarder's plan: three traps at once, wood until midnight, then as few trips as possible
    if (S.traps < 3 && S.wood >= 6) f.act.build('trap');
    if (S.night < 2 * 52.5 && S.wood < 25) return goOut(f, S, mem);
    if (food(S) === 0 && S.hunger > 40) return goOut(f, S, mem);
    if (S.wood < 6) return goOut(f, S, mem);
    return;
  }
  if (food(S) < 2 && S.traps) return goOut(f, S, mem);   // meat only comes from the traps, checked on each trip
  if (S.wood < 12 || (S.shed && S.wood + S.shedWood < 40)) return goOut(f, S, mem);
}

const strong = (f, S, mem) => skilled(f, S, mem, true);

// Plays like the strong player, but with Zach's plan: rush three traps, haul wood until midnight, then sit tight.
const hoarder = (f, S, mem) => skilled(f, S, mem, true, true);

export const players = { beginner, learner, strong, skilled, hoarder };

// How each player spends the day between the nights: in priority order, while the hours last.
const dayPlans = {
  beginner: ['chop', 'hunt', 'sleep'],
  learner: ['sleep', 'window', 'chop', 'hunt', 'traps'],
  strong: ['sit', 'sleep', 'window', 'scavenge', 'chop', 'traps', 'hunt'],
  skilled: ['sit', 'sleep', 'window', 'scavenge', 'chop', 'traps', 'hunt'],
  hoarder: ['sleep', 'chop', 'window', 'traps'],
};

function spendDay(f, name) {
  for (const id of dayPlans[name]) f.day.do(id);
  for (const id of dayPlans[name]) f.day.do(id);   // a second pass fills leftover hours
  f.day.night();
}

// Play night 1, and for the survivors the day and night 2. Reports night-2 results among those who reached it.
export function runTwo(name, n) {
  const f = F();
  const out = { reached: 0, deaths: {}, wins: 0, scores: [], times: [] };
  window.__simulating = true;
  for (let i = 0; i < n; i++) {
    f.newNight();
    const mem = { name, reacted: new Set(), handId: '0', willStrike: false, howlDelay: 1, clawDelay: 0.2 };
    let guard = 0;
    while (f.mode === 'playing' && guard++ < 2000) { players[name](f, f.state, mem); f.step(0.5, false); }
    if (!f.state.won) continue;
    f.step(5, false);
    if (f.dialog) f.choose(0);
    out.reached += 1;
    f.day.start();
    spendDay(f, name);
    guard = 0;
    while (f.mode === 'playing' && guard++ < 2000) { players[name](f, f.state, mem); f.step(0.5, false); }
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
  window.__simulating = false;
  out.scores.sort((a, b) => a - b);
  out.times.sort((a, b) => a - b);
  const r = summarize(out, Math.max(1, out.reached));
  r.reachedNight2 = `${out.reached}/${n}`;
  return r;
}

// Start straight at a later night with the playtest kit (see devKit in main.js) and play it out.
export function runFrom(name, which, n) {
  const f = F();
  const out = { deaths: {}, wins: 0, scores: [], times: [] };
  window.__simulating = true;
  for (let i = 0; i < n; i++) {
    f.dev(which);
    if (which.startsWith('day')) spendDay(f, name);
    const mem = { name, reacted: new Set(), handId: '0', willStrike: false, howlDelay: 1, clawDelay: 0.2 };
    let guard = 0;
    while (f.mode === 'playing' && guard++ < 2000) { players[name](f, f.state, mem); f.step(0.5, false); }
    const S = f.state;
    if (S.won) { out.wins += 1; f.step(5, false); if (f.dialog) f.choose(0); out.scores.push(S.final); }
    else { out.deaths[S.cause] = (out.deaths[S.cause] || 0) + 1; out.times.push(Math.round(S.night)); f.step(4, false); }
  }
  window.__simulating = false;
  out.scores.sort((a, b) => a - b);
  out.times.sort((a, b) => a - b);
  return summarize(out, n);
}

export function run(name, n) {
  const f = F();
  const out = { deaths: {}, wins: 0, scores: [], times: [] };
  window.__simulating = true;
  for (let i = 0; i < n; i++) {
    f.newNight();
    const mem = { name, reacted: new Set(), handId: '0', willStrike: false, howlDelay: 1, clawDelay: 0.2 };
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
  window.__simulating = false;
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


/* ---------------------------------------------------------- the perfect player, all five nights */

// Knows everything the game can teach and reacts instantly: every tell, every defense from nights 3 to 5, buys
// what is worth buying, and hoards. The ceiling for the score and the yardstick for the playtest kits.
const HOUR_S = 52.5;
const clock = (S) => S.night / HOUR_S;   // hours since 10 pm
const bloodHourNow = (S) => S.nightNo >= 5 && Math.floor(clock(S)) === 5;
const floodSoon = (S) => S.nightNo >= 5 && clock(S) >= 6.3;
const curedOf = (S) => S.cookedLife.filter((l) => l > 1e8).length;
const labelIndex = (d, word) => d.choices.findIndex((c) => c.label.includes(word));
const shutIndex = (d) => labelIndex(d, 'keep it shut');
const SHOP_ORDER = ['stove', 'grate', 'shoes', 'spear', 'ironTrap'];
const CLOTHES = [['coat', 6], ['curtains', 5], ['pants', 5], ['hat', 4], ['socks', 3], ['insulate', 6]];

function perfect(f, S, mem) {
  const d = f.dialog;
  const n = S.nightNo;
  if (d) {
    if (d.id === 'knock') {
      const v = d.visit;
      if (bloodHourNow(S) || floodSoon(S)) return f.choose(shutIndex(d));
      if (n >= 5) {
        // two feet under the door means nothing now: only the slot tells
        if (S.slot && !v.looked) return f.choose(labelIndex(d, 'slot'));
        const right = v.looked && !['mimic', 'ash', 'blood', 'phantom'].includes(v.who);
        return f.choose(right ? labelIndex(d, 'open') : shutIndex(d));
      }
      // without a lit lantern, from 3 am footsteps can be faked: then nobody comes in
      const truth = lanternTruth(S, v);
      const open = truth ?? (clock(S) < 5 && heardFootsteps(v));
      return f.choose(open && v.who !== 'phantom' ? labelIndex(d, 'open') : shutIndex(d));
    }
    if (d.id === 'cutter') {
      const meat = S.meat + S.cooked - curedOf(S);
      if (meat + curedOf(S) < 3 && S.wood >= 12) { const i = keyed(d, 'woodForMeat'); if (i >= 0) return f.choose(i); }   // hungry: logs for food
      if (!S.axe && meat >= 3) { const i = keyed(d, 'axe'); if (i >= 0) return f.choose(i); }
      // two meat for fifteen logs is the best deal in the woods whenever wood is short
      if (meat + curedOf(S) >= 6 && (S.meat >= 2 || S.wood + S.shedWood < 60)) { const i = keyed(d, 'meat2ForWood'); if (i >= 0) return f.choose(i); }
      if (S.meat >= 1 && meat + curedOf(S) >= 5) { const i = keyed(d, 'meatForWood'); if (i >= 0) return f.choose(i); }
      return f.choose(keyed(d, 'no'));
    }
    if (d.id === 'shop') {
      for (const k of SHOP_ORDER) { const i = keyed(d, k); if (i >= 0 && S.blood >= 7) return f.choose(i); }
      const salt = keyed(d, 'salt');
      if (salt >= 0 && S.salt < 12 && S.blood >= 5) return f.choose(salt);   // 3 salt for a jar of blood
      return f.choose(keyed(d, 'leave'));
    }
    // she only needs feeding on her last plea; on the last night feeding her makes her stronger for the ending
    if (d.id === 'plea') { const i = keyed(d, 'cooked'); return f.choose(i >= 0 && (d.last || (n >= 5 && S.cooked >= 3) || S.cooked >= 8) ? i : keyed(d, 'no')); }
    if (d.id === 'demand') return f.choose(keyed(d, 'leave'));
    return f.choose(0);
  }
  if (S.away) { if ((S.hunter.near || S.stalk > (mem.flee ?? 30)) && S.away.kind !== 'drag') f.act.runBack(); return; }
  // instant reactions
  if (S.hand.phase === 'reach') f.act.strike();
  if (S.hatch.phase === 'lift') f.act.slam();
  if (S.blaze > 0) f.act.douse();
  f.act.swat();
  // the fire never goes out: that is the keeper's ending
  if (!S.lit || S.fire <= 2 || (S.fire === 3 && S.wood > (n >= 3 ? 6 : 12))) f.act.stoke();
  if (S.meat >= 1 && S.fire >= 1) f.act.cook();
  if (S.hunger >= 60 && S.cooked - curedOf(S) > 0) f.act.eat();
  if (S.hunger >= 80 && S.cooked > 0) f.act.eat();
  const saltKeep = n >= 4 ? 4 : 0;   // goblin nights: salt is for throwing
  if (S.salt > saltKeep) f.act.build('cure');
  // defenses
  if (n >= 4 && S.salt >= 1) for (const c of ['bl', 'fl', 'fr', 'br']) f.act.build(`saltGob_${c}`);
  if (S.salt >= 2) { f.act.build('saltDoor'); f.act.build('saltWin'); }
  if (n >= 2) { f.act.build('bar'); if (S.salt >= 4) f.act.build('saltHatch'); }
  // boards come first, then the traps; everything else waits on a reserve of logs (bare window: she takes ten)
  if (!S.boardsBuilt && (S.wood >= 11 || (S.wood >= 8 && clock(S) > 2.4))) f.act.build('boards');   // keep a few for the fire
  const spare = S.wood - (S.boardsBuilt ? 8 : 16);
  if (S.boardsBuilt && S.traps < 2 && S.wood >= 12) f.act.build('trap');
  if (S.traps < 3 && spare >= 6) f.act.build('trap');
  if (!S.lantern && S.blood >= 4 && spare >= 8) f.act.build('lantern');
  if (S.salt >= 3 + saltKeep && S.traps) f.act.build('saltTrap');
  if (n >= 3 && !S.rack && spare >= 12) f.act.build('rack');
  if (n >= 3) for (const [k, c] of CLOTHES) if (S.fur >= c) f.act.build(k);
  if (n >= 3 && n <= 4) f.act.curtains(true);
  if (n >= 4) {
    for (const c of ['bl', 'fl', 'fr', 'br']) {
      if (spare >= 2 || (S.torches && S.torches[c] === 'out')) f.act.build(`torch_${c}`);
      if (S.salt >= 1) f.act.build(`saltGob_${c}`);
    }
    // a full woodshed is a nest: keep the cabinet planked, open it only to restock the pile
    if (S.shed && !S.cabBar && S.wood >= 15) f.act.build('barCab');
    if (S.cabBar && S.wood < 8 && S.shedWood > 0) f.act.build('unbarCab');
  }
  if (n >= 5 && spare >= 6) f.act.build('slot');
  if (floodSoon(S)) { if (!S.cabBar && S.wood >= 3) f.act.build('barCab'); if (!S.boardsBuilt && S.wood >= 8) f.act.build('boards'); return; }
  // the woodshed goes up a few logs at a time, whenever there are logs to spare and it is quiet
  // (you carry every log out to build with, so only with plenty, and the fire roaring first)
  if (!S.shed && S.wood >= 20 && S.boardsBuilt && S.traps >= 2 && !S.hunter.near && S.hand.phase === 'idle' && S.stalk < 3 && !bloodHourNow(S)) {
    if (S.fire < 4) return f.act.stoke();
    return f.act.build('shed');
  }
  // trips: out whenever it is quiet, the way a hoarder would
  const low = S.wood + S.shedWood < 10;   // running low: go while it is still possible
  if (S.hunter.near || S.stalk > (n >= 4 && !low ? 3 : low ? 25 : mem.bold ?? 15) || bloodHourNow(S)) return;
  if (S.hand.phase !== 'idle' || S.hatch.phase !== 'idle') return;
  if (n >= 3 && S.cold > (S.wood + S.shedWood < 20 ? 45 : 10)) return;   // low on logs, it goes anyway unless it is dangerously cold
  if (n >= 4 && (S.goblins.length >= 2 || (S.goblins.length && S.salt < 1) || !S.saltDoor) && S.wood >= 6) return;   // one more could be the last
  const cap = 25 + (S.shed ? ({ normal: 100, hard: 70, insane: 50 }[S.diff] || 100) : 0);
  if (S.wood + S.shedWood < cap - 4 || S.traps) return f.act.wood();
}
players.perfect = perfect;
dayPlans.perfect = ['sit', 'sleep', 'traps', 'window', 'chop', 'chop', 'scavenge', 'chop', 'hunt'];

const snap = (S, night) => ({
  night, wood: S.wood + S.shedWood, raw: S.meat, cooked: S.cooked - curedOf(S), cured: curedOf(S),
  blood: S.blood, salt: S.salt, fur: S.fur, traps: S.traps,
  shed: !!S.shed, rack: !!S.rack, stove: !!S.stove, shoes: !!S.shoes, spear: !!S.spear, axe: !!S.axe,
  coat: !!S.coat, curtains: !!S.curtains, stranger: S.stranger === 'inside' && !S.strangerFalse, score: S.final,
});

// whole runs, nights 1 to 5 with the days between: where each died, and what it held at each dawn
export function runFull(name = 'perfect', n = 50, diff = 'normal', tune = {}) {
  const f = F();
  const out = { n, diff, deaths: {}, finished: 0, dawns: [[], [], [], [], [], []], starts: [[], [], [], [], [], []], finals: [], endings: {} };
  window.__simulating = true;
  for (let i = 0; i < n; i++) {
    f.newNight(diff);
    const mem = { name, reacted: new Set(), handId: '0', willStrike: false, howlDelay: 1, clawDelay: 0.2, ...tune };
    for (let night = 1; night <= 5; night++) {
      let guard = 0;
      while (f.mode === 'playing' && guard++ < 3000) { players[name](f, f.state, mem); f.step(0.5, false); }
      let g2 = 0;
      while (f.mode === 'dawn' && g2++ < 100) { if (f.dialog) f.choose(0); f.step(0.5, false); }
      const S = f.state;
      if (!S.won) { const k = `n${night}:${S.cause}`; out.deaths[k] = (out.deaths[k] || 0) + 1; f.step(4, false); break; }
      out.dawns[night].push(snap(S, night));
      if (night === 5) { out.finished += 1; out.finals.push(S.final); out.endings[S.ending] = (out.endings[S.ending] || 0) + 1; break; }
      f.day.start();
      spendDay(f, name);
      out.starts[night + 1].push(snap(f.state, night + 1));   // what it walks into the next night with
    }
  }
  window.__simulating = false;
  return out;
}

const median = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
export function fullReport(n = 50, diffs = ['normal', 'hard', 'insane'], name = 'perfect', tune = {}) {
  const rep = {};
  for (const diff of diffs) {
    const r = runFull(name, n, diff, tune);
    const dawns = {};
    for (let k = 1; k <= 5; k++) {
      const list = r.dawns[k];
      if (!list.length) continue;
      const m = { reached: `${list.length}/${n}` };
      for (const key of ['wood', 'raw', 'cooked', 'cured', 'blood', 'salt', 'fur', 'traps', 'score']) m[key] = median(list.map((x) => x[key]));
      for (const key of ['shed', 'rack', 'stove', 'shoes', 'spear', 'axe', 'coat', 'curtains', 'stranger']) m[key] = `${Math.round((list.filter((x) => x[key]).length / list.length) * 100)}%`;
      dawns[k] = m;
    }
    const starts = {};
    for (let k = 2; k <= 5; k++) {
      const list = r.starts[k];
      if (!list.length) continue;
      const m = { reached: `${list.length}/${n}` };
      for (const key of ['wood', 'raw', 'cooked', 'cured', 'blood', 'salt', 'fur', 'traps', 'score']) m[key] = median(list.map((x) => x[key]));
      for (const key of ['shed', 'rack', 'stove', 'shoes', 'spear', 'axe', 'coat', 'curtains', 'stranger']) m[key] = `${Math.round((list.filter((x) => x[key]).length / list.length) * 100)}%`;
      starts[k] = m;
    }
    rep[diff] = { finished: `${r.finished}/${n}`, deaths: r.deaths, endings: r.endings,
      final: r.finals.length ? { min: Math.min(...r.finals), median: median(r.finals), max: Math.max(...r.finals) } : null, dawns, starts };
  }
  F().backToTitle();
  return rep;
}
