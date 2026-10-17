import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeScore, qualifies, insertScore, cleanInitials, sanitizeBoard } from '../score.js';

test('dawn is worth 100, and what you held on to adds up item by item', () => {
  const r = computeScore({ wood: 21, cooked: 2, blood: 1, salt: 1, fire: 3 });
  assert.equal(r.total, 100 + (21 + 6 + 4 + 2 + 15));
  assert.deepEqual(r.lines.map((l) => l[0]), ['made it to dawn', 'what you held on to']);
  assert.deepEqual(r.lines[1][3].map((i) => i[0]), ['logs', 'cooked meat', 'blood', 'salt', 'the fire still burning']);
});

test('a well-stocked cabin is worth more than the night itself', () => {
  const r = computeScore({ wood: 25, cured: 15, blood: 15, shed: true });
  assert.equal(r.lines.at(-1)[2], 25 + 75 + 60 + 40);
});

test('people let in, burns and company each add up; keeping mimics out does not', () => {
  const r = computeScore({ trusted: 3, mimicsKept: 2, burned: 2, companion: true });
  assert.equal(r.total, 100 + 30 + 10 + 25);
  assert.ok(!r.lines.some((l) => l[0].includes('mimic')));
});

test('fur counts, and a blizzard night multiplies what you held on to', () => {
  const calm = computeScore({ wood: 10, fur: 2 });
  assert.equal(calm.lines.at(-1)[2], 10 + 6);
  const storm = computeScore({ wood: 10, fur: 2, blizzard: true });
  assert.equal(storm.lines.at(-1)[2], 20);
  assert.equal(storm.lines.at(-1)[3].at(-1)[0], 'through the blizzard');
});

test('missing values still give the dawn bonus', () => {
  assert.equal(computeScore({}).total, 100);
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

test('board entries keep whether the run survived one night or two', () => {
  const clean = sanitizeBoard([{ name: 'two', score: 300, nights: 2 }, { name: 'one', score: 90 }, { name: 'odd', score: 50, nights: 7 }]);
  assert.deepEqual(clean.map((e) => [e.name, e.nights]), [['TWO', 2], ['ONE', 1], ['ODD', 1]]);
});
