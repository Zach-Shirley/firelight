import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, createStore, cleanUnlocked } from '../achievements.js';

const memory = () => { const m = {}; return { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = v; }, m }; };

test('ids are unique, and every death in the game has an achievement', () => {
  const ids = ACHIEVEMENTS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const cause of ['dark', 'starve', 'burn', 'mimic', 'hand', 'handAway', 'hunter', 'risen', 'cellar', 'cellarAway', 'falseStranger', 'freeze', 'lost', 'guest', 'goblins', 'bloodHour', 'flood', 'ash']) {
    assert.ok(ids.includes(`die_${cause}`), cause);
  }
});

test('unlocking happens once, is remembered, and waits to be synced', () => {
  const st = memory();
  const a = createStore(st);
  assert.equal(a.unlock('night_1', 5).name, 'First Light');
  assert.equal(a.unlock('night_1', 6), null);
  const again = createStore(st);
  assert.ok(again.has('night_1'));
  assert.deepEqual(again.unsynced(), [{ id: 'night_1', t: 5 }]);
  again.markSynced(['night_1']);
  assert.deepEqual(createStore(st).unsynced(), []);
});

test('achievements for things not in the game yet cannot unlock, and junk is dropped', () => {
  const a = createStore(memory());
  assert.equal(a.unlock('die_sleep'), null);
  assert.equal(a.unlock('nonsense'), null);
  assert.deepEqual(cleanUnlocked({ night_1: { t: 3, synced: 'yes' }, bogus: { t: 1 }, die_dark: 7 }), { night_1: { t: 3, synced: false } });
});
