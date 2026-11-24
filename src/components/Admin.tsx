import { useEffect, useState } from "react";
import { api, type Me } from "../api";

interface Row { email: string; name: string | null; source: string; created_at: string; last_login_at: string | null }
interface Stats { total: number; loggedIn: number; bySource: Record<string, number> }

export default function Admin({ me, onBack, onUnlocked }: { me: Me; onBack: () => void; onUnlocked: () => void }) {
  if (!me.adminUnlocked) return <AdminUnlock me={me} onBack={onBack} onUnlocked={onUnlocked} />;
  return <AdminPanel me={me} onBack={onBack} />;
}

function AdminUnlock({ me, onBack, onUnlocked }: { me: Me; onBack: () => void; onUnlocked: () => void }) {
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { status, data } = await api("/auth/admin-unlock", { body: { password: pw } });
    if (status === 200) return onUnlocked();
    setPw("");
    setMsg(data?.status === "rate_limited" ? `Too many tries. Wait ${data.retryAfterSeconds}s.` : "Wrong password.");
  }
  return (
    <div className="admin">
      <header className="calc-top">
        <button className="chip" onClick={onBack}>← Calculator</button>
        <div className="wordmark">ADMIN</div>
        <span />
      </header>
      <form className="panel" onSubmit={submit}>
        <h2>Host check</h2>
        <p className="muted">Signed in as <b>{me.user.email}</b>. Enter the admin password to manage the guest list.</p>
        <input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus required />
        <button className="btn gold">Unlock</button>
        {msg && <p className="msg">{msg}</p>}
      </form>
    </div>
  );
}

function AdminPanel({ me, onBack }: { me: Me; onBack: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [search, setSearch] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [csvText, setCsvText] = useState<string | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = async () => {
    const { data } = await api("/admin/allowlist");
    if (data?.rows) { setRows(data.rows); setStats(data.stats); }
  };
  useEffect(() => { load(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { status, data } = await api("/admin/allowlist", { body: { email: newEmail, name: newName || undefined } });
    setNote(status === 200 ? `Added ${newEmail}` : data?.error ?? "Failed");
    if (status === 200) { setNewEmail(""); setNewName(""); load(); }
  }
  async function remove(email: string) {
    if (!confirm(`Remove ${email} from the list? They'll lose access.`)) return;
    await api(`/admin/allowlist/${encodeURIComponent(email)}`, { method: "DELETE" });
    load();
  }
  async function onFile(f: File | undefined) {
    if (!f) return;
    const text = await f.text();
    setCsvText(text);
    const { data } = await api("/admin/allowlist/csv", { body: { csv: text, dryRun: true } });
    setPreview(data);
  }
  async function importCsv() {
    if (!csvText) return;
    const { data } = await api("/admin/allowlist/csv", { body: { csv: csvText, dryRun: false } });
    setNote(data?.error ?? `Imported ${data.imported} new people (${data.alreadyPresent} already on the list).`);
    setPreview(null); setCsvText(null); load();
  }

  const shown = rows.filter((r) => `${r.email} ${r.name ?? ""}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="admin">
      <header className="calc-top">
        <button className="chip" onClick={onBack}>← Calculator</button>
        <div className="wordmark">ADMIN</div>
        <span className="small muted">{me.user.email}</span>
      </header>

      {stats && (
        <div className="stats">
          <div><b>{stats.total}</b><span>on the list</span></div>
          <div><b>{stats.loggedIn}</b><span>signed in</span></div>
          <div><b>{stats.bySource.form ?? 0}</b><span>form</span></div>
          <div><b>{(stats.bySource.csv ?? 0) + (stats.bySource.manual ?? 0)}</b><span>csv / manual</span></div>
        </div>
      )}

      {note && <div className="note" onClick={() => setNote(null)}>{note}</div>}

      <section className="card-box">
        <div className="label">Add a person</div>
        <form className="row-form" onSubmit={add}>
          <input type="email" placeholder="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
          <input placeholder="name (optional)" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button className="btn gold small-btn">Add</button>
        </form>
      </section>

      <section className="card-box">
        <div className="label">Import Microsoft Forms export (CSV)</div>
        <p className="small muted">Forms → Responses → Open results in Excel → Save As CSV. Safe to re-import because duplicates are skipped.</p>
        <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
        {preview && (
          preview.error ? <p className="msg">{preview.error}</p> : (
            <div className="csv-preview">
              <p className="small">Columns: email = <b>{preview.columns.email}</b>, name = <b>{preview.columns.name ?? "–"}</b></p>
              <p><b>{preview.new}</b> new · {preview.alreadyPresent} already on list · {preview.invalid.length} invalid · {preview.duplicatesInFile} duplicate rows</p>
              {preview.invalid.length > 0 && <p className="small muted">Invalid rows: {preview.invalid.map((i: any) => `#${i.row} "${i.value}"`).join(", ")}</p>}
              <button className="btn gold" disabled={!preview.new} onClick={importCsv}>Import {preview.new} people</button>
            </div>
          )
        )}
      </section>

      <section className="card-box">
        <div className="label">Allowlist</div>
        <input placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="table-wrap">
          <table className="allow">
            <thead><tr><th>Name</th><th>Email</th><th>Source</th><th>In?</th><th /></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.email}>
                  <td>{r.name ?? "–"}</td>
                  <td className="em">{r.email}</td>
                  <td><span className={`src ${r.source}`}>{r.source}</span></td>
                  <td>{r.last_login_at ? "✓" : ""}</td>
                  <td><button className="link danger" onClick={() => remove(r.email)} aria-label={`Remove ${r.email}`}>✕</button></td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={5} className="muted">Nobody yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
