import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeScore, qualifies, insertScore, cleanInitials, sanitizeBoard } from '../score.js';

test('score is what you held on to at dawn', () => {
  const r = computeScore({ wood: 20, meat: 2, blood: 1, fire: 3, companion: false });
  assert.equal(r.total, 20 + 6 + 5 + 30);
  assert.deepEqual(r.lines.map((l) => l[0]), ['wood left', 'meat left', 'blood left', 'fire at dawn']);
});

test('company at dawn is worth a bonus', () => {
  const r = computeScore({ wood: 0, meat: 0, blood: 0, fire: 0, companion: true });
  assert.equal(r.total, 25);
  assert.ok(r.lines.some((l) => l[0] === 'not alone'));
});

test('missing values count as zero', () => {
  assert.equal(computeScore({}).total, 0);
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
