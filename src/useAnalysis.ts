import { useEffect, useRef, useState } from "react";
import type { AnalyzeMessage } from "./engine/worker";
import type { EquityResult, OutsResult, NextCardImpact } from "./engine/equity";

export interface Analysis {
  handLabel: string | null;
  category: number | null;
  equity: EquityResult | null;
  equityDone: boolean;
  outs: OutsResult | null;
  distribution: number[] | null;
  whatIf: Map<number, NextCardImpact>;
  whatIfDone: boolean;
  firstResultMs: number | null;
}

const empty = (): Analysis => ({
  handLabel: null, category: null, equity: null, equityDone: false, outs: null,
  distribution: null, whatIf: new Map(), whatIfDone: false, firstResultMs: null,
});

const newWorker = () => new Worker(new URL("./engine/worker.ts", import.meta.url), { type: "module" });

export function useAnalysis(hole: number[], board: number[], opponents: number): Analysis {
  const [a, setA] = useState<Analysis>(empty);
  const worker = useRef<Worker | null>(null);
  const spare = useRef<Worker | null>(null); // pre-warmed so a cancel doesn't pay worker start-up
  const busy = useRef(false);
  const reqId = useRef(0);
  const key = `${hole.join(",")}|${board.join(",")}|${opponents}`;

  useEffect(() => {
    spare.current = newWorker();
    return () => { worker.current?.terminate(); spare.current?.terminate(); };
  }, []);

  useEffect(() => {
    if (hole.length !== 2) { setA(empty()); return; }
    // A new input cancels any in-flight computation: kill the busy worker and start fresh.
    if (busy.current && worker.current) { worker.current.terminate(); worker.current = null; }
    if (!worker.current) {
      worker.current = spare.current ?? newWorker();
      spare.current = newWorker();
    }
    const id = ++reqId.current;
    const t0 = performance.now();
    busy.current = true;
    setA(empty());
    worker.current.onmessage = (e: MessageEvent<AnalyzeMessage>) => {
      const m = e.data;
      if (m.id !== reqId.current) return;
      if (m.type === "done") { busy.current = false; return; }
      setA((prev) => {
        const next = { ...prev };
        switch (m.type) {
          case "hand": next.handLabel = m.label; next.category = m.category; break;
          case "equity":
            next.equity = m.result; next.equityDone = m.done;
            if (prev.firstResultMs === null) next.firstResultMs = Math.round(performance.now() - t0);
            break;
          case "outs": next.outs = m.result; break;
          case "distribution": next.distribution = m.result; break;
          case "whatif": {
            const w = new Map(prev.whatIf);
            m.items.forEach((it) => w.set(it.card, it));
            next.whatIf = w; next.whatIfDone = m.done; break;
          }
        }
        return next;
      });
    };
    worker.current.postMessage({ id, hole, board, opponents });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return a;
}
