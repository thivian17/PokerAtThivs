// Product-page style showcase of live + upcoming features, with CSS phone mockups.
// All names and numbers in the mockups are illustrative sample data.

function Phone({ children, tilt = 0 }: { children: React.ReactNode; tilt?: number }) {
  return (
    <div className="pp-phone" style={{ transform: `rotate(${tilt}deg)` }} aria-hidden>
      <div className="pp-notch" />
      <div className="pp-screen">{children}</div>
    </div>
  );
}

const Mini = ({ r, s, red }: { r: string; s: string; red?: boolean }) => (
  <span className={`pp-card ${red ? "red" : ""}`}>{r}<i>{s}</i></span>
);

function OddsScreen() {
  return (
    <>
      <div className="pp-top">POKER AT THIV'S</div>
      <div className="pp-row-cards">
        <Mini r="A" s="♥" red /><Mini r="K" s="♥" red /><span className="pp-gap" />
        <Mini r="7" s="♥" red /><Mini r="2" s="♥" red /><Mini r="9" s="♣" />
      </div>
      <div className="pp-big">70.7%</div>
      <div className="pp-sub">chance to win · exact</div>
      <div className="pp-bar"><span style={{ width: "70%" }} /><b style={{ width: "1%" }} /></div>
      <div className="pp-box">
        <div className="pp-label">YOUR OUTS</div>
        <div className="pp-line"><span>Flush (any ♥)</span><span>9 · 35%</span></div>
        <div className="pp-line"><span>Pair (A or K)</span><span>6 · 24%</span></div>
        <div className="pp-line gold"><span>Any improvement</span><span>15 · 54%</span></div>
      </div>
      <div className="pp-box">
        <div className="pp-label">WHAT IF THE TURN IS… ♥</div>
        <div className="pp-heat">
          {"AKQJT98765432".split("").map((r, i) => (
            <span key={r} className={i < 2 || r === "7" || r === "2" ? "u" : "g"}>{r === "T" ? "10" : r}</span>
          ))}
        </div>
        <div className="pp-sub left">Every heart turns your draw into a flush</div>
      </div>
    </>
  );
}

function LeaderboardScreen() {
  const rows = [
    { n: "Closer", c: "2,840", d: "+640", up: true },
    { n: "Big Slick", c: "2,310", d: "+310", up: true },
    { n: "You", c: "1,975", d: "−25", up: false, me: true },
    { n: "River Rat", c: "1,620", d: "−380", up: false },
    { n: "Rockets", c: "1,255", d: "−745", up: false },
  ];
  return (
    <>
      <div className="pp-top">LEADERBOARD <span className="pp-live"><i />LIVE</span></div>
      <div className="pp-sub left">Hand 47 · 8 players · 2h 14m</div>
      <div className="pp-lb">
        {rows.map((r, i) => (
          <div key={r.n} className={`pp-lb-row ${r.me ? "me" : ""}`}>
            <span className={`pp-rank r${i + 1}`}>{i + 1}</span>
            <span className="pp-name">{r.n}</span>
            <span className="pp-chips">{r.c}</span>
            <span className={r.up ? "up" : "down"}>{r.up ? "▲" : "▼"}{r.d.replace(/^[+−]/, "")}</span>
          </div>
        ))}
      </div>
      <div className="pp-box">
        <div className="pp-label">YOUR NIGHT</div>
        <svg viewBox="0 0 120 30" className="pp-spark">
          <polyline points="0,18 12,16 24,20 36,12 48,14 60,8 72,10 84,16 96,13 108,19 120,17" />
        </svg>
        <div className="pp-line"><span>Biggest pot won</span><span>1,180</span></div>
      </div>
    </>
  );
}

function CoachScreen() {
  return (
    <>
      <div className="pp-top">THE COACH</div>
      <div className="pp-row-cards">
        <Mini r="A" s="♥" red /><Mini r="K" s="♥" red /><span className="pp-gap" />
        <Mini r="7" s="♥" red /><Mini r="2" s="♥" red /><Mini r="9" s="♣" />
      </div>
      <div className="pp-sub">Pot 300 · 100 to call · 2 players</div>
      <div className="pp-advice">
        <div className="pp-label">COACH SAYS</div>
        <div className="pp-verdict">RAISE <small>to 350</small></div>
        <div className="pp-why">✓ 47% equity beats 25% pot odds</div>
        <div className="pp-why">✓ 15 outs, 54% by the river</div>
        <div className="pp-why">✓ Big draws play best fast</div>
      </div>
      <div className="pp-actions"><span>Fold</span><span>Call</span><span className="on">Raise</span></div>
    </>
  );
}

function PracticeScreen() {
  return (
    <>
      <div className="pp-top">PRACTICE <span className="pp-streak">♦ 6 streak</span></div>
      <div className="pp-sub left">Hand 12 of 20 · Accuracy 83%</div>
      <div className="pp-bar thin"><span style={{ width: "60%" }} /></div>
      <div className="pp-q">You're on the button with</div>
      <div className="pp-row-cards center"><Mini r="Q" s="♠" /><Mini r="J" s="♠" /></div>
      <div className="pp-q">Two players limp in. Your move?</div>
      <div className="pp-choices">
        <span>Fold</span><span>Call</span><span className="right">Raise ✓</span>
      </div>
      <div className="pp-feedback">Nice. Suited broadway plays great in position, so raise to take the lead.</div>
      <div className="pp-next">Next hand →</div>
    </>
  );
}

const FEATURES = [
  {
    key: "odds", suit: "♣", suitClass: "c", status: "LIVE NOW", title: "Odds Calculator",
    pitch: "Know exactly where you stand, in a tap.",
    bullets: ["Win % vs up to 7 opponents, updated instantly", "Every out, grouped by the hand it makes", "What-if heatmap for every possible next card"],
    screen: <OddsScreen />, tilt: -3,
  },
  {
    key: "lb", suit: "♠", suitClass: "", status: "COMING SOON", title: "Live Leaderboard",
    pitch: "Who's up, who's down, all night long.",
    bullets: ["Live chip counts after every buy-in and cash-out", "Your night charted hand by hand", "Bragging rights: biggest pot, best comeback"],
    screen: <LeaderboardScreen />, tilt: 3,
  },
  {
    key: "coach", suit: "♥", suitClass: "h", status: "COMING SOON", title: "The Coach",
    pitch: "Fold, call or raise, with the math to back it up.",
    bullets: ["Pot odds vs your equity, done for you", "Plain-English reasons, not just a verdict", "Preflop guidance by seat and hand"],
    screen: <CoachScreen />, tilt: -3,
  },
  {
    key: "practice", suit: "♦", suitClass: "d", status: "COMING SOON", title: "Practice Table",
    pitch: "Warm up before you sit down.",
    bullets: ["Real spots, instant feedback", "Streaks and accuracy to beat", "Quick-fire equity guessing drills"],
    screen: <PracticeScreen />, tilt: 3,
  },
];

export default function ProductShowcase({ cta }: { cta?: React.ReactNode }) {
  return (
    <section className="pp">
      <div className="pp-hero">
        <div className="eyebrow">THE APP</div>
        <h2>Play sharper.<br />Brag louder.</h2>
        <p className="muted">One app for the whole night: the odds now, with more on the way.</p>
      </div>
      {FEATURES.map((f) => (
        <article key={f.key} className={`pp-feature ${f.status === "LIVE NOW" ? "live" : ""}`}>
          <Phone tilt={f.tilt}>{f.screen}</Phone>
          <div className="pp-copy">
            <div className="pp-status">
              <span className={`pp-suit ${f.suitClass}`}>{f.suit}</span>
              <span className={`pp-tag ${f.status === "LIVE NOW" ? "live" : ""}`}>{f.status}</span>
            </div>
            <h3>{f.title}</h3>
            <p className="pp-pitch">{f.pitch}</p>
            <ul>{f.bullets.map((b) => <li key={b}>{b}</li>)}</ul>
          </div>
        </article>
      ))}
      {cta && <div className="pp-cta">{cta}</div>}
      <p className="pp-fine">Screens show sample data. More features unlock soon.</p>
    </section>
  );
}
