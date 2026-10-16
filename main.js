// Firelight: survive one night in a dark room. Keep the fire alive, eat, and be careful what you let in.
// The pixel layer is drawn at 320x180 and scaled up with crisp pixels.
// The light layer runs at full screen resolution so the glow stays smooth.

import * as sfx from './sound.js';
import { computeScore, qualifies, insertScore, cleanInitials, sanitizeBoard } from './score.js';

const W = 320, H = 180;
const FIRE = { x: 160, y: 136 };          // base of the flames
const LIGHT_Y = 130;                       // centre of the light pool
const ELLIPSE = 0.8;                       // light pool is a little squashed
const LANTERN = { x: 240, y: 70 };

const FIRE_NAMES = ['dead', 'smoldering', 'flickering', 'burning', 'roaring'];
const LIGHT_R = [14, 42, 70, 102, 142];

const NIGHT_HOURS = 8;                     // 10 pm to 6 am
const HOUR = 52.5;                         // seconds per hour: the whole night is 7 minutes
const START_HOUR = 22;
const STOKE_CD = 2.5;
const TRIPS = {
  wood: { time: 6, label: 'gathering wood in the dark' },
  hunt: { time: 11, label: 'hunting in the trees' },
};

const SAVE_KEY = 'firelight-save-v3';
const BOARD_KEY = 'firelight-scores-v2';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const pix = $('pix'), px = pix.getContext('2d');
const light = $('light'), lx = light.getContext('2d');
pix.width = W; pix.height = H;

const ui = {
  res: $('res'), clock: $('clock'), hunger: $('hunger'), message: $('message'),
  stoke: $('stoke'), eat: $('eat'), wood: $('woodTrip'), hunt: $('huntTrip'), build: $('buildBtn'), strike: $('strike'),
  away: $('away'), awayText: $('awayText'), awayBar: $('awayBar'),
  dialogue: $('dialogue'), dlgText: $('dlgText'), dlgChoices: $('dlgChoices'), portrait: $('portrait'),
  journal: $('journal'), journalList: $('journalList'),
  buildPanel: $('build'), buildList: $('buildList'),
  sound: $('soundBtn'),
  title: $('title'), titleMenu: $('titleMenu'), howPanel: $('howPanel'), boardPanel: $('boardPanel'),
  boardList: $('boardList'), cont: $('contBtn'),
  ending: $('ending'), endTitle: $('endTitle'), endText: $('endText'), endHint: $('endHint'), endScore: $('endScore'),
  initials: $('initials'), initialsInput: $('initialsInput'), endBoard: $('endBoard'), retry: $('retryBtn'),
};

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ------------------------------------------------------------------ state */

function freshState() {
  return {
    v: 3,
    time: 0,
    night: 0,
    hourSaid: 0,
    lit: false,
    fire: 0,
    decay: 13,
    deadFor: 0,
    wood: 6,
    meat: 1,
    blood: 0,
    hunger: 25,
    hungerSaid: 0,
    dread: 0,
    darkTime: 0,
    boards: 0,
    boardsBuilt: false,
    traps: 0,
    lantern: false,
    cd: { stoke: 0 },
    away: null,                                  // { kind, t, total }
    hunter: { near: false, t: 45, since: 0 },    // the thing in the trees
    hand: { phase: 'idle', t: 30, total: 1, p: 0 },
    doorT: 62,                                   // seconds until the next knock
    firstVisit: true,
    stranger: 'none',                            // none | inside | refused
    hint: 0,
    hintT: 12,
    kidVisits: 0,
    kidGiftT: -1,
    cutterVisits: 0,
    ended: false,
    won: false,
    scored: false,
    cause: '',
    final: 0,
    sound: true,
    log: [],
  };
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s && s.v === 3) {
      const f = freshState();
      return Object.assign(f, s, {
        cd: Object.assign(f.cd, s.cd),
        hunter: Object.assign(f.hunter, s.hunter),
        hand: Object.assign(f.hand, s.hand),
      });
    }
  } catch (e) { /* storage unavailable or corrupt: start fresh */ }
  return null;
}

function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
}

function loadBoard() {
  try { return sanitizeBoard(JSON.parse(localStorage.getItem(BOARD_KEY) || '[]')); } catch (e) { return []; }
}

function saveBoard(list) {
  try { localStorage.setItem(BOARD_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
}

let S = load() || freshState();
if (S.ended) S = Object.assign(freshState(), { sound: S.sound });

// mode: title | playing | dawn | lost | ended
let mode = 'title';

// Transient, not saved
let particles = [];
let eyes = [];
let dialog = null;         // the open dialogue definition
let pendingVisit = null;   // { who, as, t }
let msgQueue = [];
let msgTimer = 0;
let dispR = 0;
let door = 0;              // 0 closed .. 1 open
let doorTarget = 0;
let doorCloseIn = -1;
let walker = null;         // the stranger walking in: { x, y, step }
let visitorAtDoor = null;  // who is standing in the open doorway
let figure = 0;            // the tall thing in the doorway
let introTimer = -1;
let saveTimer = 3;
let shake = 0;
let heartTimer = 0;
let hunterEyes = 0;        // 0..1 fade of the eyes in the treeline
let dawnT = 0;
let lossT = 0;
let eyeSpawn = 0.5;
let buildRefresh = '';
const snow = Array.from({ length: 10 }, () => ({ x: rand(45, 76), y: rand(35, 66), v: rand(3, 7) }));

function resetTransients() {
  particles = []; eyes = []; dialog = null; pendingVisit = null; msgQueue = []; msgTimer = 0;
  door = doorTarget = 0; doorCloseIn = -1; walker = null; visitorAtDoor = null; figure = 0;
  dispR = 0; shake = 0; hunterEyes = 0; dawnT = 0; lossT = 0;
  ui.dialogue.classList.add('hidden');
  ui.message.classList.remove('show');
  toggleJournal(false);
  toggleBuild(false);
}

/* ------------------------------------------------------------- the night */

const hour = () => Math.min(NIGHT_HOURS - 1, Math.floor(S.night / HOUR));

function clockText(night) {
  const total = START_HOUR * 60 + Math.floor((night / HOUR) * 60);
  const hr = Math.floor(total / 60) % 24;
  const min = Math.floor((total % 60) / 10) * 10;
  const twelve = hr % 12 === 0 ? 12 : hr % 12;
  return `${twelve}:${String(min).padStart(2, '0')} ${hr < 12 ? 'am' : 'pm'}`;
}

const HOUR_LINES = {
  1: "eleven o'clock. something howls, far off in the trees.",
  2: 'midnight. the snow is falling harder.',
  3: 'one in the morning. you hear something brush against the outside wall.',
  4: 'two in the morning. the forest near the house is picked clean.',
  5: 'three in the morning. the coldest hour.',
  6: 'four in the morning. they are hungry now.',
  7: 'the last hour. hold on.',
};

const decayTime = () => Math.max(7, 13 - hour() * 0.8);

function updateNight(dt) {
  S.night += dt;
  const h = hour();
  if (h > S.hourSaid) { S.hourSaid = h; say(HOUR_LINES[h]); }
  if (S.night >= NIGHT_HOURS * HOUR) { startDawn(); return; }

  // the fire burns down, faster every hour
  if (S.fire > 0) {
    S.decay -= dt;
    if (S.decay <= 0) {
      S.fire -= 1;
      S.decay = decayTime();
      say(S.fire === 0 ? 'the fire is dead.' : `the fire is ${FIRE_NAMES[S.fire]}.`);
    }
  } else {
    S.deadFor += dt;
  }
  if (S.fire <= 1) S.darkTime += dt;
  else S.darkTime = Math.max(0, S.darkTime - dt * 3);

  // hunger: you have to eat during the night
  S.hunger += dt * (0.55 + h * 0.03);
  if (S.hunger >= 70 && S.hungerSaid < 1) { S.hungerSaid = 1; say('your stomach aches. you need to eat.'); }
  if (S.hunger >= 90 && S.hungerSaid < 2) { S.hungerSaid = 2; say("you're weak with hunger. your hands shake."); }
  if (S.hunger >= 100) { die('starve'); return; }

  // dread: the dark gets closer when the fire is low
  const before = S.dread;
  if (S.fire === 0) S.dread += dt * (2.4 + h * 0.25);
  else if (S.fire === 1) S.dread += dt * (0.7 + h * 0.12);
  else S.dread = Math.max(0, S.dread - dt * 2.5);
  if (before < 50 && S.dread >= 50) say("they're getting bolder.");
  if (before < 80 && S.dread >= 80) say('something is right at the edge of the light.');
  if (S.dread > 60) {
    heartTimer -= dt;
    if (heartTimer <= 0) { sfx.heartbeat(S.dread / 100); heartTimer = 1.3 - (S.dread - 60) / 80; }
  }
  if (S.dread >= 100) { die('dark'); return; }

  updateHunter(dt);
  if (mode !== 'playing') return;
  updateTrip(dt);
  if (mode !== 'playing') return;
  updateHand(dt);
  if (mode !== 'playing') return;
  updateDoor(dt);
  updateStranger(dt);
}

/* --------------------------------------------------------- the hunter */

function updateHunter(dt) {
  const hn = S.hunter;
  if (hour() < 1) return;
  hn.since += dt;
  hn.t -= dt;
  if (hn.t > 0) return;
  hn.near = !hn.near;
  hn.since = 0;
  if (hn.near) {
    hn.t = rand(12, 20) * (1 + 0.25 * S.traps);
    sfx.howl();
    say(S.away ? 'a howl, very close. too close.' : 'a long, low howl from the trees. close.');
    if (S.stranger === 'inside' && !S.away) setTimeout(() => { if (S.hunter.near && mode === 'playing') say('the stranger, quietly: "not now. it\'s out there."'); }, 1800);
  } else {
    hn.t = rand(26, 48) * (1 - hour() * 0.05);
    say('the howling moves off, deeper into the woods.');
  }
}

/* ------------------------------------------------------------- trips */

function startTrip(kind) {
  if (!canAct() || S.away || !S.lit) return;
  const slow = S.hunger >= 90 ? 1.3 : 1;
  const total = TRIPS[kind].time * slow;
  S.away = { kind, t: total, total };
  toggleBuild(false);
  say(kind === 'wood' ? 'you slip out into the trees for wood.' : 'you go out to hunt.');
  save();
}

function runBack() {
  if (!S.away || mode !== 'playing') return;
  S.away = null;
  say('you run back inside empty-handed and bar the door.');
}

function updateTrip(dt) {
  const a = S.away;
  if (!a) return;
  a.t -= dt;
  // the thing in the trees can find you while you're out; a howl gives you a moment to run
  const hf = 1 + hour() * 0.12;
  const loud = a.kind === 'hunt' ? 1.3 : 1;
  const close = S.hunter.near && S.hunter.since > 2.5;
  const hazard = (close ? 0.035 : 0.00008) * hf * loud;
  if (hour() >= 1 && Math.random() < hazard * dt) { die('hunter'); return; }
  if (a.t <= 0) finishTrip(a.kind);
}

function finishTrip(kind) {
  S.away = null;
  const h = hour();
  const parts = [];
  if (kind === 'wood') {
    const n = Math.max(1, Math.round((6 - h * 0.55) * rand(0.7, 1.2)));
    S.wood += n;
    parts.push(`+${n} wood`);
  } else {
    const r = Math.random();
    if (r < 0.7) {
      const n = Math.random() < 0.35 ? 2 : 1;
      S.meat += n;
      parts.push(`+${n} meat`);
    }
    if (Math.random() < 0.25) { S.blood += 1; parts.push('+1 blood'); }
    if (Math.random() < 0.5) { S.wood += 1; parts.push('+1 wood'); }
  }
  // traps are checked on the way back
  let tm = 0, tb = 0;
  for (let i = 0; i < S.traps; i++) {
    if (Math.random() < 0.45) tm += 1;
    if (Math.random() < 0.12) tb += 1;
  }
  S.meat += tm; S.blood += tb;
  if (tm) parts.push(`+${tm} meat from the traps`);
  if (tb) parts.push(`+${tb} blood from the traps`);
  const lead = kind === 'wood'
    ? pick(['you come back with an armful of branches.', 'snapped limbs, half buried in snow.', 'you drag a fallen branch back inside.'])
    : (parts.some((p) => p.includes('meat')) ? 'the hunt goes well enough.' : 'nothing moved out there. nothing you could catch.');
  say(`${lead} ${parts.join(', ')}`.trim());
  save();
}

/* --------------------------------------------------------- the hand */

const nextHand = () => rand(28, 45) * (1 - (hour() - 3) * 0.08);

function updateHand(dt) {
  const hd = S.hand;
  if (hour() < 3 && hd.phase === 'idle') return;
  hd.t -= dt;
  if (hd.phase === 'idle') {
    if (hd.t <= 0) {
      hd.phase = 'warn';
      hd.t = 3.5;
      sfx.scratch();
      say(S.boards ? 'something scrapes at the boards over the window.' : 'something scrapes against the window glass.');
    }
  } else if (hd.phase === 'warn') {
    if (hd.t <= 0) {
      hd.phase = 'reach';
      hd.total = hd.t = Math.max(3.2, 5.5 - (hour() - 3) * 0.45);
      say(S.boards ? 'long gray fingers curl through the gap in the boards.' : 'a long gray hand pushes through the window.');
    }
  } else if (hd.phase === 'reach') {
    hd.p = 1 - hd.t / hd.total;
    if (hd.t <= 0) handTimeout();
  } else if (hd.t <= 0) {
    hd.phase = 'idle';
    hd.t = nextHand();
  }
}

function strikeHand() {
  const hd = S.hand;
  if (hd.phase !== 'reach' || S.away || dialog || mode !== 'playing') return;
  if (S.wood < 1 || S.fire < 1) { say('you need a burning branch. there is no fire to take one from.'); return; }
  S.wood -= 1;
  hd.phase = 'retreat';
  hd.t = 0.9;
  sfx.hiss();
  say('you jam a burning branch into it. it jerks back, smoking.');
}

function handTimeout() {
  const hd = S.hand;
  if (S.boards > 0) {
    S.boards -= 1;
    const n = Math.min(S.wood, 3 + Math.floor(hour() / 2));
    S.wood -= n;
    hd.phase = 'steal';
    hd.t = 1.4;
    sfx.crack();
    shake = 0.3;
    say(`it rips a board loose and drags ${n} logs out through the gap.${S.boards ? '' : ' the window is bare now.'}`);
  } else {
    hd.phase = 'grab';
    die(S.away ? 'handAway' : 'hand');
  }
}

/* --------------------------------------------------------- the door */

function realPool() {
  const h = hour();
  const pool = [];
  if (S.kidVisits === 0) pool.push('kid');
  if (h >= 2 && S.cutterVisits < 2) pool.push('woodcutter');
  pool.push('traveler');
  return pool;
}

const MIMIC_CHANCE = [0, 0, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55];

function updateDoor(dt) {
  if (S.away || pendingVisit || dialog || !S.lit) return;
  if (S.kidGiftT > 0) {
    S.kidGiftT -= dt;
    if (S.kidGiftT <= 0) { S.kidGiftT = -1; queueVisit('kidGift'); return; }
  }
  S.doorT -= dt;
  if (S.doorT > 0) return;
  const h = hour();
  S.doorT = rand(38, 58) * (1 - h * 0.04);
  if (S.firstVisit) { S.firstVisit = false; queueVisit('stranger'); return; }
  if (Math.random() < MIMIC_CHANCE[h]) {
    const looks = ['traveler', 'woodcutter'];
    if (S.kidVisits > 0) looks.push('kidGift', 'kidGift');
    else looks.push('kid');
    if (S.stranger !== 'none') looks.push('stranger', 'stranger');
    queueVisit('mimic', pick(looks));
  } else {
    queueVisit(pick(realPool()));
  }
}

function queueVisit(who, as = who) {
  const real = who !== 'mimic';
  pendingVisit = { who, as, t: real ? 3.2 : 0.9 };
  if (real) {
    sfx.footsteps();
    say('footsteps crunch through the snow, up to the door.');
  }
}

function updatePending(dt) {
  if (!pendingVisit || dialog || S.away) return;
  pendingVisit.t -= dt;
  if (pendingVisit.t > 0) return;
  const v = pendingVisit;
  pendingVisit = null;
  sfx.knock(v.as === 'woodcutter' ? 3 : v.as === 'kid' || v.as === 'kidGift' ? 2 : 3, v.who === 'mimic');
  openDialogue(knockDialogue(v));
}

function knockText(v) {
  switch (v.as) {
    case 'stranger':
      if (v.who === 'mimic' && S.stranger === 'inside') return 'A knock. Through the door, the stranger\'s voice: "Please. Let me in. It\'s so cold out here." The stranger is sitting right beside you. She doesn\'t look up.';
      if (v.who === 'mimic') return 'A knock. "Please. Let me in this time." It\'s the voice of the woman you turned away.';
      return 'A knock. A woman\'s voice through the door, cracked with cold: "Please. I just need the fire. I won\'t be any trouble."';
    case 'kid': return 'A small knock. A thin voice: "Do you have anything to eat? Anything at all?"';
    case 'kidGift': return 'A small knock. "It\'s me again," says the kid. "I brought you something."';
    case 'woodcutter': return 'Three heavy thumps. A gruff voice: "Woodcutter. Cut more than I can haul tonight. Want to trade?"';
    default: return 'A knock. A voice you don\'t know: "Hello? Is someone in there? I saw the light."';
  }
}

function lanternText(v) {
  if (!S.lantern) return '';
  return v.who === 'mimic'
    ? ' In the blood lantern\'s red light, there is no shadow under the door. Nothing is standing there.'
    : ' In the blood lantern\'s red light, you can see the shadow of two feet shifting under the door.';
}

function knockDialogue(v) {
  return {
    id: 'knock',
    visit: v,
    portrait: S.lantern ? (v.who === 'mimic' ? 'doorEmpty' : 'doorFeet') : 'door',
    text: knockText(v) + lanternText(v),
    choices: [
      { label: 'open the door', act: () => openDoorFor(v) },
      { label: 'keep it shut', act: () => keepShut(v) },
    ],
  };
}

function openDoorFor(v) {
  doorTarget = 1;
  if (v.who === 'mimic') { die('mimic'); return; }
  switch (v.who) {
    case 'stranger':
      S.stranger = 'inside';
      S.hintT = 10;
      walker = { x: 274, y: 113, step: 0 };
      say('the stranger shuffles to the fire and sits down.');
      break;
    case 'kid':
      S.kidVisits += 1;
      visitorAtDoor = 'kid';
      openDialogue({
        id: 'kidAsk', portrait: 'kid', door: true,
        text: 'A thin kid stands in the snow, hugging their elbows. They look at your meat, then at you.',
        choices: [
          { label: 'give 1 meat', can: () => S.meat >= 1, act: () => { S.meat -= 1; S.kidGiftT = 45; say('the kid eats it in about four seconds, then runs off.'); } },
          { label: 'nothing to spare', act: () => say('the kid nods, like they expected that, and walks away.') },
        ],
      });
      break;
    case 'kidGift':
      visitorAtDoor = 'kid';
      S.blood += 2; S.meat += 1;
      doorCloseIn = 2;
      say('the kid presses a bundle into your hands: a strip of meat and a jar of something dark. +1 meat, +2 blood');
      break;
    case 'woodcutter':
      S.cutterVisits += 1;
      visitorAtDoor = 'woodcutter';
      openDialogue({
        id: 'cutter', portrait: 'woodcutter', door: true,
        text: 'A broad woodcutter leans in the doorway, a sled of split logs behind him. "Meat for wood," he says. "Or wood for meat. Your pick."',
        choices: [
          { label: 'give 1 meat for 7 wood', can: () => S.meat >= 1, act: () => { S.meat -= 1; S.wood += 7; say('he stacks seven logs by the door. +7 wood'); } },
          { label: 'give 6 wood for 1 meat', can: () => S.wood >= 6, act: () => { S.wood -= 6; S.meat += 1; say('he hands over a strip of dried meat. +1 meat'); } },
          { label: 'no trade', act: () => say('the woodcutter drags his sled back into the dark.') },
        ],
      });
      break;
    default:
      visitorAtDoor = 'traveler';
      S.wood += 3;
      doorCloseIn = 2.2;
      say('a lost traveler warms their hands for a minute, leaves you three logs, and moves on. +3 wood');
  }
}

function keepShut(v) {
  if (v.who === 'mimic') {
    say('the knocking stops. no footsteps leave.');
    return;
  }
  if (v.who === 'stranger') S.stranger = 'refused';
  say('the footsteps crunch away into the snow.');
}

/* --------------------------------------------------------- the stranger */

const HINTS = [
  { at: 0, text: 'The stranger speaks without looking up. "Listen before you open that door. The people out there walk up through the snow." She pokes the fire. "The other things don\'t walk."' },
  { at: 1, text: 'The stranger: "Something hunts these woods. When it howls close, stay inside. Wait for it to move off."' },
  { at: 2, text: () => (S.boards
    ? 'The stranger watches the boarded window. "Keep a branch burning. It hates the fire."'
    : 'The stranger stares at the window. "Board that up. And keep a branch burning. It hates the fire."') },
];

function updateStranger(dt) {
  if (S.stranger !== 'inside' || walker || S.away || dialog || S.hint >= HINTS.length) return;
  const next = HINTS[S.hint];
  if (hour() < next.at) return;
  S.hintT -= dt;
  if (S.hintT > 0) return;
  S.hint += 1;
  S.hintT = 20;
  openDialogue({
    id: 'hint', portrait: 'stranger',
    text: typeof next.text === 'function' ? next.text() : next.text,
    choices: [{ label: 'nod', act: () => {} }],
  });
}

/* --------------------------------------------------------- endings */

const DEATHS = {
  dark: { text: 'The fire went out, and stayed out. The dark came in.', hint: 'keep the fire above smoldering. the dark gets hungrier every hour.' },
  starve: { text: 'You starved.', hint: 'hunting is dangerous, but so is an empty stomach. eat before you are starving.' },
  mimic: { text: 'You opened the door. It was not a person.', hint: 'real visitors walk up through the snow. listen for footsteps before the knock.' },
  hand: { text: 'Something climbed in through the window.', hint: 'board the window, and keep a burning branch ready for the hand.' },
  handAway: { text: 'You came back to an open window. Something was already inside.', hint: 'the hand comes later in the night. don\'t leave a bare window behind you.' },
  hunter: { text: 'Something found you in the trees.', hint: 'when it howls close and its eyes shine in the treeline, stay inside.' },
};

function die(cause) {
  if (mode !== 'playing') return;
  mode = 'lost';
  stage.dataset.mode = mode;
  lossT = 0;
  S.cause = cause;
  S.won = false;
  if (dialog) { dialog = null; ui.dialogue.classList.add('hidden'); }
  pendingVisit = null;
  toggleBuild(false);
  toggleJournal(false);
  if (cause === 'mimic') { doorTarget = 1; figure = 3; shake = 0.8; }
  if (cause === 'dark') { doorTarget = 1; shake = 0.8; S.fire = 0; particles = []; }
  if (cause === 'hand' || cause === 'handAway') shake = 0.6;
  sfx.death();
  save();
}

function startDawn() {
  mode = 'dawn';
  stage.dataset.mode = mode;
  dawnT = 0;
  S.won = true;
  S.away = null;
  if (dialog) { dialog = null; ui.dialogue.classList.add('hidden'); }
  pendingVisit = null;
  S.hand.phase = 'idle';
  S.hunter.near = false;
  for (const e of eyes) e.out = true;
  sfx.dawn();
  say('the sky outside is turning gray.');
  save();
}

/* --------------------------------------------------------------- messages */

function say(text) {
  S.log.push(text);
  if (S.log.length > 80) S.log.shift();
  msgQueue.push(text);
  if (msgQueue.length > 2) msgQueue.shift();
  if (!ui.journal.classList.contains('hidden')) renderJournal();
}

function updateMessages(dt) {
  msgTimer -= dt;
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

const canAct = () => mode === 'playing' && !dialog && !S.away;

function stoke() {
  if (!canAct() || S.cd.stoke > 0 || S.wood < 1) return;
  S.wood -= 1;
  const was = S.fire;
  S.fire = S.fire === 0 ? 2 : Math.min(4, S.fire + 1);
  S.decay = decayTime();
  S.cd.stoke = STOKE_CD * (S.hunger >= 90 ? 2 : 1);
  S.deadFor = 0;
  if (!S.lit) {
    S.lit = true;
    say('the fire catches. dawn is eight hours away.');
  } else if (was === 0) {
    say('the fire flickers back to life.');
  } else if (S.fire !== was) {
    say(`the fire is ${FIRE_NAMES[S.fire]}.`);
  }
  for (let i = 0; i < 18; i++) spawnEmber(true);
  sfx.crackle(4);
  save();
}

function eat() {
  if (!canAct() || S.meat < 1 || S.hunger < 5) return;
  S.meat -= 1;
  S.hunger = Math.max(0, S.hunger - 45);
  if (S.hunger < 70) S.hungerSaid = 0;
  say(pick(['you eat a strip of meat. it helps.', 'you chew the tough meat slowly. warmth spreads through you.']));
  save();
}

/* ------------------------------------------------------------------ build */

const BUILDS = [
  { id: 'boards', name: 'window boards', desc: 'three boards over the window. the hand has to tear through them first.',
    show: () => !S.boardsBuilt, cost: () => ({ wood: 8 }),
    done: () => { S.boardsBuilt = true; S.boards = 3; say('you nail three boards across the window.'); } },
  { id: 'repair', name: 'repair a board', desc: () => `the window has ${S.boards} of 3 boards left.`,
    show: () => S.boardsBuilt && S.boards < 3, cost: () => ({ wood: 3 }),
    done: () => { S.boards += 1; say('you nail a new board over the gap.'); } },
  { id: 'trap', name: 'trap', desc: () => `catches meat, sometimes blood, checked on every trip. the smell draws the thing in the trees. (${S.traps}/3)`,
    show: () => S.traps < 3, cost: () => ({ wood: 5 }),
    done: () => { S.traps += 1; say('you set a trap out in the snow.'); } },
  { id: 'lantern', name: 'blood lantern', desc: 'hangs by the door. its red light shows what is standing outside.',
    show: () => !S.lantern, cost: () => ({ wood: 4, blood: 2 }),
    done: () => { S.lantern = true; say('you fill the lantern with blood and light it. the door glows red.'); } },
];

const canAfford = (cost) => Object.entries(cost).every(([k, n]) => S[k] >= n);
const costText = (cost) => Object.entries(cost).map(([k, n]) => `${n} ${k}`).join(', ');

function build(id) {
  const b = BUILDS.find((x) => x.id === id);
  if (!b || !b.show() || !canAct()) return;
  const cost = b.cost();
  if (!canAfford(cost)) return;
  for (const k in cost) S[k] -= cost[k];
  b.done();
  sfx.chime();
  renderBuild();
  save();
}

function renderBuild() {
  ui.buildList.innerHTML = '';
  const shown = BUILDS.filter((b) => b.show());
  if (!shown.length) ui.buildList.innerHTML = '<li class="desc">nothing left to build.</li>';
  for (const b of shown) {
    const li = document.createElement('li');
    const cost = b.cost();
    const desc = typeof b.desc === 'function' ? b.desc() : b.desc;
    li.innerHTML = `<div class="row"><span class="name">${b.name}</span>
      <button ${!canAfford(cost) || !canAct() ? 'disabled' : ''}>build</button></div>
      <div class="desc">${desc}</div><div class="cost">${costText(cost)}</div>`;
    li.querySelector('button').addEventListener('click', () => build(b.id));
    ui.buildList.appendChild(li);
  }
}

function toggleBuild(force) {
  if (force !== false && (!S.lit || mode !== 'playing' || S.away)) return;
  const open = force ?? ui.buildPanel.classList.contains('hidden');
  ui.buildPanel.classList.toggle('hidden', !open);
  if (open) { ui.journal.classList.add('hidden'); renderBuild(); }
}

/* --------------------------------------------------------------- dialogue */

function openDialogue(def) {
  dialog = def;
  toggleBuild(false);
  toggleJournal(false);
  ui.dlgText.textContent = def.text;
  ui.dlgChoices.innerHTML = '';
  def.choices.forEach((c, i) => {
    const b = document.createElement('button');
    b.innerHTML = `<span class="key">${i + 1}.</span> `;
    b.appendChild(document.createTextNode(c.label));
    b.disabled = c.can ? !c.can() : false;
    b.addEventListener('click', () => choose(i));
    ui.dlgChoices.appendChild(b);
  });
  ui.dialogue.classList.remove('hidden');
  drawPortrait(def.portrait || 'stranger');
}

function choose(i) {
  if (!dialog) return;
  const d = dialog;
  const c = d.choices[i];
  if (!c || (c.can && !c.can())) return;
  dialog = null;
  ui.dialogue.classList.add('hidden');
  c.act();
  if (d.door && !dialog) { doorCloseIn = 0.6; }
  if (mode === 'playing') save();
}

/* ------------------------------------------------------------------ logic */

function update(dt) {
  if (mode === 'playing') updateGame(dt);
  updateAmbient(dt);
}

function updateGame(dt) {
  if (introTimer >= 0) {
    introTimer -= dt;
    if (introTimer < 0) say('the room is cold and dark. light the fire.');
  }
  S.cd.stoke = Math.max(0, S.cd.stoke - dt);
  updateMessages(dt);
  if (dialog) return;
  S.time += dt;
  if (S.lit) updateNight(dt);
  if (mode !== 'playing') return;
  updatePending(dt);
  if (S.fire > 0 && Math.random() < dt * S.fire * 2.5) sfx.crackle(S.fire);
  saveTimer -= dt;
  if (saveTimer <= 0) { save(); saveTimer = 3; }
}

// Things that keep moving on every screen: light, door, eyes, flames, snow and the endings.
function updateAmbient(dt) {
  if (mode !== 'playing') updateMessages(dt);
  if (doorCloseIn > 0) {
    doorCloseIn -= dt;
    if (doorCloseIn <= 0) { doorTarget = 0; visitorAtDoor = null; }
  }
  figure = Math.max(0, figure - dt * (mode === 'lost' ? 0.3 : 1));
  shake = Math.max(0, shake - dt);
  hunterEyes = clamp(hunterEyes + dt * (S.hunter.near && mode === 'playing' ? 0.8 : -0.8), 0, 1);

  dispR += (targetRadius() - dispR) * Math.min(1, dt * (mode === 'lost' ? 3 : 1.8));
  door += (doorTarget - door) * Math.min(1, dt * (mode === 'lost' ? 10 : 4));

  updateWalker(dt);
  updateEyes(dt);
  updateParticles(dt);
  for (const f of snow) {
    f.y += f.v * dt;
    f.x += Math.sin(S.time * 0.8 + f.v) * dt * 2;
    if (f.y > 66) { f.y = 35; f.x = rand(45, 76); }
  }
  if (mode !== 'playing') S.time += dt * 0.25;

  if (mode === 'dawn') {
    dawnT += dt;
    if (dawnT > 4.5 && !dialog) {
      openDialogue({
        id: 'dawn', portrait: S.stranger === 'inside' ? 'stranger' : 'dawn',
        text: S.stranger === 'inside'
          ? 'Gray light creeps across the floor. The eyes are gone. The stranger stands and stretches, and for the first time she smiles. "They never come in the light," she says.'
          : 'Gray light creeps across the floor. The eyes are gone. You made it through the night.',
        choices: [{ label: 'see the morning', act: () => showEnding(true) }],
      });
    }
  }
  if (mode === 'lost') {
    lossT += dt;
    if (lossT > (S.cause === 'starve' ? 3.2 : 3.6)) showEnding(false);
  }
}

function updateWalker(dt) {
  if (!walker) return;
  const tx = 194, ty = 136;
  const dx = tx - walker.x, dy = ty - walker.y;
  const d = Math.hypot(dx, dy);
  const sp = 24 * dt;
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

const EYE_SPOTS = [
  { x: 48, y: 42, w: 24, h: 18, weight: 3, window: true },
  { x: 8, y: 20, w: 28, h: 80, weight: 2 },
  { x: 294, y: 20, w: 20, h: 80, weight: 2 },
  { x: 90, y: 8, w: 140, h: 14, weight: 1 },
  { x: 10, y: 150, w: 50, h: 22, weight: 2 },
  { x: 255, y: 150, w: 55, h: 22, weight: 2 },
  { x: 226, y: 30, w: 24, h: 60, weight: 1 },
];

function nearLantern(x, y, pad) {
  return S.lantern && mode !== 'lost' && Math.hypot(x - LANTERN.x, (y - LANTERN.y) / ELLIPSE) < 28 + pad;
}

function lightDist(x, y) {
  const dx = x - FIRE.x, dy = (y - LIGHT_Y) / ELLIPSE;
  return Math.hypot(dx, dy);
}

function spawnEye() {
  const total = EYE_SPOTS.reduce((a, s) => a + s.weight, 0);
  for (let tries = 0; tries < 12; tries++) {
    let r = Math.random() * total, spot = EYE_SPOTS[0];
    for (const s of EYE_SPOTS) { r -= s.weight; if (r <= 0) { spot = s; break; } }
    const x = Math.round(rand(spot.x, spot.x + spot.w));
    const y = Math.round(rand(spot.y, spot.y + spot.h));
    if (lightDist(x, y) < dispR + 14 || nearLantern(x, y, 10)) continue;
    if (spot.window && S.boards) continue;
    if (eyes.some((e) => Math.hypot(e.x - x, e.y - y) < 14)) continue;
    eyes.push({ x, y, alpha: 0, blink: rand(1.5, 5), blinkT: -1, out: false, red: Math.random() < (S.fire === 0 ? 0.3 : 0.1) });
    return;
  }
}

function eyesWanted() {
  if (mode === 'lost') return S.cause === 'starve' ? 4 : 16;
  if (mode === 'dawn' || mode === 'ended') return 0;
  if (S.fire > 1) return 0;
  const h = S.lit ? hour() : 0;
  return Math.min(12, (S.fire === 1 ? 2 : 3) + Math.floor(S.darkTime / 12) + Math.floor(h / 2) + Math.floor(S.dread / 25));
}

function updateEyes(dt) {
  const want = eyesWanted();
  const live = eyes.filter((e) => !e.out).length;
  eyeSpawn -= dt;
  if (live < want && eyeSpawn <= 0) {
    spawnEye();
    eyeSpawn = mode === 'lost' ? 0.08 : rand(1.2, 3.5);
  }
  for (const e of eyes) {
    if (mode !== 'lost') {
      if (S.fire >= 2 || live > want + 1) e.out = true;
      if (lightDist(e.x, e.y) < dispR + 4 || nearLantern(e.x, e.y, 0)) e.out = true;
    }
    if (mode === 'dawn' || mode === 'ended') e.out = true;

    if (e.out) {
      e.alpha -= dt * 2.5;
    } else {
      e.alpha = Math.min(1, e.alpha + dt * (mode === 'lost' ? 3 : 0.5));
      const dx = FIRE.x - e.x, dy = LIGHT_Y - e.y, d = Math.hypot(dx, dy) || 1;
      if (mode === 'lost' && S.cause !== 'starve') {
        if (d > 6) { e.x += (dx / d) * dt * 30; e.y += (dy / d) * dt * 30; }
      } else if (S.fire === 0 && S.lit && lightDist(e.x, e.y) > dispR + 12) {
        const sp = 1.6 + S.dread / 40;
        e.x += (dx / d) * dt * sp;
        e.y += (dy / d) * dt * sp;
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
  particles.push({ x: FIRE.x + rand(-w, w), y: FIRE.y - rand(0, 2), vx: 0, vy: -(rand(10, 18) + lvl * 6), life: 0, max, ember: false });
}

function spawnEmber(burst) {
  particles.push({ x: FIRE.x + rand(-4, 4), y: FIRE.y - rand(2, 8), vx: rand(-6, 6), vy: -rand(14, burst ? 40 : 28), life: 0, max: rand(1.2, 2.4), ember: true });
}

function updateParticles(dt) {
  if (S.fire > 0) {
    flameAcc += FLAME_RATE[S.fire] * dt;
    while (flameAcc >= 1) { spawnFlame(); flameAcc -= 1; }
    if (Math.random() < dt * S.fire * 1.2) spawnEmber(false);
  }
  for (const p of particles) {
    p.life += dt;
    if (p.ember) p.vx += Math.sin((p.life + p.max) * 6) * dt * 20;
    else p.vx = (FIRE.x - p.x) * 2.2 + rand(-8, 8);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  particles = particles.filter((p) => p.life < p.max);
}

/* ------------------------------------------------------------------ draw */

const C = {
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
  g.fillStyle = '#120c09'; g.fillRect(0, 110, W, 3);

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
  g.fillStyle = '#060a14';
  for (let x = 45; x < 77; x += 4) { const h = 6 + Math.floor(r() * 6); g.fillRect(x, 67 - h, 3, h); g.fillRect(x + 1, 66 - h, 1, 1); }
  g.fillStyle = C.snow; g.fillRect(45, 65, 32, 2);
  g.fillStyle = C.frameHi; g.fillRect(42, 32, 38, 1); g.fillRect(42, 69, 38, 2);

  // shelf with jars
  g.fillStyle = C.frame; g.fillRect(200, 60, 34, 3);
  g.fillStyle = '#3d3a35'; g.fillRect(204, 53, 5, 7);
  g.fillStyle = '#4a3020'; g.fillRect(212, 55, 4, 5);
  g.fillStyle = '#363a3e'; g.fillRect(220, 52, 6, 8);

  // bedroll
  g.fillStyle = '#3b2e2a'; g.fillRect(222, 118, 28, 7);
  g.fillStyle = '#4a3a33'; g.fillRect(222, 118, 7, 7);
  g.fillStyle = '#2a201d'; g.fillRect(222, 124, 28, 1);

  // fire pit
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

const dawnLevel = () => (mode === 'dawn' ? Math.min(1, dawnT / 4) : mode === 'ended' && S.won ? 1 : 0);

function drawDawnWindow() {
  const k = dawnLevel();
  if (k <= 0) return;
  px.fillStyle = `rgba(150, 150, 185, ${0.85 * k})`; px.fillRect(45, 35, 32, 20);
  px.fillStyle = `rgba(215, 170, 160, ${0.85 * k})`; px.fillRect(45, 55, 32, 7);
  px.fillStyle = `rgba(30, 34, 50, ${0.9 * k})`;
  for (let x = 45; x < 77; x += 4) px.fillRect(x, 58 + ((x * 3) % 5), 3, 9);
  px.fillStyle = `rgba(230, 232, 240, ${k})`; px.fillRect(45, 65, 32, 2);
}

function drawDoor() {
  px.fillStyle = C.frame; px.fillRect(254, 48, 40, 64);
  px.fillStyle = '#050404'; px.fillRect(257, 51, 34, 61);
  if (door > 0.05) {
    px.fillStyle = '#0a1020'; px.fillRect(257, 51, 34, 61);
    px.fillStyle = '#060a14'; for (let x = 258; x < 290; x += 5) px.fillRect(x, 70 + ((x * 7) % 9), 3, 30);
    px.fillStyle = '#9aa4b8'; px.fillRect(257, 102, 34, 10);
    px.fillStyle = C.snow; for (const f of snow) px.fillRect(Math.round(f.x + 212), Math.round(f.y + 30), 1, 1);
    if (figure > 0) {
      px.fillStyle = '#020101';
      px.fillRect(268, 54, 12, 58);
      px.fillRect(266, 66, 16, 30);
      px.fillRect(270, 51, 8, 4);
    }
  }
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
  if (!S.lit || (mode === 'lost' && S.cause === 'dark')) return;
  const glow = S.fire > 0 ? 1 : Math.max(0, 1 - S.deadFor / 30);
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
    px.fillStyle = '#fff3b0';
    const w = FLAME_W[S.fire];
    px.fillRect(FIRE.x - w + 1, FIRE.y - 1, w * 2 - 1, 2);
  }
}

function drawWoodPile() {
  const n = Math.min(S.wood, 30);
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

function drawMeat() {
  // strips of meat hanging from the shelf, and dark jars of blood on it
  for (let i = 0; i < Math.min(S.meat, 6); i++) {
    px.fillStyle = '#6a2a22'; px.fillRect(201 + i * 5, 63, 3, 6);
    px.fillStyle = '#8a3a2e'; px.fillRect(201 + i * 5, 63, 1, 5);
  }
  for (let i = 0; i < Math.min(S.blood, 5); i++) {
    px.fillStyle = '#3a0a0a'; px.fillRect(228 - i * 4, 55, 3, 5);
    px.fillStyle = '#6a1010'; px.fillRect(228 - i * 4, 56, 3, 2);
  }
}

function drawTraps() {
  // spare trap frames leaning by the door until they're set outside
  for (let i = 0; i < S.traps; i++) {
    px.fillStyle = '#4a4440'; px.fillRect(246 + i * 3, 104 - i, 2, 7);
  }
}

const SPR_COLORS = { h: '#4b4650', H: '#5d5763', f: '#120d0b', e: '#c9b48a', c: '#38333e', C: '#2a2630', b: '#1d1815', s: '#7a6a5a' };
const TRAVELER_COLORS = { ...SPR_COLORS, h: '#5a4030', H: '#6e5038', c: '#4a3a2a', C: '#3a2a1e' };
const WOODCUTTER_COLORS = { ...SPR_COLORS, h: '#7a2a22', H: '#8a3a2a', c: '#3a4a3a', C: '#2a3a2a' };
const KID_COLORS = { r: '#3a2a1e', k: '#5a4434', e: '#1a1210', s: '#7a2a22', c: '#4a4a3a', b: '#1d1815' };

const STAND = [
  '..hhh..', '.hHhhh.', '.hfffh.', '.hfefh.', '.hhhhh.', 'cccccc.',
  'ccCcccc', 'ccCcccc', '.cCccc.', '.ccccc.', '.ccccc.',
];
const LEGS = [['.b...b.', '.b...b.'], ['..b.b..', '..b.b..']];
const SIT = [
  '....hhh..', '...hHhhh.', '...fffhh.', '...ffehh.', '...hhhhh.',
  '..cccccc.', '.cccCcccc', 'ssccCcccc', '.ccccccc.', 'bbccccccc',
];
const KID = ['..rrr..', '.rrrrr.', '.rkkkr.', '.rkekr.', '..sss..', '.ccccc.', '.ccccc.', '.c...c.', '.b...b.'];

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
  if (S.stranger !== 'inside') return;
  if (dawnLevel() > 0.6) {
    drawMap(STAND, 190, 124);
    drawMap(LEGS[0], 190, 135);
    return;
  }
  const bob = Math.sin(S.time * 1.6) > 0.6 ? 1 : 0;
  const shiver = S.fire === 0 ? (Math.random() < 0.3 ? 1 : 0) : 0;
  drawMap(SIT, 186 + shiver, 128 + bob);
}

function drawVisitor() {
  if (!visitorAtDoor || door < 0.3) return;
  if (visitorAtDoor === 'woodcutter') {
    drawMap(STAND, 270, 96, WOODCUTTER_COLORS);
    drawMap(LEGS[0], 270, 107, WOODCUTTER_COLORS);
    px.fillStyle = '#5a3a22'; px.fillRect(277, 92, 1, 12);
    px.fillStyle = '#9a9a9a'; px.fillRect(278, 92, 3, 3);
  } else if (visitorAtDoor === 'traveler') {
    drawMap(STAND, 270, 97, TRAVELER_COLORS);
    drawMap(LEGS[0], 270, 108, TRAVELER_COLORS);
  } else {
    drawMap(KID, 271, 102, KID_COLORS);
  }
}

function drawBoards() {
  if (!S.boardsBuilt) return;
  const rows = [[37, 5], [48, 6], [59, 5]];
  rows.forEach(([y, h], i) => {
    if (i < S.boards) {
      px.fillStyle = '#4a3220'; px.fillRect(41, y, 40, h);
      px.fillStyle = '#5a3e28'; px.fillRect(41, y, 40, 1);
      px.fillStyle = '#8a8a8a'; px.fillRect(43, y + 2, 1, 1); px.fillRect(78, y + 2, 1, 1);
    } else {
      // splintered stubs where a board was torn away
      px.fillStyle = '#3a2618';
      px.fillRect(41, y + 1, 4, h - 2); px.fillRect(77, y, 4, h - 1);
      px.fillStyle = '#8a8a8a'; px.fillRect(43, y + 2, 1, 1);
    }
  });
}

function drawLantern() {
  if (!S.lantern) return;
  const { x, y } = LANTERN;
  const lit = !(mode === 'lost' && S.cause === 'dark');
  px.fillStyle = '#2a2420';
  px.fillRect(x, y - 12, 1, 6);
  px.fillRect(x - 2, y - 6, 5, 1); px.fillRect(x - 3, y - 5, 7, 1);
  px.fillStyle = lit ? '#c0302a' : '#3a1a18'; px.fillRect(x - 2, y - 4, 5, 6);
  px.fillStyle = lit ? '#ff7a6a' : '#2a1414'; px.fillRect(x - 1, y - 2, 3, 3);
  px.fillStyle = '#2a2420';
  px.fillRect(x - 3, y - 4, 1, 6); px.fillRect(x + 3, y - 4, 1, 6); px.fillRect(x - 3, y + 2, 7, 1);
}

function drawWindowSnow() {
  px.fillStyle = C.snow;
  for (const f of snow) px.fillRect(Math.round(f.x), Math.round(f.y), 1, 1);
  drawDawnWindow();
  px.fillStyle = C.frame; px.fillRect(60, 35, 2, 32); px.fillRect(45, 50, 32, 2);
}

function drawPixels() {
  px.drawImage(bg, 0, 0);
  drawWindowSnow();
  drawBoards();
  drawDoor();
  drawVisitor();
  drawLantern();
  drawMeat();
  drawTraps();
  drawWoodPile();
  drawPitLogs();
  drawCoals();
  drawStranger();
  drawFire();
}

function targetRadius() {
  if (mode === 'lost' && S.cause !== 'starve') return 0;
  if (!S.lit) return 5;
  if (S.fire === 0) return 6 + 10 * Math.max(0, 1 - S.deadFor / 30);
  return LIGHT_R[S.fire];
}

// draw one low-res pixel block on the light layer
function lpx(s, x, y, w, h) {
  lx.fillRect(Math.round(x * s), Math.round(y * s), Math.ceil(w * s), Math.ceil(h * s));
}

function drawHand(s, t) {
  const hd = S.hand;
  const ph = mode === 'lost' && (S.cause === 'hand' || S.cause === 'handAway') ? 'grab' : hd.phase;
  if (ph === 'idle') return;
  const skin = 'rgba(184, 191, 174, 0.95)', dark = 'rgba(110, 116, 104, 0.95)', nail = 'rgba(40, 30, 26, 0.95)';
  if (ph === 'warn') {
    // fingertips tapping at the glass
    lx.fillStyle = `rgba(184, 191, 174, ${0.35 + 0.25 * Math.sin(t * 9)})`;
    for (let i = 0; i < 4; i++) lpx(s, 52 + i * 3, 55 + (i % 2), 1, 2);
    return;
  }
  const wig = Math.sin(t * 10) * 0.8;
  if (S.boards > 0 && ph !== 'grab') {
    // fingers curling through the gap between boards
    const reach = ph === 'reach' ? hd.p : ph === 'steal' ? 1 : 0.3;
    for (let i = 0; i < 4; i++) {
      const fx = 51 + i * 4, len = 2 + Math.round(reach * 4 + (i % 2) * wig);
      lx.fillStyle = skin; lpx(s, fx, 54, 2, len);
      lx.fillStyle = nail; lpx(s, fx, 54 + len, 2, 1);
    }
    lx.fillStyle = dark; lpx(s, 50, 53, 16, 1);
    if (ph === 'steal') {
      lx.fillStyle = 'rgba(160, 122, 78, 0.95)';
      lpx(s, 54, 58, 4, 3); lpx(s, 59, 58, 4, 3);
    }
    return;
  }
  // a long arm pushing in through the window, down toward the room
  const p = ph === 'reach' ? hd.p : ph === 'grab' ? Math.min(1.6, 1 + lossT * 0.3) : ph === 'retreat' ? Math.max(0, hd.t) : 0.5;
  const len = 4 + p * 28;
  const ox = 57, oy = 51, dx = 0.55, dy = 0.83;
  lx.fillStyle = dark;
  for (let i = 0; i < len; i += 1) lpx(s, ox + dx * i - 0.5, oy + dy * i, 4, 4);
  lx.fillStyle = skin;
  for (let i = 0; i < len; i += 1) lpx(s, ox + dx * i, oy + dy * i, 3, 3);
  const hx = ox + dx * len, hy = oy + dy * len;
  lx.fillStyle = dark; lpx(s, hx - 2, hy - 1, 7, 6);
  lx.fillStyle = skin; lpx(s, hx - 1, hy, 5, 4);
  // four long fingers, spread and twitching, with dark nails
  const arm = Math.atan2(dy, dx);
  for (let i = 0; i < 4; i++) {
    const spread = -1.0 + i * 0.66 + wig * 0.12;      // fan the fingers out like a claw
    const fl = 8 + (i === 1 || i === 2 ? 2 : 0);
    let fx = hx + 1.5, fy = hy + 2;
    for (let k = 1; k <= fl; k++) {
      const a = arm + spread + (k / fl) * 0.5 * (i < 2 ? -1 : 1) * (1 + wig * 0.3);   // curl at the tips
      fx += Math.cos(a); fy += Math.sin(a);
      lx.fillStyle = k >= fl - 1 ? nail : skin;
      lpx(s, fx, fy, k < fl - 2 ? 2 : 1, k < fl - 2 ? 2 : 1);
    }
  }
}

function drawLight() {
  const s = light.width / W;
  const t = S.time + performance.now() / 1000;
  const flick = S.fire > 0
    ? (Math.sin(t * 11) * 0.5 + Math.sin(t * 6.7 + 1) * 0.6 + Math.sin(t * 23) * 0.25) * (1 + S.fire * 0.7)
    : Math.sin(t * 3) * 0.6;
  const r = Math.max(2, dispR + flick);
  const dawnK = dawnLevel();

  lx.setTransform(1, 0, 0, 1, 0, 0);
  lx.globalCompositeOperation = 'source-over';
  lx.clearRect(0, 0, light.width, light.height);
  lx.fillStyle = `rgba(4, 2, 2, ${0.965 * (1 - 0.6 * dawnK)})`;
  lx.fillRect(0, 0, light.width, light.height);

  // the pool of firelight
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
  if (S.lit) {
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

  // the blood lantern's red pool by the door
  if (S.lantern && !(mode === 'lost' && S.cause === 'dark')) {
    const lr = (28 + Math.sin(t * 4) * 0.8) * s;
    lx.save();
    lx.translate(LANTERN.x * s, LANTERN.y * s);
    lx.scale(1, ELLIPSE);
    lx.globalCompositeOperation = 'destination-out';
    g = lx.createRadialGradient(0, 0, 0, 0, 0, lr);
    g.addColorStop(0, 'rgba(0,0,0,0.9)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.6)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    lx.fillStyle = g;
    lx.fillRect(-lr, -lr, lr * 2, lr * 2);
    lx.globalCompositeOperation = 'lighter';
    g = lx.createRadialGradient(0, 0, 0, 0, 0, lr);
    g.addColorStop(0, 'rgba(200, 30, 20, 0.22)');
    g.addColorStop(1, 'rgba(120, 0, 0, 0)');
    lx.fillStyle = g;
    lx.fillRect(-lr, -lr, lr * 2, lr * 2);
    lx.restore();
    // red light spilling under the door, with or without a shadow
    lx.globalCompositeOperation = 'source-over';
    lx.fillStyle = 'rgba(170, 30, 22, 0.75)';
    lpx(s, 257, 110, 34, 1.5);
    const v = dialog && dialog.id === 'knock' ? dialog.visit : null;
    if (v && v.who !== 'mimic') {
      lx.fillStyle = 'rgba(10, 4, 4, 0.95)';
      const shift = Math.sin(t * 2) > 0 ? 1 : 0;
      lpx(s, 267 + shift, 110, 4, 1.5); lpx(s, 276 + shift, 110, 4, 1.5);
    }
  }

  // morning light through the window
  if (dawnK > 0) {
    lx.save();
    lx.globalCompositeOperation = 'destination-out';
    const wg = lx.createRadialGradient(61 * s, 60 * s, 0, 61 * s, 60 * s, 120 * s);
    wg.addColorStop(0, `rgba(0,0,0,${0.85 * dawnK})`);
    wg.addColorStop(1, 'rgba(0,0,0,0)');
    lx.fillStyle = wg;
    lx.fillRect(0, 0, light.width, light.height);
    lx.globalCompositeOperation = 'lighter';
    const bl = lx.createRadialGradient(61 * s, 60 * s, 0, 61 * s, 60 * s, 110 * s);
    bl.addColorStop(0, `rgba(120, 130, 170, ${0.14 * dawnK})`);
    bl.addColorStop(1, 'rgba(0,0,0,0)');
    lx.fillStyle = bl;
    lx.fillRect(0, 0, light.width, light.height);
    lx.restore();
  }

  // moonlight through an open door
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

  // dread: a dark red vignette from the edges
  if (S.dread > 40 && mode === 'playing') {
    const k = ((S.dread - 40) / 60) * (0.75 + 0.25 * Math.sin(t * 4));
    const vg = lx.createRadialGradient(light.width / 2, light.height / 2, light.height * 0.35, light.width / 2, light.height / 2, light.width * 0.65);
    vg.addColorStop(0, 'rgba(60, 0, 0, 0)');
    vg.addColorStop(1, `rgba(70, 0, 0, ${0.45 * k})`);
    lx.fillStyle = vg;
    lx.fillRect(0, 0, light.width, light.height);
  }

  lx.globalCompositeOperation = 'source-over';

  // the hunter's eyes, shining in the treeline
  if (hunterEyes > 0.02) {
    const blink = Math.sin(t * 0.9) > 0.95 ? 0.15 : 1;
    lx.fillStyle = `rgba(255, 190, 80, ${hunterEyes * blink})`;
    lpx(s, 52, 56, 2, 1); lpx(s, 57, 56, 2, 1);
    const glow = lx.createRadialGradient(55.5 * s, 56.5 * s, 0, 55.5 * s, 56.5 * s, 6 * s);
    glow.addColorStop(0, `rgba(255, 170, 60, ${0.18 * hunterEyes})`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    lx.fillStyle = glow;
    lx.fillRect(48 * s, 50 * s, 15 * s, 13 * s);
  }

  // eyes in the room
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

  // the tall thing in the doorway
  if (figure > 0 && door > 0.3) {
    lx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, figure)})`;
    lpx(s, 271, 58, 2, 1); lpx(s, 276, 58, 2, 1);
  }

  drawHand(s, t);

  // dying: everything goes black
  if (mode === 'lost' || (mode === 'ended' && !S.won)) {
    const start = S.cause === 'starve' ? 0.4 : 1.6;
    const k = mode === 'ended' ? 1 : clamp((lossT - start) / 1.6, 0, 1);
    lx.fillStyle = `rgba(0, 0, 0, ${k})`;
    lx.fillRect(0, 0, light.width, light.height);
  }
}

/* -------------------------------------------------------------- portraits */

const HOODED = [
  '....hhhhhhh.....', '...hHHhhhhhh....', '..hHhhhhhhhhh...', '..hhhffffffhhh..',
  '.hhhffffffffhh..', '.hhffffffffffhh.', '.hhffeffffeffhh.', '.hhffffffffffhh.',
  '.hhfffffffffhhh.', '.hhhffffffffhhh.', '..hhhffffffhhh..', '..hhhhhhhhhhhh..',
  '.cchhhhhhhhhhcc.', 'ccccccCcccccccc.', 'cccccccCcccccccc', 'cccccccccccccccc',
];
const BEARDED = [
  '....hhhhhhh.....', '...hHHhhhhhh....', '..hHhhhhhhhhh...', '..hhffffffffhh..',
  '.hhffffffffffh..', '.hhfeeffffeefh..', '.hhffffffffffh..', '.hhffffnnffffh..',
  '.hhbbffffffbbh..', '.hhbbbbbbbbbbh..', '..hbbbbmmbbbh...', '..hhbbbbbbbbh...',
  '.cchhbbbbbbhcc..', 'cccccccccccccc..', 'ccccccCccccccc..', 'cccccccccccccc..',
];
const DOOR_MAP = [
  'ffffffffffffffff', 'fppqppqppqppqppf', 'fppqppqppqppqppf', 'fppqppqppqppqppf',
  'fbbbbbbbbbbbbbbf', 'fppqppqppqppqppf', 'fppqppqppqppqppf', 'fppqppqppqppqkkf',
  'fppqppqppqppqppf', 'fppqppqppqppqppf', 'fbbbbbbbbbbbbbbf', 'fppqppqppqppqppf',
  'fppqppqppqppqppf', 'fppqppqppqppqppf', 'fppqppqppqppqppf', 'ffffffffffffffff',
];
const DOOR_COLORS = { f: '#3a281b', p: '#3b2717', q: '#2a1b10', b: '#2a1b10', k: '#8a7a5a', r: '#b0281e', x: '#0a0404' };

const PORTRAITS = {
  stranger: { map: HOODED, colors: SPR_COLORS },
  woodcutter: { map: BEARDED, colors: { h: '#7a2a22', H: '#9a3a2a', f: '#8a6248', e: '#1a1210', n: '#6a4a36', b: '#5a3a20', m: '#2a1a10', c: '#3a4a3a', C: '#2a3a2a' } },
  kid: {
    map: [
      '................', '.....rrrrrr.....', '....rrrrrrrr....', '...rrrrrrrrrr...',
      '...rrffffffrr...', '..rrffffffffrr..', '..rrfeffffefrr..', '..rrffffffffrr..',
      '...rffffffffr...', '...rfffmmfffr...', '....ffffffff....', '.....ffffff.....',
      '...ssssssssss...', '..ssssssssssss..', '.cccsssssssccc..', 'cccccccccccccccc',
    ],
    colors: { r: '#3a2a1e', f: '#8a6a54', e: '#1a1210', m: '#5a3a2e', s: '#7a2a22', c: '#4a4a3a' },
  },
  door: { map: DOOR_MAP, colors: DOOR_COLORS },
  doorFeet: { map: [...DOOR_MAP.slice(0, 15), 'frxxrrrrrrxxrrrf'], colors: DOOR_COLORS },
  doorEmpty: { map: [...DOOR_MAP.slice(0, 15), 'frrrrrrrrrrrrrrf'], colors: DOOR_COLORS },
  dawn: {
    map: ['', '', '', '', '', '', '', '', '', '', '................', 'tt..tt...tt..ttt', 'tttttttttttttttt', 'wwwwwwwwwwwwwwww', 'wwwwwwwwwwwwwwww', 'wwwwwwwwwwwwwwww'],
    colors: { t: '#2a2e40', w: '#dfe2ea' },
    bg: '#c8a8b0',
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

function hungerLabel() {
  if (S.hunger >= 90) return ['starving', 'bad'];
  if (S.hunger >= 70) return ['hungry', 'warn'];
  return ['fed', ''];
}

function syncUI() {
  ui.res.textContent = `wood ${S.wood}   meat ${S.meat}   blood ${S.blood}`;
  ui.clock.textContent = S.won ? '6:00 am · dawn' : S.lit ? `${clockText(S.night)} · dawn at 6` : '';
  const [hl, hc] = hungerLabel();
  ui.hunger.textContent = S.lit ? hl : '';
  ui.hunger.className = hc;

  const present = canAct();
  ui.stoke.querySelector('.label').textContent = S.fire === 0 ? (S.lit ? 'relight fire' : 'light fire') : 'stoke fire';
  ui.stoke.disabled = !present || S.cd.stoke > 0 || S.wood < 1;
  ui.stoke.style.setProperty('--cd', `${(S.cd.stoke / (STOKE_CD * (S.hunger >= 90 ? 2 : 1))) * 100}%`);
  for (const b of [ui.eat, ui.wood, ui.hunt, ui.build]) b.classList.toggle('hidden', !S.lit);
  ui.eat.disabled = !present || S.meat < 1 || S.hunger < 5;
  ui.wood.disabled = !present;
  ui.hunt.disabled = !present;
  ui.build.disabled = !present;

  const reaching = S.hand.phase === 'reach' && mode === 'playing' && !S.away && !dialog;
  ui.strike.classList.toggle('hidden', !reaching);
  if (reaching) ui.strike.style.setProperty('--cd', `${(1 - S.hand.p) * 100}%`);

  ui.away.classList.toggle('hidden', !S.away || mode !== 'playing');
  if (S.away) {
    ui.awayText.textContent = `${TRIPS[S.away.kind].label}...`;
    ui.awayBar.style.width = `${(1 - S.away.t / S.away.total) * 100}%`;
  }

  ui.sound.textContent = S.sound ? 'sound on' : 'sound off';

  if (!ui.buildPanel.classList.contains('hidden')) {
    const sig = BUILDS.map((b) => `${b.show()}${canAfford(b.cost())}`).join() + canAct() + S.traps + S.boards;
    if (sig !== buildRefresh) { buildRefresh = sig; renderBuild(); }
  }

  $('actions').classList.toggle('hidden', !!dialog || !!S.away);
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
  if (force !== false && mode !== 'playing') return;
  const open = force ?? ui.journal.classList.contains('hidden');
  ui.journal.classList.toggle('hidden', !open);
  if (open) { ui.buildPanel.classList.add('hidden'); renderJournal(); }
}

/* --------------------------------------------------- title, ending, board */

function setMode(m) {
  mode = m;
  stage.dataset.mode = m;
}

function renderBoard(el, highlight = -1) {
  const list = loadBoard();
  el.innerHTML = '';
  if (!list.length) { el.innerHTML = '<li class="empty">no one has made it to dawn yet.</li>'; return; }
  list.forEach((e, i) => {
    const li = document.createElement('li');
    if (i === highlight) li.className = 'mine';
    li.innerHTML = `<span class="rank">${i + 1}.</span><span class="who"></span><span class="pts">${e.score}</span><span class="sun"></span>`;
    li.querySelector('.who').textContent = e.name;
    el.appendChild(li);
  });
}

function showTitle(panel = 'menu') {
  setMode('title');
  ui.ending.classList.add('hidden');
  ui.title.classList.remove('hidden');
  ui.titleMenu.classList.toggle('hidden', panel !== 'menu');
  ui.howPanel.classList.toggle('hidden', panel !== 'how');
  ui.boardPanel.classList.toggle('hidden', panel !== 'board');
  if (panel === 'board') renderBoard(ui.boardList);
  ui.cont.classList.toggle('hidden', !(S.lit && !S.ended));
  toggleJournal(false);
  toggleBuild(false);
  const sel = panel === 'menu' ? '#titleMenu' : panel === 'how' ? '#howPanel' : '#boardPanel';
  ui.title.querySelector(`${sel} button:not(.hidden)`)?.focus({ preventScroll: true });
}

function newNight(skipConfirm = false) {
  if (!skipConfirm && S.lit && !S.ended && !confirm('Start a new night? The one in progress will be lost.')) return;
  const sound = S.sound;
  S = freshState();
  S.sound = sound;
  resetTransients();
  ui.title.classList.add('hidden');
  ui.ending.classList.add('hidden');
  setMode('playing');
  introTimer = 0.8;
  save();
}

function continueNight() {
  ui.title.classList.add('hidden');
  setMode('playing');
  say(S.away ? 'you are still out in the trees.' : S.fire === 0 ? 'the room is cold again.' : `the fire is ${FIRE_NAMES[S.fire]}.`);
}

function showEnding(won) {
  if (mode === 'ended') return;
  if (dialog) { dialog = null; ui.dialogue.classList.add('hidden'); }
  setMode('ended');
  S.ended = true;
  S.won = won;
  ui.ending.classList.toggle('died', !won);
  ui.endScore.innerHTML = '';
  ui.endBoard.innerHTML = '';
  ui.initials.classList.add('hidden');

  if (!won) {
    const d = DEATHS[S.cause] || DEATHS.dark;
    ui.endTitle.textContent = 'you died.';
    ui.endText.textContent = `${d.text} You lasted until ${clockText(S.night)}.`;
    ui.endHint.textContent = d.hint;
    ui.endHint.classList.remove('hidden');
    S.scored = true;
    save();
    ui.retry.focus({ preventScroll: true });
    ui.ending.classList.remove('hidden');
    return;
  }

  ui.endHint.classList.add('hidden');
  const result = computeScore({ wood: S.wood, meat: S.meat, blood: S.blood, fire: S.fire, companion: S.stranger === 'inside' });
  S.final = result.total;
  ui.endTitle.textContent = 'dawn.';
  ui.endText.textContent = S.stranger === 'inside' ? 'You made it through the night, and you were not alone.' : 'You made it through the night.';
  for (const [label, n, pts] of result.lines) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${label}</td><td class="n">${n}</td><td class="pts">${pts}</td>`;
    ui.endScore.appendChild(tr);
  }
  const tr = document.createElement('tr');
  tr.className = 'total';
  tr.innerHTML = `<td>score</td><td></td><td class="pts">${result.total}</td>`;
  ui.endScore.appendChild(tr);

  const earns = !S.scored && qualifies(loadBoard(), result.total);
  ui.initials.classList.toggle('hidden', !earns);
  renderBoard(ui.endBoard);
  if (!earns) S.scored = true;
  ui.ending.classList.remove('hidden');
  if (earns) { ui.initialsInput.value = ''; setTimeout(() => ui.initialsInput.focus(), 50); }
  else ui.retry.focus({ preventScroll: true });
  save();
}

ui.initials.addEventListener('submit', (e) => {
  e.preventDefault();
  if (S.scored) return;
  const entry = { name: cleanInitials(ui.initialsInput.value), score: S.final, t: Date.now() };
  const { list, rank } = insertScore(loadBoard(), entry);
  saveBoard(list);
  S.scored = true;
  save();
  ui.initials.classList.add('hidden');
  renderBoard(ui.endBoard, rank);
  sfx.chime();
  ui.retry.focus({ preventScroll: true });
});
ui.initialsInput.addEventListener('input', () => {
  ui.initialsInput.value = ui.initialsInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
});

function backToTitle() {
  const sound = S.sound;
  S = freshState();
  S.sound = sound;
  resetTransients();
  save();
  showTitle('menu');
}

/* ----------------------------------------------------------------- wiring */

ui.stoke.addEventListener('click', stoke);
ui.eat.addEventListener('click', eat);
ui.wood.addEventListener('click', () => startTrip('wood'));
ui.hunt.addEventListener('click', () => startTrip('hunt'));
ui.build.addEventListener('click', () => toggleBuild());
ui.strike.addEventListener('click', strikeHand);
$('runBack').addEventListener('click', runBack);
$('buildClose').addEventListener('click', () => toggleBuild(false));
$('journalBtn').addEventListener('click', () => toggleJournal());
$('journalClose').addEventListener('click', () => toggleJournal(false));
$('menuBtn').addEventListener('click', () => { save(); showTitle('menu'); });
$('fullBtn').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.();
});
ui.sound.addEventListener('click', () => { S.sound = !S.sound; sfx.setEnabled(S.sound); save(); });
$('newBtn').addEventListener('click', () => newNight());
ui.cont.addEventListener('click', continueNight);
$('boardBtn').addEventListener('click', () => showTitle('board'));
$('howBtn').addEventListener('click', () => showTitle('how'));
document.querySelectorAll('.backBtn').forEach((b) => b.addEventListener('click', () => showTitle('menu')));
ui.retry.addEventListener('click', () => newNight(true));
$('endTitleBtn').addEventListener('click', backToTitle);
window.addEventListener('pointerdown', () => sfx.initAudio());

window.addEventListener('keydown', (e) => {
  sfx.initAudio();
  if (e.target instanceof HTMLInputElement) return;
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (mode === 'title') {
    if (k === 'escape' && ui.titleMenu.classList.contains('hidden')) showTitle('menu');
    return;
  }
  if (mode === 'ended') { if (k === 'r') ui.retry.click(); return; }
  if (mode !== 'playing') { if (dialog && k === '1') choose(0); return; }
  const panelOpen = !ui.journal.classList.contains('hidden') || !ui.buildPanel.classList.contains('hidden');
  if (k === 'escape' && panelOpen) { toggleJournal(false); toggleBuild(false); }
  else if (k === 'escape' || k === 'p') { save(); showTitle('menu'); }
  else if (k === 'j') toggleJournal();
  else if (k === 'm') ui.sound.click();
  else if (dialog) { if (k >= '1' && k <= '4') choose(Number(k) - 1); }
  else if (k === 'f' || k === ' ') { e.preventDefault(); strikeHand(); }
  else if (k === 'r') runBack();
  else if (k === 'b') toggleBuild();
  else if (panelOpen) return;
  else if (k === 's') stoke();
  else if (k === 'e') eat();
  else if (k === 'g') startTrip('wood');
  else if (k === 'h') startTrip('hunt');
});

document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'playing') save(); });

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
showTitle('menu');

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  update(dt);
  drawPixels();
  drawLight();
  syncUI();
  sfx.setLevels(mode === 'lost' || mode === 'ended' ? 0 : S.fire, S.time, door);
  stage.style.transform = shake > 0 ? `translate(${rand(-3, 3).toFixed(1)}px, ${rand(-3, 3).toFixed(1)}px)` : '';
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Test hook: drives the game from the console or an automated player.
window.__firelight = {
  get state() { return S; },
  get mode() { return mode; },
  get dialog() { return dialog; },
  get pending() { return pendingVisit; },
  get eyes() { return eyes.length; },
  act: { stoke, eat, wood: () => startTrip('wood'), hunt: () => startTrip('hunt'), strike: strikeHand, runBack, build },
  choose,
  newNight: () => newNight(true),
  backToTitle,
  // advance the game by `sec` seconds; draw = false skips rendering (for fast simulations)
  step(sec, draw = true) {
    for (let t = 0; t < sec; t += 0.05) update(0.05);
    if (draw) { drawPixels(); drawLight(); syncUI(); }
  },
};
