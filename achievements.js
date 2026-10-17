// Achievements: the list, and a small store that remembers which ones you have.
// Pure module (no DOM) so it can be tested in Node and, later, shared with a backend: every unlock is kept with
// its time and a `synced` flag, so a future account system can upload what was earned before you signed in.

export const ACHIEVEMENTS = [
  // every way to die
  { id: 'die_dark', group: 'deaths', name: 'Lights Out', desc: 'Let the fire die and the dark come in.' },
  { id: 'die_starve', group: 'deaths', name: 'Empty', desc: 'Starve to death.' },
  { id: 'die_burn', group: 'deaths', name: 'Kindling', desc: 'Burn the cabin down around you.' },
  { id: 'die_mimic', group: 'deaths', name: 'It Was Not a Person', desc: 'Open the door to a mimic.' },
  { id: 'die_hand', group: 'deaths', name: 'She Came In', desc: 'Let her climb in through the window.' },
  { id: 'die_handAway', group: 'deaths', name: 'Welcome Home', desc: 'Come back to find her already inside.' },
  { id: 'die_hunter', group: 'deaths', name: 'A Full Grin', desc: 'Get caught by the thing in the trees.' },
  { id: 'die_risen', group: 'deaths', name: 'She Got Up', desc: "Let the stranger's body rise." },
  { id: 'die_cellar', group: 'deaths', name: 'Under the Floor', desc: 'Miss the hatch one time too many.' },
  { id: 'die_cellarAway', group: 'deaths', name: 'Open Hatch', desc: 'Come back to an open hatch.' },
  { id: 'die_falseStranger', group: 'deaths', name: 'It Waited for the Light', desc: 'Let the false stranger have her way.' },
  { id: 'die_freeze', group: 'deaths', name: 'Frostbite', desc: 'Freeze to death in the blizzard.' },
  { id: 'die_lost', group: 'deaths', name: 'Into the White', desc: 'Lose the path in the blizzard for good. About one blizzard night in a hundred.', hidden: true, hint: 'something very unlucky.' },

  // surviving
  { id: 'night_1', group: 'nights', name: 'First Light', desc: 'Survive the first night.' },
  { id: 'night_2', group: 'nights', name: 'Second Dawn', desc: 'Survive the second night.' },
  { id: 'night_3', group: 'nights', name: 'After the Storm', desc: 'Survive the blizzard on the third night.' },
  { id: 'night_4', group: 'nights', name: 'Fourth Dawn', desc: 'Survive the fourth night.', later: true },
  { id: 'night_5', group: 'nights', name: 'Blood Moon', desc: 'Survive the fifth night.', later: true },

  // playing well
  { id: 'not_alone', group: 'feats', name: 'Not Alone', desc: 'Reach dawn with the stranger still beside you.' },
  { id: 'three_together', group: 'feats', name: 'Three Nights Together', desc: 'Reach the third dawn with the stranger.' },
  { id: 'saw_through', group: 'feats', name: 'Saw Through Her', desc: 'Send the false stranger away.' },
  { id: 'count_feet', group: 'feats', name: 'Count the Feet', desc: 'Keep out a mimic the blood lantern gave away.' },
  { id: 'walker', group: 'feats', name: 'Footsteps to Nowhere', desc: 'Keep out a mimic that faked its footsteps.' },
  { id: 'salt_line', group: 'feats', name: 'Salt Line', desc: 'Stop a mimic at a salted doorway.' },
  { id: 'burned_five', group: 'feats', name: 'Burned Five Times', desc: 'Burn her back five times in one night.' },
  { id: 'by_a_hair', group: 'feats', name: 'By a Hair', desc: 'Burn her back with less than half a second to spare.' },
  { id: 'doused', group: 'feats', name: 'Blood on the Fire', desc: 'Douse a blaze before the cabin catches.' },
  { id: 'bone_spear', group: 'feats', name: 'Bone Spear', desc: 'Escape the thing in the trees with the bone spear.' },
  { id: 'full_shed', group: 'feats', name: 'Every Log in the Forest', desc: 'Fill the woodshed to all 100 logs.' },
  { id: 'well_stocked', group: 'feats', name: 'Well Stocked', desc: "Hold on to 200 points' worth at a single dawn." },
  { id: 'salt_flare', group: 'feats', name: 'Salt on the Embers', desc: 'Throw salt on a dying fire and drive the dark back.', hidden: true, hint: 'something nobody told you you could do.' },
  { id: 'four_figures', group: 'feats', name: 'Four Figures', desc: 'Score 1,000 or more in one run.' },
];

export const BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

// The unlocked set, as stored: { [id]: { t: unlock time (ms), synced: false } }
export function cleanUnlocked(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, v] of Object.entries(raw)) {
    if (!BY_ID[id] || !v || typeof v !== 'object') continue;
    out[id] = { t: Number(v.t) || 0, synced: v.synced === true };
  }
  return out;
}

// A store over any key-value storage with getItem/setItem (localStorage in the browser, a stub in tests).
export function createStore(storage, key = 'firelight-achievements-v1') {
  let unlocked = {};
  try { unlocked = cleanUnlocked(JSON.parse(storage.getItem(key) || '{}')); } catch (e) { unlocked = {}; }
  const persist = () => { try { storage.setItem(key, JSON.stringify(unlocked)); } catch (e) { /* not remembered */ } };
  return {
    // returns the achievement if it was newly unlocked, otherwise null
    unlock(id, now = Date.now()) {
      const a = BY_ID[id];
      if (!a || a.later || unlocked[id]) return null;
      unlocked[id] = { t: now, synced: false };
      persist();
      return a;
    },
    has: (id) => !!unlocked[id],
    unlocked: () => ({ ...unlocked }),
    count: () => Object.keys(unlocked).length,
    // what a backend would need to upload, and a way to mark it done
    unsynced: () => Object.entries(unlocked).filter(([, v]) => !v.synced).map(([id, v]) => ({ id, t: v.t })),
    markSynced(ids) { for (const id of ids) if (unlocked[id]) unlocked[id].synced = true; persist(); },
  };
}
