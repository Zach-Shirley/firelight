// Challenges: one rule that makes a run harder, taken on top of a difficulty. Pure module (no DOM).
// mult multiplies every night's score. BOT_RECORDS holds the best finished run by the evolved bots in tools/sim.js
// (certifyChallenges) for each difficulty and challenge, so every challenge shows a record to beat; a challenge no bot
// could finish is "presumed impossible" until somebody proves otherwise.

export const CHALLENGES = [
  { id: 'noAxe', name: 'no axe', desc: 'the woodcutter keeps his spare axe. every trip brings back what your hands can carry.', mult: 1.15 },
  { id: 'noShed', name: 'no woodshed', desc: 'no woodshed. the pile by the fire is all the wood you have.', mult: 1.3 },
  { id: 'noLantern', name: 'no lantern', desc: 'no blood lantern. you will never see what is really at the door.', mult: 1.2 },
  { id: 'oneTrap', name: 'one trap', desc: 'one trap, never more.', mult: 1.35 },
  { id: 'noTorches', name: 'no torches', desc: 'no torches in the corners. the goblins have every one of them.', mult: 1.15 },
  { id: 'noVisitors', name: 'no visitors', desc: 'the door stays shut. nobody comes in: not the woodcutter, not the trader, not her.', mult: 1.4 },
];
export const challengeById = (id) => CHALLENGES.find((c) => c.id === id) || null;

// from tools/sim.js certifyChallenges() (full records with genomes, for replays: tools/challenge-records.json, v0.72);
// key `${difficulty}:${challenge}`.
// { score, nights, seed } for a bot that finished all five nights, or { impossible: true, tested } if none did
export const BOT_RECORDS = {
  'normal:noAxe': { score: 5399, nights: 5, seed: 5003000 },
  'normal:noShed': { score: 5514, nights: 5, seed: 90000 },
  'normal:noLantern': { score: 6267, nights: 5, seed: 5205002 },
  'normal:oneTrap': { score: 3385, nights: 5, seed: 5305007 },
  'normal:noTorches': { score: 5605, nights: 5, seed: 90006 },
  'normal:noVisitors': { score: 3222, nights: 5, seed: 9106004 },
  'hard:noAxe': { score: 3991, nights: 5, seed: 5600001 },
  'hard:noShed': { score: 3825, nights: 5, seed: 5703003 },
  'hard:noLantern': { score: 4819, nights: 5, seed: 860002 },
  'hard:oneTrap': { impossible: true, tested: 2400 },
  'hard:noTorches': { score: 4317, nights: 5, seed: 90021 },
  'hard:noVisitors': { impossible: true, tested: 2400 },
  'insane:noAxe': { score: 3403, nights: 5, seed: 6204003 },
  'insane:noShed': { score: 3759, nights: 5, seed: 6305000 },
  'insane:noLantern': { score: 4107, nights: 5, seed: 90025 },
  'insane:oneTrap': { impossible: true, tested: 2400 },
  'insane:noTorches': { score: 3724, nights: 5, seed: 6602001 },
  'insane:noVisitors': { impossible: true, tested: 2400 },
};

// the record to show for a challenge: a person's finished run beats any bot's
export function recordFor(diff, id, human = {}) {
  const key = `${diff}:${id}`;
  const h = human[key];
  if (h) return { who: h.name, score: h.score, human: true };
  const b = BOT_RECORDS[key];
  if (b && !b.impossible) return { who: 'bot', score: b.score, human: false };
  if (b && b.impossible) return { impossible: true, tested: b.tested };
  return { untested: true };
}
