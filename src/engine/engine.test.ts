import { describe, it, expect } from "vitest";
import { parseCards, preflopLabel } from "./cards";
import { evaluate, categoryOf, describeValue } from "./evaluator";
import { computeEquity, equityVsHands, exactHeadsUp, computeOuts, handDistribution, nextCardImpact } from "./equity";

const ev = (s: string) => evaluate(parseCards(s));
const cat = (s: string) => categoryOf(ev(s));

describe("evaluator", () => {
  it("detects every category", () => {
    expect(cat("As Kd 9h 7c 3s 2d 4h")).toBe(0);
    expect(cat("As Ad 9h 7c 3s 2d Jh")).toBe(1);
    expect(cat("As Ad 9h 9c 3s 2d Jh")).toBe(2);
    expect(cat("As Ad Ah 9c 3s 2d Jh")).toBe(3);
    expect(cat("9s Td Jh Qc Ks 2d 2h")).toBe(4);
    expect(cat("2h 7h 9h Jh Kh As Ad")).toBe(5);
    expect(cat("As Ad Ah 9c 9s 2d Jh")).toBe(6);
    expect(cat("As Ad Ah Ac 9s 2d Jh")).toBe(7);
    expect(cat("5h 6h 7h 8h 9h As Ad")).toBe(8);
  });
  it("wheel is lowest straight, royal is a straight flush", () => {
    expect(ev("As 2d 3h 4c 5s Kd Kh")).toBeLessThan(ev("2s 3d 4h 5c 6s Kd Kh"));
    expect(describeValue(ev("As 2d 3h 4c 5s Kd Qh"))).toBe("Straight, Five high");
    expect(describeValue(ev("Ts Js Qs Ks As 2d 3h"))).toBe("Royal Flush");
    expect(cat("Ts Js Qs Ks As 2d 3h")).toBe(8);
  });
  it("flush beats straight; kickers decide", () => {
    expect(ev("2h 7h 9h Jh Kh 3c 4d")).toBeGreaterThan(ev("9s Td Jh Qc Ks 2d 2h"));
    expect(ev("As Kd 7h 4c 2s 9d 8c")).toBeGreaterThan(ev("As Qd 7h 4c 2s 9d 8c"));
    expect(ev("As Ad Kh 9c 3s 2d 4h")).toBeGreaterThan(ev("As Ad Qh 9c 3s 2d 4h"));
    expect(ev("Ks Kd 7h 7c Qs 2d 2h")).toBeGreaterThan(ev("Ks Kd 7h 7c Js 2d 2h"));
  });
  it("picks best five of seven; double trips is a full house", () => {
    expect(describeValue(ev("Ks Kd Kh 7c 7s 7d 2h"))).toBe("Full House, Kings full of Sevens");
    expect(describeValue(ev("Ks Kd 7h 7c 3s 3d 2h"))).toBe("Two Pair, Kings and Sevens");
    expect(describeValue(ev("Ks Kd Kh Kc 7s 7d 7h"))).toBe("Four of a Kind, Kings");
  });
  it("exhaustive 5-card category counts", () => {
    const counts = new Array(9).fill(0);
    const h = new Int32Array(5);
    for (let a = 0; a < 52; a++) { h[0] = a;
      for (let b = a + 1; b < 52; b++) { h[1] = b;
        for (let c = b + 1; c < 52; c++) { h[2] = c;
          for (let d = c + 1; d < 52; d++) { h[3] = d;
            for (let e = d + 1; e < 52; e++) { h[4] = e; counts[categoryOf(evaluate(h, 5))]++; } } } } }
    expect(counts).toEqual([1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40]);
  });
});

describe("equity", () => {
  it("AA vs KK preflop (exact)", () => {
    const r = equityVsHands(parseCards("As Ah"), [parseCards("Kd Kc")]);
    // Published exact: AsAh vs KdKc = 81.06% / 18.55% / 0.39% tie
    expect(Math.abs(r.win * 100 - 81.06)).toBeLessThan(0.1);
    expect(Math.abs(r.lose * 100 - 18.55)).toBeLessThan(0.1);
    expect(r.tie * 100).toBeLessThan(0.5);
  });
  it("AA vs one random hand ≈ 85.2%", () => {
    const r = computeEquity({ hole: parseCards("As Ah"), board: [], opponents: 1, samples: 200000, seed: 42 });
    expect(Math.abs(r.equity * 100 - 85.2)).toBeLessThan(0.6);
  });
  it("royal on board → 100% tie", () => {
    const r = exactHeadsUp(parseCards("2c 3d"), parseCards("Ts Js Qs Ks As"));
    expect(r.tie).toBe(1);
    expect(r.equity).toBeCloseTo(0.5, 6);
  });
  it("heads-up flop exact is fast", () => {
    const t = performance.now();
    const r = computeEquity({ hole: parseCards("Ah Kh"), board: parseCards("7h 2h 9c"), opponents: 1 });
    const ms = performance.now() - t;
    expect(r.exact).toBe(true);
    expect(r.samples).toBe(1081 * 990);
    expect(ms).toBeLessThan(800);
  });
  it("multiway equity decreases with more opponents", () => {
    const one = computeEquity({ hole: parseCards("As Ah"), board: [], opponents: 1, seed: 1 }).equity;
    const seven = computeEquity({ hole: parseCards("As Ah"), board: [], opponents: 7, seed: 1 }).equity;
    expect(seven).toBeLessThan(one);
    expect(seven).toBeGreaterThan(0.3); // AA vs 7 ≈ 35%
    expect(seven).toBeLessThan(0.4);
  });
});

describe("outs", () => {
  it("flop flush draw: 9 outs, 19.1% / 35.0%", () => {
    const o = computeOuts(parseCards("Ah Kh"), parseCards("7h 2h 9c"))!;
    const fl = o.groups.find((g) => g.category === 5)!;
    expect(fl.count).toBe(9);
    expect(fl.label).toBe("Flush (any ♥)");
    expect(fl.nextCardPct * 100).toBeCloseTo(19.1, 1);
    expect(fl.byRiverPct! * 100).toBeCloseTo(35.0, 1);
  });
  it("open-ended straight draw: 8 outs, 17.0% / 31.5%", () => {
    const o = computeOuts(parseCards("8s 7d"), parseCards("6c 5h Kd"))!;
    const st = o.groups.find((g) => g.category === 4)!;
    expect(st.count).toBe(8);
    expect(st.nextCardPct * 100).toBeCloseTo(17.0, 1);
    expect(st.byRiverPct! * 100).toBeCloseTo(31.5, 1);
  });
  it("board pairing is not an out", () => {
    // AK high on Q-7-2: a 2 pairs the board only
    const o = computeOuts(parseCards("Ah Kd"), parseCards("Qc 7s 2h"))!;
    const all = o.groups.flatMap((g) => g.cards);
    expect(all.every((c) => (c >> 2) !== 0)).toBe(true); // no deuces
    expect(o.groups.find((g) => g.category === 1)!.count).toBe(6); // 3 aces + 3 kings
  });
  it("turn uses next-card only", () => {
    const o = computeOuts(parseCards("Ah Kh"), parseCards("7h 2h 9c 3d"))!;
    expect(o.unseen).toBe(46);
    expect(o.groups[0].byRiverPct).toBeNull();
  });
});

describe("distribution & what-if", () => {
  it("distribution sums to 1 and river is certain", () => {
    const d = handDistribution(parseCards("Ah Kh"), parseCards("7h 2h 9c"));
    expect(d.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(d[5] + d[8]).toBeCloseTo(0.35, 1);
    const r = handDistribution(parseCards("Ah Kh"), parseCards("7h 2h 9c 3d 4s"));
    expect(r[0]).toBe(1);
  });
  it("a heart on the turn raises equity", () => {
    const hole = parseCards("Ah Kh"), board = parseCards("7h 2h 9c");
    const base = computeEquity({ hole, board, opponents: 1 }).equity;
    const heart = nextCardImpact(hole, board, 1, parseCards("Qh")[0]);
    expect(heart.newCategory).toBe(5);
    expect(heart.equity).toBeGreaterThan(base);
  });
  it("preflop labels", () => {
    expect(preflopLabel(...(parseCards("Ks Kd") as [number, number]))).toBe("Pocket Kings");
    expect(preflopLabel(...(parseCards("Ah Ks") as [number, number]))).toBe("Ace-King offsuit");
  });
});
