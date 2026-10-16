// Scoring and the arcade-style leaderboard. Pure functions, no DOM, so they can be tested in Node.

export const BOARD_SIZE = 10;

// stats: counters collected during the night
// hours: whole hours survived (0..8)
// dawn: true if the player made it to morning
// fireAtEnd: fire level (0..4) when the night ended
export function computeScore({ stats, hours, dawn, fireAtEnd }) {
  const s = { woodBurned: 0, built: 0, trades: 0, helped: 0, kind: 0, brave: 0, wise: 0, ...stats };
  const lines = [
    ['hours survived', hours, hours * 100],
    ['wood burned', s.woodBurned, s.woodBurned * 2],
    ['things built', s.built, s.built * 40],
    ['trades made', s.trades, s.trades * 15],
    ['people helped', s.kind + s.helped, s.kind * 100 + s.helped * 60],
    ['nerve', s.brave + s.wise, (s.brave + s.wise) * 30],
  ];
  if (dawn) {
    lines.push(['made it to dawn', '', 500]);
    lines.push(['fire still burning', fireAtEnd, fireAtEnd * 50]);
  }
  const shown = lines.filter(([label, , pts]) => pts > 0 || label === 'hours survived');
  const total = shown.reduce((sum, [, , pts]) => sum + pts, 0);
  return { lines: shown, total };
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
    .map((e) => ({ name: cleanInitials(e.name), score: Math.max(0, Math.round(e.score)), dawn: !!e.dawn, t: Number(e.t) || 0 }))
    .sort((a, b) => b.score - a.score || a.t - b.t)
    .slice(0, max);
}
