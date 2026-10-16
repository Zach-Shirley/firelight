import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeScore, qualifies, insertScore, cleanInitials, sanitizeBoard } from '../score.js';

test('a quiet loss scores only the hours survived', () => {
  const r = computeScore({ stats: {}, hours: 3, dawn: false, fireAtEnd: 0 });
  assert.equal(r.total, 300);
  assert.deepEqual(r.lines.map((l) => l[0]), ['hours survived']);
});

test('reaching dawn adds the dawn bonus and the remaining fire', () => {
  const r = computeScore({
    stats: { woodBurned: 40, built: 3, trades: 2, helped: 1, kind: 1, brave: 1, wise: 1 },
    hours: 8, dawn: true, fireAtEnd: 4,
  });
  // 800 + 80 + 120 + 30 + (100 + 60) + 60 + 500 + 200
  assert.equal(r.total, 1950);
  assert.ok(r.lines.some((l) => l[0] === 'made it to dawn'));
});

test('missing stats count as zero', () => {
  const r = computeScore({ stats: { woodBurned: 5 }, hours: 0, dawn: false, fireAtEnd: 0 });
  assert.equal(r.total, 10);
});

test('qualifies while the board has room, then only beats the lowest', () => {
  const board = Array.from({ length: 10 }, (_, i) => ({ name: 'AAA', score: 1000 - i * 100, t: i }));
  assert.equal(qualifies([], 1), true);
  assert.equal(qualifies([], 0), false);
  assert.equal(qualifies(board, 100), false);  // ties the lowest: not enough
  assert.equal(qualifies(board, 101), true);
});

test('insertScore sorts, trims to ten and reports the rank', () => {
  const board = Array.from({ length: 10 }, (_, i) => ({ name: 'AAA', score: 1000 - i * 100, t: i }));
  const entry = { name: 'ZAC', score: 850, t: 99 };
  const { list, rank } = insertScore(board, entry);
  assert.equal(list.length, 10);
  assert.equal(rank, 2);
  assert.equal(list[list.length - 1].score, 200);
});

test('earlier entries win ties', () => {
  const { list, rank } = insertScore([{ name: 'OLD', score: 500, t: 1 }], { name: 'NEW', score: 500, t: 2 });
  assert.equal(list[0].name, 'OLD');
  assert.equal(rank, 1);
});

test('an entry that does not make the cut gets rank -1', () => {
  const board = Array.from({ length: 10 }, (_, i) => ({ name: 'AAA', score: 1000, t: i }));
  assert.equal(insertScore(board, { name: 'LOW', score: 5, t: 50 }).rank, -1);
});

test('initials are three uppercase letters or digits', () => {
  assert.equal(cleanInitials('zach'), 'ZAC');
  assert.equal(cleanInitials('a.b'), 'AB');
  assert.equal(cleanInitials(''), '???');
  assert.equal(cleanInitials('<b>'), 'B');
});

test('sanitizeBoard drops malformed entries from storage', () => {
  const clean = sanitizeBoard([{ name: 'ok', score: 10 }, null, { name: 5, score: 3 }, { name: 'x', score: 'NaN' }, { name: 'hi', score: 99.6 }]);
  assert.deepEqual(clean.map((e) => [e.name, e.score]), [['HI', 100], ['OK', 10]]);
  assert.deepEqual(sanitizeBoard('nope'), []);
});
