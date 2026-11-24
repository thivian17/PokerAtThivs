/// <reference lib="webworker" />
import { preflopLabel, remainingDeck } from "./cards";
import { evaluate, describeValue, categoryOf } from "./evaluator";
import {
  exactHeadsUp, monteCarloBatch, mcResult, makeRng, handDistribution, computeOuts, nextCardImpact,
  type EquityResult, type OutsResult, type NextCardImpact,
} from "./equity";

export type AnalyzeRequest = { id: number; hole: number[]; board: number[]; opponents: number };
export type AnalyzeMessage =
  | { id: number; type: "hand"; label: string; category: number }
  | { id: number; type: "equity"; result: EquityResult; done: boolean }
  | { id: number; type: "outs"; result: OutsResult | null }
  | { id: number; type: "distribution"; result: number[] }
  | { id: number; type: "whatif"; items: NextCardImpact[]; done: boolean }
  | { id: number; type: "done" };

const post = (m: AnalyzeMessage) => (self as unknown as Worker).postMessage(m);

self.onmessage = (e: MessageEvent<AnalyzeRequest>) => {
  const { id, hole, board, opponents } = e.data;
  if (hole.length !== 2) return;

  // 1. Current hand
  if (board.length === 0) {
    post({ id, type: "hand", label: preflopLabel(hole[0], hole[1]), category: hole[0] >> 2 === hole[1] >> 2 ? 1 : 0 });
  } else {
    const v = evaluate([...hole, ...board]);
    post({ id, type: "hand", label: describeValue(v), category: categoryOf(v) });
  }

  // 2. Outs (instant)
  post({ id, type: "outs", result: computeOuts(hole, board) });

  // 3. Equity
  if (opponents === 1 && board.length >= 3) {
    // Instant estimate first, then the exact enumeration
    if (board.length === 3) {
      const quick = monteCarloBatch(hole, board, 1, 3000, makeRng(), { win: 0, tie: 0, tieShare: 0, total: 0 });
      post({ id, type: "equity", result: mcResult(quick), done: false });
    }
    post({ id, type: "equity", result: exactHeadsUp(hole, board), done: true });
  } else {
    const rng = makeRng();
    let st = { win: 0, tie: 0, tieShare: 0, total: 0 };
    const t0 = performance.now();
    while (st.total < 40000) {
      st = monteCarloBatch(hole, board, opponents, 2000, rng, st);
      const done = st.total >= 40000 || performance.now() - t0 > 600;
      post({ id, type: "equity", result: mcResult(st), done });
      if (done) break;
    }
  }

  // 4. Final-hand distribution
  post({ id, type: "distribution", result: handDistribution(hole, board) });

  // 5. What-if grid (flop / turn only)
  if (board.length === 3 || board.length === 4) {
    const unseen = remainingDeck([...hole, ...board]);
    let batch: NextCardImpact[] = [];
    unseen.forEach((c, i) => {
      batch.push(nextCardImpact(hole, board, opponents, c));
      if (batch.length === 6 || i === unseen.length - 1) {
        post({ id, type: "whatif", items: batch, done: i === unseen.length - 1 });
        batch = [];
      }
    });
  }
  post({ id, type: "done" });
};
