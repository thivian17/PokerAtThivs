import { evaluate } from "../src/engine/evaluator";
import { makeRng } from "../src/engine/equity";

const N = 5_000_000;
const rng = makeRng(7);
const hands = new Int32Array(7 * 1024);
for (let h = 0; h < 1024; h++) {
  const used = new Set<number>();
  for (let i = 0; i < 7; i++) { let c; do c = rng(52); while (used.has(c)); used.add(c); hands[h * 7 + i] = c; }
}
const buf = new Int32Array(7);
let sink = 0;
const t = performance.now();
for (let i = 0; i < N; i++) {
  const o = (i & 1023) * 7;
  for (let k = 0; k < 7; k++) buf[k] = hands[o + k];
  sink ^= evaluate(buf, 7);
}
const s = (performance.now() - t) / 1000;
console.log(`${(N / s / 1e6).toFixed(2)}M 7-card evals/sec (sink ${sink})`);
