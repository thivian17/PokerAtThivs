import { describe, it, expect } from "vitest";
import { dealSpot, scoreGuess, ruleOfFour, HANDS_PER_ROUND, MAX_SCORE } from "./spots";
import { makeRng } from "../engine/equity";

describe("practice spots", () => {
  it("deals valid, distinct cards with a board that matches the street", () => {
    const r = makeRng(42);
    const rand = () => r(1_000_000) / 1_000_000;
    const streets = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const s = dealSpot(rand);
      const all = [...s.hole, ...s.board];
      expect(new Set(all).size).toBe(all.length);
      all.forEach((c) => expect(c >= 0 && c < 52).toBe(true));
      expect(s.hole).toHaveLength(2);
      expect({ Preflop: 0, Flop: 3, Turn: 4, River: 5 }[s.street]).toBe(s.board.length);
      expect(s.opponents >= 1 && s.opponents <= 7).toBe(true);
      streets.add(s.street);
    }
    expect(streets.size).toBe(4);
  });

  it("scores guesses: 3 points per point of error, bullseye within 3", () => {
    expect(scoreGuess(47, 47)).toEqual({ points: 100, error: 0, grade: "Bullseye" });
    expect(scoreGuess(50, 47)).toEqual({ points: 91, error: 3, grade: "Bullseye" });
    expect(scoreGuess(40, 47).grade).toBe("Close");
    expect(scoreGuess(30, 47)).toEqual({ points: 49, error: 17, grade: "Way off" });
    expect(scoreGuess(100, 5).points).toBe(0);
    expect(MAX_SCORE).toBe(HANDS_PER_ROUND * 100);
  });

  it("applies the rule of 4 and 2", () => {
    expect(ruleOfFour(9, 3)).toEqual({ multiplier: 4, estimate: 36 });
    expect(ruleOfFour(9, 4)).toEqual({ multiplier: 2, estimate: 18 });
    expect(ruleOfFour(30, 3)!.estimate).toBe(100);
    expect(ruleOfFour(9, 0)).toBeNull();
  });
});
