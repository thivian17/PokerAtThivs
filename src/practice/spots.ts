// "Guess the odds" practice drill: random spots and scoring. Pure functions, no DOM.
export type Street = "Preflop" | "Flop" | "Turn" | "River";
export interface Spot { hole: number[]; board: number[]; opponents: number; street: Street }

export const HANDS_PER_ROUND = 10;
export const MAX_SCORE = HANDS_PER_ROUND * 100;

// Weighted toward the streets where the math is most useful at the table.
const STREETS: [Street, number, number][] = [["Preflop", 0, 30], ["Flop", 3, 35], ["Turn", 4, 25], ["River", 5, 10]];
// Mostly the table sizes people will actually see on Friday (8 seats).
const OPPONENT_POOL = [1, 1, 2, 2, 3, 3, 4, 5, 6, 7];

export function dealSpot(rand: () => number = Math.random): Spot {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  let roll = rand() * 100;
  let pick = STREETS[0];
  for (const s of STREETS) { if (roll < s[2]) { pick = s; break; } roll -= s[2]; }
  const [street, boardLen] = pick;
  return {
    hole: deck.slice(0, 2),
    board: deck.slice(2, 2 + boardLen),
    opponents: OPPONENT_POOL[Math.floor(rand() * OPPONENT_POOL.length)],
    street,
  };
}

export type Grade = "Bullseye" | "Close" | "Not bad" | "Way off";
export interface GuessResult { points: number; error: number; grade: Grade }

/** Guess and actual are whole percentages (0–100). 3 points lost per point of error; within 3 is a bullseye. */
export function scoreGuess(guessPct: number, actualPct: number): GuessResult {
  const error = Math.abs(Math.round(guessPct) - Math.round(actualPct));
  const points = Math.max(0, 100 - 3 * error);
  const grade: Grade = error <= 3 ? "Bullseye" : error <= 8 ? "Close" : error <= 15 ? "Not bad" : "Way off";
  return { points, error, grade };
}

/** The table shortcut: outs × 4 on the flop (two cards to come), × 2 on the turn. Capped at 100. */
export function ruleOfFour(outs: number, boardLen: number): { multiplier: number; estimate: number } | null {
  if (boardLen !== 3 && boardLen !== 4) return null;
  const multiplier = boardLen === 3 ? 4 : 2;
  return { multiplier, estimate: Math.min(100, outs * multiplier) };
}

export const fairShare = (opponents: number) => 1 / (opponents + 1);
