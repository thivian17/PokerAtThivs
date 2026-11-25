import { useEffect, useState } from "react";
import { api, type Me } from "./api";
import SignIn from "./components/SignIn";
import Calculator from "./components/Calculator";
import Admin from "./components/Admin";
import InstallHint from "./components/InstallHint";
import ProductShowcase from "./components/ProductShowcase";
import Practice from "./components/Practice";

export default function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [path, setPath] = useState(location.pathname);

  useEffect(() => {
    api<Me>("/auth/me").then(({ status, data }) => setMe(status === 200 ? data : null)).catch(() => setMe(null));
    const onPop = () => setPath(location.pathname);
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  const go = (p: string) => { history.pushState(null, "", p); setPath(p); };
  const logout = async () => { await api("/auth/logout", { method: "POST" }); setMe(null); go("/"); };

  if (me === undefined) return <div className="splash"><div className="suits pulse">♠ ♥ ♦ ♣</div></div>;
  if (!me) return <SignIn onSignedIn={setMe} />;
  if (path.startsWith("/coming-soon")) {
    return (
      <div>
        <header className="calc-top">
          <button className="chip" onClick={() => go("/")}>← Calculator</button>
          <div className="wordmark">WHAT'S COMING</div>
          <span />
        </header>
        <ProductShowcase cta={<button className="btn gold" onClick={() => go("/")}>Back to the calculator</button>} />
      </div>
    );
  }
  if (path.startsWith("/admin") && me.isAdmin) return <Admin me={me} onUnlocked={() => setMe({ ...me, adminUnlocked: true })} onBack={() => go("/")} />;

  const tab = path.startsWith("/practice") ? "practice" : "odds";
  const tabs = (
    <nav className="tabs" aria-label="Sections">
      <button className={tab === "odds" ? "on" : ""} aria-current={tab === "odds" ? "page" : undefined} onClick={() => go("/")}>Odds</button>
      <button className={tab === "practice" ? "on" : ""} aria-current={tab === "practice" ? "page" : undefined} onClick={() => go("/practice")}>Practice</button>
    </nav>
  );
  if (tab === "practice") {
    return (
      <Practice header={
        <>
          <header className="calc-top">
            <div className="wordmark">POKER AT THIV'S</div>
            <div className="top-actions">
              {me.isAdmin && <button className="chip" onClick={() => go("/admin")}>Admin</button>}
              <button className="chip" onClick={logout} title={me.user.email}>Sign out</button>
            </div>
          </header>
          {tabs}
        </>
      } />
    );
  }
  return (
    <Calculator me={me} tabs={tabs} onAdmin={me.isAdmin ? () => go("/admin") : undefined} onLogout={logout} onComingSoon={() => { go("/coming-soon"); scrollTo(0, 0); }} banner={<InstallHint />} />
  );
}
