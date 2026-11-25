import { useMemo, useState } from "react";
import type { Me } from "../api";
import { storage } from "../api";
import { makeCard, cardLabel, cardName, rankOf, suitOf, SUIT_SYMBOLS, RANK_CHARS } from "../engine/cards";
import { CATEGORY_NAMES } from "../engine/evaluator";
import { useAnalysis } from "../useAnalysis";

const SLOT_LABELS = ["", "", "Flop", "", "", "Turn", "River"];
const RANK_ORDER = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]; // A..2
const SUIT_ORDER = [0, 1, 2, 3];
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const rankText = (r: number) => (r === 8 ? "10" : RANK_CHARS[r]);

function slotEnabled(slots: (number | null)[], i: number) {
  if (i < 2) return true;
  const holeFull = slots[0] !== null && slots[1] !== null;
  if (i <= 4) return holeFull;
  const flopFull = slots[2] !== null && slots[3] !== null && slots[4] !== null;
  if (i === 5) return holeFull && flopFull;
  return holeFull && flopFull && slots[5] !== null;
}
function nextEmpty(slots: (number | null)[], from: number) {
  for (let k = 0; k < 7; k++) {
    const i = (from + k) % 7;
    if (slots[i] === null && slotEnabled(slots, i)) return i;
  }
  return -1;
}
function stepPrompt(slots: (number | null)[], active: number) {
  const filled = (i: number) => slots[i] !== null;
  if (active >= 0 && filled(active)) return "Tap a card to replace it, or tap the slot again to clear it";
  if (!filled(0) || !filled(1)) return `Pick your ${filled(0) || filled(1) ? "second" : "first"} hole card`;
  const flopLeft = [2, 3, 4].filter((i) => !filled(i)).length;
  if (flopLeft) return flopLeft === 3 ? "Add the flop when it comes (3 cards)" : `Flop: ${flopLeft} more card${flopLeft === 1 ? "" : "s"}`;
  if (!filled(5)) return "Add the turn when it comes";
  if (!filled(6)) return "Add the river when it comes";
  return "All cards are out. Tap New hand for the next one";
}

function Verdict({ equity, players }: { equity: number; players: number }) {
  const fair = 1 / players;
  const ratio = Math.round((equity / fair) * 10) / 10; // same rounded value drives the tag and the text
  const [label, cls] = ratio >= 2 || equity >= 0.65 ? ["Strong", "v-strong"] : ratio >= 1.2 ? ["Above average", "v-good"] : ratio >= 0.8 ? ["About average", "v-mid"] : ["Below average", "v-weak"];
  return (
    <div className="verdict">
      <span className={`v-tag ${cls}`}>{label}</span>
      <span className="muted">An average hand wins {pct(fair, 0)} with {players} players. You're at {ratio.toFixed(1)}×.</span>
    </div>
  );
}

const vibrate = () => { try { navigator.vibrate?.(8); } catch { /* ignore */ } };

// Pastel tint mixed from the cream card face so rank/suit stay readable.
const CREAM = [251, 248, 240], GREEN = [96, 214, 136], RED = [236, 128, 116];
function heatColor(delta: number, exact: boolean) {
  const threshold = exact ? 0.01 : 0.035; // Monte Carlo what-if has ~±2.5pt noise
  if (Math.abs(delta) < threshold) return undefined;
  const t = Math.min(1, (Math.abs(delta) - threshold) / 0.25) * 0.75 + 0.25;
  const target = delta > 0 ? GREEN : RED;
  const mix = CREAM.map((c, i) => Math.round(c + (target[i] - c) * t));
  return `rgb(${mix.join(",")})`;
}

export default function Calculator({ me, tabs, onAdmin, onLogout, onComingSoon, banner }: { me: Me; tabs?: React.ReactNode; onAdmin?: () => void; onLogout: () => void; onComingSoon: () => void; banner?: React.ReactNode }) {
  const [slots, setSlots] = useState<(number | null)[]>(Array(7).fill(null));
  const [active, setActive] = useState(0);
  const [opponents, setOpponents] = useState(() => {
    const v = Number(storage.get("pat:opponents"));
    return v >= 1 && v <= 7 ? v : 7;
  });
  const [whatIfMode, setWhatIfMode] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);

  const hole = slots[0] !== null && slots[1] !== null ? [slots[0], slots[1]] : [];
  const board = useMemo(() => {
    const flop = slots.slice(2, 5);
    if (flop.some((c) => c === null)) return [] as number[];
    const b = flop as number[];
    if (slots[5] !== null) { b.push(slots[5]); if (slots[6] !== null) b.push(slots[6]); }
    return b;
  }, [slots]);
  const partialFlop = slots.slice(2, 5).some((c) => c !== null) && board.length === 0;

  const a = useAnalysis(hole, board, opponents);
  const used = new Set(slots.filter((c): c is number => c !== null));
  const canWhatIf = hole.length === 2 && (board.length === 3 || board.length === 4);
  const outCards = new Set(a.outs?.groups.flatMap((g) => g.cards) ?? []);

  function setOpp(n: number) {
    const v = Math.max(1, Math.min(7, n));
    setOpponents(v); storage.set("pat:opponents", String(v));
  }

  function tapCard(c: number) {
    if (used.has(c)) return;
    if (whatIfMode && canWhatIf) { setPreview(c); return; }
    if (active < 0 || !slotEnabled(slots, active)) return;
    const next = [...slots];
    next[active] = c;
    setSlots(next);
    setActive(nextEmpty(next, active + 1));
    if (whatIfMode) setWhatIfMode(false);
    setPreview(null);
    vibrate();
  }

  function tapSlot(i: number) {
    if (!slotEnabled(slots, i)) return;
    setPreview(null);
    if (slots[i] !== null && active === i) {
      // Second tap on a selected card clears it
      const next = [...slots];
      next[i] = null;
      setSlots(next);
      return;
    }
    setActive(i); // a filled slot is now selected: the next card you tap replaces it
  }

  function reset() { setSlots(Array(7).fill(null)); setActive(0); setPreview(null); setWhatIfMode(false); }

  const eq = a.equity;
  const previewImpact = preview !== null ? a.whatIf.get(preview) : undefined;

  return (
    <div className="calc">
      <header className="calc-top">
        <div className="wordmark">POKER AT THIV'S</div>
        <div className="top-actions">
          {onAdmin && <button className="chip" onClick={onAdmin}>Admin</button>}
          <button className="chip" onClick={onLogout} title={me.user.email}>Sign out</button>
        </div>
      </header>
      {tabs}
      {banner}

      <div className="controls">
        <div className="stepper" aria-label="Number of opponents">
          <button onClick={() => setOpp(opponents - 1)} disabled={opponents <= 1} aria-label="Fewer opponents">−</button>
          <span>vs <b>{opponents}</b> {opponents === 1 ? "opponent" : "opponents"}</span>
          <button onClick={() => setOpp(opponents + 1)} disabled={opponents >= 7} aria-label="More opponents">+</button>
        </div>
        <button className="chip" onClick={reset}>New hand</button>
      </div>

      <div className="slots">
        <div className="slot-group">
          <div className="slot-caption">Your hand</div>
          <div className="slot-row">{[0, 1].map(renderSlot)}</div>
        </div>
        <div className="slot-group">
          <div className="slot-caption">Board</div>
          <div className="slot-row">{[2, 3, 4, 5, 6].map(renderSlot)}</div>
        </div>
      </div>

      {!(whatIfMode && canWhatIf) && <div className="step-prompt">{stepPrompt(slots, active)}</div>}

      <div className={`picker ${whatIfMode && canWhatIf ? "whatif-on" : ""}`}>
        {SUIT_ORDER.map((s) => (
          <div className="picker-row" key={s}>
            {RANK_ORDER.map((r) => {
              const c = makeCard(r, s);
              const isUsed = used.has(c);
              const impact = canWhatIf && eq ? a.whatIf.get(c) : undefined;
              const bg = impact && eq ? heatColor(impact.equity - eq.equity, opponents === 1) : undefined;
              return (
                <button
                  key={c}
                  className={`pcard s${s} ${isUsed ? "used" : ""} ${preview === c ? "previewing" : ""}`}
                  style={bg ? { background: bg } : undefined}
                  disabled={isUsed}
                  onClick={() => tapCard(c)}
                  aria-label={cardName(c)}
                >
                  <span className="r">{rankText(r)}</span>
                  <span className="s">{SUIT_SYMBOLS[s]}</span>
                  {outCards.has(c) && !isUsed && <span className="out-dot" />}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {canWhatIf && (
        <div className="whatif-bar">
          <button className={`chip ${whatIfMode ? "on" : ""}`} onClick={() => { setWhatIfMode(!whatIfMode); setPreview(null); }}>
            {whatIfMode ? "✓ What-if mode: tap any card" : "What if…?"}
          </button>
          <span className="legend"><i className="lg g" /> helps <i className="lg r" /> hurts <i className="lg dot" /> out</span>
        </div>
      )}

      {preview !== null && (
        <div className="preview" onClick={() => setPreview(null)}>
          <b>If {cardLabel(preview)} comes:</b>{" "}
          {previewImpact && eq ? (
            <>
              {CATEGORY_NAMES[previewImpact.newCategory]} · equity {pct(previewImpact.equity, 0)}{" "}
              <span className={previewImpact.equity >= eq.equity ? "up" : "down"}>
                ({previewImpact.equity >= eq.equity ? "+" : ""}{Math.round((previewImpact.equity - eq.equity) * 100)})
              </span>
            </>
          ) : "calculating…"}
          <span className="x">×</span>
        </div>
      )}

      {hole.length < 2 ? (
        <div className="hint">
          Tap your two hole cards to start.
          <button className="coming-card" onClick={onComingSoon}>
            <span className="cs-suits"><span>♠</span><span className="h">♥</span><span className="d">♦</span></span>
            <span><b>Coming soon:</b> Live Leaderboard &amp; The Coach</span>
            <span className="cs-arrow">→</span>
          </button>
        </div>
      ) : (
        <section className="results">
          <div className="equity-head">
            <div className="equity-num">
              {eq ? pct(eq.equity) : "…"}
              {!a.equityDone && <span className="pulse-dot" />}
            </div>
            <div className="equity-sub">
              chance to win
              <div className="caption">
                vs {opponents} random {opponents === 1 ? "hand" : "hands"} · {eq ? (eq.exact ? "exact" : `${eq.samples.toLocaleString()} sims`) : ""}
              </div>
            </div>
          </div>
          {eq && <Verdict equity={eq.equity} players={opponents + 1} />}
          {eq && (
            <div className="bar" aria-hidden>
              <div className="w" style={{ width: pct(eq.win) }} />
              <div className="t" style={{ width: pct(eq.tie) }} />
              <div className="l" style={{ width: pct(eq.lose) }} />
            </div>
          )}
          {eq && (
            <div className="bar-legend">
              <span><i className="lg w" />Win {pct(eq.win)}</span>
              <span><i className="lg t" />Tie {pct(eq.tie)}</span>
              <span><i className="lg l" />Lose {pct(eq.lose)}</span>
            </div>
          )}

          <div className="card-box">
            <div className="label">You have</div>
            <div className="big">{a.handLabel ?? "…"}</div>
            {partialFlop && <div className="small muted">Add all three flop cards to include the board.</div>}
          </div>

          {a.outs && (
            <div className="card-box">
              <div className="label">Your outs {a.outs.totalOuts > 0 && <span className="muted">· {a.outs.totalOuts} cards</span>}</div>
              {a.outs.groups.length === 0 ? (
                <div className="small muted">No improving outs. You're drawing to what you have.</div>
              ) : (
                <table className="outs">
                  <thead>
                    <tr><th>Makes</th><th>Outs</th><th>Next card</th>{board.length === 3 && <th>By river</th>}</tr>
                  </thead>
                  <tbody>
                    {a.outs.groups.map((g) => (
                      <tr key={g.category}>
                        <td>{g.label}</td>
                        <td>{g.count}</td>
                        <td>{pct(g.nextCardPct, 0)}</td>
                        {board.length === 3 && <td>{pct(g.byRiverPct ?? 0, 0)}</td>}
                      </tr>
                    ))}
                    {a.outs.groups.length > 1 && (
                      <tr className="total">
                        <td>Any improvement</td><td>{a.outs.totalOuts}</td><td>{pct(a.outs.nextCardPct, 0)}</td>
                        {board.length === 3 && <td>{pct(a.outs.byRiverPct ?? 0, 0)}</td>}
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {a.distribution && board.length < 5 && (
            <div className="card-box">
              <div className="label">By the river you'll have…</div>
              <div className="dist">
                {a.distribution.map((p, cat) => ({ p, cat })).filter((x) => x.p >= 0.005).reverse().map(({ p, cat }) => (
                  <div className="dist-row" key={cat}>
                    <span className="dn">{CATEGORY_NAMES[cat]}</span>
                    <span className="db"><span style={{ width: pct(p) }} /></span>
                    <span className="dp">{pct(p, p < 0.1 ? 1 : 0)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="footnote">
            Odds assume opponents hold random cards. After big bets, real odds are usually worse.
            {a.firstResultMs !== null && <span className="ms"> · first result in {a.firstResultMs} ms</span>}
          </p>
          <button className="coming-card" onClick={onComingSoon}>
            <span className="cs-suits"><span>♠</span><span className="h">♥</span><span className="d">♦</span></span>
            <span><b>Coming soon:</b> Live Leaderboard &amp; The Coach</span>
            <span className="cs-arrow">→</span>
          </button>
        </section>
      )}
    </div>
  );

  function renderSlot(i: number) {
    const c = slots[i];
    const enabled = slotEnabled(slots, i);
    return (
      <button
        key={i}
        className={`slot ${c !== null ? `filled s${suitOf(c)}` : ""} ${active === i ? "active" : ""} ${enabled ? "" : "disabled"} ${i === 5 || i === 6 ? "street-gap" : ""}`}
        onClick={() => tapSlot(i)}
        aria-label={c !== null ? `${cardName(c)}, tap to change` : `Empty ${SLOT_LABELS[i] || (i < 2 ? "hole card" : "flop card")} slot`}
      >
        {c !== null ? (
          <>
            <span className="r">{rankText(rankOf(c))}</span>
            <span className="s">{SUIT_SYMBOLS[suitOf(c)]}</span>
          </>
        ) : (
          <span className="slot-hint">{SLOT_LABELS[i]}</span>
        )}
      </button>
    );
  }
}
