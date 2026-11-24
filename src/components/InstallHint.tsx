import { useState } from "react";
import { storage } from "../api";

export default function InstallHint() {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const standalone = (navigator as any).standalone || matchMedia("(display-mode: standalone)").matches;
  const [show, setShow] = useState(isIOS && !standalone && !storage.get("pat:install-hint"));
  if (!show) return null;
  return (
    <div className="install-hint">
      <span>For the full-screen app: tap <b>Share</b> → <b>Add to Home Screen</b>.</span>
      <button className="link" onClick={() => { storage.set("pat:install-hint", "1"); setShow(false); }}>Got it</button>
    </div>
  );
}
