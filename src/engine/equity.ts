import { remainingDeck, rankOf, suitOf, RANK_NAMES, SUIT_SYMBOLS, RANK_CHARS } from "./cards";
import { evaluate, categoryOf, CATEGORY_NAMES } from "./evaluator";

// ---------- PRNG ----------
export function makeRng(seed = (Math.random() * 2 ** 32) >>> 0) {
  let x = seed >>> 0 || 0x9e3779b9;
  return (n: number) => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    return x % n;
  };
}

export interface EquityResult {
  win: number; tie: number; lose: number; // fractions of runouts
  equity: number; // win + tie share
  samples: number;
  exact: boolean;
}

function finish(win: number, tie: number, tieShare: number, total: number, exact: boolean): EquityResult {
  return {
    win: win / total,
    tie: tie / total,
    lose: (total - win - tie) / total,
    equity: (win + tieShare) / total,
    samples: total,
    exact,
  };
}

/** Exact heads-up equity vs one random hand. Board must have >= 3 cards (or any, if you can wait). */
export function exactHeadsUp(hole: number[], board: number[]): EquityResult {
  const deck = remainingDeck([...hole, ...board]);
  const k = 5 - board.length;
  const me = new Int32Array(7);
  const op = new Int32Array(7);
  me[0] = hole[0]; me[1] = hole[1];
  for (let i = 0; i < board.length; i++) { me[2 + i] = board[i]; op[2 + i] = board[i]; }
  const L = deck.length;
  const used = new Uint8Array(52);
  let win = 0, tie = 0, total = 0;

  const runBoard = () => {
    const mv = evaluate(me, 7);
    for (let i = 0; i < L; i++) {
      const a = deck[i];
      if (used[a]) continue;
      op[0] = a;
      for (let j = i + 1; j < L; j++) {
        const b = deck[j];
        if (used[b]) continue;
        op[1] = b;
        const ov = evaluate(op, 7);
        if (mv > ov) win++; else if (mv === ov) tie++;
        total++;
      }
    }
  };

  const fill = (start: number, depth: number) => {
    if (depth === k) { runBoard(); return; }
    for (let i = start; i < L; i++) {
      const c = deck[i];
      used[c] = 1;
      me[2 + board.length + depth] = c; op[2 + board.length + depth] = c;
      fill(i + 1, depth + 1);
      used[c] = 0;
    }
  };
  fill(0, 0);
  return finish(win, tie, tie / 2, total, true);
}

/** Exact equity vs specific opponent hands, enumerating all board completions. */
export function equityVsHands(hole: number[], opps: number[][], board: number[] = []): EquityResult {
  const deck = remainingDeck([hole, ...opps, board].flat());
  const k = 5 - board.length;
  const hands = [hole, ...opps].map((h) => {
    const a = new Int32Array(7); a[0] = h[0]; a[1] = h[1];
    for (let i = 0; i < board.length; i++) a[2 + i] = board[i];
    return a;
  });
  let win = 0, tie = 0, tieShare = 0, total = 0;
  const fill = (start: number, depth: number) => {
    if (depth === k) {
      const mv = evaluate(hands[0], 7);
      let best = -1, nb = 0;
      for (let h = 1; h < hands.length; h++) {
        const v = evaluate(hands[h], 7);
        if (v > best) { best = v; nb = 1; } else if (v === best) nb++;
      }
      if (mv > best) win++; else if (mv === best) { tie++; tieShare += 1 / (nb + 1); }
      total++;
      return;
    }
    for (let i = start; i < deck.length; i++) {
      for (const h of hands) h[2 + board.length + depth] = deck[i];
      fill(i + 1, depth + 1);
    }
  };
  fill(0, 0);
  return finish(win, tie, tieShare, total, true);
}

export interface MonteCarloState { win: number; tie: number; tieShare: number; total: number }

/** Run `samples` Monte Carlo trials vs `opponents` random hands, accumulating into state. */
export function monteCarloBatch(
  hole: number[], board: number[], opponents: number, samples: number,
  rng: (n: number) => number, state: MonteCarloState,
): MonteCarloState {
  const deck = remainingDeck([...hole, ...board]);
  const L = deck.length;
  const k = 5 - board.length;
  const need = k + 2 * opponents;
  const me = new Int32Array(7);
  const op = new Int32Array(7);
  me[0] = hole[0]; me[1] = hole[1];
  for (let i = 0; i < board.length; i++) { me[2 + i] = board[i]; op[2 + i] = board[i]; }
  const b0 = 2 + board.length;
  let { win, tie, tieShare, total } = state;
  for (let s = 0; s < samples; s++) {
    for (let i = 0; i < need; i++) {
      const j = i + rng(L - i);
      const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    for (let i = 0; i < k; i++) { me[b0 + i] = deck[i]; op[b0 + i] = deck[i]; }
    const mv = evaluate(me, 7);
    let best = -1, nb = 0;
    for (let o = 0; o < opponents; o++) {
      op[0] = deck[k + 2 * o]; op[1] = deck[k + 2 * o + 1];
      const v = evaluate(op, 7);
      if (v > best) { best = v; nb = 1; } else if (v === best) nb++;
    }
    if (mv > best) win++; else if (mv === best) { tie++; tieShare += 1 / (nb + 1); }
    total++;
  }
  return { win, tie, tieShare, total };
}

export const mcResult = (s: MonteCarloState): EquityResult => finish(s.win, s.tie, s.tieShare, s.total, false);

/** Synchronous equity: exact when heads-up post-flop, otherwise Monte Carlo with a sample budget. */
export function computeEquity(opts: {
  hole: number[]; board: number[]; opponents: number; samples?: number; seed?: number;
}): EquityResult {
  const { hole, board, opponents } = opts;
  if (opponents === 1 && board.length >= 3) return exactHeadsUp(hole, board);
  const rng = makeRng(opts.seed);
  const st = monteCarloBatch(hole, board, opponents, opts.samples ?? 40000, rng, { win: 0, tie: 0, tieShare: 0, total: 0 });
  return mcResult(st);
}

// ---------- Final-hand distribution ----------
export function handDistribution(hole: number[], board: number[], seed?: number): number[] {
  const dist = new Array(9).fill(0);
  const cards = new Int32Array(7);
  cards[0] = hole[0]; cards[1] = hole[1];
  board.forEach((c, i) => (cards[2 + i] = c));
  const deck = remainingDeck([...hole, ...board]);
  const k = 5 - board.length;
  if (k === 0) { dist[categoryOf(evaluate(cards, 7))] = 1; return dist; }
  if (board.length >= 3) {
    let total = 0;
    const fill = (start: number, depth: number) => {
      if (depth === k) { dist[categoryOf(evaluate(cards, 7))]++; total++; return; }
      for (let i = start; i < deck.length; i++) { cards[2 + board.length + depth] = deck[i]; fill(i + 1, depth + 1); }
    };
    fill(0, 0);
    return dist.map((d) => d / total);
  }
  const rng = makeRng(seed);
  const N = 30000, L = deck.length;
  for (let s = 0; s < N; s++) {
    for (let i = 0; i < k; i++) {
      const j = i + rng(L - i);
      const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
      cards[2 + board.length + i] = deck[i];
    }
    dist[categoryOf(evaluate(cards, 7))]++;
  }
  return dist.map((d) => d / N);
}

// ---------- Outs ----------
export interface OutsGroup {
  category: number; label: string; cards: number[]; count: number;
  nextCardPct: number; byRiverPct: number | null;
}
export interface OutsResult { groups: OutsGroup[]; totalOuts: number; unseen: number; byRiverPct: number | null; nextCardPct: number }

const choose2 = (n: number) => (n * (n - 1)) / 2;

function groupLabel(category: number, cards: number[]): string {
  const name = CATEGORY_NAMES[category];
  const suits = new Set(cards.map(suitOf));
  if ((category === 5 || category === 8) && suits.size === 1) return `${name} (any ${SUIT_SYMBOLS[[...suits][0]]})`;
  const ranks = [...new Set(cards.map(rankOf))].sort((a, b) => b - a);
  if (ranks.length <= 3) {
    const names = ranks.map((r) => RANK_CHARS[r] === "T" ? "10" : (r >= 9 ? RANK_NAMES[r] : RANK_CHARS[r]));
    return `${name} (${names.length === 1 ? names[0] : names.slice(0, -1).join(", ") + " or " + names[names.length - 1]})`;
  }
  return name;
}

export function computeOuts(hole: number[], board: number[]): OutsResult | null {
  if (board.length !== 3 && board.length !== 4) return null;
  const known = [...hole, ...board];
  const unseen = remainingDeck(known);
  const cur = new Int32Array(7);
  known.forEach((c, i) => (cur[i] = c));
  const n = known.length;
  const curCat = categoryOf(evaluate(cur, n));
  const bd = new Int32Array(6);
  board.forEach((c, i) => (bd[i] = c));
  const byCat = new Map<number, number[]>();
  for (const c of unseen) {
    cur[n] = c;
    const cat = categoryOf(evaluate(cur, n + 1));
    if (cat <= curCat) continue;
    bd[board.length] = c;
    const boardCat = categoryOf(evaluate(bd, board.length + 1));
    if (cat <= boardCat) continue; // improvement lives on the board, everyone gets it
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(c);
  }
  const U = unseen.length;
  const pctNext = (o: number) => o / U;
  const pctRiver = (o: number) => (board.length === 3 ? 1 - choose2(U - o) / choose2(U) : null);
  const groups: OutsGroup[] = [...byCat.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([category, cards]) => ({
      category, cards, count: cards.length,
      label: groupLabel(category, cards),
      nextCardPct: pctNext(cards.length),
      byRiverPct: pctRiver(cards.length),
    }));
  const totalOuts = groups.reduce((s, g) => s + g.count, 0);
  return { groups, totalOuts, unseen: U, nextCardPct: pctNext(totalOuts), byRiverPct: pctRiver(totalOuts) };
}

// ---------- What-if: equity for every possible next card ----------
export interface NextCardImpact { card: number; newCategory: number; equity: number }

export function nextCardImpact(hole: number[], board: number[], opponents: number, card: number, seed?: number): NextCardImpact {
  const nb = [...board, card];
  const cards = new Int32Array(7);
  [...hole, ...nb].forEach((c, i) => (cards[i] = c));
  const newCategory = categoryOf(evaluate(cards, 2 + nb.length));
  const eq = opponents === 1
    ? exactHeadsUp(hole, nb).equity
    : computeEquity({ hole, board: nb, opponents, samples: 1500, seed }).equity;
  return { card, newCategory, equity: eq };
}
