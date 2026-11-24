// Card = integer 0..51. rank = c >> 2 (0 = '2' ... 12 = 'A'), suit = c & 3 (0 ♠, 1 ♥, 2 ♦, 3 ♣)
export const RANK_CHARS = "23456789TJQKA";
export const SUIT_CHARS = "shdc";
export const SUIT_SYMBOLS = ["♠", "♥", "♦", "♣"];
export const SUIT_NAMES = ["spades", "hearts", "diamonds", "clubs"];
export const RANK_NAMES = ["Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Jack", "Queen", "King", "Ace"];
export const RANK_PLURALS = ["Twos", "Threes", "Fours", "Fives", "Sixes", "Sevens", "Eights", "Nines", "Tens", "Jacks", "Queens", "Kings", "Aces"];

export const rankOf = (c: number) => c >> 2;
export const suitOf = (c: number) => c & 3;
export const makeCard = (rank: number, suit: number) => (rank << 2) | suit;

export function parseCard(s: string): number {
  const r = RANK_CHARS.indexOf(s[0].toUpperCase());
  const su = SUIT_CHARS.indexOf(s[1].toLowerCase());
  if (r < 0 || su < 0) throw new Error(`Bad card: ${s}`);
  return makeCard(r, su);
}
export const parseCards = (s: string) => (s.trim() ? s.trim().split(/\s+/).map(parseCard) : []);

export const cardToString = (c: number) => RANK_CHARS[rankOf(c)] + SUIT_CHARS[suitOf(c)];
export const cardLabel = (c: number) => (rankOf(c) === 8 ? "10" : RANK_CHARS[rankOf(c)]) + SUIT_SYMBOLS[suitOf(c)];
export const cardName = (c: number) => `${RANK_NAMES[rankOf(c)]} of ${SUIT_NAMES[suitOf(c)]}`;

export const fullDeck = () => Array.from({ length: 52 }, (_, i) => i);

export function remainingDeck(used: number[]): number[] {
  const u = new Uint8Array(52);
  for (const c of used) u[c] = 1;
  const out: number[] = [];
  for (let c = 0; c < 52; c++) if (!u[c]) out.push(c);
  return out;
}

export function preflopLabel(a: number, b: number): string {
  const ra = rankOf(a), rb = rankOf(b);
  if (ra === rb) return `Pocket ${RANK_PLURALS[ra]}`;
  const hi = Math.max(ra, rb), lo = Math.min(ra, rb);
  return `${RANK_NAMES[hi]}-${RANK_NAMES[lo]} ${suitOf(a) === suitOf(b) ? "suited" : "offsuit"}`;
}
