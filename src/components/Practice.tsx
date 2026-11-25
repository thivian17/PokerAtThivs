import { useEffect, useMemo, useState } from "react";
import { api, storage } from "../api";
import { rankOf, suitOf, SUIT_SYMBOLS, RANK_CHARS, cardName } from "../engine/cards";
import { useAnalysis } from "../useAnalysis";
import { dealSpot, scoreGuess, ruleOfFour, fairShare, HANDS_PER_ROUND, MAX_SCORE, type Spot, type GuessResult } from "../practice/spots";

interface Played { spot: Spot; guess: number; actual: number; result: GuessResult }
interface BoardRow { rank: number; name: string; best: number; plays: number; me: boolean }
interface Board { top: BoardRow[]; me: BoardRow | null; players: number }

const rankText = (r: number) => (r === 8 ? "10" : RANK_CHARS[r]);
const pct0 = (x: number) => `${Math.round(x * 100)}%`;

function Card({ c, big }: { c: number; big?: boolean }) {
  return (
    <div className={`pc-card s${suitOf(c)} ${big ? "big" : ""}`} aria-label={cardName(c)} role="img">
      <span className="r">{rankText(rankOf(c))}</span>
      <span className="s">{SUIT_SYMBOLS[suitOf(c)]}</span>
    </div>
  );
}

export default function Practice({ header }: { header: React.ReactNode }) {
  const [spot, setSpot] = useState<Spot>(() => dealSpot());
  const [guess, setGuess] = useState(50);
  const [touched, setTouched] = useState(false);
  const [phase, setPhase] = useState<"guess" | "waiting" | "reveal" | "summary">("guess");
  const [played, setPlayed] = useState<Played[]>([]);
  const [board, setBoard] = useState<Board | null>(null);
  const [best, setBest] = useState(() => Number(storage.get("pat:practice-best")) || 0);

  // The engine works out the real answer in the background while you think.
  const a = useAnalysis(spot.hole, spot.board, spot.opponents);
  const actual = a.equityDone && a.equity ? a.equity.equity : null;

  useEffect(() => { api<Board>("/practice/leaderboard").then(({ status, data }) => status === 200 && setBoard(data)); }, []);

  useEffect(() => {
    if (phase === "waiting" && actual !== null) lockIn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, actual]);

  function lockIn() {
    if (actual === null) { setPhase("waiting"); return; }
    const actualPct = Math.round(actual * 100);
    setPlayed((p) => [...p, { spot, guess, actual: actualPct, result: scoreGuess(guess, actualPct) }]);
    setPhase("reveal");
  }

  async function next() {
    if (played.length >= HANDS_PER_ROUND) return finish();
    setSpot(dealSpot()); setGuess(50); setTouched(false); setPhase("guess");
    window.scrollTo(0, 0);
  }

  async function finish() {
    setPhase("summary");
    window.scrollTo(0, 0);
    const score = played.reduce((s, p) => s + p.result.points, 0);
    if (score > best) { setBest(score); storage.set("pat:practice-best", String(score)); }
    const { status, data } = await api<Board>("/practice/score", {
      body: {
        score, hands: HANDS_PER_ROUND,
        bullseyes: played.filter((p) => p.result.grade === "Bullseye").length,
        avgError: Math.round((played.reduce((s, p) => s + p.result.error, 0) / played.length) * 10) / 10,
      },
    });
    if (status === 200) setBoard(data);
  }

  function restart() {
    setPlayed([]); setSpot(dealSpot()); setGuess(50); setTouched(false); setPhase("guess");
  }

  const handNo = phase === "reveal" ? played.length : played.length + 1;
  const total = played.reduce((s, p) => s + p.result.points, 0);
  const streak = useMemo(() => {
    let n = 0;
    for (let i = played.length - 1; i >= 0 && played[i].result.error <= 8; i--) n++;
    return n;
  }, [played]);
  const last = played[played.length - 1];

  if (phase === "summary") {
    const bulls = played.filter((p) => p.result.grade === "Bullseye").length;
    const avgErr = played.reduce((s, p) => s + p.result.error, 0) / played.length;
    const isBest = total >= best && total > 0;
    return (
      <div className="practice">
        {header}
        <section className="card-box summary">
          <div className="label">Round complete</div>
          <div className="sum-score">{total}<span>/ {MAX_SCORE}</span></div>
          {isBest && <div className="v-tag v-strong pb">New personal best</div>}
          <div className="sum-stats">
            <div><b>{bulls}</b><span>bullseyes</span></div>
            <div><b>±{avgErr.toFixed(1)}</b><span>avg miss (pts)</span></div>
            <div><b>{best}</b><span>your best</span></div>
          </div>
          <p className="small muted">{verdict(avgErr)}</p>
          <button className="btn gold" onClick={restart}>Play another round</button>
        </section>
        <Leaderboard board={board} />
        <section className="card-box">
          <div className="label">Your hands</div>
          <ol className="hand-log">
            {played.map((p, i) => (
              <li key={i}>
                <span className="hl-cards">{p.spot.hole.map((c) => <Card key={c} c={c} />)}</span>
                <span className="muted small">{p.spot.street} · vs {p.spot.opponents}</span>
                <span className="hl-nums">you {p.guess}% · real {p.actual}%</span>
                <b className="hl-pts">+{p.result.points}</b>
              </li>
            ))}
          </ol>
        </section>
      </div>
    );
  }

  return (
    <div className="practice">
      {header}

      <div className="pr-progress">
        <span>Hand <b>{handNo}</b> of {HANDS_PER_ROUND}</span>
        <span className="pr-score">{total} pts{streak >= 2 && <span className="pr-streak"> · ♦ {streak} streak</span>}</span>
      </div>
      <div className="bar pr-bar" aria-hidden><div className="w" style={{ width: `${(played.length / HANDS_PER_ROUND) * 100}%` }} /></div>

      <section className="pr-table">
        <div className="pr-street">{spot.street} · vs <b>{spot.opponents}</b> {spot.opponents === 1 ? "opponent" : "opponents"}</div>
        <div className="pr-row">
          <div className="pr-group"><div className="slot-caption">Your hand</div><div className="pr-cards">{spot.hole.map((c) => <Card key={c} c={c} big />)}</div></div>
        </div>
        {spot.board.length > 0 && (
          <div className="pr-group"><div className="slot-caption">Board</div><div className="pr-cards">{spot.board.map((c) => <Card key={c} c={c} />)}</div></div>
        )}
      </section>

      {phase !== "reveal" ? (
        <section className="card-box pr-guess">
          <label className="label" htmlFor="guess">What's your chance to win?</label>
          <div className={`pr-guess-num ${touched ? "" : "untouched"}`}>{guess}%</div>
          <input
            id="guess" type="range" min={0} max={100} step={1} value={guess}
            onChange={(e) => { setGuess(Number(e.target.value)); setTouched(true); }}
            style={{ "--fill": `${guess}%` } as React.CSSProperties}
          />
          <div className="pr-scale"><span>0%</span><span>50%</span><span>100%</span></div>
          <div className="pr-nudge">
            <button className="chip" onClick={() => { setGuess(Math.max(0, guess - 1)); setTouched(true); }} aria-label="Lower guess by 1">−1</button>
            <button className="chip" onClick={() => { setGuess(Math.min(100, guess + 1)); setTouched(true); }} aria-label="Raise guess by 1">+1</button>
          </div>
          <button className="btn gold" disabled={!touched || phase === "waiting"} onClick={lockIn}>
            {phase === "waiting" ? "Checking the odds…" : touched ? "Lock it in" : "Slide to guess"}
          </button>
        </section>
      ) : last && (
        <section className="card-box pr-reveal">
          <div className={`pr-grade g-${last.result.grade.replace(/\s/g, "").toLowerCase()}`}>{last.result.grade}{last.result.grade === "Bullseye" ? "!" : ""}</div>
          <div className="pr-compare">
            <div><span className="muted small">You said</span><b>{last.guess}%</b></div>
            <div><span className="muted small">Real odds</span><b className="gold">{last.actual}%</b></div>
            <div><span className="muted small">Points</span><b>+{last.result.points}</b></div>
          </div>
          <div className="pr-line" aria-hidden>
            <span className="pr-mark you" style={{ left: `${last.guess}%` }} />
            <span className="pr-mark real" style={{ left: `${last.actual}%` }} />
          </div>
          <ul className="pr-lesson">
            <li><b>You have:</b> {a.handLabel}</li>
            <li>An average hand wins <b>{pct0(fairShare(last.spot.opponents))}</b> against {last.spot.opponents} {last.spot.opponents === 1 ? "opponent" : "opponents"}. {last.actual / 100 >= fairShare(last.spot.opponents) * 1.2 ? "You're ahead of that." : last.actual / 100 <= fairShare(last.spot.opponents) * 0.8 ? "You're behind that." : "You're about there."}</li>
            {outsTip(a.outs, last.spot.board.length)}
            {last.spot.street === "River" && <li>On the river nothing else is coming: it's purely whether your hand beats theirs.</li>}
            {last.spot.street === "Preflop" && last.spot.opponents >= 4 && <li>Against a crowd, even good starting hands win well under half the time.</li>}
          </ul>
          <button className="btn gold" onClick={next}>{played.length >= HANDS_PER_ROUND ? "See my score" : "Next hand →"}</button>
        </section>
      )}

      {phase === "guess" && played.length === 0 && <Leaderboard board={board} compact />}
    </div>
  );
}

function outsTip(outs: ReturnType<typeof useAnalysis>["outs"], boardLen: number) {
  if (!outs || outs.totalOuts === 0) return null;
  const r = ruleOfFour(outs.totalOuts, boardLen);
  if (!r) return null;
  const real = boardLen === 3 ? outs.byRiverPct ?? 0 : outs.nextCardPct;
  return (
    <li>
      <b>{outs.totalOuts} outs</b> to improve. Rule of {r.multiplier}: {outs.totalOuts} × {r.multiplier} ≈ {r.estimate}% to improve {boardLen === 3 ? "by the river" : "on the river"} (exact: {pct0(real)}).
      Improving isn't the same as winning, though.
    </li>
  );
}

function verdict(avgErr: number) {
  if (avgErr <= 4) return "Sharp. You read spots like the engine does.";
  if (avgErr <= 8) return "Solid instincts. A few more rounds and you'll be dangerous.";
  if (avgErr <= 14) return "Decent. Watch how much more opponents drag your odds down.";
  return "Lots of room to improve. Tip: start from the average hand's share, then adjust.";
}

function Leaderboard({ board, compact }: { board: Board | null; compact?: boolean }) {
  if (!board) return null;
  const rows = compact ? board.top.slice(0, 5) : board.top;
  return (
    <section className="card-box">
      <div className="label">Practice leaderboard {board.players > 0 && <span className="muted">· {board.players} {board.players === 1 ? "player" : "players"}</span>}</div>
      {rows.length === 0 ? (
        <p className="small muted">No scores yet. Finish a round to take the top spot.</p>
      ) : (
        <ol className="lb">
          {rows.map((r) => (
            <li key={r.rank} className={r.me ? "me" : ""}>
              <span className="lb-rank">{r.rank}</span><span className="lb-name">{r.name}{r.me ? " (you)" : ""}</span><b>{r.best}</b>
            </li>
          ))}
          {board.me && !rows.some((r) => r.me) && (
            <li className="me"><span className="lb-rank">{board.me.rank}</span><span className="lb-name">{board.me.name} (you)</span><b>{board.me.best}</b></li>
          )}
        </ol>
      )}
      {compact && <p className="small muted">Best round of {HANDS_PER_ROUND} hands counts. Bragging rights only.</p>}
    </section>
  );
}
