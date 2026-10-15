// Firelight — a small firelit-room survival scene.
// The pixel layer is drawn at 320x180 and scaled up with crisp pixels.
// The light layer runs at full screen resolution so the glow stays smooth.

import * as sfx from './sound.js';

const W = 320, H = 180;
const FIRE = { x: 160, y: 136 };          // base of the flames
const LIGHT_Y = 130;                       // centre of the light pool
const ELLIPSE = 0.8;                       // light pool is a little squashed

const FIRE_NAMES = ['dead', 'smoldering', 'flickering', 'burning', 'roaring'];
const LIGHT_R = [14, 42, 70, 102, 142];
const FIRE_DECAY = 30;                     // seconds per fire level (40 with the rug)
const STOKE_CD = 6;
const GATHER_CD = 12;
const TRAPS_CD = 25;
const LANTERN = { x: 240, y: 70 };
const STRANGER_WARMTH = 40;                // seconds of a decent fire before the knock
const SAVE_KEY = 'firelight-save-v1';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const pix = $('pix'), px = pix.getContext('2d');
const light = $('light'), lx = light.getContext('2d');
pix.width = W; pix.height = H;

const ui = {
  wood: $('wood'), message: $('message'),
  stoke: $('stoke'), gather: $('gather'),
  dialogue: $('dialogue'), dlgText: $('dlgText'), dlgChoices: $('dlgChoices'),
  portrait: $('portrait'),
  journal: $('journal'), journalList: $('journalList'),
  traps: $('traps'), build: $('buildBtn'),
  buildPanel: $('build'), buildList: $('buildList'),
  sound: $('soundBtn'),
};

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ------------------------------------------------------------------ state */

function freshState() {
  return {
    v: 1,
    time: 0,
    wood: 4,
    fur: 0,
    meat: 0,
    teeth: 0,
    built: { trap: 0, cart: 0, boards: 0, rug: 0, lantern: 0 },
    fire: 0,
    decay: FIRE_DECAY,
    lit: false,
    deadFor: 0,
    cd: { stoke: 0, gather: 0, traps: 0 },
    warmth: 0,
    darkTime: 0,
    stealTimer: 25,
    seenEyes: false,
    stranger: 'waiting',   // waiting | knocking | away | inside | gone
    refused: 0,
    talkTimer: 25,
    talked: false,
    helperTimer: 15,
    helperCount: 0,
    visitTimer: 45,
    lastVisit: '',
    giftTimer: -1,
    sound: true,
    log: [],
  };
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s && s.v === 1) {
      const f = freshState();
      return Object.assign(f, s, { cd: Object.assign(f.cd, s.cd), built: Object.assign(f.built, s.built) });
    }
  } catch (e) { /* storage unavailable or corrupt: start fresh */ }
  return null;
}

function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
}

let S = load() || freshState();

// Transient, not saved
let particles = [];
let eyes = [];
let dialog = null;
let knockTimer = 2.5;
let msgQueue = [];
let msgTimer = 0;
let dispR = 0;
let door = 0;              // 0 closed .. 1 open
let doorTarget = 0;
let walker = null;         // stranger walking in: { x, y, step }
let introTimer = S.time === 0 ? 0.8 : -1;
let saveTimer = 3;
let huddleSaid = false;
let pendingVisit = null;   // { id, t } a visitor about to appear
let doorCloseIn = -1;
let windowFace = 0;        // seconds the face stays in the window
let shake = 0;
let buildRefresh = '';  // last build-panel state, to re-render only on change
const snow = Array.from({ length: 10 }, () => ({ x: rand(45, 76), y: rand(35, 66), v: rand(3, 7) }));

/* --------------------------------------------------------------- messages */

function say(text) {
  S.log.push(text);
  if (S.log.length > 60) S.log.shift();
  msgQueue.push(text);
  // keep the line current; older lines are still in the journal
  if (msgQueue.length > 2) msgQueue.shift();
  if (!ui.journal.classList.contains('hidden')) renderJournal();
}

function updateMessages(dt) {
  msgTimer -= dt;
  // Shorten the current line when others are waiting.
  if (msgQueue.length && msgTimer > 1.4 && ui.message.classList.contains('show') && msgTimer < 3.6) msgTimer = 1.4;
  if (msgTimer <= 0) {
    if (msgQueue.length) {
      ui.message.textContent = msgQueue.shift();
      ui.message.classList.add('show');
      msgTimer = 4.2;
    } else {
      ui.message.classList.remove('show');
    }
  } else if (msgTimer < 0.7 && !msgQueue.length) {
    ui.message.classList.remove('show');
  }
}

/* ---------------------------------------------------------------- actions */

function stoke() {
  if (S.cd.stoke > 0 || S.wood < 1 || dialog) return;
  S.wood -= 1;
  const was = S.fire;
  S.fire = S.fire === 0 ? 2 : Math.min(4, S.fire + 1);
  S.decay = decayTime();
  S.cd.stoke = STOKE_CD;
  S.deadFor = 0;
  huddleSaid = false;
  if (!S.lit) {
    S.lit = true;
    say('the fire catches. the dark pulls back.');
    setTimeout(() => say("the wood won't last. there's a forest past the door."), 3500);
  } else if (was === 0) {
    say('the fire flickers back to life.');
  } else if (S.fire !== was) {
    say(`the fire is ${FIRE_NAMES[S.fire]}.`);
  }
  for (let i = 0; i < 18; i++) spawnEmber(true);
  sfx.crackle(4);
  save();
}

function decayTime() { return S.built.rug ? 40 : FIRE_DECAY; }

const GATHER_LINES = [
  'dry branches, half buried in snow.',
  'the forest is quiet. too quiet.',
  'you drag a fallen limb back inside.',
  'snapped twigs and one good log.',
  'something moved between the trees. you hurry back.',
];

function gather() {
  if (S.cd.gather > 0 || dialog || !S.lit) return;
  const n = (2 + Math.floor(Math.random() * 3)) * (S.built.cart ? 2 : 1);
  S.wood += n;
  S.cd.gather = GATHER_CD;
  say(`${S.built.cart && Math.random() < 0.4 ? 'the cart groans under the load.' : pick(GATHER_LINES)} +${n} wood`);
  save();
}

function checkTraps() {
  if (S.cd.traps > 0 || dialog || !S.built.trap) return;
  const got = { fur: 0, meat: 0, teeth: 0 };
  for (let i = 0; i < S.built.trap; i++) {
    const r = Math.random();
    if (r < 0.2) continue;
    if (r < 0.62) got.fur += 1;
    else if (r < 0.88) got.meat += 1;
    else got.teeth += 1;
  }
  S.cd.traps = TRAPS_CD;
  const parts = Object.entries(got).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`);
  if (!parts.length) {
    say(pick(['the traps are empty. something got there first.', 'empty traps. the snow around them is churned up.']));
  } else {
    for (const k in got) S[k] += got[k];
    say(`the traps hold: ${parts.join(', ')}.`);
  }
  save();
}

/* ------------------------------------------------------------------ build */

const BUILDS = [
  { id: 'trap', name: 'trap', max: 6, desc: 'catches things in the snow. check them for fur, meat and teeth.',
    cost: () => ({ wood: 8 + 4 * S.built.trap }), line: 'the stranger sets a trap out in the snow.' },
  { id: 'cart', name: 'cart', max: 1, desc: 'haul twice as much wood from the forest.',
    cost: () => ({ wood: 25 }), line: 'the stranger knocks together a rickety cart.' },
  { id: 'boards', name: 'window boards', max: 1, desc: 'nail the window shut. nothing looks in.',
    cost: () => ({ wood: 10 }), line: 'the window is boarded up. it helps. a little.' },
  { id: 'rug', name: 'fur rug', max: 1, desc: 'keeps the warmth in. the fire burns down slower.',
    cost: () => ({ fur: 6 }), line: 'the stranger lays a fur rug by the fire. it smells like the forest.' },
  { id: 'lantern', name: 'lantern', max: 1, desc: 'a second light by the door. the dark keeps its distance.',
    cost: () => ({ wood: 10, meat: 3, teeth: 1 }), line: 'the stranger hangs a lantern by the door. it burns fat and smells awful.' },
];

const canAfford = (cost) => Object.entries(cost).every(([k, n]) => S[k] >= n);
const costText = (cost) => Object.entries(cost).map(([k, n]) => `${n} ${k}`).join(', ');

function build(id) {
  const b = BUILDS.find((x) => x.id === id);
  if (!b || S.built[id] >= b.max || dialog) return;
  const cost = b.cost();
  if (!canAfford(cost)) return;
  for (const k in cost) S[k] -= cost[k];
  S.built[id] += 1;
  say(b.line);
  sfx.chime();
  renderBuild();
  save();
}

function renderBuild() {
  ui.buildList.innerHTML = '';
  for (const b of BUILDS) {
    const li = document.createElement('li');
    const done = S.built[b.id] >= b.max;
    const cost = b.cost();
    const count = b.max > 1 ? ` <span class="dim">${S.built[b.id]}/${b.max}</span>` : '';
    li.innerHTML = `<div class="row"><span class="name">${b.name}${count}</span>
      <button ${done || !canAfford(cost) || dialog ? 'disabled' : ''}>${done ? 'built' : 'build'}</button></div>
      <div class="desc">${b.desc}</div>
      ${done ? '' : `<div class="cost">${costText(cost)}</div>`}`;
    li.querySelector('button').addEventListener('click', () => build(b.id));
    ui.buildList.appendChild(li);
  }
}

function toggleBuild(force) {
  if (!S.talked && force !== false) return;
  const open = force ?? ui.buildPanel.classList.contains('hidden');
  ui.buildPanel.classList.toggle('hidden', !open);
  if (open) { toggleJournal(false); renderBuild(); }
}

/* --------------------------------------------------------------- dialogue */

const DIALOGUES = {
  arrive: {
    text: 'The door creaks open. A stranger stands in the snow, wrapped in a torn cloak, shaking. She stares past you, at the fire.',
    choices: [
      { label: 'let her in', act: letIn },
      { label: 'shut the door', act: shutOut },
    ],
  },
  return: {
    text: "She's back. Snow clings to her hood and her hands have gone blue. She doesn't knock this time. She just waits.",
    choices: [
      { label: 'let her in', act: letIn },
      { label: 'shut the door', act: shutOut },
    ],
  },
  talk: {
    text: 'The stranger turns from the fire. Her voice is rough. "Keep this fire alive and I\'ll keep it fed. Bring me what you find out there and I can build." She glances at the window. "The forest doesn\'t scare me. Not the forest, anyway."',
    choices: [
      { label: 'deal', act: () => { S.talked = true; S.helperTimer = 10; say('the stranger will bring in wood. she can build things, too.'); } },
    ],
  },
  nomad: {
    portrait: 'nomad', door: 'nomad',
    text: 'A nomad ducks under the doorframe, snow on his shoulders and a huge bundle of furs on his back. "Cold night to be alone," he says. "Trade?"',
    choices: [
      { label: 'give 6 wood for 2 fur', can: () => S.wood >= 6, act: () => { S.wood -= 6; S.fur += 2; say('the nomad hands over two thick furs. +2 fur'); } },
      { label: 'give 3 fur for 2 teeth', can: () => S.fur >= 3, act: () => { S.fur -= 3; S.teeth += 2; say("he drops two long teeth in your palm. you don't ask. +2 teeth"); } },
      { label: 'give 2 teeth for 4 meat', can: () => S.teeth >= 2, act: () => { S.teeth -= 2; S.meat += 4; say('he unwraps four strips of dried meat. +4 meat'); } },
      { label: 'not tonight', act: () => say('the nomad shrugs and walks back into the snow.') },
    ],
  },
  kid: {
    portrait: 'kid', door: 'kid',
    text: 'A thin kid stands in the doorway, hugging their elbows. "Do you have anything to eat? Anything at all?"',
    choices: [
      { label: 'give 2 meat', can: () => S.meat >= 2, act: () => { S.meat -= 2; S.giftTimer = 70; say('the kid eats it in about four seconds, then is gone.'); } },
      { label: 'nothing to spare', act: () => say('the kid nods, like they expected that.') },
    ],
  },
  kidGift: {
    portrait: 'kid', door: 'kid',
    text: 'The kid is back, standing a little straighter. They drop a bundle on the floor: furs, and a string of strange teeth. "For before," they say.',
    choices: [
      { label: 'thank them', act: () => { S.fur += 4; S.teeth += 3; say('the kid is already gone. +4 fur, +3 teeth'); } },
    ],
  },
  tap: {
    portrait: 'dark',
    text: () => 'Tap. Tap. Tap. Something is knocking on the window glass, slow and patient.' + (S.stranger === 'inside' ? " The stranger doesn't turn around." : ''),
    choices: [
      { label: 'look', act: () => { windowFace = 1.8; shake = 0.45; sfx.sting(); } },
      { label: "don't look", act: () => say('you stare into the fire until it stops.') },
    ],
  },
  scratch: {
    portrait: 'dark',
    text: () => 'Something is scratching at the bottom of the door. Long, slow scrapes.' + (S.stranger === 'inside' ? ' The stranger shakes her head. "Don\'t."' : ''),
    choices: [
      { label: 'open the door', act: openOnScratch },
      { label: 'throw a log on the fire', can: () => S.wood >= 1, act: () => {
        S.wood -= 1; S.fire = Math.max(2, Math.min(4, S.fire + 1)); S.decay = decayTime(); S.lit = true; S.deadFor = 0;
        for (let i = 0; i < 18; i++) spawnEmber(true);
        say('the fire jumps. the scratching stops.');
      } },
      { label: 'wait it out', act: () => say('it goes on for a long time. then it stops.') },
    ],
  },
};

function openOnScratch() {
  doorTarget = 1;
  doorCloseIn = 1.6;
  if (S.meat > 0) {
    const lost = S.meat;
    S.meat = 0;
    say(`nothing there. when you turn around, the meat is gone. -${lost} meat`);
  } else {
    say('nothing there. just tracks in the snow, too big, leading away.');
  }
}

const VISIT_INTRO = {
  nomad: () => { sfx.knock(); say('someone knocks. heavy, confident.'); },
  kid: () => { sfx.knock(2); say('a small knock. barely there.'); },
  kidGift: () => { sfx.knock(2); say('a small knock again.'); },
  tap: () => { sfx.tap(); say('tap. tap. tap.'); },
  scratch: () => { sfx.scratch(); say('something is scratching at the door.'); },
};

function queueVisit(id) {
  pendingVisit = { id, t: 2.4 };
  VISIT_INTRO[id]();
}

function updateVisitors(dt) {
  if (!(S.talked || S.stranger === 'gone') || walker || pendingVisit) return;
  if (S.giftTimer > 0) {
    S.giftTimer -= dt;
    if (S.giftTimer <= 0) { S.giftTimer = -1; queueVisit('kidGift'); return; }
  }
  // the dark brings visitors sooner
  S.visitTimer -= dt * (S.fire <= 1 && S.lit ? 2 : 1);
  if (S.visitTimer > 0) return;
  S.visitTimer = rand(55, 95);
  const pool = [];
  if (S.fire >= 1) pool.push('nomad', 'nomad');
  if (S.fire >= 1 && S.giftTimer < 0) pool.push('kid');
  if (S.fire <= 1 && S.lit && !S.built.boards) pool.push('tap', 'tap');
  if (S.fire <= 1 && S.lit) pool.push('scratch');
  const fresh = pool.filter((k) => k !== S.lastVisit);
  const choice = pick(fresh.length ? fresh : pool);
  if (!choice) return;
  S.lastVisit = choice;
  queueVisit(choice);
}

function openDialogue(id) {
  const d = DIALOGUES[id];
  dialog = id;
  toggleBuild(false);
  toggleJournal(false);
  ui.dlgText.textContent = typeof d.text === 'function' ? d.text() : d.text;
  ui.dlgChoices.innerHTML = '';
  d.choices.forEach((c, i) => {
    const b = document.createElement('button');
    b.innerHTML = `<span class="key">${i + 1}.</span> ${c.label}`;
    b.disabled = c.can ? !c.can() : false;
    b.addEventListener('click', () => choose(i));
    ui.dlgChoices.appendChild(b);
  });
  ui.dialogue.classList.remove('hidden');
  drawPortrait(d.portrait || 'stranger');
  if (id === 'arrive' || id === 'return' || d.door) doorTarget = 1;
}

function choose(i) {
  if (!dialog) return;
  const d = DIALOGUES[dialog];
  const c = d.choices[i];
  if (!c || (c.can && !c.can())) return;
  dialog = null;
  ui.dialogue.classList.add('hidden');
  if (d.door) doorTarget = 0;
  c.act();
  save();
}

function letIn() {
  S.stranger = 'inside';
  S.talkTimer = 25;
  walker = { x: 274, y: 113, step: 0 };
  say('the stranger shuffles to the fire and sits down.');
}

function shutOut() {
  doorTarget = 0;
  if (S.refused === 0) {
    S.refused = 1;
    S.stranger = 'away';
    S.strangerTimer = 50;
    say('footsteps crunch away into the snow.');
  } else {
    S.stranger = 'gone';
    say("the knocking doesn't come again. something else might.");
  }
}

/* ------------------------------------------------------------------ logic */

function update(dt) {
  if (introTimer >= 0) {
    introTimer -= dt;
    if (introTimer < 0) say('the room is cold and dark.');
  }

  for (const k in S.cd) S.cd[k] = Math.max(0, S.cd[k] - dt);
  updateMessages(dt);

  if (!dialog) {
    S.time += dt;

    // fire burns down
    if (S.fire > 0) {
      S.decay -= dt;
      if (S.decay <= 0) {
        S.fire -= 1;
        S.decay = decayTime();
        say(S.fire === 0 ? 'the fire is dead.' : `the fire is ${FIRE_NAMES[S.fire]}.`);
      }
    } else if (S.lit) {
      S.deadFor += dt;
    }

    if (S.fire >= 2) S.warmth += dt;
    if (S.fire <= 1) S.darkTime += dt;
    else S.darkTime = Math.max(0, S.darkTime - dt * 3);

    // in a long darkness, something steals wood
    if (S.lit && S.fire === 0 && S.darkTime > 40 && S.wood > 0) {
      S.stealTimer -= dt;
      if (S.stealTimer <= 0) {
        S.wood -= 1;
        S.stealTimer = 25;
        say('something drags a log out of the light.');
      }
    }

    updateStranger(dt);
    updateVisitors(dt);
    if (S.fire > 0 && Math.random() < dt * S.fire * 2.5) sfx.crackle(S.fire);
  }

  if (pendingVisit && !dialog) {
    pendingVisit.t -= dt;
    if (pendingVisit.t <= 0) { const id = pendingVisit.id; pendingVisit = null; openDialogue(id); }
  }
  if (doorCloseIn > 0) {
    doorCloseIn -= dt;
    if (doorCloseIn <= 0) doorTarget = 0;
  }
  if (windowFace > 0) {
    windowFace -= dt;
    if (windowFace <= 0) {
      S.teeth += 3;
      say("it's gone. on the sill outside, a neat little pile of teeth. +3 teeth");
    }
  }
  shake = Math.max(0, shake - dt);

  // the light pool grows and shrinks smoothly with the fire
  dispR += (targetRadius() - dispR) * Math.min(1, dt * 1.8);

  // door eases open/closed
  door += (doorTarget - door) * Math.min(1, dt * 4);

  updateWalker(dt);
  updateEyes(dt);
  updateParticles(dt);
  for (const f of snow) {
    f.y += f.v * dt;
    f.x += Math.sin(S.time * 0.8 + f.v) * dt * 2;
    if (f.y > 66) { f.y = 35; f.x = rand(45, 76); }
  }

  saveTimer -= dt;
  if (saveTimer <= 0) { save(); saveTimer = 3; }
}

function updateStranger(dt) {
  if (S.stranger === 'waiting' && S.warmth >= STRANGER_WARMTH) {
    S.stranger = 'knocking';
    knockTimer = 2.5;
    sfx.knock();
    say('someone is knocking at the door.');
  }
  if (S.stranger === 'knocking') {
    knockTimer -= dt;
    if (knockTimer <= 0) openDialogue(S.refused ? 'return' : 'arrive');
  }
  if (S.stranger === 'away') {
    S.strangerTimer -= dt;
    if (S.strangerTimer <= 0) {
      S.stranger = 'knocking';
      knockTimer = 2.5;
      sfx.knock(3, true);
      say('a knock. slower this time.');
    }
  }
  if (S.stranger === 'inside' && !walker) {
    if (!S.talked && S.fire >= 1) {
      S.talkTimer -= dt;
      if (S.talkTimer <= 0) openDialogue('talk');
    }
    if (S.talked && S.fire >= 2) {
      S.helperTimer -= dt;
      if (S.helperTimer <= 0) {
        S.wood += 1;
        S.helperTimer = 15;
        S.helperCount += 1;
        if (S.helperCount % 3 === 1) say('the stranger drops a log by the fire.');
      }
    }
    if (S.fire === 0 && S.lit && !huddleSaid) {
      huddleSaid = true;
      say('the stranger huddles closer to the coals.');
    }
  }
}

function updateWalker(dt) {
  if (!walker) return;
  const tx = 194, ty = 136;
  const dx = tx - walker.x, dy = ty - walker.y;
  const d = Math.hypot(dx, dy);
  const sp = 22 * dt;
  walker.step += dt;
  if (d <= sp) {
    walker = null;
    doorTarget = 0;
  } else {
    walker.x += (dx / d) * sp;
    walker.y += (dy / d) * sp;
  }
}

/* ------------------------------------------------------------------- eyes */

// Places in the room where something could be watching from.
const EYE_SPOTS = [
  { x: 48, y: 42, w: 24, h: 18, weight: 3, window: true },    // window
  { x: 8, y: 20, w: 28, h: 80, weight: 2 },     // left wall
  { x: 294, y: 20, w: 20, h: 80, weight: 2 },   // right wall
  { x: 90, y: 8, w: 140, h: 14, weight: 1 },    // up near the ceiling
  { x: 10, y: 150, w: 50, h: 22, weight: 2 },   // front-left floor
  { x: 255, y: 150, w: 55, h: 22, weight: 2 },  // front-right floor
  { x: 226, y: 30, w: 24, h: 60, weight: 1 },   // beside the door
];

function nearLantern(x, y, pad) {
  return S.built.lantern && Math.hypot(x - LANTERN.x, (y - LANTERN.y) / ELLIPSE) < 36 + pad;
}

function lightDist(x, y) {
  const dx = x - FIRE.x, dy = (y - LIGHT_Y) / ELLIPSE;
  return Math.hypot(dx, dy);
}

let eyeSpawn = 0.5;

function spawnEye(peek) {
  const total = EYE_SPOTS.reduce((a, s) => a + s.weight, 0);
  for (let tries = 0; tries < 12; tries++) {
    let r = Math.random() * total, spot = EYE_SPOTS[0];
    for (const s of EYE_SPOTS) { r -= s.weight; if (r <= 0) { spot = s; break; } }
    if (peek) spot = EYE_SPOTS[0];
    const x = Math.round(rand(spot.x, spot.x + spot.w));
    const y = Math.round(rand(spot.y, spot.y + spot.h));
    if (lightDist(x, y) < dispR + 14 || nearLantern(x, y, 10)) continue;
    if (spot.window && S.built.boards) continue;
    if (eyes.some((e) => Math.hypot(e.x - x, e.y - y) < 14)) continue;
    eyes.push({
      x, y, alpha: 0, blink: rand(1.5, 5), blinkT: -1, out: false,
      red: Math.random() < (S.fire === 0 ? 0.3 : 0.1),
      peek: peek ? 2.5 : 0,
    });
    if (!S.seenEyes) { S.seenEyes = true; say('there are eyes in the dark.'); }
    return;
  }
}

function updateEyes(dt) {
  let want = 0;
  if (S.fire <= 1) {
    want = (S.fire === 1 ? 2 : 3) + Math.floor(S.darkTime / 15) + (S.stranger === 'gone' ? 2 : 0);
    want = Math.min(want, 8);
  }
  const live = eyes.filter((e) => !e.out && !e.peek).length;
  eyeSpawn -= dt;
  if (live < want && eyeSpawn <= 0) {
    spawnEye(false);
    eyeSpawn = rand(1.2, 3.5);
  }
  // a rare peek through the window even when the fire is decent
  if (S.fire === 2 && !S.built.boards && !eyes.length && Math.random() < dt * 0.025) spawnEye(true);

  for (const e of eyes) {
    if (e.peek) {
      e.peek -= dt;
      if (e.peek <= 0) e.out = true;
    }
    if (!e.peek && (S.fire >= 2 || live > want + 1)) e.out = true;
    if (lightDist(e.x, e.y) < dispR + 4 || nearLantern(e.x, e.y, 0)) e.out = true;

    if (e.out) {
      e.alpha -= dt * 2.5;
    } else {
      e.alpha = Math.min(1, e.alpha + dt * 0.5);
      // in a dead room they creep closer, but never into the light
      if (S.fire === 0 && S.lit && lightDist(e.x, e.y) > dispR + 12) {
        const dx = FIRE.x - e.x, dy = LIGHT_Y - e.y, d = Math.hypot(dx, dy);
        e.x += (dx / d) * dt * 1.6;
        e.y += (dy / d) * dt * 1.6;
      }
    }

    e.blink -= dt;
    if (e.blink <= 0 && e.blinkT < 0) { e.blinkT = 0; e.blink = rand(2, 6); }
    if (e.blinkT >= 0) { e.blinkT += dt; if (e.blinkT > 0.22) e.blinkT = -1; }
  }
  eyes = eyes.filter((e) => !(e.out && e.alpha <= 0));
}

/* -------------------------------------------------------------- particles */

const FLAME_RATE = [0, 22, 48, 85, 135];
const FLAME_W = [0, 3, 4, 6, 8];
let flameAcc = 0;

function spawnFlame() {
  const lvl = S.fire;
  const w = FLAME_W[lvl];
  const max = 0.35 + lvl * 0.13 + rand(0, 0.15);
  particles.push({
    x: FIRE.x + rand(-w, w), y: FIRE.y - rand(0, 2),
    vx: 0, vy: -(rand(10, 18) + lvl * 6),
    life: 0, max, ember: false,
  });
}

function spawnEmber(burst) {
  particles.push({
    x: FIRE.x + rand(-4, 4), y: FIRE.y - rand(2, 8),
    vx: rand(-6, 6), vy: -rand(14, burst ? 40 : 28),
    life: 0, max: rand(1.2, 2.4), ember: true,
  });
}

function updateParticles(dt) {
  if (S.fire > 0) {
    flameAcc += FLAME_RATE[S.fire] * dt;
    while (flameAcc >= 1) { spawnFlame(); flameAcc -= 1; }
    if (Math.random() < dt * S.fire * 1.2) spawnEmber(false);
  }
  for (const p of particles) {
    p.life += dt;
    if (p.ember) {
      p.vx += Math.sin((p.life + p.max) * 6) * dt * 20;
    } else {
      // pull flames toward the centre so they taper into a point
      p.vx = (FIRE.x - p.x) * 2.2 + rand(-8, 8);
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  particles = particles.filter((p) => p.life < p.max);
}

/* ------------------------------------------------------------------ draw */

const C = {
  void: '#0b0807',
  wall: '#2a201b', wallHi: '#33271f', wallLo: '#221a16', mortar: '#151010',
  floor: '#2b1d14', floorHi: '#35251a', floorSeam: '#170f0a',
  frame: '#3a281b', frameHi: '#4e3725',
  night: '#0a1020', nightHi: '#111a30', star: '#8a96b8', moon: '#d8d8c8', snow: '#c8d0e0',
  stone: '#4a4440', stoneHi: '#6a625b', stoneLo: '#2e2a27', ash: '#1f1a17',
  logBark: '#5a3a22', logEnd: '#a07a4e', logRing: '#6b4a2c', char: '#2a1a10',
};

const bg = document.createElement('canvas');
bg.width = W; bg.height = H;

function drawBackground() {
  const g = bg.getContext('2d');
  let seed = 7;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // back wall: rows of stone blocks
  g.fillStyle = C.mortar; g.fillRect(0, 0, W, 112);
  for (let row = 0; row * 8 < 112; row++) {
    const off = row % 2 ? 8 : 0;
    for (let x = -off; x < W; x += 16) {
      const v = r();
      g.fillStyle = v < 0.33 ? C.wallLo : v < 0.8 ? C.wall : C.wallHi;
      g.fillRect(x + 1, row * 8 + 1, 15, 7);
      if (r() < 0.25) { g.fillStyle = C.wallLo; g.fillRect(x + 2 + Math.floor(r() * 10), row * 8 + 2, 2, 1); }
    }
  }
  // skirting where wall meets floor
  g.fillStyle = '#120c09'; g.fillRect(0, 110, W, 3);

  // floor planks
  g.fillStyle = C.floor; g.fillRect(0, 113, W, H - 113);
  for (let y = 113, i = 0; y < H; y += 6, i++) {
    g.fillStyle = C.floorSeam; g.fillRect(0, y, W, 1);
    g.fillStyle = C.floorHi; g.fillRect(0, y + 1, W, 1);
    for (let x = (i * 37) % 60; x < W; x += 60) { g.fillStyle = C.floorSeam; g.fillRect(x, y, 1, 6); }
  }

  // window
  g.fillStyle = C.frame; g.fillRect(42, 32, 38, 38);
  g.fillStyle = C.night; g.fillRect(45, 35, 32, 32);
  g.fillStyle = C.nightHi; g.fillRect(45, 35, 32, 6);
  g.fillStyle = C.moon; g.fillRect(68, 38, 4, 4); g.fillStyle = C.night; g.fillRect(70, 38, 2, 2);
  g.fillStyle = C.star;
  [[49, 39], [56, 44], [62, 37], [51, 50], [73, 48], [59, 55]].forEach(([x, y]) => g.fillRect(x, y, 1, 1));
  // treeline
  g.fillStyle = '#060a14';
  for (let x = 45; x < 77; x += 4) { const h = 6 + Math.floor(r() * 6); g.fillRect(x, 67 - h, 3, h); g.fillRect(x + 1, 66 - h, 1, 1); }
  g.fillStyle = C.snow; g.fillRect(45, 65, 32, 2);
  g.fillStyle = C.frameHi; g.fillRect(42, 32, 38, 1); g.fillRect(42, 69, 38, 2);

  // shelf with jars
  g.fillStyle = C.frame; g.fillRect(200, 60, 34, 3);
  g.fillStyle = '#3d3a35'; g.fillRect(204, 53, 5, 7);
  g.fillStyle = '#4a3020'; g.fillRect(212, 55, 4, 5);
  g.fillStyle = '#363a3e'; g.fillRect(220, 52, 6, 8);

  // bedroll on the floor, back right
  g.fillStyle = '#3b2e2a'; g.fillRect(222, 118, 28, 7);
  g.fillStyle = '#4a3a33'; g.fillRect(222, 118, 7, 7);
  g.fillStyle = '#2a201d'; g.fillRect(222, 124, 28, 1);

  // fire pit: ash bed and stone ring
  g.fillStyle = C.ash;
  g.fillRect(146, 136, 28, 7); g.fillRect(149, 135, 22, 9);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const sx = Math.round(FIRE.x + Math.cos(a) * 16 - 2);
    const sy = Math.round(139 + Math.sin(a) * 5 - 1);
    g.fillStyle = C.stoneLo; g.fillRect(sx, sy + 1, 5, 3);
    g.fillStyle = C.stone; g.fillRect(sx, sy, 5, 3);
    g.fillStyle = C.stoneHi; g.fillRect(sx + 1, sy, 2, 1);
  }
}

function drawDoor() {
  // frame
  px.fillStyle = C.frame; px.fillRect(254, 48, 40, 64);
  px.fillStyle = '#050404'; px.fillRect(257, 51, 34, 61);
  if (door > 0.05) {
    // outside: snow and dark trees
    px.fillStyle = '#0a1020'; px.fillRect(257, 51, 34, 61);
    px.fillStyle = '#060a14'; for (let x = 258; x < 290; x += 5) px.fillRect(x, 70 + ((x * 7) % 9), 3, 30);
    px.fillStyle = '#9aa4b8'; px.fillRect(257, 102, 34, 10);
    px.fillStyle = C.snow; for (const f of snow) px.fillRect(Math.round(f.x + 212), Math.round(f.y + 30), 1, 1);
  }
  // door slab, swinging inward to the left
  const w = Math.max(3, Math.round(34 * (1 - door * 0.85)));
  const x0 = 291 - w;
  px.fillStyle = '#3b2717'; px.fillRect(x0, 51, w, 61);
  px.fillStyle = '#2a1b10';
  for (let x = x0 + 6; x < 291; x += 7) px.fillRect(x, 51, 1, 61);
  if (w > 10) {
    px.fillStyle = '#2a1b10'; px.fillRect(x0, 62, w, 2); px.fillRect(x0, 96, w, 2);
    px.fillStyle = '#8a7a5a'; px.fillRect(x0 + 3, 80, 2, 2);
  }
}

function drawPitLogs() {
  if (!S.lit) return;
  const burnt = S.fire === 0;
  px.fillStyle = burnt ? '#1a120c' : C.char;
  px.fillRect(151, 137, 18, 2);
  px.fillRect(154, 135, 12, 2);
  px.fillStyle = burnt ? '#241810' : C.logBark;
  px.fillRect(151, 137, 3, 2); px.fillRect(166, 137, 3, 2);
}

function drawCoals() {
  if (!S.lit) return;
  const glow = S.fire > 0 ? 1 : Math.max(0, 1 - S.deadFor / 40);
  if (glow <= 0) return;
  for (let i = 0; i < 9; i++) {
    const f = Math.sin(S.time * (3 + i) + i * 2) * 0.5 + 0.5;
    if (f * glow < 0.25) continue;
    px.fillStyle = f * glow > 0.7 ? '#ff7a2a' : f * glow > 0.45 ? '#c8401a' : '#6e1e10';
    px.fillRect(152 + ((i * 5) % 16), 136 + (i % 3), 2, 1);
  }
}

function drawFire() {
  for (const p of particles) {
    const t = p.life / p.max;
    if (p.ember) {
      if (t > 0.85 && Math.random() < 0.5) continue;
      px.fillStyle = t < 0.5 ? '#ffb347' : '#e8551c';
      px.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      continue;
    }
    px.fillStyle = t < 0.18 ? '#fff3b0' : t < 0.42 ? '#ffd35a' : t < 0.68 ? '#ff9a2e' : t < 0.88 ? '#e8551c' : '#a8281a';
    const s = t < 0.5 ? 2 : 1;
    px.fillRect(Math.round(p.x), Math.round(p.y), s, s);
  }
  if (S.fire > 0) {
    // hot core at the base
    px.fillStyle = '#fff3b0';
    const w = FLAME_W[S.fire];
    px.fillRect(FIRE.x - w + 1, FIRE.y - 1, w * 2 - 1, 2);
  }
}

function drawWoodPile() {
  const n = Math.min(S.wood, 30);
  // two pyramids of logs seen end-on, the nearer one fills first
  const piles = [{ x: 104, base: 5 }, { x: 72, base: 5 }];
  let left = n;
  for (const pile of piles) {
    if (left <= 0) break;
    for (let row = 0, width = pile.base; width > 0 && left > 0; row++, width--) {
      for (let i = 0; i < width && left > 0; i++, left--) {
        const x = pile.x + i * 6 + row * 3;
        const y = 142 - row * 4;
        px.fillStyle = C.logBark; px.fillRect(x, y, 6, 5); px.fillRect(x + 1, y - 1, 4, 7);
        px.fillStyle = C.logEnd; px.fillRect(x + 1, y, 4, 5);
        px.fillStyle = C.logRing; px.fillRect(x + 2, y + 2, 2, 1);
      }
    }
  }
}

const SPR_COLORS = { h: '#4b4650', H: '#5d5763', f: '#120d0b', e: '#c9b48a', c: '#38333e', C: '#2a2630', b: '#1d1815', s: '#7a6a5a' };

const STAND = [
  '..hhh..',
  '.hHhhh.',
  '.hfffh.',
  '.hfefh.',
  '.hhhhh.',
  'cccccc.',
  'ccCcccc',
  'ccCcccc',
  '.cCccc.',
  '.ccccc.',
  '.ccccc.',
];
const LEGS = [['.b...b.', '.b...b.'], ['..b.b..', '..b.b..']];

const SIT = [
  '....hhh..',
  '...hHhhh.',
  '...fffhh.',
  '...ffehh.',
  '...hhhhh.',
  '..cccccc.',
  '.cccCcccc',
  'ssccCcccc',
  '.ccccccc.',
  'bbccccccc',
];

const NOMAD_COLORS = { ...SPR_COLORS, h: '#5a4030', H: '#6e5038', c: '#4a3a2a', C: '#3a2a1e' };
const KID_COLORS = { r: '#3a2a1e', k: '#5a4434', e: '#1a1210', s: '#7a2a22', c: '#4a4a3a', b: '#1d1815' };
const KID = [
  '..rrr..',
  '.rrrrr.',
  '.rkkkr.',
  '.rkekr.',
  '..sss..',
  '.ccccc.',
  '.ccccc.',
  '.c...c.',
  '.b...b.',
];

function drawMap(map, x, y, colors = SPR_COLORS) {
  for (let r = 0; r < map.length; r++) {
    const row = map[r];
    for (let c = 0; c < row.length; c++) {
      const k = row[c];
      if (k === '.') continue;
      px.fillStyle = colors[k];
      px.fillRect(x + c, y + r, 1, 1);
    }
  }
}

function drawStranger() {
  if (walker) {
    const legs = LEGS[Math.floor(walker.step * 6) % 2];
    const x = Math.round(walker.x) - 3, y = Math.round(walker.y) - 13;
    drawMap(STAND, x, y);
    drawMap(legs, x, y + 11);
    return;
  }
  if (dialog === 'arrive' || dialog === 'return') {
    // waiting in the doorway, half lost in the snow
    drawMap(STAND, 271, 98);
    drawMap(LEGS[0], 271, 109);
    return;
  }
  if (S.stranger !== 'inside') return;
  // sitting, facing the fire, breathing slowly
  const bob = Math.sin(S.time * 1.6) > 0.6 ? 1 : 0;
  const shiver = S.fire === 0 ? (Math.random() < 0.3 ? 1 : 0) : 0;
  drawMap(SIT, 186 + shiver, 128 + bob);
}

function drawVisitor() {
  const d = dialog && DIALOGUES[dialog];
  if (!d || !d.door) return;
  if (d.door === 'nomad') {
    // big pack of furs behind his shoulders
    px.fillStyle = '#5e4a36'; px.fillRect(275, 93, 9, 12);
    px.fillStyle = '#7a6248'; px.fillRect(276, 94, 7, 3);
    drawMap(STAND, 270, 97, NOMAD_COLORS);
    drawMap(LEGS[0], 270, 108, NOMAD_COLORS);
  } else {
    drawMap(KID, 271, 102, KID_COLORS);
  }
}

function drawRug() {
  if (!S.built.rug) return;
  const rows = [[136, 184], [132, 188], [130, 190], [130, 190], [132, 188], [136, 184]];
  rows.forEach(([a, b], i) => { px.fillStyle = i % 2 ? '#6a4a36' : '#73513b'; px.fillRect(a, 148 + i * 2, b - a, 2); });
  px.fillStyle = '#8a6248'; px.fillRect(140, 152, 40, 1); px.fillRect(140, 155, 40, 1);
  px.fillStyle = '#4a3224';
  for (let x = 137; x < 184; x += 3) { px.fillRect(x, 160, 1, 1); px.fillRect(x + 1, 147, 1, 1); }
}

function drawCart() {
  if (!S.built.cart) return;
  px.fillStyle = '#a07a4e'; px.fillRect(265, 144, 4, 3); px.fillRect(271, 144, 4, 3); px.fillRect(277, 145, 4, 2);
  px.fillStyle = '#4a301c'; px.fillRect(262, 147, 30, 10);
  px.fillStyle = '#5a3a22'; px.fillRect(262, 147, 30, 2);
  px.fillStyle = '#3a2414';
  for (let x = 268; x < 292; x += 6) px.fillRect(x, 149, 1, 8);
  px.fillRect(292, 150, 10, 1);
  px.fillStyle = '#2a1a10'; px.fillRect(268, 155, 8, 8); px.fillRect(267, 156, 10, 6);
  px.fillStyle = '#4a3020'; px.fillRect(270, 157, 4, 4);
  px.fillStyle = '#2a1a10'; px.fillRect(271, 158, 2, 2);
}

function drawBoards() {
  if (!S.built.boards) return;
  [[37, 5], [48, 6], [59, 5]].forEach(([y, h]) => {
    px.fillStyle = '#4a3220'; px.fillRect(41, y, 40, h);
    px.fillStyle = '#5a3e28'; px.fillRect(41, y, 40, 1);
    px.fillStyle = '#8a8a8a'; px.fillRect(43, y + 2, 1, 1); px.fillRect(78, y + 2, 1, 1);
  });
}

function drawLantern() {
  if (!S.built.lantern) return;
  const { x, y } = LANTERN;
  px.fillStyle = '#2a2420';
  px.fillRect(x, y - 12, 1, 6);
  px.fillRect(x - 2, y - 6, 5, 1); px.fillRect(x - 3, y - 5, 7, 1);
  px.fillStyle = '#ffcf6a'; px.fillRect(x - 2, y - 4, 5, 6);
  px.fillStyle = '#fff3b0'; px.fillRect(x - 1, y - 2, 3, 3);
  px.fillStyle = '#2a2420';
  px.fillRect(x - 3, y - 4, 1, 6); px.fillRect(x + 3, y - 4, 1, 6); px.fillRect(x - 3, y + 2, 7, 1);
}

function drawWindowSnow() {
  px.fillStyle = C.snow;
  for (const f of snow) px.fillRect(Math.round(f.x), Math.round(f.y), 1, 1);
  // mullions over the snow
  px.fillStyle = C.frame; px.fillRect(60, 35, 2, 32); px.fillRect(45, 50, 32, 2);
}

function drawPixels() {
  px.drawImage(bg, 0, 0);
  drawWindowSnow();
  drawBoards();
  drawDoor();
  drawVisitor();
  drawLantern();
  drawRug();
  drawCart();
  drawWoodPile();
  drawPitLogs();
  drawCoals();
  drawStranger();
  drawFire();
}

function targetRadius() {
  if (!S.lit) return 5;
  if (S.fire === 0) return 6 + 10 * Math.max(0, 1 - S.deadFor / 40);
  return LIGHT_R[S.fire];
}

function drawLight() {
  const s = light.width / W;
  const t = S.time + performance.now() / 1000;
  const flick = S.fire > 0
    ? (Math.sin(t * 11) * 0.5 + Math.sin(t * 6.7 + 1) * 0.6 + Math.sin(t * 23) * 0.25) * (1 + S.fire * 0.7)
    : Math.sin(t * 3) * 0.6;
  const r = Math.max(2, dispR + flick);

  lx.setTransform(1, 0, 0, 1, 0, 0);
  lx.globalCompositeOperation = 'source-over';
  lx.clearRect(0, 0, light.width, light.height);
  lx.fillStyle = 'rgba(4, 2, 2, 0.965)';
  lx.fillRect(0, 0, light.width, light.height);

  // cut the pool of light out of the darkness
  lx.save();
  lx.translate(FIRE.x * s, LIGHT_Y * s);
  lx.scale(1, ELLIPSE);
  lx.globalCompositeOperation = 'destination-out';
  let g = lx.createRadialGradient(0, 0, 0, 0, 0, r * s);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.92)');
  g.addColorStop(0.8, 'rgba(0,0,0,0.45)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  lx.fillStyle = g;
  lx.fillRect(-r * s, -r * s, r * s * 2, r * s * 2);

  // warm wash on top
  if (S.fire > 0 || S.lit) {
    lx.globalCompositeOperation = 'lighter';
    const k = S.fire > 0 ? 0.08 + S.fire * 0.04 : 0.06;
    g = lx.createRadialGradient(0, 0, 0, 0, 0, r * s * 0.9);
    g.addColorStop(0, `rgba(255, 150, 60, ${k})`);
    g.addColorStop(0.5, `rgba(220, 90, 30, ${k * 0.5})`);
    g.addColorStop(1, 'rgba(200, 60, 20, 0)');
    lx.fillStyle = g;
    lx.fillRect(-r * s, -r * s, r * s * 2, r * s * 2);
  }
  lx.restore();

  // the lantern's own small pool of light
  if (S.built.lantern) {
    const lr = (34 + Math.sin(t * 5) * 0.6) * s;
    lx.save();
    lx.translate(LANTERN.x * s, LANTERN.y * s);
    lx.scale(1, ELLIPSE);
    lx.globalCompositeOperation = 'destination-out';
    g = lx.createRadialGradient(0, 0, 0, 0, 0, lr);
    g.addColorStop(0, 'rgba(0,0,0,0.95)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.7)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    lx.fillStyle = g;
    lx.fillRect(-lr, -lr, lr * 2, lr * 2);
    lx.globalCompositeOperation = 'lighter';
    g = lx.createRadialGradient(0, 0, 0, 0, 0, lr * 0.8);
    g.addColorStop(0, 'rgba(255, 190, 90, 0.12)');
    g.addColorStop(1, 'rgba(255, 150, 60, 0)');
    lx.fillStyle = g;
    lx.fillRect(-lr, -lr, lr * 2, lr * 2);
    lx.restore();
  }

  // cold moonlight spilling in through an open door
  if (door > 0.05) {
    lx.save();
    lx.globalCompositeOperation = 'destination-out';
    const dg = lx.createRadialGradient(274 * s, 96 * s, 0, 274 * s, 96 * s, 46 * s);
    dg.addColorStop(0, `rgba(0,0,0,${0.75 * door})`);
    dg.addColorStop(1, 'rgba(0,0,0,0)');
    lx.fillStyle = dg;
    lx.fillRect(228 * s, 40 * s, 92 * s, 100 * s);
    lx.globalCompositeOperation = 'lighter';
    const bl = lx.createRadialGradient(274 * s, 96 * s, 0, 274 * s, 96 * s, 40 * s);
    bl.addColorStop(0, `rgba(90, 120, 180, ${0.12 * door})`);
    bl.addColorStop(1, 'rgba(0,0,0,0)');
    lx.fillStyle = bl;
    lx.fillRect(228 * s, 40 * s, 92 * s, 100 * s);
    lx.restore();
  }

  // the eyes sit on top of the darkness
  lx.globalCompositeOperation = 'source-over';
  for (const e of eyes) {
    const a = clamp(e.alpha, 0, 1);
    if (a <= 0.01) continue;
    const lid = e.blinkT >= 0 ? Math.min(1, Math.abs(e.blinkT - 0.11) / 0.11) : 1;
    const ex = e.x * s, ey = e.y * s;
    const glow = lx.createRadialGradient(ex, ey, 0, ex, ey, 7 * s);
    glow.addColorStop(0, e.red ? `rgba(255, 60, 40, ${0.12 * a})` : `rgba(255, 220, 150, ${0.09 * a})`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    lx.fillStyle = glow;
    lx.fillRect(ex - 7 * s, ey - 7 * s, 14 * s, 14 * s);
    if (lid < 0.15) continue;
    lx.fillStyle = e.red ? `rgba(255, 74, 58, ${a})` : `rgba(255, 238, 180, ${a})`;
    const h = Math.max(1, Math.round(s * 1.2 * lid));
    lx.fillRect(Math.round(ex - 3.5 * s), Math.round(ey - h / 2), Math.round(2 * s), h);
    lx.fillRect(Math.round(ex + 1.5 * s), Math.round(ey - h / 2), Math.round(2 * s), h);
  }

  // the face in the window
  if (windowFace > 0) {
    const a = clamp(Math.min(windowFace / 0.35, (1.8 - windowFace) / 0.06), 0, 1);
    const cols = { p: `rgba(207,200,187,${a})`, d: `rgba(143,136,124,${a})`, k: `rgba(5,3,3,${a})` };
    for (let r = 0; r < FACE.length; r++) {
      for (let c = 0; c < FACE[r].length; c++) {
        const k = FACE[r][c];
        if (k === '.') continue;
        lx.fillStyle = cols[k];
        lx.fillRect(Math.round((45 + c * 2) * s), Math.round((35 + r * 2) * s), Math.ceil(2 * s), Math.ceil(2 * s));
      }
    }
    lx.fillStyle = `rgba(36,24,16,${a * 0.75})`;
    lx.fillRect(60 * s, 35 * s, 2 * s, 32 * s);
    lx.fillRect(45 * s, 50 * s, 32 * s, 2 * s);
  }
}

const FACE = [
  '....dppppppd....',
  '..dppppppppppd..',
  '.dppppppppppppd.',
  '.ppkkkppppkkkpp.',
  '.pkkkkppppkkkkp.',
  '.pkkkkppppkkkkp.',
  '.ppkkkppppkkkpp.',
  '.pppppppppppppp.',
  '.ppppppkkpppppp.',
  '.dppppppppppppd.',
  '..pkkkkkkkkkkp..',
  '..pkpkpkpkpkpp..',
  '..dpkkkkkkkkpd..',
  '...dppppppppd...',
  '....dppppppd....',
  '.....dddddd.....',
];

/* -------------------------------------------------------------- portrait */

const PORTRAIT = [
  '....hhhhhhh.....',
  '...hHHhhhhhh....',
  '..hHhhhhhhhhh...',
  '..hhhffffffhhh..',
  '.hhhffffffffhh..',
  '.hhffffffffffhh.',
  '.hhffeffffeffhh.',
  '.hhffffffffffhh.',
  '.hhfffffffffhhh.',
  '.hhhffffffffhhh.',
  '..hhhffffffhhh..',
  '..hhhhhhhhhhhh..',
  '.cchhhhhhhhhhcc.',
  'ccccccCcccccccc.',
  'cccccccCcccccccc',
  'cccccccccccccccc',
];

const PORTRAITS = {
  stranger: { map: PORTRAIT, colors: SPR_COLORS },
  nomad: {
    map: [
      '....hhhhhhh.....',
      '...hHHhhhhhh....',
      '..hHhhhhhhhhh...',
      '..hhffffffffhh..',
      '.hhffffffffffh..',
      '.hhfeeffffeefh..',
      '.hhffffffffffh..',
      '.hhffffnnffffh..',
      '.hhbbffffffbbh.p',
      '.hhbbbbbbbbbbhpp',
      '..hbbbbmmbbbhppp',
      '..hhbbbbbbbbhppp',
      '.cchhbbbbbbhcppp',
      'cccccccccccccppp',
      'ccccccCccccccppp',
      'cccccccccccccppp',
    ],
    colors: { h: '#5a4030', H: '#6e5038', f: '#7a5a44', e: '#1a1210', n: '#5e4434', b: '#3a2a20', m: '#241812', c: '#4a3a2a', C: '#3a2a1e', p: '#7a6248' },
  },
  kid: {
    map: [
      '................',
      '.....rrrrrr.....',
      '....rrrrrrrr....',
      '...rrrrrrrrrr...',
      '...rrffffffrr...',
      '..rrffffffffrr..',
      '..rrfeffffefrr..',
      '..rrffffffffrr..',
      '...rffffffffr...',
      '...rfffmmfffr...',
      '....ffffffff....',
      '.....ffffff.....',
      '...ssssssssss...',
      '..ssssssssssss..',
      '.cccsssssssccc..',
      'cccccccccccccccc',
    ],
    colors: { r: '#3a2a1e', f: '#8a6a54', e: '#1a1210', m: '#5a3a2e', s: '#7a2a22', c: '#4a4a3a' },
  },
  dark: {
    map: ['', '', '', '', '', '', '', '', '....yy....yy....'],
    colors: { y: '#ffeeb4' },
    bg: '#050303',
  },
};

function drawPortrait(key = 'stranger') {
  const P = PORTRAITS[key] || PORTRAITS.stranger;
  const g = ui.portrait.getContext('2d');
  g.fillStyle = P.bg || '#0b0807'; g.fillRect(0, 0, 16, 16);
  for (let r = 0; r < P.map.length; r++) {
    for (let c = 0; c < P.map[r].length; c++) {
      const k = P.map[r][c];
      if (k === '.') continue;
      g.fillStyle = P.colors[k];
      g.fillRect(c, r, 1, 1);
    }
  }
}

/* --------------------------------------------------------------------- UI */

function syncUI() {
  const res = ['wood', 'fur', 'meat', 'teeth'].filter((k) => k === 'wood' || S[k] > 0 || S.built.trap > 0);
  ui.wood.textContent = res.map((k) => `${k} ${S[k]}`).join('   ');

  const label = S.fire === 0 ? (S.lit ? 'relight fire' : 'light fire') : 'stoke fire';
  ui.stoke.querySelector('.label').textContent = label;
  ui.stoke.disabled = S.cd.stoke > 0 || S.wood < 1 || !!dialog;
  ui.stoke.style.setProperty('--cd', `${(S.cd.stoke / STOKE_CD) * 100}%`);

  ui.gather.classList.toggle('hidden', !S.lit);
  ui.gather.disabled = S.cd.gather > 0 || !!dialog;
  ui.gather.style.setProperty('--cd', `${(S.cd.gather / GATHER_CD) * 100}%`);

  ui.traps.classList.toggle('hidden', !S.built.trap);
  ui.traps.disabled = S.cd.traps > 0 || !!dialog;
  ui.traps.style.setProperty('--cd', `${(S.cd.traps / TRAPS_CD) * 100}%`);

  ui.build.classList.toggle('hidden', !S.talked);
  ui.build.disabled = !!dialog;

  ui.sound.textContent = S.sound ? 'sound on' : 'sound off';

  if (!ui.buildPanel.classList.contains('hidden')) {
    const sig = BUILDS.map((b) => `${canAfford(b.cost())}${S.built[b.id]}`).join() + !!dialog;
    if (sig !== buildRefresh) { buildRefresh = sig; renderBuild(); }
  }

  $('actions').classList.toggle('hidden', !!dialog);
}

function renderJournal() {
  ui.journalList.innerHTML = '';
  [...S.log].reverse().forEach((line) => {
    const li = document.createElement('li');
    li.textContent = line;
    ui.journalList.appendChild(li);
  });
  if (!S.log.length) ui.journalList.innerHTML = '<li>nothing yet.</li>';
}

function toggleJournal(force) {
  const open = force ?? ui.journal.classList.contains('hidden');
  ui.journal.classList.toggle('hidden', !open);
  if (open) { ui.buildPanel.classList.add('hidden'); renderJournal(); }
}

function restart() {
  if (!confirm('Start over? The fire and everything else will be lost.')) return;
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  S = freshState();
  particles = []; eyes = []; dialog = null; walker = null; msgQueue = [];
  door = doorTarget = 0; dispR = 0; introTimer = 0.8; huddleSaid = false;
  pendingVisit = null; doorCloseIn = -1; windowFace = 0; shake = 0;
  ui.dialogue.classList.add('hidden');
  toggleJournal(false);
  toggleBuild(false);
}

ui.stoke.addEventListener('click', stoke);
ui.gather.addEventListener('click', gather);
ui.traps.addEventListener('click', checkTraps);
ui.build.addEventListener('click', () => toggleBuild());
$('buildClose').addEventListener('click', () => toggleBuild(false));
ui.sound.addEventListener('click', () => { S.sound = !S.sound; sfx.setEnabled(S.sound); save(); });
window.addEventListener('pointerdown', () => sfx.initAudio());
$('journalBtn').addEventListener('click', () => toggleJournal());
$('journalClose').addEventListener('click', () => toggleJournal(false));
$('restartBtn').addEventListener('click', restart);
$('fullBtn').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.();
});

window.addEventListener('keydown', (e) => {
  sfx.initAudio();
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  const panelOpen = !ui.journal.classList.contains('hidden') || !ui.buildPanel.classList.contains('hidden');
  if (k === 'escape') { toggleJournal(false); toggleBuild(false); }
  else if (k === 'j') toggleJournal();
  else if (k === 'b') toggleBuild();
  else if (k === 'm') ui.sound.click();
  else if (panelOpen) return;
  else if (dialog && k >= '1' && k <= '4') choose(Number(k) - 1);
  else if (k === 's') stoke();
  else if (k === 'g') gather();
  else if (k === 't') checkTraps();
});

document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

function resize() {
  const s = Math.max(1, Math.floor(Math.min(innerWidth / W, innerHeight / H)));
  stage.style.setProperty('--s', s);
  const dpr = window.devicePixelRatio || 1;
  light.width = Math.round(W * s * dpr);
  light.height = Math.round(H * s * dpr);
}
window.addEventListener('resize', resize);

/* -------------------------------------------------------------------- run */

drawBackground();
drawPortrait();
sfx.setEnabled(S.sound);
resize();
if (S.stranger === 'knocking') knockTimer = 1.5;
if (S.lit && S.time > 0) say(S.fire === 0 ? 'the room is cold again.' : `the fire is ${FIRE_NAMES[S.fire]}.`);

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  update(dt);
  drawPixels();
  drawLight();
  syncUI();
  sfx.setLevels(S.fire, S.time, door);
  stage.style.transform = shake > 0 ? `translate(${rand(-3, 3).toFixed(1)}px, ${rand(-3, 3).toFixed(1)}px)` : '';
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// small hook for local testing in the browser console
window.__firelight = {
  get state() { return S; },
  get eyes() { return eyes.length; },
  get dialog() { return dialog; },
  visit(id) { queueVisit(id); },
  choose,
  // advance the game by `sec` seconds without waiting for animation frames
  step(sec) {
    for (let t = 0; t < sec; t += 0.05) update(0.05);
    drawPixels(); drawLight(); syncUI();
  },
};
