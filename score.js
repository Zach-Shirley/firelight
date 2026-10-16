// Scoring and the arcade-style leaderboard. Pure functions, no DOM, so they can be tested in Node.

export const BOARD_SIZE = 10;

// Only a night survived to dawn scores. What you score is what you held on to.
// end: { wood, meat, blood, fire (0..4), companion (true if the stranger is with you) }
export function computeScore({ wood = 0, meat = 0, blood = 0, fire = 0, companion = false }) {
  const lines = [
    ['wood left', wood, wood * 1],
    ['meat left', meat, meat * 3],
    ['blood left', blood, blood * 5],
    ['fire at dawn', fire, fire * 10],
  ];
  if (companion) lines.push(['not alone', '', 25]);
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
    .map((e) => ({ name: cleanInitials(e.name), score: Math.max(0, Math.round(e.score)), t: Number(e.t) || 0 }))
    .sort((a, b) => b.score - a.score || a.t - b.t)
    .slice(0, max);
}
