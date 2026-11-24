// Fast bitmask hand evaluator for 2..7 cards. Higher value = better hand.
// value = category << 20 | tiebreak ranks packed as 4-bit nibbles.
import { RANK_NAMES, RANK_PLURALS } from "./cards";

export const CATEGORY = {
  HIGH_CARD: 0, PAIR: 1, TWO_PAIR: 2, TRIPS: 3, STRAIGHT: 4,
  FLUSH: 5, FULL_HOUSE: 6, QUADS: 7, STRAIGHT_FLUSH: 8,
} as const;
export const CATEGORY_NAMES = [
  "High Card", "Pair", "Two Pair", "Three of a Kind", "Straight",
  "Flush", "Full House", "Four of a Kind", "Straight Flush",
];

const POP = new Uint8Array(8192);
const STRAIGHT_HIGH = new Int8Array(8192); // -1 if none, else rank of top card (3 = wheel)
const TOP5 = new Int32Array(8192); // top up-to-5 ranks packed high nibble first

(function init() {
  for (let m = 0; m < 8192; m++) {
    let p = 0;
    for (let r = 0; r < 13; r++) if (m & (1 << r)) p++;
    POP[m] = p;
    let sh = -1;
    for (let hi = 12; hi >= 4; hi--) {
      const pat = 0x1f << (hi - 4);
      if ((m & pat) === pat) { sh = hi; break; }
    }
    if (sh < 0) {
      const wheel = 0b1000000001111; // A,5,4,3,2
      if ((m & wheel) === wheel) sh = 3;
    }
    STRAIGHT_HIGH[m] = sh;
    let v = 0, k = 0;
    for (let r = 12; r >= 0 && k < 5; r--) {
      if (m & (1 << r)) { v |= r << (4 * (4 - k)); k++; }
    }
    TOP5[m] = v;
  }
})();

const topK = (mask: number, k: number) => TOP5[mask] >> (4 * (5 - k));
const counts = new Int8Array(13);

/** Evaluate the first n cards of `cards` (2 <= n <= 7). */
export function evaluate(cards: ArrayLike<number>, n: number = cards.length): number {
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
  counts.fill(0);
  for (let i = 0; i < n; i++) {
    const c = cards[i];
    const r = c >> 2;
    const bit = 1 << r;
    switch (c & 3) {
      case 0: s0 |= bit; break;
      case 1: s1 |= bit; break;
      case 2: s2 |= bit; break;
      default: s3 |= bit;
    }
    counts[r]++;
  }
  // Flush / straight flush (cannot coexist with quads or full house in <= 7 cards)
  let fm = -1;
  if (POP[s0] >= 5) fm = s0; else if (POP[s1] >= 5) fm = s1; else if (POP[s2] >= 5) fm = s2; else if (POP[s3] >= 5) fm = s3;
  if (fm >= 0) {
    const sf = STRAIGHT_HIGH[fm];
    if (sf >= 0) return (8 << 20) | sf;
    return (5 << 20) | TOP5[fm];
  }
  const rm = s0 | s1 | s2 | s3;
  if (POP[rm] === n) {
    // all distinct ranks
    const st = STRAIGHT_HIGH[rm];
    if (st >= 0) return (4 << 20) | st;
    return TOP5[rm];
  }
  let quad = -1, t1 = -1, t2 = -1, p1 = -1, p2 = -1;
  for (let r = 12; r >= 0; r--) {
    const k = counts[r];
    if (k === 4) quad = r;
    else if (k === 3) { if (t1 < 0) t1 = r; else if (t2 < 0) t2 = r; }
    else if (k === 2) { if (p1 < 0) p1 = r; else if (p2 < 0) p2 = r; }
  }
  if (quad >= 0) return (7 << 20) | (quad << 16) | (topK(rm & ~(1 << quad), 1) << 12);
  if (t1 >= 0 && (t2 >= 0 || p1 >= 0)) return (6 << 20) | (t1 << 16) | (Math.max(t2, p1) << 12);
  const st = STRAIGHT_HIGH[rm];
  if (st >= 0) return (4 << 20) | st;
  if (t1 >= 0) return (3 << 20) | (t1 << 16) | (topK(rm & ~(1 << t1), 2) << 8);
  if (p2 >= 0) return (2 << 20) | (p1 << 16) | (p2 << 12) | (topK(rm & ~((1 << p1) | (1 << p2)), 1) << 8);
  return (1 << 20) | (p1 << 16) | (topK(rm & ~(1 << p1), 3) << 4);
}

export const categoryOf = (v: number) => v >> 20;

export function describeValue(v: number): string {
  const cat = v >> 20;
  const n = (i: number) => (v >> (16 - 4 * i)) & 15;
  switch (cat) {
    case 8: return (v & 15) === 12 ? "Royal Flush" : `Straight Flush, ${RANK_NAMES[v & 15]} high`;
    case 7: return `Four of a Kind, ${RANK_PLURALS[n(0)]}`;
    case 6: return `Full House, ${RANK_PLURALS[n(0)]} full of ${RANK_PLURALS[n(1)]}`;
    case 5: return `Flush, ${RANK_NAMES[n(0)]} high`;
    case 4: return `Straight, ${RANK_NAMES[v & 15]} high`;
    case 3: return `Three of a Kind, ${RANK_PLURALS[n(0)]}`;
    case 2: return `Two Pair, ${RANK_PLURALS[n(0)]} and ${RANK_PLURALS[n(1)]}`;
    case 1: return `Pair of ${RANK_PLURALS[n(0)]}`;
    default: return `High Card, ${RANK_NAMES[n(0)]}`;
  }
}
