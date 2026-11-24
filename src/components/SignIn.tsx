import { useState } from "react";
import { api, storage, type Me } from "../api";

export default function SignIn({ onSignedIn }: { onSignedIn: (me: Me) => void }) {
  const [step, setStep] = useState<"email" | "not_registered">("email");
  const [email, setEmail] = useState(storage.get("pat:email") ?? "");
  const [formUrl, setFormUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function login(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true); setMsg(null);
    const { status, data } = await api("/auth/login", { body: { email } }).catch(() => ({ status: 0, data: null }));
    setBusy(false);
    if (data?.status === "ok") {
      storage.set("pat:email", email.trim().toLowerCase());
      return onSignedIn({ user: data.user, isAdmin: data.isAdmin, adminUnlocked: data.adminUnlocked });
    }
    if (data?.status === "not_registered") {
      setFormUrl(data.formUrl);
      if (step === "not_registered") setMsg("Still not seeing you. Give it a minute after submitting, and double-check the email matches.");
      setStep("not_registered");
    } else if (data?.status === "rate_limited") setMsg(`Too many tries. Wait ${data.retryAfterSeconds}s.`);
    else if (data?.status === "invalid_email" || status === 400) setMsg("That doesn't look like an email address.");
    else setMsg("Something went wrong. Check your connection and try again.");
  }

  return (
    <div className="signin">
      <header className="brand">
        <div className="eyebrow">OPTIMUS DAY · FRI NOV 27</div>
        <h1>POKER AT THIV'S</h1>
        <div className="suits"><span>♠</span><span className="h">♥</span><span className="d">♦</span><span className="c">♣</span></div>
      </header>

      {step === "email" ? (
        <form className="panel" onSubmit={login}>
          <h2>Take your seat</h2>
          <p className="muted">Enter the email you used on the poker night form.</p>
          <input
            type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            placeholder="you@optimussbr.com" value={email} onChange={(e) => setEmail(e.target.value)} required
          />
          <button className="btn gold" disabled={busy || !email}>{busy ? "Checking the list…" : "Let me in"}</button>
          {msg && <p className="msg">{msg}</p>}
        </form>
      ) : (
        <div className="panel">
          <h2>You're not on the list… yet</h2>
          <p className="muted">
            Fill out the poker night form with <b>{email}</b> and you'll get in within about a minute.
          </p>
          {formUrl && <a className="btn gold" href={formUrl} target="_blank" rel="noopener noreferrer">Fill out the form</a>}
          <button className="btn ghost" disabled={busy} onClick={() => login()}>
            {busy ? "Checking…" : "I've submitted. Try again"}
          </button>
          {msg && <p className="msg">{msg}</p>}
          <p className="small muted">Typo on the form? Message Thiv.</p>
          <button className="link" onClick={() => { setStep("email"); setMsg(null); }}>Use a different email</button>
        </div>
      )}

      <footer className="teaser">
        <div className="eyebrow">COMING FRIDAY</div>
        <div className="teaser-row"><span>♠</span> Live Leaderboard <i>LOCKED</i></div>
        <div className="teaser-row"><span className="h">♥</span> The Coach <i>LOCKED</i></div>
        <div className="teaser-row"><span className="d">♦</span> Practice Table <i>LOCKED</i></div>
      </footer>
    </div>
  );
}
