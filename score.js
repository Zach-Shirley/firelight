// Scoring and the arcade-style leaderboard. Pure functions, no DOM, so they can be tested in Node.

export const BOARD_SIZE = 10;

// Only a night survived to dawn scores: for making it, the people you let in and the times you burned her
// back, and a good deal for what you held on to. (Keeping a mimic out earns nothing: letting one in kills you.)
// end: { wood, raw, cooked, cured, blood, salt, fire (0..4), shed, companion, trusted, burned }
// `cooked` is cooked meat that isn't cured; cured meat counts separately and for more.
export const HELD_VALUE = { wood: 1, raw: 1, cooked: 3, cured: 5, blood: 4, salt: 2, fire: 5 };
export const SHED_POINTS = 40;

export function computeScore({ wood = 0, raw = 0, cooked = 0, cured = 0, blood = 0, salt = 0, fire = 0, shed = false, companion = false, trusted = 0, burned = 0 }) {
  const items = [
    ['logs', wood, wood * HELD_VALUE.wood],
    ['raw meat', raw, raw * HELD_VALUE.raw],
    ['cooked meat', cooked, cooked * HELD_VALUE.cooked],
    ['cured meat', cured, cured * HELD_VALUE.cured],
    ['blood', blood, blood * HELD_VALUE.blood],
    ['salt', salt, salt * HELD_VALUE.salt],
    ['the fire still burning', fire ? `${fire}/4` : 0, fire * HELD_VALUE.fire],
    ['the woodshed', shed ? 'built' : 0, shed ? SHED_POINTS : 0],
  ].filter(([, n]) => n);
  const held = items.reduce((sum, [, , pts]) => sum + pts, 0);
  const lines = [['made it to dawn', '', 100]];
  if (trusted > 0) lines.push(['people you let in', trusted, trusted * 10]);
  if (burned > 0) lines.push(['burned her back', burned, burned * 5]);
  if (companion) lines.push(['not alone', '', 25]);
  lines.push(['what you held on to', '', held, items]);
  const total = lines.reduce((sum, [, , pts]) => sum + pts, 0);
  return { lines, total };
}

// Does this score earn a place on the board?
export function qualifies(list, score, max = BOARD_SIZE) {
  if (score <= 0) return false;
  return list.length < max || score > list[list.length - 1].score;
}

// Insert an entry and keep the board sorted and trimmed. Earlier entries win ties.
// Returns the new list and the 0-based rank of the entry (-1 if it fell off).
export function insertScore(list, entry, max = BOARD_SIZE) {
  const next = [...list, entry]
    .sort((a, b) => b.score - a.score || a.t - b.t)
    .slice(0, max);
  return { list: next, rank: next.indexOf(entry) };
}

// Arcade initials: up to three letters or digits, uppercase.
export function cleanInitials(raw) {
  const v = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  return v || '???';
}

// Accept only well-formed entries from storage.
export function sanitizeBoard(raw, max = BOARD_SIZE) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => e && typeof e.score === 'number' && Number.isFinite(e.score) && typeof e.name === 'string')
    .map((e) => ({ name: cleanInitials(e.name), score: Math.max(0, Math.round(e.score)), nights: e.nights === 2 ? 2 : 1, t: Number(e.t) || 0 }))
    .sort((a, b) => b.score - a.score || a.t - b.t)
    .slice(0, max);
}
