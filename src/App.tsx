import { useEffect, useState } from "react";
import { api, type Me } from "./api";
import SignIn from "./components/SignIn";
import Calculator from "./components/Calculator";
import Admin from "./components/Admin";
import InstallHint from "./components/InstallHint";
import ProductShowcase from "./components/ProductShowcase";

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
  return (
    <Calculator me={me} onAdmin={me.isAdmin ? () => go("/admin") : undefined} onLogout={logout} onComingSoon={() => { go("/coming-soon"); scrollTo(0, 0); }} banner={<InstallHint />} />
  );
}
