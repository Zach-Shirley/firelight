// Firelight: survive one night in a dark room. Keep the fire alive, eat, and be careful what you let in.
// The pixel layer is drawn at 320x180 and scaled up with crisp pixels.
// The light layer runs at full screen resolution so the glow stays smooth.

import * as sfx from './sound.js';
import { ACHIEVEMENTS, createStore } from './achievements.js';
import { computeScore, qualifies, insertScore, cleanInitials, sanitizeBoard } from './score.js';
import { CHALLENGES, challengeById, recordFor } from './challenges.js';

const VERSION = '0.73';   // one step per commit to the repository
const W = 320, H = 180;
const FIRE = { x: 160, y: 136 };          // base of the flames
const LIGHT_Y = 130;                       // centre of the light pool
const ELLIPSE = 0.8;                       // light pool is a little squashed
const LANTERN = { x: 240, y: 70 };
// the four corner torch sconces (see lightTorch)
const TORCHES = [
  { id: 'bl', name: 'the back-left corner', x: 14, y: 46, rat: [1, 0] },
  { id: 'br', name: 'the back-right corner', x: 289, y: 46, rat: [-1, 0] },
  { id: 'fl', name: 'the front-left corner', x: 14, y: 150, rat: [1, 0.3] },
  { id: 'fr', name: 'the front-right corner', x: 306, y: 150, rat: [-1, 0.3] },
];
const TORCH_R = 34;

const FIRE_NAMES = ['dead', 'smoldering', 'flickering', 'burning', 'roaring'];
const LIGHT_R = [14, 42, 70, 102, 142];

const NIGHT_HOURS = 8;                     // 10 pm to 6 am
const HOUR = 52.5;                         // seconds per hour: the whole night is 7 minutes
const START_HOUR = 22;
const STOKE_CD = 2.5;
const EAT_CD = 1.5;
const COOK_TIME = 6;          // about one wood trip
const cookTime = () => (S.stove ? 4 : COOK_TIME);
const SHED_LOG_TIME = 1;        // seconds outside for each log you build into the woodshed
const TRIPS = {
  wood: { time: 6, label: 'gathering wood in the dark' },
  drag: { time: 4, label: 'dragging her body into the snow' },
  shed: { time: SHED_LOG_TIME, label: 'building the woodshed' },   // per log carried out
};

const SAVE_KEY = 'firelight-save-v8';

// Difficulty, chosen for each run. Hard is the same game with less to go around and quicker threats. Insane is very
// lean, but the trader comes every night, charges less, and sells an iron trap that never breaks.
const DIFFS = {
  normal: { name: 'normal', wood: 1, traps: 1, dayWood: 1, dayTraps: 1, dayHunt: 1, traderMeat: 0, hunger: 1, spoil: 1, grin: 1, quick: 1, mimic: 0, decay: 1, shedCap: 100, startWood: 6,
    blurb: 'the night as it was meant to be. a hard first night, and fair once you know it.' },
  // hard and insane were tuned against evolved bots (tools/sim.js evolve and sweep), 2026-10-19
  hard: { name: 'hard', wood: 0.9, traps: 0.7, dayWood: 0.85, dayTraps: 0.7, dayHunt: 1, traderMeat: 1, hunger: 1.15, spoil: 0.8, grin: 4 / 3, quick: 0.8, mimic: 0.08, decay: 1, shedCap: 70, startWood: 5,
    blurb: 'less wood, fewer catches, meat goes bad sooner. the grin takes three seconds; she and the hatch are quicker. more of the knocks are mimics.' },
  // insane: the traps barely feed you and the trader's smoked meat is the lifeline, so a night with no one knocking
  // is nearly always the last; the fire burns a touch slower than normal so the blizzard is survivable at all
  insane: { name: 'insane', wood: 0.75, traps: 0.42, dayWood: 0.55, dayTraps: 0.5, dayHunt: 1, traderMeat: 3, hunger: 1.3, spoil: 0.65, grin: 4 / 3, quick: 0.7, mimic: 0.12, decay: 1.05, shedCap: 50, startWood: 4,
    trader: true, rot: true,
    blurb: 'almost nothing to live on, and the woodshed rots. without the people who knock, you will not last. the trader charges less, trades smoked meat for logs, and sells an iron trap that never breaks.' },
};
const D = () => DIFFS[S.diff] || DIFFS.normal;
// the challenge's rules
const noVisitors = () => S.ch === 'noVisitors';
const trapMax = () => (S.ch === 'oneTrap' ? 1 : 3);
const boardKey = (diff) => (diff && diff !== 'normal' ? `${BOARD_KEY}-${diff}` : BOARD_KEY);
const STATS_KEY = 'firelight-stats-v1';
const FALSE_STRANGER_CHANCE = 0.12;   // some nights, the stranger you let in is not her
const BOARD_KEY = 'firelight-scores-v2';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const pix = $('pix'), px = pix.getContext('2d');
const light = $('light');
let lx = light.getContext('2d');   // swapped briefly for an offscreen layer by asLayer()
pix.width = W; pix.height = H;

const ui = {
  res: $('res'), clock: $('clock'), hunger: $('hunger'), message: $('message'),
  stoke: $('stoke'), eat: $('eat'), cook: $('cook'), wood: $('woodTrip'), build: $('buildBtn'), strike: $('strike'),
  away: $('away'), awayText: $('awayText'), awayBar: $('awayBar'),
  dialogue: $('dialogue'), dlgText: $('dlgText'), dlgChoices: $('dlgChoices'), portrait: $('portrait'),
  journal: $('journal'), journalList: $('journalList'),
  buildPanel: $('build'), buildList: $('buildList'),
  sound: $('soundBtn'),
  toast: $('toast'), spots: $('spots'), spotCard: $('spotCard'), achPanel: $('achPanel'), achList: $('achList'), achCount: $('achCount'),
  title: $('title'), titleMenu: $('titleMenu'), howPanel: $('howPanel'), boardPanel: $('boardPanel'), devPanel: $('devPanel'), dayWarn: $('dayWarn'),
  boardList: $('boardList'), cont: $('contBtn'),
  ending: $('ending'), endTitle: $('endTitle'), endText: $('endText'), endHint: $('endHint'), endScore: $('endScore'),
  endRecap: $('endRecap'), endTally: $('endTally'), boardTally: $('boardTally'),
  day: $('day'), dayHours: $('dayHours'), dayList: $('dayList'), dayLog: $('dayLog'), dayNight: $('dayNight'),
  dayBtn: $('dayBtn'), endRunBtn: $('endRunBtn'), slam: $('slam'),
  douse: $('douse'), saltFlare: $('saltFlare'), swat: $('swat'),
  initials: $('initials'), initialsInput: $('initialsInput'), endBoard: $('endBoard'), retry: $('retryBtn'),
};

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ------------------------------------------------------------------ state */

function freshState() {
  return {
    v: 8,
    ch: null,                                    // the challenge this run is taking, if any (challenges.js)
    time: 0,
    night: 0,
    hourSaid: 0,
    lit: false,
    fire: 0,
    decay: 13,
    deadFor: 0,
    wood: 6,
    meat: 0,                                     // raw meat (count of rawLife)
    cooked: 1,                                   // cooked meat (count of cookedLife)
    rawLife: [],                                 // seconds until each raw piece goes bad
    cookedLife: [240],
    cooking: null,                               // { n, t } meat on the fire
    sick: 0,                                     // seconds of sickness left from raw meat
    sickT: 8,
    stalk: 0,                                    // 0..100: how close the thing in the trees is to you
    trusted: 0,                                  // real people you let in
    blood: 0,
    hunger: 25,                                  // 0 fed .. 100 starved
    hungerSaid: 0,
    dread: 0,
    darkTime: 0,
    boards: 0,
    boardsBuilt: false,
    glassBroken: false,
    traps: 0,
    lantern: false,
    lanternLit: false,
    lanternT: 0,
    cd: { stoke: 0, eat: 0 },
    trapUses: [],                                // catches left in each trap
    trapSalt: [],                                // whether each trap is salted (it catches meat far more often)
    shed: false,
    shedWood: 0,
    shedBuilt: 0,                                // logs built into the woodshed so far (it needs PILE_CAP)
    blaze: 0,
    cold: 0,                                     // 0 warm .. 100 frozen (blizzard nights only)
    room: 0,                                     // how cold the house is, 0..100 (blizzard nights only)
    snowPile: 0,                                 // snow drifted in under the window, 0..1
    curtains: false,                             // fur curtains over the window
    curtainsShut: false,
    hat: false, pants: false, socks: false,      // fur clothes (the coat is S.coat)
    coldSaid: 0,
    wet: [],                                     // seconds until each wet log is dry (wet logs are used up first)
    smoke: 0,                                    // 0..1 smoke from wet wood, collecting under the roof (looks only)
    rack: false,                                 // drying rack
    rackT: 105,                                  // unused since the rack stopped smoking meat; kept so old saves load
    fur: 0,
    coat: false,
    insulated: false,
    stove: false,
    charm: false,                                // the bone charm, for one night
    grate: false,
    shoes: false,
    spear: false,
    traderCame: false,
    away: null,                                  // { kind, t, total }
    hunter: { near: false, t: 45, since: 0 },    // the thing in the trees
    hand: { phase: 'idle', t: 30, total: 1, p: 0, beat: 0 },
    doorT: 62,                                   // seconds until the next knock
    firstVisit: true,
    stranger: 'none',                            // none | inside | refused | dead
    sHunger: 0,
    nightNo: 1,                                  // 1, then 2 after the day
    phase: 'night',                              // night | day
    carry: 0,                                    // score banked from night 1
    dayHours: 8,
    dayDone: {},
    dayLog: [],
    tired: false,                                // didn't sleep through the day
    awake: 0,                                    // days in a row without sleep (0..3; a fourth kills you)
    dozeT: 22,
    salt: 0,
    saltDoor: false,
    saltWin: false,
    nails: false,
    boardLoose: false,
    hatch: { phase: 'idle', t: 18, total: 1, p: 0 },
    hatchFed: 0,
    hatchBar: false,                             // a beam nailed across the cellar hatch
    torches: {},                                 // which corners have a torch: { bl, br, fl, fr }
    goblins: [],                                 // night 4: the things that came in at your heels
    axe: false,                                  // the woodcutter's spare axe: more wood per trip
    saltHatch: false,                            // a ring of salt around it (one use)
    buried: false,
    n2HintT: -1,
    strangerFalse: false,
    fDemandT: 45,
    fRefused: 0,
    recorded: false,
    rec: { letIn: 0, turnedAway: 0, mimicsKept: 0, fed: 0, burned: 0, boardsLost: 0, trips: 0, cooked: 0, raw: 0, closest: 0, close: {} },
    sPlea: 0,
    riseT: -1,
    carcass: false,
    mimicWalked: false,
    hint: 0,
    hintT: 12,
    cutterVisits: 0,
    traderTonight: Math.random() < 0.6,          // the trader only comes some nights
    met: {},                                     // who you've opened the door for: they greet you as an old friend
    dev: false,                                  // started from the playtest menu: no stats, no leaderboard
    diff: 'normal',                              // normal | hard | insane
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
    if (s && s.v === 8) {
      const f = freshState();
      return Object.assign(f, s, {
        cd: Object.assign(f.cd, s.cd),
        hunter: Object.assign(f.hunter, s.hunter),
        hand: Object.assign(f.hand, s.hand),
        rec: Object.assign(f.rec, s.rec),
        hatch: Object.assign(f.hatch, s.hatch),
        trapUses: Array.isArray(s.trapUses) ? s.trapUses : [],
        rawLife: Array.isArray(s.rawLife) ? s.rawLife : [],
        cookedLife: Array.isArray(s.cookedLife) ? s.cookedLife : [],
      });
    }
  } catch (e) { /* storage unavailable or corrupt: start fresh */ }
  return null;
}

function save() {
  if (lab) return;   // the death lab never touches the save
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
}

const CAUSE_NAMES = {
  dark: 'the dark', starve: 'hunger', burn: 'the fire', mimic: 'the mimic', hand: 'her, at the window', handAway: 'her, at the window',
  hunter: 'the thing in the trees', risen: "the stranger's body", falseStranger: 'the false stranger',
  cellar: 'the thing under the floor', cellarAway: 'the thing under the floor', freeze: 'the cold', lost: 'the white', sleep: 'no sleep', guest: 'a goblin', goblins: 'the goblins', bloodHour: 'the blood hour', flood: 'the swarm', ash: 'her ash',
};

function loadStats() {
  try {
    const st = JSON.parse(localStorage.getItem(STATS_KEY) || '{}');
    return { nights: st.nights | 0, dawns: st.dawns | 0, deaths: st.deaths && typeof st.deaths === 'object' ? st.deaths : {} };
  } catch (e) { return { nights: 0, dawns: 0, deaths: {} }; }
}

function recordNight(won) {
  const st = loadStats();
  if (S.recorded || window.__simulating || S.dev || lab) return st;   // simulated and playtest nights don't count
  S.recorded = true;
  st.nights += 1;
  if (won) st.dawns += 1;
  else {
    const name = CAUSE_NAMES[S.cause] || S.cause;
    st.deaths[name] = (st.deaths[name] | 0) + 1;
  }
  try { localStorage.setItem(STATS_KEY, JSON.stringify(st)); } catch (e) { /* ignore */ }
  return st;
}

function tallyText(st) {
  if (!st.nights) return '';
  const top = Object.entries(st.deaths).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} ${n}`).join(', ');
  return `${st.nights} night${st.nights === 1 ? '' : 's'} · ${st.dawns} dawn${st.dawns === 1 ? '' : 's'}${top ? ` · killed by: ${top}` : ''}`;
}

// Close calls: for each threat, the nearest you came to it. The recap shows the nearest one overall,
// leaving out whatever actually killed you.
const CLOSE_KILLERS = { cold: ['freeze', 'lost'], grin: ['hunter'], dark: ['dark'], hunger: ['starve'], her: ['hand', 'handAway'], hatch: ['cellar', 'cellarAway'], blaze: ['burn'] };

function nearMiss(kind, d, text) {
  S.rec.close ||= {};
  const cur = S.rec.close[kind];
  if (!cur || d > cur.d) S.rec.close[kind] = { d: clamp(d, 0, 0.99), text };
}

function closestCall() {
  let best = null;
  for (const [kind, c] of Object.entries(S.rec.close || {})) {
    if (!S.won && CLOSE_KILLERS[kind]?.includes(S.cause)) continue;
    if (c.d >= 0.4 && (!best || c.d > best.d)) best = c;
  }
  return best && best.text;
}

function renderRecap() {
  const r = S.rec;
  const rows = [
    ['people let in', r.letIn], ['turned away', r.turnedAway], ['mimics kept out', r.mimicsKept],
    ['fed the stranger', r.fed], ['burned her back', r.burned], ['boards lost', r.boardsLost],
    ['trips into the trees', r.trips], ['meat cooked', r.cooked], ['raw meat eaten', r.raw],
  ].filter(([, n]) => n > 0);
  const call = closestCall();
  if (call) rows.push(['closest call', call]);
  rows.push(['hungriest', (r.hungriest || 0) >= 90 ? 'starving' : (r.hungriest || 0) >= 70 ? 'hungry' : 'never hungry']);
  ui.endRecap.innerHTML = '';
  for (const [label, v] of rows) {
    const li = document.createElement('li');
    li.innerHTML = `<span></span><span class="v"></span>`;
    li.firstChild.textContent = label;
    li.lastChild.textContent = v;
    ui.endRecap.appendChild(li);
  }
}

// one leaderboard per difficulty
function loadBoard(diff = S.diff) {
  try { return sanitizeBoard(JSON.parse(localStorage.getItem(boardKey(diff)) || '[]')); } catch (e) { return []; }
}

function saveBoard(list, diff = S.diff) {
  try { localStorage.setItem(boardKey(diff), JSON.stringify(list)); } catch (e) { /* ignore */ }
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
let doorCreaked = false;   // the hinge sound has played for this opening
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
let lab = null;           // the death lab, while it's open: { sc, t, playing, speed, fright, savedFright, sound, acc, rng }
let eyeSpawn = 0.5;
let buildRefresh = '';
let animT = 0;             // animation clock; runs at half speed while a dialogue pauses the night
let growlT = 0;
let doze = 0;              // seconds of your eyes being shut
const snow = Array.from({ length: 10 }, () => ({ x: rand(45, 76), y: rand(35, 66), v: rand(3, 7) }));

function resetTransients() {
  particles = []; fx = []; eyes = []; doze = 0; pileLean = -1; traderOpen = 0; dialog = null; pendingVisit = null; msgQueue = []; msgTimer = 0;
  door = doorTarget = 0; doorCloseIn = -1; walker = null; visitorAtDoor = null; figure = 0;
  dispR = 0; shake = 0; hunterEyes = 0; dawnT = 0; lossT = 0; trapWreck = 0;
  // and every other clock the night keeps outside S, so a run from a given random seed always plays the same
  heartTimer = 0; eyeSpawn = 0.5; animT = 0; growlT = 0; dozeLen = 1.4; phantomEyes = 0; phantomGrin = 0;
  flareT = 0; blueT = 0; jumpT = 0; windowScareT = 0; cabOpen = 0; cabT = 0; cabHeld = false; flameAcc = 0;
  deathCue = 0; deathEyes = []; saveTimer = 3;
  for (const f of snow) Object.assign(f, { x: rand(45, 76), y: rand(35, 66), v: rand(3, 7) });
  ui.dialogue.classList.add('hidden');
  ui.message.classList.remove('show');
  toggleJournal(false);
  toggleBuild(false);
}

/* ------------------------------------------------------------- the night */

const clockHour = () => Math.min(NIGHT_HOURS - 1, Math.floor(S.night / HOUR));
// from the second night everything that hunts you behaves as if it were two hours later
const hour = () => Math.min(NIGHT_HOURS - 1, clockHour() + (S.nightNo >= 5 ? 3 : S.nightNo >= 2 ? 2 : 0));
const LAST_NIGHT = 5;   // night 5: the blood moon, and the end
const blizzard = () => S.nightNo === 3 || S.nightNo === 4;   // nights 3 and 4: the blizzard

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
  4: 'two in the morning. the snow has stopped. it is very quiet.',
  5: 'three in the morning. the coldest hour.',
  6: 'four in the morning. they are hungry now.',
  7: 'the last hour. hold on.',
};

const HOUR_LINES_2 = {
  1: "eleven o'clock. she can find the window already.",
  2: 'midnight. something shifts under the floor.',
  3: 'one in the morning. some of them have learned to walk. only the lantern tells.',
  4: 'two in the morning. the forest is picked clean.',
  5: 'three in the morning. you can hear them breathing.',
  6: 'four in the morning. everything is awake now.',
  7: 'the last hour of the second night. hold on.',
};

const HOUR_LINES_4 = {
  1: "eleven o'clock. the blizzard has not stopped since last night.",
  2: 'midnight. snow is piled to the sill.',
  3: 'one in the morning. the cold is in the walls now.',
  4: 'two in the morning. the wind drops. everything is suddenly, completely still. you can see the trees again, and things are moving in them.',
  5: 'three in the morning. the wind comes back all at once.',
  6: 'four in the morning. almost.',
  7: 'the last hour of the fourth night. hold on.',
};

const HOUR_LINES_5 = {
  1: "eleven o'clock. the moon is huge and red, and everything is awake.",
  2: 'midnight. in the red light you can see footprints all the way around the cabin.',
  3: 'one in the morning. they are all out there tonight. all of them.',
  4: 'two in the morning.',
  5: 'three in the morning. the moon goes dark. the blood hour. open nothing.',
  6: 'four in the morning. the moon comes back, red as before.',
  7: 'five in the morning. they are here, all around the walls.',
};

const HOUR_LINES_3 = {
  1: "eleven o'clock. the wind screams around the cabin.",
  2: 'midnight. you can no longer see the trees.',
  3: 'one in the morning. she is at the window early, and the cold makes her quick.',
  4: 'two in the morning. the cold gets in everywhere.',
  5: 'three in the morning. the walls creak under the snow.',
  6: 'four in the morning. it has not let up at all.',
  7: 'the last hour of the third night. hold on.',
};

const decayTime = () => Math.max(7, 13 - hour() * 0.8) * (S.glassBroken && S.boards === 0 ? 0.8 : 1) * (S.grate ? 1.4 : 1) * (S.stove ? 1.25 : 1) * (blizzard() ? 0.8 : 1) * D().decay;   // the blizzard pulls the heat out of it

function updateNight(dt) {
  S.night += dt;
  const h = hour();
  const ch = clockHour();
  if (ch > S.hourSaid) { S.hourSaid = ch; say((S.nightNo >= 5 ? HOUR_LINES_5 : S.nightNo === 4 ? HOUR_LINES_4 : S.nightNo === 3 ? HOUR_LINES_3 : S.nightNo === 2 ? HOUR_LINES_2 : HOUR_LINES)[ch]); }
  if (S.night >= NIGHT_HOURS * HOUR) { startDawn(); return; }

  // the fire burns down, faster every hour
  if (S.fire > 0) {
    S.decay -= dt;
    if (S.decay <= 0) {
      S.fire -= 1;
      S.decay = decayTime();
      say(S.fire === 0 ? 'the fire is dead.' : `the fire is ${FIRE_NAMES[S.fire]}.`);
      if (S.fire === 0) {
        S.everOut = true;
        if (S.stranger === 'inside' && !S.strangerFalse) { S.ember = Math.max(0, (S.ember || 40) - 20); say('the stranger gasps as the fire goes out, and curls in on herself.'); }
      }
    }
  } else {
    S.deadFor += dt;
  }
  if (S.fire <= 1) S.darkTime += dt;
  else S.darkTime = Math.max(0, S.darkTime - dt * 3);

  // hunger: you have to keep eating all night
  S.hunger += dt * (0.62 + h * 0.03) * D().hunger * (S.sick > 0 ? 1.25 : 1) * (S.cold > 50 ? 1.3 : 1) * awakeMult([1, 1.15, 1.25, 1.35]);   // the cold burns through you, and so does no sleep
  if (S.hunger >= 70 && S.hungerSaid < 1) { S.hungerSaid = 1; sfx.growl(0.7); say('your stomach aches. you need to eat.'); }
  if (S.hunger >= 90 && S.hungerSaid < 2) { S.hungerSaid = 2; growlT = 6; sfx.growl(1); say("you're weak with hunger. your hands shake."); }
  if (S.hunger >= 90) {
    growlT -= dt;
    if (growlT <= 0) { sfx.growl(0.6 + (S.hunger - 90) / 20); growlT = 7 - (S.hunger - 90) * 0.4; }
  }
  if (S.hunger >= 100) { die('starve'); return; }
  S.rec.hungriest = Math.max(S.rec.hungriest || 0, S.hunger);
  S.rec.closest = Math.max(S.rec.closest, S.stalk);
  if (S.stalk > 40) nearMiss('grin', S.stalk / 100, `the grin ${Math.round(S.stalk)}% full`);
  if (S.dread > 40) nearMiss('dark', S.dread / 100, `the dark ${Math.round(S.dread)}% of the way in`);
  if (S.hunger > 82) nearMiss('hunger', (S.hunger - 70) / 30, `hunger at ${Math.round(S.hunger)}%`);

  updateCold(dt);
  if (mode !== 'playing') return;
  updateWet(dt);
  spoilMeat(dt);
  restockPile();
  updatePile(dt);
  updateBlaze(dt);
  if (mode !== 'playing') return;

  // raw meat makes you sick for a while
  if (S.sick > 0) {
    S.sick = Math.max(0, S.sick - dt);
    S.sickT -= dt;
    if (S.sickT <= 0 && S.sick > 4 && !S.away) { S.sickT = rand(12, 18); sfx.retch(); say(pick(['you double over, retching.', 'your stomach twists. cold sweat.', 'the room tilts. you hold on to the wall.'])); }
    if (S.sick === 0) say('the sickness finally passes.');
  }

  // meat on the fire cooks itself, as long as there is a fire
  if (S.cooking) {
    if (S.fire >= 1) {
      S.cooking.t -= dt;
      if (Math.random() < dt * 3) sfx.sizzle();
      if (S.cooking.t <= 0) {
        addCooked(S.cooking.n);
        say(`the meat is cooked. +${S.cooking.n} cooked meat`);
        S.cooking = null;
      }
    }
  }

  // dread: the dark gets closer when the fire is low
  const before = S.dread;
  if (S.fire === 0) S.dread += dt * (8 + h * 0.4);   // with the fire out, the dark has you in about ten seconds
  else if (S.fire === 1) S.dread += dt * (0.7 + h * 0.12);
  else S.dread = Math.max(0, S.dread - dt * 2.5);
  if (before < 50 && S.dread >= 50) say("they're getting bolder.");
  if (before < 80 && S.dread >= 80) say('something is right at the edge of the light.');
  if (S.dread > 60) {
    heartTimer -= dt;
    if (heartTimer <= 0) { sfx.heartbeat(S.dread / 100); heartTimer = 1.3 - (S.dread - 60) / 80; }
  }
  if (S.dread >= 100) { die('dark'); return; }

  // the blood lantern burns blood to stay lit
  if (S.lantern) {
    if (S.lanternLit) {
      S.lanternT -= dt;
      if (S.lanternT <= 0) {
        if (S.blood > 0) { S.blood -= 1; S.lanternT = 60; }
        else { S.lanternLit = false; say('the blood lantern sputters out. it needs blood.'); }
      }
    } else if (S.blood > 0) {
      S.blood -= 1; S.lanternLit = true; S.lanternT = 60;
      say('you pour blood into the lantern. it glows red again.');
    }
  }
  if (S.riseT > 0) {
    S.riseT -= dt;
    if (S.riseT <= 0) { die('risen'); return; }
  }
  // its interest in you fades once you are back inside
  if (!S.away) S.stalk = Math.max(0, S.stalk - dt * 12);

  updateHunter(dt);
  if (mode !== 'playing') return;
  updateTrip(dt);
  if (mode !== 'playing') return;
  updateHand(dt);
  if (mode !== 'playing') return;
  updateHatch(dt);
  if (mode !== 'playing') return;
  updateGoblins(dt);
  if (mode !== 'playing') return;
  updateBloodMoon(dt);
  if (mode !== 'playing') return;
  updateDoor(dt);
  updateAwake(dt);
  // the stranger warns you about the floor, once, early on the second night
  if (S.n2HintT > 0 && S.stranger === 'inside' && !dialog && !S.away) {
    S.n2HintT -= dt;
    if (S.n2HintT <= 0) {
      openDialogue({ id: 'hint', portrait: 'stranger', text: 'The stranger keeps looking at the floor. "There\'s a hatch under there, and something under the hatch. When the boards creak, slam it. If you go out, nail a beam across it first. And salt on the doorway will stop one of them. One."', choices: [{ label: 'nod', act: () => {} }] });
    }
  }
  // night 4: what happened at home
  if (S.n4HintT > 0 && S.stranger === 'inside' && !dialog && !S.away) {
    S.n4HintT -= dt;
    if (S.n4HintT <= 0) openDialogue({ id: 'hint', portrait: 'stranger', text: '"They came through the walls at home too," the stranger says. "The small ones first. Then all the rest, on the night the moon went red. I was the fire there. I went out." She looks at your fire for a long time.', choices: [{ label: 'nod', act: () => {} }] });
  }
  // night 3: she knows this weather
  if (S.n3HintT > 0 && S.stranger === 'inside' && !dialog && !S.away) {
    S.n3HintT -= dt;
    if (S.n3HintT <= 0) {
      openDialogue({ id: 'hint', portrait: 'stranger', text: 'The stranger watches the snow pile against the window. "I have seen this snow before," she says quietly. "The last time, it did not stop for three nights. Keep warm. Don\'t stay out there long."', choices: [{ label: 'nod', act: () => {} }] });
    }
  }
  updateStranger(dt);
}

/* --------------------------------------------------------- night 5: the blood moon */

// The snow stops and the moon comes up red. Every one of them comes, from every part of the woods, to the last fire
// still burning. Everything is awake from the start. Mimics stand on two feet now, so only the slot in the door shows
// their faces. From three to four the moon goes dark (the blood hour): open the door or even the slot and the thing in
// the trees reaches through. From five to six they try every way in at once: any door, window, cabinet or hatch left
// open and they pour in.
const bloodMoon = () => S.nightNo >= 5;
const bloodHour = () => bloodMoon() && clockHour() === 5;   // 3 to 4 am
const floodHour = () => bloodMoon() && clockHour() === 7;   // 5 to 6 am
const FLOOD_FROM = { door: { x: 274, y: 108 }, window: { x: 61, y: 66 }, cabinet: null, hatch: null };

function floodOpenings() {
  const o = [];
  if (door > 0.3) o.push('door');
  if (S.glassBroken && S.boards === 0) o.push('window');
  if (S.shed && !S.cabBar) o.push('cabinet');
  if (!S.hatchBar) o.push('hatch');
  return o;
}
const floodFrom = (k) => (k === 'cabinet' ? { x: CABINET.x + 10, y: CABINET.y + 20 } : k === 'hatch' ? { x: HATCH.x + HATCH.w / 2, y: HATCH.y + 4 } : FLOOD_FROM[k]);

function updateBloodMoon(dt) {
  if (!bloodMoon()) return;
  // the blood hour: the moon goes dark, the torches die and won't catch
  if (bloodHour() && !S.bloodSaid) {
    S.bloodSaid = true;
    const had = TORCHES.some((tc) => S.torches[tc.id] === true);
    for (const tc of TORCHES) if (S.torches[tc.id] === true) S.torches[tc.id] = 'out';
    sfx.recede();
    if (had) { sfx.hiss(); say("the red moon goes black. every torch in the cabin gutters out at once, and they won't catch again. not until four."); }
    if (S.stranger === 'inside' && !S.strangerFalse) say('the stranger grips your arm. "don\'t open anything. not the door, not the slot. not for anyone."');
  }
  // half past four: they're gathering
  if (S.night >= 6.5 * HOUR && !S.floodSaid) {
    S.floodSaid = true;
    sfx.scuttle();
    say(S.stranger === 'inside' && !S.strangerFalse ? 'the stranger is on her feet. "close everything," she says. "all of it. the door, the window, the cabinet, the hatch. they\'re coming."'
      : 'you can hear them out there now: hundreds of small feet, all around the cabin. close everything. the door, the window, the cabinet, the hatch.');
  }
  // five to six: one gap is all it takes
  if (floodHour()) {
    const o = floodOpenings();
    if (o.length) {
      S.floodT = (S.floodT || 0) + dt;
      if (S.floodT > 1) { S.floodFrom = o[0]; die('flood'); }
    } else S.floodT = 0;
  }
  // her, telling you what she is, early on the last night
  if (S.n5HintT > 0 && S.stranger === 'inside' && !dialog && !S.away) {
    S.n5HintT -= dt;
    if (S.n5HintT <= 0) {
      openDialogue({ id: 'hint', portrait: 'stranger', text: 'The stranger looks up at the red moon through the window. "They all come tonight," she says. "Every one of them, from every corner of the woods, to the last fire still burning. That\'s this one." Her eyes are very bright. "Keep it burning. Feed me if you can. At dawn I can end this, if I\'m strong enough."', choices: [{ label: 'nod', act: () => {} }] });
    }
  }
}

// what you see through the slot: the right face, or one that's almost right
const WRONG_FACES = [
  'the face is almost right. the eyes are too far apart.',
  'the face is almost right. there are no whites to its eyes at all.',
  'the face is almost right. the mouth goes on a little too long.',
  'the face is almost right. it blinks, sideways.',
];
function lookThroughSlot(v) {
  if (bloodHour()) { die('bloodHour'); return; }
  sfx.creak();
  const wrong = v.who === 'mimic' || v.who === 'ash';
  const face = v.who === 'ash' ? 'it is her hood and her cloak. there is nothing inside them but a dull red glow, like a fire nobody fed.'
    : wrong ? pick(WRONG_FACES) : 'a face, cold and tired. it looks right. it looks like a person.';
  let snatch = '';
  if (v.who === 'mimic' && Math.random() < 0.35) {
    // long fingers through the gap before you get it shut
    if (S.wood >= 2) { S.wood -= 2; snatch = ' fingers shoot through the slot and drag two logs out before you slam it. -2 wood'; }
    else if (anyMeat()) { takeMeat(); snatch = ' fingers shoot through the slot and snatch a piece of meat before you slam it. -1 meat'; }
    sfx.slam();
  }
  const key = v.as === 'woodcutter' ? 'woodcutter' : v.as === 'trader' ? 'trader' : 'stranger';
  openDialogue({
    id: 'knock', visit: { ...v, looked: true },
    portrait: wrong ? `${key}Wrong` : key,
    text: `You slide the slot open. ${face}${snatch}`,
    choices: [
      ...(noVisitors() ? [] : [{ label: 'open the door', act: () => openDoorFor(v) }]),
      { label: 'keep it shut', act: () => keepShut(v) },
    ],
  });
}

// the endings, decided at the fifth dawn by what she is and how strong she got
const ENDINGS = {
  keeper: { title: 'the keeper.', bonus: 500, text: 'Five nights, and your fire never once went out. At first light she kneels at your hearth and holds her hands to it, her eyes bright as coals. "You kept it," she says. "I have been looking for someone who would." She does not burn the woods. She gives you the fire. The things in the trees will remember this cabin and keep away from it. You were never going to leave. You are the keeper now.' },
  burning: { title: 'the burning.', bonus: 400, text: 'At first light she stands, and lets the cloak fall. There is nothing under it but fire. She walks out into the snow and the forest catches behind her: every tree, and every one of them in the trees, all of them that came for you tonight. You hear them burn until noon. The snow slides off the roof. When you finally walk out, the ground is bare and smoking, and the winter is over.' },
  lastEmber: { title: 'the last ember.', bonus: 200, text: 'She stands at first light, but she is so dim you can see the wall through her. "I don\'t have enough left," she says. "Not for all of it." She walks out into the clearing and burns, just there, just enough. The things at the edge of the trees scream and fall back. When it is over there is a ring of ash around the cabin, and nothing else of her. Beyond it the woods are still dark. You walk out alone.' },
  ash: { title: 'the ash.', bonus: 150, text: 'She came back with the blood moon and circled the cabin all night, calling you by a name you never told her. At dawn there is a ring of grey ash in the snow around the walls, and the woods are as dark as they ever were. You lived. You are still here.' },
  coldHearth: { title: 'the cold hearth.', bonus: 100, text: 'The sun comes up. The red moon goes down. Nothing changes. The woods are as dark as they were on the first night, and somewhere in them something is already waiting for dusk. As you stack the last of your wood, the snow begins again.\n\nnight 6.' },
};
function finalEnding() {
  const real = S.stranger === 'inside' && !S.strangerFalse;
  if (real && !S.everOut) return 'keeper';
  if (real) return (S.ember || 0) >= 50 ? 'burning' : 'lastEmber';
  if (S.herDied) return 'ash';
  return 'coldHearth';
}

// the blood moon over the room: a red cast all night, deep red in the blood hour, the moon itself in the window,
// and red outlines around anything left open as the end comes
function drawBloodMoon(s, t) {
  if (!bloodMoon() || (mode !== 'playing' && mode !== 'dawn')) return;
  const hourDark = bloodHour();
  lx.fillStyle = hourDark ? 'rgba(80, 0, 0, 0.4)' : 'rgba(110, 0, 0, 0.12)';
  lx.fillRect(0, 0, light.width, light.height);
  if (!S.curtainsShut) {
    throughWindow(s, () => {
      const mx = 69 * s, my = 40 * s, r = 4 * s;
      const g = lx.createRadialGradient(mx, my, 0, mx, my, r * 4);
      g.addColorStop(0, hourDark ? 'rgba(120, 0, 0, 0.5)' : 'rgba(220, 40, 30, 0.45)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      lx.fillStyle = g;
      lx.fillRect(mx - r * 4, my - r * 4, r * 8, r * 8);
      lx.fillStyle = hourDark ? 'rgba(8, 0, 0, 1)' : 'rgba(200, 40, 28, 0.95)';
      lx.beginPath(); lx.arc(mx, my, r, 0, Math.PI * 2); lx.fill();
      if (hourDark) { lx.strokeStyle = 'rgba(220, 30, 20, 0.9)'; lx.lineWidth = s * 0.6; lx.stroke(); }
    });
  }
  if (S.night >= 6.5 * HOUR && mode === 'playing') {
    const pulse = 0.5 + 0.5 * Math.sin(t * 8);
    lx.strokeStyle = `rgba(230, 30, 20, ${0.4 + 0.5 * pulse})`;
    lx.lineWidth = s;
    for (const k of floodOpenings()) {
      if (k === 'door') lx.strokeRect(257 * s, 51 * s, 34 * s, 61 * s);
      else if (k === 'window') lx.strokeRect(45 * s, 35 * s, 32 * s, 32 * s);
      else if (k === 'cabinet') lx.strokeRect(CABINET.x * s, CABINET.y * s, CABINET.w * s, CABINET.h * s);
      else lx.strokeRect(HATCH.x * s, HATCH.y * s, HATCH.w * s, HATCH.h * s);
    }
  }
}

// the flood: a stream of them through whatever was open, piling onto you
function deathFlood(s) {
  const from = floodFrom(S.floodFrom || 'door');
  for (let i = 0; i < 70; i++) {
    const k = clamp(lossT * 1.6 - i * 0.045, 0, 1);
    if (k <= 0) continue;
    const e = ease(k);
    const tx = 160 + (hash(i) - 0.5) * 90, ty = 176 - hash(i + 5) * 30 * e;
    drawGoblin(s, lerp(from.x, tx, e) + Math.sin(lossT * 12 + i) * 1.5, lerp(from.y, ty, e), lerp(0.9, 2.8, e), tx > from.x ? 1 : -1, 1);
  }
}

/* --------------------------------------------------------- night 4: the goblins */

// Small, rowdy, nimble things. From night 4 they come in two ways: at your heels when you come back from a trip, and,
// once there's a woodshed, through the cabinet in the wall from the shed, where they nest among the logs (the
// fuller the shed, the more often). A salted doorway or cabinet stops one (the salt goes); a plank across the
// cabinet keeps them out of it for good (and you out of the shed, until you take it off). Each one snatches
// something on the way in and hides in a dark corner (several can share one). Every so often one goes for the rack:
// up one side, slipping, across, and up the other; swat it before it gets there and it runs out the door. Light its
// corner and it moves; with nowhere dark left it pinches a torch out. Three inside at once, or the fire dying with
// one in the corner, and they come for you.
const GOB_CORNERS = { bl: { x: 12, y: 54 }, br: { x: 291, y: 56 }, fl: { x: 16, y: 160 }, fr: { x: 304, y: 160 } };
const GOB_MAX = 3;
const GOB_STEAL = () => rand(20, 30);
const GOB_CLIMB = 2.6;      // the whole climb to the rack; you can swat it until it grabs, at 2.0 s
const goblinNight = () => S.nightNo >= 4;
const cornerLit = (id) => (S.torches && S.torches[id] === true) || (id === 'br' && S.shed);
const darkCorners = () => Object.keys(GOB_CORNERS).filter((id) => !cornerLit(id));
const settled = () => S.goblins.filter((g) => g.corner);
const gobChance = (base) => base * (calm() ? 2 : 1);   // in the dead calm they're everywhere

// one gets in: through the door at your heels, or through the cabinet from the woodshed
function goblinEnter(via) {
  const free = darkCorners();
  const g = { corner: free.length ? pick(free) : null, t: 60, since: 0, act: null };   // a minute watching you first
  S.goblins.push(g);
  fx.push({ kind: 'gobIn', x: via === 'cabinet' ? CABINET.x + 10 : 274, y: via === 'cabinet' ? CABINET.y + 20 : 104, life: 0, max: 0.45 });
  if (via === 'cabinet') cabT = 0.8;
  sfx.scuttle();
  if (!g.corner) { achieve('nowhere_to_hide'); g.corner = snuffTorch(); }
  const took = goblinSteal(g, true);
  say(via === 'cabinet'
    ? `the cabinet doors bang open and something small drops out of the woodshed${took ? `, snatches ${took} off the rack` : ''} and is gone into a corner.`
    : `something brushed past your legs as you came in${took ? ` and snatched ${took} off the rack on its way to a corner` : ''}.`);
  if (S.goblins.length >= GOB_MAX) die('goblins');
}

// rolled once each time you come back in
function goblinEntry(panicked) {
  if (!goblinNight() || mode !== 'playing') return;
  if (Math.random() >= gobChance(0.1 + (panicked ? 0.05 : 0))) return;
  if (S.saltDoor) {
    S.saltDoor = false;
    sfx.scream();
    achieve('not_tonight');
    say('something small stops dead at the salt line behind you, and shrieks. the salt is scattered.');
    return;
  }
  goblinEnter('door');
}

// the nest in the woodshed: every so often one tries the cabinet
function updateCabinetGoblins(dt) {
  if (!goblinNight() || !S.shed) return;
  S.cabGobT = (S.cabGobT ?? 35) - dt;
  if (S.cabGobT > 0) return;
  S.cabGobT = rand(30, 45);
  if (Math.random() >= gobChance(0.15 + Math.min(0.45, S.shedWood / 150))) return;
  if (S.cabBar) { if (Math.random() < 0.4 && !S.away) { sfx.scratch(); say('something scratches at the plank over the cabinet, and gives up.'); } return; }
  if (S.saltCab) {
    S.saltCab = false;
    sfx.scream();
    achieve('not_tonight');
    if (!S.away) say('the cabinet doors rattle. something shrieks at the salt and scrabbles back into the woodshed. the salt is scattered.');
    return;
  }
  goblinEnter('cabinet');
}

// it pinches out a torch (relighting is free: carry it to the fire and back)
function snuffTorch(who = 'goblin') {
  const lit = TORCHES.filter((tc) => S.torches && S.torches[tc.id] === true);
  if (!lit.length) return null;
  const tc = pick(lit);
  S.torches[tc.id] = 'out';
  sfx.hiss();
  say(who === 'wind' ? `a gust through the window blows out the torch in ${tc.name}.` : `something leaps up the wall and pinches out the torch in ${tc.name}.`);
  return tc.id;
}

// one thing off the rack or the shelf: cured meat first, then cooked, raw, then blood. at once on the way in;
// otherwise it climbs for it, and you have until it gets there to swat it
function goblinSteal(g, now = false) {
  const what = STEAL_ORDER.find(([, has]) => has());
  if (!what) return '';
  if (now) {
    what[2]();
    g.act = { t: GOB_CLIMB - 0.6, to: what[3], done: true };   // just the drop back down
    sfx.scratch();
    return what[0] === 'blood' ? 'a jar of blood' : `a piece of ${what[0]}`;
  }
  g.act = { t: 0, to: what[3], done: false };
  sfx.scuttle();
  return what[0];
}

// swat it off the wall before it reaches the rack: it runs out the door
function swatGoblin() {
  if (mode !== 'playing' || S.away || dialog || doze > 0.15) return;
  const g = S.goblins.find((x) => x.act && !x.act.done);
  if (!g) return;
  S.goblins.splice(S.goblins.indexOf(g), 1);
  sfx.thump(0.8);
  sfx.scream();
  sfx.scuttle();
  fx.push({ kind: 'gobOut', from: { x: 205, y: 70 }, life: 0, max: 0.6 });
  doorTarget = 0.8; doorCloseIn = 0.6;
  if (blizzard()) S.room = Math.min(100, S.room + 4);
  say('you swat it off the wall. it hits the floor, shrieks, and bolts out the door.');
}
const climbing = () => S.goblins && S.goblins.some((g) => g.act && !g.act.done);

// unsettled ones slip out whenever the door opens
function goblinsLeave() {
  const n = S.goblins.filter((g) => !g.corner).length;
  if (!n) return;
  S.goblins = S.goblins.filter((g) => g.corner);
  sfx.scuttle();
  say(n === 1 ? 'something small darts out through the open door.' : `${n} small things dart out through the open door.`);
}

const STEAL_ORDER = [
  ['cured meat', () => curedCount() > 0, () => { const i = S.cookedLife.findIndex((l) => l >= CURED / 2); S.cookedLife.splice(i, 1); syncMeat(); }, 'meat'],
  ['cooked meat', () => S.cooked - curedCount() > 0, () => { const i = S.cookedLife.findIndex((l) => l < CURED / 2); S.cookedLife.splice(i, 1); syncMeat(); }, 'meat'],
  ['raw meat', () => S.meat > 0, () => takeRaw(1), 'meat'],
  ['blood', () => S.blood > 0, () => { S.blood -= 1; }, 'blood'],
];

function updateGoblins(dt) {
  updateCabinetGoblins(dt);
  if (mode !== 'playing') return;
  // the wind through a broken window with the curtains open puts a torch out now and then
  if (blizzard() && !calm() && S.glassBroken && !S.curtainsShut && S.boards === 0) {
    S.gustT = (S.gustT ?? 40) - dt;
    if (S.gustT <= 0) { S.gustT = rand(35, 55); if (TORCHES.some((tc) => S.torches[tc.id] === true)) { sfx.gust(); snuffTorch('wind'); } }
  }
  if (!S.goblins || !S.goblins.length) return;
  for (const g of S.goblins) {
    g.since += dt;
    if (g.act) {
      g.act.t += dt;
      if (!g.act.done && g.act.t >= 2.0) {
        // it made it to the rack
        g.act.done = true;
        const item = STEAL_ORDER.find(([, has]) => has());
        if (item) { item[2](); sfx.scratch(); if (!S.away) say(`it reaches the ${item[3] === 'blood' ? 'shelf' : 'meat rack'} and drops back down with ${item[0] === 'blood' ? 'a jar of blood' : `a piece of ${item[0]}`}.`); else S.gobTook = (S.gobTook || 0) + 1; }
      }
      if (g.act.t >= GOB_CLIMB) g.act = null;
    }
    // its corner got lit: it moves to another dark one, or puts a torch out
    if (g.corner && cornerLit(g.corner)) {
      const free = darkCorners();
      g.corner = free.length ? pick(free) : snuffTorch();
      sfx.scuttle();
      if (g.corner && free.length) say('something scuttles along the wall, out of the light, into another corner.');
    }
    if (!g.corner || g.act) continue;
    // every so often, one of them snuffs a torch just because it can
    if (Math.random() < dt / 40 && TORCHES.some((tc) => S.torches[tc.id] === true)) { const id = snuffTorch(); if (id) g.corner = id; }
    const bold = g.since > 2 * HOUR;
    if (bold || S.fire <= 2 || S.away) g.t -= dt;
    if (g.t <= 0) {
      g.t = bold ? rand(10, 15) : GOB_STEAL();
      const what = goblinSteal(g);
      if (what && !S.away) say('something is climbing the wall toward the meat rack.');
    }
  }
  // the fire is out and one is settled in: it doesn't wait for the dark
  if (S.fire === 0 && S.lit && settled().length && !S.away) die('guest');
}

// throwing salt at one: the ember over its corner
function saltGoblin(id, which = null) {
  const i = which ? S.goblins.indexOf(which) : S.goblins.findIndex((g) => g.corner === id);
  if (i < 0 || S.salt < 1) return;
  S.salt -= 1;
  S.goblins.splice(i, 1);
  sfx.scream();
  sfx.scuttle();
  fx.push({ kind: 'gobOut', from: GOB_CORNERS[id], life: 0, max: 0.6 });
  doorTarget = 0.8; doorCloseIn = 0.7;   // and out through the door
  say('you throw a fistful of salt into the corner. it shrieks and bolts for the door, and out into the snow.');
}

// A goblin: knee-high, hunched, all knees and elbows. A humped back with knobs of spine, a big head hung low and
// forward with long pointed ears and a hooked nose, a small grin full of teeth, long thin arms that reach the floor,
// bent little legs. Drawn as smooth strokes with a rim of light, facing right (face -1 flips it). Feet at (x, y).
const GOB_PAL = { black: '#14140f', rim: '#5a583e', nail: '#080604' };
function drawGoblin(s, x, y, sc = 1, face = 1, alpha = 1, eyes = true, pose = 'run') {
  const t = animT;
  const P = (dx, dy) => [x + dx * sc * face, y - dy * sc];
  const W = (...ws) => ws.map((w) => w * sc);
  const step = pose === 'run' ? Math.sin(t * 18) : 0;
  const climb = pose === 'climb';
  const legs = [-1, 1].map((side) => [P(-2 + side * 0.4, 4.6), P(-3.6 + side * step * 1.1, 2.4), P(-1.6 + side * step * 1.8, 0.2)]);
  const arm = (side) => climb
    ? [P(1.6, 8.4), P(3.2 + side * 0.6, 10.6), P(4 + side * 0.8, 13 + side * step)]
    : [P(1.4 + side * 0.3, 8.2), P(3.6 - side * step * 0.8, 5.2), P(5.2 + side * step * 1.4, 0.6)];
  const body = [P(-2.6, 4.6), P(-1.8, 7.6), P(1.4, 8.8)];
  const head = [P(4.0, 9.4), P(4.8, 9.0)];
  const ears = [[P(3.0, 10.8), P(0.6, 14.2)], [P(5.0, 11.0), P(7.6, 13.8)]];
  const nose = [P(6.6, 9.0), P(8.3, 8.0)];
  const parts = [
    [legs[0], W(1.6, 1.2, 1.0)], [arm(-1), W(1.2, 1.0, 0.7)],
    [body, W(5.0, 6.0, 4.4)], [legs[1], W(1.6, 1.2, 1.0)],
    [head, W(5.0, 4.6)], [ears[0], W(1.5, 0.25)], [ears[1], W(1.5, 0.25)], [nose, W(1.3, 0.5)],
    [arm(1), W(1.3, 1.1, 0.8)],
  ];
  lx.save();
  lx.globalAlpha = alpha;
  for (const [pts, ws] of parts) tubePass(s, pts, ws, GOB_PAL.rim, 0.4);
  for (const [pts, ws] of parts) tubePass(s, pts, ws, GOB_PAL.black, 0);
  // knobs of spine along the hump
  lx.fillStyle = GOB_PAL.rim;
  for (const [dx, dy] of [[-2.4, 7.4], [-1.4, 8.4], [-0.2, 9.0]]) { const [px1, py1] = P(dx, dy + 0.8); lx.beginPath(); lx.arc(px1 * s, py1 * s, 0.55 * sc * s, 0, Math.PI * 2); lx.fill(); }
  // claws on the hands
  lx.fillStyle = GOB_PAL.nail;
  for (const side of [-1, 1]) { const h = arm(side)[2]; for (let i = -1; i <= 1; i++) { lx.beginPath(); lx.arc((h[0] + i * 0.5 * sc) * s, (h[1] + 0.5 * sc) * s, 0.3 * sc * s, 0, Math.PI * 2); lx.fill(); } }
  // a small grin of pale teeth under the nose
  lx.fillStyle = `rgba(214, 206, 180, ${0.9})`;
  for (let i = 0; i < 4; i++) { const [tx, ty] = P(4.4 + i * 0.7, 7.9 - Math.abs(i - 1.5) * 0.15); lpx(s, tx - 0.2 * sc, ty, 0.4 * sc, 0.5 * sc); }
  if (eyes) {
    lx.fillStyle = 'rgba(220, 230, 170, 1)';
    for (const dx of [4.0, 5.6]) { const [ex, ey] = P(dx, 9.8); lpx(s, ex - 0.35 * sc, ey - 0.3 * sc, 0.7 * sc, 0.6 * sc); }
  }
  lx.restore();
}

// where a settled goblin's eyes are: its corner, a little apart from any others sharing it
function gobEyes(g) {
  const c = GOB_CORNERS[g.corner];
  const j = Math.max(0, S.goblins.filter((o) => o.corner === g.corner && !o.act).indexOf(g));
  return { x: c.x + (c.x < 160 ? 1 : -1) * j * 4, y: c.y - (j % 2) * 2.5 + j * 1.5, j };
}

function drawGoblins(s, t) {
  if (!S.goblins || !S.goblins.length) return;
  for (const g of S.goblins) {
    if (!g.corner) {
      // in plain view, skittering along the walls between the lit corners (it leaves when the door opens)
      const k = (t * 0.35 + S.goblins.indexOf(g) * 0.37) % 1;
      const x = 20 + 280 * (k < 0.5 ? k * 2 : 2 - k * 2), y = 112;
      drawGoblin(s, x, y, 1, k < 0.5 ? 1 : -1, 0.95);
      continue;
    }
    const c = GOB_CORNERS[g.corner];
    if (g.act) {
      // up one side of the rack, a slip, across, and up the other side; then back down to its corner
      const T = g.act.t, ty = g.act.to === 'blood' ? 64 : 52;
      let x, y, face = 1;
      if (T < 0.45) { const k = ease(T / 0.45); x = lerp(c.x, 196, k); y = lerp(c.y + 6, 112, k); face = c.x < 196 ? 1 : -1; }
      else if (T < 0.95) { const k = ease((T - 0.45) / 0.5); x = 196; y = lerp(112, 78, k); }
      else if (T < 1.2) { const k = (T - 0.95) / 0.25; x = 196; y = lerp(78, 104, k * k); }               // it slips
      else if (T < 1.5) { const k = ease((T - 1.2) / 0.3); x = lerp(196, 216, k); y = 106; }
      else if (T < 2.0) { const k = ease((T - 1.5) / 0.5); x = 216; y = lerp(106, ty, k); face = -1; }
      else { const k = ease((T - 2.0) / (GOB_CLIMB - 2.0)); x = lerp(216, c.x, k); y = lerp(ty, c.y + 6, k); face = c.x < 216 ? -1 : 1; }
      drawGoblin(s, x, y, 0.9, face, 0.95, true, T >= 0.45 && T < 0.95 || T >= 1.5 && T < 2.0 ? 'climb' : 'run');
      continue;
    }
    // in its corner only its eyes show, small and dim and low, blinking out of rhythm; more than one in a
    // corner sit a little apart, so you can count the pairs
    const { x: ex, y: ey, j } = gobEyes(g);
    const blink = Math.sin(t * 1.3 + c.x + j * 2.1) > 0.93 ? 0 : 1;
    lx.fillStyle = `rgba(200, 210, 160, ${0.55 * blink})`;
    lpx(s, ex - 1.5, ey, 0.8, 0.6);
    lpx(s, ex + 0.7, ey, 0.8, 0.6);
  }
}

/* --------------------------------------------------------- no sleep */

// Each day you skip sleep makes the next night worse. One: your eyes close now and then, and you're slow and hungrier. Two: you start hearing and seeing things that aren't there.
// Three: it hardly stops. A fourth: you don't make it to the first hour.
// While your eyes are shut you can't do anything at all: not even burn her back or slam the hatch.
const AWAKE_LINES = ['', "you didn't sleep. your eyes are heavy.", "two days without sleep. the edges of things won't hold still.", 'three days without sleep. you are not sure what is real anymore.'];
const lvl = () => Math.min(3, S.awake || 0);
const DOZE = [null, [15, 20, 2, 3], [10, 15, 3, 4], [7, 11, 4, 5]];   // gap min..max, length min..max (seconds)
const dozeGap = () => (lvl() ? rand(DOZE[lvl()][0], DOZE[lvl()][1]) : 99);
let dozeLen = 1.4;
const awakeMult = (list) => list[lvl()];

function updateAwake(dt) {
  const L = lvl();
  if (!L) return;
  // your eyes close: you can't act, and the dark doesn't wait
  S.dozeT -= dt;
  if (S.dozeT <= 0 && !S.away && !dialog) {
    S.dozeT = dozeGap();
    dozeLen = doze = rand(DOZE[L][2], DOZE[L][3]);
    say(pick(['your eyes close for a moment.', 'you jerk awake. how long was that?', 'your head drops. the room swims back.']));
  }
  if (L < 2) return;
  // the things that aren't there
  S.halT -= dt;
  if (S.halT <= 0) {
    S.halT = L >= 3 ? rand(6, 11) : rand(14, 24);
    hallucinate(L);
  }
  if (L >= 3) {
    S.howlT -= dt;
    if (S.howlT <= 0) { S.howlT = rand(4, 9); sfx.howl(); }   // it never stops howling
    if (!S.away && Math.random() < dt * 0.12) phantomEyes = rand(1.5, 3.5);   // its eyes, there and not there
    if (!S.away && Math.random() < dt * 0.05) phantomGrin = rand(0.6, 1.2);
  }
  if (Math.random() < dt / (L >= 3 ? 25 : 60)) sfx.whisper();
}

let phantomEyes = 0, phantomGrin = 0;

function hallucinate(L) {
  const roll = Math.random();
  if (roll < 0.3 && !pendingVisit && !dialog && !S.away && S.lit) {
    // a knock, footsteps and all, from nothing (the lantern would show no feet at all)
    queueVisit('phantom', pick(S.nightNo >= 2 ? ['woodcutter', 'trader', 'stranger'] : ['woodcutter', 'stranger']));
  } else if (roll < 0.5) {
    sfx.howl();
    say('a long, low howl from the trees. close.');
    if (L >= 3) phantomEyes = rand(2, 4);
  } else if (roll < 0.75 && hour() >= 1 && S.hand.phase === 'idle' && S.hand.t > 10) {
    // her, at the window, and not
    S.hand.realT = S.hand.t;
    S.hand.phantom = true;
    S.hand.phase = 'warn';
    S.hand.t = 4;
    sfx.scratch();
    say(S.boards ? 'something scrapes at the boards over the window.' : 'something is moving outside the broken window.');
  } else {
    sfx.whisper();
  }
}

/* --------------------------------------------------------- about to die */

// True only when something is about to kill you, not just take something from you: that's when the edges go red.
function aboutToDie() {
  const hd = S.hand, hc = S.hatch;
  if (S.away && S.hunter.near && S.stalk >= 78 && !S.spear) return true;                       // the grin, nearly full
  if (S.fire === 0 && S.dread >= 85) return true;                                              // the dark
  if (S.fire <= 1 && S.decay < 1.5 && S.goblins && settled().length) return true;              // a goblin, as the fire dies
  if (hd.phase === 'crawl' && !hd.phantom && S.boards === 0 && !S.saltWin && S.wood < HER_TOLL && hd.t < 1.6) return true;   // her, with nothing to take but you
  if (hc.phase === 'lift' && !hc.phantom && !S.hatchBar && !S.saltHatch && S.meat + S.cooked === 0 && S.stranger !== 'inside' && hc.t < 1.6) return true;   // the hatch, with nothing to take but you
  if (S.blaze > 0 && S.blaze < 2 && S.blood < 2) return true;                                  // the fire, with no blood to douse it
  if (floodHour() && (S.floodT || 0) > 0) return true;                                         // something is open at the end
  if (blizzard() && S.cold >= 92) return true;
  if (S.hunger >= 97) return true;
  return false;
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
    hn.t = rand(14, 22) * (1 + 0.25 * S.traps) * (S.carcass ? 1.6 : 1);
    sfx.howl();
    say(S.away ? 'a howl, very close. too close.' : 'a long, low howl from the trees. close.');
    if (S.stranger === 'inside' && !S.strangerFalse && !S.away) setTimeout(() => { if (S.hunter.near && mode === 'playing') say('the stranger, quietly: "not now. it\'s out there."'); }, 1800);
  } else {
    hn.t = rand(22, 40) * (1 - hour() * 0.06) * (S.carcass ? 0.7 : 1);
    sfx.recede();
    say('the howling moves off, deeper into the woods.');
  }
}

/* ------------------------------------------------------------- the blizzard: cold and wet wood */

// Out in the blizzard you get cold fast; by the fire you warm back up, faster the bigger it is.
// One trip chills you badly; two in a row could kill you.
const COLD_OUT = 6.5;                       // per second outside: one blizzard trip takes you most of the way
const DRY_TIME = 60;                        // seconds for a wet log to dry by a burning fire (faster by a big one)

// How cold the house is follows the fire: only a fire burning or roaring keeps it warm. A broken window lets the
// wind in (less through boards, none through shut curtains), insulation helps, and every time the door opens the
// cold rushes in.
const ROOM_FROM_FIRE = [92, 72, 45, 18, 4];
function roomTarget() {
  let t = ROOM_FROM_FIRE[S.fire] * (S.stove ? 0.85 : 1);
  if (S.glassBroken && !S.curtainsShut && !calm()) t += S.boards > 0 ? 6 : 16;
  if (S.insulated) t -= 12;
  return clamp(t, 0, 100);
}
// fur clothes: each piece slows how fast you get cold; the whole set makes you all but immune
const FUR_WEAR = { coat: 0.35, pants: 0.2, hat: 0.2, socks: 0.15 };
const furMult = () => 1 - Object.entries(FUR_WEAR).reduce((a, [k, v]) => a + (S[k] ? v : 0), 0);
// night 4, from 2 to 3 am: the storm drops to a dead calm
const calm = () => S.nightNo === 4 && clockHour() === 4;

function updateCold(dt) {
  if (!blizzard()) { S.cold = 0; S.room = 0; return; }
  const target = roomTarget();
  S.room += (target - S.room) * Math.min(1, dt * 0.35);
  let rate;
  if (S.away) {
    rate = COLD_OUT * furMult();
  } else if (S.cold > S.room) {
    rate = -(2.2 + (S.cold - S.room) * 0.04) * (S.stove ? 1.2 : 1);   // warming back up by the fire
  } else {
    rate = (S.room - S.cold) * 0.05 * (0.4 + 0.6 * furMult());        // the house's cold seeping into you
  }
  S.cold = clamp(S.cold + rate * dt, 0, 100);
  // snow drifts in under a broken window while the house is cold, and melts when it's warm
  if (S.glassBroken && !S.curtainsShut && S.room > 30) S.snowPile = Math.min(1, S.snowPile + dt / 140);
  else if (S.room < 15) S.snowPile = Math.max(0, S.snowPile - dt / 60);
  if (S.cold < 50) S.coldSaid = 0;
  if (S.cold >= 60 && S.coldSaid < 1) { S.coldSaid = 1; sfx.shiver(0.7); say("you're shaking with cold. your hands are slow and you're burning through food."); }
  if (S.cold >= 85 && S.coldSaid < 2) { S.coldSaid = 2; sfx.shiver(1); say("you can't feel your hands. get to the fire."); }
  if (S.cold >= 60 && Math.random() < dt * 0.25) sfx.shiver(0.4 + (S.cold - 60) / 80);
  if (S.cold > 70) nearMiss('cold', (S.cold - 55) / 45, `cold at ${Math.round(S.cold)}%`);
  if (S.cold >= 100) die('freeze');
}

function addWet(n) { for (let i = 0; i < n; i++) S.wet.push(DRY_TIME); }

// frozen logs thaw in the house (three times faster on the drying rack, eight at a time); the smoke under the
// roof thins out
function updateWet(dt) {
  if (S.wet.length > S.wood + S.shedWood) S.wet.length = S.wood + S.shedWood;   // used up first
  const heat = (0.3 + S.fire * 0.3) * (S.stove ? 1.3 : 1);   // out: barely dries; roaring: half again as fast
  S.wet = S.wet.map((t, i) => t - dt * heat * (S.rack && i < 8 ? 3 : 1)).filter((t) => t > 0);
  S.smoke = Math.max(0, S.smoke - dt / 30);
}

const wetInPile = () => Math.min(S.wet.length, S.wood);

/* ------------------------------------------------------------- food, wood and traps */

// Meat spoils: raw in about an hour of the night, cooked in about three. Salt-cured meat keeps. Every piece carries its own clock,
// oldest eaten first. S.meat and S.cooked are the counts the rest of the game reads.
const RAW_LIFE = 55, COOKED_LIFE = 170, CURED = 1e9;   // about one hour raw, three cooked
const PILE_CAP = 25;         // logs the room can hold in one pile
const SHED_CAP = 100;        // logs the woodshed outside can hold (less on hard and insane)
const shedCap = () => D().shedCap;

function syncMeat() { S.meat = S.rawLife.length; S.cooked = S.cookedLife.length; }
function addRaw(n = 1) { for (let i = 0; i < n; i++) S.rawLife.push(RAW_LIFE * D().spoil); syncMeat(); }
function addCooked(n = 1, life = COOKED_LIFE * D().spoil) { for (let i = 0; i < n; i++) S.cookedLife.push(life); syncMeat(); }
function takeRaw(n = 1) { S.rawLife.sort((a, b) => a - b).splice(0, n); syncMeat(); }
function takeCooked(n = 1) { S.cookedLife.sort((a, b) => a - b).splice(0, n); syncMeat(); }
const curedCount = () => S.cookedLife.filter((l) => l >= CURED / 2).length;
const spoilingSoon = (list) => list.some((l) => l < 20);

function spoilMeat(dt) {
  let raw = 0, cooked = 0;
  S.rawLife = S.rawLife.map((l) => l - dt).filter((l) => (l > 0 ? true : (raw += 1, false)));
  S.cookedLife = S.cookedLife.map((l) => (l >= CURED / 2 ? l : l - dt)).filter((l) => (l > 0 ? true : (cooked += 1, false)));
  if (raw + cooked) {
    syncMeat();
    const what = [raw && `${raw} raw`, cooked && `${cooked} cooked`].filter(Boolean).join(' and ');
    say(`${what} meat has gone bad. you throw it out into the snow.`);
  }
}

// The day is warm enough that anything not cured goes bad.
function spoilOverDay() {
  const before = S.meat + S.cooked;
  S.rawLife = [];
  S.cookedLife = S.cookedLife.filter((l) => l >= CURED / 2);
  syncMeat();
  return before - S.meat - S.cooked;
}

// Wood comes in through here: the pile first, then the shed if you have one, otherwise the pile grows past
// what it can hold, leans, and topples into the fire.
function addWood(n) {
  S.wood += n;
  if (S.shed && S.wood > PILE_CAP) {
    const over = Math.min(S.wood - PILE_CAP, shedCap() - S.shedWood);
    S.shedWood += over;
    S.wood -= over;
    if (S.shedWood >= SHED_CAP) achieve('full_shed');   // all 100: only possible on normal
    if (over > 0) cabT = 1.4;
  }
}

// With a woodshed, the pile restocks itself from the shed whenever it runs low.
function restockPile() {
  if (!S.shed || S.cabBar || S.shedWood <= 0 || S.wood > PILE_CAP - 5) return;   // a few logs at a time, not one per stoke
  const n = Math.min(S.shedWood, PILE_CAP - S.wood);
  S.shedWood -= n;
  S.wood += n;
  if (blizzard()) addWet(n);   // in the blizzard the woodshed's logs come in frozen too
  cabT = 1.4;
  sfx.thump(0.3);
}

let pileLean = -1;           // seconds until an overfull pile topples

function updatePile(dt) {
  if (S.wood <= PILE_CAP) { pileLean = -1; return; }
  if (pileLean < 0) {
    pileLean = 3;
    sfx.creak();
    say('the wood pile is too tall. it leans toward the fire.');
  }
  pileLean -= dt;
  if (pileLean <= 0) topplePile();
}

function topplePile() {
  pileLean = -1;
  const fell = Math.min(S.wood, S.wood - PILE_CAP + 4 + Math.floor(Math.random() * 4));
  S.wood -= fell;
  S.fire = 4;
  S.decay = decayTime();
  S.blaze = 9;
  shake = 0.6;
  sfx.crack();
  sfx.thump(1);
  for (let i = 0; i < 30; i++) spawnEmber(true);
  say(`the pile topples. ${fell} logs crash into the fire and it roars up toward the roof. put it out!`);
}

function updateBlaze(dt) {
  if (!(S.blaze > 0)) return;
  S.blaze -= dt;
  if (Math.random() < dt * 8) sfx.crackle(4);
  if (S.blaze <= 0) { S.blaze = 0; die('burn'); }
}

// A last resort nobody tells you about: with the fire down to embers and the dark closing in, throw salt on it.
// It flares blue-white, the eyes scatter, and the fire catches again.
const saltFlareReady = () => mode === 'playing' && S.lit && !S.away && !dialog && doze <= 0.15 && S.fire <= 1 && S.dread >= 45 && S.salt >= 2;
let flareT = 0;
let blueT = 0;        // seconds the fire burns blue after salt (it fades back over the last two)
const BLUE = () => clamp(blueT / 2, 0, 1);

function saltFlare() {
  if (!saltFlareReady()) return;
  S.salt -= 2;
  S.fire = Math.max(S.fire, 2);
  S.decay = decayTime();
  S.deadFor = 0;
  S.dread = Math.max(0, S.dread - 70);
  for (const e of eyes) e.out = true;
  flareT = 1.4;
  blueT = 10;
  shake = 0.3;
  sfx.hiss();
  sfx.gust();
  for (let i = 0; i < 30; i++) spawnEmber(true);
  achieve('salt_flare');
  say('you throw salt on the embers. they flare blue-white, and the eyes scatter. the fire catches again.');
}

function douse() {
  if (!(S.blaze > 0) || mode !== 'playing' || S.away || dialog || doze > 0.15) return;
  if (S.blood < 2) { say("you don't have enough blood to throw on it. two jars, at least."); return; }
  S.blood -= 2;
  nearMiss('blaze', 1 - S.blaze / 9, `put out the blaze with ${S.blaze.toFixed(1)} s to spare`);
  achieve('doused');
  S.blaze = 0;
  S.fire = 2;
  S.decay = decayTime();
  sfx.hiss();
  spawnSmoke(160, 126);
  spawnSmoke(156, 130);
  say('you throw the blood on the flames. they hiss, black and stinking, and sink back.');
}

// Traps wear out: each catches a few times, and sometimes something tears one apart.
function makeTrap() { return 3 + Math.floor(Math.random() * 2); }
function syncTraps() {
  S.traps = S.trapUses.length;
  S.trapSalt = (S.trapSalt || []).slice(0, S.traps);
  while (S.trapSalt.length < S.traps) S.trapSalt.push(false);
}
const saltedTraps = () => (S.trapSalt || []).filter(Boolean).length;

function checkTraps(rolls = 1, mult = D().traps) {
  let m = 0, b = 0, broke = 0, f = 0;
  syncTraps();
  for (let r = 0; r < rolls; r++) {
    const uses = [], salt = [];
    S.trapUses.forEach((u, i) => {
      const salted = S.trapSalt[i];
      const caughtMeat = Math.random() < (salted ? 0.6 : 0.3) * mult, caughtBlood = Math.random() < (salted ? 0.6 : 0.3) * mult;   // salt draws them in
      if (caughtMeat) m += 1;
      if (caughtBlood) b += 1;
      if (S.nightNo >= 2 && Math.random() < (salted ? 0.3 : 0.15)) f += 1;   // from the second night, now and then a pelt
      const left = u >= 999 ? u : u - (caughtMeat || caughtBlood ? 1 : 0) - (Math.random() < 0.08 ? 99 : 0);   // an iron trap never wears out
      if (left > 0) { uses.push(left); salt.push(salted); } else broke += 1;   // a broken trap takes its salt with it
    });
    S.trapUses = uses;
    S.trapSalt = salt;
  }
  syncTraps();
  if (m) addRaw(m);
  S.blood += b;
  S.fur += f;
  if (broke) { sfx.trapSnap(); trapWreck = 25; shake = Math.max(shake, 0.25); }
  return { m, b, broke, f };
}

/* ------------------------------------------------------------- the trader */

// A tall man in a long coat, once a night from midnight. He opens the coat and his goods hang inside it.
const SHOP = [
  { id: 'grate', name: 'iron fire grate', price: { blood: 3, cooked: 1 }, desc: 'the fire burns down much slower.', has: () => S.grate || S.stove,
    buy: () => { S.grate = true; S.decay = decayTime(); return 'he sets an iron grate over your fire pit. it fits perfectly. you did not see him measure it.'; } },
  { id: 'shoes', name: 'snowshoes', price: { blood: 2, cooked: 2 }, desc: 'every trip out is faster.', has: () => S.shoes,
    buy: () => { S.shoes = true; return 'he hands you a pair of bent-wood snowshoes, still warm from his coat.'; } },
  { id: 'spear', name: 'bone spear', price: { blood: 3 }, desc: 'if the thing in the trees catches you, you get away. once.', has: () => S.spear,
    buy: () => { S.spear = true; return 'he gives you a spear of long, yellowed bone. he does not say what it came from.'; } },
  { id: 'stove', name: 'iron stove', price: { blood: 5, cooked: 2 }, desc: 'your fire in an iron box with a chimney pipe. it cooks faster, warms you more and burns longer, but it throws less light.',
    has: () => S.stove, avail: () => S.nightNo >= 2,
    buy: () => { S.stove = true; S.grate = false; S.decay = decayTime(); return 'he and you wrestle an iron stove over the fire pit and fit the pipe through the roof. the room goes dimmer, and warmer.'; } },
  { id: 'charm', name: 'bone charm', price: { blood: 3, cooked: 2 }, desc: 'for the rest of tonight, the thing in the trees takes seven seconds to catch you instead of four. it crumbles at dawn.',
    has: () => S.charm, avail: () => true,
    buy: () => { S.charm = true; return 'he ties a charm of knotted finger bones around your wrist. it is warm, like it has a pulse.'; } },
  { id: 'ironTrap', name: 'iron trap', price: { blood: 5 }, desc: 'a heavy iron trap that never wears out and never breaks. it takes the place of your next trap. (insane only)',
    has: () => S.trapUses.some((u) => u >= 999) || S.traps >= trapMax(), avail: () => !!D().trader,
    buy: () => { S.trapUses.push(999); syncTraps(); return 'he sets down an iron trap so heavy you can barely lift it. it will outlast you.'; } },
  { id: 'meat', name: 'smoked meat', price: { blood: 1, wood: 2 }, desc: 'two strips of smoked meat, wrapped in cloth. +2 cooked meat.',   // on insane: just the logs
    has: () => (S.traderMeatN || 0) >= D().traderMeat, avail: () => D().traderMeat > 0,
    buy: () => { S.traderMeatN = (S.traderMeatN || 0) + 1; addCooked(2); return 'he unwraps two strips of dark smoked meat. you do not ask what it was. +2 cooked meat'; } },
  { id: 'salt', name: 'a bag of salt', price: { blood: 1 }, desc: '3 salt. cures cooked meat so it keeps.', has: () => false,
    buy: () => { S.salt += 3; return 'he pours salt from a pocket that should not be that deep. +3 salt'; } },
];

// on insane he charges a jar of blood less for everything (never less than one thing)
const shopPrice = (w) => {
  if (!D().trader || !w.price.blood) return w.price;
  const pr = { ...w.price, blood: w.price.blood - 1 };
  if (pr.blood <= 0) delete pr.blood;
  return Object.keys(pr).length ? pr : w.price;
};
const priceText = (p) => Object.entries(p).map(([k, n]) => `${n} ${k === 'cooked' ? 'cooked meat' : k}`).join(' + ');
const canPay = (p) => Object.entries(p).every(([k, n]) => S[k] >= n);
function pay(p) {
  for (const [k, n] of Object.entries(p)) {
    if (k === 'cooked') takeCooked(n);
    else if (k === 'meat') takeRaw(n);
    else S[k] -= n;
  }
}

function openShop(first) {
  visitorAtDoor = 'trader';
  if (first) S.traderMeatN = 0;   // his smoked meat: so much a visit
  const wares = SHOP.filter((w) => !w.has() && (!w.avail || w.avail()));
  openDialogue({
    id: 'shop', portrait: 'trader', door: true,
    text: (first
      ? 'A tall man in a long gray coat fills the doorway, hat low over his eyes. He opens the coat. Things hang from hooks along the lining, more than should fit. "Take your time."'
      : '"Anything else?" The coat stays open.'),
    choices: [
      ...wares.map((w) => ({
        key: w.id,
        label: `${w.name}: ${priceText(shopPrice(w))}`,
        desc: w.desc,
        can: () => canPay(shopPrice(w)),
        act: () => { pay(shopPrice(w)); S.rec.bought = (S.rec.bought || 0) + 1; sfx.chime(); say(w.buy()); openShop(false); },
      })),
      { key: 'leave', label: 'nothing, thank you', act: () => say('he closes his coat, tips his hat, and walks back into the snow. his footprints stop a little way from the door.') },
    ],
  });
}

/* ------------------------------------------------------------- trips */

function startTrip(kind) {
  if (!canAct() || S.away || !S.lit) return;
  const slow = (S.hunger >= 90 ? 1.3 : 1) * (S.sick > 0 ? 1.3 : 1) * awakeMult([1, 1.2, 1.3, 1.4]) * (S.shoes && kind !== 'shed' ? 0.7 : 1) * (S.cold >= 60 ? 1.15 : 1);
  // the woodshed: you take out what wood you have (up to what it still needs) and build log by log
  const logs = kind === 'shed' ? Math.min(S.wood, PILE_CAP - S.shedBuilt) : 0;
  if (kind === 'shed' && logs < 1) { say('you need wood to build with.'); return; }
  const total = TRIPS[kind].time * slow * (kind === 'shed' ? logs : 1) * (blizzard() ? 1.5 : 1) + (lvl() >= 3 ? 2 : 0);
  // if it is already out there when you leave, there is no head start
  S.away = { kind, t: total, total, startedNear: S.hunter.near, logs, placed: 0,
    stumble: blizzard() && kind !== 'drag' && Math.random() < 0.04 ? rand(1, total * 0.7) : -1,
    doom: blizzard() && kind !== 'drag' && Math.random() < 1 / 2500 ? rand(1, total * 0.8) : -1 };   // never found: about one blizzard night in a hundred
  S.stalk = 0;   // the four seconds always start from the moment you step out
  swingDoor();
  if (kind !== 'drag') S.rec.trips += 1;
  toggleBuild(false);
  say(kind === 'wood' ? 'you slip out into the trees for wood.'
    : kind === 'shed' ? `you carry ${logs} log${logs === 1 ? '' : 's'} out to the woodshed. run back whenever you need to; what you build stays built.`
        : 'you drag her body out through the door, into the snow.');
  save();
}

// out and back in: the door swings open for a moment and shuts behind you (it doesn't change the trip time)
function swingDoor() {
  goblinsLeave();
  if (blizzard()) S.room = Math.min(100, S.room + 8);   // the cold rushes in
  if (pendingVisit || dialog) return;
  doorTarget = 0.8;
  doorCloseIn = 0.5;
}

function runBack() {
  if (!S.away || mode !== 'playing') return;
  if (S.away.kind === 'drag') { say("you can't leave her here. you keep dragging."); return; }
  closeCallScare();
  swingDoor();
  if (S.away.kind === 'shed') {
    const back = S.away.logs - S.away.placed;   // logs only leave the pile as they go into the walls
    S.away = null;
    say(`you run back in${back ? ` with the ${back} log${back === 1 ? '' : 's'} you hadn't used` : ''}. the woodshed is ${S.shedBuilt} of ${PILE_CAP} logs built.`);
    goblinEntry(true);
    announceWaiting();
    return;
  }
  S.away = null;
  say('you run back inside empty-handed and bar the door.');
  goblinEntry(true);   // in a hurry, you don't look behind you
  announceWaiting();
}

function updateTrip(dt) {
  const a = S.away;
  if (!a) return;
  a.t -= dt;
  // very rarely (about one blizzard night in a hundred) you lose the path and never find it again
  if (a.doom > 0 && a.total - a.t >= a.doom) { die('lost'); return; }
  // lost in the white for a moment: a rare stumble that costs a few seconds out there
  if (a.stumble > 0 && a.total - a.t >= a.stumble) {
    a.stumble = -1;
    a.t += 2.5;
    a.total += 2.5;
    sfx.gust();
    sfx.thump(0.4);
    say('you lose the path for a moment in the white.');
  }
  if (a.kind === 'shed') {
    // a log goes into the walls every SHED_LOG_TIME seconds of the trip
    const due = Math.min(a.logs, Math.floor(((a.total - a.t) / a.total) * a.logs + 1e-6));
    while (a.placed < due) { a.placed += 1; S.wood -= 1; S.shedBuilt += 1; }
  }
  // the thing in the trees: once it is close, its grin fills in four seconds, every time.
  // a howl while you're already out gives you a moment to run first; leaving while it's close does not.
  if (hour() >= 1) {
    const close = S.hunter.near && (a.startedNear || S.hunter.since > 2.5);
    // four seconds, or seven with the bone charm; leave while it's already out there and the first half comes almost at once
    if (close) S.stalk += dt * (S.charm ? 100 / 7 : 25 * D().grin) * (a.startedNear && S.stalk < 50 ? 8 : 1);
    else S.stalk = Math.max(0, S.stalk - dt * 4);
    if (S.stalk >= 100) {
      if (S.spear) {
        // you drive the spear into it; it drags itself off into the trees, and you hurry to finish
        S.spear = false;
        S.stalk = 0;
        S.hunter.near = false;
        S.hunter.t = 45;
        a.startedNear = false;
        a.t *= 0.5;
        shake = 0.5;
        sfx.thump(1);
        sfx.growl(1.6);
        spawnSpear();
        achieve('bone_spear');
        say('it lunges. you drive the bone spear into it. it shrieks and drags itself back into the trees, the spear still in it. you hurry.');
        return;
      }
      die('hunter');
      return;
    }
  }
  if (a.t <= 0) { finishTrip(a.kind); announceWaiting(); }
}

function finishTrip(kind) {
  closeCallScare();
  S.away = null;
  swingDoor();
  if (S.gobTook) { say(`while you were out, something took ${S.gobTook} thing${S.gobTook === 1 ? '' : 's'} off the rack and the shelf.`); S.gobTook = 0; }
  goblinEntry(false);
  if (mode !== 'playing') return;
  if (kind === 'shed') {
    if (S.shedBuilt >= PILE_CAP) {
      S.shed = true;
      sfx.chime();
      say('the woodshed stands against the outside wall. extra wood goes in it now, and comes back in when the pile runs low.');
    } else {
      say(`you come back in. the woodshed is ${S.shedBuilt} of ${PILE_CAP} logs built.`);
    }
    save();
    return;
  }
  if (kind === 'drag') {
    S.carcass = true;
    say('you leave her far from the door and run back. the smell of her will carry through the trees.');
    save();
    return;
  }
  const parts = [];
  const n = Math.max(1, Math.round((S.axe ? pick([5, 6, 6, 6, 7]) : pick([3, 4, 4, 4, 5])) * D().wood));   // the same forest all night; more with a real axe
  addWood(n);
  if (blizzard()) addWet(n);
  parts.push(blizzard() ? `+${n} frozen wood` : `+${n} wood`);
  // traps are checked on the way back
  const caught = checkTraps();
  if (caught.m) parts.push(`+${caught.m} raw meat from the traps`);
  if (caught.b) parts.push(`+${caught.b} blood from the traps`);
  if (caught.f) parts.push(`+${caught.f} fur`);
  if (caught.broke) parts.push(caught.broke === 1 ? 'one trap is torn apart. you drag what is left of it inside' : `${caught.broke} traps are torn apart`);
  const lead = pick(['you come back with an armful of branches.', 'snapped limbs, half buried in snow.', 'you drag a fallen branch back inside.']);
  say(`${lead} ${parts.join(', ')}`.trim());
  save();
}

/* ------------------------------------------------- the thing at the window */

// She comes for the window from 1 am. On her first visit she always breaks the glass (the boards are on the
// inside). Bare window: she climbs in. Boarded window: she hooks a board and pulls until you burn her, or she
// tears it off, reaches all the way to your wood pile and drags logs out.
const nextHand = () => rand(26, 42) * (1 - (hour() - 3) * 0.08);
const BOARD_ROWS = [[37, 5], [48, 6], [59, 5]];
const STEAL_TIME = 2.4;
const HER_TOLL = 10;      // logs she takes through a bare window; without them, it's you
const TEAR_EACH = 0.75;   // seconds per board as she rips them all off

function breakGlass() {
  S.glassBroken = true;
  sfx.shatter();
  shake = 0.45;
  spawnShards();
  say(S.boards > 0 ? 'the window glass explodes inward, behind the boards. the wind comes in.' : 'the window glass explodes inward. the wind comes in.');
}

function updateHand(dt) {
  const hd = S.hand;
  if (hour() < 3 && hd.phase === 'idle') return;
  hd.t -= dt;
  if (hd.phase === 'idle') {
    if (hd.t <= 0) {
      hd.phase = 'warn';
      hd.t = 4;
      sfx.scratch();
      say(!S.glassBroken ? 'something scrapes slowly down the window glass.' : S.boards ? 'something scrapes at the boards over the window.' : 'something is moving outside the broken window.');
    }
  } else if (hd.phase === 'warn') {
    // her first visit: the glass goes partway through her arrival, boards or not (not when she isn't real)
    if (!S.glassBroken && hd.t <= 1.8 && !hd.phantom) breakGlass();
    if (hd.t <= 0) {
      if (S.boards > 0) {
        hd.phase = 'reach';
        hd.total = hd.t = Math.max(3.2, 5.5 - (hour() - 3) * 0.45) * (blizzard() ? 0.7 : 1) * (S.nails ? 1.35 : 1) * D().quick * (S.curtainsShut ? 0.6 : 1);   // through shut curtains you see her late   // nails make her work longer
        hd.beat = 0;
        say('a long black hand punches through a gap in the boards and takes hold.');
      } else {
        hd.phase = 'crawl';
        hd.total = hd.t = 3;
        say(S.away ? 'something is climbing in through the window, back at the house.' : 'she is climbing in through the window.');
      }
    }
  } else if (hd.phase === 'reach') {
    hd.p = 1 - hd.t / hd.total;
    // the rhythm of her pulling at the board, faster as it gives
    hd.beat -= dt;
    if (hd.beat <= 0) { sfx.thump(0.7 + hd.p * 0.6); hd.beat = 0.62 - hd.p * 0.28; hd.jerk = 0.18; }
    hd.jerk = Math.max(0, (hd.jerk || 0) - dt);
    if (hd.t <= 0) { if (hd.phantom) endPhantom(); else handTimeout(); }
  } else if (hd.phase === 'tear') {
    // she rips the boards off one by one and drags them out with her
    hd.beat -= dt;
    if (hd.beat <= 0 && S.boards > 0) {
      const row = BOARD_ROWS[S.boards - 1];
      S.boards -= 1;
      S.rec.boardsLost += 1;
      spawnBoardOut(row);
      sfx.crack();
      shake = 0.25;
      hd.beat = TEAR_EACH;
    }
    if (S.boards === 0 && hd.beat <= TEAR_EACH * 0.4) {
      S.boardsBuilt = false;
      hd.phase = 'idle';
      hd.t = nextHand();
      say('she drags the boards out through the window and is gone. the window is bare. next time she will come in.');
    }
  } else if (hd.phase === 'crawl') {
    hd.p = 1 - hd.t / hd.total;
    // nailing boards up in time still saves you
    if (S.boards > 0) {
      hd.phase = 'reach';
      hd.total = hd.t = 3.5 * (blizzard() ? 0.7 : 1);
      hd.beat = 0;
      say('you get the boards up just in time. she claws at them.');
    } else if (hd.t <= 0 && hd.phantom) {
      endPhantom();
    } else if (hd.t <= 0) {
      if (S.saltWin) saltRepels();
      else if (S.wood >= HER_TOLL) {
        // she is in up to the waist; there is nothing to burn her back with that she won't take. she takes the wood
        hd.phase = 'steal';
        hd.t = STEAL_TIME;
        hd.took = false;
        hd.got = 0;
        hd.want = HER_TOLL;
        hd.gripY = 56;
        sfx.scratch();
        say(S.away ? 'back at the house, something is dragging logs out through the bare window.' : 'she hangs in through the bare window and reaches past you for the wood.');
      } else die(S.away ? 'handAway' : 'hand');
    }
  } else if (hd.phase === 'steal') {
    // she takes the logs at the moment her hand closes on the pile
    if (!hd.took && hd.t <= STEAL_TIME - 1.2) {
      hd.took = true;
      const n = Math.min(S.wood, hd.want || 0);
      S.wood -= n;
      hd.got = n;
      say(`she drags ${n} logs out through the window and is gone. -${n} wood`);
    }
    if (hd.t <= 0) { hd.phase = 'idle'; hd.t = nextHand(); }
  } else if (hd.t <= 0) {
    hd.phase = 'idle';
    hd.t = nextHand();
  }
}

// a her that was never there fades out of the window, and the real one's clock picks up where it was
function endPhantom() {
  const hd = S.hand;
  hd.phantom = false;
  hd.phase = 'idle';
  hd.t = Math.max(6, hd.realT || nextHand());
  say('the window is empty. it was always empty.');
}

function strikeHand() {
  const hd = S.hand;
  if (hd.phase !== 'reach' || S.away || dialog || mode !== 'playing' || doze > 0.15) return;
  if (S.wood < 1 || S.fire < 1) { say('you need a burning branch. there is no fire to take one from.'); return; }
  S.wood -= 1;
  if (hd.phantom) {
    hd.phantom = false;
    hd.phase = 'idle';
    hd.t = Math.max(6, hd.realT || nextHand());
    spawnBurn(handGrip().x + 3, handGrip().y + 1);
    sfx.hiss();
    say('you jam the burning branch into the gap. there is nothing there. there was never anything there.');
    return;
  }
  nearMiss('her', 1 - hd.t / hd.total, `burned her back with ${hd.t.toFixed(1)} s to spare`);
  if (hd.t < 0.5) achieve('by_a_hair');
  hd.phase = 'retreat';
  hd.t = 0.9;
  S.rec.burned += 1;
  if (S.rec.burned >= 5) achieve('burned_five');
  sfx.hiss();
  sfx.scream();
  const g = handGrip();
  spawnBurn(g.x + 3, g.y + 1);
  say('you jam a burning branch into her hand. she shrieks and snatches it back, smoking.');
}

function saltRepels() {
  const hd = S.hand;
  S.saltWin = false;
  hd.phase = 'retreat';
  hd.t = 0.9;
  sfx.hiss();
  sfx.scream();
  spawnSmoke(60, 66);
  say('her hand touches the salt on the sill. she shrieks and recoils. the salt line is gone.');
}

function handTimeout() {
  const hd = S.hand;
  if (S.saltWin) { saltRepels(); return; }
  // not burned in time: every board comes off
  hd.phase = 'tear';
  hd.beat = 0;
  sfx.scream();
  say('she gets both hands into the gap and pulls. the boards are coming off.');
}

// Where her hand holds on: the gap just above the lowest board still standing.
function handGrip() {
  const row = BOARD_ROWS[Math.max(0, S.boards - 1)];
  return { x: 57, y: Math.max(36, row[0] - 3), board: row };
}

/* --------------------------------------------------------- the door */

function realPool() {
  const h = hour();
  const pool = [];
  if (h >= (D().trader ? 1 : 2) && S.traderTonight && !S.traderCame) pool.push('trader');
  if (h >= 1 && S.cutterVisits < 3) pool.push('woodcutter');
  return pool;
}

const MIMIC_CHANCE = [0, 0, 0.3, 0.38, 0.45, 0.5, 0.55, 0.6];
const WALKS_FROM = 5;   // from 3 am some mimics fake footsteps; only the blood lantern tells

// Knocks are rare: the stranger, the woodcutter, the trader, and the things that sound like them.
function updateDoor(dt) {
  if (pendingVisit || dialog || !S.lit) return;
  S.doorT -= dt;
  if (S.doorT > 0) return;
  const h = hour();
  S.doorT = rand(45, 70) * (1 - h * 0.04);
  if (S.firstVisit) { S.firstVisit = false; queueVisit('stranger'); return; }
  // the blood hour: knock after knock, in voices you trust. none of them is anything you want
  if (bloodHour()) { S.doorT = rand(10, 16); queueVisit('blood', pick(['woodcutter', 'trader', 'stranger']), true); return; }
  // her, come back as ash, if she died
  if (bloodMoon() && S.herDied && Math.random() < 0.35) { queueVisit('ash', 'stranger'); return; }
  const pool = realPool();
  if (Math.random() < MIMIC_CHANCE[h] + (h >= 2 ? D().mimic : 0)) {
    // it copies a voice you'd open the door for. from night 2 it knows the trader's, too
    const looks = ['woodcutter'];
    if (S.nightNo >= 2) looks.push('trader');
    if (S.stranger !== 'none') looks.push('stranger', 'stranger');
    queueVisit('mimic', pick(looks), (h >= WALKS_FROM && Math.random() < 0.6) || lvl() >= 2);   // two days awake, every one seems to walk up
  } else if (pool.length) {
    queueVisit(pick(pool));
  }
}

function queueVisit(who, as = who, fake = false) {
  const real = who !== 'mimic' && who !== 'blood';
  // under the door, in the lantern's light, people stand on two feet. a mimic gets it wrong: one, or three.
  // what you only imagine has no feet at all
  pendingVisit = { who, as, fake, feet: who === 'phantom' ? 0 : real || bloodMoon() ? 2 : pick([1, 3]), t: real || fake ? 3.2 : 0.9, away: !!S.away };
  if (S.away) return;   // you can't hear footsteps from the trees; the snow will tell you when you're back
  if (real || fake) {
    sfx.footsteps();
    say('footsteps crunch through the snow, up to the door.');
  }
}

// Back from a trip with someone at the door: the snow shows whether anything walked up.
function announceWaiting() {
  const v = pendingVisit;
  if (!v || !v.away || S.away || mode !== 'playing') return;
  v.away = false;
  v.t = 1.6;
  say(v.who !== 'mimic' || v.fake
    ? 'fresh footprints lead up to the door. someone is waiting there.'
    : 'someone is knocking. there are no footprints in the snow outside.');
}

function updatePending(dt) {
  if (!pendingVisit || dialog || S.away) return;
  pendingVisit.t -= dt;
  if (pendingVisit.t > 0) return;
  const v = pendingVisit;
  pendingVisit = null;
  sfx.knock(v.as === 'trader' ? 2 : 3, v.as === 'trader');
  openDialogue(knockDialogue(v));
}

// The text never gives the mimic away. It copies whoever it is pretending to be, word for word, even the way
// they greet you once you've let them in before.
function knockText(v) {
  switch (v.as) {
    case 'woodcutter': return S.met.woodcutter
      ? 'Three heavy thumps. The gruff voice again: "It\'s me. The woodcutter. Still got more wood than I can haul."'
      : 'Three heavy thumps. A gruff voice: "Woodcutter. Cut more than I can haul tonight. Want to trade?"';
    case 'trader': return S.met.trader
      ? 'Two slow knocks, and something clinks. The dry voice: "Evening again. I kept a few things back for you."'
      : 'Two slow knocks, and something clinks. A dry voice: "Evening. I sell what a person needs on a night like this."';
    case 'stranger': if (v.who === 'ash') return 'A knock. Her voice, exactly her voice: "Please. I just need the fire. I won\'t be any trouble."';
    // falls through
    default: return 'A knock. A woman\'s voice through the door, cracked with cold: "Please. I just need the fire. I won\'t be any trouble."';
  }
}

const lanternLit = () => S.lantern && S.lanternLit;
const FEET_AT = { 0: [], 1: [271], 2: [267, 276], 3: [263, 271, 279] };

// The same words for everyone: you have to count the feet yourself.
function lanternText() {
  return lanternLit() ? ' In the blood lantern\'s red light, shadows shift in the gap under the door.' : '';
}

function knockDialogue(v) {
  return {
    id: 'knock',
    visit: v,
    portrait: lanternLit() ? `doorFeet${v.feet ?? 2}` : 'door',
    text: knockText(v) + lanternText(),
    choices: [
      ...(noVisitors() ? [] : [{ label: 'open the door', act: () => openDoorFor(v) }]),
      ...(S.slot && !v.looked ? [{ label: 'look through the slot', act: () => lookThroughSlot(v) }] : []),
      { label: 'keep it shut', act: () => keepShut(v) },
    ],
  };
}

// Takes one piece of meat, raw first. Returns false if there is none.
function takeMeat() {
  if (S.meat > 0) { takeRaw(1); return true; }
  if (S.cooked > 0) { takeCooked(1); return true; }
  return false;
}
const anyMeat = () => S.meat + S.cooked;

function openDoorFor(v) {
  doorTarget = 1;
  goblinsLeave();
  if (v.who === 'blood' || bloodHour()) { die('bloodHour'); return; }
  if (v.who === 'ash') { die('ash'); return; }
  if (v.who === 'phantom') {
    doorCloseIn = 1.4;
    say('there is no one there. no footprints in the snow. there never were.');
    return;
  }
  if (v.who === 'mimic') {
    if (S.saltDoor) {
      S.saltDoor = false;
      S.rec.mimicsKept += 1;
      figure = 1.2;
      doorCloseIn = 1.3;
      sfx.scream();
      achieve('salt_line');
      say('it stops at the salt line. it screams without a sound, and is gone. the salt is scattered.');
      return;
    }
    S.mimicWalked = v.fake;
    die('mimic');
    return;
  }
  S.trusted += 1;
  S.rec.letIn += 1;
  switch (v.who) {
    case 'stranger':
      S.stranger = 'inside';
      S.ember = 40;
      S.hintT = 10;
      S.sHunger = 20;
      S.strangerFalse = Math.random() < FALSE_STRANGER_CHANCE;
      S.fDemandT = 45;
      walker = { x: 274, y: 113, step: 0 };
      say('the stranger shuffles to the fire and sits down.');
      break;
    case 'woodcutter':
      S.cutterVisits += 1;
      S.met.woodcutter = true;
      visitorAtDoor = 'woodcutter';
      openDialogue({
        id: 'cutter', portrait: 'woodcutter', door: true,
        text: 'A broad woodcutter leans in the doorway, a sled of split logs behind him. "Meat for wood," he says. "Or wood for meat. Your pick."',
        choices: [
          { key: 'meatForWood', label: 'give 1 meat for 7 wood', can: () => anyMeat() >= 1, act: () => { takeMeat(); addWood(7); say(blizzard() ? 'he stacks seven logs by the door, dry from under his oilcloth. +7 dry wood' : 'he stacks seven logs by the door. +7 wood'); } },
          { key: 'meat2ForWood', label: 'give 2 meat for 15 wood', can: () => anyMeat() >= 2, act: () => { takeMeat(); takeMeat(); addWood(15); say(blizzard() ? 'he unloads half his sled, dry from under the oilcloth. +15 dry wood' : 'he unloads half his sled by the door. +15 wood'); } },
          ...(S.axe || S.ch === 'noAxe' ? [] : [{ key: 'axe', label: 'give 3 meat for his spare axe', desc: 'a real axe: every wood trip brings back half again as much.', can: () => anyMeat() >= 3,
            act: () => { takeMeat(); takeMeat(); takeMeat(); S.axe = true; sfx.chime(); say('he hands you his spare axe, the handle worn smooth. "keep it sharp." your wood trips will bring back more now.'); } }]),
          { key: 'woodForMeat', label: 'give 6 wood for 1 cooked meat', can: () => S.wood >= 6, act: () => { S.wood -= 6; addCooked(1); say('he hands over a strip of smoked meat. +1 cooked meat'); } },
          { key: 'no', label: 'no trade', act: () => say('the woodcutter drags his sled back into the dark.') },
        ],
      });
      break;
    case 'trader':
      S.traderCame = true;
      S.met.trader = true;
      openShop(true);
      break;
  }
}

function keepShut(v) {
  if (v.who === 'blood') { say('the knocking stops. something stays at the door a long time before it goes.'); return; }
  if (v.who === 'ash') { say('the knocking stops. grey ash drifts in under the door.'); return; }
  if (v.who === 'phantom') { say('the knocking stops. there are no footprints in the snow, coming or going.'); return; }
  if (v.who === 'mimic') {
    S.rec.mimicsKept += 1;
    if (lanternLit()) achieve('count_feet');
    if (v.fake) achieve('walker');
    say('the knocking stops. no footsteps leave.');
    return;
  }
  S.rec.turnedAway += 1;
  if (v.who === 'stranger') S.stranger = 'refused';
  say('the footsteps crunch away into the snow.');
}

/* --------------------------------------------------------- the stranger */

const HINTS = [
  { at: 0, text: 'The stranger speaks without looking up. "Listen before you open that door. The people out there walk up through the snow." She pokes the fire. "The other things don\'t walk. And there\'s only one of me."' },
  { at: 1, text: () => (S.boards
    ? 'The stranger looks at the boarded window and nods. "Good. She comes for the window after one. Keep a branch burning. She hates the fire."'
    : 'The stranger stares at the window. "Board that up before one. She comes for the window, and glass won\'t stop her."') },
  { at: 1, text: 'The stranger: "Something hunts these woods. When it howls close, stay inside. Wait for it to move off."' },
  { at: 2, text: 'The stranger, quietly: "After three, some of them learn to walk. You won\'t hear the difference. The blood lantern shows what\'s really standing there."' },
];

// She has to eat once tonight. She asks three times; the third time is the one that matters.
// Feed her early and she will be starving again before dawn.
const PLEAS = [
  { at: 45, text: 'The stranger rubs her stomach. "I haven\'t eaten in two days. Do you have anything?"',
    again: 'The stranger rubs her stomach. "I\'m hungry again. Is there anything to eat?"' },
  { at: 70, text: 'The stranger, quietly: "Please. Just a little meat. I\'m so hungry."' },
  { at: 90, text: 'The stranger is shaking, curled up by the fire. "I won\'t last the night without something to eat."', last: true },
];
const STRANGER_HUNGER = 100 / 220;   // empty to dead in a little under four hours of night

function feedStranger(kind) {
  if (kind === 'raw') {
    takeRaw(1);
    say('she tears into the raw meat before you can stop her. then she starts to shake.');
    strangerDies('She convulses on the floor, and goes still. A moment later, something under her skin begins to move.');
    return;
  }
  takeCooked(1);
  S.rec.fed += 1;
  S.sHunger = 0;
  S.sPlea = 0;
  S.ember = Math.min(100, (S.ember || 40) + 15);   // she grows stronger every time you feed her
  say('the stranger eats slowly, eyes closed. "thank you." her eyes glow a little brighter.');
}

function updateStranger(dt) {
  if (S.stranger !== 'inside' || walker || S.away || dialog) return;
  if (S.strangerFalse) { updateFalseStranger(dt); return; }

  S.sHunger += dt * STRANGER_HUNGER;
  if (S.sHunger >= 100) { strangerDies(); return; }
  const plea = PLEAS[S.sPlea];
  if (plea && S.sHunger >= plea.at) {
    S.sPlea += 1;
    // she has only gone two days without food the first time she asks
    const text = plea.again && S.sAsked ? plea.again : plea.text;
    S.sAsked = true;
    openDialogue({
      id: 'plea', last: !!plea.last, portrait: 'stranger', text,
      choices: [
        { key: 'cooked', label: 'give her cooked meat', can: () => S.cooked >= 1, act: () => feedStranger('cooked') },
        { key: 'raw', label: 'give her raw meat', can: () => S.meat >= 1, act: () => feedStranger('raw') },
        { key: 'leave', label: 'tell her to leave', act: sendStrangerAway },
        { key: 'no', label: plea.last ? 'you have nothing to give' : 'not now', act: () => say(plea.last ? 'the stranger turns her face to the wall.' : 'the stranger nods and looks back at the fire.') },
      ],
    });
    return;
  }

  if (S.hint >= HINTS.length) return;
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

// The false stranger: no hints, no warnings. She does not ask, she demands, and more often toward dawn.
// Feeding her holds her off; refusing her twice is the end. At first light she stops pretending.
function updateFalseStranger(dt) {
  S.fDemandT -= dt;
  if (S.fDemandT > 0) return;
  const h = hour();
  S.fDemandT = Math.max(16, 55 - h * 5) * rand(0.85, 1.15);
  const lines = h >= 6
    ? ['She is standing now. You never saw her stand. "FEED ME."', '"FEED ME." Her mouth stays open after the words.']
    : h >= 4
      ? ['"I\'m hungry. Feed me. Now."', 'She is watching you, not the fire. "Feed me."']
      : ['She doesn\'t look at you. "Feed me."', '"Feed me," she says. Her voice is flat.'];
  openDialogue({
    id: 'demand', portrait: 'strangerFalse',
    text: pick(lines) + (S.fRefused ? ' She has not blinked since you said no.' : ''),
    choices: [
      { key: 'cooked', label: 'give her cooked meat', can: () => S.cooked >= 1, act: () => { takeCooked(1); S.fRefused = 0; S.rec.fed += 1; say('she eats it without chewing.'); } },
      { key: 'raw', label: 'give her raw meat', can: () => S.meat >= 1, act: () => { takeRaw(1); S.fRefused = 0; say('she eats it raw, slowly. then she smiles at you.'); } },
      { key: 'leave', label: 'tell her to leave', act: sendStrangerAway },
      { key: 'no', label: 'not now', act: () => {
        S.fRefused += 1;
        if (S.fRefused >= 2) die('falseStranger');
        else say('she stares at you. she does not blink.');
      } },
    ],
  });
}

function sendStrangerAway() {
  if (S.strangerFalse) {
    achieve('saw_through');
    sfx.slam();
    say('it stands up. it is taller than she was. it walks out into the snow without a sound.');
  } else {
    say('she looks at you for a long moment, then pulls up her hood and walks out into the snow.');
  }
  S.stranger = 'left';
  doorTarget = 1;
  doorCloseIn = 1.4;
}

// At first light the false stranger stops pretending.
function killAtDawn() {
  mode = 'lost';
  stage.dataset.mode = mode;
  lossT = 0;
  S.cause = 'falseStranger';
  S.won = false;
  startDeath('falseStranger');
  achieve('die_falseStranger');
  if (terrifying()) { jumpT = 0.38; sfx.jolt(1); }
  shake = 0.5;
  sfx.death();
  sfx.scream();
  say('she stands up as the light comes in. she is smiling.');
  save();
}

function strangerDies(text = 'The stranger slumps against the wall and stops breathing. A moment later, something under her skin begins to move.') {
  S.stranger = 'dead';
  S.herDied = true;
  sfx.heartbeat(1);
  openDialogue({
    id: 'strangerDead', portrait: 'dead',
    text,
    choices: [
      { label: 'drag her out into the snow', act: () => startTrip('drag') },
      { label: 'leave her be', act: () => { S.riseT = 6; say('you look away. behind you, something is breathing again.'); } },
    ],
  });
}

/* --------------------------------------------------------- endings */

const DEATHS = {
  dark: { text: 'The fire went out, and stayed out. The dark came in.', hint: 'keep the fire above smoldering. the dark gets hungrier every hour.' },
  starve: { text: 'You starved.', hint: 'you have to keep eating all night, and meat goes bad. set traps early: they are the only meat at night. cook it and eat it.' },
  burn: { text: 'The cabin burned down around you.', hint: 'a wood pile taller than the room can hold will topple into the fire. keep it lower, build a woodshed, or keep two jars of blood to douse it.' },
  cellar: { text: 'Something came up through the floor.', hint: 'on the second night, when the floor creaks, slam the hatch, or weigh it down with logs. it feeds twice; the third time it comes up.' },
  cellarAway: { text: 'You came back to an open hatch.', hint: 'the thing under the floor comes up when no one is there to slam the hatch. weigh it down before you go out.' },
  falseStranger: { text: 'She was never the stranger. It waited for the light.', hint: 'something was wrong with her. her eyes caught the firelight red, she never warned you of anything, and she demanded instead of asking. you could have told her to leave.' },
  mimic: { text: 'You opened the door. It was not a person.', hint: () => (S.mimicWalked
    ? 'after three in the morning, some of them walk. only the blood lantern shows what is really standing there.'
    : 'real visitors walk up through the snow. listen for footsteps before the knock. and there is only one stranger.') },
  hand: { text: 'She climbed in through the broken window.', hint: 'board the window before one in the morning. glass will not stop her, and fire will.' },
  handAway: { text: 'You came back to a broken window. She was already inside.', hint: 'board the window before one in the morning. a bare window lets her in, whether you are home or not.' },
  guest: { text: 'The fire went out, and the thing in the corner came for you.', hint: 'something got in behind you when you came back from a trip. salt the doorway to keep them out, throw salt at one to drive it off, or light its corner. and never let the fire die with one inside.' },
  goblins: { text: 'Three of them. That was enough for them to be bold.', hint: 'they follow you in from your trips and come through the woodshed cabinet. salt or plank the cabinet, salt the doorway, swat them off the wall, and drive them out before there are three.' },
  bloodHour: { text: 'You opened the door in the blood hour.', hint: 'from three to four, while the moon is dark, nothing at the door is anything you want. not the door, not even the slot.' },
  flood: { text: 'They came in. All of them.', hint: 'from five to six they try every way in at once. by then the door must stay shut, the window boarded, the woodshed cabinet planked and the hatch barred.' },
  ash: { text: 'You let her in. It was not her anymore.', hint: 'she died, and under the blood moon what was left of her came back to the door. it has her voice. it will never be her.' },
  sleep: { text: 'You lay down by the fire at dusk, just for a moment, and never got up.', hint: 'four days without sleep is more than anyone can take. sleep during the day.' },
  lost: { text: 'You lost the path in the white, and never found it again.',
    hint: "nothing you could have done. about one blizzard night in a hundred ends like this. you were very, very unlucky." },
  freeze: { text: () => (S.away ? 'You froze in the snow, a little way from the door.' : 'You froze by a fire too small to save you.'),
    hint: 'in the blizzard, one trip outside chills you badly and two in a row can kill you. warm up by a strong fire between trips. a fur coat helps.' },
  hunter: { text: 'Something found you in the trees.', hint: 'when it howls close and its eyes shine in the treeline, stay inside.' },
  risen: { text: 'The stranger got up again. It was not the stranger anymore.', hint: 'if you let her in, she has to eat cooked meat. feed her when she begs the third time, or get her body out of the house.' },
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
  if (cause === 'mimic' || cause === 'bloodHour' || cause === 'ash') { doorTarget = 1; visitorAtDoor = null; shake = 0.8; }
  if (cause === 'dark') { shake = 0.4; S.fire = 0; particles = []; }
  if (cause === 'hand' || cause === 'handAway') { shake = 0.6; S.hand.phase = 'crawl'; S.hand.p = 1; }
  if (cause === 'risen') shake = 0.6;
  if (cause === 'burn') { shake = 0.8; S.fire = 4; }
  startDeath(cause);
  achieve(`die_${cause}`);
  if (terrifying()) { jumpT = 0.38; shake = 1; sfx.jolt(1); }
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
  achieve(`night_${S.nightNo}`);
  if (S.nightNo >= LAST_NIGHT) { S.ending = finalEnding(); achieve(`end_${S.ending}`); }
  if (S.nightNo >= LAST_NIGHT && S.ch) achieve(`ch_${S.ch}`);
  if (S.nightNo >= LAST_NIGHT && S.diff === 'hard') achieve('hard_win');
  if (S.nightNo >= LAST_NIGHT && S.diff === 'insane') { achieve('hard_win'); achieve('insane_win'); }
  if (lvl() >= 3) achieve('awake_3');
  if (S.stranger === 'inside' && !S.strangerFalse) { achieve('not_alone'); if (S.nightNo >= 3) achieve('three_together'); }
  sfx.dawn();
  say('the sky outside is turning gray.');
  save();
}

/* ----------------------------------------------------------- achievements */

const achievements = (() => { try { return createStore(localStorage); } catch (e) { return createStore({ getItem: () => null, setItem: () => {} }); } })();
const toasts = [];
let toastT = 0;

// Simulated and playtest runs don't earn achievements, the same as stats and the leaderboard.
// Scares: eerie (the dread, no jump scares) or terrifying (a shrill whine when something is about to kill you,
// a lunge at the moment it does, and a face at the window when you only just make it back).
let fright = 'eerie';
try { fright = localStorage.getItem('firelight-fright') || 'eerie'; } catch (e) { /* default */ }
const terrifying = () => fright === 'terrifying';
let jumpT = 0, windowScareT = 0;

function closeCallScare() {
  if (!terrifying() || S.stalk < 70) return;
  windowScareT = 0.32;
  shake = 0.4;
  sfx.jolt(0.6);
  sfx.heartbeat(1);
}

function achieve(id) {
  if (window.__simulating || S.dev || lab) return;
  const a = achievements.unlock(id);
  if (a) toasts.push(a);
}

function updateToasts(dt) {
  toastT -= dt;
  if (toastT > 0) return;
  ui.toast.classList.remove('show');
  if (toastT > -0.4 || !toasts.length) return;   // a short gap between them
  const a = toasts.shift();
  ui.toast.innerHTML = '<span class="k">achievement</span><span class="name"></span><span class="desc"></span>';
  ui.toast.querySelector('.name').textContent = a.name;
  ui.toast.querySelector('.desc').textContent = a.desc;
  ui.toast.classList.add('show');
  sfx.chime();
  toastT = 3.6;
}

const ACH_GROUPS = [['nights', 'nights survived'], ['endings', 'endings'], ['challenges', 'challenges'], ['feats', 'feats'], ['deaths', 'ways to die']];

function renderAchievements() {
  const got = achievements.unlocked();
  const real = ACHIEVEMENTS.filter((a) => !a.later);
  ui.achCount.textContent = `${real.filter((a) => got[a.id]).length} of ${real.length}`;
  ui.achList.innerHTML = '';
  for (const [group, title] of ACH_GROUPS) {
    const h = document.createElement('li');
    h.className = 'group';
    h.textContent = title;
    ui.achList.appendChild(h);
    for (const a of ACHIEVEMENTS.filter((x) => x.group === group)) {
      const li = document.createElement('li');
      const has = !!got[a.id];
      li.className = has ? 'got' : a.later ? 'later' : 'locked';
      const secret = a.hidden && !has;
      li.innerHTML = '<span class="mark"></span><span class="name"></span><span class="desc"></span>';
      li.querySelector('.mark').textContent = has ? '✦' : '·';
      li.querySelector('.name').textContent = secret ? '???' : a.name;
      li.querySelector('.desc').textContent = secret ? (a.hint || '???') : a.later ? `${a.desc} (a later version)` : a.desc;
      ui.achList.appendChild(li);
    }
  }
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

const canAct = () => mode === 'playing' && !dialog && !S.away && doze <= 0.15;   // not with your eyes shut

function stoke() {
  if (!canAct() || S.cd.stoke > 0 || S.wood < 1) return;
  // dry wood first; with only wet logs left, the fire takes it but burns for half as long, and smokes
  const wet = S.wood + S.shedWood - S.wet.length < 1;
  S.wood -= 1;
  if (wet) S.wet.shift();
  const was = S.fire;
  S.fire = S.fire === 0 ? 2 : Math.min(4, S.fire + 1);
  S.decay = decayTime() * (wet ? 0.5 : 1);
  if (wet) {
    S.smoke = Math.min(1, S.smoke + 0.35);
    sfx.sputter();
    spawnSmoke(160, 128); spawnSmoke(157, 124); spawnSmoke(163, 120);
    if (Math.random() < 0.4) say('the frozen wood hisses and smokes. it will not burn for long.');
  }
  S.cd.stoke = STOKE_CD * (S.hunger >= 90 ? 2 : 1) * (S.sick > 0 ? 1.3 : 1) * awakeMult([1, 1.25, 1.4, 1.6]) * (S.cold >= 60 ? 1.3 : 1);   // numb hands, heavy eyes
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

// One eat button: cooked meat if you have it, raw if you don't (and raw makes you sick).
function eat() {
  if (!canAct() || S.cd.eat > 0 || S.hunger < 5) return;
  if (S.cooked > 0) {
    takeCooked(1);
    S.hunger = Math.max(0, S.hunger - 45);
    say(pick(['you eat the cooked meat. it helps.', 'you chew slowly. warmth spreads through you.']));
  } else if (S.meat > 0) {
    takeRaw(1);
    S.rec.raw += 1;
    S.hunger = Math.max(0, S.hunger - 25);
    S.sick = Math.min(80, S.sick + 40);
    S.sickT = 3;
    sfx.retch();
    say('you choke the raw meat down. it is wrong somehow, slick and cold. your stomach turns.');
  } else {
    return;
  }
  S.cd.eat = EAT_CD;
  if (S.hunger < 70) S.hungerSaid = 0;
  if (S.hunger < 90) growlT = 0;
  save();
}

function cook() {
  if (!canAct() || S.cooking || S.meat < 1) return;
  if (S.fire < 1) { say('you need a fire to cook on.'); return; }
  const n = Math.min(3, S.meat);
  takeRaw(n);
  S.cooking = { n, t: cookTime(), total: cookTime() };
  S.rec.cooked += n;
  sfx.sizzle();
  say(`you skewer ${n} raw meat over the fire. it will cook on its own.`);
  save();
}

/* --------------------------------------------------------- under the floor (night 2) */

// A hatch in the floor. On the second night something lives under it. The boards creak and dust puffs up,
// then the lid lifts and pale fingers curl out. Slam it, or weigh it down with wood. Miss it and it drags
// your meat down; miss it three times and it comes up.
const nextHatch = () => rand(34, 52) * (1 - hour() * 0.04);

function updateHatch(dt) {
  if (S.nightNo < 2) return;
  const hc = S.hatch;
  if (clockHour() < (S.nightNo >= 5 ? 0 : 1) && hc.phase === 'idle') return;
  hc.t -= dt;
  if (hc.phase === 'idle') {
    if (hc.t <= 0) {
      hc.phase = 'creak';
      hc.t = 3.5;
      hc.phantom = lvl() >= 2 && Math.random() > 1 / 3;
      sfx.creak();
      spawnDust();
      say(S.hatchBar ? 'the beam over the hatch creaks. something pushes from below.' : 'the floorboards creak near the hatch. dust puffs up between them.');
    }
  } else if (hc.phase === 'creak') {
    if (Math.random() < dt * 4) spawnDust();
    if (hc.t <= 0) {
      hc.phase = 'lift';
      hc.total = hc.t = Math.max(2.4, 3.6 - hour() * 0.12) * D().quick;
      sfx.creak();
      say(S.hatchBar ? 'the hatch heaves up against the beam. pale fingers curl through the gap.' : 'the hatch lifts. pale fingers curl out over the edge.');
    }
  } else if (hc.phase === 'lift') {
    hc.p = 1 - hc.t / hc.total;
    if (hc.t <= 0) {
      if (hc.phantom) { hc.phase = 'slammed'; hc.t = 0.6; hc.phantom = false; say('the hatch settles. nothing came up. maybe nothing was ever there.'); }
      else hatchMissed();
    }
  } else if (hc.phase === 'feeding' || hc.phase === 'taking') {
    if (hc.phase === 'taking' && hc.t <= 0.2 && S.stranger === 'inside') S.stranger = 'taken';
    if (hc.t <= 0) { hc.phase = 'idle'; hc.t = nextHatch() * 1.8; }   // fed, it stays down a long while
  } else if (hc.t <= 0) {
    hc.phase = 'idle';
    hc.t = nextHatch() / (lvl() >= 2 ? 3 : 1);
  }
}

// Slam it down on its fingers. With the beam across it, you stamp it shut and the beam stays whole.
function slamHatch() {
  const hc = S.hatch;
  if (hc.phase !== 'lift' || S.away || dialog || mode !== 'playing' || doze > 0.15) return;
  nearMiss('hatch', 1 - hc.t / hc.total, `slammed the hatch with ${hc.t.toFixed(1)} s to spare`);
  hc.phase = 'slammed';
  hc.t = 0.6;
  S.rec.slammed = (S.rec.slammed || 0) + 1;
  sfx.slam();
  shake = 0.3;
  spawnDust();
  say(S.hatchBar ? 'you stamp the hatch down against the beam. something below hisses and lets go.' : 'you slam the hatch down on its fingers. something below hisses and lets go.');
}

// Nobody slammed it. The beam, if there is one, breaks and buys you this time. Otherwise it comes up for food:
// half of the meat on the rack. No meat, and it takes the stranger. No stranger, and it takes you.
function hatchMissed() {
  const hc = S.hatch;
  if (S.saltHatch) {
    S.saltHatch = false;
    hc.phase = 'slammed';
    hc.t = 0.8;
    sfx.hiss();
    sfx.scream();
    say(S.away ? 'back at the house, the salt ring around the hatch is scattered. something touched it and went back down.' : 'its fingers touch the salt ring. it shrieks and drops back down. the ring is scattered.');
    return;
  }
  if (S.hatchBar) {
    S.hatchBar = false;
    hc.phase = 'slammed';
    hc.t = 0.8;
    sfx.crack();
    shake = 0.3;
    spawnDust();
    say(S.away ? 'back at the house, something cracks the beam over the hatch in two.' : 'the beam over the hatch cracks in two. the hatch drops shut again, for now.');
    return;
  }
  const meat = S.meat + S.cooked;
  if (meat > 0) {
    const n = Math.max(Math.min(2, meat), Math.ceil(meat / 2));
    let left = n;
    while (left > 0 && S.meat > 0) { takeRaw(1); left -= 1; }
    while (left > 0 && S.cooked > 0) { takeCooked(1); left -= 1; }
    hc.phase = 'feeding';
    hc.t = 2.4;
    hc.took = n;
    sfx.retch();
    say(S.away ? `you come back to claw marks on the floor. half your meat is gone down the hatch. -${n} meat`
      : `a long pale arm comes up out of the hatch and strips the rack. it drags it all down. -${n} meat`);
    return;
  }
  if (S.stranger === 'inside') {
    hc.phase = 'taking';
    hc.t = 2.6;
    sfx.gasp();
    say(S.away ? 'when you come back, the stranger is gone. the hatch is shut. there are marks on the floor where she was sitting.'
      : 'there is no meat. pale arms close around the stranger and pull her down into the dark. one sharp breath, and then nothing.');
    return;
  }
  hc.phase = 'open';
  die(S.away ? 'cellarAway' : 'cellar');
}

/* ------------------------------------------------------------------ the day */

// Between the nights: daylight from 6 am to 10 pm, sixteen hours to spend. Every choice costs hours, and sleep
// takes six of them.
const DAY_ACTIONS = [
  { id: 'chop', name: 'chop wood', hours: 2, desc: 'a big pile of split logs.', show: () => true,
    act: () => { const n = Math.round((9 + Math.floor(Math.random() * 4)) * D().dayWood); const before = S.wood + S.shedWood; addWood(n); const kept = Math.min(n, S.wood + S.shedWood - before); if (!S.shed && S.wood > PILE_CAP) S.wood = PILE_CAP; const got = S.wood + S.shedWood - before; return got < n ? `you chop more than the room can hold. you keep ${got} and leave the rest to the snow.` : `you chop wood until your arms shake. +${n} wood`; } },
  { id: 'hunt', name: 'hunt in daylight', hours: 2, desc: 'nothing hunts you while the sun is up.', show: () => true,
    act: () => {
      const n = Math.round((2 + Math.floor(Math.random() * 2)) * D().dayHunt); addRaw(n);
      const b = Math.random() < 0.45 ? 1 : 0; S.blood += b;
      return `tracks in the fresh snow lead you to food. +${n} raw meat${b ? ', +1 blood' : ''}`;
    } },
  { id: 'traps', name: 'check the traps', hours: 1, desc: 'reset them and collect what they caught overnight.', show: () => S.traps > 0 && !S.dayDone.traps,
    act: () => {
      const c = checkTraps(2, D().dayTraps);
      S.dayDone.traps = true;
      return (c.m + c.b + c.f ? `the traps held something. +${c.m} raw meat, +${c.b} blood${c.f ? `, +${c.f} fur` : ''}` : 'every trap is sprung and empty. something got there first.') + (c.broke ? ` ${c.broke} broke.` : '');
    } },
  { id: 'scavenge', name: 'scavenge the empty village', hours: 3, desc: 'salt, maybe nails, maybe worse.', show: () => true,
    act: () => {
      const first = !S.dayDone.scavenge;
      S.dayDone.scavenge = (S.dayDone.scavenge || 0) + 1;
      const salt = first ? 3 + Math.floor(Math.random() * 2) : 1 + Math.floor(Math.random() * 2);
      S.salt += salt;
      const parts = [`+${salt} salt`];
      if (!S.nails && Math.random() < (first ? 0.55 : 0.35)) { S.nails = true; parts.push('a jar of iron nails (your boards will hold longer)'); }
      if (Math.random() < 0.4) { S.blood += 1; parts.push('+1 blood'); }
      const lead = pick([
        'the houses are empty. the doors were all barred from the inside.',
        'every window in the village is boarded. most of the boards are torn loose.',
        'someone scratched tally marks into a wall. they stop at two.',
      ]);
      return `${lead} ${parts.join(', ')}`;
    } },
  { id: 'window', name: () => (S.boardsBuilt ? 'repair the window boards' : 'board up the window'), hours: 2,
    desc: () => (S.boardsBuilt ? `back to three boards. (${S.boards} of 3 now) the glass is gone for good.` : 'three boards, with daylight to do it right. costs 6 wood.'),
    show: () => !S.boardsBuilt || S.boards < 3,
    can: () => S.boardsBuilt || S.wood >= 6,
    act: () => {
      if (!S.boardsBuilt) { S.wood -= 6; S.boardsBuilt = true; }
      S.boards = 3;
      return 'you nail the window shut, board by board.';
    } },
  { id: 'bury', name: 'bury her', hours: 2, desc: 'the smell of her body is still drawing the thing in the trees.', show: () => S.carcass && !S.buried,
    act: () => { S.carcass = false; S.buried = true; return 'you bury the stranger under the snow and stones, far from the house.'; } },
  { id: 'sit', name: 'sit with the stranger', hours: 1, desc: 'she has been quiet all morning.', show: () => S.stranger === 'inside' && !S.strangerFalse && !S.dayDone.sit,
    act: () => {
      S.dayDone.sit = true; S.salt += 2;
      return 'she presses a pouch of salt into your hands. "something lives under this floor," she says. "when the boards creak, slam that hatch shut. if you go out, bar it." +2 salt';
    } },
  { id: 'sleep', name: 'sleep', hours: 6, desc: () => SKIP_SLEEP[Math.min(4, (S.awake || 0) + 1)], show: () => S.tired,
    act: () => { S.tired = false; return 'you sleep by the coals. no dreams. you wake to long shadows.'; } },
];

const SKIP_SLEEP = [
  '',
  "skip it and tonight you'll be slow and hungrier, your eyes will close now and then, and meat cooking while they're shut will burn.",
  "you didn't sleep last night either. skip it again and you'll start hearing and seeing things that aren't there.",
  'two days awake already. a third and you will hardly be able to tell what is real.',
  'three days awake. if you do not sleep now, you will not live through the night.',
];

const dayName = (a) => (typeof a.name === 'function' ? a.name() : a.name);
const dayDesc = (a) => (typeof a.desc === 'function' ? a.desc() : a.desc);

const DAY_HOURS = 16;
const dayClock = (hoursLeft) => clockText(((22 - hoursLeft - START_HOUR + 24) % 24) * HOUR);

// what the next night brings, told during the day
const NIGHT_WARNINGS = {
  2: 'Tonight will be worse. Everything comes two hours sooner: the thing in the trees and the knocking from the moment it gets dark, her at the window from eleven, and the walkers from one in the morning.',
  5: 'Tonight the moon will be full, and red. Every one of them will come, from every part of the woods, and they will all be awake from the start. Under that moon the mimics stand on two feet: only a slot in the door shows their faces. From three to four the moon goes dark: open nothing then, not even the slot. And before dawn they will try every way in at once: have the door, the window, the woodshed cabinet and the hatch shut tight.',
  4: 'The blizzard will not stop. And there are tracks in the snow by the woodshed, small ones, like a child walking on its knuckles. Tonight, things may follow you in when you come back from a trip. Salt keeps them out of a doorway. They hate the light.',
  3: 'A blizzard is coming tonight. Everything still comes two hours sooner. Out in it, everything takes half again as long, and the cold can kill you: one trip chills you badly, two in a row could freeze you. The wood you bring in will be frozen, even from the woodshed, and frozen wood barely burns until it thaws. Only a big fire keeps the house warm.',
};

function startDay() {
  if (S.nightNo >= LAST_NIGHT || !S.won) return;
  S.carry = S.final;
  S.phase = 'day';
  const spoiled = spoilOverDay();
  S.wet = [];   // a day by the coals dries every log
  S.goblins = [];   // they go with the dark
  if (D().rot && S.shed && S.shedWood > 0) {
    const lost = Math.ceil(S.shedWood * 0.15);
    S.shedWood -= lost;
    S.dayLog.push(`damp got into the woodshed. ${lost} logs have rotted.`);
  }
  S.smoke = 0;
  S.cold = 0;
  S.charm = false;
  S.dayHours = DAY_HOURS;
  S.tired = true;
  S.dayDone = {};
  S.dayLog = spoiled ? [`the meat you kept went bad in the warmth of the day. -${spoiled} meat`] : [];
  S.ended = false;
  S.away = null;
  S.cooking = null;
  // the fire burns low while you sleep through the morning
  S.fire = Math.min(S.fire, 1);
  resetTransients();
  ui.ending.classList.add('hidden');
  setMode('day');
  showDay();
  save();
}

function showDay() {
  setMode('day');
  ui.day.classList.remove('hidden');
  renderDay();
}

function renderDay() {
  ui.dayHours.textContent = `${S.dayHours} hour${S.dayHours === 1 ? '' : 's'}`;
  ui.dayWarn.textContent = NIGHT_WARNINGS[S.nightNo + 1] || '';
  ui.dayList.innerHTML = '';
  for (const a of DAY_ACTIONS.filter((x) => x.show())) {
    const li = document.createElement('li');
    const ok = a.hours <= S.dayHours && (!a.can || a.can());
    li.innerHTML = `<div class="row"><span class="name"></span><button ${ok ? '' : 'disabled'}>${a.hours} h → ${dayClock(S.dayHours - a.hours)}</button></div><div class="desc"></div>`;
    li.querySelector('.name').textContent = dayName(a);
    li.querySelector('.desc').textContent = dayDesc(a);
    li.querySelector('button').addEventListener('click', () => doDay(a.id));
    ui.dayList.appendChild(li);
  }
  ui.dayLog.innerHTML = '';
  for (const line of [...S.dayLog].reverse()) {
    const li = document.createElement('li');
    li.textContent = line;
    ui.dayLog.appendChild(li);
  }
  ui.dayNight.textContent = S.dayHours > 0 ? 'wait for dark' : 'night is falling';
}

function doDay(id) {
  if (mode !== 'day') return;
  const a = DAY_ACTIONS.find((x) => x.id === id);
  if (!a || !a.show() || a.hours > S.dayHours || (a.can && !a.can())) return;
  S.dayHours -= a.hours;
  S.dayLog.push(a.act());
  sfx.chime();
  renderDay();
  save();
}

// The next night keeps what you have and what is broken. From night 2 everything that hunts you starts two
// hours "later"; night 3 is the blizzard.
const NIGHT_START = {
  2: ['the sun is down. the second night begins. dawn is eight hours away.', 'they are already awake. tonight everything comes two hours sooner.'],
  3: ['the sun is down, and the blizzard comes with it. the third night begins.', 'out there everything takes longer and the wood comes in frozen. only a big fire keeps the house warm. you can barely see out of the window.'],
  5: ['the snow has stopped. the sky is clear, and the moon is coming up red.', 'the fifth night. everything is awake.'],
  4: ['the sun goes down on a fourth night. the blizzard has not let up.', 'something small has been at the woodshed. when you come back in, close the door behind you fast.'],
};

function startNextNight() {
  if (mode !== 'day') return;
  ui.day.classList.add('hidden');
  const n = S.nightNo + 1;
  Object.assign(S, {
    phase: 'night', nightNo: n, night: 0, hourSaid: 0, won: false, ended: false, scored: false, recorded: false, cause: '',
    hunger: 20, hungerSaid: 0, sick: 0, dread: 0, darkTime: 0, deadFor: 0, stalk: 0, cold: 0, coldSaid: 0, smoke: 0,
    away: null, doorT: 30, firstVisit: false, cutterVisits: 0, riseT: -1, traderCame: false, traderTonight: !!D().trader || Math.random() < 0.6,
    hunter: { near: false, t: 24, since: 0 }, hand: { phase: 'idle', t: 40, total: 1, p: 0, beat: 0 },
    hatch: { phase: 'idle', t: 18, total: 1, p: 0 }, hatchFed: 0, dozeT: 22, charm: false,
    rec: { letIn: 0, turnedAway: 0, mimicsKept: 0, fed: 0, burned: 0, boardsLost: 0, trips: 0, cooked: 0, raw: 0, closest: 0, close: {}, slammed: 0 },
  });
  S.decay = decayTime();
  S.awake = S.tired ? (S.awake || 0) + 1 : 0;
  S.dozeT = dozeGap();
  S.halT = rand(8, 14);
  S.howlT = rand(4, 9);
  if (S.stranger === 'inside' && !S.strangerFalse) {
    S.ember = Math.max(0, (S.ember || 40) - 5);
    S.n4HintT = n === 4 ? 70 : -1;
    S.n5HintT = n === 5 ? 8 : -1;
    if (n >= 3) setTimeout(() => { if (S.nightNo === n && mode === 'playing' && S.stranger === 'inside') say(S.ember >= 60 ? 'her eyes burn brighter than they did. she is getting stronger.' : S.ember < 35 ? 'her eyes are dim tonight. she is hungry for more than food.' : 'her eyes glow, steady, in the dark of her hood.'); }, 6000);
  }
  if (S.stranger === 'inside') { S.sHunger = 30; S.sPlea = 0; S.n2HintT = S.strangerFalse || n !== 2 ? -1 : 9; S.n3HintT = S.strangerFalse || n !== 3 ? -1 : 60; }
  if (S.fire === 0) S.fire = 1;
  S.lit = true;
  resetTransients();
  setMode('playing');
  for (const line of NIGHT_START[n]) say(line);
  if (S.awake) setTimeout(() => { if (S.nightNo === n && mode === 'playing') say(AWAKE_LINES[Math.min(3, S.awake)]); }, 3000);
  save();
  if (S.awake >= 4) die('sleep');   // a fourth day without sleep: you lie down at dusk and don't get up
}

/* ------------------------------------------------------------------ build */

const BUILDS = [
  { id: 'boards', name: 'window boards', desc: 'three boards over the window. burn her hand when she grabs them; if you don\'t, she tears every board off and takes them. through a bare window she climbs in and takes ten logs, or you.',
    show: () => !S.boardsBuilt, cost: () => ({ wood: 8 }),
    done: () => { S.boardsBuilt = true; S.boards = 3; say('you nail three boards across the window.'); } },
  { id: 'trap', name: 'trap', desc: () => `the only way to get meat at night. catches meat and blood, checked on every trip. wears out after a few catches. the smell keeps the thing in the trees close. (${S.traps}/3)`,
    show: () => S.traps < trapMax(), cost: () => ({ wood: 6 }),
    done: () => { S.trapUses.push(makeTrap()); syncTraps(); say('you set a trap out in the snow. it will only last so long.'); } },
  { id: 'lantern', name: 'blood lantern', desc: 'hangs by the door. its red light shows what is really standing outside. burns a jar of blood every so often.',
    show: () => !S.lantern && S.ch !== 'noLantern', cost: () => ({ wood: 8, blood: 4 }),
    done: () => { S.lantern = true; S.lanternLit = true; S.lanternT = 60; say('you fill the lantern with blood and light it. the door glows red. it will need more blood to keep burning.'); } },
  { id: 'shed', name: () => (S.shedBuilt ? `woodshed (${S.shedBuilt}/${PILE_CAP} built)` : 'woodshed'),
    desc: () => `a shed against the outside wall that holds ${shedCap()} more logs, so the pile never topples. it takes ${PILE_CAP} logs, built in a second each outside. you carry out what wood you have and build log by log; run back any time and what you built stays.`,
    show: () => !S.shed && S.ch !== 'noShed', cost: () => ({}), ok: () => S.wood >= 1, costText: 'the wood you carry',
    done: () => { startTrip('shed'); } },
  { id: 'rack', name: 'drying rack', desc: 'a frame by the fire. thaws frozen wood three times faster, eight logs at a time.',
    show: () => !S.rack && S.nightNo >= 3, cost: () => ({ wood: 12 }),   // from the first blizzard, when logs come in frozen
    done: () => { S.rack = true; say('you lash a drying rack together beside the fire.'); } },
  { id: 'coat', name: 'fur coat', desc: 'you get cold 35% more slowly. with the hat, the trousers and the socks, the cold can hardly touch you. (fur is also worth 3 points each at dawn.)',
    show: () => !S.coat && S.nightNo >= 3, cost: () => ({ fur: 6 }),
    done: () => { S.coat = true; say('you stitch the pelts into a rough coat. it stinks, and it is warm.'); } },
  { id: 'pants', name: 'fur trousers', desc: 'you get cold 20% more slowly.',
    show: () => !S.pants && S.nightNo >= 3, cost: () => ({ fur: 5 }),
    done: () => { S.pants = true; say('you sew fur trousers. you look ridiculous. you are warm.'); } },
  { id: 'hat', name: 'fur hat', desc: 'you get cold 20% more slowly.',
    show: () => !S.hat && S.nightNo >= 3, cost: () => ({ fur: 4 }),
    done: () => { S.hat = true; say('you sew a fur hat with flaps over the ears.'); } },
  { id: 'socks', name: 'fur socks', desc: 'you get cold 15% more slowly.',
    show: () => !S.socks && S.nightNo >= 3, cost: () => ({ fur: 3 }),
    done: () => { S.socks = true; say('you pull on fur socks. your toes come back.'); } },
  { id: 'curtains', name: 'fur curtains', desc: 'heavy curtains for the window. shut, they keep the wind out and the house far warmer, but you can\'t see out at all, and you can barely see her when she comes. click the window to open or shut them.',
    show: () => !S.curtains && S.nightNo >= 3, cost: () => ({ fur: 5 }),
    done: () => { S.curtains = true; S.curtainsShut = true; say('you hang fur curtains over the window and draw them shut. the wind stops.'); } },
  { id: 'insulate', name: 'insulate the walls', desc: 'stuff fur into the cracks between the logs. the house loses heat more slowly and the fire warms you a little faster.',
    show: () => !S.insulated && S.nightNo >= 3, cost: () => ({ fur: 6 }),
    done: () => { S.insulated = true; say('you pack fur into every crack in the walls. the draft eases.'); } },
  { id: 'cure', name: 'cure meat with salt', desc: () => `rub salt into 2 cooked meat so it never goes bad. (${curedCount()} cured)`,
    show: () => S.salt > 0 && S.cooked - curedCount() >= 2, cost: () => ({ salt: 1 }),
    done: () => {
      const fresh = S.cookedLife.map((l, i) => [l, i]).filter(([l]) => l < CURED / 2).sort((x, y) => x[0] - y[0]).slice(0, 2);
      for (const [, i] of fresh) S.cookedLife[i] = CURED;
      say('you rub salt into the meat. it will keep now.');
    } },
  { id: 'saltDoor', name: 'salt the doorway', desc: 'a line across the threshold. the next thing you open the door to that is not a person cannot cross it.',
    show: () => !S.saltDoor && (S.salt > 0 || S.nightNo >= 2), cost: () => ({ salt: 2 }),
    done: () => { S.saltDoor = true; say('you pour a line of salt across the threshold.'); } },
  { id: 'saltWin', name: 'salt the window sill', desc: 'the next time she would get through the window, she recoils instead.',
    show: () => !S.saltWin && (S.salt > 0 || S.nightNo >= 2), cost: () => ({ salt: 2 }),
    done: () => { S.saltWin = true; say('you pour a line of salt along the window sill.'); } },
  ...TORCHES.map((tc) => ({
    id: `saltGob_${tc.id}`, name: `throw salt into ${tc.name}`,
    desc: 'something is crouched in that corner. a fistful of salt and it will bolt out the door.',
    show: () => S.goblins && S.goblins.some((g) => g.corner === tc.id), cost: () => ({ salt: 1 }),
    done: () => { S.salt += 1; saltGoblin(tc.id); },
  })),
  ...TORCHES.map((tc) => ({
    id: `torch_${tc.id}`, name: () => (S.torches && S.torches[tc.id] === 'out' ? `relight the torch in ${tc.name}` : `a torch in ${tc.name}`),
    desc: 'an iron sconce and a torch that burns all night. a faint glow, and nothing opens its eyes inside it.',
    show: () => goblinNight() && S.ch !== 'noTorches' && !(S.torches && S.torches[tc.id] === true) && !(tc.id === 'br' && S.shed && !(S.torches && S.torches.br)) && !bloodHour(),   // from night 4, when the goblins come   // the woodshed's candle already lights that corner; nothing catches in the blood hour
    cost: () => (S.torches && S.torches[tc.id] === 'out' ? {} : { wood: 2 }),   // relighting one is free: carry it to the fire and back
    done: () => lightTorch(tc),
  })),
  { id: 'slot', name: 'a slot in the door', desc: 'a small sliding slot at eye height. at a knock, slide it open and see the face outside. under the blood moon that is the only way to tell. sometimes something puts its fingers through.',
    show: () => S.nightNo >= 5 && !S.slot, cost: () => ({ wood: 6 }),
    done: () => { S.slot = true; say('you cut a slot in the door and fit a sliding cover over it.'); } },
  { id: 'saltCab', name: 'salt the woodshed cabinet', desc: 'a line of salt inside the cabinet. the next thing that comes through it from the woodshed shrieks and goes back. one use.',
    show: () => goblinNight() && S.shed && !S.saltCab && !S.cabBar && S.salt > 0, cost: () => ({ salt: 2 }),
    done: () => { S.saltCab = true; say('you pour a line of salt across the cabinet floor.'); } },
  { id: 'barCab', name: 'nail a plank over the cabinet', desc: 'nothing gets in from the woodshed, ever. but you can\'t get at your wood either, until you take it off (free).',
    show: () => goblinNight() && S.shed && !S.cabBar, cost: () => ({ wood: 3 }),
    done: () => { S.cabBar = true; say('you nail a plank across the cabinet doors.'); } },
  { id: 'unbarCab', name: 'take the plank off the cabinet', desc: 'so you can get at the woodshed again. so can they.', costText: 'free',
    show: () => S.cabBar, cost: () => ({}),
    done: () => { S.cabBar = false; say('you pry the plank off the cabinet.'); } },
  { id: 'saltTrap', name: 'salt a trap', desc: () => `rub salt into a trap. a salted trap catches meat far more often, for as long as it lasts; when it breaks, the salt goes with it. (${saltedTraps()} of ${S.traps} salted)`,
    show: () => S.traps > saltedTraps() && S.salt > 0, cost: () => ({ salt: 1 }),
    done: () => { syncTraps(); S.trapSalt[S.trapSalt.indexOf(false)] = true; say('you rub salt into the jaws of a trap. the smell will carry.'); } },
  { id: 'saltHatch', name: 'salt around the hatch', desc: 'a ring of salt around the cellar hatch. the next time it would get out, it touches the salt and recoils instead. one use.',
    show: () => S.nightNo >= 2 && !S.saltHatch && S.salt > 0, cost: () => ({ salt: 2 }),
    done: () => { S.saltHatch = true; say('you pour a ring of salt around the hatch.'); } },
  { id: 'bar', name: 'bar the hatch', desc: 'nail a beam across the cellar hatch. if it comes up and you miss the slam, the beam breaks instead of it getting out. slam it in time and the beam stays whole.',
    show: () => S.nightNo >= 2 && !S.hatchBar, cost: () => ({ wood: 4 }),
    done: () => { S.hatchBar = true; say('you nail a beam across the hatch. something underneath goes quiet.'); } },
];

const canAfford = (cost) => Object.entries(cost).every(([k, n]) => S[k] >= n);
const costText = (cost) => Object.entries(cost).map(([k, n]) => `${n} ${k}`).join(', ') || 'free';

function build(id) {
  const b = BUILDS.find((x) => x.id === id);
  if (!b || !b.show() || !canAct()) return;
  const cost = b.cost();
  if (!canAfford(cost) || (b.ok && !b.ok())) return;
  for (const k in cost) S[k] -= cost[k];
  b.done();
  if (b.id !== 'shed') sfx.chime();
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
    const name = typeof b.name === 'function' ? b.name() : b.name;
    li.innerHTML = `<div class="row"><span class="name">${name}</span>
      <button ${!canAfford(cost) || (b.ok && !b.ok()) || !canAct() ? 'disabled' : ''}>build</button></div>
      <div class="desc">${desc}</div><div class="cost">${b.costText || costText(cost)}</div>`;
    li.querySelector('button').addEventListener('click', () => build(b.id));
    ui.buildList.appendChild(li);
  }
}

function toggleBuild(force) {
  if (force !== false && (!S.lit || mode !== 'playing' || S.away)) return;
  if (force !== false) closeSpot();
  const open = force ?? ui.buildPanel.classList.contains('hidden');
  ui.buildPanel.classList.toggle('hidden', !open);
  if (open) { ui.journal.classList.add('hidden'); renderBuild(); }
}

/* ------------------------------------------------------- building in place */

// Each spot in the room where something can be built. A small amber ember shows over it whenever you could
// build something there right now; click it for a card with what it is, what it does and what it costs.
const SPOTS = [
  { id: 'window', x: 61, y: 29, builds: ['boards', 'saltWin', 'curtains'] },
  { id: 'door', x: 274, y: 44, builds: ['saltDoor', 'slot'] },
  { id: 'traps', x: 244, y: 100, builds: ['trap', 'saltTrap'] },   // on the traps by the door
  { id: 'lantern', x: 240, y: 52, builds: ['lantern'] },
  { id: 'hatch', x: 220, y: 109, builds: ['bar', 'saltHatch'] },
  { id: 'fire', x: 136, y: 94, builds: ['rack'] },
  { id: 'meat', x: 207, y: 34, builds: ['cure'] },
  { id: 'shed', x: 307, y: 72, builds: ['shed', 'saltCab', 'barCab', 'unbarCab'] },
  { id: 'bedroll', x: 252, y: 121, builds: ['coat', 'pants', 'hat', 'socks'] },
  { id: 'walls', x: 22, y: 64, builds: ['insulate'] },
  ...TORCHES.map((tc) => ({ id: `torch_${tc.id}`, x: tc.x, y: tc.y, builds: [`torch_${tc.id}`] })),
];
const buildable = (b) => b.show() && canAfford(b.cost()) && (!b.ok || b.ok());
const spotBuilds = (spot) => spot.builds.map((id) => BUILDS.find((b) => b.id === id)).filter((b) => b && b.show());
let openSpot = null;
let spotKey = '';

// an ember on every goblin settled in a corner, riding along with its eyes: click it to throw salt
const gobSpots = [];
function syncGobSpots(live) {
  const targets = live && S.salt >= 1 && S.goblins ? S.goblins.filter((g) => g.corner && !g.act) : [];
  while (gobSpots.length < targets.length) {
    const b = document.createElement('button');
    b.className = 'spot gob';
    b.title = 'throw salt';
    b.addEventListener('click', (e) => { e.stopPropagation(); if (b.goblin && canAct()) saltGoblin(b.goblin.corner, b.goblin); });
    ui.spots.appendChild(b);
    gobSpots.push(b);
  }
  gobSpots.forEach((b, i) => {
    const g = targets[i];
    b.goblin = g || null;
    b.classList.toggle('hidden', !g);
    if (!g) return;
    const { x, y } = gobEyes(g);
    b.style.left = `${(x / W) * 100}%`;
    b.style.top = `${((y + 3) / H) * 100}%`;   // just under its eyes, clear of the torch above
  });
}

function syncSpots() {
  const live = mode === 'playing' && S.lit && !S.away && !dialog;
  syncGobSpots(live);
  const on = live ? SPOTS.filter((sp) => spotBuilds(sp).some(buildable)).map((sp) => sp.id) : [];
  const key = on.join(',');
  if (key !== spotKey) {
    spotKey = key;
    for (const b of ui.spots.children) b.classList.toggle('hidden', !on.includes(b.dataset.spot));
  }
  if (openSpot && (!live || !on.includes(openSpot))) closeSpot();
}

function openSpotCard(id) {
  const spot = SPOTS.find((sp) => sp.id === id);
  if (!spot || !canAct()) return;
  // nothing to choose: one free thing to do here (relighting a torch), so just do it
  const can = spotBuilds(spot).filter(buildable);
  if (can.length === 1 && !Object.keys(can[0].cost()).length) { build(can[0].id); return; }
  openSpot = id;
  toggleBuild(false);
  toggleJournal(false);
  renderSpotCard();
  // beside the spot, kept inside the stage
  const left = clamp(spot.x - 55, 4, W - 114), above = spot.y > 90;
  ui.spotCard.style.left = `${(left / W) * 100}%`;
  ui.spotCard.style.top = above ? '' : `${((spot.y + 6) / H) * 100}%`;
  ui.spotCard.style.bottom = above ? `${((H - spot.y + 6) / H) * 100}%` : '';
  ui.spotCard.classList.remove('hidden');
}

function renderSpotCard() {
  const spot = SPOTS.find((sp) => sp.id === openSpot);
  ui.spotCard.innerHTML = '';
  for (const b of spotBuilds(spot)) {
    const cost = b.cost();
    const div = document.createElement('div');
    div.className = 'opt';
    div.innerHTML = '<div class="row"><span class="name"></span><button>build</button></div><div class="desc"></div><div class="cost"></div>';
    div.querySelector('.name').textContent = typeof b.name === 'function' ? b.name() : b.name;
    div.querySelector('.desc').textContent = typeof b.desc === 'function' ? b.desc() : b.desc;
    div.querySelector('.cost').textContent = b.costText || costText(cost);
    const btn = div.querySelector('button');
    btn.disabled = !buildable(b);
    btn.addEventListener('click', () => { build(b.id); closeSpot(); });
    ui.spotCard.appendChild(div);
  }
}

function closeSpot() {
  openSpot = null;
  ui.spotCard.classList.add('hidden');
}

/* --------------------------------------------------------------- dialogue */

function openDialogue(def) {
  dialog = def;
  toggleBuild(false);
  toggleJournal(false);
  ui.dlgText.textContent = def.text;
  ui.dlgChoices.innerHTML = '';
  ui.dlgChoices.classList.toggle('list', def.choices.some((c) => c.desc));
  ui.dlgText.scrollTop = 0;
  def.choices.forEach((c, i) => {
    const b = document.createElement('button');
    b.innerHTML = `<span class="key">${i + 1}.</span> `;
    b.appendChild(document.createTextNode(c.label));
    if (c.desc) { const d = document.createElement('span'); d.className = 'cdesc'; d.textContent = c.desc; b.appendChild(d); }
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
  if (mode === 'playing' && !portraitBlock && !lab) updateGame(dt);   // in the death lab the night stands still
  updateAmbient(dt);
}

function updateGame(dt) {
  if (introTimer >= 0) {
    introTimer -= dt;
    if (introTimer < 0) say('the room is cold and dark. light the fire.');
  }
  S.cd.stoke = Math.max(0, S.cd.stoke - dt);
  S.cd.eat = Math.max(0, S.cd.eat - dt);
  updateMessages(dt);
  if (dialog) return;
  S.time += dt;
  if (S.lit) updateNight(dt);
  if (mode !== 'playing') return;
  updatePending(dt);
  if (S.fire > 0 && Math.random() < dt * S.fire * 2.5) {
    if (S.smoke > 0.25 && Math.random() < 0.4) sfx.sizzle();   // wet wood: a damp hiss instead of a snap
    else sfx.crackle(S.fire);
  }
  saveTimer -= dt;
  if (saveTimer <= 0) { save(); saveTimer = 3; }
}

// Things that keep moving on every screen: light, door, eyes, flames, snow and the endings.
function updateAmbient(dt) {
  if (mode !== 'playing') updateMessages(dt);
  updateToasts(dt);
  if (doorCloseIn > 0) {
    doorCloseIn -= dt;
    if (doorCloseIn <= 0) { doorTarget = 0; visitorAtDoor = null; }
  }
  figure = Math.max(0, figure - dt * (mode === 'lost' ? 0.3 : 1));
  shake = Math.max(0, shake - dt);
  trapWreck = Math.max(0, trapWreck - dt);
  cabT = Math.max(0, cabT - dt);
  flareT = Math.max(0, flareT - dt);
  jumpT = Math.max(0, jumpT - dt);
  windowScareT = Math.max(0, windowScareT - dt);
  blueT = Math.max(0, blueT - dt);
  doze = Math.max(0, doze - dt);
  phantomEyes = Math.max(0, phantomEyes - dt);
  phantomGrin = Math.max(0, phantomGrin - dt);
  hunterEyes = clamp(hunterEyes + dt * ((S.hunter.near || phantomEyes > 0) && mode === 'playing' ? 0.8 : -0.8), 0, 1);

  dispR += (targetRadius() - dispR) * Math.min(1, dt * (mode === 'lost' ? 3 : 1.8));
  if (doorTarget > 0.3 && door < 0.05 && !doorCreaked) { doorCreaked = true; if (!window.__simulating) sfx.door(); }   // the hinges, as it starts to swing
  if (doorTarget < 0.1 && door < 0.05) doorCreaked = false;
  door += (doorTarget - door) * Math.min(1, dt * (mode === 'lost' ? (S.cause === 'hunter' ? 0.7 : 10) : 4));

  const slow = dialog && mode === 'playing' ? 0.5 : 1;
  animT += dt * slow;
  updateWalker(dt);
  updateEyes(dt * slow);
  updateParticles(dt * slow);
  updateFx(dt * slow);
  for (const f of snow) {
    f.y += f.v * dt * slow;
    f.x += Math.sin(S.time * 0.8 + f.v) * dt * 2;
    if (f.y > 66) { f.y = 35; f.x = rand(45, 76); }
  }
  if (mode !== 'playing') S.time += dt * 0.25;

  if (mode === 'dawn') {
    dawnT += dt;
    if (S.stranger === 'inside' && S.strangerFalse) {
      if (dawnT > 2.2) killAtDawn();
    } else if (dawnT > 4.5 && !dialog) {
      openDialogue({
        id: 'dawn', portrait: S.stranger === 'inside' ? 'stranger' : 'dawn',
        text: S.stranger === 'inside'
          ? 'Gray light creeps across the floor. The eyes are gone. The stranger stands and stretches, and for the first time she smiles. "They never come in the light," she says.'
          : S.nightNo >= 5 ? 'Gray light. The red moon slides down behind the trees.'
          : S.nightNo >= 4 ? 'Gray light. The snow finally stops. Four nights. You are still here.'
          : S.nightNo === 3 ? 'Gray light, and at last the snow eases. Three nights. Under the floor, something settles and goes still.'
          : S.nightNo === 2 ? 'Gray light again. The second night is over. Under the floor, something settles and goes still.' : 'Gray light creeps across the floor. The eyes are gone. You made it through the night.',
        choices: [{ label: 'see the morning', act: () => showEnding(true) }],
      });
    }
  }
  if (mode === 'lost') {
    lossT += dt;
    updateDeath(dt);
    if (lossT > deathLen() && !lab) showEnding(false);
  }
}

function updateWalker(dt) {
  if (!walker) return;
  const tx = 193, ty = 139;
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

// Torches: one sconce in each corner of the room, where the eyes like to sit. Two wood each, lit for good: a faint
// warm glow, and nothing opens its eyes inside it. The first time a corner is lit, now and then a rat bolts out.
const torchLit = (tc) => S.torches && S.torches[tc.id] === true && !(mode === 'lost' && S.cause === 'dark');
function nearTorch(x, y, pad) {
  // the woodshed's candle lights the back-right corner as well as a torch would
  if (S.shed && S.lit && !(mode === 'lost' && S.cause === 'dark') && Math.hypot(x - (CABINET.x + 10), (y - CABINET.y) / ELLIPSE) < 30 + pad) return true;
  return TORCHES.some((tc) => torchLit(tc) && Math.hypot(x - tc.x, (y - tc.y) / ELLIPSE) < TORCH_R + pad);
}

function lightTorch(tc) {
  if (bloodHour()) { say("the torch won't catch. not now. not under that moon."); return; }
  const first = !S.torches[tc.id];   // relighting a snuffed torch doesn't turn up another rat
  S.torches[tc.id] = true;
  for (const e of eyes) if (Math.hypot(e.x - tc.x, (e.y - tc.y) / ELLIPSE) < TORCH_R + 6) e.out = true;
  sfx.crackle(3);
  if (first && Math.random() < 1 / 8) {
    // something was living in that corner
    fx.push({ kind: 'rat', x: tc.x + tc.rat[0] * 4, y: tc.y + 8, vx: tc.rat[0] * rand(70, 90), vy: tc.rat[1] * 30, life: 0, max: 1.6 });
    sfx.squeak();
    say(`you light a torch in ${tc.name}. a rat bolts out of the shadows and is gone.`);
  } else {
    say(first ? `you light a torch in ${tc.name}.` : `you relight the torch in ${tc.name}.`)
  }
}

function nearLantern(x, y, pad) {
  return lanternLit() && mode !== 'lost' && Math.hypot(x - LANTERN.x, (y - LANTERN.y) / ELLIPSE) < 28 + pad;
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
    if (lightDist(x, y) < dispR + 14 || nearLantern(x, y, 10) || nearTorch(x, y, 10)) continue;
    if (spot.window && S.boards) continue;
    if (eyes.some((e) => Math.hypot(e.x - x, e.y - y) < 14)) continue;
    eyes.push({ x, y, alpha: 0, blink: rand(1.5, 5), blinkT: -1, out: false, red: Math.random() < (S.fire === 0 ? 0.3 : 0.1) });
    return;
  }
}

function eyesWanted() {
  if (mode === 'lost') return 0;   // each death draws its own
  if (mode === 'dawn' || mode === 'ended' || mode === 'day') return 0;
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
    eyeSpawn = mode === 'lost' ? 0.08 : S.fire === 0 ? rand(0.3, 0.7) : rand(1.2, 3.5);
  }
  for (const e of eyes) {
    if (mode !== 'lost') {
      if (S.fire >= 2 || live > want + 1) e.out = true;
      if (lightDist(e.x, e.y) < dispR + 4 || nearLantern(e.x, e.y, 0) || nearTorch(e.x, e.y, 0)) e.out = true;
    }
    if (mode === 'dawn' || mode === 'ended' || mode === 'lost') e.out = true;

    if (e.out) {
      e.alpha -= dt * 2.5;
    } else {
      // they open where they are and stay there, watching; the death that follows brings them closer
      e.alpha = Math.min(1, e.alpha + dt * (mode === 'lost' ? 3 : 0.9));
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
  const roaring = S.blaze > 0 || (mode === 'lost' && S.cause === 'burn');
  const w = FLAME_W[lvl] + (roaring ? 8 : 0);
  const max = 0.35 + lvl * 0.13 + rand(0, 0.15) + (roaring ? 0.5 : 0);
  particles.push({ x: FIRE.x + rand(-w, w), y: FIRE.y - rand(0, 2), vx: 0, vy: -(rand(10, 18) + lvl * 6), life: 0, max, ember: false });
}

function spawnEmber(burst) {
  particles.push({ x: FIRE.x + rand(-4, 4), y: FIRE.y - rand(2, 8), vx: rand(-6, 6), vy: -rand(14, burst ? 40 : 28), life: 0, max: rand(1.2, 2.4), ember: true });
}

function updateParticles(dt) {
  if (S.fire > 0) {
    const roaring = S.blaze > 0 || (mode === 'lost' && S.cause === 'burn');
    flameAcc += (FLAME_RATE[S.fire] + (roaring ? 260 : 0)) * dt;
    while (flameAcc >= 1) { spawnFlame(); flameAcc -= 1; }
    if (roaring && Math.random() < dt * 20) spawnEmber(true);
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

  // the meat rack: a pole on two pegs, with iron hooks
  g.fillStyle = '#2a1b10'; g.fillRect(183, 40, 2, 4); g.fillRect(229, 40, 2, 4);
  g.fillStyle = C.frame; g.fillRect(181, 41, 52, 2);
  g.fillStyle = C.frameHi; g.fillRect(181, 41, 52, 1);
  g.fillStyle = '#4a4440';
  for (let i = 0; i < 8; i++) g.fillRect(186 + i * 6, 43, 1, 2);
  // the storage shelf on two brackets, for blood, salt and whatever else you keep
  g.fillStyle = C.frame; g.fillRect(181, 66, 52, 3);
  g.fillStyle = C.frameHi; g.fillRect(181, 66, 52, 1);
  g.fillStyle = '#2a1b10'; g.fillRect(185, 69, 2, 4); g.fillRect(227, 69, 2, 4); g.fillRect(186, 72, 2, 1); g.fillRect(226, 72, 2, 1);

  // bedroll
  g.fillStyle = '#3b2e2a'; g.fillRect(238, 126, 28, 7);
  g.fillStyle = '#4a3a33'; g.fillRect(238, 126, 7, 7);
  g.fillStyle = '#2a201d'; g.fillRect(238, 132, 28, 1);

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

const dawnLevel = () => (mode === 'dawn' ? Math.min(1, dawnT / 4)
  : mode === 'lost' && S.cause === 'falseStranger' ? 1 - ease(seg(2.8, 4.8))
  : mode === 'day' || (mode === 'ended' && S.won) ? 1 : 0);

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
    px.fillStyle = blueT > 0 ? (f * glow > 0.7 ? '#8ac0ff' : f * glow > 0.45 ? '#3a6ad8' : '#1a2a6e') : f * glow > 0.7 ? '#ff7a2a' : f * glow > 0.45 ? '#c8401a' : '#6e1e10';
    px.fillRect(152 + ((i * 5) % 16), 136 + (i % 3), 2, 1);
  }
}

function drawFire() {
  for (const p of particles) {
    const t = p.life / p.max;
    if (p.ember) {
      if (t > 0.85 && Math.random() < 0.5) continue;
      px.fillStyle = blueT > 0 && Math.random() < BLUE() ? (t < 0.5 ? '#b8dcff' : '#5a8ae8') : (t < 0.5 ? '#ffb347' : '#e8551c');
      px.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      continue;
    }
    if (S.stove) continue;   // the flames are inside the iron box
    px.fillStyle = blueT > 0 && Math.random() < BLUE()
      ? (t < 0.18 ? '#f0f8ff' : t < 0.42 ? '#b8dcff' : t < 0.68 ? '#6aa8f0' : t < 0.88 ? '#3a6ad8' : '#2a3a98')   // salt: a cold blue fire
      : (t < 0.18 ? '#fff3b0' : t < 0.42 ? '#ffd35a' : t < 0.68 ? '#ff9a2e' : t < 0.88 ? '#e8551c' : '#a8281a');
    const s = t < 0.5 ? 2 : 1;
    px.fillRect(Math.round(p.x), Math.round(p.y), s, s);
  }
  if (S.fire > 0 && !S.stove) {
    px.fillStyle = blueT > 0 ? '#e8f4ff' : '#fff3b0';
    const w = FLAME_W[S.fire];
    px.fillRect(FIRE.x - w + 1, FIRE.y - 1, w * 2 - 1, 2);
  }
}

// One big pile of logs seen end-on: 7 at the base, 25 when full. Past that it gets precarious, and when it
// leans the top rows slide toward the fire.
function drawWoodPile() {
  const n = Math.min(S.wood, PILE_CAP + 4);
  const lean = pileLean >= 0 ? (3 - pileLean) / 3 : 0;
  let left = n;
  const dry = n - wetInPile();
  let drawn = 0;
  for (let row = 0, width = 7; left > 0 && row < 7; row++, width = Math.max(1, width - 1)) {
    const tilt = lean * row * row * 0.9 + (lean > 0 ? Math.sin(animT * 30 + row) * lean * row * 0.3 : 0);
    for (let i = 0; i < width && left > 0; i++, left--) {
      const x = Math.round(82 + i * 6 + row * 3 + tilt);
      const y = 142 - row * 4;
      const wet = drawn++ >= dry;
      px.fillStyle = wet ? '#2a2a30' : C.logBark; px.fillRect(x, y, 6, 5); px.fillRect(x + 1, y - 1, 4, 7);
      px.fillStyle = wet ? '#5a6672' : C.logEnd; px.fillRect(x + 1, y, 4, 5);
      px.fillStyle = wet ? '#3a4652' : C.logRing; px.fillRect(x + 2, y + 2, 2, 1);
      if (wet) { px.fillStyle = '#d8e4f0'; px.fillRect(x + 1, y - 1, 2, 1); px.fillRect(x + 4, y + 4, 1, 1); }
    }
  }
}

// The drying rack beside the fire: two posts and crossbars, wet logs leaning on it, meat strips smoking.
function drawRack() {
  if (!S.rack) return;
  R('#3a2618', 128, 96, 2, 22); R('#3a2618', 142, 96, 2, 22);
  R('#4a3222', 127, 97, 18, 1); R('#4a3222', 128, 106, 16, 1);
  const logs = Math.min(3, S.wet.length);
  for (let i = 0; i < logs; i++) { R('#2a2a30', 130 + i * 4, 108, 3, 9); R('#5a6672', 130 + i * 4, 108, 3, 1); }
  const strips = Math.min(3, S.cookedLife.filter((l) => l < CURED / 2).length);
  for (let i = 0; i < strips; i++) { R('#5a2e1c', 131 + i * 4, 98, 2, 6); R('#94522e', 131 + i * 4, 98, 1, 4); }
}

// The iron stove over the pit: a box with a glowing grate in its door and a pipe up through the roof.
function drawStove() {
  if (!S.stove) return;
  R('#1e1e22', 166, 0, 5, 122); R('#2e2e34', 166, 0, 1, 122);
  for (let y = 12; y < 120; y += 22) R('#3a3a40', 166, y, 5, 1);
  R('#1a1a1e', 146, 122, 29, 17); R('#34343a', 146, 122, 29, 1); R('#26262c', 146, 138, 29, 1);
  R('#101012', 148, 139, 3, 2); R('#101012', 170, 139, 3, 2);
  const glow = ['#2a1410', '#7a2a10', '#c8501a', '#ff7a2a', '#ffb347'][S.fire];
  R('#0c0c0e', 152, 127, 16, 8);
  for (let x = 153; x < 167; x += 3) R(S.fire && Math.random() < 0.9 ? glow : '#0c0c0e', x, 128, 2, 6);
}

// an iron grate over the pit, if you bought one
function drawGrate() {
  if (!S.grate || S.stove) return;
  px.fillStyle = '#2a2a2e';
  px.fillRect(147, 133, 26, 1);
  for (let x = 149; x < 172; x += 4) px.fillRect(x, 131, 1, 9);
  px.fillStyle = '#4a4a50'; px.fillRect(147, 132, 26, 1);
}

// The trader in the doorway: hat, long coat. When he opens it, his goods hang on hooks in the lining.
let traderOpen = 0;
function drawTrader() {
  if (visitorAtDoor !== 'trader' || door < 0.3) { traderOpen = 0; return; }
  traderOpen = Math.min(1, traderOpen + 0.04);
  const cx = 274, feet = 107;   // the coat is drawn from here; his legs reach the floor at 111
  const coat = '#2e2c30', coatHi = '#3e3b42', lining = '#3a1210', hat = '#1e1c20';
  // legs and boots
  px.fillStyle = '#141216'; px.fillRect(cx - 3, feet - 4, 2, 8); px.fillRect(cx + 1, feet - 4, 2, 8);
  px.fillStyle = '#0a0808'; px.fillRect(cx - 4, feet + 2, 3, 2); px.fillRect(cx + 1, feet + 2, 3, 2);
  // the coat, swinging open
  const half = 6 + Math.round(traderOpen * 7);
  if (traderOpen > 0.15) {
    px.fillStyle = lining; px.fillRect(cx - half + 2, feet - 24, half * 2 - 4, 21);
    // his goods on hooks
    const items = SHOP.filter((w) => !w.has() && (!w.avail || w.avail())).map((w) => w.id);
    const k = traderOpen;
    if (k > 0.6) {
      if (items.includes('grate')) { px.fillStyle = '#5a5a60'; px.fillRect(cx - 9, feet - 21, 5, 1); for (let x = cx - 9; x < cx - 4; x += 2) px.fillRect(x, feet - 21, 1, 4); }
      if (items.includes('spear')) { px.fillStyle = '#d8ccb0'; px.fillRect(cx - 2, feet - 23, 1, 15); px.fillRect(cx - 3, feet - 23, 3, 2); }
      if (items.includes('shoes')) { px.fillStyle = '#6a4a2a'; px.fillRect(cx + 4, feet - 21, 3, 6); px.fillRect(cx + 8, feet - 21, 3, 6); px.fillStyle = '#3a2a18'; px.fillRect(cx + 5, feet - 19, 1, 2); px.fillRect(cx + 9, feet - 19, 1, 2); }
      if (items.includes('salt')) { px.fillStyle = '#e4e0d8'; px.fillRect(cx - 8, feet - 13, 4, 4); px.fillStyle = '#9a9690'; px.fillRect(cx - 8, feet - 13, 4, 1); }
    }
  }
  px.fillStyle = coat;
  px.fillRect(cx - half, feet - 25, 3, 22);              // left panel
  px.fillRect(cx + half - 3, feet - 25, 3, 22);          // right panel
  if (traderOpen <= 0.15) px.fillRect(cx - 6, feet - 25, 12, 22);
  px.fillStyle = coatHi; px.fillRect(cx - half, feet - 25, 1, 22); px.fillRect(cx + half - 1, feet - 25, 1, 22);
  // shoulders, collar up, a pale chin under the hat
  px.fillStyle = coat; px.fillRect(cx - 6, feet - 27, 12, 3);
  px.fillStyle = '#c8bca8'; px.fillRect(cx - 1, feet - 29, 3, 2);
  px.fillStyle = coatHi; px.fillRect(cx - 3, feet - 30, 2, 3); px.fillRect(cx + 2, feet - 30, 2, 3);
  // the hat: a wide brim and a tall crown
  px.fillStyle = hat; px.fillRect(cx - 7, feet - 31, 15, 2); px.fillRect(cx - 4, feet - 36, 9, 5);
  px.fillStyle = '#5a1a14'; px.fillRect(cx - 4, feet - 32, 9, 1);
}

// The woodshed is built against the outside of the right wall. Inside, a small cabinet in the wall opens onto
// it, with a candle burning beside it. Click it to look in; it also opens on its own when logs go in or out.
const CABINET = { x: 297, y: 80, w: 20, h: 24 };
let cabOpen = 0;       // 0 shut .. 1 open
let cabT = 0;          // seconds it stays open by itself

function drawCabinet() {
  if (!S.shed) return;
  const { x, y, w, h } = CABINET;
  cabOpen += ((!S.cabBar && (cabT > 0 || cabHeld) ? 1 : 0) - cabOpen) * 0.18;
  R('#2a1b10', x - 1, y - 1, w + 2, h + 2);                 // the frame
  R('#0c0806', x, y, w, h);                                 // the dark inside, through to the shed
  const n = Math.min(20, Math.ceil(S.shedWood / 5));        // log ends, one per five logs
  for (let i = 0; i < n; i++) {
    const lx0 = x + 1 + (i % 4) * 5, ly0 = y + h - 5 - Math.floor(i / 4) * 4;
    R('#5a3a22', lx0, ly0, 4, 4); R('#a07a4e', lx0 + 1, ly0 + 1, 2, 2);
  }
  // two doors, swinging open toward you
  const dw = Math.round((w / 2) * (1 - cabOpen * 0.8));
  R('#3b2717', x, y, dw, h); R('#3b2717', x + w - dw, y, dw, h);
  R('#2a1b10', x + dw - 1, y, 1, h); R('#2a1b10', x + w - dw, y, 1, h);
  if (dw > 4) { R('#8a7a5a', x + dw - 3, y + 11, 1, 2); R('#8a7a5a', x + w - dw + 2, y + 11, 1, 2); }
  if (S.cabBar) { R('#4a3220', x - 2, y + 9, w + 4, 4); R('#5a3e28', x - 2, y + 9, w + 4, 1); R('#8a8a8a', x - 1, y + 10, 1, 1); R('#8a8a8a', x + w, y + 10, 1, 1); }
  if (S.saltCab) { px.fillStyle = '#d8d4cc'; for (let i = 0; i < w; i += 2) px.fillRect(x + i, y + h - 1, 1, 1); }
  // the candle on its little shelf
  R('#2a1b10', x + 7, y - 4, 7, 2);
  R('#d8ccb0', x + 9, y - 9, 3, 5);
  R(Math.sin(animT * 13) > 0 ? '#ffd35a' : '#ffb347', x + 10, y - 11, 1, 2);
}

function drawTorches() {
  for (const tc of TORCHES) {
    if (!(S.torches && S.torches[tc.id])) continue;
    const { x, y } = tc;
    R('#2a2624', x - 2, y + 3, 5, 1); R('#2a2624', x, y + 3, 1, 4);         // the iron bracket
    R('#4a3222', x, y - 3, 1, 6);                                           // the torch
    if (torchLit(tc)) {
      const f = Math.sin(animT * 11 + x) > 0;
      R('#ff9a2e', x - 1, y - 5, 3, 2); R(f ? '#ffd35a' : '#fff3b0', x, y - 6 - (f ? 1 : 0), 1, 2);
    }
  }
}

let cabHeld = false;   // opened by hand
function cabinetHit(px0, py0) {
  const { x, y, w, h } = CABINET;
  return S.shed && px0 >= x - 2 && px0 <= x + w + 2 && py0 >= y - 12 && py0 <= y + h + 2;
}

// Elk meat hanging on the rack: raw haunches (dark red, marbled with fat, a knob of bone at the top),
// cooked ones seared brown, salt-cured ones dark and flecked white. Meat about to turn goes gray-green.
const SLAB = ['..b..', '..b..', '.rRr.', 'rRfrr', 'rrRfr', 'rfRrr', 'rrrRr', '.rrr.'];
const SLAB_COLORS = {
  raw: { b: '#d8ccb0', r: '#7e1c18', R: '#a8322a', f: '#d8a090' },
  rawBad: { b: '#b8b098', r: '#5a5232', R: '#6e6a3e', f: '#a8a47a' },
  cooked: { b: '#d8ccb0', r: '#5a2e1c', R: '#94522e', f: '#c08a58' },
  cookedBad: { b: '#b8b098', r: '#3e3a22', R: '#545030', f: '#7a7450' },
  cured: { b: '#d8ccb0', r: '#4a1a14', R: '#6a2a1e', f: '#7a3a2a' },
};

// Glass vials of blood, corked. Salt in a clay crock, heaped higher the more you have.
function drawVial(x, y) {
  px.fillStyle = '#8a6a4a'; px.fillRect(x, y, 2, 1);                   // cork
  px.fillStyle = '#7a8290'; px.fillRect(x - 1, y + 1, 1, 5); px.fillRect(x + 2, y + 1, 1, 5); px.fillRect(x, y + 6, 2, 1);
  px.fillStyle = '#6a0a0a'; px.fillRect(x, y + 2, 2, 4);
  px.fillStyle = '#b02020'; px.fillRect(x, y + 2, 1, 2);
  px.fillStyle = '#c8d0dc'; px.fillRect(x - 1, y + 1, 1, 1);           // glint on the glass
}

function drawCrock(x, y, n) {
  const heap = Math.min(4, Math.ceil(n / 2));
  px.fillStyle = '#e4e0d8';
  for (let i = 0; i < heap; i++) px.fillRect(x + 1 + Math.floor(i / 2), y - 1 - i, 6 - Math.floor(i / 2) * 2 - (i % 2), 1);
  px.fillStyle = '#6a4a36'; px.fillRect(x, y, 8, 6); px.fillRect(x + 1, y + 6, 6, 1);
  px.fillStyle = '#8a6448'; px.fillRect(x, y, 8, 1); px.fillRect(x + 1, y + 1, 1, 4);
  px.fillStyle = '#4a3226'; px.fillRect(x, y + 3, 8, 1);
}

// What sits on the shelf, left to right. New goods get a line here.
const SHELF = [
  { has: () => S.blood > 0, w: () => Math.min(S.blood, 7) * 5, draw: (x) => { for (let i = 0; i < Math.min(S.blood, 7); i++) drawVial(x + 2 + i * 5, 59); } },
  { has: () => S.salt > 0, w: () => 10, draw: (x) => drawCrock(x + 1, 60, S.salt) },
];

function drawMeat() {
  const slabs = [
    ...[...S.rawLife].sort((a, b) => b - a).slice(0, 4).map((l) => (l < 30 ? 'rawBad' : 'raw')),
    ...[...S.cookedLife].sort((a, b) => b - a).slice(0, 8).map((l) => (l >= CURED / 2 ? 'cured' : l < 30 ? 'cookedBad' : 'cooked')),
  ].slice(0, 8);
  slabs.forEach((kind, i) => {
    const x = 184 + i * 6, y = 44;
    drawMap(SLAB, x, y, SLAB_COLORS[kind]);
    if (kind === 'cured') { px.fillStyle = '#ece8e0'; px.fillRect(x + 1, y + 4, 1, 1); px.fillRect(x + 3, y + 6, 1, 1); }
    if (kind === 'cooked') { px.fillStyle = '#2a140a'; px.fillRect(x + 1, y + 5, 1, 1); px.fillRect(x + 3, y + 3, 1, 1); }
    if (kind === 'raw' && Math.sin(animT * 0.5 + i * 3) > 0.7) { px.fillStyle = '#5a0a08'; px.fillRect(x + 2, y + 8 + Math.floor((animT * 2 + i) % 3), 1, 1); }   // a slow drip
  });
  let x = 183;
  for (const item of SHELF) {
    if (!item.has()) continue;
    item.draw(x);
    x += item.w() + 2;
  }
}

let trapWreck = 0;   // seconds left showing a broken trap you dragged back in

// Bear traps: iron jaws with teeth around a pan, a flat spring each side, a chain. The broken one is
// tossed down inside the door with a jaw torn back and blood on the pan.
const TRAP_COLORS = { d: '#262422', i: '#56524e', h: '#8a8682', t: '#b4b0a8', r: '#6a140c', c: '#46423e' };
const BEAR_TRAP = ['.t.t.t.t.', 'hiiiiiiih', 'ddiiiiidd'];
const BROKEN_TRAP = [
  '..........t.t..',
  '..t.t.t...hiih.',
  '.hiiiiih....ih.',
  'dhiirriihddddhd',
  'ddiiiiiiiddddd.',
  '..d.....d..c.c.',
  '..........c.c.c',
];

function drawTraps() {
  if (trapWreck > 0) drawMap(BROKEN_TRAP, 268, 136, TRAP_COLORS);
  // spare traps lying by the door until they're set outside
  for (let i = 0; i < S.traps; i++) {
    const x = 243 - (i % 2) * 10, y = 106 - Math.floor(i / 2) * 3 + (i % 2);
    drawMap(BEAR_TRAP, x, y, TRAP_COLORS);
    if (S.trapSalt && S.trapSalt[i]) { px.fillStyle = '#ece8e0'; px.fillRect(x + 2, y + 1, 1, 1); px.fillRect(x + 5, y + 2, 1, 1); px.fillRect(x + 7, y + 1, 1, 1); }
  }
}

const SPR_COLORS = { h: '#4b4650', H: '#5d5763', f: '#120d0b', e: '#c9b48a', c: '#38333e', C: '#2a2630', b: '#1d1815', s: '#7a6a5a' };

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

// People, drawn at a believable size for the room: about 38 pixels standing, in a doorway 61 tall.
// Everyone shares the same build and differs by silhouette: the stranger's long hooded cloak, the woodcutter's
// broad coat, cap, beard and axe, and the trader's tall hat and long coat (see drawTrader).
const CLOAK = { cloak: '#4b4650', hi: '#5d5763', lo: '#38333e', face: '#120d0b', eye: '#c9b48a', hand: '#7a6a5a', boot: '#1d1815' };
const CLOAK_FALSE = { ...CLOAK, cloak: '#47424c', hi: '#57515d', lo: '#36313c', eye: '#b8402c' };
const CLOAK_RISEN = { ...CLOAK, cloak: '#3e3a42', hi: '#4c4752', lo: '#2c2830', eye: '#d02814', hand: '#5a5048' };
const strangerLook = () => (S.strangerFalse ? CLOAK_FALSE : CLOAK);

const R = (c, x, y, w, h) => { px.fillStyle = c; px.fillRect(x, y, w, h); };

// the stranger standing or walking, feet at (cx, fy)
function drawCloaked(cx, fy, pal, step = -1) {
  const sway = step >= 0 ? (step % 2 ? 1 : -1) : 0;
  // boots, stepping when she walks
  R(pal.boot, cx - 4 + (sway > 0 ? -1 : 0), fy - 2, 3, 2);
  R(pal.boot, cx + 1 + (sway < 0 ? 1 : 0), fy - 2, 3, 2);
  // the cloak, wider toward the hem
  for (let y = fy - 28; y < fy - 2; y++) {
    const k = (y - (fy - 28)) / 26;
    const half = Math.round(4 + k * 3);
    const hem = y > fy - 6 ? sway : 0;
    R(pal.cloak, cx - half + hem, y, half * 2 + 1, 1);
    R(pal.lo, cx - half + hem, y, 1, 1);
    R(pal.lo, cx + half + hem, y, 1, 1);
  }
  R(pal.hi, cx - 2, fy - 26, 1, 20);           // folds
  R(pal.lo, cx + 2, fy - 24, 1, 19);
  R(pal.hand, cx - 2, fy - 18, 4, 2);          // hands clasped in front
  // the hood, the face in shadow, two pale eyes
  R(pal.cloak, cx - 4, fy - 36, 9, 9);
  R(pal.cloak, cx - 3, fy - 38, 7, 2);
  R(pal.hi, cx - 3, fy - 37, 2, 4);
  R(pal.lo, cx + 4, fy - 35, 1, 8);
  R(pal.face, cx - 2, fy - 34, 5, 6);
  R(pal.eye, cx - 1, fy - 32, 1, 1);
  R(pal.eye, cx + 2, fy - 32, 1, 1);
}

// sitting by the fire, knees drawn up, facing it (to the left): drawn row by row as a silhouette
// [left, right] edges relative to cx, from the top of the hood down to the floor
const SIT_ROWS = [
  [-2, 1], [-3, 2], [-4, 3], [-4, 3], [-5, 3], [-5, 3], [-5, 3], [-4, 3], [-4, 3],   // hood
  [-4, 4], [-5, 4], [-5, 5], [-5, 5], [-6, 5], [-6, 5],                                 // shoulders, hunched
  [-7, 5], [-9, 5], [-10, 6], [-10, 6], [-10, 6], [-10, 6], [-10, 6], [-9, 6],         // arms around her knees
  [-9, 6], [-10, 7], [-10, 7], [-11, 7], [-11, 7], [-11, 7], [-12, 8], [-12, 8],       // the cloak pooled on the floor
];
function drawCloakedSitting(cx, fy, pal) {
  const top = fy - SIT_ROWS.length;
  SIT_ROWS.forEach(([l, r], i) => {
    const y = top + i;
    R(pal.cloak, cx + l, y, r - l + 1, 1);
    R(pal.lo, cx + r, y, 1, 1);
    if (i > 9) R(pal.hi, cx - 1, y, 1, 1);                     // a fold down her back
  });
  R(pal.hi, cx - 2, top, 2, 1); R(pal.hi, cx - 3, top + 1, 2, 2);   // the light catching the hood
  R(pal.hi, cx - 9, top + 16, 5, 1);                               // and the tops of her knees
  // her face in the hood's opening, turned toward the fire
  R(pal.face, cx - 5, top + 3, 3, 5);
  R(pal.face, cx - 4, top + 8, 2, 1);
  R(pal.eye, cx - 4, top + 5, 1, 1);
  R(pal.hand, cx - 9, top + 18, 3, 2);                            // hands around her knees
  R(pal.lo, cx - 7, top + 22, 1, 7);                              // where the knees meet the cloak
  R(pal.boot, cx - 13, fy - 2, 3, 2);                             // a boot toe out from under the hem
}

// lying slumped on the floor
function drawCloakedDead(cx, fy, pal) {
  R(pal.cloak, cx - 11, fy - 6, 22, 6);
  R(pal.lo, cx - 11, fy - 1, 22, 1);
  R(pal.hi, cx - 6, fy - 6, 10, 1);
  R(pal.cloak, cx - 17, fy - 8, 7, 7);         // the hood
  R(pal.face, cx - 17, fy - 5, 3, 4);
  R(pal.boot, cx + 11, fy - 3, 4, 3);
  R(pal.hand, cx - 9, fy - 1, 3, 1);
}

// the woodcutter: broad, a red cap, a beard, an axe over his shoulder
function drawWoodcutter(cx, fy) {
  R('#1d1815', cx - 5, fy - 3, 4, 3); R('#1d1815', cx + 1, fy - 3, 4, 3);
  R('#3a3028', cx - 5, fy - 14, 4, 11); R('#3a3028', cx + 1, fy - 14, 4, 11);
  R('#3a4a3a', cx - 7, fy - 27, 14, 14);
  R('#2a3a2a', cx - 7, fy - 27, 1, 14); R('#2a3a2a', cx, fy - 25, 1, 11);
  R('#4a5a48', cx - 5, fy - 27, 3, 1);
  R('#2a1a10', cx - 7, fy - 16, 14, 2);         // belt
  R('#8a7a5a', cx - 1, fy - 16, 2, 2);
  R('#3a4a3a', cx - 9, fy - 26, 2, 11); R('#3a4a3a', cx + 7, fy - 26, 2, 11);   // arms
  R('#5a3a20', cx - 9, fy - 15, 2, 2); R('#5a3a20', cx + 7, fy - 15, 2, 2);     // mitts
  R('#8a6248', cx - 3, fy - 34, 7, 6);          // face
  R('#5a3a20', cx - 3, fy - 30, 7, 3); R('#5a3a20', cx - 2, fy - 27, 5, 1);    // beard
  R('#1a1210', cx - 2, fy - 32, 1, 1); R('#1a1210', cx + 2, fy - 32, 1, 1);
  R('#7a2a22', cx - 4, fy - 37, 9, 3); R('#9a3a2a', cx - 4, fy - 35, 9, 1);    // cap
  for (let i = 0; i < 20; i++) R('#5a3a22', cx + 8 + Math.floor(i / 7), fy - 14 - i, 1, 1);   // the axe handle
  R('#9a9a9a', cx + 9, fy - 37, 5, 3); R('#c8c8c8', cx + 13, fy - 37, 1, 3);
}

function drawStranger() {
  if (walker) {
    drawCloaked(Math.round(walker.x), Math.round(walker.y), strangerLook(), Math.floor(walker.step * 6));
    return;
  }
  if (mode === 'lost' && S.cause === 'risen') {
    // it gets up in jerks: lying, then sitting, then standing
    const jit = Math.random() < 0.3 ? 1 : 0;
    if (lossT < 0.7) drawCloakedDead(196 + jit, 140, CLOAK_RISEN);
    else if (lossT < 1.4) drawCloakedSitting(194, 139 - jit, CLOAK_RISEN);
    else if (lossT < 2.0) drawCloaked(193 + jit, 138, CLOAK_RISEN);
    return;
  }
  if (mode === 'lost' && S.cause === 'falseStranger') { drawCloaked(193, 138, CLOAK_FALSE); return; }
  if (S.stranger === 'dead' && !S.carcass && !(S.away && S.away.kind === 'drag')) {
    // slumped on the floor; if left too long, she moves
    const twitch = S.riseT > 0 && Math.random() < 0.25 ? 1 : 0;
    drawCloakedDead(196, 140 - twitch, CLOAK);
    return;
  }
  if (S.stranger !== 'inside') return;
  if (S.hatch.phase === 'taking') {
    const T = 2.6 - S.hatch.t;
    const k = ease(clamp((T - 0.8) / 1.6, 0, 1));
    if (k < 0.95) drawCloakedSitting(Math.round(lerp(194, HATCH.x + 12, k)), Math.round(lerp(139, HATCH.y + 8, k)), strangerLook());
    return;
  }
  if (dawnLevel() > 0.6) { drawCloaked(193, 138, strangerLook()); return; }
  const bob = !S.strangerFalse && Math.sin(S.time * 1.6) > 0.6 ? 1 : 0;
  const shiver = !S.strangerFalse && (S.fire === 0 || (S.cold || 0) > 60) ? (Math.random() < 0.3 ? 1 : 0) : 0;
  drawCloakedSitting(194 + shiver, 139 + bob, strangerLook());
}

function drawVisitor() {
  if (visitorAtDoor !== 'woodcutter' || door < 0.3) return;
  drawWoodcutter(272, 111);
}

// fur curtains on a rod over the window: drawn shut across it, or bunched at the sides
function drawCurtains() {
  if (!S.curtains) return;
  R('#2a1b10', 40, 33, 42, 1);
  if (S.curtainsShut) {
    for (let x = 42; x < 80; x++) {
      const fold = (x % 5 === 0) ? '#4a3626' : (x % 5 === 2 ? '#7a5e46' : '#6a5240');
      R(fold, x, 34, 1, 35);
    }
    R('#3a2a1e', 60, 34, 1, 35);
  } else {
    for (const x0 of [40, 77]) { R('#6a5240', x0, 34, 5, 36); R('#4a3626', x0 + 2, 34, 1, 36); }
  }
}

// snow drifted in under a broken window
function drawSnowPile() {
  if (!(S.snowPile > 0.02)) return;
  const h = Math.round(S.snowPile * 5);
  for (let i = 0; i < 40; i++) {
    const x = 41 + i;
    const hh = Math.max(0, Math.round(h * Math.sin((i / 40) * Math.PI) + (hash(i) - 0.5)));
    if (hh > 0) R(i % 4 === 0 ? '#c8d0dc' : '#e8ecf4', x, 112 - hh, 1, hh + 1);
  }
}

function drawBoards() {
  if (!S.boardsBuilt) return;
  const rows = [[37, 5], [48, 6], [59, 5]];
  // the board she is pulling on jerks with every pull
  const jerk = S.hand.phase === 'reach' && (S.hand.jerk || 0) > 0;
  rows.forEach(([y0, h], i) => {
    const pulled = jerk && i === S.boards - 1;
    const y = y0 + (pulled ? -1 : 0);
    if (i < S.boards) {
      px.fillStyle = '#4a3220'; px.fillRect(41 + (pulled ? (Math.random() < 0.5 ? -1 : 1) : 0), y, 40, h);
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
  const lit = S.lanternLit && !(mode === 'lost' && S.cause === 'dark');
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
  if (S.glassBroken) {
    // jagged teeth of glass left in the frame; the cross bars hang broken
    px.fillStyle = '#5a6478';
    [[45, 35, 4, 3], [45, 38, 2, 3], [73, 35, 4, 2], [75, 37, 2, 3], [45, 62, 3, 5], [74, 63, 3, 4], [52, 35, 2, 2], [66, 65, 3, 2]]
      .forEach(([x, y, w, h]) => px.fillRect(x, y, w, h));
    px.fillStyle = C.frame; px.fillRect(60, 35, 2, 12); px.fillRect(45, 50, 10, 2); px.fillRect(70, 50, 7, 2);
    return;
  }
  px.fillStyle = C.frame; px.fillRect(60, 35, 2, 32); px.fillRect(45, 50, 32, 2);
}

function drawPixels() {
  px.drawImage(bg, 0, 0);
  drawWindowSnow();
  drawBoards();
  drawCurtains();
  drawSnowPile();
  drawDoor();
  drawVisitor();
  drawTrader();
  drawLantern();
  drawMeat();
  drawTraps();
  drawHatch();
  drawSalt();
  drawWoodPile();
  drawCabinet();
  drawTorches();
  drawPitLogs();
  drawGrate();
  drawRack();
  drawCoals();
  drawStranger();
  drawFire();
  drawStove();
  drawCooking();
}

// meat on a stick over the fire, browning as it cooks
function drawCooking() {
  if (!S.cooking) return;
  if (S.stove) {
    // a pan on the stovetop
    R('#2a2a2e', 150, 120, 20, 2); R('#2a2a2e', 170, 120, 5, 1);
    for (let i = 0; i < S.cooking.n; i++) {
      const k = clamp(1 - S.cooking.t / (S.cooking.total || COOK_TIME), 0, 1);
      R(k > 0.6 ? '#5a2e1c' : '#8a2a20', 153 + i * 5, 118, 4, 2);
    }
    return;
  }
  px.fillStyle = '#3a2414';
  px.fillRect(147, 124, 1, 14); px.fillRect(173, 124, 1, 14);
  px.fillRect(146, 124, 3, 1); px.fillRect(172, 124, 3, 1);
  px.fillStyle = '#5a3a22'; px.fillRect(146, 125, 29, 1);
  const k = clamp(1 - S.cooking.t / (S.cooking.total || COOK_TIME), 0, 1);
  const lerp = (a, b) => Math.round(a + (b - a) * k);
  const col = `rgb(${lerp(140, 84)}, ${lerp(34, 44)}, ${lerp(28, 24)})`;
  for (let i = 0; i < S.cooking.n; i++) {
    const x = 153 + i * 6;
    px.fillStyle = col; px.fillRect(x, 124, 4, 4);
    px.fillStyle = k > 0.6 ? '#20100a' : '#e2cdb4'; px.fillRect(x + 1, 126, 2, 1);
  }
}

function targetRadius() {
  if (mode === 'lost' && S.cause === 'burn') return 180;
  if (mode === 'lost' && S.cause === 'dark') return 0;
  if (mode === 'lost' && S.cause === 'starve') return LIGHT_R[S.fire] * (1 - seg(0.5, 4.5) * 0.6);
  if (mode === 'lost' && S.cause === 'freeze') return LIGHT_R[S.fire] * (1 - seg(0.3, 4.6) * 0.75);
  if (!S.lit) return 5;
  if (S.fire === 0) return 6 + 10 * Math.max(0, 1 - S.deadFor / 30);
  return LIGHT_R[S.fire] * (S.stove ? 0.8 : 1) + (S.blaze > 0 ? 40 : 0);   // a stove keeps its fire boxed in
}

// draw one low-res pixel block on the light layer
function lpx(s, x, y, w, h) {
  lx.fillRect(Math.round(x * s), Math.round(y * s), Math.ceil(w * s), Math.ceil(h * s));
}

// The thing in the trees, while it is close and you are out there with it: its eyes in the treeline,
// and a grin that grows beneath them as it closes in. A full grin is the end. Half-pixel detail.
// How much of the treeline you can see: all of it normally; nothing through shut curtains; in the blizzard only a
// flicker (10%) once every three seconds on normal and hard, and nothing on insane. The 2 am calm on night 4 clears it.
function treelineView(t) {
  if (S.curtainsShut) return 0;
  if (!blizzard() || calm() || mode !== 'playing') return 1;
  if (S.diff === 'insane') return 0;
  return t % 3 < 0.35 ? 0.1 : 0;
}

function drawGrin(s, t) {
  const fake = mode === 'playing' && phantomGrin > 0 && !(S.hunter.near && S.stalk >= 0.8);
  const show = (mode === 'playing' && S.hunter.near) || (mode === 'lost' && S.cause === 'hunter') || fake;
  const k = fake ? 0.55 : clamp(S.stalk / 100, 0, 1);
  if (!show || (!fake && S.stalk < 0.8)) return;
  const dying = mode === 'lost';
  if (dying && lossT > 1.45) return;
  const wide = dying ? 1 + ease(seg(0.1, 1.3)) * 2.6 : 1;
  const red = dying ? seg(0.2, 1.0) : 0;
  const a = clamp(0.35 + 0.65 * k, 0, 1) * (dying ? 1 : treelineView(t));
  if (a <= 0.01) return;
  const cx = 55.5, ey = 56;

  // its eyes, where they always shine in the treeline, opening a little wider
  const blink = Math.sin(t * 0.8) > 0.97 ? 0.15 : 1;
  const ew = 2 + k * 0.8, eh = 1 + k * 0.5;
  const gr = (7 + k * 7) * s;
  const glow = lx.createRadialGradient(cx * s, (ey + 2) * s, 0, cx * s, (ey + 2) * s, gr);
  glow.addColorStop(0, `rgba(255, 170, 60, ${0.2 * a})`);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  lx.fillStyle = glow;
  lx.fillRect(cx * s - gr, (ey + 2) * s - gr, gr * 2, gr * 2);
  lx.fillStyle = `rgba(255, ${Math.round(190 - 150 * red)}, ${Math.round(80 - 50 * red)}, ${a * blink})`;
  lpx(s, 53 - ew, ey - eh / 2, ew, eh);
  lpx(s, 58, ey - eh / 2, ew, eh);

  // the grin, growing beneath them
  const cy = ey + 2;
  const w = 4 + k * 12;
  const curve = 0.5 + k * 2.6;
  const gap = Math.pow(k, 1.5) * 3.4 * wide;
  const lip = (u) => cy + curve * (1 - u * u) - Math.pow(Math.abs(u), 6) * curve * 0.6;   // corners hook upward
  for (let x = -w / 2; x <= w / 2; x += 0.5) {
    const u = (2 * x) / w;
    const top = lip(u);
    const open = gap * (1 - u * u);
    if (open > 0.5) {
      lx.fillStyle = `rgba(2, 1, 1, ${a})`;
      lpx(s, cx + x, top + 0.5, 0.5, open);
      if (Math.round(x * 2) % 2 === 0) {
        lx.fillStyle = `rgba(225, 215, 190, ${a * 0.9})`;
        lpx(s, cx + x, top + 0.5, 0.5, open * 0.5);
      }
    }
    lx.fillStyle = `rgba(232, 222, 196, ${a})`;
    lpx(s, cx + x, top, 0.5, 0.5);
    if (open > 0.5) lpx(s, cx + x, top + open, 0.5, 0.5);
  }
}

// The cellar hatch in the floor, front right. It is always there; on the second night it matters.
const HATCH = { x: 210, y: 116, w: 20, h: 9 };   // right under the meat rack: it comes for the smell

function drawHatch() {
  const { x, y, w, h } = HATCH;
  const hc = S.hatch;
  const lift = hc.phase === 'lift' ? hc.p : hc.phase === 'feeding' ? 1 : hc.phase === 'open' ? 1.4 : 0;
  const rattle = hc.phase === 'creak' && Math.random() < 0.4 ? 1 : 0;
  if (mode === 'lost' && (S.cause === 'cellar' || S.cause === 'cellarAway')) {
    // thrown off: the hole is open and the lid lies on the floor beside it
    px.fillStyle = '#020101'; px.fillRect(x, y, w, h);
    px.fillStyle = '#3a2618'; px.fillRect(x - 25, y + 3, w, h - 3);
    px.fillStyle = '#2a1a10'; for (let i = 5; i < w; i += 5) px.fillRect(x - 25 + i, y + 3, 1, h - 3);
    return;
  }
  // the dark below, showing as the lid rises
  if (lift > 0) { px.fillStyle = '#020101'; px.fillRect(x, y, w, h); }
  // the lid: planks and an iron ring, raised toward you as it lifts
  const lh = Math.max(2, Math.round(h * (1 - lift * 0.7)));
  const ly = y - Math.round(lift * 5) - rattle;
  px.fillStyle = '#3a2618'; px.fillRect(x, ly, w, lh);
  px.fillStyle = '#2a1a10';
  for (let i = 5; i < w; i += 5) px.fillRect(x + i, ly, 1, lh);
  px.fillStyle = '#4a3222'; px.fillRect(x, ly, w, 1);
  px.fillStyle = '#6a6460'; px.fillRect(x + w / 2 - 1, ly + Math.floor(lh / 2), 3, 1);
  // a beam nailed across it
  if (S.hatchBar) {
    px.fillStyle = '#4a3220'; px.fillRect(x - 3, ly + 2, w + 6, 3);
    px.fillStyle = '#5a3e28'; px.fillRect(x - 3, ly + 2, w + 6, 1);
    px.fillStyle = '#8a8a8a'; px.fillRect(x - 2, ly + 3, 1, 1); px.fillRect(x + w + 1, ly + 3, 1, 1);
  }
}

// salt lines across the door's threshold and the window sill
function drawSalt() {
  px.fillStyle = '#d8d4cc';
  if (S.saltHatch) {
    const { x, y, w, h } = HATCH;
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      px.fillRect(Math.round(x + w / 2 + Math.cos(a) * (w / 2 + 3)), Math.round(y + h / 2 + Math.sin(a) * (h / 2 + 2)), 1, 1);
    }
  }
  if (S.saltDoor) for (let x = 257; x < 291; x += 2) px.fillRect(x, 111, 1 + (x % 3 === 0 ? 1 : 0), 1);
  if (S.saltWin) for (let x = 45; x < 77; x += 2) px.fillRect(x, 68, 1 + (x % 3 === 0 ? 1 : 0), 1);
}

// what comes out of the hatch: pale, swollen fingers with black nails, and two eyes in the dark gap
function drawBelow(s, t) {
  const hc = S.hatch;
  const dead = mode === 'lost' && (S.cause === 'cellar' || S.cause === 'cellarAway');
  const ph = dead ? 'open' : hc.phase;
  if (ph !== 'lift' && ph !== 'feeding' && ph !== 'taking' && ph !== 'open') return;
  const { x, y, w } = HATCH;
  const k = ph === 'lift' ? hc.p : 1;
  const nail = 'rgba(20, 16, 14, 1)';
  // a sickly glow from under the floor so you can see them in the dark
  const gx = x + w / 2, gy = y + 2;
  const gr = (14 + k * 10) * s;
  const glow = lx.createRadialGradient(gx * s, gy * s, 0, gx * s, gy * s, gr);
  glow.addColorStop(0, `rgba(150, 170, 120, ${0.16 * k})`);
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  lx.fillStyle = glow;
  lx.fillRect(gx * s - gr, gy * s - gr, gr * 2, gr * 2);
  // eyes in the gap
  if (k > 0.35) {
    const blink = Math.sin(t * 1.3) > 0.96 ? 0.2 : 1;
    lx.fillStyle = `rgba(190, 220, 90, ${Math.min(1, (k - 0.35) * 2) * blink})`;
    lpx(s, x + 6, y + 3, 1.5, 0.8); lpx(s, x + 12, y + 3, 1.5, 0.8);
  }
  // fingers curling up over the front edge, more of them as it lifts
  const n = ph === 'open' ? 8 : Math.ceil(2 + k * 4);
  const fingers = [];
  for (let i = 0; i < n; i++) {
    const fx = x + 2 + (i * 2.4) % (w - 3);
    const len = (2 + k * 3 + (i % 3)) * (ph === 'open' ? 1.6 : 1);
    const wig = Math.sin(t * 7 + i) * 0.4;
    // up out of the gap to a knuckle, then hooked forward over the edge
    fingers.push([[fx, y + 1.5], [fx + wig, y + 1 - len * 0.75], [fx + wig + 0.9, y + 1 - len * 0.75 + 1.3]]);
  }
  for (const f of fingers) tubePass(s, f, [1, 0.9, 0.6], PALE_PAL.rim, 0.35);
  for (const f of fingers) tubePass(s, f, [1, 0.9, 0.6], PALE_PAL.black, 0);
  lx.fillStyle = nail;
  for (const f of fingers) lpx(s, f[2][0] - 0.3, f[2][1] - 0.2, 0.6, 0.6);
  // feeding: a long pale arm up the wall to the meat rack, and back down with it
  if (ph === 'feeding' || ph === 'taking') {
    const T = (ph === 'feeding' ? 2.4 : 2.6) - hc.t;
    const ext = T < 0.9 ? ease(T / 0.9) : T < 1.3 ? 1 : 1 - ease(clamp((T - 1.3) / 1.0, 0, 1));
    const tx = ph === 'feeding' ? 200 : 190, ty = ph === 'feeding' ? 50 : 122;
    const bx = x + w / 2, by = y + 2;
    const hx = lerp(bx, tx, ext), hy = lerp(by, ty, ext);
    // taking: a second arm hooks your ankle. both arms' outlines go down before either fill, so they merge
    const arms = [limbPath(bx, by, hx, hy, ph === 'feeding' ? 10 : -8, 2.2)];
    if (ph === 'taking') arms.push(limbPath(bx - 4, by + 1, lerp(bx - 4, 185, ext), lerp(by + 1, 127, ext), -4, 2));
    for (const a of arms) tubePass(s, a.pts, a.widths, PALE_PAL.rim, 0.45);
    for (const a of arms) tubePass(s, a.pts, a.widths, PALE_PAL.black, 0);
    claw(s, hx, hy, Math.atan2(ty - by, tx - bx), T > 1.1 ? 0.15 : 0.45, T > 1.1 ? 3.5 : 0.8, 6, PALE_PAL);
    if (ph === 'feeding' && T > 1.1 && hc.took) {
      lx.fillStyle = 'rgba(126, 28, 24, 0.95)'; lpx(s, hx - 2, hy - 1, 4, 3);
    }
  }
  // when it comes up, an arm and a swollen pale hand reaching across the floor toward the fire
  if (ph === 'open' && !dead) {
    const reach = Math.min(1, lossT * 0.6);
    const hx = x - 4 - reach * 40, hy = y + 4 - reach * 6;
    limb(s, x + 4, y + 2, hx, hy, -4, 2.4, PALE_PAL);
    claw(s, hx, hy, Math.PI, 0.4, 1.4, 5, PALE_PAL);
  }
}

function spawnDust() {
  const { x, y, w } = HATCH;
  for (let i = 0; i < 6; i++) fx.push({ kind: 'dust', x: x + rand(0, w), y: y + rand(-1, 2), vx: rand(-3, 3), vy: rand(-9, -3), life: 0, max: rand(0.8, 1.6) });
}

/* ------------------------------------------------- her, drawn */

// She is drawn on the light layer at half-pixel detail: a black silhouette with a dark-red rim,
// backlit by a red glow. Limbs are jointed (shoulder, elbow, hand) so she can reach, grab and pull.
const HER = { black: 'rgba(6, 2, 3, 0.97)', rim: 'rgba(130, 16, 12, 0.85)', nail: 'rgba(70, 8, 6, 0.95)' };

// a thick limb segment from a to b, rim first then the black core
// Limbs are drawn as round brush strokes along a path: every outline (rim) first, then every fill, so joints are
// seamless and the rim runs unbroken around elbows and shoulders.
function tubePass(s, pts, widths, color, pad) {
  lx.fillStyle = color;
  for (let k = 0; k < pts.length - 1; k++) {
    const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
    // circles every half pixel on thin strokes, further apart on thick ones (the edge stays smooth either way)
    const gap = Math.max(0.5, Math.min(widths[k], widths[k + 1]) * 0.3);
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / gap));
    for (let i = 0; i <= n; i++) {
      const f = i / n, w = widths[k] + (widths[k + 1] - widths[k]) * f;
      lx.beginPath();
      lx.arc((ax + (bx - ax) * f) * s, (ay + (by - ay) * f) * s, Math.max(0.3, w / 2 + pad) * s, 0, Math.PI * 2);
      lx.fill();
    }
  }
}
function tube(s, pts, widths, pal) {
  tubePass(s, pts, widths, pal.rim, 0.45);
  tubePass(s, pts, widths, pal.black, 0);
}

function limbSeg(s, ax, ay, bx, by, w, pal = HER) {
  tube(s, [[ax, ay], [bx, by]], [w, w], pal);
}

// shoulder to hand with the elbow pushed out to one side by `bend`: thick at the shoulder, a knob at the elbow,
// thin at the wrist, all in one stroke
function limbPath(ax, ay, bx, by, bend, w = 1.6) {
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const ex = mx + (-(by - ay) / len) * bend, ey = my + ((bx - ax) / len) * bend;
  return { ex, ey, pts: [[ax, ay], [ex, ey], [bx, by]], widths: [w, w * 1.25, w * 0.75] };
}
function limb(s, ax, ay, bx, by, bend, w = 1.6, pal = HER) {
  const p = limbPath(ax, ay, bx, by, bend, w);
  tubePass(s, p.pts, p.widths, pal.rim, 0.45);
  tubePass(s, p.pts, p.widths, pal.black, 0);
  return { ex: p.ex, ey: p.ey };
}

// four long fingers fanned around `dir`; curl closes them into a fist
function claw(s, hx, hy, dir, spread, curl, len = 5, pal = HER) {
  const pw = Math.max(1, len / 9);   // big hands get thick fingers
  // each finger as a path from the palm out, curling at the tip
  const fingers = [];
  for (let i = 0; i < 4; i++) {
    let a = dir + (i - 1.5) * spread;
    let x = hx, y = hy;
    const fl = len * (i === 1 || i === 2 ? 1.15 : 0.9);
    const pts = [[x, y]];
    for (let k = 0; k < fl; k += 0.5 * pw) {
      a += curl * 0.09 * (i < 2 ? -1 : 1) * (k > fl * 0.4 ? 1 : 0.2);   // the tips hook inward
      x += Math.cos(a) * 0.5 * pw; y += Math.sin(a) * 0.5 * pw;
      pts.push([x, y]);
    }
    fingers.push(pts);
  }
  const widthsFor = (pts) => pts.map((_, j) => 0.95 * pw * (1 - 0.55 * (j / pts.length)));
  const palm = [[hx, hy], [hx + Math.cos(dir) * 0.6 * pw, hy + Math.sin(dir) * 0.6 * pw]], palmW = [2.6 * pw, 2.4 * pw];
  // rims first, then fills, then the nails
  tubePass(s, palm, palmW, pal.rim, 0.45);
  for (const f of fingers) tubePass(s, f, widthsFor(f), pal.rim, 0.4);
  tubePass(s, palm, palmW, pal.black, 0);
  for (const f of fingers) tubePass(s, f, widthsFor(f), pal.black, 0);
  lx.fillStyle = pal.nail;
  for (const f of fingers) {
    const [x, y] = f[f.length - 1];
    lx.beginPath(); lx.arc(x * s, y * s, 0.45 * pw * s, 0, Math.PI * 2); lx.fill();
  }
}

// her head and shoulders: a long narrow skull, one huge pale eye, an empty socket, a hanging jaw, wet hair
function drawHerHead(s, t, cx, cy, sc, eyeOpen = 1) {
  // shoulders, hunched and too narrow
  const bodyTo = Math.max(11 * sc, 72 - (cy + 7 * sc));   // at the window, down past the sill (clipped there)
  // a thin neck, hunched bony shoulders, and a narrow body hanging below them: one set of strokes, rims first
  const shY = cy + 8.5 * sc;
  const parts = [
    [[[cx, cy + 5 * sc], [cx, shY]], [2.2 * sc, 2.6 * sc]],
    [[[cx - 7 * sc, shY + 3 * sc], [cx - 3 * sc, shY + 0.2 * sc], [cx + 3 * sc, shY + 0.2 * sc], [cx + 7 * sc, shY + 3 * sc]], [2.8 * sc, 3.4 * sc, 3.4 * sc, 2.8 * sc]],
    [[[cx, shY + 1.5 * sc], [cx, shY + 6 * sc], [cx, cy + 7 * sc + bodyTo]], [9 * sc, 7.5 * sc, 7 * sc]],
  ];
  for (const [pts, ws] of parts) tubePass(s, pts, ws, HER.rim, 0.5);
  for (const [pts, ws] of parts) tubePass(s, pts, ws, HER.black, 0);
  // the skull, wide at the brow and tapering to a point at the chin
  const hh = 17 * sc;
  for (let y = 0; y < hh; y += 0.5) {
    const u = y / hh;
    const half = 4.8 * sc * (u < 0.38 ? Math.sqrt(Math.max(0, 1 - ((0.38 - u) / 0.38) ** 2)) : Math.max(0.12, 1 - (u - 0.38) / 0.72));
    lx.fillStyle = HER.rim; lpx(s, cx - half - 0.5, cy - 8 * sc + y, half * 2 + 1, 0.5);
    lx.fillStyle = HER.black; lpx(s, cx - half, cy - 8 * sc + y, half * 2, 0.5);
  }
  // the eye: huge, pale, with a red pinprick pupil that wanders toward you
  const ex = cx + 1.9 * sc, ey = cy - 2 * sc;
  const eh = 2.4 * sc * eyeOpen;
  if (eh > 0.3) {
    lx.fillStyle = 'rgba(232, 224, 206, 0.95)';
    for (let y = -eh / 2; y < eh / 2; y += 0.5) {
      const w = 3.6 * sc * Math.sqrt(Math.max(0, 1 - (y / (eh / 2 + 0.01)) ** 2));
      lpx(s, ex - w / 2, ey + y, w, 0.5);
    }
    const look = Math.sin(t * 0.7) * 0.6 * sc;
    const pp = 0.9 * Math.max(1, sc * 0.45);
    lx.fillStyle = 'rgba(210, 20, 14, 1)';
    lpx(s, ex - pp / 2 + look, ey - pp / 2, pp, pp);
  } else {
    lx.fillStyle = 'rgba(232, 224, 206, 0.6)'; lpx(s, ex - 1.6 * sc, ey, 3.2 * sc, 0.5);
  }
  // the other socket, empty, with a red glint deep inside
  lx.fillStyle = 'rgba(0, 0, 0, 1)'; lpx(s, cx - 3.2 * sc, cy - 2.8 * sc, 2 * sc, 1.8 * sc);
  lx.fillStyle = 'rgba(200, 20, 12, 0.8)'; lpx(s, cx - 2.4 * sc, cy - 2.1 * sc, 0.5, 0.5);
  // the jaw hangs open, too long
  lx.fillStyle = 'rgba(40, 0, 0, 0.95)'; lpx(s, cx - 0.9 * sc, cy + 3 * sc, 1.8 * sc, 3.2 * sc);
  lx.fillStyle = 'rgba(0, 0, 0, 1)'; lpx(s, cx - 0.6 * sc, cy + 3.4 * sc, 1.2 * sc, 2.6 * sc);
  // wet hair hanging in strands over the face and shoulders
  for (let i = 0; i < 9; i++) {
    const x0 = cx + (i - 4) * 1.25 * sc;
    const len = (11 + (i % 3) * 4) * sc;
    for (let k = 0; k < len; k += 0.5) {
      const x = x0 + Math.sin(t * 1.2 + i * 1.7 + k * 0.22) * 0.5 * sc * (k / len);
      lx.fillStyle = k < len * 0.3 ? HER.black : 'rgba(10, 4, 6, 0.85)';
      lpx(s, x, cy - 7.5 * sc + k, 0.5 * Math.max(1, sc * 0.4), 0.6);
    }
  }
}

// draw something only where you can see out of the window (between the boards that are still up)
function throughWindow(s, fn) {
  lx.save();
  lx.beginPath();
  let y0 = 35;
  const rows = S.boardsBuilt ? BOARD_ROWS.slice(0, S.boards) : [];
  for (const [y, h] of rows) {
    if (y > y0) lx.rect(45 * s, y0 * s, 32 * s, (y - y0) * s);
    y0 = y + h;
  }
  if (y0 < 67) lx.rect(45 * s, y0 * s, 32 * s, (67 - y0) * s);
  lx.clip();
  fn();
  lx.restore();
}

function herGlow(s, gx, gy, radius, k) {
  const gr = radius * s;
  lx.globalCompositeOperation = 'destination-out';
  const lift = lx.createRadialGradient(gx * s, gy * s, 0, gx * s, gy * s, gr);
  lift.addColorStop(0, `rgba(0, 0, 0, ${k * 0.8})`);
  lift.addColorStop(1, 'rgba(0, 0, 0, 0)');
  lx.fillStyle = lift;
  lx.fillRect(gx * s - gr, gy * s - gr, gr * 2, gr * 2);
  lx.globalCompositeOperation = 'source-over';
  const glow = lx.createRadialGradient(gx * s, gy * s, 0, gx * s, gy * s, gr);
  glow.addColorStop(0, `rgba(210, 22, 10, ${k})`);
  glow.addColorStop(1, 'rgba(120, 0, 0, 0)');
  lx.fillStyle = glow;
  lx.fillRect(gx * s - gr, gy * s - gr, gr * 2, gr * 2);
}

const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

function drawHand(s, t) {
  if (S.curtainsShut && S.hand.phase !== 'idle' && mode === 'playing') {
    // behind the curtains: only a faint red outline of her
    lx.save();
    lx.globalAlpha = 0.22;
    drawHandBody(s, t);
    lx.restore();
    return;
  }
  drawHandBody(s, t);
  // two days awake, a phantom her has a faint double drifting around her; at three days, not even that
  if (S.hand.phantom && lvl() === 2 && S.hand.phase !== 'idle') {
    lx.save();
    lx.globalAlpha = 0.12;
    lx.translate(Math.cos(t * 1.7) * 2.2 * s, Math.sin(t * 1.7) * 1.6 * s);
    drawHandBody(s, t);
    lx.restore();
  }
}

function drawHandBody(s, t) {
  const hd = S.hand;
  const dead = mode === 'lost' && (S.cause === 'hand' || S.cause === 'handAway');
  const ph = dead ? 'crawl' : hd.phase;
  if (ph === 'idle' || (dead && lossT >= 2.1)) return;

  if (ph === 'warn') {
    // she rises into the window from below the sill, fingertips dragging down the glass
    const rise = ease(clamp((4 - hd.t) / 2.8, 0, 1));
    herGlow(s, 61, 58, 16 + rise * 6, 0.15 + rise * 0.3);
    throughWindow(s, () => {
      const cy = 76 - rise * 30;
      drawHerHead(s, t, 62, cy, 1, rise > 0.85 ? 1 : 0.25);
      if (!S.glassBroken) {
        const drag = (4 - hd.t) * 3.2;
        // her forearm, from the elbow at the end of her shoulder up to the hand on the glass; it shortens as the
        // hand claws down toward the elbow, and is gone once the hand has come down past it
        const elX = 55, elY = cy + 11.5, palmX = 54.2, palmY = 33 + drag * 0.6;
        const parts = [];
        if (palmY < elY - 1) parts.push([[[elX, elY], [palmX + 0.6, (elY + palmY) / 2], [palmX, palmY]], [2.6, 2.1, 1.7]], [[[palmX - 1.5, palmY + 0.6], [palmX + 1.5, palmY + 0.6]], [2.4, 2.4]]);
        for (let i = 0; i < 4; i++) parts.push([[[50 + i * 2.6, 34 + drag * 0.6], [50.5 + i * 2.6, 38 + drag]], [0.8, 0.7]]);
        // one outline round the whole arm and hand, then the fill, so the fingers don't read as a cage
        for (const [pts, ws] of parts) tubePass(s, pts, ws, HER.rim, 0.45);
        for (const [pts, ws] of parts) tubePass(s, pts, ws, HER.black, 0);
        lx.fillStyle = 'rgba(190, 200, 215, 0.35)';   // scratches left on the glass
        for (let i = 0; i < 4; i++) lpx(s, 50.3 + i * 2.6, 38, 0.4, drag);
      }
    });
    return;
  }

  if (ph === 'reach' || ph === 'retreat' || ph === 'tear') {
    const g = handGrip();
    const out = ph === 'retreat' ? clamp(hd.t / 0.9, 0, 1) : 1;
    herGlow(s, 61, 52, 20, ph === 'retreat' ? 0.25 : 0.5);
    // her eye presses to a gap in the boards, watching you
    throughWindow(s, () => drawHerHead(s, t, 63, 47, 1.05, ph === 'retreat' ? 0.1 : 1));
    // her forearm comes through the gap and the hand hooks down over the board, pulling
    const pull = (hd.jerk || 0) > 0 ? -0.7 : 0;
    const by = g.board[0] + pull;
    const wx = g.x + 5;
    // the forearm and every finger outlined first, then all filled, so the hand reads as one hand
    const parts = [[[[wx - 2 * out, g.y + 0.5], [wx + 2 * out, g.y + 0.5]], [2.4 * out + 0.4, 2.4 * out + 0.4]]];
    const tips = [];
    if (out > 0.25) {
      for (let i = 0; i < 4; i++) {
        const kx = wx - 3.3 + i * 2.2;
        const len = (2.5 + hd.p * 2.2 + (i === 1 || i === 2 ? 0.8 : 0)) * out;
        // knuckles over the board's top edge, then the finger down its face
        parts.push([[[kx, g.y + 1], [kx + 0.3, by + 0.5], [kx + 0.6, by + 0.5 + len]], [0.9, 0.9, 0.7]]);
        tips.push([kx + 0.35, by + 0.5 + len]);
      }
    }
    for (const [pts, ws] of parts) tubePass(s, pts, ws, HER.rim, 0.45);
    for (const [pts, ws] of parts) tubePass(s, pts, ws, HER.black, 0);
    lx.fillStyle = HER.nail;
    for (const [x, y] of tips) lpx(s, x, y, 0.6, 0.8);
    return;
  }

  if (ph === 'steal') {
    // the board is gone; her arm reaches all the way to the wood pile, grabs, and drags logs back out
    const T = STEAL_TIME - hd.t;
    const sx = 58, sy = hd.gripY || 56;
    const ext = T < 0.3 ? 0 : T < 1.1 ? ease((T - 0.3) / 0.8) : T < 1.4 ? 1 : 1 - ease(clamp((T - 1.4) / 1.0, 0, 1));
    const tx = 114, ty = 135;
    const hx = sx + (tx - sx) * ext, hy = sy + (ty - sy) * ext;
    herGlow(s, 61, 52, 22, 0.5);
    throughWindow(s, () => drawHerHead(s, t, 63, 47, 1.05, 1));
    // even at full stretch the elbow keeps a crook, so it reads as an arm and not a pole
    limb(s, sx, sy, hx, hy, -14 * Math.sin(Math.PI * Math.min(1, ext * 1.1)) - 7 * ext, 2.8);
    const closed = T >= 1.15;
    const dir = Math.atan2(ty - sy, tx - sx);
    if (closed && hd.got > 0) {
      for (let i = 0; i < Math.min(3, hd.got); i++) {
        lx.fillStyle = 'rgba(160, 122, 78, 0.95)'; lpx(s, hx - 2 + i * 1.6, hy - 1 + (i % 2), 2.6, 2.2);
        lx.fillStyle = 'rgba(90, 58, 34, 0.95)'; lpx(s, hx - 1.4 + i * 1.6, hy - 0.4 + (i % 2), 1.2, 1);
      }
    }
    claw(s, hx, hy, dir, closed ? 0.18 : 0.42, closed ? 3.5 : 0.6, 5.5);
    return;
  }

  // a bare window: she pulls herself through, head first, long arms reaching down the wall to the floor
  const p = dead ? 1 + Math.min(1, lossT * 0.45) : hd.p;
  const hx = 62 + p * 4, hy = 46 + p * 13, sc = 1.1 + p * 0.45;
  herGlow(s, hx, hy, 30 + p * 12, 0.55);
  drawHerHead(s, t, hx, hy, sc, 1);
  for (const side of [-1, 1]) {
    const shx = hx + side * 5 * sc, shy = hy + 9 * sc;
    const reach = Math.min(1, p);
    const handX = shx + side * (9 + reach * 9);
    const handY = 66 + reach * 46 + Math.sin(t * 5 + side) * 0.6;
    limb(s, shx, shy, handX, handY, side * (11 + reach * 4), 1.6 * sc);   // elbows jut up and out, like a spider's; as thick as she is big
    claw(s, handX, handY, Math.PI / 2 + side * 0.25, 0.45, 2.6, 6);
  }
}

/* ------------------------------------------------- small effects: shards, smoke, a falling board, wind */

let fx = [];

function spawnShards() {
  for (let i = 0; i < 30; i++) {
    fx.push({ kind: 'shard', x: rand(46, 76), y: rand(36, 66), vx: rand(6, 46), vy: rand(-18, 6), life: 0, max: rand(3, 5), floor: rand(116, 152) });
  }
}

function spawnSmoke(x, y) {
  for (let i = 0; i < 12; i++) fx.push({ kind: 'smoke', x: x + rand(-2, 2), y: y + rand(-1, 2), vx: rand(-4, 4), vy: rand(-14, -5), life: 0, max: rand(0.8, 1.8) });
}

// the bone spear, out in the trees: a pale streak into its eyes, and a red burst where it goes in
function spawnSpear() {
  fx.push({ kind: 'spear', x: 44, y: 66, tx: 55.5, ty: 56.5, life: 0, max: 1.4 });
}

// a burning branch jammed into her hand: flames flare up and curl off into smoke
function spawnBurn(x, y) {
  for (let i = 0; i < 26; i++) fx.push({ kind: 'burn', x: x + rand(-2.5, 2.5), y: y + rand(-1, 1.5), vx: rand(-6, 6), vy: rand(-26, -10), life: 0, max: rand(0.9, 1.6) });
  for (let i = 0; i < 10; i++) fx.push({ kind: 'ember', x: x + rand(-2, 2), y, vx: rand(-18, 18), vy: rand(-30, -8), life: 0, max: rand(0.5, 1.1) });
}

function spawnBoardOut(row) {
  fx.push({ kind: 'board', out: true, x: 61, y: row[0] + row[1] / 2, vx: -26, vy: -8, rot: 0, vr: rand(-1.5, -0.5), life: 0, max: 0.9, floor: 999, h: row[1] });
}

function spawnBoardFall(row) {
  fx.push({ kind: 'board', x: 61, y: row[0] + row[1] / 2, vx: rand(14, 24), vy: -12, rot: 0, vr: rand(2, 4), life: 0, max: 4, floor: rand(128, 146), h: row[1] });
}

function updateFx(dt) {
  // wind blows snow in through the broken window: a little through boards, a lot through a bare frame
  if (S.glassBroken && !S.curtainsShut && (mode === 'playing' || mode === 'dawn')) {
    const rate = (S.boards > 0 ? 4 : 11) * (blizzard() && !calm() ? 2 : 1);
    if (Math.random() < rate * dt) fx.push({ kind: 'flake', x: rand(46, 76), y: rand(36, 66), vx: rand(20, 42), vy: rand(3, 12), life: 0, max: rand(1.6, 3.2), ph: rand(0, 6) });
  }
  for (const f of fx) {
    f.life += dt;
    if (f.kind === 'shard' || f.kind === 'board') {
      if (f.out) { f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt; f.vx *= 0.97; continue; }
      if (f.y < f.floor) {
        f.vy += 70 * dt;
        f.x += f.vx * dt; f.y += f.vy * dt;
        if (f.kind === 'board') f.rot += f.vr * dt;
        if (f.y >= f.floor) { f.y = f.floor; f.vx = f.vy = 0; f.vr = 0; }
      }
    } else if (f.kind === 'spear') {
      // drawn from its start and target
    } else if (f.kind === 'gobIn' || f.kind === 'gobOut') {
      // drawn from their start and life
    } else if (f.kind === 'rat') {
      f.x += f.vx * dt; f.y += f.vy * dt;
    } else if (f.kind === 'burn' || f.kind === 'ember') {
      f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.95;
      if (f.kind === 'ember') f.vy += 30 * dt;
    } else if (f.kind === 'smoke' || f.kind === 'dust') {
      f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= 0.98;
    } else {
      f.x += f.vx * dt + Math.sin(f.life * 4 + f.ph) * 0.3; f.y += f.vy * dt;
    }
  }
  fx = fx.filter((f) => f.life < f.max);
}

function drawFx(s) {
  for (const f of fx) {
    const a = clamp(1 - f.life / f.max, 0, 1);
    if (f.kind === 'shard') {
      lx.fillStyle = `rgba(200, 220, 240, ${0.85 * Math.min(1, a * 2)})`;
      lpx(s, f.x, f.y, 0.5 + (f.x % 1 > 0.5 ? 0.5 : 0), 0.5);
    } else if (f.kind === 'smoke') {
      lx.fillStyle = `rgba(110, 104, 100, ${0.45 * a})`;
      lpx(s, f.x - 1, f.y - 1, 2 + f.life * 2, 2 + f.life * 2);
    } else if (f.kind === 'gobIn') {
      // a goblin-shaped shadow crumbling in through the door, gone in half a second
      const k = f.life / f.max;
      drawGoblin(s, lerp(274, 250, k), lerp(110, 124, k), 1.1, -1, 0.9 * (1 - k), false);
      lx.fillStyle = `rgba(60, 50, 40, ${0.6 * (1 - k)})`;
      for (let i = 0; i < 6; i++) lpx(s, lerp(274, 250, k) + hash(i) * 8 - 4, 114 + hash(i + 3) * 8 * k, 0.6, 0.6);
    } else if (f.kind === 'gobOut') {
      const k = f.life / f.max;
      drawGoblin(s, lerp(f.from.x, 274, k), lerp(f.from.y + 6, 110, k), 1, f.from.x < 274 ? 1 : -1, 1 - k);
    } else if (f.kind === 'rat') {
      const dir = Math.sign(f.vx), bob = Math.sin(f.life * 40) > 0 ? 0.5 : 0;
      lx.fillStyle = 'rgba(46, 36, 32, 1)';
      lpx(s, f.x - 1.5, f.y - 1 - bob, 3, 1.5);
      lpx(s, f.x + dir * 1.5, f.y - 0.5 - bob, 1, 1);                       // its head
      lx.fillStyle = 'rgba(120, 90, 80, 0.9)';
      lpx(s, f.x - dir * 3.5, f.y - 0.5, 2, 0.5);                           // its tail
    } else if (f.kind === 'spear') {
      const k = clamp(f.life / 0.25, 0, 1);
      const x = lerp(f.x, f.tx, k), y = lerp(f.y, f.ty, k);
      lx.fillStyle = `rgba(232, 222, 196, ${a})`;
      for (let i = 0; i < 6; i++) lpx(s, x - (f.tx - f.x) * 0.06 * i, y - (f.ty - f.y) * 0.06 * i, 0.6, 0.6);
      if (k >= 1) {
        const r = (2 + f.life * 6) * s;
        const g = lx.createRadialGradient(f.tx * s, f.ty * s, 0, f.tx * s, f.ty * s, r);
        g.addColorStop(0, `rgba(200, 20, 10, ${0.8 * a})`);
        g.addColorStop(1, 'rgba(120, 0, 0, 0)');
        lx.fillStyle = g;
        lx.fillRect(f.tx * s - r, f.ty * s - r, r * 2, r * 2);
      }
    } else if (f.kind === 'burn') {
      // flame first (bright, small), then gray smoke (bigger, fading)
      const k = f.life / f.max;
      if (k < 0.35) {
        lx.globalCompositeOperation = 'lighter';
        lx.fillStyle = k < 0.12 ? 'rgba(255, 240, 170, 0.9)' : k < 0.24 ? 'rgba(255, 170, 50, 0.85)' : 'rgba(230, 80, 20, 0.75)';
        lpx(s, f.x - 0.5, f.y - 0.5, 1.2 - k, 1.4 - k);
        lx.globalCompositeOperation = 'source-over';
      } else {
        lx.fillStyle = `rgba(100, 94, 90, ${0.5 * (1 - k)})`;
        lpx(s, f.x - 1, f.y - 1, 1 + k * 3, 1 + k * 3);
      }
    } else if (f.kind === 'ember') {
      lx.fillStyle = `rgba(255, 150, 60, ${a})`;
      lpx(s, f.x, f.y, 0.5, 0.5);
    } else if (f.kind === 'dust') {
      lx.fillStyle = `rgba(170, 150, 120, ${0.5 * a})`;
      lpx(s, f.x, f.y, 0.6, 0.6);
    } else if (f.kind === 'flake') {
      lx.fillStyle = `rgba(225, 235, 255, ${0.55 * a})`;
      lpx(s, f.x, f.y, 0.5, 0.5);
    } else if (f.kind === 'board') {
      lx.save();
      if (f.out) { lx.beginPath(); lx.rect(42 * s, 32 * s, 38 * s, 38 * s); lx.clip(); }   // dragged out through the frame
      lx.globalAlpha = Math.min(1, a * 3);
      lx.translate(f.x * s, f.y * s);
      lx.rotate(f.rot);
      lx.fillStyle = 'rgba(74, 50, 32, 1)'; lx.fillRect(-20 * s, (-f.h / 2) * s, 40 * s, f.h * s);
      lx.fillStyle = 'rgba(90, 62, 40, 1)'; lx.fillRect(-20 * s, (-f.h / 2) * s, 40 * s, s);
      lx.restore();
    }
  }
  // faint streaks of wind through the broken window
  if (S.glassBroken && mode === 'playing') {
    const k = S.boards > 0 ? 0.04 : 0.08;
    for (let i = 0; i < 4; i++) {
      const ph = (animT * 0.9 + i * 0.27) % 1;
      lx.fillStyle = `rgba(200, 215, 255, ${k * Math.sin(ph * Math.PI)})`;
      lpx(s, 70 + ph * 50, 40 + i * 6 + ph * 10, 8, 0.5);
    }
  }
}

function drawLight() {
  const s = light.width / W;
  const t = animT;
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
    const bl = BLUE();
    const mix = (a, b) => Math.round(a + (b - a) * bl);
    g.addColorStop(0, `rgba(${mix(255, 120)}, ${mix(150, 170)}, ${mix(60, 255)}, ${k})`);
    g.addColorStop(0.5, `rgba(${mix(220, 70)}, ${mix(90, 110)}, ${mix(30, 220)}, ${k * 0.5})`);
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    lx.fillStyle = g;
    lx.fillRect(-r * s, -r * s, r * s * 2, r * s * 2);
  }
  lx.restore();

  // salt on the fire: a cold white-blue flare that fills the room for a moment
  if (flareT > 0) {
    const k = flareT / 1.4;
    const fr = (60 + 140 * (1 - k)) * s;
    lx.save();
    lx.globalCompositeOperation = 'destination-out';
    let fg = lx.createRadialGradient(FIRE.x * s, LIGHT_Y * s, 0, FIRE.x * s, LIGHT_Y * s, fr);
    fg.addColorStop(0, `rgba(0,0,0,${0.95 * k})`);
    fg.addColorStop(1, 'rgba(0,0,0,0)');
    lx.fillStyle = fg;
    lx.fillRect(0, 0, light.width, light.height);
    lx.globalCompositeOperation = 'lighter';
    fg = lx.createRadialGradient(FIRE.x * s, LIGHT_Y * s, 0, FIRE.x * s, LIGHT_Y * s, fr);
    fg.addColorStop(0, `rgba(200, 225, 255, ${0.35 * k})`);
    fg.addColorStop(1, 'rgba(0,0,0,0)');
    lx.fillStyle = fg;
    lx.fillRect(0, 0, light.width, light.height);
    lx.restore();
  }

  // the corner torches: a faint warm pool each
  for (const tc of TORCHES) {
    if (!torchLit(tc)) continue;
    const tr = (TORCH_R + Math.sin(t * 7 + tc.x) * 0.8) * s;
    lx.save();
    lx.translate(tc.x * s, tc.y * s);
    lx.scale(1, ELLIPSE);
    lx.globalCompositeOperation = 'destination-out';
    let tg = lx.createRadialGradient(0, 0, 0, 0, 0, tr);
    tg.addColorStop(0, 'rgba(0,0,0,0.78)');
    tg.addColorStop(0.5, 'rgba(0,0,0,0.42)');
    tg.addColorStop(1, 'rgba(0,0,0,0)');
    lx.fillStyle = tg;
    lx.fillRect(-tr, -tr, tr * 2, tr * 2);
    lx.globalCompositeOperation = 'lighter';
    tg = lx.createRadialGradient(0, 0, 0, 0, 0, tr * 0.8);
    tg.addColorStop(0, 'rgba(255, 150, 60, 0.12)');
    tg.addColorStop(1, 'rgba(0,0,0,0)');
    lx.fillStyle = tg;
    lx.fillRect(-tr, -tr, tr * 2, tr * 2);
    lx.restore();
  }

  // the candle by the woodshed cabinet
  if (S.shed && S.lit) {
    const cx = CABINET.x + 10.5, cy = CABINET.y + 2;
    const cr = (21 + Math.sin(t * 9) * 0.8) * s;
    lx.save();
    lx.globalCompositeOperation = 'destination-out';
    let cg = lx.createRadialGradient(cx * s, cy * s, 0, cx * s, cy * s, cr);
    cg.addColorStop(0, 'rgba(0,0,0,0.8)');
    cg.addColorStop(0.5, 'rgba(0,0,0,0.5)');
    cg.addColorStop(1, 'rgba(0,0,0,0)');
    lx.fillStyle = cg;
    lx.fillRect(cx * s - cr, cy * s - cr, cr * 2, cr * 2);
    lx.globalCompositeOperation = 'lighter';
    cg = lx.createRadialGradient(cx * s, cy * s, 0, cx * s, cy * s, cr);
    cg.addColorStop(0, 'rgba(255, 170, 70, 0.18)');
    cg.addColorStop(1, 'rgba(0,0,0,0)');
    lx.fillStyle = cg;
    lx.fillRect(cx * s - cr, cy * s - cr, cr * 2, cr * 2);
    lx.restore();
  }

  // the firelight catches the meat rack and the shelf on the back wall, so you can see what you have
  if (S.lit && S.fire > 0 && mode !== 'lost') {
    const k = 0.18 + S.fire * 0.07;
    lx.save();
    lx.globalCompositeOperation = 'destination-out';
    const sg = lx.createRadialGradient(207 * s, 56 * s, 0, 207 * s, 56 * s, 34 * s);
    sg.addColorStop(0, `rgba(0, 0, 0, ${k})`);
    sg.addColorStop(1, 'rgba(0, 0, 0, 0)');
    lx.fillStyle = sg;
    lx.fillRect(170 * s, 20 * s, 74 * s, 72 * s);
    lx.restore();
  }

  // the blood lantern's red pool by the door
  if (lanternLit() && !(mode === 'lost' && S.cause === 'dark')) {
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
    if (v) {
      lx.fillStyle = 'rgba(10, 4, 4, 0.95)';
      const shift = Math.sin(t * 2) > 0 ? 1 : 0;
      for (const fx of FEET_AT[v.feet ?? 2]) lpx(s, fx + shift, 110, 4, 1.5);
    }
  }

  // the blizzard: a white-out beyond the window, snow driving past
  if (blizzard() && !calm() && !S.curtainsShut && mode === 'playing') {
    // it's still the middle of the night: a dim gray white, snow driving past (only where the boards don't cover it)
    throughWindow(s, () => {
      lx.fillStyle = 'rgba(70, 78, 92, 0.42)';
      lx.fillRect(45 * s, 35 * s, 32 * s, 32 * s);
      lx.fillStyle = 'rgba(190, 198, 212, 0.38)';
      for (let i = 0; i < 18; i++) {
        const y = 35 + hash(i) * 32, x = 45 + ((hash(i + 9) * 40 + t * (60 + hash(i + 4) * 40)) % 44) - 6;
        lpx(s, x, y, 4 + hash(i + 2) * 5, 0.5);
      }
    });
  }
  // snow drifted under the window, pale even in the dark
  if (S.snowPile > 0.02) {
    const h = S.snowPile * 5;
    lx.fillStyle = 'rgba(225, 232, 244, 0.55)';
    for (let i = 0; i < 40; i++) {
      const hh = h * Math.sin((i / 40) * Math.PI);
      if (hh > 0.4) lpx(s, 41 + i, 112 - hh, 1, hh + 1);
    }
  }
  // the fur curtains, just visible
  if (S.curtains) {
    lx.save();
    lx.globalCompositeOperation = 'destination-out';
    lx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    if (S.curtainsShut) lpx(s, 42, 34, 38, 35);
    else { lpx(s, 40, 34, 5, 36); lpx(s, 77, 34, 5, 36); }
    lx.restore();
  }
  // frost creeping in from the corners as the house gets cold
  if (blizzard() && S.room > 35 && mode === 'playing') {
    const k = clamp((S.room - 35) / 60, 0, 1);
    // a pale glaze in each corner, and branching frost growing out of it along both walls
    for (const [cx0, cy0, dx, dy] of [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]]) {
      const gr = (20 + 50 * k) * s;
      const gz = lx.createRadialGradient(cx0 * s, cy0 * s, 0, cx0 * s, cy0 * s, gr);
      gz.addColorStop(0, `rgba(210, 225, 245, ${0.28 * k})`);
      gz.addColorStop(1, 'rgba(210, 225, 245, 0)');
      lx.fillStyle = gz;
      lx.fillRect(cx0 * s - gr, cy0 * s - gr, gr * 2, gr * 2);
      lx.fillStyle = `rgba(230, 240, 252, ${0.5 * k})`;
      for (let i = 0; i < 34; i++) {
        const along = hash(i + cx0 + cy0) * (24 + 40 * k), onX = i % 2 === 0;
        let x = cx0 + (onX ? along * dx : 0), y = cy0 + (onX ? 0 : along * dy);
        const ang = (onX ? Math.PI / 2 : 0) + (hash(i * 7) - 0.5) * 0.9;
        const len = (5 + hash(i * 3 + cy0) * 18) * k;
        for (let d = 0; d < len; d += 0.75) {
          x += Math.cos(ang) * dx * 0.75; y += Math.sin(ang) * dy * 0.75;
          lpx(s, x, y, 0.5, 0.5);
          if (Math.round(d * 4) % 6 === 0) { lpx(s, x + dx, y, 0.5, 0.5); lpx(s, x, y + dy, 0.5, 0.5); }
        }
      }
    }
  }
  // your breath, when you're cold
  if (blizzard() && S.cold >= 50 && !S.away && mode === 'playing') {
    const k = (t % 2.4) / 2.4;
    if (k < 0.7) {
      const r = (4 + k * 14) * s, by = (172 - k * 18) * s;
      const g2 = lx.createRadialGradient(160 * s, by, 0, 160 * s, by, r);
      g2.addColorStop(0, `rgba(230, 236, 245, ${0.25 * (1 - k / 0.7)})`);
      g2.addColorStop(1, 'rgba(230, 236, 245, 0)');
      lx.fillStyle = g2;
      lx.fillRect(160 * s - r, by - r, r * 2, r * 2);
    }
  }

  // smoke from wet wood, collecting under the roof and drifting over the top of the window (looks only)
  if (S.smoke > 0.02) {
    lx.save();
    lx.globalCompositeOperation = 'source-over';
    for (let x = 0; x < W; x += 2) {
      const y = 10 + S.smoke * 34 + Math.sin(x * 0.06 + t * 0.7) * 4 + Math.sin(x * 0.17 - t * 1.1) * 2;
      lx.fillStyle = `rgba(52, 48, 46, ${0.62 * Math.min(1, S.smoke * 1.4)})`;
      lpx(s, x, 0, 2, y);
      lx.fillStyle = `rgba(70, 64, 60, ${0.3 * S.smoke})`;
      lpx(s, x, y, 2, 3);
    }
    lx.restore();
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

  // dread: the dark itself pressing in from the edges (red is kept for when you're about to die)
  if (S.dread > 40 && mode === 'playing') {
    const k = ((S.dread - 40) / 60) * (0.75 + 0.25 * Math.sin(t * 4));
    const vg = lx.createRadialGradient(light.width / 2, light.height / 2, light.height * 0.35, light.width / 2, light.height / 2, light.width * 0.65);
    vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vg.addColorStop(1, `rgba(0, 0, 0, ${0.55 * k})`);
    lx.fillStyle = vg;
    lx.fillRect(0, 0, light.width, light.height);
  }

  lx.globalCompositeOperation = 'source-over';

  // the hunter's eyes, shining in the treeline
  // (while you're out and it is closing in, its eyes are part of its face instead; see drawGrin)
  const view = treelineView(t);
  if (hunterEyes > 0.02 && view > 0 && !(S.stalk > 0.8 && (S.hunter.near || mode === 'lost'))) {
    const blink = (Math.sin(t * 0.9) > 0.95 ? 0.15 : 1) * view;
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
    eyePair(s, e.x, e.y, 1, lid * Math.min(1, a * 1.5), e.red, a);   // the same slitted eyes the dark kills you with
  }

  // the tall thing in the doorway
  if (figure > 0 && door > 0.3) {
    // stopped dead at the salt line: too tall for the door, head bent under the lintel, then gone
    asLayer(Math.min(1, figure), () => inDoorway(s, () => tallThing(s, t, 274, 111, 60, {
      pal: MIMIC_PAL, tilt: 1.2, reach: 0.8, mouth: 0.6, eyes: 'rgba(235, 235, 255, 0.95)',
    })));
  }

  drawHand(s, t);
  drawBelow(s, t);
  drawGoblins(s, t);
  drawFx(s);
  drawGrin(s, t);

  // the edges of the screen: a sickly green when you're starving, and red only when something is about to kill you
  const doom = mode === 'playing' && aboutToDie();
  if (doom || (S.hunger >= 90 && (mode === 'playing' || (mode === 'lost' && S.cause === 'starve')))) {
    const k = doom ? 0.75 + 0.25 * Math.sin(t * 14) : clamp((S.hunger - 90) / 10, 0.15, 1) * (0.85 + 0.15 * Math.sin(t * 3));
    const bw = (0.05 + 0.1 * k) * light.height;
    const rgb = doom ? '190, 14, 10' : '70, 120, 30';
    const col = `rgba(${rgb}, ${0.18 + 0.22 * k})`;
    const edge = (x0, y0, x1, y1, x, y, w, h) => {
      const g2 = lx.createLinearGradient(x0, y0, x1, y1);
      g2.addColorStop(0, col);
      g2.addColorStop(1, `rgba(${rgb}, 0)`);
      lx.fillStyle = g2;
      lx.fillRect(x, y, w, h);
    };
    edge(0, 0, 0, bw, 0, 0, light.width, bw);
    edge(0, light.height, 0, light.height - bw, 0, light.height - bw, light.width, bw);
    edge(0, 0, bw, 0, 0, 0, bw, light.height);
    edge(light.width, 0, light.width - bw, 0, light.width - bw, 0, bw, light.height);
  }

  // freezing: a white-blue frost border closing in
  if (S.cold >= 85 && (mode === 'playing' || (mode === 'lost' && S.cause === 'freeze'))) {
    const k = clamp((S.cold - 85) / 15, 0.15, 1) * (0.85 + 0.15 * Math.sin(t * 2));
    const bw = (0.05 + 0.1 * k) * light.height;
    const col = `rgba(200, 222, 245, ${0.16 + 0.24 * k})`;
    const edge = (x0, y0, x1, y1, x, y, w, h) => {
      const g2 = lx.createLinearGradient(x0, y0, x1, y1);
      g2.addColorStop(0, col);
      g2.addColorStop(1, 'rgba(200, 222, 245, 0)');
      lx.fillStyle = g2;
      lx.fillRect(x, y, w, h);
    };
    edge(0, 0, 0, bw, 0, 0, light.width, bw);
    edge(0, light.height, 0, light.height - bw, 0, light.height - bw, light.width, bw);
    edge(0, 0, bw, 0, 0, 0, bw, light.height);
    edge(light.width, 0, light.width - bw, 0, light.width - bw, 0, bw, light.height);
  }

  // sick from raw meat: a faint sour-green cast
  if (S.sick > 0 && mode === 'playing') {
    lx.fillStyle = `rgba(50, 80, 20, ${0.1 * Math.min(1, S.sick / 25) * (0.8 + 0.2 * Math.sin(t * 1.7))})`;
    lx.fillRect(0, 0, light.width, light.height);
  }

  // dozing off: your eyes close, then open again
  if (doze > 0 && mode === 'playing') {
    const k = doze > dozeLen - 0.4 ? (dozeLen - doze) / 0.4 : doze < 0.4 ? doze / 0.4 : 1;
    lx.fillStyle = `rgba(0, 0, 0, ${0.92 * clamp(k, 0, 1)})`;
    lx.fillRect(0, 0, light.width, light.height);
  }

  drawBloodMoon(s, t);
  drawDeath(s, t);
}

/* ------------------------------------------------------------- deaths */

// Every way to die has its own few seconds before the red screen. lossT runs from 0 when you die.
const DEATH_LEN = {
  dark: 6.4, starve: 5.6, burn: 5.8, mimic: 5.4, hand: 5.2, handAway: 5.2, hunter: 5.6,
  risen: 5.6, cellar: 5.2, cellarAway: 5.2, falseStranger: 5.6, freeze: 5.6, lost: 5.6, sleep: 5, guest: 5.2, goblins: 5.4, bloodHour: 5.4, flood: 5.6, ash: 5.4,
};
const deathLen = () => DEATH_LEN[S.cause] || 4;
const seg = (a, b) => clamp((lossT - a) / (b - a), 0, 1);   // progress 0..1 through one stretch of a death
const lerp = (a, b, k) => a + (b - a) * k;

const MIMIC_PAL = { black: 'rgba(3, 3, 6, 0.98)', rim: 'rgba(40, 52, 78, 0.8)', nail: 'rgba(20, 20, 30, 1)' };
const MIMIC_IN_PAL = { black: 'rgba(22, 15, 15, 0.99)', rim: 'rgba(120, 62, 34, 0.95)', nail: 'rgba(10, 6, 6, 1)' };   // in the firelight
const RISEN_PAL = { black: 'rgba(24, 16, 18, 0.99)', rim: 'rgba(130, 40, 24, 0.95)', nail: 'rgba(60, 8, 6, 1)' };
const SHADOW_PAL = { black: 'rgba(0, 0, 0, 1)', rim: 'rgba(0, 0, 0, 1)', nail: 'rgba(0, 0, 0, 1)' };
const PALE_PAL = { black: 'rgba(74, 80, 64, 0.96)', rim: 'rgba(132, 140, 112, 0.55)', nail: 'rgba(22, 18, 14, 1)' };

// sounds, each fired once when lossT passes its time
const DEATH_CUES = {
  dark: [[1.1, () => sfx.heartbeat(0.5)], [2.55, () => sfx.heartbeat(0.8)], [3.95, () => sfx.heartbeat(1.1)], [4.25, () => sfx.breath()]],
  starve: [[0.3, () => sfx.heartbeat(0.9)], [1.5, () => sfx.heartbeat(0.7)], [2.9, () => sfx.heartbeat(0.5)], [4.5, () => sfx.heartbeat(0.3)]],
  burn: [[0.05, () => sfx.roar()], [1.3, () => sfx.crack()], [2.6, () => sfx.roar()], [3.25, () => { sfx.crack(); sfx.thump(1); shake = 0.5; for (let i = 0; i < 40; i++) spawnEmber(true); }]],
  mimic: [[0, () => sfx.slam()], [1.35, () => sfx.crack()], [2.2, () => sfx.crack()], [2.8, () => sfx.growl(1.2)], [3.4, () => sfx.footsteps(3)]],
  hand: [[0.1, () => sfx.scratch()], [1.2, () => sfx.scratch()], [2.1, () => sfx.scream()], [2.6, () => sfx.scratch()]],
  hunter: [[0, () => sfx.growl(1.4)], [1.45, () => sfx.scream()], [2.0, () => sfx.drag()], [3.3, () => { sfx.gust(); }]],
  risen: [[0.7, () => sfx.crack()], [1.4, () => sfx.crack()], [2.1, () => sfx.breath()], [2.9, () => sfx.growl(1.1)], [3.1, () => sfx.footsteps(4)]],
  cellar: [[0, () => sfx.slam()], [1.0, () => sfx.scratch()], [2.9, () => { sfx.drag(); sfx.thump(1); shake = 0.3; }]],
  falseStranger: [[0.7, () => sfx.crack()], [1.8, () => sfx.breath()], [3.2, () => sfx.growl(1.3)]],
  bloodHour: [[0, () => sfx.slam()], [0.6, () => sfx.growl(1.6)], [2.0, () => sfx.scream()]],
  ash: [[0, () => sfx.slam()], [1.2, () => sfx.crack()], [2.4, () => sfx.growl(1)]],
  flood: [[0, () => sfx.scuttle()], [0.3, () => sfx.scuttle()], [0.6, () => sfx.scuttle()], [0.9, () => sfx.scuttle()], [1.2, () => sfx.scuttle()], [1.6, () => sfx.scream()]],
  guest: [[0.1, () => sfx.scuttle()], [1.2, () => sfx.scuttle()], [2.4, () => sfx.growl(0.8)]],
  goblins: [[0.1, () => sfx.scuttle()], [0.5, () => sfx.scuttle()], [1.1, () => sfx.scuttle()], [2.2, () => sfx.growl(1.3)], [2.6, () => sfx.scream()]],
  lost: [[0, () => sfx.gust()], [1.3, () => sfx.gust()], [2.6, () => sfx.gust()], [3.6, () => sfx.howl()]],
  freeze: [[0.1, () => sfx.gust()], [0.6, () => sfx.heartbeat(0.7)], [2.0, () => sfx.heartbeat(0.45)], [3.6, () => sfx.heartbeat(0.25)], [3.0, () => sfx.gust()]].sort((a, b) => a[0] - b[0]),
};
DEATH_CUES.handAway = DEATH_CUES.hand;
DEATH_CUES.cellarAway = DEATH_CUES.cellar;

let deathCue = 0;
let deathEyes = [];

function startDeath(cause) {
  deathCue = 0;
  deathEyes = [];
  if (cause === 'guest' || cause === 'goblins') {
    // where they come from: every corner one is in
    deathEyes = (cause === 'goblins' ? S.goblins : settled()).map((g) => GOB_CORNERS[g.corner || pick(Object.keys(GOB_CORNERS))]);
    while (deathEyes.length < (cause === 'goblins' ? 3 : 1)) deathEyes.push(GOB_CORNERS[pick(Object.keys(GOB_CORNERS))]);
  }
  if (cause === 'freeze') {
    // frost crystals that grow in from every edge
    for (let i = 0; i < 150; i++) {
      const side = i % 4;
      const along = Math.random();
      deathEyes.push({ side, along, len: rand(5, 20), bend: rand(-0.9, 0.9), at: rand(0, 2.2), inset: rand(0, 14) });
    }
  }
  if (cause === 'dark') {
    // the eyes already watching you stay where they are; more open around them once the last coal goes out
    for (const e of eyes) if (!e.out && e.alpha > 0.3) deathEyes.push({ x: e.x, y: e.y, red: e.red, sz: 1, at: -1 });
    eyes = [];
    for (let tries = 0; deathEyes.length < 15 && tries < 300; tries++) {
      const x = rand(14, 306), y = rand(14, 168);
      if (Math.hypot(x - 160, (y - 100) * 1.6) < 46) continue;
      if (deathEyes.some((e) => Math.hypot(e.x - x, e.y - y) < 26)) continue;
      deathEyes.push({ x, y, red: Math.random() < 0.3, sz: rand(0.8, 1.25), at: 0.9 + deathEyes.length * 0.1 + rand(0, 0.08) });
    }
  }
}

function updateDeath(dt) {
  const cues = DEATH_CUES[S.cause] || [];
  while (deathCue < cues.length && lossT >= cues[deathCue][0]) cues[deathCue++][1]();
  if (S.cause === 'burn' && Math.random() < dt * 10) sfx.crackle(4);
  if (S.cause === 'burn' && Math.random() < dt * 30) spawnEmber(true);
  // nobody is coming back: the door swings open in the wind and the fire sinks
  if (S.cause === 'hunter') {
    if (lossT > 3.3) doorTarget = 0.55;
    if (lossT > 3.6 && S.fire > 2) S.fire = 2;
    if (lossT > 4.4 && S.fire > 1) S.fire = 1;
  }
  if (S.cause === 'mimic' && lossT > 3.0) doorTarget = 1;
}

// The camera, for the deaths that move it: you slump to the floor, or you are dragged into the hatch.
function deathCamera() {
  if (mode !== 'lost') return { tf: '', filter: '', origin: '' };
  if (S.cause === 'starve') {
    const k = ease(seg(0.5, 2.6));
    const sway = Math.sin(lossT * 1.3) * 0.8 * seg(0.5, 1.5);
    return {
      tf: `translateY(${(k * 4).toFixed(2)}%) rotate(${(-8 * k + sway).toFixed(2)}deg)`,   // you lean over, no zoom
      filter: `blur(${(seg(1.4, 4.6) * 2.5).toFixed(2)}px)`,
      origin: '50% 70%',
    };
  }
  if (S.cause === 'cellar' || S.cause === 'cellarAway') {
    const k = ease(seg(2.9, 4.5));
    const jerk = lossT > 2.9 && lossT < 3.1 ? 1.5 : 0;
    return {
      tf: `translateY(${(k * 4 + jerk).toFixed(2)}%) rotate(${(k * 9).toFixed(2)}deg) scale(${(1 + k * 3.4).toFixed(3)})`,
      filter: '',
      origin: `${((HATCH.x + HATCH.w / 2) / W) * 100}% ${((HATCH.y + 4) / H) * 100}%`,
    };
  }
  return { tf: '', filter: '', origin: '' };
}

// Draw something into an offscreen layer and lay it down at one even opacity, so overlapping parts don't stack.
const shadowLayer = document.createElement('canvas');
function asLayer(alpha, fn) {
  if (shadowLayer.width !== light.width || shadowLayer.height !== light.height) {
    shadowLayer.width = light.width;
    shadowLayer.height = light.height;
  }
  const main = lx;
  lx = shadowLayer.getContext('2d');
  lx.setTransform(1, 0, 0, 1, 0, 0);
  lx.globalCompositeOperation = 'source-over';
  lx.clearRect(0, 0, shadowLayer.width, shadowLayer.height);
  fn();
  lx = main;
  lx.save();
  lx.setTransform(1, 0, 0, 1, 0, 0);
  lx.globalAlpha = alpha;
  lx.drawImage(shadowLayer, 0, 0);
  lx.restore();
}

// One eye of the things in the dark: an almond of pale light with a slit pupil, `lid` 0 shut .. 1 open.
function darkEye(s, x, y, sz, lid, red, a = 1) {
  if (lid <= 0.04 || a <= 0) return;
  const w = 2.6 * sz, h = 1.5 * sz * lid;
  const st = sz > 3 ? 1 : 0.5;
  const gr = 6 * sz * s;
  const g = lx.createRadialGradient(x * s, y * s, 0, x * s, y * s, gr);
  g.addColorStop(0, red ? `rgba(255, 50, 30, ${0.16 * a})` : `rgba(255, 210, 140, ${0.12 * a})`);
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  lx.fillStyle = g;
  lx.fillRect(x * s - gr, y * s - gr, gr * 2, gr * 2);
  for (let yy = -h / 2; yy < h / 2; yy += st) {
    const v = (yy + st / 2) / (h / 2);                       // -1 top .. 1 bottom
    const k = Math.sqrt(Math.max(0, 1 - v * v));
    const half = (w / 2) * k * (v < 0 ? 1 : 0.92);           // the lower lid a little flatter
    lx.fillStyle = red ? `rgba(200, 40, 24, ${a})` : `rgba(214, 160, 70, ${a})`;
    lpx(s, x - half, y + yy, half * 2, st);
    lx.fillStyle = red ? `rgba(255, 96, 70, ${a})` : `rgba(255, 232, 160, ${a})`;
    lpx(s, x - half * 0.62, y + yy, half * 1.24, st);
    if (sz > 1.6) {   // up close you can see the slit, thin at its ends
      const pw = sz * 0.14 * (0.4 + 0.6 * k);
      lx.fillStyle = `rgba(8, 2, 2, ${a})`;
      lpx(s, x - pw / 2, y + yy, pw, st);
    }
  }
}

function eyePair(s, x, y, sz, lid, red, a) {
  darkEye(s, x - 2.3 * sz, y, sz, lid, red, a);
  darkEye(s, x + 2.3 * sz, y, sz, lid, red, a);
}

// The fire is out. The eyes open one by one; they blink together, and each time they open again they are closer.
function deathDark(s) {
  lx.fillStyle = `rgba(0, 0, 0, ${seg(0, 0.9)})`;
  lx.fillRect(0, 0, light.width, light.height);
  const blinkLid = (a, b) => (lossT < a ? 1 : lossT > b ? 1 : Math.abs(lossT - (a + b) / 2) / ((b - a) / 2));
  if (lossT < 4.0) {
    const near = lossT < 2.62 ? 0 : 1;
    const lid = near ? blinkLid(3.85, 4.12) * seg(2.62, 2.82) : blinkLid(2.4, 2.62);
    const pull = near ? lerp(0.45, 0.55, seg(2.8, 3.85)) : 0;
    for (const e of deathEyes) {
      const open = clamp((lossT - e.at) / 0.3, 0, 1);
      if (open <= 0) continue;
      const x = lerp(e.x, 160, pull), y = lerp(e.y, 92, pull);
      const breathe = Math.sin(lossT * 2 + e.at * 9) * 0.3;
      eyePair(s, x, y + breathe, e.sz * (near ? 1.9 : 1), Math.min(open, lid), e.red, 1);
    }
  } else {
    // one pair, right in front of you, opening slowly
    const lid = ease(seg(4.12, 5.0));
    eyePair(s, 160, 88, 8.5, lid, false, 1);
  }
}

// Starving: you slump over (see deathCamera), your vision narrows with each slower heartbeat, and something
// in the dark comes out to watch.
function deathStarve(s) {
  const beats = [0.3, 1.5, 2.9, 4.5];
  let pulse = 0;
  for (const b of beats) if (lossT > b) pulse = Math.max(pulse, Math.max(0, 1 - (lossT - b) / 0.5));
  const close = seg(0.2, 5.0);
  const inner = lerp(0.55, 0.02, close) * light.height;
  const outer = lerp(1.1, 0.25, close) * light.height + pulse * 0.08 * light.height;
  const cx = light.width / 2, cy = light.height * 0.62;
  const vg = lx.createRadialGradient(cx, cy, inner, cx, cy, Math.max(inner + 1, outer));
  vg.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vg.addColorStop(0.6, `rgba(30, 0, 0, ${0.7 + 0.3 * close})`);
  vg.addColorStop(1, 'rgba(0, 0, 0, 1)');
  lx.fillStyle = vg;
  lx.fillRect(0, 0, light.width, light.height);
  // the last thing you see: a pair of eyes at the edge of the light, waiting
  const a = seg(2.6, 3.6) * (1 - seg(5.0, 5.4));
  eyePair(s, 124, 124, 1.3, lossT % 3.1 > 3.0 ? 0.1 : 1, true, a);
}

// The cabin burns: flames race across the floor and climb the walls, smoke comes down from the roof, a beam falls.
const hash = (n) => { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v); };

// one row of flames along a line, spreading out from the fire pit; taller where they climb the walls
function flameRow(s, t, base, front, maxH, wallBoost, delay, seed) {
  lx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 90; i++) {
    const x = (i * 3.6 + hash(i + seed) * 3) % W;
    const d = Math.abs(x - FIRE.x);
    const reach = (lossT - delay) * front;
    if (d > reach) continue;
    const grow = clamp((reach - d) / 50, 0, 1);
    const wall = x < 46 ? (46 - x) / 46 : x > 274 ? (x - 274) / 46 : 0;
    const r = hash(i * 7 + seed);
    const flick = 0.6 + 0.4 * Math.sin(t * (9 + r * 6) + i * 2.3);
    const h = grow * (maxH * (0.45 + r * 0.8) * flick + wall * wallBoost * (0.6 + r * 0.6));
    const wid = 3 + r * 4;
    for (let y = 0; y < h; y += 1) {
      const k = y / Math.max(1, h);
      const col = k < 0.2 ? '255, 214, 110' : k < 0.5 ? '255, 140, 40' : k < 0.8 ? '220, 70, 20' : '140, 26, 10';
      const half = (wid / 2) * (1 - k) ** 0.8;
      const sway = Math.sin(t * 6 + i + y * 0.25) * k * 2.2;
      lx.fillStyle = `rgba(${col}, ${0.42 * (1 - k * 0.4)})`;
      lpx(s, x - half + sway, base - y - 1, half * 2, 1);
    }
  }
  lx.globalCompositeOperation = 'source-over';
}

function deathBurn(s, t) {
  const heat = seg(0, 2.2);
  lx.fillStyle = `rgba(${Math.round(160 - 60 * seg(3, 5))}, ${Math.round(50 - 30 * seg(3, 5))}, 0, ${0.22 * heat})`;
  lx.fillRect(0, 0, light.width, light.height);
  flameRow(s, t, 113, 95, 14, 80, 0, 1);       // along the back wall, climbing it

  // a roof beam gives way
  const fall = seg(2.8, 3.25);
  if (lossT > 2.5) {
    lx.save();
    lx.translate(96 * s, lerp(18, 104, ease(fall)) * s);
    lx.rotate(lerp(0, 0.42, ease(fall)) + (lossT < 2.8 ? Math.sin(t * 40) * 0.01 : 0));
    lx.fillStyle = 'rgba(14, 8, 4, 1)'; lpx(s, -40, -2.5, 80, 5);
    lx.globalCompositeOperation = 'lighter';
    for (let x = -40; x < 40; x += 2) {
      const r = hash(x + 99);
      const f = (0.4 + 0.6 * r) * (0.6 + 0.4 * Math.sin(t * (8 + r * 7) + x));
      for (let y = 0; y < f * 7; y += 1) {
        const k = y / (f * 7);
        lx.fillStyle = `rgba(255, ${Math.round(170 - 110 * k)}, 30, ${0.45 * (1 - k * 0.5)})`;
        lpx(s, x + Math.sin(t * 6 + x + y) * k, -2.5 - y - 1, 2 * (1 - k * 0.7), 1);
      }
    }
    lx.restore();
    lx.globalCompositeOperation = 'source-over';
  }

  // smoke rolling down from the roof
  const edge = lerp(-12, 200, ease(seg(2.2, 5.4)));
  for (let x = 0; x < W; x += 2) {
    const y = edge + Math.sin(x * 0.07 + t * 1.4) * 6 + Math.sin(x * 0.19 - t * 2.1) * 3;
    if (y <= 0) continue;
    lx.fillStyle = 'rgba(18, 12, 10, 0.9)';
    lpx(s, x, 0, 2, y);
    lx.fillStyle = 'rgba(60, 30, 18, 0.5)';
    lpx(s, x, y, 2, 3);
  }
  flameRow(s, t, 184, 80, 24, 30, 0.7, 5);     // the floor right in front of you, in front of the smoke
}

// A thing standing at (cx, feet), h tall: long legs, a narrow body, arms that hang too low, a head on a
// broken neck. tilt bends the head over (radians). Drawn on the light layer in the given palette.
function tallThing(s, t, cx, feet, h, o = {}) {
  const pal = o.pal || MIMIC_PAL;
  const u = h / 40;
  const step = o.walk ? Math.sin(t * 6) : 0;
  const hip = feet - h * 0.44, sh = feet - h * 0.8;
  // legs, the knees bent the wrong way
  for (const side of [-1, 1]) {
    const lift = side * step;
    limb(s, cx + side * 1.7 * u, hip, cx + side * (2.6 + lift * 0.8) * u, feet - Math.max(0, lift) * 1.5 * u, -side * 1.6 * u, 2.2 * u, pal);
  }
  // the body as one stroke: narrow hips, a sunken waist, a deep cage of a chest, then a sloped bar of shoulders
  tube(s, [[cx, hip + 1.2 * u], [cx, hip - (hip - sh) * 0.45], [cx, sh + 0.8 * u]], [3.4 * u, 2.4 * u, 6.4 * u], pal);
  tube(s, [[cx - 4 * u, sh + 0.9 * u], [cx, sh - 0.4 * u], [cx + 4 * u, sh + 0.9 * u]], [2.2 * u, 2.6 * u, 2.2 * u], pal);
  // arms hanging past the knees, fingers almost on the floor
  const reach = o.reach ?? 0.9;
  for (const side of [-1, 1]) {
    const ax = cx + side * 4 * u, ay = sh + 0.4 * u;
    const sway = Math.sin(t * 2 + side) * 0.6 * u;
    const hx = cx + side * (6.4 + (o.spread || 0) * 10) * u + sway, hy = lerp(hip, feet - 2 * u, reach);
    limb(s, ax, ay, hx, hy, side * (2.5 + (o.spread || 0) * 6) * u, 1.6 * u, pal);
    claw(s, hx, hy, Math.PI / 2 + side * 0.2, 0.35, 1.5, 3.5 * u, pal);
  }
  // the neck and head, bent over by tilt
  const tilt = o.tilt || 0;
  const nx = cx + Math.sin(tilt) * 3 * u, ny = sh - 1.2 * u - Math.cos(tilt) * 2.6 * u;
  limbSeg(s, cx, sh - u, nx, ny, 1.8 * u, pal);
  const hr = 3.2 * u, hcx = nx + Math.sin(tilt) * hr, hcy = ny - Math.cos(tilt) * hr;
  const at = (fx, fy) => [hcx + fx * Math.cos(tilt) - fy * Math.sin(tilt), hcy + fx * Math.sin(tilt) + fy * Math.cos(tilt)];
  { const [ex, ey] = at(0, -0.8 * hr), p = lx.getTransform().transformPoint(new DOMPoint(ex * s, ey * s)); tallThing.eyesAt = [p.x / s, p.y / s]; }
  const st = 0.5;
  for (let y = -hr * 1.4; y <= hr * 1.4; y += st) {
    for (let x = -hr * 1.4; x <= hr * 1.4; x += st) {
      // a long skull, narrow at the chin, in the head's own frame rotated by tilt
      const fx = x * Math.cos(tilt) + y * Math.sin(tilt), fy = -x * Math.sin(tilt) + y * Math.cos(tilt);
      const wid = hr * (fy < 0 ? 0.85 : 0.85 - (fy / (hr * 1.3)) * 0.45);
      const d = (fx / wid) ** 2 + (fy / (hr * 1.3)) ** 2;
      if (d > 1) continue;
      lx.fillStyle = d > 0.86 ? pal.rim : pal.black;
      lpx(s, hcx + x, hcy + y, st, st);
    }
  }
  // a mouth that splits down the length of the face, ringed with teeth
  if (o.mouth > 0) {
    const len = 1.5 * hr * o.mouth, top = -0.1 * hr;
    for (let y = 0; y < len; y += st) {
      const wid = 0.75 * u * Math.sin(Math.PI * (y / len)) * o.mouth;
      for (let x = -wid; x <= wid; x += st) {
        const [mx, my] = at(x, top + y);
        const edge = Math.abs(x) > wid - st * 1.2;
        lx.fillStyle = edge ? (Math.round(y / st) % 2 ? 'rgba(226, 216, 196, 0.95)' : 'rgba(60, 0, 0, 1)') : 'rgba(110, 4, 2, 1)';
        lpx(s, mx, my, st, st);
      }
    }
  }
  // its eyes: pale and small, too far apart, with a faint glow
  if (o.eyes) {
    for (const ex of [-1.5, 1.5]) {
      const [x, y] = at(ex * u, -0.8 * hr);
      const gr = 2.5 * u * s;
      const g = lx.createRadialGradient(x * s, y * s, 0, x * s, y * s, gr);
      g.addColorStop(0, o.eyes.replace(/[\d.]+\)$/, '0.25)'));
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      lx.fillStyle = g;
      lx.fillRect(x * s - gr, y * s - gr, gr * 2, gr * 2);
      lx.fillStyle = o.eyes;
      const ew = Math.max(0.5, 1.1 * u), eh = Math.max(0.5, 0.6 * u);
      lpx(s, x - ew / 2, y - eh / 2, ew, eh);
    }
  }
}

// draw only inside the open doorway
function inDoorway(s, fn) {
  lx.save();
  lx.beginPath();
  lx.rect(257 * s, 51 * s, 34 * s, 61 * s);
  lx.clip();
  fn();
  lx.restore();
}

// It looked like a person. In the doorway it unfolds, too tall for the door, its head bending down under
// the lintel on a broken neck. Then it comes in.
function deathMimic(s, t) {
  if (lossT < 2.7) {
    inDoorway(s, () => {
      const grow = ease(seg(1.2, 2.2));
      const h = lerp(38, 60, grow);
      const tilt = lossT < 1.35 ? 0 : lerp(0.5, 1.9, ease(seg(1.35, 2.5)));
      tallThing(s, t, 274, 111, h, {
        pal: MIMIC_PAL, tilt, reach: lerp(0.3, 1, grow), mouth: seg(2.1, 2.7),
        eyes: lossT > 1.35 ? 'rgba(235, 235, 255, 0.95)' : null,
      });
    });
  } else {
    // it steps in and comes toward you, filling the room
    const k = ease(seg(2.7, 4.9));
    tallThing(s, t, lerp(274, 178, k), lerp(111, 196, k), lerp(58, 190, k), {
      pal: MIMIC_IN_PAL, tilt: 1.9 - 0.6 * k, reach: lerp(1, 0.55, k), spread: 0.2 + 0.9 * k, mouth: 1, walk: true,
      eyes: 'rgba(235, 235, 255, 0.95)',
    });
  }
}

// She is already in. She drops off the wall and comes across the floor toward you on her long arms.
function deathHand(s, t) {
  if (lossT < 2.1) return;   // the crawl in through the window is drawn by drawHand
  const k = ease(seg(2.1, 4.7));
  const hx = lerp(70, 156, k), hy = lerp(75, 98, k), sc = lerp(1.9, 5.2, k);
  herGlow(s, hx, hy, 30 + 70 * k, 0.55);
  for (const side of [-1, 1]) {
    // her hands planted on the floor out to either side, stepping forward
    const stepK = Math.sin(lossT * 9 + (side > 0 ? Math.PI : 0));
    const handX = hx + side * (14 + 120 * k), handY = lerp(120, 200, k) + stepK * 2 * (1 - k);
    // arms as thick as her shoulders, so they read as hers and not as wires
    limb(s, hx + side * 4 * sc, hy + 9 * sc, handX, handY, side * -(10 + 30 * k), 1.8 * sc);
    claw(s, handX, handY, Math.PI / 2 - side * 0.3, 0.45, 2.2, 6 + 10 * k);
  }
  drawHerHead(s, t, hx, hy, sc, 1);
}

// Out in the trees. Its grin opens all the way, then something is dragged past the window, and nobody comes
// home: the door blows open and the fire sinks. (The grin is drawn by drawGrin.)
function deathHunter(s, t) {
  if (lossT < 1.9) return;
  const k = seg(1.9, 3.4);
  // a little moonlight on the snow outside, so you can see what goes past
  const m = seg(1.6, 2.0) * (1 - seg(3.6, 4.2));
  lx.save();
  lx.globalCompositeOperation = 'destination-out';
  const mg = lx.createRadialGradient(61 * s, 60 * s, 0, 61 * s, 60 * s, 22 * s);
  mg.addColorStop(0, `rgba(0, 0, 0, ${0.7 * m})`);
  mg.addColorStop(1, 'rgba(0, 0, 0, 0)');
  lx.fillStyle = mg;
  lx.fillRect(39 * s, 38 * s, 44 * s, 44 * s);
  lx.restore();
  throughWindow(s, () => {
    const x = lerp(40, 84, k), y = 62;
    for (let i = 40; i < x - 6; i++) {         // the smear it leaves in the snow, fading back where it started
      lx.fillStyle = `rgba(120, 8, 6, ${0.35 + 0.5 * (i - 40) / Math.max(1, x - 46)})`;
      lpx(s, i, y + (hash(i) > 0.7 ? 0.5 : 0), 1, 1 + (hash(i + 3) > 0.5 ? 0.5 : 0));
    }
    const pal = { black: 'rgba(6, 3, 3, 0.97)', rim: 'rgba(70, 70, 92, 0.6)' };
    const st = Math.sin(lossT * 9);
    // what it is dragging: a body on its back, one arm trailing in the snow
    tube(s, [[x - 7, y - 0.6], [x - 3, y - 1.2], [x, y - 1.4]], [1.8, 2.4, 2], pal);
    tube(s, [[x - 7, y - 0.8], [x - 9.5, y + 0.4]], [0.9, 0.7], pal);
    // and the thing dragging it, bent double, one long arm back to the ankle
    tube(s, [[x + 1.5 + st * 0.8, y + 1], [x + 2, y - 3]], [0.9, 1.1], pal);
    tube(s, [[x + 3.2 - st * 0.8, y + 1], [x + 2.6, y - 3]], [0.9, 1.1], pal);
    tube(s, [[x + 2.2, y - 3], [x + 3.4, y - 6.5], [x + 5.2, y - 7.6]], [1.6, 2.2, 1.6], pal);
    tube(s, [[x + 3.6, y - 6.4], [x + 1.4, y - 3.6], [x - 0.2, y - 1.4]], [0.8, 0.9, 0.6], pal);
    tube(s, [[x + 5.2, y - 7.6], [x + 6.4, y - 7.2]], [2, 1.6], pal);
    lx.fillStyle = 'rgba(255, 190, 80, 0.9)'; lpx(s, x + 6.1, y - 7.8, 0.5, 0.5);
  });
}

// The stranger gets up: in jerks, then taller than she was, then she walks toward you.
function deathRisen(s, t) {
  // the risen stranger gets up by the fire (sitting up and standing are pixel sprites; see drawStranger);
  // her ash comes in through the door, already standing, straight away
  const ash = S.cause === 'ash';
  const L = ash ? lossT + 2.0 : lossT;
  const sg = (a2, b2) => clamp((L - a2) / (b2 - a2), 0, 1);
  if (L < 2.0) return;
  const grow = ease(sg(2.0, 2.8));
  const k = ease(sg(2.8, 5.0));
  const sx = ash ? 274 : 193, sy = ash ? 111 : 138;
  tallThing(s, t, lerp(sx, 168, k), lerp(sy, 200, k), lerp(lerp(38, 54, grow), 190, k), {
    pal: ash ? { black: 'rgba(34, 30, 30, 0.99)', rim: 'rgba(150, 40, 24, 0.9)', nail: 'rgba(60, 8, 6, 1)' } : RISEN_PAL,
    tilt: lerp(0.3, 1.2, grow) + Math.sin(t * 3) * 0.05, reach: lerp(0.5, 1, grow),
    mouth: sg(2.6, 3.4), walk: L > 2.8, eyes: 'rgba(230, 40, 20, 1)',
  });
}

// Pale arms come up out of the hatch and across the floor, one reaches you, and it pulls you down
// (deathCamera dives into the hole).
function deathCellar(s, t) {
  const { x, y, w, h } = HATCH;
  const k = seg(0.2, 1.6);
  // the hatch thrown open: a black hole in the floor with a sick light at its lip
  lx.fillStyle = 'rgba(0, 0, 0, 0.96)';
  lpx(s, x, y, w, h);
  lx.fillStyle = 'rgba(170, 190, 120, 0.6)';
  lpx(s, x - 0.5, y - 0.3, w + 1, 0.8);
  lx.fillStyle = 'rgba(150, 170, 110, 0.18)';
  lpx(s, x, y + 0.6, w, 1.2);
  for (let i = 0; i < 3; i++) {
    const bx = x + 4 + i * 6, by = y + 4;
    const sway = Math.sin(t * 2.2 + i * 2) * 3;
    const ex = bx + (i - 1) * 9 + sway, ey = by - lerp(2, 32 + i * 6, ease(k));
    if (i !== 1 || lossT < 1.6) {
      limb(s, bx, by, ex, ey, (i - 1) * 6 + 3, 2.4, PALE_PAL);
      claw(s, ex, ey, -Math.PI / 2 + (i - 1) * 0.4, 0.4, 2 + Math.sin(t * 3 + i), 6, PALE_PAL);
    }
  }
  // the middle one comes down and across the floor, right up to you
  if (lossT >= 1.6) {
    const r = ease(seg(1.6, 2.9));
    const hx = lerp(x + 4, 190, r), hy = lerp(y - 20, 186, r);
    limb(s, x + 10, y + 4, hx, hy, -18 - 10 * r, 2.4 + 4 * r, PALE_PAL);
    claw(s, hx, hy, Math.PI * 0.75, 0.42, lossT > 2.9 ? 3.5 : 1.5, 8 + 22 * r, PALE_PAL);
  }
  // the room goes dark around you as you're pulled in; the hole glowing is the last thing you see
  lx.fillStyle = `rgba(0, 0, 0, ${0.85 * seg(3.0, 4.3)})`;
  lx.fillRect(0, 0, light.width, light.height);
  const gx = x + w / 2, gy = y + 4, gr = 40 * s;
  const g = lx.createRadialGradient(gx * s, gy * s, 0, gx * s, gy * s, gr);
  g.addColorStop(0, `rgba(150, 170, 110, ${0.12 + 0.12 * seg(2.9, 4)})`);
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  lx.fillStyle = g;
  lx.fillRect(gx * s - gr, gy * s - gr, gr * 2, gr * 2);
}

// It waited for the light. She stands in the dawn and her shadow climbs the wall, too tall, with arms
// that reach across the ceiling, and bends down over you as the light goes out.
function deathFalseStranger(s, t) {
  const grow = ease(seg(0.8, 3.0));
  const bend = ease(seg(3.0, 4.8));
  asLayer(0.72, () => {
    lx.save();
    const fx = 196 * s, fy = 138 * s;
    lx.translate(fx, fy);
    lx.transform(1, 0, -0.35 - 0.3 * grow, 1, 0, 0);   // cast up and away from the window
    lx.scale(1 + bend * 1.8, 1 + bend * 0.6);
    lx.translate(-fx, -fy);
    tallThing(s, t, 196, 138, lerp(38, 128, grow), {
      pal: SHADOW_PAL, tilt: lerp(0.1, 0.9, grow) + bend * 1.2, reach: 1, spread: grow * 0.9,
      mouth: seg(2.2, 3.2),
    });
    lx.restore();
  });
  // two red eyes in the shadow's head
  if (lossT > 1.8) {
    const a = seg(1.8, 2.4);
    // on the shadow's head, then coming down to you as it bends over
    const hx = lerp(tallThing.eyesAt[0], 160, bend), hy = lerp(tallThing.eyesAt[1], 70, bend), sz = lerp(1, 4, bend);
    eyePair(s, hx, hy, sz, 1, true, a);
  }
}

// Freezing: frost grows in from the edges, your breath shows and fades, and the fire seems to shrink away.
function deathFreeze(s, t) {
  lx.fillStyle = `rgba(150, 180, 220, ${0.18 * seg(0.2, 3)})`;
  lx.fillRect(0, 0, light.width, light.height);
  // a white glaze creeping in from the edges
  const glaze = seg(0.2, 4.6);
  const vg = lx.createRadialGradient(light.width / 2, light.height / 2, light.height * lerp(0.75, 0.2, glaze), light.width / 2, light.height / 2, light.width * 0.62);
  vg.addColorStop(0, 'rgba(210, 228, 248, 0)');
  vg.addColorStop(1, `rgba(210, 228, 248, ${0.75 * glaze})`);
  lx.fillStyle = vg;
  lx.fillRect(0, 0, light.width, light.height);
  // and frost ferns growing over it: short stems, branching as they go
  lx.fillStyle = 'rgba(236, 244, 255, 0.85)';
  for (const c of deathEyes) {
    const k = ease(seg(c.at, c.at + 2.2));
    if (k <= 0) continue;
    const len = c.len * k;
    const dir = [Math.PI / 2, Math.PI, -Math.PI / 2, 0][c.side] + c.bend;
    let x = c.side === 0 ? c.along * W : c.side === 1 ? W - c.inset : c.side === 2 ? c.along * W : c.inset;
    let y = c.side === 0 ? c.inset : c.side === 1 ? c.along * H : c.side === 2 ? H - c.inset : c.along * H;
    for (let d = 0; d < len; d += 0.5) {
      x += Math.cos(dir) * 0.5; y += Math.sin(dir) * 0.5;
      lpx(s, x, y, 0.5, 0.5);
      if (Math.round(d * 2) % 5 === 0) {
        const b = (len - d) * 0.45;
        for (const side of [1, -1]) {
          for (let e = 0.5; e < b; e += 0.5) lpx(s, x + Math.cos(dir + side * 0.8) * e, y + Math.sin(dir + side * 0.8) * e, 0.5, 0.5);
        }
      }
    }
  }
  // your breath, slower and fainter each time
  for (const [at, a] of [[0.4, 0.5], [1.8, 0.35], [3.3, 0.2]]) {
    const k = seg(at, at + 1.4);
    if (k <= 0 || k >= 1) continue;
    const r = (6 + k * 18) * s;
    const g = lx.createRadialGradient(160 * s, (176 - k * 26) * s, 0, 160 * s, (176 - k * 26) * s, r);
    g.addColorStop(0, `rgba(230, 236, 245, ${a * (1 - k)})`);
    g.addColorStop(1, 'rgba(230, 236, 245, 0)');
    lx.fillStyle = g;
    lx.fillRect(160 * s - r, (176 - k * 26) * s - r, r * 2, r * 2);
  }
}

// The blood hour: the door bangs open on the thing in the trees itself. Its eyes and its grin fill the doorway,
// growing, and a long arm reaches in across the floor for you.
function deathBloodHour(s, t) {
  lx.fillStyle = `rgba(60, 0, 0, ${0.35 * seg(0, 1.5)})`;
  lx.fillRect(0, 0, light.width, light.height);
  const k = ease(seg(0.3, 3.4));
  const cx = lerp(274, 160, k * 0.6), cy = lerp(70, 80, k), sz = lerp(1.5, 8, k);
  // the eyes, amber going red
  eyePair(s, cx, cy, sz, 1, k > 0.4, 1);
  // the grin beneath them, opening
  const w = sz * 9, gap = sz * (0.8 + k * 1.6);
  for (let x = -w / 2; x <= w / 2; x += Math.max(0.5, sz * 0.4)) {
    const u = (2 * x) / w, top = cy + sz * 2.2 + sz * 1.6 * (1 - u * u);
    lx.fillStyle = 'rgba(10, 0, 0, 1)'; lpx(s, cx + x, top, Math.max(0.5, sz * 0.4), gap * (1 - u * u * 0.8));
    lx.fillStyle = 'rgba(232, 222, 196, 1)'; lpx(s, cx + x, top, Math.max(0.5, sz * 0.3), Math.max(0.5, sz * 0.5));
  }
  // its arm, reaching in along the floor toward you
  const r = ease(seg(1.2, 3.6));
  if (r > 0) {
    const hx = lerp(270, 175, r), hy = lerp(108, 182, r);
    const pal = { black: 'rgba(4, 0, 0, 0.98)', rim: 'rgba(160, 22, 14, 0.85)', nail: 'rgba(30, 0, 0, 1)' };   // rimmed in the moon's red
    limb(s, 276, 100, hx, hy, -20 * r, 2 + 4 * r, pal);
    claw(s, hx, hy, Math.PI * 0.7, 0.45, 1.2, 6 + 18 * r, pal);
  }
}

// The goblins: out of their corners along the floor toward you, eyes first, growing as they come, then on you.
function deathGoblins(s) {
  lx.fillStyle = `rgba(0, 0, 0, ${0.5 * seg(0, 2)})`;
  lx.fillRect(0, 0, light.width, light.height);
  deathEyes.forEach((c, i) => {
    // each one a little behind the last and a different size, so they come as a pack and not as copies
    const k = ease(seg(0.3 + i * 0.25, 3.6 + i * 0.15));
    const tx = 160 + (i - (deathEyes.length - 1) / 2) * 62;
    drawGoblin(s, lerp(c.x, tx, k), lerp(c.y + 6, 178, k), lerp(1, 6 - (i % 3) * 0.7, k), c.x < tx ? 1 : -1, 1);
  });
}

// Lost in the white: the whiteout swallows the room, snow driving sideways, and a small dark figure, you,
// walks away into it until there is nothing left to see.
function deathLost(s, t) {
  const k = seg(0.2, 2.6);
  lx.fillStyle = `rgba(226, 232, 242, ${0.92 * k})`;
  lx.fillRect(0, 0, light.width, light.height);
  lx.fillStyle = `rgba(255, 255, 255, ${0.5 + 0.4 * k})`;
  for (let i = 0; i < 90; i++) {
    const y = hash(i) * H;
    const x = ((hash(i + 7) * (W + 60) + lossT * (180 + hash(i + 3) * 160)) % (W + 60)) - 30;
    lpx(s, x, y, 5 + hash(i + 5) * 12, 0.5);
  }
  const w = seg(1.2, 4.6);
  if (w > 0 && w < 1) {
    // you, from behind: hood up, shoulders hunched, arms wrapped round yourself, trudging away into it
    const h = lerp(26, 2, w), u = h / 26, cx = 160 + Math.sin(lossT * 2) * 2 * (1 - w), feet = lerp(150, 104, w);
    const pal = { black: 'rgb(30, 30, 36)', rim: 'rgb(30, 30, 36)' };
    const st = Math.sin(lossT * 5);
    asLayer(0.85 * (1 - w), () => {
      tube(s, [[cx - 1.6 * u, feet - 9 * u], [cx - 1.8 * u - st * 0.6 * u, feet - 4 * u], [cx - 1.7 * u - st * 1.2 * u, feet - 0.6 * u]], [2.6 * u, 2.2 * u, 2 * u], pal);
      tube(s, [[cx + 1.6 * u, feet - 9 * u], [cx + 1.8 * u + st * 0.6 * u, feet - 4 * u], [cx + 1.7 * u + st * 1.2 * u, feet - 0.6 * u]], [2.6 * u, 2.2 * u, 2 * u], pal);
      tube(s, [[cx, feet - 8 * u], [cx, feet - 14 * u], [cx, feet - 20 * u]], [7.4 * u, 7 * u, 8.4 * u], pal);   // coat, wider at the hunched shoulders
      tube(s, [[cx - 4.4 * u, feet - 19.6 * u], [cx - 4.8 * u, feet - 15 * u]], [2.6 * u, 2.4 * u], pal);         // arms wrapped in
      tube(s, [[cx + 4.4 * u, feet - 19.6 * u], [cx + 4.8 * u, feet - 15 * u]], [2.6 * u, 2.4 * u], pal);
      tube(s, [[cx, feet - 21.5 * u], [cx + 0.3 * u, feet - 24.4 * u]], [5 * u, 4.4 * u], pal);                  // hooded head, bowed
    });
  }
  // and snow driving past in front of you, so you are in it and not pasted on it
  lx.fillStyle = `rgba(255, 255, 255, ${0.6 + 0.3 * k})`;
  for (let i = 90; i < 120; i++) {
    const y = hash(i) * H;
    const x = ((hash(i + 7) * (W + 60) + lossT * (260 + hash(i + 3) * 160)) % (W + 60)) - 30;
    lpx(s, x, y, 8 + hash(i + 5) * 14, 0.6);
  }
}

// No sleep: your eyelids come down slowly from the top and bottom, and don't open again.
function deathSleep(s) {
  const k = ease(seg(0.3, 4.2));
  const lid = k * (light.height / 2) * 1.05;
  lx.fillStyle = 'rgba(0, 0, 0, 1)';
  lx.fillRect(0, 0, light.width, lid);
  lx.fillRect(0, light.height - lid, light.width, lid);
}

const DEATH_SCENES = {
  dark: deathDark, starve: deathStarve, burn: deathBurn, mimic: deathMimic, hand: deathHand, handAway: deathHand,
  hunter: deathHunter, risen: deathRisen, cellar: deathCellar, cellarAway: deathCellar, falseStranger: deathFalseStranger,
  freeze: deathFreeze, lost: deathLost, sleep: deathSleep, guest: deathGoblins, goblins: deathGoblins,
  bloodHour: deathBloodHour, ash: deathRisen, flood: deathFlood,
};

// Terrifying: the thing that killed you, all at once and much too close, for a third of a second.
function drawJumpScare(s, t) {
  const k = clamp(jumpT / 0.38, 0, 1), grow = 1 + (1 - k) * 0.25;
  lx.fillStyle = `rgba(0, 0, 0, ${0.9 * Math.min(1, k * 3)})`;
  lx.fillRect(0, 0, light.width, light.height);
  lx.save();
  lx.translate(160 * s, 90 * s); lx.scale(grow, grow); lx.translate(-160 * s, -90 * s);
  const c = S.cause;
  if (c === 'hunter' || c === 'bloodHour') {
    eyePair(s, 160, 62, 9, 1, true, 1);
    for (let x = 96; x < 224; x += 6) { lx.fillStyle = 'rgba(235, 225, 200, 1)'; lpx(s, x, 104 + Math.abs(x - 160) * -0.12, 4, 12); }
    lx.fillStyle = 'rgba(40, 0, 0, 1)'; lpx(s, 96, 116, 128, 10);
  } else if (c === 'hand' || c === 'handAway') {
    herGlow(s, 160, 90, 120, 0.6); drawHerHead(s, t, 160, 96, 7.5, 1);
  } else if (c === 'mimic' || c === 'risen' || c === 'falseStranger' || c === 'ash') {
    tallThing(s, t, 160, 420, 360, { pal: c === 'mimic' ? MIMIC_IN_PAL : RISEN_PAL, tilt: 0.25, mouth: 1, eyes: c === 'mimic' ? 'rgba(235, 235, 255, 1)' : 'rgba(230, 40, 20, 1)' });
  } else if (c === 'cellar' || c === 'cellarAway') {
    // a swollen pale forearm up out of the floor, the hand spread over your face
    limb(s, 146, 240, 160, 124, 6, 15, PALE_PAL);
    claw(s, 160, 112, -Math.PI / 2, 0.42, 0.5, 58, PALE_PAL);
  } else if (c === 'guest' || c === 'goblins' || c === 'flood') {
    drawGoblin(s, 166, 196, 12, 1, 1);
  } else if (c === 'dark') {
    eyePair(s, 160, 88, 15, 1, true, 1);
  } else {
    lx.fillStyle = `rgba(255, 255, 255, ${0.7 * k})`;   // no face: just the shock of it
    lx.fillRect(0, 0, light.width, light.height);
  }
  lx.restore();
}

// Terrifying: you only just made it back, and its face fills the window as the door slams.
function drawWindowScare(s, t) {
  lx.save();
  lx.beginPath(); lx.rect(45 * s, 35 * s, 32 * s, 32 * s); lx.clip();
  lx.fillStyle = 'rgba(0, 0, 0, 0.9)'; lx.fillRect(45 * s, 35 * s, 32 * s, 32 * s);
  eyePair(s, 61, 46, 2.6, 1, true, 1);
  // the same grin as in the trees, close enough to fill the glass: curved up at the corners, the mouth open
  for (let x = 47; x <= 75; x += 1.4) {
    const u = (x - 61) / 14, top = 52 + 4 * (1 - u * u), gap = 5 * (1 - u * u * 0.85);
    lx.fillStyle = 'rgba(14, 0, 0, 1)'; lpx(s, x, top, 1.4, gap);
    lx.fillStyle = 'rgba(235, 225, 200, 1)'; lpx(s, x + 0.15, top, 1.1, 1.6); lpx(s, x + 0.15, top + gap - 1.2, 1.1, 1.2);
  }
  lx.restore();
}

function drawDeath(s, t) {
  if (windowScareT > 0 && mode === 'playing' && !S.curtainsShut) drawWindowScare(s, t);
  if (mode === 'ended' && !S.won) {
    lx.fillStyle = '#000';
    lx.fillRect(0, 0, light.width, light.height);
    return;
  }
  if (mode !== 'lost') return;
  DEATH_SCENES[S.cause]?.(s, t);
  if (jumpT > 0) drawJumpScare(s, t);
  // and then black
  const L = deathLen();
  const end = seg(L - (S.cause === 'dark' ? 0.5 : 0.8), L - 0.1);
  if (end > 0) {
    lx.fillStyle = `rgba(0, 0, 0, ${end})`;
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
  strangerFalse: { map: HOODED, colors: { ...SPR_COLORS, e: '#b8402c', h: '#47424c', H: '#57515d' } },
  woodcutter: { map: BEARDED, colors: { h: '#7a2a22', H: '#9a3a2a', f: '#8a6248', e: '#1a1210', n: '#6a4a36', b: '#5a3a20', m: '#2a1a10', c: '#3a4a3a', C: '#2a3a2a' } },
  door: { map: DOOR_MAP, colors: DOOR_COLORS },
  trader: {
    map: [
      '....hhhhhhhh....', '....hhhhhhhh....', '....hhhhhhhh....', '....rrrrrrrr....',
      '.hhhhhhhhhhhhhh.', '...cffffffffc...', '...cfefffeffc...', '...cffffffffc...',
      '..ccffffmffffc..', '..cccffffffccc..', '.ccccc.ff.ccccc.', 'cccccc....cccccc',
      'cccLLc....cLLccc', 'cccLLc....cLLccc', 'ccc..c....c..ccc', 'cccccc....cccccc',
    ],
    colors: { h: '#1e1c20', r: '#5a1a14', f: '#7a7064', e: '#0e0c0c', m: '#3a2a2a', c: '#2e2c30', L: '#3a1210' },
  },
  strangerWrong: { map: HOODED, colors: { ...SPR_COLORS, e: '#000000', f: '#1a0808' } },
  woodcutterWrong: { map: BEARDED, colors: { h: '#7a2a22', H: '#9a3a2a', f: '#8a6248', e: '#f0ece0', n: '#6a4a36', b: '#5a3a20', m: '#8a0a0a', c: '#3a4a3a', C: '#2a3a2a' } },
  dead: { map: HOODED.map((r) => r.replace(/e/g, 'f')), colors: { ...SPR_COLORS, f: '#060303' }, bg: '#1a0505' },
  doorFeet0: { map: [...DOOR_MAP.slice(0, 15), 'frrrrrrrrrrrrrrf'], colors: DOOR_COLORS },
  doorFeet2: { map: [...DOOR_MAP.slice(0, 15), 'frxxrrrrrrxxrrrf'], colors: DOOR_COLORS },
  doorFeet1: { map: [...DOOR_MAP.slice(0, 15), 'frrrrrrxxrrrrrrf'], colors: DOOR_COLORS },
  doorFeet3: { map: [...DOOR_MAP.slice(0, 15), 'frxxrrrxxrrrxxrf'], colors: DOOR_COLORS },
  dawn: {
    map: ['', '', '', '', '', '', '', '', '', '', '................', 'tt..tt...tt..ttt', 'tttttttttttttttt', 'wwwwwwwwwwwwwwww', 'wwwwwwwwwwwwwwww', 'wwwwwwwwwwwwwwww'],
    colors: { t: '#2a2e40', w: '#dfe2ea' },
    bg: '#c8a8b0',
  },
};

PORTRAITS.traderWrong = { map: PORTRAITS.trader.map, colors: { ...PORTRAITS.trader.colors, e: '#f0ece0', m: '#8a0a0a' } };

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

const ICONS = {
  wood: {
    title: 'wood',
    map: ['........', '..bbbb..', '.beeeeb.', 'beeRReeb', 'beeRReeb', '.beeeeb.', '..bbbb..', '........'],
    colors: { b: '#5a3a22', e: '#a07a4e', R: '#6b4a2c' },
  },
  cured: {
    title: 'salt-cured meat: keeps forever',
    map: ['......ww', '..cccCww', '.cCscccc', 'cckcfcsC', 'csccckcf', 'cCfccscc', '.cscckc.', '..cccc..'],
    colors: { c: '#4a1a14', C: '#6a2a1e', k: '#2a0e0a', f: '#7a3a2a', s: '#ece8e0', w: '#d8ccb0' },
  },
  cooked: {
    title: 'cooked meat: goes bad in a few minutes, and over the day',
    map: ['......ww', '..cccCww', '.cCccccc', 'cckcfccC', 'cccckcfc', 'cCfccccc', '.cccckc.', '..cccc..'],
    colors: { c: '#5a2e1c', C: '#94522e', k: '#2a140a', f: '#c08a58', w: '#d8ccb0' },
  },
  raw: {
    title: 'raw meat: cook it first. goes bad fast',
    map: ['......ww', '..rrrRww', '.rRrfrrr', 'rrfrRrfr', 'rRrrfrrr', 'rrfRrrRr', '.rrrfrr.', '..rrrr..'],
    colors: { r: '#7e1c18', R: '#a8322a', f: '#d8a090', w: '#d8ccb0' },
  },
  fur: {
    title: 'fur: for a coat or insulation, and worth 3 points each at dawn',
    map: ['........', '..f..f..', '.ffFfff.', 'fFfffFff', 'ffFffffF', '.fffFff.', '..f..f..', '........'],
    colors: { f: '#6a5240', F: '#8a6e56' },
  },
  salt: {
    title: 'salt',
    map: ['........', '..wwww..', '.wsssswn', '.wswssw.', '.wsssww.', '.wwssww.', '..wwww..', '........'],
    colors: { w: '#9a9690', s: '#e4e0d8', n: '#5a5650' },
  },
  blood: {
    title: 'blood',
    map: ['...kk...', '..gkkg..', '..g..g..', '..gRbg..', '..gRbg..', '..gbbg..', '..gbbg..', '...gg...'],
    colors: { g: '#7a8290', b: '#6a0a0a', R: '#b02020', k: '#8a6a4a' },
  },
};
const RES_VALUE = { wood: () => `${S.wood}/${PILE_CAP}${wetInPile() ? ` · ${wetInPile()} frozen` : ''}${S.shed ? ` · shed ${S.shedWood}` : ''}`, cured: () => curedCount(), cooked: () => S.cooked - curedCount(), raw: () => S.meat, blood: () => S.blood, salt: () => S.salt, fur: () => S.fur };
const resCounts = {};

function buildResBar() {
  ui.res.innerHTML = '';
  for (const [key, icon] of Object.entries(ICONS)) {
    const item = document.createElement('span');
    item.className = 'item';
    item.title = icon.title;
    if (key === 'salt') item.classList.add('salt-item');
    if (key === 'cured') item.classList.add('cured-item');
    if (key === 'fur') item.classList.add('fur-item');
    const c = document.createElement('canvas');
    c.width = 8; c.height = 8;
    const g = c.getContext('2d');
    icon.map.forEach((row, r) => [...row].forEach((k, col) => {
      if (k === '.') return;
      g.fillStyle = icon.colors[k];
      g.fillRect(col, r, 1, 1);
    }));
    const n = document.createElement('span');
    n.className = 'n';
    item.append(c, n);
    ui.res.appendChild(item);
    resCounts[key] = n;
  }
}

function hungerLabel() {
  if (S.hunger >= 90) return ['starving', 'bad'];
  if (S.hunger >= 70) return ['hungry', 'warn'];
  return ['fed', ''];
}

function syncUI() {
  for (const key in resCounts) resCounts[key].textContent = RES_VALUE[key]();
  ui.res.classList.toggle('has-salt', S.salt > 0 || S.nightNo >= 2);
  ui.res.classList.toggle('has-cured', curedCount() > 0);
  ui.res.classList.toggle('has-fur', S.fur > 0);
  resCounts.wood.parentElement.classList.toggle('full', S.wood >= PILE_CAP - 2);
  resCounts.raw.parentElement.classList.toggle('spoiling', spoilingSoon(S.rawLife));
  resCounts.cooked.parentElement.classList.toggle('spoiling', spoilingSoon(S.cookedLife.filter((l) => l < CURED / 2)));
  const blazing = S.blaze > 0 && mode === 'playing' && !S.away && !dialog;
  ui.douse.classList.toggle('hidden', !blazing);
  ui.saltFlare.classList.toggle('hidden', !saltFlareReady() || blazing);
  if (blazing) ui.douse.style.setProperty('--cd', `${(S.blaze / 9) * 100}%`);
  ui.clock.textContent = mode === 'day' ? `day · ${dayClock(S.dayHours)} · dark at 10` : S.won ? '6:00 am · dawn' : S.lit ? `${S.diff && S.diff !== 'normal' ? `${S.diff} · ` : ''}${challengeById(S.ch) ? `${challengeById(S.ch).name} · ` : ''}${S.nightNo > 1 ? `night ${S.nightNo} · ` : ''}${clockText(S.night)} · dawn at 6` : '';
  const [hl, hc] = hungerLabel();
  ui.hunger.textContent = S.lit ? hl + (S.sick > 0 ? ' · sick' : '') + ['', ' · tired', ' · seeing things', ' · coming apart'][mode === 'playing' ? lvl() : 0] : '';
  ui.hunger.className = hc;
  const cold = blizzard() && S.lit;
  $('cold').textContent = cold ? (S.cold >= 85 ? 'freezing' : S.cold >= 60 ? 'cold' : S.cold >= 30 ? 'chilled' : 'warm') : '';
  $('cold').className = S.cold >= 85 ? 'bad' : S.cold >= 60 ? 'warn' : '';

  stage.classList.toggle('dlg', !!dialog);   // the log line hides behind an open dialogue
  syncSpots();
  const present = canAct();
  ui.stoke.querySelector('.label').textContent = S.fire === 0 ? (S.lit ? 'relight fire' : 'light fire') : 'stoke fire';
  ui.stoke.disabled = !present || S.cd.stoke > 0 || S.wood < 1;
  ui.stoke.style.setProperty('--cd', `${clamp(S.cd.stoke / (STOKE_CD * (S.hunger >= 90 ? 2 : 1) * (S.sick > 0 ? 1.3 : 1)), 0, 1) * 100}%`);
  for (const b of [ui.eat, ui.cook, ui.wood, ui.build]) b.classList.toggle('hidden', !S.lit);
  ui.eat.disabled = !present || S.cd.eat > 0 || S.meat + S.cooked < 1 || S.hunger < 5;
  ui.eat.querySelector('.label').textContent = S.cooked > 0 || S.meat < 1 ? 'eat' : 'eat raw';
  ui.eat.style.setProperty('--cd', `${(S.cd.eat / EAT_CD) * 100}%`);
  ui.cook.disabled = !present || !!S.cooking || S.meat < 1 || S.fire < 1;
  ui.cook.querySelector('.label').textContent = S.cooking ? 'cooking' : 'cook';
  ui.cook.style.setProperty('--cd', `${S.cooking ? (1 - S.cooking.t / (S.cooking.total || COOK_TIME)) * 100 : 0}%`);
  ui.wood.disabled = !present;
  ui.build.disabled = !present;

  const lifting = S.hatch.phase === 'lift' && mode === 'playing' && !S.away && !dialog;
  ui.slam.classList.toggle('hidden', !lifting);
  if (lifting) ui.slam.style.setProperty('--cd', `${(1 - S.hatch.p) * 100}%`);
  const reaching = S.hand.phase === 'reach' && mode === 'playing' && !S.away && !dialog && !S.curtainsShut;   // behind the curtains, no warning
  const swatting = climbing() && mode === 'playing' && !S.away && !dialog;
  ui.swat.classList.toggle('hidden', !swatting);
  if (swatting) { const g = S.goblins.find((x) => x.act && !x.act.done); ui.swat.style.setProperty('--cd', `${(1 - g.act.t / 2.0) * 100}%`); }
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

function renderBoard(el, highlight = -1, diff = S.diff) {
  const list = loadBoard(diff);
  el.innerHTML = '';
  if (!list.length) { el.innerHTML = '<li class="empty">no one has made it to dawn yet.</li>'; return; }
  list.forEach((e, i) => {
    const li = document.createElement('li');
    if (i === highlight) li.className = 'mine';
    li.innerHTML = `<span class="rank">${i + 1}.</span><span class="who"></span><span class="pts">${e.score}</span><span class="sun">${'☀'.repeat(e.nights || 1)}</span>`;
    li.querySelector('.who').textContent = e.name + (challengeById(e.ch) ? ` · ${challengeById(e.ch).name}` : '');
    el.appendChild(li);
  });
}

function showTitle(panel = 'menu') {
  setMode('title');
  ui.ending.classList.add('hidden');
  ui.title.classList.remove('hidden');
  ui.titleMenu.classList.toggle('hidden', panel !== 'menu');
  ui.title.classList.toggle('sub', panel !== 'menu');
  ui.howPanel.classList.toggle('hidden', panel !== 'how');
  ui.boardPanel.classList.toggle('hidden', panel !== 'board');
  ui.devPanel.classList.toggle('hidden', panel !== 'dev');
  $('diffPanel').classList.toggle('hidden', panel !== 'diff');
  if (panel === 'diff') { renderChallenges(lastDiff); document.querySelector(`[data-diff="${lastDiff}"]`)?.focus({ preventScroll: true }); }
  ui.achPanel.classList.toggle('hidden', panel !== 'ach');
  if (panel === 'ach') renderAchievements();
  $('devBtn').classList.toggle('hidden', !devMode);
  if (panel === 'board') { renderBoard(ui.boardList, -1, boardDiff); syncBoardTabs(); ui.boardTally.textContent = tallyText(loadStats()); }
  ui.cont.classList.toggle('hidden', !(S.lit && !S.ended));
  ui.cont.textContent = S.phase === 'day' ? 'continue the day' : S.nightNo > 1 ? `continue night ${S.nightNo}` : 'continue the night';
  ui.day.classList.add('hidden');
  toggleJournal(false);
  toggleBuild(false);
  const sel = panel === 'menu' ? '#titleMenu' : panel === 'how' ? '#howPanel' : panel === 'dev' ? '#devPanel' : panel === 'ach' ? '#achPanel' : panel === 'diff' ? '#diffPanel' : '#boardPanel';
  ui.title.querySelector(`${sel} button:not(.hidden)`)?.focus({ preventScroll: true });
}

function newNight(skipConfirm = false, diff = 'normal', ch = null) {
  if (!skipConfirm && S.lit && !S.ended && !confirm('Start a new night? The one in progress will be lost.')) return;
  const sound = S.sound;
  S = freshState();
  S.sound = sound;
  S.diff = DIFFS[diff] ? diff : 'normal';
  S.ch = challengeById(ch) ? ch : null;
  S.wood = D().startWood;
  if (D().trader) S.traderTonight = true;
  resetTransients();
  ui.title.classList.add('hidden');
  ui.ending.classList.add('hidden');
  setMode('playing');
  introTimer = 0.8;
  save();
}

function continueNight() {
  ui.title.classList.add('hidden');
  if (S.phase === 'day') { showDay(); return; }
  setMode('playing');
  say(S.away ? 'you are still out in the trees.' : S.fire === 0 ? 'the room is cold again.' : `the fire is ${FIRE_NAMES[S.fire]}.`);
}

function nightScore() {
  return computeScore({ wood: S.wood + S.shedWood, raw: S.meat, cooked: S.cooked - curedCount(), cured: curedCount(), blood: S.blood, salt: S.salt, fur: S.fur, fire: S.fire, shed: S.shed, blizzard: blizzard(), companion: S.stranger === 'inside' && !S.strangerFalse, trusted: S.trusted, burned: S.rec.burned });
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
  ui.dayBtn.classList.add('hidden');
  ui.endRunBtn.classList.add('hidden');
  renderRecap();
  ui.endTally.textContent = tallyText(recordNight(won));
  const scoreRow = (label, n, pts, cls = '', items = null) => {
    const tr = document.createElement('tr');
    if (cls) tr.className = cls;
    tr.innerHTML = `<td></td><td class="n"></td><td class="pts">${pts}</td>`;
    tr.firstChild.textContent = label;
    tr.children[1].textContent = n;
    ui.endScore.appendChild(tr);
    if (!items || !items.length) return;
    // what you held on to opens up into each thing you kept and what it was worth
    tr.classList.add('fold');
    tr.tabIndex = 0;
    tr.firstChild.textContent = `▸ ${label}`;
    const subs = items.map(([l, k, p]) => {
      const sub = document.createElement('tr');
      sub.className = 'sub hidden';
      sub.innerHTML = '<td></td><td class="n"></td><td class="pts"></td>';
      sub.firstChild.textContent = l;
      sub.children[1].textContent = k;
      sub.children[2].textContent = p;
      ui.endScore.appendChild(sub);
      return sub;
    });
    const toggle = () => {
      const open = subs[0].classList.contains('hidden');
      for (const r of subs) r.classList.toggle('hidden', !open);
      tr.firstChild.textContent = `${open ? '▾' : '▸'} ${label}`;
    };
    tr.addEventListener('click', toggle);
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  };

  if (!won) {
    const d = DEATHS[S.cause] || DEATHS.dark;
    ui.endTitle.textContent = 'you died.';
    ui.endText.textContent = `${typeof d.text === 'function' ? d.text() : d.text} You lasted until ${clockText(S.night)}${S.nightNo > 1 ? ` on night ${S.nightNo}` : ''}.`;
    ui.endHint.textContent = typeof d.hint === 'function' ? d.hint() : d.hint;
    ui.endHint.classList.remove('hidden');
    if (S.nightNo > 1) {
      // the nights you survived still count
      S.final = S.carry;
      S.runNights = S.nightNo - 1;
      scoreRow(S.nightNo === 2 ? 'the first night' : `the first ${S.nightNo - 1} nights`, '', S.carry);
      scoreRow('score', '', S.carry, 'total');
      offerBoard();
    } else {
      S.scored = true;
    }
    save();
    ui.retry.focus({ preventScroll: true });
    ui.ending.classList.remove('hidden');
    return;
  }

  ui.endHint.classList.add('hidden');
  const result = nightScore();
  const n = S.nightNo;
  const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth'];
  ui.endTitle.textContent = n === 1 ? 'dawn.' : `the ${ORD[n]} dawn.`;
  const company = S.stranger === 'inside' && !S.strangerFalse;
  const ending = n >= LAST_NIGHT && ENDINGS[S.ending || finalEnding()];
  ui.endText.textContent = n === 1
    ? (company ? 'You made it through the night, and you were not alone.' : 'You made it through the night.') + ' Rest through the day and face a second night, or end here.'
    : `You survived ${n} nights${n >= 3 ? ', and the blizzard' : ''}.` + (company ? ' She is still with you.' : '') + (n < LAST_NIGHT ? ' Rest through the day and face another, or end here.' : '');
  if (ending) { ui.endTitle.textContent = ending.title; ui.endText.textContent = ending.text; }
  for (const [label, k, pts, items] of result.lines) scoreRow(label, k, pts, '', items);
  S.final = result.total;
  const chal = challengeById(S.ch);
  if (chal) {
    const extra = Math.round(result.total * (chal.mult - 1));
    scoreRow(`challenge: ${chal.name}`, `×${chal.mult}`, extra);
    S.final += extra;
  }
  if (n > 1) {
    scoreRow(n === 2 ? 'the first night' : `the first ${n - 1} nights`, '', S.carry);
    scoreRow(`the ${ORD[n]} dawn`, '', 100);
    S.final += S.carry + 100;
  }
  if (ending) { scoreRow(ending.title.replace(/\.$/, ''), '', ending.bonus); S.final += ending.bonus; }
  S.runNights = n;
  scoreRow('score', '', S.final, 'total');
  if (n >= LAST_NIGHT) noteChRecord();
  if (result.lines.at(-1)[2] >= 200) achieve('well_stocked');
  if (S.final >= 1000) achieve('four_figures');
  if (n < LAST_NIGHT) {
    renderBoard(ui.endBoard);
    ui.dayBtn.classList.remove('hidden');
    ui.endRunBtn.classList.remove('hidden');
    ui.dayBtn.focus({ preventScroll: true });
  } else {
    offerBoard();
  }
  ui.ending.classList.remove('hidden');
  save();
}

// The best finished run you've had at each challenge (by difficulty), kept on this computer for now; shown under the
// challenge in place of the bot's record. (With accounts, these become everyone's records.)
const CH_KEY = 'firelight-challenge-records';
function loadChRecords() { try { return JSON.parse(localStorage.getItem(CH_KEY)) || {}; } catch (e) { return {}; } }
function noteChRecord() {
  if (!S.ch || S.dev || window.__simulating || S.chNoted) return;
  S.chNoted = true;
  const all = loadChRecords(), key = `${S.diff}:${S.ch}`;
  if (!all[key] || S.final > all[key].score) {
    all[key] = { name: 'you', score: S.final, t: Date.now(), mine: true };
    try { localStorage.setItem(CH_KEY, JSON.stringify(all)); } catch (e) { /* not remembered */ }
  }
}
function nameChRecord(name) {
  if (!S.ch) return;
  const all = loadChRecords(), r = all[`${S.diff}:${S.ch}`];
  if (r && r.score === S.final) { r.name = name; try { localStorage.setItem(CH_KEY, JSON.stringify(all)); } catch (e) { /* not remembered */ } }
}

// Put the run's score up for the board, if it earns a place.
function offerBoard() {
  const earns = !S.scored && !S.dev && qualifies(loadBoard(), S.final);
  ui.initials.classList.toggle('hidden', !earns);
  renderBoard(ui.endBoard);
  if (!earns) S.scored = true;
  if (earns) { ui.initialsInput.value = ''; setTimeout(() => ui.initialsInput.focus(), 50); }
  else ui.retry.focus({ preventScroll: true });
}

// End after a night and bank the score.
function endRun() {
  ui.dayBtn.classList.add('hidden');
  ui.endRunBtn.classList.add('hidden');
  offerBoard();
  save();
}

ui.initials.addEventListener('submit', (e) => {
  e.preventDefault();
  if (S.scored) return;
  const entry = { name: cleanInitials(ui.initialsInput.value), score: S.final, nights: S.runNights || 1, t: Date.now(), ...(S.ch ? { ch: S.ch } : {}) };
  nameChRecord(entry.name);
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
ui.cook.addEventListener('click', cook);
ui.wood.addEventListener('click', () => startTrip('wood'));
ui.build.addEventListener('click', () => toggleBuild());
ui.strike.addEventListener('click', strikeHand);
ui.slam.addEventListener('click', slamHatch);
ui.swat.addEventListener('click', swatGoblin);
// each quick-time button sits right by what it's for
const placeAt = (el, x, y) => { el.style.left = `${(x / W) * 100}%`; el.style.top = `${(y / H) * 100}%`; };
placeAt(ui.strike, 61, 72);
placeAt(ui.slam, HATCH.x + HATCH.w / 2, HATCH.y - 16);
placeAt(ui.swat, 207, 78);
ui.douse.addEventListener('click', douse);
ui.saltFlare.addEventListener('click', saltFlare);
ui.dayBtn.addEventListener('click', startDay);
ui.endRunBtn.addEventListener('click', () => endRun());
ui.dayNight.addEventListener('click', startNextNight);
$('runBack').addEventListener('click', runBack);
$('buildClose').addEventListener('click', () => toggleBuild(false));
$('journalBtn').addEventListener('click', () => toggleJournal());
$('journalClose').addEventListener('click', () => toggleJournal(false));
$('menuBtn').addEventListener('click', () => { save(); showTitle('menu'); });
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.();
}
$('fullBtn').addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => { $('fullBtn').textContent = document.fullscreenElement ? 'leave fullscreen' : 'fullscreen'; });
ui.sound.addEventListener('click', () => { S.sound = !S.sound; sfx.setEnabled(S.sound); save(); });

const MUSIC_KEY = 'firelight-music';
let musicOn = true;
try { musicOn = localStorage.getItem(MUSIC_KEY) !== 'off'; } catch (e) { /* storage blocked: music stays on */ }
sfx.setMusicEnabled(musicOn);
function toggleMusic() {
  musicOn = !musicOn;
  sfx.setMusicEnabled(musicOn);
  try { localStorage.setItem(MUSIC_KEY, musicOn ? 'on' : 'off'); } catch (e) { /* not remembered */ }
}
$('musicBtn').addEventListener('click', toggleMusic);

// how loud the music is on each screen, and how wrong it has gone
function musicLevel() {
  if (mode === 'title') return 0.8;
  if (mode === 'playing') return dialog ? 0.7 : 1;
  if (mode === 'day') return 0.45;
  return 0;   // dawn, a death and the screens after are quiet
}
const musicTension = () => (mode === 'playing' && S.lit ? hour() / 8 + S.dread / 250 + (S.nightNo - 1) * 0.12 : 0);
$('newBtn').addEventListener('click', () => showTitle('diff'));
let lastDiff = 'normal';
try { lastDiff = localStorage.getItem('firelight-diff') || 'normal'; } catch (e) { /* default */ }
// the challenge picked for the next run ('' for none), and the records shown for whichever difficulty you point at
let chosenCh = '';
try { chosenCh = localStorage.getItem('firelight-ch') || ''; } catch (e) { /* none */ }
if (!challengeById(chosenCh)) chosenCh = '';
function recordText(diff, id) {
  const r = recordFor(diff, id, loadChRecords());
  if (r.human) return [`record: ${r.who} ${r.score}`, 'mine'];
  if (r.impossible) return [`presumed impossible (no bot in ${r.tested.toLocaleString('en-US')} tries)`, 'impossible'];
  if (r.untested) return ['not yet tried', ''];
  return [`best so far: a bot, ${r.score}`, ''];
}
function renderChallenges(diff = lastDiff) {
  $('chFor').textContent = `(records on ${diff})`;
  const list = $('chList');
  list.innerHTML = '';
  for (const c of [{ id: '', name: 'none', desc: 'the winter as it comes.' }, ...CHALLENGES]) {
    const b = document.createElement('button');
    b.className = c.id === chosenCh ? 'on' : '';
    b.title = c.desc;
    b.innerHTML = '<span class="name"></span><span class="mult"></span><span class="rec"></span>';
    b.querySelector('.name').textContent = c.name;
    b.querySelector('.mult').textContent = c.mult ? `×${c.mult}` : '';
    const [text, cls] = c.id ? recordText(diff, c.id) : [c.desc, ''];
    b.querySelector('.rec').textContent = text;
    if (cls) b.querySelector('.rec').classList.add(cls);
    b.addEventListener('click', () => {
      chosenCh = c.id;
      try { localStorage.setItem('firelight-ch', chosenCh); } catch (e) { /* not remembered */ }
      renderChallenges(diff);
    });
    list.appendChild(b);
  }
}
document.querySelectorAll('[data-diff]').forEach((b) => {
  b.querySelector('.desc').textContent = DIFFS[b.dataset.diff].blurb;
  for (const ev of ['mouseenter', 'focus']) b.addEventListener(ev, () => renderChallenges(b.dataset.diff));
  b.addEventListener('click', () => {
    try { localStorage.setItem('firelight-diff', b.dataset.diff); } catch (e) { /* not remembered */ }
    newNight(false, b.dataset.diff, chosenCh || null);
  });
});
let boardDiff = 'normal';
function syncBoardTabs() { document.querySelectorAll('[data-board]').forEach((b) => b.classList.toggle('on', b.dataset.board === boardDiff)); }
document.querySelectorAll('[data-board]').forEach((b) => b.addEventListener('click', () => { boardDiff = b.dataset.board; renderBoard(ui.boardList, -1, boardDiff); syncBoardTabs(); }));
ui.cont.addEventListener('click', continueNight);
$('boardBtn').addEventListener('click', () => showTitle('board'));
$('howBtn').addEventListener('click', () => showTitle('how'));
document.querySelectorAll('.backBtn').forEach((b) => b.addEventListener('click', () => showTitle('menu')));

/* ---------------------------------------------------------------- playtest */

// Open the game once with ?dev in the address and the title menu gets a playtest button (remembered after).
let devMode = false;
try {
  if (new URLSearchParams(location.search).has('dev')) localStorage.setItem('firelight-dev', 'on');
  devMode = localStorage.getItem('firelight-dev') === 'on';
} catch (e) { devMode = new URLSearchParams(location.search).has('dev'); }

// What a strong player holds by then: medians from the best evolved bots in tools/sim.js (kitsFrom, 60 runs each,
// after the 2026-10-19 balance). "day" is the morning after night n-1 (uncured meat already spoiled); "night" is
// after that day's work. Insane nights 4 and 5 rest on very few runs: almost nobody gets that far.
// [wood, raw, cooked, cured, blood, salt, fur, traps, score so far, what's built]
const DEV_KITS = {
  normal: {
    day: { 2: [10, 0, 0, 0, 11, 0, 0, 3, 297, 'axe'], 3: [32, 0, 0, 8, 24, 0, 12, 3, 913, 'axe shed stove shoes spear'],
      4: [33, 0, 0, 12, 32, 0, 2, 3, 1624, 'axe shed stove shoes spear rack coat curtains'],
      5: [31, 0, 0, 16, 40, 1, 3, 3, 2533, 'axe shed stove shoes spear rack coat curtains'] },
    night: { 2: [22, 4, 0, 0, 13, 5, 0, 2, 297, 'axe'], 3: [43, 4, 0, 8, 27, 5, 12, 2, 913, 'axe shed stove shoes spear'],
      4: [44, 4, 0, 12, 34, 6, 3, 2, 1624, 'axe shed stove shoes spear rack coat curtains'],
      5: [44, 4, 0, 16, 43, 6, 4, 2, 2533, 'axe shed stove shoes spear rack coat curtains'] },
  },
  hard: {
    day: { 2: [9, 0, 0, 0, 10, 0, 0, 2, 274, 'axe'], 3: [14, 0, 0, 5, 16, 0, 10, 3, 796, 'axe shed'],
      4: [13, 0, 0, 6, 21, 0, 2, 3, 1393, 'axe shed stove shoes spear rack coat curtains'],
      5: [27, 0, 0, 5, 22, 1, 4, 3, 2057, 'axe shed stove shoes spear rack coat curtains'] },
    night: { 2: [18, 3, 0, 0, 12, 6, 0, 2, 274, 'axe'], 3: [24, 4, 0, 5, 18, 5, 11, 2, 796, 'axe shed'],
      4: [25, 4, 0, 6, 22, 5, 3, 2, 1393, 'axe shed stove shoes spear rack coat curtains'],
      5: [36, 3, 0, 5, 23, 6, 4, 2, 2057, 'axe shed stove shoes spear rack coat curtains'] },
  },
  insane: {
    day: { 2: [7, 0, 0, 2, 5, 1, 0, 1, 240, ''], 3: [7, 0, 0, 2, 5, 3, 10, 1, 667, ''],
      4: [8, 0, 0, 1, 8, 5, 3, 1, 1149, 'stove shoes rack coat curtains'],
      5: [6, 0, 0, 3, 10, 2, 11, 2, 1613, 'stove shoes spear rack coat curtains'] },
    night: { 2: [14, 3, 0, 2, 6, 6, 0, 1, 240, ''], 3: [17, 3, 0, 2, 6, 9, 10, 1, 667, ''],
      4: [18, 3, 0, 1, 9, 10, 4, 1, 1149, 'stove shoes rack coat curtains'],
      5: [12, 4, 0, 3, 12, 8, 11, 2, 1613, 'stove shoes spear rack coat curtains'] },
  },
};

function devKit(night, day) {
  const [wood, raw, cooked, cured, blood, salt, fur, traps, score, built] = (DEV_KITS[S.diff] || DEV_KITS.normal)[day ? 'day' : 'night'][night];
  const has = new Set(built.split(' ').filter(Boolean));
  Object.assign(S, {
    dev: true, lit: true, fire: 3, blood, salt, fur, hunger: 20,
    boardsBuilt: true, boards: 3, glassBroken: true, lantern: true, lanternLit: true, lanternT: 60, hatchBar: night >= 3,
    stranger: 'inside', strangerFalse: false, sHunger: 20, firstVisit: false, hint: HINTS.length,
    carry: score, final: score, met: { woodcutter: true, trader: true },
    axe: has.has('axe'), stove: has.has('stove'), shoes: has.has('shoes'), spear: has.has('spear'), rack: has.has('rack'),
    coat: has.has('coat'), curtains: has.has('curtains'),
  });
  if (has.has('shed')) Object.assign(S, { shed: true, shedBuilt: PILE_CAP });
  S.wood = Math.min(PILE_CAP, wood);
  S.shedWood = S.shed ? Math.min(shedCap(), wood - S.wood) : 0;
  S.rawLife = Array(raw).fill(RAW_LIFE); S.cookedLife = [...Array(cooked).fill(COOKED_LIFE), ...Array(cured).fill(CURED)]; syncMeat();
  S.trapUses = Array.from({ length: traps }, makeTrap); syncTraps();
  if (S.stranger === 'inside' && night >= 5) S.ember = 40;
}

function devStart(which) {
  const m = /(\d)(?:a(\d))?$/.exec(which);
  const night = +m[1], awake = +(m[2] || 0);
  newNight(true, $('devDiff').value);
  S.nightNo = night - 1;
  S.won = true;
  startDay();
  devKit(night, which.startsWith('day'));   // after the day starts, so the kit's meat doesn't spoil over it
  if (awake) { S.awake = awake - 1; S.tired = true; } else S.awake = 0;
  if (which.startsWith('night')) { if (!awake) S.tired = false; startNextNight(); }
  else renderDay();
}
$('devBtn').addEventListener('click', () => showTitle('dev'));
light.addEventListener('pointerdown', (e) => {
  if (lab || (mode !== 'playing' && mode !== 'day')) return;
  const r = light.getBoundingClientRect();
  const lx0 = ((e.clientX - r.left) / r.width) * W, ly0 = ((e.clientY - r.top) / r.height) * H;
  const out = TORCHES.find((tc) => S.torches && S.torches[tc.id] === 'out' && Math.abs(lx0 - tc.x) < 7 && Math.abs(ly0 - tc.y) < 9);
  if (out && mode === 'playing' && canAct()) { lightTorch(out); return; }
  if (cabinetHit(lx0, ly0)) { cabHeld = !cabHeld; sfx.creak(); }
  else if (S.curtains && mode === 'playing' && lx0 >= 40 && lx0 <= 82 && ly0 >= 30 && ly0 <= 72) {
    S.curtainsShut = !S.curtainsShut;
    sfx.tap();
    say(S.curtainsShut ? 'you draw the curtains shut.' : 'you pull the curtains open.');
  }
});
$('achBtn').addEventListener('click', () => showTitle('ach'));
function syncFright() { $('scareBtn').textContent = `scares: ${fright}`; }
$('scareBtn').addEventListener('click', () => {
  fright = terrifying() ? 'eerie' : 'terrifying';
  try { localStorage.setItem('firelight-fright', fright); } catch (e) { /* not remembered */ }
  syncFright();
});
syncFright();
document.querySelectorAll('[data-dev]').forEach((b) => b.addEventListener('click', () => devStart(b.dataset.dev)));

/* --------------------------------------------------------------- death lab */

// The death lab (the playtest menu, or ?lab in the address): every death and scare on its own in a quiet lit cabin,
// to play, pause and scrub. Each scene is set up fresh and run forward in fixed steps from its own fixed seed, so
// scrubbing back and forth shows the same frames. Nothing in the lab saves, counts toward stats or unlocks anything.
const LAB_DT = 1 / 60;
const LAB_CAUSES = ['dark', 'starve', 'burn', 'mimic', 'hand', 'handAway', 'hunter', 'risen', 'cellar', 'cellarAway',
  'falseStranger', 'freeze', 'guest', 'goblins', 'bloodHour', 'flood', 'ash', 'sleep', 'lost'];

function seeded(str) {
  let a = 0;
  for (const ch of str) a = (Math.imul(a, 31) + ch.charCodeAt(0)) | 0;
  return () => {   // mulberry32
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// the room as it is when each one really happens
const labAt = (n, hour) => { S.nightNo = n; S.night = hour * HOUR; };
const labGob = (corner) => ({ corner, t: 60, since: 0, act: null });
const labAway = () => { S.away = { kind: 'wood', t: 3, total: TRIPS.wood.time }; };
const labBroken = () => { S.glassBroken = true; S.boards = 0; };
const LAB_SETUP = {
  dark: () => { S.dread = 100; },
  starve: () => { S.hunger = 100; },
  hand: labBroken, handAway: labBroken,
  hunter: labAway,
  risen: () => { S.stranger = 'dead'; },
  cellar: () => labAt(2, 3), cellarAway: () => labAt(2, 3),
  falseStranger: () => { S.stranger = 'inside'; S.strangerFalse = true; },
  freeze: () => { labAt(3, 3); S.cold = 100; },
  guest: () => { labAt(4, 3); S.fire = 0; S.goblins = [labGob('fl')]; },
  goblins: () => { labAt(4, 3); S.goblins = ['bl', 'fl', 'fr'].map(labGob); },
  bloodHour: () => labAt(5, 5.3),
  flood: () => { labAt(5, 7.3); S.floodFrom = 'door'; door = doorTarget = 1; },
  ash: () => labAt(5, 2),
  sleep: () => labAt(2, 0),
  lost: () => { labAt(3, 2); labAway(); },
};

function labDeath(id, cause, label, group = 'deaths', extra = null) {
  return { id, group, label, len: DEATH_LEN[cause], go: () => die(cause), setup: () => { LAB_SETUP[cause]?.(); extra?.(); } };
}

const LAB_SCENES = [
  ...LAB_CAUSES.map((c) => labDeath(c, c, c)),
  ...[['door', () => { door = doorTarget = 1; }], ['window', labBroken], ['cabinet', () => { S.shed = true; }], ['hatch', null]]
    .map(([from, open]) => labDeath(`flood-${from}`, 'flood', `flood from the ${from}`, 'variants', () => { door = doorTarget = 0; open?.(); S.floodFrom = from; })),
  ...[['fl', 'fl', 'fl'], ['bl', 'bl', 'fr'], ['bl', 'fl', 'fr']]
    .map((cs, i) => labDeath(`goblins-${i + 1}`, 'goblins', `goblins from ${i + 1} corner${i ? 's' : ''}`, 'variants', () => { S.goblins = cs.map(labGob); })),
  ...LAB_CAUSES.map((c) => Object.assign(labDeath(`scare-${c}`, c, c, 'jump scares'), { len: 0.6, scare: true })),
  { id: 'window', group: 'other scares', label: 'close call at the window', len: 1, scare: true,
    go: () => { windowScareT = 0.32; shake = 0.4; sfx.jolt(0.6); sfx.heartbeat(1); } },
  { id: 'salt', group: 'other scares', label: 'the mimic at the salt line', len: 2.8,
    setup: () => { S.saltDoor = true; },
    go: () => { S.saltDoor = false; doorTarget = 1; figure = 1.2; doorCloseIn = 1.3; sfx.scream(); } },
];

// Set the scene up from scratch and run it to `t` seconds in: silently, unless it starts from the top.
function labLoad(sc, t = 0) {
  const rnd = Math.random;
  lab.rng = seeded(sc.id);
  Math.random = lab.rng;
  sfx.setEnabled(false);
  try {
    S = Object.assign(freshState(), { dev: true, lit: true, fire: 3, wood: 12, night: 1.5 * HOUR, sound: lab.sound });
    resetTransients();
    jumpT = windowScareT = cabT = flareT = blueT = phantomEyes = phantomGrin = flameAcc = 0;
    setMode('playing');
    fright = sc.scare ? 'terrifying' : lab.fright;
    sc.setup?.();
    for (let i = 0; i < 60; i++) update(LAB_DT);   // a second for the light and the door to settle
    sfx.setEnabled(lab.sound && t <= 0);
    sc.go();
    sfx.setEnabled(false);
    lab.sc = sc;
    lab.t = 0;
    lab.acc = 0;
    t = clamp(t, 0, sc.len);
    while (lab.t + LAB_DT / 2 < t) { update(LAB_DT); lab.t += LAB_DT; }
  } finally {
    Math.random = rnd;
    sfx.setEnabled(lab.sound);
  }
  syncLab();
}

const labDone = () => lab.t >= lab.sc.len - 1e-6;

function labFrame(dt) {
  if (!lab.playing) return;
  lab.acc += dt * lab.speed;
  const rnd = Math.random;
  Math.random = lab.rng;
  try {
    while (lab.acc >= LAB_DT && !labDone()) { update(LAB_DT); lab.t += LAB_DT; lab.acc -= LAB_DT; }
  } finally { Math.random = rnd; }
  if (labDone()) { lab.playing = false; lab.acc = 0; }
  syncLab();
}

function labStart(sc) { labLoad(sc); lab.playing = true; syncLab(); }

function labPlay() {
  if (lab.playing) lab.playing = false;
  else if (labDone()) labStart(lab.sc);
  else lab.playing = true;
  syncLab();
}

function labSeek(t) { lab.playing = false; labLoad(lab.sc, t); }

function syncLab() {
  if (!lab || !lab.sc) return;
  const { sc } = lab;
  $('labName').textContent = `${sc.group === 'jump scares' ? 'jump scare: ' : ''}${sc.label}`;
  $('labTime').textContent = `${lab.t.toFixed(2)} / ${sc.len.toFixed(2)} s`;
  const scrub = $('labScrub');
  scrub.max = sc.len;
  scrub.value = lab.t;
  $('labPlay').textContent = lab.playing ? 'pause' : labDone() ? 'replay' : 'play';
  document.querySelectorAll('#labList button').forEach((b) => b.classList.toggle('on', b.dataset.scene === sc.id));
  document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', +b.dataset.speed === lab.speed));
  $('labScare').textContent = `scares: ${lab.fright}`;
  $('labSound').textContent = lab.sound ? 'sound on' : 'sound off';
}

function openLab() {
  sfx.initAudio();
  lab = { sc: null, t: 0, playing: false, speed: 1, fright, savedFright: fright, sound: S.sound, acc: 0, rng: Math.random };
  ui.title.classList.add('hidden');
  ui.ending.classList.add('hidden');
  ui.day.classList.add('hidden');
  document.body.classList.add('lab');
  $('lab').classList.remove('hidden');
  resize();
  labStart(LAB_SCENES[0]);
}

function closeLab() {
  fright = lab.savedFright;
  lab = null;
  document.body.classList.remove('lab');
  $('lab').classList.add('hidden');
  // back to the player's own night, exactly as it was saved
  S = load() || freshState();
  if (S.ended) S = Object.assign(freshState(), { sound: S.sound });
  resetTransients();
  jumpT = windowScareT = 0;
  sfx.setEnabled(S.sound);
  if (new URLSearchParams(location.search).has('lab')) history.replaceState(null, '', location.pathname);
  resize();
  showTitle(devMode ? 'dev' : 'menu');
}

function labKey(e, k) {
  if (k === ' ') { e.preventDefault(); labPlay(); }
  else if (k === 'r') labStart(lab.sc);
  else if (k === 'arrowleft' || k === ',') { e.preventDefault(); labSeek(lab.t - LAB_DT); }
  else if (k === 'arrowright' || k === '.') { e.preventDefault(); labSeek(lab.t + LAB_DT); }
  else if (k === 'escape') closeLab();
}

{
  const list = $('labList');
  let group = '';
  for (const sc of LAB_SCENES) {
    if (sc.group !== group) {
      group = sc.group;
      const h = document.createElement('h3');
      h.textContent = group;
      list.appendChild(h);
    }
    const b = document.createElement('button');
    b.dataset.scene = sc.id;
    b.textContent = sc.label;
    b.addEventListener('click', () => labStart(sc));
    list.appendChild(b);
  }
  $('labPlay').addEventListener('click', labPlay);
  $('labRestart').addEventListener('click', () => labStart(lab.sc));
  $('labScrub').addEventListener('input', (e) => labSeek(+e.target.value));
  document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => { lab.speed = +b.dataset.speed; syncLab(); }));
  $('labScare').addEventListener('click', () => { lab.fright = lab.fright === 'terrifying' ? 'eerie' : 'terrifying'; labStart(lab.sc); });
  $('labSound').addEventListener('click', () => { lab.sound = !lab.sound; sfx.setEnabled(lab.sound); syncLab(); });
  $('labExit').addEventListener('click', closeLab);
  $('labBtn').addEventListener('click', openLab);
}
$('version').textContent = `v${VERSION}`;
for (const sp of SPOTS) {
  const b = document.createElement('button');
  b.className = 'spot hidden';
  b.dataset.spot = sp.id;
  b.title = 'build';
  b.style.left = `${(sp.x / W) * 100}%`;
  b.style.top = `${(sp.y / H) * 100}%`;
  b.addEventListener('click', (e) => { e.stopPropagation(); if (openSpot === sp.id) closeSpot(); else openSpotCard(sp.id); });
  ui.spots.appendChild(b);
}
document.addEventListener('pointerdown', (e) => { if (openSpot && !ui.spotCard.contains(e.target) && !e.target.classList.contains('spot')) closeSpot(); });
ui.retry.addEventListener('click', () => newNight(true));
$('endTitleBtn').addEventListener('click', backToTitle);
window.addEventListener('pointerdown', () => sfx.initAudio());
window.addEventListener('touchend', () => sfx.initAudio(), { passive: true });

window.addEventListener('keydown', (e) => {
  sfx.initAudio();
  if (e.target instanceof HTMLInputElement) return;
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (lab) { labKey(e, k); return; }
  if (mode === 'title') {
    if (k === 'escape' && ui.titleMenu.classList.contains('hidden')) showTitle('menu');
    return;
  }
  if (mode === 'ended') { if (k === 'r') ui.retry.click(); return; }
  if (mode === 'day') return;
  if (mode !== 'playing') { if (dialog && k === '1') choose(0); return; }
  const panelOpen = !ui.journal.classList.contains('hidden') || !ui.buildPanel.classList.contains('hidden');
  if (k === 'escape' && openSpot) closeSpot();
  else if (k === 'escape' && panelOpen) { toggleJournal(false); toggleBuild(false); }
  else if (k === 'escape' || k === 'p') { save(); showTitle('menu'); }
  else if (k === 'j') toggleJournal();
  else if (k === 'm') ui.sound.click();
  else if (dialog) { if (k >= '1' && k <= '9') choose(Number(k) - 1); }
  else if (k === 'x') douse();
  else if (k === 'n') toggleMusic();
  else if (k === 'f' || k === ' ') { e.preventDefault(); if (S.hatch.phase === 'lift') slamHatch(); else if (S.hand.phase === 'reach') strikeHand(); else swatGoblin(); }
  else if (k === 'r') runBack();
  else if (k === 'b') toggleBuild();
  else if (panelOpen) return;
  else if (k === 's') stoke();
  else if (k === 'e') eat();
  else if (k === 'c') cook();
  else if (k === 'g') startTrip('wood');
});

document.addEventListener('visibilitychange', () => {
  sfx.setHidden(document.hidden);
  if (document.hidden && mode === 'playing') save();
});

// Phones: the scene is landscape, so a phone held upright gets a "turn sideways" screen and the night waits.
const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
let portraitBlock = false;

function resize() {
  let vw = window.visualViewport ? visualViewport.width : innerWidth;
  let vh = window.visualViewport ? visualViewport.height : innerHeight;
  if (lab) {   // the lab's panel sits beside the scene on a wide screen, under it on a narrow one
    const p = $('lab').getBoundingClientRect();
    if (p.top > 1) vh -= p.height; else vw -= p.width;
  }
  // whole-number scales keep pixels crisp; below 2x (small phones) a fractional scale is better than tiny
  const raw = Math.min(vw / W, vh / H);
  const s = raw >= 2 ? Math.floor(raw) : Math.max(0.75, raw);
  stage.style.setProperty('--s', s);
  // high-density phone screens: cap the light layer's resolution so the glow stays smooth to render
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  light.width = Math.round(W * s * dpr);
  light.height = Math.round(H * s * dpr);
  portraitBlock = touch && vh > vw && !lab;
  $('rotate').classList.toggle('hidden', !portraitBlock);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));
window.visualViewport?.addEventListener('resize', resize);
if (touch) document.body.classList.add('touch');
// iOS has no fullscreen for pages; hide the button where it can't work
if (!document.documentElement.requestFullscreen) $('fullBtn').classList.add('hidden');

/* -------------------------------------------------------------------- run */

drawBackground();
drawPortrait();
buildResBar();
sfx.setEnabled(S.sound);
resize();
showTitle('menu');
if (new URLSearchParams(location.search).has('lab')) openLab();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (lab) labFrame(dt); else update(dt);
  drawPixels();
  drawLight();
  syncUI();
  sfx.setMusic(musicLevel(), musicTension());
  sfx.setShrill(terrifying() && mode === 'playing' && aboutToDie());
  $('musicBtn').textContent = musicOn ? 'music on' : 'music off';
  sfx.setLevels(mode === 'lost' || mode === 'ended' ? 0 : S.fire, S.time, door, S.glassBroken && mode === 'playing' ? (S.boards > 0 ? 0.4 : 1) : 0);
  const cam = deathCamera();
  for (const c of [pix, light]) {
    if (c.style.transform !== cam.tf) c.style.transform = cam.tf;
    if (c.style.filter !== cam.filter) c.style.filter = cam.filter;
    if (c.style.transformOrigin !== cam.origin) c.style.transformOrigin = cam.origin;
  }
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
  day: { start: startDay, do: doDay, night: startNextNight },
  act: { douse, slam: slamHatch, stoke, eat, cook, wood: () => startTrip('wood'), strike: strikeHand, runBack, build, swat: swatGoblin,
    curtains: (shut) => { if (S.curtains) S.curtainsShut = shut; } },
  visit: (who, as, fake) => queueVisit(who, as, fake),
  die: (cause) => die(cause),
  dev: (which) => devStart(which),
  lab: { open: () => openLab(), close: () => closeLab(), scenes: LAB_SCENES.map((sc) => sc.id), load: (id, t) => labLoad(LAB_SCENES.find((sc) => sc.id === id), t), get t() { return lab && lab.t; } },
  get lossT() { return lossT; },
  diffs: DIFFS,   // for balance experiments from the console (tools/sim.js); changes last until reload
  choose,
  newNight: (diff, ch) => newNight(true, diff, ch),
  backToTitle,
  // advance the game by `sec` seconds; draw = false skips rendering (for fast simulations)
  step(sec, draw = true) {
    for (let t = 0; t < sec; t += 0.05) update(0.05);
    if (draw) { drawPixels(); drawLight(); syncUI(); }
  },
};
