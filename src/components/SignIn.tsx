import { useEffect, useRef, useState } from "react";
import { api, storage, type Me } from "../api";

type Step = "email" | "code" | "not_registered";

export default function SignIn({ onSignedIn }: { onSignedIn: (me: Me) => void }) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(storage.get("pat:email") ?? "");
  const [code, setCode] = useState("");
  const [formUrl, setFormUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true); setMsg(null);
    const { status, data } = await api("/auth/request-code", { body: { email } }).catch(() => ({ status: 0, data: null }));
    setBusy(false);
    if (data?.status === "sent") {
      storage.set("pat:email", email.trim().toLowerCase());
      setStep("code"); setCode(""); setCooldown(60);
      setTimeout(() => codeRef.current?.focus(), 50);
    } else if (data?.status === "not_registered") {
      setFormUrl(data.formUrl); setStep("not_registered");
    } else if (data?.status === "rate_limited") {
      if (step === "email") setStep("code");
      setCooldown(data.retryAfterSeconds ?? 60);
      setMsg(`Hang on, you can request another code in ${data.retryAfterSeconds}s.`);
    } else if (data?.status === "invalid_email" || status === 400) {
      setMsg("That doesn't look like an email address.");
    } else if (data?.status === "email_failed") {
      setMsg("We couldn't send the email. Try again in a minute or message Thiv.");
    } else {
      setMsg("Something went wrong. Check your connection and try again.");
    }
  }

  async function verify(value: string) {
    setBusy(true); setMsg(null);
    const { data } = await api("/auth/verify", { body: { email, code: value } }).catch(() => ({ status: 0, data: null }));
    setBusy(false);
    if (data?.status === "ok") return onSignedIn({ user: data.user, isAdmin: data.isAdmin });
    setCode("");
    if (data?.status === "wrong_code") setMsg(`Not quite. ${data.attemptsLeft} ${data.attemptsLeft === 1 ? "try" : "tries"} left.`);
    else if (data?.status === "locked") setMsg("Too many tries. Request a new code.");
    else if (data?.status === "expired") setMsg("That code has expired. Request a new one.");
    else setMsg("Something went wrong. Try again.");
  }

  return (
    <div className="signin">
      <header className="brand">
        <div className="eyebrow">OPTIMUS DAY · FRI NOV 27</div>
        <h1>POKER AT THIV'S</h1>
        <div className="suits"><span>♠</span><span className="h">♥</span><span className="d">♦</span><span className="c">♣</span></div>
      </header>

      {step === "email" && (
        <form className="panel" onSubmit={requestCode}>
          <h2>Take your seat</h2>
          <p className="muted">Use the email you put on the poker night form.</p>
          <input
            type="email" inputMode="email" autoComplete="email" placeholder="you@optimussbr.com"
            value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus
          />
          <button className="btn gold" disabled={busy || !email}>{busy ? "Sending…" : "Send my code"}</button>
          {msg && <p className="msg">{msg}</p>}
        </form>
      )}

      {step === "code" && (
        <div className="panel">
          <h2>Check your inbox</h2>
          <p className="muted">We sent a 6-digit code to <b>{email}</b>.</p>
          <input
            ref={codeRef} className="code-input" inputMode="numeric" autoComplete="one-time-code" pattern="\d*"
            maxLength={6} placeholder="••••••" value={code} disabled={busy}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(v);
              if (v.length === 6) verify(v);
            }}
          />
          {msg && <p className="msg">{msg}</p>}
          <button className="btn ghost" disabled={cooldown > 0 || busy} onClick={() => requestCode()}>
            {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
          </button>
          <p className="small muted">Can't find it? Check your <b>Junk</b> folder, since it comes from Thiv's Gmail.</p>
          <button className="link" onClick={() => { setStep("email"); setMsg(null); }}>Use a different email</button>
        </div>
      )}

      {step === "not_registered" && (
        <div className="panel">
          <h2>You're not on the list… yet</h2>
          <p className="muted">
            Fill out the poker night form with <b>{email}</b> and you'll get in within about a minute.
          </p>
          {formUrl && <a className="btn gold" href={formUrl} target="_blank" rel="noopener noreferrer">Fill out the form</a>}
          <button className="btn ghost" disabled={busy} onClick={() => requestCode()}>
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
