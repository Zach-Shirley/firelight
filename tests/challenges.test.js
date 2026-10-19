import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHALLENGES, BOT_RECORDS, challengeById, recordFor } from '../challenges.js';
import { sanitizeBoard } from '../score.js';
import { ACHIEVEMENTS } from '../achievements.js';

test('every challenge has a multiplier above one and its own achievement', () => {
  for (const c of CHALLENGES) {
    assert.ok(c.mult > 1, c.id);
    assert.ok(ACHIEVEMENTS.some((a) => a.id === `ch_${c.id}`), c.id);
  }
  assert.equal(challengeById('nope'), null);
});

test("a person's finished run is shown before any bot's", () => {
  const key = 'hard:noAxe';
  const saved = BOT_RECORDS[key];
  BOT_RECORDS[key] = { score: 2000, nights: 5, seed: 1 };
  try {
    assert.deepEqual(recordFor('hard', 'noAxe', {}), { who: 'bot', score: 2000, human: false });
    assert.deepEqual(recordFor('hard', 'noAxe', { [key]: { name: 'ZAC', score: 1500 } }), { who: 'ZAC', score: 1500, human: true });
    BOT_RECORDS[key] = { impossible: true, tested: 600 };
    assert.deepEqual(recordFor('hard', 'noAxe', {}), { impossible: true, tested: 600 });
  } finally {
    if (saved) BOT_RECORDS[key] = saved; else delete BOT_RECORDS[key];
  }
});

test('board entries keep the challenge they were played under, and nothing odd', () => {
  const b = sanitizeBoard([{ name: 'abc', score: 10, nights: 5, t: 1, ch: 'noShed' }, { name: 'x', score: 5, ch: '<b>' }]);
  assert.equal(b[0].ch, 'noShed');
  assert.equal(b[1].ch, undefined);
});
